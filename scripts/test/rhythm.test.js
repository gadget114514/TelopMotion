'use strict';

// Phase 3: the phrase rhythm. A pattern library (worth one 4/4 bar each) is
// laid over the musical bars so the lyrics stop changing on one uniform grid.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const rhythm = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'rhythm.js'));

const BPM = 120; // one bar = 2 s
const AXES = { speed: 0.5, energy: 0.6, softness: 0.4, density: 0.5, brightness: 0.5, weird: 0.8 };

function traceOf(seed, span, axes) {
  const trace = [];
  rhythm.plan({ bpm: BPM, axes: axes || AXES, seed, spans: [span], trace });
  return trace;
}

test('the plan is deterministic for one seed', () => {
  const span = { id: 'c1', start: 0, end: 128, charCount: 30 };
  assert.deepEqual(rhythm.plan({ bpm: BPM, axes: AXES, seed: 99, spans: [span] }), rhythm.plan({ bpm: BPM, axes: AXES, seed: 99, spans: [span] }));
});

test('64 bars draw at least five different patterns', () => {
  const trace = traceOf(7, { id: 'c1', start: 0, end: 128, charCount: 30 });
  const patterns = new Set(trace.map((entry) => entry.pattern));
  assert.ok(patterns.size >= 5, `patterns ${[...patterns].join(', ')}`);
});

test('the same pattern never runs three times in a row', () => {
  for (const seed of [1, 2, 3, 5, 8, 13, 21, 34]) {
    const trace = traceOf(seed, { id: `c${seed}`, start: 0, end: 128, charCount: 24 });
    for (let i = 2; i < trace.length; i += 1) {
      const triple = [trace[i - 2].pattern, trace[i - 1].pattern, trace[i].pattern];
      assert.ok(!(triple[0] === triple[1] && triple[1] === triple[2]), `seed ${seed}: ${triple.join(' / ')}`);
    }
  }
});

test('every cut stays inside its span and short fragments are absorbed', () => {
  const spans = [
    { id: 'c1', start: 1.3, end: 9.1, charCount: 12 },
    { id: 'c2', start: 10, end: 40.5, charCount: 60 },
    { id: 'c3', start: 41, end: 41.5, charCount: 2 },
  ];
  const plan = rhythm.plan({ bpm: BPM, axes: AXES, seed: 4, spans });
  for (const span of spans) {
    const cuts = plan[span.id] || [];
    let previous = span.start;
    for (const cut of cuts) {
      assert.ok(cut > span.start + 1e-6 && cut < span.end - 1e-6, `${span.id}: cut ${cut} outside [${span.start}, ${span.end}]`);
      assert.ok(cut > previous, `${span.id}: cuts increase`);
      assert.ok(cut - previous >= rhythm.MIN_FRAGMENT - 1e-6, `${span.id}: piece ${cut - previous} too short`);
      previous = cut;
    }
    assert.ok(span.end - previous >= rhythm.MIN_FRAGMENT - 1e-6 || cuts.length === 0, `${span.id}: tail ${span.end - previous}`);
  }
});

test('a fast BPM still absorbs sub-0.35 s pieces', () => {
  const plan = rhythm.plan({ bpm: 300, axes: { ...AXES, weird: 1 }, seed: 11, spans: [{ id: 'fast', start: 0, end: 20, charCount: 40 }] });
  const cuts = plan.fast;
  let previous = 0;
  for (const cut of cuts) {
    assert.ok(cut - previous >= rhythm.MIN_FRAGMENT - 1e-6, `piece ${cut - previous}`);
    previous = cut;
  }
});

test('calm songs hold more than loud ones', () => {
  const calm = { speed: 0.3, energy: 0.1, softness: 0.8, density: 0.3, brightness: 0.4, weird: 0 };
  const loud = { speed: 0.9, energy: 1, softness: 0.2, density: 0.8, brightness: 0.6, weird: 0 };
  const count = (axes, seed) => traceOf(seed, { id: 'c', start: 0, end: 400, charCount: 12 }, axes).filter((entry) => entry.pattern === 'even' || entry.pattern === 'hold2').length;
  assert.ok(count(calm, 3) > count(loud, 3), 'calm uses more even / hold2');
});

test('the pattern library is worth whole bars', () => {
  for (const [name, beats] of Object.entries(rhythm.PATTERNS)) {
    const total = beats.reduce((sum, value) => sum + value, 0);
    const bars = total / 4;
    assert.ok(Math.abs(bars - Math.round(bars)) < 1e-9, `${name} is ${bars} bars`);
    assert.ok(bars === 1 || name === 'hold2', `${name} spans ${bars} bars`);
  }
});

test('a single span shorter than one bar gets no cuts', () => {
  const plan = rhythm.plan({ bpm: BPM, axes: AXES, seed: 2, spans: [{ id: 'tiny', start: 0, end: 1.2, charCount: 4 }] });
  assert.ok(plan.tiny.length <= 1);
  for (const cut of plan.tiny) assert.ok(cut < 1.2);
});

test('speed axis controls beat-division patterns, not energy', () => {
  const slow = { speed: 0.1, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5, weird: 0 };
  const fast = { speed: 0.9, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5, weird: 0 };
  const slowWeights = rhythm.weightsFor(slow, 20);
  const fastWeights = rhythm.weightsFor(fast, 20);
  // slow should prefer even / hold2, fast should prefer halves / stutter
  assert.ok(slowWeights.even > fastWeights.even, 'even weight decreases with speed');
  assert.ok(slowWeights.hold2 > fastWeights.hold2, 'hold2 weight decreases with speed');
  assert.ok(slowWeights.halves < fastWeights.halves, 'halves weight increases with speed');
  assert.ok(slowWeights.stutter < fastWeights.stutter, 'stutter weight increases with speed');
});

test('energy axis controls build/fall, not beat divisions', () => {
  const low = { speed: 0.5, energy: 0.1, softness: 0.5, density: 0.5, brightness: 0.5, weird: 0 };
  const high = { speed: 0.5, energy: 0.9, softness: 0.5, density: 0.5, brightness: 0.5, weird: 0 };
  const lowWeights = rhythm.weightsFor(low, 20);
  const highWeights = rhythm.weightsFor(high, 20);
  // even, halves, hold2, stutter should stay the same (speed is same)
  assert.ok(Math.abs(lowWeights.even - highWeights.even) < 1e-9, 'even weight unchanged with energy');
  assert.ok(Math.abs(lowWeights.halves - highWeights.halves) < 1e-9, 'halves weight unchanged with energy');
  assert.ok(Math.abs(lowWeights.hold2 - highWeights.hold2) < 1e-9, 'hold2 weight unchanged with energy');
  assert.ok(Math.abs(lowWeights.stutter - highWeights.stutter) < 1e-9, 'stutter weight unchanged with energy');
  // build and fall should change
  assert.ok(lowWeights.build < highWeights.build, 'build weight increases with energy');
  assert.ok(lowWeights.fall < highWeights.fall, 'fall weight increases with energy');
});
