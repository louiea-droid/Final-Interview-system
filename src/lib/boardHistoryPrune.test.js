// Run with: node src/lib/boardHistoryPrune.test.js
import assert from 'node:assert/strict';

import { HISTORY_LIMIT, idsToPrune, newestFirst } from './boardHistoryPrune.js';

const at = (id, iso) => ({ id, publishedAt: iso });

assert.equal(HISTORY_LIMIT, 10);

// newest first, whatever order Firestore hands them back in
assert.deepEqual(
  newestFirst([at('a', '2026-11-01T10:00:00Z'), at('c', '2026-11-03T10:00:00Z'), at('b', '2026-11-02T10:00:00Z')]).map((e) => e.id),
  ['c', 'b', 'a']
);

// ten or fewer: nothing to delete
const ten = Array.from({ length: 10 }, (_, i) => at(`v${i}`, `2026-11-${String(i + 1).padStart(2, '0')}T08:00:00Z`));
assert.deepEqual(idsToPrune(ten), []);

// twelve: the two oldest go
const twelve = [...ten, at('v10', '2026-11-11T08:00:00Z'), at('v11', '2026-11-12T08:00:00Z')];
assert.deepEqual(idsToPrune(twelve).sort(), ['v0', 'v1']);

// an entry still waiting for its server time sorts as newest, so it's never pruned
assert.deepEqual(idsToPrune([...twelve, at('pending', null)]).sort(), ['v0', 'v1', 'v2']);

console.log('boardHistoryPrune: all checks passed');
