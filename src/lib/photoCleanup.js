/*
 * Touch-ups for a background-removed candidate photo, on ImageData-shaped
 * images ({ width, height, data: RGBA Uint8ClampedArray }) so they run in
 * the browser and under node alike. Nothing here mutates its inputs except
 * stampStroke, which paints onto the image it's given.
 */

/** One alpha byte per pixel, read out of an RGBA image. */
function readAlpha(image) {
  const alpha = new Uint8ClampedArray(image.width * image.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = image.data[i * 4 + 3];
  return alpha;
}

function writeAlpha(image, alpha) {
  for (let i = 0; i < alpha.length; i++) image.data[i * 4 + 3] = alpha[i];
}

/*
 * Minimum over a (2r+1)-wide window along one axis. The window is clipped
 * to the image: past the edge is unknown, not background - a portrait's
 * shoulders run off the bottom of the frame, and must not be trimmed there.
 * A sliding-window deque keeps it O(1) per pixel, so a wide trim on a
 * full-size photo stays quick.
 */
function minPass(src, width, height, r, horizontal) {
  const out = new Uint8ClampedArray(src.length);
  const lines = horizontal ? height : width;
  const length = horizontal ? width : height;
  // pixel k of a line sits at start + k * step - plain arithmetic, no per-pixel call
  const step = horizontal ? 1 : width;
  const lineStep = horizontal ? width : 1;
  const deque = new Int32Array(length); // offsets into src
  const dequeK = new Int32Array(length); // their positions along the line

  for (let line = 0; line < lines; line++) {
    const start = line * lineStep;
    let head = 0;
    let tail = 0;
    let next = 0; // the next position to push into the window
    for (let k = 0; k < length; k++) {
      const last = k + r < length ? k + r : length - 1;
      for (; next <= last; next++) {
        const at = start + next * step;
        const v = src[at];
        while (tail > head && src[deque[tail - 1]] >= v) tail--;
        deque[tail] = at;
        dequeK[tail++] = next;
      }
      while (dequeK[head] < k - r) head++;
      out[start + k * step] = src[deque[head]];
    }
  }
  return out;
}

/**
 * Trims `px` pixels off the cut-out's edge - the pale outline the remover
 * leaves around a person - then softens the new edge by 1px so it isn't
 * jagged. Only transparency changes.
 */
export function trimEdges(alpha, width, height, px) {
  if (!(px > 0)) return alpha.slice();

  const eroded = minPass(minPass(alpha, width, height, px, true), width, height, px, false);
  const out = eroded.slice();

  for (let y = 0; y < height; y++) {
    const inner = y > 0 && y < height - 1;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!eroded[i]) continue;

      // fast path: a pixel away from the frame whose 3x3 is all solid isn't on the edge
      if (inner && x > 0 && x < width - 1) {
        const up = i - width;
        const down = i + width;
        if (
          eroded[up - 1] && eroded[up] && eroded[up + 1] &&
          eroded[i - 1] && eroded[i + 1] &&
          eroded[down - 1] && eroded[down] && eroded[down + 1]
        ) continue;
      }

      let sum = 0;
      let count = 0;
      let empty = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const sx = x + dx;
          const sy = y + dy;
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue; // past the frame: not an edge
          const v = eroded[sy * width + sx];
          if (!v) empty = true;
          sum += v;
          count += 1;
        }
      }
      // feather only along the new edge; the inside stays solid
      if (empty) out[i] = Math.min(eroded[i], Math.round(sum / count));
    }
  }
  return out;
}

/**
 * Keeps the largest connected part of the cut-out, plus any part at least
 * `minShare` of its size (a second person), and clears the stray bits.
 */
export function removeSpecks(alpha, width, height, minShare = 0.05) {
  const labels = new Int32Array(alpha.length);
  const sizes = [0];
  const stack = new Int32Array(alpha.length);

  for (let start = 0; start < alpha.length; start++) {
    if (!alpha[start] || labels[start]) continue;

    const label = sizes.length;
    let top = 0;
    let size = 0;
    stack[top++] = start;
    labels[start] = label;

    while (top) {
      const i = stack[--top];
      size += 1;
      const x = i % width;
      const neighbours = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width];
      for (const n of neighbours) {
        if (n < 0 || n >= alpha.length || !alpha[n] || labels[n]) continue;
        labels[n] = label;
        stack[top++] = n;
      }
    }
    sizes.push(size);
  }

  // a loop, not Math.max(...sizes): a noisy cut-out can have more regions than a call has arguments
  let largest = 0;
  for (const size of sizes) if (size > largest) largest = size;
  const out = alpha.slice();
  for (let i = 0; i < out.length; i++) {
    if (labels[i] && sizes[labels[i]] < largest * minShare) out[i] = 0;
  }
  return out;
}

/**
 * Paints one brush stroke onto `target`: Erase clears to transparent,
 * Restore paints the original photo's pixels back at full opacity. The
 * stroke is in fractions of the image - points as [x, y], size as a share
 * of the long side - so it lands in the same place at any resolution.
 */
