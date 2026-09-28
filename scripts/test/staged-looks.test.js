'use strict';

// The staged looks (presets.js `STAGED_LOOKS`) are complete performances built
// from the extended primitives. They must stay valid: every type resolves,
// every parameter belongs to its type, every instance normalizes without NaN,
// and the default `presets.list()` keeps the FX 400 / 800 pool untouched.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
const fx = require(path.join(FX_DIR, 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg', 'vary', 'repeat', 'warp', 'animator', 'selector', 'camera', 'shape-layer']) {
  require(path.join(FX_DIR, `${name}.js`));
}
const presets = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'presets.js'));

const SINGLE_GROUPS = ['animation', 'layout', 'enter', 'exit', 'location', 'fill', 'background', 'bgShape', 'bgFill', 'bgMotion', 'repeat'];
const STACK_GROUPS = ['hold', 'edge', 'post', 'bgEdge'];

function instancesOf(style) {
  const out = [];
  for (const group of SINGLE_GROUPS) {
    const value = style[group];
    if (value && value.type) out.push({ group, instance: value });
  }
  for (const group of STACK_GROUPS) {
    const list = Array.isArray(style[group]) ? style[group] : style[group] ? [style[group]] : [];
    for (const instance of list) if (instance && instance.type) out.push({ group, instance });
  }
  return out;
}

test('every staged look is registered and reachable through presets.get', () => {
  const stagings = presets.STAGED_LOOKS;
  assert.ok(stagings.length >= 20, `only ${stagings.length} staged looks`);
  assert.equal(new Set(stagings.map((entry) => entry.id)).size, stagings.length, 'staging ids repeat');
  for (const staging of stagings) {
    assert.equal(staging.pack, 'pro', `${staging.id} must stay in the extended pack`);
    assert.ok(staging.name && staging.name.trim(), `${staging.id} has no display name`);
    assert.ok(presets.get(staging.id), `${staging.id} is not reachable from presets.get`);
  }
});

test('the default preset list excludes the staged looks (FX400/800 catalogs unchanged)', () => {
  const all = presets.list({ packs: 'all' });
  const core = presets.list();
  assert.equal(all.length, core.length + presets.STAGED_LOOKS.length);
  for (const entry of core) assert.equal(entry.pack, null, `${entry.id} leaked into the default list`);
  assert.equal(all.filter((entry) => entry.pack === 'pro').length, presets.STAGED_LOOKS.length);
});

test('every staging type resolves and every parameter belongs to its type', () => {
  for (const staging of presets.STAGED_LOOKS) {
    const instances = instancesOf(staging.style);
    assert.ok(instances.length >= 5, `${staging.id} has only ${instances.length} effect groups`);
    for (const { group, instance } of instances) {
      const descriptor = fx.get(group, instance.type);
      assert.ok(descriptor, `${staging.id}: ${group}.${instance.type} is not registered`);
      const keys = new Set((descriptor.params || []).map((param) => param.key));
      for (const key of Object.keys(instance.params || {})) {
        assert.ok(keys.has(key), `${staging.id}: ${group}.${instance.type} has no parameter ${key}`);
      }
    }
    // the background spec is the legacy style.background the catalog turns into a clip
    const background = staging.style.background;
    if (background) assert.ok(fx.get('background', background.type), `${staging.id}: background.${background.type} is not registered`);
  }
});

test('every staging instance normalizes to finite parameters', () => {
  for (const staging of presets.STAGED_LOOKS) {
    for (const { group, instance } of instancesOf(staging.style)) {
      const resolved = fx.withDefaults(instance, group);
      assert.ok(resolved, `${staging.id}: ${group}.${instance.type} does not resolve`);
      for (const [key, value] of Object.entries(resolved.params)) {
        if (typeof value === 'number') assert.ok(Number.isFinite(value), `${staging.id}: ${group}.${instance.type}.${key} is not finite`);
      }
      const cost = fx.costOf({ [group]: Array.isArray(staging.style[group]) ? [instance] : instance });
      assert.ok(Number.isFinite(cost) && cost >= 0, `${staging.id}: ${group}.${instance.type} has no cost`);
    }
  }
});

test('the stagings combine several of the extended primitives and a camera move', () => {
  const PRIMITIVES = new Set(['animator', 'warp', 'letterWarp', 'fontSize', 'fillScreen', 'squashStretch', 'swirl', 'camera', 'rangeSelector', 'rangeReveal', 'tracking', 'shapeLayer']);
  const EXT_BACKGROUNDS = new Set(['fractalNoise', 'rays', 'gradient4', 'cellPattern', 'particleField', 'perspectiveGrid', 'tunnel']);
  for (const staging of presets.STAGED_LOOKS) {
    const used = new Set(instancesOf(staging.style).map(({ instance }) => instance.type));
    assert.ok([...used].some((type) => PRIMITIVES.has(type)), `${staging.id} uses no extended primitive`);
    assert.ok(used.has('camera'), `${staging.id} has no camera move`);
    assert.ok(EXT_BACKGROUNDS.has(staging.style.background && staging.style.background.type), `${staging.id} has no extended background`);
  }
});

test('the selector stagings draw their shape layer', () => {
  const shaped = ['trackingTitle', 'karaokeSweep', 'impactBurst', 'frameDraw', 'bracketCallout', 'beatStrike'];
  for (const id of shaped) {
    const staging = presets.STAGED_LOOKS.find((entry) => entry.id === id);
    assert.ok(staging, `${id} is missing`);
    const shapes = (Array.isArray(staging.style.post) ? staging.style.post : []).filter((post) => post.type === 'shapeLayer');
    assert.ok(shapes.length >= 1, `${id} has no shape layer`);
    for (const shape of shapes) {
      const descriptor = fx.get('post', 'shapeLayer');
      const keys = new Set((descriptor.params || []).map((param) => param.key));
      for (const key of Object.keys(shape.params || {})) assert.ok(keys.has(key), `${id}: shape layer has no parameter ${key}`);
    }
  }
});

test('the stagings are deterministic and never mutate the stored style', () => {
  const before = JSON.stringify(presets.STAGED_LOOKS);
  const first = presets.list({ packs: 'all' });
  const second = presets.list({ packs: 'all' });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  const staging = first.find((entry) => entry.pack === 'pro' && entry.style.text);
  assert.ok(staging, 'no staging exposes a text style');
  staging.style.text.size = 1;
  assert.equal(JSON.stringify(presets.STAGED_LOOKS), before, 'list() handed out a live style');
});
