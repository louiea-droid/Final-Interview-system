# Visual Board Batch 3: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Five editor features:
- drop photos onto the canvas;
- version history;
- an Icons & stickers tab;
- rulers with draggable guide lines;
- Export PNG.

**Design:** agreed in chat on 2026-11-10. The user said "just do what is
best", so the decisions below are mine and are listed for the user to
check. Slots were reserved by the layout redesign
(`docs/superpowers/specs/2026-11-10-visual-board-editor-layout-design.md`,
"Slots for Batch 3").

## Decisions (my calls)
1. **Drop photos onto the canvas.**
   - Image files dropped on the board become photos at the drop point,
     selected afterwards.
   - Several files land 3% apart.
   - Non-images are refused with a toast:
     `Only PNG, JPG or WEBP photos can be dropped.`
   - It goes through the existing upload path (`handleAddPhoto`), which
     gains an optional `{ x, y }`.
2. **Version history.**
   - Every successful Publish adds `{ layout, publishedAt }` to the
     Firestore collection `boardLayoutHistory`. The wildcard rule already
     allows admin writes, so no rules deploy is needed.
   - Only the newest **10** are kept; older ones are deleted after each
     publish.
   - A **History** button beside Publish opens a list, newest first: the
     time, a `TemplatePreview` mini-board, and **Restore**.
   - Restore replaces the **draft** through `editor.replaceLayout`, the
     same path as applying a template, so it's one undo step. It shows the
     toast `Restored the board from <time>. Publish to put it live.`
   - A history write failing never fails the publish. It's logged and
     shown as a warning toast.
3. **Icons & stickers.**
   - A new **Icons** rail tab (before Layers) with two sets:
     - **Icons:** about 60 curated lucide-react line icons, with a colour
       picker that defaults to the board gold `#f4ca5d`.
     - **Stickers:** about 30 multicolour `react-icons/fc` icons. The
       package is already installed but unused until now.
   - A search box filters both.
   - Inserting serialises the icon's rendered `<svg>` to a
     `data:image/svg+xml` URL (a few KB) and adds it as an **image**
     element at the board centre. So it moves, resizes, rotates, borders
     and fades like a photo, and the live board needs no change.
   - Changing an icon's colour later means inserting it again (a ceiling
     to note).
4. **Rulers and guide lines.**
   - **Rulers** run along the top and left of the canvas, in board pixels
     (0–1920 by 0–1080), with labels every 100 px. They follow the zoom
     and scroll.
   - **Guides:**
     - drag from a ruler to create one;
     - drag a guide to move it;
     - drag it back onto its ruler to delete it.
   - **Storage:** guides are kept in this browser (`localStorage`, key
     `vb-guides`) and never on the live board. They're an editor aid, so
     no layout-model change is needed.
   - **View menu:** Show → Rulers, Guide lines. Snapping → Snap to guide
     lines. Guide lines → Lock guide lines, Clear all guide lines.
   - **Snapping:** moving elements snap to guides through `snapMove`, as
     extra x/y targets. A snapped guide is highlighted like a smart guide.
5. **Export PNG.**
   - An **Export PNG** button beside Preview.
   - It loads the draft preview (`/admin/visual-board/preview?export=1`,
     which hides the "Draft preview" badge) in a hidden 1920×1080
     same-origin iframe, waits for fonts and images, and captures it with
     **html-to-image**. This is a new, small, widely used dependency, which
     the user approved in chat.
   - It saves `board-YYYY-MM-DD.png` and includes the current background
     video frame.
   - **The one-time storage setting:** the user runs
     `gsutil cors set cors.json gs://hyacinth-event-announcements.firebasestorage.app`
     with a `cors.json` committed to the repo (GET from the hosting origin
     and `localhost:5173`).
   - **Before that's done,** an export whose photos can't be read shows
     `Some photos couldn't be included - run the one-time storage setup
     (see cors.json).` rather than silently leaving gaps.

## Global constraints
- **Don't commit.** Same uncommitted branch as before.
- **Tests:** `node:assert` tests for the pure logic.
- **Browser checks:**
  - use a throwaway account (its saves are refused, so a Publish fails).
  - **History is checked against a stubbed publish:** the pure prune
    logic is unit-tested, and the UI is checked with the history list
    seeded in-page.
  - Never click Publish as a real admin.
- `/visual` (VisualBoard.jsx) changes only by reading `?export=1` to hide
  the preview badge.
- **StrictMode-safe** effects; no saving from unmount cleanups.

## Tasks

### Task 1: Drop photos onto the canvas
- `pickImageFiles(files)` in `src/lib/imageFiles.js` returns every PNG,
  JPG or WEBP, in order. Test it first: mixed lists, none, undefined.
- `handleAddPhoto(file, at?)` puts the photo at `at.x`, `at.y` (board %,
  clamped).