export function stampStroke(target, original, stroke) {
  const { width, height, data } = target;
  const radius = (stroke.size * Math.max(width, height)) / 2;
  if (!(radius > 0) || !stroke.points.length) return;
  if (stroke.mode === 'restore' && !original) return;

  const points = stroke.points.map(([fx, fy]) => [fx * width, fy * height]);
  const stamps = [points[0]];
  for (let p = 1; p < points.length; p++) {
    const [ax, ay] = points[p - 1];
    const [bx, by] = points[p];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (radius / 2)));
    for (let s = 1; s <= steps; s++) stamps.push([ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps]);
  }

  for (const [cx, cy] of stamps) {
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(width - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(height - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > radius) continue;
        const i = (y * width + x) * 4;
        if (stroke.mode === 'erase') {
          data[i + 3] = 0;
        } else {
          data[i] = original.data[i];
          data[i + 1] = original.data[i + 1];
          data[i + 2] = original.data[i + 2];
          data[i + 3] = 255;
        }
      }
    }
  }
}

/**
 * Brightness and contrast, each -50..50 (0 = unchanged), on the colour only -
 * transparency is left alone.
 */
export function adjustColor(image, brightness = 0, contrast = 0) {
  const data = image.data.slice();
  if (brightness || contrast) {
    const add = brightness * 2.55;
    const c = contrast * 2.55;
    const factor = (259 * (c + 255)) / (255 * (259 - c));
    for (let i = 0; i < data.length; i += 4) {
      for (let k = 0; k < 3; k++) data[i + k] = Math.round(factor * (data[i + k] + add - 128) + 128);
    }
  }
  return { width: image.width, height: image.height, data };
}

/*
 * Where a point on the displayed photo (fractions of it) came from on the
 * source photo, for a clockwise quarter-turn `rotate` and a left-right flip
 * applied after it. rotateFlip draws with this, and the brush maps the
 * pointer back with it, so the two can't disagree.
 */
export function toSourcePoint([u, v], rotate = 0, flipX = false) {
  const x = flipX ? 1 - u : u;
  switch (rotate) {
    case 90:
      return [v, 1 - x];
    case 180:
      return [1 - x, 1 - v];
    case 270:
      return [1 - v, x];
    default:
      return [x, v];
  }
}

/** The photo turned clockwise by `rotate` (0/90/180/270), then flipped left-right. */
export function rotateFlip(image, rotate = 0, flipX = false) {
  if (!rotate && !flipX) return { width: image.width, height: image.height, data: image.data.slice() };

  const sideways = rotate === 90 || rotate === 270;
  const width = sideways ? image.height : image.width;
  const height = sideways ? image.width : image.height;
  const data = new Uint8ClampedArray(width * height * 4);

  // whole pixels as 32-bit words; the same mapping as toSourcePoint, in integers
  const srcData = image.data.byteOffset % 4 ? image.data.slice() : image.data;
  const src = new Uint32Array(srcData.buffer, srcData.byteOffset, image.width * image.height);
  const out = new Uint32Array(data.buffer);
  const iw = image.width;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = flipX ? width - 1 - x : x;
      let sx;
      let sy;
      if (rotate === 90) {
        sx = y;
        sy = width - 1 - u;
      } else if (rotate === 180) {
        sx = width - 1 - u;
        sy = height - 1 - y;
      } else if (rotate === 270) {
        sx = height - 1 - y;
        sy = u;
      } else {
        sx = u;
        sy = y;
      }
      out[y * width + x] = src[sy * iw + sx];
    }
  }
  return { width, height, data };
}

/**
 * The finished photo. The cut-out (or, with Keep original, the photo as
 * uploaded) gets its clean-up replayed in a fixed order - specks, brush
 * strokes, then the edge trim, so moving the Clean edges slider never loses
 * brush work - then brightness/contrast, then rotate/flip. `trimPx` is the
 * trim already scaled to this image's size.
 */
export function applyEdits(cutout, original, edits, trimPx) {
  const cleaned = edits.keepOriginal
    ? { width: original.width, height: original.height, data: original.data.slice() }
    : cleanUp(edits.specks ? despeckle(cutout) : cutout, original, edits.strokes, trimPx);
  return finishLook(cleaned, edits);
}

/*
 * applyEdits in stages, so the editor can keep the slow ones: Remove specks
 * (a flood fill) only reruns when it's toggled, the brush and trim only when
 * they change, and a colour or rotate slider only redoes finishLook.
 */

/** The cut-out with its stray bits removed (a copy). */
export function despeckle(image) {
  const out = { width: image.width, height: image.height, data: image.data.slice() };
  writeAlpha(out, removeSpecks(readAlpha(out), out.width, out.height));
  return out;
}

/** Brush strokes, then the edge trim, on a copy of `base`. */
export function cleanUp(base, original, strokes, trimPx) {
  const out = { width: base.width, height: base.height, data: base.data.slice() };
  for (const stroke of strokes) stampStroke(out, original, stroke);
  if (trimPx > 0) writeAlpha(out, trimEdges(readAlpha(out), out.width, out.height, trimPx));
  return out;
}

/** Brightness/contrast, then rotate/flip. */
export function finishLook(image, edits) {
  let out = image;
  if (edits.brightness || edits.contrast) out = adjustColor(out, edits.brightness, edits.contrast);
  if (edits.rotate || edits.flipX) out = rotateFlip(out, edits.rotate, edits.flipX);
  return out === image ? { width: image.width, height: image.height, data: image.data.slice() } : out;
}
