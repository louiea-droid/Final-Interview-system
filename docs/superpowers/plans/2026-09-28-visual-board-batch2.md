# Visual Board Batch 2 (styling) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every element on the Visual Board opacity, a custom drop shadow and (where it shows a picture) image adjustments. Add dashed and dotted borders, italic, underline and outline for text, and copy/paste style. The live `/visual` board must render exactly what the editor shows.

**Architecture:** All effect maths lives in one pure module, `src/lib/effectStyle.js`, which is unit-tested with plain `node:assert`. Every renderer calls `effectsOf(kind, element)`, which fills in per-kind defaults whenever `effects` is missing. Old boards, newly added elements, Reset and template thumbnails therefore all look right without special cases. Each element renders three layers (position/animation → effects → content), so opacity and shadows never share a node with an animation or a clip-path.

**Tech Stack:** React 19 + Vite, plain JSX, hand-written CSS in `src/styles/globals.css`, lucide-react icons, Firebase (Firestore) for storage.

**Spec:** `docs/superpowers/specs/2026-09-25-visual-board-batch2-design.md`

## Global Constraints

- No new dependencies.
- Every user action is one undo step: route every edit through `commitFrom` (a slider drag coalesces via the 500 ms history burst).
- Never click Publish during testing.
- **Do not commit.** The user commits. Each task ends with a checkpoint, not a `git commit`.
- `main.jsx` uses StrictMode: never save or close anything from an effect's unmount cleanup.
- Effect px values are board px on a 1920×1080 board, drawn as `v / 10.8` cqh.
- Ranges: opacity 0–1; shadow blur 0–60; shadow x, y −40 to 40; shadow opacity 0–1; brightness and contrast 0–200; greyscale 0–100; adjustment blur 0–20; border width 0–16 (slider) and 0–40 (stored clamp, unchanged); outline width 0–8.
- `shadow: null` is an explicit "off" and must survive save and load. A *missing* shadow means "use the kind's default".
- Keep `SHADOW_FILTERS` and `SHADOW_OPTIONS` in `textStyle.js`: `announcementStyle.js` and `AdminAnnouncements.jsx` still use them.
- Plain JSX, no TypeScript. Match the surrounding comment style: short `/* */` blocks that explain *why*.

## Review Focus

1. **Live-board layering:** texts, shapes, media and boxes gain wrapper nodes. Every element's on-screen box must stay where it was (Task 5 captures a baseline of bounding rects before any change and compares after), and rotation, animations and editor click targets must behave as before.
2. **Text shadow migration:** a text saved before Batch 2 (a `style.shadow` preset, no `effects`) must keep its shadow, and an explicit `effects.shadow: null` must win over a leftover `style.shadow`. Tests are in Task 1.
3. **Un-normalised elements:** a freshly added text, photo or shape, a Reset board, and template thumbnails (raw stored data) never pass through the load normalisers. They must still render their kind's default effects. `effectsOf` tests are in Task 1.
4. **The photo-fill guard:** pasting style never replaces a frame's photo, and never pastes a photo onto a plain shape. Tests are in Task 1.
5. **Container-unit basis:** shadow cqh must resolve against the *board*, not a nested container. The live candidates box used to be its own size container, so Task 5 moves that container onto the inner layer, and the browser check confirms the candidates shadow is the same size in the editor and on `/visual`.

---

## File map

| File | Responsibility |
| --- | --- |
| `src/lib/effectStyle.js` (new) | Defaults, normalising, CSS for effects; style snapshot and paste merge |
| `src/lib/effectStyle.test.js` (new) | Unit checks for effectStyle, stroke and text-style additions |
| `src/lib/shapeStyle.js` | `STROKE_STYLES`, `MEDIA_STROKE`, `normalizeStroke`, `strokeCss`; shapes use them |
| `src/lib/textStyle.js` | Italic, underline, outline; no more `filter` on board texts |
| `src/lib/boardLayout.js` | Normalisers keep `effects` (and `stroke` on images and videos); text shadow migration |
| `src/lib/useBoardLayoutEditor.js` | `setEffects`, `setStroke`, `pasteStyle`; `setShapeStroke` removed |
| `src/components/MediaPicture.jsx` (new) | Logo, image or video: border and effects wrapper around the picture, with the picture filter |
| `src/components/EffectsPanel.jsx` (new) | Opacity, Shadow and Adjustments controls |
| `src/components/BorderControls.jsx` (new) | Colour, width and Solid/Dashed/Dotted |
| `src/pages/VisualBoard.jsx` | Three-layer rendering, `MediaPicture`, hard-coded shadows removed |
| `src/pages/AdminVisualBoard.jsx` | Three-layer canvas, panel controls, style clipboard, shortcuts, menu wiring, template preview |
| `src/components/CanvasTextEditor.jsx` | Drop the outline while editing |
| `src/components/CanvasContextMenu.jsx` | Copy style / Paste style items |
| `src/styles/globals.css` | `.vb-effects-layer`, the picture-filter rule, small control styles; divider box-shadow removed |

---

### Task 1: `effectStyle.js`, the effects model

**Files:**
- Create: `src/lib/effectStyle.js`
- Create: `src/lib/effectStyle.test.js`
- Modify: `src/lib/shapeStyle.js`. Add only the `MEDIA_STROKE` export here; the rest of the stroke work is Task 2.

**Interfaces:**
- Consumes: `normalizeHex`, `withAlpha` from `src/lib/fill.js`; `MEDIA_STROKE` from `src/lib/shapeStyle.js`.
- Produces:
  - `DEFAULT_SHADOWS: { logo, image, video, divider }`
  - `FALLBACK_SHADOW`
  - `DEFAULT_ADJUST`
  - `presetToShadow(key) → shadow | null`
  - `normalizeEffects(effects, kind, fallbackShadow?) → { opacity, shadow, adjust }`
  - `effectsOf(kind, element) → effects` (the only entry point renderers and the hook use)
  - `resolveEffectsCss(effects) → { opacity?, filter? }`
  - `resolvePictureFilter(effects) → { filter? }`
  - `withEffects(style, effects) → style` (merges effects onto a node that may already carry an `opacity`, multiplying the two)
  - `showsPicture(kind, element) → boolean`
  - `styleSnapshot(kind, element) → snapshot`
  - `applyStyle(element, kind, snapshot) → element`

  Here `kind` is the layer kind: `'text' | 'shape' | 'logo' | 'image' | 'video' | 'divider' | 'candidates' | 'announcements'`. A shape's own `element.kind` is its shape type (`'rectangle'`, `'frame'`, `'zigzag'`, …).

- [ ] **Step 1: Make the style helpers loadable under node, and add `MEDIA_STROKE`**

Node's ESM loader needs file extensions, and `shapeStyle.js` and `textStyle.js` import their neighbours without them (checked: `import('./src/lib/shapeStyle.js')` fails with `ERR_MODULE_NOT_FOUND`). Vite accepts both forms, so add `.js`:

- `src/lib/shapeStyle.js`: `from './fill'` → `from './fill.js'`, and `from './animationStyle'` → `from './animationStyle.js'`
- `src/lib/textStyle.js`: `from './fill'` → `from './fill.js'`

`fill.js` and `animationStyle.js` import nothing. Then, in `src/lib/shapeStyle.js`, directly under `FIT_OPTIONS`:

```js
/* The border a photo or video starts with: none, in the board's gold. */
export const MEDIA_STROKE = { color: '#c9a03c', width: 0, style: 'solid' };
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/effectStyle.test.js`:

