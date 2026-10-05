'use strict';

// The range selector paints a band over the string and weights every letter by
// its position: the shapes, the sweep modes and the randomized order must be
// deterministic and symmetrical, the reveal must be the identity at the end of
// the beat, and tracking must move the outer letters while the centre stays put.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
const fx = require(path.join(FX_DIR, 'registry.js'));
for (const name of ['hold', 'enter', 'exit', 'selector']) require(path.join(FX_DIR, `${name}.js`));
const selector = require(path.join(FX_DIR, 'selector.js'));

function info(i, N, units) {
  return { i, N, letter: { size: 96 }, units: units || { letter: { rank: i, count: N } } };
}

const BASE = { selStart: 0, selEnd: 1, selAmount: 1 };

function freshState() {
  return { x: 0, y: 0, rot: 0, scaleX: 1, scaleY: 1, opacity: 1, blur: 0, flash: 0, colorMix: 0, skewX: 0, tiltX: 0, tiltY: 0 };
}

test('the square band covers the range it is given', () => {
  const sel = selector.normalizeSelector({ ...BASE, selStart: 0, selEnd: 0.5, selShape: 'square' });
  const weights = [0, 1, 2, 3].map((i) => selector.selectAt(info(i, 4), 0, sel, 0));
  assert.deepEqual(weights, [1, 1, 0, 0]);
});

test('the shapes ramp, peak and plateau like the reference', () => {
  const weights = (shape) => {
    const sel = selector.normalizeSelector({ ...BASE, selShape: shape });
    return [0, 1, 2, 3].map((i) => selector.selectAt(info(i, 4), 0, sel, 0));
  };
  const ramp = weights('rampUp');
  assert.ok(ramp[0] < ramp[1] && ramp[1] < ramp[2] && ramp[2] < ramp[3], `ramp up rises (${ramp})`);
  const down = weights('rampDown');
  assert.ok(down[0] > down[1] && down[1] > down[2] && down[2] > down[3], `ramp down falls (${down})`);
  const triangle = weights('triangle');
  assert.ok(Math.abs(triangle[0] - triangle[3]) < 1e-6, 'the triangle is symmetric');
  assert.ok(triangle[1] >= triangle[0] && triangle[1] >= triangle[3], 'and peaks in the middle');
  const round = weights('round');
  assert.ok(round[1] > round[0] && Math.abs(round[0] - round[3]) < 1e-6, 'round peaks in the middle too');
  const smooth = weights('smooth');
  for (const value of smooth) assert.ok(value >= 0 && value <= 1, `smooth stays in range (${value})`);
  const square = weights('square');
  assert.deepEqual(square, [1, 1, 1, 1], 'a full band covers every letter');
});

test('ease high / low harden the band edges', () => {
  const soft = selector.normalizeSelector({ ...BASE, selEnd: 0.5, selEaseHigh: 0, selEaseLow: 0 });
  const hard = selector.normalizeSelector({ ...BASE, selEnd: 0.5, selEaseHigh: 100, selEaseLow: 100 });
  assert.ok(selector.selectAt(info(4, 8), 0, soft, 0) <= selector.selectAt(info(4, 8), 0, hard, 0));
  const fraction = selector.selectAt(info(2, 5), 0, soft, 0);
  assert.ok(fraction > 0 && fraction < 1, `partial units fade in (${fraction})`);
});

test('the sweep modes move the band deterministically', () => {
  // a narrow band: start and end mark its centre, width its size
  const once = selector.normalizeSelector({ ...BASE, selStart: 0, selEnd: 0, selWidth: 0.25, selSweep: 'once' });
  const early = selector.selectAt(info(0, 8), 0, once, 0);
  const middle = selector.selectAt(info(3, 8), 0.5, once, 0);
  const late = selector.selectAt(info(7, 8), 1, once, 0);
  assert.ok(early > 0.5, `the band starts on the first letters (${early})`);
  assert.ok(middle > 0.5, `it passes through the middle (${middle})`);
  assert.ok(late > 0.5, `and ends on the last ones (${late})`);
  const loop = selector.normalizeSelector({ ...BASE, selStart: 0, selEnd: 0, selWidth: 0.25, selSweep: 'loop', selSpeed: 1 });
  const a = selector.selectAt(info(3, 8), 0, loop, 0.25);
  const b = selector.selectAt(info(3, 8), 0, loop, 0.25);
  assert.equal(a, b, 'loop is a pure function of time');
  const pingpong = selector.normalizeSelector({ ...BASE, selStart: 0, selEnd: 0, selWidth: 0.25, selSweep: 'pingpong', selSpeed: 1 });
  const outward = selector.selectAt(info(7, 8), 0, pingpong, 1);
  const back = selector.selectAt(info(7, 8), 0, pingpong, 1.5);
  assert.notEqual(outward, back, 'pingpong reverses');
  const beat = selector.normalizeSelector({ ...BASE, selStart: 0, selEnd: 0, selWidth: 0.25, selSweep: 'beat' });
  const slow = selector.selectAt(info(2, 8), 0, beat, 0.1);
  const fast = selector.selectAt(info(2, 8), 0, beat, 0.1 + 1 / selector.beatRate(info(2, 8)));
  assert.notEqual(slow, fast);
});

