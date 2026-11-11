/* The editor's left panel folds away to give the canvas its width back. */

const KEY = 'vb-panel-folded';

/** A rail tab click: the active tab toggles the fold, any other tab opens on itself. */
export function clickTab({ active, folded }, tabId) {
  if (tabId === active) return { active, folded: !folded };
  return { active: tabId, folded: false };
}

export function loadFolded(storage) {
  try {
    return storage?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function saveFolded(folded, storage) {
  try {
    storage?.setItem(KEY, folded ? '1' : '0');
  } catch {
    // private window or blocked storage: the fold just isn't remembered
  }
}
