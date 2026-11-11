// Run with: node src/lib/floatingBar.test.js
import assert from 'node:assert/strict';

import { placeFloatingBar } from './floatingBar.js';

const stage = { left: 0, top: 0, right: 1000, bottom: 600 };
const bar = { width: 200, height: 30 };

// room above: centred, above with an 8px gap
assert.deepEqual(placeFloatingBar({ left: 400, top: 200, right: 600, bottom: 300 }, stage, bar), {
  left: 400,
  top: 162,
  placement: 'above',
});
// no room above: flips below
assert.deepEqual(placeFloatingBar({ left: 400, top: 10, right: 600, bottom: 100 }, stage, bar), {
  left: 400,
  top: 108,
  placement: 'below',
});
// near the right edge: clamped inside with a 4px margin
assert.equal(placeFloatingBar({ left: 950, top: 200, right: 1000, bottom: 300 }, stage, bar).left, 796);
// near the left edge
assert.equal(placeFloatingBar({ left: 0, top: 200, right: 20, bottom: 300 }, stage, bar).left, 4);
// fills the whole stage: below would overflow, so it's clamped to the bottom margin
assert.equal(placeFloatingBar({ left: 0, top: 0, right: 1000, bottom: 600 }, stage, bar).top, 566);
// scrolled out of view
assert.equal(placeFloatingBar({ left: 0, top: 700, right: 100, bottom: 800 }, stage, bar), null);
assert.equal(placeFloatingBar({ left: -300, top: 100, right: -10, bottom: 200 }, stage, bar), null);
// a stage offset on the page: everything is in client px
assert.deepEqual(placeFloatingBar({ left: 500, top: 300, right: 700, bottom: 400 }, { left: 300, top: 100, right: 1300, bottom: 700 }, bar), {
  left: 500,
  top: 262,
  placement: 'above',
});

console.log('floatingBar: all checks passed');
