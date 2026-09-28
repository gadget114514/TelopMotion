'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

const fx = require('../../renderer/js/lyrics/effects/registry.js');
require('../../renderer/js/lyrics/effects/fill.js');
require('../../renderer/js/lyrics/effects/edge.js');
require('../../renderer/js/lyrics/effects/text-bg.js');
const textBg = require('../../renderer/js/lyrics/effects/text-bg.js');

const SHAPE_ORDER = [
  'none', 'square', 'rounded', 'circle', 'diamond', 'ring', 'bar', 'star', 'blob',
  'heart', 'splatter', 'scratch', 'drop', 'bracket', 'paper', 'cloud',
];

function entry(overrides) {
  return {
    letter: { char: 'a', path: 'l0', lineIdx: 0, wordIdx: 0 },
    state: {
      opacity: 1,
      px: 0,
      timing: { enterStart: 1, enterDur: 0.5, exitStart: 5, exitDur: 0.5 },
      ...(overrides || {}),
    },
  };
}

test('shape indices match the shader constants', () => {
  assert.deepEqual(Object.keys(textBg.SHAPES), SHAPE_ORDER);
  SHAPE_ORDER.forEach((name, index) => assert.equal(textBg.SHAPES[name], index, name));
});

test('bgShape defaults to none and bgMotion to follow', () => {
  assert.equal(fx.defaultsFor('bgShape').type, 'none');
  assert.equal(fx.defaultsFor('bgMotion').type, 'follow');
  assert.equal(fx.defaultsFor('bgFill').type, 'solid');
  assert.equal(fx.defaultsFor('bgEdge'), null);
});

test('bgFill and bgEdge are aliases of fill and edge', () => {
  const fillTypes = fx.list('fill').map((entry) => entry.type).sort();
  const bgFillTypes = fx.list('bgFill').map((entry) => entry.type).sort();
  assert.deepEqual(bgFillTypes, fillTypes);
  const edgeTypes = fx.list('edge').map((entry) => entry.type).sort();
  const bgEdgeTypes = fx.list('bgEdge').map((entry) => entry.type).sort();
  assert.deepEqual(bgEdgeTypes, edgeTypes);
  const entry = fx.get('bgFill', 'solid');
  assert.equal(entry.group, 'bgFill');
  assert.ok(entry.params.length === 0);
});

test('evaluateBg handles the lead boundary', () => {
  const shape = { type: 'square', params: { unit: 'cell', width: 1, height: 1, opacity: 1 } };
  const motion = { type: 'fade', params: { lead: 0.2, duration: 0.4 } };
  // before the entry window
  const early = textBg.evaluateBg(shape, motion, [entry()], null, null, 0.5, { seed: 1 });
  assert.ok(early.states[0].opacity < 0.05, `early ${early.states[0].opacity}`);
  // after the entry window
  const late = textBg.evaluateBg(shape, motion, [entry()], null, null, 1.4, { seed: 1 });
  assert.ok(late.states[0].opacity > 0.95, `late ${late.states[0].opacity}`);
});

test('a negative lead delays the background', () => {
  const shape = { type: 'square', params: { unit: 'cell', width: 1, height: 1 } };
  const motion = { type: 'fade', params: { lead: -0.3, duration: 0.2 } };
  const atEnter = textBg.evaluateBg(shape, motion, [entry()], null, null, 1.0, { seed: 1 });
  assert.ok(atEnter.states[0].opacity < 0.05, 'still hidden at the letter enter');
  const later = textBg.evaluateBg(shape, motion, [entry()], null, null, 1.6, { seed: 1 });
  assert.ok(later.states[0].opacity > 0.95, 'visible once the delay passed');
});

test('exit withText follows the letter opacity', () => {
  const shape = { type: 'square', params: { unit: 'cell', width: 1, height: 1 } };
  const motion = { type: 'follow', params: { exit: 'withText' } };
  const result = textBg.evaluateBg(shape, motion, [entry({ opacity: 0.4 })], null, null, 2, { seed: 1 });
  assert.ok(Math.abs(result.states[0].opacity - 0.4) < 1e-6, `opacity ${result.states[0].opacity}`);
});

test('exit fade uses its own envelope', () => {
  const shape = { type: 'square', params: { unit: 'cell', width: 1, height: 1 } };
  const motion = { type: 'follow', params: { exit: 'fade', exitDuration: 0.4 } };
  const half = textBg.evaluateBg(shape, motion, [entry()], null, null, 5.2, { seed: 1 });
  assert.ok(half.states[0].opacity < 0.6 && half.states[0].opacity > 0.3, `half ${half.states[0].opacity}`);
  const gone = textBg.evaluateBg(shape, motion, [entry()], null, null, 5.5, { seed: 1 });
  assert.ok(gone.states[0].opacity < 0.05, `gone ${gone.states[0].opacity}`);
});

test('motion none is always visible', () => {
  const shape = { type: 'circle', params: { unit: 'em', width: 0.3, height: 0.3 } };
  const motion = { type: 'none', params: {} };
  const result = textBg.evaluateBg(shape, motion, [entry()], null, null, 0, { seed: 1 });
  assert.equal(result.states[0].opacity, 1);
  assert.equal(result.states[0].motionScaleX, 1);
});

