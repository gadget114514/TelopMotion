'use strict';

// The soft body integration in motion.js: the physics letters get a lattice,
// the letters without a physics entry keep the legacy output, the staggered
// fall releases the letters one after another and `floor: 'none'` keeps the
// exact legacy gravityFall formula.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
const fx = require(path.join(FX_DIR, 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'warp', 'animator', 'selector', 'camera', 'shape-layer', 'softbody']) {
  require(path.join(FX_DIR, `${name}.js`));
}
const motion = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'motion.js'));
const easing = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'easing.js'));
const presets = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'presets.js'));

const FRAME = { width: 1920, height: 1080 };
const SIZE = 96;

function makeScene(text, styles) {
  const letters = [];
  let pen = 0;
  for (let i = 0; i < text.length; i += 1) {
    const width = SIZE * 0.6;
    letters.push({
      path: `cue:c1/beat:c1:single0/line:0/word:${i}/letter:0`,
      cueId: 'c1',
      beatId: 'c1:single0',
      lineIdx: 0,
      wordIdx: i,
      letterIdx: 0,
      globalIdx: i,
      char: text[i],
      local: { x: pen, y: SIZE, w: width, h: SIZE, cx: pen + width / 2, cy: SIZE * 0.7, penX: pen, penY: SIZE },
      bbox: { x1: 0, y1: -SIZE, x2: width, y2: 0 },
      outlineLength: 400 + i * 10,
    });
    pen += width;
  }
  return {
    cueId: 'c1',
    beatId: 'c1:single0',
    kind: 'single',
    start: 0,
    end: 10,
    text,
    style: styles || {},
    letters,
    blockBBox: { x1: 0, y1: 0, x2: pen, y2: SIZE },
    size: SIZE,
    direction: 'horizontal',
  };
}

function evaluate(scene, t, extra) {
  const beat = { id: 'c1:single0', cueId: 'c1', kind: 'single', start: 0, end: 10, text: scene.text };
  return motion.evaluateBeat(scene, t, { frame: FRAME, seed: 42, beat, ...(extra || {}) });
}

test('a soft body hold writes the lattice and the active flag', () => {
  const scene = makeScene('AB', {
    animation: { type: 'simultaneous' },
    hold: [{ type: 'softBody', params: { drive: 'pressure', strength: 0.25, freq: 1, stiffness: 0.8 } }],
  });
  const start = evaluate(scene, 0);
  for (const state of start.letters) {
    assert.ok(state.softLattice instanceof Float32Array, 'missing lattice');
    assert.equal(state.softLattice.length, 50);
    assert.equal(state.physActive, false, 'nothing should have moved yet');
    for (const value of state.softLattice) assert.equal(value, 0);
  }
  const later = evaluate(scene, 1);
  let moved = 0;
  for (const state of later.letters) {
    assert.ok(state.physActive, 'the lattice should be active after a second');
    moved = Math.max(moved, ...Array.from(state.softLattice, Math.abs));
    for (const value of state.softLattice) assert.ok(Number.isFinite(value));
  }
  assert.ok(moved > 1e-3, `the lattice barely moved (${moved})`);
});

test('a disabled soft body leaves the legacy output untouched', () => {
  const plain = makeScene('AB', { animation: { type: 'simultaneous' }, hold: [{ type: 'none' }] });
  const disabled = makeScene('AB', {
    animation: { type: 'simultaneous' },
    hold: [{ type: 'softBody', enabled: false, params: { drive: 'pressure' } }],
  });
  for (const time of [0, 0.5, 2]) {
    const a = evaluate(plain, time);
    const b = evaluate(disabled, time);
    assert.equal(b.letters[0].x, a.letters[0].x);
    assert.equal(b.letters[0].y, a.letters[0].y);
    assert.equal(b.letters[0].softLattice, undefined);
  }
  // a physics letter starts exactly at the rigid position at t = 0
  const active = makeScene('AB', { animation: { type: 'simultaneous' }, hold: [{ type: 'softBody' }] });
  assert.equal(evaluate(active, 0).letters[0].y, evaluate(plain, 0).letters[0].y);
});

