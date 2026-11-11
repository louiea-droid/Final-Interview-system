/*
 * How an element's stored geometry becomes CSS.
 *
 * Sizes are expressed in container query units against the board's own box -
 * cqw for widths, cqh for type - so the live board (a full viewport) and the
 * editor's canvas (a 16:9 panel) lay elements out identically. Both mark
 * themselves as the query container; everything here is relative to that.
 */

/* Logo and photo widths at 100%, as a share of the board's width. */
export const LOGO_BASE_WIDTH = 20;
export const PHOTO_BASE_WIDTH = 11.5;

function rotation(element) {
  return element.rotation ? ` rotate(${element.rotation}deg)` : '';
}

/** Centres an element on its stored percentage position. */
export function positionStyle(element) {
  return {
    left: `${element.x}%`,
    top: `${element.y}%`,
    transform: `translate(-50%, -50%)${rotation(element)}`,
  };
}

/** The same, for elements whose size is a multiplier of a base width. */
export function scaledPositionStyle(element, baseWidth) {
  return {
    left: `${element.x}%`,
    top: `${element.y}%`,
    transform: `translate(-50%, -50%) scale(${element.scale})${rotation(element)}`,
    width: `${baseWidth}cqw`,
  };
}

/**
 * Limits one shared move so every point stays on the board (0-100), keeping
 * a group's shape: clamping each member on its own stops the edge member
 * while the rest keep going. Never pushes a point already off the board
 * further out.
 */
export function clampGroupDelta(points, dx, dy) {
  const axis = (key, delta) => {
    const values = points.map((p) => p[key]);
    const low = Math.min(0, 0 - Math.min(...values));
    const high = Math.max(0, 100 - Math.max(...values));
    return Math.min(high, Math.max(low, delta));
  };
  return points.length ? { dx: axis('x', dx), dy: axis('y', dy) } : { dx, dy };
}
