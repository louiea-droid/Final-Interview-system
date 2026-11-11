# Left Panel Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Visual Board editor's left side (rail and panel) wider and foldable, with a title on every tab, and put each tab to real use.

**Architecture:** All the UI lives in `src/pages/AdminVisualBoard.jsx` (the rail is around line 1857), and the CSS lives in `src/styles/globals.css` (`.vb-layout` around line 4331, the rail and panel around line 4730). The decisions with logic go into small, tested `src/lib` modules: fold state, text presets, layer thumbnails, the layer tree and layer names. The JSX only wires them up.

**Tech Stack:** React (JSX), lucide-react, Firebase Storage (`list`, `getMetadata`, `getDownloadURL`), `node:assert` tests.

**Spec:** there is no separate spec doc. The agreed design is in two places, which together are the authority:
- the section "Left side of the editor: rework" in `CLAUDE.md`;
- the mockup the user approved, `.superpowers/brainstorm/2282-1794322625/content/left-panel.html`.

## Global Constraints

- **Sizes:** the panel is about 240 px wide and the rail about 52 px.
- **Folding:**
  - The panel folds away with a « button by its title, or by clicking the active rail tab.
  - Clicking » (shown when folded) or any tab opens it again.
  - The fold state is remembered in localStorage under `vb-panel-folded`. Every read and write is wrapped in try/catch.
- **Titles:** every tab has a title.
- **Layers:**
  - each row reads: thumbnail, then the name, starting at the left edge;
  - the eye and lock show on hover, or when set;
  - hidden rows are dimmed;
  - double-clicking a name renames it (stored on the element);
  - grouped items sit under a folding group row (▾/▸);
  - Shift or Ctrl-click selects several.
- **Text presets** are click-to-add: Heading (gold), Subheading, Body, Bullet list, Script.
- **Uploads:** a drop zone, plus recent photos that can be reused without a new upload.
- **Elements:** a 3-column grid, with "Shapes" then "Lines" (the dividers).
- **Standing rules:**
  - Never commit; the user commits.
  - Never click Publish.
  - StrictMode is on: never save or close from an unmount cleanup.
  - Copy is in sentence case.
- **Checks:** tests are `node src/lib/<name>.test.js`; run the full suite and `npm run build` at the end.

## Review Focus

1. **Renamed names survive a save/reload round trip.** Every normaliser in `boardLayout.js` that rebuilds an element must keep `name`, or the rename silently disappears on reload.
2. **A group whose members aren't next to each other in `layerOrder`** shows once, at its frontmost member, and every member appears exactly once.
3. **Folding while fullscreen or in Focus mode:** the fullscreen grid rule (`.vb-layout:fullscreen`, around line 5105) must also respect the fold, and Focus mode still hides the column.
4. **Recent photos when Storage listing fails or the folder is empty:** the panel shows a plain line, never an error toast and never a crash.
5. **Shift or Ctrl-clicking a layer row** must toggle it in the multi-selection exactly as a Shift-click on the canvas does (the same helper), including folding in the current single selection.

---

### Task 1: Panel shell (width, titles, fold)

**Files:**
- Create: `src/lib/panelFold.js`, `src/lib/panelFold.test.js`
- Modify: `src/pages/AdminVisualBoard.jsx` (the rail and panel, around lines 251 and 1857)
- Modify: `src/styles/globals.css` (`.vb-layout` columns, `.vb-rail-button`, `.vb-panel`, and the fullscreen grid)

**Interfaces:**
- Produces:
  - `clickTab(state, tabId) -> { active, folded }`;
  - `loadFolded(storage) -> boolean`;
  - `saveFolded(folded, storage) -> void`;
  - the `PanelHead({ title, count?, onFold })` component, defined inline in AdminVisualBoard.jsx.

- [ ] **Step 1: Write `panelFold.test.js`**

