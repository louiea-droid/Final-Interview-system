// Run with: node src/lib/photoCleanup.test.js
import assert from 'node:assert/strict';

import {
  adjustColor,
  applyEdits,
  cleanUp,
  despeckle,
  finishLook,
  removeSpecks,
  rotateFlip,
  stampStroke,
  toSourcePoint,
  trimEdges,
} from './photoCleanup.js';

/* An RGBA image: `fill(x, y)` returns [r, g, b, a] for each pixel. */
function img(width, height, fill) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(fill(x, y), (y * width + x) * 4);
  }
  return { width, height, data };
}

function alphaOf(image) {
  const out = new Uint8ClampedArray(image.width * image.height);
  for (let i = 0; i < out.length; i++) out[i] = image.data[i * 4 + 3];
  return out;
}

const at = (alpha, width, x, y) => alpha[y * width + x];

// ---- trimEdges: a 5x5 square at (1,1) in a 7x7 image
{
  const w = 7;
  const square = new Uint8ClampedArray(w * w);
  for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) square[y * w + x] = 255;
  const copy = square.slice();

  const trimmed = trimEdges(square, w, w, 1);
  assert.equal(at(trimmed, w, 3, 3), 255, 'centre stays solid');
  assert.ok(at(trimmed, w, 2, 2) < 255 && at(trimmed, w, 2, 2) > 0, 'new edge is feathered');
  assert.equal(at(trimmed, w, 1, 1), 0, 'the old outer ring is gone');
  assert.equal(at(trimmed, w, 0, 0), 0, 'outside stays empty');
  assert.deepEqual(trimEdges(square, w, w, 0), square, 'px 0 changes nothing');
  assert.deepEqual(square, copy, 'input not mutated');
}

// ---- trimEdges leaves a person who runs off the photo's edge alone there
// (shoulders cut by the bottom of a portrait must not get a transparent strip)
{
  const w = 9;
  const h = 9;
  const body = new Uint8ClampedArray(w * h);
  for (let y = 3; y < h; y++) for (let x = 1; x < 8; x++) body[y * w + x] = 255; // touches the bottom edge
  const trimmed = trimEdges(body, w, h, 2);
  assert.equal(at(trimmed, w, 4, h - 1), 255, 'bottom row, where the body leaves the frame, stays solid');
  assert.equal(at(trimmed, w, 4, h - 2), 255, 'and the row above it');
  assert.equal(at(trimmed, w, 4, 3), 0, 'the top edge, inside the photo, is still trimmed');
}

// ---- removeSpecks: a 10x10 block plus two single-pixel specks
{
  const w = 20;
  const alpha = new Uint8ClampedArray(w * w);
  for (let y = 2; y < 12; y++) for (let x = 2; x < 12; x++) alpha[y * w + x] = 255;
  alpha[18 * w + 18] = 200;
  alpha[0 * w + 19] = 90;
  const cleaned = removeSpecks(alpha, w, w);
  assert.equal(at(cleaned, w, 5, 5), 255, 'the person stays');
  assert.equal(at(cleaned, w, 18, 18), 0, 'speck removed');
  assert.equal(at(cleaned, w, 19, 0), 0, 'speck removed');

  // a second 6x6 region (36 >= 5% of 100) is a second person, not a speck
  for (let y = 13; y < 19; y++) for (let x = 13; x < 19; x++) alpha[y * w + x] = 255;
  assert.equal(at(removeSpecks(alpha, w, w), w, 15, 15), 255, 'big second region kept');
}

// ---- removeSpecks copes with a very noisy cut-out (hundreds of thousands of regions)
{
  const w = 1000;
  const h = 300;
  const noise = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) noise[y * w + x] = (x + y) % 2 ? 255 : 0;
  assert.doesNotThrow(() => removeSpecks(noise, w, h), 'no RangeError from one argument per region');
}

// ---- stampStroke
{
  const opaque = img(10, 10, () => [200, 200, 200, 255]);
  stampStroke(opaque, null, { mode: 'erase', size: 0.2, points: [[0.5, 0.5]] });
  const a = alphaOf(opaque);
  assert.equal(at(a, 10, 5, 5), 0, 'erase clears the centre');
  assert.equal(at(a, 10, 0, 0), 255, 'corners untouched');

  const cut = img(10, 10, () => [0, 0, 0, 0]);
  const original = img(10, 10, () => [10, 20, 30, 255]);
  stampStroke(cut, original, { mode: 'restore', size: 0.2, points: [[0.5, 0.5]] });
  assert.deepEqual([...cut.data.slice((5 * 10 + 5) * 4, (5 * 10 + 5) * 4 + 4)], [10, 20, 30, 255], 'restore paints the original back');
}

