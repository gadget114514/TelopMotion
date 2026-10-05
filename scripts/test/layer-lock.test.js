'use strict';

// Sheet lock (`layer.locked`): manual setups survive destructive paths.
// Explicit per-sheet edits still work; only deletion and wholesale
// replacement are blocked (randomize / vary / recolor never touch sheets).

const test = require('node:test');
const assert = require('node:assert/strict');

const fx = require('../../renderer/js/lyrics/effects/registry.js');
require('../../renderer/js/lyrics/effects/animation.js');
require('../../renderer/js/lyrics/effects/layout.js');
require('../../renderer/js/lyrics/effects/enter.js');
require('../../renderer/js/lyrics/effects/exit.js');
require('../../renderer/js/lyrics/effects/hold.js');
require('../../renderer/js/lyrics/effects/location.js');
require('../../renderer/js/lyrics/effects/fill.js');
require('../../renderer/js/lyrics/effects/edge.js');
require('../../renderer/js/lyrics/effects/post.js');
require('../../renderer/js/lyrics/effects/background.js');

const projectModule = require('../../renderer/js/studio/project.js');
globalThis.window = globalThis;
globalThis.SA = globalThis.SA || {};
globalThis.SA.project = projectModule;
globalThis.SA.moods = require('../../renderer/js/lyrics/moods.js');
globalThis.SA.weird = require('../../renderer/js/lyrics/weird.js');
globalThis.SA.genParams = require('../../renderer/js/lyrics/gen-params.js');
globalThis.SA.paletteRoles = require('../../renderer/js/lyrics/palette-roles.js');
globalThis.SA.rng = require('../../renderer/js/lyrics/rng.js');
globalThis.SA.fillers = require('../../renderer/js/lyrics/fillers.js');
globalThis.SA.credits = require('../../renderer/js/lyrics/credits.js');
globalThis.SA.textflow = require('../../renderer/js/lyrics/textflow.js');
globalThis.SA.random = require('../../renderer/js/lyrics/random.js');
globalThis.SA.figures = require('../../renderer/js/lyrics/figures.js');
globalThis.SA.keywords = require('../../renderer/js/lyrics/keywords.js');
globalThis.SA.compositions = require('../../renderer/js/lyrics/compositions.js');
globalThis.SA.direct = require('../../renderer/js/studio/direct.js');
require('../../renderer/js/studio/colors.js');
require('../../renderer/js/studio/store.js');
const store = globalThis.SA.store;

void fx;

function sheet(id, patch) {
  return {
    id, slot: 'background', type: 'image', src: `${id}.png`, fit: 'cover',
    color: '#ffffff', opacity: 1, blend: 'normal', radius: 0, enabled: true,
    start: 0, end: null, transform: { x: 0, y: 0, scale: 1, rotate: 0 },
    ...(patch || {}),
  };
}

function fixture() {
  return projectModule.defaults({
    script: { cues: [{ id: 'c1', start: 0, end: 4, text: 'hello', trackId: 'sub1' }] },
    layers: [sheet('a'), sheet('b', { locked: true }), sheet('c')],
    keyframes: {
      'layer:b': { 'transform.x': [{ t: 0, value: 0, ease: 'linear' }] },
      'layer:c': { 'transform.x': [{ t: 0, value: 0, ease: 'linear' }] },
    },
  });
}

function ids() {
  return store.state.project.layers.map((layer) => layer.id);
}

test('removeLayer refuses a locked sheet and keeps its keyframes', () => {
  store.load(fixture());
  store.commands.removeLayer('b');
  assert.deepEqual(ids(), ['a', 'b', 'c']);
  assert.ok(store.state.project.keyframes['layer:b'], 'locked keys survive');
  store.commands.removeLayer('c');
  assert.deepEqual(ids(), ['a', 'b']);
  assert.ok(!store.state.project.keyframes['layer:c'], 'unlocked keys are pruned');
  assert.ok(store.undo(), true);
  assert.deepEqual(ids(), ['a', 'b', 'c']);
});

test('setLayers preserves locked sheets missing from the incoming list', () => {
  store.load(fixture());
  const next = store.state.project.layers.filter((layer) => layer.id !== 'b').map((layer) => ({ ...layer }));
  store.commands.setLayers(next);
  assert.deepEqual(ids(), ['a', 'b', 'c'], 'locked sheet spliced back at its index');
  assert.ok(store.state.project.keyframes['layer:b'], 'locked keys survive the replace');
  const dropUnlocked = store.state.project.layers.filter((layer) => layer.id !== 'c').map((layer) => ({ ...layer }));
  store.commands.setLayers(dropUnlocked);
  assert.deepEqual(ids(), ['a', 'b']);
  assert.ok(!store.state.project.keyframes['layer:c'], 'unlocked keys are pruned');
});

test('removing a video track re-slots locked sheets instead of deleting them', () => {
  const doc = fixture();
  doc.tracks.push({ id: 'v1', kind: 'video', name: 'v1' });
  doc.layers = [sheet('m', { slot: 'video', trackId: 'v1' }), sheet('n', { slot: 'video', trackId: 'v1', locked: true })];
  store.load(doc);
  store.commands.removeTrack('v1');
  const rest = store.state.project.layers;
  assert.equal(rest.length, 1);
  assert.equal(rest[0].id, 'n');
  assert.equal(rest[0].slot, 'background');
  assert.ok(!('trackId' in rest[0]) || rest[0].trackId == null, 'no dangling track reference');
  assert.ok(store.undo(), true);
  assert.equal(store.state.project.layers.length, 2);
});

test('explicit per-sheet edits still apply to locked sheets', () => {
  store.load(fixture());
  store.commands.setLayer('b', { opacity: 0.5 });
  assert.equal(store.state.project.layers.find((layer) => layer.id === 'b').opacity, 0.5);
  store.commands.setKeyframe('layer:b', 'transform.x', 1, 0.25, 'linear');
  assert.equal(store.state.project.keyframes['layer:b']['transform.x'].length, 2);
});

test('migrate keeps the locked flag and sheet keyframes', () => {
  const migrated = projectModule.migrate(JSON.parse(JSON.stringify(fixture())));
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.project.layers.find((layer) => layer.id === 'b').locked, true);
  assert.ok(migrated.project.keyframes['layer:b']);
});
