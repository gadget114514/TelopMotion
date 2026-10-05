'use strict';

// The shader pack (dither / fade / scanline / stealth / geometry) exists twice:
// as a `post` type backed by a branch of the post fragment shader, and as a
// per-letter motion in `enter` / `hold` / `exit`. The GPU side cannot run here,
// so the shader branches are pinned by name and the JS side is exercised for
// registration, uniform ranges and finite per-letter state.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const effectsDir = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');

const fx = require(path.join(effectsDir, 'registry.js'));
require(path.join(effectsDir, 'animation.js'));
require(path.join(effectsDir, 'layout.js'));
require(path.join(effectsDir, 'enter.js'));
require(path.join(effectsDir, 'exit.js'));
require(path.join(effectsDir, 'hold.js'));
const pack = require(path.join(effectsDir, 'shader-fx.js'));
require(path.join(effectsDir, 'post.js'));
const easing = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'easing.js'));

const FAMILIES = ['dither', 'fade', 'scanline', 'stealth', 'geometry'];
const POST_FAMILIES = FAMILIES;
const PHASES = ['enter', 'exit', 'hold'];

function loadPostFrag() {
  const sandbox = { window: {} };
  sandbox.SA = sandbox.window.SA = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'shaders.js'), 'utf8'), sandbox);
  return sandbox.SA.glShaders.POST_FRAG;
}

function freshState() {
  return {
    x: 0, y: 0, z: 0, rot: 0, tiltX: 0, tiltY: 0,
    scaleX: 1, scaleY: 1, skewX: 0,
    opacity: 1, blur: 0, visibleFrac: 1,
    deform: [], represent: 'mesh', reprProgress: 1, colorMix: 0,
    wipeMode: 0, wipeSoft: 0, flash: 0, maskFrac: 1,
  };
}

