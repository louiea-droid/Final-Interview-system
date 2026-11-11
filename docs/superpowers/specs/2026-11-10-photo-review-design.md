# Records: review candidate photos before saving

Status: agreed in chat on 2026-11-10. This is its own project, built
before Visual Board Batch 3.

## Why

Today, choosing a candidate photo on the Records page removes its
background straight away. That has two problems:

- **It's slow and it freezes the page.** Each photo locks the page for
  about 10 seconds ("Removing photo background..."). While that runs, the
  admin can't move on to the next candidate, and the page draws nothing.
- **Bad cut-outs reach the TV unchecked.** The removal often leaves a
  **pale outline around the person**, the white fragments the user sees.
  There's no way to fix it, so it goes live as it is.

The user wants three things:

- add all the candidates and photos first, with no waiting;
- review the cut-outs in one go;
- fix the outline before saving.

## Goals

1. **No waiting while filling the form.** Choosing or dropping a photo
   just attaches it, and the form shows the original. That works in the
   Add candidates form and when replacing a photo in the Edit form.
2. **A "Review photos" button** sits next to Add Candidate (and next to
   Save in the Edit form). It opens a review step that:
   - removes the backgrounds of every photo that still needs it, one after
     another, with a **"Photo n of N"** progress bar;
   - shows each result **next to its original**;
   - offers fix-up tools for each photo:
     - **Clean edges:** a slider that trims the pale outline. This is the
       main fix.
     - **Remove specks:** one click deletes stray bits of background that
       aren't connected to the person.
     - **Erase / Restore brush:** paint away what's left, or paint back
       something cut off by mistake (a hand, a collar), with a brush-size
       control.
     - **Keep original:** use the photo as uploaded, with no background
       removal.
   - ends with **Done**, which puts the reviewed photos back into the form.
3. **Saving needs a review (the user chose this).**
   - In the Add form, **Add Candidate stays disabled** while any candidate
     has a photo that hasn't been reviewed.
   - The same rule applies to the Edit form's save button when a photo was
     replaced.
   - A candidate with "None" ticked, or no photo, needs no review.
   - Changing a photo after reviewing it makes it unreviewed again.
4. **The page never freezes.** Background removal runs in a **Web
   Worker**, so the progress bar moves and the admin can fix photo 1
   while photo 2 is still processing.

## Non-goals and anti-goals

- **No change to what's saved.** The saved photo is still one PNG in
  Firebase Storage. `photo_crop` (percentages) and `CandidatePhoto.jsx`
  stay as they are, and so do the board and `/visual`.
- **No new dependencies.** The worker uses the already-installed
  `@imgly/background-removal`. The fix-up tools are plain canvas code.
- **No editing of photos that are already saved.** The review applies to
  photos chosen in this form session. Re-editing a stored photo would need
  the Storage CORS change, which is planned for Batch 3's PNG export.
- **Anti-goals:**
  - the review must not become a chore for a photo that came out fine:
    one look, then Done;
  - a failed removal must never block saving. "Keep original" is always
    available.

## How it works today (constraints)

All of this lives in `src/pages/AdminHistory.jsx`, the Records page.

**Add form:**
- **Form state:** `addForms` holds one entry per candidate:
  `{ localId, name, course, interview_date, photo_file, photo_crop, no_photo }`
  (around L29).
- **On photo choice:** `handleAddPhotoChange(localId, file)` (around L454)
  calls `removeBackground(file)` on the main thread. It stores the result
  PNG as `photo_file`, or the original file if removal fails.
  `addProcessingIds` tracks which candidates are busy.
- **On save:** `addCandidates` (around L494) uploads each `photo_file` to
  Storage, then writes the candidates.
- **The card:** `AddCandidateCard` (around L1105) renders each candidate.
  It shows a `previewUrl` preview, which opens the crop dialog, and the
  photo box with click-or-drop upload added today, using `pickImageFile`
  from `src/lib/imageFiles.js`.

**Edit form:**
- `handleEditPhotoChange(id, file)` (around L266) does the same removal
  for the Edit form. It uses a single `processingPhoto` flag.
- `saveEdit` (around L195) uploads a replaced `photo_file`.

**Constraints:**
- **Crop:** the crop dialog works on `photo_file` and stores `photo_crop`.
  After a review, the crop resets and is done on the reviewed photo.
- **Spike (2026-11-10, thrown away):** the library runs in a module
  worker under Vite
  (`new Worker(new URL('./x.worker.js', import.meta.url), { type: 'module' })`).
  - On the main thread, one photo took 10.3 s with 0 frames drawn.
  - In the worker, it took 11.1 s at 75 fps, with the longest gap 14 ms,
    and the output was byte-identical.
  - The worker's first run downloads its own copy of the model, which
    takes about as long as one photo.
  - Multithreaded WASM would need cross-origin isolation. Don't turn it
    on.
- **StrictMode** is on in dev. Never start work or save from an unmount
  cleanup, and terminate a worker only when nothing is using it.

