'use strict';

const test = require('node:test');
const assert = require('node:assert');

const rng = require('../../renderer/js/lyrics/rng');

test('mulberry32 is deterministic for the same seed', () => {
  const a = rng.mulberry32(42);
  const b = rng.mulberry32(42);
  for (let i = 0; i < 16; i += 1) assert.strictEqual(a(), b());
});

test('mulberry32 output stays in [0, 1)', () => {
  const random = rng.mulberry32(7);
  for (let i = 0; i < 1000; i += 1) {
    const value = random();
    assert.ok(value >= 0 && value < 1);
  }
});

test('rngFor is stable and independent per path', () => {
  const pathA = [7, 'cue', 'c1', 'letter', 1, 'enter'];
  const pathB = [7, 'cue', 'c1', 'letter', 2, 'enter'];
  const first = rng.rngFor(...pathA);
  const second = rng.rngFor(...pathB);
  const repeat = rng.rngFor(...pathA);
  for (let i = 0; i < 8; i += 1) assert.strictEqual(first(), repeat());
  const a = [rng.rngFor(...pathA)(), rng.rngFor(...pathA)()];
  const b = [rng.rngFor(...pathB)(), rng.rngFor(...pathB)()];
  assert.notDeepStrictEqual(a, b);
});

test('hash32 changes when any part changes', () => {
  assert.notStrictEqual(rng.hash32('a', 'b'), rng.hash32('a', 'c'));
  assert.strictEqual(rng.hash32('a', 'b'), rng.hash32('a', 'b'));
});

test('range, pick and gauss behave', () => {
  const random = rng.mulberry32(99);
  for (let i = 0; i < 200; i += 1) {
    const value = rng.range(random, 2, 5);
    assert.ok(value >= 2 && value <= 5);
  }
  const list = ['x', 'y', 'z'];
  for (let i = 0; i < 50; i += 1) assert.ok(list.includes(rng.pick(random, list)));
  for (let i = 0; i < 50; i += 1) assert.ok(Number.isFinite(rng.gauss(random)));
  assert.strictEqual(rng.pick(random, []), undefined);
});
