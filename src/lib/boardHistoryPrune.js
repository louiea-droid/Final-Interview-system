/*
 * Which published versions the board's history keeps: the newest
 * HISTORY_LIMIT, by `publishedAt` (an ISO time). Pure, so it can be tested
 * without Firebase; boardHistory.js does the reading and deleting.
 */

export const HISTORY_LIMIT = 10;

// an entry with no time yet is the one just written - treat it as newest
const timeOf = (entry) => (entry.publishedAt ? Date.parse(entry.publishedAt) : Infinity);

export function newestFirst(entries) {
  return [...entries].sort((a, b) => timeOf(b) - timeOf(a));
}

/** The ids of every version older than the newest HISTORY_LIMIT. */
export function idsToPrune(entries) {
  return newestFirst(entries)
    .slice(HISTORY_LIMIT)
    .map((entry) => entry.id);
}
