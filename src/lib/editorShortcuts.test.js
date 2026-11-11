// Run with: node src/lib/editorShortcuts.test.js
import assert from 'node:assert/strict';

import { EDITOR_SHORTCUTS } from './editorShortcuts.js';
import { defaultOpenSections } from './propertySections.js';

assert.deepEqual(
  EDITOR_SHORTCUTS.map((entry) => entry.keys),
  [
    'Ctrl+Z',
    'Ctrl+Shift+Z / Ctrl+Y',
    'Ctrl+A',
    'Ctrl+C / Ctrl+X / Ctrl+V',
    'Ctrl+D',
    'Ctrl+G / Ctrl+Shift+G',
    'Ctrl+] / Ctrl+[',
    'Ctrl+Shift+] / Ctrl+Shift+[',
    'Arrows / Shift+Arrows',
    'Delete',
    'Enter',
    'Esc',
    'Space + drag',
    'Ctrl+scroll / Ctrl+= / Ctrl+- / Ctrl+0',
    'Shift while resizing',
    'Alt while resizing',
    'Shift while rotating',
    'Hold Ctrl while dragging',
  ]
);
for (const entry of EDITOR_SHORTCUTS) assert.ok(entry.action.trim(), `${entry.keys} has no action`);

// the shortcuts list folds closed until opened
assert.deepEqual(defaultOpenSections('board'), []);

console.log('editorShortcuts: all checks passed');
