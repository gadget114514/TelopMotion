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

test('pageCurl enter and exit effects exist and function properly', () => {
  const pageCurlEnter = fx.get('enter', 'pageCurl');
  assert.ok(pageCurlEnter, 'pageCurl enter effect registered');

  const stateEnter = { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1, skewX: 0, skewY: 0, rot: 0, rotY: 0 };
  pageCurlEnter.cpu(stateEnter, 0, { dir: 'right', angle: 45, distance: 0.5, curl: 30 }, () => 0.5, { shortSide: 1000 });
  assert.equal(stateEnter.opacity, 0, 'opacity starts at 0 at progress 0');
  assert.notEqual(stateEnter.x, 0, 'pageCurl enter alters position at start');

  const pageCurlExit = fx.get('exit', 'pageCurl');
  assert.ok(pageCurlExit, 'pageCurl exit effect registered');

  const stateExit = { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1, skewX: 0, skewY: 0, rot: 0, rotY: 0 };
  pageCurlExit.cpu(stateExit, 1.0, { dir: 'right', angle: 45, distance: 0.5, curl: 30 }, () => 0.5, { shortSide: 1000 });
  assert.ok(stateExit.opacity < 0.25, 'opacity decreases significantly at progress 1');
  assert.notEqual(stateExit.x, 0, 'pageCurl exit alters position at end');
});

test('Motion Reference new presets are registered in MOTION_PRESETS and motionPresets()', () => {
  const presets = motion.motionPresets();
  const ids = new Set(presets.map((p) => p.id));
  assert.ok(ids.has('anticipationIn'), 'anticipationIn preset');
  assert.ok(ids.has('irisIn'), 'irisIn preset');
  assert.ok(ids.has('doubleBounceIn'), 'doubleBounceIn preset');
  assert.ok(ids.has('pendulumLoop'), 'pendulumLoop preset');
  assert.ok(ids.has('nudgeLoop'), 'nudgeLoop preset');
});
