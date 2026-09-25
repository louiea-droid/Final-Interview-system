// Run with: node src/lib/photoCrop.test.js
import assert from 'node:assert/strict';

import { photoCropStyle } from './photoCrop.js';

const url = 'https://example.com/a.png';

assert.deepEqual(
  photoCropStyle(url, null, 'top'),
  { backgroundImage: `url("${url}")`, backgroundSize: 'cover', backgroundPosition: 'top' },
  'no crop: whole photo covers the box at the fallback position'
);

assert.deepEqual(
  photoCropStyle(url, { x: 10, y: 20, width: 50, height: 40 }),
  { backgroundImage: `url("${url}")`, backgroundSize: '200%', backgroundPosition: '20% 33.3333%' },
  'crop: region width fills the box and its top-left lines up with the box'
);

assert.deepEqual(
  photoCropStyle(url, { x: 0, y: 0, width: 100, height: 100 }).backgroundPosition,
  '0% 0%',
  'full-size crop: no divide-by-zero'
);

console.log('photoCrop: all checks passed');
