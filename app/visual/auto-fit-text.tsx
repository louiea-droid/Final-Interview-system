'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Keeps its text on a single line by shrinking it (never wrapping)
 * just enough to fit the available width, instead of letting a long
 * candidate name wrap onto a second line.
 *
 * `element.scrollWidth` reflects the untransformed layout width of
 * the nowrap text regardless of any transform already applied, so
 * re-measuring on every fit is safe without resetting the scale first.
 */
export default function AutoFitText({
  children,
  className,
  minScale = 0.5,
}: {
  children: React.ReactNode;
  className?: string;
  minScale?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    const fit = () => {
      const available = container.clientWidth;
      const needed = text.scrollWidth;

      if (!needed || needed <= available) {
        setScale(1);
        return;
      }

      setScale(Math.max(minScale, available / needed));
    };

    fit();

    const observer = new ResizeObserver(fit);
    observer.observe(container);

    return () => observer.disconnect();
  }, [children, minScale]);

  return (
    <div ref={containerRef} className="flex w-full items-center justify-center overflow-hidden">
      <span
        ref={textRef}
        className={className}
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
          transform: `scale(${scale})`,
          transformOrigin: 'center',
        }}
      >
        {children}
      </span>
    </div>
  );
}
