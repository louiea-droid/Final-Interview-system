/*
 * Whether a candidate should appear on the /visual board.
 *
 * show_in_visual is optional so rows saved before that column
 * existed keep working everywhere it's read — a missing value
 * counts as shown.
 */
export function isShownOnBoard(candidate) {
  return candidate.show_in_visual !== false;
}

/* The interviews happen in the Philippines, so "today" is Manila's date. */
const BOARD_TIME_ZONE = 'Asia/Manila';

/** The time in Manila as "YYYY-MM-DD HH:MM" - interview_date's format plus the time. */
export function nowKey(date = new Date()) {
  // sv-SE writes "YYYY-MM-DD HH:MM"; h23 so midnight is 00:00, never 24:00
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: BOARD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

/**
 * Whether the candidate's interview is over at `now` (a nowKey string): from
 * `hideTime` ("HH:MM") on their interview day, or, with no time, once that
 * day has ended. Undated candidates never are.
 */
export function isPastInterview(candidate, now, hideTime = '') {
  const date = candidate.interview_date;
  if (!date) return false;
  return hideTime ? now >= `${date} ${hideTime}` : now.slice(0, 10) > date;
}

/*
 * The candidates the board shows, in board order: never the ones hidden from
 * the board, and - with the board setting on - not the ones whose interview
 * is over. Shared by /visual and the editor's canvas.
 */
export function boardCandidates(rows, settings, now) {
  return rows
    .filter((candidate) => isShownOnBoard(candidate))
    .filter(
      (candidate) =>
        !settings.hidePastCandidates || !isPastInterview(candidate, now, settings.hidePastTime)
    )
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
}
