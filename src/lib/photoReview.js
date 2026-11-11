/*
 * The "edit photos before saving" rules for a Records form entry. A photo
 * attaches instantly as `photo_original` (and shows as `photo_file` until
 * edited); its background is removed and it's checked, cleaned, cropped and
 * adjusted in the Edit photos editor, and saving waits until every attached
 * photo has been through it.
 */

export const EMPTY_EDITS = Object.freeze({
  keepOriginal: false,
  specks: false,
  strokes: [],
  trim: 0,
  rotate: 0,
  flipX: false,
  brightness: 0,
  contrast: 0,
});

/** A newly chosen photo: nothing removed yet, so it needs editing. */
export function attachPhoto(entry, file) {
  return {
    ...entry,
    photo_original: file,
    photo_file: file,
    photo_status: 'pending',
    photo_cutout: null,
    photo_edits: EMPTY_EDITS,
    photo_crop: null,
    no_photo: false,
  };
}

/** The finished photo becomes the one that gets saved, with the crop made in the editor. */
export function markReviewed(entry, file) {
  return { ...entry, photo_file: file, photo_status: 'reviewed' };
}

/** Keep original with nothing adjusted: save the file exactly as uploaded. */
export function isUntouchedOriginal(edits) {
  return Boolean(edits.keepOriginal) && !edits.rotate && !edits.flipX && !edits.brightness && !edits.contrast;
}

/*
 * The long side Done saves at. The board shows these as small square cards,
 * and a full-size phone photo re-encoded as PNG would pass the 10 MB limit
 * in storage.rules.
 */
export const SAVED_LONG_SIDE = 2400;

/** A cut-out keeps its transparency as PNG; a kept original has none, so it's a (much smaller) JPEG. */
export function outputFormat(edits, transparent = false) {
  // a kept original that is already a cut-out (made in Canva, Photos...) must stay PNG to keep its clear background
  return edits.keepOriginal && !transparent ? { type: 'image/jpeg', ext: 'jpg', quality: 0.92 } : { type: 'image/png', ext: 'png' };
}

/** Whether an RGBA image has any see-through pixel. */
export function hasTransparency({ data }) {
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

/* A photo that was finished goes back to 'ready' when it changes - its saved file is out of date. */
const reopened = (entry) => (entry.photo_status === 'reviewed' ? 'ready' : entry.photo_status);

/**
 * New edits from the editor. Turning or flipping changes the photo's shape,
 * so its crop no longer fits and is cleared.
 */
export function changeEdits(entry, edits) {
  const before = entry.photo_edits ?? EMPTY_EDITS;
  const reshaped = (edits.rotate ?? 0) !== (before.rotate ?? 0) || Boolean(edits.flipX) !== Boolean(before.flipX);
  // Keep original switched off on a photo with no cut-out: its removal failed, so offer Try again
  const backToFailed =
    before.keepOriginal && !edits.keepOriginal && !entry.photo_cutout && ['ready', 'reviewed', 'failed'].includes(entry.photo_status);
  return {
    ...entry,
    photo_edits: edits,
    photo_status: backToFailed ? 'failed' : reopened(entry),
    ...(reshaped ? { photo_crop: null } : {}),
  };
}

/** A new crop from the editor (percentages of the finished photo, or null for none). */
export function changeCrop(entry, crop) {
  return { ...entry, photo_crop: crop, photo_status: reopened(entry) };
}

/**
 * Writes one of Done's finished photos back - but only onto the photo, the
 * edits and the crop it was made from. If any changed while Done was
 * working, the entry is left as it is (it still needs editing).
 */
export function applyReviewResult(entry, { original, edits, crop, file }) {
  if (entry.photo_original !== original || entry.photo_edits !== edits || entry.photo_crop !== crop) return entry;
  return markReviewed(entry, file);
}

export function needsReview(entry) {
  return Boolean(entry.photo_original) && !entry.no_photo && entry.photo_status !== 'reviewed';
}

export function reviewCount(entries) {
  return entries.filter(needsReview).length;
}

export function canSave(entries) {
  return !entries.some(needsReview);
}
