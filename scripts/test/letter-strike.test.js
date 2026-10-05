'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('../../renderer/js/lyrics/effects/letter-vary.js');
const strike = require('../../renderer/js/lyrics/effects/letter-strike.js');

function sceneOf(count, w, h) {
  const letters = [];
  for (let i = 0; i < count; i += 1) {
    letters.push({ local: { w: w || 100, h: h || 50 } });
  }
  return { letters };
}

function statesOf(count, patch) {
  const states = [];
  for (let i = 0; i < count; i += 1) {
    states.push({ x: 200, y: 300, rot: 0, scaleX: 1, scaleY: 1, skew: 0, opacity: 1, ...(patch || {}) });
  }
  return states;
}

const CTX = { t: 1, beatStart: 0, beatId: 'b1', seed: 5, width: 1920, height: 1080, colors: { stroke: [1, 1, 1, 1] } };

test('a rotated letter turns its strike vertical', () => {
  const scene = sceneOf(1);
  const states = statesOf(1, { rot: 90 });
  const segs = strike.strikeSegments(scene, states, { type: 'line', params: {} }, CTX);
  assert.equal(segs.length, 1);
  const [seg] = segs;
  assert.ok(Math.abs(seg.x0 - seg.x1) < 1e-6, `expected vertical, got ${seg.x0},${seg.y0} -> ${seg.x1},${seg.y1}`);
  assert.ok(Math.abs(seg.y1 - seg.y0) > 10, 'the segment must span the letter');
});

test('letters with zero opacity draw nothing', () => {
  const scene = sceneOf(3);
  const states = statesOf(3);
  states[1].opacity = 0;
  const segs = strike.strikeSegments(scene, states, { type: 'line', params: {} }, CTX);
  assert.equal(segs.length, 2);
});

test('double draws two segments per letter', () => {
  const segs = strike.strikeSegments(sceneOf(2), statesOf(2), { type: 'double', params: {} }, CTX);
  assert.equal(segs.length, 4);
});

test('stagger trims grow from 0 to 1 over time', () => {
  const scene = sceneOf(2);
  const states = statesOf(2);
  const instance = { type: 'line', params: { drawIn: 'stagger', drawTime: 0.3, stagger: 0.1 } };
  const early = strike.strikeSegments(scene, states, instance, { ...CTX, t: 0 });
  assert.equal(early.length, 0);
  const mid = strike.strikeSegments(scene, states, instance, { ...CTX, t: 0.05 });
  assert.equal(mid.length, 1);
  assert.ok(mid[0].trim[1] > 0 && mid[0].trim[1] < 1);
  const late = strike.strikeSegments(scene, states, instance, { ...CTX, t: 5 });
  assert.equal(late.length, 2);
  for (const seg of late) assert.deepEqual(seg.trim, [0, 1, 0]);
});

test('colors cycle letter by letter', () => {
  const segs = strike.strikeSegments(
    sceneOf(3),
    statesOf(3),
    { type: 'line', params: { colors: ['#ff0000', '#00ff00'] } },
    CTX
  );
  assert.equal(segs.length, 3);
  assert.deepEqual(segs[0].color, [1, 0, 0, 1]);
  assert.deepEqual(segs[1].color, [0, 1, 0, 1]);
  assert.deepEqual(segs[2].color, [1, 0, 0, 1]);
});

test('toScreen follows scale, rotation and translation', () => {
  const letter = { local: { w: 100, h: 50 } };
  const [x, y] = strike.toScreen(letter, { x: 10, y: 20, rot: 0, scaleX: 2, scaleY: 2 }, 5, 5);
  assert.equal(x, 20);
  assert.equal(y, 30);
});

test('packEmInfo centres the em box in ink space', () => {
  // passes.js reads SA.warp at module scope; the GL calls only run in engine
  global.SA = global.SA || {};
  global.window = global.window || { SA: global.SA };
  require('../../renderer/js/lyrics/gl/passes.js');
  const passes = global.window.SA.glPasses || global.SA.glPasses;
  const packEmInfo = passes._test.packEmInfo;
  assert.ok(typeof packEmInfo === 'function', 'packEmInfo is exposed');
  // ink box y -40..40 (cy 0, halfH 40); em top -88 bottom +12
  const out = packEmInfo(
    [{ size: 100, ascent: 88, descent: 12 }],
    [{ scale: 1, bbox: { y0: -40, y1: 40 } }]
  );
  assert.ok(Math.abs(out[0] - (-38 / 40)) < 1e-6, `em centre ${out[0]}`);
  assert.ok(Math.abs(out[1] - (50 / 40)) < 1e-6, `em half ${out[1]}`);
  // without ascent / descent the 0.88 / 0.12 ratio applies
  const fallback = packEmInfo([{ size: 100 }], [{ scale: 1, bbox: { y0: -50, y1: 50 } }]);
  assert.ok(Math.abs(fallback[0] - (-38 / 50)) < 1e-6, `fallback centre ${fallback[0]}`);
  assert.ok(Math.abs(fallback[1] - 1) < 1e-6, `fallback half ${fallback[1]}`);
});