```js
// Run with: node src/lib/effectStyle.test.js
import assert from 'node:assert/strict';

import {
  DEFAULT_ADJUST,
  applyStyle,
  effectsOf,
  normalizeEffects,
  presetToShadow,
  resolveEffectsCss,
  resolvePictureFilter,
  styleSnapshot,
  withEffects,
} from './effectStyle.js';
import { imageFill, solidFill } from './fill.js';
import { MEDIA_STROKE } from './shapeStyle.js';

// normalizeEffects: per-kind defaults
assert.deepEqual(normalizeEffects(undefined, 'logo'), {
  opacity: 1,
  shadow: { color: '#000000', blur: 14, x: 0, y: 4, opacity: 0.55 },
  adjust: DEFAULT_ADJUST,
});
assert.deepEqual(normalizeEffects(undefined, 'image').shadow, { color: '#000000', blur: 14, x: 0, y: 4, opacity: 0.45 });
assert.deepEqual(normalizeEffects(undefined, 'divider').shadow, { color: '#c9a03c', blur: 10, x: 0, y: 0, opacity: 0.28 });
assert.equal(normalizeEffects(undefined, 'shape').shadow, null);
assert.equal(normalizeEffects(undefined, 'candidates').shadow, null);

// an explicit null shadow is kept, even where the kind has a default
assert.equal(normalizeEffects({ shadow: null }, 'logo').shadow, null);

// clamping
assert.deepEqual(
  normalizeEffects(
    {
      opacity: 3,
      shadow: { color: 'nope', blur: 99, x: -99, y: 99, opacity: -1 },
      adjust: { brightness: 500, contrast: -5, blur: 50, grayscale: 120 },
    },
    'shape'
  ),
  {
    opacity: 1,
    shadow: { color: '#000000', blur: 60, x: -40, y: 40, opacity: 0 },
    adjust: { brightness: 200, contrast: 0, blur: 20, grayscale: 100 },
  }
);
// a non-number never becomes 0 by coercion
assert.equal(normalizeEffects({ opacity: null }, 'shape').opacity, 1);

// presetToShadow
assert.equal(presetToShadow('none'), null);
assert.equal(presetToShadow('bogus'), null);
assert.deepEqual(presetToShadow('soft'), { color: '#000000', blur: 8, x: 0, y: 2, opacity: 0.55 });
assert.deepEqual(presetToShadow('hard'), { color: '#000000', blur: 0, x: 0, y: 3, opacity: 0.65 });
assert.deepEqual(presetToShadow('gold'), { color: '#f4c24a', blur: 8, x: 0, y: 2, opacity: 0.6 });
assert.deepEqual(presetToShadow('glow'), { color: '#f4c24a', blur: 14, x: 0, y: 1, opacity: 0.6 });
assert.notEqual(presetToShadow('soft'), presetToShadow('soft'), 'a fresh object each call');

// effectsOf: text migration and un-normalised elements
assert.deepEqual(effectsOf('text', { style: { shadow: 'gold' } }).shadow, presetToShadow('gold'));
assert.equal(effectsOf('text', { effects: { shadow: null }, style: { shadow: 'gold' } }).shadow, null);
assert.deepEqual(
  effectsOf('text', { effects: { shadow: { color: '#ff0000', blur: 1, x: 0, y: 0, opacity: 1 } }, style: { shadow: 'gold' } }).shadow,
  { color: '#ff0000', blur: 1, x: 0, y: 0, opacity: 1 }
);
assert.deepEqual(effectsOf('image', {}).shadow, normalizeEffects(undefined, 'image').shadow);
assert.equal(effectsOf('shape', undefined).opacity, 1);

// resolveEffectsCss: cqh conversion, omissions
assert.deepEqual(resolveEffectsCss(normalizeEffects(undefined, 'logo')), {
  filter: 'drop-shadow(0cqh 0.3704cqh 1.2963cqh rgba(0, 0, 0, 0.55))',
});
assert.deepEqual(resolveEffectsCss(normalizeEffects({ opacity: 0.5 }, 'shape')), { opacity: 0.5 });
assert.deepEqual(resolveEffectsCss(normalizeEffects(undefined, 'shape')), {});
assert.equal(
  resolveEffectsCss(normalizeEffects({ shadow: { color: '#ffffff', blur: 0, x: -10.8, y: 0, opacity: 1 } }, 'shape')).filter,
  'drop-shadow(-1cqh 0cqh 0cqh #ffffff)'
);

// resolvePictureFilter: order, neutral values left out
assert.deepEqual(resolvePictureFilter(normalizeEffects(undefined, 'image')), {});
assert.deepEqual(
  resolvePictureFilter(normalizeEffects({ adjust: { brightness: 120, contrast: 100, grayscale: 50, blur: 5.4 } }, 'image')),
  { filter: 'brightness(120%) grayscale(50%) blur(0.5cqh)' }
);
assert.deepEqual(
  resolvePictureFilter(normalizeEffects({ adjust: { brightness: 50, contrast: 150, grayscale: 0, blur: 0 } }, 'image')),
  { filter: 'brightness(50%) contrast(150%)' }
);

// withEffects: a gradient text's own opacity multiplies with the element's
assert.deepEqual(withEffects({ opacity: 0.5, color: 'red' }, normalizeEffects({ opacity: 0.5 }, 'shape')), {
  opacity: 0.25,
  color: 'red',
});
assert.deepEqual(withEffects({ color: 'red' }, normalizeEffects(undefined, 'shape')), { color: 'red' });

// ---- copy / paste style
const text = {
  fontSize: 3,
  boxWidth: 40,
  bulletList: true,
  style: { fontFamily: 'lora', weight: 700, fill: solidFill('#ff0000'), italic: true, shadow: 'soft' },
  effects: { opacity: 0.8, shadow: null },
};
const frame = {
  kind: 'frame',
  radius: 4,
  fill: imageFill('a.jpg'),
  stroke: { color: '#000000', width: 2, style: 'solid' },
};
const rect = {
  kind: 'rectangle',
  radius: 12,
  fill: solidFill('#00ff00'),
  stroke: { color: '#ffffff', width: 3, style: 'dashed' },
};
const zigzag = { kind: 'zigzag', radius: 0, fill: solidFill('#c9a03c', 0), stroke: { color: '#c9a03c', width: 2 } };
const image = { url: 'b.jpg', effects: { adjust: { brightness: 150 } } };

// text -> photo frame: effects only; the photo, radius and border stay
const textOnFrame = applyStyle(frame, 'shape', styleSnapshot('text', text));
assert.equal(textOnFrame.effects.opacity, 0.8);
assert.equal(textOnFrame.effects.shadow, null);
assert.deepEqual(textOnFrame.fill, frame.fill);
assert.equal(textOnFrame.radius, 4);
assert.deepEqual(textOnFrame.stroke, frame.stroke);
assert.equal(textOnFrame.style, undefined);

// shape -> frame: radius and border yes, the frame's photo never replaced
const rectOnFrame = applyStyle(frame, 'shape', styleSnapshot('shape', rect));
assert.equal(rectOnFrame.radius, 12);
assert.deepEqual(rectOnFrame.fill, frame.fill);
assert.deepEqual(rectOnFrame.stroke, rect.stroke);

// frame -> plain shape: a photo is never pasted
assert.deepEqual(applyStyle(rect, 'shape', styleSnapshot('shape', frame)).fill, rect.fill);

// plain shape -> plain shape: the fill is copied
assert.deepEqual(
  applyStyle({ ...rect, fill: solidFill('#123456') }, 'shape', styleSnapshot('shape', rect)).fill,
  rect.fill
);

// adjustments only travel between two pictures
assert.equal(applyStyle(frame, 'shape', styleSnapshot('image', image)).effects.adjust.brightness, 150);
assert.equal(applyStyle(rect, 'shape', styleSnapshot('image', image)).effects.adjust.brightness, 100);

// text -> text: typography merged; size, box width and bullets untouched
const target = { fontSize: 9, boxWidth: 80, bulletList: false, style: { fontFamily: 'inter', weight: 400, underline: true } };
const pastedText = applyStyle(target, 'text', styleSnapshot('text', text));
assert.equal(pastedText.style.fontFamily, 'lora');
assert.equal(pastedText.style.weight, 700);
assert.equal(pastedText.style.italic, true);
assert.equal(pastedText.style.underline, false);
assert.deepEqual(pastedText.style.outline, { width: 0, color: '#000000' });
assert.equal(pastedText.fontSize, 9);
assert.equal(pastedText.boxWidth, 80);
assert.equal(pastedText.bulletList, false);

// a zigzag's stroke is its line, not a border: never overwritten
assert.deepEqual(applyStyle(zigzag, 'shape', styleSnapshot('shape', rect)).stroke, zigzag.stroke);
// an image with no stroke yet copies the default border
assert.deepEqual(applyStyle({ url: 'c.jpg' }, 'image', styleSnapshot('image', image)).stroke, MEDIA_STROKE);

// pasting onto two targets never shares objects between them
const snapshot = styleSnapshot('shape', rect);
assert.notEqual(applyStyle(frame, 'shape', snapshot).stroke, applyStyle(frame, 'shape', snapshot).stroke);

console.log('effectStyle: all checks passed');
```

- [ ] **Step 3: Run it and check it fails**

Run: `node src/lib/effectStyle.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `effectStyle.js`.

- [ ] **Step 4: Write `src/lib/effectStyle.js`**

```js
/*
 * Opacity, drop shadow and picture adjustments for every board element -
 * shared by the editor canvas, the live board and the template preview, the
 * same contract as textStyle.js / shapeStyle.js.
 *
 *   effects: {
 *     opacity: 0-1,
 *     shadow: { color, blur, x, y, opacity } | null,   // null = explicitly off
 *     adjust: { brightness, contrast, blur, grayscale },
 *   }
 *
 * Shadow sizes and the adjustment blur are px on a 1920x1080 board, drawn in
 * cqh (px / 10.8) so a shadow keeps its proportions in the editor's canvas
 * and on the full-size screen alike.
 *
 * Renderers always go through effectsOf(): elements that never passed the
 * load normalisers (just added, a Reset board, a template thumbnail) have no
 * `effects` yet and still need their kind's defaults.
 */

