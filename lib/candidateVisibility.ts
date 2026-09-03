/*
 * Whether a candidate should appear on the /visual board.
 *
 * show_in_visual is optional so rows saved before that column
 * existed keep working everywhere it's read — a missing value
 * counts as shown.
 */
export function isShownOnBoard(candidate: {
  show_in_visual?: boolean | null;
}): boolean {
  return candidate.show_in_visual !== false;
}
