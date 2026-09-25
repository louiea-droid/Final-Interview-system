import { useEffect, useReducer, useRef, useState } from 'react';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { DEFAULT_LAYOUT, isVisible, saveDraftLayout } from './boardLayout';
import { MAX_TEXT_SIZE, MIN_TEXT_SIZE, clampTextSize } from './textStyle';
import { DEFAULT_EXTRA_TEXT_STYLE, DEFAULT_TEXT_SIZES } from './textStyle';
import { createShape } from './shapeStyle';
import { imageFill, normalizeFill, videoFill } from './fill';
import { storage } from './firebase/storage';
import { DEFAULT_ANIMATION, normalizeAnimation } from './animationStyle';
import {
  BOARD_FRAME,
  alignDeltas,
  boundsOf,
  distributeDeltas,
  gapsAround,
  resizeFromHandle,
  resizeSpan,
  rotationFromDrag,
  shiftBounds,
  snapMove,
  unionBounds,
} from './boardTransform';

/* Photos and the logo are capped on the long edge so several fit in the quota. */
const MAX_IMAGE_EDGE = 800;

/*
 * Video, unlike a photo, can't be shrunk into a data URL small enough for a
 * Firestore document (1 MiB per document, total) - it goes to Firebase
 * Storage instead, and only its download URL lives in the layout. Capped
 * client-side so one oversized file can't tie up someone's connection or
 * run up Storage costs for what is, after all, a looping background clip.
 */
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const VIDEO_STORAGE_FOLDER = 'board-videos';

/* Every photo the editor accepts (logo, board images, frame fills, carousel
   photos) goes to this same Storage folder - only its download URL ever
   lands in the layout document. */
const IMAGE_STORAGE_FOLDER = 'board-images';

/*
 * Every upload gets its own random filename and is never overwritten, so it's
 * safe to have every viewer's browser (the live board included) cache it
 * forever instead of re-fetching or revalidating it on every load - without
 * this, Storage's default caching leaves that unset, and a photo or video can
 * feel slow to appear even after the layout document has already updated.
 */
const STORAGE_CACHE_METADATA = { cacheControl: 'public, max-age=31536000, immutable' };

/* Which list each addressable kind lives in; anything else is a singleton. */
const LIST_BY_KIND = {
  image: 'images',
  video: 'videos',
  text: 'texts',
  shape: 'shapes',
  divider: 'dividers',
};

/* Kinds sized by `scale` × a base width: their node's layout size is pre-scale. */
const SCALED_KINDS = { logo: true, image: true, video: true };

function clampBoard(value) {
  return Math.min(100, Math.max(0, value));
}

/* Undo history: how many steps are kept, and how close together in time
   edits have to be to collapse into a single step - a drag or a slider
   fires dozens of updates a second, and each of those should undo as one
   move rather than one step per pixel. */
const HISTORY_LIMIT = 50;
const HISTORY_BURST_MS = 500;

/* Snapping: how close (in board percent) a drag has to land to a guide before it catches. */
const SNAP_THRESHOLD = 1;

function clampPercent(value) {
  return Math.min(97, Math.max(3, Number.isFinite(value) ? value : 50));
}

/* Every positioned element on the board, tagged with its kind - the set a
   drag can snap against. */
function collectPositionedElements(layout) {
  return [
    { kind: 'logo', id: null, ...layout.logo },
    { kind: 'candidates', id: null, ...layout.candidates },
    { kind: 'announcements', id: null, ...layout.announcements },
    ...layout.texts.map((item) => ({ kind: 'text', ...item })),
    ...layout.images.map((item) => ({ kind: 'image', ...item })),
    ...layout.videos.map((item) => ({ kind: 'video', ...item })),
    ...layout.shapes.map((item) => ({ ...item, kind: 'shape' })),
    ...layout.dividers.map((item) => ({ kind: 'divider', ...item })),
  ];
}

/* Downscales `file` to a JPEG Blob no wider/taller than MAX_IMAGE_EDGE. */
function downscaleToBlob(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Could not read the image file.'));
    reader.onload = () => {
      const image = new Image();

      image.onerror = () => reject(new Error('Could not decode the image file.'));
      image.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height));

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image file.'))),
          'image/jpeg',
          0.82
        );
      };

      image.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

/*
 * Downscales `file` and uploads it to Firebase Storage, returning its
 * download URL - the same path video already takes (see MAX_VIDEO_BYTES
 * above), so the layout document only ever holds a URL, never the photo
 * itself. That's what keeps a board with several photos well under
 * Firestore's 1 MiB per-document limit, no matter how detailed the photos are.
 */
async function uploadImageToStorage(file) {
  const blob = await downscaleToBlob(file);
  const storageRef = ref(storage, `${IMAGE_STORAGE_FOLDER}/${crypto.randomUUID()}.jpg`);

  await uploadBytes(storageRef, blob, STORAGE_CACHE_METADATA);
  return getDownloadURL(storageRef);
}

function isDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:');
}

/* Re-encodes an already-embedded base64 photo through the same pipeline a
   fresh upload takes, so a legacy photo ends up exactly like a new one. */
async function migrateDataUrl(url) {
  const blob = await (await fetch(url)).blob();
  return uploadImageToStorage(blob);
}

/*
 * A board built before photos went to Firebase Storage still carries them
 * as base64 data URLs baked directly into the layout document - each one
 * some tens to hundreds of KB, all counted against Firestore's 1 MiB
 * per-document limit and all sent over the wire on every single save. This
 * finds every one still around (the logo, a standalone photo, a frame's
 * fill, a frame's carousel photos) and re-uploads it to Storage, replacing
 * it with the same small download URL a fresh upload would get - shrinking
 * the document and speeding up every publish after it, with no visible
 * change to the board itself. Returns null if there was nothing to migrate.
 */
