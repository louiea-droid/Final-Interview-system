/* The photo types the candidate forms take - matches their file inputs' `accept`. */
export const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Every PNG, JPG or WEBP in a dropped FileList (or array), in order. */
export function pickImageFiles(files) {
  return [...(files ?? [])].filter((file) => PHOTO_TYPES.includes(file.type));
}

/** The first PNG, JPG or WEBP in a dropped FileList (or array), or null. */
export function pickImageFile(files) {
  return pickImageFiles(files)[0] ?? null;
}

/**
 * An old photo embedded in the layout as base64, which the editor moves into
 * Storage on load. An inserted icon or sticker is an SVG data: URL by design
 * (crisp and transparent), so it is never one of these.
 */
export function isLegacyDataPhoto(url) {
  return typeof url === 'string' && url.startsWith('data:') && !url.startsWith('data:image/svg+xml');
}
