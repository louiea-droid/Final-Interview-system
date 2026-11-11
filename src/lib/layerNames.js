/*
 * What the Layers panel calls each element - its own words where it has
 * some, so "Text 3" doesn't mean clicking through every text to find one.
 */

const MAX_NAME = 28;

/** A text layer's name: its first non-blank line, whitespace collapsed. */
export function textLayerName(text, index) {
  const line = String(text ?? '')
    .split('\n')
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .find(Boolean);

  if (!line) return `Text ${index + 1}`;
  return line.length > MAX_NAME ? `${line.slice(0, MAX_NAME)}…` : line;
}

/** "Rectangle 1", or "Photo frame · 2 photos" for a frame with a carousel. */
export function shapeLayerName(kindLabel, ordinal, photoCount, isFrame) {
  return isFrame && photoCount > 1 ? `${kindLabel} · ${photoCount} photos` : `${kindLabel} ${ordinal}`;
}

const MAX_CUSTOM_NAME = 40;

/** A name typed in the Layers panel, tidied - or null for "use the automatic name". */
export function cleanLayerName(value) {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/g, ' ').trim();
  return name ? name.slice(0, MAX_CUSTOM_NAME) : null;
}

/**
 * What leaving the rename box does: `{ change: false }`, or the name to store
 * (`undefined` = back to the automatic name). Leaving the automatic name as it
 * was must not pin it, or a text's row would stop following its words.
 */
export function renamedLayer(value, { name, autoLabel }) {
  const typed = cleanLayerName(value);
  const next = typed === null || typed === autoLabel ? undefined : typed;
  return next === (name ?? undefined) ? { change: false } : { change: true, name: next };
}
