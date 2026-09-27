'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Load the descriptors so the registry knows the effect CPU functions.
const fx = require('../../renderer/js/lyrics/effects/registry.js');
require('../../renderer/js/lyrics/effects/animation.js');
require('../../renderer/js/lyrics/effects/layout.js');
require('../../renderer/js/lyrics/effects/enter.js');
require('../../renderer/js/lyrics/effects/exit.js');
require('../../renderer/js/lyrics/effects/hold.js');
require('../../renderer/js/lyrics/effects/location.js');
const motion = require('../../renderer/js/lyrics/motion.js');

const FRAME = { width: 1920, height: 1080 };
const SIZE = 96;

function makeScene(text, styles) {
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

function evaluate(scene, t, extra) {
  const beat = { id: 'c1:single0', cueId: 'c1', kind: 'single', start: 0, end: 10, text: scene.text };
  return motion.evaluateBeat(scene, t, { frame: FRAME, seed: 42, beat, ...(extra || {}) });
}

function assertFinite(result, label) {
  for (const state of result.letters) {
    for (const key of ['x', 'y', 'rot', 'scaleX', 'scaleY', 'opacity', 'visibleFrac', 'tiltX', 'tiltY']) {
      assert.ok(Number.isFinite(state[key]), `${label}: ${key} is ${state[key]}`);
    }
  }
}

test('fade enter starts transparent and ends opaque', () => {
  const scene = makeScene('ABCDE');
  const start = evaluate(scene, 0);
  assert.equal(start.letters[0].opacity, 0);
  const offsetMax = 0.035 * 4;
  const end = evaluate(scene, 0.5 + offsetMax + 0.01);
  for (const state of end.letters) assert.ok(state.opacity > 0.99, `opacity ${state.opacity}`);
  assertFinite(end, 'fade');
});

test('stagger ltr and rtl order the letters differently', () => {
  const scene = makeScene('ABCDE');
  const ltr = evaluate(scene, 0.2);
  const rtlScene = makeScene('ABCDE', { animation: { type: 'stagger', params: { order: 'rtl' } } });
  const rtl = evaluate(rtlScene, 0.2);
  assert.ok(ltr.letters[0].opacity > rtl.letters[0].opacity, 'rtl leaves the first letter for last');
  assert.ok(ltr.letters[4].opacity < rtl.letters[4].opacity, 'rtl starts the last letter first');
});

test('exit keeps the enter order by default and reverses on request', () => {
  const scene = makeScene('ABCDE', {
    enter: { type: 'fade', motion: { in: { duration: 0.4 } } },
    exit: { type: 'fade', motion: { out: { duration: 1 } } },
  });
  const time = 10 - 1 - 0.035 * 4 * 0.5;
  const result = evaluate(scene, time);
  assert.ok(result.letters[0].px > 0, 'first letter exits first');
  assert.equal(result.letters[4].px, 0, 'last letter still visible');
  const reversed = makeScene('ABCDE', {
    enter: { type: 'fade', motion: { in: { duration: 0.4 } } },
    exit: { type: 'fade', motion: { out: { duration: 1 } } },
    animation: { type: 'stagger', params: { exitOrder: 'reverse' } },
  });
  const reversedResult = evaluate(reversed, time);
  assert.equal(reversedResult.letters[0].px, 0, 'first letter stays');
  assert.ok(reversedResult.letters[4].px > 0, 'last letter exits first');
});

test('slide enter offsets the letter by the requested distance', () => {
  const scene = makeScene('AB', {
    enter: { type: 'slide', params: { dir: 'up', distance: 0.5 }, motion: { in: { duration: 1, delay: 0, ease: 'linear' } } },
    animation: { type: 'simultaneous' },
  });
  const atStart = evaluate(scene, 0);
  const atEnd = evaluate(scene, 1.01);
  const delta = atEnd.letters[0].y - atStart.letters[0].y;
  assert.ok(Math.abs(delta - 0.5 * 1080) < 1, `delta ${delta}`);
});

test('hold effects are applied inside the envelope', () => {
  const scene = makeScene('ABCDE', {
    hold: [{ type: 'floatBob', params: { amp: 0.05, speed: 0.5 }, motion: { in: { duration: 0.01 }, out: { duration: 0.01 } } }],
  });
  const base = evaluate(makeScene('ABCDE'), 4);
  const bob = evaluate(scene, 4);
  assertFinite(bob, 'floatBob');
  const movement = Math.abs(bob.letters[0].y - base.letters[0].y);
  assert.ok(movement > 0.1, `movement ${movement}`);
  assert.ok(movement <= 0.05 * 1080 + 1, `movement ${movement}`);
});

test('location lowerThird anchors the block at the lower third', () => {
  const scene = makeScene('ABCDE', { location: { type: 'lowerThird' }, animation: { type: 'simultaneous' } });
  const result = evaluate(scene, 5);
  const mean = result.letters.reduce((sum, state) => sum + state.y, 0) / result.letters.length;
  assert.ok(Math.abs(mean - 0.78 * FRAME.height) < SIZE, `mean y ${mean}`);
});

test('overrides add transforms at the beat level', () => {
  const scene = makeScene('AB');
  const base = evaluate(scene, 5);
  const project = { overrides: { 'cue:c1/beat:c1:single0': { transform: { x: 100, scale: 2 } } } };
  const overridden = evaluate(scene, 5, { project });
  assert.ok(Math.abs(overridden.letters[0].x - base.letters[0].x - 100) < 1e-6);
  assert.ok(Math.abs(overridden.letters[0].scaleX - base.letters[0].scaleX * 2) < 1e-6);
});

test('keyframes interpolate additively with the starting ease', () => {
  const scene = makeScene('AB');
  const base = evaluate(scene, 5);
  const project = { keyframes: { 'cue:c1/beat:c1:single0': { 'transform.y': [{ t: 0, value: 0, ease: 'linear' }, { t: 10, value: 200, ease: 'linear' }] } } };
  const keyed = evaluate(scene, 5, { project });
  assert.ok(Math.abs(keyed.letters[0].y - base.letters[0].y - 100) < 1e-6, `delta ${keyed.letters[0].y - base.letters[0].y}`);
});

test('circle layout puts the letters around the anchor', () => {
  const scene = makeScene('ABCDE', { layout: { type: 'circle', params: { radius: 0.3 } }, animation: { type: 'simultaneous' } });
  const result = evaluate(scene, 5);
  assertFinite(result, 'circle');
  const meanX = result.letters.reduce((sum, state) => sum + state.x, 0) / result.letters.length;
  const meanY = result.letters.reduce((sum, state) => sum + state.y, 0) / result.letters.length;
  assert.ok(Math.abs(meanX - FRAME.width / 2) < 1, `mean x ${meanX}`);
  assert.ok(Math.abs(meanY - FRAME.height / 2) < 1, `mean y ${meanY}`);
  for (const state of result.letters) {
    const distance = Math.hypot(state.x - meanX, state.y - meanY);
    assert.ok(Math.abs(distance - 0.3 * 1080) < 1, `distance ${distance}`);
  }
});

test('formation start positions blend to the target', () => {
  const scene = makeScene('ABCDE', {
    layout: { type: 'row', params: { from: 'point', curve: 0 }, motion: { in: { duration: 1, delay: 0, ease: 'linear' } } },
    enter: { type: 'fade', motion: { in: { duration: 0.01 } } },
    animation: { type: 'simultaneous' },
  });
  const atStart = evaluate(scene, 0);
  const target = evaluate(scene, 1.1);
  const startSpread = Math.max(...atStart.letters.map((state) => Math.abs(state.x - atStart.letters[0].x)));
  const targetSpread = Math.max(...target.letters.map((state) => Math.abs(state.x - target.letters[0].x)));
  assert.ok(startSpread < 1, `letters start together: ${startSpread}`);
  assert.ok(targetSpread > 100, `letters spread out: ${targetSpread}`);
});

test('previousCue start positions come from the previous beat', () => {
  const scene = makeScene('ABCDE', {
    layout: { type: 'row', params: { from: 'previousCue' }, motion: { in: { duration: 1, delay: 0, ease: 'linear' } } },
    enter: { type: 'fade', motion: { in: { duration: 0.01 } } },
    animation: { type: 'simultaneous' },
  });
  const previousPositions = scene.letters.map((letter, index) => ({ x: 100 + index * 50, y: 200, rot: 0, scale: 1 }));
  const atStart = evaluate(scene, 0, { previousPositions });
  assert.ok(Math.abs(atStart.letters[2].x - (100 + 2 * 50)) < 1, `x ${atStart.letters[2].x}`);
  assert.ok(Math.abs(atStart.letters[2].y - 200) < 1, `y ${atStart.letters[2].y}`);
});

test('every enter and exit type evaluates without NaN', () => {
  for (const descriptor of fx.list('enter')) {
    const scene = makeScene('ABCDE', { enter: { type: descriptor.type, params: {}, motion: { in: { duration: 0.6 } } } });
    for (const time of [0, 0.2, 1, 5, 9.6, 10]) assertFinite(evaluate(scene, time), `enter ${descriptor.type} @${time}`);
  }
  for (const descriptor of fx.list('exit')) {
    const scene = makeScene('ABCDE', { exit: { type: descriptor.type, params: {}, motion: { out: { duration: 0.6 } } } });
    for (const time of [0, 0.2, 1, 5, 9.6, 10]) assertFinite(evaluate(scene, time), `exit ${descriptor.type} @${time}`);
  }
});

test('every hold type evaluates without NaN', () => {
  for (const descriptor of fx.list('hold')) {
    const scene = makeScene('ABCDE', { hold: [{ type: descriptor.type, params: {} }] });
    for (const time of [0.5, 2, 5, 9.5]) assertFinite(evaluate(scene, time), `hold ${descriptor.type} @${time}`);
  }
});

test('every animation type evaluates without NaN', () => {
  for (const descriptor of fx.list('animation')) {
    const scene = makeScene('ABCDE', { animation: { type: descriptor.type, params: {} } });
    for (const time of [0.1, 1, 5, 9.9]) assertFinite(evaluate(scene, time), `animation ${descriptor.type} @${time}`);
  }
});

test('every layout type and location type evaluates without NaN', () => {
  for (const descriptor of fx.list('layout')) {
    const scene = makeScene('ABCDE', { layout: { type: descriptor.type, params: {} } });
    for (const time of [0.2, 5]) assertFinite(evaluate(scene, time), `layout ${descriptor.type} @${time}`);
  }
  for (const descriptor of fx.list('location')) {
    const scene = makeScene('ABCDE', { location: { type: descriptor.type, params: {} } });
    for (const time of [0.2, 5]) assertFinite(evaluate(scene, time), `location ${descriptor.type} @${time}`);
  }
});

test('custom motions run only inside their own window', () => {
  const base = { enter: { type: 'fade', motion: { in: { duration: 0.01, delay: 0, ease: 'linear' } }, params: {} }, animation: { type: 'simultaneous' } };
  const plain = makeScene('AB', base);
  const withMotion = makeScene('AB', {
    ...base,
    motions: [{ id: 'm1', phase: 'hold', type: 'floatBob', from: 'start', delay: 1, duration: 0.8, params: { amp: 0.05, speed: 0.5 } }],
  });
  const before = evaluate(withMotion, 0.5);
  const during = evaluate(withMotion, 1.4);
  const after = evaluate(withMotion, 2.5);
  assertFinite(during, 'custom hold');
  for (let i = 0; i < before.letters.length; i += 1) {
    assert.ok(Math.abs(before.letters[i].x - evaluate(plain, 0.5).letters[i].x) < 1e-9, 'motion leaked before its window');
    assert.ok(Math.abs(after.letters[i].x - evaluate(plain, 2.5).letters[i].x) < 1e-9, 'motion leaked after its window');
  }
  const moved = during.letters.some((state, i) => Math.abs(state.x - before.letters[i].x) > 1e-6 || Math.abs(state.y - before.letters[i].y) > 1e-6);
  assert.ok(moved, 'hold motion did not move the letters');
});

test('custom exit motions move the letters toward the end', () => {
  const scene = makeScene('AB', {
    enter: { type: 'fade', motion: { in: { duration: 0.01 } } },
    animation: { type: 'simultaneous' },
    motions: [{ id: 'm2', phase: 'exit', type: 'slide', from: 'end', delay: -0.5, duration: 0.5, ease: 'linear', params: { dir: 'down', distance: 0.3 } }],
  });
  const midway = evaluate(scene, 9.75);
  const end = evaluate(scene, 9.99);
  assertFinite(end, 'custom exit');
  assert.ok(end.letters[0].y > midway.letters[0].y, `y did not move down (${midway.letters[0].y} -> ${end.letters[0].y})`);
});

test('motion presets reference registered effects and valid phases', () => {
  const presets = motion.motionPresets();
  assert.ok(presets.length >= 20);
  for (const preset of presets) {
    assert.ok(['entrance', 'emphasis', 'exit'].includes(preset.group), preset.id);
    assert.ok(['enter', 'hold', 'exit'].includes(preset.phase), preset.id);
    assert.ok(fx.get(preset.phase, preset.type), `${preset.id} has no ${preset.phase}.${preset.type}`);
    assert.ok(Number.isFinite(preset.duration) && preset.duration > 0, preset.id);
  }
});

test('every motion preset evaluates without NaN', () => {
  for (const preset of motion.motionPresets()) {
    const scene = makeScene('ABCDE', {
      animation: { type: 'simultaneous' },
      motions: [{ ...preset, params: {} }],
    });
    for (const time of [0, 0.2, 5, 9.8, 10]) assertFinite(evaluate(scene, time), `preset ${preset.id} @${time}`);
  }
});

test('stagger ranks support every documented order', () => {
  const letters = makeScene('ABCDEFGH').letters;
  for (const order of ['ltr', 'rtl', 'center-out', 'edges-in', 'random', 'word', 'line', 'strokeLength', 'oddEven', 'vertical-reading']) {
    const result = motion.staggerRanks(letters, order, 0.5, () => 0.5);
    assert.equal(result.ranks.length, letters.length, order);
    assert.ok(Number.isFinite(result.max) && result.max >= 0, order);
    for (const rank of result.ranks) assert.ok(Number.isFinite(rank) && rank >= 0, `${order} rank ${rank}`);
  }
  const rtl = motion.staggerRanks(letters, 'rtl', 0.5, () => 0.5).ranks;
  assert.ok(rtl[0] > rtl[rtl.length - 1], 'rtl inverts the order');
  const stroke = motion.staggerRanks(letters, 'strokeLength', 0.5, () => 0.5).ranks;
  assert.ok(stroke[letters.length - 1] === 0 || stroke[letters.length - 1] > stroke[0], 'stroke length uses the outline');
});
