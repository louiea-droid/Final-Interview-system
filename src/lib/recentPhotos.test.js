// Run with: node src/lib/recentPhotos.test.js
import assert from 'node:assert/strict';

import { newestFirst, spreadAt, VIDEO_TYPES, splitUploads } from './recentPhotos.js';

const a = { url: 'a', timeCreated: '2026-11-01T00:00:00Z' };
const b = { url: 'b', timeCreated: '2026-11-09T00:00:00Z' };
const c = { url: 'c' }; // no time: last
assert.deepEqual(newestFirst([a, c, b], 12).map((x) => x.url), ['b', 'a', 'c']);
assert.deepEqual(newestFirst([a, b, c], 2).map((x) => x.url), ['b', 'a']);
assert.deepEqual(newestFirst([], 12), []);

// a drop onto Uploads: photos, videos, and anything else (refused)
const file = (name, type) => ({ name, type });
const png = file('a.png', 'image/png');
const mp4 = file('b.mp4', 'video/mp4');
const txt = file('c.txt', 'text/plain');
assert.deepEqual(splitUploads([png, txt, mp4]), { photos: [png], videos: [mp4], others: [txt] });
assert.deepEqual(splitUploads(undefined), { photos: [], videos: [], others: [] });
assert.deepEqual(VIDEO_TYPES, ['video/mp4', 'video/webm', 'video/ogg']);

// several photos added at once land a little apart, not exactly on top of each other
assert.deepEqual(spreadAt(0), { x: 50, y: 50 });
assert.deepEqual(spreadAt(2), { x: 56, y: 56 });

console.log('recentPhotos: all checks passed');
