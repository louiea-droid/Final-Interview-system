/*
 * The Layers list with groups folded together: a group's members needn't be
 * next to each other in the stacking order, so the group row sits where its
 * frontmost member is and gathers the rest under it.
 */
export function layerTree(entries, groupOf) {
  const members = new Map();
  for (const entry of entries) {
    const groupId = groupOf(entry);
    if (groupId) members.set(groupId, [...(members.get(groupId) ?? []), entry]);
  }

  const placed = new Set();
  const tree = [];
  for (const entry of entries) {
    const groupId = groupOf(entry);
    const group = groupId ? members.get(groupId) : null;
    if (!group || group.length < 2) {
      tree.push({ type: 'item', entry });
    } else if (!placed.has(groupId)) {
      placed.add(groupId);
      tree.push({ type: 'group', groupId, entries: group });
    }
  }
  return tree;
}
