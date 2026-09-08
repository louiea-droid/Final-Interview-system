import { useReducer, useRef, useState } from 'react';

import { DEFAULT_LAYOUT, isVisible, saveDraftLayout } from './boardLayout';
import { DEFAULT_EXTRA_TEXT_STYLE, DEFAULT_TEXT_SIZES } from './textStyle';
import { createShape } from './shapeStyle';
import { imageFill } from './fill';

/* Photos and the logo are capped on the long edge so several fit in the quota. */
const MAX_IMAGE_EDGE = 800;

/* Which list each addressable kind lives in; anything else is a singleton. */
const LIST_BY_KIND = { image: 'images', text: 'texts', shape: 'shapes' };

/* Undo history: how many steps are kept, and how close together in time
   edits have to be to collapse into a single step - a drag or a slider
   fires dozens of updates a second, and each of those should undo as one
   move rather than one step per pixel. */
const HISTORY_LIMIT = 50;
const HISTORY_BURST_MS = 500;

/* Snapping: how close (in board percent) a drag has to land to a guide
   before it catches, and the spacing of the grid lines it can snap to. */
const SNAP_THRESHOLD = 1.2;
const SNAP_GRID_STEP = 5;

function clampPercent(value) {
  return Math.min(97, Math.max(3, Number.isFinite(value) ? value : 50));
}

/* Every positioned element on the board, tagged with its kind - the set a
   drag can snap against. */
function collectPositionedElements(layout) {
  return [
    { kind: 'logo', id: null, ...layout.logo },
    ...layout.texts.map((item) => ({ kind: 'text', ...item })),
    ...layout.images.map((item) => ({ kind: 'image', ...item })),
    ...layout.shapes.map((item) => ({ kind: 'shape', ...item })),
  ];
}

/* Guide values a drag on `axis` can snap to: the center, both edges, the
   grid lines, and every other element's own position - not the element
   being dragged. */
function collectSnapTargets(layout, kind, id, axis) {
  const targets = new Set([3, 50, 97]);

  for (let line = 0; line <= 100; line += SNAP_GRID_STEP) targets.add(line);

  for (const element of collectPositionedElements(layout)) {
    const isSelf = element.kind === kind && (kind === 'logo' || element.id === id);
    if (isSelf) continue;
    targets.add(axis === 'x' ? element.x : element.y);
  }

  return targets;
}

/* The closest guide within the threshold, or `value` unchanged. */
function snapAxis(value, targets, threshold) {
  let closest = value;
  let closestDistance = threshold;

  for (const target of targets) {
    const distance = Math.abs(value - target);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = target;
    }
  }

  return closest;
}