async function migrateLegacyPhotos(layout) {
  let changed = false;

  async function migrate(url) {
    if (!isDataUrl(url)) return url;
    changed = true;
    return migrateDataUrl(url);
  }

  const logoUrl = await migrate(layout.logo.url);

  const images = await Promise.all(
    layout.images.map(async (image) => ({ ...image, url: await migrate(image.url) }))
  );

  const shapes = await Promise.all(
    layout.shapes.map(async (shape) => {
      const fill =
        shape.fill?.type === 'image'
          ? { ...shape.fill, url: await migrate(shape.fill.url) }
          : shape.fill;

      const photos = shape.photos?.length
        ? await Promise.all(shape.photos.map(async (photo) => ({ ...photo, url: await migrate(photo.url) })))
        : shape.photos;

      return { ...shape, fill, photos };
    })
  );

  if (!changed) return null;

  return { ...layout, logo: { ...layout.logo, url: logoUrl }, images, shapes };
}

/** The element a (kind, id) pair names, or undefined. */
export function findElement(layout, kind, id) {
  const list = LIST_BY_KIND[kind];
  if (!list) return layout[kind];
  return layout[list]?.find((item) => item.id === id);
}

function patchElement(layout, kind, id, patch) {
  const list = LIST_BY_KIND[kind];

  if (!list) {
    return { ...layout, [kind]: { ...layout[kind], ...patch } };
  }

  return {
    ...layout,
    [list]: layout[list].map((item) => (item.id === id ? { ...item, ...patch } : item)),
  };
}

/*
 * All the editing actions for the board's draft layout - dragging, resizing,
 * show/hide, sizing, positioning, text, fills, photos, and shapes - built on
 * top of a `layout` value and its setter the caller already owns, and
 * persisted through `persist` (the admin editor's draft, saveDraftLayout by
 * default - never the published layout /visual reads directly).
 */
