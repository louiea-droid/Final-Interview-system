# Visual Board editor — Batch 2 (styling)

Status: design agreed section by section in chat on 2026-09-25. The written
spec is parked and hasn't been reviewed yet; review it before writing the
plan. Builds on Batch 1
(`2026-09-24-visual-board-batch1-design.md`).

## Goal

Let the admin style any element on the board as fully as in Canva, and make
the live `/visual` board look exactly like the editor:

1. Whole-element opacity for every element.
2. A custom drop shadow (colour, blur, X/Y offset, opacity) for every element,
   replacing the text-only shadow presets.
3. Solid / dashed / dotted borders on shapes, photo frames, images and videos.
4. Italic, underline and outline for text.
5. Image adjustments (brightness, contrast, greyscale, blur) on everything
   that shows a picture.
6. Copy / paste style between elements, including across element types.

Existing boards must look unchanged after this ships, with one known
exception (the Glow preset, see *Migration*).

## How the editor works today (constraints the design follows)

- **Opacity** exists only per fill (`style.fill.opacity` on texts,
  `fill.opacity` on shapes). The logo, images, video, dividers and the two
  boxes have none.
- **Shadows:** texts store a preset key in `style.shadow`
  (`none|soft|hard|gold|glow`), resolved by `SHADOW_FILTERS` in
  `textStyle.js`. The live board hard-codes drop shadows on the logo,
  images and video (Tailwind classes in `VisualBoard.jsx`) and a gold
  `boxShadow` on dividers. The editor shows none of these, so the two
  already differ.
- **Borders:** shapes have `stroke: { color, width }`, always drawn solid by
  `resolveShapeStyle`. Images, logo and video have no border.
- **Normalisers decide what survives a load.**
  - `normalizeText`, `normalizeBox`, `normalizeDividers`, `normalizeFill`
    and the shape `stroke` rebuild their fields one by one, so any new field
    is dropped on load unless they are taught it.
  - Shapes, images, videos, the logo and text `style` keys pass unknown
    fields through.
- **Render sites:**
  - The shared helpers (`resolveTextStyle`, `resolveShapeStyle`,
    `scaledPositionStyle`) feed the editor, the live board and the template
    preview.
  - The logo, image, video and divider markup is written separately in
    `AdminVisualBoard.jsx` and `VisualBoard.jsx`.
- **Animations clash with element styles on the same node.** Fade animates
  `opacity`; Bounce, Spin and Slide animate `transform`. A triangle's
  `clip-path` clips any filter drawn on its own node.
- **Unchanged from Batch 1:** no new dependencies, every user action is one
  undo step, never click Publish.

## Shared foundation

### The `effects` object

Every element (text, shape, logo, image, video, divider, candidates box,
announcements box) gets:

```js
effects: {
  opacity: 1,                                                          // 0–1
  shadow: { color: '#000000', blur: 14, x: 0, y: 4, opacity: 0.55 },   // or null = none
  adjust: { brightness: 100, contrast: 100, blur: 0, grayscale: 0 },   // %, %, px, %
}
```

- **Units:**
  - Shadow `blur`, `x`, `y` and adjustment `blur` are px on a 1920×1080
    board, the same convention as Batch 1's gap labels.
  - They are drawn in container units: `v / 10.8` cqh. A shadow therefore
    keeps its proportions in the editor canvas and on the full-size screen.
    Text shadows today are raw px and look oversized in the editor; this
    fixes that.
- **Ranges** (clamped by the normaliser):

  | Field | Range |
  | --- | --- |
  | `opacity` | 0–1 |
  | shadow `blur` | 0–60 |
  | shadow `x`, `y` | −40 to 40 |
  | shadow `opacity` | 0–1 |
  | `brightness`, `contrast` | 0–200 |
  | `grayscale` | 0–100 |
  | adjustment `blur` | 0–20 |

- **`adjust` is honoured only where a picture is shown:** the logo, images,
  video, and shapes whose fill is an image or video (frames and carousels
  included). Elsewhere it is stored but ignored.
- **`shadow: null` is an explicit "off"** and is kept as-is. A *missing*
  `effects` or `effects.shadow` means "use the element type's default"
  (see *Migration*).

### New module `src/lib/effectStyle.js`

