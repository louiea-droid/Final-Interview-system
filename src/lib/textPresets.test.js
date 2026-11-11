// Run with: node src/lib/textPresets.test.js
import assert from 'node:assert/strict';

import { TEXT_PRESETS } from './textPresets.js';
import { BOARD_GOLD_FILL } from './fill.js';
import { FONT_STACKS, MAX_TEXT_SIZE, MIN_TEXT_SIZE } from './textStyle.js';

assert.deepEqual(TEXT_PRESETS.map((p) => p.id), ['heading', 'subheading', 'body', 'bullets', 'script']);
for (const preset of TEXT_PRESETS) {
  assert.ok(preset.label && preset.text.trim(), `${preset.id} has a label and text`);
  assert.ok(preset.fontSize >= MIN_TEXT_SIZE && preset.fontSize <= MAX_TEXT_SIZE, `${preset.id} size in range`);
  assert.ok(FONT_STACKS[preset.style.fontFamily], `${preset.id} uses a known font`);
  assert.equal(preset.bulletList, preset.id === 'bullets');
}
const byId = Object.fromEntries(TEXT_PRESETS.map((p) => [p.id, p]));
assert.deepEqual(byId.heading.style.fill, BOARD_GOLD_FILL, 'the heading is the board gold');
assert.equal(byId.bullets.text.split('\n').length, 2);
assert.equal(byId.script.style.fontFamily, 'styleformal');

console.log('textPresets: all checks passed');
