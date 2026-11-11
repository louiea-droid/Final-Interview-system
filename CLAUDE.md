@AGENTS.md

## Where we left off (session of 2026-09-25)

Nothing below is committed yet. Everything sits uncommitted on
`fix/visual-preview`, mixed in with the user's own earlier uncommitted work.
**Don't commit without asking;** the user commits.

### Batch 1 of the Visual Board editor: finished and reviewed

- Design: `docs/superpowers/specs/2026-09-24-visual-board-batch1-design.md`
- Plan: `docs/superpowers/plans/2026-09-24-visual-board-batch1.md`
- Step-by-step log, with every decision made:
  `.superpowers/sdd/2026-09-24-visual-board-batch1/progress.md` (git-ignored)

**Done (Tasks 1–9):**
- align and distribute;
- multi-select delete, duplicate, lock, hide and nudge;
- smart guides with gap labels (Snap is on by default; Ctrl drags freely);
- 8 resize handles (Shift keeps proportions, Alt resizes from the centre);
- a rotate handle for shapes, text, logo, photos and video (a `rotation`
  field, also drawn on the live board);
- double-click text to edit it on the canvas;
- shortcuts (Ctrl+A/X/C/V/D/G, Ctrl+[ ], zoom, Ctrl+scroll, Space-drag pan,
  Enter, Esc);
- the fuller right-click menu.

**Finished on 2026-09-25:**
- **The right-click menu overflow is fixed.** The clamp only re-ran on
  `[x, y]`, so it went stale when the menu's rows changed while it was open,
  or when the window was resized.
- **Task 10 is done.**
- **The final review ran** on the most capable model (0 Critical, 4
  Important). All four are fixed and checked in the browser:
  - triangle handles were unclickable, because the clip-path now sits on an
    inner `.vb-shape-fill`;
  - multi-select layer order did nothing (new `moveLayers`);
  - text edits were lost on Firefox/Safari, because `select()` now blurs the
    editor first;
  - text corner-resize drifted (`boxWidth` now scales, and `addText` sets
    `boxWidth: 92`).
- **StrictMode trap:** `main.jsx` uses StrictMode, so effect cleanups run
  twice in dev. Never save or close from an unmount cleanup.

**Deferred minors: all fixed on 2026-11-10 (uncommitted), checked in the browser.**
- Enter skips locked text.
- Space and Enter go to a focused toolbar or panel button
  (`isControlTarget`); canvas elements still count as the canvas.
- `spaceHeld` is released on window blur.
- The menu scrolls (`max-height`), and a scroll inside it doesn't close it.
- The dead code was deleted.
- Moves keep their shape at the edge: `clampGroupDelta` in boardGeometry.js
  clamps one shared delta. A nudge clamps the whole selection, a drag clamps
  all the members, and align/distribute clamp each unit.
- The canvas text editor sets rows/cols as a fallback where `field-sizing`
  isn't supported. It shows the text's opacity, and its frame moved to the
  wrapper so it doesn't fade.
- The menu and rotate tooltip are portalled into `.vb-layout` in
  Fullscreen.
- Locked elements show no handles.
- Headless Playwright refuses real fullscreen, so fake it with
  `document.fullscreenElement` plus a `fullscreenchange` event.

**Testing:** saves need a signed-in admin. Create a throwaway Firebase
email/password account (REST `accounts:signUp`, key in `.env.local`). Its UID
isn't in the rules, so its saves are refused and the real draft is safe.
Delete the account afterwards. Never click Publish.

Unit checks: `node src/lib/photoCrop.test.js && node src/lib/boardGeometry.test.js && node src/lib/boardTransform.test.js`

### Other things done this session (all working)

- **Photo cropping:** it used to read pixels back from Firebase Storage, which
  failed because the bucket has no CORS. A crop is now saved as
  `photo_crop: { x, y, width, height }` (percentages) next to `photo_url`, and
  drawn by `src/components/CandidatePhoto.jsx` (maths in
  `src/lib/photoCrop.js`). The original photo is stored uncropped.
  `src/lib/cropImage.js` was deleted. Save Crop shows "Crop saved. Save the
  candidate to keep it."