## The decisions

### Photo state per candidate

The candidate's form entry gains a review record:

- `photo_original`: the File as chosen or dropped.
- `photo_status`, one of:
  - `'pending'`: not processed yet;
  - `'processing'`: in the worker;
  - `'ready'`: the cut-out exists, not yet confirmed;
  - `'reviewed'`: Done was pressed with this photo;
  - `'failed'`: the removal threw. The review shows an error and offers
    Keep original or Try again.
- `photo_file`: **holds the original until the photo is reviewed**, so the
  card preview and the existing `form.photo_file` checks keep working.
  After Done it holds the result, or stays the original with Keep
  original. Saving is gated on review, so an unreviewed `photo_file` is
  never saved.
- `photo_cutout`: the plain cut-out Blob from the worker, once it's ready.
- `photo_edits`: the edits replayed on top of it:
  `{ keepOriginal, specks: boolean, strokes: [...], trim: 0-10 }`.
  - Strokes are stored in image coordinates as fractions of width and
    height, so they replay at any size.

Keeping the cut-out and the edits on the form entry, which lives at page
level, means work survives closing the review. It also lets a reviewed
photo be **reopened and re-edited** (my call).

"Needs review" means a photo is attached, `no_photo` is false, and
`photo_status !== 'reviewed'`.

**Removal outlives the dialog (my call).** The job queue and its
`photo_status` updates live at page level.
- **Closing the review early:** removals keep running in the background,
  and reopening shows their progress.
- **A candidate is removed, or the Edit form is cancelled:** its queued
  job is dropped, and a running job's result is ignored.
- **The worker:** never terminated while the page is mounted. One idle
  worker costs nothing, and this avoids the StrictMode double-cleanup
  trap.

### Background removal off the main thread

- `src/lib/backgroundRemoval.worker.js` receives a Blob, calls
  `removeBackground`, and posts back the PNG Blob or an error.
- `src/lib/backgroundRemover.js` exports
  `removeBackgroundOffThread(file): Promise<Blob>`.
  - One worker is shared by the whole page.
  - Jobs run one at a time, in the order requested.
  - It's created lazily on the first call.
- Removal starts **when Review photos opens**, not when the photo is
  chosen. That matches the user's wish that nothing happens until review.
- The review processes photos in candidate order.

### The review step

- **Layout:** a large modal over the form.
  - On the left, a list of the photos: thumbnail, candidate name (or
    "Candidate n"), and status.
  - The selected photo fills the rest.
  - The original and the cut-out sit side by side. The cut-out is shown
    on a checkerboard, plus a toggle for a dark background like the board
    and a white one, so the pale outline is easy to see. That toggle is my
    call.
- **Progress:** a bar reading "Photo n of N" across the top.
  - It counts the photos the review is processing.
  - A photo can be fixed as soon as it's ready; the others keep
    processing.
- **Tools** for the selected photo:
  - **Clean edges:** a slider from 0 (off) to 10 px, default 0.
    - It trims the outer edge of the cut-out by that many pixels, then
      softens the new edge by 1 px so it isn't jagged.
    - It acts on the cut-out's transparency only; colours aren't changed.
    - It's live: moving it updates the preview.
  - **Remove specks:** a one-click button. It keeps the largest connected
    region of the cut-out, plus any region at least 5% of its size, and
    makes the rest transparent. This is my threshold, so a second head in
    a photo survives. It can be undone with an Undo in the review.
  - **Erase / Restore brush:**
    - a mode toggle and a size slider (4 to 60 px on the image);
    - painting on the cut-out with Erase makes it transparent;
    - Restore paints back the original photo's pixels at full opacity.
  - **Undo / Reset:** undo the last brush stroke or tool action, or reset
    to the plain cut-out.
  - **Keep original:** marks this photo to be saved as uploaded, with no
    removal. The preview shows the original.
- **Order of edits:** Clean edges applies on top of the specks and brush
  edits. In practice the stored edits are replayed in a fixed order:
  1. plain cut-out;
  2. specks;
  3. brush strokes;
  4. edge trim.

  So moving the slider never loses brush work.
- **Done** writes each reviewed photo's final PNG (`canvas.toBlob`) as the
  candidate's `photo_file` and sets `photo_status = 'reviewed'`.
  - **When it's enabled:** only when every photo in the review is ready,
    reviewed, kept original, or failed and then set to Keep original.
  - **Closing without Done:** finished work is kept, and the form shows
    which photos still need review.
- **Speed and size (my call):**
  - **Edit on a preview:** the editing canvas is a preview, capped at
    about 1200 px on the long side, so brush strokes stay smooth.
  - **Save at full resolution:** Done replays the stored edits on the
    full-resolution cut-out and saves that PNG, as today's saved photos
    are.
  - **Keep original:** passes the chosen file through untouched, with no
    re-encode and no resize.
- **Reopening:** the **Review photos** button stays enabled whenever there
  is at least one photo. With nothing left to review, it reads "Review
  photos" and opens on the first photo. Otherwise it shows the count.

