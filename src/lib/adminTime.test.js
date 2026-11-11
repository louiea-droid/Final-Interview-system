// Run with: node src/lib/adminTime.test.js
import assert from 'node:assert/strict';

import { formatLongDate } from './adminTime.js';

// a day key reads as that calendar day, whatever the machine's own zone
assert.equal(formatLongDate('2026-09-10'), 'Sep 10, 2026');
assert.equal(formatLongDate('2026-01-01'), 'Jan 1, 2026');
assert.equal(formatLongDate('2026-12-31'), 'Dec 31, 2026');
assert.equal(formatLongDate(''), '--');
assert.equal(formatLongDate('not a date'), '--');

console.log('adminTime: all checks passed');
