# Photo review before saving: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Records page:
- photos attach instantly;
- a Review photos step removes backgrounds in a Web Worker and lets the
  admin fix the result (Clean edges, Remove specks, Erase/Restore brush,
  Keep original);
- saving is blocked until every attached photo is reviewed.

**Architecture:**
- **Pure modules, each with a node `assert` test:**
  - the pixel maths (`photoCleanup.js`);
  - the serial job queue (`removalQueue.js`);
  - the "needs review" rules (`photoReview.js`).
- **The worker:** a thin worker plus a one-worker client
  (`backgroundRemover.js`).
- **The page:** a new `PhotoReviewDialog.jsx` holds the UI.
  `AdminHistory.jsx` owns the per-candidate photo state and the queue, at
  page level, so work survives closing the dialog.

**Tech stack:** React (plain JSX), Vite module workers, Canvas 2D, the
existing `@imgly/background-removal`.

**Spec:** `docs/superpowers/specs/2026-11-10-photo-review-design.md`.
Read it; this plan argues from it.

## Global constraints

- **No new dependencies.** No change to what's saved: one PNG (or the
  untouched original) in Storage, plus `photo_crop`. `/visual` and the
  board are untouched.
- **Don't commit.** The user commits.
- **StrictMode:** never start work or save from an unmount cleanup, and
  never terminate the shared worker.
- **Tests:** `node src/lib/<name>.test.js` with `node:assert/strict`, in
  the same style as `src/lib/imageFiles.test.js`. A test imports only pure
  modules.
- **Browser checks:**
  - Use a throwaway Firebase account (REST `accounts:signUp` with the key
    in `.env.local`). Its saves are refused, so nothing real is written.
    Delete it afterwards.
  - Never save a real candidate. Test photos are generated in the page
    (`OffscreenCanvas` → Blob).
- **Copy, exactly:**
  - the review button: `Review photos (n)` when n > 0, otherwise
    `Review photos`;
  - the blocked-save line: `Review the photos before adding.` (Add form)
    and `Review the photos before saving.` (Edit form);
  - card chips: `Needs review` and `Reviewed`;
  - the progress line: `Photo n of N`, and
    `Preparing background removal…` while the first job of the session
    runs;
  - the crop tooltip before review: `Review the photo first, then crop`.

## Review focus

The spec implies these cases, but no task's main tests cover them. Each
line names the task that adds its check.

1. **A candidate is removed while its photo is queued or processing.**
   No crash, and no result is written onto another card (Task 2 queue
   test, Task 4 browser check).
2. **A photo is changed after being reviewed.** It goes back to
   `Needs review`, and saving is blocked again (Task 3 `photoReview`
   test).
3. **The removal fails.** The dialog shows the error with Keep original
   and Try again, and Done is still reachable with Keep original
   (Task 5).
4. **"None" is ticked on a candidate with an unreviewed photo.** That
   candidate no longer blocks saving (Task 3 test).
5. **The full-resolution save matches the preview edit.** Replaying the
   same edits at two sizes gives the same result, scaled (Task 1 test).

---

### Task 1: Pixel maths: `photoCleanup.js`

**Files:**
- Create: `src/lib/photoCleanup.js`.
- Create: `src/lib/photoCleanup.test.js`.

**Interfaces:**
- **Images:** an image is `{ width, height, data: Uint8ClampedArray }`
  (RGBA, ImageData-shaped).
