'use strict';

// The extended primitives' invariants: the block-warp parameter round trip,
// the subdivided mesh, preset expansion, the pack filter that protects the
// FX 400 / 800 catalogs, the animator's endpoints and the deformation slots.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
const fx = require(path.join(FX_DIR, 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg', 'vary', 'repeat', 'warp', 'animator', 'selector', 'camera', 'shape-layer', 'softbody', 'staged-presets']) {
  require(path.join(FX_DIR, `${name}.js`));
}
const warp = require(path.join(FX_DIR, 'warp.js'));
const animator = require(path.join(FX_DIR, 'animator.js'));
const stagedPresets = require(path.join(FX_DIR, 'staged-presets.js'));
const geometry = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'geometry.js'));

test('the block warp parameter survives the encode / decode round trip', () => {
  for (const [h, v] of [[0, 0], [-1, -1], [1, 1], [0.37, -0.62], [-0.04, 0.9]]) {
    const param = warp.encodeWarpParam(h, v);
    const back = warp.decodeWarpParam(param);
    assert.ok(Math.abs(back.hDistort - h) <= 1 / 99 + 1e-9, `h ${h} -> ${back.hDistort}`);
    assert.ok(Math.abs(back.vDistort - v) <= 1 / 99 + 1e-9, `v ${v} -> ${back.vDistort}`);
    assert.ok(Number.isInteger(param) && param >= 0 && param <= 9999, `param ${param}`);
  }
});

test('subdivide keeps the area, the edge limit and the triangle cap', () => {
  const tris = { positions: Float32Array.from([0, 0, 100, 0, 0, 100]), indices: Uint32Array.from([0, 1, 2]) };
  const area = geometry.triangleAreaSum(tris);
  const fine = geometry.subdivide(tris, 25, 6000);
  assert.ok(Math.abs(geometry.triangleAreaSum(fine) - area) < 1e-3, 'the area changed');
  let longest = 0;
  for (let i = 0; i < fine.indices.length; i += 3) {
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const p = fine.indices[i + a] * 2;
      const q = fine.indices[i + b] * 2;
      longest = Math.max(longest, Math.hypot(fine.positions[q] - fine.positions[p], fine.positions[q + 1] - fine.positions[p + 1]));
    }
  }
  assert.ok(longest <= 25 * 1.001, `longest edge ${longest}`);
  const capped = geometry.subdivide(tris, 5, 24);
  assert.ok(capped.indices.length / 3 <= 24, `cap ignored (${capped.indices.length / 3} triangles)`);
  // shared midpoints: no seam duplicates beyond the three corners
  const vertices = new Set();
  for (const index of fine.indices) vertices.add(index);
  assert.ok(vertices.size < fine.indices.length, 'no vertex is shared');
});

test('a preset expands back into its primitive with the resolved parameters', () => {
  const preset = fx.get('hold', 'warpArc');
  assert.ok(preset && preset.preset, 'hold.warpArc is not a preset');
  assert.equal(preset.preset.primitive, 'warp');
  const instance = { type: 'warpArc', params: { bend: 0.5 } };
  const resolved = fx.withDefaults(instance, 'hold');
  const expanded = fx.expandPreset(instance, 'hold');
  assert.equal(expanded.type, 'warp');
  assert.deepEqual(fx.withDefaults(expanded, 'hold').params, resolved.params);
  assert.deepEqual(fx.withDefaults(expanded, 'hold').motion, resolved.motion);
  // the preset's own parameter is the default of the primitive instance
  assert.equal(resolved.params.style, 'arc');
  assert.equal(resolved.params.bend, 0.5);
  // a non-preset passes through unchanged
  assert.deepEqual(fx.expandPreset({ type: 'jelly', params: {} }, 'hold'), { type: 'jelly', params: {} });
});

