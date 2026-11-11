/*
 * The right panel's folding sections: which start open for each kind of
 * element, so everyday edits (a text's colour, a photo's size) stay one
 * click from a selection, and how a section you opened or closed stays that
 * way as you move between elements.
 */

export const SECTION_NAMES = [
  'Font',
  'Spacing',
  'Fill',
  'Border & effects',
  'Animation',
  'Position & size',
  'Carousel',
  'Candidate cards',
  'Keyboard shortcuts',
];

const DEFAULT_OPEN = {
  text: ['Font', 'Fill'],
  shape: ['Fill', 'Position & size'],
  board: [],
};

export function defaultOpenSections(kind) {
  return DEFAULT_OPEN[kind] ?? ['Position & size'];
}

/** A section the admin opened or closed keeps that state; otherwise the kind's default. */
export function isSectionOpen(name, kind, overrides) {
  return overrides[name] ?? defaultOpenSections(kind).includes(name);
}