import { normalizeHex, withAlpha } from './fill.js';
import { MEDIA_STROKE } from './shapeStyle.js';

export const DEFAULT_ADJUST = { brightness: 100, contrast: 100, blur: 0, grayscale: 0 };

/* What the live board used to hard-code, so boards saved before effects
   existed look unchanged. Kinds not listed default to no shadow. */
export const DEFAULT_SHADOWS = {
  logo: { color: '#000000', blur: 14, x: 0, y: 4, opacity: 0.55 },
  image: { color: '#000000', blur: 14, x: 0, y: 4, opacity: 0.45 },
  video: { color: '#000000', blur: 14, x: 0, y: 4, opacity: 0.45 },
  divider: { color: '#c9a03c', blur: 10, x: 0, y: 0, opacity: 0.28 },
};

/* What the Shadow toggle turns on for a kind with no default of its own. */
export const FALLBACK_SHADOW = { color: '#000000', blur: 12, x: 0, y: 4, opacity: 0.5 };

/* The old text shadow presets as single shadows. Glow was two stacked
   shadows and becomes the closest single one - accepted in design review. */
const PRESET_SHADOWS = {
  soft: { color: '#000000', blur: 8, x: 0, y: 2, opacity: 0.55 },
  hard: { color: '#000000', blur: 0, x: 0, y: 3, opacity: 0.65 },
  gold: { color: '#f4c24a', blur: 8, x: 0, y: 2, opacity: 0.6 },
  glow: { color: '#f4c24a', blur: 14, x: 0, y: 1, opacity: 0.6 },
};

/* The text style fields copy/paste style carries - not size, box width or bullets. */
const TEXT_STYLE_KEYS = ['fontFamily', 'weight', 'textCase', 'letterSpacing', 'lineHeight', 'align', 'fill'];

function clamp(value, min, max, fallback) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function cqh(px) {
  return `${+(px / 10.8).toFixed(4)}cqh`;
}

function normalizeShadow(shadow) {
  return {
    color: normalizeHex(shadow.color) ?? '#000000',
    blur: clamp(shadow.blur, 0, 60, 0),
    x: clamp(shadow.x, -40, 40, 0),
    y: clamp(shadow.y, -40, 40, 0),
    opacity: clamp(shadow.opacity, 0, 1, 0.5),
  };
}

/** An old text shadow preset key as a shadow object, or null for none/unknown. */
export function presetToShadow(key) {
  const shadow = PRESET_SHADOWS[key];
  return shadow ? { ...shadow } : null;
}

/** Clamps every field and fills in `fallbackShadow` when no shadow is stored. */
export function normalizeEffects(effects, kind, fallbackShadow = DEFAULT_SHADOWS[kind] ?? null) {
  const source = effects && typeof effects === 'object' ? effects : {};
  const adjust = source.adjust && typeof source.adjust === 'object' ? source.adjust : {};

  let shadow = fallbackShadow ? normalizeShadow(fallbackShadow) : null;
  if (source.shadow === null) shadow = null;
  else if (source.shadow && typeof source.shadow === 'object') shadow = normalizeShadow(source.shadow);

  return {
    opacity: clamp(source.opacity, 0, 1, 1),
    shadow,
    adjust: {
      brightness: clamp(adjust.brightness, 0, 200, 100),
      contrast: clamp(adjust.contrast, 0, 200, 100),
      blur: clamp(adjust.blur, 0, 20, 0),
      grayscale: clamp(adjust.grayscale, 0, 100, 0),
    },
  };
}

/**
 * An element's effects, complete. A text with no stored shadow takes its old
 * `style.shadow` preset; every other kind takes DEFAULT_SHADOWS.
 */
export function effectsOf(kind, element) {
  const fallback = kind === 'text' ? presetToShadow(element?.style?.shadow) : DEFAULT_SHADOWS[kind] ?? null;
  return normalizeEffects(element?.effects, kind, fallback);
}

/** Opacity and drop shadow, for the effects layer. */
export function resolveEffectsCss(effects) {
  const css = {};
  if (effects.opacity < 1) css.opacity = effects.opacity;

  const { shadow } = effects;
  if (shadow) {
    css.filter = `drop-shadow(${cqh(shadow.x)} ${cqh(shadow.y)} ${cqh(shadow.blur)} ${withAlpha(shadow.color, shadow.opacity)})`;
  }

  return css;
}

/** Brightness, contrast, greyscale and blur, for the <img>/<video> itself. */
export function resolvePictureFilter(effects) {
  const { brightness, contrast, grayscale, blur } = effects.adjust;
  const parts = [
    brightness !== 100 && `brightness(${brightness}%)`,
    contrast !== 100 && `contrast(${contrast}%)`,
    grayscale !== 0 && `grayscale(${grayscale}%)`,
    blur !== 0 && `blur(${cqh(blur)})`,
  ].filter(Boolean);

  return parts.length ? { filter: parts.join(' ') } : {};
}

/*
 * Effects merged onto a node that already has a style of its own - a text,
 * whose gradient fill sets `opacity` too. The two multiply rather than one
 * replacing the other.
 */
export function withEffects(style, effects) {
  const css = resolveEffectsCss(effects);
  const opacity = (style.opacity ?? 1) * (css.opacity ?? 1);
  return { ...style, ...css, ...(opacity < 1 ? { opacity } : {}) };
}

/** Whether the element shows a picture, so its adjustments apply. */
export function showsPicture(kind, element) {
  if (kind === 'logo' || kind === 'image' || kind === 'video') return true;
  return kind === 'shape' && (element?.fill?.type === 'image' || element?.fill?.type === 'video');
}

/* A zigzag's stroke is its drawn line, not a border, so it never takes part. */
function hasBorder(kind, element) {
  return kind === 'image' || kind === 'video' || (kind === 'shape' && element?.kind !== 'zigzag');
}

function isPictureFill(fill) {
  return fill?.type === 'image' || fill?.type === 'video';
}

/** What Copy style takes from an element - detached, so later edits don't leak in. */
export function styleSnapshot(kind, element) {
  const snapshot = { kind, effects: effectsOf(kind, element), showsPicture: showsPicture(kind, element) };

  if (hasBorder(kind, element)) snapshot.stroke = { ...MEDIA_STROKE, ...element.stroke };

  if (kind === 'text') {
    const style = element.style ?? {};
    snapshot.textStyle = {
      ...Object.fromEntries(TEXT_STYLE_KEYS.filter((key) => style[key] !== undefined).map((key) => [key, style[key]])),
      italic: style.italic === true,
      underline: style.underline === true,
      outline: style.outline ?? { width: 0, color: '#000000' },
    };
  }

  if (kind === 'shape') snapshot.shapeStyle = { fill: element.fill, radius: element.radius };

  return structuredClone(snapshot);
}

/*
 * Paste style: `snapshot` applied to one element. Opacity and shadow always
 * travel; adjustments only between two pictures; a border only between two
 * elements that have one; typography text to text; a shape's radius shape
 * to shape, and its fill only when neither side is a photo or video - a
 * frame's picture is never replaced and a picture is never pasted.
 */
export function applyStyle(element, kind, snapshot) {
  const source = structuredClone(snapshot);
  const next = {
    ...element,
    effects: {
      opacity: source.effects.opacity,
      shadow: source.effects.shadow,
      adjust:
        source.showsPicture && showsPicture(kind, element)
          ? source.effects.adjust
          : effectsOf(kind, element).adjust,
    },
  };

  if (source.stroke && hasBorder(kind, element)) next.stroke = source.stroke;
  if (source.textStyle && kind === 'text') next.style = { ...element.style, ...source.textStyle };

  if (source.shapeStyle && kind === 'shape') {
    next.radius = source.shapeStyle.radius;
    if (!isPictureFill(source.shapeStyle.fill) && !isPictureFill(element.fill)) {
      next.fill = source.shapeStyle.fill;
    }
  }

  return next;
}
```

- [ ] **Step 5: Run the tests and check they pass**

Run: `node src/lib/effectStyle.test.js`
Expected: `effectStyle: all checks passed`

- [ ] **Step 6: Checkpoint**

Run all unit checks: `node src/lib/photoCrop.test.js && node src/lib/boardGeometry.test.js && node src/lib/boardTransform.test.js && node src/lib/effectStyle.test.js`. All four pass. Do not commit.

---

### Task 2: Border styles and text styles in the shared helpers

**Files:**
- Modify: `src/lib/shapeStyle.js`
- Modify: `src/lib/textStyle.js`
- Test: `src/lib/effectStyle.test.js` (append)

**Interfaces:**
- Consumes: `MEDIA_STROKE` (Task 1).
- Produces:
  - `STROKE_STYLES: [{ value, label }]` (solid, dashed, dotted)
  - `normalizeStroke(stroke, fallback) → { color, width, style }`
  - `strokeCss(stroke) → { border? }`
  - `resolveTextStyle` now emits `fontStyle`, `textDecoration`, `textDecorationColor` and `WebkitTextStroke`, and **no** `filter`
  - `normalizeTextStyle` now always returns `italic: boolean`, `underline: boolean` and `outline: { width, color }`

- [ ] **Step 1: Append the failing tests**

Add to `src/lib/effectStyle.test.js`, just above the final `console.log`, and add the new imports to the top of the file:

```js
import { normalizeShapes, normalizeStroke, resolveShapeStyle, strokeCss } from './shapeStyle.js';
import { DEFAULT_EXTRA_TEXT_STYLE, normalizeTextStyle, resolveTextStyle } from './textStyle.js';
```

(Merge `MEDIA_STROKE` into the same `shapeStyle.js` import line.)

```js
// ---- borders
assert.deepEqual(normalizeStroke({ color: '#ffffff', width: 3, style: 'dashed' }, MEDIA_STROKE), {
  color: '#ffffff',
  width: 3,
  style: 'dashed',
});
assert.equal(normalizeStroke({ width: 3, style: 'wavy' }, MEDIA_STROKE).style, 'solid');
assert.deepEqual(normalizeStroke(undefined, MEDIA_STROKE), MEDIA_STROKE);
assert.equal(normalizeStroke({ width: 99 }, MEDIA_STROKE).width, 40);
assert.deepEqual(strokeCss({ width: 3, style: 'dotted', color: '#ffffff' }), { border: '3px dotted #ffffff' });
assert.deepEqual(strokeCss({ width: 3, color: '#ffffff' }), { border: '3px solid #ffffff' });
assert.deepEqual(strokeCss({ width: 0, style: 'dotted', color: '#ffffff' }), {});
assert.deepEqual(strokeCss(undefined), {});

