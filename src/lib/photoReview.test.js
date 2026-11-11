// Run with: node src/lib/photoReview.test.js
import assert from 'node:assert/strict';

import {
  EMPTY_EDITS,
  applyReviewResult,
  attachPhoto,
  canSave,
  changeCrop,
  changeEdits,
  SAVED_LONG_SIDE,
  isUntouchedOriginal,
  outputFormat,
  hasTransparency,
  markReviewed,
  needsReview,
  reviewCount,
} from './photoReview.js';

const fresh = { localId: '1', name: '', photo_file: null, photo_crop: null, no_photo: false };
const photo = { name: 'face.jpg' };
const result = { name: 'face.png' };

assert.equal(needsReview(fresh), false, 'no photo, nothing to review');

const attached = attachPhoto({ ...fresh, photo_crop: { x: 1, y: 1, width: 5, height: 5 } }, photo);
assert.equal(attached.photo_original, photo);
assert.equal(attached.photo_file, photo, 'the original shows until reviewed');
assert.equal(attached.photo_status, 'pending');
assert.equal(attached.photo_cutout, null);
assert.deepEqual(attached.photo_edits, EMPTY_EDITS);
assert.equal(attached.photo_crop, null, 'a new photo drops the old crop');
assert.equal(attached.no_photo, false);
assert.equal(needsReview(attached), true);
assert.equal(fresh.photo_crop, null, 'input untouched');

const reviewed = markReviewed({ ...attached, photo_status: 'ready', photo_crop: { x: 0, y: 0, width: 1, height: 1 } }, result);
assert.equal(reviewed.photo_file, result);
assert.equal(reviewed.photo_status, 'reviewed');
assert.deepEqual(reviewed.photo_crop, { x: 0, y: 0, width: 1, height: 1 }, 'the crop made in the editor is kept');
assert.equal(needsReview(reviewed), false);

// changing a photo after review puts it back in the queue to review
assert.equal(needsReview(attachPhoto(reviewed, { name: 'other.jpg' })), true);

// ticking None takes an unreviewed photo out of the way
assert.equal(needsReview({ ...attached, no_photo: true }), false);

const forms = [fresh, attached, reviewed, { ...attached, localId: '4' }];
assert.equal(reviewCount(forms), 2);
assert.equal(canSave(forms), false);
assert.equal(canSave([fresh, reviewed]), true);
assert.equal(canSave([]), true);

// re-editing a reviewed photo makes it need review again - its saved file no longer matches
{
  const edits = { ...EMPTY_EDITS, trim: 2 };
  const reEdited = changeEdits(reviewed, edits);
  assert.equal(reEdited.photo_edits, edits);
  assert.equal(reEdited.photo_status, 'ready');
  assert.equal(needsReview(reEdited), true);
  assert.equal(changeEdits({ ...attached, photo_status: 'ready' }, edits).photo_status, 'ready');
  assert.equal(changeEdits(attached, edits).photo_status, 'pending', 'still waiting for its cut-out');
}

// Done's result only lands on the photo, and the edits, it was made from
{
  const ready = { ...attached, photo_status: 'ready' };
  const made = { original: ready.photo_original, edits: ready.photo_edits, crop: ready.photo_crop, file: result };
  assert.equal(applyReviewResult(ready, made).photo_status, 'reviewed');
  assert.equal(applyReviewResult(ready, made).photo_file, result);

  const replaced = attachPhoto(ready, { name: 'newer.jpg' });
  assert.equal(applyReviewResult(replaced, made), replaced, 'photo replaced meanwhile: untouched');

  const editedMeanwhile = changeEdits(ready, { ...EMPTY_EDITS, specks: true });
  assert.equal(applyReviewResult(editedMeanwhile, made), editedMeanwhile, 'edited meanwhile: untouched');
}

// the editor's new fields
assert.equal(EMPTY_EDITS.rotate, 0);
assert.equal(EMPTY_EDITS.flipX, false);
assert.equal(EMPTY_EDITS.brightness, 0);
assert.equal(EMPTY_EDITS.contrast, 0);

