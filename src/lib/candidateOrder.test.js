// Run with: node src/lib/candidateOrder.test.js
import assert from 'node:assert/strict';

import { reorderGroup } from './candidateOrder.js';

const ids = (list) => list.map((c) => c.id);
const group = [
  { id: 'a', sort_order: 3 },
  { id: 'b', sort_order: 7 },
  { id: 'c', sort_order: 8 },
  { id: 'd', sort_order: 12 },
];

// moving down lands in the target's place - the last spot is reachable
let result = reorderGroup(group, 'a', 'd');
assert.deepEqual(ids(result.ordered), ['b', 'c', 'd', 'a']);
// moving up lands in the target's place too
result = reorderGroup(group, 'd', 'b');
assert.deepEqual(ids(result.ordered), ['a', 'd', 'b', 'c']);

// the group's own numbers are reused, so other dates' candidates never move
assert.deepEqual(result.ordered.map((c) => c.sort_order), [3, 7, 8, 12]);
// and only the candidates whose number changed need saving
assert.deepEqual(result.changes, [
  { id: 'd', sort_order: 7 },
  { id: 'b', sort_order: 8 },
  { id: 'c', sort_order: 12 },
]);

// dropping on itself, or an unknown id, changes nothing
assert.deepEqual(reorderGroup(group, 'b', 'b').changes, []);
assert.deepEqual(reorderGroup(group, 'x', 'b').changes, []);

// tied numbers (older data) are pulled apart so the new order actually holds
const tied = [
  { id: 'a', sort_order: 0 },
  { id: 'b', sort_order: 0 },
  { id: 'c', sort_order: 0 },
];
result = reorderGroup(tied, 'c', 'a');
assert.deepEqual(ids(result.ordered), ['c', 'a', 'b']);
assert.deepEqual(result.ordered.map((c) => c.sort_order), [0, 1, 2]);

console.log('candidateOrder: all checks passed');
