import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
} from 'lucide-react';

export const ALIGN_ACTIONS = [
  { edge: 'left', label: 'Align left', Icon: AlignStartVertical },
  { edge: 'center', label: 'Align centre', Icon: AlignCenterVertical },
  { edge: 'right', label: 'Align right', Icon: AlignEndVertical },
  { edge: 'top', label: 'Align top', Icon: AlignStartHorizontal },
  { edge: 'middle', label: 'Align middle', Icon: AlignCenterHorizontal },
  { edge: 'bottom', label: 'Align bottom', Icon: AlignEndHorizontal },
];

export default function AlignBar({ onAlign, onDistribute, canDistribute, toBoard }) {
  const suffix = toBoard ? ' to the board' : '';

  return (
    <div className="vb-align-bar" role="toolbar" aria-label="Align">
      {ALIGN_ACTIONS.map(({ edge, label, Icon }) => (
        <button
          key={edge}
          type="button"
          className="vb-align-button"
          onClick={() => onAlign(edge)}
          title={label + suffix}
          aria-label={label + suffix}
        >
          <Icon size={14} />
        </button>
      ))}

      {canDistribute && (
        <>
          <span className="vb-align-divider" aria-hidden="true" />
          <button
            type="button"
            className="vb-align-button"
            onClick={() => onDistribute('x')}
            title="Distribute horizontally"
            aria-label="Distribute horizontally"
          >
            <AlignHorizontalDistributeCenter size={14} />
          </button>
          <button
            type="button"
            className="vb-align-button"
            onClick={() => onDistribute('y')}
            title="Distribute vertically"
            aria-label="Distribute vertically"
          >
            <AlignVerticalDistributeCenter size={14} />
          </button>
        </>
      )}
    </div>
  );
}
