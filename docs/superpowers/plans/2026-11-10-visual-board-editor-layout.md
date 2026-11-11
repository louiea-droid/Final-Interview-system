# Visual Board editor layout: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganise the Visual Board editor:
- one slim bar on top;
- a bigger canvas;
- layers named after their content;
- Layers as the only list;
- settings in folding sections;
- grouped board actions;
- a floating action bar.

The board itself doesn't change.

**Architecture:**
- This is editor-only UI work in `src/pages/AdminVisualBoard.jsx`, plus a
  few small new components and pure helpers.
- Decisions that can be tested live in pure `src/lib/*.js` modules, each
  with a node `assert` test: layer names, which sections start open, the
  shortcut list, and where the floating bar goes. The JSX only wires them
  up.
- No layout-model, `/visual` or Firestore changes.

**Tech stack:** React (plain JSX), Vite, hand-written CSS in
`src/styles/globals.css` and `src/styles/admin-shell.css`, and
`lucide-react` icons (already installed).

**Spec:**
`docs/superpowers/specs/2026-11-10-visual-board-editor-layout-design.md`.
Read it; this plan argues from it.

## Global constraints

- No new dependencies. Plain JSX, no TypeScript.
- **Don't commit.** The user commits. Every "Commit" step below means
  leaving the work uncommitted and noting it in the task report.
- The saved layout, `VisualBoard.jsx` (`/visual`) and the live board must
  not change.
- **StrictMode:** effect cleanups run twice in dev. Never save or close
  anything from an unmount cleanup.
- All Batch 1 shortcuts keep working: Ctrl+A/X/C/V/D/G, Ctrl+[ ], zoom
  keys, Ctrl+scroll, Space-drag, Enter, Esc, arrows and Delete.
- Every menu and the floating bar must show in Fullscreen. Render them
  through the page's existing `overlayIn(node)` helper, which portals
  into `.vb-layout` while `isFullscreen` is on.
- **Tests:** `node src/lib/<name>.test.js`, using `node:assert/strict`,
  with the same layout as `src/lib/boardGeometry.test.js`. A test
  imports only pure modules; nothing that imports Firebase.
- **Browser checks:**
  - Sign in with a throwaway Firebase account (REST `accounts:signUp`, API
    key in `.env.local`). Its saves are refused, which keeps the real
    draft safe.
  - Delete the account afterwards. Never click Publish.
  - Headless Chromium refuses real fullscreen. Fake it:
    `Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => document.querySelector('.vb-layout') })`,
    then dispatch `fullscreenchange`.

## Review focus

The spec implies these cases, but no task's main tests cover them. Each
line names the task that adds its check.

1. **Esc with a bar menu open** closes only the menu, and the selection
   stays. The page's window keydown handler deselects on Esc, so the menu
   must stop the event (Task 2).
2. **Enter or Space on a focused menu item** runs the item, not the canvas
   shortcut. `isControlTarget` covers `[role="menuitem"]` but not
   `menuitemcheckbox` (Task 2).
3. **The floating bar stays inside the visible stage.** It flips below
   when there's no room above. It hides when the selection is scrolled
   out of view at a high zoom (Task 7, `placeFloatingBar` tests).
4. **A locked selection:** the floating bar enables only Lock/Unlock and
   "⋯" (Task 7).
5. **Deleting from a Layers row respects locks.** A locked row's delete
   shows the "That element is locked." toast, as `removeSelection` does.
   The logo and the boxes are hidden, not deleted (Task 4).

---

### Task 1: Slim admin header on every page

**Files:**
- Modify: `src/styles/admin-shell.css`:
  - `--header-height` (L11);
  - `.admin-header` (L135-159);
  - `.header-title` (L198);
  - `.timezone-*` (L223-270);
  - the responsive block (L343-391).

**Interfaces:** none.

