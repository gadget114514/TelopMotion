'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const fx = require('../../renderer/js/lyrics/effects/registry.js');
require('../../renderer/js/lyrics/effects/animation.js');
require('../../renderer/js/lyrics/effects/layout.js');
require('../../renderer/js/lyrics/effects/enter.js');
require('../../renderer/js/lyrics/effects/exit.js');
require('../../renderer/js/lyrics/effects/hold.js');
require('../../renderer/js/lyrics/effects/warp.js');
const warp = require('../../renderer/js/lyrics/effects/warp.js');
const motion = require('../../renderer/js/lyrics/motion.js');

const FRAME = { width: 1920, height: 1080 };
const SIZE = 96;

function cpuOf(group, type) {
  const entry = fx.get(group, type);
  assert.ok(entry && entry.cpu, `${group}.${type} has a cpu`);
  return entry.cpu;
}

function holdInfo(extra) {
  return {
    i: 0,
    N: 5,
    frame: FRAME,
    shortSide: 1080,
    blockBBox: { x1: 0, y1: 0, x2: 400, y2: 100 },
    blockHalf: { x: 200, y: 50 },
    blockCenter: { x: 960, y: 540 },
    letterX: 900,
    letterY: 540,
    beatDuration: 4,
    audioFeatures: { bpm: 120 },
    ...(extra || {}),
  };
}

function blockAmount(state) {
  const entry = state.deform[0];
  return entry && entry.type === 'zoomBlock' ? entry.amount : 0;
}

test('the deformation table exposes the font-size and font-shape codes', () => {
  assert.equal(warp.DEFORM_CODES.stretch, 15);
  assert.equal(warp.DEFORM_CODES.skew, 16);
  assert.equal(warp.DEFORM_CODES.swirl, 17);
  assert.equal(warp.DEFORM_CODES.zoomBlock, 31);
  assert.equal(warp.deformSpace(31), 'block');
  assert.equal(warp.deformSpace(15), 'letter');
  assert.equal(warp.NAME_BY_CODE[31], 'zoomBlock');
  // the warp style dropdown keeps to the warp primitives
  assert.ok(!warp.BLOCK_STYLE_OPTIONS.includes('zoomBlock'));
});

test('hold.fontSize pulses the whole block between from and to', () => {
  const cpu = cpuOf('hold', 'fontSize');
  const params = { from: 1, to: 4, period: 1, mode: 'pulse', ease: 'linear', sync: 'free' };
  const atStart = { deform: [] };
  cpu(atStart, 0, 1, params, null, holdInfo());
  assert.equal(atStart.deform.length, 0, 'starts at its layout size');
  const atPeak = { deform: [] };
  cpu(atPeak, 0.5, 1, params, null, holdInfo());
  assert.ok(Math.abs(blockAmount(atPeak) - 3) < 1e-6, `peak amount ${blockAmount(atPeak)}`);
  const atEnd = { deform: [] };
  cpu(atEnd, 1, 1, params, null, holdInfo());
  assert.equal(atEnd.deform.length, 0, 'returns to its layout size');
});

test('hold.fontSize grow reaches the target and beat sync uses the audio bpm', () => {
  const cpu = cpuOf('hold', 'fontSize');
  const grown = { deform: [] };
  cpu(grown, 2, 1, { from: 1, to: 3, period: 1, mode: 'grow', ease: 'linear', sync: 'free' }, null, holdInfo());
  assert.ok(Math.abs(blockAmount(grown) - 2) < 1e-6, `grow amount ${blockAmount(grown)}`);
  const beat = { deform: [] };
  cpu(beat, 0.25, 1, { from: 1, to: 3, period: 100, mode: 'pulse', ease: 'linear', sync: 'beat' }, null, holdInfo());
  // 120 bpm = 2 Hz; at h = 0.25s the cosine wave is at its peak
  assert.ok(Math.abs(blockAmount(beat) - 2) < 1e-6, `beat amount ${blockAmount(beat)}`);
});