test('a letter-wise preset pins the scope that makes its attribute letter-wise', () => {
  const scoped = stagedPresets.PRESETS.filter((preset) => preset.scope);
  assert.ok(scoped.length >= 8, `letter-wise presets: ${scoped.length}`);
  for (const preset of scoped) {
    const descriptor = fx.get(preset.group, preset.type);
    assert.ok(descriptor && descriptor.preset, `${preset.group}.${preset.type} is not a preset`);
    assert.equal(descriptor.preset.primitive, preset.primitive, `${preset.type} primitive`);
    // picking the type resolves to a scoped instance without the caller
    // repeating the scope
    const resolved = fx.withDefaults({ type: preset.type, params: {} }, preset.group);
    assert.deepEqual(resolved.scope, preset.scope, `${preset.group}.${preset.type} scope`);
    assert.equal(resolved.scope.kind, 'nth', `${preset.group}.${preset.type} is not nth`);
    // an explicit scope on the instance wins over the preset's
    const own = { kind: 'keyword', match: 'AB' };
    assert.deepEqual(fx.withDefaults({ type: preset.type, params: {}, scope: own }, preset.group).scope, own);
    // the primitive keeps its own schema, so the inspector rows still edit it
    assert.deepEqual(fx.expandPreset({ type: preset.type, params: {} }, preset.group).type, preset.primitive);
    // a preset registered in an aliased group must not hide the base types
    assert.ok(fx.list(preset.group, { packs: 'all' }).length > 1, `${preset.group} list collapsed`);
  }
  // the letter-wise presets are packed, so the fx400 / fx800 sample books are
  // untouched by them
  assert.equal(fx.list('text').length, 1, 'text core types');
  assert.equal(fx.list('bgShape').length, 2, 'bgShape core types');
  for (const preset of scoped) assert.equal(fx.packOf(preset.group, preset.type), 'pro', `${preset.type} pack`);
});

test('the pack filter hides the extended entries unless they are asked for', () => {
  for (const group of ['enter', 'exit', 'hold', 'post', 'background', 'fill']) {
    const core = fx.list(group);
    const all = fx.list(group, { packs: 'all' });
    const packed = fx.list(group, { packs: ['pro', 'font'] });
    assert.ok(core.every((entry) => !entry.pack), `${group} leaked a packed entry`);
    assert.ok(all.length >= core.length);
    assert.equal(packed.length, all.length - core.length, `${group} pack split`);
    for (const entry of packed) assert.ok(entry.pack === 'pro' || entry.pack === 'font');
  }
  // the helper agrees with the list
  assert.equal(fx.packOf('hold', 'letterWarp'), 'pro');
  assert.equal(fx.packOf('hold', 'jelly'), null);
  assert.equal(fx.isPreset('hold', 'warpArc'), true);
});

test('the animator is the identity at the end and the full offset at the start', () => {
  const cpu = fx.get('enter', 'animator').cpu;
  const params = { dx: 1, dy: -0.5, scale: 1.4, rotate: 20, skew: 10, opacity: 0, blur: 12, flash: 0.5, tilt: 30, axis: 'y' };
  const info = { i: 0, N: 1, letter: { size: 100 }, frame: { width: 1920, height: 1080 }, shortSide: 1080 };
  const make = () => ({ x: 0, y: 0, rot: 0, scaleX: 1, scaleY: 1, opacity: 1, blur: 0, flash: 0, skewX: 0, tiltX: 0, tiltY: 0, deform: [] });
  const settled = make();
  cpu(settled, 1, params, () => 0.5, info);
  assert.deepEqual(settled, make(), 'k = 1 must not change the state');
  const fresh = make();
  cpu(fresh, 0, params, () => 0.5, info);
  assert.equal(fresh.x, 100, 'dx is in em');
  assert.equal(fresh.y, -50);
  assert.ok(Math.abs(fresh.scaleX - 1.4) < 1e-6);
  assert.equal(fresh.rot, 20);
  assert.equal(fresh.skewX, 10);
  assert.equal(fresh.opacity, 0);
  assert.equal(fresh.blur, 12);
  assert.equal(fresh.flash, 0.5);
  assert.equal(fresh.tiltY, 30);
});

test('the deformation slots keep a block warp and drop the smallest amount', () => {
  // passes.js reads SA.warp at module scope; the GL calls only run in the engine
  global.SA = { warp };
  global.window = { SA: global.SA };
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'passes.js'));
  const passes = global.window.SA.glPasses || global.SA.glPasses;
  const slots = passes._test.deformSlots;
  const letter = (type, amount) => ({ type, amount, time: 0, param: 0 });
  // three letter warps and a block warp: the block warp survives
  const state = { deform: [letter('jelly', 0.1), letter('bulge', 0.3), letter('ripple', 0.2), letter('arc', 0.25)] };
  const chosen = slots(state).map((entry) => entry.item.type);
  assert.ok(chosen.includes('arc'), `the block warp was dropped (${chosen})`);
  assert.ok(!chosen.includes('jelly'), `the smallest letter warp survived (${chosen})`);
  assert.equal(chosen.length, 3);
  // twist is measured in degrees, so 12deg must not outrank a bulge of 0.3
  const twist = { deform: [letter('twist', 12), letter('bulge', 0.3)] };
  assert.deepEqual(slots(twist).map((entry) => entry.item.type), ['bulge', 'twist']);
  assert.equal(slots({ deform: [] }), null);
  assert.equal(passes._test.STATE_ROWS, 25);
});
