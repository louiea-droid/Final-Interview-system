# Visual Board editor: layout and organisation

Status: agreed in chat on 2026-11-10 against two browser mockups
(`.superpowers/brainstorm/2282-1794322625/content/layout.html` and
`topbar-v2.html`). The user picked top-bar option **A**. This comes before
Batch 3 (rulers and guide lines, version history, PNG export, dropping a
photo onto the canvas, and an icon/sticker library). The animation start
delay was dropped.

## Why

At a normal laptop size (1600×900), the editor's board is small:

- Three stacked bars take about a quarter of the height: the app header,
  the "Visual Board / Unpublished changes" card, and the toolbar.
- "Visual Board" is shown twice.
- The canvas fills about half of its column.

The controls around it have also grown one by one:

- the same items are listed twice (each tab's "On the board" list, then
  Layers again);
- the layers are called "Text 1" to "Text 6";
- the settings for one text form a long, flat scroll;
- Reset sits beside Publish;
- view settings, tools and board actions are mixed together in one row.

The goal is a bigger board, with every control in an obvious place. It
also gives Batch 3 a place to put its controls.

## Goals

1. **One editor bar** replaces the page card and the toolbar, and the app
   header gets slimmer (option A).
2. **A bigger canvas.** It gets the height the removed bars used. When
   nothing is selected, the right panel shows board-level content instead
   of a lone hint (see *Open question 1*).
3. **Layers named after their content.**
4. **One list.** Layers is the only place to find, lock, hide, reorder and
   delete things. The other tabs only add things.
5. **Settings fold into sections** in the right panel.
6. **Board actions grouped** on the right of the bar. Templates get one
   menu, and Reset moves into a "⋯" menu.
7. **A floating action bar** just above the selection.

## Non-goals and anti-goals

- **No new board features.** Rulers, guide lines, History, Export PNG and
  Icons are Batch 3. This batch only leaves room for them (see *Slots for
  Batch 3*).
- **The board looks the same.** Nothing in the saved layout, `/visual` or
  the live board changes. This is editor UI only.
- **No feature is lost.** Every control that exists today is still
  reachable, and the keyboard shortcuts keep working.
- **No new dependencies.** Plain JSX and the existing CSS files, as now.
- **Anti-goal:** a tidier editor that takes more clicks for everyday edits,
  such as changing text, colour or size, or nudging things. Common edits
  must stay one click from a selection.

## The decisions

### 1. Top: the slim app header and one editor bar

**App header** (`pages/AdminLayout.jsx`, `.admin-header` in
`styles/admin-shell.css`):

- It shrinks from `--header-height: 66px` to about 34px.
- The title gets smaller (about 12px, dimmed).
- The two clocks become compact: a small label above the value, with the
  value at about 12px.
- Same layout, just shorter, on **every admin page** (my call; the user
  didn't pick). The whole panel keeps one look. Check the other pages
  (Dashboard, Records, Announcements, Settings, History) still fit under
  it, and the mobile overrides at admin-shell.css L343-391.

**Removed from `AdminVisualBoard.jsx`:**

- the empty leftover `<header className="dashboard-header">` (around
  L1559);
- the page card header, which held the "Visual Board" h2, the
  dirty/up-to-date line and Reset/Preview/Publish (L1566-1603);
- the `.vb-canvas-hint` paragraph under the canvas. Its text moves into
  the right panel's nothing-selected state.

**The one editor bar**, which replaces `.vb-toolbar` (L1605-1733), left to
right:

| Group | Contents |
|---|---|
| Edit | Undo, Redo (icon buttons, as now) and **Box select** as an icon toggle (`boxSelectMode`) |
| Zoom | a **"100% ▾"** menu, replacing the Fit button and the zoom slider (see below) |
| View | a **"View ▾"** menu (see below) |
| *(spacer)* | |
| Templates | a **"Templates ▾"** menu: *Save as template…* opens the existing `templateModal = 'save'` modal; *Apply a template…* opens `'apply'` |
| ⋯ | a **"⋯"** menu: *Reset board to default* (`editor.resetLayout`) |
| Board | **Preview** (the same link as now) and **Publish** |

- **Publish shows the dirty state.** Today the "Unpublished changes" text
  comes from `isDirty`. Instead, a small gold dot shows on Publish while
  `isDirty`, and the button's tooltip and accessible name say "Publish
  (unpublished changes)" or "Up to date with the live board".
- Publish stays disabled when it's not dirty, and still shows
  "Publishing…".

**The zoom menu ("100% ▾"):**

- The label is the current zoom.
- It offers Zoom in, Zoom out, then presets **Fit (100%)**, 50%, 75%,
  125% and 150%.
- The range stays MIN_ZOOM 25 to MAX_ZOOM 150. Fit is 100% today
  (`setZoom(100)`), so the two are one item.
- Ctrl+scroll and Ctrl+= / - / 0 still work.

**The View menu ("View ▾"):** checkable items in groups, each showing its
state:

- **Show:** Grid (`showGrid`). Turning the grid on also turns on snapping
  to it, as `gridSnap: showGrid` does today, so the item reads "Grid (snap
  to it)". That's my call: it keeps today's behaviour.
