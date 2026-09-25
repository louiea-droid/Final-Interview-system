import { useEffect, useRef } from 'react';

import { resolveTextStyle } from '../lib/textStyle';

/* The text's own look, minus what a textarea can't show: a gradient paints
   through glyphs with background-clip, so it edits in its first colour. */
function editingStyle(text) {
  const { backgroundImage, WebkitBackgroundClip, backgroundClip, width, ...style } = resolveTextStyle(text);
  const fill = text.style.fill;
  return {
    ...style,
    whiteSpace: 'pre-wrap',
    ...(fill?.type === 'gradient' ? { color: fill.stops?.[0]?.color ?? '#ffffff' } : {}),
  };
}

export default function CanvasTextEditor({ text, onDone }) {
  const ref = useRef(null);

  useEffect(() => {
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