- **Produces:**
  - `trimEdges(alpha, width, height, px): Uint8ClampedArray`
    - `alpha` is one byte per pixel.
    - It erodes by `px` (min over a square window of radius `px`, done
      separably), then applies a 3×3 box blur to the alpha only along the
      new edge, so it isn't jagged.
    - `px = 0` returns an equal copy.
  - `removeSpecks(alpha, width, height, minShare = 0.05): Uint8ClampedArray`
    - It keeps the largest 4-connected region of `alpha > 0`, plus any
      region with at least `minShare` of its pixel count, and zeroes the
      rest.
  - `stampStroke(target, original, stroke): void`
    - It mutates `target.data`.
    - `stroke` is
      `{ mode: 'erase' | 'restore', size: number, points: [x, y][] }`,
      with `size` and the points as fractions of the image (size is a
      fraction of the long side).
    - It paints filled circles along the points, at a spacing of
      `radius / 2`.
    - Erase sets alpha to 0. Restore copies `original`'s RGB with alpha
      255.
  - `applyEdits(cutout, original, edits, trimPx): { width, height, data }`
    - `edits` is `{ keepOriginal, specks, strokes, trim }`.
    - It returns a copy, never mutating its inputs.
    - With `keepOriginal`, it returns a copy of the original.
    - Otherwise it applies, in order: specks (on alpha), then strokes,
      then `trimEdges(..., trimPx)`.
    - `trimPx` is the trim already scaled to this image's size. The
      preview passes `edits.trim`, and the full-size save passes
      `Math.round(edits.trim * fullLong / previewLong)`.

- [ ] **Step 1: Write the failing tests** in `photoCleanup.test.js`. Build
  small images with a helper `img(w, h, fill)`.
  - **`trimEdges`:**
    - A 7×7 alpha with a filled 5×5 square at (1,1), trimmed with `px=1`,
      leaves the centre 3×3 at 255.
    - The border ring of that 3×3 is below 255 (feathered).
    - Pixels outside the original square stay 0.
    - `px=0` returns equal values.
  - **`removeSpecks`:**
    - A 20×20 alpha with a 10×10 block and two 1-pixel specks keeps the
      block and zeroes both specks.
    - A second block of 6×6 (36 ≥ 5% of 100) is kept.
  - **`stampStroke`:**
    - An erase stroke at `[[0.5, 0.5]]` with size 0.2 on a 10×10 opaque
      image sets the centre pixel's alpha to 0 and leaves the corners at
      255.
    - Restore with an `original` whose centre is RGB (10, 20, 30) sets the
      centre to (10, 20, 30, 255).
  - **`applyEdits`:**
    - `keepOriginal` returns the original's data.
    - Specks then trim matches calling them by hand.
    - **Review focus 5:** the same erase stroke applied to a 20×20 and a
      40×40 version of the same opaque square erases the centre in both,
      and the erased area in the 40×40 is 4× (±15%) the 20×20's.
  - Inputs are never mutated: compare against a copy.
- [ ] **Step 2: Run** `node src/lib/photoCleanup.test.js`. Expected:
  FAIL (the module is missing).
- [ ] **Step 3: Implement the module.**
- [ ] **Step 4: Run the test.** Expected: `photoCleanup: all checks passed`.

### Task 2: The worker, the queue and the client

**Files:**
- Create: `src/lib/removalQueue.js`.
- Create: `src/lib/removalQueue.test.js`.
- Create: `src/lib/backgroundRemoval.worker.js`.
- Create: `src/lib/backgroundRemover.js`.

**Interfaces:**
- **Produces:**
  - `createRemovalQueue(run: (file) => Promise<Blob>)`. It returns
    `{ enqueue(key, file): Promise<Blob>, cancel(key): void, pending(): string[] }`.
    - Jobs run one at a time, in order.
    - `cancel(key)` removes a queued job; its promise rejects with an
      `Error` whose `name` is `'CancelledError'`. For a running job,
      `cancel` marks it so its promise rejects with the same error when
      it finishes, ignoring the result.
    - Re-enqueuing a key that's already queued replaces that job.
  - The worker (`backgroundRemoval.worker.js`) handles a message
    `{ id, file }`. It posts back `{ id, blob }` or
    `{ id, error: string }`.
  - `backgroundRemover.js` exports
    `removeBackgroundOffThread(file): Promise<Blob>`.
    - One module-level worker, created on the first call with
      `new Worker(new URL('./backgroundRemoval.worker.js', import.meta.url), { type: 'module' })`.
    - Request ids are matched to their replies.
    - It's never terminated.
    - It also exports `photoQueue = createRemovalQueue(removeBackgroundOffThread)`.

