'use strict';

// The proc figure motif has to feel different on every Generate press: among a
// handful of consecutive draws no two may share the same coarse impression
// (kind mix, density, size, coverage, structure, colour, motion).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { measureGestalt } = require(path.join(__dirname, '..', 'proc-variety.js'));

test('ten consecutive proc draws rarely contain a look-alike pair', () => {
  const result = measureGestalt(1500, 10);
  // the coarse gestalt label is a noisy yardstick (150 batches, ~2% standard error)
  assert.ok(result.batchHit < 0.1, `look-alike in ${(result.batchHit * 100).toFixed(1)}% of 10-draw batches`);
  assert.ok(result.distinct > 1500 * 0.5, `only ${result.distinct} distinct impressions in ${result.count} draws`);
  assert.ok(result.topShare < 0.02, `one impression covers ${(result.topShare * 100).toFixed(1)}% of the draws`);
});
