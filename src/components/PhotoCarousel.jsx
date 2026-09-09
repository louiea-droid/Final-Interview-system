import { useEffect, useRef, useState } from 'react';

/*
 * A photo frame's carousel: holds on one photo for `speed` seconds, then
 * slides it out toward `direction` while the next photo slides in from the
 * opposite side, looping back to the first photo after the last. Shared
 * between the live board and the admin editor's canvas so the motion looks
 * the same in both places.
 *
 * Built as a two-layer crossfade (the outgoing photo and the incoming one)
 * rather than one long scrolling filmstrip, since a filmstrip's scroll
 * direction and its photo order fight each other once "right" or "down" is
 * allowed - the two-layer version keeps photo order and visual direction
 * fully independent.
 */

/* Must match the CSS transition on .photo-carousel-slide in globals.css. */
const TRANSITION_MS = 800;

const EXIT_TRANSFORM = {
  left: 'translateX(-100%)',
  right: 'translateX(100%)',
  up: 'translateY(-100%)',
  down: 'translateY(100%)',
};

const ENTER_FROM_TRANSFORM = {
  left: 'translateX(100%)',
  right: 'translateX(-100%)',
  up: 'translateY(100%)',
  down: 'translateY(-100%)',
};

function slideStyle(url, fit) {
  return {
    backgroundImage: `url("${url}")`,
    backgroundSize: fit,
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
}

export default function PhotoCarousel({ photos, direction = 'left', speed = 6, fit = 'cover' }) {
  const [index, setIndex] = useState(0);
  const [outgoingIndex, setOutgoingIndex] = useState(null);
  const [settled, setSettled] = useState(true);
  const indexRef = useRef(0);
  const clearTimeoutRef = useRef(null);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    if (photos.length < 2) return undefined;

    const holdMs = Math.max(1, speed) * 1000;

    const interval = window.setInterval(() => {
      const next = (indexRef.current + 1) % photos.length;
      setOutgoingIndex(indexRef.current);
      setSettled(false);
      setIndex(next);
      indexRef.current = next;
    }, holdMs);

    return () => window.clearInterval(interval);
  }, [photos.length, speed]);

  /* Lets the incoming photo mount off-frame first, then releases it into
     the transition on the next frame - and clears the outgoing layer once
     the transition has had time to finish. */
  useEffect(() => {
    if (outgoingIndex === null) return undefined;

    const raf = requestAnimationFrame(() => setSettled(true));
    clearTimeoutRef.current = window.setTimeout(() => setOutgoingIndex(null), TRANSITION_MS);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(clearTimeoutRef.current);
    };
  }, [outgoingIndex]);

  return (
    <div className="photo-carousel" aria-hidden="true">
      {outgoingIndex !== null && (
        <div
          className="photo-carousel-slide"
          style={{
            ...slideStyle(photos[outgoingIndex], fit),
            transform: settled ? EXIT_TRANSFORM[direction] : 'translate(0, 0)',
          }}
        />
      )}

      <div
        className="photo-carousel-slide"
        style={{
          ...slideStyle(photos[index], fit),
          transform:
            outgoingIndex === null || settled ? 'translate(0, 0)' : ENTER_FROM_TRANSFORM[direction],
        }}
      />
    </div>
  );
}
