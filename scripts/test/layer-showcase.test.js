'use strict';

// The layer showcase: every animated prop must reach the generated project,
// survive the migration and evaluate through the layer keyframe path.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const glLayers = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'layers.js'));
const showcase = require(path.join(ROOT, 'scripts', 'layer-showcase.js'));

let cached = null;
function built() {
  if (!cached) cached = showcase.buildShowcase();
  return cached;
}

function outPath() {
  return path.join(ROOT, 'renderer', 'data', 'layer-showcase.json');
}

function mdPath() {
  return path.join(ROOT, 'demo', 'layer-showcase.md');
}

function demoLayers(doc) {
  return (doc.layers || []).filter((layer) => layer && layer.type === 'image').sort((a, b) => a.start - b.start);
}

test('the generated showcase migrates and keeps every cue and layer', () => {
  const b = built();
  const migrated = project.migrate(JSON.parse(JSON.stringify(b.project)));
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.project.script.cues.length, b.entries.length);
  assert.equal(demoLayers(migrated.project).length, b.entries.length);
  const bySection = (id) => b.entries.filter((entry) => entry.section === id).length;
  assert.equal(bySection('move'), 2);
  assert.equal(bySection('spin'), 3);
  assert.equal(bySection('anchor'), 2);
  assert.equal(bySection('fade'), 1);
  assert.equal(bySection('crop'), 2);
  assert.equal(bySection('combo'), 1);
  assert.equal(b.entries.length, 11);
  assert.equal(b.total, 11 * showcase.CUE_SECONDS);
});

test('every cue owns one image layer spanning the cue plus the shared plate', () => {
  const b = built();
  const cueById = new Map(b.project.script.cues.map((cue) => [cue.id, cue]));
  const layers = demoLayers(b.project);
  b.entries.forEach((entry, index) => {
    const cue = cueById.get(entry.cueId);
    assert.ok(cue, `cue ${entry.cueId} missing`);
    assert.equal(cue.end - cue.start, showcase.CUE_SECONDS, `${entry.cueId} span`);
    assert.ok(String(cue.text).includes(entry.value), `${entry.cueId} label must name ${entry.value}`);
    assert.equal(cue.meta.kind, 'layer-showcase');
    assert.equal(cue.meta.section, entry.section);
    assert.equal(cue.meta.value, entry.value);
    const layer = layers[index];
    assert.equal(layer.id, entry.layerId, `${entry.cueId} layer`);
    assert.equal(layer.slot, 'background');
    assert.equal(layer.type, 'image');
    assert.ok(String(layer.src).startsWith('data:image/png;base64,'), `${entry.layerId} embeds its picture`);
    assert.equal(layer.start, cue.start, `${entry.cueId} layer start`);
    assert.equal(layer.end, cue.end, `${entry.cueId} layer end`);
  });
  const plate = (b.project.layers || []).find((layer) => layer && layer.type === 'solid');
  assert.ok(plate, 'the showcase needs one plate layer so the cutouts read');
  assert.equal(plate.start, 0);
  assert.equal(plate.end, b.total);
});

test('every keyframe track uses a known layer prop with sorted local times', () => {
  const b = built();
  const allowed = new Set(glLayers.LAYER_KEY_PROPS);
  assert.ok(allowed.size > 0);
  for (const entry of b.entries) {
    const tracks = b.project.keyframes[`layer:${entry.layerId}`];
    assert.ok(tracks, `keyframes for ${entry.layerId} missing`);
    assert.deepEqual(Object.keys(tracks).sort(), entry.tracks.slice().sort());
    for (const [prop, keys] of Object.entries(tracks)) {
      assert.ok(allowed.has(prop), `${entry.layerId} keys unknown prop ${prop}`);
      assert.ok(keys.length >= 1);
      const times = keys.map((key) => key.t);
      assert.deepEqual(times.slice().sort((a, b2) => a - b2), times, `${entry.layerId} ${prop} unsorted`);
      for (const key of keys) {
        assert.ok(key.t >= 0 && key.t <= showcase.CUE_SECONDS, `${entry.layerId} ${prop} out of range: ${key.t}`);
        assert.equal(typeof key.value, 'number', `${entry.layerId} ${prop} is not numeric`);
      }
    }
  }
});

