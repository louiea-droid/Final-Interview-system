// Run with: node src/lib/exportName.test.js
import assert from 'node:assert/strict';

import { exportFileName } from './exportName.js';

// named by the local date, zero-padded
assert.equal(exportFileName(new Date(2026, 10, 10, 23, 59)), 'board-2026-11-10.png');
assert.equal(exportFileName(new Date(2027, 0, 5, 0, 1)), 'board-2027-01-05.png');

console.log('exportName: all checks passed');
