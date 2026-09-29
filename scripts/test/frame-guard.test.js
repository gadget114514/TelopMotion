'use strict';

// Phase 2c: the frame guard keeps at least half of the block inside the
// (camera-projected) frame. Pure unit tests cover the correction ladder, and
// motion integration checks the effects that used to push text out.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const fx = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location']) {
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', `${name}.js`));
}
const frameGuard = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'frame-guard.js'));
const motion = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'motion.js'));
const camera = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'camera.js'));

const FRAME = { width: 1920, height: 1080 };

function letterState(x, y, w, h, extra) {
  return {
    x,
    y,
    rot: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    visibleFrac: 1,
    deform: [],
    warpOrigin: { x: x - FRAME.width / 2, y: y - FRAME.height / 2 },
    local: { x: 0, y: 0, w, h, cx: w / 2, cy: h / 2 },
    ...(extra || {}),
  };
}

test('guard does nothing when the block is inside the frame', () => {
  const states = [letterState(900, 500, 200, 100), letterState(1200, 500, 200, 100)];
  const result = frameGuard.guard(states, { frame: FRAME, anchor: { x: 960, y: 540 } });
  assert.equal(result.corrected, 0);
  assert.equal(result.visible, 1);
});

test('guard lowers a zoomBlock until the block is visible again', () => {
  // a 1200x760 block scaled 4x about its centre sticks far out of the frame
  const states = [letterState(400, 200, 1200, 760, { deform: [{ type: 'zoomBlock', amount: 3 }] })];
  const before = frameGuard.visibleRatio(states, { x: 400, y: 200 }, frameGuard.effectiveFrame(FRAME, null));
  assert.ok(before < 0.5, `starts hidden (${before})`);
  const result = frameGuard.guard(states, { frame: FRAME, anchor: { x: 400, y: 200 }, allowTranslate: true });
  assert.ok(result.corrected >= 1);
  assert.ok(result.visible >= 0.5 - 1e-6, `visible ${result.visible}`);
  assert.ok(states[0].deform[0].amount < 3, 'the zoom amount was lowered');
});

test('guard translates a small block back inside', () => {
  const states = [letterState(-600, 540, 200, 100)];
  const before = { x: states[0].x, warpX: states[0].warpOrigin.x };
  const result = frameGuard.guard(states, { frame: FRAME, anchor: { x: 100, y: 540 }, allowTranslate: true });
  assert.ok(result.visible >= 0.5 - 1e-6);
  assert.ok(states[0].x >= -100 && states[0].x <= FRAME.width, `x ${states[0].x}`);
  // warpOrigin moved with the letter
  assert.ok(Math.abs(states[0].warpOrigin.x - before.warpX - (states[0].x - before.x)) < 1e-6);
});

test('guard shrinks a block that fits nowhere', () => {
  const states = [letterState(960, 540, 6000, 4000)];
  const result = frameGuard.guard(states, { frame: FRAME, anchor: { x: 960, y: 540 }, allowTranslate: true });
  assert.ok(result.visible >= 0.5 - 1e-6);
  assert.ok(states[0].scaleX < 1 && states[0].scaleY < 1, 'the block shrank');
});

test('guard reflects a camera zoom', () => {
  const states = [letterState(960, 540, 1600, 900)];
  const frame = frameGuard.effectiveFrame(FRAME, { zoom: 2.4, ox: 0, oy: 0 });
  assert.equal(Math.round(frame.x0), 960 - 400);
  const result = frameGuard.guard(states, { frame: FRAME, anchor: { x: 960, y: 540 }, camera: { zoom: 2.4 }, allowTranslate: true });
  assert.ok(result.visible >= 0.5 - 1e-6, `visible ${result.visible}`);
});

test('guard ignores transparent letters', () => {
  const states = [letterState(960, 540, 100, 50), letterState(5000, 5000, 400, 400, { opacity: 0.01 })];
  const result = frameGuard.guard(states, { frame: FRAME, anchor: { x: 960, y: 540 } });
  assert.equal(result.corrected, 0);
  assert.equal(result.visible, 1);
});

// --- motion integration ------------------------------------------------------

const SIZE = 96;

