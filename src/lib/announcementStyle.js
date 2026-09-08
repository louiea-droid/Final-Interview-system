/*
 * Typography for the announcement banner on /visual - set from the
 * Announcements admin page and read by the live board, the same way the
 * light/dark theme preference works: saved to localStorage immediately (no
 * draft/publish step) and broadcast on save so an open board picks it up
 * without a reload.
 */

import { BOARD_GOLD_FILL, fillTextCss, normalizeFill, solidFill } from './fill';
import { FONT_STACKS, SHADOW_FILTERS } from './textStyle';

export const ANNOUNCEMENT_STYLE_KEY = 'interview-board-announcement-style';
export const ANNOUNCEMENT_STYLE_EVENT = 'interview-board-announcement-style-updated';

export const DEFAULT_ANNOUNCEMENT_STYLE = {
  fontFamily: 'inter',
  weight: 700,
  textCase: 'none',
  letterSpacing: 0,
  lineHeight: 1.35,
  shadow: 'soft',
  fill: solidFill('#f0d689'),
  fontSize: 2.6,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

/* Styles come back from storage, so every field is checked before it is used -
   same defensive shape as normalizeTextStyle, plus the font size it doesn't
   otherwise carry (a board text's size lives on the text item, not its style). */
export function normalizeAnnouncementStyle(saved) {
  const merged = { ...DEFAULT_ANNOUNCEMENT_STYLE, ...(saved ?? {}) };

  if (!FONT_STACKS[merged.fontFamily]) merged.fontFamily = DEFAULT_ANNOUNCEMENT_STYLE.fontFamily;
  if (!SHADOW_FILTERS[merged.shadow]) merged.shadow = DEFAULT_ANNOUNCEMENT_STYLE.shadow;

  merged.weight = Number.isFinite(Number(merged.weight)) ? Number(merged.weight) : DEFAULT_ANNOUNCEMENT_STYLE.weight;
  merged.letterSpacing = Number.isFinite(Number(merged.letterSpacing)) ? Number(merged.letterSpacing) : 0;
  merged.lineHeight = Number.isFinite(Number(merged.lineHeight)) ? Number(merged.lineHeight) : 1.35;
  merged.fontSize = Number.isFinite(Number(merged.fontSize))
    ? clamp(Number(merged.fontSize), 1, 8)
    : DEFAULT_ANNOUNCEMENT_STYLE.fontSize;

  merged.fill = normalizeFill(merged.fill, BOARD_GOLD_FILL);

  return merged;
}

export function loadAnnouncementStyle() {
  try {
    const raw = window.localStorage.getItem(ANNOUNCEMENT_STYLE_KEY);
    if (!raw) return DEFAULT_ANNOUNCEMENT_STYLE;
    return normalizeAnnouncementStyle(JSON.parse(raw));
  } catch {
    return DEFAULT_ANNOUNCEMENT_STYLE;
  }
}

export function saveAnnouncementStyle(style) {
  try {
    window.localStorage.setItem(ANNOUNCEMENT_STYLE_KEY, JSON.stringify(style));
  } catch (error) {
    console.warn('Could not save the announcement style:', error);
    return false;
  }

  window.dispatchEvent(new Event(ANNOUNCEMENT_STYLE_EVENT));
  return true;
}

/** The complete inline `style` for the announcement banner's message text. */
export function resolveAnnouncementStyle(style) {
  return {
    fontFamily: FONT_STACKS[style.fontFamily] ?? FONT_STACKS.inter,
    fontSize: `${style.fontSize}cqh`,
    fontWeight: style.weight,
    lineHeight: style.lineHeight,
    textTransform: style.textCase === 'none' ? 'none' : style.textCase,
    letterSpacing: `${style.letterSpacing}em`,
    filter: SHADOW_FILTERS[style.shadow] ?? 'none',
    ...fillTextCss(style.fill),
  };
}
