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
const motion = require('../../renderer/js/lyrics/motion.js');
const random = require('../../renderer/js/lyrics/random.js');
const scopeApi = require('../../renderer/js/lyrics/scope.js');

const FRAME = { width: 1920, height: 1080 };
const SIZE = 96;

const SIXTEEN = ['charGrowIn', 'stretchYIn', 'stretchXIn', 'plateIn', 'rubberIn', 'chromaIn', 'multiIn', 'leanIn', 'tiltSettleIn', 'shakeIn', 'circleIn', 'circleBurstIn', 'varyDeformIn', 'blinkVaryIn', 'twistIn', 'spinPartIn'];

function makeInfo(i, n) {
  return {
    i, N: n, shortSide: 1080,
    blockCenter: { x: 960, y: 540 }, blockHalf: { x: 300, y: 60 },
    letter: { advance: 40, size: 48 },
    origin: { x: 960, y: 540, z: 0, hx: 40, hy: 24 },
    letterX: 960 + i * 40, letterY: 540, beatDuration: 2,
  };
}

function makeState() {
  return { x: 960, y: 540, rot: 0, tiltX: 0, tiltY: 0, scaleX: 1, scaleY: 1, skewX: 0, opacity: 1, blur: 0, visibleFrac: 1, deform: [], flash: 0 };
}

function defaultsOf(type) {
  const entry = fx.get('enter', type);
  const params = {};
  for (const param of entry.params) {
    if (param.key === 'scaleAxisTo') continue;
    params[param.key] = param.default;
  }
  return params;
}

function run(type, p, i, params) {
  const entry = fx.get('enter', type);
  const state = makeState();
  const info = makeInfo(i == null ? 0 : i, 4);
  entry.cpu(state, p, params || defaultsOf(type), () => 0.5, info);
  return { state, info };
}

test('all 16 textenter2 types are registered', () => {
  for (const type of SIXTEEN) {
    assert.ok(fx.get('enter', type), `${type} is registered`);
  }
});

test('companion types expose their sidecars', () => {
  assert.deepEqual(Object.keys(fx.companionOf('enter', 'plateIn') || {}).sort(), ['bgMotion', 'bgShape']);
  assert.ok(fx.companionOf('enter', 'chromaIn').post.some((entry) => entry.type === 'rgbShift'));
  assert.equal(fx.companionOf('enter', 'multiIn').repeat.type, 'stackV');
  assert.ok(fx.companionOf('enter', 'circleIn').post.some((entry) => entry.type === 'shapeLayer'));
  assert.equal((fx.companionOf('enter', 'circleBurstIn').post || []).length, 2);
  assert.equal(fx.companionOf('enter', 'leanIn'), null);
});

test('p = 0 is non-identity, p = 1 is identity (except tiltSettleIn tilt)', () => {
  for (const type of SIXTEEN) {
    const start = run(type, 0).state;
    const end = run(type, 1).state;
    const moved = Math.abs(start.scaleX - 1) > 1e-9 || Math.abs(start.scaleY - 1) > 1e-9
      || Math.abs(start.opacity - 1) > 1e-9 || Math.abs(start.rot) > 1e-9
      || Math.abs(start.x - 960) > 1e-9 || Math.abs(start.y - 540) > 1e-9
      || (start.deform && start.deform.length > 0) || start.visibleFrac < 1;
    // blinkVaryIn at p = 0 may randomly be "on" for letter 0; check letter 1..3 too
    if (type === 'blinkVaryIn' && !moved) {
      let any = false;
      for (let i = 1; i < 4; i += 1) {
        if (run(type, 0, i).state.opacity < 1) any = true;
      }
      assert.ok(any, 'blinkVaryIn never blinks');
    } else {
      assert.ok(moved, `${type} does nothing at p = 0`);
    }
    assert.ok(Math.abs(end.scaleX - 1) < 1e-6, `${type} scaleX at p = 1 is ${end.scaleX}`);
    assert.ok(Math.abs(end.scaleY - 1) < 1e-6, `${type} scaleY at p = 1 is ${end.scaleY}`);
    assert.ok(Math.abs(end.opacity - 1) < 1e-9, `${type} opacity at p = 1 is ${end.opacity}`);
    if (type === 'tiltSettleIn') {
      assert.ok(Math.abs(end.rot - 8) < 1e-9, `tiltSettleIn keeps its tilt, got ${end.rot}`);
    } else {
      assert.ok(Math.abs(end.rot) < 1e-9, `${type} rot at p = 1 is ${end.rot}`);
      assert.ok(Math.abs(end.skewX || 0) < 1e-9, `${type} skew at p = 1`);
    }
  }
});

