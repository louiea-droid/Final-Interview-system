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

/** Centres an element on its stored percentage position. */
export function positionStyle(element) {
  return {
    left: `${element.x}%`,
    top: `${element.y}%`,
    transform: 'translate(-50%, -50%)',
  };
}

/** The same, for elements whose size is a multiplier of a base width. */
export function scaledPositionStyle(element, baseWidth) {
  return {
    left: `${element.x}%`,
    top: `${element.y}%`,
    transform: `translate(-50%, -50%) scale(${element.scale})`,
    width: `${baseWidth}cqw`,
  };
}
