// Run with: node src/lib/candidateVisibility.test.js
import assert from 'node:assert/strict';

import { boardCandidates, isPastInterview, nowKey } from './candidateVisibility.js';

// nowKey: the date and time in Manila, whatever the machine's own zone
assert.equal(nowKey(new Date('2026-09-28T15:59:00Z')), '2026-09-28 23:59', '11:59pm in Manila');
assert.equal(nowKey(new Date('2026-09-28T16:00:00Z')), '2026-09-29 00:00', 'midnight in Manila');

// isPastInterview with no time: over once the interview day has ended
assert.equal(isPastInterview({ interview_date: '2026-09-27' }, '2026-09-28 00:00'), true);
assert.equal(isPastInterview({ interview_date: '2026-09-28' }, '2026-09-28 23:59'), false);
assert.equal(isPastInterview({ interview_date: '2026-10-01' }, '2026-09-28 10:00'), false);
assert.equal(isPastInterview({ interview_date: '' }, '2026-09-28 10:00'), false);
assert.equal(isPastInterview({}, '2026-09-28 10:00'), false);

// isPastInterview with a time: over from that time on the interview day
assert.equal(isPastInterview({ interview_date: '2026-09-28' }, '2026-09-28 16:59', '17:00'), false);
assert.equal(isPastInterview({ interview_date: '2026-09-28' }, '2026-09-28 17:00', '17:00'), true);
assert.equal(isPastInterview({ interview_date: '2026-09-27' }, '2026-09-28 09:00', '17:00'), true);
assert.equal(isPastInterview({}, '2026-09-28 18:00', '17:00'), false);

// boardCandidates: hidden-from-board and (optionally) past candidates dropped, sorted
const rows = [
  { id: 'a', sort_order: 2, interview_date: '2026-09-28' },
  { id: 'b', sort_order: 1, interview_date: '2026-09-20' },
  { id: 'c', sort_order: 3, show_in_visual: false },
  { id: 'd', sort_order: 0 },
];
const ids = (settings, now) => boardCandidates(rows, settings, now).map((c) => c.id);
assert.deepEqual(ids({ hidePastCandidates: false }, '2026-09-28 12:00'), ['d', 'b', 'a']);
assert.deepEqual(ids({ hidePastCandidates: true }, '2026-09-28 12:00'), ['d', 'a']);
assert.deepEqual(ids({ hidePastCandidates: true, hidePastTime: '12:00' }, '2026-09-28 12:00'), ['d']);

console.log('candidateVisibility: all checks passed');