test('hold.fillScreen solves the factor that fills the frame', () => {
  const cpu = cpuOf('hold', 'fillScreen');
  const state = { deform: [] };
  // 400x100 block in 1920x1080 with fill 0.9 -> min(4.32, 9.72) = 4.32
  cpu(state, 4, 1, { fill: 0.9, max: 12, period: 4, mode: 'grow', ease: 'linear', sync: 'free' }, null, holdInfo());
  assert.ok(Math.abs(blockAmount(state) - 3.32) < 0.01, `fill amount ${blockAmount(state)}`);
  const capped = { deform: [] };
  cpu(capped, 4, 1, { fill: 1.2, max: 3, period: 4, mode: 'grow', ease: 'linear', sync: 'free' }, null, holdInfo());
  assert.ok(Math.abs(blockAmount(capped) - 2) < 0.01, `cap amount ${blockAmount(capped)}`);
  const noBox = { deform: [] };
  cpu(noBox, 4, 1, { fill: 1, max: 12, period: 4, mode: 'grow', ease: 'linear', sync: 'free' }, null, holdInfo({ blockBBox: null }));
  assert.equal(noBox.deform.length, 0, 'without a block bbox nothing happens');
});

test('enter.megaZoomIn and exit.megaZoomOut scale the block from/to a huge size', () => {
  const enter = cpuOf('enter', 'megaZoomIn');
  const start = { deform: [] };
  enter(start, 0, { from: 8, fade: true }, null, holdInfo());
  assert.ok(Math.abs(blockAmount(start) - 7) < 1e-6, `enter start ${blockAmount(start)}`);
  const settled = { deform: [] };
  enter(settled, 1, { from: 8 }, null, holdInfo());
  assert.equal(settled.deform.length, 0, 'settles at the layout size');
  const exit = cpuOf('exit', 'megaZoomOut');
  const leaving = { deform: [] };
  exit(leaving, 1, { to: 8, fade: true }, null, holdInfo());
  assert.ok(Math.abs(blockAmount(leaving) - 7) < 1e-6, `exit end ${blockAmount(leaving)}`);
});

test('hold.squashStretch and hold.swirl push their letter-space deformations', () => {
  const stretch = cpuOf('hold', 'squashStretch');
  const stretched = { deform: [] };
  stretch(stretched, 0.25, 1, { amount: 0.3, speed: 1, phase: 0 }, null, holdInfo());
  assert.equal(stretched.deform[0].type, 'stretch');
  assert.ok(Math.abs(stretched.deform[0].amount - 0.3) < 1e-6);
  const swirl = cpuOf('hold', 'swirl');
  const swirled = { deform: [] };
  swirl(swirled, 0.5, 1, { angle: 60, freq: 1, speed: 1 }, null, holdInfo());
  assert.equal(swirled.deform[0].type, 'swirl');
  assert.ok(Math.abs(swirled.deform[0].amount - 60) < 1e-6);
  assert.equal(swirled.deform[0].param, 1);
});

function makeScene(styles) {
  const text = 'ABCDE';
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

test('the motion evaluator hands the block centre and bbox to the size effects', () => {
  const scene = makeScene({
    hold: [{ type: 'fontSize', params: { from: 1, to: 4, period: 1, mode: 'grow', ease: 'linear', sync: 'free' }, motion: { in: { duration: 0.01 }, out: { duration: 0.01 } } }],
  });
  const beat = { id: 'c1:single0', cueId: 'c1', kind: 'single', start: 0, end: 10, text: scene.text };
  const result = motion.evaluateBeat(scene, 2, { frame: FRAME, seed: 42, beat });
  const state = result.letters[0];
  const peak = blockAmount(state);
  assert.ok(Math.abs(peak - 3) < 1e-6, `evaluated amount ${peak}`);
  assert.ok(state.warpOrigin, 'warpOrigin is set for block deformations');
  assert.ok(Math.abs(state.warpOrigin.x - (state.x - result.meta.anchor.x)) < 1e-6, 'origin is the offset from the block centre');
  assert.deepEqual(state.blockHalf, { x: (SIZE * 0.6 * 5) / 2, y: SIZE / 2 });
});

test('the shaders carry a branch comment for every new deformation code', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../../renderer/js/lyrics/gl/shaders.js'), 'utf8');
  const sandbox = { window: {} };
  sandbox.SA = sandbox.window.SA = {};
  vm.runInNewContext(source, sandbox);
  const vert = sandbox.SA.glShaders.TEXT_VERT;
  for (const name of ['stretch', 'skew', 'swirl', 'zoomBlock']) {
    assert.ok(vert.includes(name), `TEXT_VERT has no ${name} branch`);
  }
});