- On the canvas surface (`.vb-canvas-surface` / `middleColumnRef`):
  - onDragOver shows a drop highlight;
  - onDrop computes board % from the surface rect, adds the files one
    after another at +3% offsets, and selects the last;
  - non-image drops show the toast.
- **Browser check:** simulated drop of 2 images plus 1 text file. Two
  image elements appear near the drop point (uploads are refused for the
  throwaway account, so check the toast and the error path), plus the
  refusal toast.

### Task 2: Version history
- **`src/lib/boardHistory.js`:**
  - `HISTORY_LIMIT = 10`;
  - `idsToPrune(entries)` returns the ids beyond the newest 10, sorted by
    `publishedAt` descending. Test it first.
- **Firestore functions:**
  - `recordPublish(layout)` adds the entry, then deletes
    `idsToPrune(all)`;
  - `subscribeBoardHistory(listener)`.
- **The collection** `boardLayoutHistory` goes in
  `src/lib/firebase/collections.js`.
- **`publish()`** calls `recordPublish` after a successful
  `publishBoardLayout`, with errors caught and shown as a warning toast.
- **The History button and dialog,** reusing the `TemplatePreview` and
  template-list styles. Restore uses `editor.replaceLayout(normalizeLayout(entry.layout))`
  and the toast.
- **Browser check:** the History dialog opens. The empty state reads
  `No published versions yet. Each Publish keeps a copy here.` Then seed
  two entries through the subscription stub, Restore one, and check the
  canvas changes, the toast, and that Ctrl+Z undoes it.

### Task 3: Icons & stickers
- **`src/lib/iconCatalog.js`:** the curated lucide names, the fc sticker
  names, `filterIcons(list, query)` (case-insensitive, matches words in
  the name), and `svgToDataUrl(svgString)`. Test `filterIcons` and
  `svgToDataUrl` first.
- **`src/components/IconPanel.jsx`:**
  - the search box, the colour input, and two grids of buttons rendering
    each icon at 28 px;
  - inserting reads the button's `<svg>` `outerHTML`, sets
    `width`/`height` to 512 and the colour (`color` / `stroke`) for line
    icons, then calls `editor.addImageFromUrl(dataUrl)`.
- **`editor.addImageFromUrl(url)`** creates an image element at the centre
  and returns its id. The page then selects it.
- The rail tab `icons` goes before `layers`.
- **Browser check:** search "star" filters the grid. Insert one icon and
  one sticker: two image elements show on the canvas, with the icon in the
  chosen colour.

### Task 4: Rulers and guide lines
- **`src/lib/guides.js`:**
  - `loadGuides()` / `saveGuides(guides)`: localStorage, try/catch;
  - `addGuide`, `moveGuide`, `removeGuide` (pure);
  - `guideTargets(guides)` returns extra snap targets.

  Test the pure functions first.
- **`snapMove`** gains `extra = { x: [], y: [] }`, added to its target
  lists, and a snapped guide is reported in `guides`. Test it first in
  `boardTransform.test.js`.
- **`src/components/Rulers.jsx`:**
  - draws the top and left rulers aligned to the canvas rect (measured
    against the stage on scroll, resize and zoom);
  - a pointerdown on a ruler starts a new guide drag.
- **Guides** are rendered inside the surface as `.vb-guide` lines at
  board %, draggable unless locked. Dropped back over the ruler, a guide
  is removed.
- **View menu items** as in Decision 4.
- **Browser check:**
  - drag a guide from the top ruler to about 30%;
  - drag an element near it and see it snap (x equals the guide);
  - drag the guide back to the ruler: it's gone;
  - reload: the guides persist;
  - Lock stops dragging; Clear removes all.

### Task 5: Export PNG
- `npm install html-to-image@1.11.11`.
- **`src/lib/exportBoard.js`:**
  - `exportFileName(date)` returns `board-YYYY-MM-DD.png`, tested first;
  - `exportBoardPng()` creates the hidden iframe at 1920×1080, waits for
    `load`, `document.fonts.ready` and every `img` to decode, then runs
    `toPng(iframe.contentDocument.body, { width: 1920, height: 1080, pixelRatio: 1, cacheBust: true })`.
    - It counts image load errors and returns `{ dataUrl, missing }`.
    - It always removes the iframe.
- **`VisualBoard.jsx`:** `?export=1` hides the "Draft preview" badge.
- **The Export PNG button** shows `Exporting…` while it works, then
  downloads. If `missing > 0`, it shows the setup toast.
- **`cors.json`** at the repo root: GET from the hosting origin and
  localhost.
- **Browser check:** export runs and a PNG Blob of 1920×1080 is produced.
  It probably reports missing Storage photos until CORS is set: check that
  the toast appears.

### Task 6: Final
- All tests and the build pass; CLAUDE.md is updated.
- A final review on the most capable model, then one fix pass.
- Hand the user the `gsutil` command.