// Keep original with nothing adjusted saves the file as uploaded
assert.equal(isUntouchedOriginal({ ...EMPTY_EDITS, keepOriginal: true }), true);
assert.equal(isUntouchedOriginal({ ...EMPTY_EDITS, keepOriginal: true, rotate: 90 }), false);
assert.equal(isUntouchedOriginal({ ...EMPTY_EDITS, keepOriginal: true, brightness: 5 }), false);
assert.equal(isUntouchedOriginal({ ...EMPTY_EDITS, keepOriginal: true, flipX: true }), false);
assert.equal(isUntouchedOriginal(EMPTY_EDITS), false);

// turning or flipping changes the photo's shape, so the crop goes; colour keeps it
{
  const crop = { x: 10, y: 10, width: 50, height: 50 };
  const cropped = { ...attached, photo_status: 'ready', photo_crop: crop };
  assert.equal(changeEdits(cropped, { ...EMPTY_EDITS, rotate: 90 }).photo_crop, null);
  assert.equal(changeEdits(cropped, { ...EMPTY_EDITS, flipX: true }).photo_crop, null);
  assert.equal(changeEdits(cropped, { ...EMPTY_EDITS, brightness: 20 }).photo_crop, crop);
}

// a crop is an edit: a reviewed photo needs Done again
{
  const crop = { x: 0, y: 0, width: 40, height: 40 };
  const reCropped = changeCrop(reviewed, crop);
  assert.equal(reCropped.photo_crop, crop);
  assert.equal(reCropped.photo_status, 'ready');
  assert.equal(changeCrop({ ...attached, photo_status: 'ready' }, crop).photo_status, 'ready');
}

// Done's result keeps the crop it was made with, and refuses a stale one
{
  const crop = { x: 5, y: 5, width: 60, height: 60 };
  const ready = { ...attached, photo_status: 'ready', photo_crop: crop };
  const made = { original: ready.photo_original, edits: ready.photo_edits, crop, file: result };
  assert.equal(applyReviewResult(ready, made).photo_crop, crop);
  const recropped = changeCrop(ready, { x: 0, y: 0, width: 10, height: 10 });
  assert.equal(applyReviewResult(recropped, made), recropped, 'crop changed meanwhile: untouched');
}

// what Done writes: a cut-out keeps its transparency (PNG); a kept original has none (JPEG,
// far smaller - a rotated phone photo as PNG would pass the 10 MB storage limit)
assert.deepEqual(outputFormat(EMPTY_EDITS), { type: 'image/png', ext: 'png' });
assert.deepEqual(outputFormat({ ...EMPTY_EDITS, keepOriginal: true, rotate: 90 }), { type: 'image/jpeg', ext: 'jpg', quality: 0.92 });
// ...unless the kept original is itself transparent (a cut-out made in Canva, Photos, etc.):
// JPEG would turn its clear background black
assert.deepEqual(outputFormat({ ...EMPTY_EDITS, keepOriginal: true, rotate: 90 }, true), { type: 'image/png', ext: 'png' });
assert.equal(SAVED_LONG_SIDE, 2400);
assert.equal(hasTransparency({ data: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]) }), false);
assert.equal(hasTransparency({ data: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 0]) }), true);

// unticking Keep original on a photo with no cut-out (its removal failed) goes back to failed,
// so Try again shows - not to a ready photo that would save the plain original as "Edited"
{
  const keptAfterFailure = { ...attached, photo_status: 'reviewed', photo_cutout: null, photo_edits: { ...EMPTY_EDITS, keepOriginal: true } };
  assert.equal(changeEdits(keptAfterFailure, { ...EMPTY_EDITS, keepOriginal: false }).photo_status, 'failed');
  const withCutout = { ...keptAfterFailure, photo_cutout: { size: 1 } };
  assert.equal(changeEdits(withCutout, { ...EMPTY_EDITS, keepOriginal: false }).photo_status, 'ready');
  const stillRunning = { ...attached, photo_status: 'processing', photo_edits: { ...EMPTY_EDITS, keepOriginal: true } };
  assert.equal(changeEdits(stillRunning, EMPTY_EDITS).photo_status, 'processing', 'a running removal keeps going');
}

console.log('photoReview: all checks passed');
