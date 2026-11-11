/*
 * The editor's ruler guide lines: { x: [...], y: [...] } in board %, an aid
 * for lining things up that never appears on the live board. Kept in this
 * browser (localStorage), so they survive a reload without touching the
 * layout everyone shares.
 */

export const NO_GUIDES = Object.freeze({ x: [], y: [] });
const KEY = 'vb-guides';

const place = (at) => Math.round(Math.min(100, Math.max(0, at)) * 10) / 10;

export function addGuide(guides, axis, at) {
  return { ...guides, [axis]: [...guides[axis], place(at)] };
}

export function moveGuide(guides, axis, index, at) {
  return { ...guides, [axis]: guides[axis].map((value, i) => (i === index ? place(at) : value)) };
}

export function removeGuide(guides, axis, index) {
  return { ...guides, [axis]: guides[axis].filter((_, i) => i !== index) };
}

const clean = (list) => (Array.isArray(list) ? list.filter((v) => typeof v === 'number' && Number.isFinite(v)).map(place) : []);

/** The guides saved in this browser, or none if there are none (or storage is blocked). */
export function loadGuides(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(KEY) ?? 'null');
    return saved ? { x: clean(saved.x), y: clean(saved.y) } : NO_GUIDES;
  } catch {
    return NO_GUIDES;
  }
}

export function saveGuides(guides, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(guides));
  } catch {
    // private mode or blocked storage: the guides just won't outlive the page
  }
}