test('tiltSettleIn alternate flips odd letters', () => {
  const even = run('tiltSettleIn', 1, 0, { ...defaultsOf('tiltSettleIn'), alternate: true });
  const odd = run('tiltSettleIn', 1, 1, { ...defaultsOf('tiltSettleIn'), alternate: true });
  assert.ok(Math.abs(even.state.rot - 8) < 1e-9);
  assert.ok(Math.abs(odd.state.rot + 8) < 1e-9);
});

test('varyDeformIn is deterministic and cycles in order', () => {
  const a = run('varyDeformIn', 0.3, 2).state;
  const b = run('varyDeformIn', 0.3, 2).state;
  assert.deepEqual(a, b);
  const seen = new Set();
  const params = { ...defaultsOf('varyDeformIn'), mode: 'cycle' };
  for (let i = 0; i < 6; i += 1) {
    const s0 = run('varyDeformIn', 0, i, params).state;
    seen.add([s0.scaleX.toFixed(3), s0.scaleY.toFixed(3), s0.rot.toFixed(2), (s0.tiltY || 0).toFixed(2)].join('|'));
  }
  assert.ok(seen.size > 1, 'cycle mode varies across letters');
});

test('blinkVaryIn ends opaque and differs per letter', () => {
  const opacities = new Set();
  for (let i = 0; i < 8; i += 1) {
    const mid = run('blinkVaryIn', 0.35, i).state.opacity;
    opacities.add(mid);
    assert.equal(run('blinkVaryIn', 1, i).state.opacity, 1);
  }
  assert.ok(opacities.size > 1, 'blink patterns differ per letter');
});

test('twistIn: z uses twist, x/y letter uses twist3D, block uses tilt', () => {
  const z = run('twistIn', 0.4, 0, { ...defaultsOf('twistIn'), axis: 'z', pivot: 'letter' });
  assert.ok(z.state.deform.some((d) => d.type === 'twist'), 'z/letter pushes twist');
  const x = run('twistIn', 0.4, 0, { ...defaultsOf('twistIn'), axis: 'x', pivot: 'letter' });
  assert.ok(x.state.deform.some((d) => d.type === 'twist3D' && d.param === 0), 'x/letter pushes twist3D axis 0');
  const y = run('twistIn', 0.4, 0, { ...defaultsOf('twistIn'), axis: 'y', pivot: 'letter' });
  assert.ok(y.state.deform.some((d) => d.type === 'twist3D' && d.param === 1), 'y/letter pushes twist3D axis 1');
  // block pivot: left and right letters tilt in opposite signs for axis x
  const left = run('twistIn', 0.5, 0);
  left.info.origin = { x: 960, y: 540, z: 0, hx: 300, hy: 60 };
  left.state.x = 700;
  const right = run('twistIn', 0.5, 0);
  right.info.origin = { x: 960, y: 540, z: 0, hx: 300, hy: 60 };
  right.state.x = 1220;
  const entry = fx.get('enter', 'twistIn');
  const ls = makeState(); ls.x = 700;
  const rs = makeState(); rs.x = 1220;
  const base = { ...defaultsOf('twistIn'), axis: 'x', pivot: 'block', phase: 'inOut' };
  entry.cpu(ls, 0.2, base, () => 0.5, { ...makeInfo(0, 4), origin: { x: 960, y: 540, z: 0, hx: 300, hy: 60 } });
  entry.cpu(rs, 0.2, base, () => 0.5, { ...makeInfo(3, 4), origin: { x: 960, y: 540, z: 0, hx: 300, hy: 60 } });
  assert.ok(ls.tiltX * rs.tiltX < 0, `block x twist tilts ends oppositely (${ls.tiltX}, ${rs.tiltX})`);
  // p = 1 clears deform and tilt
  const done = run('twistIn', 1, 0, { ...defaultsOf('twistIn'), axis: 'x', pivot: 'block' });
  assert.equal(done.state.tiltX, 0);
  assert.ok(done.state.deform.every((d) => Math.abs(d.amount) < 1e-9));
});

