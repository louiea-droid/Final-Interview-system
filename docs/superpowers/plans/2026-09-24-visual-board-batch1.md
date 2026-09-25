# Visual Board Batch 1 (core editing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Canva/Figma-style editing to the admin Visual Board editor:
align/distribute, multi-select actions, smart guides, full resize handles, a
rotate handle, on-canvas text editing, shortcuts and a fuller right-click menu.

**Architecture:**
- All geometry maths lives in a new pure module, `src/lib/boardTransform.js`,
  tested with plain `node` asserts.
- `src/lib/useBoardLayoutEditor.js` gains actions built on it. Each action is
  one `commitFrom`, so each is one undo step.
- `src/pages/AdminVisualBoard.jsx` wires those actions to four small new
  components (`SelectionHandles`, `SmartGuides`, `AlignBar`,
  `CanvasContextMenu`) plus `CanvasTextEditor`.
- Rotation for text, logo, photos and video goes through the shared
  `boardGeometry.js`, so the live board matches the editor.

**Tech Stack:** React 19 + Vite, plain JSX, lucide-react icons, Firebase
(Firestore draft autosave), Playwright MCP for browser checks.

**Spec:** `docs/superpowers/specs/2026-09-24-visual-board-batch1-design.md`

## Global Constraints

- **No git commits during execution.** `AdminVisualBoard.jsx`,
  `useBoardLayoutEditor.js`, `VisualBoard.jsx` and `globals.css` already hold
  the user's own uncommitted work. The user commits at the end.
- Plain JSX, no TypeScript, **no new dependencies**.
- **Never click Publish.** Browser tests use the throwaway test account from
  *Prerequisites*. Its Firestore writes are refused by the rules, so the real
  draft is never changed.
- Positions are element **centres** in board percent. Convert px ↔ % with the
  canvas surface's `clientWidth` / `clientHeight`.
- Units and steps:
  - Snap threshold: `1` (board %)
  - Rotate snap with Shift: `15°`
  - Nudge: `0.5`, or `5` with Shift
  - Zoom step: `10` within `25`–`150`
  - Gap labels: px on a `1920×1080` board
- Every user action is **one undo step**.
- Keyboard shortcuts never fire while typing in an input, textarea, select or
  the canvas text editor.
- Existing size limits stay:

  | Kind | Limit |
  | --- | --- |
  | shape width / height | 0.4–200 % |
  | box width / height | 8–100 % |
  | scale | 0.1–6 |
  | text size | `MIN_TEXT_SIZE`–`MAX_TEXT_SIZE` |
  | `boxWidth` | 5–100 |
  | divider length | 2–100 |

## Review Focus

These are the likeliest problems that no unit test catches. Each line's check
lives in the task named.

1. **Locked elements** must not move, resize, rotate or be deleted by align,
   distribute, nudge, multi-delete or menu actions. Checked in Task 4, step 5.
2. **A single selected element that belongs to a group** must align and nudge
   with its whole group. Checked in Task 4, step 5.
3. **Shortcuts while typing** in a properties field or the canvas text editor
   must type normally. Checked in Task 8, step 4.
4. **A right-click near the bottom or right edge** of the window must open the
   menu fully on screen. Checked in Task 9, step 4.
5. **A resize that hits a size limit on a rotated shape** must not drift, and
   the handles must follow the rotation. Unit-tested in Task 1 and checked in
   the browser in Task 6, step 6.

## Prerequisites (before Task 1)

- [ ] **Create a throwaway test login.** Only with the user's OK, since it adds
  an account to their Firebase project. Run in bash from the repo root:

```bash
KEY=$(grep VITE_FIREBASE_API_KEY .env | sed 's/.*= *"\?\([^",]*\).*/\1/')
curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$KEY" \
  -H 'Content-Type: application/json' \
  -d '{"email":"vb-test-delete-me@example.com","password":"vb-test-Pass-2026!","returnSecureToken":true}' | grep -o '"localId":"[^"]*"'
```

  Expected: a `localId`. That UID is **not** in `firestore.rules`, so every
  save this account attempts is refused.

- [ ] **Start a dev server** on port 5180. Sign in at
  `http://localhost:5180/admin/login` in the Playwright browser with the test
  account, then open `/admin/visual-board`. Confirm the editor loads the
  current draft.

---

### Task 1: Geometry module `boardTransform.js`

**Files:**
- Create: `src/lib/boardTransform.js`
- Test: `src/lib/boardTransform.test.js`

**Interfaces (produces):**

| Function | Returns |
| --- | --- |
| `normalizeAngle(deg)` | number in `[-180, 180)` |
| `boundsOf({ x, y, wPx, hPx, rotation }, { W, H })` | `{ left, right, top, bottom, cx, cy, w, h }` in % |
| `shiftBounds(b, dx, dy)` | bounds |
| `unionBounds(list)` | bounds |
| `BOARD_FRAME` | `{ left: 0, top: 0, right: 100, bottom: 100 }` |
| `alignDeltas(list, edge, frame)` | `[{ dx, dy }]`, same order as `list`; `edge` is `'left'` \| `'center'` \| `'right'` \| `'top'` \| `'middle'` \| `'bottom'` |
| `distributeDeltas(list, axis)` | `[{ dx, dy }]`; `axis` is `'x'` \| `'y'` |
| `snapMove(moving, others, { threshold, grid })` | `{ dx, dy, guides: [{ axis, at }] }` |
| `gapsAround(moving, others)` | `[{ axis, from, to, at }]` |
| `resizeFromHandle(start, handle, pointer, opts)` | `{ cx, cy, w, h }` |
| `resizeSpan({ center, length }, end, pointer, { fromCenter, min, max })` | `{ center, length }` |
| `rotationFromDrag(startRotation, center, startPointer, pointer, snap)` | degrees |

For `resizeFromHandle`:
- `start` is `{ cx, cy, w, h, rotation }` in px.
- `handle` is `{ x: -1|0|1, y: -1|0|1 }`.
- `pointer` is `{ x, y }` in px.
- `opts` is `{ keepRatio, fromCenter, minW, maxW, minH, maxH }`.

- [ ] **Step 1: Write the failing test** `src/lib/boardTransform.test.js`

```js
// Run with: node src/lib/boardTransform.test.js
import assert from 'node:assert/strict';

import {
  BOARD_FRAME,
  alignDeltas,
  boundsOf,
  distributeDeltas,
  gapsAround,
  normalizeAngle,
  resizeFromHandle,
  resizeSpan,
  rotationFromDrag,
  snapMove,
  unionBounds,
} from './boardTransform.js';

const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} != ${expected}`);
const box = (left, top, right, bottom) => ({
  left, top, right, bottom, cx: (left + right) / 2, cy: (top + bottom) / 2, w: right - left, h: bottom - top,
});

// normalizeAngle
assert.equal(normalizeAngle(190), -170);
assert.equal(normalizeAngle(180), -180);
assert.equal(normalizeAngle(-190), 170);
assert.equal(normalizeAngle(0), 0);

// boundsOf: px size on a 1000x500 board, then rotated 90deg
assert.deepEqual(boundsOf({ x: 50, y: 50, wPx: 200, hPx: 100, rotation: 0 }, { W: 1000, H: 500 }), box(40, 40, 60, 60));
const turned = boundsOf({ x: 50, y: 50, wPx: 200, hPx: 100, rotation: 90 }, { W: 1000, H: 500 });
close(turned.w, 10, 'rotated width');
close(turned.h, 40, 'rotated height');
close(turned.top, 30, 'rotated top');

// unionBounds
assert.deepEqual(unionBounds([box(10, 0, 20, 10), box(40, 5, 60, 30)]), box(10, 0, 60, 30));

// alignDeltas: one element against the board
assert.deepEqual(alignDeltas([box(40, 40, 60, 60)], 'left', BOARD_FRAME), [{ dx: -40, dy: 0 }]);
assert.deepEqual(alignDeltas([box(40, 40, 60, 60)], 'bottom', BOARD_FRAME), [{ dx: 0, dy: 40 }]);

// alignDeltas: two elements against their combined bounds
const pair = [box(10, 0, 20, 10), box(40, 20, 60, 40)];
const frame = unionBounds(pair);
assert.deepEqual(alignDeltas(pair, 'left', frame), [{ dx: 0, dy: 0 }, { dx: -30, dy: 0 }]);
assert.deepEqual(alignDeltas(pair, 'right', frame), [{ dx: 40, dy: 0 }, { dx: 0, dy: 0 }]);
assert.deepEqual(alignDeltas(pair, 'center', frame), [{ dx: 20, dy: 0 }, { dx: -15, dy: 0 }]);
assert.deepEqual(alignDeltas(pair, 'middle', frame), [{ dx: 0, dy: 15 }, { dx: 0, dy: -10 }]);

// distributeDeltas: equal gaps, outermost stay put, input order kept
const row = [box(80, 0, 90, 10), box(0, 0, 10, 10), box(20, 0, 40, 10)];
assert.deepEqual(distributeDeltas(row, 'x'), [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 15, dy: 0 }]);
assert.deepEqual(distributeDeltas(row.slice(0, 2), 'x'), [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }]);

// snapMove: right edge catches another's left edge, bottom catches the board middle
const moving = box(10.5, 40, 20.5, 50);
const other = box(21, 70, 31, 80);
assert.deepEqual(snapMove(moving, [other], { threshold: 1, grid: 0 }), {
  dx: 0.5,
  dy: 0,
  guides: [
    { axis: 'x', at: 21 },
    { axis: 'y', at: 50 },
  ],
});
// nothing in range: no movement
assert.deepEqual(snapMove(box(10, 10, 12, 12), [], { threshold: 1, grid: 0 }), { dx: 0, dy: 0, guides: [] });
// grid lines snap but are not drawn as guides
assert.deepEqual(snapMove(box(9.5, 20.25, 11.5, 22.25), [], { threshold: 1, grid: 5 }), { dx: 0.5, dy: -0.25, guides: [] });

// gapsAround: only neighbours overlapping on the other axis count
assert.deepEqual(gapsAround(box(50, 40, 60, 50), [box(20, 42, 30, 48), box(70, 0, 80, 10)]), [
  { axis: 'x', from: 30, to: 50, at: 45 },
]);

// resizeFromHandle: the opposite side stays put
const start = { cx: 100, cy: 100, w: 100, h: 50, rotation: 0 };
assert.deepEqual(resizeFromHandle(start, { x: 1, y: 0 }, { x: 170, y: 100 }), { cx: 110, cy: 100, w: 120, h: 50 });
assert.deepEqual(resizeFromHandle(start, { x: 1, y: 0 }, { x: 170, y: 100 }, { fromCenter: true }), { cx: 100, cy: 100, w: 140, h: 50 });
assert.deepEqual(resizeFromHandle(start, { x: 1, y: 1 }, { x: 170, y: 150 }), { cx: 110, cy: 112.5, w: 120, h: 75 });
assert.deepEqual(resizeFromHandle(start, { x: 1, y: 1 }, { x: 170, y: 150 }, { keepRatio: true }), { cx: 125, cy: 112.5, w: 150, h: 75 });
// dragged past the anchor: clamped at the minimum, anchor still fixed
assert.deepEqual(resizeFromHandle(start, { x: 1, y: 0 }, { x: 20, y: 100 }, { minW: 10 }), { cx: 55, cy: 100, w: 10, h: 50 });
// keepRatio respects the maximum on either axis
assert.deepEqual(resizeFromHandle(start, { x: 1, y: 1 }, { x: 400, y: 400 }, { keepRatio: true, maxW: 200 }), { cx: 150, cy: 125, w: 200, h: 100 });
// rotated 90deg: the local right edge points down the screen
const rotated = resizeFromHandle({ ...start, rotation: 90 }, { x: 1, y: 0 }, { x: 100, y: 170 });
close(rotated.w, 120, 'rotated w');
close(rotated.cx, 100, 'rotated cx');
close(rotated.cy, 110, 'rotated cy');