function downscaleToDataUrl(file) {
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
        resolve(canvas.toDataURL('image/png'));
      };

      image.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
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
  { onError, onSuccess, persist = saveDraftLayout, snapEnabled = false } = {}
) {
  const latestLayoutRef = useRef(layout);
  const saveScheduledRef = useRef(false);
  const historyRef = useRef({ undo: [], redo: [] });
  const historyBurstRef = useRef(null);
  const [, bumpHistory] = useReducer((count) => count + 1, 0);

  /* Which axis a drag currently reads as centered on - drives the canvas's
     center guide lines. */
  const [centerGuide, setCenterGuide] = useState({ x: false, y: false });

  function reportError(error) {
    if (onError) onError(error);
    else console.warn(error);
  }

  function reportSuccess(message) {
    onSuccess?.(message);
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
   */
  function commitFrom(updater, { immediate = true } = {}) {
    recordHistory();

    setLayout((current) => {
      const next = updater(current);
      latestLayoutRef.current = next;

      if (immediate) {
        persist(next);
      } else if (!saveScheduledRef.current) {
        saveScheduledRef.current = true;
        requestAnimationFrame(() => {
          saveScheduledRef.current = false;
          persist(latestLayoutRef.current);
        });
      }

      return next;
    });
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

  function beginDrag(kind, id) {
    return (event) => {
      const element = findElement(latestLayoutRef.current, kind, id);
      if (element?.locked) return;

      event.preventDefault();

      const groupId = element?.groupId;
      const groupStart = groupId
        ? collectPositionedElements(latestLayoutRef.current).filter((item) => item.groupId === groupId)
        : null;
      let dragOrigin = null;

      dragWith(
        (moveEvent, rect) => {
          let { x, y } = pointToPercent(moveEvent, rect);

          if (groupStart) {
            /* A grouped element moves by the same delta as every other
               member, rather than snapping its own center to the pointer. */
            dragOrigin ??= { x, y };
            const dx = x - dragOrigin.x;
            const dy = y - dragOrigin.y;

            setCenterGuide({ x: false, y: false });
            commitFrom(
              (current) => {
                let next = current;
                for (const member of groupStart) {
                  next = patchElement(next, member.kind, member.id, {
                    x: clampPercent(member.x + dx),
                    y: clampPercent(member.y + dy),
                  });
                }
                return next;
              },
              { immediate: false }
            );
            return;
          }

          if (snapEnabled) {
            const current = latestLayoutRef.current;
            x = clampPercent(snapAxis(x, collectSnapTargets(current, kind, id, 'x'), SNAP_THRESHOLD));
            y = clampPercent(snapAxis(y, collectSnapTargets(current, kind, id, 'y'), SNAP_THRESHOLD));
          }

          setCenterGuide({ x: Math.abs(x - 50) < 0.5, y: Math.abs(y - 50) < 0.5 });
          commitFrom((current) => patchElement(current, kind, id, { x, y }), {
            immediate: false,
          });
        },
        () => setCenterGuide({ x: false, y: false })
      );
    };
  }

  /*
   * Resizing a shape holds its centre still, so the corner handle stays under
   * the cursor: half the box is the distance from the centre to the pointer.
   */
  function beginResize(id) {
    return (event) => {
      event.preventDefault();
      event.stopPropagation();

      const shape = findElement(latestLayoutRef.current, 'shape', id);
      if (!shape || shape.locked) return;

      dragWith((moveEvent, rect) => {
        const centerX = rect.left + (shape.x / 100) * rect.width;
        const centerY = rect.top + (shape.y / 100) * rect.height;

        const width = (Math.abs(moveEvent.clientX - centerX) * 2 * 100) / rect.width;
        const height = (Math.abs(moveEvent.clientY - centerY) * 2 * 100) / rect.height;

        commitFrom(
          (current) =>
            patchElement(current, 'shape', id, {
              width: Math.min(200, Math.max(0.4, width)),
              height: Math.min(200, Math.max(0.4, height)),
            }),
          { immediate: false }
        );
      });
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

  function setLocked(kind, id, locked) {
    if (kind === 'candidates') return;
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

  /* Logo and photo size - a multiplier of their base width. */
  function setScale(kind, id, scale) {
    updateElement(kind, id, { scale });
  }

  /* A text element's size - its font size, as a share of the board's height. */
  function setFontSize(id, fontSize) {
    updateElement('text', id, { fontSize });
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

  /* Replaces the fill of a text element (through its style) or of a shape. */
  function setFill(kind, id, fill) {
    if (kind === 'shape') {
      updateElement('shape', id, { fill });
      return;
    }

    setTextStyle(kind, id, { fill });
  }

  async function handleLogoUpload(file) {
    if (!file) return;

    try {
      const dataUrl = await downscaleToDataUrl(file);
      updateElement('logo', null, { url: dataUrl });
      reportSuccess('Logo updated.');
    } catch (error) {
      reportError(error);
    }
  }

  function resetLogo() {
    updateElement('logo', null, { url: null });
  }

  async function handleAddPhoto(file) {
    if (!file) return null;

    try {
      const dataUrl = await downscaleToDataUrl(file);
      const id = crypto.randomUUID();

      commitFrom((current) =>
        appendLayer(
          { ...current, images: [...current.images, { id, url: dataUrl, x: 50, y: 50, scale: 1, visible: true }] },
          'image',
          id
        )
      );
      reportSuccess('Photo added to the board.');

      return id;
    } catch (error) {
      reportError(error);
      return null;
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
              visible: true,
              style: { ...DEFAULT_EXTRA_TEXT_STYLE },
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

    try {
      const dataUrl = await downscaleToDataUrl(file);

      commitFrom((current) => {
        const shape = findElement(current, 'shape', id);
        if (!shape) return current;

        const fit = shape.fill?.type === 'image' ? shape.fill.fit : 'cover';
        return patchElement(current, 'shape', id, { fill: imageFill(dataUrl, fit) });
      });
      reportSuccess('Photo added to the frame.');
    } catch (error) {
      reportError(error);
    }
  }

  function resetLayout() {
    commitFrom(() => ({
      logo: { ...DEFAULT_LAYOUT.logo },
      texts: DEFAULT_LAYOUT.texts.map((text) => ({ ...text, style: { ...text.style } })),
      images: [],
      shapes: [],
      layerOrder: DEFAULT_LAYOUT.layerOrder.map((entry) => ({ ...entry })),
    }));
    reportSuccess('Layout reset to the default.');
  }

  /** Replaces the whole draft, e.g. when a saved template is applied. */
  function replaceLayout(nextLayout) {
    commitFrom(() => nextLayout);
  }

  return {
    undo,
    redo,
    canUndo: historyRef.current.undo.length > 0,
    canRedo: historyRef.current.redo.length > 0,
    centerGuide,
    beginDrag,
    beginResize,
    setPosition,
    toggleVisible,
    setScale,
    setFontSize,
    setTextContent,
    setTextStyle,
    setFill,
    handleLogoUpload,
    resetLogo,
    handleAddPhoto,
    removePhoto,
    addText,
    removeText,
    addShape,
    removeShape,
    updateShape: (id, patch) => updateElement('shape', id, patch),
    setShapeStroke,
    handleFramePhoto,
    resetLayout,
    replaceLayout,
    moveLayer,
    setLocked,
    groupElements,
    ungroup,
  };
}
