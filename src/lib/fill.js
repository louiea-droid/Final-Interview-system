/*
 * The fill model shared by every paintable board element - text, shapes, and
 * photo frames all carry one of these:
 *
 *   { type: 'solid',    color, opacity }
 *   { type: 'gradient', gradient: 'linear'|'radial', angle, stops[], opacity }
 *   { type: 'image',    url, fit: 'cover'|'contain', opacity }
 *
 * Colors are stored as hex and converted on the way in and out, so the
 * editor can offer HEX / RGB / HSL entry over the same value.
 */

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/* ------------------------------------------------------- color conversions */

export function normalizeHex(value) {
  if (typeof value !== 'string') return null;

  let hex = value.trim().replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('');
  }

  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : null;
}

export function hexToRgb(hex) {
  const clean = normalizeHex(hex) ?? '#000000';

  return {
    r: parseInt(clean.slice(1, 3), 16),
    g: parseInt(clean.slice(3, 5), 16),
    b: parseInt(clean.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }) {
  const channel = (value) =>
    clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');

  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function rgbToHsl({ r, g, b }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
  }

  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  return {
    h: Math.round(((hue * 60) + 360) % 360),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  };
}

export function hslToRgb({ h, s, l }) {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;

  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = lightness - chroma / 2;

  const [red, green, blue] =
    hue < 60
      ? [chroma, secondary, 0]
      : hue < 120
        ? [secondary, chroma, 0]
        : hue < 180
          ? [0, chroma, secondary]
          : hue < 240
            ? [0, secondary, chroma]
            : hue < 300
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];

  return {
    r: (red + match) * 255,
    g: (green + match) * 255,
    b: (blue + match) * 255,
  };
}

export const COLOR_FORMATS = [
  { value: 'hex', label: 'HEX' },
  { value: 'rgb', label: 'RGB' },
  { value: 'hsl', label: 'HSL' },
];

/** The hex value written out in `format`, for the editor's text field. */
export function formatColor(hex, format) {
  if (format === 'rgb') {
    const { r, g, b } = hexToRgb(hex);
    return `${r}, ${g}, ${b}`;
  }

  if (format === 'hsl') {
    const { h, s, l } = rgbToHsl(hexToRgb(hex));
    return `${h}, ${s}%, ${l}%`;
  }

  return normalizeHex(hex) ?? '#000000';
}

/** Reads a typed color in `format` back to hex, or null when it isn't valid yet. */
export function parseColor(text, format) {
  if (format === 'hex') return normalizeHex(text);

  const numbers = String(text)
    .match(/-?\d+(\.\d+)?/g)
    ?.map(Number);

  if (!numbers || numbers.length < 3) return null;

  if (format === 'rgb') {
    return rgbToHex({ r: numbers[0], g: numbers[1], b: numbers[2] });
  }

  if (format === 'hsl') {
    return rgbToHex(hslToRgb({ h: numbers[0], s: numbers[1], l: numbers[2] }));
  }

  return null;
}