// resizeSpan (divider ends)
assert.deepEqual(resizeSpan({ center: 100, length: 100 }, 1, 170), { center: 110, length: 120 });
assert.deepEqual(resizeSpan({ center: 100, length: 100 }, 1, 170, { fromCenter: true }), { center: 100, length: 140 });
assert.deepEqual(resizeSpan({ center: 100, length: 100 }, -1, 0, { max: 110 }), { center: 95, length: 110 });

// rotationFromDrag: relative to where the handle was grabbed
close(rotationFromDrag(0, { x: 0, y: 0 }, { x: 0, y: -10 }, { x: 10, y: 0 }, false), 90, 'quarter turn');
assert.equal(rotationFromDrag(0, { x: 0, y: 0 }, { x: 0, y: -10 }, { x: 10, y: -9 }, true), 45);
close(rotationFromDrag(170, { x: 0, y: 0 }, { x: 0, y: -10 }, { x: 10, y: 0 }, false), -100, 'wraps past 180');

console.log('boardTransform: all checks passed');
```

- [ ] **Step 2: Run it and confirm it fails**

  Run: `node src/lib/boardTransform.test.js`
  Expected: `ERR_MODULE_NOT_FOUND` for `boardTransform.js`.

- [ ] **Step 3: Write `src/lib/boardTransform.js`**

```js
/*
 * Pure geometry for the Visual Board editor. Positions and bounds are board
 * percentages (x of the width, y of the height); resize and rotate work in
 * pixels, because rotation mixes the two axes.
 */

const RAD = Math.PI / 180;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rotate({ x, y }, degrees) {
  const cos = Math.cos(degrees * RAD);
  const sin = Math.sin(degrees * RAD);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

export const BOARD_FRAME = { left: 0, top: 0, right: 100, bottom: 100 };

export function normalizeAngle(degrees) {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

function fromEdges(left, top, right, bottom) {
  return { left, top, right, bottom, cx: (left + right) / 2, cy: (top + bottom) / 2, w: right - left, h: bottom - top };
}

/** The axis-aligned box an element covers, from its centre, px size and rotation. */
export function boundsOf({ x, y, wPx, hPx, rotation = 0 }, { W, H }) {
  const cos = Math.abs(Math.cos(rotation * RAD));
  const sin = Math.abs(Math.sin(rotation * RAD));
  const w = ((wPx * cos + hPx * sin) / W) * 100;
  const h = ((wPx * sin + hPx * cos) / H) * 100;
  return fromEdges(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
}

export function shiftBounds(b, dx, dy) {
  return fromEdges(b.left + dx, b.top + dy, b.right + dx, b.bottom + dy);
}

export function unionBounds(list) {
  return fromEdges(
    Math.min(...list.map((b) => b.left)),
    Math.min(...list.map((b) => b.top)),
    Math.max(...list.map((b) => b.right)),
    Math.max(...list.map((b) => b.bottom))
  );
}

export function alignDeltas(list, edge, frame) {
  const midX = (frame.left + frame.right) / 2;
  const midY = (frame.top + frame.bottom) / 2;

  return list.map((b) => {
    switch (edge) {
      case 'left': return { dx: frame.left - b.left, dy: 0 };
      case 'center': return { dx: midX - b.cx, dy: 0 };
      case 'right': return { dx: frame.right - b.right, dy: 0 };
      case 'top': return { dx: 0, dy: frame.top - b.top };
      case 'middle': return { dx: 0, dy: midY - b.cy };
      default: return { dx: 0, dy: frame.bottom - b.bottom };
    }
  });
}

/** Equal gaps between neighbours; the first and last (by centre) stay put. */
export function distributeDeltas(list, axis) {
  const deltas = list.map(() => ({ dx: 0, dy: 0 }));
  if (list.length < 3) return deltas;

  const [start, end, size, center, key] =
    axis === 'x' ? ['left', 'right', 'w', 'cx', 'dx'] : ['top', 'bottom', 'h', 'cy', 'dy'];
  const order = list.map((b, index) => ({ b, index })).sort((a, c) => a.b[center] - c.b[center]);
  const first = order[0].b;
  const last = order[order.length - 1].b;
  const total = list.reduce((sum, b) => sum + b[size], 0);
  const gap = (last[end] - first[start] - total) / (list.length - 1);

  let cursor = first[start];
  for (const { b, index } of order) {
    deltas[index][key] = cursor - b[start];
    cursor += b[size] + gap;
  }

  return deltas;
}

function closestOffset(lines, targets, threshold) {
  let best = null;
  for (const line of lines) {
    for (const target of targets) {
      const offset = target - line;
      if (Math.abs(offset) <= threshold && (best === null || Math.abs(offset) < Math.abs(best))) best = offset;
    }
  }
  return best ?? 0;
}

function gridLines(step) {
  if (!step) return [];
  const lines = [];
  for (let at = 0; at <= 100; at += step) lines.push(at);
  return lines;
}

function matchedGuides(axis, lines, targets) {
  const hits = new Set();
  for (const target of targets) {
    if (lines.some((line) => Math.abs(line - target) < 0.01)) hits.add(Math.round(target * 100) / 100);
  }
  return [...hits].map((at) => ({ axis, at }));
}

/**
 * Snaps a moving box's edges and centre to the board's 0/50/100 lines, to
 * other elements' edges and centres, and (when `grid` is set) to grid lines.
 * Grid lines snap but are not reported as guides.
 */
export function snapMove(moving, others, { threshold, grid = 0 }) {
  const xs = [0, 50, 100, ...others.flatMap((o) => [o.left, o.cx, o.right])];
  const ys = [0, 50, 100, ...others.flatMap((o) => [o.top, o.cy, o.bottom])];
  const grids = gridLines(grid);

  const dx = closestOffset([moving.left, moving.cx, moving.right], [...xs, ...grids], threshold);
  const dy = closestOffset([moving.top, moving.cy, moving.bottom], [...ys, ...grids], threshold);
  const snapped = shiftBounds(moving, dx, dy);

  return {
    dx,
    dy,
    guides: [
      ...matchedGuides('x', [snapped.left, snapped.cx, snapped.right], xs),
      ...matchedGuides('y', [snapped.top, snapped.cy, snapped.bottom], ys),
    ],
  };
}

/** The gap to the nearest neighbour on each side that overlaps on the other axis. */
export function gapsAround(moving, others) {
  const gaps = [];
  const nearest = (candidates, distance) =>
    candidates.reduce((best, o) => (best === null || distance(o) < distance(best) ? o : best), null);

  const beside = others.filter((o) => o.top < moving.bottom && o.bottom > moving.top);
  const stacked = others.filter((o) => o.left < moving.right && o.right > moving.left);

  const left = nearest(beside.filter((o) => o.right <= moving.left), (o) => moving.left - o.right);
  const right = nearest(beside.filter((o) => o.left >= moving.right), (o) => o.left - moving.right);
  const above = nearest(stacked.filter((o) => o.bottom <= moving.top), (o) => moving.top - o.bottom);
  const below = nearest(stacked.filter((o) => o.top >= moving.bottom), (o) => o.top - moving.bottom);

  const midY = (o) => (Math.max(o.top, moving.top) + Math.min(o.bottom, moving.bottom)) / 2;
  const midX = (o) => (Math.max(o.left, moving.left) + Math.min(o.right, moving.right)) / 2;

  if (left) gaps.push({ axis: 'x', from: left.right, to: moving.left, at: midY(left) });
  if (right) gaps.push({ axis: 'x', from: moving.right, to: right.left, at: midY(right) });
  if (above) gaps.push({ axis: 'y', from: above.bottom, to: moving.top, at: midX(above) });
  if (below) gaps.push({ axis: 'y', from: moving.bottom, to: below.top, at: midX(below) });

  return gaps;
}

/**
 * Resizes a (possibly rotated) box by one of its 8 handles. The opposite side
 * stays put unless `fromCenter`; `keepRatio` scales both sides together.
 */
export function resizeFromHandle(
  start,
  handle,
  pointer,
  { keepRatio = false, fromCenter = false, minW = 1, maxW = Infinity, minH = 1, maxH = Infinity } = {}
) {
  const rotation = start.rotation ?? 0;
  const local = rotate({ x: pointer.x - start.cx, y: pointer.y - start.cy }, -rotation);

  function side(direction, pointerAt, size, min, max) {
    if (direction === 0) return { size, center: 0 };
    if (fromCenter) return { size: clamp(2 * direction * pointerAt, min, max), center: 0 };
    const anchor = (-direction * size) / 2;
    const next = clamp(direction * (pointerAt - anchor), min, max);
    return { size: next, center: anchor + (direction * next) / 2 };
  }

  let x = side(handle.x, local.x, start.w, minW, maxW);
  let y = side(handle.y, local.y, start.h, minH, maxH);

  if (keepRatio) {
    const wanted =
      handle.x && handle.y
        ? Math.max(x.size / start.w, y.size / start.h)
        : handle.x
          ? x.size / start.w
          : y.size / start.h;
    const factor = clamp(
      wanted,
      Math.max(minW / start.w, minH / start.h),
      Math.min(maxW / start.w, maxH / start.h)
    );

    const scaled = (direction, size) => {
      const next = size * factor;
      if (direction === 0 || fromCenter) return { size: next, center: 0 };
      const anchor = (-direction * size) / 2;
      return { size: next, center: anchor + (direction * next) / 2 };
    };

    x = scaled(handle.x, start.w);
    y = scaled(handle.y, start.h);
  }

  const offset = rotate({ x: x.center, y: y.center }, rotation);
  return { cx: start.cx + offset.x, cy: start.cy + offset.y, w: x.size, h: y.size };
}

/** Resizes a one-dimensional span (a divider) by one of its two ends. */
export function resizeSpan({ center, length }, end, pointer, { fromCenter = false, min = 0, max = Infinity } = {}) {
  if (fromCenter) return { center, length: clamp(2 * end * (pointer - center), min, max) };
  const anchor = center - (end * length) / 2;
  const next = clamp(end * (pointer - anchor), min, max);
  return { center: anchor + (end * next) / 2, length: next };
}

/** A new rotation from how far the pointer has turned around `center` since the grab. */
export function rotationFromDrag(startRotation, center, startPointer, pointer, snap) {
  const angle = (p) => Math.atan2(p.y - center.y, p.x - center.x) / RAD;
  const degrees = normalizeAngle(startRotation + angle(pointer) - angle(startPointer));
  return snap ? normalizeAngle(Math.round(degrees / 15) * 15) : degrees;
}
```

- [ ] **Step 4: Run it and confirm it passes**

  Run: `node src/lib/boardTransform.test.js`
  Expected: `boardTransform: all checks passed`. If a float check fails by a
  tiny amount, switch that check to `close(...)`. Don't loosen any other
  expectation.

---

### Task 2: Rotation for text, logo, photos and video

**Files:**
- Modify: `src/lib/boardGeometry.js` (both style helpers)
- Modify: `src/lib/boardLayout.js:160-181` (`normalizeText`)
- Modify: `src/pages/AdminVisualBoard.jsx`, after the Position form group
  (currently ends around line 3088)
- Test: `src/lib/boardGeometry.test.js`

**Interfaces:**
- **Produces:** `positionStyle(el)` and `scaledPositionStyle(el, base)` append
  ` rotate(Ndeg)` when `el.rotation` is non-zero. Texts keep a `rotation`
  field when loaded.

- [ ] **Step 1: Write the failing test** `src/lib/boardGeometry.test.js`

```js
// Run with: node src/lib/boardGeometry.test.js
import assert from 'node:assert/strict';

import { positionStyle, scaledPositionStyle } from './boardGeometry.js';

assert.equal(positionStyle({ x: 10, y: 20 }).transform, 'translate(-50%, -50%)');
assert.equal(positionStyle({ x: 10, y: 20, rotation: 30 }).transform, 'translate(-50%, -50%) rotate(30deg)');
assert.equal(
  scaledPositionStyle({ x: 10, y: 20, scale: 2, rotation: -45 }, 20).transform,
  'translate(-50%, -50%) scale(2) rotate(-45deg)'
);
assert.equal(scaledPositionStyle({ x: 10, y: 20, scale: 2 }, 20).transform, 'translate(-50%, -50%) scale(2)');

console.log('boardGeometry: all checks passed');
```

- [ ] **Step 2: Run it and confirm it fails**

  Run: `node src/lib/boardGeometry.test.js`
  Expected: an assertion error on the second check (no rotation yet).

- [ ] **Step 3: Implement.** In `src/lib/boardGeometry.js`, replace the two
  functions:

```js
function rotation(element) {
  return element.rotation ? ` rotate(${element.rotation}deg)` : '';
}

/** Centres an element on its stored percentage position. */
export function positionStyle(element) {
  return {
    left: `${element.x}%`,
    top: `${element.y}%`,
    transform: `translate(-50%, -50%)${rotation(element)}`,
  };
}

/** The same, for elements whose size is a multiplier of a base width. */
export function scaledPositionStyle(element, baseWidth) {
  return {
    left: `${element.x}%`,
    top: `${element.y}%`,
    transform: `translate(-50%, -50%) scale(${element.scale})${rotation(element)}`,
    width: `${baseWidth}cqw`,
  };
}
```

  In `src/lib/boardLayout.js` `normalizeText`, add after the `boxWidth` line:

```js
    rotation: Number.isFinite(text.rotation) ? clamp(text.rotation, -180, 180) : 0,
```

  In `AdminVisualBoard.jsx`, directly after the Position `form-group` block
  (the `)}` closing `selected.kind === 'text' && selected.id === 'heading' ? … : (…)`),
  insert:

```jsx
                {['text', 'logo', 'image', 'video'].includes(selected.kind) && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="vb-element-rotation">
                      Rotate
                    </label>
                    <input
                      id="vb-element-rotation"
                      className="form-input"
                      type="number"
                      min="-180"
                      max="180"
                      value={Math.round(selectedElement.rotation ?? 0)}
                      onChange={(event) =>
                        editor.updateElement(selected.kind, selected.id, {
                          rotation: Math.max(-180, Math.min(180, Number(event.target.value) || 0)),
                        })
                      }
                    />
                  </div>
                )}
