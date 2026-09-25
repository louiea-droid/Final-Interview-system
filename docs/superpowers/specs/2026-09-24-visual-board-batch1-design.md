# Visual Board editor — Batch 1 (core editing)

Status: draft for review · 2026-09-24

## Goal

Make the admin Visual Board editor (`/admin/visual-board`) feel like Canva /
Figma for everyday layout work. Success means an admin can line things up,
size and rotate them, edit text and work on several elements at once without
reaching for the side panel's number fields.

Batches 2 (styling) and 3 (workflow extras) are out of scope; they are listed
in `CLAUDE.md`.

## How the editor works today (constraints the design follows)

- Every element is stored by its **centre** as a percentage of the board area
  (`x`, `y`). Positions are clamped to 3–97 while dragging (`clampPercent`).
- Size is stored differently per kind:

  | Kind | Size fields |
  | --- | --- |
  | shape | `width`, `height` (%) |
  | candidates / announcements box | `width`, `height` (%) |
  | logo, image, video | `scale` × a base width; height comes from the media |
  | text | `fontSize`, plus a wrap width `boxWidth` |
  | divider | `length`, `thickness` |

- Only shapes have `rotation`. Animations use the separate CSS `translate`,
  `rotate` and `scale` properties, so they combine with an element's
  `transform` rather than replacing it.
- All edits go through `commitFrom` in `src/lib/useBoardLayoutEditor.js`, which
  records undo history and autosaves the **draft**. The published board only
  changes when Publish is clicked.
- The canvas lives in `src/pages/AdminVisualBoard.jsx` (3.3k lines). Every
  element node carries `data-vb-kind` / `data-vb-id`.

## Shared foundation

**New pure module `src/lib/boardTransform.js`.** It holds all the geometry
maths, so it can be tested with plain `node` asserts (same pattern as
`src/lib/photoCrop.test.js`):

- `boundsOf(el)`: the axis-aligned box `{ left, top, right, bottom, cx, cy, w, h }`
  in board %, from a measured size plus rotation.
- `alignTargets(...)` and `distribute(...)`: the new centre for each element.
- `snapMove(...)`: the snapped centre plus the guide lines to draw.
- `resizeFromHandle(...)`: the new centre and size for a handle drag,
  rotation-aware.
- `angleFromPointer(...)`: the rotation angle for a pointer position.

**Measuring real sizes.** Photos, logo, video and text have no stored height,
so their size is read from the canvas:

- a node's `offsetWidth` / `offsetHeight`, times `scale` for scaled kinds,
  converted to board %;
- rotation applied mathematically.

`getBoundingClientRect` is not used, because a pulsing or bouncing animation
would make the size wobble. Measurement happens once at the start of an
action, never on every frame.

**Multi-element edits.** A new editor helper, `patchMany(changes)`, applies
several element patches in one `commitFrom`, so an align or a multi-delete is
a single undo step.

**Groups.** If a selected element belongs to a group, align and nudge move the
whole group by the same amount, the same way dragging already does.

## Features

### 1. Align and distribute

- A row of six icon buttons at the top of the properties panel: left, centre,
  right, top, middle, bottom. Plus two distribute buttons (horizontal,
  vertical) when 3+ elements are selected.
- **One element selected:** align to the board area.
- **Several selected:** align to the selection's combined bounds.
- **Distribute:** equal gaps between the elements' edges, keeping the two
  outermost where they are.
- Locked elements are skipped.
- Aligned positions may land anywhere in 0–100, so an element can sit flush
  against the edge.

### 2. Actions on multiple selected elements

When 2+ elements are selected, the properties panel shows:

- "N selected"
- align / distribute
- **Group**
- **Duplicate**
- **Delete**
- **Lock / Unlock**
- **Hide**

In the canvas:

- The arrow keys nudge the whole selection.
- Delete removes them all. The logo, candidate board and announcement strip
  are hidden, as today.
- Ctrl+D duplicates them all, and the copies become the new selection.

### 3. Smart guides

While dragging a single element or a group with Snap on:

- Its left / centre / right edges snap to other elements' left / centre / right
  edges and to the board's 0 / 50 / 100 lines. The same applies vertically.
- Threshold: 1% of the board (about 6px on the canvas at fit).
- Matched lines draw as thin magenta guides across the canvas.
- A small label shows the gap, in px on a 1920×1080 board, to the nearest
  element on each side.

This replaces today's centre-only snapping. Grid snapping stays when the grid
is shown. **Snap becomes on by default**, and holding **Ctrl/Cmd** while
dragging turns it off for that drag.

### 4. Full resize handles

