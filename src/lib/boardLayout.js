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
 * Editing happens on a separate draft document in Firestore so the public
 * board never shows work in progress - /visual only ever reads the
 * published document, and stays completely unaware that a draft exists.
 * Publishing copies the draft over it. Both documents update live: /visual
 * subscribes to the published one, and the admin editor loads the draft
 * once when it opens (there is normally only one admin editing at a time).
 */

import {
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { boardTemplatesCollection, boardLayoutDoc, boardLayoutDraftDoc } from './firebase/collections';

import {
  DEFAULT_CLOSING_STYLE,
  DEFAULT_EXTRA_TEXT_STYLE,
  DEFAULT_HEADING_STYLE,
  DEFAULT_TEXT_SIZES,
  normalizeTextStyle,
} from './textStyle';
import { normalizeShapes } from './shapeStyle';
import { DEFAULT_ANIMATION, normalizeAnimation } from './animationStyle';

/*
 * Bumped when stored geometry stops meaning what it used to. Positions were
 * once percentages of a middle column that took about half the board's
 * width; on one free-form surface those same numbers point somewhere else
 * entirely, so a layout from before the change is dropped rather than
 * reinterpreted into a scramble.
 */
export const LAYOUT_VERSION = 3;

/*
 * The candidate board and the announcement strip are boxes rather than
 * points: they carry a width and height as percentages of the board, so
 * they can be placed and sized anywhere instead of being pinned to a
 * column. Both default to roughly where the old fixed layout put them.
 */
export const DEFAULT_CANDIDATES = {
  visible: true,
  x: 68,
  y: 56,
  width: 58,
  height: 74,
  /* Seconds the carousel spends per card - lower is faster. */
  secondsPerCard: 4,
  /* How many candidate boxes sit across one row - the grid's column count.
     Each card's height then follows from its width by its own aspect ratio,
     so raising or lowering this auto-adjusts card size to fit that many
     across, rather than changing how many candidates show per row. */
  perRow: 2,
};

export const DEFAULT_ANNOUNCEMENTS = {
  /* off by default - turn it on from the Layers panel when it is wanted */
  visible: false,
  x: 27,
  y: 78,
  width: 42,
  height: 10,
};

/*
 * The soft gold rules that used to be the column edges. They are ordinary
 * list elements now - as many as you like, each with its own position,
 * length, thickness and direction - so nothing about them is capped.
 */
export const DEFAULT_DIVIDER = {
  x: 50,
  y: 50,
  length: 78,
  thickness: 1,
  orientation: 'vertical',
  visible: true,
};

export const DEFAULT_LAYOUT = {
  version: LAYOUT_VERSION,
  logo: { visible: true, url: null, x: 24, y: 16, scale: 1, animation: DEFAULT_ANIMATION },
  candidates: DEFAULT_CANDIDATES,
  announcements: DEFAULT_ANNOUNCEMENTS,
  // { id, text, x, y, fontSize, visible, style, locked?, groupId? }
  texts: [
    {
      id: 'heading',
      text: 'Final Interview\nApplicants',
      x: 27,
      y: 36,
      fontSize: DEFAULT_TEXT_SIZES.heading,
      visible: true,
      style: DEFAULT_HEADING_STYLE,
    },
    {
      id: 'closing',
      text: 'Best of Luck!',
      x: 27,
      y: 92,
      fontSize: DEFAULT_TEXT_SIZES.closing,
      visible: true,
      style: DEFAULT_CLOSING_STYLE,
    },
  ],
  images: [], // { id, url, x, y, scale, visible, locked?, groupId? }
  videos: [], // { id, url, x, y, scale, visible, locked?, groupId? }
  // { id, x, y, length, thickness, orientation, visible, locked?, groupId? }
  dividers: [{ ...DEFAULT_DIVIDER, id: 'divider-1' }],
  shapes: [], // { id, kind, x, y, width, height, rotation, radius, layer, fill, stroke, visible, locked?, groupId? }
  /*
   * Paint order, back to front, across every kind at once - the layers
   * panel lists it in reverse (front first) and reorders it directly. The
   * logo and the candidate board are always present; every other entry
   * names a real element by (kind, id).
   */
  layerOrder: [
    { kind: 'logo', id: null },
    { kind: 'divider', id: 'divider-1' },
    { kind: 'candidates', id: null },
    { kind: 'announcements', id: null },
    { kind: 'text', id: 'heading' },
    { kind: 'text', id: 'closing' },
  ],
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
    locked: text.locked === true,
    /* How wide the text may run before wrapping, as a share of the board. */
    boxWidth: clamp(text.boxWidth ?? 92, 5, 100),
    /* Each non-empty line becomes its own bulleted item instead of one
       wrapped block of running text - for a list like "Our Brands". */
    bulletList: text.bulletList === true,
    style: normalizeTextStyle(text.style, base),
    animation: normalizeAnimation(text.animation),
    ...(text.groupId ? { groupId: text.groupId } : {}),
  };
}

