import { useRef } from 'react';

import { DEFAULT_LAYOUT, isVisible, saveDraftLayout } from './boardLayout';
import { DEFAULT_EXTRA_TEXT_STYLE, DEFAULT_TEXT_SIZES } from './textStyle';
import { createShape } from './shapeStyle';
import { imageFill } from './fill';

/* Photos and the logo are capped on the long edge so several fit in the quota. */
const MAX_IMAGE_EDGE = 800;

/* Which list each addressable kind lives in; anything else is a singleton. */
const LIST_BY_KIND = { image: 'images', text: 'texts', shape: 'shapes' };

function clampPercent(value) {
  return Math.min(97, Math.max(3, Number.isFinite(value) ? value : 50));
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
  { onError, onSuccess, persist = saveDraftLayout } = {}
) {
  const latestLayoutRef = useRef(layout);
  const saveScheduledRef = useRef(false);

  function reportError(error) {
    if (onError) onError(error);
    else console.warn(error);
  }

  function reportSuccess(message) {
    onSuccess?.(message);
  }

  /*
   * Every drag move updates state immediately for a smooth handle, but only
   * queues one write per animation frame - writing on every pointermove
   * event would be a lot of redundant JSON.stringify calls once a photo is
   * on the canvas.
   */
  function commitFrom(updater, { immediate = true } = {}) {
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

  function dragWith(onMove) {
    const bounds = boundsRef.current;
    if (!bounds) return;

    function move(moveEvent) {
      onMove(moveEvent, bounds.getBoundingClientRect());
    }

    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function beginDrag(kind, id) {
    return (event) => {
      event.preventDefault();

      dragWith((moveEvent, rect) => {
        const { x, y } = pointToPercent(moveEvent, rect);
        commitFrom((current) => patchElement(current, kind, id, { x, y }), {
          immediate: false,
        });
      });
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
      if (!shape) return;

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

      commitFrom((current) => ({
        ...current,
        images: [...current.images, { id, url: dataUrl, x: 50, y: 50, scale: 1, visible: true }],
      }));
      reportSuccess('Photo added to the board.');

      return id;
    } catch (error) {
      reportError(error);
      return null;
    }
  }

  function removePhoto(id) {
    commitFrom((current) => ({
      ...current,
      images: current.images.filter((image) => image.id !== id),
    }));
  }

  function addText() {
    const id = crypto.randomUUID();

    commitFrom((current) => ({
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
    }));

    return id;
  }

  function removeText(id) {
    commitFrom((current) => ({
      ...current,
      texts: current.texts.filter((text) => text.id !== id),
    }));
  }

  function addShape(kind) {
    const shape = createShape(kind);

    commitFrom((current) => ({ ...current, shapes: [...current.shapes, shape] }));

    return shape.id;
  }

  function removeShape(id) {
    commitFrom((current) => ({
      ...current,
      shapes: current.shapes.filter((shape) => shape.id !== id),
    }));
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
    }));
    reportSuccess('Layout reset to the default.');
  }

  return {
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
  };
}