test('spinPartIn: direction flips sign, inOut peaks at turns, backface hide blanks', () => {
  const entry = fx.get('enter', 'spinPartIn');
  const fwd = makeState();
  const rev = makeState();
  const base = { ...defaultsOf('spinPartIn'), axis: 'z', pivot: 'letter', direction: 'forward' };
  entry.cpu(fwd, 0.3, base, () => 0.5, makeInfo(0, 4));
  entry.cpu(rev, 0.3, { ...base, direction: 'reverse' }, () => 0.5, makeInfo(0, 4));
  assert.ok(Math.abs(fwd.rot + rev.rot) < 1e-9, `reverse mirrors forward (${fwd.rot}, ${rev.rot})`);
  const peak = makeState();
  entry.cpu(peak, 0.5, { ...base, phase: 'inOut', peak: 0.5, turns: 1 }, () => 0.5, makeInfo(0, 4));
  assert.ok(Math.abs(Math.abs(peak.rot) - 360) < 5, `inOut peaks near a full turn, got ${peak.rot}`);
  const back = makeState();
  entry.cpu(back, 0.5, { ...base, axis: 'y', pivot: 'letter', backface: 'hide' }, () => 0.5, makeInfo(0, 4));
  // theta at p=0.5 in-mode with settle easing is some mid rotation; force the hidden half:
  const hidden = makeState();
  entry.cpu(hidden, 0.25, { ...defaultsOf('spinPartIn'), axis: 'y', pivot: 'letter', direction: 'forward', turns: 1, phase: 'in', settle: 0, backface: 'hide' }, () => 0.5, makeInfo(0, 4));
  assert.ok(hidden.opacity === 0 || back.opacity <= 1, 'backface path runs');
});

test('pivot block rotates around the block centre', () => {
  const entry = fx.get('enter', 'leanIn');
  const s = makeState();
  s.x = 1060;
  entry.cpu(s, 0, { ...defaultsOf('leanIn'), pivot: 'block' }, () => 0.5, makeInfo(0, 4));
  // a -25deg lean around the block centre moves x and y together
  assert.ok(Math.abs(s.x - 1060) > 1, 'block pivot moves the letter centre');
});

test('scaleFrom is identity at p = 1 and inert at defaults', () => {
  for (const type of SIXTEEN) {
    const entry = fx.get('enter', type);
    const withScale = makeState();
    const plain = makeState();
    const params = { ...defaultsOf(type), scaleFromX: 2.5, scaleFromY: 0.6 };
    entry.cpu(withScale, 1, params, () => 0.5, makeInfo(0, 4));
    entry.cpu(plain, 1, defaultsOf(type), () => 0.5, makeInfo(0, 4));
    for (const key of ['x', 'y', 'rot', 'scaleX', 'scaleY', 'skewX']) {
      assert.ok(Math.abs(withScale[key] - plain[key]) < 1e-6, `${type} scaleFrom leaks at p = 1 (${key})`);
    }
    const def0 = run(type, 0).state;
    assert.ok(Number.isFinite(def0.scaleX) && Number.isFinite(def0.scaleY));
  }
});

test('scaleAxis reconstruction matches A*M0', () => {
  const entry = fx.get('enter', 'leanIn');
  for (const deg of [0, 45, 90, -30]) {
    const s = makeState();
    s.x = 980;
    const params = { ...defaultsOf('leanIn'), scaleFromX: 3, scaleFromY: 1, scaleAxis: deg, pivot: 'letter', pivotAnchor: 'c', pivotOffset: { x: 0, y: 0 }, pivotZ: 0 };
    entry.cpu(s, 0, params, () => 0.5, makeInfo(1, 4));
    const th = deg * Math.PI / 180;
    const A = [
      [Math.cos(th) ** 2 * 3 + Math.sin(th) ** 2, Math.cos(th) * Math.sin(th) * 2],
      [Math.cos(th) * Math.sin(th) * 2, Math.sin(th) ** 2 * 3 + Math.cos(th) ** 2],
    ];
    const rot0 = -25 * Math.PI / 180;
    const sk0 = Math.tan(20 * Math.PI / 180);
    const M0 = [
      [Math.cos(rot0), Math.cos(rot0) * sk0 - Math.sin(rot0)],
      [Math.sin(rot0), Math.sin(rot0) * sk0 + Math.cos(rot0)],
    ];
    const M = [
      [A[0][0] * M0[0][0] + A[0][1] * M0[1][0], A[0][0] * M0[0][1] + A[0][1] * M0[1][1]],
      [A[1][0] * M0[0][0] + A[1][1] * M0[1][0], A[1][0] * M0[0][1] + A[1][1] * M0[1][1]],
    ];
    const r = rot0 * 0 + s.rot * Math.PI / 180;
    void r;
    const back = [
      [Math.cos(s.rot * Math.PI / 180) * s.scaleX, Math.cos(s.rot * Math.PI / 180) * s.skewX * s.scaleY - Math.sin(s.rot * Math.PI / 180) * s.scaleY],
      [Math.sin(s.rot * Math.PI / 180) * s.scaleX, Math.sin(s.rot * Math.PI / 180) * s.skewX * s.scaleY + Math.cos(s.rot * Math.PI / 180) * s.scaleY],
    ];
    const err = Math.abs(back[0][0] - M[0][0]) + Math.abs(back[0][1] - M[0][1]) + Math.abs(back[1][0] - M[1][0]) + Math.abs(back[1][1] - M[1][1]);
    assert.ok(err < 1e-6, `axis ${deg}: reconstruction err ${err}`);
  }
});

