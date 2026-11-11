// Run with: node src/lib/guides.test.js
import assert from 'node:assert/strict';

import { NO_GUIDES, addGuide, loadGuides, moveGuide, removeGuide, saveGuides } from './guides.js';

assert.deepEqual(NO_GUIDES, { x: [], y: [] });

// positions are board %, kept to one decimal and inside the board
let guides = addGuide(NO_GUIDES, 'x', 30.04);
assert.deepEqual(guides, { x: [30], y: [] });
guides = addGuide(guides, 'y', 120);
assert.deepEqual(guides, { x: [30], y: [100] });
assert.deepEqual(NO_GUIDES, { x: [], y: [] }, 'pure: input untouched');

guides = moveGuide(guides, 'x', 0, 44.46);
assert.deepEqual(guides.x, [44.5]);
assert.deepEqual(moveGuide(guides, 'y', 0, -5).y, [0]);

guides = addGuide(guides, 'x', 70);
assert.deepEqual(removeGuide(guides, 'x', 0), { x: [70], y: [100] });

// stored per browser; anything unreadable counts as no guides
{
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  saveGuides({ x: [12.5], y: [40] }, storage);
  assert.deepEqual(loadGuides(storage), { x: [12.5], y: [40] });
  store.set('vb-guides', 'not json');
  assert.deepEqual(loadGuides(storage), NO_GUIDES);
  store.set('vb-guides', JSON.stringify({ x: ['a', 20, 500], y: null }));
  assert.deepEqual(loadGuides(storage), { x: [20, 100], y: [] });
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(loadGuides(broken), NO_GUIDES);
  assert.doesNotThrow(() => saveGuides({ x: [1], y: [] }, broken));
}

console.log('guides: all checks passed');
