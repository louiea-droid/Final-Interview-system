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
