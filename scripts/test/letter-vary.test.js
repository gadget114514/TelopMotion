'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const letterVary = require('../../renderer/js/lyrics/effects/letter-vary.js');

test('alternate returns -1 and 1 in turn', () => {
  assert.equal(letterVary.value('alternate', 0, 4), -1);
  assert.equal(letterVary.value('alternate', 1, 4), 1);
  assert.equal(letterVary.value('alternate', 2, 4), -1);
  assert.equal(letterVary.value('alternate', 3, 4), 1);
});

test('ramp spans -1 to 1 at the ends', () => {
  assert.equal(letterVary.value('ramp', 0, 5), -1);
  assert.equal(letterVary.value('ramp', 4, 5), 1);
  assert.ok(Math.abs(letterVary.value('ramp', 2, 5)) < 1e-9);
  assert.equal(letterVary.value('ramp', 0, 1), 0);
});

test('wave stays in range', () => {
  for (let i = 0; i < 8; i += 1) {
    const k = letterVary.value('wave', i, 8);
    assert.ok(k >= -1 && k <= 1, `wave[${i}] = ${k}`);
  }
});

test('none and unknown modes return 0', () => {
  assert.equal(letterVary.value('none', 2, 5), 0);
  assert.equal(letterVary.value('cycle', 2, 5), 0);
  assert.equal(letterVary.value('bogus', 2, 5), 0);
});

test('random is deterministic for one rng stream', () => {
  const mulberry = (seed) => {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const first = [0, 1, 2].map((i) => letterVary.value('random', i, 3, mulberry(99)));
  const second = [0, 1, 2].map((i) => letterVary.value('random', i, 3, mulberry(99)));
  assert.deepEqual(first, second);
  for (const k of first) assert.ok(k >= -1 && k <= 1);
});

test('lerpRange maps -1 to min and 1 to max', () => {
  assert.equal(letterVary.lerpRange([2, 8], -1), 2);
  assert.equal(letterVary.lerpRange([2, 8], 1), 8);
  assert.equal(letterVary.lerpRange([2, 8], 0), 5);
  assert.equal(letterVary.lerpRange(null, 1), 0);
});

test('pickList cycles by index and scales by k', () => {
  const list = ['a', 'b', 'c'];
  assert.equal(letterVary.pickList(list, 'alternate', 3, 0), 'a');
  assert.equal(letterVary.pickList(list, 'cycle', 4, 0), 'b');
  assert.equal(letterVary.pickList(list, 'none', 7, 0), 'b');
  assert.equal(letterVary.pickList(list, 'random', 0, -1), 'a');
  assert.equal(letterVary.pickList(list, 'wave', 0, 1), 'c');
  assert.equal(letterVary.pickList(list, 'ramp', 0, 0), 'b');
  assert.equal(letterVary.pickList([], 'alternate', 0, 0), null);
  assert.equal(letterVary.pickList(null, 'alternate', 0, 0), null);
});

test('planLetterVariants resolves every axis', () => {
  const plan = letterVary.planLetterVariants(3, {
    vary: 'alternate',
    dx: [-1, 1],
    dy: [0, 2],
    opacity: [0.2, 1],
    skew: [-10, 10],
    rotate: [0, 90],
    colors: ['#ff0000', '#00ff00'],
    fonts: ['a', 'b', 'c'],
  });
  assert.equal(plan.length, 3);
  assert.deepEqual(plan.map((entry) => entry.k), [-1, 1, -1]);
  assert.deepEqual(plan.map((entry) => entry.dx), [-1, 1, -1]);
  assert.deepEqual(plan.map((entry) => entry.color), ['#ff0000', '#00ff00', '#ff0000']);
  assert.deepEqual(plan.map((entry) => entry.font), ['a', 'b', 'c']);
  assert.equal(plan[1].opacity, 1);
  assert.equal(plan[0].opacity, 0.2);
});