- [ ] **Step 1: Write the failing test** `removalQueue.test.js`. Use a fake
  `run` that resolves after a microtask with a tag, and records the
  start order.
  - Two enqueues start one after the other, never overlapping.
  - Cancelling a queued key rejects it with `CancelledError` and never
    calls `run` for it.
  - **Review focus 1:** cancelling the running key rejects it with
    `CancelledError` after `run` resolves, and the next job still runs.
  - Re-enqueuing a queued key runs only the newer file.
  - `pending()` lists the queued keys.
- [ ] **Step 2: Run the test.** Expected: FAIL.
- [ ] **Step 3: Implement `removalQueue.js`,** then the worker and the
  client.
- [ ] **Step 4: Run the test.** Expected: PASS. Then run `npm run build`;
  expected: it succeeds, and the build output lists a separate worker
  chunk.

### Task 3: Review rules: `photoReview.js`

**Files:**
- Create: `src/lib/photoReview.js`.
- Create: `src/lib/photoReview.test.js`.

**Interfaces:**
- **The photo state on a form entry** (the spec's names):
  - `photo_original: File | null`;
  - `photo_status: 'pending' | 'processing' | 'ready' | 'reviewed' | 'failed' | null`;
  - `photo_cutout: Blob | null`;
  - `photo_edits: { keepOriginal: false, specks: false, strokes: [], trim: 0 }`;
  - `photo_file`: the original until reviewed, then the result.
- **Produces:**
  - `attachPhoto(entry, file)`: returns a new entry with
    `photo_original = photo_file = file`, `photo_status = 'pending'`,
    `photo_cutout = null`, the edits reset, `photo_crop = null` and
    `no_photo = false`.
  - `needsReview(entry): boolean`: true when the photo is attached,
    `!no_photo`, and the status isn't `'reviewed'`.
  - `reviewCount(entries): number`.
  - `canSave(entries): boolean`: true when no entry needs review.
  - `markReviewed(entry, file)`: returns an entry with `photo_file = file`,
    `photo_status = 'reviewed'` and `photo_crop = null`.
  - `EMPTY_EDITS`.

- [ ] **Step 1: Write the failing test.**
  - A fresh entry needs no review.
  - `attachPhoto` makes it need review, and resets the crop.
  - `markReviewed` clears that.
  - **Review focus 2:** `attachPhoto` on a reviewed entry needs review
    again.
  - **Review focus 4:** `no_photo: true` on an attached, unreviewed entry
    needs no review.
  - `canSave` is false while any entry needs review.
  - `reviewCount` counts them.
- [ ] **Step 2: Run the test.** Expected: FAIL.
- [ ] **Step 3: Implement the module.**
- [ ] **Step 4: Run the test.** Expected: PASS.

### Task 4: The Add form uses the new flow

**Files:**
- Modify: `src/pages/AdminHistory.jsx`:
  - `createEmptyAddForm` (around L27): add the new fields;
  - `handleAddPhotoChange` (around L454): replace its body;
  - `addCandidates` (around L494): change its gate;
  - the add modal's footer buttons (around L1080);
  - `AddCandidateCard` (around L1110): the chip and the crop gating.
- Modify: `src/styles/globals.css`: the chip styles.

**Interfaces:**
- Consumes: Task 3's helpers, and Task 2's `photoQueue`.
- Produces: page state `reviewOpen: 'add' | 'edit' | null`, and the
  function
  `runRemovals(kind: 'add' | 'edit', entries, setEntries, keyOf)`.
  - For each entry with status `'pending'` or `'failed'`, it sets
    `'processing'`, then calls `photoQueue.enqueue(\`${kind}:${key}\`, entry.photo_original)`.
  - On resolve: `photo_cutout = blob`, status `'ready'`.
  - On `CancelledError`: nothing.
  - On any other error: status `'failed'`.
  - Every state write goes through `setEntries(current => current.map(...))`,
    matched by key, so a removed card is simply not found.

- [ ] **Step 1: Attach without removing.**
  - `handleAddPhotoChange(localId, file)` becomes a state update with
    `attachPhoto`.
  - Delete `addProcessingIds` and the old `removeBackground` import and
    calls in this flow. The Edit form's calls go in Task 6.
  - Removing a candidate card calls `photoQueue.cancel(\`add:${localId}\`)`.
  - Closing or resetting the add modal cancels every `add:` key.
- [ ] **Step 2: Gate saving.**
  - `addCandidates` returns early unless `canSave(addForms)`.
  - The footer, left to right:
    - the line `Review the photos before adding.`, shown only while
      `!canSave`;
    - Cancel;
    - `Review photos (n)` / `Review photos`, disabled only when no entry
      has a photo; it sets `reviewOpen = 'add'` and calls `runRemovals`;
    - Add Candidate, disabled while `!canSave(addForms) || isAddingCandidates`.
- [ ] **Step 3: Update each card.**
  - Show the chip `Needs review` or `Reviewed` when a photo is attached.
  - The preview opens the crop dialog only when the status is
    `'reviewed'`. Otherwise it shows the tooltip
    `Review the photo first, then crop` and nothing happens on click.
- [ ] **Step 4: Browser check** (the dialog isn't built yet, so stub
  `reviewOpen` to only start `runRemovals`).
  - Drop two generated photos. Both show `Needs review`, and
    Add Candidate is disabled with the line showing.
  - Click Review photos. Within about 30 s both entries reach `'ready'`;
    check it through the React state shown in the chips, or temporarily
    log it.
  - Remove card 2 while it's processing. No error in the console, and
    card 1 is unaffected (Review focus 1).
- [ ] **Step 5: Run all unit tests and `npm run build`.** Expected: pass.

### Task 5: `PhotoReviewDialog.jsx`

**Files:**
- Create: `src/components/PhotoReviewDialog.jsx`.
- Modify: `src/styles/globals.css`: the dialog styles, plus light-theme
  overrides beside the existing `.admin-layout.light-mode` rules.
- Modify: `src/pages/AdminHistory.jsx`: render the dialog when
  `reviewOpen`.

**Interfaces:**
- Consumes: `applyEdits` and `EMPTY_EDITS`; the entries with their photo
  fields.
- Produces:
  ```
  <PhotoReviewDialog
    items={[{ key, label, entry }]}
    onEditsChange(key, edits)
    onRetry(key)
    onDone(results: { key, file }[])
    onClose()
  />
  ```
  - `label` is the candidate's name, or `Candidate n`.
  - `onEditsChange` stores the edits on the entry, at page level.
  - `onRetry` sets the entry back to `'pending'` and calls `runRemovals`.

- [ ] **Step 1: Layout,** following the mockup
  `.superpowers/brainstorm/2282-1794322625/content/photo-review.html`.
  - **Top:** the progress bar and the text
    `Photo n of N`.
    - `n` is the number of items not `'pending'` or `'processing'`, plus
      one, capped at N.
    - While the first job of the session runs and nothing is ready yet,
      it reads `Preparing background removal…`.
  - **Left:** the list, with a thumbnail, the label and a status chip:
    `Removing…`, `Ready to check`, `Reviewed`, `Failed` or `Waiting`.
  - **Middle:** Original and Result side by side.
    - The Result background toggle offers Dark (`#0b0102`), White and
      Checker.
    - The note under them reads:
      `Clean edges trims the pale outline. Crop opens after Done.`
  - **Right:** the tools.
  - **Footer:** `n of N photos still to check`, Next photo, and Done.
- [ ] **Step 2: Editing.**
  - Decode the selected item's cutout and original into ImageData at
    preview size, with the long side ≤ 1200 px.
  - Render `applyEdits(cutout, original, edits, trim)` to the Result
    canvas.
  - **Clean edges:** a range slider from 0 to 10.
  - **Remove specks:** sets `specks: true`.
  - **Brush:** an Erase/Restore toggle and a size range (4–60 px on the
    preview, stored as a fraction of the long side). Pointer events on
    the Result canvas append a stroke of fractions.
  - **Undo:** pops the last stroke, or else clears specks, or else resets
    the trim to 0.
  - **Reset:** sets `EMPTY_EDITS`.
  - **Keep original:** a checkbox.
  - Every change calls `onEditsChange`.
  - A `'ready'` item that's been viewed counts as checked.
  - Track the checked keys in dialog state, and seed it with the
    `'reviewed'` items.
- [ ] **Step 3: Done.**
  - **When it's enabled:** every item is checked, and none is
    `'processing'` or `'pending'`. A `'failed'` item counts only with
    Keep original.
  - **What it produces:** for each item, a File.
    - With Keep original, it's the original File, untouched.
    - Otherwise it decodes the cutout and original at full size, runs
      `applyEdits` with `trimPx = Math.round(trim * fullLong / previewLong)`,
      and calls `canvas.toBlob(..., 'image/png')`. The name is
      `<base>.png`.
  - It calls `onDone`. The page applies `markReviewed` to each entry and
    closes the dialog.
- [ ] **Step 4: Failure** (Review focus 3).
  - A `'failed'` item shows "Background removal failed." with
    `Try again` (`onRetry`) and `Keep original`.
- [ ] **Step 5: Browser check.**
  - Drop two generated photos and review.
  - Move Clean edges to 3, draw one Erase stroke, then Undo and Redo the
    stroke by drawing it again.
  - Select photo 2 and press Done.
  - Both chips show `Reviewed`, and Add Candidate is enabled.
  - Clicking the preview now opens the crop dialog.
  - Check the light theme once.
  - **Failure:** force one by temporarily calling `onRetry` with an empty
    Blob, or by stubbing the queue to throw. Failed appears, and Keep
    original lets Done enable.
- [ ] **Step 6: Run all unit tests and `npm run build`.** Expected: pass.

### Task 6: The Edit form uses the same flow

**Files:**
- Modify: `src/pages/AdminHistory.jsx`:
  - `handleEditPhotoChange` (around L266);
  - `saveEdit` (around L195): the gate;
  - `openPhotoCrop` (around L303);
  - the edit modal's photo controls (around L850);
  - its footer.

**Interfaces:**
- Consumes: Tasks 3–5. The keys are `edit:${id}`.

- [ ] **Step 1: Attach without removing.**
  - `handleEditPhotoChange` uses `attachPhoto`.
  - Delete `processingPhoto` and the remaining `removeBackground` import.
  - Cancelling the edit modal cancels every `edit:` key.
- [ ] **Step 2: Replace the native file input** with the same click-or-drop
  `photo-upload-box` the Add form uses, reusing `pickImageFile`.
  - The preview shows the newly chosen file while one is attached.
  - The status chip shows as in the Add form.
- [ ] **Step 3: Gate saving.**
  - `saveEdit` returns early unless `canSave(editForms)`.
  - The footer gets `Review the photos before saving.` and
    `Review photos (n)`, which opens the dialog with only the entries
    that have `photo_original`.
- [ ] **Step 4: Crop.**
  - `openPhotoCrop` on an entry with an unreviewed `photo_original` does
    nothing; its preview shows the tooltip.
  - Reviewed photos and saved photos crop as today.
- [ ] **Step 5: Browser check.**
  - Open Edit on a date group and replace one photo. Save is blocked.
  - Review and press Done. Save becomes enabled.
  - Don't click Save on real data: cancel instead.
- [ ] **Step 6: Run all unit tests and `npm run build`.** Expected: pass.

### Task 7: Final check and notes

- [ ] **Step 1: Run everything:**
  `for f in src/lib/*.test.js; do node "$f" || echo FAIL $f; done; npm run build`.
  Expected: no FAIL lines.
- [ ] **Step 2: Smoke check** with a throwaway account. Run the Add flow
  end to end up to, but not including, a real save. The throwaway
  account's save is refused, which is expected. Delete the account.
- [ ] **Step 3: Update CLAUDE.md:**
  - what was built;
  - the deferred items;
  - that Batch 3 (version history, PNG export) is next.