- **Sign-in and security:**
  - Admin sign-in is now Firebase Auth email/password
    (`src/lib/firebase/auth.js`); `localAuth.js` was deleted and the password
    is no longer in the bundle.
  - `firestore.rules` and `storage.rules`: anyone can read, and only the UID
    `tNRXV3YjwghpgnORmJrOPcGgHKr2` (louiea@hyacinthindustriesllc.com) can
    write. Storage uploads must be images under 10 MB.
  - The user deployed rules and hosting, and signed-out writes were checked
    to return 403.
  - To add an admin, put their UID in both rules files and run
    `firebase deploy --only firestore:rules,storage`.
  - Claude Code's auto mode blocks `firebase deploy`, so the user runs deploys.
- **Bugs fixed that already existed:**
  - Reset, then clicking the headline, crashed the editor (the default texts
    had no `animation`);
  - Ctrl+A skipped the candidate board and announcement strip;
  - right-click menu items never ran;
  - the first step of every drag was lost.
- The user can delete `ADMIN_USERNAME`, `ADMIN_PASSWORD` and
  `ADMIN_SESSION_SECRET` from their env file, since nothing reads them now.

## Session of 2026-09-28: fix capitals for names and courses (done, uncommitted)

The Name and Course boxes on the Records page (Add and Edit forms) use
`src/components/CapsFixInput.jsx`: an Aa button inside the box opens a menu
(Capitalized / ALL CAPS / lowercase; an
option that would change nothing is greyed out). A paste-suggestion chip was tried and removed at the user's
request, because it duplicated the button. The rules are in `src/lib/properCase.js`: degree prefixes like BS
stay in capitals, as do text in brackets and roman numerals, and a word that
already has lowercase letters is left alone. Test with
`node src/lib/properCase.test.js`.

## Session of 2026-09-28: Settings page (done, uncommitted)

**Fixed:**
- The Account note wrongly said the credentials ship in the app. It now
  says only admin UIDs in the rules can edit.
- Light mode claimed to switch the live board, but it only changed this
  browser. The user then asked to remove the light theme entirely:
  - the live board is always dark, and its light-theme styling was deleted
    from VisualBoard and CandidateBoard;
  - the Settings page has no theme switch, because the sidebar's sun/moon
    switch already sets the admin panel theme.

**New "Live Board" settings.** These are stored in Firestore at
`settings/board` (`src/lib/boardSettings.js`) and followed live by
`/visual`, the dashboard preview and the editor canvas:
- hide the candidate box when nobody is listed;
- hide candidates after their interview date, judged in Manila time. This
  lives in `boardCandidates` in `candidateVisibility.js`, tested by
  `candidateVisibility.test.js`. Added 2026-09-29: an optional "Hide at" time
  (`hidePastTime`, "HH:MM" Manila time) hides the candidate at that time on
  their interview day. There is no midnight option (the user removed it). If
  no time is saved, the default is 23:59. The time is picked with
  `src/components/TimeField.jsx`, which replaces `<input type="time">`
  because the browser's own popup can't be styled.
- The Live Board checkboxes (2026-09-29) are custom-styled
  (`.settings-checkbox`) and sit left of each title. The user picked "move
  it to the left". The restyle was added on top because they'd asked for a
  restyle earlier; confirm they want it, or revert to the browser's own box.
  Before changing this UI, describe the change and wait for the user's go-ahead.

`/visual` no longer reads the theme from localStorage. The switches apply
instantly, with no Save button. The success path (a real admin toggling a setting and the TV following) was
not tested, because the throwaway account's writes are refused. The user
should try it once.

### Candidate card look (2026-09-28, uncommitted)
- The Candidate Board panel in the Visual Board editor has sliders for Card
  width (60–100% of its column), Card height (photo height as a % of card
  width), Name size and Course size, plus "Reset card look". They are stored
  on `layout.candidates` (`src/lib/candidateCard.js`, test
  `candidateCard.test.js`).
- Text sizes are board px drawn in cqh against the whole board, so resizing
  a card, the box or "per row" never changes them. CandidateBoard's root is
  therefore only an `inline-size` container, and the live candidates box is
  no longer a size container. Don't re-add either, or cqh reads against the
  box again.
- The name and course always keep the size that was set and wrap onto
  balanced lines. The course is capped at 2 lines with "...".
  `AutoFitText.jsx` was deleted.
- A drag-to-resize gold name bar with a lock was built, then cancelled by the
  user and removed. The bar has a fixed minimum height, `NAME_BAR_HEIGHT`
  (55 board px).
- A Web Worker fix for the page freezing during photo background removal
  was proposed. The user said to disregard it.

### Records page drag-to-reorder (2026-09-28, uncommitted)
- **What it does:** each candidate row on the Records page has a grip.
  Dragging reorders candidates within one date group, and the new order is
  `sort_order`, which is the board's order.
