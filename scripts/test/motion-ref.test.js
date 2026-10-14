'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const fx = require('../../renderer/js/lyrics/effects/registry.js');
require('../../renderer/js/lyrics/effects/enter.js');
require('../../renderer/js/lyrics/effects/exit.js');
require('../../renderer/js/lyrics/effects/hold.js');
const motion = require('../../renderer/js/lyrics/motion.js');

test('Motion Reference new enter effects exist and function properly', () => {
  const anticipation = fx.get('enter', 'anticipation');
  assert.ok(anticipation, 'anticipation enter effect registered');

  const stateAnt = { x: 0, y: 0, opacity: 1 };
  anticipation.cpu(stateAnt, 0.1, { dir: 'up', distance: 0.25, pullback: 0.12 }, () => 0.5, { shortSide: 1000 });
  // At progress < 0.25, anticipation pulls back in opposite direction
  assert.ok(stateAnt.y > 0, `anticipation pulls back (+y) at start: y=${stateAnt.y}`);

  const irisOpen = fx.get('enter', 'irisOpen');
  assert.ok(irisOpen, 'irisOpen enter effect registered');
  const stateIris = { scaleX: 1, scaleY: 1, opacity: 1 };
  irisOpen.cpu(stateIris, 0.5, { soft: 0.08 });
  assert.equal(stateIris.wipeMode, 4, 'irisOpen sets wipeMode to 4');
  assert.equal(stateIris.visibleFrac, 0.5);

  const doubleBounce = fx.get('enter', 'doubleBounce');
  assert.ok(doubleBounce, 'doubleBounce enter effect registered');
  const stateDb = { y: 0, opacity: 1 };
  doubleBounce.cpu(stateDb, 0.0, { height: 0.4 }, () => 0.5, { shortSide: 1000 });
  assert.ok(stateDb.y < 0, `doubleBounce starts above target: y=${stateDb.y}`);

  const pageCurlEnter = fx.get('enter', 'pageCurl');
  assert.ok(pageCurlEnter, 'pageCurl enter effect registered');
  const stateCurlEnter0 = { x: 0, y: 0, tiltX: 0, tiltY: 0, scaleX: 1, scaleY: 1, opacity: 1, visibleFrac: 1, deform: [] };
  pageCurlEnter.cpu(stateCurlEnter0, 0.0, { dir: 'bottomRight', radius: 0.2, curlAngle: 90, shadow: 0.5 }, () => 0.5, { shortSide: 1000, blockCenter: { x: 500, y: 500 }, blockHalf: { x: 200, y: 200 }, letterX: 500, letterY: 500 });
  assert.equal(stateCurlEnter0.opacity, 0, 'pageCurl enter starts hidden at p=0');

  const stateCurlEnter1 = { x: 0, y: 0, tiltX: 0, tiltY: 0, scaleX: 1, scaleY: 1, opacity: 1, visibleFrac: 1, deform: [] };
  pageCurlEnter.cpu(stateCurlEnter1, 1.0, { dir: 'bottomRight', radius: 0.2, curlAngle: 90, shadow: 0.5 }, () => 0.5, { shortSide: 1000, blockCenter: { x: 500, y: 500 }, blockHalf: { x: 200, y: 200 }, letterX: 500, letterY: 500 });
  assert.equal(stateCurlEnter1.opacity, 1, 'pageCurl enter fully visible at p=1');
});

test('Motion Reference pageCurl exit effect exists and functions properly', () => {
  const pageCurlExit = fx.get('exit', 'pageCurl');
  assert.ok(pageCurlExit, 'pageCurl exit effect registered');

  const stateCurlExit0 = { x: 0, y: 0, tiltX: 0, tiltY: 0, scaleX: 1, scaleY: 1, opacity: 1, visibleFrac: 1, deform: [] };
  pageCurlExit.cpu(stateCurlExit0, 0.0, { dir: 'bottomRight', radius: 0.2, curlAngle: 90, shadow: 0.5 }, () => 0.5, { shortSide: 1000, blockCenter: { x: 500, y: 500 }, blockHalf: { x: 200, y: 200 }, letterX: 500, letterY: 500 });
  assert.equal(stateCurlExit0.opacity, 1, 'pageCurl exit fully visible at p=0');

  const stateCurlExit1 = { x: 0, y: 0, tiltX: 0, tiltY: 0, scaleX: 1, scaleY: 1, opacity: 1, visibleFrac: 1, deform: [] };
  pageCurlExit.cpu(stateCurlExit1, 1.0, { dir: 'bottomRight', radius: 0.2, curlAngle: 90, shadow: 0.5 }, () => 0.5, { shortSide: 1000, blockCenter: { x: 500, y: 500 }, blockHalf: { x: 200, y: 200 }, letterX: 500, letterY: 500 });
  assert.equal(stateCurlExit1.opacity, 0, 'pageCurl exit fully hidden at p=1');
});

test('Motion Reference new hold effects exist and function properly', () => {
  const pendulum = fx.get('hold', 'pendulumSwing');
  assert.ok(pendulum, 'pendulumSwing hold effect registered');
  const statePen = { x: 0, y: 0, rot: 0 };
  pendulum.cpu(statePen, 0.25, 1.0, { angle: 18, speed: 0.8, length: 0.1 }, () => 0.5, { shortSide: 1000 });
  assert.notEqual(statePen.rot, 0, 'pendulum rotates');
  assert.notEqual(statePen.x, 0, 'pendulum shifts x');

  const nudge = fx.get('hold', 'nudgeImpulse');
  assert.ok(nudge, 'nudgeImpulse hold effect registered');
  const stateNudge = { x: 0, rot: 0 };
  nudge.cpu(stateNudge, 0.075, 1.0, { amount: 0.04, interval: 2.0 }, () => 0.5, { shortSide: 1000 });
  assert.notEqual(stateNudge.x, 0, 'nudge shifts x during impulse');
  assert.notEqual(stateNudge.rot, 0, 'nudge rotates during impulse');
});

test('Motion Reference new presets are registered in MOTION_PRESETS and motionPresets()', () => {
  const presets = motion.motionPresets();
  const ids = new Set(presets.map((p) => p.id));
  assert.ok(ids.has('anticipationIn'), 'anticipationIn preset');
  assert.ok(ids.has('irisIn'), 'irisIn preset');
  assert.ok(ids.has('doubleBounceIn'), 'doubleBounceIn preset');
  assert.ok(ids.has('pageCurlIn'), 'pageCurlIn preset');
  assert.ok(ids.has('pageCurlOut'), 'pageCurlOut preset');
  assert.ok(ids.has('pendulumLoop'), 'pendulumLoop preset');
  assert.ok(ids.has('nudgeLoop'), 'nudgeLoop preset');
});