- **Snapping:** Snap to elements (`snapEnabled`, on by default), with the
  hint "hold Ctrl to skip".
- **Screen:** Focus mode (`toggleFocusMode`) and Fullscreen
  (`toggleFullscreen`).
- The existing "Exit Focus" button stays.

**All the bar's menus:**

- Each opens on click, closes on Escape, on a click outside, or after
  choosing an item. The exception is checkable items in View, which stay
  open so several can be toggled.
- They use `role="menu"` and `menuitem` / `menuitemcheckbox`.
- They need to work in Fullscreen. Draw them inside `.vb-layout` with the
  `overlayIn` helper the context menu already uses.

### 2. The canvas and the nothing-selected panel

- The canvas column takes the height freed above. There are no
  layout-model changes. The stage is already `flex: 1` with
  `container-type: size`, and `fit()` (L572) measures the chrome, so less
  chrome means a bigger board.
- **When nothing is selected,** the right panel shows three things, top to
  bottom (the user chose the last two):
  1. **The hint** moved from under the canvas: click, drag, double-click,
     and that changes save as a draft until Publish.
  2. **Quick links:** "Candidate Board settings" and "Announcement strip
     settings". Each selects that box, which opens its settings in this
     panel. A box that's hidden is still selectable from here, so its
     settings stay reachable.
  3. **Keyboard shortcuts:** a compact two-column list, folded by default
     and using the same folding section as section 5. It lists the
     shortcuts that exist:
     - Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y: undo and redo;
     - Ctrl+A, Ctrl+C / X / V, Ctrl+D;
     - Ctrl+G / Ctrl+Shift+G;
     - Ctrl+[ ] and Ctrl+Shift+[ ]: layer order;
     - arrows to nudge, with Shift for larger steps;
     - Delete;
     - Enter to edit text, Esc to deselect;
     - Space-drag to pan;
     - Ctrl+scroll and Ctrl+= / - / 0 to zoom;
     - Shift while resizing keeps proportions, and Alt resizes from the
       centre;
     - Shift while rotating snaps to 15°;
     - hold Ctrl to skip snapping.

     The list is a plain array in one place, so Batch 3 can add to it.

### 3. Layer names

Change the labels built in `layerInfo` (L1126-1175) and `labelShapes`
(L183-191):

- **Text:** the text's first line, with whitespace collapsed and cut to
  about 28 characters with "…". Empty text falls back to "Text n". The
  headline reads "Final Interview Applicants".
- **Photo frame:** "Photo frame · n photos" when it has more than one
  photo, otherwise "Photo frame n".
- **Unchanged:** other shapes (Rectangle 1, Box 2, and so on), Photo n,
  Video n, Divider n, Logo, Candidate Board and Announcements.
- The label is used everywhere a name shows: Layers rows, the properties
  title where one applies, and any toasts.

### 4. One list: Layers

- **Removed:** the "On the board" lists from the Elements (L1809-1848),
  Text and Uploads ("Uploaded photos", "Uploaded videos") panels.
- **What each tab keeps:** only the "add" actions.
  - **Elements:** add a divider, add a shape.
  - **Text:** Add Text.
  - **Uploads:** Add Photo, Add Video.
- **The Brand tab is removed.** It has no add actions, only lock rows for
  the Logo and the Candidate Board, and Layers already covers both. Logo
  replace and "Use default" are in the logo's properties already. That's my
  call. The rail becomes Elements, Text, Uploads and Layers, and Batch 3
  adds Icons before Layers.
- **Layers gains a Delete button** on each row, so the remove "×" from the
  old lists isn't lost. It only shows for kinds that can be deleted (text,
  photo, video, shape, divider), uses `removeMany`, and respects locks the
  same way. The logo and the two boxes are hidden, not deleted, as today.
- **Selecting never switches the rail tab** (my call). The tabs no longer
  list items, so jumping to one would show nothing useful. Jumping to
  Layers would pull you out of a tab while adding several shapes in a row,
  since every add selects the new element. `PANEL_BY_KIND` and the
  auto-switch it drives are removed. When Layers is already the open tab,
  the selected row is highlighted and scrolled into view.

### 5. The settings fold into sections

The right panel for a single element becomes:

- **a fixed head:** title, "Visible on board", the group note with
  Ungroup, and the element's content (the text box, the logo image, the
  thumbnail, or the shape picker);
- **folding sections;**
- **a fixed foot:** Duplicate and Remove.

The sections, using the controls listed today (L2549-3518):

