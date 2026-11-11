import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/* The board's real size, which the rulers count in. */
const BOARD = { x: 1920, y: 1080 };
const RULER = 18; // px, the rulers' thickness

/* Where a pointer is on the board, in board %, along one axis. */
function boardPercent(canvas, axis, event) {
  const rect = canvas.getBoundingClientRect();
  return axis === 'x'
    ? ((event.clientX - rect.left) / rect.width) * 100
    : ((event.clientY - rect.top) / rect.height) * 100;
}

/* Whether a pointer is over the ruler a guide on `axis` belongs to (x guides live on the left ruler). */
export function overRuler(axis, event) {
  const ruler = document.querySelector(axis === 'x' ? '.vb-ruler-left' : '.vb-ruler-top');
  if (!ruler) return false;
  const r = ruler.getBoundingClientRect();
  return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
}

/*
 * The rulers along the top and left of the canvas stage, counting board
 * pixels (0-1920 by 0-1080) and following the canvas through zoom and
 * scroll. Dragging out of one makes a guide: the top ruler gives a
 * horizontal guide, the left ruler a vertical one.
 */
export function Rulers({ stageRef, canvasRef, zoom, onDraft, onDrop }) {
  const [box, setBox] = useState(null); // the canvas, relative to the stage's visible area

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return undefined;

    function measure() {
      const s = stage.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      setBox({
        left: c.left - s.left,
        top: c.top - s.top,
        width: c.width,
        height: c.height,
        // the stage's place in the canvas column, which the rulers sit over
        stageX: stage.offsetLeft,
        stageY: stage.offsetTop,
        stageW: stage.clientWidth,
        stageH: stage.clientHeight,
      });
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    observer.observe(canvas);
    stage.addEventListener('scroll', measure);
    canvas.addEventListener('transitionend', measure);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      stage.removeEventListener('scroll', measure);
      canvas.removeEventListener('transitionend', measure);
      window.removeEventListener('resize', measure);
    };
    // the nodes appear after the first render while the layout loads, so they are dependencies too
  }, [stageRef.current, canvasRef.current, zoom]);

  if (!box) return null;

  function ticks(axis) {
    const length = axis === 'x' ? box.width : box.height;
    const offset = axis === 'x' ? box.left : box.top;
    const per100 = length / (BOARD[axis] / 100);
    const step = per100 >= 50 ? 100 : per100 >= 25 ? 200 : 500;
    const marks = [];
    for (let at = 0; at <= BOARD[axis]; at += step) {
      marks.push({ at, px: offset + (at / BOARD[axis]) * length - RULER });
    }
    return marks;
  }

  function startGuide(axis) {
    return (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      onDraft({ axis, at: boardPercent(canvasRef.current, axis, event) });
    };
  }

  function dragGuide(axis) {
    return (event) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      onDraft({ axis, at: boardPercent(canvasRef.current, axis, event), overRuler: overRuler(axis, event) });
    };
  }

  function dropGuide(axis) {
    return (event) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      onDraft(null);
      // released back over the ruler: no guide after all
      if (!overRuler(axis, event)) onDrop(axis, boardPercent(canvasRef.current, axis, event));
    };
  }

  return (
    <div className="vb-rulers" style={{ left: box.stageX, top: box.stageY, width: box.stageW, height: box.stageH }}>
      <div
        className="vb-ruler vb-ruler-top"
        style={{ left: RULER, width: Math.max(0, box.stageW - RULER) }}
        onPointerDown={startGuide('y')}
        onPointerMove={dragGuide('y')}
        onPointerUp={dropGuide('y')}
        onPointerCancel={() => onDraft(null)}
        title="Drag down to add a guide"
      >
        {ticks('x').map(({ at, px }) => (
          <span key={at} className="vb-ruler-tick" style={{ left: px }}>
            {at}
          </span>
        ))}
      </div>
      <div
        className="vb-ruler vb-ruler-left"
        style={{ top: RULER, height: Math.max(0, box.stageH - RULER) }}
        onPointerDown={startGuide('x')}
        onPointerMove={dragGuide('x')}
        onPointerUp={dropGuide('x')}
        onPointerCancel={() => onDraft(null)}
        title="Drag right to add a guide"
      >
        {ticks('y').map(({ at, px }) => (
          <span key={at} className="vb-ruler-tick" style={{ top: px }}>
            {at}
          </span>
        ))}
      </div>
      <span className="vb-ruler-corner" aria-hidden="true" />
    </div>
  );
}

/*
 * The guide lines themselves, drawn on the board at board %. Unless locked,
 * a guide drags to a new place; dropped back on its ruler, it's removed.
 */
export function GuideLines({ guides, draft, locked, highlighted, onMove, onRemove }) {
  // a ref, not state: the first moves of a quick drag arrive before a re-render would
  const movingRef = useRef(null); // { axis, index }

  useEffect(() => {
    if (locked) movingRef.current = null;
  }, [locked]);

  function surfacePercent(event, axis) {
    return boardPercent(event.currentTarget.closest('.vb-canvas-surface'), axis, event);
  }

  const line = (axis, at, extra = {}) => (
    <span
      key={`${axis}:${extra.index ?? 'draft'}`}
      className={`vb-guide is-${axis} ${extra.className ?? ''} ${highlighted?.[axis]?.includes(at) ? 'is-hit' : ''}`}
      style={axis === 'x' ? { left: `${at}%` } : { top: `${at}%` }}
      onPointerDown={
        extra.index === undefined || locked
          ? undefined
          : (event) => {
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              movingRef.current = { axis, index: extra.index };
            }
      }
      onPointerMove={(event) => {
        const moving = movingRef.current;
        if (!moving || moving.axis !== axis || moving.index !== extra.index) return;
        onMove(axis, extra.index, surfacePercent(event, axis));
      }}
      onPointerUp={(event) => {
        const moving = movingRef.current;
        if (!moving || moving.axis !== axis || moving.index !== extra.index) return;
        movingRef.current = null;
        if (overRuler(axis, event)) onRemove(axis, extra.index);
      }}
      onPointerCancel={() => {
        movingRef.current = null;
      }}
    />
  );

  return (
    <div className={`vb-guides ${locked ? 'is-locked' : ''}`} aria-hidden="true">
      {guides.x.map((at, index) => line('x', at, { index }))}
      {guides.y.map((at, index) => line('y', at, { index }))}
      {draft && !draft.overRuler && line(draft.axis, draft.at, { className: 'is-draft' })}
    </div>
  );
}