- [ ] **Step 1: Restyle the header.**
  - Height: `--header-height` becomes `34px`, and `.admin-header`
    padding shrinks to match (about `4px 23px`).
  - `.header-title`: `12px`, weight 600, colour `var(--text-muted)` (or
    whichever dim token the file already uses).
  - Labels: `.timezone-label` becomes `9px`.
  - Values: `.timezone-value` becomes `12px`.
  - Divider: `.timezone-divider` becomes `20px` tall.
  - The older `.timezone-*` rules in `globals.css` (L280-300) are
    overridden; leave them alone.
- [ ] **Step 2: Browser check.**
  - At 1600×900, screenshot Dashboard, Records, Announcements, Settings
    and Visual Board.
  - Expected: the header is about 34px tall on each, nothing is clipped,
    and both clocks are readable.
  - At 400px wide, the mobile menu button still shows and nothing
    overflows.
- [ ] **Step 3: Commit:** none (see Global constraints).

### Task 2: One editor bar with Zoom, View, Templates and ⋯ menus

**Files:**
- Create: `src/components/BarMenu.jsx`, a dropdown used by all four menus.
- Modify: `src/pages/AdminVisualBoard.jsx`:
  - the empty `dashboard-header` (around L1559);
  - the card header (L1566-1603);
  - `.vb-toolbar` (L1605-1733);
  - `.vb-canvas-hint` (around L2253);
  - `isControlTarget` (around L230).
- Modify: `src/styles/globals.css`:
  - `.vb-toolbar*` rules;
  - new `.vb-bar-menu*` rules;
  - `.vb-publish-dot`.
- Modify: `src/lib/useBoardLayoutEditor.js`: the `resetLayout` toast
  text.

**Interfaces:**
- Produces:
  ```
  <BarMenu label={node} title={string} items={Item[]} />
  ```
  - Each item is one of:
    - `{ type: 'action', label, onSelect, disabled? }`
    - `{ type: 'check', label, checked, onToggle, hint? }`
    - `{ type: 'group', label }` (a small heading)
    - `{ type: 'separator' }`
  - Action items close the menu. Check items stay open.
  - Esc and a click outside close it. Esc calls `event.stopPropagation()`
    so the page's window keydown handler doesn't deselect.
  - The trigger has `aria-haspopup="menu"` and `aria-expanded`. The list
    has `role="menu"`; items have `role="menuitem"` or
    `role="menuitemcheckbox"` with `aria-checked`.
  - The list renders with `position: fixed`, under the trigger, and is
    clamped inside the window. It's wrapped by a `portal` prop the page
    passes as `overlayIn`.

- [ ] **Step 1: Write `BarMenu.jsx`.** Follow `CanvasContextMenu.jsx`:
  - clamp with `useLayoutEffect`;
  - close on outside `pointerdown` in capture, ignoring presses inside
    `.vb-bar-menu`;
  - close on window `resize`;
  - signature `BarMenu({ label, title, items, portal = (n) => n })`.
- [ ] **Step 2: Extend `isControlTarget`** so its selector also matches
  `[role="menuitemcheckbox"]`.
- [ ] **Step 3: Remove** the empty `<header className="dashboard-header">`,
  the card header block (title, dirty line, Reset/Preview/Publish) and the
  `.vb-canvas-hint` paragraph. Keep the hint's text: Task 6 reuses it.
- [ ] **Step 4: Rebuild the toolbar as one bar.** Left to right:
  - **Undo, Redo:** unchanged.
  - **Box select:** an icon-only toggle with `aria-pressed`,
    `title="Box select"` and the `BoxSelect` icon.
  - **Zoom menu:** label `${zoom}%`. Items, in order:
    - Zoom in, `zoomBy(10)`;
    - Zoom out, `zoomBy(-10)`;
    - separator;
    - "Fit (100%)", then 50%, 75%, 125% and 150%, each `setZoom(n)`.
  - **View menu:**
    - group "Show": check "Grid (snap to it)", `showGrid`;
    - group "Snapping": check "Snap to elements", `snapEnabled`, with
      `hint: 'hold Ctrl to skip'`;
    - group "Screen": check "Focus mode", `focusMode` /
      `toggleFocusMode`; check "Fullscreen", `isFullscreen` /
      `toggleFullscreen`.
  - spacer.
  - **Templates menu:** "Save as template…" calls
    `setTemplateModal('save')`. "Apply a template…" calls
    `setTemplateModal('apply')`.
  - **⋯ menu:** "Reset board to default", `editor.resetLayout`.
  - **Preview:** the existing link.
  - **Publish:**
    - the existing `publish()` and disabled rule;
    - a `<span className="vb-publish-dot">` while `isDirty`;
    - `aria-label` and `title` read "Publish (unpublished changes)" when
      dirty, otherwise "Up to date with the live board";
    - while publishing, it still shows "Publishing…".

  Remove the Fit button and the zoom range slider. The zoom keys and
  Ctrl+scroll stay as they are.
