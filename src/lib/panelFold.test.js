// Run with: node src/lib/panelFold.test.js
import assert from 'node:assert/strict';

import { clickTab, loadFolded, saveFolded } from './panelFold.js';

// the active tab folds the panel, and opens it again
assert.deepEqual(clickTab({ active: 'text', folded: false }, 'text'), { active: 'text', folded: true });
assert.deepEqual(clickTab({ active: 'text', folded: true }, 'text'), { active: 'text', folded: false });
// another tab switches to it, opening the panel if folded
assert.deepEqual(clickTab({ active: 'text', folded: true }, 'layers'), { active: 'layers', folded: false });
assert.deepEqual(clickTab({ active: 'text', folded: false }, 'layers'), { active: 'layers', folded: false });

const store = new Map();
const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
assert.equal(loadFolded(storage), false);
saveFolded(true, storage);
assert.equal(store.get('vb-panel-folded'), '1');
assert.equal(loadFolded(storage), true);
saveFolded(false, storage);
assert.equal(loadFolded(storage), false);

// blocked storage (private window) never breaks the editor
const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
assert.equal(loadFolded(broken), false);
saveFolded(true, broken);
assert.equal(loadFolded(undefined), false);

console.log('panelFold: all checks passed');
