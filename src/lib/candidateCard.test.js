// Run with: node src/lib/candidateCard.test.js
import assert from 'node:assert/strict';

import { CARD_DEFAULTS, boardPx, normalizeCardSettings } from './candidateCard.js';

// a board saved before these settings existed gets today's look
assert.deepEqual(normalizeCardSettings({}), CARD_DEFAULTS);
assert.deepEqual(normalizeCardSettings(undefined), CARD_DEFAULTS);

// every setting is held inside its range
assert.deepEqual(
  normalizeCardSettings({ cardWidth: 10, photoHeight: 999, nameSize: 1, courseSize: 99 }),
  { cardWidth: 60, photoHeight: 160, nameSize: 10, courseSize: 32 }
);
assert.equal(normalizeCardSettings({ nameSize: null }).nameSize, CARD_DEFAULTS.nameSize, 'a missing value falls back, never to the minimum');

// board px (a 1920x1080 board) drawn in cqh, so text keeps one size whatever the card or box does
assert.equal(boardPx(10.8), '1cqh');
assert.equal(boardPx(28), '2.5926cqh');
assert.equal(boardPx(0), '0cqh');

console.log('candidateCard: all checks passed');