export function withAlpha(hex, opacity = 1) {
  const alpha = clamp(Number.isFinite(opacity) ? opacity : 1, 0, 1);
  if (alpha >= 1) return normalizeHex(hex) ?? '#000000';

  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* -------------------------------------------------------------- the palette */

export const COLOR_PALETTE = [
  ['#fff5b8', '#ffe89a', '#f4ca5d', '#c68b22', '#8b6615'],
  ['#ffffff', '#f2f2f2', '#a4a4a4', '#4d4d4d', '#0b0102'],
  ['#ffd9d6', '#d45d59', '#a51d1d', '#6d1010', '#2e0505'],
  ['#d8f3e6', '#4ec9a0', '#2f8fd6', '#5b6ef5', '#8b5bf5'],
];

/* ------------------------------------------------------------- the defaults */

export function solidFill(color, opacity = 1) {
  return { type: 'solid', color, opacity };
}

export function imageFill(url = null, fit = 'cover', opacity = 1) {
  return { type: 'image', url, fit, opacity };
}

export function gradientFill(gradient, angle, stops, opacity = 1) {
  return { type: 'gradient', gradient, angle, stops, opacity };
}

/* The board's signature gold, the default fill for the headline and closing line. */
export const BOARD_GOLD_FILL = gradientFill('radial', 180, [
  { color: '#fff5b8', position: 0 },
  { color: '#f4ca5d', position: 24 },
  { color: '#c68b22', position: 45 },
  { color: '#e4b84d', position: 65 },
  { color: '#ffe89a', position: 84 },
  { color: '#fff3bc', position: 100 },
]);

export const GRADIENT_PRESETS = [
  { label: 'Board gold', fill: BOARD_GOLD_FILL },
  {
    label: 'Sunrise',
    fill: gradientFill('linear', 180, [
      { color: '#fff3bc', position: 0 },
      { color: '#c68b22', position: 100 },
    ]),
  },
  {
    label: 'Rose gold',
    fill: gradientFill('linear', 135, [
      { color: '#ffd9c0', position: 0 },
      { color: '#d98a76', position: 50 },
      { color: '#8b4a3d', position: 100 },
    ]),
  },
  {
    label: 'Silver',
    fill: gradientFill('linear', 180, [
      { color: '#ffffff', position: 0 },
      { color: '#c9c9c9', position: 50 },
      { color: '#7d7d7d', position: 100 },
    ]),
  },
  {
    label: 'Ember',
    fill: gradientFill('linear', 160, [
      { color: '#ffb347', position: 0 },
      { color: '#d45d59', position: 55 },
      { color: '#6d1010', position: 100 },
    ]),
  },
  {
    label: 'Royal',
    fill: gradientFill('linear', 135, [
      { color: '#8b5bf5', position: 0 },
      { color: '#5b6ef5', position: 100 },
    ]),
  },
  {
    label: 'Ocean',
    fill: gradientFill('linear', 135, [
      { color: '#4ec9a0', position: 0 },
      { color: '#2f8fd6', position: 100 },
    ]),
  },
  {
    label: 'Ink',
    fill: gradientFill('linear', 180, [
      { color: '#4d4d4d', position: 0 },
      { color: '#0b0102', position: 100 },
    ]),
  },
];

/* Fills come back from storage, so every field is checked before it is used. */
export function normalizeFill(fill, fallback = BOARD_GOLD_FILL) {
  if (!fill || typeof fill !== 'object') return fallback;

  const opacity = clamp(Number.isFinite(fill.opacity) ? fill.opacity : 1, 0, 1);

  if (fill.type === 'gradient') {
    const stops = Array.isArray(fill.stops)
      ? fill.stops
          .filter((stop) => normalizeHex(stop?.color))
          .map((stop) => ({
            color: normalizeHex(stop.color),
            position: clamp(Number(stop.position) || 0, 0, 100),
          }))
      : [];

    if (stops.length < 2) return { ...BOARD_GOLD_FILL, opacity };

    return {
      type: 'gradient',
      gradient: fill.gradient === 'radial' ? 'radial' : 'linear',
      angle: clamp(Number(fill.angle) || 0, 0, 360),
      stops,
      opacity,
    };
  }

  if (fill.type === 'image') {
    return {
      type: 'image',
      url: typeof fill.url === 'string' ? fill.url : null,
      fit: fill.fit === 'contain' ? 'contain' : 'cover',
      opacity,
    };
  }

  return solidFill(normalizeHex(fill.color) ?? '#f4ca5d', opacity);
}

/* ------------------------------------------------------------------ to CSS */

export function gradientCss(fill) {
  const stops = [...fill.stops]
    .sort((a, b) => a.position - b.position)
    .map((stop) => `${stop.color} ${stop.position}%`)
    .join(', ');

  return fill.gradient === 'radial'
    ? `radial-gradient(ellipse at center, ${stops})`
    : `linear-gradient(${fill.angle}deg, ${stops})`;
}

/**
 * A fill applied to text. A gradient paints through the glyphs with
 * background-clip, which is how the board's gold lettering has always worked.
 */
export function fillTextCss(fill) {
  const resolved = normalizeFill(fill);

  if (resolved.type === 'gradient') {
    return {
      backgroundImage: gradientCss(resolved),
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
      opacity: resolved.opacity,
    };
  }

  // a photo can't paint text; its solid fallback keeps the words readable
  return { color: withAlpha(resolved.color ?? '#ffffff', resolved.opacity) };
}

/** A fill applied to a box - a shape or a photo frame. */
export function fillBoxCss(fill) {
  const resolved = normalizeFill(fill);

  if (resolved.type === 'gradient') {
    return { backgroundImage: gradientCss(resolved), opacity: resolved.opacity };
  }

  if (resolved.type === 'image') {
    if (!resolved.url) return { opacity: resolved.opacity };

    return {
      backgroundImage: `url("${resolved.url}")`,
      backgroundSize: resolved.fit,
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      opacity: resolved.opacity,
    };
  }

  return { backgroundColor: withAlpha(resolved.color, resolved.opacity) };
}

/** A small preview of a fill, for swatches in the editor. */
export function fillPreviewCss(fill) {
  const resolved = normalizeFill(fill);

  if (resolved.type === 'gradient') return { backgroundImage: gradientCss(resolved) };
  if (resolved.type === 'image') {
    return resolved.url
      ? { backgroundImage: `url("${resolved.url}")`, backgroundSize: 'cover' }
      : {};
  }

  return { backgroundColor: resolved.color };
}
