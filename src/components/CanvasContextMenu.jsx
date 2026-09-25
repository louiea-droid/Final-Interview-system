import { useLayoutEffect, useRef, useState } from 'react';
import {
  BoxSelect,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  ClipboardPaste,
  Copy,
  CopyPlus,
  EyeOff,
  Group,
  Lock,
  LockOpen,
  Scissors,
  Trash2,
  Ungroup,
} from 'lucide-react';

import { ALIGN_ACTIONS } from './AlignBar';

/*
 * The canvas right-click menu. `onElement` picks the element menu or the
 * empty-canvas one; it's nudged back inside the window when opened near an
 * edge.
 */
export default function CanvasContextMenu({
  x,
  y,
  onElement,
  locked,
  canPaste,
  canGroup,
  canUngroup,
  onAction,
  onAlign,
}) {
  const ref = useRef(null);
  const [position, setPosition] = useState({ left: x, top: y });

  /*
   * Re-clamps whenever the menu's own size can have changed (onElement/
   * canGroup/canUngroup add or remove rows - the menu can stay mounted with
   * the same x/y while its row count changes) or the window shrinks under
   * an already-open menu - neither of those touches x/y, so both were
   * silently falling through the old [x, y]-only effect and leaving the
   * menu positioned for a size or window that no longer applies.
   */
  useLayoutEffect(() => {
    function reposition() {
      const { width, height } = ref.current.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
        top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
      });
    }
    reposition();
    window.addEventListener('resize', reposition);
    return () => window.removeEventListener('resize', reposition);
  }, [x, y, onElement, canGroup, canUngroup]);

  function item(action, label, Icon, shortcut, disabled = false) {
    return (
      <button key={action} type="button" role="menuitem" disabled={disabled} onClick={() => onAction(action)}>
        <Icon size={13} />
        <span>{label}</span>
        {shortcut && <kbd>{shortcut}</kbd>}
      </button>
    );
  }

  return (
    <div
      ref={ref}
      className="vb-order-menu vb-context-menu"
      style={position}
      /* the dismiss listener runs in capture, so keep it off this menu */
      onPointerDown={(event) => event.stopPropagation()}
      role="menu"
    >
      {onElement ? (
        <>
          {item('cut', 'Cut', Scissors, 'Ctrl+X')}
          {item('copy', 'Copy', Copy, 'Ctrl+C')}
          {item('paste', 'Paste', ClipboardPaste, 'Ctrl+V', !canPaste)}
          {item('duplicate', 'Duplicate', CopyPlus, 'Ctrl+D')}
          {item('delete', 'Delete', Trash2, 'Del')}
          <hr />
          {item('lock', locked ? 'Unlock' : 'Lock', locked ? LockOpen : Lock)}
          {item('hide', 'Hide', EyeOff)}
          {canGroup && item('group', 'Group', Group, 'Ctrl+G')}
          {canUngroup && item('ungroup', 'Ungroup', Ungroup, 'Ctrl+Shift+G')}
          <hr />
          <div className="vb-context-align" role="group" aria-label="Align">
            {ALIGN_ACTIONS.map(({ edge, label, Icon }) => (
              <button key={edge} type="button" title={label} aria-label={label} onClick={() => onAlign(edge)}>
                <Icon size={13} />
              </button>
            ))}
          </div>
          <hr />
          {item('front', 'Bring to front', ChevronsUp, 'Ctrl+Shift+]')}
          {item('up', 'Bring forward', ChevronUp, 'Ctrl+]')}
          {item('down', 'Send backward', ChevronDown, 'Ctrl+[')}
          {item('back', 'Send to back', ChevronsDown, 'Ctrl+Shift+[')}
        </>
      ) : (
        <>
          {item('paste', 'Paste', ClipboardPaste, 'Ctrl+V', !canPaste)}
          {item('selectAll', 'Select all', BoxSelect, 'Ctrl+A')}
        </>
      )}
    </div>
  );
}
