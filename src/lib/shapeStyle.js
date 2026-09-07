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

export const SHAPE_KINDS = [
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'line', label: 'Line' },
  { value: 'frame', label: 'Photo frame' },
];

export const FIT_OPTIONS = [
  { value: 'cover', label: 'Fill' },
  { value: 'contain', label: 'Fit' },
];

/*
 * Where a shape sits in the stack. 'back' puts it behind the candidate board
 * and everything else - the usual place for decoration - and 'front' paints
 * it over the candidates, but still under the headline and photos.
 */
export const LAYER_OPTIONS = [
  { value: 'back', label: 'Behind' },
  { value: 'front', label: 'In front' },
];

const BASE_SHAPE = {
  kind: 'rectangle',
  x: 50,
  y: 50,
  width: 22,
  height: 14,
  rotation: 0,
  radius: 6,
  layer: 'back',
  stroke: { color: '#c9a03c', width: 0 },
  visible: true,
};

/* What each kind starts out as when it is dropped on the board. */
const SHAPE_PRESETS = {
  rectangle: { fill: solidFill('#c9a03c', 0.85) },
  ellipse: { width: 16, height: 16, radius: 0, fill: solidFill('#d45d59', 0.85) },
  triangle: { width: 16, height: 14, radius: 0, fill: solidFill('#f4ca5d', 0.9) },
  line: { width: 30, height: 0.6, radius: 999, fill: solidFill('#c9a03c', 1) },
  frame: {
    width: 16,
    height: 20,
    radius: 4,
    fill: imageFill(),
    stroke: { color: '#c9a03c', width: 2 },
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
        layer: shape.layer === 'front' ? 'front' : 'back',
        stroke: {
          color: shape.stroke?.color ?? BASE_SHAPE.stroke.color,
          width: clamp(shape.stroke?.width ?? 0, 0, 40),
        },
        fill: normalizeFill(shape.fill, SHAPE_PRESETS[kind]?.fill ?? BASE_SHAPE.fill),
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
    ...(shape.stroke.width > 0
      ? { border: `${shape.stroke.width}px solid ${shape.stroke.color}` }
      : {}),
    ...(shape.kind === 'triangle'
      ? { clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }
      : {}),
    ...fillBoxCss(shape.fill),
  };
}