- [ ] **Step 5: Change the reset toast** in `resetLayout`
  (`useBoardLayoutEditor.js` L1204-1219) to exactly
  `Layout reset to the default. Ctrl+Z to undo.`
- [ ] **Step 6: Browser check.**
  - Every item in every menu works.
  - Esc with View open closes only the menu, and a selected element stays
    selected (Review focus 1).
  - Focus a View check item and press Space: it toggles, and the stage
    doesn't get `is-panning` (Review focus 2).
  - With fullscreen faked, open View: the list is inside `.vb-layout`.
  - The canvas is visibly taller than before at 1600×900. Compare the
    `.vb-canvas-stage` height with the old one.
- [ ] **Step 7: Run all unit tests and `npm run build`.** Expected: all
  pass and the build succeeds.
- [ ] **Step 8: Commit:** none.

### Task 3: Layer names from content

**Files:**
- Create: `src/lib/layerNames.js`.
- Create: `src/lib/layerNames.test.js`.
- Modify: `src/pages/AdminVisualBoard.jsx`: `labelShapes` (L183-191) and
  `layerInfo` (L1126-1175).

**Interfaces:**
- Produces:
  - `textLayerName(text: string, index: number): string`. The index
    starts at 0.
  - `shapeLayerName(kindLabel: string, ordinal: number, photoCount: number, isFrame: boolean): string`.

- [ ] **Step 1: Write the failing test** `src/lib/layerNames.test.js`:
  ```js
  assert.equal(textLayerName('Final Interview Applicants', 0), 'Final Interview Applicants');
  assert.equal(textLayerName('  Our\n  Brands  ', 1), 'Our');            // first line only, trimmed
  assert.equal(textLayerName('Best   of\tLuck!', 2), 'Best of Luck!');   // whitespace collapsed
  assert.equal(textLayerName('', 3), 'Text 4');
  assert.equal(textLayerName('   \n  ', 4), 'Text 5');
  assert.equal(textLayerName('A'.repeat(40), 0), 'A'.repeat(28) + '…');
  assert.equal(textLayerName('A'.repeat(28), 0), 'A'.repeat(28));
  assert.equal(shapeLayerName('Photo frame', 1, 2, true), 'Photo frame · 2 photos');
  assert.equal(shapeLayerName('Photo frame', 2, 1, true), 'Photo frame 2');
  assert.equal(shapeLayerName('Photo frame', 3, 0, true), 'Photo frame 3');
  assert.equal(shapeLayerName('Rectangle', 1, 0, false), 'Rectangle 1');
  ```
