'use strict';

// The three.js background scenes. The module cannot start a WebGL renderer in
// node, so the pure half (`layout` / `scenePlan`) and the layer schema are
// pinned here: the image is a pure function of (layer, time), which is what the
// export determinism rests on.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const three3d = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'three', 'scene3d.js'));
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));

const SIZE = { width: 1920, height: 1080 };

function layer(preset, overrides) {
  return { id: `layer-${preset}`, type: 'scene3d', scene: { preset, ...(overrides || {}) } };
}

function assertFiniteTree(value, where) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${where} is not finite: ${value}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, i) => assertFiniteTree(entry, `${where}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) assertFiniteTree(entry, `${where}.${key}`);
  }
}

test('the plan exposes at least the starfield and grid presets', () => {
  assert.ok(three3d.PRESETS.includes('starfield'));
  assert.ok(three3d.PRESETS.includes('grid'));
  assert.ok(three3d.PRESETS.length >= 2);
  assert.deepEqual(three3d.defaults().preset, 'starfield');
});

test('presetOf falls back to the first preset for junk, and speed/density clamp', () => {
  assert.equal(three3d.presetOf({ scene: { preset: 'grid' } }), 'grid');
  assert.equal(three3d.presetOf({ scene: { preset: 'nope' } }), three3d.PRESETS[0]);
  assert.equal(three3d.presetOf(null), three3d.PRESETS[0]);
  assert.equal(three3d.speedOf({ scene: { speed: 0 } }), 1);
  assert.equal(three3d.speedOf({ scene: { speed: -3 } }), 1);
  assert.ok(three3d.speedOf({ scene: { speed: 99 } }) <= 8);
  assert.equal(three3d.densityOf({ scene: { density: 0 } }), 0.2);
  assert.equal(three3d.densityOf({ scene: { density: 99 } }), 3);
});

test('seedOf is a stable function of the layer id and differs between layers', () => {
  assert.equal(three3d.seedOf({ id: 'a' }), three3d.seedOf({ id: 'a' }));
  assert.notEqual(three3d.seedOf({ id: 'a' }), three3d.seedOf({ id: 'b' }));
  assert.equal(three3d.seedOf({ scene: { seed: 7 } }), 7);
});

test('layout is deterministic and finite for every preset', () => {
  for (const preset of three3d.PRESETS) {
    const a = three3d.layout(layer(preset));
    const b = three3d.layout(layer(preset));
    assert.deepEqual(a, b, `${preset} layout is not deterministic`);
    assert.equal(a.preset, preset);
    if (a.type === 'points') {
      assert.ok(a.count > 0);
      assert.equal(a.positions.length, a.count * 3);
      assert.equal(a.colors.length, a.count * 3);
      for (const value of a.positions) assert.ok(Number.isFinite(value));
    }
    if (a.type === 'meshes') {
      assert.ok(a.items.length > 0);
      for (const item of a.items) {
        assert.ok(item.base.every(Number.isFinite));
        assert.ok(item.color.every(Number.isFinite));
      }
    }
  }
});

test('scenePlan is a pure function of the time and animates the presets', () => {
  for (const preset of three3d.PRESETS) {
    const l = layer(preset);
    const first = three3d.scenePlan(l, 3.25, SIZE);
    const again = three3d.scenePlan(l, 3.25, SIZE);
    assert.deepEqual(first, again, `${preset} plan is not deterministic`);
    assertFiniteTree(first, preset);
    assert.ok(first.background && first.camera && first.group);
    const later = three3d.scenePlan(l, 9.5, SIZE);
    assert.notDeepEqual(later, first, `${preset} does not move with time`);
  }
});

test('render degrades to null without a three renderer (2D fallback path)', () => {
  assert.equal(three3d.isSupported(), false);
  assert.equal(three3d.render(layer('grid'), { time: 0, width: 320, height: 180 }), null);
});

test('the project migrate pass fills the scene3d defaults and keeps the layer', () => {
  const input = {
    format: project.FORMAT,
    version: project.VERSION,
    layers: [
      { id: 's', slot: 'background', type: 'scene3d', opacity: 1 },
      { id: 'v', type: 'solid', color: '#000000' },
    ],
  };
  const result = project.migrate(input);
  assert.equal(result.ok, true);
  const sceneLayer = result.project.layers.find((entry) => entry.id === 's');
  assert.ok(sceneLayer, 'the scene3d layer was dropped');
  assert.equal(sceneLayer.scene.preset, 'starfield');
  assert.equal(sceneLayer.scene.speed, 1);
  assert.equal(sceneLayer.scene.density, 1);
  const solid = result.project.layers.find((entry) => entry.id === 'v');
  assert.equal(solid.scene, undefined, 'other layers are left untouched');
});

test('normalizeLayers respects an explicit scene block', () => {
  const doc = { layers: [{ id: 's', type: 'scene3d', scene: { preset: 'grid', speed: 2, density: 1.5 } }] };
  project.normalizeLayers(doc);
  assert.equal(doc.layers[0].scene.preset, 'grid');
  assert.equal(doc.layers[0].scene.speed, 2);
  assert.equal(doc.layers[0].scene.density, 1.5);
});