test('the embedded pictures are valid square PNGs', () => {
  const pictures = showcase.makePictures();
  assert.deepEqual(Object.keys(pictures).sort(), ['ball', 'paper', 'star']);
  for (const [name, url] of Object.entries(pictures)) {
    assert.ok(url.startsWith('data:image/png;base64,'), `${name} is not a PNG data URL`);
    const buf = Buffer.from(url.split(',')[1], 'base64');
    assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${name} signature`);
    assert.equal(buf.readUInt32BE(16), 160, `${name} width`);
    assert.equal(buf.readUInt32BE(20), 160, `${name} height`);
  }
  // deterministic: the same pixels must deflate to the same bytes
  assert.deepEqual(showcase.makePictures(), pictures);
});

test('the keyframes evaluate through the renderer path', () => {
  const b = built();
  const byId = Object.fromEntries(b.project.layers.map((layer) => [layer.id, layer]));
  const at = (layerId, time) => glLayers.resolveLayerAt(byId[layerId], b.project.keyframes, time);
  const move = b.entries.find((entry) => entry.value === 'transform.x');
  assert.ok(Math.abs(at(move.layerId, move.start + showcase.CUE_SECONDS / 2).transform.x) < 1e-9, 'slide midpoint is 0');
  const fade = b.entries.find((entry) => entry.section === 'fade');
  assert.ok(Math.abs(at(fade.layerId, fade.start + showcase.CUE_SECONDS / 2).opacity - 0.5) < 1e-9, 'fade midpoint is 0.5');
  const squash = b.entries.find((entry) => entry.value === 'transform.scaleX/scaleY');
  const mid = at(squash.layerId, squash.start + showcase.CUE_SECONDS / 2);
  assert.ok(Math.abs(mid.transform.scaleX - 1.05) < 1e-9, `scaleX midpoint: ${mid.transform.scaleX}`);
  assert.ok(Math.abs(mid.transform.scaleY - 1.05) < 1e-9, `scaleY midpoint: ${mid.transform.scaleY}`);
  const iris = b.entries.find((entry) => entry.value === 'crop.l/t/r/b');
  const cropped = at(iris.layerId, iris.start + showcase.CUE_SECONDS);
  assert.deepEqual([cropped.crop.l, cropped.crop.t, cropped.crop.r, cropped.crop.b], [0.3, 0.3, 0.3, 0.3]);
  // the anchor statics survive keyframe resolution untouched
  const topLeft = b.entries.find((entry) => entry.detail.includes('左上'));
  const anchored = at(topLeft.layerId, topLeft.start + 1);
  assert.equal(anchored.transform.anchorX, 0);
  assert.equal(anchored.transform.anchorY, 0);
});

test('every section opens a marker and is listed once', () => {
  const b = built();
  assert.equal(b.markers.length, b.sections.length);
  assert.deepEqual(
    b.markers.map((marker) => marker.label),
    b.sections.map((section) => section.label)
  );
});

test('the --sections filter keeps only the named sections', () => {
  const b = showcase.buildShowcase({ sections: ['spin'] });
  assert.equal(b.entries.length, 3);
  for (const entry of b.entries) assert.equal(entry.section, 'spin');
  assert.equal(b.markers.length, 1);
});

test('the built showcase matches the committed files (deterministic build)', () => {
  const b = built();
  assert.equal(fs.readFileSync(outPath(), 'utf8'), showcase.serialize(b.project));
  assert.equal(fs.readFileSync(mdPath(), 'utf8'), showcase.indexMarkdown(b));
});

test('the Help menu offers the layer showcase in all five languages', () => {
  const menu = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'menu.js'), 'utf8');
  assert.match(menu, /key: 'studio\.help\.layerShowcase', action: 'layerShowcase'/);
  const app = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'app.js'), 'utf8');
  assert.match(app, /layerShowcase: layerShowcaseProject/);
  assert.match(app, /readAsset\('data\/layer-showcase\.json'\)/);

  globalThis.window = globalThis;
  globalThis.SA = globalThis.SA || {};
  require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
  const i18n = globalThis.SA.i18n;
  for (const code of ['en', 'ja', 'es', 'fr', 'ru']) {
    i18n.set(code);
    const label = i18n.t('studio.help.layerShowcase');
    assert.ok(typeof label === 'string' && label.trim().length > 0, `${code} label`);
    assert.notEqual(label, 'studio.help.layerShowcase', `${code} label is missing`);
  }
});