| Kind | Handles | Behaviour |
| --- | --- | --- |
| shape | 8 (4 corners + 4 sides) | free; **Shift** keeps proportions |
| candidates box, announcements strip | 8 | free |
| logo / image / video | 4 corners | always proportional (scale) |
| text | 4 corners + left/right sides | corners scale `fontSize`; sides set `boxWidth` |
| divider | 2 ends | length |

- The **opposite handle stays put** by default. Holding **Alt** resizes from
  the centre, which is today's behaviour.
- For rotated shapes the maths works in the shape's own rotated frame, so the
  handles follow the shape.
- The cursor shows the resize direction.
- Existing min/max limits stay, for example shapes 0.4–200 and scale 0.1–6.

### 5. Rotate handle

- A round handle above the top-centre of the selection outline, for **shapes,
  text, logo, images and video**. Drag to rotate; **Shift** snaps to 15° steps.
- A tooltip shows the angle while dragging.
- `rotation` (−180…180, default 0) is added to text, logo, image and video.
- `positionStyle` / `scaledPositionStyle` in `boardGeometry.js` add
  `rotate(...)`. The live board uses the same helpers, so it matches the
  editor.
- `normalizeText` is updated to keep `rotation`, since it drops unknown fields.
  Photos, logo and video already pass new fields through.
- The properties panel's rotation number field appears for all rotatable
  kinds, not only shapes.
- Not rotatable: dividers (they have an orientation) and the candidates /
  announcements boxes.

### 6. Edit text on the canvas

- **Double-click** a text element (or press **Enter** while it's selected) to
  edit it in place.
- The rendered text is swapped for a `<textarea>` with the same font, size,
  weight, alignment and line height, sized to fit.
- Gradient text shows in its first colour while editing.
- **Esc** or clicking outside saves. The whole edit is one undo step.
- Bullet-list texts edit as plain lines, as in the side panel.
- The side-panel textarea stays.

### 7. Keyboard shortcuts

All are ignored while typing in a field, as today.

| Keys | Action |
| --- | --- |
| Ctrl+A | select all unlocked, visible elements |
| Esc | deselect (and close menus) |
| Ctrl+X | cut |
| Ctrl+C / Ctrl+V | copy / paste; now copies the element data, so paste works after the original is deleted, and works for several elements |
| Ctrl+G / Ctrl+Shift+G | group / ungroup |
| Ctrl+] / Ctrl+[ | forward / backward |
| Ctrl+Shift+] / Ctrl+Shift+[ | to front / to back |
| Ctrl+= / Ctrl+− / Ctrl+0 | zoom in / out / fit |
| Ctrl+scroll | zoom |
| Space+drag | pan when zoomed in |
| Enter | edit selected text |

The clipboard stays inside the editor. The system clipboard is not used.

### 8. Fuller right-click menu

- **On an element (or a multi-selection):** Cut, Copy, Paste, Duplicate,
  Delete · Lock/Unlock, Hide · Group/Ungroup · the 6 align buttons as one row ·
  Bring to front, Forward, Backward, Send to back. Each item shows its
  shortcut.
- **On empty canvas:** Paste, Select all.
- It closes on Esc, on scrolling or on clicking outside, as today.

## Files touched

- **new** `src/lib/boardTransform.js` and `src/lib/boardTransform.test.js`
- `src/lib/useBoardLayoutEditor.js`: `patchMany`, anchor/side/rotated resize,
  rotate, smart-guide snapping, and multi-element remove / duplicate / lock /
  hide / paste
- `src/lib/boardGeometry.js`: rotation in the position styles
- `src/lib/boardLayout.js`: keep `rotation` on text
- `src/pages/AdminVisualBoard.jsx`: handles, guides overlay, align bar,
  multi-select panel, text edit mode, shortcuts, context menu, zoom and pan
- `src/styles/globals.css`: styles for handles, guides and the menu

To stop `AdminVisualBoard.jsx` growing further, the new canvas chrome goes in
small components: `SelectionHandles.jsx`, `SmartGuides.jsx`, `AlignBar.jsx`
and `CanvasContextMenu.jsx` in `src/components/`.

## Testing

- `node src/lib/boardTransform.test.js` covers:
  - align (single element and selection)
  - distribute
  - snapping, and which guides it reports
  - anchored, Alt and Shift resize, including a rotated shape
  - 15° rotate snapping
- **Browser (Playwright)**, on the real editor, for each feature: drag with
  guides, align, distribute, each handle type, rotate, double-click edit,
  every shortcut, and both context menus. Also: undo reverses each action in
  one step, and the Preview page matches the canvas, including rotated text
  and photos.
- Testing edits the **draft**, which autosaves. At the end the draft is put
  back exactly as it was, and **Publish is never clicked**.

## Out of scope

- Resizing or rotating a whole multi-selection at once, or a group as one unit
- Rulers and draggable guides (Batch 3)
- Using the system clipboard
