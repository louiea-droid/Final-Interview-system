/* The Uploads tab: what a drop holds, and which board photos count as recent. */
import { PHOTO_TYPES } from './imageFiles.js';

/* Matches the editor's Add Video input. */
export const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg'];

/** The newest `limit` items by their Storage `timeCreated`; items without one go last. */
export function newestFirst(items, limit) {
  return [...items]
    .sort((left, right) => (right.timeCreated ?? '').localeCompare(left.timeCreated ?? ''))
    .slice(0, limit);
}

/** A dropped or chosen FileList, sorted into photos, videos and files the board can't use. */
export function splitUploads(files) {
  const result = { photos: [], videos: [], others: [] };
  for (const file of files ?? []) {
    if (PHOTO_TYPES.includes(file.type)) result.photos.push(file);
    else if (VIDEO_TYPES.includes(file.type)) result.videos.push(file);
    else result.others.push(file);
  }
  return result;
}

/** Where the nth of several photos added together lands (board %), from the centre. */
export function spreadAt(index) {
  return { x: 50 + index * 3, y: 50 + index * 3 };
}
