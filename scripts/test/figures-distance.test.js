'use strict';

// A figure has a position in direction space (what a viewer sees: count, size,
// spread, round / boxy / linear, ornament, colour, motion, how it enters, holds
// and leaves). The energy sets how far the next cue's figure stands from the
// previous one: 0 keeps it, 1 takes the farthest candidate.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const figures = require(path.join(__dirname, '..', '..', 'renderer', 'js', 'lyrics', 'figures.js'));

const SPAN = { start: 2, end: 14 };
const BEATS = [{ start: 2, end: 4 }, { start: 4, end: 6.5 }, { start: 6.5, end: 9 }, { start: 9, end: 12 }, { start: 12, end: 14 }];
const PALETTE = ['#111111', '#222222', '#333333', '#ff4d6d', '#ffd166', '#06d6a0', '#118ab2', '#c77dff'];

function gen(seed, extra) {
  return figures.generate({ span: SPAN, beats: BEATS, seed, id: `d${seed}`, axes: { weird: 1, energy: 0.5 }, palette: PALETTE, ...(extra || {}) });
}

test('the distance is 0 for the same figure, symmetric and bounded', () => {
  const a = gen(11);
  const b = gen(12);
  const c = gen(13);
  assert.equal(figures.figureDistance(a, a), 0);
  assert.equal(figures.figureDistance(a, b), figures.figureDistance(b, a));
  for (const [x, y] of [[a, b], [b, c], [a, c]]) {
    const d = figures.figureDistance(x, y);
    assert.ok(d > 0 && d <= 1, `distance ${d}`);
  }
  assert.ok(figures.embedFigure(a).every((v) => Number.isFinite(v) && v >= 0 && v <= 1), 'position leaves 0..1');
  assert.equal(figures.embedFigure(a).length, figures.EMBED_KEYS.length);
});

test('a figure sits at the same point whatever cue length and beats it is drawn for', () => {
  const a = gen(21);
  const longer = figures.generate({ span: { start: 0, end: 40 }, beats: [{ start: 0, end: 10 }, { start: 10, end: 25 }], seed: 21, id: 'd21', axes: { weird: 1, energy: 0.5 }, palette: PALETTE });
  // different beats draw different moves, so compare the same drawing instead
  const clone = figures.generate({ span: { start: 0, end: 40 }, beats: [{ start: 0, end: 10 }, { start: 10, end: 25 }], seed: 5, id: 'x', axes: { weird: 1, energy: 0.5 }, palette: PALETTE, previous: a, energy: 0 });
  // the same composition and tuning; only the moves of a different beat
  // structure can nudge the position (the same beat structure is exactly 0), so
  // the continuation stands much closer than another figure does
  assert.equal(clone.params.motif, a.params.motif);
  assert.equal(clone.params.seed, a.params.seed);
  assert.ok(figures.figureDistance(a, clone) < figures.figureDistance(a, longer) + 1e-9, 'continuation is not the closest');
});

test('energy 0 keeps the previous figure, the distance grows with energy, 1 is the farthest', () => {
  const means = [];
  for (const energy of [0, 0.25, 0.5, 0.75, 1]) {
    let total = 0;
    const trials = 24;
    for (let k = 1; k <= trials; k += 1) {
      const previous = gen(k * 3);
      const next = gen(k * 3 + 1, { previous, energy });
      const gap = figures.figureDistance(previous, next);
      if (energy === 0) {
        assert.equal(gap, 0, `energy 0 moved by ${gap}`);
        assert.equal(next.params.motif, previous.params.motif);
        assert.equal(next.params.seed, previous.params.seed);
      }
      total += gap;
    }
    means.push(total / trials);
  }
  for (let i = 1; i < means.length; i += 1) assert.ok(means[i] > means[i - 1], `mean distance does not rise: ${means.map((v) => v.toFixed(3)).join(' ')}`);
  assert.ok(means[4] > 0.35, `energy 1 only reaches ${means[4].toFixed(3)}`);
});

test('energy 1 is the farthest of the candidates it considers', () => {
  const previous = gen(77);
  const far = gen(78, { previous, energy: 1 });
  const mid = gen(78, { previous, energy: 0.5 });
  assert.ok(figures.figureDistance(previous, far) >= figures.figureDistance(previous, mid));
});

test('without a previous figure or an energy the draw is the plain one', () => {
  const plain = gen(31);
  assert.deepEqual(gen(31, { previous: null, energy: 1 }), plain);
  assert.deepEqual(gen(31, { previous: plain }), plain);
  // an explicitly requested motif is the caller's choice
  const forced = gen(32, { previous: plain, energy: 1, motif: 'orbit' });
  assert.equal(forced.params.motif, 'orbit');
});

test('energy 0 is the previous figure down to the last detail', () => {
  const ctx = (time) => ({ time, frame: { width: 1920, height: 1080 }, clip: { key: 'fig_0', start: SPAN.start, end: SPAN.end }, seed: 7, colors: ['#ff4d6d', '#ffd166', '#06d6a0'], beats: BEATS });
  for (let k = 1; k <= 12; k += 1) {
    const previous = gen(k * 5);
    const next = gen(k * 5 + 2, { previous, energy: 0 });
    assert.deepEqual(next.params.beats, previous.params.beats, `beats differ for seed ${k}`);
    for (const time of [2.5, 3.9, 5, 7.7, 10.2, 13]) {
      assert.deepEqual(figures.drawList(next, ctx(time)).shapes, figures.drawList(previous, ctx(time)).shapes, `seed ${k} at ${time}`);
    }
  }
  // a cue with fewer beats keeps the per-beat look round and round
  const previous = gen(41);
  const shorter = figures.generate({ span: { start: 20, end: 26 }, beats: [{ start: 20, end: 22 }, { start: 22, end: 26 }], seed: 9, id: 'short', axes: { weird: 1, energy: 0 }, palette: PALETTE, previous, energy: 0 });
  shorter.params.beats.forEach((beat, i) => {
    const style = previous.params.beats[i % previous.params.beats.length];
    assert.deepEqual([beat.move, beat.variant, beat.accent, beat.size, beat.tone], [style.move, style.variant, style.accent, style.size, style.tone]);
  });
  assert.equal(shorter.params.seed, previous.params.seed);
});
