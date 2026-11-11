// Run with: node src/lib/layerTree.test.js
import assert from 'node:assert/strict';

import { layerTree } from './layerTree.js';

const e = (id) => ({ kind: 'text', id });
const groups = { t1: 'g1', t2: 'g1', t3: 'g2' };
const groupOf = (entry) => groups[entry.id] ?? null;

// a group sits at its frontmost member, and every member shows once
assert.deepEqual(layerTree([e('t1'), e('p1'), e('t2'), e('s1')], groupOf), [
  { type: 'group', groupId: 'g1', entries: [e('t1'), e('t2')] },
  { type: 'item', entry: e('p1') },
  { type: 'item', entry: e('s1') },
]);
// a group with one member left is just an item
assert.deepEqual(layerTree([e('p1'), e('t3')], groupOf), [
  { type: 'item', entry: e('p1') },
  { type: 'item', entry: e('t3') },
]);
// no groups: all items, in order
assert.deepEqual(layerTree([e('a'), e('b')], () => null), [
  { type: 'item', entry: e('a') },
  { type: 'item', entry: e('b') },
]);
assert.deepEqual(layerTree([], groupOf), []);

console.log('layerTree: all checks passed');
