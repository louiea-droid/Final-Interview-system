/*
 * Typography for the headline, closing line, and any extra text blocks -
 * shared between the real board (VisualBoard.jsx) and the admin editor's
 * canvas (AdminVisualBoard.jsx), so a style choice looks exactly the same in
 * both places. Resolved to a plain inline `style` object rather than Tailwind
 * classes, since fonts, colors, and gradients are free-form and Tailwind can
 * only generate classes it can see literally written in source.
 */

import { BOARD_GOLD_FILL, fillTextCss, normalizeFill, normalizeHex, solidFill } from './fill.js';

export const FONT_OPTIONS = [
  { value: 'poppins', label: 'Poppins', stack: "'Poppins', 'Inter', system-ui, sans-serif" },
  { value: 'inter', label: 'Inter', stack: "'Inter', system-ui, sans-serif" },
  { value: 'montserrat', label: 'Montserrat', stack: "'Montserrat', 'Inter', sans-serif" },
  { value: 'oswald', label: 'Oswald', stack: "'Oswald', 'Inter', sans-serif" },
  { value: 'bebas', label: 'Bebas Neue', stack: "'Bebas Neue', 'Oswald', sans-serif" },
  { value: 'playfair', label: 'Playfair Display', stack: "'Playfair Display', Georgia, serif" },
  { value: 'lora', label: 'Lora', stack: "'Lora', Georgia, serif" },
  { value: 'greatvibes', label: 'Great Vibes', stack: "'Great Vibes', 'Brush Script MT', cursive" },
  { value: 'styleformal', label: 'Style Formal', stack: "'StyleFormal', 'Brush Script MT', cursive" },
  { value: 'magneton', label: 'Magneton', stack: "'Magneton', 'Brush Script MT', cursive" },
];

export const FONT_STACKS = Object.fromEntries(FONT_OPTIONS.map((font) => [font.value, font.stack]));

/* The three fonts the first version of this editor shipped with. */
const LEGACY_FONTS = { display: 'poppins', script: 'styleformal', simple: 'inter' };

export const WEIGHT_OPTIONS = [
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semibold' },
  { value: 700, label: 'Bold' },
  { value: 800, label: 'Heavy' },
  { value: 900, label: 'Black' },
];

export const ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

export const CASE_OPTIONS = [
  { value: 'none', label: 'As typed' },
  { value: 'uppercase', label: 'UPPERCASE' },
  { value: 'lowercase', label: 'lowercase' },
  { value: 'capitalize', label: 'Capitalize' },
];

export const SHADOW_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'soft', label: 'Soft' },
  { value: 'hard', label: 'Hard' },
  { value: 'gold', label: 'Gold' },
  { value: 'glow', label: 'Glow' },
];

export const SHADOW_FILTERS = {
  none: 'none',
  soft: 'drop-shadow(0 2px 8px rgba(0,0,0,.55))',
  hard: 'drop-shadow(0 3px 0 rgba(0,0,0,.65))',
  gold: 'drop-shadow(0 2px 8px rgba(244,194,74,.6))',
  glow: 'drop-shadow(0 2px 10px rgba(244,194,74,.55)) drop-shadow(0 0 22px rgba(227,179,91,.4))',
};

/*
 * Font sizes are a share of the board's height, so a size holds its
 * proportions on any display - and reads the same in the editor's canvas.
 */
export const DEFAULT_TEXT_SIZES = { heading: 6.8, closing: 4.4, extra: 2.4 };

/*
 * The one range a text's size may take, shared by everything that can set
 * it - the Size slider, the corner-drag handle, and the check applied to a
 * stored layout. They each used to carry their own bounds, so the slider
 * bottomed out at 0.6 and topped out at 14 while a drag could set anything
 * from 0.3 to 40: a text outside the slider's range left its thumb pinned
 * at one end, where nudging it jumped the size instead of moving it.
 */
export const MIN_TEXT_SIZE = 0.3;
export const MAX_TEXT_SIZE = 40;

/** Holds a text's size inside the range above. */
export function clampTextSize(size) {
  if (!Number.isFinite(size)) return DEFAULT_TEXT_SIZES.extra;
  return Math.min(MAX_TEXT_SIZE, Math.max(MIN_TEXT_SIZE, size));
}

export const DEFAULT_HEADING_STYLE = {
  fontFamily: 'poppins',
  weight: 800,
  align: 'center',
  textCase: 'uppercase',
  letterSpacing: -0.012,
  lineHeight: 1.05,
  shadow: 'glow',
  fill: BOARD_GOLD_FILL,
};

