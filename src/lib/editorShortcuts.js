/* The Visual Board editor's keyboard shortcuts, listed in the right panel
   when nothing is selected. Add new ones here. */
export const EDITOR_SHORTCUTS = [
  { keys: 'Ctrl+Z', action: 'Undo' },
  { keys: 'Ctrl+Shift+Z / Ctrl+Y', action: 'Redo' },
  { keys: 'Ctrl+A', action: 'Select all' },
  { keys: 'Ctrl+C / Ctrl+X / Ctrl+V', action: 'Copy / cut / paste' },
  { keys: 'Ctrl+D', action: 'Duplicate' },
  { keys: 'Ctrl+G / Ctrl+Shift+G', action: 'Group / ungroup' },
  { keys: 'Ctrl+] / Ctrl+[', action: 'Bring forward / send backward' },
  { keys: 'Ctrl+Shift+] / Ctrl+Shift+[', action: 'Bring to front / send to back' },
  { keys: 'Arrows / Shift+Arrows', action: 'Nudge (Shift for bigger steps)' },
  { keys: 'Delete', action: 'Delete' },
  { keys: 'Enter', action: 'Edit the selected text' },
  { keys: 'Esc', action: 'Deselect' },
  { keys: 'Space + drag', action: 'Pan the canvas' },
  { keys: 'Ctrl+scroll / Ctrl+= / Ctrl+- / Ctrl+0', action: 'Zoom' },
  { keys: 'Shift while resizing', action: 'Keep proportions' },
  { keys: 'Alt while resizing', action: 'Resize from the centre' },
  { keys: 'Shift while rotating', action: 'Snap to 15°' },
  { keys: 'Hold Ctrl while dragging', action: 'Skip snapping' },
];
