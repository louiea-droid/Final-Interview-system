/*
 * A lightning rule - a zigzag line drawn edge to edge across its shape's box,
 * for use where a straight divider would be too plain. Shared between the
 * live board and the admin editor's canvas so it looks the same in both.
 *
 * The polyline is laid out in a 0-100 viewBox on both axes with
 * preserveAspectRatio="none", so it stretches to whatever width and height
 * the shape is given. `vector-effect: non-scaling-stroke` keeps the stroke
 * at its real pixel width through that stretch - without it a long, short
 * box would squash the line to a hairline and a tall one would fatten it.
 *
 * `peaks` is how many full up-and-down cycles fit across the box; the points
 * alternate between the top and bottom insets so the line never clips its
 * own stroke against the edge of the box.
 */
export default function ZigzagRule({ color = '#c9a03c', width = 2, peaks = 6, glow = true }) {
  const steps = Math.max(2, Math.round(peaks) * 2);
  const inset = 8; // keeps the stroke's own thickness inside the box

  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * 100;
    const y = i % 2 === 0 ? inset : 100 - inset;
    points.push(`${x.toFixed(2)},${y}`);
  }

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        overflow: 'visible',
        ...(glow ? { filter: `drop-shadow(0 0 6px ${color})` } : {}),
      }}
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