```

- [ ] **Step 4: Run both node checks and the build**

  Run: `node src/lib/boardGeometry.test.js && node src/lib/boardTransform.test.js && npx vite build`
  Expected: both "all checks passed" lines, and `✓ built`.

- [ ] **Step 5: Check the live board uses the same helpers**

  Run: `grep -n "positionStyle\|scaledPositionStyle" src/pages/VisualBoard.jsx`
  Expected: the text, logo, image and video renders use these helpers. If
  video uses its own inline transform, switch it to
  `scaledPositionStyle(video, PHOTO_BASE_WIDTH)`.

- [ ] **Step 6: Browser check** (Playwright, signed in as the test account)

  Select a text, type `30` into **Rotate**, and confirm:
  1. Its canvas node's `style.transform` ends with `rotate(30deg)`.
  2. A screenshot shows it tilted.
  3. Ctrl+Z returns it to 0.

  Repeat on a photo. The live board uses the same helpers (Step 5), so no
  separate live check is needed. The test account can't save, so Preview
  can't show local edits.

---

### Task 3: Editor actions for selections (the hook)

**Files:**
- Modify: `src/lib/useBoardLayoutEditor.js`

**Interfaces:**
- **Consumes:** from Task 1, `boundsOf`, `unionBounds`, `BOARD_FRAME`,
  `alignDeltas` and `distributeDeltas`.
- **Produces.** These new hook return values are used in Tasks 4, 5, 8 and 9.
  A selection is `[{ kind, id }]`, with `id` `null` for the logo, candidates
  and announcements.

  | Name | Signature / returns |
  | --- | --- |
  | `measure` | `(kind, id)` → bounds \| null |
  | `alignSelection` | `(selection, edge)` |
  | `distributeSelection` | `(selection, axis)` |
  | `nudgeSelection` | `(selection, dx, dy)` |
  | `removeMany` | `(selection)` → `{ removed, hidden, locked }` |
  | `hideMany` | `(selection)` |
  | `setLockedMany` | `(selection, locked)` |
  | `snapshotElements` | `(selection)` → `[{ kind, element }]` |
  | `pasteSnapshots` | `(snapshots)` → selection |
  | `duplicateMany` | `(selection)` → selection |
  | `selectableElements` | `()` → selection |

- [ ] **Step 1: Add the imports** at the top of `useBoardLayoutEditor.js`:

```js
import { BOARD_FRAME, alignDeltas, boundsOf, distributeDeltas, unionBounds } from './boardTransform';
```

  Add below `LIST_BY_KIND`:

```js
/* Kinds sized by `scale` × a base width: their node's layout size is pre-scale. */
const SCALED_KINDS = { logo: true, image: true, video: true };

function clampBoard(value) {
  return Math.min(100, Math.max(0, value));
}
```

- [ ] **Step 2: Add the helpers and actions inside `useBoardLayoutEditor`,
  just above `return {`:**

```js
  function nodeFor(kind, id) {
    const surface = boundsRef.current;
    if (!surface) return null;
    return surface.querySelector(
      id ? `[data-vb-kind="${kind}"][data-vb-id="${id}"]` : `[data-vb-kind="${kind}"]`
    );
  }

  /* An element's board-% bounds as drawn, or null when it isn't on the canvas.
     Layout sizes (offsetWidth) rather than getBoundingClientRect, so a
     pulsing or bouncing animation can't make the measurement wobble. */
  function measure(kind, id) {
    const surface = boundsRef.current;
    const node = nodeFor(kind, id);
    const element = findElement(latestLayoutRef.current, kind, id);
    if (!surface || !node || !element) return null;

    const sized = node.querySelector(':scope > .vb-divider-line') ?? node;
    const scale = SCALED_KINDS[kind] ? element.scale ?? 1 : 1;

    return boundsOf(
      {
        x: element.x,
        y: element.y,
        wPx: sized.offsetWidth * scale,
        hPx: sized.offsetHeight * scale,
        rotation: element.rotation ?? 0,
      },
      { W: surface.clientWidth, H: surface.clientHeight }
    );
  }

  function asItem(element) {
    return { kind: element.kind, id: LIST_BY_KIND[element.kind] ? element.id : null };
  }

  /* Each selected element widened to its whole group, so a group moves as
     one piece. Locked elements drop out. */
  function selectionUnits(selection) {
    const all = collectPositionedElements(latestLayoutRef.current);
    const seenGroups = new Set();
    const units = [];

    for (const item of selection) {
      const element = findElement(latestLayoutRef.current, item.kind, item.id);
      if (!element || element.locked) continue;

      if (element.groupId) {
        if (seenGroups.has(element.groupId)) continue;
        seenGroups.add(element.groupId);
        units.push(all.filter((e) => e.groupId === element.groupId && !e.locked).map(asItem));
      } else {
        units.push([{ kind: item.kind, id: item.id ?? null }]);
      }
    }

    return units;
  }

  function moveUnits(units, deltas) {
    commitFrom((current) => {
      let next = current;
      units.forEach((unit, index) => {
        const { dx, dy } = deltas[index];
        if (!dx && !dy) return;
        for (const member of unit) {
          const element = findElement(next, member.kind, member.id);
          next = patchElement(next, member.kind, member.id, {
            x: clampBoard(element.x + dx),
            y: clampBoard(element.y + dy),
          });
        }
      });
      return next;
    });
  }

  function measuredUnits(selection) {
    return selectionUnits(selection)
      .map((unit) => ({ unit, parts: unit.map((m) => measure(m.kind, m.id)).filter(Boolean) }))
      .filter(({ parts }) => parts.length)
      .map(({ unit, parts }) => ({ unit, bounds: unionBounds(parts) }));
  }

  function alignSelection(selection, edge) {
    const measured = measuredUnits(selection);
    if (!measured.length) return;
    const bounds = measured.map((m) => m.bounds);
    const frame = measured.length === 1 ? BOARD_FRAME : unionBounds(bounds);
    moveUnits(measured.map((m) => m.unit), alignDeltas(bounds, edge, frame));
  }

  function distributeSelection(selection, axis) {
    const measured = measuredUnits(selection);
    if (measured.length < 3) return;
    moveUnits(measured.map((m) => m.unit), distributeDeltas(measured.map((m) => m.bounds), axis));
  }

  function nudgeSelection(selection, dx, dy) {
    const units = selectionUnits(selection);
    moveUnits(units, units.map(() => ({ dx, dy })));
  }

  function removeMany(selection) {
    const counts = { removed: 0, hidden: 0, locked: 0 };

    commitFrom((current) => {
      let next = current;
      for (const { kind, id } of selection) {
        const element = findElement(next, kind, id);
        if (!element) continue;
        if (element.locked) {
          counts.locked += 1;
          continue;
        }
        const list = LIST_BY_KIND[kind];
        if (!list) {
          next = patchElement(next, kind, id, { visible: false });
          counts.hidden += 1;
          continue;
        }
        next = removeLayer({ ...next, [list]: next[list].filter((item) => item.id !== id) }, kind, id);
        counts.removed += 1;
      }
      return next;
    });

    return counts;
  }

  function patchSelection(selection, patch) {
    commitFrom((current) =>
      selection.reduce((next, { kind, id }) => patchElement(next, kind, id, patch), current)
    );
  }

  function hideMany(selection) {
    patchSelection(
      selection.filter(({ kind, id }) => !findElement(latestLayoutRef.current, kind, id)?.locked),
      { visible: false }
    );
  }

  function setLockedMany(selection, locked) {
    patchSelection(selection, { locked });
  }

  /* Detached copies for the clipboard - pasting works after the originals
     are gone. One-of-a-kind elements (logo, boxes) can't be copied. */
  function snapshotElements(selection) {
    return selection
      .filter(({ kind }) => LIST_BY_KIND[kind])
      .map(({ kind, id }) => ({ kind, element: findElement(latestLayoutRef.current, kind, id) }))
      .filter(({ element }) => element)
      .map(({ kind, element }) => ({ kind, element: structuredClone(element) }));
  }

  /* Pastes copies offset down-right. Copies that shared a group keep a new
     group of their own; a lone group member pastes ungrouped. */
  function pasteSnapshots(snapshots) {
    const pasted = [];
    const groupCounts = new Map();
    for (const { element } of snapshots) {
      if (element.groupId) groupCounts.set(element.groupId, (groupCounts.get(element.groupId) ?? 0) + 1);
    }
    const newGroups = new Map();

    commitFrom((current) => {
      let next = current;
      for (const { kind, element } of snapshots) {
        const list = LIST_BY_KIND[kind];
        const copy = {
          ...structuredClone(element),
          id: crypto.randomUUID(),
          x: clampPercent(element.x + 3),
          y: clampPercent(element.y + 3),
          locked: false,
        };
        delete copy.groupId;
        if (element.groupId && groupCounts.get(element.groupId) > 1) {
          if (!newGroups.has(element.groupId)) newGroups.set(element.groupId, crypto.randomUUID());
          copy.groupId = newGroups.get(element.groupId);
        }
        next = appendLayer({ ...next, [list]: [...next[list], copy] }, kind, copy.id);
        pasted.push({ kind, id: copy.id });
      }
      return next;
    });

    return pasted;
  }

  function duplicateMany(selection) {
    const snapshots = snapshotElements(selection);
    return snapshots.length ? pasteSnapshots(snapshots) : [];
  }

  function selectableElements() {
    return collectPositionedElements(latestLayoutRef.current)
      .filter((element) => isVisible(element) && !element.locked)
      .map(asItem);
  }
```

  Then add to the returned object:

```js
    measure,
    alignSelection,
    distributeSelection,
    nudgeSelection,
    removeMany,
    hideMany,
    setLockedMany,
    snapshotElements,
    pasteSnapshots,
    duplicateMany,
    selectableElements,
```

- [ ] **Step 3: Build**

  Run: `npx vite build`
  Expected: `✓ built`. The UI is wired in Task 4 and checked there.

---

### Task 4: Align bar and the multi-selection panel

**Files:**
- Create: `src/components/AlignBar.jsx`
- Modify: `src/pages/AdminVisualBoard.jsx` (the properties column around
  lines 1987–1999, the page-level helpers, the delete/duplicate/copy code at
  lines 380–415 and 816–848, and the arrow-key effect at lines 669–700)
- Modify: `src/styles/globals.css` (append)

**Interfaces:**
- **Consumes:** from Task 3, `alignSelection`, `distributeSelection`,
  `nudgeSelection`, `removeMany`, `hideMany`, `setLockedMany`,
  `snapshotElements`, `pasteSnapshots`, `duplicateMany` and
  `selectableElements`.
- **Produces:**
  - page helpers `currentSelection()`, `selectMany(list)`,
    `removeSelection()`, `duplicateSelection()`, `copySelection()`,
    `cutSelection()`, `pasteClipboard()`, `groupSelection()`,
    `ungroupSelection()`, `orderSelection(direction)`, `selectAll()`,
    `alignSelection(edge)` and `distributeSelection(axis)`;
  - `ALIGN_ACTIONS`, exported from `AlignBar.jsx`.
  - Tasks 8 and 9 call these.

- [ ] **Step 1: Confirm the icon names exist** in the installed lucide-react
  (it is v1.x, and names may differ from the 0.x docs):

  Run:
  `node -e "const l=require('lucide-react');console.log(['AlignStartVertical','AlignCenterVertical','AlignEndVertical','AlignStartHorizontal','AlignCenterHorizontal','AlignEndHorizontal','AlignHorizontalDistributeCenter','AlignVerticalDistributeCenter','Scissors','ClipboardPaste','CopyPlus'].map(n=>n+':'+(n in l)).join(' '))"`

  Expected: every name reports `:true`. For any that reports `false`, pick
  the closest name from `Object.keys(require('lucide-react'))` that contains
  `Align` or the same word, and use it everywhere this plan uses the missing
  name.

- [ ] **Step 2: Create `src/components/AlignBar.jsx`**

```jsx
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
} from 'lucide-react';

