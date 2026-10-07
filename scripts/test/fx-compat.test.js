'use strict';

// fxCompat: cueStyle enter/exit/hold の figure/切り絵への移植互換表と
// グループ変形評価。文字前提型を除外し、汎用成分のみ残す。

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const fx = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'registry.js'));
for (const name of ['enter', 'exit', 'hold']) {
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', `${name}.js`));
}
const easing = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'easing.js'));
const fxCompat = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'fx-compat.js'));

const FRAME = { width: 1920, height: 1080 };

test('text-premised types are excluded, generic ones stay', () => {
  for (const type of ['typewriter', 'strokeDrawOn', 'particlesAssemble', 'sandGather', 'shatterRebuild', 'morphFromPrevious', 'noiseDissolveIn', 'dissolve', 'megaZoomIn', 'appear', 'wipe', 'blind', 'box', 'checkerboard', 'maskReveal', 'multiIn', 'blurIn']) {
    assert.equal(fxCompat.isCompatible('enter', type), false, `enter ${type}`);
  }
  for (const type of ['fade', 'slide', 'zoomIn', 'rotateIn', 'elasticPop', 'glitchIn', 'slideBlur', 'shakeIn', 'spinPartIn']) {
    assert.equal(fxCompat.isCompatible('enter', type), true, `enter ${type}`);
  }
  for (const type of ['dissolve', 'wipe', 'typewriterReverse', 'strokeErase', 'sandCrumble', 'blurOut']) {
    assert.equal(fxCompat.isCompatible('exit', type), false, `exit ${type}`);
  }
  for (const type of ['fade', 'floatOut', 'shrinkDir', 'spiralOut', 'vanish', 'rotateOut']) {
    assert.equal(fxCompat.isCompatible('exit', type), true, `exit ${type}`);
  }
  for (const type of ['jelly', 'wobbleWarp', 'twist', 'breathing', 'fontSize', 'fillScreen', 'squashStretch', 'swirl', 'orbit3D']) {
    assert.equal(fxCompat.isCompatible('hold', type), false, `hold ${type}`);
  }
  for (const type of ['pulse', 'floatBob', 'drift', 'jitter', 'heartbeat', 'shiver', 'dissolve', 'none']) {
    assert.equal(fxCompat.isCompatible('hold', type), true, `hold ${type}`);
  }
});

test('evaluateStyleState applies generic transforms and ignores text-only ones', () => {
  const style = {
    enter: { type: 'slide', params: { dir: 'up', distance: 0.25 }, motion: { in: { duration: 0.5, delay: 0, ease: 'linear' } } },
    exit: { type: 'fade', params: {}, motion: { out: { duration: 0.5, delay: 0, ease: 'linear' } } },
    hold: [],
  };
  const atStart = fxCompat.evaluateStyleState(style, 0, { start: 0, end: 5 }, FRAME, 1, fx, easing);
  assert.ok(atStart.y < -100, `slide offset at start: ${atStart.y}`);
  const atMid = fxCompat.evaluateStyleState(style, 2.5, { start: 0, end: 5 }, FRAME, 1, fx, easing);
  assert.ok(Math.abs(atMid.y) < 1e-9 && Math.abs(atMid.opacity - 1) < 1e-9, `identity mid: ${JSON.stringify(atMid)}`);

  const textOnly = {
    enter: { type: 'typewriter', params: {}, motion: { in: { duration: 0.5 } } },
    exit: { type: 'dissolve', params: {}, motion: { out: { duration: 0.5 } } },
    hold: [{ type: 'jelly', params: {}, motion: {} }],
  };
  const ignored = fxCompat.evaluateStyleState(textOnly, 0.1, { start: 0, end: 5 }, FRAME, 1, fx, easing);
  assert.deepEqual(ignored, { x: 0, y: 0, scaleX: 1, scaleY: 1, rot: 0, opacity: 1 });
});

