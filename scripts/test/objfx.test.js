'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const fx = require('../../renderer/js/lyrics/effects/registry.js');
require('../../renderer/js/lyrics/effects/animation.js');
require('../../renderer/js/lyrics/effects/layout.js');
require('../../renderer/js/lyrics/effects/enter.js');
require('../../renderer/js/lyrics/effects/exit.js');
require('../../renderer/js/lyrics/effects/hold.js');
require('../../renderer/js/lyrics/effects/location.js');
require('../../renderer/js/lyrics/effects/objfx.js');
const core = require('../../renderer/js/lyrics/objfx-core.js');
const motion = require('../../renderer/js/lyrics/motion.js');

const FRAME = { width: 1920, height: 1080 };
const SIZE = 96;

function makeScene(text, style) {
  const letters = [];
  let pen = 0;
  for (let i = 0; i < text.length; i += 1) {
    const width = SIZE * 0.6;
    letters.push({
      path: `cue:c1/beat:c1:single0/line:0/word:${i}/letter:0`,
      cueId: 'c1', beatId: 'c1:single0', lineIdx: 0, wordIdx: i, letterIdx: 0, globalIdx: i, char: text[i],
      local: { x: pen, y: SIZE, w: width, h: SIZE, cx: pen + width / 2, cy: SIZE * 0.7, penX: pen, penY: SIZE },
      advance: width, size: SIZE,
    });
    pen += width;
  }
  return {
    cueId: 'c1', beatId: 'c1:single0', kind: 'single', start: 0, end: 10, text,
    style: style || {}, letters,
    blockBBox: { x1: 0, y1: 0, x2: pen, y2: SIZE }, size: SIZE, direction: 'horizontal',
  };
}

function evaluate(scene, t, extra) {
  const beat = { id: 'c1:single0', cueId: 'c1', kind: 'single', start: 0, end: 10, text: scene.text };
  return motion.evaluateBeat(scene, t, { frame: FRAME, seed: 42, beat, ...(extra || {}) });
}

function plainStyle(holds) {
  return {
    enter: { type: 'fade', params: {}, motion: { in: { duration: 0.01, delay: 0, ease: 'linear' } } },
    hold: holds || [],
  };
}

test('timeDelay and motionFlicker are registered as pro stackable holds', () => {
  for (const type of ['timeDelay', 'motionFlicker']) {
    const entry = fx.get('hold', type);
    assert.ok(entry, `${type} is registered`);
    assert.equal(entry.pack, 'pro');
    assert.equal(entry.stackable, true);
    assert.equal(typeof entry.motionFx, 'function');
    const idle = { x: 0, y: 0, rot: 0, scaleX: 1, scaleY: 1, opacity: 1, deform: [] };
    entry.cpu(idle, 0.5, 1, {}, () => 0.5, {});
    assert.deepEqual(idle, { x: 0, y: 0, rot: 0, scaleX: 1, scaleY: 1, opacity: 1, deform: [] });
  }
});

test('still beat: objfx changes nothing', () => {
  const holds = [
    { type: 'timeDelay', params: { lag: 0.3 } },
    { type: 'motionFlicker', params: { depth: 0.7 } },
  ];
  const delayed = evaluate(makeScene('ABCDE', plainStyle(holds)), 5).letters;
  const clean = evaluate(makeScene('ABCDE', plainStyle([])), 5).letters;
  for (let i = 0; i < delayed.length; i += 1) {
    for (const key of ['x', 'y', 'rot', 'scaleX', 'scaleY', 'opacity']) {
      assert.ok(Math.abs(delayed[i][key] - clean[i][key]) < 1e-9, `letter ${i} ${key} moved while still`);
    }
  }
});

test('lag = 0 and depth = 0 match the clean state', () => {
  const holds = [
    { type: 'timeDelay', params: { lag: 0 } },
    { type: 'motionFlicker', params: { depth: 0 } },
  ];
  const drifted = plainStyle([{ type: 'drift', params: { vx: 0.5, vy: 0 } }, ...holds]);
  const clean = plainStyle([{ type: 'drift', params: { vx: 0.5, vy: 0 } }]);
  const a = evaluate(makeScene('ABCDE', drifted), 3).letters;
  const b = evaluate(makeScene('ABCDE', clean), 3).letters;
  for (let i = 0; i < a.length; i += 1) {
    for (const key of ['x', 'y', 'rot', 'scaleX', 'scaleY', 'opacity']) {
      assert.ok(Math.abs(a[i][key] - b[i][key]) < 1e-9, `letter ${i} ${key} differs`);
    }
  }
});

test('timeDelay follows the past position on a constant drift', () => {
  const lag = 0.2;
  const style = plainStyle([
    { type: 'drift', params: { vx: 0.5, vy: 0 } },
    { type: 'timeDelay', params: { lag, unit: 'letter', select: 'all', props: 'pos' } },
  ]);
  const delayed = evaluate(makeScene('ABCDE', style), 3).letters;
  const earlier = evaluate(makeScene('ABCDE', plainStyle([{ type: 'drift', params: { vx: 0.5, vy: 0 } }])), 3 - lag).letters;
  for (let i = 0; i < delayed.length; i += 1) {
    assert.ok(Math.abs(delayed[i].x - earlier[i].x) < 1e-6, `letter ${i} x ${delayed[i].x} vs past ${earlier[i].x}`);
    assert.ok(Math.abs(delayed[i].y - earlier[i].y) < 1e-6, `letter ${i} y drifted`);
  }
});