function makeScene(lines, styles, options) {
  const size = (options && options.size) || SIZE;
  const lineHeight = size * 1.2;
  const letters = [];
  let blockWidth = 0;
  lines.forEach((text, lineIdx) => {
    let pen = 0;
    for (let i = 0; i < text.length; i += 1) {
      const width = size * 0.6;
      letters.push({
        path: `cue:c1/beat:c1:single0/line:${lineIdx}/word:${i}/letter:0`,
        cueId: 'c1',
        beatId: 'c1:single0',
        lineIdx,
        wordIdx: i,
        letterIdx: 0,
        globalIdx: letters.length,
        char: text[i],
        local: { x: pen, y: (lineIdx + 1) * lineHeight, w: width, h: size, cx: pen + width / 2, cy: (lineIdx + 0.5) * lineHeight, penX: pen, penY: (lineIdx + 1) * lineHeight },
        bbox: { x1: 0, y1: -size, x2: width, y2: 0 },
        outlineLength: 400,
      });
      pen += width;
    }
    blockWidth = Math.max(blockWidth, pen);
  });
  return {
    cueId: 'c1',
    beatId: 'c1:single0',
    kind: 'single',
    start: 0,
    end: 10,
    text: lines.join('\n'),
    style: styles || {},
    letters,
    blockBBox: { x1: 0, y1: 0, x2: blockWidth, y2: lines.length * lineHeight },
    size,
    direction: 'horizontal',
  };
}

function evaluate(scene, t, extra) {
  const beat = { id: 'c1:single0', cueId: 'c1', kind: 'single', start: 0, end: 10, text: scene.text };
  return motion.evaluateBeat(scene, t, { frame: FRAME, seed: 42, beat, ...(extra || {}) });
}

function assertVisible(result, label) {
  assert.ok(result.envelopes.guardVisible >= 0.5 - 1e-6, `${label}: visible ${result.envelopes.guardVisible}`);
  for (const letter of result.letters) {
    assert.ok(Number.isFinite(letter.x) && Number.isFinite(letter.y) && Number.isFinite(letter.scaleX), `${label}: finite`);
  }
}

test('fillScreen stays visible at a large fill', () => {
  const scene = makeScene(['ABCDEFGHIJKL', 'MNOPQRSTUVWX'], { hold: [{ type: 'fillScreen', params: { fill: 3, mode: 'grow', period: 1, speed: 1 } }] }, { size: 160 });
  assertVisible(evaluate(scene, 5), 'fillScreen');
});

test('fontSize to 6 stays visible', () => {
  const scene = makeScene(['ABCDEFGH', 'IJKLMNOP'], { hold: [{ type: 'fontSize', params: { from: 1, to: 6, mode: 'grow', period: 1 } }] });
  assertVisible(evaluate(scene, 5), 'fontSize');
});

test('a full offset is clamped by the safe area', () => {
  const scene = makeScene(['HELLO'], { location: { type: 'center', params: { offsetX: 1, offsetY: -1 } } });
  assertVisible(evaluate(scene, 5), 'offset');
});

test('four lower-third lines at size 320 stay half visible (item 11)', () => {
  const scene = makeScene(['LINE ONE', 'LINE TWO', 'LINE THREE', 'LINE FOUR'], { location: { type: 'lowerThird', params: {} } }, { size: 320 });
  assertVisible(evaluate(scene, 5), 'lowerThird');
});

test('a large stackOffset stays half visible', () => {
  const scene = makeScene(['STACKED LINE'], {}, { size: 200 });
  assertVisible(evaluate(scene, 5, { stackOffset: 900 }), 'stackOffset');
});

test('a zoomPunch camera keeps the text half visible', () => {
  const scene = makeScene(['CAMERA TEST'], {}, { size: 320 });
  const extent = camera.maxExtent({ move: 'zoomPunch', amount: 1 });
  assert.ok(extent.zoom > 2);
  assertVisible(evaluate(scene, 5, { camera: extent }), 'zoomPunch');
});

test('an entering offscreenEdges layout is not translated into view', () => {
  const scene = makeScene(['ABCDE', 'FGHIJ'], { layout: { type: 'row', params: { from: 'offscreenEdges' } }, enter: { type: 'fade', motion: { in: { duration: 1 } } } });
  const result = evaluate(scene, 0.1);
  assert.equal(result.envelopes.guarded, 0, 'no correction during the entrance');
  const xs = result.letters.map((letter) => letter.x);
  const ys = result.letters.map((letter) => letter.y);
  const outside = xs.some((x) => x < -10 || x > FRAME.width + 10) || ys.some((y) => y < -10 || y > FRAME.height + 10);
  assert.ok(outside, 'the letters still start at the frame edges');
});