// ---- applyEdits
{
  const original = img(8, 8, () => [1, 2, 3, 255]);
  const cutout = img(8, 8, (x, y) => [9, 9, 9, x > 1 && x < 6 && y > 1 && y < 6 ? 255 : 0]);
  const before = cutout.data.slice();

  const kept = applyEdits(cutout, original, { keepOriginal: true, specks: false, strokes: [], trim: 0 }, 0);
  assert.deepEqual(kept.data, original.data, 'keep original returns the original');

  const none = applyEdits(cutout, original, { keepOriginal: false, specks: false, strokes: [], trim: 0 }, 0);
  assert.deepEqual(none.data, cutout.data, 'no edits = the cutout');

  const trimmed = applyEdits(cutout, original, { keepOriginal: false, specks: true, strokes: [], trim: 1 }, 1);
  const byHand = trimEdges(removeSpecks(alphaOf(cutout), 8, 8), 8, 8, 1);
  assert.deepEqual(alphaOf(trimmed), byHand, 'specks then trim, as by hand');
  assert.deepEqual(cutout.data, before, 'cutout not mutated');
}

// ---- the same edits at two sizes give the same picture, scaled (preview vs full-size save)
{
  const erased = (size) => {
    const square = img(size, size, () => [50, 50, 50, 255]);
    const out = applyEdits(square, square, { keepOriginal: false, specks: false, strokes: [{ mode: 'erase', size: 0.3, points: [[0.5, 0.5]] }], trim: 0 }, 0);
    const a = alphaOf(out);
    return { centre: at(a, size, size / 2, size / 2), count: a.filter((v) => v === 0).length };
  };
  const small = erased(20);
  const big = erased(40);
  assert.equal(small.centre, 0);
  assert.equal(big.centre, 0);
  const ratio = big.count / small.count;
  assert.ok(ratio > 4 * 0.85 && ratio < 4 * 1.15, `erased area scales ~4x (got ${ratio.toFixed(2)})`);
}

// ---- adjustColor
{
  const grey = img(1, 1, () => [100, 100, 100, 77]);
  assert.deepEqual(adjustColor(grey, 0, 0).data, grey.data, '0/0 changes nothing');
  assert.deepEqual([...adjustColor(grey, 50, 0).data], [228, 228, 228, 77], 'brightness +50 adds 127.5; alpha kept');
  const two = img(2, 1, (x) => (x ? [200, 200, 200, 255] : [50, 50, 50, 255]));
  const punchy = adjustColor(two, 0, 50);
  assert.ok(punchy.data[4] > 200 && punchy.data[0] < 50, 'contrast pushes light up and dark down');
  assert.equal(punchy.data[3], 255);
}

// ---- rotateFlip: a 3x2 image whose pixels are numbered 0..5 in the red channel
{
  const numbered = img(3, 2, (x, y) => [y * 3 + x, 0, 0, 255]);
  const red = (image) => [...image.data].filter((_, i) => i % 4 === 0);

  const r90 = rotateFlip(numbered, 90, false);
  assert.equal(r90.width, 2);
  assert.equal(r90.height, 3);
  assert.deepEqual(red(r90), [3, 0, 4, 1, 5, 2], 'clockwise: the bottom-left goes top-left');
  assert.deepEqual(red(rotateFlip(numbered, 180, false)), [5, 4, 3, 2, 1, 0]);
  assert.deepEqual(red(rotateFlip(numbered, 0, true)), [2, 1, 0, 5, 4, 3], 'flip mirrors left-right');

  let turned = numbered;
  for (let i = 0; i < 4; i++) turned = rotateFlip(turned, 90, false);
  assert.deepEqual(turned.data, numbered.data, 'four quarter turns are the identity');
}

// ---- toSourcePoint undoes rotateFlip: every displayed pixel maps back to its own source pixel
{
  const w = 4;
  const h = 3;
  const numbered = img(w, h, (x, y) => [y * w + x, 0, 0, 255]);
  for (const rotate of [0, 90, 180, 270]) {
    for (const flipX of [false, true]) {
      const shown = rotateFlip(numbered, rotate, flipX);
      for (let y = 0; y < shown.height; y++) {
        for (let x = 0; x < shown.width; x++) {
          const [fx, fy] = toSourcePoint([(x + 0.5) / shown.width, (y + 0.5) / shown.height], rotate, flipX);
          const source = Math.floor(fy * h) * w + Math.floor(fx * w);
          assert.equal(source, shown.data[(y * shown.width + x) * 4], `rotate ${rotate} flip ${flipX} at ${x},${y}`);
        }
      }
    }
  }
}

// ---- applyEdits with the new fields
{
  const original = img(3, 2, (x, y) => [y * 3 + x, 0, 0, 255]);
  const cutout = img(3, 2, () => [9, 9, 9, 0]);
  const turned = applyEdits(cutout, original, { keepOriginal: true, specks: false, strokes: [], trim: 0, rotate: 90 }, 0);
  assert.equal(turned.width, 2, 'keep original still rotates');
  assert.equal(turned.data[0], 3);
  const old = applyEdits(cutout, original, { keepOriginal: false, specks: false, strokes: [], trim: 0 }, 0);
  assert.deepEqual(old.data, cutout.data, 'edits without the new fields still work');
}

