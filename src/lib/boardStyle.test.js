// Run with: node src/lib/boardStyle.test.js
import assert from 'node:assert/strict';

import { normalizeOpacity, withOpacity } from './opacity.js';
import { MEDIA_STROKE, mediaStrokeCss, normalizeShapes, normalizeStroke, resolveShapeStyle, strokeCss } from './shapeStyle.js';
import { DEFAULT_EXTRA_TEXT_STYLE, normalizeTextStyle, resolveTextStyle } from './textStyle.js';

// ---- opacity
assert.equal(normalizeOpacity(undefined), 1);
assert.equal(normalizeOpacity(null), 1, 'a missing value never becomes 0');
assert.equal(normalizeOpacity(0.4), 0.4);
assert.equal(normalizeOpacity(3), 1);
assert.equal(normalizeOpacity(-1), 0);

const base = { color: 'red' };
assert.equal(withOpacity(base, {}), base, 'fully opaque: style untouched');
assert.deepEqual(withOpacity(base, { opacity: 0.5 }), { color: 'red', filter: 'opacity(0.5)' });
// a text's shadow preset (or a photo's drop shadow) is kept, and fades with it
assert.deepEqual(withOpacity({ filter: 'drop-shadow(0 2px 8px black)' }, { opacity: 0.25 }), {
  filter: 'drop-shadow(0 2px 8px black) opacity(0.25)',
});
assert.deepEqual(withOpacity({ filter: 'none' }, { opacity: 0.25 }), { filter: 'opacity(0.25)' });

// ---- borders
assert.deepEqual(normalizeStroke({ color: '#ffffff', width: 3, style: 'dashed' }, MEDIA_STROKE), {
  color: '#ffffff',
  width: 3,
  style: 'dashed',
});
assert.equal(normalizeStroke({ width: 3, style: 'wavy' }, MEDIA_STROKE).style, 'solid');
assert.deepEqual(normalizeStroke(undefined, MEDIA_STROKE), MEDIA_STROKE);
assert.equal(normalizeStroke({ width: 99 }, MEDIA_STROKE).width, 40);
assert.deepEqual(strokeCss({ width: 3, style: 'dotted', color: '#ffffff' }), { border: '3px dotted #ffffff' });
assert.deepEqual(strokeCss({ width: 3, color: '#ffffff' }), { border: '3px solid #ffffff' });
assert.deepEqual(strokeCss({ width: 0, style: 'dotted', color: '#ffffff' }), {});
assert.deepEqual(strokeCss(undefined), {});

// a photo/video border is in board px (cqh), divided by the element's scale so
// Size doesn't thicken it - the same in the editor's canvas and on /visual
assert.deepEqual(mediaStrokeCss({ width: 10.8, style: 'dashed', color: '#ffffff' }, 1), { border: '1cqh dashed #ffffff' });
assert.deepEqual(mediaStrokeCss({ width: 10.8, style: 'solid', color: '#ffffff' }, 2), { border: '0.5cqh solid #ffffff' });
assert.deepEqual(mediaStrokeCss({ width: 0, color: '#ffffff' }, 1), {});
assert.deepEqual(mediaStrokeCss(undefined, 1), {});

const [dashedRect] = normalizeShapes([
  { id: 'a', kind: 'rectangle', x: 50, y: 50, width: 10, height: 10, stroke: { color: '#000000', width: 2, style: 'dashed' } },
]);
assert.equal(dashedRect.stroke.style, 'dashed');
assert.equal(resolveShapeStyle(dashedRect).border, '2px dashed #000000');
const [oldRect] = normalizeShapes([{ id: 'b', kind: 'rectangle', x: 50, y: 50, width: 10, height: 10, stroke: { color: '#000000', width: 2 } }]);
assert.equal(resolveShapeStyle(oldRect).border, '2px solid #000000', 'a border saved before styles stays solid');
const [zig] = normalizeShapes([{ id: 'z', kind: 'zigzag', x: 50, y: 50, width: 10, height: 2, stroke: { color: '#000000', width: 2 } }]);
assert.equal(resolveShapeStyle(zig).border, undefined, "a zigzag's stroke is its line, not a border");

// ---- text styles
const styled = resolveTextStyle({
  fontSize: 2,
  style: normalizeTextStyle(
    { italic: true, underline: true, outline: { width: 5.4, color: '#ff0000' } },
    DEFAULT_EXTRA_TEXT_STYLE
  ),
});
assert.equal(styled.fontStyle, 'italic');
assert.equal(styled.textDecoration, 'underline');
assert.equal(styled.WebkitTextStroke, '0.5cqh #ff0000');

const plain = resolveTextStyle({ fontSize: 2, style: normalizeTextStyle({}, DEFAULT_EXTRA_TEXT_STYLE) });
assert.equal(plain.fontStyle, undefined);
assert.equal(plain.textDecoration, undefined);
assert.equal(plain.WebkitTextStroke, undefined);
assert.equal(plain.filter, 'drop-shadow(0 2px 8px rgba(0,0,0,.55))', 'shadow presets unchanged');

const goldUnderline = resolveTextStyle({
  fontSize: 2,
  style: normalizeTextStyle(
    {
      underline: true,
      fill: { type: 'gradient', gradient: 'linear', angle: 0, stops: [{ color: '#fff5b8', position: 0 }, { color: '#c68b22', position: 100 }] },
    },
    DEFAULT_EXTRA_TEXT_STYLE
  ),
});
assert.equal(goldUnderline.textDecorationColor, '#fff5b8', 'a gradient underline takes its first colour');

assert.deepEqual(normalizeTextStyle({ outline: { width: 99, color: 'x' } }, DEFAULT_EXTRA_TEXT_STYLE).outline, {
  width: 8,
  color: '#000000',
});
assert.equal(normalizeTextStyle({ italic: 'yes' }, DEFAULT_EXTRA_TEXT_STYLE).italic, false);

console.log('boardStyle: all checks passed');
