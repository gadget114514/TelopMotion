'use strict';

// The weird axis is the figure's randomness level. Weird 1 draws every parameter
// from its full, evenly spread range; weird 0 draws none of them and returns
// the plain figure (no decoration, no per-element spread, fixed moves).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const figures = require(path.join(__dirname, '..', '..', 'renderer', 'js', 'lyrics', 'figures.js'));

const FRAME = { width: 1920, height: 1080 };
const SPAN = { start: 2, end: 14 };
const BEATS = [{ start: 2, end: 4 }, { start: 4, end: 6.5 }, { start: 6.5, end: 9 }, { start: 9, end: 12 }, { start: 12, end: 14 }];

function ctxAt(time) {
  return { time, frame: FRAME, clip: { key: 'fig_0', start: SPAN.start, end: SPAN.end }, seed: 7, colors: ['#ff4d6d', '#ffd166', '#06d6a0', '#118ab2'], beats: BEATS };
}

function tally(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return counts;
}

function assertEven(name, list, values, tolerance) {
  const counts = tally(values);
  const expected = values.length / list.length;
  for (const option of list) {
    const share = (counts.get(option) || 0) / expected;
    assert.ok(share > 1 - tolerance && share < 1 + tolerance, `${name}: ${option} drawn at ${share.toFixed(2)}x the even share`);
  }
}

test('weird 1 draws every discrete parameter of the first layer evenly', () => {
  const layers = [];
  for (let seed = 1; seed <= 8000; seed += 1) layers.push(figures.procGenome(seed * 31 + 5, 1)[0]);
  const lists = figures.PROC_LISTS;
  assertEven('layout', lists.layouts, layers.map((l) => l.layout), 0.4);
  assertEven('kind', lists.kinds, layers.map((l) => l.kinds[0]), 0.4);
  assertEven('warp', lists.warps, layers.map((l) => l.warp.type), 0.3);
  assertEven('role', lists.roles, layers.map((l) => l.role), 0.3);
  assertEven('sizeRule', lists.sizeRules, layers.map((l) => l.sizeRule), 0.3);
  assertEven('colorRule', lists.colorRules, layers.map((l) => l.colorRule), 0.3);
  assertEven('motion', lists.motions, layers.map((l) => l.motion), 0.4);
  assertEven('sizeDist', lists.sizeDists, layers.map((l) => l.sizeDist), 0.3);
  assertEven('align', lists.aligns, layers.map((l) => l.alignMode), 0.3);
  assertEven('outline', lists.outlines, layers.map((l) => l.outlineMode), 0.3);
  assertEven('symmetry', lists.symmetries, layers.map((l) => l.symmetry), 0.3);
});