test('words and lines move as units', () => {
  const units = {
    letter: { rank: 3, count: 8 },
    word: { rank: 1, count: 2 },
    line: { rank: 0, count: 3 },
  };
  const wordSel = selector.normalizeSelector({ ...BASE, selBasedOn: 'word', selStart: 0.6, selEnd: 1 });
  const lineSel = selector.normalizeSelector({ ...BASE, selBasedOn: 'line', selStart: 0, selEnd: 0.2 });
  const letterSel = selector.normalizeSelector({ ...BASE, selBasedOn: 'letter', selStart: 0.6, selEnd: 1 });
  assert.ok(selector.selectAt(info(3, 8, units), 0, wordSel, 0) > 0.5, 'the second word is inside the band');
  assert.ok(selector.selectAt(info(3, 8, units), 0, lineSel, 0) > 0.5, 'the first line is inside the band');
  assert.ok(selector.selectAt(info(3, 8, units), 0, letterSel, 0) <= 0.5, 'the fourth letter is outside');
  // every letter of a word shares the word weight
  const wordInfo = info(2, 8, { letter: { rank: 2, count: 8 }, word: { rank: 1, count: 2 }, line: { rank: 0, count: 3 } });
  assert.equal(selector.selectAt(info(3, 8, units), 0, wordSel, 0), selector.selectAt(wordInfo, 0, wordSel, 0));
});

test('randomize is a seeded shuffle and never repeats a rank', () => {
  const sel = selector.normalizeSelector({ ...BASE, selRandom: true, selSeed: 0.25 });
  const ranks = [0, 1, 2, 3, 4].map((i) => selector.shuffledRank(0.25, i, 5));
  assert.deepEqual([...ranks].sort((a, b) => a - b), [0, 1, 2, 3, 4]);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => selector.shuffledRank(0.25, i, 5)), ranks, 'deterministic');
  const other = [0, 1, 2, 3, 4].map((i) => selector.shuffledRank(0.75, i, 5));
  assert.notDeepEqual(other, ranks, 'the seed shuffles differently');
  assert.equal(selector.unitPosition(info(3, 5), sel), ranks[3] / 4);
});

test('rangeReveal is the identity at the end of the beat and the offset at the start', () => {
  const cpu = fx.get('enter', 'rangeReveal').cpu;
  const params = { selStart: 0, selEnd: 1, opacity: 0, dy: 1, selShape: 'square' };
  const sceneInfo = (i) => info(i, 6);
  const stateAt = (p, i) => {
    const state = { x: 0, y: 0, rot: 0, scaleX: 1, scaleY: 1, opacity: 1, blur: 0, flash: 0, skewX: 0, tiltX: 0, tiltY: 0 };
    cpu(state, p, params, () => 0.5, sceneInfo(i));
    return state;
  };
  // at p = 1 every letter has landed (the band has swept past the whole string)
  for (let i = 0; i < 6; i += 1) {
    const state = stateAt(1, i);
    assert.ok(Math.abs(state.opacity - 1) < 1e-6, `letter ${i} landed`);
    assert.ok(Math.abs(state.y) < 1e-6, `letter ${i} is at its home position`);
  }
  // at p = 0 the whole string is still in the start state
  for (let i = 0; i < 6; i += 1) {
    const state = stateAt(0, i);
    assert.ok(Math.abs(state.opacity - 0) < 1e-6, `letter ${i} is hidden`);
    assert.ok(Math.abs(state.y - 96) < 1e-6, `letter ${i} is offset by one em`);
  }
  const exit = fx.get('exit', 'rangeReveal').cpu;
  const exitState = (p, i) => {
    const state = { x: 0, y: 0, rot: 0, scaleX: 1, scaleY: 1, opacity: 1, blur: 0, flash: 0, skewX: 0, tiltX: 0, tiltY: 0 };
    exit(state, p, params, () => 0.5, sceneInfo(i));
    return state;
  };
  assert.ok(Math.abs(exitState(0, 2).opacity - 1) < 1e-6, 'the exit starts from the landed state');
  assert.ok(Math.abs(exitState(1, 2).opacity - 0) < 1e-6, 'and ends hidden everywhere');
});