- **`normalizeEffects(effects, kind)`:** clamps every field and fills in the
  element type's defaults.
- **`resolveEffectsCss(effects)`:**
  - returns `{ opacity, filter }` for the effects layer;
  - `opacity` is omitted at 1;
  - `filter` is a single `drop-shadow(...)`, omitted when the shadow is null.
- **`resolvePictureFilter(effects)`:**
  - returns `{ filter }` for the picture node;
  - the order is `brightness() contrast() grayscale() blur()`;
  - functions at their neutral value are left out, and nothing is returned
    when all four are neutral.
- **`presetToShadow(key)`:** converts an old text preset key into a shadow
  object.
- **`applyStyle(element, kind, snapshot)`:** the copy/paste-style merge
  rules (see *Features 6*). It is a pure function.
- **Keep `SHADOW_FILTERS` / `SHADOW_OPTIONS`** in `textStyle.js`. The
  announcement strip's own style document still uses them.

### Borders: `stroke`

- `stroke` becomes `{ style: 'solid' | 'dashed' | 'dotted', width, color }`.
- **Shapes and frames** keep their `stroke` and gain `style`, defaulting to
  `'solid'`. The shape normaliser keeps `style`, and `resolveShapeStyle`
  draws `border: ${width}px ${style} ${color}`.
- **Images and videos** get the same `stroke`, defaulting to width 0 with
  colour `#c9a03c`.
- **Width units are unchanged:** raw px, as shapes use today.
- **Zigzag** shapes are untouched: their stroke is the drawn line.
- **The logo** gets no border. It is a transparent PNG, so a border would
  outline the empty space.

### Layering

Every element renders the same three layers in the editor and the live
board, so opacity and shadow never share a node with an animation or a
clip-path:

```
outer      position, size, rotation, animation   (editor: also SelectionHandles - not faded or shadowed)
 └ effects     resolveEffectsCss: opacity + drop-shadow
    └ content     fill / border / clip-path / text / picture (+ resolvePictureFilter on the <img>/<video>)
```

- **Text:**
  - Outer: the positioned node (the editor's `<button>`, a new wrapper
    `<div>` on the live board, whose single `<p>` is split in two).
  - Effects: merged into the text node itself, because `resolveTextStyle`
    no longer sets a `filter`.
- **Shapes and frames:**
  - The editor's `.vb-shape` / `.vb-shape-fill` (Batch 1) gains a middle
    `.vb-shape-effects` layer.
  - The live board adopts the same three layers.
  - A triangle's shadow therefore follows the triangle.
