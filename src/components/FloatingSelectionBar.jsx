import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CopyPlus, Group, Lock, LockOpen, MoreHorizontal } from 'lucide-react';

import AlignBar from './AlignBar';
import { placeFloatingBar } from '../lib/floatingBar';

/*
 * The small bar that floats just above the selection on the canvas: align,
 * duplicate or group, lock, and "⋯" for the full right-click menu.
 * `measureSelection()` returns the selection's client-px rect (or null);
 * the bar re-places itself when the stage scrolls, the window resizes or
 * the canvas finishes a zoom, without re-rendering the page around it.
 */
export default function FloatingSelectionBar({
  measureSelection,
  stageRef,
  canvasRef,
  locked,
  multi,
  canDuplicate,
  canDistribute,
  onAlign,
  onDistribute,
  onDuplicate,
  onGroup,
  onToggleLock,
  onMore,
}) {
  const ref = useRef(null);
  const [spot, setSpot] = useState(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    let frame = 0;
    const bump = () => {
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        setTick((tick) => tick + 1);
      });
    };
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    stage?.addEventListener('scroll', bump);
    canvas?.addEventListener('transitionend', bump);
    window.addEventListener('resize', bump);
    return () => {
      cancelAnimationFrame(frame);
      stage?.removeEventListener('scroll', bump);
      canvas?.removeEventListener('transitionend', bump);
      window.removeEventListener('resize', bump);
    };
  }, [stageRef, canvasRef]);

  /* Placed after each commit, when the elements' new sizes are in the DOM -
     measuring during render read the previous frame (a grown font left the
     bar over the text, a fresh duplicate had no node yet). */
  useLayoutEffect(() => {
    const selRect = measureSelection();
    const stage = stageRef.current?.getBoundingClientRect();
    const bar = { width: ref.current.offsetWidth, height: ref.current.offsetHeight };
    const next = selRect && stage ? placeFloatingBar(selRect, stage, bar) : null;
    if (next?.left !== spot?.left || next?.top !== spot?.top) setSpot(next);
  });

  return (
    <div
      ref={ref}
      className="vb-floating-bar"
      role="toolbar"
      aria-label="Selection"
      style={spot ? { left: spot.left, top: spot.top } : { visibility: 'hidden', left: 0, top: 0 }}
    >
      <AlignBar
        onAlign={onAlign}
        onDistribute={onDistribute}
        canDistribute={canDistribute}
        toBoard={!multi}
        disabled={locked}
      />

      <span className="vb-floating-divider" aria-hidden="true" />

      {multi ? (
        <button type="button" className="vb-align-button" onClick={onGroup} disabled={locked} title="Group (Ctrl+G)" aria-label="Group">
          <Group size={14} />
        </button>
      ) : (
        canDuplicate && (
          <button
            type="button"
            className="vb-align-button"
            onClick={onDuplicate}
            disabled={locked}
            title="Duplicate (Ctrl+D)"
            aria-label="Duplicate"
          >
            <CopyPlus size={14} />
          </button>
        )
      )}

      <button
        type="button"
        className="vb-align-button"
        onClick={onToggleLock}
        title={locked ? 'Unlock' : 'Lock'}
        aria-label={locked ? 'Unlock' : 'Lock'}
        aria-pressed={locked}
      >
        {locked ? <Lock size={14} /> : <LockOpen size={14} />}
      </button>

      <button
        type="button"
        className="vb-align-button"
        onClick={() => {
          const box = ref.current.getBoundingClientRect();
          onMore(box.left, box.bottom + 4);
        }}
        title="More"
        aria-label="More actions"
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  );
}
