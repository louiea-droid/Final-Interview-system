/*
 * Drag-to-reorder for one date's candidates on the Records page.
 * `sort_order` is the board's order across every candidate, so a reorder
 * reuses the group's own numbers - handed out again in the new order -
 * rather than renumbering everyone: candidates on other dates keep their
 * numbers, and so their place relative to this group.
 */

/** Board order: by sort_order, a missing one counting as 0. */
export function bySortOrder(a, b) {
  return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
}

/**
 * `group` in board order with `draggedId` moved into `targetId`'s place.
 * Returns the reordered list and just the { id, sort_order } that changed.
 */
export function reorderGroup(group, draggedId, targetId) {
  const from = group.findIndex((candidate) => candidate.id === draggedId);
  const to = group.findIndex((candidate) => candidate.id === targetId);
  if (from < 0 || to < 0 || from === to) return { ordered: group, changes: [] };

  const moved = [...group];
  const [dragged] = moved.splice(from, 1);
  moved.splice(to, 0, dragged);

  /* Tied numbers (older rows) would leave the new order up to chance, so
     each slot is kept at least one above the one before it. */
  const slots = group.map((candidate) => Number(candidate.sort_order) || 0).sort((a, b) => a - b);
  for (let i = 1; i < slots.length; i++) slots[i] = Math.max(slots[i], slots[i - 1] + 1);

  const ordered = moved.map((candidate, index) => ({ ...candidate, sort_order: slots[index] }));
  const changes = ordered
    .filter((candidate, index) => (Number(moved[index].sort_order) || 0) !== candidate.sort_order)
    .map(({ id, sort_order }) => ({ id, sort_order }));

  return { ordered, changes };
}
