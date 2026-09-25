/*
 * Typography for the announcement banner - set from the Announcements admin
 * page and stored in Firestore, the same document for every admin/tab/device.
 * `subscribeAnnouncementStyle` rides Firestore's own realtime updates, so an
 * open admin page (or, once /visual reads it, the live board) picks up a
 * change immediately, the same way the light/dark theme preference works.
 */

import { getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { announcementStyleDoc } from './firebase/collections';

import { BOARD_GOLD_FILL, fillTextCss, normalizeFill, solidFill } from './fill';
import { FONT_STACKS, SHADOW_FILTERS } from './textStyle';

export const DEFAULT_ANNOUNCEMENT_STYLE = {
  fontFamily: 'inter',
  weight: 700,
  textCase: 'none',
  letterSpacing: 0,
  lineHeight: 1.35,
  shadow: 'soft',
  fill: solidFill('#f0d689'),
  fontSize: 2.6,
  /* The banner's leading icon - any single emoji, on by default - and its
     own background, both independent of the message text's own styling. */
  showIcon: true,
  icon: '📢',
  background: solidFill('#2e0505'),
  /* Seconds each announcement stays on screen before the board cycles to
     the next one - only matters when more than one is live at once. */
  cycleSeconds: 7,
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

  merged.showIcon = merged.showIcon !== false;
  merged.icon =
    typeof merged.icon === 'string' && merged.icon.trim()
      ? merged.icon.trim().slice(0, 8)
      : DEFAULT_ANNOUNCEMENT_STYLE.icon;
  merged.background = normalizeFill(merged.background, DEFAULT_ANNOUNCEMENT_STYLE.background);
  merged.cycleSeconds = Number.isFinite(Number(merged.cycleSeconds))
    ? clamp(Number(merged.cycleSeconds), 3, 30)
    : DEFAULT_ANNOUNCEMENT_STYLE.cycleSeconds;

  return merged;
}

/** The announcement style, as of right now. */
export async function loadAnnouncementStyle() {
  const snapshot = await getDoc(announcementStyleDoc);
  return normalizeAnnouncementStyle(snapshot.data());
}

/**
 * Calls `listener` with the announcement style now and after each change -
 * from any admin, tab, or device. Returns an unsubscribe function.
 */
export function subscribeAnnouncementStyle(listener) {
  return onSnapshot(announcementStyleDoc, (snapshot) => {
    listener(normalizeAnnouncementStyle(snapshot.data()));
  });
}

/*
 * Fire-and-forget, like the board layout's saves - the caller's own state
 * already reflects the change the moment a control moves, so nothing needs
 * to wait on the network round trip. A failure is logged, not thrown -
 * including one Firestore raises synchronously, for an `undefined` field
 * (invalid there, unlike in a value bound for JSON.stringify).
 */
export function saveAnnouncementStyle(style) {
  try {
    setDoc(announcementStyleDoc, JSON.parse(JSON.stringify(style))).catch((error) => {
      console.warn('Could not save the announcement style:', error);
    });
  } catch (error) {
    console.warn('Could not save the announcement style:', error);
  }
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
