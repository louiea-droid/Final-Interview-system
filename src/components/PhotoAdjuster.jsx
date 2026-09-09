/*
 * Renders an image fill's photo, panned and zoomed per its offsetX/offsetY/
 * zoom (see imageFill/normalizeFill in lib/fill.js) - shared between the
 * live board and the admin editor's canvas so a frame looks the same in
 * both places.
 *
 * A plain <img> rather than a CSS background: transform-based pan/zoom is
 * exact regardless of how the box's aspect ratio compares to the photo's,
 * which background-position/-size percentages can't represent once the two
 * ratios differ.
 */
export default function PhotoAdjuster({ fill }) {
  if (!fill.url) return null;

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: "inherit" }}>
      <img
        src={fill.url}
        alt=""
        className="absolute inset-0 h-full w-full"
        style={{
          objectFit: fill.fit,
          transform: `translate(${fill.offsetX}%, ${fill.offsetY}%) scale(${fill.zoom})`,
        }}
      />
    </div>
  );
}