test('rangeReveal lands every shape at the end (revealSweep never froze half revealed)', () => {
  const enter = fx.get('enter', 'rangeReveal').cpu;
  const exit = fx.get('exit', 'rangeReveal').cpu;
  const fresh = () => ({ x: 0, y: 0, rot: 0, scaleX: 1, scaleY: 1, opacity: 1, blur: 0, flash: 0, skewX: 0, tiltX: 0, tiltY: 0 });
  for (const shape of selector.SHAPES) {
    // the revealSweep preset: a letter ramp with eases, opacity 0 and blur
    const params = { selBasedOn: 'letter', selShape: shape, opacity: 0, blur: 12, dy: 0.8, selEaseHigh: 70, selEaseLow: 20 };
    for (const N of [1, 2, 5]) {
      for (let i = 0; i < N; i += 1) {
        const landed = fresh();
        enter(landed, 1, params, () => 0.5, info(i, N));
        assert.ok(Math.abs(landed.opacity - 1) < 1e-6 && !(landed.blur > 1e-6), `${shape} ${i}/${N} lands`);
        const hidden = fresh();
        enter(hidden, 0, params, () => 0.5, info(i, N));
        assert.ok(hidden.opacity < 1e-6, `${shape} ${i}/${N} starts hidden`);
        const leaving = fresh();
        exit(leaving, 0, params, () => 0.5, info(i, N));
        assert.ok(Math.abs(leaving.opacity - 1) < 1e-6, `${shape} ${i}/${N} exit starts landed`);
        const gone = fresh();
        exit(gone, 1, params, () => 0.5, info(i, N));
        assert.ok(gone.opacity < 1e-6, `${shape} ${i}/${N} exit ends hidden`);
      }
    }
    // in between the sweep grades the string
    const middle = [0, 1, 2, 3, 4].map((i) => {
      const state = fresh();
      enter(state, 0.5, params, () => 0.5, info(i, 5));
      return state.opacity;
    });
    assert.ok(middle.some((value) => value > 0 && value < 1) || new Set(middle).size > 1, `${shape} sweeps (${middle})`);
  }
});

test('tracking spreads the outer letters and leaves the centre alone', () => {
  const enter = fx.get('enter', 'tracking').cpu;
  const at = (p, index, N) => {
    const state = { x: 0, y: 0, opacity: 1 };
    enter(state, p, { amount: 1, trackAxis: 'x' }, () => 0.5, {
      i: index,
      N,
      letter: { size: 100 },
      blockCenter: { x: 0, y: 0 },
      letterX: index * 100,
      letterY: 0,
    });
    return state.x;
  };
  assert.ok(at(0, 4, 9) > 300, 'the last letter starts far out');
  assert.equal(at(0, 0, 9), 0, 'the first letter sits on the centre');
  assert.equal(at(1, 4, 9), 0, 'and lands');
  const hold = fx.get('hold', 'tracking').cpu;
  const a = { x: 0, y: 0, opacity: 1 };
  hold(a, 0, 1, { amount: 1, mode: 'breathe', freq: 0.5, trackAxis: 'y' }, () => 0.5, { i: 2, N: 5, letter: { size: 100 }, blockCenter: { x: 0, y: 0 }, letterX: 200, letterY: 40 });
  assert.equal(a.x, 0, 'the vertical axis stays untouched');
  const b = { x: 0, y: 0, opacity: 1 };
  hold(b, 1 / 4, 1, { amount: 1, mode: 'breathe', freq: 0.5, trackAxis: 'y' }, () => 0.5, { i: 2, N: 5, letter: { size: 100 }, blockCenter: { x: 0, y: 0 }, letterX: 200, letterY: 40 });
  assert.ok(Math.abs(b.y) > 0, 'the hold tracking opens the lines');
});

