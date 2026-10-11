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
// the palette dice draw through the colors module (studio.html loads it after
// the store; the test needs it on SA before the reroll commands run)
require('../../renderer/js/studio/colors.js');
require('../../renderer/js/studio/store.js');
const store = globalThis.SA.store;

void fx;

function fixture() {
  return projectModule.defaults({
    styleMode: { order: 'cycle', seed: 12345, locked: [], axes: { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5 } },
    script: {
      cues: [
        { id: 'c1', start: 0, end: 4, text: 'hello', trackId: 'sub1' },
        { id: 'c2', start: 7, end: 10, text: 'world', trackId: 'sub1' },
      ],
    },
    beats: { c1: [{ id: 'c1:page0', cueId: 'c1', start: 0, end: 4, kind: 'page', text: 'hello' }] },
    clips: [
      { id: 'clip1', trackId: 'bg', start: 0, end: 8, spec: { type: 'solid', params: {} }, opacity: 1, fadeIn: 0.3, fadeOut: 0.3, colors: null },
    ],
  });
}


function snapshot() {
  return JSON.parse(JSON.stringify(store.state.project));
}

function readIn(object, path) {
  let node = object;
  for (const part of path) {
    if (!node || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}

const BEAT = 'c1:page0';

test('generating keeps the beat untouched and records the original first', () => {
  store.load(fixture());
  const before = snapshot();
  const made = store.commands.generateCandidates('c1', BEAT, { count: 4, mode: 'mixed' });
  assert.ok(made >= 1);
  const entry = store.commands.candidatesOf(BEAT);
  assert.equal(entry.items[0].kind, 'original');
  assert.equal(entry.items[0].pinned, true);
  assert.equal(entry.activeId, entry.items[0].id);
  assert.equal(entry.items.length, made + 1);
  // only the candidate list moved
  const after = snapshot();
  delete after.beatCandidates;
  const base = JSON.parse(JSON.stringify(before));
  delete base.beatCandidates;
  assert.deepEqual(after, base);
  assert.equal(store.undo(), true);
  assert.equal(store.commands.candidatesOf(BEAT), null);
});

test('applying a candidate sets its look and the original can be chosen back', () => {
  store.load(fixture());
  const original = JSON.stringify(store.state.project.beatStyles[BEAT] || {});
  store.commands.generateCandidates('c1', BEAT, { count: 3, mode: 'far' });
  const entry = store.commands.candidatesOf(BEAT);
  const other = entry.items.find((item) => item.kind !== 'original');
  assert.equal(store.commands.applyCandidate('c1', BEAT, other.id), true);
  assert.equal(store.commands.candidatesOf(BEAT).activeId, other.id);
  assert.equal(JSON.stringify(store.state.project.beatStyles[BEAT] || {}), JSON.stringify(other.look.beatBag || {}));
  const originalItem = entry.items.find((item) => item.kind === 'original');
  store.commands.applyCandidate('c1', BEAT, originalItem.id);
  assert.equal(JSON.stringify(store.state.project.beatStyles[BEAT] || {}), original);
});

test('a hand-made look is kept as a candidate before another one replaces it', () => {
  store.load(fixture());
  store.commands.generateCandidates('c1', BEAT, { count: 2, mode: 'near' });
  const entry = store.commands.candidatesOf(BEAT);
  const target = entry.items.find((item) => item.kind !== 'original');
  store.state.project.beatStyles[BEAT] = { text: { size: 77 } };
  const before = entry.items.length;
  store.commands.applyCandidate('c1', BEAT, target.id);
  const next = store.commands.candidatesOf(BEAT);
  assert.equal(next.items.length, before + 1);
  assert.equal(next.items.some((item) => item.kind === 'previous' && item.look.beatBag.text.size === 77), true);
});

test('generating with an axes filter keeps the untouched axes from the current look', () => {
  store.load(fixture());
  store.state.project.beatStyles[BEAT] = {
    text: { fontId: 'KeepFace', weight: 700, align: 'left', maxWidth: 0.5, size: 55 },
    layout: { type: 'grid', params: {} },
    enter: { type: 'fade', params: {}, enabled: true },
  };
  const made = store.commands.generateCandidates('c1', BEAT, { count: 6, mode: 'near', axes: { effects: true } });
  assert.ok(made >= 1, 'an effects-only roll still produces candidates');
  const entry = store.commands.candidatesOf(BEAT);
  for (const item of entry.items) {
    if (item.kind === 'original') continue;
    const bag = item.look.beatBag || {};
    // effects were rolled, but typeface / placement / layout / size stayed put
    assert.equal(readIn(bag, ['text', 'fontId']), 'KeepFace');
    assert.equal(readIn(bag, ['text', 'weight']), 700);
    assert.equal(readIn(bag, ['text', 'align']), 'left');
    assert.equal(readIn(bag, ['text', 'size']), 55);
    assert.equal(readIn(bag, ['layout', 'type']), 'grid');
  }
});

test('a colour-only roll draws beat colour keys and leaves everything else alone', () => {
  store.load(fixture());
  store.state.project.style.palette = {
    colors: ['#101018', '#f4f1ea', '#ff5a5f', '#ffd166', '#06d6a0', '#118ab2', '#8338ec', '#ef476f', '#3a86ff', '#fb5607', '#ffbe0b', '#2b2d42'],
  };
  store.state.project.beatStyles[BEAT] = {
    text: { fontId: 'KeepFace', weight: 700, size: 55 },
    enter: { type: 'fade', params: {}, enabled: true },
  };
  const made = store.commands.generateCandidates('c1', BEAT, { count: 4, mode: 'near', axes: { color: true } });
  assert.ok(made >= 1, 'a colour-only roll produces candidates');
  const entry = store.commands.candidatesOf(BEAT);
  const colourKeys = ['paletteIndex', 'paletteInvert', 'colorScheme', 'colorLegacy'];
  const drawn = entry.items.filter((item) => item.kind !== 'original');
  assert.ok(drawn.some((item) => colourKeys.some((key) => (item.look.beatBag || {})[key] != null)), 'a colour key is drawn');
  for (const item of drawn) {
    const bag = item.look.beatBag || {};
    assert.equal(readIn(bag, ['text', 'fontId']), 'KeepFace');
    assert.equal(readIn(bag, ['text', 'size']), 55);
    assert.equal(readIn(bag, ['enter', 'type']), 'fade');
  }
});

test('mixing takes the chosen axes from the sources and the rest from the base', () => {
  store.load(fixture());
  store.commands.generateCandidates('c1', BEAT, { count: 2, mode: 'far' });
  const entry = store.commands.candidatesOf(BEAT);
  const base = entry.items.find((item) => item.kind === 'original');
  const source = entry.items.find((item) => item.kind !== 'original');
  // the mixes are only observable with known values on both sides
  base.look.beatBag = { paletteIndex: 1, text: { fontId: 'Base', weight: 400 }, layout: { type: 'row' } };
  source.look.beatBag = { paletteIndex: 7, text: { fontId: 'Source', weight: 700 }, layout: { type: 'grid' } };
  const id = store.commands.mixCandidate('c1', BEAT, { base: base.id, take: { color: source.id } });
  assert.ok(id);
  const applied = store.state.project.beatStyles[BEAT];
  assert.equal(applied.paletteIndex, 7); // colour came from the source
  assert.equal(applied.text.fontId, 'Base'); // typeface stayed with the base
  assert.equal(applied.text.weight, 400);
  assert.equal(applied.layout.type, 'row');
  const next = store.commands.candidatesOf(BEAT);
  const mixed = next.items.find((item) => item.id === id);
  assert.equal(mixed.kind, 'saved');
  assert.equal(next.activeId, id);
});

test('the original cannot be removed; others can; a rolled-back transaction leaves nothing', () => {
  store.load(fixture());
  store.commands.generateCandidates('c1', BEAT, { count: 2, mode: 'mixed' });
  const entry = store.commands.candidatesOf(BEAT);
  const originalItem = entry.items.find((item) => item.kind === 'original');
  store.commands.removeCandidate(BEAT, originalItem.id);
  assert.equal(store.commands.candidatesOf(BEAT).items.some((item) => item.kind === 'original'), true);
  const victim = entry.items.find((item) => item.kind !== 'original');
  store.commands.removeCandidate(BEAT, victim.id);
  assert.equal(store.commands.candidatesOf(BEAT).items.some((item) => item.id === victim.id), false);

  const before = JSON.stringify(store.state.project);
  const target = store.commands.candidatesOf(BEAT).items.find((item) => item.kind !== 'original');
  store.beginTransaction('hover');
  store.commands.applyCandidate('c1', BEAT, target.id);
  store.cancelTransaction();
  assert.equal(JSON.stringify(store.state.project), before);
});