export const ALIGN_ACTIONS = [
  { edge: 'left', label: 'Align left', Icon: AlignStartVertical },
  { edge: 'center', label: 'Align centre', Icon: AlignCenterVertical },
  { edge: 'right', label: 'Align right', Icon: AlignEndVertical },
  { edge: 'top', label: 'Align top', Icon: AlignStartHorizontal },
  { edge: 'middle', label: 'Align middle', Icon: AlignCenterHorizontal },
  { edge: 'bottom', label: 'Align bottom', Icon: AlignEndHorizontal },
];

export default function AlignBar({ onAlign, onDistribute, canDistribute, toBoard }) {
  const suffix = toBoard ? ' to the board' : '';

  return (
    <div className="vb-align-bar" role="toolbar" aria-label="Align">
      {ALIGN_ACTIONS.map(({ edge, label, Icon }) => (
        <button
          key={edge}
          type="button"
          className="vb-align-button"
          onClick={() => onAlign(edge)}
          title={label + suffix}
          aria-label={label + suffix}
        >
          <Icon size={14} />
        </button>
      ))}

      {canDistribute && (
        <>
          <span className="vb-align-divider" aria-hidden="true" />
          <button
            type="button"
            className="vb-align-button"
            onClick={() => onDistribute('x')}
            title="Distribute horizontally"
            aria-label="Distribute horizontally"
          >
            <AlignHorizontalDistributeCenter size={14} />
          </button>
          <button
            type="button"
            className="vb-align-button"
            onClick={() => onDistribute('y')}
            title="Distribute vertically"
            aria-label="Distribute vertically"
          >
            <AlignVerticalDistributeCenter size={14} />
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire the page helpers.**

  In `AdminVisualBoard.jsx`:
  1. Add `import AlignBar from '../components/AlignBar';`.
  2. Change `const [clipboard, setClipboard] = useState(null);` to
     `useState([])`.
  3. Replace `removeSelected` and `duplicateSelected` (lines 816–848) with the
     block below, and update their callers:
     - Delete key → `removeSelection()`
     - Ctrl+D → `duplicateSelection()`
     - Grep for `removeSelected(` and `duplicateSelected(` for any others,
       such as the `vb-element-actions` buttons.

```js
  /* The current selection as a list - multi first, else the single one. */
  function currentSelection() {
    if (multiSelected.length) return multiSelected;
    return selected ? [{ kind: selected.kind, id: selected.id ?? null }] : [];
  }

  function selectMany(list) {
    if (list.length === 1) {
      setSelected(list[0]);
      setMultiSelected([]);
    } else {
      setSelected(null);
      setMultiSelected(list);
    }
  }

  function removeSelection() {
    const selection = currentSelection();
    if (!selection.length) return;

    const { removed, hidden, locked } = editor.removeMany(selection);

    if (locked && !removed && !hidden) {
      showToast(locked === 1 ? 'That element is locked.' : 'Those elements are locked.');
      return;
    }
    if (hidden) {
      showToast(
        `${hidden === 1 ? 'One element was' : `${hidden} elements were`} hidden - turn it back on from Layers.`
      );
    }

    setSelected(null);
    setMultiSelected([]);
  }

  function duplicateSelection() {
    const copies = editor.duplicateMany(currentSelection());
    if (!copies.length) {
      showToast('The logo and the boxes are one of a kind - they can’t be copied.');
      return;
    }
    selectMany(copies);
  }

  function copySelection() {
    const snapshots = editor.snapshotElements(currentSelection());
    if (!snapshots.length) {
      showToast('The logo and the boxes are one of a kind - they can’t be copied.');
      return false;
    }
    setClipboard(snapshots);
    return true;
  }

  function cutSelection() {
    if (copySelection()) removeSelection();
  }

  function pasteClipboard() {
    if (!clipboard.length) return;
    selectMany(editor.pasteSnapshots(clipboard));
  }

  function groupSelection() {
    if (multiSelected.length >= 2) handleGroup();
  }

  function ungroupSelection() {
    const groupIds = new Set(
      currentSelection()
        .map(({ kind, id }) => findElement(layout, kind, id)?.groupId)
        .filter(Boolean)
    );
    groupIds.forEach((groupId) => editor.ungroup(groupId));
  }

  function orderSelection(direction) {
    currentSelection().forEach(({ kind, id }) => editor.moveLayer(kind, id, direction));
  }

  function selectAll() {
    selectMany(editor.selectableElements());
  }

  function alignSelection(edge) {
    editor.alignSelection(currentSelection(), edge);
  }

  function distributeSelection(axis) {
    editor.distributeSelection(currentSelection(), axis);
  }
```

  Replace the body of the Ctrl+C / Ctrl+V branches in the existing keydown
  handler with `copySelection()` and `pasteClipboard()` for now. Task 8
  rewrites the whole handler.

  In the arrow-key effect (lines 669–700):
  1. Change its guard from `if (!selected) return;` to
     `if (!selected && !multiSelected.length) return;`.
  2. Replace the `findElement … editor.setPosition(...)` lines with:

```js
      event.preventDefault();
      const distance = event.shiftKey ? 5 : 0.5;
      editor.nudgeSelection(currentSelection(), step[0] * distance, step[1] * distance);
```

  3. Change its dependency list to `[selected, multiSelected, layout, editor]`.

  Below `const shapeLabels = ...` (render section), add:

```js
  const selectionNow = currentSelection();
  const selectionLocked =
    selectionNow.length > 0 &&
    selectionNow.every(({ kind, id }) => findElement(layout, kind, id)?.locked);
```

  Replace the `multiSelected.length >= 2 ? ( … )` branch (lines 1988–1998),
  and add the single-selection align bar just inside `<div className="vb-properties">`:

```jsx
          <div className="vb-properties">
            {selected && multiSelected.length < 2 && (
              <AlignBar onAlign={alignSelection} toBoard />
            )}

            {multiSelected.length >= 2 ? (
              <>
                <h3 className="vb-properties-title">{multiSelected.length} Elements Selected</h3>
                <AlignBar
                  onAlign={alignSelection}
                  onDistribute={distributeSelection}
                  canDistribute={multiSelected.length >= 3}
                />
                <div className="vb-multi-actions">
                  <button type="button" className="primary-button" onClick={handleGroup}>
                    <Group size={13} />
                    Group
                  </button>
                  <button type="button" className="secondary-button" onClick={duplicateSelection}>
                    <Copy size={13} />
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => editor.setLockedMany(multiSelected, !selectionLocked)}
                  >
                    {selectionLocked ? <LockOpen size={13} /> : <Lock size={13} />}
                    {selectionLocked ? 'Unlock' : 'Lock'}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      editor.hideMany(multiSelected);
                      setMultiSelected([]);
                    }}
                  >
                    <EyeOff size={13} />
                    Hide
                  </button>
                  <button type="button" className="secondary-button vb-danger-button" onClick={removeSelection}>
                    <Trash2 size={13} />
                    Delete
                  </button>
                </div>
              </>
            ) : !selected ? (
```

  Append to `src/styles/globals.css`:

```css
/* ---------------- align bar and multi-selection actions ---------------- */

.vb-align-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
}

.vb-align-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 26px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.vb-align-button:hover {
  background: rgba(255, 255, 255, 0.08);
}

.vb-align-divider {
  width: 1px;
  height: 16px;
  margin: 0 3px;
  background: var(--border-light);
}

.vb-multi-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.vb-multi-actions > button {
  justify-content: center;
}

.vb-danger-button {
  color: #f08c88;
}
```

- [ ] **Step 4: Build**

  Run: `npx vite build`
  Expected: `✓ built`.

- [ ] **Step 5: Browser check** (Playwright, test account)

  Add three rectangles with the Elements panel's **Rectangle** button,
  shift-click all three, then check:
  1. **Align left:** all three `[data-vb-kind="shape"]` nodes'
     `getBoundingClientRect().left` values are within 1px of each other.
  2. **Distribute horizontally** (after moving them apart): the two gaps
     between neighbours differ by under 1px.
  3. **Ctrl+Z once** undoes the whole distribute.
  4. **Review Focus 1:** lock one rectangle from Layers, select all three,
     Align right. The locked one's rect doesn't change. Delete leaves the
     locked one in place.
  5. **Review Focus 2:** group two rectangles, click one of them, press
     **Align left**. Both move by the same amount, since their left
     difference is preserved.
  6. **Nudge:** with 2 selected, press ArrowRight. Both move 0.5% of the
     canvas width.

  No clean-up is needed: test-account saves are refused, so reloading the page
  drops these local changes.

---

### Task 5: Smart guides

**Files:**
- Create: `src/components/SmartGuides.jsx`
- Modify: `src/lib/useBoardLayoutEditor.js` (`beginDrag`, the snap helpers,
  the `centerGuide` state and its return value)
- Modify: `src/pages/AdminVisualBoard.jsx` (snap default, hook options, the
  guide overlay at lines 1960–1961)
- Modify: `src/styles/globals.css`

**Interfaces:**
- **Consumes:** from Task 1, `snapMove`, `gapsAround` and `shiftBounds`;
  from Task 3, `measure` and `selectionUnits`.
- **Produces:**
  - The hook option `gridSnap` (boolean).
  - The hook return `guides: { lines: [{ axis, at }], gaps: [{ axis, from, to, at }] }`,
    which replaces `centerGuide`.

- [ ] **Step 1: Rewrite `beginDrag`, and remove `collectSnapTargets` /
  `snapAxis` / `SNAP_GRID_STEP` / `centerGuide`.**

  In the hook:
  1. Add `gridSnap = false` to the options.
  2. Import `gapsAround, shiftBounds, snapMove` from `./boardTransform`.
  3. Change `SNAP_THRESHOLD = 1.2` to `SNAP_THRESHOLD = 1`.
  4. Replace the `centerGuide` state with:

```js
  const NO_GUIDES = { lines: [], gaps: [] };
  const [guides, setGuides] = useState(NO_GUIDES);
```

  Replace the whole `beginDrag` with:

```js
  function beginDrag(kind, id) {
    return (event) => {
      const element = findElement(latestLayoutRef.current, kind, id);
      if (element?.locked) return;

      event.preventDefault();

      /* What moves: the element's whole group, or the current multi-selection
         it belongs to, or just itself - always by the pointer's delta, so the
         grab point stays under the cursor. */
      const isInMultiSelection =
        multiSelected.length > 1 && multiSelected.some((item) => item.kind === kind && item.id === id);
      const members = (isInMultiSelection ? selectionUnits(multiSelected) : selectionUnits([{ kind, id }])).flat();
      if (!members.length) return;

      const start = members.map((m) => ({ ...m, ...pick(findElement(latestLayoutRef.current, m.kind, m.id)) }));
      const isMember = (e) => members.some((m) => m.kind === e.kind && (m.id ?? null) === (asItem(e).id ?? null));

      const movingParts = members.map((m) => measure(m.kind, m.id)).filter(Boolean);
      const movingStart = movingParts.length ? unionBounds(movingParts) : null;
      const others = collectPositionedElements(latestLayoutRef.current)
        .filter((e) => isVisible(e) && !isMember(e))
        .map((e) => measure(e.kind, asItem(e).id))
        .filter(Boolean);

      let origin = null;

      dragWith(
        (moveEvent, rect) => {
          const pointer = {
            x: ((moveEvent.clientX - rect.left) / rect.width) * 100,
            y: ((moveEvent.clientY - rect.top) / rect.height) * 100,
          };
          origin ??= pointer;
          let dx = pointer.x - origin.x;
          let dy = pointer.y - origin.y;

          const snapping = snapEnabled && !(moveEvent.ctrlKey || moveEvent.metaKey) && movingStart;
          if (snapping) {
            const moved = shiftBounds(movingStart, dx, dy);
            const snap = snapMove(moved, others, { threshold: SNAP_THRESHOLD, grid: gridSnap ? 5 : 0 });
            dx += snap.dx;
            dy += snap.dy;
            setGuides({ lines: snap.guides, gaps: gapsAround(shiftBounds(moved, snap.dx, snap.dy), others) });
          } else {
            setGuides(NO_GUIDES);
          }

          commitFrom(
            (current) =>
              start.reduce(
                (next, m) => patchElement(next, m.kind, m.id, { x: clampBoard(m.x + dx), y: clampBoard(m.y + dy) }),
                current
              ),
            { immediate: false }
          );
        },
        () => setGuides(NO_GUIDES)
      );
    };
  }
```

  Add this helper next to `asItem` (Task 3):

```js
  function pick(element) {
    return { x: element.x, y: element.y };
  }
```

  In the return object, replace `centerGuide,` with `guides,`.

  Then grep the hook for leftovers:
  `grep -n "centerGuide\|collectSnapTargets\|snapAxis\|SNAP_GRID_STEP" src/lib/useBoardLayoutEditor.js`
  Expected: no output. Delete any remaining references.

- [ ] **Step 2: Create `src/components/SmartGuides.jsx`**

```jsx
/* Board size the gap labels are reported in - the live board is 1920x1080. */
const BOARD_PX = { x: 1920, y: 1080 };

export default function SmartGuides({ guides }) {
  return (
    <>
      {guides.lines.map((line) => (
        <div
          key={`${line.axis}-${line.at}`}
          className={`vb-smart-guide is-${line.axis}`}
          style={line.axis === 'x' ? { left: `${line.at}%` } : { top: `${line.at}%` }}
          aria-hidden="true"
        />
      ))}

      {guides.gaps.map((gap) => {
        const length = gap.to - gap.from;
        const style =
          gap.axis === 'x'
            ? { left: `${gap.from}%`, width: `${length}%`, top: `${gap.at}%` }
            : { top: `${gap.from}%`, height: `${length}%`, left: `${gap.at}%` };

        return (
          <div key={`${gap.axis}-${gap.from}`} className={`vb-gap is-${gap.axis}`} style={style} aria-hidden="true">
            <span>{Math.round((length / 100) * BOARD_PX[gap.axis])}</span>
          </div>
        );
      })}
    </>
  );
}
```

- [ ] **Step 3: Wire it into `AdminVisualBoard.jsx`**
  1. Import `SmartGuides from '../components/SmartGuides'`.
  2. Change `useState(false)` for `snapEnabled` to `useState(true)`.
  3. Pass `gridSnap: showGrid,` in the `useBoardLayoutEditor` options.
  4. Replace the two `editor.centerGuide…` lines (1960–1961) with
     `<SmartGuides guides={editor.guides} />`.
  5. Change the Snap button's `title` to
     `"Snap to other elements, the board edges and centre (hold Ctrl to drag freely)"`.

  Append CSS:

```css
/* ---------------- smart guides ---------------- */

.vb-smart-guide {
  position: absolute;
  z-index: 6;
  pointer-events: none;
  background: #ff3ea5;
}

.vb-smart-guide.is-x {
  top: 0;
  bottom: 0;
  width: 1px;
  transform: translateX(-50%);
}

.vb-smart-guide.is-y {
  left: 0;
  right: 0;
  height: 1px;
  transform: translateY(-50%);
}

.vb-gap {
  position: absolute;
  z-index: 6;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.vb-gap.is-x {
  height: 0;
  border-top: 1px dashed #ff3ea5;
}

.vb-gap.is-y {
  width: 0;
  border-left: 1px dashed #ff3ea5;
}

.vb-gap > span {
  padding: 1px 4px;
  border-radius: 3px;
  background: #ff3ea5;
  color: #fff;
  font-size: 10px;
  line-height: 1.2;
  white-space: nowrap;
}
```

  Delete the now-unused `.vb-guide`, `.vb-guide-vertical` and
  `.vb-guide-horizontal` rules (globals.css ~5088–5110).

- [ ] **Step 4: Build**

  Run: `npx vite build`
  Expected: `✓ built`.

- [ ] **Step 5: Browser check.** Add two rectangles, then check:
  1. **Guide appears:** drag one with `page.mouse` so its left edge lands
     about 0.5% from the other's left edge. Mid-drag, a `.vb-smart-guide.is-x`
     exists and the left edges are within 1px.
  2. **Ctrl disables snapping:** repeat holding `Control`. No guide appears,
     and the element lands exactly where it was dropped.
  3. **Grab point is kept:** start a drag 20px right of an element's centre
     and move 50px. Its centre moves 50px and doesn't jump to the cursor.
  4. **Gap label:** a `.vb-gap > span` shows a number while a neighbour sits
     beside the dragged element.

---

### Task 6: Resize handles and rotate handle

**Files:**
- Create: `src/components/SelectionHandles.jsx`
- Modify: `src/lib/useBoardLayoutEditor.js`:
  - add `beginHandleResize`, `beginRotate` and the `rotating` state;
  - rewrite `beginDividerResize(id, end)`;
  - delete `beginResizeBox`, `beginScaleResize`, `beginFontResize` and
    `beginResize`.
- Modify: `src/pages/AdminVisualBoard.jsx`: every
  `<span className="vb-shape-resize" …>` in `renderLayerEntry`, plus a
  rotation tooltip.
- Modify: `src/styles/globals.css`: handle styles, and delete
  `.vb-shape-resize`.

**Interfaces:**
- **Consumes:** from Task 1, `resizeFromHandle`, `resizeSpan` and
  `rotationFromDrag`; from Task 3, `nodeFor` and `SCALED_KINDS`.
- **Produces:**

  | Name | Signature |
  | --- | --- |
  | `editor.beginHandleResize` | `(kind, id, handle)` → pointerdown handler |
  | `editor.beginRotate` | `(kind, id)` → pointerdown handler |
  | `editor.beginDividerResize` | `(id, end)` → pointerdown handler, with `end` −1 or 1 |
  | `editor.rotating` | `{ rotation, x, y } \| null` |

  `SelectionHandles.jsx` exports `ALL_HANDLES`, `CORNER_HANDLES` and
  `TEXT_HANDLES`.

- [ ] **Step 1: Add the resize and rotate actions to the hook.** Import
  `resizeFromHandle, resizeSpan, rotationFromDrag` from `./boardTransform`
  and `MAX_TEXT_SIZE, MIN_TEXT_SIZE` from `./textStyle`. Add state next to
  `guides`:

```js
  const [rotating, setRotating] = useState(null);
```

  Add, replacing `beginResizeBox`, `beginScaleResize`, `beginFontResize`,
  `beginResize` and `beginDividerResize`:

```js
  function surfaceSize() {
    const surface = boundsRef.current;
    return surface ? { W: surface.clientWidth, H: surface.clientHeight } : null;
  }

  /* Size limits in px for a resize, so an anchored drag that hits one
     doesn't drift (see resizeFromHandle). */
  function resizeLimits(kind, element, start, W, H) {
    if (kind === 'shape') return { minW: 0.004 * W, maxW: 2 * W, minH: 0.004 * H, maxH: 2 * H };
    if (kind === 'candidates' || kind === 'announcements') {
      return { minW: 0.08 * W, maxW: W, minH: 0.08 * H, maxH: H };
    }
    if (kind === 'text') {
      return {
        minW: (start.w * MIN_TEXT_SIZE) / element.fontSize,
        maxW: (start.w * MAX_TEXT_SIZE) / element.fontSize,
        minH: 1,
        maxH: Infinity,
      };
    }
    const scale = element.scale ?? 1;
    return { minW: (start.w * 0.1) / scale, maxW: (start.w * 6) / scale, minH: 1, maxH: Infinity };
  }

  function sizePatch(kind, element, start, next, W, H) {
    switch (kind) {
      case 'shape':
        return { width: (next.w / W) * 100, height: (next.h / H) * 100 };
      case 'candidates':
      case 'announcements':
        return { width: (next.w / W) * 100, height: (next.h / H) * 100 };
      case 'text':
        return { fontSize: clampTextSize((element.fontSize * next.w) / start.w) };
      default:
        return { scale: Math.min(6, Math.max(0.1, ((element.scale ?? 1) * next.w) / start.w)) };
    }
  }

  /*
   * Drags one of an element's handles. Photos, logo, video and text corners
   * always keep proportions; shapes and boxes do while Shift is held. Alt
   * resizes from the centre. A text's side handles set its wrap width
   * (boxWidth) around its centre - its drawn width can be narrower than
   * boxWidth, so anchoring a side would make the text drift.
   */
  function beginHandleResize(kind, id, handle) {
    return (event) => {
      event.preventDefault();
      event.stopPropagation();

      const element = findElement(latestLayoutRef.current, kind, id);
      const size = surfaceSize();
      const node = nodeFor(kind, id);
      if (!element || element.locked || !size || !node) return;

      const { W, H } = size;
      const scale = SCALED_KINDS[kind] ? element.scale ?? 1 : 1;
      const start = {
        cx: (element.x / 100) * W,
        cy: (element.y / 100) * H,
        w: node.offsetWidth * scale,
        h: node.offsetHeight * scale,
        rotation: element.rotation ?? 0,
      };
      const textSide = kind === 'text' && handle.y === 0;
      const alwaysProportional = SCALED_KINDS[kind] || (kind === 'text' && !textSide);
      const limits = textSide
        ? { minW: 0.05 * W, maxW: W, minH: 1, maxH: Infinity }
        : resizeLimits(kind, element, start, W, H);

      dragWith((moveEvent, rect) => {
        const pointer = {
          x: (moveEvent.clientX - rect.left) * (W / rect.width),
          y: (moveEvent.clientY - rect.top) * (H / rect.height),
        };
        const next = resizeFromHandle(start, handle, pointer, {
          ...limits,
          keepRatio: alwaysProportional || moveEvent.shiftKey,
          fromCenter: textSide || moveEvent.altKey,
        });

        const patch = textSide
          ? { boxWidth: Math.min(100, Math.max(5, (next.w / W) * 100)) }
          : {
              x: clampBoard((next.cx / W) * 100),
              y: clampBoard((next.cy / H) * 100),
              ...sizePatch(kind, element, start, next, W, H),
            };

        commitFrom((current) => patchElement(current, kind, id, patch), { immediate: false });
      });
    };
  }

  /* Drags the round handle above an element; Shift snaps to 15°. */
  function beginRotate(kind, id) {
    return (event) => {
      event.preventDefault();
      event.stopPropagation();

      const element = findElement(latestLayoutRef.current, kind, id);
      const surface = boundsRef.current;
      if (!element || element.locked || !surface) return;

      const rect = surface.getBoundingClientRect();
      const center = {
        x: rect.left + (element.x / 100) * rect.width,
        y: rect.top + (element.y / 100) * rect.height,
      };
      const startPointer = { x: event.clientX, y: event.clientY };
      const startRotation = element.rotation ?? 0;

      dragWith(
        (moveEvent) => {
          const rotation = rotationFromDrag(
            startRotation,
            center,
            startPointer,
            { x: moveEvent.clientX, y: moveEvent.clientY },
            moveEvent.shiftKey
          );
          setRotating({ rotation, x: moveEvent.clientX, y: moveEvent.clientY });
          commitFrom((current) => patchElement(current, kind, id, { rotation }), { immediate: false });
        },
        () => setRotating(null)
      );
    };
  }

  /* Drags one end of a divider; the other end stays put unless Alt is held. */
  function beginDividerResize(id, end) {
    return (event) => {
      event.preventDefault();
      event.stopPropagation();

      const divider = findElement(latestLayoutRef.current, 'divider', id);
      const size = surfaceSize();
      if (!divider || divider.locked || !size) return;

      const vertical = divider.orientation !== 'horizontal';
      const extent = vertical ? size.H : size.W;
      const span = {
        center: ((vertical ? divider.y : divider.x) / 100) * extent,
        length: (divider.length / 100) * extent,
      };

      dragWith((moveEvent, rect) => {
        const pointer = vertical
          ? (moveEvent.clientY - rect.top) * (size.H / rect.height)
          : (moveEvent.clientX - rect.left) * (size.W / rect.width);
        const next = resizeSpan(span, end, pointer, {
          fromCenter: moveEvent.altKey,
          min: 0.02 * extent,
          max: extent,
        });

        commitFrom(
          (current) =>
            patchElement(current, 'divider', id, {
              [vertical ? 'y' : 'x']: clampBoard((next.center / extent) * 100),
              length: (next.length / extent) * 100,
            }),
          { immediate: false }
        );
      });
    };
  }
```

  In the return object:
  1. Remove `beginResizeBox`, `beginResize`, `beginScaleResize` and
     `beginFontResize`.
  2. Add `beginHandleResize`, `beginRotate` and `rotating`.
  3. Keep `beginDividerResize`.

- [ ] **Step 2: Create `src/components/SelectionHandles.jsx`**

```jsx
const HANDLES = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
};

export const ALL_HANDLES = Object.keys(HANDLES);
export const CORNER_HANDLES = ['nw', 'ne', 'se', 'sw'];
export const TEXT_HANDLES = [...CORNER_HANDLES, 'e', 'w'];

/* The resize cursor for a handle, turned with its element. */
function cursorFor({ x, y }, rotation) {
  const angle = (((Math.atan2(y, x) * 180) / Math.PI + rotation) % 180 + 180) % 180;
  return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][Math.round(angle / 45) % 4];
}

/*
 * Resize handles (and optionally a rotate handle), drawn inside the selected
 * element so they turn with it. `inverseScale` undoes a scaled element's own
 * scale() so the handles stay the same size on screen.
 */
export default function SelectionHandles({ handles, onResize, onRotate, rotation = 0, inverseScale = 1 }) {
  return (
    <span className="vb-handles" style={{ '--vb-handle-scale': inverseScale }}>
      {handles.map((id) => (
        <span
          key={id}
          className={`vb-handle vb-handle-${id}`}
          style={{ cursor: cursorFor(HANDLES[id], rotation) }}
          onPointerDown={onResize(HANDLES[id])}
        />
      ))}

      {onRotate && <span className="vb-rotate-handle" title="Drag to rotate (Shift snaps to 15°)" onPointerDown={onRotate} />}
    </span>
  );
}
```

- [ ] **Step 3: Replace the handles in `renderLayerEntry`.** Import
  `SelectionHandles, { ALL_HANDLES, CORNER_HANDLES, TEXT_HANDLES }`, then
  replace each `vb-shape-resize` span with:
  - **divider:**
    ```jsx
    <SelectionHandles
      handles={divider.orientation === 'horizontal' ? ['w', 'e'] : ['n', 's']}
      onResize={(h) => editor.beginDividerResize(divider.id, h.x || h.y)}
    />
    ```
  - **candidates:**
    ```jsx
    <SelectionHandles handles={ALL_HANDLES} onResize={(h) => editor.beginHandleResize('candidates', null, h)} />
    ```
  - **announcements:** the same, with `'announcements'`.
  - **logo:**
    ```jsx
    <SelectionHandles
      handles={CORNER_HANDLES}
      rotation={layout.logo.rotation ?? 0}
      inverseScale={1 / layout.logo.scale}
      onResize={(h) => editor.beginHandleResize('logo', null, h)}
      onRotate={editor.beginRotate('logo', null)}
    />
    ```
  - **text:**
    ```jsx
    <SelectionHandles
      handles={TEXT_HANDLES}
      rotation={text.rotation ?? 0}
      onResize={(h) => editor.beginHandleResize('text', text.id, h)}
      onRotate={editor.beginRotate('text', text.id)}
    />
    ```
  - **image:**
    ```jsx
    <SelectionHandles
      handles={CORNER_HANDLES}
      rotation={image.rotation ?? 0}
      inverseScale={1 / image.scale}
      onResize={(h) => editor.beginHandleResize('image', image.id, h)}
      onRotate={editor.beginRotate('image', image.id)}
    />
    ```
  - **video:** the same as image, with `video`.
  - **shape:**
    ```jsx
    <SelectionHandles
      handles={ALL_HANDLES}
      rotation={shape.rotation}
      onResize={(h) => editor.beginHandleResize('shape', shape.id, h)}
      onRotate={editor.beginRotate('shape', shape.id)}
    />
    ```

  Just before `{contextMenu && …}` / `{orderMenu && …}` near the end of the
  JSX, add the rotation tooltip:

```jsx
      {editor.rotating && (
        <div className="vb-rotate-tooltip" style={{ left: editor.rotating.x + 14, top: editor.rotating.y + 14 }}>
          {Math.round(editor.rotating.rotation)}°
        </div>
      )}
```

  Verify nothing still uses the old handle code:
  `grep -n "vb-shape-resize\|beginScaleResize\|beginFontResize\|beginResizeBox\|editor.beginResize(" src/pages/AdminVisualBoard.jsx`
  Expected: no output.

  Append CSS, and delete the old `.vb-shape-resize` rule:

```css
/* ---------------- selection handles ---------------- */

.vb-handles {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.vb-handle {
  position: absolute;
  width: 9px;
  height: 9px;
  margin: -4.5px 0 0 -4.5px;
  border: 1.5px solid #0b0102;
  border-radius: 2px;
  background: #f4ca5d;
  pointer-events: auto;
  touch-action: none;
  transform: scale(var(--vb-handle-scale, 1));
}

.vb-handle-nw { left: 0; top: 0; }
.vb-handle-n { left: 50%; top: 0; }
.vb-handle-ne { left: 100%; top: 0; }
.vb-handle-e { left: 100%; top: 50%; }
.vb-handle-se { left: 100%; top: 100%; }
.vb-handle-s { left: 50%; top: 100%; }
.vb-handle-sw { left: 0; top: 100%; }
.vb-handle-w { left: 0; top: 50%; }

.vb-rotate-handle {
  position: absolute;
  left: 50%;
  top: 0;
  width: 12px;
  height: 12px;
  margin-left: -6px;
  border: 1.5px solid #f4ca5d;
  border-radius: 50%;
  background: #fff;
  pointer-events: auto;
  touch-action: none;
  cursor: grab;
  transform: translateY(calc(-24px * var(--vb-handle-scale, 1))) scale(var(--vb-handle-scale, 1));
}

.vb-rotate-handle::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 100%;
  width: 1px;
  height: 10px;
  background: #f4ca5d;
}

.vb-rotate-tooltip {
  position: fixed;
  z-index: 1000;
  pointer-events: none;
  padding: 2px 6px;
  border-radius: 4px;
  background: #111;
  color: #fff;
  font-size: 11px;
}
```

- [ ] **Step 4: Build and rerun the unit tests**

  Run: `node src/lib/boardTransform.test.js && npx vite build`
  Expected: pass, then `✓ built`.

- [ ] **Step 5: Browser check.** On a rectangle:
  1. **8 handles:** there are 8 `.vb-handle` nodes and 1 `.vb-rotate-handle`.
  2. **Anchored resize:** drag the `e` handle 60px right. The node's left
     edge stays within 1px and its width grows by about 60px.
  3. **Alt from centre:** repeat holding `Alt`. The centre stays within 1px.
  4. **Shift keeps proportions:** drag the `se` handle holding `Shift`. The
     width/height ratio stays within 1%.
  5. **Photos:** add a photo and drag its `nw` corner outward. The ratio is
     kept and the handles stay about 9px on screen.
  6. **Text:** the `e` handle changes the Box width field, and a corner
     changes Size.
  7. **Divider:** dragging the `s` end leaves the top end in place.
  8. **Rotate:** drag the rotate handle a quarter turn clockwise. The
     rectangle's transform shows about `rotate(90deg)`, and the tooltip shows
     `90°` while dragging. With `Shift` the angle is a multiple of 15.

- [ ] **Step 6: Review Focus 5** (rotated shape at a size limit). Rotate a
  rectangle 45°, then drag its `e` handle far inward past the opposite side.
  1. The width stops at the minimum.
  2. The opposite (`w`) edge's on-screen position moves by no more than 1px.
  3. The handles sit on the rotated edges (the `e` handle's rect centre lies
     on the rotated right edge, within 2px).

---

### Task 7: Edit text on the canvas

**Files:**
- Create: `src/components/CanvasTextEditor.jsx`
- Modify: `src/pages/AdminVisualBoard.jsx`: `editingTextId` state, and the
  text branch of `renderLayerEntry`.
- Modify: `src/styles/globals.css`

**Interfaces:**
- **Consumes:** `editor.setTextContent(id, text)`.
- **Produces:** `setEditingTextId(id)` in the page. Task 8's Enter shortcut
  uses it.

- [ ] **Step 1: Create `src/components/CanvasTextEditor.jsx`**

```jsx
import { useEffect, useRef } from 'react';

import { resolveTextStyle } from '../lib/textStyle';

/* The text's own look, minus what a textarea can't show: a gradient paints
   through glyphs with background-clip, so it edits in its first colour. */
function editingStyle(text) {
  const { backgroundImage, WebkitBackgroundClip, backgroundClip, width, ...style } = resolveTextStyle(text);
  const fill = text.style.fill;
  return {
    ...style,
    whiteSpace: 'pre-wrap',
    ...(fill?.type === 'gradient' ? { color: fill.stops?.[0]?.color ?? '#ffffff' } : {}),
  };
}

export default function CanvasTextEditor({ text, onDone }) {
  const ref = useRef(null);

  useEffect(() => {
    ref.current.focus();
    ref.current.select();
  }, []);

  return (
    <textarea
      ref={ref}
      className="vb-text-editor"
      defaultValue={text.text}
      style={editingStyle(text)}
      aria-label="Edit text"
      onBlur={(event) => onDone(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
    />
  );
}
```

- [ ] **Step 2: Wire it in `AdminVisualBoard.jsx`.**
  1. Import `CanvasTextEditor`.
  2. Add `const [editingTextId, setEditingTextId] = useState(null);` beside
     the other state.
  3. In the text branch of `renderLayerEntry`, right after the `if (!text …)
     return null;` guard, add:

```jsx
      if (editingTextId === text.id) {
        return (
          <div key={text.id} className="vb-text-editing" style={positionStyle(text)}>
            <CanvasTextEditor
              text={text}
              onDone={(value) => {
                if (value !== text.text) editor.setTextContent(text.id, value);
                setEditingTextId(null);
              }}
            />
          </div>
        );
      }
```

  4. Add to the text `<button>`:

```jsx
          onDoubleClick={() => {
            if (!text.locked) setEditingTextId(text.id);
          }}
```

  5. In `select(kind, id)`, add `setEditingTextId(null);`, so selecting
     something else leaves edit mode even if blur doesn't fire.
  6. Update the canvas hint text to:
     `Click to select, drag to move, drag a handle to resize or rotate, double-click text to edit it. Changes save to your draft as you go - click Publish to put them on the live board.`

  Append CSS:

```css
/* ---------------- on-canvas text editing ---------------- */

.vb-text-editing {
  position: absolute;
  z-index: 8;
}

.vb-text-editor {
  field-sizing: content;
  min-width: 2ch;
  padding: 3px;
  border: 1px solid #6ea8fe;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.35);
  outline: none;
  resize: none;
  overflow: hidden;
}
```

- [ ] **Step 3: Build**

  Run: `npx vite build`
  Expected: `✓ built`.

- [ ] **Step 4: Browser check.** On a text:
  1. **Opens:** double-click it. A `textarea.vb-text-editor` is focused with
     the text selected.
  2. **Saves on outside click:** type `Hello board`, click empty canvas. The
     text node shows `Hello board` and the side-panel textarea matches.
  3. **One undo step:** Ctrl+Z once restores the previous text.
  4. **Esc saves:** double-click again, type, press Esc. The change is saved.
  5. **Locked text:** lock the text, double-click it. No editor opens.
  6. **Gradient text:** on the gold headline, the editor's text colour is
     `rgb(255, 245, 184)` (#fff5b8), not transparent.

---

### Task 8: Keyboard shortcuts, Ctrl+scroll zoom, Space-drag pan

**Files:**
- Modify: `src/pages/AdminVisualBoard.jsx`:
  - replace the keydown effect (lines 370–420) and the arrow-key effect from
    Task 4;
  - add wheel and space effects;
  - add a stage pointerdown handler.
- Modify: `src/styles/globals.css`

**Interfaces:**
- **Consumes:**
  - the page helpers from Task 4;
  - `setEditingTextId` from Task 7;
  - `setContextMenu` from Task 9. Until Task 9 lands, call
    `setOrderMenu(null)` instead; Task 9 renames it.

- [ ] **Step 1: Replace both keyboard effects with one.**
  1. Delete the arrow-key `useEffect` (Task 4's version).
  2. Add above the component:

```js
const ARROW_STEPS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function isTypingTarget(target) {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}
```

  3. Replace the undo/redo keydown `useEffect` with:

```js
  useEffect(() => {
    function handleKeydown(event) {
      if (isTypingTarget(event.target)) return;

      const isMeta = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const selection = currentSelection();

      if (event.key === 'Escape') {
        setSelected(null);
        setMultiSelected([]);
        setOrderMenu(null);
        return;
      }

      if (!isMeta && (event.key === 'Delete' || event.key === 'Backspace')) {
        if (!selection.length) return;
        event.preventDefault();
        removeSelection();
        return;
      }

      if (!isMeta && event.key === 'Enter' && selected?.kind === 'text') {
        event.preventDefault();
        setEditingTextId(selected.id);
        return;
      }

      const arrow = ARROW_STEPS[event.key];
      if (arrow && !isMeta) {
        if (!selection.length) return;
        event.preventDefault();
        const distance = event.shiftKey ? 5 : 0.5;
        editor.nudgeSelection(selection, arrow[0] * distance, arrow[1] * distance);
        return;
      }

      if (!isMeta) return;

      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
      } else if (key === 'y') {
        event.preventDefault();
        editor.redo();
      } else if (key === 'a') {
        event.preventDefault();
        selectAll();
      } else if (key === 'c' || key === 'x' || key === 'd') {
        if (!selection.length) return;
        event.preventDefault();
        if (key === 'c') copySelection();
        else if (key === 'x') cutSelection();
        else duplicateSelection();
      } else if (key === 'v') {
        if (!clipboard.length) return;
        event.preventDefault();
        pasteClipboard();
      } else if (key === 'g') {
        event.preventDefault();
        if (event.shiftKey) ungroupSelection();
        else groupSelection();
      } else if (event.code === 'BracketRight' || event.code === 'BracketLeft') {
        if (!selection.length) return;
        event.preventDefault();
        const forward = event.code === 'BracketRight';
        orderSelection(event.shiftKey ? (forward ? 'front' : 'back') : forward ? 'up' : 'down');
      } else if (key === '=' || key === '+') {
        event.preventDefault();
        zoomBy(10);
      } else if (key === '-') {
        event.preventDefault();
        zoomBy(-10);
      } else if (key === '0') {
        event.preventDefault();
        setZoom(100);
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [editor, selected, multiSelected, clipboard, layout]);
```

  4. Add beside the other page helpers:

```js
  function zoomBy(step) {
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + step)));
  }
```

- [ ] **Step 2: Ctrl+scroll zoom and Space-drag pan.** Add state
  `const [spaceHeld, setSpaceHeld] = useState(false);` and these effects:

```js
  /* Ctrl/Cmd + scroll zooms the canvas instead of the page. */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    function onWheel(event) {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 10 : -10);
    }

    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, []);

  /* Holding Space turns a drag on the canvas into panning the stage. */
  useEffect(() => {
    function onKeyDown(event) {
      if (event.code !== 'Space' || isTypingTarget(event.target)) return;
      event.preventDefault();
      if (!event.repeat) setSpaceHeld(true);
    }

    function onKeyUp(event) {
      if (event.code !== 'Space' || isTypingTarget(event.target)) return;
      event.preventDefault();
      setSpaceHeld(false);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  function panStage(event) {
    if (!spaceHeld) return;
    event.preventDefault();
    event.stopPropagation();

    const stage = stageRef.current;
    const start = { x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop };

    function move(moveEvent) {
      stage.scrollLeft = start.left - (moveEvent.clientX - start.x);
      stage.scrollTop = start.top - (moveEvent.clientY - start.y);
    }

    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
```

  Change the stage element to:

```jsx
            <div
              className={`vb-canvas-stage ${spaceHeld ? 'is-panning' : ''}`}
              ref={stageRef}
              onPointerDownCapture={panStage}
            >
```

  Append CSS:

```css
.vb-canvas-stage.is-panning,
.vb-canvas-stage.is-panning * {
  cursor: grab !important;
}
```

- [ ] **Step 3: Build**

  Run: `npx vite build`
  Expected: `✓ built`.

- [ ] **Step 4: Browser check.** Press each shortcut and assert:
  1. **Ctrl+A:** every visible, unlocked element has `.multi-selected` or
     `.selected`.
  2. **Esc:** nothing selected.
  3. **Ctrl+C, Delete, Ctrl+V:** the pasted copy exists even though the
     original was deleted.
  4. **Ctrl+X:** the element is removed, and Ctrl+V brings a copy back.
  5. **Ctrl+G then Ctrl+Shift+G:** the Layers panel shows grouped, then
     ungrouped.
  6. **Ctrl+] / Ctrl+Shift+[:** the element's index in the Layers panel
     changes.
  7. **Ctrl+= / Ctrl+- / Ctrl+0:** the zoom label reads 110%, then 100%, then
     100%.
  8. **Ctrl+scroll:** one `page.mouse.wheel(0, -100)` with Control held over
     the stage makes the zoom label 110%.
  9. **Space-drag:** at 150% zoom, holding Space and dragging 100px left
     increases `stage.scrollLeft` by about 100.
  10. **Enter:** on a selected text, opens the editor.
  11. **Review Focus 3:** click the X field in Properties, type `a`, then
      Ctrl+A. The field's text is selected and the canvas selection is
      unchanged. In the canvas text editor, pressing Delete deletes a
      character and does not delete the element. A space typed in a field
      does not start panning.

---

### Task 9: Fuller right-click menu

**Files:**
- Create: `src/components/CanvasContextMenu.jsx`
- Modify: `src/pages/AdminVisualBoard.jsx`:
  - rename `orderMenu` to `contextMenu`;
  - update `handleContextMenu`;
  - add a surface `onContextMenu`;
  - replace the `.vb-order-menu` JSX (lines 3218–3243);
  - delete `orderAndClose`.
- Modify: `src/styles/admin-shell.css` (next to `.vb-order-menu`, ~line 706)

**Interfaces:**
- **Consumes:** the page helpers from Task 4, `ALIGN_ACTIONS`, and
  `editor.setLockedMany` / `editor.hideMany`.

- [ ] **Step 1: Create `src/components/CanvasContextMenu.jsx`**

```jsx
import { useLayoutEffect, useRef, useState } from 'react';
import {
  BoxSelect,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  ClipboardPaste,
  Copy,
  CopyPlus,
  EyeOff,
  Group,
  Lock,
  LockOpen,
  Scissors,
  Trash2,
  Ungroup,
} from 'lucide-react';

import { ALIGN_ACTIONS } from './AlignBar';

/*
 * The canvas right-click menu. `onElement` picks the element menu or the
 * empty-canvas one; it's nudged back inside the window when opened near an
 * edge.
 */
export default function CanvasContextMenu({
  x,
  y,
  onElement,
  locked,
  canPaste,
  canGroup,
  canUngroup,
  onAction,
  onAlign,
}) {
  const ref = useRef(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const { width, height } = ref.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    });
  }, [x, y]);

  function item(action, label, Icon, shortcut, disabled = false) {
    return (
      <button key={action} type="button" role="menuitem" disabled={disabled} onClick={() => onAction(action)}>
        <Icon size={13} />
        <span>{label}</span>
        {shortcut && <kbd>{shortcut}</kbd>}
      </button>
    );
  }

  return (
    <div
      ref={ref}
      className="vb-order-menu vb-context-menu"
      style={position}
      /* the dismiss listener runs in capture, so keep it off this menu */
      onPointerDown={(event) => event.stopPropagation()}
      role="menu"
    >
      {onElement ? (
        <>
          {item('cut', 'Cut', Scissors, 'Ctrl+X')}
          {item('copy', 'Copy', Copy, 'Ctrl+C')}
          {item('paste', 'Paste', ClipboardPaste, 'Ctrl+V', !canPaste)}
          {item('duplicate', 'Duplicate', CopyPlus, 'Ctrl+D')}
          {item('delete', 'Delete', Trash2, 'Del')}
          <hr />
          {item('lock', locked ? 'Unlock' : 'Lock', locked ? LockOpen : Lock)}
          {item('hide', 'Hide', EyeOff)}
          {canGroup && item('group', 'Group', Group, 'Ctrl+G')}
          {canUngroup && item('ungroup', 'Ungroup', Ungroup, 'Ctrl+Shift+G')}
          <hr />
          <div className="vb-context-align" role="group" aria-label="Align">
            {ALIGN_ACTIONS.map(({ edge, label, Icon }) => (
              <button key={edge} type="button" title={label} aria-label={label} onClick={() => onAlign(edge)}>
                <Icon size={13} />
              </button>
            ))}
          </div>
          <hr />
          {item('front', 'Bring to front', ChevronsUp, 'Ctrl+Shift+]')}
          {item('up', 'Bring forward', ChevronUp, 'Ctrl+]')}
          {item('down', 'Send backward', ChevronDown, 'Ctrl+[')}
          {item('back', 'Send to back', ChevronsDown, 'Ctrl+Shift+[')}
        </>
      ) : (
        <>
          {item('paste', 'Paste', ClipboardPaste, 'Ctrl+V', !canPaste)}
          {item('selectAll', 'Select all', BoxSelect, 'Ctrl+A')}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `AdminVisualBoard.jsx`.**
  1. Rename the `orderMenu` / `setOrderMenu` state to `contextMenu` /
     `setContextMenu` everywhere (`grep -n "orderMenu\|setOrderMenu"`),
     including the dismiss `useEffect` and Task 8's Escape branch.
  2. Delete `orderAndClose`.
  3. Import `CanvasContextMenu`.
  4. Replace `handleContextMenu`:

```js
  function handleContextMenu(kind, id) {
    return (event) => {
      event.preventDefault();
      event.stopPropagation();

      /* right-clicking part of the multi-selection acts on all of it */
      const inMulti = multiSelected.some((item) => item.kind === kind && item.id === id);
      if (!inMulti) select(kind, id);
      setContextMenu({ x: event.clientX, y: event.clientY, onElement: true });
    };
  }

  function runMenuAction(action) {
    setContextMenu(null);
    const selection = currentSelection();

    switch (action) {
      case 'cut': cutSelection(); break;
      case 'copy': copySelection(); break;
      case 'paste': pasteClipboard(); break;
      case 'duplicate': duplicateSelection(); break;
      case 'delete': removeSelection(); break;
      case 'lock': editor.setLockedMany(selection, !selectionLocked); break;
      case 'hide':
        editor.hideMany(selection);
        setSelected(null);
        setMultiSelected([]);
        break;
      case 'group': groupSelection(); break;
      case 'ungroup': ungroupSelection(); break;
      case 'selectAll': selectAll(); break;
      default: orderSelection(action);
    }
  }
```

  5. On the `.vb-canvas-surface` div, add:

```jsx
                  onContextMenu={(event) => {
                    if (event.target !== event.currentTarget) return;
                    event.preventDefault();
                    setContextMenu({ x: event.clientX, y: event.clientY, onElement: false });
                  }}
```

  6. Replace the whole `{orderMenu && ( <div className="vb-order-menu" …> … </div> )}`
     block with:

```jsx
      {contextMenu && (
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onElement={contextMenu.onElement}
          locked={selectionLocked}
          canPaste={clipboard.length > 0}
          canGroup={multiSelected.length >= 2}
          canUngroup={selectionNow.some(({ kind, id }) => findElement(layout, kind, id)?.groupId)}
          onAction={runMenuAction}
          onAlign={(edge) => {
            setContextMenu(null);
            alignSelection(edge);
          }}
        />
      )}
```

  Append to `src/styles/admin-shell.css`, after the `.vb-order-menu svg`
  rules:

```css
.vb-context-menu {
  min-width: 220px;
}

.vb-context-menu kbd {
  margin-left: auto;
  padding-left: 16px;
  font-family: inherit;
  font-size: 10.5px;
  opacity: 0.55;
}

.vb-context-menu hr {
  margin: 4px 0;
  border: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.vb-context-menu button:disabled {
  opacity: 0.4;
  cursor: default;
}

.vb-context-align {
  display: flex;
  gap: 2px;
  padding: 2px 4px;
}

.vb-context-align > button {
  flex: 1;
  justify-content: center;
}
```

- [ ] **Step 3: Build**

  Run: `npx vite build`
  Expected: `✓ built`.

- [ ] **Step 4: Browser check:**
  1. **Element menu:** right-click an element. The menu shows Cut, Copy,
     Paste (disabled while the clipboard is empty), Duplicate, Delete, Lock,
     Hide, 6 align buttons and 4 order items.
  2. **Copy and paste from the menu:** click Copy, right-click again, and
     Paste is now enabled. Clicking it adds a copy.
  3. **Empty canvas:** right-clicking empty canvas shows only Paste and
     Select all.
  4. **Multi-selection:** right-click one of 3 multi-selected elements and
     click Align top. All 3 tops match.
  5. **Esc** closes the menu.
  6. **Review Focus 4:** right-click at
     `(window.innerWidth - 5, window.innerHeight - 5)`. The menu's
     `getBoundingClientRect()` lies fully inside the window, with its right
     and bottom edges at most `innerWidth` / `innerHeight`.

---

### Task 10: Final verification and clean-up

**Files:** none new.

- [ ] **Step 1: Run all checks:**

  Run: `node src/lib/photoCrop.test.js && node src/lib/boardGeometry.test.js && node src/lib/boardTransform.test.js && npx vite build`
  Expected: three "all checks passed" lines and `✓ built`.

- [ ] **Step 2: Check for leftovers:**

  Run: `grep -rn "centerGuide\|vb-shape-resize\|orderMenu\|beginScaleResize\|beginFontResize\|beginResizeBox" src/`
  Expected: no output.

- [ ] **Step 3: Check the live board still renders.** Open `/visual` with
  Playwright and confirm:
  - no page errors;
  - candidates render;
  - text, logo and photo transforms start with `translate(-50%, -50%)`.

- [ ] **Step 4: Remove the test account** (only if created in
  *Prerequisites*):

```bash
KEY=$(grep VITE_FIREBASE_API_KEY .env | sed 's/.*= *"\?\([^",]*\).*/\1/')
TOKEN=$(curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$KEY" \
  -H 'Content-Type: application/json' \
  -d '{"email":"vb-test-delete-me@example.com","password":"vb-test-Pass-2026!","returnSecureToken":true}' | sed -n 's/.*"idToken": *"\([^"]*\)".*/\1/p')
curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:delete?key=$KEY" \
  -H 'Content-Type: application/json' -d "{\"idToken\":\"$TOKEN\"}"
```

  Expected: `{"kind": "identitytoolkit#DeleteAccountResponse"}`.

- [ ] **Step 5: Stop the port-5180 dev server and delete `.playwright-mcp/`.**
  Then report the changes to the user for them to commit. Don't commit.