- **Logo, images, video:**
  - A new shared component, `src/components/MediaPicture.jsx`, is used by
    both files. It is a wrapper (stroke, effects, `overflow: hidden` so blur
    doesn't spill) around the `<img>`/`<video>` (picture filter).
  - It replaces the live board's hard-coded Tailwind shadow classes.
  - The editor's video now applies `resolveAnimationCss`, which the live
    board already does.
  - The shadow sits inside the element's `scale()`, so it scales with Size.
    The live board's hard-coded shadow already behaves this way.
- **Candidates and announcements boxes:** an effects wrapper inside the
  positioned box.
- **Dividers:** effects on the line. The live board's hard-coded
  `boxShadow` is removed; it is now the default shadow.
- **Template preview:** applies `resolveEffectsCss` wherever it renders an
  element.

## Migration (defaults when `effects` is missing)

`normalizeEffects` fills these in for every board saved before Batch 2, and
for newly added elements:

| Kind | Default `shadow` |
| --- | --- |
| logo | `{ color: '#000000', blur: 14, x: 0, y: 4, opacity: 0.55 }` |
| image, video | `{ color: '#000000', blur: 14, x: 0, y: 4, opacity: 0.45 }` |
| divider | `{ color: '#c9a03c', blur: 10, x: 0, y: 0, opacity: 0.28 }` |
| text | converted from `style.shadow` (below) |
| shape, candidates, announcements | `null` |

Every kind defaults to `opacity: 1` and neutral `adjust`.

**Text preset conversion** (`presetToShadow`):

| Preset | Shadow |
| --- | --- |
| `none` | `null` |
| `soft` | `{ color: '#000000', blur: 8, x: 0, y: 2, opacity: 0.55 }` |
| `hard` | `{ color: '#000000', blur: 0, x: 0, y: 3, opacity: 0.65 }` |
| `gold` | `{ color: '#f4c24a', blur: 8, x: 0, y: 2, opacity: 0.6 }` |
| `glow` | `{ color: '#f4c24a', blur: 14, x: 0, y: 1, opacity: 0.6 }` |

- **Soft, Hard and Gold convert exactly.**
- **Glow is two stacked shadows today** and becomes the closest single
  shadow, so the headline's glow will look slightly softer and narrower.
  This was accepted in design review.
- **After conversion** `normalizeText` writes `effects.shadow` and drops
  `style.shadow`. A text that already has `effects.shadow` ignores any
  leftover `style.shadow`.
- **Text defaults** (`DEFAULT_TEXT_STYLES` / `DEFAULT_EXTRA_TEXT_STYLE`)
  keep their preset keys as the source for conversion, so a new text still
  starts with its Soft shadow.
- **Taught `effects`:** `normalizeText`, `normalizeBox` and
  `normalizeDividers` now keep an `effects` field. Shapes, images, videos and
  the logo pass it through today, but their normalisers also call
  `normalizeEffects` so the values are clamped.

## Features

### 1. Whole-element opacity
- **Control:** an Opacity slider (0–100 %) in the new Effects section, for
  every element.
- **Stacking:**
  - It multiplies with the per-fill opacity.
  - It multiplies with Fade, because Fade animates the outer layer and
    opacity sits on the effects layer.

### 2. Drop shadow
- **Control:** a Shadow on/off toggle in the Effects section. When on, it
  shows colour, opacity, blur, X and Y. It replaces the text's Shadow
  dropdown.
- **Turning it off** stores `null`.
- **Turning it back on** restores the element type's default shadow, or
  black soft (`blur 12, y 4, opacity 0.5`) for kinds whose default is null.

### 3. Borders
- **Control:** a shared `BorderControls` row: colour, width (0–16, the
  current range) and a **Solid / Dashed / Dotted** segmented control.
- **Shown for:** shapes and frames (which replaces today's Border row),
  images and videos.

### 4. Text styles
- **Controls:**
  - **I** and **U** toggle buttons next to the alignment controls, setting
    `style.italic` / `style.underline` (booleans, default false);
  - an **Outline** row with width 0–8 (0 = off) and colour, setting
    `style.outline = { width, color }` (default `{ width: 0, color: '#000000' }`).
- **`resolveTextStyle`:**
  - `italic` → `fontStyle: 'italic'`;
  - `underline` → `textDecoration: 'underline'`. For a gradient fill,
    `textDecorationColor` is the first stop's colour, because the fill is
    transparent and the underline would otherwise be invisible;
  - `outline` → `WebkitTextStroke: '${w / 10.8}cqh ${color}'` (board px, like
    shadows), omitted at width 0.
- **The canvas text editor** shows italic and underline. Outline is left
  out, the same way it already leaves out gradients.

### 5. Image adjustments
- **Control:** an Adjustments block in the Effects section with brightness,
  contrast, greyscale and blur sliders and a **Reset** button.
- **Shown for:** the logo, images, video, and shapes with an image or video
  fill.
- **Carousels:** one adjustment applies to all photos.
- **Applied** by `resolvePictureFilter` on the picture node only, so a
  border or shadow isn't greyed or blurred.

### 6. Copy / paste style
- **The style clipboard** is kept in page state, separate from Batch 1's
  element clipboard, so the two never overwrite each other.
- **Copy style** (**Ctrl+Alt+C**, or "Copy style" in the right-click menu)
  takes a snapshot of the single selected element, or the first element of a
  multi-selection:
  - `kind`;
  - `effects`;
  - `stroke`, if the element has one;
  - for texts, `textStyle`: `fontFamily, weight, textCase, letterSpacing,
    lineHeight, align, fill, italic, underline, outline`. Not size, box
    width or bullets;
  - for shapes, `shapeStyle`: `fill` and `radius`.
- **Paste style** (**Ctrl+Alt+V**, or "Paste style", disabled when the style
  clipboard is empty) applies `applyStyle` to every selected element in
  **one** `commitFrom`, so it is one undo step. The rules for each element:
  - `effects.opacity` and `effects.shadow`: always.
  - `effects.adjust`: only if both the source and the target show a
    picture. Otherwise the target's adjust is kept.
  - `stroke`: only if both have one.
  - `textStyle`: text to text only.
  - `shapeStyle.radius`: shape to shape.
  - `shapeStyle.fill`: shape to shape, only if **neither** fill is an image
    or video. A photo frame's picture is never replaced, and a photo is
    never pasted.
- **Locked elements are skipped**, the same rule Batch 1 applies to menu
  actions.
- **Toasts:** "Style copied" / "Style pasted to N elements".
- **Shortcuts** never fire while typing (Batch 1's `isTypingTarget` guard).

### Hook actions (`useBoardLayoutEditor.js`)
- **`setEffects(kind, id, patch)`:** merges `opacity`, and shallow-merges
  `shadow` and `adjust`. `shadow: null` turns it off.
- **`setStroke(kind, id, patch)`:** a generalised `setShapeStroke` covering
  shapes, images and videos. `setShapeStroke` becomes a call to it.
- **`pasteStyle(selection, snapshot)`:** one `commitFrom` running
  `applyStyle` over the unlocked targets.
- **Undo:** each goes through `commitFrom`, so a slider drag is one undo
  step (the existing 500 ms history burst).

## Files touched

- **New:**
  - `src/lib/effectStyle.js`
  - `src/lib/effectStyle.test.js`
  - `src/components/MediaPicture.jsx`
  - `src/components/EffectsPanel.jsx`
  - `src/components/BorderControls.jsx`
- **Modified:**
  - `src/lib/boardLayout.js`: normalisers keep and normalise `effects`;
    text shadow migration.
  - `src/lib/shapeStyle.js`: `stroke.style` normalised and drawn.
  - `src/lib/textStyle.js`: italic, underline, outline; no more
    `SHADOW_FILTERS` for board texts.
  - `src/lib/useBoardLayoutEditor.js`: `setEffects`, `setStroke`,
    `pasteStyle`, and defaults on new elements.
  - `src/pages/AdminVisualBoard.jsx`: layering, Effects/Border/text
    controls, style clipboard, shortcuts, menu wiring.
  - `src/components/CanvasContextMenu.jsx`: Copy style / Paste style items.
  - `src/pages/VisualBoard.jsx`: layering, `MediaPicture`, hard-coded
    shadows removed.
  - `src/styles/globals.css`: effects layer and new controls.

## Testing

Kept light, by request: unit tests carry most of it, plus one short browser
check at the end.

- **Unit:** `node src/lib/effectStyle.test.js` (plain asserts, like Batch 1)
  covers:
  - `normalizeEffects` clamping and per-kind defaults, including keeping an
    explicit `null` shadow;
  - every `presetToShadow` conversion;
  - `resolveEffectsCss` / `resolvePictureFilter` output: `cqh` conversion,
    filter order, neutral values omitted;
  - shape `stroke.style` normalised and drawn;
  - `applyStyle` for each cross-type rule, including the photo-fill guard
    and adjust only between pictures.
- **Regression:** the existing `photoCrop`, `boardGeometry` and
  `boardTransform` tests, plus `vite build`.
- **One browser smoke check at the end** (Playwright, throwaway account,
  never Publish):
  - open `/visual` and the editor, confirm no page errors, and confirm the
    logo, photo and divider shadows are present;
  - set a shadow on a triangle and see it follow the triangle;
  - copy style from a text, paste it onto a shape, then undo.

## Review Focus (for the plan)

Risks unit tests can't catch:

1. **Live-board layering:** texts, shapes and media now render extra
   wrappers. Positions, rotation, animations and click targets must be
   unchanged.
2. **Text shadow migration:** existing texts keep their look (Glow excepted),
   and a published board still loads.
3. **The photo-fill guard:** pasting style never replaces a frame's photo.

## Out of scope

- A second shadow layer (Glow is approximated instead).
- Editing a multi-selection's effects from the properties panel. Paste style
  covers applying one look to many.
- Borders on the logo, and per-photo adjustments inside a carousel.
- The announcement strip's own style document, which keeps its presets.
- Locked elements are still editable from the properties panel, as X/Y is
  today.
