/*
 * Motion for a board element - shared between the live board (VisualBoard.jsx)
 * and the admin editor's canvas (AdminVisualBoard.jsx), so a choice here looks
 * exactly the same in both places, the same contract as textStyle.js/shapeStyle.js.
 *
 * Every positioned element already carries a static inline `transform` for
 * its own centering (and, for a shape, its rotation; for a photo, its scale).
 * Animating that same `transform` would replace it outright for the length of
 * the animation, wiping out that positioning. Motion is applied instead
 * through the independent `translate`/`rotate`/`scale` CSS properties (plus
 * `opacity`), which compose with `transform` rather than overwrite it.
 */

export const ANIMATION_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'bounce', label: 'Bounce' },
  { value: 'spin', label: 'Spin' },
  { value: 'slide', label: 'Slide' },
];

/* Only a photo frame with more than one photo offers this - see PhotoCarousel. */
export const CAROUSEL_ANIMATION = { value: 'carousel', label: 'Carousel' };

export const ANIMATION_DIRECTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
];

export const DEFAULT_ANIMATION = { type: 'none', direction: 'left', speed: 6 };

const KNOWN_TYPES = new Set([...ANIMATION_TYPES, CAROUSEL_ANIMATION].map((entry) => entry.value));
const KNOWN_DIRECTIONS = new Set(ANIMATION_DIRECTIONS.map((entry) => entry.value));

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

/* Animation settings come back from storage, so every field is checked
   before it is used - same defensive shape as normalizeTextStyle. */
export function normalizeAnimation(saved) {
  const merged = { ...DEFAULT_ANIMATION, ...(saved ?? {}) };

  if (!KNOWN_TYPES.has(merged.type)) merged.type = DEFAULT_ANIMATION.type;
  if (!KNOWN_DIRECTIONS.has(merged.direction)) merged.direction = DEFAULT_ANIMATION.direction;
  merged.speed = clamp(Number(merged.speed), 1, 30) || DEFAULT_ANIMATION.speed;

  return merged;
}

const SLIDE_KEYFRAME_BY_DIRECTION = {
  left: 'board-anim-slide-left',
  right: 'board-anim-slide-right',
  up: 'board-anim-slide-up',
  down: 'board-anim-slide-down',
};

const KEYFRAME_BY_TYPE = {
  fade: 'board-anim-fade',
  pulse: 'board-anim-pulse',
  bounce: 'board-anim-bounce',
  spin: 'board-anim-spin',
};

/**
 * The extra inline style a motion setting adds on top of an element's own
 * positioning style, or `{}` for 'none' - and for 'carousel', which isn't a
 * CSS animation at all (see PhotoCarousel).
 */
export function resolveAnimationCss(animation) {
  if (!animation || animation.type === 'none' || animation.type === 'carousel') return {};

  const name =
    animation.type === 'slide'
      ? SLIDE_KEYFRAME_BY_DIRECTION[animation.direction]
      : KEYFRAME_BY_TYPE[animation.type];

  if (!name) return {};

  const timing = animation.type === 'spin' ? 'linear' : 'ease-in-out';
  return { animation: `${name} ${animation.speed}s ${timing} infinite` };
}
