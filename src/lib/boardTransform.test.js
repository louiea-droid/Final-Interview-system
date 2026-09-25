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