```js
assert.deepEqual(clickTab({ active: 'text', folded: false }, 'text'), { active: 'text', folded: true });   // active tab folds
assert.deepEqual(clickTab({ active: 'text', folded: true }, 'text'), { active: 'text', folded: false });   // and opens again
assert.deepEqual(clickTab({ active: 'text', folded: true }, 'layers'), { active: 'layers', folded: false }); // another tab opens it
assert.deepEqual(clickTab({ active: 'text', folded: false }, 'layers'), { active: 'layers', folded: false });
const store = new Map(); const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
assert.equal(loadFolded(storage), false);
saveFolded(true, storage); assert.equal(store.get('vb-panel-folded'), '1'); assert.equal(loadFolded(storage), true);
const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
assert.equal(loadFolded(broken), false); saveFolded(true, broken); // no throw
```

- [ ] **Step 2:** Run it. Expected: it fails because the module isn't found.
- [ ] **Step 3: Implement `panelFold.js`** with the key `vb-panel-folded` and values `'1'`/`'0'`.
- [ ] **Step 4:** Run it. Expected: `panelFold: all checks passed`.
- [ ] **Step 5: Wire it into the editor.**
  - **State:** add `panelFolded` (initialised from `loadFolded(window.localStorage)` and saved in an effect). The rail buttons call `clickTab`.
  - **Panel header:** `.vb-panel` starts with `PanelHead`, which shows the tab label (and a count on Layers) and a « button (`aria-label="Fold panel"`, lucide `ChevronsLeft`).
  - **When folded:** the panel isn't rendered. The rail ends with a » button (`aria-label="Open panel"`, `ChevronsRight`).
  - **Classes:** `.vb-layout` gets the class `panel-folded`.
- [ ] **Step 6: CSS.**
  - Columns: `.vb-layout` becomes `302px minmax(0,1fr) 250px`, and `.vb-layout.panel-folded` becomes `52px minmax(0,1fr) 250px`.
  - Fullscreen: the same pair with the 260px right column.
  - Rail buttons are 52 px wide, and `.vb-panel` is 240 px.
  - The light-mode overrides cover the new header.
- [ ] **Step 7: Browser check.**
  - Fold and open with «, », the active tab and another tab, and check that a reload remembers the state.
  - Check Fullscreen and Focus mode.
  - Expected: when folded, the canvas grows by about 240 px.

### Task 2: Elements grid and Text presets

**Files:**
- Create: `src/lib/textPresets.js`, `src/lib/textPresets.test.js`
- Modify: `src/lib/useBoardLayoutEditor.js` (`addText`, around line 1039)
- Modify: `AdminVisualBoard.jsx` (the elements and text panels)
- Modify: `globals.css` (`.vb-shape-grid` to 3 columns, and a new `.vb-text-preset`)

**Interfaces:**
- Consumes: `DEFAULT_HEADING_STYLE`, `DEFAULT_CLOSING_STYLE`, `DEFAULT_EXTRA_TEXT_STYLE`, `FONT_STACKS`, `solidFill`, `BOARD_GOLD_FILL`, `MIN_TEXT_SIZE` and `MAX_TEXT_SIZE`, all from `textStyle.js`.
- Produces:
  - `TEXT_PRESETS`: an array of `{ id, label, text, fontSize, bulletList, style }`, with the ids `heading`, `subheading`, `body`, `bullets` and `script`;
  - `addText(preset?)`: with no argument it behaves exactly as today; with a preset it uses the preset's `text`, `fontSize`, `bulletList` and `style`.

- [ ] **Step 1: Write the test.**
  - There are 5 presets, in the order above, and each has non-empty text.
  - Each `fontSize` is between `MIN_TEXT_SIZE` and `MAX_TEXT_SIZE`.
  - Each `FONT_STACKS[style.fontFamily]` exists.
  - `heading.style.fill` deep-equals `BOARD_GOLD_FILL`.
  - `bullets.bulletList === true` and its text has 2 lines.
  - `script.style.fontFamily === 'styleformal'`.
  - Every other preset has `bulletList === false`.