export function useBoardLayoutEditor(
  layout,
  setLayout,
  boundsRef,
  {
    onError,
    onSuccess,
    onProgress,
    persist = saveDraftLayout,
    snapEnabled = false,
    gridSnap = false,
    multiSelected = [],
  } = {}
) {
  const latestLayoutRef = useRef(layout);
  const saveScheduledRef = useRef(false);
  const historyRef = useRef({ undo: [], redo: [] });
  const historyBurstRef = useRef(null);
  const [, bumpHistory] = useReducer((count) => count + 1, 0);

  /*
   * `useRef(layout)`'s argument only ever seeds the ref's very first value -
   * on every later render, changing `layout` does nothing to it on its own.
   * That's fine for edits made through this hook (commitFrom reassigns the
   * ref itself), but the draft now loads from Firestore asynchronously: the
   * caller mounts with a placeholder layout, then swaps in the real one
   * once it arrives. Without this effect, the ref would stay pinned to that
   * placeholder until the first edit - so the very first thing an admin
   * does (say, duplicating an element they just selected) would look up
   * that element in the placeholder, fail to find it, and silently no-op.
   */
  useEffect(() => {
    latestLayoutRef.current = layout;
  }, [layout]);

  const NO_GUIDES = { lines: [], gaps: [] };
  const [guides, setGuides] = useState(NO_GUIDES);
  const [rotating, setRotating] = useState(null);

  function reportError(error) {
    if (onError) onError(error);
    else console.warn(error);
  }

  function reportSuccess(message) {
    onSuccess?.(message);
  }

  /* Shows a message for the length of an upload (which can run tens of
     seconds for a video) rather than leaving the admin looking at an
     unchanged screen with no sign anything is happening. Returns a function
     that clears it once the upload settles, success or failure alike. */
  function reportProgress(message) {
    return onProgress?.(message) ?? (() => {});
  }

  /*
   * Records `latestLayoutRef` onto the undo stack, but only once per burst
   * of rapid edits (a drag, a slider) - each call within HISTORY_BURST_MS of
   * the last resets the timer instead of pushing again, so one gesture is
   * one undo step rather than one per pointermove or keystroke.
   */
  function recordHistory() {
    if (historyBurstRef.current) {
      clearTimeout(historyBurstRef.current);
    } else {
      const { undo } = historyRef.current;
      undo.push(latestLayoutRef.current);
      if (undo.length > HISTORY_LIMIT) undo.shift();
      historyRef.current.redo = [];
      bumpHistory();
    }

    historyBurstRef.current = setTimeout(() => {
      historyBurstRef.current = null;
    }, HISTORY_BURST_MS);
  }

  function undo() {
    if (historyBurstRef.current) {
      clearTimeout(historyBurstRef.current);
      historyBurstRef.current = null;
    }

    const { undo: undoStack, redo: redoStack } = historyRef.current;
    if (!undoStack.length) return;

    const previous = undoStack.pop();
    redoStack.push(latestLayoutRef.current);
    latestLayoutRef.current = previous;
    setLayout(previous);
    persist(previous);
    bumpHistory();
  }

  function redo() {
    if (historyBurstRef.current) {
      clearTimeout(historyBurstRef.current);
      historyBurstRef.current = null;
    }

    const { undo: undoStack, redo: redoStack } = historyRef.current;
    if (!redoStack.length) return;

    const next = redoStack.pop();
    undoStack.push(latestLayoutRef.current);
    latestLayoutRef.current = next;
    setLayout(next);
    persist(next);
    bumpHistory();
  }

  /*
   * Every drag move updates state immediately for a smooth handle, but only
   * queues one write per animation frame - writing on every pointermove
   * event would be a lot of redundant JSON.stringify calls once a photo is
   * on the canvas.
   *
   * `next` is computed from `latestLayoutRef.current` up front, once, and
   * that same value is what both setLayout and persist use - the same
   * pattern undo/redo already follow above. Passing setLayout a functional
   * updater and then immediately reading latestLayoutRef.current back out,
   * as this used to do, is a race: React doesn't necessarily run that
   * updater before the very next line does the read, so persist would often
   * save the *previous* edit instead of this one. Each edit's write would
   * still eventually "catch up" on the next edit's call - except the last
   * edit before navigating away or closing the tab, which would silently
   * never reach Firestore. That's the draft losing your last change the
   * moment you left the page.
   */
  function commitFrom(updater, { immediate = true } = {}) {
    recordHistory();

    const next = updater(latestLayoutRef.current);
    latestLayoutRef.current = next;
    setLayout(next);

    if (immediate) {
      persist(next);
    } else if (!saveScheduledRef.current) {
      saveScheduledRef.current = true;
      requestAnimationFrame(() => {
        saveScheduledRef.current = false;
        persist(latestLayoutRef.current);
      });
    }
  }

  function updateElement(kind, id, patch) {
    commitFrom((current) => patchElement(current, kind, id, patch));
  }

  /* Turns a pointer position into board percentages. */
  function pointToPercent(event, rect) {
    return {
      x: clampPercent(((event.clientX - rect.left) / rect.width) * 100),
      y: clampPercent(((event.clientY - rect.top) / rect.height) * 100),
    };
  }

  function dragWith(onMove, onEnd) {
    const bounds = boundsRef.current;
    if (!bounds) return;

    function move(moveEvent) {
      onMove(moveEvent, bounds.getBoundingClientRect());
    }

    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onEnd?.();
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function surfaceSize() {
    const surface = boundsRef.current;
    return surface ? { W: surface.clientWidth, H: surface.clientHeight } : null;
  }

  /* Size limits in px for a resize, so an anchored drag that hits one
     doesn't drift (see resizeFromHandle). */
  function resizeLimits(kind, element, start, W, H) {
    if (kind === 'shape') return { minW: 0.004 * W, maxW: 2 * W, minH: 0.004 * H, maxH: 2 * H };
    if (kind === 'candidates' || kind === 'announcements') {
      return { minW: 0.08 * W, maxW: W, minH: 0.08 * H, maxH: H };
    }
    if (kind === 'text') {
      return {
        minW: (start.w * MIN_TEXT_SIZE) / element.fontSize,
        maxW: (start.w * MAX_TEXT_SIZE) / element.fontSize,
        minH: 1,
        maxH: Infinity,
      };
    }
    const scale = element.scale ?? 1;
    return { minW: (start.w * 0.1) / scale, maxW: (start.w * 6) / scale, minH: 1, maxH: Infinity };
  }

  function sizePatch(kind, element, start, next, W, H) {
    switch (kind) {
      case 'shape':
        return { width: (next.w / W) * 100, height: (next.h / H) * 100 };
      case 'candidates':
      case 'announcements':
        return { width: (next.w / W) * 100, height: (next.h / H) * 100 };
      case 'text':
        /*
         * A corner drag keeps proportions, scaling fontSize by next.w/start.w
         * - but start.w is the text's drawn width, which wraps at boxWidth
         * and so can be narrower than it. Leaving boxWidth fixed lets the
         * next render wrap at a different width than the drag assumed,
         * sliding the anchor. Scaling boxWidth by the same ratio keeps the
         * wrap point in step with the font size, so it doesn't reflow.
         */
        return {
          fontSize: clampTextSize((element.fontSize * next.w) / start.w),
          boxWidth: Math.min(100, Math.max(5, ((element.boxWidth ?? 92) * next.w) / start.w)),
        };
      default:
        return { scale: Math.min(6, Math.max(0.1, ((element.scale ?? 1) * next.w) / start.w)) };
    }
  }

  /*
   * Drags one of an element's handles. Photos, logo, video and text corners
   * always keep proportions; shapes and boxes do while Shift is held. Alt
   * resizes from the centre. A text's side handles set its wrap width
   * (boxWidth) around its centre - its drawn width can be narrower than
   * boxWidth, so anchoring a side would make the text drift.
   */
  function beginHandleResize(kind, id, handle) {
    return (event) => {
      event.preventDefault();
      event.stopPropagation();

      const element = findElement(latestLayoutRef.current, kind, id);
      const size = surfaceSize();
      const node = nodeFor(kind, id);
      if (!element || element.locked || !size || !node) return;

      const { W, H } = size;
      const scale = SCALED_KINDS[kind] ? element.scale ?? 1 : 1;
      const start = {
        cx: (element.x / 100) * W,
        cy: (element.y / 100) * H,
        w: node.offsetWidth * scale,
        h: node.offsetHeight * scale,
        rotation: element.rotation ?? 0,
      };
      const textSide = kind === 'text' && handle.y === 0;
      const alwaysProportional = SCALED_KINDS[kind] || (kind === 'text' && !textSide);
      const limits = textSide
        ? { minW: 0.05 * W, maxW: W, minH: 1, maxH: Infinity }
        : resizeLimits(kind, element, start, W, H);

      dragWith((moveEvent, rect) => {
        const pointer = {
          x: (moveEvent.clientX - rect.left) * (W / rect.width),
          y: (moveEvent.clientY - rect.top) * (H / rect.height),
        };
        const next = resizeFromHandle(start, handle, pointer, {
          ...limits,
          keepRatio: alwaysProportional || moveEvent.shiftKey,
          fromCenter: textSide || moveEvent.altKey,
        });

        const patch = textSide
          ? { boxWidth: Math.min(100, Math.max(5, (next.w / W) * 100)) }
          : {
              x: clampBoard((next.cx / W) * 100),
              y: clampBoard((next.cy / H) * 100),
              ...sizePatch(kind, element, start, next, W, H),
            };

        commitFrom((current) => patchElement(current, kind, id, patch), { immediate: false });
      });
    };
  }

  /* Drags the round handle above an element; Shift snaps to 15°. */
  function beginRotate(kind, id) {
    return (event) => {
      event.preventDefault();
      event.stopPropagation();

      const element = findElement(latestLayoutRef.current, kind, id);
      const surface = boundsRef.current;
      if (!element || element.locked || !surface) return;

      const rect = surface.getBoundingClientRect();
      const center = {
        x: rect.left + (element.x / 100) * rect.width,
        y: rect.top + (element.y / 100) * rect.height,
      };
      const startPointer = { x: event.clientX, y: event.clientY };
      const startRotation = element.rotation ?? 0;

      dragWith(
        (moveEvent) => {
          const rotation = rotationFromDrag(
            startRotation,
            center,
            startPointer,
            { x: moveEvent.clientX, y: moveEvent.clientY },
            moveEvent.shiftKey
          );
          setRotating({ rotation, x: moveEvent.clientX, y: moveEvent.clientY });
          commitFrom((current) => patchElement(current, kind, id, { rotation }), { immediate: false });
        },
        () => setRotating(null)
      );
    };
  }

  /* Drags one end of a divider; the other end stays put unless Alt is held. */
  function beginDividerResize(id, end) {
    return (event) => {
      event.preventDefault();
      event.stopPropagation();

      const divider = findElement(latestLayoutRef.current, 'divider', id);
      const size = surfaceSize();
      if (!divider || divider.locked || !size) return;

      const vertical = divider.orientation !== 'horizontal';
      const extent = vertical ? size.H : size.W;
      const span = {
        center: ((vertical ? divider.y : divider.x) / 100) * extent,
        length: (divider.length / 100) * extent,
      };

      dragWith((moveEvent, rect) => {
        const pointer = vertical
          ? (moveEvent.clientY - rect.top) * (size.H / rect.height)
          : (moveEvent.clientX - rect.left) * (size.W / rect.width);
        const next = resizeSpan(span, end, pointer, {
          fromCenter: moveEvent.altKey,
          min: 0.02 * extent,
          max: extent,
        });

        commitFrom(
          (current) =>
            patchElement(current, 'divider', id, {
              [vertical ? 'y' : 'x']: clampBoard((next.center / extent) * 100),
              length: (next.length / extent) * 100,
            }),
          { immediate: false }
        );
      });
    };
  }

  function beginDrag(kind, id) {
    return (event) => {
      const element = findElement(latestLayoutRef.current, kind, id);
      if (element?.locked) return;

      event.preventDefault();

      /* What moves: the element's whole group, or the current multi-selection
         it belongs to, or just itself - always by the pointer's delta, so the
         grab point stays under the cursor. */
      const isInMultiSelection =
        multiSelected.length > 1 && multiSelected.some((item) => item.kind === kind && (item.id ?? null) === (id ?? null));
      const members = (isInMultiSelection ? selectionUnits(multiSelected) : selectionUnits([{ kind, id }])).flat();
      if (!members.length) return;

      const start = members.map((m) => ({ ...m, ...pick(findElement(latestLayoutRef.current, m.kind, m.id)) }));
      const isMember = (e) => members.some((m) => m.kind === e.kind && (m.id ?? null) === (asItem(e).id ?? null));

      const movingParts = members.map((m) => measure(m.kind, m.id)).filter(Boolean);
      const movingStart = movingParts.length ? unionBounds(movingParts) : null;
      const others = collectPositionedElements(latestLayoutRef.current)
        .filter((e) => isVisible(e) && !isMember(e))
        .map((e) => measure(e.kind, asItem(e).id))
        .filter(Boolean);

      /* Measured from the press itself, not the first move - otherwise that
         first step of movement is lost. */
      const startRect = boundsRef.current?.getBoundingClientRect();
      if (!startRect) return;
      const origin = {
        x: ((event.clientX - startRect.left) / startRect.width) * 100,
        y: ((event.clientY - startRect.top) / startRect.height) * 100,
      };

      dragWith(
        (moveEvent, rect) => {
          const pointer = {
            x: ((moveEvent.clientX - rect.left) / rect.width) * 100,
            y: ((moveEvent.clientY - rect.top) / rect.height) * 100,
          };
          let dx = pointer.x - origin.x;
          let dy = pointer.y - origin.y;

          const snapping = snapEnabled && !(moveEvent.ctrlKey || moveEvent.metaKey) && movingStart;
          if (snapping) {
            const moved = shiftBounds(movingStart, dx, dy);
            const snap = snapMove(moved, others, { threshold: SNAP_THRESHOLD, grid: gridSnap ? 5 : 0 });
            dx += snap.dx;
            dy += snap.dy;
            setGuides({ lines: snap.guides, gaps: gapsAround(shiftBounds(moved, snap.dx, snap.dy), others) });
          } else {
            setGuides(NO_GUIDES);
          }

          commitFrom(
            (current) =>
              start.reduce(
                (next, m) => patchElement(next, m.kind, m.id, { x: clampBoard(m.x + dx), y: clampBoard(m.y + dy) }),
                current
              ),
            { immediate: false }
          );
        },
        () => setGuides(NO_GUIDES)
      );
    };
  }

  function setPosition(kind, id, x, y) {
    updateElement(kind, id, { x: clampPercent(x), y: clampPercent(y) });
  }

  /* A new element paints on top of everything else; a removed one just
     drops out of the order. */
  function appendLayer(current, kind, id) {
    return { ...current, layerOrder: [...current.layerOrder, { kind, id }] };
  }

  function removeLayer(current, kind, id) {
    return {
      ...current,
      layerOrder: current.layerOrder.filter((entry) => !(entry.kind === kind && entry.id === id)),
    };
  }

  function layerKey(entry) {
    return `${entry.kind}:${entry.id ?? ''}`;
  }

  /*
   * Moves a layer through layerOrder, which runs back to front - so 'up'
   * and 'front' move later in the array. The layers panel lists it
   * reversed, front first, which is why its buttons read the other way.
   *
   *   'up'    one step toward the front      'front'  all the way to the front
   *   'down'  one step toward the back       'back'   all the way to the back
   */
  function moveLayer(kind, id, direction) {
    commitFrom((current) => {
      const order = current.layerOrder;
      const target = layerKey({ kind, id: kind === 'logo' || kind === 'candidates' ? null : id });
      const index = order.findIndex((entry) => layerKey(entry) === target);

      if (index < 0) return current;

      const entry = order[index];
      const rest = order.filter((_, i) => i !== index);

      if (direction === 'front') {
        if (index === order.length - 1) return current;
        return { ...current, layerOrder: [...rest, entry] };
      }

      if (direction === 'back') {
        if (index === 0) return current;
        return { ...current, layerOrder: [entry, ...rest] };
      }

      const swapWith = direction === 'up' ? index + 1 : index - 1;
      if (swapWith < 0 || swapWith >= order.length) return current;

      const nextOrder = [...order];
      [nextOrder[index], nextOrder[swapWith]] = [nextOrder[swapWith], nextOrder[index]];

      return { ...current, layerOrder: nextOrder };
    });
  }

  /*
   * Moves every layer in `selection` one step (or all the way) in the same
   * direction as moveLayer, as one block: calling moveLayer once per item
   * is wrong for 'up'/'down' - two adjacent selected items just swap past
   * each other and net nothing (see 'up' twice on an [X, A, B, Y] selection
   * of [A, B]: A passes B, then B passes back past A). Selected items are
   * processed front-most first for 'up' and back-most first for 'down', so
   * each one only ever swaps past a non-selected neighbour, never doubles
   * back across another item in the same selection.
   */
  function moveLayers(selection, direction) {
    commitFrom((current) => {
      const order = [...current.layerOrder];
      const keys = new Set(selection.map((item) => layerKey(item)));
      const isSelected = (entry) => keys.has(layerKey(entry));

      if (direction === 'front' || direction === 'back') {
        const picked = order.filter(isSelected);
        const rest = order.filter((entry) => !isSelected(entry));
        if (!picked.length) return current;
        return { ...current, layerOrder: direction === 'front' ? [...rest, ...picked] : [...picked, ...rest] };
      }

      const step = direction === 'up' ? 1 : -1;
      const entries = order.filter(isSelected);
      if (direction === 'up') entries.reverse(); // front-most first

      for (const entry of entries) {
        const index = order.indexOf(entry);
        const swapWith = index + step;
        if (swapWith < 0 || swapWith >= order.length || isSelected(order[swapWith])) continue;
        [order[index], order[swapWith]] = [order[swapWith], order[index]];
      }

      return { ...current, layerOrder: order };
    });
  }

  /*
   * Drops a dragged layer into the position a target layer currently
   * occupies in layerOrder - used by the layers panel's drag-and-drop, as
   * an alternative to stepping through moveLayer one swap at a time.
   */
  function reorderLayer(draggedKind, draggedId, targetKind, targetId) {
    commitFrom((current) => {
      const order = current.layerOrder;
      const draggedKey = layerKey({ kind: draggedKind, id: draggedId });
      const targetKey = layerKey({ kind: targetKind, id: targetId });

      const draggedIndex = order.findIndex((entry) => layerKey(entry) === draggedKey);
      const targetIndex = order.findIndex((entry) => layerKey(entry) === targetKey);

      if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) return current;

      const nextOrder = [...order];
      const [draggedEntry] = nextOrder.splice(draggedIndex, 1);
      const insertIndex = targetIndex > draggedIndex ? targetIndex - 1 : targetIndex;
      nextOrder.splice(insertIndex, 0, draggedEntry);

      return { ...current, layerOrder: nextOrder };
    });
  }

  function setLocked(kind, id, locked) {
    updateElement(kind, id, { locked });
  }

  /* Ties every element in `selections` ({kind, id} pairs) to one new group,
     so dragging any of them moves them all together; returns the group id. */
  function groupElements(selections) {
    if (selections.length < 2) return null;

    const groupId = crypto.randomUUID();

    commitFrom((current) => {
      let next = current;
      for (const selection of selections) {
        if (selection.kind === 'candidates') continue;
        next = patchElement(next, selection.kind, selection.id, { groupId });
      }
      return next;
    });

    return groupId;
  }

  function ungroup(groupId) {
    commitFrom((current) => {
      let next = current;
      for (const element of collectPositionedElements(next)) {
        if (element.groupId === groupId) {
          next = patchElement(next, element.kind, element.id, { groupId: null });
        }
      }
      return next;
    });
  }

  function toggleVisible(kind, id) {
    commitFrom((current) => {
      const element = findElement(current, kind, id);
      if (!element) return current;
      return patchElement(current, kind, id, { visible: !isVisible(element) });
    });
  }

  /* A new divider, dropped in the middle of the board. */
  function addDivider(orientation = 'vertical') {
    const id = crypto.randomUUID();

    commitFrom((current) => ({
      ...current,
      dividers: [
        ...current.dividers,
        { id, x: 50, y: 50, length: 70, thickness: 1, orientation, visible: true },
      ],
      layerOrder: [...current.layerOrder, { kind: 'divider', id }],
    }));

    return id;
  }

  /*
   * Copies an element and drops the copy slightly down and to the right of
   * the original, on top of the paint order. Only the kinds that can exist
   * more than once are copyable - the logo, the candidate board and the
   * announcement strip are each one of a kind; dividers, text, images,
   * videos, and shapes can all have any number of them.
   */
  function duplicateElement(kind, id) {
    const list = LIST_BY_KIND[kind];
    if (!list) return null;

    const source = findElement(latestLayoutRef.current, kind, id);
    if (!source) return null;

    const copy = {
      ...source,
      id: crypto.randomUUID(),
      x: clampPercent(source.x + 3),
      y: clampPercent(source.y + 3),
      locked: false,
      /* a copy is its own element, not a member of the original's group */
      groupId: undefined,
    };

    commitFrom((current) => ({
      ...current,
      [list]: [...current[list], copy],
      layerOrder: [...current.layerOrder, { kind, id: copy.id }],
    }));

    return copy.id;
  }

  /*
   * Takes an element off the board. The kinds that live in a list are
   * deleted outright; the one-of-a-kind ones are hidden instead, since
   * there would be no way to add them back - the layers panel still lists
   * them, so they can be turned on again.
   */
  function removeElement(kind, id) {
    const list = LIST_BY_KIND[kind];

    if (!list) {
      updateElement(kind, id, { visible: false });
      return 'hidden';
    }

    commitFrom((current) => ({
      ...current,
      [list]: current[list].filter((item) => item.id !== id),
      layerOrder: current.layerOrder.filter(
        (entry) => !(entry.kind === kind && entry.id === id)
      ),
    }));

    return 'removed';
  }

  /* Logo and photo size - a multiplier of their base width. */
  function setScale(kind, id, scale) {
    updateElement(kind, id, { scale });
  }

  /* A text element's size - its font size, as a share of the board's height. */
  function setFontSize(id, fontSize) {
    updateElement('text', id, { fontSize: clampTextSize(fontSize) });
  }

  function setTextContent(id, text) {
    updateElement('text', id, { text });
  }

  /* Merges `patch` into the typography settings of a text-bearing element. */
  function setTextStyle(kind, id, patch) {
    commitFrom((current) => {
      const element = findElement(current, kind, id);
      if (!element) return current;
      return patchElement(current, kind, id, { style: { ...element.style, ...patch } });
    });
  }

  /* Merges `patch` into an element's motion setting (type, direction, speed) -
     any addressable kind, since every one of them carries its own `animation`. */
  function setAnimation(kind, id, patch) {
    commitFrom((current) => {
      const element = findElement(current, kind, id);
      if (!element) return current;
      return patchElement(current, kind, id, {
        animation: normalizeAnimation({ ...element.animation, ...patch }),
      });
    });
  }

  /* Replaces the fill of a text element (through its style) or of a shape. */
  function setFill(kind, id, fill) {
    if (kind === 'shape') {
      updateElement('shape', id, { fill });
      return;
    }

    setTextStyle(kind, id, { fill });
  }

  /* Pans/zooms a shape's image or video fill (offsetX, offsetY, zoom)
     without touching its url/fit/opacity - see PhotoAdjuster.jsx /
     VideoAdjuster.jsx. */
  function adjustImageFill(id, patch) {
    commitFrom((current) => {
      const shape = findElement(current, 'shape', id);
      if (!shape || (shape.fill?.type !== 'image' && shape.fill?.type !== 'video')) return current;
      return patchElement(current, 'shape', id, {
        fill: normalizeFill({ ...shape.fill, ...patch }),
      });
    });
  }

  async function handleLogoUpload(file) {
    if (!file) return;

    const clearProgress = reportProgress('Uploading logo...');

    try {
      const url = await uploadImageToStorage(file);
      updateElement('logo', null, { url });
      reportSuccess('Logo updated.');
    } catch (error) {
      reportError(error);
    } finally {
      clearProgress();
    }
  }

  function resetLogo() {
    updateElement('logo', null, { url: null });
  }

  async function handleAddPhoto(file) {
    if (!file) return null;

    const clearProgress = reportProgress('Uploading photo...');

    try {
      const url = await uploadImageToStorage(file);
      const id = crypto.randomUUID();

      commitFrom((current) =>
        appendLayer(
          {
            ...current,
            images: [
              ...current.images,
              { id, url, x: 50, y: 50, scale: 1, visible: true, animation: { ...DEFAULT_ANIMATION } },
            ],
          },
          'image',
          id
        )
      );
      reportSuccess('Photo added to the board.');

      return id;
    } catch (error) {
      reportError(error);
      return null;
    } finally {
      clearProgress();
    }
  }

  function removePhoto(id) {
    commitFrom((current) =>
      removeLayer(
        { ...current, images: current.images.filter((image) => image.id !== id) },
        'image',
        id
      )
    );
  }

  /*
   * Re-uploads any legacy base64 photo still embedded in the layout to
   * Firebase Storage - see migrateLegacyPhotos above. Safe to call anytime;
   * a board with nothing legacy left is a no-op that changes nothing and
   * doesn't touch the undo history. Resolves to whether it actually found
   * (and migrated) anything.
   */
  async function cleanUpLegacyPhotos() {
    const migrated = await migrateLegacyPhotos(latestLayoutRef.current);
    if (!migrated) return false;

    commitFrom(() => migrated);
    return true;
  }

  async function handleAddVideo(file) {
    if (!file) return null;

    if (file.size > MAX_VIDEO_BYTES) {
      reportError(new Error('That video is too large - keep it under 200MB.'));
      return null;
    }

    const clearProgress = reportProgress('Uploading video... this can take a while on a slow connection.');

    try {
      const id = crypto.randomUUID();
      const storageRef = ref(storage, `${VIDEO_STORAGE_FOLDER}/${id}-${file.name}`);

      await uploadBytes(storageRef, file, STORAGE_CACHE_METADATA);
      const url = await getDownloadURL(storageRef);

      commitFrom((current) =>
        appendLayer(
          { ...current, videos: [...current.videos, { id, url, x: 50, y: 50, scale: 1, visible: true }] },
          'video',
          id
        )
      );
      reportSuccess('Video added to the board.');

      return id;
    } catch (error) {
      reportError(error);
      return null;
    } finally {
      clearProgress();
    }
  }

  function removeVideo(id) {
    commitFrom((current) =>
      removeLayer(
        { ...current, videos: current.videos.filter((video) => video.id !== id) },
        'video',
        id
      )
    );
  }

  function addText() {
    const id = crypto.randomUUID();

    commitFrom((current) =>
      appendLayer(
        {
          ...current,
          texts: [
            ...current.texts,
            {
              id,
              text: 'New text',
              x: 50,
              y: 50,
              fontSize: DEFAULT_TEXT_SIZES.extra,
              boxWidth: 92, // normalizeText's own default - set here too, so a
              // corner resize on a text that hasn't been saved yet (and so
              // hasn't been through that normalizer) has a real number to
              // scale rather than reading undefined.
              visible: true,
              bulletList: false,
              style: { ...DEFAULT_EXTRA_TEXT_STYLE },
              animation: { ...DEFAULT_ANIMATION },
            },
          ],
        },
        'text',
        id
      )
    );

    return id;
  }

  function removeText(id) {
    commitFrom((current) =>
      removeLayer({ ...current, texts: current.texts.filter((text) => text.id !== id) }, 'text', id)
    );
  }

  function addShape(kind) {
    const shape = createShape(kind);

    commitFrom((current) =>
      appendLayer({ ...current, shapes: [...current.shapes, shape] }, 'shape', shape.id)
    );

    return shape.id;
  }

  function removeShape(id) {
    commitFrom((current) =>
      removeLayer(
        { ...current, shapes: current.shapes.filter((shape) => shape.id !== id) },
        'shape',
        id
      )
    );
  }

  function setShapeStroke(id, patch) {
    commitFrom((current) => {
      const shape = findElement(current, 'shape', id);
      if (!shape) return current;
      return patchElement(current, 'shape', id, { stroke: { ...shape.stroke, ...patch } });
    });
  }

  /* Drops a photo into a frame - the frame's fill *is* the photo. */
  async function handleFramePhoto(id, file) {
    if (!file) return;

    const clearProgress = reportProgress('Uploading photo...');

    try {
      const url = await uploadImageToStorage(file);

      commitFrom((current) => {
        const shape = findElement(current, 'shape', id);
        if (!shape) return current;

        const fit = shape.fill?.type === 'image' ? shape.fill.fit : 'cover';
        return patchElement(current, 'shape', id, { fill: imageFill(url, fit) });
      });
      reportSuccess('Photo added to the frame.');
    } catch (error) {
      reportError(error);
    } finally {
      clearProgress();
    }
  }

  /* Drops a video into a frame - the frame's fill *is* the video, same as
     handleFramePhoto but through the video upload path (see handleAddVideo
     above) since a clip is too big to shrink into a data URL. */
  async function handleFrameVideo(id, file) {
    if (!file) return;

    if (file.size > MAX_VIDEO_BYTES) {
      reportError(new Error('That video is too large - keep it under 200MB.'));
      return;
    }

    const clearProgress = reportProgress('Uploading video... this can take a while on a slow connection.');

    try {
      const storageRef = ref(storage, `${VIDEO_STORAGE_FOLDER}/${crypto.randomUUID()}-${file.name}`);
      await uploadBytes(storageRef, file, STORAGE_CACHE_METADATA);
      const url = await getDownloadURL(storageRef);

      commitFrom((current) => {
        const shape = findElement(current, 'shape', id);
        if (!shape) return current;

        const fit = shape.fill?.type === 'image' || shape.fill?.type === 'video' ? shape.fill.fit : 'cover';
        return patchElement(current, 'shape', id, { fill: videoFill(url, fit) });
      });
      reportSuccess('Video added to the frame.');
    } catch (error) {
      reportError(error);
    } finally {
      clearProgress();
    }
  }

  /*
   * A frame's carousel photos - a separate list from its single `fill`
   * image, since a carousel with animation.type 'carousel' cycles through
   * these instead of showing one static photo. Adding a second photo is
   * what makes the Carousel animation option appear at all (see isCarousel).
   * Each photo carries its own pan/zoom (zoom/offsetX/offsetY), the same
   * fields an image fill has, defaulted to an untouched 1x/0/0 crop and
   * adjustable afterwards through adjustFramePhoto.
   */
  async function addFramePhotos(id, files) {
    const list = Array.from(files ?? []).filter(Boolean);
    if (!list.length) return;

    const clearProgress = reportProgress(
      list.length > 1 ? `Uploading ${list.length} photos...` : 'Uploading photo...'
    );

    try {
      const uploaded = await Promise.all(
        list.map(async (file) => ({
          url: await uploadImageToStorage(file),
          zoom: 1,
          offsetX: 0,
          offsetY: 0,
        }))
      );

      commitFrom((current) => {
        const shape = findElement(current, 'shape', id);
        if (!shape) return current;
        return patchElement(current, 'shape', id, { photos: [...(shape.photos ?? []), ...uploaded] });
      });
      reportSuccess(
        list.length > 1 ? `${list.length} photos added to the carousel.` : 'Photo added to the carousel.'
      );
    } catch (error) {
      reportError(error);
    } finally {
      clearProgress();
    }
  }

  function removeFramePhoto(id, index) {
    commitFrom((current) => {
      const shape = findElement(current, 'shape', id);
      if (!shape) return current;
      return patchElement(current, 'shape', id, {
        photos: (shape.photos ?? []).filter((_, photoIndex) => photoIndex !== index),
      });
    });
  }

  /* Pans/zooms one carousel photo in place, same shape as adjustImageFill
     but addressed by index within the frame's photo list. */
  function adjustFramePhoto(id, index, patch) {
    commitFrom((current) => {
      const shape = findElement(current, 'shape', id);
      if (!shape) return current;
      return patchElement(current, 'shape', id, {
        photos: (shape.photos ?? []).map((photo, photoIndex) =>
          photoIndex === index ? { ...photo, ...patch } : photo
        ),
      });
    });
  }

  function resetLayout() {
    commitFrom(() => ({
      version: DEFAULT_LAYOUT.version,
      revision: DEFAULT_LAYOUT.revision,
      logo: { ...DEFAULT_LAYOUT.logo },
      candidates: { ...DEFAULT_LAYOUT.candidates },
      announcements: { ...DEFAULT_LAYOUT.announcements },
      dividers: DEFAULT_LAYOUT.dividers.map((divider) => ({ ...divider })),
      texts: DEFAULT_LAYOUT.texts.map((text) => ({ ...text, style: { ...text.style } })),
      images: [],
      videos: [],
      shapes: [],
      layerOrder: DEFAULT_LAYOUT.layerOrder.map((entry) => ({ ...entry })),
    }));
    reportSuccess('Layout reset to the default.');
  }

  /** Replaces the whole draft, e.g. when a saved template is applied. */
  function replaceLayout(nextLayout) {
    commitFrom(() => nextLayout);
  }

  function nodeFor(kind, id) {
    const surface = boundsRef.current;
    if (!surface) return null;
    return surface.querySelector(
      id ? `[data-vb-kind="${kind}"][data-vb-id="${id}"]` : `[data-vb-kind="${kind}"]`
    );
  }

  /* An element's board-% bounds as drawn, or null when it isn't on the canvas.
     Layout sizes (offsetWidth) rather than getBoundingClientRect, so a
     pulsing or bouncing animation can't make the measurement wobble. */
  function measure(kind, id) {
    const surface = boundsRef.current;
    const node = nodeFor(kind, id);
    const element = findElement(latestLayoutRef.current, kind, id);
    if (!surface || !node || !element) return null;

    const sized = node.querySelector(':scope > .vb-divider-line') ?? node;
    const scale = SCALED_KINDS[kind] ? element.scale ?? 1 : 1;

    return boundsOf(
      {
        x: element.x,
        y: element.y,
        wPx: sized.offsetWidth * scale,
        hPx: sized.offsetHeight * scale,
        rotation: element.rotation ?? 0,
      },
      { W: surface.clientWidth, H: surface.clientHeight }
    );
  }

  function pick(element) {
    return { x: element.x, y: element.y };
  }

  function asItem(element) {
    return { kind: element.kind, id: LIST_BY_KIND[element.kind] ? element.id : null };
  }

  /* Each selected element widened to its whole group, so a group moves as
     one piece. Locked elements drop out. */
  function selectionUnits(selection) {
    const all = collectPositionedElements(latestLayoutRef.current);
    const seenGroups = new Set();
    const units = [];

    for (const item of selection) {
      const element = findElement(latestLayoutRef.current, item.kind, item.id);
      if (!element || element.locked) continue;

      if (element.groupId) {
        if (seenGroups.has(element.groupId)) continue;
        seenGroups.add(element.groupId);
        units.push(all.filter((e) => e.groupId === element.groupId && !e.locked).map(asItem));
      } else {
        units.push([{ kind: item.kind, id: item.id ?? null }]);
      }
    }

    return units;
  }

  function moveUnits(units, deltas) {
    commitFrom((current) => {
      let next = current;
      units.forEach((unit, index) => {
        const { dx, dy } = deltas[index];
        if (!dx && !dy) return;
        for (const member of unit) {
          const element = findElement(next, member.kind, member.id);
          next = patchElement(next, member.kind, member.id, {
            x: clampBoard(element.x + dx),
            y: clampBoard(element.y + dy),
          });
        }
      });
      return next;
    });
  }

  function measuredUnits(selection) {
    return selectionUnits(selection)
      .map((unit) => ({ unit, parts: unit.map((m) => measure(m.kind, m.id)).filter(Boolean) }))
      .filter(({ parts }) => parts.length)
      .map(({ unit, parts }) => ({ unit, bounds: unionBounds(parts) }));
  }

  function alignSelection(selection, edge) {
    const measured = measuredUnits(selection);
    if (!measured.length) return;
    const bounds = measured.map((m) => m.bounds);
    const frame = measured.length === 1 ? BOARD_FRAME : unionBounds(bounds);
    moveUnits(measured.map((m) => m.unit), alignDeltas(bounds, edge, frame));
  }

  function distributeSelection(selection, axis) {
    const measured = measuredUnits(selection);
    if (measured.length < 3) return;
    moveUnits(measured.map((m) => m.unit), distributeDeltas(measured.map((m) => m.bounds), axis));
  }

  function nudgeSelection(selection, dx, dy) {
    const units = selectionUnits(selection);
    moveUnits(units, units.map(() => ({ dx, dy })));
  }

  function removeMany(selection) {
    const counts = { removed: 0, hidden: 0, locked: 0 };

    commitFrom((current) => {
      let next = current;
      for (const { kind, id } of selection) {
        const element = findElement(next, kind, id);
        if (!element) continue;
        if (element.locked) {
          counts.locked += 1;
          continue;
        }
        const list = LIST_BY_KIND[kind];
        if (!list) {
          next = patchElement(next, kind, id, { visible: false });
          counts.hidden += 1;
          continue;
        }
        next = removeLayer({ ...next, [list]: next[list].filter((item) => item.id !== id) }, kind, id);
        counts.removed += 1;
      }
      return next;
    });

    return counts;
  }

  function patchSelection(selection, patch) {
    commitFrom((current) =>
      selection.reduce((next, { kind, id }) => patchElement(next, kind, id, patch), current)
    );
  }

  function hideMany(selection) {
    patchSelection(
      selection.filter(({ kind, id }) => !findElement(latestLayoutRef.current, kind, id)?.locked),
      { visible: false }
    );
  }

  function setLockedMany(selection, locked) {
    patchSelection(selection, { locked });
  }

  /* Detached copies for the clipboard - pasting works after the originals
     are gone. One-of-a-kind elements (logo, boxes) can't be copied. */
  function snapshotElements(selection) {
    return selection
      .filter(({ kind }) => LIST_BY_KIND[kind])
      .map(({ kind, id }) => ({ kind, element: findElement(latestLayoutRef.current, kind, id) }))
      .filter(({ element }) => element)
      .map(({ kind, element }) => ({ kind, element: structuredClone(element) }));
  }

  /* Pastes copies offset down-right. Copies that shared a group keep a new
     group of their own; a lone group member pastes ungrouped. */
  function pasteSnapshots(snapshots) {
    const pasted = [];
    const groupCounts = new Map();
    for (const { element } of snapshots) {
      if (element.groupId) groupCounts.set(element.groupId, (groupCounts.get(element.groupId) ?? 0) + 1);
    }
    const newGroups = new Map();

    commitFrom((current) => {
      let next = current;
      for (const { kind, element } of snapshots) {
        const list = LIST_BY_KIND[kind];
        const copy = {
          ...structuredClone(element),
          id: crypto.randomUUID(),
          x: clampPercent(element.x + 3),
          y: clampPercent(element.y + 3),
          locked: false,
        };
        delete copy.groupId;
        if (element.groupId && groupCounts.get(element.groupId) > 1) {
          if (!newGroups.has(element.groupId)) newGroups.set(element.groupId, crypto.randomUUID());
          copy.groupId = newGroups.get(element.groupId);
        }
        next = appendLayer({ ...next, [list]: [...next[list], copy] }, kind, copy.id);
        pasted.push({ kind, id: copy.id });
      }
      return next;
    });

    return pasted;
  }

  function duplicateMany(selection) {
    const snapshots = snapshotElements(selection);
    return snapshots.length ? pasteSnapshots(snapshots) : [];
  }

  function selectableElements() {
    return collectPositionedElements(latestLayoutRef.current)
      .filter((element) => isVisible(element) && !element.locked)
      .map(asItem);
  }

  return {
    undo,
    measure,
    alignSelection,
    distributeSelection,
    nudgeSelection,
    removeMany,
    hideMany,
    setLockedMany,
    snapshotElements,
    pasteSnapshots,
    duplicateMany,
    selectableElements,
    redo,
    canUndo: historyRef.current.undo.length > 0,
    canRedo: historyRef.current.redo.length > 0,
    guides,
    beginDrag,
    beginHandleResize,
    beginRotate,
    rotating,
    duplicateElement,
    removeElement,
    addDivider,
    beginDividerResize,
    updateDivider: (id, patch) => updateElement('divider', id, patch),
    setPosition,
    toggleVisible,
    setScale,
    setFontSize,
    setTextContent,
    setTextStyle,
    setFill,
    adjustImageFill,
    setAnimation,
    handleLogoUpload,
    resetLogo,
    handleAddPhoto,
    removePhoto,
    cleanUpLegacyPhotos,
    handleAddVideo,
    removeVideo,
    addText,
    removeText,
    addShape,
    removeShape,
    updateShape: (id, patch) => updateElement('shape', id, patch),
    /* the candidate board and the announcement strip are patched directly */
    updateElement,
    setShapeStroke,
    handleFramePhoto,
    handleFrameVideo,
    addFramePhotos,
    removeFramePhoto,
    adjustFramePhoto,
    resetLayout,
    replaceLayout,
    moveLayer,
    moveLayers,
    reorderLayer,
    setLocked,
    groupElements,
    ungroup,
  };
}