test('weird 1 spreads the continuous parameters over their whole range', () => {
  const ranges = { stretch: [0.4, 5], spreadX: [0.12, 0.5], spreadY: [0.12, 0.5], offsetX: [-0.22, 0.22], offsetY: [-0.2, 0.2], aspect: [0.5, 2], amp: [0.15, 0.9], slope: [-0.6, 0.6] };
  const layers = [];
  for (let seed = 1; seed <= 4000; seed += 1) layers.push(figures.procGenome(seed * 17 + 3, 1)[0]);
  for (const [key, [lo, hi]] of Object.entries(ranges)) {
    const values = layers.map((l) => l[key]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    assert.ok(min >= lo - 1e-9 && max <= hi + 1e-9, `${key} leaves its range`);
    assert.ok(min < lo + (hi - lo) * 0.02 && max > hi - (hi - lo) * 0.02, `${key} does not reach its ends (${min}..${max})`);
  }
  // the spread parameters reach both the none end and the wild end
  for (const key of ['sizeSpread', 'weightSpread', 'alphaSpread', 'hueSpread', 'valSpread', 'decoOutline', 'decoDash', 'decoTrim', 'decoPattern', 'margin', 'jitter', 'tilt']) {
    const values = layers.map((l) => l[key]);
    assert.ok(Math.min(...values) < 0.2 * Math.max(...values), `${key} never stays low`);
    assert.ok(Math.max(...values) > 0, `${key} never fires`);
  }
  const counts = layers.map((l) => l.count);
  assert.ok(Math.min(...counts) <= 3 && Math.max(...counts) >= 60, `count range ${Math.min(...counts)}..${Math.max(...counts)}`);
});

test('weird 0 is the plain layer for every seed', () => {
  for (let seed = 1; seed <= 300; seed += 1) {
    const layers = figures.procGenome(seed * 13, 0);
    assert.equal(layers.length, 1);
    assert.deepEqual(layers[0], figures.PROC_PLAIN_LAYER);
  }
});

test('weird 0 draws a plain, undecorated figure with fixed moves', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 60; seed += 1) {
    const spec = figures.generate({ span: SPAN, motif: 'proc', seed, id: `plain_${seed}`, beats: BEATS, axes: { weird: 0, energy: 0.5 } });
    for (const beat of spec.params.beats) {
      assert.equal(beat.variant, 0);
      assert.equal(beat.accent, true);
      assert.equal(beat.size, 1);
      assert.equal(beat.tone, 0);
      seen.add(`${beat.move.in}/${beat.move.hold}/${beat.move.out}`);
    }
    for (const time of [3, 5, 8, 11]) {
      for (const shape of figures.drawList(spec, ctxAt(time)).shapes) {
        assert.equal(shape.kind, 'circle');
        for (const key of ['stroke', 'strokeColor', 'dash', 'trim', 'pattern', 'patternParams']) assert.equal(shape[key], undefined, `${key} on a plain figure`);
      }
    }
  }
  assert.equal(seen.size, 1, `plain moves vary: ${[...seen].join(' ')}`);
  // the classic motif choice is fixed as well
  const motifs = new Set();
  for (let seed = 1; seed <= 60; seed += 1) motifs.add(figures.generate({ span: SPAN, seed, id: `m_${seed}`, axes: { weird: 0, energy: 0.5 } }).params.motif);
  assert.equal(motifs.size, 1, `plain motif varies: ${[...motifs].join(' ')}`);
});

test('weird 1 uses every enter / hold / exit move evenly; the share of exotic moves rises with weird', () => {
  const draw = (weird) => {
    const out = { in: [], hold: [], out: [] };
    for (let seed = 1; seed <= 600; seed += 1) {
      const spec = figures.generate({ span: SPAN, seed, id: `mv_${seed}`, beats: BEATS, axes: { weird, energy: 0.5 } });
      for (const beat of spec.params.beats) {
        out.in.push(beat.move.in);
        out.hold.push(beat.move.hold);
        out.out.push(beat.move.out);
      }
    }
    return out;
  };
  const full = draw(1);
  assertEven('in', figures.INS, full.in, 0.35);
  assertEven('hold', figures.HOLDS, full.hold, 0.35);
  assertEven('out', figures.OUTS, full.out, 0.35);
  const exotic = (moves) => moves.in.filter((m) => m === 'draw' || m === 'scatterIn').length / moves.in.length;
  const low = exotic(draw(0.3));
  const mid = exotic(draw(0.6));
  const high = exotic(full);
  assert.ok(low < mid && mid < high, `exotic enter share ${low.toFixed(2)} / ${mid.toFixed(2)} / ${high.toFixed(2)}`);
  assert.ok(high > 0.4, `weird 1 exotic share ${high.toFixed(2)}`);
});

test('weird 1 reaches the whole motif library', () => {
  const motifs = new Set();
  for (let seed = 1; seed <= 400; seed += 1) motifs.add(figures.generate({ span: SPAN, seed, id: `all_${seed}`, axes: { weird: 1, energy: 0.5 } }).params.motif);
  assert.ok(motifs.has('proc'));
  assert.ok(motifs.size >= 12, `only ${motifs.size} motifs at weird 1`);
});
