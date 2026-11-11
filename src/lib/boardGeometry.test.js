// Run with: node src/lib/boardGeometry.test.js
import assert from 'node:assert/strict';

import { clampGroupDelta, positionStyle, scaledPositionStyle } from './boardGeometry.js';

assert.equal(positionStyle({ x: 10, y: 20 }).transform, 'translate(-50%, -50%)');
assert.equal(positionStyle({ x: 10, y: 20, rotation: 30 }).transform, 'translate(-50%, -50%) rotate(30deg)');
assert.equal(
  scaledPositionStyle({ x: 10, y: 20, scale: 2, rotation: -45 }, 20).transform,
  'translate(-50%, -50%) scale(2) rotate(-45deg)'
);
assert.equal(scaledPositionStyle({ x: 10, y: 20, scale: 2 }, 20).transform, 'translate(-50%, -50%) scale(2)');

// a group nudged into the edge stops as one, keeping its shape
const group = [{ x: 98, y: 50 }, { x: 90, y: 40 }];
assert.deepEqual(clampGroupDelta(group, 5, 0), { dx: 2, dy: 0 });
assert.deepEqual(clampGroupDelta(group, -5, -45), { dx: -5, dy: -40 });
assert.deepEqual(clampGroupDelta(group, 1, 1), { dx: 1, dy: 1 });
// already at the edge: no further, but can still come back
assert.deepEqual(clampGroupDelta([{ x: 100, y: 0 }], 3, -3), { dx: 0, dy: 0 });
assert.deepEqual(clampGroupDelta([{ x: 100, y: 0 }], -3, 3), { dx: -3, dy: 3 });

console.log('boardGeometry: all checks passed');
