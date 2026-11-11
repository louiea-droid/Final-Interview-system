// Run with: node src/lib/iconCatalog.test.js
import assert from 'node:assert/strict';

import { ICONS, STICKERS, filterIcons, iconLabel, svgToDataUrl } from './iconCatalog.js';

assert.equal(ICONS.length, 60);
assert.equal(STICKERS.length, 36);

// names read as words, minus the sticker set's "Fc" prefix and trailing digits
assert.equal(iconLabel('GraduationCap'), 'Graduation cap');
assert.equal(iconLabel('FcConferenceCall'), 'Conference call');
assert.equal(iconLabel('FcDiploma1'), 'Diploma');
assert.equal(iconLabel('Building2'), 'Building');

// search: case-insensitive, any word of the name, every word of the query
assert.deepEqual(filterIcons(['Star', 'Heart', 'GraduationCap'], 'star'), ['Star']);
assert.deepEqual(filterIcons(['Star', 'Heart', 'GraduationCap'], 'CAP'), ['GraduationCap']);
assert.deepEqual(filterIcons(['Star', 'Heart', 'GraduationCap'], '  '), ['Star', 'Heart', 'GraduationCap']);
assert.deepEqual(filterIcons(['FcConferenceCall', 'FcPhone'], 'conference call'), ['FcConferenceCall']);
assert.deepEqual(filterIcons(['Star'], 'nothing'), []);

// an SVG becomes a self-contained data: URL that decodes back to the same markup
{
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><path d="M0 0h1v1z" fill="#f4ca5d"/></svg>';
  const url = svgToDataUrl(svg);
  assert.ok(url.startsWith('data:image/svg+xml;base64,'));
  assert.equal(Buffer.from(url.split(',')[1], 'base64').toString('utf8'), svg);
  // non-ASCII text survives (UTF-8, not Latin-1)
  const accented = svgToDataUrl('<svg xmlns="http://www.w3.org/2000/svg"><title>Señor ✓</title></svg>');
  assert.ok(Buffer.from(accented.split(',')[1], 'base64').toString('utf8').includes('Señor ✓'));
}

console.log('iconCatalog: all checks passed');
