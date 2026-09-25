const HANDLES = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
};

export const ALL_HANDLES = Object.keys(HANDLES);
export const CORNER_HANDLES = ['nw', 'ne', 'se', 'sw'];
export const TEXT_HANDLES = [...CORNER_HANDLES, 'e', 'w'];

/* The resize cursor for a handle, turned with its element. */
function cursorFor({ x, y }, rotation) {
  const angle = (((Math.atan2(y, x) * 180) / Math.PI + rotation) % 180 + 180) % 180;
  return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][Math.round(angle / 45) % 4];
}

/*
 * Resize handles (and optionally a rotate handle), drawn inside the selected
 * element so they turn with it. `inverseScale` undoes a scaled element's own
 * scale() so the handles stay the same size on screen.
 */
export default function SelectionHandles({ handles, onResize, onRotate, rotation = 0, inverseScale = 1 }) {
  return (
    <span className="vb-handles" style={{ '--vb-handle-scale': inverseScale }}>
      {handles.map((id) => (
        <span
          key={id}
          className={`vb-handle vb-handle-${id}`}
          style={{ cursor: cursorFor(HANDLES[id], rotation) }}
          onPointerDown={onResize(HANDLES[id])}
        />
      ))}

      {onRotate && <span className="vb-rotate-handle" title="Drag to rotate (Shift snaps to 15°)" onPointerDown={onRotate} />}
    </span>
  );
}
