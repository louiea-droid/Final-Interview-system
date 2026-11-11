/*
 * Whole-element opacity (`element.opacity`, 0-1), shared by the editor and
 * the live board.
 *
 * It's drawn as a CSS `opacity()` filter rather than the `opacity` property:
 * the Fade animation animates `opacity` on the same nodes, and a text's
 * fill sets `opacity` too - a filter composes with both instead of one
 * overwriting the other. Appended to any filter already there (a text's
 * shadow preset, a photo's drop shadow), so the shadow fades with it.
 */

export function normalizeOpacity(value) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

/** `style` with the element's opacity folded into its filter - untouched when fully opaque. */
export function withOpacity(style, element) {
  const opacity = normalizeOpacity(element?.opacity);
  if (opacity >= 1) return style;

  const filter = style.filter && style.filter !== 'none' ? `${style.filter} ` : '';
  return { ...style, filter: `${filter}opacity(${opacity})` };
}