const [dashedRect] = normalizeShapes([
  { id: 'a', kind: 'rectangle', x: 50, y: 50, width: 10, height: 10, stroke: { color: '#000000', width: 2, style: 'dashed' } },
]);
assert.equal(dashedRect.stroke.style, 'dashed');
assert.equal(resolveShapeStyle(dashedRect).border, '2px dashed #000000');
const [zig] = normalizeShapes([{ id: 'z', kind: 'zigzag', x: 50, y: 50, width: 10, height: 2, stroke: { color: '#000000', width: 2 } }]);
assert.equal(resolveShapeStyle(zig).border, undefined);

// ---- text styles
const styled = resolveTextStyle({
  fontSize: 2,
  style: normalizeTextStyle(
    { italic: true, underline: true, outline: { width: 5.4, color: '#ff0000' } },
    DEFAULT_EXTRA_TEXT_STYLE
  ),
});
assert.equal(styled.fontStyle, 'italic');
assert.equal(styled.textDecoration, 'underline');
assert.equal(styled.WebkitTextStroke, '0.5cqh #ff0000');
assert.equal(styled.filter, undefined, 'shadows moved to effects');

const plain = resolveTextStyle({ fontSize: 2, style: normalizeTextStyle({}, DEFAULT_EXTRA_TEXT_STYLE) });
assert.equal(plain.fontStyle, undefined);
assert.equal(plain.textDecoration, undefined);
assert.equal(plain.WebkitTextStroke, undefined);

const goldUnderline = resolveTextStyle({
  fontSize: 2,
  style: normalizeTextStyle(
    {
      underline: true,
      fill: { type: 'gradient', gradient: 'linear', angle: 0, stops: [{ color: '#fff5b8', position: 0 }, { color: '#c68b22', position: 100 }] },
    },
    DEFAULT_EXTRA_TEXT_STYLE
  ),
});
assert.equal(goldUnderline.textDecorationColor, '#fff5b8');

assert.deepEqual(normalizeTextStyle({ outline: { width: 99, color: 'x' } }, DEFAULT_EXTRA_TEXT_STYLE).outline, {
  width: 8,
  color: '#000000',
});
assert.equal(normalizeTextStyle({ italic: 'yes' }, DEFAULT_EXTRA_TEXT_STYLE).italic, false);
```

- [ ] **Step 2: Run it and check it fails**

Run: `node src/lib/effectStyle.test.js`
Expected: FAIL. `normalizeStroke` is not exported (a SyntaxError about the missing export).

- [ ] **Step 3: Implement the stroke helpers in `src/lib/shapeStyle.js`**

Under `MEDIA_STROKE`, add:

```js
export const STROKE_STYLES = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
];

const STROKE_STYLE_VALUES = new Set(STROKE_STYLES.map((entry) => entry.value));
```

After the existing `clamp` function, add:

```js
/* A border - shapes, frames, photos and videos all carry one. */
export function normalizeStroke(stroke, fallback) {
  return {
    color: stroke?.color ?? fallback.color,
    width: clamp(stroke?.width ?? 0, 0, 40),
    style: STROKE_STYLE_VALUES.has(stroke?.style) ? stroke.style : 'solid',
  };
}

/** The CSS border a stroke draws, or nothing at width 0. */
export function strokeCss(stroke) {
  return stroke?.width > 0 ? { border: `${stroke.width}px ${stroke.style ?? 'solid'} ${stroke.color}` } : {};
}
```

In `normalizeShapes`, replace the `stroke: { color: ..., width: ... },` block with:

```js
        stroke: normalizeStroke(shape.stroke, BASE_SHAPE.stroke),
```

In `resolveShapeStyle`, replace the `...(shape.stroke.width > 0 && !isZigzag(shape) ? { border: ... } : {}),` expression with:

```js
    ...(isZigzag(shape) ? {} : strokeCss(shape.stroke)),
```

Keep the comment above it ("the zigzag's stroke is the drawn line…").

- [ ] **Step 4: Implement the text styles in `src/lib/textStyle.js`**

Change the fill import to also bring in `normalizeHex`:

```js
import { BOARD_GOLD_FILL, fillTextCss, normalizeFill, normalizeHex, solidFill } from './fill.js';
```

In `normalizeTextStyle`, before `return merged;`:

```js
  merged.italic = merged.italic === true;
  merged.underline = merged.underline === true;
  const outlineWidth = merged.outline?.width;
  merged.outline = {
    width: Number.isFinite(outlineWidth) ? Math.min(8, Math.max(0, outlineWidth)) : 0,
    color: normalizeHex(merged.outline?.color) ?? '#000000',
  };
```

In `resolveTextStyle`, delete the line `filter: SHADOW_FILTERS[style.shadow] ?? 'none',`. The shadow now comes from `effects` via `withEffects`. Just above `...fillTextCss(style.fill),` add:

```js
    ...(style.italic ? { fontStyle: 'italic' } : {}),
    /* A gradient paints through transparent glyphs, so the underline takes
       its first colour - it would otherwise be invisible too. */
    ...(style.underline
      ? {
          textDecoration: 'underline',
          ...(style.fill?.type === 'gradient' ? { textDecorationColor: style.fill.stops?.[0]?.color } : {}),
        }
      : {}),
    /* board px, drawn in cqh like shadows (see effectStyle.js) */
    ...(style.outline?.width > 0
      ? { WebkitTextStroke: `${+(style.outline.width / 10.8).toFixed(4)}cqh ${style.outline.color}` }
      : {}),
```

Update the `resolveTextStyle` doc comment's first line to say "typography, fill, and the board-relative font size; shadows come from effects (effectStyle.js)".

- [ ] **Step 5: Run the tests and check they pass**

Run: `node src/lib/effectStyle.test.js`
Expected: `effectStyle: all checks passed`

- [ ] **Step 6: Checkpoint**

Run all four unit checks (the command from Task 1 Step 6) and `npm run build`. All pass, and the build succeeds. Do not commit.

---

### Task 3: Normalisers keep `effects`; text shadow migration

**Files:**
- Modify: `src/lib/boardLayout.js`

**Interfaces:**
- Consumes: `effectsOf` (Task 1); `MEDIA_STROKE`, `normalizeStroke` (Tasks 1–2).
- Produces: every element in a *loaded* layout carries a complete `effects`; images and videos carry a normalised `stroke`; texts carry `effects.shadow` and no `style.shadow`.

`boardLayout.js` imports Firebase, so it can't run under node. It's checked by the build here and by the browser check in Task 9. The migration rules themselves are unit-tested through `effectsOf` in Task 1.

- [ ] **Step 1: Imports**

```js
import { MEDIA_STROKE, normalizeShapes, normalizeStroke } from './shapeStyle';
import { effectsOf } from './effectStyle';
```

(replacing the existing `import { normalizeShapes } from './shapeStyle';`).

- [ ] **Step 2: `normalizeText`**

Change the body so the style is normalised first, the shadow is migrated from it, and then the preset key is dropped:

```js
function normalizeText(text, base = DEFAULT_EXTRA_TEXT_STYLE, baseSize = DEFAULT_TEXT_SIZES.extra) {
  const style = normalizeTextStyle(text.style, base);
  /* A text saved before effects existed keeps its shadow preset as a real
     shadow; after that, effects.shadow is the only source - see effectStyle.js. */
  const effects = effectsOf('text', { effects: text.effects, style });
  delete style.shadow;

  return {
    // ...every existing field unchanged, except:
    style,
    effects,
    animation: normalizeAnimation(text.animation),
    ...(text.groupId ? { groupId: text.groupId } : {}),
  };
}
```

Keep every other returned field exactly as it is today (`id`, `text`, `x`, `y`, `fontSize`, `visible`, `locked`, `boxWidth`, `rotation`, `bulletList`). `normalizeTextStyle` builds a fresh object, so `delete` doesn't touch the base defaults. `DEFAULT_*_STYLE` keep their `shadow` keys: they are the conversion source for new texts and old data.

- [ ] **Step 3: Dividers and boxes**

In `normalizeDividers`, add to the mapped object (after `locked`):

```js
      effects: effectsOf('divider', item),