// ---- end to end: a stroke painted on a rotated, flipped preview lands under the pointer in the saved photo
{
  const original = img(10, 6, () => [120, 120, 120, 255]);
  for (const rotate of [0, 90, 180, 270]) {
    for (const flipX of [false, true]) {
      const pointer = [0.2, 0.7]; // where the admin clicked on the displayed preview
      const stroke = { mode: 'erase', size: 0.15, points: [toSourcePoint(pointer, rotate, flipX)] };
      const saved = applyEdits(original, original, { ...{ keepOriginal: false, specks: false, trim: 0 }, strokes: [stroke], rotate, flipX }, 0);
      const x = Math.floor(pointer[0] * saved.width);
      const y = Math.floor(pointer[1] * saved.height);
      assert.equal(saved.data[(y * saved.width + x) * 4 + 3], 0, `rotate ${rotate} flip ${flipX}: erased under the pointer`);
    }
  }
}

// ---- the pipeline in stages, so the editor can cache the slow parts
{
  const original = img(12, 12, () => [100, 100, 100, 255]);
  const cutout = img(12, 12, (x, y) => [100, 100, 100, (x > 2 && x < 9 && y > 2 && y < 9) || (x === 0 && y === 0) ? 255 : 0]);
  const edits = { keepOriginal: false, specks: true, strokes: [{ mode: 'erase', size: 0.2, points: [[0.5, 0.5]] }], trim: 1, rotate: 90, flipX: true, brightness: 10, contrast: -5 };
  const staged = finishLook(cleanUp(despeckle(cutout), original, edits.strokes, 1), edits);
  assert.deepEqual(staged.data, applyEdits(cutout, original, edits, 1).data, 'stages = applyEdits');
  assert.equal(despeckle(cutout).data[3], 0, 'despeckle clears the lone corner pixel');
  assert.equal(cutout.data[3], 255, 'and leaves its input alone');
}

// ---- the fast paths match the plain definitions, on noisy images of odd sizes
{
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const [w, h] of [[1, 1], [7, 5], [13, 29]]) {
    const noisy = img(w, h, () => [rand() * 256, rand() * 256, rand() * 256, rand() < 0.3 ? 0 : rand() * 256]);

    // rotateFlip samples exactly where toSourcePoint says
    for (const rotate of [0, 90, 180, 270]) {
      for (const flipX of [false, true]) {
        const out = rotateFlip(noisy, rotate, flipX);
        for (let y = 0; y < out.height; y++) {
          for (let x = 0; x < out.width; x++) {
            const [fx, fy] = toSourcePoint([(x + 0.5) / out.width, (y + 0.5) / out.height], rotate, flipX);
            const from = (Math.floor(fy * h) * w + Math.floor(fx * w)) * 4;
            const to = (y * out.width + x) * 4;
            assert.deepEqual([...out.data.subarray(to, to + 4)], [...noisy.data.subarray(from, from + 4)], `rotate ${rotate} flip ${flipX}`);
          }
        }
      }
    }

    // trimEdges' erosion is the minimum over the clipped square window
    const alpha = alphaOf(noisy);
    for (const px of [1, 3]) {
      const trimmed = trimEdges(alpha, w, h, px);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let min = 255;
          for (let sy = Math.max(0, y - px); sy <= Math.min(h - 1, y + px); sy++)
            for (let sx = Math.max(0, x - px); sx <= Math.min(w - 1, x + px); sx++) min = Math.min(min, alpha[sy * w + sx]);
          assert.ok(trimmed[y * w + x] <= min, 'never more solid than the eroded value');
          if (!min) assert.equal(trimmed[y * w + x], 0, 'eroded away stays clear');
        }
      }
    }
  }
}

// ---- the editor's split (finished strokes cached, then the live stroke and trim) equals one pass
{
  const original = img(12, 12, () => [9, 9, 9, 255]);
  const cutout = img(12, 12, (x, y) => [200, 200, 200, x > 1 && x < 10 && y > 1 && y < 10 ? 255 : 0]);
  const first = { mode: 'erase', size: 0.2, points: [[0.3, 0.3], [0.6, 0.3]] };
  const live = { mode: 'restore', size: 0.3, points: [[0.1, 0.8]] };
  const stroked = cleanUp(cutout, original, [first], 0);
  assert.deepEqual(cleanUp(stroked, original, [live], 2), cleanUp(cutout, original, [first, live], 2));
  assert.deepEqual(cleanUp(stroked, original, [], 2), cleanUp(cutout, original, [first], 2));
}

console.log('photoCleanup: all checks passed');