function layerKey(entry) {
  return `${entry.kind}:${entry.id ?? ''}`;
}

/*
 * Rebuilds the paint order against the elements that actually exist: drops
 * any entry naming something that was deleted, then appends the logo, the
 * candidate board, and any element (old data, or one added after the saved
 * order) that isn't in it yet - new things paint on top, which is where
 * they'd have landed had layerOrder always existed.
 */
function normalizeLayerOrder(saved, layout) {
  const real = [
    { kind: 'logo', id: null },
    { kind: 'candidates', id: null },
    { kind: 'announcements', id: null },
    ...layout.texts.map((item) => ({ kind: 'text', id: item.id })),
    ...layout.dividers.map((item) => ({ kind: 'divider', id: item.id })),
    ...layout.images.map((item) => ({ kind: 'image', id: item.id })),
    ...layout.videos.map((item) => ({ kind: 'video', id: item.id })),
    ...layout.shapes.map((item) => ({ kind: 'shape', id: item.id })),
  ];
  const realKeys = new Set(real.map(layerKey));

  const ordered = Array.isArray(saved)
    ? saved.filter((entry) => entry && realKeys.has(layerKey(entry)))
    : [];

  const seen = new Set(ordered.map(layerKey));

  for (const entry of real) {
    if (!seen.has(layerKey(entry))) {
      ordered.push(entry);
      seen.add(layerKey(entry));
    }
  }

  return ordered;
}

/*
 * Every divider on the board. A layout from when there was only ever one
 * carries it over as the first entry of the list.
 */
function normalizeDividers(parsed) {
  const source = Array.isArray(parsed.dividers)
    ? parsed.dividers
    : parsed.divider
      ? [parsed.divider]
      : [];

  return source
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: item.id ?? crypto.randomUUID(),
      x: clamp(item.x ?? DEFAULT_DIVIDER.x, 0, 100),
      y: clamp(item.y ?? DEFAULT_DIVIDER.y, 0, 100),
      // `height` was the field before dividers could also run across
      length: clamp(item.length ?? item.height ?? DEFAULT_DIVIDER.length, 2, 100),
      thickness: clamp(item.thickness ?? DEFAULT_DIVIDER.thickness, 1, 24),
      orientation: item.orientation === 'horizontal' ? 'horizontal' : 'vertical',
      visible: item.visible !== false,
      locked: item.locked === true,
      ...(item.groupId ? { groupId: item.groupId } : {}),
    }));
}