- [ ] **Step 2: Run** `node src/lib/layerNames.test.js`. Expected: FAIL
  (the module doesn't exist).
- [ ] **Step 3: Implement both functions.** The name comes from the first
  non-blank line, with runs of whitespace collapsed to one space. It's cut
  to 28 characters plus "…" only when longer than 28.
- [ ] **Step 4: Wire the names in.**
  - `labelShapes` returns
    `shapeLayerName(shapeLabel(shape), count, shape.photos?.length ?? 0, isFrame(shape))`.
  - The `layerInfo` text branch uses
    `textLayerName(layout.texts[index].text, index)`.
- [ ] **Step 5: Run the test.** Expected: PASS. In the browser, the Layers
  tab shows "Final Interview Applicants" for the headline.
- [ ] **Step 6: Commit:** none.

### Task 4: Layers is the only list

**Files:**
- Modify: `src/pages/AdminVisualBoard.jsx`:
  - `RAIL_TABS` (L126-132);
  - `PANEL_BY_KIND` (L149-156) and its use in `select()` (L660);
  - the panels at L1769-2176.
- Modify: `src/styles/globals.css` for a `.vb-layer-delete` button, if
  needed.

**Interfaces:**
- Consumes: `removeMany` through the page's existing `removeSelection`
  path; Task 3's labels.

- [ ] **Step 1: Remove the duplicate lists.**
  - Delete the "On the board" lists from the Elements and Text panels.
  - Delete "Uploaded photos" and "Uploaded videos" from Uploads.
  - Keep every add action.
- [ ] **Step 2: Remove the Brand tab.**
  - Take the 'brand' entry out of `RAIL_TABS` and delete the
    `activePanel === 'brand'` panel.
  - Delete `PANEL_BY_KIND` and the line in `select()` that uses it.
    Selecting no longer changes `activePanel`.
  - Remove imports that become unused, such as `Crown`.
- [ ] **Step 3: Add a Delete button to each Layers row,** after the
  order buttons.
  - Icon: `Trash2`. `aria-label`: `Delete ${info.label}`.
  - It shows only for kinds in `text | image | video | shape | divider`.
  - Clicking it calls the same function the Delete key calls, with
    `[{ kind, id }]`, so the locked toast and the hide-for-one-of-a-kind
    rules apply. If that function only reads the current selection,
    extract a `removeEntries(selection)` it calls, and call that.
- [ ] **Step 4: Highlight the selected Layers row.**
  - While `activePanel === 'layers'`, the selected row gets the existing
    selected class.
  - An effect on `[selected, activePanel]` calls
    `scrollIntoView({ block: 'nearest' })` on it. Find the row with
    `data-layer-key` set to `${kind}:${id ?? ''}`.
- [ ] **Step 5: Browser check.**
  - Rail tabs: Elements, Text, Uploads, Layers.
  - Adding three shapes in a row keeps the Elements tab open.
  - Deleting a locked text from its Layers row shows "That element is
    locked." and keeps the text (Review focus 5).
  - The Logo row has no delete button.
- [ ] **Step 6: Run all unit tests and `npm run build`.** Expected: pass.
- [ ] **Step 7: Commit:** none.

### Task 5: Folding sections in the right panel

**Files:**
- Create: `src/lib/propertySections.js`.
- Create: `src/lib/propertySections.test.js`.
- Create: `src/components/PropertySection.jsx`.
- Modify: `src/pages/AdminVisualBoard.jsx`: the properties panel,
  L2319-2543 (boxes) and L2549-3518 (elements).
- Modify: `src/styles/globals.css` for `.vb-section*` rules.

**Interfaces:**
- Produces:
  - `SECTION_NAMES = ['Font', 'Spacing', 'Fill', 'Border & effects', 'Animation', 'Position & size', 'Carousel', 'Candidate cards']`
  - `defaultOpenSections(kind: string): string[]`
  - `isSectionOpen(name: string, kind: string, overrides: Record<string, boolean>): boolean`.
    The override wins when present; otherwise the kind's default applies.
  - `<PropertySection name open onToggle>{children}</PropertySection>`.
    The header is a `<button aria-expanded>` showing the name and a
    chevron. Children render only while open.

- [ ] **Step 1: Write the failing test** `src/lib/propertySections.test.js`:
  ```js
  assert.deepEqual(defaultOpenSections('text'), ['Font', 'Fill']);
  assert.deepEqual(defaultOpenSections('shape'), ['Fill', 'Position & size']);
  for (const k of ['logo', 'image', 'video', 'divider', 'candidates', 'announcements'])
    assert.deepEqual(defaultOpenSections(k), ['Position & size']);
  assert.equal(isSectionOpen('Fill', 'text', {}), true);
  assert.equal(isSectionOpen('Animation', 'text', {}), false);
  assert.equal(isSectionOpen('Animation', 'image', { Animation: true }), true);  // opened once, stays open
  assert.equal(isSectionOpen('Fill', 'shape', { Fill: false }), false);          // closed once, stays closed
  ```
- [ ] **Step 2: Run the test.** Expected: FAIL.
- [ ] **Step 3: Implement `propertySections.js`.** Then write
  `PropertySection.jsx`.
- [ ] **Step 4: Reorganise the single-element panel.**
  - Page state:
    `const [sectionOverrides, setSectionOverrides] = useState({})`.
  - `onToggle` sets `{ ...prev, [name]: !open }`.
  - **Fixed head:** title, "Visible on board", the group note with
    Ungroup, then the content control (text textarea and bullets, logo
    image, thumbnail, shape picker).
  - **Fixed foot:** Duplicate and Remove.
  - In between, move the existing controls, unchanged, into sections in
    this order:
    - **Font:** Font, Weight/Case, Size (text range plus NumberField),
      Alignment with Italic/Underline.
    - **Spacing:** Letter spacing, Line height, Box width %.
    - **Fill:** FillEditor, Photo/Video position, Carousel photos.
    - **Border & effects:** Outline (text) or Border (shape, image,
      video), Shadow (text), Element opacity.
    - **Animation:** the Animation block.
    - **Position & size:**
      - Shape: W/H, Corner, Rotate.
      - Divider: Direction, Length, Thickness.
      - Logo, image and video: Size.
      - Everyone: Position, or the headline's note.
      - Rotate, for text, logo, image and video.
  - A section renders only if the selected kind has a control in it.
- [ ] **Step 5: Reorganise the box panel** (candidates and
  announcements).
  - Fixed head: title and hint.
  - Sections:
    - **Position & size:** X, Y, W, H.
    - **Carousel:** seconds per card and per row, whichever exist.
    - **Candidate cards:** candidates only.
    - **Border & effects:** opacity.
  - Fixed foot: "Remove from board".
- [ ] **Step 6: Leave the multi-select panel unchanged.**
- [ ] **Step 7: Run the test.** Expected: PASS.
- [ ] **Step 8: Browser check.**
  - Selecting the headline shows Font and Fill open.
  - Open Animation, then select a photo: Animation is open there too.
  - Every control in the old panel can still be found. Check one of each
    kind: text, shape, frame with 2 photos, logo, photo, video, divider,
    candidates, announcements.
- [ ] **Step 9: Run all unit tests and `npm run build`.** Expected: pass.
- [ ] **Step 10: Commit:** none.

### Task 6: The nothing-selected panel

**Files:**
- Create: `src/lib/editorShortcuts.js`.
- Create: `src/lib/editorShortcuts.test.js`.
- Modify: `src/pages/AdminVisualBoard.jsx`: the nothing-selected branch
  (around L2311-2318).

**Interfaces:**
- Consumes: `PropertySection` and `isSectionOpen` from Task 5. The
  section name is `'Keyboard shortcuts'`; it's closed by default because
  it isn't in any kind's defaults. Use the kind `'board'`, which returns
  `[]`. Add that case to `defaultOpenSections` and its test.
- Produces:
  `EDITOR_SHORTCUTS: { keys: string, action: string }[]`.

- [ ] **Step 1: Write the failing test.** It asserts that
  `EDITOR_SHORTCUTS` has these exact `keys` strings, in this order:
  1. `'Ctrl+Z'`
  2. `'Ctrl+Shift+Z / Ctrl+Y'`
  3. `'Ctrl+A'`
  4. `'Ctrl+C / Ctrl+X / Ctrl+V'`
  5. `'Ctrl+D'`
  6. `'Ctrl+G / Ctrl+Shift+G'`
  7. `'Ctrl+] / Ctrl+['`
  8. `'Ctrl+Shift+] / Ctrl+Shift+['`
  9. `'Arrows / Shift+Arrows'`
  10. `'Delete'`
  11. `'Enter'`
  12. `'Esc'`
  13. `'Space + drag'`
  14. `'Ctrl+scroll / Ctrl+= / Ctrl+- / Ctrl+0'`
  15. `'Shift while resizing'`
  16. `'Alt while resizing'`
  17. `'Shift while rotating'`
  18. `'Hold Ctrl while dragging'`

  It also asserts every entry has a non-empty `action`, and that
  `defaultOpenSections('board')` deep-equals `[]`.
- [ ] **Step 2: Run the test.** Expected: FAIL.
- [ ] **Step 3: Write `editorShortcuts.js`.** The matching actions:
  1. Undo
  2. Redo
  3. Select all
  4. Copy / cut / paste
  5. Duplicate
  6. Group / ungroup
  7. Bring forward / send backward
  8. Bring to front / send to back
  9. Nudge (Shift for bigger steps)
  10. Delete
  11. Edit the selected text
  12. Deselect
  13. Pan the canvas
  14. Zoom
  15. Keep proportions
  16. Resize from the centre
  17. Snap to 15°
  18. Skip snapping
- [ ] **Step 4: Build the panel.** Top to bottom:
  1. The hint text moved in Task 2.
  2. Two buttons:
     - "Candidate Board settings" calls `select('candidates')`.
     - "Announcement strip settings" calls `select('announcements')`.
     - Both work even when the box is hidden.
  3. A `PropertySection name="Keyboard shortcuts"` holding a two-column
     list (`<dl>`) of `EDITOR_SHORTCUTS`.
- [ ] **Step 5: Run the test.** Expected: PASS. In the browser, both
  links open their box's settings, and the shortcuts list folds.
- [ ] **Step 6: Commit:** none.

### Task 7: The floating action bar

**Files:**
- Create: `src/lib/floatingBar.js`.
- Create: `src/lib/floatingBar.test.js`.
- Create: `src/components/FloatingSelectionBar.jsx`.
- Modify: `src/lib/useBoardLayoutEditor.js`: `dragWith` gets an
  `interacting` flag, which is exported.
- Modify: `src/pages/AdminVisualBoard.jsx`:
  - remove `<AlignBar … toBoard />` from the panel (L2265-2267);
  - in the multi-select panel, keep its buttons but move its AlignBar
    into the floating bar;
  - render the floating bar.
- Modify: `src/styles/globals.css` for `.vb-floating-bar`.

**Interfaces:**
- Consumes: `editor.measure(kind, id)`, which returns board-%
  `{ left, top, right, bottom }` or `null`; `unionBounds` from
  `boardTransform.js`; `ALIGN_ACTIONS` from `AlignBar.jsx`;
  `overlayIn`.
- Produces:
  - `placeFloatingBar(sel, stage, bar, gap = 8, margin = 4): { left, top, placement: 'above' | 'below' } | null`.
    - `sel` and `stage` are client-px rects `{ left, top, right, bottom }`.
    - `bar` is `{ width, height }`.
    - It returns `null` when `sel` doesn't overlap `stage`.
  - `editor.interacting: boolean`. It's true from a `dragWith` start
    until its pointerup.

- [ ] **Step 1: Write the failing test** `src/lib/floatingBar.test.js`:
  ```js
  const stage = { left: 0, top: 0, right: 1000, bottom: 600 };
  const bar = { width: 200, height: 30 };
  // room above: centred, above with an 8px gap
  assert.deepEqual(placeFloatingBar({ left: 400, top: 200, right: 600, bottom: 300 }, stage, bar),
    { left: 400, top: 162, placement: 'above' });
  // no room above: flips below
  assert.deepEqual(placeFloatingBar({ left: 400, top: 10, right: 600, bottom: 100 }, stage, bar),
    { left: 400, top: 108, placement: 'below' });
  // near the right edge: clamped inside with a 4px margin
  assert.equal(placeFloatingBar({ left: 950, top: 200, right: 1000, bottom: 300 }, stage, bar).left, 796);
  // near the left edge
  assert.equal(placeFloatingBar({ left: 0, top: 200, right: 20, bottom: 300 }, stage, bar).left, 4);
  // fills the whole stage: below would overflow, so it's clamped to the bottom margin
  assert.equal(placeFloatingBar({ left: 0, top: 0, right: 1000, bottom: 600 }, stage, bar).top, 566);
  // scrolled out of view
  assert.equal(placeFloatingBar({ left: 0, top: 700, right: 100, bottom: 800 }, stage, bar), null);
  ```
- [ ] **Step 2: Run the test.** Expected: FAIL.
- [ ] **Step 3: Implement `placeFloatingBar`.**
  - Horizontal: centre on `sel`, then clamp to
    `[stage.left + margin, stage.right - bar.width - margin]`.
  - Vertical: try above, at `sel.top - gap - bar.height`. If that's above
    `stage.top + margin`, place it below at `sel.bottom + gap`, then clamp
    to `stage.bottom - bar.height - margin`.
- [ ] **Step 4: Add `interacting` to the hook.**
  - Add `const [interacting, setInteracting] = useState(false)`.
  - `dragWith` sets it to true when it starts listening and back to false
    in `up()`.
  - Return it from the hook.
- [ ] **Step 5: Write `FloatingSelectionBar.jsx`.**
  - Props:
    `{ rect, locked, multi, canDistribute, onAlign, onDistribute, onDuplicate, onGroup, onToggleLock, onMore }`.
  - It renders `position: fixed` at `rect`.
  - **Single selection:** six align buttons (to the board), Duplicate,
    Lock/Unlock and "⋯".
  - **Multi-selection:** align (to the selection), distribute
    horizontal/vertical (enabled at 3+), Group, Lock/Unlock and "⋯".
  - **When `locked`,** every button except Lock/Unlock and "⋯" is
    `disabled`.
  - Measure the bar's own size with a ref, so the page can place it.
- [ ] **Step 6: Wire the bar into the page.**
  - **Selection bounds:** `unionBounds` over `editor.measure` for each
    `currentSelection()` member. Convert board % to client px with the
    canvas surface's `getBoundingClientRect()`.
  - **Stage rect:** `stageRef.current.getBoundingClientRect()`.
  - **Recompute** on render, and on stage `scroll`, window `resize` and
    zoom changes. A `useState` tick bumped by those listeners is enough.
  - **Hidden** when there's no selection, `editor.interacting`,
    `boxSelectRect`, `editingTextId` is set, or `placeFloatingBar`
    returns `null`.
  - **"⋯"** opens the existing context menu at the bar:
    `setContextMenu({ x, y, onElement: true })`, with the bar's bottom-left
    corner as `x`/`y`.
  - **Render** through `overlayIn`.
  - **Remove** the AlignBar from the top of the properties panel.
- [ ] **Step 7: Run the test.** Expected: PASS.
- [ ] **Step 8: Browser check.**
  - Select the headline: the bar shows above it, or below it if the
    headline is at the top.
  - Drag the headline: the bar hides, then comes back on release.
  - Lock it: only Lock and "⋯" are enabled (Review focus 4).
  - Zoom to 150% and scroll the headline out of view: the bar hides
    (Review focus 3).
  - With fullscreen faked, the bar is inside `.vb-layout`.
- [ ] **Step 9: Run all unit tests and `npm run build`.** Expected: pass.
- [ ] **Step 10: Commit:** none.

### Task 8: Final check and notes

**Files:**
- Modify: `CLAUDE.md`, the "Session of 2026-11-10: editor layout
  redesign" section.

- [ ] **Step 1: Run every test and the build:**
  `for f in src/lib/*.test.js; do node "$f" || echo FAIL $f; done; npm run build`.
  Expected: no FAIL lines, and "built in".
- [ ] **Step 2: Browser smoke check.**
  - Make a full pass at 1600×900 with a throwaway account, then delete
    the account.
  - Add, edit and delete one text, shape and photo.
  - Undo/redo, every bar menu, a template save and apply, Preview, and
    Focus/fake-fullscreen.
  - Confirm `/visual` looks unchanged.
- [ ] **Step 3: Update `CLAUDE.md`:**
  - what was built;
  - anything deferred;
  - that Batch 3 is next, using the slots in the spec.
- [ ] **Step 4: Commit:** none. Report that the work is uncommitted for
  the user to commit.
