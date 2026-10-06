'use strict';

// The shader-break families: mosaic / fog / wind / drift / cloth. Every
// family must cascade across the string, move during hold, land cleanly at
// the phase edges, and emit dust only while the glyph is coming apart.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const fx = require(path.join(ROOT, 'renderer/js/lyrics/effects/registry.js'));
require(path.join(ROOT, 'renderer/js/lyrics/effects/shader-fx.js'));

const FAMILIES = ['mosaicBreak', 'fogBreak', 'windBreak', 'windNoBreak', 'cloth'];
const BREAKS = ['mosaicBreak', 'fogBreak', 'windBreak'];

function freshState() {
  return {
    x: 0, y: 0, z: 0, rot: 0, tiltX: 0, tiltY: 0,
    scaleX: 1, scaleY: 1, skewX: 0, opacity: 1, blur: 0,
    visibleFrac: 1, deform: [], represent: 'mesh', colorMix: 0, fx: {},
  };
}

function info(i, N) {
  return { i, N: N == null ? 8 : N, shortSide: 400 };
}

function seededRng(seed) {
  let x = seed == null ? 0.123456789 : seed;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

function run(phase, type, t, i, params, env) {
  const entry = fx.get(phase, type);
  assert.ok(entry && entry.cpu, `${phase}.${type} has no cpu`);
  const state = freshState();
  if (phase === 'hold') entry.cpu(state, t, env == null ? 1 : env, params || {}, seededRng(42 + i), info(i));
  else entry.cpu(state, t, params || {}, seededRng(42 + i), info(i));
  return state;
}

function signature(state) {
  return JSON.stringify({
    x: state.x, y: state.y, skewX: state.skewX, rot: state.rot,
    blur: state.blur, opacity: state.opacity, visibleFrac: state.visibleFrac,
    dissolve: state.dissolve || null, deform: state.deform,
    represent: state.represent, dust: state.dust || null, flash: state.flash || 0,
  });
}

test('every hold moves between h=0.5 and h=1.1 (never frozen)', () => {
  for (const type of FAMILIES) {
    const a = signature(run('hold', type, 0.5, 3, {}));
    const b = signature(run('hold', type, 1.1, 3, {}));
    assert.notEqual(a, b, `hold.${type} is static`);
  }
});

test('enter lands clean at p=1 and exit starts clean at p=0', () => {
  for (const type of FAMILIES) {
    const entered = run('enter', type, 1, 3, {});
    assert.ok(Math.abs(entered.x) < 1e-9 && Math.abs(entered.y) < 1e-9, `${type} enter x/y ${entered.x},${entered.y}`);
    assert.equal(entered.opacity, 1, `${type} enter opacity`);
    const exited = run('exit', type, 0, 3, {});
    assert.ok(Math.abs(exited.x) < 1e-9 && Math.abs(exited.y) < 1e-9, `${type} exit x/y ${exited.x},${exited.y}`);
    assert.equal(exited.opacity, 1, `${type} exit opacity`);
    for (const [label, state] of [['enter', entered], ['exit', exited]]) {
      if (state.dissolve) {
        assert.ok(state.dissolve.progress >= 0.999, `${type} ${label} dissolve ${state.dissolve.progress}`);
      }
      assert.ok(!state.dust, `${type} ${label} must not emit dust at rest`);
    }
  }
});

test('letters cascade: i=0 and i=7 differ mid-phase', () => {
  for (const type of FAMILIES) {
    const a = signature(run('enter', type, 0.5, 0, {}));
    const b = signature(run('enter', type, 0.5, 7, {}));
    assert.notEqual(a, b, `enter.${type} has no cascade`);
  }
});

test('windBreak exit dissolves with direction and bias, mosaicBreak uses mode 1', () => {
  const wind = run('exit', 'windBreak', 0.5, 3, {});
  assert.ok(wind.dissolve, 'windBreak exit has no dissolve');
  assert.deepEqual(wind.dissolve.dir, { x: 1, y: 0 });
  assert.ok(wind.dissolve.bias > 0, `windBreak bias ${wind.dissolve.bias}`);
  const mosaic = run('exit', 'mosaicBreak', 0.5, 3, {});
  assert.ok(mosaic.dissolve, 'mosaicBreak exit has no dissolve');
  assert.equal(mosaic.dissolve.mode, 1);
});

test('the three break families emit dust mid-phase and only mid-phase', () => {
  for (const type of BREAKS) {
    const mid = run('exit', type, 0.5, 3, {});
    assert.equal(mid.represent, 'dust', `${type} exit has no dust`);
    assert.ok(mid.dust && mid.dust.amount > 0, `${type} exit dust amount`);
    assert.equal(run('exit', type, 0, 3, {}).represent, 'mesh', `${type} exit p=0 dust`);
    assert.equal(run('exit', type, 1, 3, {}).represent, 'mesh', `${type} exit p=1 dust`);
    const off = run('exit', type, 0.5, 3, { dust: 0 });
    assert.equal(off.represent, 'mesh', `${type} dust:0 still emits`);
    assert.ok(!off.dust, `${type} dust:0 still sets dust`);
  }
});

test('fogBreak and windBreak scatter: 0 stays tight, 1 comes apart', () => {
  for (const type of ['fogBreak', 'windBreak']) {
    const plain = run('exit', type, 0.5, 3, { scatter: 0 });
    const scattered = run('exit', type, 0.5, 3, { scatter: 1 });
    const distance = Math.hypot(scattered.x - plain.x, scattered.y - plain.y);
    assert.ok(distance > 0.5, `${type} scatter has no effect (${distance})`);
    // even fully scattered, the phase edges stay clean
    const entered = run('enter', type, 1, 3, { scatter: 1 });
    assert.ok(Math.abs(entered.x) < 1e-9 && Math.abs(entered.y) < 1e-9, `${type} scattered enter x/y ${entered.x},${entered.y}`);
    assert.equal(entered.opacity, 1, `${type} scattered enter opacity`);
    const exited = run('exit', type, 0, 3, { scatter: 1 });
    assert.ok(Math.abs(exited.x) < 1e-9 && Math.abs(exited.y) < 1e-9, `${type} scattered exit x/y ${exited.x},${exited.y}`);
    assert.equal(exited.opacity, 1, `${type} scattered exit opacity`);
  }
});

test('scatter spreads per axis and rotates with scatterAngle', () => {
  // mosaic enter has no deterministic drift, so the scatter reads directly
  const flat = run('enter', 'mosaicBreak', 0.5, 3, { scatter: 1, scatterX: 1, scatterY: 0, scatterAngle: 0 });
  assert.equal(flat.y, 0, 'scatterY 0 must silence the y axis');
  assert.notEqual(flat.x, 0, 'scatterX 1 must spread on x');
  const turned = run('enter', 'mosaicBreak', 0.5, 3, { scatter: 1, scatterX: 1, scatterY: 0, scatterAngle: 90 });
  assert.ok(Math.abs(turned.x) < 1e-9, `angle 90 must move the spread off x (${turned.x})`);
  assert.equal(turned.y, flat.x, 'angle 90 must carry the x spread onto y');
});

test('packStateRows carries dust without touching the em-info slot', () => {
  global.SA = global.SA || {};
  global.window = global.window || { SA: global.SA };
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'passes.js'));
  const passes = global.window.SA.glPasses || global.SA.glPasses;
  const pack = passes._test.packStateRows;
  const data = new Float32Array(26 * 4);
  pack([{ dust: { windX: 0.6, windY: -0.2, size: 2.4, turbulence: 0.5, spread: 0.15, amount: 1 } }], data, 1);
  const near = (got, want) => assert.ok(Math.abs(got - want) < 1e-6, `expected ${want}, got ${got}`);
  [0.6, -0.2, 2.4, 0.5].forEach((want, k) => near(data[23 * 4 + k], want));
  near(data[24 * 4], 0.15);
  near(data[24 * 4 + 1], 1);
  assert.deepEqual([data[24 * 4 + 2], data[24 * 4 + 3]], [0, 0]);
});