test('fallInOrder releases the letters one after another', () => {
  const staged = presets.get('fallInOrder');
  assert.ok(staged, 'the fallInOrder look is missing');
  const scene = makeScene('ABCDE', staged.style);
  // letter 0 starts falling at 8.7, letter 1 at 8.8, letter 2 at 8.9 ...
  const result = evaluate(scene, 8.85);
  const ys = result.letters.map((state) => state.y);
  assert.ok(ys[0] > ys[1] + 1, `letter 0 must fall before letter 1 (${ys[0]} vs ${ys[1]})`);
  assert.ok(ys[1] > ys[2] + 0.1, `letter 1 must fall before letter 2 (${ys[1]} vs ${ys[2]})`);
  assert.equal(ys[4], ys[2], 'the last letter has not been released yet');
  for (const state of result.letters) {
    for (const value of state.softLattice || []) assert.ok(Number.isFinite(value));
  }
});

test('gravityFall with floor none keeps the legacy eased formula', () => {
  const gravity = makeScene('A', {
    animation: { type: 'simultaneous' },
    exit: { type: 'gravityFall', params: { gravity: 2.4, spin: 0, floor: 'none' } },
  });
  const fade = makeScene('A', { animation: { type: 'simultaneous' }, exit: { type: 'fade' } });
  const time = 9.95;
  const fallen = evaluate(gravity, time).letters[0];
  const plain = evaluate(fade, time).letters[0];
  assert.equal(fallen.px, plain.px);
  const k = easing.get('easeInCubic')(fallen.px);
  const expected = 2.4 * k * k * Math.min(FRAME.width, FRAME.height) * 0.5;
  assert.ok(Math.abs(fallen.y - plain.y - expected) < 1e-6, `y delta ${fallen.y - plain.y} vs ${expected}`);
  assert.equal(fallen.softLattice, undefined, 'floor none must not engage the physics');
});

test('gravityFall with floor ground drops further than the eased formula', () => {
  const scene = makeScene('A', {
    animation: { type: 'simultaneous' },
    exit: { type: 'gravityFall', params: { gravity: 2.4, spin: 0, floor: 'ground' }, motion: { out: { duration: 0.5, delay: 0, ease: 'linear' } } },
  });
  const result = evaluate(scene, 10);
  assert.ok(result.letters[0].softLattice instanceof Float32Array);
  assert.ok(result.letters[0].y > 540, `the letter should have fallen (${result.letters[0].y})`);
});

test('the lattice is packed into the state texture rows', () => {
  const warp = require(path.join(FX_DIR, 'warp.js'));
  global.SA = { warp };
  global.window = { SA: global.SA };
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'passes.js'));
  const passes = global.window.SA.glPasses || global.SA.glPasses;
  const rows = passes._test.STATE_ROWS;
  assert.equal(rows, 27);
  const data = new Float32Array(rows * 4);
  const lattice = new Float32Array(50);
  for (let i = 0; i < lattice.length; i += 1) lattice[i] = 0.25;
  passes._test.packStateRows([{ x: 1, y: 2, softLattice: lattice }], data, 1);
  assert.equal(data[9 * 4], 0.25);
  assert.equal(data[9 * 4 + 3], 0.25);
  assert.equal(data[21 * 4], 0.25, 'the 25th point lives in row 21');
  assert.equal(data[22 * 4], 1, 'the lattice-on flag');
  const empty = new Float32Array(rows * 4);
  passes._test.packStateRows([{ x: 0, y: 0 }], empty, 1);
  assert.equal(empty[9 * 4], 0, 'a letter without a lattice clears the rows');
  assert.equal(empty[22 * 4], 0);
});
