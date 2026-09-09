/*
 * Shapes and photo frames. Both are boxes on the board: positioned by the
 * same centre percentages every other element uses, sized as a percentage of
 * the board so they hold up at any screen size, and painted with the shared
 * fill model (a solid colour, a gradient, or - for a frame - a photo).
 *
 * A frame is just a box whose fill is an image, which is why it lives here
 * rather than in its own list: everything except its label and its starting
 * fill behaves exactly like a rectangle.
 */

import { fillBoxCss, imageFill, normalizeFill, solidFill } from './fill';
import { DEFAULT_ANIMATION, normalizeAnimation, resolveAnimationCss } from './animationStyle';

export const SHAPE_KINDS = [
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'line', label: 'Line' },
  { value: 'zigzag', label: 'Lightning line' },
  { value: 'frame', label: 'Photo frame' },
  { value: 'box', label: 'Box' },
];

export const FIT_OPTIONS = [
  { value: 'cover', label: 'Fill' },
  { value: 'contain', label: 'Fit' },
];

const BASE_SHAPE = {
  kind: 'rectangle',
  x: 50,
  y: 50,
  width: 22,
  height: 14,
  rotation: 0,
  radius: 6,
  stroke: { color: '#c9a03c', width: 0 },
  visible: true,
  animation: DEFAULT_ANIMATION,
};

/* What each kind starts out as when it is dropped on the board. */
const SHAPE_PRESETS = {
  rectangle: { fill: solidFill('#c9a03c', 0.85) },
  ellipse: { width: 16, height: 16, radius: 0, fill: solidFill('#d45d59', 0.85) },
  triangle: { width: 16, height: 14, radius: 0, fill: solidFill('#f4ca5d', 0.9) },
  line: { width: 30, height: 0.6, radius: 999, fill: solidFill('#c9a03c', 1) },
  /*
   * A zigzag rule. Unlike every other kind its `stroke` is the line itself
   * rather than a border, and it paints no fill - see resolveShapeStyle and
   * ZigzagRule.jsx. `peaks` is how many up-and-down cycles it makes.
   */
  zigzag: {
    width: 16,
    height: 2.4,
    radius: 0,
    fill: solidFill('#c9a03c', 0),
    stroke: { color: '#c9a03c', width: 2 },
    peaks: 6,
  },
  /*
   * `photos` backs the carousel animation (see PhotoCarousel.jsx) - a frame
   * with two or more of them and animation.type 'carousel' slides between
   * them instead of showing `fill`'s single image. Empty otherwise, so an
   * ordinary frame behaves exactly as it always has.
   */
  frame: {
    width: 16,
    height: 20,
    radius: 4,
    fill: imageFill(),
    photos: [],
    stroke: { color: '#c9a03c', width: 2 },
  },
  /*
   * A panel meant to sit behind other elements (usually text) rather than
   * stand on its own - a dark, mostly-transparent card with a soft gold
   * edge, sized to comfortably frame a cluster of content. Send it to the
   * back of the layer order after adding it (see the Layers panel).
   */
  box: {
    width: 34,
    height: 46,
    radius: 10,
    fill: solidFill('#1a0605', 0.55),
    stroke: { color: '#c9a03c', width: 1 },
  },
};

export function createShape(kind = 'rectangle') {
  const preset = SHAPE_PRESETS[kind] ?? SHAPE_PRESETS.rectangle;

  return {
    ...BASE_SHAPE,
    ...preset,
    kind,
    id: crypto.randomUUID(),
    stroke: { ...(preset.stroke ?? BASE_SHAPE.stroke) },
  };
}

export function shapeLabel(shape) {
  return SHAPE_KINDS.find((entry) => entry.value === shape.kind)?.label ?? 'Shape';
}

export function isFrame(shape) {
  return shape.kind === 'frame';
}

/** Whether a shape is the zigzag rule, whose stroke is its line, not a border. */
export function isZigzag(shape) {
  return shape.kind === 'zigzag';
}

/** Whether a frame should render as a sliding photo carousel rather than its static `fill`. */
export function isCarousel(shape) {
  return isFrame(shape) && shape.animation?.type === 'carousel' && (shape.photos?.length ?? 0) > 1;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

/* Shapes come back from storage, so every field is checked before it is used. */
export function normalizeShapes(shapes) {
  if (!Array.isArray(shapes)) return [];

  return shapes
    .filter((shape) => shape && typeof shape === 'object' && shape.id)
    .map((shape) => {
      const kind = SHAPE_KINDS.some((entry) => entry.value === shape.kind)
        ? shape.kind
        : 'rectangle';

      return {
        ...BASE_SHAPE,
        ...shape,
        kind,
        x: clamp(shape.x, 0, 100),
        y: clamp(shape.y, 0, 100),
        width: clamp(shape.width, 0.2, 200),
        height: clamp(shape.height, 0.2, 200),
        rotation: clamp(shape.rotation ?? 0, -180, 180),
        radius: clamp(shape.radius ?? 0, 0, 999),
        stroke: {
          color: shape.stroke?.color ?? BASE_SHAPE.stroke.color,
          width: clamp(shape.stroke?.width ?? 0, 0, 40),
        },
        fill: normalizeFill(shape.fill, SHAPE_PRESETS[kind]?.fill ?? BASE_SHAPE.fill),
        ...(kind === 'zigzag'
          ? { peaks: Math.round(clamp(shape.peaks ?? SHAPE_PRESETS.zigzag.peaks, 1, 40)) }
          : {}),
        photos: kind === 'frame' && Array.isArray(shape.photos)
          ? shape.photos.filter((url) => typeof url === 'string' && url)
          : [],
        animation: normalizeAnimation(shape.animation),
      };
    });
}

/** Builds the inline `style` object that draws a shape or frame. */
export function resolveShapeStyle(shape) {
  return {
    left: `${shape.x}%`,
    top: `${shape.y}%`,
    width: `${shape.width}%`,
    height: `${shape.height}%`,
    transform: `translate(-50%, -50%) rotate(${shape.rotation}deg)`,
    borderRadius: shape.kind === 'ellipse' ? '50%' : `${shape.radius}px`,
    /* the zigzag's stroke is the drawn line, so it gets no border and no
       fill - ZigzagRule.jsx paints it instead */
    ...(shape.stroke.width > 0 && !isZigzag(shape)
      ? { border: `${shape.stroke.width}px solid ${shape.stroke.color}` }
      : {}),
    ...(shape.kind === 'triangle'
      ? { clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }
      : {}),
    // a carousel frame paints its photos itself (see PhotoCarousel.jsx), and
    // a zigzag paints its own line - neither goes through `fill`
    ...(isCarousel(shape) || isZigzag(shape) ? {} : fillBoxCss(shape.fill)),
    ...resolveAnimationCss(shape.animation),
  };
}