- [ ] **Step 2:** Run it. Expected: it fails because the module isn't found.
- [ ] **Step 3: Implement the presets.**

  | Preset | Style | Size | Text |
  |---|---|---|---|
  | Heading | `DEFAULT_HEADING_STYLE` | 5 | "Heading" |
  | Subheading | `DEFAULT_EXTRA_TEXT_STYLE`, weight 700, fill `solidFill('#f2f2f2')` | 3.4 | "Subheading" |
  | Body | inter, weight 400, lineHeight 1.4, shadow 'soft', fill `solidFill('#e6e6e6')` | 2 | "Body text for details and notes" |
  | Bullet list | the Body style | 2 | "First point\nSecond point" |
  | Script | `DEFAULT_CLOSING_STYLE` | 4.4 | "Best of Luck!" |

- [ ] **Step 4:** Run it. Expected: `textPresets: all checks passed`.
- [ ] **Step 5: Wire the presets in.**
  - `addText(preset)` copies the style (`{ ...preset.style }`).
  - The Text panel renders one `.vb-text-preset` button per preset, each previewed in its own font, weight and colour (use `FONT_STACKS`, and the fill's colour or gold for the gold gradient). Clicking one calls `select('text', editor.addText(preset))`.
  - The panel ends with the hint "Click a style to add it to the board."
- [ ] **Step 6: Elements panel.**
  - Order: the "Shapes" label and grid first, then "Lines" (the two dividers).
  - `.vb-shape-grid` uses `repeat(3, 1fr)`.
- [ ] **Step 7: Browser check.** Each preset adds the right text and can be edited. Undo removes it in one step.

### Task 3: Uploads drop zone and recent photos

**Files:**
- Create: `src/lib/recentPhotos.js` (a pure helper) and `src/lib/recentPhotos.test.js`
- Modify: `src/lib/useBoardLayoutEditor.js`, to export `listRecentPhotos(limit)`, which uses `IMAGE_STORAGE_FOLDER` (around line 43)
- Modify: the uploads panel in `AdminVisualBoard.jsx`, and `globals.css` (`.vb-upload-drop`, `.vb-recent-grid`)

**Interfaces:**
- Consumes:
  - `pickImageFiles` (imageFiles.js);
  - `addPhotoAndSelect` and `addVideoAndSelect` (already in the page);
  - `editor.addImageFromUrl(url)`;
  - `dropPhotosOnCanvas`'s photo handling, as the pattern.
- Produces:
  - `newestFirst(items, limit) -> items` (by `timeCreated`, an ISO string, newest first; missing times go last);
  - `listRecentPhotos(limit = 12) -> Promise<string[]>` (download URLs).

- [ ] **Step 1: Write the test.**

```js
const a = { url: 'a', timeCreated: '2026-11-01T00:00:00Z' }, b = { url: 'b', timeCreated: '2026-11-09T00:00:00Z' }, c = { url: 'c' };
assert.deepEqual(newestFirst([a, c, b], 12).map((x) => x.url), ['b', 'a', 'c']);
assert.deepEqual(newestFirst([a, b, c], 2).map((x) => x.url), ['b', 'a']);
assert.deepEqual(newestFirst([], 12), []);
```

- [ ] **Step 2:** Run it. Expected: it fails.
- [ ] **Step 3: Implement `newestFirst`** and then `listRecentPhotos`:
  - `listAll(ref(storage, IMAGE_STORAGE_FOLDER))`;
  - `getMetadata` on every item, then `newestFirst`;
  - `getDownloadURL` on only the kept items.
  - `ponytail:` listing gets the metadata of every file, so if the folder grows into the hundreds, keep a recents doc instead.
- [ ] **Step 4:** Run it. Expected: it passes.
- [ ] **Step 5: The panel.**
  - **Drop zone** (`.vb-upload-drop`): a `<label>` for a single hidden input that accepts `image/png,image/jpeg,image/webp,video/mp4,video/webm,video/ogg` with `multiple`.
    - Text: "Drop photos or videos here" / "or choose files".
    - On drop or choose: photos go through `pickImageFiles` and are added one after another. Video files go to `addVideoAndSelect`. Anything else shows the toast "Only photos (PNG, JPG, WEBP) or videos (MP4, WEBM, OGG)".
    - While a drag is over it, the zone gets the class `is-over`.
  - **Recent photos:** "Recent photos" is loaded the first time the Uploads tab opens, and again after an upload finishes.
    - The list shows in a 3-column grid of square thumbnails (`object-fit: cover`). Clicking one calls `select('image', editor.addImageFromUrl(url))`.
    - While loading, the grid shows "Loading…".
    - If the list is empty: "Photos you upload show up here."
    - If the listing fails: "Recent photos couldn't be loaded." No toast.
- [ ] **Step 6: Browser check.**
  - Dropping a non-file onto the zone does nothing.
  - The recent grid shows the bucket's photos (reading is public).
  - Clicking a thumbnail adds the photo without an upload: no "Uploading photo..." toast.

### Task 4: Layer rows (thumbnail, name first, status, dimmed)

**Files:**
- Create: `src/lib/layerThumbs.js`, `src/lib/layerThumbs.test.js`
- Modify: the Layers panel in `AdminVisualBoard.jsx` (around lines 1964–2097) and the `.vb-layer-*` CSS

**Interfaces:**
- Consumes: the element objects from `layerInfo(entry)`; `FONT_STACKS`.
- Produces: `layerThumb(kind, element) -> { type: 'photo', url } | { type: 'text', font, color } | { type: 'colour', colour } | { type: 'icon' }`.

- [ ] **Step 1: Write the test.**

| Input | Expected |
|---|---|
| a text `{style:{fontFamily:'styleformal', fill:{type:'solid', color:'#ffffff'}}}` | `{type:'text', font: FONT_STACKS.styleformal, color:'#ffffff'}` |
| a gradient fill | the first stop's colour |
| an image `{url:'https://x/a.jpg'}` | `{type:'photo', url:'https://x/a.jpg'}` (an svg data URL is a photo too) |
| a video | `{type:'icon'}` |
| a shape with `fill:{type:'solid', color:'#ff0000'}` | `{type:'colour', colour:'#ff0000'}` |
| a shape with photos (`photos:[{url:'p'}]`) | `{type:'photo', url:'p'}` |
| logo, candidates, announcements, divider | `{type:'icon'}`, except a logo with `url`, which is a photo |

Before writing the shape cases, read the real fill shape in `shapeStyle.js` and use it.

- [ ] **Step 2:** Run it. Expected: it fails.
- [ ] **Step 3: Implement `layerThumb`.**
- [ ] **Step 4:** Run it. Expected: it passes.
- [ ] **Step 5: Restyle each row.**
  - **Order:** `.vb-layer-thumb` (24 px: a photo `<img>`, the "Aa" text in its font and colour, a colour square, or the existing kind `Icon`), then the name button (flex 1, left-aligned, with an ellipsis), then a right-hand cluster: eye, lock, the move arrows and delete.
  - **Visibility:** the eye and lock show only while the row is hovered or focused, or when set (`is-set`). The move and delete group stays hover-only, as now.
  - **Hidden rows** get `.is-hidden` (opacity 0.45).
  - **Drag-reorder** is unchanged.
- [ ] **Step 6: Browser check.**
  - Thumbnails match the board, and a hidden row is dimmed.
  - Clicking a name never toggles the eye: no layout shift on hover (the fix from the earlier redesign must hold).

### Task 5: Rename layers

**Files:**
- Modify: `src/lib/layerNames.js` (and its test, if one exists; otherwise create `layerNames.test.js`)
- Modify: `src/lib/boardLayout.js` (the text, item, divider and shape normalisers: every place that spreads `groupId`, around lines 187 and 255, plus the dividers and shapes)
- Modify: `AdminVisualBoard.jsx` (`layerInfo` and the Layers row)

**Interfaces:**
- Produces:
  - `cleanLayerName(value) -> string | null` (trimmed, inner whitespace collapsed, at most 40 characters; empty or not a string gives null);
  - an optional element field `name`.

- [ ] **Step 1: Test.**
  - `cleanLayerName('  My  photo ')` → `'My photo'`.
  - `cleanLayerName('')` → `null`.
  - `cleanLayerName(null)` → `null`.
  - A 50-character string → 40 characters.
  - `cleanLayerName('   ')` → `null`.
- [ ] **Step 2:** Run it. Expected: it fails.
- [ ] **Step 3: Implement it.** In each normaliser, add `...(cleanLayerName(x.name) ? { name: cleanLayerName(x.name) } : {})` next to the `groupId` spread.
- [ ] **Step 4:** Run it. Expected: it passes.
- [ ] **Step 5: The UI.**
  - **Label:** `layerInfo` uses `element.name ?? <computed label>` for kinds in `DELETABLE_KINDS`.
  - **Editing:** double-clicking the name swaps in an `<input>` (autofocused, with its text selected). Enter or blur saves through `editor.updateElement(kind, id, { name: cleanLayerName(value) ?? undefined })`, which is one undo step. Esc cancels.
  - **Clearing:** an empty name brings back the automatic name.
  - **Keys:** the input stops key propagation, so editor shortcuts don't fire while typing.
- [ ] **Step 6: Browser check.** Rename a photo, reload the editor (the draft is the local layout, so check through the editor state round trip and `normalizeLayout`), and check that the name holds. Clear the name, and check that the automatic name returns.

### Task 6: Groups in Layers and multi-select

**Files:**
- Create: `src/lib/layerTree.js`, `src/lib/layerTree.test.js`
- Modify: the Layers panel in `AdminVisualBoard.jsx`, and `handlePointerDown` (around line 725, to extract the toggle)

**Interfaces:**
- Consumes: `layout.layerOrder` reversed (front to back), and `findElement(layout, kind, id)?.groupId`.
- Produces:
  - `layerTree(entries, groupOf) -> Array<{ type: 'item', entry } | { type: 'group', groupId, entries }>`;
  - `toggleMulti(kind, id)` in the page, used by both the canvas Shift-click and the layer rows.

- [ ] **Step 1: Test.**
  - Entries in the order `[t1(g1), p1, t2(g1), s1]` → `[group g1 [t1, t2], item p1, item s1]`. The group sits at its frontmost member, and each member appears once.
  - A group with one member left is shown as a plain item.
  - With no groups, the output is all items, in order.
  - An empty list gives `[]`.
- [ ] **Step 2:** Run it. Expected: it fails.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4:** Run it. Expected: it passes.
- [ ] **Step 5: The UI.**
  - **Group row:** ▾/▸ toggles the fold (component state keyed by `groupId`; groups start open). The label is "Group · n items". Clicking the label multi-selects every member.
  - **Members** are indented by 18 px.
  - **Rows:**
    - Shift or Ctrl/Cmd-click on a row calls `toggleMulti`, and a plain click calls `select`.
    - A row is highlighted when `isSelected` or `isMultiSelected`.
  - **Drag:** dragging a row still reorders that one element. Group rows aren't draggable.
- [ ] **Step 6: Browser check.**
  - Group two items (Ctrl+G), and check that they appear under one folding row.
  - Ctrl-click two rows, and check that the floating bar shows the multi-selection.
  - Shift-click on the canvas still works.

### Finish

- [ ] **Run every test:** `for f in src/lib/*.test.js; do node "$f" || break; done`, then `npm run build`. Expected: all pass, and the build succeeds.
- [ ] **Final review** by a fresh reviewer on the most capable model, against this plan and the Review Focus list. Then one fix pass for any Critical or Important findings, with minors recorded in the ledger.
- [ ] **Update CLAUDE.md:** mark the left-panel rework as BUILT (uncommitted). Don't commit.
