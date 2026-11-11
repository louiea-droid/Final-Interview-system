// Run with: node src/lib/layerNames.test.js
import assert from 'node:assert/strict';

import { cleanLayerName, renamedLayer, shapeLayerName, textLayerName } from './layerNames.js';

assert.equal(textLayerName('Final Interview Applicants', 0), 'Final Interview Applicants');
assert.equal(textLayerName('  Our\n  Brands  ', 1), 'Our'); // first line only, trimmed
assert.equal(textLayerName('Best   of\tLuck!', 2), 'Best of Luck!'); // whitespace collapsed
assert.equal(textLayerName('\n\n  Second line wins  ', 0), 'Second line wins'); // first non-blank line
assert.equal(textLayerName('', 3), 'Text 4');
assert.equal(textLayerName('   \n  ', 4), 'Text 5');
assert.equal(textLayerName(undefined, 0), 'Text 1');
assert.equal(textLayerName('A'.repeat(40), 0), 'A'.repeat(28) + '…');
assert.equal(textLayerName('A'.repeat(28), 0), 'A'.repeat(28));

assert.equal(shapeLayerName('Photo frame', 1, 2, true), 'Photo frame · 2 photos');
assert.equal(shapeLayerName('Photo frame', 2, 1, true), 'Photo frame 2');
assert.equal(shapeLayerName('Photo frame', 3, 0, true), 'Photo frame 3');
assert.equal(shapeLayerName('Rectangle', 1, 0, false), 'Rectangle 1');
assert.equal(shapeLayerName('Rectangle', 2, 5, false), 'Rectangle 2'); // only frames count photos

// a name typed in the Layers panel
assert.equal(cleanLayerName('  My  photo '), 'My photo');
assert.equal(cleanLayerName(''), null);
assert.equal(cleanLayerName('   '), null);
assert.equal(cleanLayerName(null), null);
assert.equal(cleanLayerName(42), null);
assert.equal(cleanLayerName('x'.repeat(50)).length, 40);

// leaving the rename box: only a real change is saved, so an untouched automatic name keeps following the content
assert.deepEqual(renamedLayer('Photo 3', { autoLabel: 'Photo 3' }), { change: false });
assert.deepEqual(renamedLayer(' Photo  3 ', { autoLabel: 'Photo 3' }), { change: false });
assert.deepEqual(renamedLayer('Team photo', { autoLabel: 'Photo 3' }), { change: true, name: 'Team photo' });
assert.deepEqual(renamedLayer('Team photo', { name: 'Team photo', autoLabel: 'Photo 3' }), { change: false });
assert.deepEqual(renamedLayer('', { name: 'Team photo', autoLabel: 'Photo 3' }), { change: true, name: undefined });
assert.deepEqual(renamedLayer('', { autoLabel: 'Photo 3' }), { change: false });
// typing the automatic name over a custom one clears it, so it follows the content again
assert.deepEqual(renamedLayer('Photo 3', { name: 'Team photo', autoLabel: 'Photo 3' }), { change: true, name: undefined });

console.log('layerNames: all checks passed');
