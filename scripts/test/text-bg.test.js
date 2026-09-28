'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

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
