/*
 * Renders a video fill's clip, panned and zoomed per its offsetX/offsetY/
 * zoom (see videoFill/normalizeFill in lib/fill.js) - the video counterpart
 * of PhotoAdjuster.jsx, shared between the live board and the admin
 * editor's canvas so a frame looks the same in both places.
 *
 * Muted/autoplay/loop so it behaves like a looping background clip rather
 * than something a viewer has to press play on.
 */
export default function VideoAdjuster({ fill }) {
  if (!fill.url) return null;

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: "inherit" }}>
      <video
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