### The forms

- **Add form:**
  - The **Review photos** button sits beside Add Candidate and shows a
    count, for example "Review photos (3)". It's disabled only when no
    candidate has a photo.
  - **Add Candidate:** disabled while anything needs review. A short line
    under the buttons says why: "Review the photos before adding."
  - Each card's photo box shows the original thumbnail, and a small
    status chip: "Needs review" or "Reviewed".
- **Edit form:**
  - Replacing a photo marks it as needing review.
  - The same **Review photos** button sits beside Save, and Save is
    blocked until the review is done.
- **The old flow is removed:** the immediate `removeBackground` calls,
  `addProcessingIds`, `processingPhoto` and the "Removing photo
  background..." toasts all go.
- **Crop (my call):** cropping opens only after the photo is reviewed.
  - Before then, the preview isn't a crop button, and its tooltip reads
    "Review the photo first, then crop".
  - A crop made earlier would be thrown away when the reviewed photo
    replaces it.
  - Re-editing a reviewed photo clears its crop, as replacing a photo does
    today.
- **Edit form photo box (my call):**
  - Its preview shows the newly chosen file while one is pending.
  - It gets the same click-or-drop box as the Add form.
  - The review covers every candidate in the Edit form whose photo was
    replaced.
- **First run:** the first removal in a session also downloads the model.
  While it does, the progress bar shows "Preparing background removal…".

### Testing

- The pixel maths lives in a pure module, `src/lib/photoCleanup.js`. It
  works on `{ width, height, data: Uint8ClampedArray }` (ImageData-shaped),
  so it runs under node with an `assert` test (`photoCleanup.test.js`). It
  covers:
  - `trimEdges(alpha, width, height, px)`;
  - `removeSpecks(alpha, width, height, minShare = 0.05)`;
  - brush stamping;
  - replaying an edit list at two sizes, which must give the same result,
    scaled.
- A browser smoke check uses a throwaway Firebase account (see
  CLAUDE.md). Its saves are refused, so it never writes a real candidate.
  Check:
  - drop 2 photos, review, fix one, press Done;
  - Add Candidate becomes enabled.

## Left to the builder

- Exact modal styling, matching the existing dark `candidate-edit-popup`
  look and the light theme.
- How the brush cursor is drawn.
- Whether the side-by-side view stacks on narrow screens.
- Component split (`PhotoReviewDialog.jsx` plus small pieces is
  expected).

## Addendum (2026-11-10): the full photo editor

Agreed in chat against the mockup
`.superpowers/brainstorm/2282-1794322625/content/photo-editor.html`.

### Renames
- The button is **Edit photos (n)**, and the dialog title is **Edit
  photos**.
- The card chips read **Needs editing** and **Edited**.
- The hint lines read "Edit the photos before adding." and "Edit the
  photos before saving."

### Three tabs per photo
The tabs are **Clean up**, **Crop** and **Adjust**. Done saves all three
together.

- **Clean up** holds the existing tools.
- **Crop** is the same square crop as today (aspect 1, react-easy-crop),
  now inside the editor.
  - It has a Zoom slider (1 to 3) and **Reset crop**.
  - It's stored as `photo_crop` percentages relative to the finished
    photo, as today.
  - **The crop window that used to open after Done is gone for new
    photos.** Clicking a new photo's preview on a card opens the editor on
    that photo.
  - The crop window stays for **saved** photos in the Edit form, since
    they have no cut-out to edit.
- **Adjust** offers:
  - **Rotate** 90° left or right;
  - **Flip** left–right;
  - **Brightness** and **Contrast**, each from −50 to +50, with a default
    of 0;
  - **Reset adjustments**.

  These change the saved photo itself (my call). More tools can come later
  (the user said so).

### Zoom and the brush circle
- **View zoom** for the Clean up panes, at 25–800%:
  - scroll to zoom, or use the − / + buttons and **Fit**;
  - Space-drag, or a right-button or middle-button drag, moves the view;
  - Original and Result zoom and move together.
- **The brush circle:** with Erase or Restore picked, a circle the size of
  the brush follows the pointer over the Result, at the right size at any
  zoom.

### My calls
- **The edit model** gains `rotate` (0, 90, 180 or 270), `flipX`,
  `brightness` (−50…50) and `contrast` (−50…50).
- **Order of edits:** the cut-out's own edits come first (specks, strokes,
  trim), then colour (brightness, contrast), then geometry (rotate, flip).
  Strokes stay in the cut-out's own coordinates, so a pointer on the
  rotated or flipped preview is mapped back through the inverse of that
  transform.
- **Keep original** now means "skip background removal". Adjust and crop
  still apply. With no adjustments, the original file is still saved
  untouched. With adjustments, it's re-encoded as a PNG.
- **Changing rotate or flip resets the crop,** because the image's shape
  changes. Brightness and contrast keep it.
- **A crop change counts as an edit,** so a reviewed photo goes back to
  needing Done.