function rng() {
  let seed = 0x2f6e2b1;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function assertFiniteState(state, label) {
  for (const key of ['x', 'y', 'rot', 'scaleX', 'scaleY', 'opacity', 'visibleFrac', 'flash', 'wipeSoft', 'wipeMode']) {
    assert.ok(Number.isFinite(state[key]), `${label}: ${key} is ${state[key]}`);
  }
  assert.ok(state.opacity >= 0 && state.opacity <= 1, `${label}: opacity out of range (${state.opacity})`);
}

test('every family is a post type with a shader branch', () => {
  const frag = loadPostFrag();
  for (const type of POST_FAMILIES) {
    const descriptor = fx.get('post', type);
    assert.ok(descriptor, `post.${type} is not registered`);
    assert.ok(descriptor.stackable, `post.${type} must be stackable`);
    const extension = fx.postExtensions && fx.postExtensions[type];
    assert.ok(extension, `post.${type} has no postExtensions entry`);
    assert.ok(extension.code >= 47 && extension.code <= 51, `post.${type} code ${extension.code} is outside the pack`);
    assert.match(frag, new RegExp(`type == ${extension.code}\\b`), `POST_FRAG has no branch for u_type ${extension.code}`);
    assert.match(frag, new RegExp(`// ${type}:\\s`), `POST_FRAG is missing the ${type} comment marker`);
    // the envelope controls every post instance gets, like post.js appends
    for (const key of ['enabled', 'in', 'out']) {
      assert.ok(descriptor.params.some((param) => param.key === key), `post.${type} is missing the ${key} control`);
    }
  }
});

test('the post codes do not collide with the built-in table', () => {
  for (const type of POST_FAMILIES) {
    assert.equal(fx.postTypes[type], undefined, `post.${type} also has a built-in code`);
  }
});

test('post uniforms stay finite and inside their ranges', () => {
  const contexts = [
    { envelope: 0, progress: 0, time: 0 },
    { envelope: 1, progress: 0.5, time: 1.75 },
    { envelope: 2, progress: 1, time: 9 },
  ];
  const samples = [
    {},
    { pattern: 'nope', mode: 'nope', levels: -5, cellSize: 0, strength: 99 },
    { pattern: 'bayer8', mode: 'duotone', levels: 2, cellSize: 12, strength: 0 },
    { shape: 'nope', sides: 99, size: 0, feather: 5, strokeWidth: -1 },
  ];
  for (const type of POST_FAMILIES) {
    const descriptor = fx.get('post', type);
    const defaults = fx.paramDefaults('post', type);
    for (const ctx of contexts) {
      for (const params of samples) {
        const instance = { type, params: { ...defaults, ...params } };
        const uniforms = fx.postUniforms(instance, ctx);
        assert.equal(uniforms.u_type, fx.postExtensions[type].code, `${type}: u_type`);
        assert.equal(uniforms.target, fx.postTarget(instance), `${type}: target`);
        for (const name of ['u_params', 'u_params2', 'u_params3', 'u_params4', 'u_colorA', 'u_colorB']) {
          const value = uniforms[name];
          if (!value) continue;
          for (const component of value) {
            assert.ok(Number.isFinite(component), `${type}: ${name} has ${component}`);
          }
        }
        assert.ok(uniforms.u_params[3] >= 0, `${type}: negative amount`);
      }
    }
    void descriptor;
  }
});

test('the fade post is a no-op at envelope 0 and completes at the beat end', () => {
  const defaults = fx.paramDefaults('post', 'fade');
  const build = (envelope, progress, mode) => fx.postUniforms(
    { type: 'fade', params: { ...defaults, mode } },
    { envelope, progress, time: 0 },
  ).u_params[3];
  assert.equal(build(0, 0, 'toBlack'), 0, 'a silent envelope must not fade anything');
  assert.equal(build(1, 0, 'toBlack'), 1, 'toBlack starts at the source and lands on black at the end of the beat');
  assert.equal(build(1, 1, 'toBlack'), 0, 'toBlack is back to the source at progress 1');
  const dip = fx.postUniforms(
    { type: 'fade', params: { ...defaults, mode: 'through' } },
    { envelope: 1, progress: 0.5, time: 0 },
  ).u_params[3];
  // the shader maps k through a triangle, so the midpoint is where the dip
  // bottoms out (level = 1 there)
  assert.equal(dip, 0.5, 'the dip is driven by the beat progress');
  assert.equal(build(1, 0.5, 'through'), 0.5);
  assert.equal(fx.postUniforms({ type: 'fade', params: { ...defaults, mode: 'through' } }, { envelope: 1, progress: 1, time: 0 }).u_params[3], 1, 'the dip returns to the source at the end of the beat');
});

test('every family is a per-letter motion in all three phases', () => {
  for (const type of FAMILIES) {
    for (const phase of PHASES) {
      const descriptor = fx.get(phase, type);
      assert.ok(descriptor, `${phase}.${type} is not registered`);
      assert.equal(typeof descriptor.cpu, 'function', `${phase}.${type} has no cpu hook`);
    }
  }
});

test('the per-letter motions stay finite across easings, envelopes and timings', () => {
  const curves = ['linear', 'easeOutCubic', 'easeInExpo', 'easeInOutBack', 'elasticOut', 'hold', 'cubic-bezier(0.2, 1.4, 0.4, 1)', 'spring(180, 22, 1)', 'steps(6, end)'];
  for (const type of FAMILIES) {
    const defaults = fx.paramDefaults('enter', type);
    const info = { i: 3, N: 12, shortSide: 1080, local: 1.5, letter: {}, beatDuration: 2 };
    for (const curve of curves) {
      const ease = easing.get(curve);
      for (const raw of [0, 0.01, 0.25, 0.5, 0.75, 0.99, 1]) {
        const p = Math.max(0, Math.min(1, ease(raw)));
        const enterState = freshState();
        fx.get('enter', type).cpu(enterState, p, { ...defaults }, rng(), info);
        assertFiniteState(enterState, `enter.${type} ${curve}@${raw}`);
        const exitState = freshState();
        fx.get('exit', type).cpu(exitState, p, { ...defaults }, rng(), info);
        assertFiniteState(exitState, `exit.${type} ${curve}@${raw}`);
        for (const env of [0, 0.5, 1]) {
          for (const t of [0, 0.3, 1.1, 4]) {
            const holdState = freshState();
            fx.get('hold', type).cpu(holdState, t, env, { ...defaults }, rng(), info);
            assertFiniteState(holdState, `hold.${type} ${curve} env=${env} t=${t}`);
          }
        }
      }
    }
  }
});

test('the per-letter motions actually move the letter state', () => {
  const info = { i: 3, N: 12, shortSide: 1080, local: 1.5, letter: {}, beatDuration: 2 };
  // an entrance starts hidden and ends visible, an exit the other way round
  for (const type of ['dither', 'scanline', 'stealth', 'geometry']) {
    const defaults = fx.paramDefaults('enter', type);
    const start = freshState();
    fx.get('enter', type).cpu(start, 0, { ...defaults }, rng(), info);
    const end = freshState();
    fx.get('enter', type).cpu(end, 1, { ...defaults }, rng(), info);
    assert.ok(start.opacity <= end.opacity, `enter.${type} does not reveal (${start.opacity} -> ${end.opacity})`);
    const exitStart = freshState();
    fx.get('exit', type).cpu(exitStart, 0, { ...defaults }, rng(), info);
    const exitEnd = freshState();
    fx.get('exit', type).cpu(exitEnd, 1, { ...defaults }, rng(), info);
    assert.ok(exitStart.opacity >= exitEnd.opacity, `exit.${type} does not hide (${exitStart.opacity} -> ${exitEnd.opacity})`);
  }
});

test('the geometry motion trims along a different axis per shape', () => {
  const info = { i: 0, N: 12, shortSide: 1080, local: 0, letter: {}, beatDuration: 2 };
  const seen = new Set();
  for (const shape of pack.SHAPES) {
    const state = freshState();
    fx.get('enter', 'geometry').cpu(state, 0.5, { shape, feather: 0.1, spin: 0 }, rng(), info);
    assert.ok(Number.isInteger(state.wipeMode) && state.wipeMode >= 0, `${shape}: wipeMode ${state.wipeMode}`);
    assert.ok(state.wipeSoft > 0, `${shape}: the feather never reaches the trim`);
    assert.ok(state.visibleFrac > 0 && state.visibleFrac <= 0.5, `${shape}: visibleFrac ${state.visibleFrac}`);
    seen.add(state.wipeMode);
  }
  assert.ok(seen.size >= 4, `the shapes only use ${seen.size} trim axes`);
});

test('fade keeps its plain behaviour and gains softness and glow', () => {
  const info = { i: 0, N: 4, shortSide: 1080, local: 0, letter: {}, beatDuration: 1 };
  // the defaults reproduce the original plain opacity fade
  const plainEnter = fx.paramDefaults('enter', 'fade');
  assert.equal(plainEnter.softness, 0);
  assert.equal(plainEnter.glow, 0);
  for (const p of [0, 0.25, 0.5, 0.75, 1]) {
    const state = freshState();
    fx.get('enter', 'fade').cpu(state, p, plainEnter, rng(), info);
    assert.equal(state.opacity, p, `enter.fade is no longer a plain fade at ${p}`);
    assert.equal(state.flash, 0, `enter.fade flashes by default at ${p}`);
    const out = freshState();
    fx.get('exit', 'fade').cpu(out, p, plainEnter, rng(), info);
    assert.equal(out.opacity, 1 - p, `exit.fade is no longer a plain fade at ${p}`);
  }
  // and the shader half (post.fade) is a separate target
  assert.equal(fx.get('post', 'fade').defaults.target, 'frame');
  // hold.fade is new: it only exists in the shader pack
  assert.ok(fx.get('hold', 'fade'), 'hold.fade is missing');
  const hold = freshState();
  fx.get('hold', 'fade').cpu(hold, 0.4, 0.5, { softness: 1, glow: 0.5 }, rng(), info);
  assertFiniteState(hold, 'hold.fade');
  assert.ok(hold.opacity > 0 && hold.opacity < 1, `hold.fade ignored the envelope (${hold.opacity})`);
});
