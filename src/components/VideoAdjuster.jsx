import { useCallback, useEffect, useRef } from "react";

/*
 * Renders a video fill's clip, panned and zoomed per its offsetX/offsetY/
 * zoom (see videoFill/normalizeFill in lib/fill.js) - the video counterpart
 * of PhotoAdjuster.jsx, shared between the live board and the admin
 * editor's canvas so a frame looks the same in both places.
 *
 * Autoplay/loop so it behaves like a looping background clip rather than
 * something a viewer has to press play on. `fill.volume` (0 to 1, 0 by
 * default) sets both muted and volume imperatively rather than as plain
 * JSX props, for two different reasons at two different times:
 *
 * - On mount, `muted` is set via the ref callback rather than a `useEffect`.
 *   React doesn't apply a JSX `muted` prop to the actual DOM property until
 *   after the element is already in the document and the browser has had a
 *   chance to act on `autoplay` - and a `useEffect` runs later still, after
 *   paint. If the browser attempts autoplay in that window and sees an
 *   unmuted video, it silently blocks it, and the video is stuck paused
 *   forever after - `muted` becoming true later doesn't make a blocked
 *   `play()` retry. A ref callback runs synchronously as the node is
 *   attached, before that window opens, so the video is reliably muted by
 *   the time autoplay is attempted.
 * - After mount, dragging the volume slider updates an already-playing
 *   element, where this race doesn't apply - a plain `useEffect` is enough
 *   to push those later changes down, since React also doesn't reliably
 *   re-apply a changed `muted`/`volume` prop to an already-mounted element.
 *
 * The ref callback is wrapped in useCallback (empty deps) so its identity
 * stays the same across renders - a plain function here would be a new
 * reference every render, and React detaches and reattaches a ref whose
 * identity changes on every single one, forcing `muted = true` back on
 * every re-render this component's parent causes (a clock ticking every
 * second, a timer rotating announcements, admin UI state changes...).
 * That re-muted the video moments after the volume slider turned sound on,
 * which is exactly the "mutes itself after a few seconds" bug this fixes.
 *
 * Unmuting (volume > 0) only happens once real playback has actually
 * started - not simply "soon after mount". Every browser unconditionally
 * allows a MUTED autoplay to start, but *unmuting* is only safe once
 * that's genuinely underway; do it too early - e.g. right after mount,
 * before a multi-megabyte clip has buffered enough to actually begin
 * playing on a real network - and the browser's own autoplay attempt,
 * whenever the data does arrive, finds the video already unmuted and
 * blocks it outright, leaving it paused forever instead of playing
 * silently. Waiting for the `playing` event (or checking `!paused`, for
 * a volume change on a clip that's already underway) sidesteps that
 * race entirely.
 */
export default function VideoAdjuster({ fill }) {
  const videoRef = useRef(null);
  const volume = fill.volume ?? 0;

  const attachVideoRef = useCallback((node) => {
    videoRef.current = node;
    if (node) node.muted = true;
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.volume = volume;

    if (volume <= 0) {
      video.muted = true;
      return;
    }

    if (!video.paused) {
      video.muted = false;
      return;
    }

    function unmuteOncePlaying() {
      video.muted = false;
    }
    video.addEventListener('playing', unmuteOncePlaying, { once: true });
    return () => video.removeEventListener('playing', unmuteOncePlaying);
  }, [volume]);

  if (!fill.url) return null;

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: "inherit" }}>
      <video
        ref={attachVideoRef}
        src={fill.url}
        className="absolute inset-0 h-full w-full"
        muted
        loop
        autoPlay
        playsInline
        style={{
          objectFit: fill.fit,
          transform: `translate(${fill.offsetX}%, ${fill.offsetY}%) scale(${fill.zoom})`,
        }}
      />
    </div>
  );
}