/* A positioned, sized box - the candidate board and the announcement strip. */
function normalizeBox(box, defaults) {
  const source = box && typeof box === 'object' ? box : {};

  return {
    visible: source.visible !== false,
    locked: source.locked === true,
    x: clamp(source.x ?? defaults.x, 0, 100),
    y: clamp(source.y ?? defaults.y, 0, 100),
    ...(defaults.width === undefined
      ? {}
      : { width: clamp(source.width ?? defaults.width, 1, 100) }),
    ...(defaults.height === undefined
      ? {}
      : { height: clamp(source.height ?? defaults.height, 8, 100) }),
    ...(defaults.secondsPerCard === undefined
      ? {}
      : {
          secondsPerCard: clamp(
            source.secondsPerCard ?? defaults.secondsPerCard,
            0.5,
            30
          ),
        }),
    ...(defaults.perRow === undefined
      ? {}
      : {
          perRow: Math.round(clamp(source.perRow ?? defaults.perRow, 1, 6)),
        }),
  };
}

/* A dropped-in photo. Positions and sizing are left as loosely-checked as
   they always were here - only `animation` is validated, since it's new. */
function normalizeImages(images) {
  if (!Array.isArray(images)) return [];

  return images
    .filter((image) => image && typeof image === 'object' && image.id)
    .map((image) => ({ ...image, animation: normalizeAnimation(image.animation) }));
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

  const layout = {
    logo: {
      ...DEFAULT_LAYOUT.logo,
      ...(parsed.logo ?? {}),
      animation: normalizeAnimation(parsed.logo?.animation),
    },
    candidates: normalizeBox(parsed.candidates, DEFAULT_CANDIDATES),
    announcements: normalizeBox(parsed.announcements, DEFAULT_ANNOUNCEMENTS),
    dividers: normalizeDividers(parsed),
    texts: hasTextData ? texts : DEFAULT_LAYOUT.texts,
    images: normalizeImages(parsed.images),
    videos: Array.isArray(parsed.videos) ? parsed.videos : [],
    shapes: normalizeShapes(parsed.shapes),
  };

  layout.version = LAYOUT_VERSION;
  layout.layerOrder = normalizeLayerOrder(parsed.layerOrder, layout);

  return layout;
}

/* A layout document from before the free-form change, or from a schema
   bump since, cannot be carried over - treated the same as no document. */
function normalizeStoredLayout(data) {
  if (!data || data.version !== LAYOUT_VERSION) return null;
  return normalizeLayout(data);
}

/** Whether an element (the logo, headline, closing line, a photo, or a text block) is shown. */
export function isVisible(element) {
  return element.visible !== false;
}

/** The published layout - what /visual actually shows, as of right now. */
export async function loadBoardLayout() {
  const snapshot = await getDoc(boardLayoutDoc);
  return normalizeStoredLayout(snapshot.data()) ?? DEFAULT_LAYOUT;
}

/**
 * Calls `listener` with the published layout now and after each change -
 * from any admin, tab, or device, since this rides Firestore's own realtime
 * updates. Returns an unsubscribe function.
 */
export function subscribeBoardLayout(listener) {
  return onSnapshot(boardLayoutDoc, (snapshot) => {
    listener(normalizeStoredLayout(snapshot.data()) ?? DEFAULT_LAYOUT);
  });
}

/**
 * The admin's working copy, loaded once when the editor opens. Falls back
 * to the published layout when there is no draft yet, so editing always
 * starts from what is currently live rather than the bare defaults.
 */
export async function loadDraftLayout() {
  const snapshot = await getDoc(boardLayoutDraftDoc);
  return normalizeStoredLayout(snapshot.data()) ?? (await loadBoardLayout());
}

/**
 * Calls `listener` with the admin's working copy now and after each change,
 * falling back to the published layout the same way loadDraftLayout does
 * when there is no draft yet. Backs the admin-only draft preview (see
 * VisualBoard's `usePublished` prop) so "what will this look like" never
 * has to mean "what did it look like as of the last Publish".
 */
export function subscribeDraftLayout(listener) {
  return onSnapshot(boardLayoutDraftDoc, (snapshot) => {
    const draft = normalizeStoredLayout(snapshot.data());
    if (draft) {
      listener(draft);
    } else {
      loadBoardLayout().then(listener);
    }
  });
}

