# Photo editor (crop, zoom, adjust, brush circle): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.
> Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the Edit photos dialog into the full photo editor:
- Clean up / Crop / Adjust tabs;
- view zoom and pan;
- a brush-size circle;
- the post-Done crop window retired for new photos.

**Spec:** `docs/superpowers/specs/2026-11-10-photo-review-design.md`, the
section "Addendum (2026-11-10): the full photo editor".

## Global constraints
- **Same as the photo-review plan:**
  - no new dependencies (react-easy-crop is already installed);
  - don't commit;
  - StrictMode-safe effects;
  - `node:assert` tests for pure modules;
  - browser checks only with a throwaway account (delete it, and re-sign
    in if its token is over an hour old);
  - never save a real candidate.
- The saved data shape is unchanged: one PNG (or the untouched original)
  plus `photo_crop` percentages.

## Review focus
1. **A brush stroke on a rotated and flipped preview** must land on the
   same spot of the saved photo (Task 1, the `toSourcePoint` tests).
2. **Keep original with no adjustments** saves the original File object
   itself (Task 2 test).
3. **Changing rotate or flip clears the crop.** A brightness change keeps
   it (Task 2 test).
4. **A crop set in the editor survives Done** and is the one saved (Task 2
   test, Task 3 browser check).
5. **Zoom and pan don't break brushing.** The circle and the stroke match
   at 300% (Task 3 browser check).

---

### Task 1: Pixel maths: colour, geometry, point mapping (`photoCleanup.js`)

**Produces:**
- `adjustColor(image, brightness, contrast)` returns a copy.
  - RGB only; alpha is untouched.
  - Brightness adds `brightness * 2.55`.
  - Contrast uses the factor `f = 259 * (C + 255) / (255 * (259 - C))`
    with `C = contrast * 2.55`, applied as `f * (v - 128) + 128`.
  - With both at 0 it returns an equal copy.
- `rotateFlip(image, rotate, flipX)` returns a new image. 90 and 270 swap
  the width and height.
  - Rotation is clockwise.
  - The flip is applied after rotation, mirroring left–right on the
    displayed image.
- `toSourcePoint([fx, fy], rotate, flipX)` maps a fraction on the
  displayed image back to a fraction on the source image. It's the exact
  inverse of `rotateFlip`'s pixel mapping.
- `applyEdits(cutout, original, edits, trimPx)` is extended:
  - The base is `edits.keepOriginal ? original : cutout`, cleaned with
    specks, strokes and trim (cleanup is skipped with `keepOriginal`).
  - Then `adjustColor`, then `rotateFlip`.
  - Missing new fields count as 0 / false.

**Tests** (written first; watch them fail):
- **`adjustColor`:** with (0, 0) it's equal. Brightness +50 raises
  (100, 100, 100) to 228. Contrast +50 pushes 200 up and 50 down. Alpha is
  unchanged.
- **`rotateFlip`:** a 3×2 image with distinct pixels.
  - 90 gives 2×3, with the top-left output equal to the bottom-left input.
  - 180 reverses it.
  - `flipX` mirrors it.
  - 90 four times gives the identity.
- **`toSourcePoint`:** round-trips every source pixel centre for rotate in
  {0, 90, 180, 270} × flip in {false, true}.
- **`applyEdits`:**
  - `keepOriginal` with rotate 90 returns the original rotated, at the
    swapped size.
  - An old edits object with no new fields still works.

### Task 2: Review rules: crop and untouched originals (`photoReview.js`)

**Produces:**
- `EMPTY_EDITS` gains `rotate: 0, flipX: false, brightness: 0, contrast: 0`.
- `isUntouchedOriginal(edits)`: true when `keepOriginal` is set and there
  are no adjustments.
- `changeEdits(entry, edits)` also sets `photo_crop: null` when `rotate`
  or `flipX` change.
- `changeCrop(entry, crop)`: sets `photo_crop` and flips `reviewed` to
  `ready`.
- `applyReviewResult(entry, { original, edits, crop, file })`: the guard
  also checks `entry.photo_crop === crop`. It keeps `photo_crop`.
- `markReviewed(entry, file)` keeps `photo_crop`, since crops are made in
  the editor, before Done.

**Tests** (written first):
- the new fields;
- `isUntouchedOriginal`;
- rotate or flip clears the crop, brightness doesn't;
- `changeCrop` on a reviewed entry gives `ready`;
- `applyReviewResult` keeps the crop, and refuses a stale crop;
- the existing tests are updated where `markReviewed` used to clear the
  crop.

### Task 3: The editor UI (`PhotoReviewDialog.jsx`, CSS, `AdminHistory.jsx`)

- **Tabs:** Clean up, Crop and Adjust (`role="tablist"`). The tools change
  with the tab.
- **Clean up:**
  - **View state** `{ scale, x, y }`, shared by both panes as a CSS
    `transform` on an inner wrapper.
    - Wheel zooms around the pointer.
    - The −, + and Fit buttons; the readout shows a percentage.
    - Space-drag, or a right-button or middle-button drag, pans. The
      context menu is suppressed on the panes.
  - **The brush circle:** a ring that follows the pointer over the Result.
    - Its diameter is `brush.size * rect.width / canvas.width`.
    - It's hidden off the canvas.
    - The native cursor is hidden over the canvas.
  - **Live strokes:** recompute `applyEdits` with the in-progress stroke,
    at most once per animation frame. Pointer points are mapped through
    `toSourcePoint`.
- **Crop:**
  - A react-easy-crop `Cropper` (aspect 1) on the finished preview, as a
    Blob URL made and revoked in an effect.
  - The Zoom slider runs from 1 to 3.
  - `onCropComplete` calls `onCropChange(key, areaPercentages)`, which the
    page wires to `changeCrop`.
  - **Reset crop** sets it to null.
- **Adjust:** rotate left or right, flip, Brightness and Contrast
  (−50…50), and **Reset adjustments**, all through `onEditsChange`.
- **Done:**
  - `isUntouchedOriginal` saves the original File.
  - Otherwise it rebuilds at full size with the new pipeline.
  - Results carry `crop: entry.photo_crop`.
  - The note becomes "Clean edges trims the pale outline."
- **The page:**
  - `reviewProps` adds `onCropChange`.
  - The dialog takes an optional `startKey` and `startTab`.
  - **Add form:** clicking a new photo's preview opens the editor on that
    photo (on Crop once it's edited).
  - **Edit form:** the same for a newly attached photo. Saved photos keep
    `PhotoCropModal`.
  - Remove the now-unused add-crop state and the "Edit the photo first,
    then crop" tooltips.
- **Browser check:**
  - Zoom to 300%: the circle diameter equals the brush size × 3.
  - Brush once.
  - Rotate right: the preview becomes landscape and the crop clears.
  - Set the crop.
  - Set brightness to +20.
  - Done: the chip shows Edited, and the card preview shows the crop.
  - Click the preview: the editor opens on Crop.
  - Light theme once.
  - Zero console errors.

### Task 4: Final
- All `src/lib/*.test.js` pass, and `npm run build` succeeds.
- CLAUDE.md is updated.
- A final review on the most capable model, followed by one fix pass
  (each fix proved with a test that fails first).
