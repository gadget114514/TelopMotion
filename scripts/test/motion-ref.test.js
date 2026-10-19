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

test('Motion Reference pendulum enter, exit, hold effects exist and function properly', () => {
  const pendulumIn = fx.get('enter', 'pendulumSwing');
  assert.ok(pendulumIn, 'pendulumSwing enter effect registered');
  const statePenIn = { x: 0, y: 0, rot: 0, opacity: 1 };
  pendulumIn.cpu(statePenIn, 0.0, { angle: 25, speed: 1.0, length: 0.1 }, () => 0.5, { shortSide: 1000 });
  assert.notEqual(statePenIn.rot, 0, 'pendulum enter starts with initial rotation');
  assert.equal(statePenIn.opacity, 0, 'pendulum enter starts hidden at p=0');

  const pendulumOut = fx.get('exit', 'pendulumSwing');
  assert.ok(pendulumOut, 'pendulumSwing exit effect registered');
  const statePenOut = { x: 0, y: 0, rot: 0, opacity: 1 };
  pendulumOut.cpu(statePenOut, 0.5, { angle: 25, speed: 1.0, length: 0.1 }, () => 0.5, { shortSide: 1000 });
  assert.notEqual(statePenOut.rot, 0, 'pendulum exit rotates mid-progress');
  assert.equal(statePenOut.opacity, 0.5, 'pendulum exit fades opacity at p=0.5');

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

test('rotateIn and rotateOut with startAngle, endAngle, randomSpeed and randomPivot', () => {
  const rotateIn = fx.get('enter', 'rotateIn');
  assert.ok(rotateIn, 'rotateIn enter effect registered');

  const stateIn0 = { rot: 0, x: 0, y: 0 };
  rotateIn.cpu(stateIn0, 0.0, { startAngle: 90, endAngle: 0 });
  assert.equal(stateIn0.rot, 90, 'rotateIn starts at startAngle=90');

  const stateIn1 = { rot: 0, x: 0, y: 0 };
  rotateIn.cpu(stateIn1, 1.0, { startAngle: 90, endAngle: 0 });
  assert.equal(stateIn1.rot, 0, 'rotateIn ends at endAngle=0');

  const stateInRand = { rot: 0, x: 0, y: 0 };
  rotateIn.cpu(stateInRand, 0.5, { startAngle: -90, endAngle: 0, randomSpeed: 0.5, randomPivot: 0.5 }, () => 0.8, { shortSide: 1000 });
  assert.notEqual(stateInRand.rot, 0, 'rotateIn computes angle with random speed');
  assert.notEqual(stateInRand.x, 0, 'rotateIn applies random pivot offset to x');

  const rotateOut = fx.get('exit', 'rotateOut');
  assert.ok(rotateOut, 'rotateOut exit effect registered');

  const stateOut0 = { rot: 0, x: 0, y: 0, opacity: 1 };
  rotateOut.cpu(stateOut0, 0.0, { startAngle: 0, endAngle: -90 }, () => 0.5, { shortSide: 1000 });
  assert.equal(stateOut0.rot, 0, 'rotateOut starts at startAngle=0');

  const stateOut1 = { rot: 0, x: 0, y: 0, opacity: 1 };
  rotateOut.cpu(stateOut1, 1.0, { startAngle: 0, endAngle: -90 }, () => 0.5, { shortSide: 1000 });
  assert.equal(stateOut1.rot, -90, 'rotateOut ends at endAngle=-90');
});

test('circleDrawOn drawing progress animation', () => {
  const circleDrawOn = fx.get('enter', 'circleDrawOn');
  assert.ok(circleDrawOn, 'circleDrawOn enter effect registered');
  const stateDraw = { visibleFrac: 1, represent: '', reprProgress: 0 };
  circleDrawOn.cpu(stateDraw, 0.4, { circleScale: 1.3, stroke: 4 });
  assert.equal(stateDraw.visibleFrac, 0.4, 'circleDrawOn sets visibleFrac');
  assert.equal(stateDraw.represent, 'stroke', 'circleDrawOn sets represent to stroke');
  assert.equal(stateDraw.reprProgress, 0.4, 'circleDrawOn animates reprProgress');
});

test('primitive drawing process enter/exit effects and companions', () => {
  const lineDrawOn = fx.get('enter', 'lineDrawOn');
  assert.ok(lineDrawOn, 'lineDrawOn enter effect registered');
  assert.ok(lineDrawOn.companion && lineDrawOn.companion.post, 'lineDrawOn has companion post shapeLayer');
  const stateLineIn = { visibleFrac: 1, represent: '', reprProgress: 0 };
  lineDrawOn.cpu(stateLineIn, 0.6, { linePosition: 'underline', stroke: 4 });
  assert.equal(stateLineIn.visibleFrac, 0.6, 'lineDrawOn sets visibleFrac');
  assert.equal(stateLineIn.represent, 'stroke', 'lineDrawOn sets represent to stroke');
  assert.equal(stateLineIn.reprProgress, 0.6, 'lineDrawOn sets reprProgress');

  const boxDrawOn = fx.get('enter', 'boxDrawOn');
  assert.ok(boxDrawOn, 'boxDrawOn enter effect registered');
  assert.ok(boxDrawOn.companion && boxDrawOn.companion.post, 'boxDrawOn has companion post shapeLayer');
  const stateBoxIn = { visibleFrac: 1, represent: '', reprProgress: 0 };
  boxDrawOn.cpu(stateBoxIn, 0.7, { stroke: 4 });
  assert.equal(stateBoxIn.visibleFrac, 0.7, 'boxDrawOn sets visibleFrac');
  assert.equal(stateBoxIn.represent, 'stroke', 'boxDrawOn sets represent to stroke');
  assert.equal(stateBoxIn.reprProgress, 0.7, 'boxDrawOn sets reprProgress');

  const circleErase = fx.get('exit', 'circleErase');
  assert.ok(circleErase, 'circleErase exit effect registered');
  assert.ok(circleErase.companion && circleErase.companion.post, 'circleErase has companion post shapeLayer');
  const stateCircOut = { visibleFrac: 1, represent: '', reprProgress: 1 };
  circleErase.cpu(stateCircOut, 0.3, { circleScale: 1.3, stroke: 4 });
  assert.equal(stateCircOut.visibleFrac, 0.7, 'circleErase sets visibleFrac');
  assert.equal(stateCircOut.represent, 'stroke', 'circleErase sets represent to stroke');
  assert.equal(stateCircOut.reprProgress, 0.7, 'circleErase sets reprProgress');

  const lineErase = fx.get('exit', 'lineErase');
  assert.ok(lineErase, 'lineErase exit effect registered');
  assert.ok(lineErase.companion && lineErase.companion.post, 'lineErase has companion post shapeLayer');
  const stateLineOut = { visibleFrac: 1, represent: '', reprProgress: 1 };
  lineErase.cpu(stateLineOut, 0.4, { linePosition: 'underline', stroke: 4 });
  assert.equal(stateLineOut.visibleFrac, 0.6, 'lineErase sets visibleFrac');
  assert.equal(stateLineOut.represent, 'stroke', 'lineErase sets represent to stroke');
  assert.equal(stateLineOut.reprProgress, 0.6, 'lineErase sets reprProgress');

  const boxErase = fx.get('exit', 'boxErase');
  assert.ok(boxErase, 'boxErase exit effect registered');
  assert.ok(boxErase.companion && boxErase.companion.post, 'boxErase has companion post shapeLayer');
  const stateBoxOut = { visibleFrac: 1, represent: '', reprProgress: 1 };
  boxErase.cpu(stateBoxOut, 0.5, { stroke: 4 });
  assert.equal(stateBoxOut.visibleFrac, 0.5, 'boxErase sets visibleFrac');
  assert.equal(stateBoxOut.represent, 'stroke', 'boxErase sets represent to stroke');
  assert.equal(stateBoxOut.reprProgress, 0.5, 'boxErase sets reprProgress');
});

test('tiltHold and tiltSpinHold effects exist and function properly', () => {
  const tiltHold = fx.get('hold', 'tiltHold');
  assert.ok(tiltHold, 'tiltHold registered');
  const stateTH0 = { tiltY: 0 };
  tiltHold.cpu(stateTH0, 0.0, 1.0, { angle: 30, period: 2.0, holdTime: 0.5, stagger: 0 }, () => 0.5, { i: 0 });
  assert.equal(stateTH0.tiltY, 0, 'tiltHold starts at 0 tilt');

  const stateTH1 = { tiltY: 0 };
  tiltHold.cpu(stateTH1, 1.0, 1.0, { angle: 30, period: 2.0, holdTime: 0.5, stagger: 0 }, () => 0.5, { i: 0 });
  assert.equal(stateTH1.tiltY, 30, 'tiltHold holds peak angle during hold time');

  const tiltHoldSub = fx.get('hold', 'tiltHoldSubstring');
  assert.ok(tiltHoldSub, 'tiltHoldSubstring registered');
  const stateTHS = { tiltY: 0 };
  tiltHoldSub.cpu(stateTHS, 1.0, 1.0, { angle: 30, period: 2.0, holdTime: 0.5, pivot: 'letter' }, () => 0.5, { i: 0 });
  assert.equal(stateTHS.tiltY, 30, 'tiltHoldSubstring tilts selected letters');

  const tiltSpinHold = fx.get('hold', 'tiltSpinHold');
  assert.ok(tiltSpinHold, 'tiltSpinHold registered');
  const stateTSH_hold = { tiltY: 0, rot: 0 };
  tiltSpinHold.cpu(stateTSH_hold, 0.8, 1.0, { angle: 30, period: 2.5, holdTime: 0.5, spinTime: 0.8, turns: 1, spinAxis: 'z', stagger: 0 }, () => 0.5, { i: 0 });
  assert.equal(stateTSH_hold.tiltY, 30, 'tiltSpinHold holds peak tilt before spin');
  assert.equal(stateTSH_hold.rot, 0, 'tiltSpinHold has not spun yet during tilt hold');

  const stateTSH_spin = { tiltY: 0, rot: 0 };
  tiltSpinHold.cpu(stateTSH_spin, 1.5, 1.0, { angle: 30, period: 2.5, holdTime: 0.5, spinTime: 0.8, turns: 1, spinAxis: 'z', stagger: 0 }, () => 0.5, { i: 0 });
  assert.equal(stateTSH_spin.tiltY, 30, 'tiltSpinHold maintains tilt during spin');
  assert.ok(stateTSH_spin.rot > 0, `tiltSpinHold spins during spin phase: rot=${stateTSH_spin.rot}`);

  const tiltSpinHoldSub = fx.get('hold', 'tiltSpinHoldSubstring');
  assert.ok(tiltSpinHoldSub, 'tiltSpinHoldSubstring registered');
});

test('bulletHoles and particlesOnText enter and exit effects exist and function properly', () => {
  const bulletEnter = fx.get('enter', 'bulletHoles');
  assert.ok(bulletEnter, 'bulletHoles enter effect registered');
  const stateBulletIn = { x: 0, y: 0, rot: 0, opacity: 1, represent: '', dust: null };
  bulletEnter.cpu(stateBulletIn, 0.5, { count: 3, recoil: 0.3, dust: 0.5 }, () => 0.7, { shortSide: 1000 });
  assert.equal(stateBulletIn.represent, 'dust', 'bulletHoles enter sets represent to dust');
  assert.ok(stateBulletIn.dust, 'bulletHoles enter configures dust parameters');
  assert.ok(stateBulletIn.opacity > 0 && stateBulletIn.opacity <= 1, 'bulletHoles enter sets opacity');

  const bulletExit = fx.get('exit', 'bulletHoles');
  assert.ok(bulletExit, 'bulletHoles exit effect registered');
  const stateBulletOut = { x: 0, y: 0, rot: 0, opacity: 1, represent: '', dust: null };
  bulletExit.cpu(stateBulletOut, 0.5, { count: 3, recoil: 0.3, dust: 0.5 }, () => 0.7, { shortSide: 1000 });
  assert.equal(stateBulletOut.represent, 'dust', 'bulletHoles exit sets represent to dust');
  assert.ok(stateBulletOut.dust, 'bulletHoles exit configures dust parameters');
  assert.equal(stateBulletOut.opacity, 0.5, 'bulletHoles exit reduces opacity at p=0.5');

  const partEnter = fx.get('enter', 'particlesOnText');
  assert.ok(partEnter, 'particlesOnText enter effect registered');
  const statePartIn = { x: 0, y: 0, opacity: 1, scaleX: 1, scaleY: 1, represent: '', reprProgress: 0 };
  partEnter.cpu(statePartIn, 0.5, { count: 24, spread: 0.4, speed: 1.0 }, () => 0.5, { shortSide: 1000, i: 0 });
  assert.equal(statePartIn.represent, 'particles', 'particlesOnText enter sets represent to particles');
  assert.equal(statePartIn.reprProgress, 0.5, 'particlesOnText enter sets reprProgress');

  const partExit = fx.get('exit', 'particlesOnText');
  assert.ok(partExit, 'particlesOnText exit effect registered');
  const statePartOut = { x: 0, y: 0, opacity: 1, rot: 0, represent: '', reprProgress: 1 };
  partExit.cpu(statePartOut, 0.5, { count: 24, spread: 0.4, speed: 1.0 }, () => 0.5, { shortSide: 1000, i: 0 });
  assert.equal(statePartOut.represent, 'particles', 'particlesOnText exit sets represent to particles');
  assert.equal(statePartOut.reprProgress, 0.5, 'particlesOnText exit sets reprProgress to 1-p');
  assert.equal(statePartOut.opacity, 0.5, 'particlesOnText exit reduces opacity');
});

test('checkerboard enter and exit effects exist and function properly', () => {
  const checkerIn = fx.get('enter', 'checkerboard');
  assert.ok(checkerIn, 'checkerboard enter effect registered');
  const stateInStart = { visibleFrac: 1, scaleX: 1, scaleY: 1 };
  checkerIn.cpu(stateInStart, 0, { cells: 4, soft: 0.05 }, () => 0.5, { i: 0 });
  assert.equal(stateInStart.visibleFrac, 0, 'checkerboard enter hides letters at p=0');
  assert.equal(stateInStart.wipeMode, 0, 'checkerboard enter uses the horizontal wipe on even letters');
  const stateInOdd = { visibleFrac: 1, scaleX: 1, scaleY: 1 };
  checkerIn.cpu(stateInOdd, 0, { cells: 4, soft: 0.05 }, () => 0.5, { i: 1 });
  assert.equal(stateInOdd.wipeMode, 2, 'checkerboard enter uses the vertical wipe on odd letters');
  const stateInEnd = { visibleFrac: 1, scaleX: 1, scaleY: 1 };
  checkerIn.cpu(stateInEnd, 1, { cells: 4, soft: 0.05 }, () => 0.5, { i: 0 });
  assert.equal(stateInEnd.visibleFrac, 1, 'checkerboard enter fully reveals at p=1');

  const checkerOut = fx.get('exit', 'checkerboard');
  assert.ok(checkerOut, 'checkerboard exit effect registered');
  const stateOutStart = { visibleFrac: 1, scaleX: 1, scaleY: 1 };
  checkerOut.cpu(stateOutStart, 0, { cells: 4, soft: 0.05 }, () => 0.5, { i: 0 });
  assert.equal(stateOutStart.visibleFrac, 1, 'checkerboard exit keeps letters visible at p=0');
  assert.equal(stateOutStart.wipeMode, 0, 'checkerboard exit keeps the even-letter wipe axis');
  const stateOutEnd = { visibleFrac: 1, scaleX: 1, scaleY: 1 };
  checkerOut.cpu(stateOutEnd, 1, { cells: 4, soft: 0.05 }, () => 0.5, { i: 0 });
  assert.equal(stateOutEnd.visibleFrac, 0, 'checkerboard exit hides letters at p=1');

  // the parity phase shifts every `cells` letters, staggering the checker rows
  const earlyOut = { visibleFrac: 1, scaleX: 1, scaleY: 1 };
  checkerOut.cpu(earlyOut, 0.4, { cells: 4, soft: 0.05 }, () => 0.5, { i: 0 });
  const lateOut = { visibleFrac: 1, scaleX: 1, scaleY: 1 };
  checkerOut.cpu(lateOut, 0.4, { cells: 4, soft: 0.05 }, () => 0.5, { i: 5 });
  assert.equal(earlyOut.visibleFrac, 1, 'checkerboard exit keeps phase-0 letters fully visible mid-wipe');
  assert.ok(lateOut.visibleFrac > 0 && lateOut.visibleFrac < 1, 'checkerboard exit staggers later rows');
  assert.ok(lateOut.scaleX < 1 && lateOut.scaleY < 1, 'checkerboard exit shrinks letters mid-wipe');
});

test('speechBubble enter and exit effects exist and function properly', () => {
  const speechEnter = fx.get('enter', 'speechBubble');
  assert.ok(speechEnter, 'speechBubble enter effect registered');
  assert.ok(speechEnter.companion && speechEnter.companion.ornShape, 'speechBubble enter has companion ornShape');
  assert.equal(speechEnter.companion.ornShape.type, 'bubble');

  const stateInStart = { scaleX: 1, scaleY: 1, opacity: 1 };
  speechEnter.cpu(stateInStart, 0.0, { popLead: 0.2, popScale: 0.5 });
  assert.equal(stateInStart.opacity, 0, 'speechBubble enter opacity is 0 at start lead');

  const stateInEnd = { scaleX: 1, scaleY: 1, opacity: 1 };
  speechEnter.cpu(stateInEnd, 1.0, { popLead: 0.2, popScale: 0.5 });
  assert.equal(stateInEnd.opacity, 1, 'speechBubble enter opacity is 1 at p=1');

  const speechExit = fx.get('exit', 'speechBubble');
  assert.ok(speechExit, 'speechBubble exit effect registered');
  assert.ok(speechExit.companion && speechExit.companion.ornShape, 'speechBubble exit has companion ornShape');
  assert.equal(speechExit.companion.ornShape.type, 'bubble');

  const stateOutStart = { scaleX: 1, scaleY: 1, opacity: 1 };
  speechExit.cpu(stateOutStart, 0.0, { shrinkScale: 0.3 });
  assert.equal(stateOutStart.opacity, 1, 'speechBubble exit opacity is 1 at p=0');

  const stateOutEnd = { scaleX: 1, scaleY: 1, opacity: 1 };
  speechExit.cpu(stateOutEnd, 1.0, { shrinkScale: 0.3 });
  assert.equal(stateOutEnd.opacity, 0, 'speechBubble exit opacity is 0 at p=1');
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
  assert.ok(ids.has('circleDrawIn'), 'circleDrawIn preset');
  assert.ok(ids.has('lineDrawIn'), 'lineDrawIn preset');
  assert.ok(ids.has('boxDrawIn'), 'boxDrawIn preset');
  assert.ok(ids.has('bulletHolesIn'), 'bulletHolesIn preset');
  assert.ok(ids.has('particlesOnTextIn'), 'particlesOnTextIn preset');
  assert.ok(ids.has('checkerboardIn'), 'checkerboardIn preset');
  assert.ok(ids.has('pendulumIn'), 'pendulumIn preset');
  assert.ok(ids.has('speechBubbleIn'), 'speechBubbleIn preset');
  assert.ok(ids.has('circleEraseOut'), 'circleEraseOut preset');
  assert.ok(ids.has('lineEraseOut'), 'lineEraseOut preset');
  assert.ok(ids.has('boxEraseOut'), 'boxEraseOut preset');
  assert.ok(ids.has('bulletHolesOut'), 'bulletHolesOut preset');
  assert.ok(ids.has('particlesOnTextOut'), 'particlesOnTextOut preset');
  assert.ok(ids.has('checkerboardOut'), 'checkerboardOut preset');
  assert.ok(ids.has('pendulumOut'), 'pendulumOut preset');
  assert.ok(ids.has('speechBubbleOut'), 'speechBubbleOut preset');
});

test('splitFontIn and splitFontOut enter and exit effects exist and function properly', () => {
  const splitIn = fx.get('enter', 'splitFontIn');
  assert.ok(splitIn, 'splitFontIn enter effect registered');

  const stateTopIn = { x: 0, y: 0, opacity: 1 };
  splitIn.cpu(stateTopIn, 0.0, { mode: 'topBottom', shift: 0.2, delay: 0.1 }, () => 0.5, {
    shortSide: 1000,
    letterY: 400,
    blockCenter: { x: 500, y: 500 },
  });
  assert.ok(stateTopIn.y < 0, `splitFontIn top half moves up: y=${stateTopIn.y}`);

  const stateBottomIn = { x: 0, y: 0, opacity: 1 };
  splitIn.cpu(stateBottomIn, 0.0, { mode: 'topBottom', shift: 0.2, delay: 0.1 }, () => 0.5, {
    shortSide: 1000,
    letterY: 600,
    blockCenter: { x: 500, y: 500 },
  });
  assert.ok(stateBottomIn.y > 0, `splitFontIn bottom half moves down: y=${stateBottomIn.y}`);

  const stateLeftIn = { x: 0, y: 0, opacity: 1 };
  splitIn.cpu(stateLeftIn, 0.0, { mode: 'leftRight', shift: 0.2, delay: 0.1 }, () => 0.5, {
    shortSide: 1000,
    letterX: 300,
    blockCenter: { x: 500, y: 500 },
  });
  assert.ok(stateLeftIn.x < 0, `splitFontIn left half moves left: x=${stateLeftIn.x}`);

  const splitOut = fx.get('exit', 'splitFontOut');
  assert.ok(splitOut, 'splitFontOut exit effect registered');

  const stateTopOut = { x: 0, y: 0, opacity: 1 };
  splitOut.cpu(stateTopOut, 1.0, { mode: 'topBottom', shift: 0.2, delay: 0.1 }, () => 0.5, {
    shortSide: 1000,
    letterY: 400,
    blockCenter: { x: 500, y: 500 },
  });
  assert.ok(stateTopOut.y < 0, `splitFontOut top half splits upwards at p=1: y=${stateTopOut.y}`);
  assert.equal(stateTopOut.opacity, 0, 'splitFontOut top half fades out at p=1');
});