test('stretch squashes a letter about the block centre and reports the growth', () => {
  const hold = fx.get('hold', 'stretch');
  const run = (params, letterX, letterY) => {
    const state = { x: letterX, y: letterY, rot: 0, scaleX: 1, scaleY: 1, opacity: 1 };
    const args = [{ i: 0, N: 3, letter: { size: 100 }, blockCenter: { x: 0, y: 0 }, letterX, letterY, shortSide: 1080 }];
    hold.cpu(state, 0.25, 1, params, () => 0.5, ...args);
    return state;
  };
  // `mode: hold` sits at the full amount, so the value is checkable by hand
  const wide = run({ amount: 0.5, stretchAxis: 'x', mode: 'hold' }, 200, 0);
  assert.ok(Math.abs(wide.scaleX - 1.5) < 1e-6, `scaleX ${wide.scaleX}`);
  assert.equal(wide.scaleY, 1, 'the other axis is untouched');
  assert.ok(Math.abs(wide.x - 300) < 1e-6, `the letter moves with it (${wide.x})`);
  const tall = run({ amount: 0.5, stretchAxis: 'y', mode: 'hold' }, 0, 200);
  assert.ok(Math.abs(tall.scaleY - 1.5) < 1e-6);
  assert.equal(tall.scaleX, 1);
  assert.ok(Math.abs(tall.y - 300) < 1e-6);
  const both = run({ amount: -0.5, stretchAxis: 'both', mode: 'hold' }, 200, 200);
  assert.ok(Math.abs(both.scaleX - 0.5) < 1e-6 && Math.abs(both.scaleY - 0.5) < 1e-6, 'a negative amount squashes');
  assert.ok(Math.abs(both.x - 100) < 1e-6 && Math.abs(both.y - 100) < 1e-6, 'and pulls the letters inward');
  // breathe stays between 1 and 1 + amount
  for (const t of [0, 0.1, 0.25, 0.4]) {
    const state = freshState();
    hold.cpu(state, t, 1, { amount: 0.4, stretchAxis: 'x', mode: 'breathe', freq: 1 }, () => 0.5, { i: 0, N: 3, letter: { size: 100 }, blockCenter: { x: 0, y: 0 }, letterX: 0, letterY: 0, shortSide: 1080 });
    assert.ok(state.scaleX >= 1 && state.scaleX <= 1.4 + 1e-9, `breathe stays in range (${state.scaleX})`);
  }
  // the enter / exit forms come back to rest
  const enter = fx.get('enter', 'stretch').cpu;
  // the state already sits at `letterX` (the engine has placed the letter), so
  // only the offset is applied here
  const at = (p) => {
    const state = freshState();
    state.x = 100;
    enter(state, p, { amount: 0.8, stretchAxis: 'x' }, () => 0.5, { blockCenter: { x: 0, y: 0 }, letterX: 100, letterY: 0 });
    return state;
  };
  const land = at(1);
  assert.ok(Math.abs(land.scaleX - 1) < 1e-6 && land.x === 100, `the entrance lands (${land.scaleX}, ${land.x})`);
  const start = at(0);
  assert.ok(Math.abs(start.scaleX - 1.8) < 1e-6 && Math.abs(start.x - 180) < 1e-6, `and starts stretched (${start.scaleX}, ${start.x})`);
  // the spread hook reports the same growth on the stretched axis only
  const spread = (params) => hold.spread(0, 1, params, { shortSide: 1080, audioFeatures: { bpm: 120 } });
  assert.deepEqual(spread({ amount: 0.5, stretchAxis: 'x', mode: 'hold' }), { x: 0.5, y: 0 });
  assert.deepEqual(spread({ amount: 0.5, stretchAxis: 'y', mode: 'hold' }), { x: 0, y: 0.5 });
  assert.deepEqual(spread({ amount: 0.5, stretchAxis: 'both', mode: 'hold' }), { x: 0.5, y: 0.5 });
  assert.deepEqual(spread({ amount: 0, mode: 'hold' }), { x: 0, y: 0 }, 'no amount spreads nothing');
  // tracking grew a spread hook too, on the axis it tracks
  const tracking = fx.get('hold', 'tracking');
  assert.deepEqual(tracking.spread(0, 1, { amount: 0.4, trackAxis: 'x', mode: 'hold' }, {}), { x: 0.4, y: 0 });
  assert.deepEqual(tracking.spread(0, 1, { amount: 0.4, trackAxis: 'y', mode: 'hold' }, {}), { x: 0, y: 0.4 });
  assert.deepEqual(tracking.spread(0, 0, { amount: 0.4, mode: 'hold' }, {}), { x: 0, y: 0 }, 'a closed envelope spreads nothing');
});

test('the hold selector applies the properties with the band weight only', () => {
  const cpu = fx.get('hold', 'rangeSelector').cpu;
  const run = (params, index, N) => {
    const state = { x: 0, y: 0, rot: 0, scaleX: 1, scaleY: 1, opacity: 1, blur: 0, flash: 0, colorMix: 0, skewX: 0, tiltX: 0, tiltY: 0 };
    cpu(state, 0, 1, params, () => 0.5, info(index, N));
    return state;
  };
  const inside = run({ selStart: 0, selEnd: 0.5, dy: 1, colorMix: 1, opacity: 0 }, 0, 4);
  const outside = run({ selStart: 0, selEnd: 0.5, dy: 1, colorMix: 1, opacity: 0 }, 3, 4);
  assert.equal(inside.opacity, 0, 'the selected letter fades');
  assert.equal(inside.colorMix, 1, 'and takes the accent colour');
  assert.equal(outside.opacity, 1, 'the unselected letter keeps its look');
  assert.equal(outside.colorMix, 0);
  assert.equal(run({ selStart: 0, selEnd: 1, selAmount: 0, dy: 1 }, 1, 4).y, 0, 'amount 0 is a no-op');
});
