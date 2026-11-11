// Run with: node src/lib/propertySections.test.js
import assert from 'node:assert/strict';

import { SECTION_NAMES, defaultOpenSections, isSectionOpen } from './propertySections.js';

assert.ok(SECTION_NAMES.includes('Position & size'));

assert.deepEqual(defaultOpenSections('text'), ['Font', 'Fill']);
assert.deepEqual(defaultOpenSections('shape'), ['Fill', 'Position & size']);
for (const kind of ['logo', 'image', 'video', 'divider', 'candidates', 'announcements']) {
  assert.deepEqual(defaultOpenSections(kind), ['Position & size']);
}
assert.deepEqual(defaultOpenSections('board'), []); // the nothing-selected panel starts folded

assert.equal(isSectionOpen('Fill', 'text', {}), true);
assert.equal(isSectionOpen('Animation', 'text', {}), false);
assert.equal(isSectionOpen('Animation', 'image', { Animation: true }), true); // opened once, stays open
assert.equal(isSectionOpen('Fill', 'shape', { Fill: false }), false); // closed once, stays closed
assert.equal(isSectionOpen('Font', 'text', { Fill: false }), true); // other overrides don't leak

console.log('propertySections: all checks passed');