```

Give `normalizeBox` a third parameter and add `effects` to its returned object:

```js
function normalizeBox(box, defaults, kind) {
  const source = box && typeof box === 'object' ? box : {};

  return {
    visible: source.visible !== false,
    locked: source.locked === true,
    effects: effectsOf(kind, source),
    // ...rest unchanged
```

Update both callers in `normalizeLayout`:

```js
    candidates: normalizeBox(parsed.candidates, DEFAULT_CANDIDATES, 'candidates'),
    announcements: normalizeBox(parsed.announcements, DEFAULT_ANNOUNCEMENTS, 'announcements'),
```

- [ ] **Step 4: Images, videos, logo and shapes**

Replace `normalizeImages` with a helper both media lists share:

```js
/* A dropped-in photo or video. Positions and sizing are left as loosely
   checked as they always were here; the newer fields are validated. */
function normalizeMedia(items, kind) {
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => item && typeof item === 'object' && item.id)
    .map((item) => ({
      ...item,
      stroke: normalizeStroke(item.stroke, MEDIA_STROKE),
      effects: effectsOf(kind, item),
      animation: normalizeAnimation(item.animation),
    }));
}
```

In `normalizeLayout`:

```js
    logo: {
      ...DEFAULT_LAYOUT.logo,
      ...(parsed.logo ?? {}),
      effects: effectsOf('logo', parsed.logo),
      animation: normalizeAnimation(parsed.logo?.animation),
    },
    // ...
    images: normalizeMedia(parsed.images, 'image'),
    videos: normalizeMedia(parsed.videos, 'video'),
    shapes: normalizeShapes(parsed.shapes).map((shape) => ({ ...shape, effects: effectsOf('shape', shape) })),
```

Videos now also get `normalizeAnimation`. They never had it, and the editor already reads `video.animation` through `normalizeAnimation`-shaped defaults, so this is a pure fix. `DEFAULT_LAYOUT` itself is not changed: raw defaults fall back through `effectsOf` at render time.

- [ ] **Step 5: Verify**

Run: `npm run build`
Expected: the build succeeds with no errors.

Run: `node src/lib/effectStyle.test.js`
Expected: passes (no regression).

- [ ] **Step 6: Checkpoint**

Do not commit.

---

### Task 4: Hook actions: `setEffects`, `setStroke`, `pasteStyle`

**Files:**
- Modify: `src/lib/useBoardLayoutEditor.js`

**Interfaces:**
- Consumes: `effectsOf`, `normalizeEffects`, `applyStyle` (Task 1); `MEDIA_STROKE` (Task 1).
- Produces (on the returned editor object):
  - `setEffects(kind, id, patch)`, where `patch` is `{ opacity?, shadow?: object | null, adjust?: object }`;
  - `setStroke(kind, id, patch)`, where `patch` is `{ color?, width?, style? }`;
  - `pasteStyle(selection, snapshot) → number` (how many elements were styled).

  `setShapeStroke` is **removed**; its only callers are the border row that Task 7 replaces.

- [ ] **Step 1: Imports**

```js
import { MEDIA_STROKE, createShape } from './shapeStyle';
import { applyStyle, effectsOf, normalizeEffects } from './effectStyle';
```

(The first replaces `import { createShape } from './shapeStyle';`.)

- [ ] **Step 2: Replace `setShapeStroke` with `setStroke`, and add `setEffects`**

Delete the `setShapeStroke` function and put these in its place:

```js
  /* Merges `patch` into the border of a shape, photo or video. Photos and
     videos added before borders existed start from MEDIA_STROKE. */
  function setStroke(kind, id, patch) {
    commitFrom((current) => {
      const element = findElement(current, kind, id);
      if (!element) return current;
      return patchElement(current, kind, id, { stroke: { ...MEDIA_STROKE, ...element.stroke, ...patch } });
    });
  }

  /*
   * Opacity replaces; shadow and adjust merge into what's there, and
   * `shadow: null` turns the shadow off. Starts from effectsOf so an element
   * that hasn't been through a load yet edits from its real defaults.
   */
  function setEffects(kind, id, patch) {
    commitFrom((current) => {
      const element = findElement(current, kind, id);
      if (!element) return current;

      const effects = effectsOf(kind, element);
      const shadow =
        'shadow' in patch ? patch.shadow && { ...(effects.shadow ?? {}), ...patch.shadow } : effects.shadow;

      return patchElement(current, kind, id, {
        effects: normalizeEffects(
          { opacity: patch.opacity ?? effects.opacity, shadow, adjust: { ...effects.adjust, ...patch.adjust } },
          kind
        ),
      });
    });
  }
```

`normalizeEffects` is given an explicit `shadow` (an object or `null`) here, so the kind's fallback never overrides the admin's choice.

- [ ] **Step 3: Add `pasteStyle`**

Put this after `setLockedMany`:

```js
  /* Paste style onto every unlocked element of `selection`, as one undo
     step. Returns how many were styled. */
  function pasteStyle(selection, snapshot) {
    const targets = selection.filter(({ kind, id }) => {
      const element = findElement(latestLayoutRef.current, kind, id);
      return element && !element.locked;
    });
    if (!targets.length) return 0;

    commitFrom((current) =>
      targets.reduce(
        (next, { kind, id }) => patchElement(next, kind, id, applyStyle(findElement(next, kind, id), kind, snapshot)),
        current
      )
    );

    return targets.length;
  }
```

- [ ] **Step 4: Export**

In the returned object, replace `setShapeStroke,` with:

```js
    setStroke,
    setEffects,
    pasteStyle,
```

- [ ] **Step 5: Verify**

Run: `npm run build`, then `grep -rn "setShapeStroke" src`
Expected: the build succeeds (a missing method only fails at runtime). Grep finds exactly the two call sites in `AdminVisualBoard.jsx`'s shape Border row, which Task 7 replaces. Until then the shape Border slider throws, so no browser testing of borders before Task 7.

- [ ] **Step 6: Checkpoint**

Do not commit.

---

### Task 5: `MediaPicture` and the live board's layers

**Files:**
- Create: `src/components/MediaPicture.jsx`
- Modify: `src/pages/VisualBoard.jsx`
- Modify: `src/styles/globals.css`

**Interfaces:**
- Consumes: `effectsOf`, `resolveEffectsCss`, `resolvePictureFilter`, `withEffects` (Task 1); `strokeCss` (Task 2).
- Produces:
  - `<MediaPicture kind element src alt? />`, where `kind` is `'logo' | 'image' | 'video'`;
  - the CSS class `.vb-effects-layer` (the middle layer: `position: absolute; inset: 0`, centred flex);
  - the custom property `--vb-picture-filter`, read by any `img`/`video` inside `.vb-shape-fill`;
  - `.vb-shape-fill` is now `position: relative` and is used on both pages.

- [ ] **Step 1: Capture a baseline of the live board (before changing anything)**

Start the dev server (`npm run dev`, then open the URL it prints, usually `http://localhost:5173`). With the Playwright plugin, resize to 1600×900, open `/visual`, wait for the board to render, and evaluate:

```js
() => [...document.querySelectorAll('main > div[style*="container-type"] > *')].map((node) => {
  const r = node.getBoundingClientRect();
  return [node.tagName, Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
})
```

Save the output to the scratchpad as `baseline-rects.json`. Candidates and announcements content animates, but their outer boxes don't.

- [ ] **Step 2: Create `src/components/MediaPicture.jsx`**

```jsx
import { effectsOf, resolveEffectsCss, resolvePictureFilter } from '../lib/effectStyle';
import { strokeCss } from '../lib/shapeStyle';

/*
 * The logo, a photo or a video, drawn the same way in the editor and on
 * /visual. The wrapper carries the border, opacity and drop shadow; the
 * picture inside carries brightness/contrast/greyscale/blur, so those never
 * grey or blur the border. overflow: hidden keeps a blurred picture inside
 * its edges - the shadow is the wrapper's own filter, so it isn't clipped.
 * Styles are inline because /visual has no editor CSS to lean on.
 */
export default function MediaPicture({ kind, element, src, alt = '' }) {
  const effects = effectsOf(kind, element);
  const pictureStyle = { display: 'block', width: '100%', height: 'auto', ...resolvePictureFilter(effects) };

  return (
    <div
      style={{
        width: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box',
        /* a transparent PNG - a border would outline its empty space */
        ...(kind === 'logo' ? {} : strokeCss(element.stroke)),
        ...resolveEffectsCss(effects),
      }}
    >
      {kind === 'video' ? (
        <video src={src} style={pictureStyle} muted loop autoPlay playsInline />
      ) : (
        <img src={src} alt={alt} style={pictureStyle} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: CSS**

In `src/styles/globals.css`, change the `.vb-shape-fill` rule (under "shapes and photo frames on the canvas") to add `position: relative;`, and update its comment so it notes that the live board uses it too. That also fixes a frame's photo covering its own border in the editor: `PhotoAdjuster` is `absolute inset-0` against the nearest positioned ancestor, which used to be the unbordered `.vb-shape`. Directly after it, add:

```css
/*
 * The middle of every element's three layers - position/animation, then
 * this (opacity + drop shadow, see effectStyle.js), then the content - so
 * opacity and shadows never share a node with an animation or a triangle's
 * clip-path. Used by the editor and /visual alike.
 */
.vb-effects-layer {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* A shape's picture adjustments, set as a variable on its effects layer so
   PhotoAdjuster, VideoAdjuster and PhotoCarousel need no extra props. */
.vb-shape-fill img,
.vb-shape-fill video {
  filter: var(--vb-picture-filter, none);
}
```

- [ ] **Step 4: Live board imports**

In `src/pages/VisualBoard.jsx`:

```jsx
import { effectsOf, resolveEffectsCss, resolvePictureFilter, withEffects } from "../lib/effectStyle";
import MediaPicture from "../components/MediaPicture";
```

- [ ] **Step 5: Candidates and announcements**

In `renderCandidatesLayer`, change the outer `className` from `"absolute [container-type:size]"` to `"absolute"`. The cqh in its shadow must resolve against the board, and `CandidateBoard`'s own root is already a size container for its cards. Then wrap `<CandidateBoard …/>`:

```jsx
        <div className="vb-effects-layer" style={resolveEffectsCss(effectsOf("candidates", box))}>
          <CandidateBoard ... />
        </div>
```

In `renderAnnouncementsLayer`, wrap `<AnnouncementBanner …/>` the same way, with `effectsOf("announcements", box)`.

- [ ] **Step 6: Divider**

In `renderDividerLayer`, delete the `boxShadow: "0 0 10px rgba(201,160,60,0.28)",` line. Replace it with `...resolveEffectsCss(effectsOf("divider", divider)),` (the default divider shadow reproduces it).

- [ ] **Step 7: Shapes**

Replace the `if (entry.kind === "shape") { … }` block's returned JSX:

```jsx
      const { left, top, width, height, transform, ...fillStyle } = resolveShapeStyle(shape);
      const effects = effectsOf("shape", shape);

      return (
        <div key={shape.id} className="absolute" style={{ left, top, width, height, transform }}>
          <div
            className="vb-effects-layer"
            style={{ ...resolveEffectsCss(effects), "--vb-picture-filter": resolvePictureFilter(effects).filter }}
          >
            <div className="vb-shape-fill" style={fillStyle}>
              {/* the existing zigzag / carousel / adjuster children, unchanged */}
            </div>
          </div>
        </div>
      );
```

- [ ] **Step 8: Logo, image, video**

Replace each `<img …>` or `<video …>` with a positioned `div` around a `MediaPicture`. The hard-coded Tailwind `drop-shadow-[…]` classes go: they are now each kind's default shadow.

```jsx
      return (
        <div
          key="logo"
          className="absolute"
          style={{
            ...scaledPositionStyle(layout.logo, LOGO_BASE_WIDTH),
            ...resolveAnimationCss(layout.logo.animation),
          }}
        >
          <MediaPicture kind="logo" element={layout.logo} src={layout.logo.url || "/visual/logo.png"} alt="Hyacinth" />
        </div>
      );
```

Images use `key={image.id}`, `scaledPositionStyle(image, PHOTO_BASE_WIDTH)`, `resolveAnimationCss(image.animation)` and `<MediaPicture kind="image" element={image} src={image.url} />`. Videos do the same with `video` and `kind="video"`.

- [ ] **Step 9: Text**

Split the `<p>` into a positioned wrapper and the text node:

```jsx
      /*
       * The wrapper takes position, rotation and animation; the <p> takes
       * the text and its effects. `max-content` keeps the wrapper exactly
       * the text's size (an absolute box otherwise shrinks to the space left
       * of its `left`, which throws the centring off), and flex drops the
       * inline-block's baseline gap - the same box the editor's button gives it.
       */
      return (
        <div
          key={text.id}
          className="absolute flex"
          style={{ ...positionStyle(text), width: "max-content", ...resolveAnimationCss(text.animation) }}
        >
          <p style={withEffects(resolveTextStyle(text), effectsOf("text", text))}>
            <TextContent text={text} />
          </p>
        </div>
      );
```

- [ ] **Step 10: Compare against the baseline**

With the dev server running, repeat Step 1's evaluate at the same size and compare it with `baseline-rects.json`.
Expected: same count and same boxes, within ±2 px (a shadow doesn't change a layout box). The only intended difference is `IMG`/`VIDEO`/`P` becoming `DIV`. Look at the page: the logo, photos and dividers still show their shadows, and the headline glow is slightly softer (accepted). Check the console for errors (`browser_console_messages`): there should be none.

- [ ] **Step 11: Checkpoint**

Run `npm run build`: it succeeds. Do not commit.

---

### Task 6: The editor canvas's layers, text editor and template preview

**Files:**
- Modify: `src/pages/AdminVisualBoard.jsx` (canvas `renderLayerEntry` and `TemplatePreview` only)
- Modify: `src/components/CanvasTextEditor.jsx`
- Modify: `src/styles/globals.css`

**Interfaces:**
- Consumes: `MediaPicture`, `.vb-effects-layer` and `--vb-picture-filter` (Task 5); the effectStyle functions (Task 1).
- Produces: a canvas that renders effects exactly like `/visual`.

- [ ] **Step 1: Imports**

In `AdminVisualBoard.jsx`:

```jsx
import { effectsOf, resolveEffectsCss, resolvePictureFilter, withEffects } from '../lib/effectStyle';
import MediaPicture from '../components/MediaPicture';
```

- [ ] **Step 2: Logo, image, video buttons**

- Logo: replace `<img src={layout.logo.url || '/visual/logo.png'} alt="" className="vb-logo-img" />` with `<MediaPicture kind="logo" element={layout.logo} src={layout.logo.url || '/visual/logo.png'} />`.
- Image: replace `<img src={image.url} alt="" className="vb-photo-img" />` with `<MediaPicture kind="image" element={image} src={image.url} />`.
- Video: replace `<video src={video.url} className="vb-photo-img" muted loop autoPlay playsInline />` with `<MediaPicture kind="video" element={video} src={video.url} />`. Also change the video button's `style={scaledPositionStyle(video, PHOTO_BASE_WIDTH)}` to:

```jsx
          style={{
            ...scaledPositionStyle(video, PHOTO_BASE_WIDTH),
            ...resolveAnimationCss(video.animation),
          }}
```

In `globals.css`, the `.vb-logo-img, .vb-photo-img { … }` and `.vb-photo-img { border-radius: 2px; }` rules now have no users. Delete both after `grep -rn "vb-logo-img\|vb-photo-img" src` shows no remaining JSX use. The 2px radius was editor-only and never on `/visual`.

- [ ] **Step 3: Text**

Change `<span style={resolveTextStyle(text)}>` to:

```jsx
          <span style={withEffects(resolveTextStyle(text), effectsOf('text', text))}>
```

- [ ] **Step 4: Shapes**

In the shape branch, compute the effects next to the existing `resolveShapeStyle` destructure:

```jsx
      const effects = effectsOf('shape', shape);
```

Wrap the existing `<div className="vb-shape-fill" …>…</div>` in the effects layer. `SelectionHandles` stays a sibling *outside* it, so handles are never faded or shadowed:

```jsx
          <div
            className="vb-effects-layer"
            style={{ ...resolveEffectsCss(effects), '--vb-picture-filter': resolvePictureFilter(effects).filter }}
          >
            <div className="vb-shape-fill" style={shapeFillStyle}>
              {/* unchanged children */}
            </div>
          </div>
```

Extend the comment above the destructure by one sentence: opacity and shadow go on `.vb-effects-layer` between the two, so a triangle's shadow follows the clipped silhouette.

- [ ] **Step 5: Divider and boxes**

- Divider: `<span className="vb-divider-line" aria-hidden="true" />` becomes `<span className="vb-divider-line" aria-hidden="true" style={resolveEffectsCss(effectsOf('divider', divider))} />`. In `globals.css`, delete `box-shadow: 0 0 10px rgba(201, 160, 60, 0.28);` from **both** `.vb-divider-line` rules (the plain one and `.vb-divider-box .vb-divider-line`), and check the `.is-horizontal` variant for a third copy.
- Candidates: wrap `<CandidateBoard …/>` in `<div className="vb-effects-layer" style={resolveEffectsCss(effectsOf('candidates', box))}>`.
- Announcements: wrap `<AnnouncementBanner …/>` the same way with `'announcements'`. In `globals.css`, change the selector `.vb-announcements.is-placeholder > div` to `.vb-announcements.is-placeholder > .vb-effects-layer > div`, so the placeholder's dashed border still reaches the banner.

- [ ] **Step 6: The canvas text editor**

In `src/components/CanvasTextEditor.jsx`, add `WebkitTextStroke` to the destructured-away keys in `editingStyle`, and extend its comment: outline is left out while editing, like gradients.

```js
  const { backgroundImage, WebkitBackgroundClip, backgroundClip, width, WebkitTextStroke, ...style } = resolveTextStyle(text);
```

Italic and underline come through `resolveTextStyle` untouched.

- [ ] **Step 7: Template preview**

In `TemplatePreview` (bottom of `AdminVisualBoard.jsx`), the layout is raw stored data, so always go through `effectsOf`. The thumbnail has no animations, so effects share the node here:

- the divider `<span>`'s style gets `...resolveEffectsCss(effectsOf('divider', divider))`;
- the shape: `style={withEffects(resolveShapeStyle(shape), effectsOf('shape', shape))}`;
- both box `<div>`s get `...resolveEffectsCss(effectsOf('candidates', layout.candidates))` or `'announcements'`;
- the logo: `style={withEffects(scaledPositionStyle(layout.logo, LOGO_BASE_WIDTH), effectsOf('logo', layout.logo))}`;
- the text: `style={{ ...positionStyle(text), ...withEffects(resolveTextStyle(text), effectsOf('text', text)) }}`.

- [ ] **Step 8: Verify**

Run `npm run build`: it succeeds. Open `/admin/visual-board` (sign in with the throwaway account, see Task 9), check the console has no errors, and confirm the logo, photo and divider shadows now show on the canvas, as on `/visual`. Click and drag a shape, a text and the logo: selection and handles work.

- [ ] **Step 9: Checkpoint**

Do not commit.

---

### Task 7: Properties panel: Effects, Border and text controls

**Files:**
- Create: `src/components/EffectsPanel.jsx`
- Create: `src/components/BorderControls.jsx`
- Modify: `src/pages/AdminVisualBoard.jsx` (properties column)
- Modify: `src/styles/globals.css`

**Interfaces:**
- Consumes: `editor.setEffects`, `editor.setStroke` (Task 4); `effectsOf`, `showsPicture`, `DEFAULT_SHADOWS`, `FALLBACK_SHADOW`, `DEFAULT_ADJUST` (Task 1); `STROKE_STYLES`, `MEDIA_STROKE` (Tasks 1–2).
- Produces:
  - `<EffectsPanel kind element onChange={(patch) => …} />`
  - `<BorderControls stroke showStyle? onChange={(patch) => …} />`

- [ ] **Step 1: Create `src/components/BorderControls.jsx`**

```jsx
import { MEDIA_STROKE, STROKE_STYLES } from '../lib/shapeStyle';

/* A border's colour, width and line style - shapes, frames, photos, videos,
   and a text's outline. `showStyle` is off for the zigzag (whose stroke is
   its drawn line) and the outline. */
export default function BorderControls({ stroke, onChange, showStyle = true, label = 'Border', max = 16 }) {
  const value = { ...MEDIA_STROKE, ...stroke };

  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="vb-stroke-field">
        <input
          type="color"
          className="vb-color-input"
          value={value.color}
          aria-label={`${label} colour`}
          onChange={(event) => onChange({ color: event.target.value })}
        />
        <input
          type="range"
          min="0"
          max={max}
          step="1"
          value={value.width}
          aria-label={`${label} width`}
          onChange={(event) => onChange({ width: Number(event.target.value) })}
        />
        <span className="scale-field-value">{value.width}px</span>
      </div>
      {showStyle && (
        <div className="vb-segment vb-border-style">
          {STROKE_STYLES.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`vb-segment-button ${value.style === option.value ? 'active' : ''}`}
              aria-pressed={value.style === option.value}
              onClick={() => onChange({ style: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/EffectsPanel.jsx`**

```jsx
import { DEFAULT_ADJUST, DEFAULT_SHADOWS, FALLBACK_SHADOW, effectsOf, showsPicture } from '../lib/effectStyle';

function EffectSlider({ label, min, max, step = 1, value, unit = '', onChange }) {
  return (
    <label className="vb-effect-slider">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="scale-field-value">
        {value}
        {unit}
      </span>
    </label>
  );
}

/*
 * Opacity, drop shadow and (for anything showing a picture) adjustments -
 * every element has these. `onChange` gets a setEffects patch: `shadow`
 * merges into the current shadow, `shadow: null` turns it off.
 */
export default function EffectsPanel({ kind, element, onChange }) {
  const { opacity, shadow, adjust } = effectsOf(kind, element);

  return (
    <div className="form-group vb-effects-panel">
      <label className="form-label">Effects</label>

      <EffectSlider
        label="Opacity"
        min={0}
        max={100}
        value={Math.round(opacity * 100)}
        unit="%"
        onChange={(value) => onChange({ opacity: value / 100 })}
      />

      <label className="settings-option">
        <span>
          <strong>Shadow</strong>
        </span>
        <input
          type="checkbox"
          checked={Boolean(shadow)}
          onChange={(event) =>
            onChange({ shadow: event.target.checked ? { ...(DEFAULT_SHADOWS[kind] ?? FALLBACK_SHADOW) } : null })
          }
        />
      </label>

      {shadow && (
        <>
          <label className="vb-effect-slider">
            <span>Colour</span>
            <input
              type="color"
              className="vb-color-input"
              value={shadow.color}
              onChange={(event) => onChange({ shadow: { color: event.target.value } })}
            />
          </label>
          <EffectSlider
            label="Shadow opacity"
            min={0}
            max={100}
            value={Math.round(shadow.opacity * 100)}
            unit="%"
            onChange={(value) => onChange({ shadow: { opacity: value / 100 } })}
          />
          <EffectSlider label="Blur" min={0} max={60} value={shadow.blur} onChange={(blur) => onChange({ shadow: { blur } })} />
          <EffectSlider label="X" min={-40} max={40} value={shadow.x} onChange={(x) => onChange({ shadow: { x } })} />
          <EffectSlider label="Y" min={-40} max={40} value={shadow.y} onChange={(y) => onChange({ shadow: { y } })} />
        </>
      )}

      {showsPicture(kind, element) && (
        <>
          <div className="vb-effects-subhead">
            <span>Adjustments</span>
            <button type="button" className="secondary-button" onClick={() => onChange({ adjust: { ...DEFAULT_ADJUST } })}>
              Reset
            </button>
          </div>
          <EffectSlider
            label="Brightness"
            min={0}
            max={200}
            value={adjust.brightness}
            unit="%"
            onChange={(brightness) => onChange({ adjust: { brightness } })}
          />
          <EffectSlider
            label="Contrast"
            min={0}
            max={200}
            value={adjust.contrast}
            unit="%"
            onChange={(contrast) => onChange({ adjust: { contrast } })}
          />
          <EffectSlider
            label="Greyscale"
            min={0}
            max={100}
            value={adjust.grayscale}
            unit="%"
            onChange={(grayscale) => onChange({ adjust: { grayscale } })}
          />
          <EffectSlider label="Blur" min={0} max={20} value={adjust.blur} onChange={(blur) => onChange({ adjust: { blur } })} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: CSS for the new controls**

Append to the properties-column section of `globals.css`:

```css
/* one Effects row: label, slider, value */
.vb-effect-slider {
  display: grid;
  grid-template-columns: 92px 1fr 44px;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
}

.vb-effects-subhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  font-size: 12px;
  font-weight: 600;
}

.vb-border-style {
  margin-top: 6px;
}

.vb-border-style .vb-segment-button {
  flex: 1 1 0;
  font-size: 12px;
}

/* Alignment and the I / U toggles on one line */
.vb-text-style-row {
  display: flex;
  gap: 6px;
}
```

If `.vb-segment-button` has a fixed width for icons, the `.vb-border-style` override lets the text labels fit. Look at the result in the browser in Step 8, and if light mode needs a colour, add a `.admin-layout.light-mode` variant next to the existing ones.

- [ ] **Step 4: Wire the panel into `AdminVisualBoard.jsx`**

Imports: add `Italic, Underline` to the `lucide-react` import list; add `import EffectsPanel from '../components/EffectsPanel';` and `import BorderControls from '../components/BorderControls';`; remove `SHADOW_OPTIONS` from the `textStyle` import.

1. **Remove the text Shadow dropdown:** delete the whole `{isTextSelected && ( <div className="form-group"> … id="vb-shadow" … </div> )}` block.
2. **Shape border:** replace the `<div className="form-group"><label className="form-label">Border</label><div className="vb-stroke-field">…</div></div>` block in the shape section with:

```jsx
                    <BorderControls
                      stroke={selectedShape.stroke}
                      label={isZigzag(selectedShape) ? 'Line' : 'Border'}
                      showStyle={!isZigzag(selectedShape)}
                      onChange={(patch) => editor.setStroke('shape', selected.id, patch)}
                    />
```

3. **Media border:** directly after the `{(selected.kind === 'logo' || selected.kind === 'image' || selected.kind === 'video') && ( …Size… )}` block:

```jsx
                {(selected.kind === 'image' || selected.kind === 'video') && (
                  <BorderControls
                    stroke={selectedElement.stroke}
                    onChange={(patch) => editor.setStroke(selected.kind, selected.id, patch)}
                  />
                )}
```

4. **Italic and underline:** in the text section's Alignment `form-group`, wrap the existing `<div className="vb-segment">…</div>` in `<div className="vb-text-style-row">` and add a second segment after it:

```jsx
                        <div className="vb-segment">
                          {[
                            { key: 'italic', label: 'Italic', Icon: Italic },
                            { key: 'underline', label: 'Underline', Icon: Underline },
                          ].map(({ key, label, Icon }) => (
                            <button
                              key={key}
                              type="button"
                              className={`vb-segment-button ${selectedElement.style[key] ? 'active' : ''}`}
                              title={label}
                              aria-label={label}
                              aria-pressed={selectedElement.style[key] === true}
                              onClick={() =>
                                editor.setTextStyle(selected.kind, selected.id, { [key]: !selectedElement.style[key] })
                              }
                            >
                              <Icon size={14} />
                            </button>
                          ))}
                        </div>
```

5. **Outline:** directly after that Alignment `form-group` (still inside the text section):

```jsx
                    <BorderControls
                      label="Outline"
                      showStyle={false}
                      max={8}
                      stroke={{ width: 0, color: '#000000', ...selectedElement.style.outline }}
                      onChange={(patch) =>
                        editor.setTextStyle(selected.kind, selected.id, {
                          outline: { width: 0, color: '#000000', ...selectedElement.style.outline, ...patch },
                        })
                      }
                    />
```

6. **Effects, element panel:** directly above the element panel's final `<div className="vb-element-actions">` (the one with Duplicate):

```jsx
                <EffectsPanel
                  kind={selected.kind}
                  element={selectedElement}
                  onChange={(patch) => editor.setEffects(selected.kind, selected.id, patch)}
                />
```

7. **Effects, box panel:** in the `BOX_KINDS[selected.kind]` branch, directly above its `<div className="vb-element-actions">`:

```jsx
                    <EffectsPanel
                      kind={selected.kind}
                      element={box}
                      onChange={(patch) => editor.setEffects(selected.kind, null, patch)}
                    />
```

- [ ] **Step 5: Verify the build**

Run: `npm run build`, then `grep -rn "setShapeStroke\|SHADOW_OPTIONS" src/pages/AdminVisualBoard.jsx`
Expected: the build succeeds, and grep finds nothing.

- [ ] **Step 6: Checkpoint**

Do not commit. The browser pass is in Task 9.

---

### Task 8: Copy and paste style

**Files:**
- Modify: `src/pages/AdminVisualBoard.jsx`
- Modify: `src/components/CanvasContextMenu.jsx`

**Interfaces:**
- Consumes: `styleSnapshot` (Task 1); `editor.pasteStyle` (Task 4); `findElement` (already imported from the hook module).
- Produces: Ctrl+Alt+C and Ctrl+Alt+V, and the "Copy style" and "Paste style" menu items.

- [ ] **Step 1: State and actions**

Import `styleSnapshot` from `'../lib/effectStyle'` (merge it into the Task 6 import line). Next to `const [clipboard, setClipboard] = useState([]);`:

```jsx
  /* Copy style's clipboard - separate from the element clipboard above so
     copying a look never throws away copied elements, or the reverse. */
  const [styleClipboard, setStyleClipboard] = useState(null);
```

After `pasteClipboard`:

```jsx
  function copyStyle() {
    const [first] = currentSelection();
    const element = first && findElement(layout, first.kind, first.id);
    if (!element) return;
    setStyleClipboard(styleSnapshot(first.kind, element));
    showToast('Style copied');
  }

  function pasteStyle() {
    if (!styleClipboard) return;
    const selection = currentSelection();
    if (!selection.length) return;
    const count = editor.pasteStyle(selection, styleClipboard);
    showToast(
      count
        ? `Style pasted to ${count} element${count === 1 ? '' : 's'}`
        : selection.length === 1
          ? 'That element is locked.'
          : 'Those elements are locked.'
    );
  }
```

- [ ] **Step 2: Shortcuts**

In `handleKeydown`, insert this branch **before** `} else if (key === 'c' || key === 'x' || key === 'd') {`. It uses `event.code` because on a Mac, Alt changes `event.key` (Alt+C types "ç"):

```jsx
      } else if (event.altKey && (event.code === 'KeyC' || event.code === 'KeyV')) {
        if (!selection.length) return;
        event.preventDefault();
        if (event.code === 'KeyC') copyStyle();
        else pasteStyle();
```

Add `styleClipboard` to that effect's dependency array: `[editor, selected, multiSelected, clipboard, styleClipboard, layout]`.

- [ ] **Step 3: Context menu items**

In `src/components/CanvasContextMenu.jsx`, add `Paintbrush, PaintBucket` to the lucide import, add `canPasteStyle` to the props, and after the `duplicate` item in the element menu:

```jsx
          {item('copyStyle', 'Copy style', Paintbrush, 'Ctrl+Alt+C')}
          {item('pasteStyle', 'Paste style', PaintBucket, 'Ctrl+Alt+V', !canPasteStyle)}
```

In `AdminVisualBoard.jsx`, pass `canPasteStyle={Boolean(styleClipboard)}` to `<CanvasContextMenu …>`, and add to `runMenuAction`'s switch:

```jsx
      case 'copyStyle': copyStyle(); break;
      case 'pasteStyle': pasteStyle(); break;
```

Both go before `default:`, since the default treats any unknown action as a layer order.

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: the build succeeds.

- [ ] **Step 5: Checkpoint**

Do not commit.

---

### Task 9: Regression and one browser smoke check

**Files:** none changed (a fix found here goes back to the owning task's files).

- [ ] **Step 1: Unit tests and build**

Run: `node src/lib/photoCrop.test.js && node src/lib/boardGeometry.test.js && node src/lib/boardTransform.test.js && node src/lib/effectStyle.test.js && npm run build`
Expected: four "all checks passed" lines, and the build succeeds.

- [ ] **Step 2: Throwaway account**

Create a Firebase email/password account through the REST endpoint `accounts:signUp`, using the API key in `.env.local`. Its UID isn't in the rules, so every save is refused and the real draft is safe. The editor still updates its own state, which is enough for a visual check. **Never click Publish.**

- [ ] **Step 3: Smoke check (Playwright plugin)**

1. Open `/visual`. Check there are no console errors, and that the logo, a photo (if the board has one) and the divider show shadows. Hover-inspect the logo wrapper: its computed `filter` is a `drop-shadow(…cqh…)`.
2. Sign in and open `/admin/visual-board`. Check there are no console errors, and that the same shadows show on the canvas.
3. Add a triangle, switch its Shadow on, and set X to 20. Take a screenshot: the shadow follows the triangle's outline, not a rectangle, and the selection handles are still clickable (drag a corner).
4. Select a text, turn on Italic, and set Outline to 3. Right-click → Copy style. Select the triangle → Ctrl+Alt+V. The toast reads "Style pasted to 1 element", and the triangle's opacity and shadow now match the text's (the triangle had its own shadow, the text had Soft). Press Ctrl+Z once: the triangle is back as it was.
5. Review Focus 5: select the candidate board and switch its Shadow on with Blur 30. Compare the shadow's size by eye between the editor canvas and the draft preview (`/admin/visual-board/preview`, which only works if saves are allowed). If saves are refused, skip the preview half and note it in the report.

- [ ] **Step 4: Clean up**

Delete the throwaway account (REST `accounts:delete` with its idToken). Stop the dev server.

- [ ] **Step 5: Report**

Summarise what passed and anything that didn't, with screenshots, for the user. Do not commit.