/*
 * Firestore rejects any field whose value is `undefined` outright (a
 * synchronous throw, not a rejected promise) - unlike the old
 * localStorage.setItem(JSON.stringify(layout)), where JSON.stringify
 * silently dropped those keys. The editor sets fields like a duplicated
 * element's `groupId` to `undefined` to mean "not in a group", so a layout
 * has to be put through the same JSON round trip before it can be written,
 * to strip them the same way JSON.stringify always did.
 */
function sanitizeForFirestore(value) {
  return JSON.parse(JSON.stringify(value));
}

/*
 * Both saves below are fire-and-forget from the caller's point of view -
 * the editor's own state already updated the moment the admin dragged or
 * typed something, so nothing needs to wait on the network round trip
 * before feeling responsive. A failure is logged, not thrown, matching how
 * a failed localStorage write used to be handled - including a failure
 * Firestore raises synchronously (invalid data), not just a rejected write.
 */

/** Saves the draft only - /visual never sees this until it's published. */
export function saveDraftLayout(layout) {
  try {
    setDoc(boardLayoutDraftDoc, sanitizeForFirestore(layout)).catch((error) => {
      console.warn('Could not save the draft board layout:', error);
    });
  } catch (error) {
    console.warn('Could not save the draft board layout:', error);
  }
  return true;
}

/** Makes `layout` the published layout /visual reads. */
export function saveBoardLayout(layout) {
  try {
    setDoc(boardLayoutDoc, sanitizeForFirestore(layout)).catch((error) => {
      console.warn('Could not save the board layout:', error);
    });
  } catch (error) {
    console.warn('Could not save the board layout:', error);
  }
  return true;
}

/*
 * Publishes the current draft: it becomes the live layout /visual shows.
 * Unlike the two saves above, this one is a deliberate admin action, not a
 * side effect of every drag or keystroke - so it awaits both writes and
 * throws if either fails (e.g. the layout, photos included, no longer fits
 * Firestore's 1 MiB document limit), instead of failing silently while the
 * editor still reports success.
 */
export async function publishBoardLayout(layout) {
  const data = sanitizeForFirestore(layout);
  await Promise.all([setDoc(boardLayoutDraftDoc, data), setDoc(boardLayoutDoc, data)]);
}

/*
 * Named snapshots of a layout, saved on the side so an admin can come back
 * to a look they liked without it living on the live board or the draft -
 * saving one doesn't touch either, and applying one only replaces the draft.
 */

/**
 * Calls `listener` with every saved template, newest first, now and after
 * each change. Returns an unsubscribe function.
 */
export function subscribeTemplates(listener) {
  return onSnapshot(boardTemplatesCollection, (snapshot) => {
    const templates = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
    templates.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
    listener(templates);
  });
}

/** Every saved template, newest first, fetched once. */
export async function loadTemplates() {
  const snapshot = await getDocs(boardTemplatesCollection);
  const templates = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  templates.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  return templates;
}

/** Saves `layout` as a new named template; returns it once Firestore confirms it. */
export async function saveTemplate(name, layout) {
  const template = {
    name: name.trim() || 'Untitled template',
    savedAt: new Date().toISOString(),
    layout: sanitizeForFirestore(layout),
  };

  const docRef = await addDoc(boardTemplatesCollection, template);
  return { id: docRef.id, ...template };
}

/**
 * The normalized layout of one of the already-loaded `templates` (from
 * `subscribeTemplates`/`loadTemplates`), or null if `id` isn't among them -
 * a pure lookup, not a Firestore read, since the caller already has the list.
 */
export function applyTemplate(templates, id) {
  const template = templates.find((item) => item.id === id);
  return template ? normalizeLayout(template.layout) : null;
}

export function deleteTemplate(id) {
  deleteDoc(doc(boardTemplatesCollection, id)).catch((error) => {
    console.warn('Could not delete the template:', error);
  });
}