- **How it saves:** `reorderGroup` in `src/lib/candidateOrder.js` (test
  `candidateOrder.test.js`) reuses the group's own `sort_order` numbers, so
  other dates never change, and it pulls apart ties. Only the changed rows
  are written.
- **Drop rules:** a drop onto another date's row is ignored.
- **List order:** the list now sorts by date, then board order (it used to
  sort by `created_at`).

### Settings ideas saved for later (user asked to keep them)
- **Change password:** a Firebase `sendPasswordResetEmail` button.
- **Board status:** when the board was last published, whether the draft
  has unpublished changes, and buttons to open the live board and the draft
  preview.
- **Backups:**
  - export all candidates as CSV;
  - download and restore the board layout as a file (a simpler cousin of
    Batch 3's version history).
- **Clock time zones:** let the admin choose the two top-bar clocks, which
  are currently fixed to Manila and New York in `src/lib/adminTime.js`.
- **Don't add:** the board title or card speed. The Visual Board editor
  already owns those.

## Session of 2026-11-10: editor layout redesign (built, uncommitted)

The plan `docs/superpowers/plans/2026-11-10-visual-board-editor-layout.md` is
built, with every task checked in the browser.

**What was built:**
- **Slim header:** the app header is 34px on every admin page.
- **One editor bar:** `src/components/BarMenu.jsx` provides the Zoom, View,
  Templates and ⋯ menus. Publish shows a gold dot when the draft has
  unpublished changes.
- **Layer names** come from content (`src/lib/layerNames.js`).
- **Layers is the only list.** The Brand tab and `PANEL_BY_KIND` are gone,
  and each row has a delete button. Row controls show on hover; the eye
  and lock stay visible when set.
- **Folding sections:** `PropertySection.jsx` plus
  `src/lib/propertySections.js`.
- **The nothing-selected "Board" panel** has the hint, links to the two
  boxes, and the shortcuts from `src/lib/editorShortcuts.js`.
- **The floating selection bar:** `FloatingSelectionBar.jsx`, with
  placement in `src/lib/floatingBar.js` and `editor.interacting` from the
  hook.

**Known limits** (the deferred minors were fixed on 2026-11-10):
- The board is limited by width, so the freed height doesn't make it
  bigger. Collapsing the app sidebar or using Focus mode does.
- The editor bar sits outside `.vb-layout`, so it doesn't show in
  Fullscreen, same as the old toolbar.

**Record:** rulings and deferred minors are in
`.superpowers/sdd/2026-11-10-visual-board-editor-layout/progress.md`.
Batch 3 is next.

### Records: drop a photo to upload (2026-11-10, uncommitted)
- **What it does:** the Add candidates form's photo box takes a dropped
  PNG, JPG or WEBP. The first image in the drop is picked by
  `pickImageFile` in `src/lib/imageFiles.js` (test `imageFiles.test.js`).
- **While dragging:** the box highlights.
- **Other files:** a non-photo drop shows "Only PNG, JPG or WEBP".
- **Missed drops:** both Records forms swallow a drop that misses the box,
  so the tab doesn't open the image and lose the form. The Edit form still
  lets its native file input take drops.

### Photo review before saving (BUILT 2026-11-10, uncommitted)
Built from `docs/superpowers/plans/2026-11-10-photo-review.md`. The ledger
is at `.superpowers/sdd/2026-11-10-photo-review/progress.md`.

**Files:**
- `src/lib/photoCleanup.js`: the pixel maths.
- `src/lib/removalQueue.js`: the serial, cancellable queue.
- `src/lib/backgroundRemoval.worker.js` and `src/lib/backgroundRemover.js`:
  one worker and `photoQueue`.
- `src/lib/photoReview.js`: the needs-review rules.
- `src/components/PhotoReviewDialog.jsx`.

**In `AdminHistory.jsx`:**
- `runRemovals` and `reviewProps`;
- `PhotoDropBox`, `LocalPhotoPreview` and `ReviewChip`;
- both forms gate saving on `canSave`.
- The old main-thread `removeBackground` calls are gone.

**Throwaway-account gotcha:** its `idToken` expires after 1 hour. To
delete an older account, sign in again
(`accounts:signInWithPassword`) first.

**Final review:** 4 Important findings, plus 1 Minor re-graded up, all
fixed:
- edge trim at the frame edge;
- a RangeError on noisy cut-outs;
- Done re-marking reviewed photos;
- re-edits keeping the old file;
- a dead worker never replaced.

Deferred minors are in the ledger.

**Needs the user:**
- try one real phone photo, which may be rotated by EXIF;
- one real save, since the throwaway account's saves are refused.

**Full photo editor (BUILT 2026-11-10, uncommitted).** Plan:
`docs/superpowers/plans/2026-11-10-photo-editor.md`. Ledger:
`.superpowers/sdd/2026-11-10-photo-editor/progress.md`.
- **Tabs:** Edit photos has Clean up, Crop (react-easy-crop, square) and
  Adjust (rotate 90° steps, flip, brightness, contrast).
- **Clean up:** zoom and pan (scroll, −/+/Fit, Space-drag or a right-button
  drag), shared by both panes, plus a brush-size ring.
- **Crop:** a card preview opens the editor (on Crop once the photo is
  edited). Saved photos in the Edit form still use `PhotoCropModal`.
- **Keep original** means "skip removal", and adjust and crop still apply.
- **Done saves:**
  - at most 2400 px on the long side (`SAVED_LONG_SIDE`);
  - as a PNG, or a JPEG q0.92 for Keep original;
  - the untouched file for Keep original with no adjustments.
- **The edit pipeline** is in `applyEdits`: clean-up, then colour, then
  rotate/flip. Strokes are mapped back with `toSourcePoint`.

This is its own project, separate from Batch 3, and it comes first.

- **Spec:** `docs/superpowers/specs/2026-11-10-photo-review-design.md`.
  A builder check has been done.
- **Replaced photos:** a photo replaced in the Edit form gets reviewed too
  (the user's choice).
- **Next step:** the user approves the spec, then `writing-plans`.

**The flow:**
- Photos in the Add candidates form no longer have their background
  removed on upload.
- An **Edit photos** button (renamed from "Review photos" on 2026-11-10 at the user's request) runs the removals with a "Photo n of N"
  progress bar and shows each result next to the original.
- **Fix-up tools** in the review:
  - **Clean edges:** a slider. This is the main fix, because the white
    fragments are a pale outline around the person.
  - **Remove specks.**
  - **Erase and restore brush.**
  - **Keep original.**
- **Done** returns the cleaned photos to the form.
- **Add Candidate stays disabled until every photo is reviewed** (the user
  chose this).

**Spike (thrown away):** `@imgly/background-removal` runs in a module Web
Worker under Vite.
- On the main thread, one photo took 10.3 s and the page drew 0 frames.
- In the worker, it took 11.1 s at 75 fps, with the longest gap 14 ms, and
  the output was identical.
- The worker downloads its own copy of the model on its first run.
- Multithreaded WASM would need cross-origin isolation (COOP/COEP), which
  isn't set; don't add it without checking Storage images and Google Fonts.

### Left side of the editor: rework (BUILT 2026-11-10, uncommitted)
Plan: `docs/superpowers/plans/2026-11-10-left-panel-rework.md`. Ledger with
rulings and deferred minors: `.superpowers/sdd/2026-11-10-left-panel-rework/progress.md`.
- **New libs (each tested):** panelFold.js (`vb-panel-folded`), textPresets.js,
  recentPhotos.js (`splitUploads`, `spreadAt`), layerThumbs.js, layerTree.js,
  and `cleanLayerName` / `renamedLayer` in layerNames.js.
- **Recent photos** list `board-images` in Storage (`listRecentPhotos` in
  useBoardLayoutEditor.js), newest 12.
- **Renames** are stored as `name` on texts, dividers, images, videos and
  shapes; leaving the automatic name untouched saves nothing.
- **Known gap:** storage.rules only allow image writes, so video uploads are
  refused for the real admin (pre-existing). Needs a rules change the user deploys.

The agreed design:
The mockup is `.superpowers/brainstorm/2282-1794322625/content/left-panel.html`.
The user approved it and asked for the panel to fold.
- **Width and folding:**
  - the panel is about 240 px wide (was about 150), and the rail is about
    52 px;
  - the panel **folds away** with a « button by its title, or by clicking
    the active rail tab. » or any tab opens it again;
  - the fold state is remembered (localStorage).
- **Every tab gets a title.**
- **Layers:**
  - names start at the left edge;
  - each row has a thumbnail (the photo, the box colour, or "Aa" in the
    text's font and colour);
  - the eye and lock show on hover, or when set;
  - hidden rows are dimmed;
  - double-click a name to rename it (stored on the element);
  - grouped items sit under a folding group row (▾/▸);
  - shift/ctrl-click selects several.
- **Text:** click-to-add presets: Heading (gold), Subheading, Body, Bullet
  list, Script.
- **Uploads:** a drop zone, plus recent photos to reuse without a new
  upload.
- **Elements:** a 3-column grid, with dividers under "Lines".

### Visual Board Batch 3 (BUILT 2026-11-10, uncommitted)
Plan with every decision: `docs/superpowers/plans/2026-11-10-visual-board-batch3.md`.
Ledger: `.superpowers/sdd/2026-11-10-visual-board-batch3/progress.md`.

**What was built:**
- **Drop photos onto the canvas:** at the drop point, through
  `handleAddPhoto(file, at)`. A window guard stops a missed drop opening
  the file in the tab.
- **History:**
  - `boardLayoutHistory` keeps the last 10 publishes
    (`recordPublish` / `boardHistoryPrune.js`).
  - The History button restores a version into the draft.
- **Icons tab:**
  - lucide line icons, tinted, and react-icons/fc stickers;
  - inserted as `data:image/svg+xml` image elements;
  - `isLegacyDataPhoto` keeps the old-photo migration away from them.
- **Rulers and guide lines:** `RulerGuides.jsx` and `guides.js`, stored in
  localStorage `vb-guides`. `snapMove` takes `extra` / `guidesOnly`.
- **Export PNG:**
  - `exportBoard.js` with html-to-image 1.11.11, run inside a hidden
    `/admin/visual-board/preview?export=1` iframe that is handed the
    editor's layout.
  - Videos are frozen to stills.
  - **Needs the user's one-time CORS command:**
    `gsutil cors set cors.json gs://hyacinth-event-announcements.firebasestorage.app`.
    Until then, Storage photos and videos are missing from the export,
    with a warning toast.

**Not verified** (the throwaway account can't write): restoring a real
history entry, and a real dropped-photo upload.

### Batch 3 decisions so far
- **Version history (described to the user, not yet confirmed):**
  - Publish keeps the last 10 published layouts.
  - A History button lists them with a time and a preview.
  - Restore puts the chosen layout into the draft, not live.
- **PNG export, option A:** the user changes the Storage bucket's CORS
  setting once (the user runs the command), then the export draws the board
  in the app as a 1920x1080 PNG named with the date. The export is for
  sharing (group chat, social posts, email), so it shows exactly the live
  board look.

### Earlier: the spec

The user asked for seven layout changes to the editor before Batch 3:
- one slim editor bar (option A);
- a bigger canvas;
- layers named after their content;
- Layers as the only list;
- settings folded into sections;
- board actions grouped;
- a floating action bar.

- **Spec:** `docs/superpowers/specs/2026-11-10-visual-board-editor-layout-design.md`.
- **Mockups:** `.superpowers/brainstorm/2282-1794322625/content/`.
- **Next step:** the user reviews the spec, then `superpowers:writing-plans`.
- **Batch 3 changes:**
  - The user wants all of rulers/guide lines, version history, PNG export,
    drop photo onto canvas, and icons/stickers.
  - They dropped the animation start delay.
  - Smart guides already exist; rulers and draggable guide lines don't.
  - Batch 3 starts after the layout work.

## Deferred minors: worked through on 2026-11-11 (uncommitted)

**Fixed and checked in the browser** (throwaway account, since deleted):
- Layers: the count only counts rows that exist. A folded group's row lights
  up when a member inside it is selected. F2 renames the focused row.
- Uploads: the drop zone no longer flickers (a `relatedTarget` check). Recent
  photos refresh after any photo upload (`refreshRecentPhotos`), and an error
  shows a Retry link. Light-mode hint, count and drop-zone text are darker.
- History:
  - Restore and the previews use the version-checked `historyLayout`
    (`normalizeStoredLayout`), and an older-schema entry says it can't be
    restored.
  - Publish no longer waits for `recordPublish`.
  - Pruning is `pruneBoardHistory(history)`, run from the page on the
    entries the subscription already holds, so nothing downloads again.
  - The subtitle reads right with exactly one entry.
- Snap: `guidesOnly` in `snapMove` also turns grid lines off (tested).
- A canvas drop that mixes a photo with other files says how many were
  skipped.
- Edit photos:
  - Esc closes, and Tab stays inside the dialog.
  - Thumbnails keep one URL per Blob, so they don't flicker.
  - The Add card shows the original's file name.
  - Leaving Records runs `photoQueue.cancelAll()` (tested).
  - A job that hangs for 3 minutes drops the worker (`JOB_TIMEOUT_MS`).
- **Photo editor speed** (900x1200 preview):
  - In `photoCleanup.js`, `rotateFlip` uses integer maths (52 → 3.5 ms) and `trimEdges` uses direct indexing plus a solid-pixel fast path (65 → 23 ms). Both match the old output exactly, and tests pin them to the plain definitions.
  - The dialog caches `stroked` (the finished strokes, untrimmed), so a brush frame stamps only the live stroke (158 → 38 ms), a trim tick takes 147 → 40 ms, and a brightness tick 61 → 13 ms.
- Already fixed by an earlier change: pan pointercancel, the `finish()`
  catch, `canFinish`, the NaN progress bar, the brush ring resizing, and the
  Cropper locked while Done works.
- Checked, no change needed: of the 36 stickers, only FcAlarmClock relies on
  currentColor (its hands), and those render black, as designed.

**Still open:**
- **Needs the user:**
  - `storage.rules` only allow `image/*`, so video uploads are refused for
    the real admin. Fixing it means a rules change that the user deploys.
  - Try one EXIF-rotated phone photo.
- **Design questions:** reordering a group member can look ignored, because
  the group row stays at its frontmost member. Unlocked guides sit above
  elements (normal for design tools).
- **Cosmetic, and Save is blocked anyway:** before Done, the card preview
  draws the unrotated photo with a crop measured on the rotated one.
- **Tests not added:**
  - a rotated-stroke end-to-end test;
  - `boardLayout` normaliser tests (the module imports Firebase).

## Visual Board editor roadmap

Batch 1 is finished (see above). Batches 2 and 3 are queued: pick them up when
the user asks. For Batch 3, check the editor first in case some of it already
exists.

### Batch 2: styling. Reduced scope built on 2026-09-28 (uncommitted)
- **The user cut Batch 2 to three features, all built and reviewed:**
  - element opacity (`element.opacity`, drawn as `filter: opacity()` via
    `src/lib/opacity.js`);
  - border line styles plus photo and video borders (`normalizeStroke`,
    `strokeCss`, and `mediaStrokeCss`, which uses board px in cqh divided by
    scale);
  - text italic, underline and outline.
- **Dropped by the user:** custom shadows, image adjustments, copy/paste
  style. The spec and plan below still describe the full batch.
- **Record:** `.superpowers/sdd/2026-09-28-visual-board-batch2/progress.md`
  holds the ledger and rulings.
- **Tests:** `node src/lib/boardStyle.test.js`.
- **Deferred minor:** no unit test covers the normalisers (boardLayout.js
  imports Firebase). The opacity-while-editing one was fixed on 2026-11-10.

Original design notes:
- **Spec:** `docs/superpowers/specs/2026-09-25-visual-board-batch2-design.md`.
  The design was agreed section by section in chat. The user saw the written
  spec but asked to park it rather than review it, so ask them to review it
  before continuing.
- **Spec approved 2026-09-28.** Plan:
  `docs/superpowers/plans/2026-09-28-visual-board-batch2.md` (9 tasks).
  Next step: the user reviews the plan and picks an execution approach.
- **Decisions the spec records:**
  - custom shadows (colour, blur, X/Y, opacity) for every element, and text
    presets are converted to them;
  - borders on shapes, frames, images and videos, but not the logo;
  - adjustments on every kind of picture;
  - copy/paste style works across element types.
- **Keep testing light:** unit tests, plus one browser smoke check at the end.

### Batch 3: workflow extras
- Rulers and draggable guide lines
- Version history: restore an earlier published board
- Export the board as a PNG
- Drag-and-drop a photo straight onto the canvas
- Icon / sticker library
- Animation start delay

## Session of 2026-11-11: background removal accuracy (done)

- **PNG fix:** a Keep original photo that is already transparent (cut out in
  Canva, Windows Photos, iPhone, Photoshop) is saved as PNG, so it stays
  transparent after adjust/rotate (`outputFormat(edits, transparent)` and
  `hasTransparency` in `photoReview.js`, tested).
- **Models tested** in a throwaway bench (deleted): MODNet is 8x faster but
  clearly worse; BiRefNet can't run in the browser (16 storage-buffer GPU
  limit, WASM out of memory). img.ly/ISNet stays. It is **AGPL-3.0**.
- **Better accuracy** would need a paid API (Photoroom, remove.bg) through a
  Cloud Function. Idea: auto-tick Keep original for already-transparent PNGs.