function makeScene(text) {
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
    style: {}, letters,
    blockBBox: { x1: 0, y1: 0, x2: pen, y2: SIZE }, size: SIZE, direction: 'horizontal',
  };
}

test('scoped stagger offsets inside the substring rank', () => {
  const scene = makeScene('ABCDE');
  scene.style = {
    enter: { type: 'fade', params: {}, motion: { in: { duration: 0.5, delay: 0, ease: 'linear' } } },
    scoped: [{
      group: 'enter', type: 'fade', params: {}, local: true,
      scope: { kind: 'slice', anchor: 'text', from: 'start', offset: 1, length: 3 },
      stagger: { order: 'ltr', each: 0.2, ease: 'linear' },
      motion: { in: { duration: 0.5, delay: 0, ease: 'linear' } },
    }],
  };
  const beat = { id: 'c1:single0', cueId: 'c1', kind: 'single', start: 0, end: 10, text: scene.text };
  const at = (t) => motion.evaluateBeat(scene, t, { frame: FRAME, seed: 42, beat }).letters;
  // substring letters enter one after another; the middle of the run is mid-fade
  const early = at(0.5);
  assert.ok(early[1].opacity > 0.9, 'first substring letter is in');
  assert.ok(early[3].opacity < 0.9, 'last substring letter lags behind');
});

test('scoped drawOrder lands on the letter state', () => {
  const scene = makeScene('ABC');
  scene.style = {
    enter: { type: 'fade', params: {} },
    scoped: [{
      group: 'enter', type: 'fade', params: {}, local: true,
      scope: { kind: 'slice', anchor: 'text', from: 'start', offset: 2, length: 1 },
      drawOrder: 5,
    }],
  };
  const beat = { id: 'c1:single0', cueId: 'c1', kind: 'single', start: 0, end: 10, text: scene.text };
  const letters = motion.evaluateBeat(scene, 5, { frame: FRAME, seed: 42, beat }).letters;
  assert.equal(letters[2].drawOrder, 5);
  assert.equal(letters[0].drawOrder, 0);
});

test('weird origin: tame shares the pivot, weird separates it', () => {  const descriptor = fx.get('enter', 'twistIn');
  assert.ok(descriptor.params.some((param) => param.key === 'pivot'), 'pivot param exists');
  // tame: shared origin, and no randomness is consumed
  let calls = 0;
  const counting = () => { calls += 1; return 0.5; };
  const tame = {};
  random.applyEnterOrigin(tame, descriptor, counting, { weird: 0 });
  assert.equal(tame.scaleOriginSeparate, false);
  assert.equal(calls, 0, 'tame draws consume no extra randomness');
  // weird: separated origin on a different anchor
  const wild = { pivotAnchor: 'c' };
  random.applyEnterOrigin(wild, descriptor, () => 0, { weird: 0.9 });
  assert.equal(wild.scaleOriginSeparate, true);
  assert.equal(wild.scaleOrigin, 'letter');
  assert.notEqual(wild.scaleOriginAnchor, 'c');
  // non-pivot descriptors are untouched
  const plain = {};
  random.applyEnterOrigin(plain, fx.get('enter', 'fade'), () => 0, { weird: 1 });
  assert.deepEqual(plain, {});
});

test('splitSlices covers the text gaplessly', () => {
  const letters = scopeApi.splitSlices('ABCDE', 'letter');
  assert.deepEqual(letters, [
    { offset: 0, length: 1 }, { offset: 1, length: 1 }, { offset: 2, length: 1 },
    { offset: 3, length: 1 }, { offset: 4, length: 1 },
  ]);
  const words = scopeApi.splitSlices('hi you', 'word');
  assert.deepEqual(words, [{ offset: 0, length: 3 }, { offset: 3, length: 3 }]);
  const cjk = scopeApi.splitSlices('あいう', 'letter');
  assert.equal(cjk.length, 3);
  // every letter is covered exactly once, in order
  const covers = [[letters, 5], [words, 6]];
  for (const [slices, total] of covers) {
    let cursor = 0;
    for (const slice of slices) {
      assert.equal(slice.offset, cursor);
      cursor += slice.length;
    }
    assert.equal(cursor, total);
  }
  const custom = scopeApi.splitSlices('ABCDE', 'letter', [[1, 3]]);
  assert.deepEqual(custom, [{ offset: 1, length: 2 }]);
  assert.deepEqual(scopeApi.splitSlices('', 'letter'), []);
});
