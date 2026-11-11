/*
 * How each candidate card on the board looks - set from the candidate
 * board's panel in the Visual Board editor, stored on layout.candidates.
 *
 * Text sizes are px on a 1920x1080 board, drawn
 * in cqh against the whole board (see boardPx). So resizing a card, the
 * candidate box or "per row" never changes them - only their own sliders
 * do - and the editor's canvas and the TV still agree.
 */

export const CARD_DEFAULTS = {
  /* a card's width as a share of its column; narrower cards stay centred */
  cardWidth: 100,
  /* the photo's height as a share of the card's width (100/110 was the old 11:10) */
  photoHeight: 91,
  nameSize: 28,
  courseSize: 13,
};

/* The gold name bar's least height, in board px; it grows if the text needs more room. */
export const NAME_BAR_HEIGHT = 55;

const LIMITS = {
  cardWidth: [60, 100],
  photoHeight: [50, 160],
  nameSize: [10, 60],
  courseSize: [6, 32],
};

function clamp(value, [min, max], fallback) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** The card settings from a stored candidate box, every one inside its range. */
export function normalizeCardSettings(source) {
  const box = source && typeof source === 'object' ? source : {};
  return Object.fromEntries(
    Object.entries(LIMITS).map(([key, range]) => [key, clamp(box[key], range, CARD_DEFAULTS[key])])
  );
}

/** Board px as a length relative to the whole board's height. */
export function boardPx(px) {
  return `${+(px / 10.8).toFixed(4)}cqh`;
}
