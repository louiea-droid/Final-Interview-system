/*
 * Typography for the headline, closing line, and any extra text blocks -
 * shared between the real board (VisualBoard.jsx) and the admin editor's
 * canvas (AdminVisualBoard.jsx), so a style choice looks exactly the same in
 * both places. Resolved to a plain inline `style` object rather than Tailwind
 * classes, since fonts, colors, and gradients are free-form and Tailwind can
 * only generate classes it can see literally written in source.
 */

import { BOARD_GOLD_FILL, fillTextCss, normalizeFill, solidFill } from './fill';

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
    maxWidth: `${text.boxWidth ?? 92}cqw`,
    filter: SHADOW_FILTERS[style.shadow] ?? 'none',
    ...fillTextCss(style.fill),
  };
}