test('timeDelay oddEven delays only the picked letters', () => {
  const style = plainStyle([
    { type: 'drift', params: { vx: 0.5, vy: 0 } },
    { type: 'timeDelay', params: { lag: 0.2, select: 'oddEven', oddEven: 'odd' } },
  ]);
  const delayed = evaluate(makeScene('ABCDE', style), 3).letters;
  const clean = evaluate(makeScene('ABCDE', plainStyle([{ type: 'drift', params: { vx: 0.5, vy: 0 } }])), 3).letters;
  for (let i = 0; i < delayed.length; i += 1) {
    if (i % 2 === 1) assert.ok(delayed[i].x < clean[i].x, `odd letter ${i} is delayed`);
    else assert.ok(Math.abs(delayed[i].x - clean[i].x) < 1e-9, `even letter ${i} is untouched`);
  }
});

test('motionFlicker respects the opacity floor while moving', () => {
  const style = plainStyle([
    { type: 'drift', params: { vx: 0.8, vy: 0 } },
    { type: 'motionFlicker', params: { depth: 0.7, minOpacity: 0.2, rate: 12, wave: 'random' } },
  ]);
  const base = evaluate(makeScene('ABCDE', plainStyle([{ type: 'drift', params: { vx: 0.8, vy: 0 } }])), 3).letters;
  const flick = evaluate(makeScene('ABCDE', style), 3).letters;
  for (let i = 0; i < flick.length; i += 1) {
    assert.ok(flick[i].opacity <= base[i].opacity + 1e-9, `letter ${i} flicker brightens`);
    assert.ok(flick[i].opacity + 1e-9 >= 0.2 * base[i].opacity, `letter ${i} flicker below the floor`);
  }
});

test('objfx:false matches the clean evaluation', () => {
  const style = plainStyle([
    { type: 'drift', params: { vx: 0.5, vy: 0 } },
    { type: 'timeDelay', params: { lag: 0.3 } },
    { type: 'motionFlicker', params: { depth: 0.9 } },
  ]);
  const scene = makeScene('ABCDE', style);
  const skipped = evaluate(scene, 3, { objfx: false }).letters;
  const clean = evaluate(makeScene('ABCDE', plainStyle([{ type: 'drift', params: { vx: 0.5, vy: 0 } }])), 3).letters;
  for (let i = 0; i < skipped.length; i += 1) {
    for (const key of ['x', 'y', 'rot', 'scaleX', 'scaleY', 'opacity']) {
      assert.ok(Math.abs(skipped[i][key] - clean[i][key]) < 1e-9, `letter ${i} ${key} differs with objfx:false`);
    }
  }
});

test('core: motionAmount rises with speed and releases after a stop', () => {
  const speed = 2; // shortSide units per second
  const src = (i, t) => ({ x: speed * 1000 * t, y: 0, rot: 0, scaleX: 1, scaleY: 1 });
  const cfg = { v0: 0.02, v1: 0.6, sensitivity: 1, release: 0.3, maxT: 10 };
  assert.ok(core.motionAmount(src, 0, 1, cfg, 1000) > 0.99, 'full speed saturates');
  assert.equal(core.motionAmount(src, 0, 1, { ...cfg, release: 0 }, 1000), core.motionAmount(src, 0, 1, cfg, 1000));
  const still = () => ({ x: 0, y: 0, rot: 0, scaleX: 1, scaleY: 1 });
  assert.equal(core.motionAmount(still, 0, 1, cfg, 1000), 0);
});

test('core: selectWeight covers every mode', () => {
  const helpers = { unitRank: (i) => ({ rank: i, count: 4 }), hash01: (i) => (i === 0 ? 0.1 : 0.9), inScope: () => true };
  assert.equal(core.selectWeight('all', {}, 0, 4, helpers), 1);
  assert.equal(core.selectWeight('every', { n: 2, offset: 0 }, 2, 4, helpers), 1);
  assert.equal(core.selectWeight('every', { n: 2, offset: 0 }, 1, 4, helpers), 0);
  assert.equal(core.selectWeight('oddEven', { oddEven: 'odd' }, 1, 4, helpers), 1);
  assert.equal(core.selectWeight('rank', { units: 'letter', from: 0, to: 0.5 }, 0, 4, helpers), 1);
  assert.equal(core.selectWeight('rank', { units: 'letter', from: 0, to: 0.5 }, 3, 4, helpers), 0);
  assert.equal(core.selectWeight('random', { fraction: 0.5 }, 0, 4, helpers), 1);
  assert.equal(core.selectWeight('random', { fraction: 0.5 }, 1, 4, helpers), 0);
});