export const DEFAULT_CLOSING_STYLE = {
  fontFamily: 'styleformal',
  weight: 400,
  align: 'center',
  textCase: 'none',
  letterSpacing: 0,
  lineHeight: 1.4,
  shadow: 'gold',
  fill: BOARD_GOLD_FILL,
};

export const DEFAULT_EXTRA_TEXT_STYLE = {
  fontFamily: 'inter',
  weight: 600,
  align: 'center',
  textCase: 'none',
  letterSpacing: 0,
  lineHeight: 1.35,
  shadow: 'soft',
  fill: solidFill('#f0d689'),
};

/*
 * Text styles come back from storage, where they may predate the font list,
 * the case/spacing controls, or fills (an earlier version stored a plain
 * `color`, with null standing for the gold gradient).
 */
export function normalizeTextStyle(style, base) {
  const merged = { ...base, ...(style ?? {}) };

  merged.fontFamily = LEGACY_FONTS[merged.fontFamily] ?? merged.fontFamily;
  if (!FONT_STACKS[merged.fontFamily]) merged.fontFamily = base.fontFamily;

  if (!merged.fill) {
    merged.fill = merged.color ? solidFill(merged.color) : BOARD_GOLD_FILL;
  }
  merged.fill = normalizeFill(merged.fill);
  delete merged.color;

  merged.italic = merged.italic === true;
  merged.underline = merged.underline === true;
  const outlineWidth = merged.outline?.width;
  merged.outline = {
    width: Number.isFinite(outlineWidth) ? Math.min(8, Math.max(0, outlineWidth)) : 0,
    color: normalizeHex(merged.outline?.color) ?? '#000000',
  };

  return merged;
}

/**
 * The complete inline `style` for a text element - typography, fill, and the
 * board-relative font size. The live board and the editor's canvas both use
 * this, so what you set is what shows.
 */
export function resolveTextStyle(text) {
  const style = text.style;

  return {
    fontFamily: FONT_STACKS[style.fontFamily] ?? FONT_STACKS.inter,
    fontSize: `${text.fontSize}cqh`,
    fontWeight: style.weight,
    lineHeight: style.lineHeight ?? 1.35,
    textAlign: style.align,
    textTransform: style.textCase === 'none' ? 'none' : style.textCase,
    letterSpacing: `${style.letterSpacing ?? 0}em`,
    whiteSpace: 'pre-line',
    /*
     * max-width is ignored on a non-replaced inline element, and the editor
     * renders text in a span - so without this the heading never wrapped and
     * ran straight off its box.
     */
    display: 'inline-block',
    /*
     * Every text is absolutely positioned on its centre, and an absolutely
     * positioned element with an automatic width shrinks to fit the space
     * between its `left` and its containing block's right edge - NOT to its
     * own `boxWidth`. So a text placed to the right of the board was capped
     * at whatever was left of the board's width: the headline at left 85.25%
     * could never exceed 14.75% no matter what boxWidth or font size it was
     * given, and grew extra lines instead of getting wider.
     *
     * `max-content` takes the automatic width out of it: the element sizes to
     * its own content and `boxWidth` below is what actually bounds it, which
     * is what the editor's Box width field has always claimed to do.
     */
    width: 'max-content',
    maxWidth: `${text.boxWidth ?? 92}cqw`,
    /*
     * The live board renders text in a <p>, and there is no CSS reset in
     * this app (Tailwind loads without preflight) - so without this, the
     * browser's default 1em top margin pushed every text one font size
     * below its stored position on /visual, while the editor's <span>
     * showed it where it was stored. Same element, same box, both places.
     */
    margin: 0,
    filter: SHADOW_FILTERS[style.shadow] ?? 'none',
    ...(style.italic ? { fontStyle: 'italic' } : {}),
    /* A gradient paints through transparent glyphs, so the underline takes
       its first colour - it would otherwise be invisible too. */
    ...(style.underline
      ? {
          textDecoration: 'underline',
          ...(style.fill?.type === 'gradient' ? { textDecorationColor: style.fill.stops?.[0]?.color } : {}),
        }
      : {}),
    /* Outline width is px on a 1920x1080 board, drawn in cqh (px / 10.8) so
       it keeps its weight at any board size, the editor's canvas included. */
    ...(style.outline?.width > 0
      ? { WebkitTextStroke: `${+(style.outline.width / 10.8).toFixed(4)}cqh ${style.outline.color}` }
      : {}),
    ...fillTextCss(style.fill),
  };
}

