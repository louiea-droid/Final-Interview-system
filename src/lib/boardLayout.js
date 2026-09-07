/*
 * Free-form layout of the elements on /visual - the logo, every text block,
 * any photos, and any shapes or photo frames the admin drops in. Positions
 * are percentages of the board's width/height and type is sized against its
 * height, so a layout holds up on any display; each element carries its own
 * `visible` flag so one can be turned off without losing its place.
 *
 * The headline and the closing line are ordinary entries in `texts` - they
 * start the board off, but they can be restyled, moved, or removed like any
 * other text.
 *
 * Editing happens on a separate draft copy (its own localStorage key) so
 * the public board never shows work in progress - /visual only ever reads
 * the published copy, and stays completely unaware that a draft exists.
 * Publishing copies the draft over it and notifies other tabs the same way
 * interview-board-settings does: a 'storage' event reaches them on its own,
 * and LAYOUT_EVENT covers a listener in the same window.
 */

import {
  DEFAULT_CLOSING_STYLE,
  DEFAULT_EXTRA_TEXT_STYLE,
  DEFAULT_HEADING_STYLE,
  DEFAULT_TEXT_SIZES,
  normalizeTextStyle,
} from './textStyle';
import { normalizeShapes } from './shapeStyle';

export const LAYOUT_KEY = 'interview-board-layout';
export const DRAFT_KEY = 'interview-board-layout:draft';
export const LAYOUT_EVENT = 'interview-board-layout-updated';

export const DEFAULT_LAYOUT = {
  logo: { visible: true, url: null, x: 50, y: 12, scale: 1 },
  // { id, text, x, y, fontSize, visible, style }
  texts: [
    {
      id: 'heading',
      text: 'Final Interview Applicants',
      x: 50,
      y: 27,
      fontSize: DEFAULT_TEXT_SIZES.heading,
      visible: true,
      style: DEFAULT_HEADING_STYLE,
    },
    {
      id: 'closing',
      text: 'Best of Luck!',
      x: 50,
      y: 91,
      fontSize: DEFAULT_TEXT_SIZES.closing,
      visible: true,
      style: DEFAULT_CLOSING_STYLE,
    },
  ],
  images: [], // { id, url, x, y, scale, visible }
  shapes: [], // { id, kind, x, y, width, height, rotation, radius, layer, fill, stroke, visible }
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function normalizeText(text, base = DEFAULT_EXTRA_TEXT_STYLE, baseSize = DEFAULT_TEXT_SIZES.extra) {
  return {
    id: text.id ?? crypto.randomUUID(),
    text: typeof text.text === 'string' ? text.text : '',
    x: clamp(text.x, 0, 100),
    y: clamp(text.y, 0, 100),
    // `scale` was a multiplier of a per-role base size before sizes were stored outright
    fontSize: Number.isFinite(text.fontSize)
      ? clamp(text.fontSize, 0.3, 40)
      : clamp(baseSize * (Number(text.scale) || 1), 0.3, 40),
    visible: text.visible !== false,
    style: normalizeTextStyle(text.style, base),
  };
}

function normalizeLayout(parsed) {
  const texts = [];

  /*
   * Layouts saved before this kept the headline and the closing line as
   * fixed singletons; they become the first two entries of the text list,
   * where they can now be edited and removed like any other.
   */
  if (parsed.heading) {
    texts.push(
      normalizeText(
        { ...parsed.heading, id: 'heading' },
        DEFAULT_HEADING_STYLE,
        DEFAULT_TEXT_SIZES.heading
      )
    );
  }

  if (parsed.closing) {
    texts.push(
      normalizeText(
        { ...parsed.closing, id: 'closing' },
        DEFAULT_CLOSING_STYLE,
        DEFAULT_TEXT_SIZES.closing
      )
    );
  }

  if (Array.isArray(parsed.texts)) {
    for (const text of parsed.texts) {
      if (text && typeof text === 'object') texts.push(normalizeText(text));
    }
  }

  // an admin who removed every text keeps an empty board, rather than the defaults
  const hasTextData = Boolean(parsed.heading || parsed.closing || Array.isArray(parsed.texts));

  return {
    logo: { ...DEFAULT_LAYOUT.logo, ...(parsed.logo ?? {}) },
    texts: hasTextData ? texts : DEFAULT_LAYOUT.texts,
    images: Array.isArray(parsed.images) ? parsed.images : [],
    shapes: normalizeShapes(parsed.shapes),
  };
}

function readLayout(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return normalizeLayout(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Whether an element (the logo, headline, closing line, a photo, or a text block) is shown. */
export function isVisible(element) {
  return element.visible !== false;
}

/** The published layout - what /visual actually shows. */
export function loadBoardLayout() {
  return readLayout(LAYOUT_KEY) ?? DEFAULT_LAYOUT;
}

/**
 * The admin's working copy. Falls back to the published layout the first
 * time the editor is opened, so editing always starts from what is
 * currently live rather than the bare defaults.
 */
export function loadDraftLayout() {
  return readLayout(DRAFT_KEY) ?? loadBoardLayout();
}

/** Saves the draft only - /visual never sees this until it's published. */
export function saveDraftLayout(layout) {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(layout));
    return true;
  } catch (error) {
    console.warn('Could not save the draft board layout:', error);
    return false;
  }
}

/** Makes `layout` the published layout /visual reads, and notifies this tab. */
export function saveBoardLayout(layout) {
  try {
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch (error) {
    console.warn('Could not save the board layout:', error);
    return false;
  }

  window.dispatchEvent(new Event(LAYOUT_EVENT));
  return true;
}

/** Publishes the current draft: it becomes the live layout /visual shows. */
export function publishBoardLayout(layout) {
  saveDraftLayout(layout);
  return saveBoardLayout(layout);
}
