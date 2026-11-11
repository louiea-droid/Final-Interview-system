import { useEffect, useRef } from 'react';

import { resolveTextStyle } from '../lib/textStyle';
import { withOpacity } from '../lib/opacity';

/* The text's own look, minus what a textarea can't show: a gradient paints
   through glyphs with background-clip, so it edits in its first colour. */
function editingStyle(text) {
  // an outline is left off while typing too, like a gradient
  const { backgroundImage, WebkitBackgroundClip, backgroundClip, width, WebkitTextStroke, ...style } = resolveTextStyle(text);
  const fill = text.style.fill;
  return withOpacity(
    {
      ...style,
      whiteSpace: 'pre-wrap',
      ...(fill?.type === 'gradient' ? { color: fill.stops?.[0]?.color ?? '#ffffff' } : {}),
    },
    text
  );
}

/* Grows the box to its text where CSS field-sizing isn't supported
   (Firefox, Safari): rows and cols are ignored where it is.
   ponytail: cols counts characters, so proportional fonts fit loosely. */
function fitToText(textarea) {
  const lines = textarea.value.split('\n');
  textarea.rows = lines.length;
  textarea.cols = Math.max(2, ...lines.map((line) => line.length));
}

export default function CanvasTextEditor({ text, onDone }) {
  const ref = useRef(null);

  useEffect(() => {
    fitToText(ref.current);
    ref.current.focus();
    ref.current.select();
  }, []);

  return (
    <textarea
      ref={ref}
      className="vb-text-editor"
      defaultValue={text.text}
      style={editingStyle(text)}
      aria-label="Edit text"
      onInput={(event) => fitToText(event.currentTarget)}
      onBlur={(event) => onDone(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
    />
  );
}