test('scaleFrom rides along through registerEnter types', () => {
  const style = {
    enter: { type: 'charGrowIn', params: { from: 0, overshoot: 1.25, peak: 0.65, scaleFromX: 2, scaleFromY: 0.5 }, motion: { in: { duration: 1, delay: 0, ease: 'linear' } } },
  };
  const atStart = fxCompat.evaluateStyleState(style, 0, { start: 0, end: 5 }, FRAME, 1, fx, easing);
  assert.ok(Math.abs(atStart.scaleX - atStart.scaleY) > 0.001, `scaleFrom splits axes: ${JSON.stringify(atStart)}`);
  const atEnd = fxCompat.evaluateStyleState(style, 2, { start: 0, end: 5 }, FRAME, 1, fx, easing);
  assert.ok(Math.abs(atEnd.scaleX - 1) < 1e-9 && Math.abs(atEnd.scaleY - 1) < 1e-9, `scaleFrom settles: ${JSON.stringify(atEnd)}`);
});

test('applyGroupStateToShapes moves, scales and fades shapes', () => {
  const shapes = [
    { kind: 'circle', x: 960, y: 540, r: 100, opacity: 1 },
    { kind: 'rect', x: 0, y: 0, w: 100, h: 50, opacity: 0.5 },
  ];
  fxCompat.applyGroupStateToShapes(shapes, { x: 10, y: -20, scaleX: 2, scaleY: 0.5, rot: 0, opacity: 0.5 }, { x: 960, y: 540 });
  assert.equal(shapes[0].x, 970);
  assert.equal(shapes[0].y, 520);
  assert.equal(shapes[0].r, 125);
  assert.equal(shapes[0].opacity, 0.5);
  assert.equal(shapes[1].opacity, 0.25);
});

test('layerMotions copies theme enter/exit to unlocked sheets and skips locked ones', () => {
  globalThis.SA = globalThis.SA || {};
  globalThis.SA.fxCompat = fxCompat;
  const direct = require(path.join(ROOT, 'renderer', 'js', 'studio', 'direct.js'));
  const projectDoc = {
    layers: [
      { id: 'a', type: 'image', enabled: true, start: 0, end: 5, motion: {} },
      { id: 'b', type: 'image', enabled: true, locked: true, start: 0, end: 5, motion: {} },
      { id: 'c', type: 'image', enabled: true, start: 0, end: 5, motion: { in: { type: 'fade', duration: 0.9, params: {} } } },
    ],
  };
  const ctx = {
    wb: 1,
    themeStyle: {
      enter: { type: 'slide', params: { dir: 'up', distance: 0.25 }, motion: { in: { duration: 0.6, delay: 0, ease: 'easeOutCubic' } } },
      exit: { type: 'floatOut', params: { dir: 'up', distance: 0.25 }, motion: { out: { duration: 0.5, delay: 0, ease: 'easeInCubic' } } },
    },
  };
  direct.layerMotions(projectDoc, ctx);
  const byId = Object.fromEntries(projectDoc.layers.map((layer) => [layer.id, layer]));
  assert.equal(byId.a.motion.in.type, 'slide');
  assert.equal(byId.a.motion.out.type, 'floatOut');
  assert.deepEqual(byId.b.motion, {});
  // 手動の duration は維持し、type/params のみ更新する
  assert.equal(byId.c.motion.in.type, 'slide');
  assert.equal(byId.c.motion.in.duration, 0.9);
});

test('layerMotions leaves text-only theme styles alone', () => {
  globalThis.SA = globalThis.SA || {};
  globalThis.SA.fxCompat = fxCompat;
  const direct = require(path.join(ROOT, 'renderer', 'js', 'studio', 'direct.js'));
  const projectDoc = {
    layers: [{ id: 'a', type: 'image', enabled: true, start: 0, end: 5, motion: {} }],
  };
  const ctx = {
    wb: 1,
    themeStyle: {
      enter: { type: 'typewriter', params: {}, motion: { in: { duration: 0.5 } } },
      exit: { type: 'dissolve', params: {}, motion: { out: { duration: 0.5 } } },
    },
  };
  direct.layerMotions(projectDoc, ctx);
  assert.deepEqual(projectDoc.layers[0].motion, {});
});
