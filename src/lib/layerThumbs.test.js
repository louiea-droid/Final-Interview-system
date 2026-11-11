// Run with: node src/lib/layerThumbs.test.js
import assert from 'node:assert/strict';

import { layerThumb } from './layerThumbs.js';
import { BOARD_GOLD_FILL, imageFill, solidFill } from './fill.js';
import { FONT_STACKS } from './textStyle.js';

// text: "Aa" in its own font and colour
assert.deepEqual(layerThumb('text', { style: { fontFamily: 'styleformal', fill: solidFill('#ffffff') } }), {
  type: 'text',
  font: FONT_STACKS.styleformal,
  color: '#ffffff',
});
// a gradient (the board gold) shows its first stop
assert.equal(layerThumb('text', { style: { fontFamily: 'poppins', fill: BOARD_GOLD_FILL } }).color, '#fff5b8');
// an unknown font falls back rather than breaking
assert.equal(layerThumb('text', { style: { fontFamily: 'nope', fill: solidFill('#111111') } }).font, FONT_STACKS.inter);

// pictures show themselves - an icon's svg data URL included
assert.deepEqual(layerThumb('image', { url: 'https://x/a.jpg' }), { type: 'photo', url: 'https://x/a.jpg' });
assert.deepEqual(layerThumb('image', { url: 'data:image/svg+xml;base64,PHN2Zz4=' }).type, 'photo');
assert.deepEqual(layerThumb('video', { url: 'https://x/v.mp4' }), { type: 'icon' });

// shapes: their colour, or a frame's photo
assert.deepEqual(layerThumb('shape', { fill: solidFill('#ff0000') }), { type: 'colour', colour: '#ff0000' });
assert.deepEqual(layerThumb('shape', { fill: imageFill('https://x/f.jpg') }), { type: 'photo', url: 'https://x/f.jpg' });
assert.deepEqual(layerThumb('shape', { fill: imageFill(null), photos: [{ url: 'p' }] }), { type: 'photo', url: 'p' });
assert.deepEqual(layerThumb('shape', { fill: imageFill(null), photos: [] }), { type: 'icon' });

// the fixed parts
assert.deepEqual(layerThumb('logo', { url: 'https://x/logo.png' }), { type: 'photo', url: 'https://x/logo.png' });
assert.deepEqual(layerThumb('logo', { url: null }), { type: 'photo', url: '/visual/logo.png' });
for (const kind of ['candidates', 'announcements', 'divider']) assert.deepEqual(layerThumb(kind, {}), { type: 'icon' });
assert.deepEqual(layerThumb('text', undefined), { type: 'icon' });

console.log('layerThumbs: all checks passed');
