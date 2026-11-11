import { useEffect, useMemo, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import { FlipHorizontal, Minus, Plus, RotateCcw, RotateCw, Undo2, X } from 'lucide-react';

import { applyEdits, cleanUp, despeckle, finishLook, rotateFlip, toSourcePoint } from '../lib/photoCleanup';
import { EMPTY_EDITS, SAVED_LONG_SIDE, hasTransparency, isUntouchedOriginal, outputFormat } from '../lib/photoReview';
import { photoQueue, removalWarm } from '../lib/backgroundRemover';

/* The editing preview's long side - big enough to judge an edge, small enough to brush smoothly. */
const PREVIEW_LONG = 1200;
const BACKGROUNDS = { dark: '#0b0102', white: '#ffffff', checker: null };
const TABS = [
  { id: 'cleanup', label: 'Clean up' },
  { id: 'crop', label: 'Crop' },
  { id: 'adjust', label: 'Adjust' },
];
const MIN_SCALE = 0.25;
const MAX_SCALE = 8;
const FIT = { scale: 1, x: 0, y: 0 };

/* Decodes a Blob into ImageData, scaled so its long side is at most `maxLong` (0 = full size). */
async function decode(blob, maxLong = 0, size = null) {
  const bitmap = await createImageBitmap(blob);
  const scale = size ? 1 : maxLong ? Math.min(1, maxLong / Math.max(bitmap.width, bitmap.height)) : 1;
  const width = size?.width ?? Math.max(1, Math.round(bitmap.width * scale));
  const height = size?.height ?? Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const image = context.getImageData(0, 0, width, height);
  return { width, height, data: image.data };
}

/* A stable id per Blob, so an effect can depend on which Blobs are in use. */
const blobIds = new WeakMap();
let nextBlobId = 1;
function blobId(blob) {
  if (!blob) return 0;
  if (!blobIds.has(blob)) blobIds.set(blob, nextBlobId++);
  return blobIds.get(blob);
}

function toCanvas(image) {
  const canvas = new OffscreenCanvas(image.width, image.height);
  canvas.getContext('2d', { willReadFrequently: true }).putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  return canvas;
}

async function toFile(image, name, { type, ext, quality }) {
  const blob = await toCanvas(image).convertToBlob({ type, quality });
  return new File([blob], `${name.replace(/\.[^.]+$/, '')}.${ext}`, { type });
}

function draw(canvas, image) {
  if (!canvas || !image) return;
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d', { willReadFrequently: true }).putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
}

function statusLabel(key, status) {
  if (status === 'reviewed') return 'Edited';
  if (status === 'ready') return 'Ready to check';
  if (status === 'failed') return 'Failed';
  if (status === 'processing') return photoQueue.pending().includes(key) ? 'Waiting' : 'Removing…';
  return 'Waiting';
}

/* A photo is settled once there's something final to save for it. */
const isSettled = (item) =>
  item.entry.photo_edits?.keepOriginal || item.entry.photo_status === 'ready' || item.entry.photo_status === 'reviewed';

/* Any work done on a photo - so reopening the editor doesn't ask for it to be checked again. */
function hasWork({ photo_edits: e = EMPTY_EDITS, photo_crop: crop }) {
  return Boolean(
    e.keepOriginal || e.specks || e.trim > 0 || e.strokes.length || e.rotate || e.flipX || e.brightness || e.contrast || crop
  );
}

/*
 * Edit photos: each photo's background is removed off the main thread (by
 * the page), and here the admin finishes it in three tabs - Clean up (edge
 * trim, specks, an Erase/Restore brush with zoom), Crop (the board's square
 * crop) and Adjust (rotate, flip, brightness, contrast) - before Done writes
 * the finished photos back into the form at full resolution.
 */
export default function PhotoReviewDialog({
  items,
  startKey,
  startTab = 'cleanup',
  onEditsChange,
  onCropChange,
  onRetry,
  onDone,
  onClose,
}) {
  const [selectedKey, setSelectedKey] = useState(startKey ?? items[0]?.key ?? null);
  const [tab, setTab] = useState(startTab);
  const [checked, setChecked] = useState(
    () => new Set(items.filter(({ entry }) => entry.photo_status === 'reviewed' || hasWork(entry)).map((item) => item.key))
  );
  const [background, setBackground] = useState('dark');
  const [brush, setBrush] = useState({ mode: 'erase', size: 18 });
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState(null);
  const [view, setView] = useState(FIT);

  const selected = items.find((item) => item.key === selectedKey) ?? items[0];
  const edits = { ...EMPTY_EDITS, ...(selected?.entry.photo_edits ?? {}) };

  /* ---- thumbnails: one URL per Blob, kept while that Blob is in use, so a
     status change doesn't remake (and flicker) every thumbnail ---- */
  const blobUrls = useRef(new Map()); // Blob -> object URL
  const [urls, setUrls] = useState({});
  const blobs = items.flatMap((item) => [item.entry.photo_original, item.entry.photo_cutout]).filter(Boolean);
  const photosKey = items.map((item) => `${item.key}:${blobId(item.entry.photo_original)}:${blobId(item.entry.photo_cutout)}`).join('|');
  useEffect(() => {
    const cache = blobUrls.current;
    const urlOf = (blob) => {
      if (!cache.has(blob)) cache.set(blob, URL.createObjectURL(blob));
      return cache.get(blob);
    };
    setUrls(
      Object.fromEntries(
        items.map((item) => [
          item.key,
          { original: urlOf(item.entry.photo_original), cutout: item.entry.photo_cutout ? urlOf(item.entry.photo_cutout) : null },
        ])
      )
    );
    for (const [blob, url] of cache) {
      if (blobs.includes(blob)) continue;
      URL.revokeObjectURL(url);
      cache.delete(blob);
    }
  }, [photosKey]);
  // StrictMode-safe: the map is emptied on unmount and refilled by the effect above on remount
  useEffect(
    () => () => {
      for (const url of blobUrls.current.values()) URL.revokeObjectURL(url);
      blobUrls.current.clear();
    },
    []
  );

  /* ---- the selected photo, decoded at preview size ----
     Without a cut-out (Keep original on a failed or unfinished removal) the
     original stands in for it, so Crop and Adjust still work. */
  const [preview, setPreview] = useState(null); // { key, original, cutout }
  const sourceBlob = selected?.entry.photo_cutout ?? (edits.keepOriginal ? selected?.entry.photo_original : null);
  useEffect(() => {
    if (!sourceBlob) {
      setPreview(null);
      return undefined;
    }
    let stale = false;
    (async () => {
      const cutout = await decode(sourceBlob, PREVIEW_LONG);
      const original = await decode(selected.entry.photo_original, 0, cutout);
      if (!stale) setPreview({ key: selected.key, original, cutout });
    })();
    return () => {
      stale = true;
    };
  }, [selected?.key, sourceBlob]);
  const ready = preview && preview.key === selected?.key ? preview : null;

  useEffect(() => setView(FIT), [selected?.key, edits.rotate, edits.flipX]);

  // viewing a finished photo counts as checking it
  useEffect(() => {
    if (!selected) return;
    if (isSettled(selected) && !checked.has(selected.key)) setChecked((current) => new Set(current).add(selected.key));
  }, [selected?.key, selected?.entry.photo_status, edits.keepOriginal]);

  /* ---- the finished preview, drawn for every tab ---- */
  const resultRef = useRef(null);
  const originalRef = useRef(null);
  const draftRef = useRef(null); // the stroke being painted, not yet an edit
  const frameRef = useRef(0);

  /* The preview is built in cached stages, so a slider only redoes its own
     stage: Remove specks (a flood fill) reruns only when it's toggled, the
     brush and trim only when they change, colour and rotate on their own. */
  const base = useMemo(() => {
    if (!ready) return null;
    if (edits.keepOriginal) return ready.original;
    return edits.specks ? despeckle(ready.cutout) : ready.cutout;
  }, [ready, edits.keepOriginal, edits.specks]);
  // finished strokes, kept apart from the trim: a trim tick or a live brush frame starts from here
  const stroked = useMemo(
    () => (base && !edits.keepOriginal && edits.strokes.length ? cleanUp(base, ready.original, edits.strokes, 0) : base),
    [base, edits.keepOriginal, edits.strokes]
  );
  const cleaned = useMemo(
    () => (stroked && !edits.keepOriginal && edits.trim > 0 ? cleanUp(stroked, ready.original, [], edits.trim) : stroked),
    [stroked, edits.keepOriginal, edits.trim]
  );
  const finishedImage = useMemo(
    () => cleaned && finishLook(cleaned, edits),
    [cleaned, edits.rotate, edits.flipX, edits.brightness, edits.contrast]
  );
  const originalShown = useMemo(
    () => (ready && tab === 'cleanup' ? rotateFlip(ready.original, edits.rotate, edits.flipX) : null),
    [ready, tab, edits.rotate, edits.flipX]
  );
  useEffect(() => draw(resultRef.current, finishedImage), [finishedImage, tab]);
  useEffect(() => draw(originalRef.current, originalShown), [originalShown]);

  // the Crop tab needs the finished photo as a URL
  const [finishedUrl, setFinishedUrl] = useState(null);
  useEffect(() => {
    if (tab !== 'crop' || !finishedImage) return undefined;
    let made = null;
    let stale = false;
    toCanvas(finishedImage)
      .convertToBlob({ type: 'image/png' })
      .then((blob) => {
        if (stale) return;
        made = URL.createObjectURL(blob);
        setFinishedUrl(made);
      });
    return () => {
      stale = true;
      if (made) URL.revokeObjectURL(made);
      setFinishedUrl(null);
    };
  }, [tab, finishedImage]);

  function change(patch) {
    onEditsChange(selected.key, { ...edits, ...patch });
  }

  /* ---- zoom and pan (Clean up) ---- */
  const stageRef = useRef(null);
  const panRef = useRef(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  useEffect(() => {
    const typing = (target) =>
      target.closest?.('textarea, select, [contenteditable="true"], input:not([type="range"]):not([type="checkbox"])');
    const down = (event) => {
      if (event.code !== 'Space' || typing(event.target)) return;
      event.preventDefault(); // or a focused button would be pressed again
      setSpaceHeld(true);
    };
    const up = (event) => {
      if (event.code !== 'Space') return;
      if (!typing(event.target)) event.preventDefault();
      setSpaceHeld(false);
    };
    const blur = () => setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  function zoomAround(factor, clientX, clientY, frame) {
    setView((current) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor));
      const rect = frame.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;
      const ratio = scale / current.scale;
      return { scale, x: mx - (mx - current.x) * ratio, y: my - (my - current.y) * ratio };
    });
  }

  function zoomStep(factor) {
    const frame = stageRef.current?.querySelector('.photo-review-frame');
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    zoomAround(factor, rect.left + rect.width / 2, rect.top + rect.height / 2, frame);
  }

  // wheel listeners must be non-passive to stop the page scrolling
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || tab !== 'cleanup') return undefined;
    const onWheel = (event) => {
      const frame = event.target.closest?.('.photo-review-frame');
      if (!frame) return;
      event.preventDefault();
      zoomAround(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX, event.clientY, frame);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [tab, ready]);

  function startPan(event) {
    panRef.current = { x: event.clientX, y: event.clientY, view };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onFramePointerDown(event) {
    if (spaceHeld || event.button === 1 || event.button === 2) {
      event.preventDefault();
      startPan(event);
    }
  }

  function onFramePointerMove(event) {
    const pan = panRef.current;
    if (!pan) return;
    setView({ ...pan.view, x: pan.view.x + event.clientX - pan.x, y: pan.view.y + event.clientY - pan.y });
  }

  function onFramePointerUp() {
    panRef.current = null;
  }

  /* ---- the brush, and the circle that shows its size ---- */
  const [ring, setRing] = useState(null); // { x, y, d } in Result-frame px
  const pointerRef = useRef(null); // the last pointer position over the Result
  function pointFrom(event) {
    const rect = resultRef.current.getBoundingClientRect();
    const shown = [
      Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    ];
    // the preview is turned and flipped; strokes live on the cut-out itself
    return toSourcePoint(shown, edits.rotate, edits.flipX);
  }

  function moveRing(event) {
    pointerRef.current = { clientX: event.clientX, clientY: event.clientY };
    const canvas = resultRef.current;
    const frame = canvas?.closest('.photo-review-frame');
    if (!canvas || !frame || !canvas.width) return;
    const frameRect = frame.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    setRing({
      x: event.clientX - frameRect.left,
      y: event.clientY - frameRect.top,
      d: (brush.size * canvasRect.width) / canvas.width,
    });
  }

  // a zoom or a new brush size resizes the ring where the pointer already is
  useEffect(() => {
    if (pointerRef.current && ring) moveRing(pointerRef.current);
  }, [view, brush.size]);

  function redrawSoon() {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      if (!stroked) return;
      // from the cached finished strokes: only the stroke being painted, and the trim, are redone per frame
      const draft = draftRef.current ? [draftRef.current] : [];
      draw(resultRef.current, finishLook(cleanUp(stroked, ready.original, draft, edits.trim), edits));
    });
  }

  function onCanvasPointerDown(event) {
    if (spaceHeld || event.button !== 0) return; // pan instead (handled by the frame)
    event.stopPropagation();
    if (!ready || edits.keepOriginal || finishing) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const long = Math.max(ready.cutout.width, ready.cutout.height);
    draftRef.current = { mode: brush.mode, size: brush.size / long, points: [pointFrom(event)] };
    redrawSoon();
  }

  function onCanvasPointerMove(event) {
    moveRing(event);
    if (!draftRef.current) return;
    draftRef.current.points.push(pointFrom(event));
    redrawSoon();
  }

  function onCanvasPointerUp() {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    const stroke = draftRef.current;
    draftRef.current = null;
    if (stroke) change({ strokes: [...edits.strokes, stroke] });
  }

  function undo() {
    if (edits.strokes.length) change({ strokes: edits.strokes.slice(0, -1) });
    else if (edits.specks) change({ specks: false });
    else if (edits.trim) change({ trim: 0 });
  }

  /* ---- crop ---- */
  const [cropPos, setCropPos] = useState({ x: 0, y: 0 });
  const [cropZoom, setCropZoom] = useState(1);
  const cropTouched = useRef(false);
  useEffect(() => {
    setCropPos({ x: 0, y: 0 });
    setCropZoom(1);
    cropTouched.current = false;
  }, [selected?.key, finishedUrl]);

  function onCropComplete(area) {
    // the cropper reports its starting area too - only a real move is an edit
    if (cropTouched.current) onCropChange(selected.key, area);
  }

  /* ---- progress and Done ---- */
  const total = items.length;
  const settledCount = items.filter((item) => item.entry.photo_status !== 'pending' && item.entry.photo_status !== 'processing').length;
  const working = items.some((item) => item.entry.photo_status === 'processing');
  const toCheck = items.filter((item) => !checked.has(item.key)).length;
  const canFinish = !finishing && total > 0 && items.every((item) => checked.has(item.key) && isSettled(item));

  async function finish() {
    setFinishing(true);
    setFinishError(null);
    try {
      const results = [];
      for (const item of items) {
        // a photo finished before and not changed since keeps its file and crop
        if (item.entry.photo_status === 'reviewed') continue;

        const { photo_original: original, photo_cutout: cutout } = item.entry;
        const itemEdits = { ...EMPTY_EDITS, ...(item.entry.photo_edits ?? {}) };
        const made = { key: item.key, original, edits: item.entry.photo_edits, crop: item.entry.photo_crop };
        if (isUntouchedOriginal(itemEdits)) {
          results.push({ ...made, file: original }); // untouched, as uploaded
          continue;
        }
        const base = itemEdits.keepOriginal || !cutout ? original : cutout;
        const fullBase = await decode(base, SAVED_LONG_SIDE);
        const fullOriginal = base === original ? fullBase : await decode(original, 0, fullBase);
        const long = Math.max(fullBase.width, fullBase.height);
        const trimPx = Math.round((itemEdits.trim * long) / Math.min(PREVIEW_LONG, long));
        const image = applyEdits(fullBase, fullOriginal, itemEdits, trimPx);
        const transparent = itemEdits.keepOriginal && hasTransparency(fullBase);
        results.push({ ...made, file: await toFile(image, original.name, outputFormat(itemEdits, transparent)) });
      }
      onDone(results);
    } catch (error) {
      setFinishError(`Couldn't finish the photos (${error?.message ?? error}). Try Done again.`);
    } finally {
      setFinishing(false);
    }
  }

  /* ---- keyboard: Esc closes, Tab stays inside the dialog ---- */
  const dialogRef = useRef(null);
  useEffect(() => dialogRef.current?.focus(), []);

  function onDialogKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (!finishing) onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...dialogRef.current.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])'),
    ].filter((element) => !element.disabled && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const selectedIndex = items.findIndex((item) => item.key === selected?.key);
  const failed = selected?.entry.photo_status === 'failed' && !edits.keepOriginal;
  const backgroundStyle = BACKGROUNDS[background] ? { background: BACKGROUNDS[background] } : undefined;
  const transform = { transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` };
  const brushing = tab === 'cleanup' && ready && !edits.keepOriginal;

  return (
    <div className="confirmation-overlay photo-review-overlay" role="presentation">
      <div
        className="photo-review"
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-review-title"
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
      >
        <div className="photo-review-top">
          <h2 id="photo-review-title">Edit photos</h2>
          <div className="photo-review-progress" aria-hidden="true">
            <i style={{ width: `${total ? (settledCount / total) * 100 : 0}%` }} />
          </div>
          <span className="photo-review-progress-text" role="status">
            {working && !removalWarm.value && settledCount === 0
              ? 'Preparing background removal…'
              : working
                ? `Photo ${Math.min(settledCount + 1, total)} of ${total}`
                : `${total} of ${total} processed`}
          </span>
          <button
            type="button"
            className="secondary-button photo-review-close"
            onClick={onClose}
            disabled={finishing}
            aria-label="Close review"
          >
            <X size={14} />
          </button>
        </div>

        <div className="photo-review-body">
          <ul className="photo-review-list" aria-label="Photos">
            {items.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  className={item.key === selected?.key ? 'is-selected' : ''}
                  onClick={() => setSelectedKey(item.key)}
                >
                  <img src={urls[item.key]?.cutout ?? urls[item.key]?.original} alt="" />
                  <span>
                    <b>{item.label}</b>
                    <small data-status={item.entry.photo_edits?.keepOriginal ? 'kept' : item.entry.photo_status}>
                      {item.entry.photo_edits?.keepOriginal ? 'Keep original' : statusLabel(item.key, item.entry.photo_status)}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="photo-review-stage" ref={stageRef}>
            <div className="photo-review-stage-head">
              <div className="photo-review-tabs" role="tablist" aria-label="Editing tools">
                {TABS.map(({ id, label }) => (
                  <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                    {label}
                  </button>
                ))}
              </div>
              {tab !== 'crop' && (
                <span className="photo-review-bg" role="group" aria-label="Result background">
                  {Object.keys(BACKGROUNDS).map((name) => (
                    <button key={name} type="button" aria-pressed={background === name} onClick={() => setBackground(name)}>
                      {name[0].toUpperCase() + name.slice(1)}
                    </button>
                  ))}
                </span>
              )}
            </div>

            {failed ? (
              <div className="photo-review-frame photo-review-failed-frame">
                <div className="photo-review-failed">
                  <p>Background removal failed.</p>
                  <div>
                    <button type="button" className="secondary-button" onClick={() => onRetry(selected.key)}>
                      Try again
                    </button>
                    <button type="button" className="secondary-button" onClick={() => change({ keepOriginal: true })}>
                      Keep original
                    </button>
                  </div>
                </div>
              </div>
            ) : !ready ? (
              <div className="photo-review-frame">
                <p className="photo-review-wait">{statusLabel(selected?.key, selected?.entry.photo_status)}</p>
              </div>
            ) : tab === 'crop' ? (
              <div className={`photo-review-crop ${background === 'checker' ? 'is-checker' : ''} ${finishing ? 'is-busy' : ''}`}>
                {finishedUrl && (
                  <Cropper
                    key={`${selected.key}:${finishedUrl}`}
                    image={finishedUrl}
                    crop={cropPos}
                    zoom={cropZoom}
                    aspect={1}
                    cropShape="rect"
                    showGrid
                    initialCroppedAreaPercentages={selected.entry.photo_crop ?? undefined}
                    onCropChange={setCropPos}
                    onZoomChange={setCropZoom}
                    onInteractionStart={() => {
                      cropTouched.current = true;
                    }}
                    onCropComplete={onCropComplete}
                  />
                )}
              </div>
            ) : tab === 'adjust' ? (
              <div className={`photo-review-frame ${background === 'checker' ? 'is-checker' : ''}`} style={backgroundStyle}>
                <canvas ref={resultRef} className="photo-review-canvas is-static" aria-label="Finished photo" />
              </div>
            ) : (
              <div className="photo-review-pair">
                <figure>
                  <figcaption>Original</figcaption>
                  <div
                    className="photo-review-frame"
                    onPointerDown={onFramePointerDown}
                    onPointerMove={onFramePointerMove}
                    onPointerUp={onFramePointerUp}
                    onPointerCancel={onFramePointerUp}
                    onLostPointerCapture={onFramePointerUp}
                    onContextMenu={(event) => event.preventDefault()}
                  >
                    <div className="photo-review-zoom" style={transform}>
                      <canvas ref={originalRef} className="photo-review-canvas is-static" aria-label="Original photo" />
                    </div>
                  </div>
                </figure>
                <figure>
                  <figcaption>{brushing ? 'Result - paint to erase or restore' : 'Result'}</figcaption>
                  <div
                    className={`photo-review-frame ${background === 'checker' ? 'is-checker' : ''} ${spaceHeld ? 'is-panning' : ''}`}
                    style={backgroundStyle}
                    onPointerDown={onFramePointerDown}
                    onPointerMove={onFramePointerMove}
                    onPointerUp={onFramePointerUp}
                    onPointerCancel={onFramePointerUp}
                    onLostPointerCapture={onFramePointerUp}
                    onPointerLeave={() => setRing(null)}
                    onContextMenu={(event) => event.preventDefault()}
                  >
                    <div className="photo-review-zoom" style={transform}>
                      <canvas
                        ref={resultRef}
                        className={`photo-review-canvas ${brushing && !spaceHeld ? 'is-brush' : 'is-static'}`}
                        onPointerDown={onCanvasPointerDown}
                        onPointerMove={onCanvasPointerMove}
                        onPointerUp={onCanvasPointerUp}
                        onPointerCancel={onCanvasPointerUp}
                        onPointerLeave={() => {
                          pointerRef.current = null;
                          setRing(null);
                        }}
                        aria-label="Result - paint to erase or restore"
                      />
                    </div>
                    {brushing && ring && !spaceHeld && (
                      <span
                        className="photo-review-ring"
                        aria-hidden="true"
                        style={{ left: ring.x, top: ring.y, width: ring.d, height: ring.d }}
                      />
                    )}
                  </div>
                </figure>
              </div>
            )}

            {tab === 'cleanup' && ready && !failed && (
              <div className="photo-review-zoombar">
                <button type="button" className="secondary-button" onClick={() => zoomStep(1 / 1.25)} aria-label="Zoom out">
                  <Minus size={12} />
                </button>
                <span className="photo-review-zoom-value">{Math.round(view.scale * 100)}%</span>
                <button type="button" className="secondary-button" onClick={() => zoomStep(1.25)} aria-label="Zoom in">
                  <Plus size={12} />
                </button>
                <button type="button" className="secondary-button" onClick={() => setView(FIT)}>
                  Fit
                </button>
                <span className="photo-review-note">Scroll to zoom · hold Space, or drag with the right button, to move</span>
              </div>
            )}
            {tab === 'cleanup' && <p className="photo-review-note">Clean edges trims the pale outline.</p>}
          </div>

          <div className="photo-review-tools">
            {tab === 'cleanup' && (
              <fieldset disabled={finishing || !ready || edits.keepOriginal}>
                <label className="form-label" htmlFor="photo-review-trim">
                  Clean edges <span>{edits.trim ? `${edits.trim} px` : 'Off'}</span>
                </label>
                <input
                  id="photo-review-trim"
                  type="range"
                  min="0"
                  max="10"
                  step="1"
                  value={edits.trim}
                  onChange={(event) => change({ trim: Number(event.target.value) })}
                />

                <p className="form-label">Remove specks</p>
                <button type="button" className="secondary-button" onClick={() => change({ specks: true })} disabled={edits.specks}>
                  {edits.specks ? 'Stray bits removed' : 'Remove stray bits'}
                </button>

                <p className="form-label">Brush</p>
                <div className="photo-review-segment" role="group" aria-label="Brush mode">
                  {['erase', 'restore'].map((mode) => (
                    <button key={mode} type="button" aria-pressed={brush.mode === mode} onClick={() => setBrush((b) => ({ ...b, mode }))}>
                      {mode === 'erase' ? 'Erase' : 'Restore'}
                    </button>
                  ))}
                </div>
                <label className="form-label" htmlFor="photo-review-brush">
                  Size <span>{brush.size} px</span>
                </label>
                <input
                  id="photo-review-brush"
                  type="range"
                  min="4"
                  max="60"
                  value={brush.size}
                  onChange={(event) => setBrush((b) => ({ ...b, size: Number(event.target.value) }))}
                />

                <div className="photo-review-row">
                  <button type="button" className="secondary-button" onClick={undo}>
                    <Undo2 size={12} /> Undo
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => change({ specks: false, strokes: [], trim: 0 })}
                  >
                    <RotateCcw size={12} /> Reset
                  </button>
                </div>
              </fieldset>
            )}

            {tab === 'crop' && (
              <fieldset disabled={finishing || !ready}>
                <p className="form-label">Crop</p>
                <p className="photo-review-help">Square, like the board's cards. Drag the photo to place it.</p>
                <label className="form-label" htmlFor="photo-review-crop-zoom">
                  Zoom <span>{cropZoom.toFixed(1)}×</span>
                </label>
                <input
                  id="photo-review-crop-zoom"
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  value={cropZoom}
                  onChange={(event) => {
                    cropTouched.current = true;
                    setCropZoom(Number(event.target.value));
                  }}
                />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    onCropChange(selected.key, null);
                    setCropPos({ x: 0, y: 0 });
                    setCropZoom(1);
                    cropTouched.current = false;
                  }}
                  disabled={!selected?.entry.photo_crop}
                >
                  Reset crop
                </button>
              </fieldset>
            )}

            {tab === 'adjust' && (
              <fieldset disabled={finishing || !ready}>
                <p className="form-label">Rotate</p>
                <div className="photo-review-row">
                  <button type="button" className="secondary-button" onClick={() => change({ rotate: (edits.rotate + 270) % 360 })}>
                    <RotateCcw size={12} /> 90°
                  </button>
                  <button type="button" className="secondary-button" onClick={() => change({ rotate: (edits.rotate + 90) % 360 })}>
                    <RotateCw size={12} /> 90°
                  </button>
                </div>
                <p className="form-label">Flip</p>
                <button
                  type="button"
                  className="secondary-button"
                  aria-pressed={edits.flipX}
                  onClick={() => change({ flipX: !edits.flipX })}
                >
                  <FlipHorizontal size={12} /> Left–right
                </button>
                {[
                  ['brightness', 'Brightness'],
                  ['contrast', 'Contrast'],
                ].map(([field, label]) => (
                  <div key={field}>
                    <label className="form-label" htmlFor={`photo-review-${field}`}>
                      {label} <span>{edits[field] > 0 ? `+${edits[field]}` : edits[field]}</span>
                    </label>
                    <input
                      id={`photo-review-${field}`}
                      type="range"
                      min="-50"
                      max="50"
                      value={edits[field]}
                      onChange={(event) => change({ [field]: Number(event.target.value) })}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => change({ rotate: 0, flipX: false, brightness: 0, contrast: 0 })}
                >
                  Reset adjustments
                </button>
              </fieldset>
            )}

            <label className="photo-review-keep">
              <input
                type="checkbox"
                checked={edits.keepOriginal}
                disabled={finishing || !selected}
                onChange={(event) => change({ keepOriginal: event.target.checked })}
              />
              <span>Keep original (no background removal)</span>
            </label>
          </div>
        </div>

        <div className="photo-review-footer">
          <span className={finishError ? 'is-error' : ''} role={finishError ? 'alert' : undefined}>
            {finishError ?? (toCheck ? `${toCheck} of ${total} photos still to check` : 'All photos checked')}
          </span>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setSelectedKey(items[(selectedIndex + 1) % total].key)}
            disabled={total < 2}
          >
            Next photo
          </button>
          <button type="button" className="confirm-delete-button" onClick={finish} disabled={!canFinish}>
            {finishing ? 'Finishing…' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
