// Run with: node src/lib/imageFiles.test.js
import assert from 'node:assert/strict';

import { isLegacyDataPhoto, pickImageFile, pickImageFiles } from './imageFiles.js';

const file = (name, type) => ({ name, type });

const png = file('a.png', 'image/png');
assert.equal(pickImageFile([png]), png);
assert.equal(pickImageFile([file('b.jpg', 'image/jpeg')]).name, 'b.jpg');
assert.equal(pickImageFile([file('c.webp', 'image/webp')]).name, 'c.webp');
// the first image wins when several are dropped
assert.equal(pickImageFile([file('notes.txt', 'text/plain'), png, file('d.jpg', 'image/jpeg')]), png);
// not a photo the background remover takes
assert.equal(pickImageFile([file('e.gif', 'image/gif')]), null);
assert.equal(pickImageFile([file('f.pdf', 'application/pdf')]), null);
// nothing dropped (a link or text drag)
assert.equal(pickImageFile([]), null);
assert.equal(pickImageFile(undefined), null);

// every photo in a drop, in order - the canvas takes several at once
{
  const jpg = file('b.jpg', 'image/jpeg');
  assert.deepEqual(pickImageFiles([file('notes.txt', 'text/plain'), png, jpg, file('e.gif', 'image/gif')]), [png, jpg]);
  assert.deepEqual(pickImageFiles([file('f.pdf', 'application/pdf')]), []);
  assert.deepEqual(pickImageFiles(undefined), []);
}

// which embedded pictures are old base64 photos to move into Storage - never an inserted icon or sticker
assert.equal(isLegacyDataPhoto('data:image/jpeg;base64,/9j/4AAQ'), true);
assert.equal(isLegacyDataPhoto('data:image/png;base64,iVBOR'), true);
assert.equal(isLegacyDataPhoto('data:image/svg+xml;base64,PHN2Zz4='), false, 'an icon stays a crisp, transparent SVG');
assert.equal(isLegacyDataPhoto('https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg'), false);
assert.equal(isLegacyDataPhoto(null), false);

console.log('imageFiles: all checks passed');
