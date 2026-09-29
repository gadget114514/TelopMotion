'use strict';

// The built-in filler preset library: 100+ stable, valid specs that render
// through the primitive vocabulary without ever throwing.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const fillerRender = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-render.js'));
const fillerPresets = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-presets.js'));

const FRAME = { width: 1920, height: 1080 };

function ctx(time) {
  return {
    time,
    frame: FRAME,
    clip: { key: 'fill_0', start: 0, end: 4, from: 0, to: 4 },
    duration: 4,
    progress: time / 4,
    seed: 7,
    analysis: null,
    bpm: 120,
    nextText: 'Next line',
    prevText: 'Previous line',
    meta: { title: 'Title', artist: 'Artist' },
    colors: ['#ff0000', '#00ff00'],
  };
}

const KEYS = ['x', 'y', 'x0', 'y0', 'x1', 'y1', 'w', 'h', 'radius', 'r'];

function checkShapes(shapes, id, t) {
  assert.ok(Array.isArray(shapes), `${id}: shapes array at ${t}`);
  for (const shape of shapes) {
    for (const key of KEYS) {
      if (shape[key] != null) assert.ok(Number.isFinite(shape[key]), `${id}: ${key} at ${t} (${shape[key]})`);
    }
    if (Array.isArray(shape.points)) {
      for (const point of shape.points) {
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), `${id}: point at ${t}`);
      }
    }
  }
}

test('the library has 100+ stable, labelled presets', () => {
  const list = fillerPresets.list();
  assert.ok(list.length >= 100, `presets ${list.length}`);
  const ids = new Set();
  const groups = new Set(fillerPresets.groups());
  for (const preset of list) {
    assert.match(preset.id, /^[a-z]+(-[a-z0-9]+)+$/, `id ${preset.id}`);
    assert.ok(!ids.has(preset.id), `duplicate id ${preset.id}`);
    ids.add(preset.id);
    assert.ok(groups.has(preset.group), `${preset.id}: group ${preset.group}`);
    assert.ok(preset.label && preset.label.en && preset.label.ja, `${preset.id}: labels`);
  }
  assert.equal(ids.size, list.length);
  // every group is populated
  for (const group of fillerPresets.groups()) {
    assert.ok(list.some((preset) => preset.group === group), `group ${group} is empty`);
  }
});

test('every preset validates and renders finite shapes at any time', () => {
  for (const preset of fillerPresets.list()) {
    const validation = fillerRender.validate(preset.spec);
    assert.ok(validation.ok, `${preset.id}: ${validation.errors.join(', ')}`);
    for (const t of [0.1, 1.5, 3.9]) {
      const list = fillerRender.drawList(preset.spec, ctx(t));
      checkShapes(list.shapes || [], preset.id, t);
    }
    // text presets (direct or nested in a combo) hand the engine an animation
    if (preset.group === 'text') {
      const list = fillerRender.drawList(preset.spec, ctx(1.5));
      assert.ok((list.textAnims || []).length > 0, `${preset.id}: textAnims`);
    }
  }
});

test('the presets render to at least 100 distinct looks', () => {
  const hashes = new Set();
  for (const preset of fillerPresets.list()) {
    const list = fillerRender.drawList(preset.spec, ctx(1.5));
    const rounded = (value) => (typeof value === 'number' ? Math.round(value * 10) / 10 : value);
    const walk = (item) => {
      if (Array.isArray(item)) return item.map(walk);
      if (!item || typeof item !== 'object') return rounded(item);
      const out = {};
      for (const key of Object.keys(item).sort()) out[key] = walk(item[key]);
      return out;
    };
    const hash = fillerRender.hashString(JSON.stringify({ shapes: walk(list.shapes || []), texts: walk(list.texts || []), anims: walk((list.textAnims || []).map((anim) => anim.params)) }));
    hashes.add(hash);
  }
  assert.ok(hashes.size >= 100, `distinct looks ${hashes.size}`);
});

test('layersOf / fromLayers round-trip and keep the metadata', () => {
  const single = { type: 'pattern', params: { mode: 'dots' } };
  assert.deepEqual(fillerRender.layersOf(single), [single]);
  assert.deepEqual(fillerRender.layersOf({ type: 'none', params: {} }), []);
  const combo = { type: 'combo', params: { list: [single, { type: 'figures', params: {} }, { type: 'textAnim', params: { text: '{title}' } }] } };
  assert.equal(fillerRender.layersOf(combo).length, 3);
  assert.deepEqual(fillerRender.fromLayers(fillerRender.layersOf(combo)).type, 'combo');
  assert.equal(fillerRender.fromLayers([]).type, 'none');
  assert.equal(fillerRender.fromLayers([single]).type, 'pattern');
  const withMeta = fillerRender.fromLayers([single], { name: 'My filler' });
  assert.equal(withMeta.name, 'My filler');
});

test('validate rejects unknown types, deep nesting and too many layers', () => {
  assert.equal(fillerRender.validate({ type: 'pattern', params: {} }).ok, true);
  assert.equal(fillerRender.validate({ type: 'notAType', params: {} }).ok, false);
  assert.equal(fillerRender.validate({ type: 'pattern' }).ok, false);
  const deep = { type: 'combo', params: { list: [{ type: 'combo', params: { list: [{ type: 'combo', params: { list: [{ type: 'pattern', params: {} }] } }] } }] } };
  assert.equal(fillerRender.validate(deep).ok, false);
  const many = { type: 'combo', params: { list: Array.from({ length: 9 }, () => ({ type: 'pattern', params: {} })) } };
  assert.equal(fillerRender.validate(many).ok, false);
  const eight = { type: 'combo', params: { list: Array.from({ length: 8 }, () => ({ type: 'pattern', params: {} })) } };
  assert.equal(fillerRender.validate(eight).ok, true);
});

test('expandTokens replaces the four tokens and leaves unknown ones alone', () => {
  const context = { meta: { title: 'T', artist: 'A' }, nextText: 'N', prevText: 'P' };
  assert.equal(fillerRender.expandTokens('{title} / {artist} / {next} / {prev}', context), 'T / A / N / P');
  assert.equal(fillerRender.expandTokens('keep {x}', context), 'keep {x}');
  assert.equal(fillerRender.expandTokens('', context), '');
});