test('cellMetrics keeps the cell centred for narrow glyphs', () => {
  const letter = {
    size: 100,
    advance: 0.2,
    advanceWithSpacing: 0.25,
    local: { penX: 0, penY: 0, cx: 12, cy: -30 },
  };
  const cell = textBg.cellMetrics(letter);
  assert.equal(cell.w, 25);
  assert.equal(cell.h, 100);
  assert.ok(Math.abs(cell.inkToCell[0] - (12.5 - 12)) < 1e-6);
  assert.ok(Math.abs(cell.inkToCell[1] - (-50 - -30)) < 1e-6);
});

test('the trim / dash / stroke parameters reach the bg state', () => {
  const shape = { type: 'square', params: { unit: 'cell', stroke: 0.08, fill: 0.5, trimStart: 0.1, trimEnd: 0.9, trimOffset: 0.2, dashOn: 0.1, dashOff: 0.05, dashOffset: 0.3 } };
  const result = textBg.evaluateBg(shape, { type: 'none', params: {} }, [entry()], null, null, 0, { seed: 1 });
  const state = result.states[0];
  assert.deepEqual(state.trim, [0.1, 0.9, 0.2]);
  assert.deepEqual(state.dash, [0.1, 0.05, 0.3]);
  assert.equal(state.stroke, 0.08);
  assert.equal(state.fill, 0.5);
  // the defaults keep the previous look: full fill, no outline, no dash
  const plain = textBg.evaluateBg({ type: 'square', params: {} }, { type: 'follow', params: {} }, [entry()], null, null, 0, { seed: 1 });
  assert.deepEqual(plain.states[0].trim, [0, 1, 0]);
  assert.deepEqual(plain.states[0].dash, [0, 0, 0]);
  assert.equal(plain.states[0].stroke, 0);
  assert.equal(plain.states[0].fill, 1);
});

test('bgMotion.draw traces the outline first and fills when the line is complete', () => {
  const shape = { type: 'square', params: { unit: 'cell', stroke: 0.06 } };
  const motion = { type: 'draw', params: { lead: 0, duration: 1, ease: 'linear' } };
  const fromZero = entry({ timing: { enterStart: 0, exitStart: 9, exitDur: 0.5 } });
  const quarter = textBg.evaluateBg(shape, motion, [fromZero], null, null, 0.25, { seed: 1 });
  assert.ok(Math.abs(quarter.states[0].trim[1] - 0.25) < 1e-6, `trim end ${quarter.states[0].trim[1]}`);
  assert.equal(quarter.states[0].fill, 0, 'the interior stays empty while the line is drawn');
  const late = textBg.evaluateBg(shape, motion, [fromZero], null, null, 0.9, { seed: 1 });
  assert.ok(late.states[0].fill > 0.5 && late.states[0].fill <= 1, `fill ${late.states[0].fill}`);
  const done = textBg.evaluateBg(shape, motion, [fromZero], null, null, 1.2, { seed: 1 });
  assert.deepEqual(done.states[0].trim, [0, 1, 0]);
  assert.equal(done.states[0].fill, 1);
  // without a stroke the draw still shows a line
  const thin = textBg.evaluateBg({ type: 'square', params: {} }, motion, [fromZero], null, null, 0.5, { seed: 1 });
  assert.ok(thin.states[0].stroke > 0, 'draw has no visible outline');
});

test('the draw motion is registered behind the pro pack', () => {
  const draw = fx.get('bgMotion', 'draw');
  assert.ok(draw, 'bgMotion.draw is not registered');
  assert.equal(draw.pack, 'pro');
  const listed = fx.list('bgMotion').map((descriptor) => descriptor.type);
  assert.ok(!listed.includes('draw'), 'the unpacked bgMotion list must not gain the draw motion');
  const all = fx.list('bgMotion', { packs: 'all' }).map((descriptor) => descriptor.type);
  assert.ok(all.includes('draw'));
  const square = fx.get('bgShape', 'square');
  for (const key of ['stroke', 'fill', 'trimStart', 'trimEnd', 'trimOffset', 'dashOn', 'dashOff', 'dashOffset']) {
    assert.ok(square.params.some((param) => param.key === key), `bgShape.square has no ${key}`);
  }
});

test('the bg state texture and shader carry the trim / dash rows', () => {
  const passes = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'passes.js'), 'utf8');
  assert.ok(passes.includes('BG_STATE_ROWS = 7'), 'the bg state texture is not 7 rows');
  assert.ok(passes.includes('state.stroke'), 'the stroke is not uploaded');
  assert.ok(passes.includes('state.fill'), 'the fill amount is not uploaded');
  const shaders = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'shaders.js'), 'utf8');
  const bg = shaders.slice(shaders.indexOf('const BG_FRAG'), shaders.indexOf('const BACKGROUND_FRAG'));
  for (const token of ['v_trim', 'v_dash', 'shapeParam', 'dashOn', 'fract(t + v_trim.z)']) {
    assert.ok(bg.includes(token), `BG_FRAG has no ${token}`);
  }
});