| Section | Text | Shape | Logo / Photo / Video | Divider |
|---|---|---|---|---|
| **Font** | Font, Weight, Case, Size, Alignment with Italic and Underline | | | |
| **Spacing** | Letter spacing, Line height, Box width % | | | |
| **Fill** | Fill | Fill, Photo/Video position, Carousel photos (frame) | | |
| **Border & effects** | Outline, Shadow, Element opacity | Border/Line, Element opacity | Border (photo/video), Element opacity | Element opacity |
| **Animation** | Animation | Animation | Animation (logo/photo) | |
| **Position & size** | Position (or the headline note), Rotate | W/H, Corner, Rotate, Position | Size, Position, Rotate | Direction, Length, Thickness, Position |

- An element shows only the sections it has controls for.
- **The two boxes** (candidates and announcements) get:
  - **Position & size:** X, Y, W, H;
  - **Carousel:** seconds per card, per row;
  - **Candidate cards:** candidates only;
  - **Border & effects:** opacity;
  - a foot with "Remove from board".
- **Multi-select stays as it is:** title plus Group, Duplicate,
  Lock/Unlock, Hide and Delete.
- **Open and closed** (my call, so everyday edits stay one click away, as
  the anti-goal asks):
  - **What starts open:** text opens Font and Fill. A shape opens Fill and
    Position & size. Logo, photo, video and divider open Position & size.
    The two boxes open Position & size.
  - **What's remembered:** a set of open sections, by name. Each time you
    open or close a section, it's recorded as an override of these
    defaults. So opening Animation keeps it open when you select another
    element, and closing Fill keeps it closed.
  - **Where it lives:** page state for the visit; it doesn't need to
    survive a reload.
- Each section header is a button with `aria-expanded`.

### 6. Board actions

These are covered by the bar in section 1:

- Preview and Publish sit at the far right.
- Templates has its own menu.
- Reset moves into "⋯". It can already be undone through `commitFrom`.
  After a reset, the toast says "Layout reset to the default. Ctrl+Z to
  undo." That's my call: no confirmation dialog, since undo covers it.

### 7. The floating action bar

- **What and where:** a small bar drawn above the selection's bounding box
  on the canvas. The box is measured the same way smart guides and
  `measure()` already measure elements.
  - It shows for one selected element and for a multi-selection.
  - It's hidden while dragging, resizing, rotating, box-selecting or
    editing text on the canvas.
- **Single selection:** align to the board (the six AlignBar actions),
  Duplicate, Lock/Unlock, and "⋯", which opens the existing right-click
  menu at the bar.
- **Multi-selection:** align to the selection, distribute (3+), Group,
  Lock/Unlock and "⋯".
- **The AlignBar leaves the right panel.** The panel's own Duplicate,
  Remove and multi-select buttons stay, so nothing is lost if the bar is
  covered.
- **Placement:**
  - centred above the selection, in screen pixels;
  - it flips below when there's no room above;
  - it's clamped inside the visible stage;
  - its size doesn't change with zoom.
- It goes inside `.vb-layout` so it works in Fullscreen and Focus.
- When the selection is locked, only Lock/Unlock and "⋯" are enabled.

## Slots for Batch 3

So that Batch 3 doesn't have to rearrange this again:

- **View menu:**
  - Show gets Rulers and Guide lines;
  - Snapping gets Snap to guide lines;
  - a new "Guide lines" group gets Lock guide lines and Clear all.
- **Board group:** Export PNG and History go between Preview and Publish.
- **Rail:** an Icons tab goes before Layers.
- **Canvas:** rulers go along the top and left edges of the stage.

## Constraints

- Plain JSX. No new dependencies. Editor CSS goes in
  `src/styles/globals.css`, and the app header CSS is in
  `src/styles/admin-shell.css`.
- **StrictMode:** effect cleanups run twice in dev. Never save or close
  from an unmount cleanup.
- Every shortcut from Batch 1 keeps working.
- Fullscreen and Focus mode keep working. Menus and the floating bar must
  show in Fullscreen.
- Testing: run the unit checks that exist (`node src/lib/*.test.js`), plus
  a browser smoke check at the end. It signs in with a throwaway Firebase
  account (see CLAUDE.md), whose saves are refused. Never click Publish.
  Pure logic, such as the layer-name builder and the floating bar's
  placement, gets a small node test.

## Left to the builder

- Exact sizes, spacing and icons, matching the current dark editor look.
- How the menus and folding sections are split into components. They're
  new files under `src/components/`, as with `CanvasContextMenu`.
- Whether the floating bar's position is computed from `measure()` or from
  DOM rects, as long as it follows zoom and scroll.

## Settled questions

- **The nothing-selected panel:** the hint, quick links to the two boxes,
  and keyboard shortcuts (the user's choice). The mockup's "Background"
  section is dropped, because no such setting exists.
- **Where the header gets slim:** on every admin page (my call, open to
  change).
- **Selecting never switches the rail tab** (my call, see section 4).
- **Which sections start open** depends on the element kind (my call, see
  section 5).
