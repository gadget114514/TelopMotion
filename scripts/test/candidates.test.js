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
globalThis.SA.color = globalThis.SA.color || require('../../renderer/js/color.js');
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
  // only the candidate list moved (the pool is candidate storage too)
  const after = snapshot();
  delete after.beatCandidates;
  delete after.candidatePool;
  const base = JSON.parse(JSON.stringify(before));
  delete base.beatCandidates;
  delete base.candidatePool;
  assert.deepEqual(after, base);
  // a candidate-list edit is not undoable: no history entry, the list stays
  assert.equal(store.canUndo(), false);
  assert.notEqual(store.commands.candidatesOf(BEAT), null);
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
  const hasColour = (item) => {
    const bag = item.look.beatBag || {};
    return colourKeys.some((key) => bag[key] != null) || !!(bag.color && bag.color.fill) || !!(bag.palette && bag.palette.colors);
  };
  assert.ok(drawn.some(hasColour), 'a colour (scheme key or text fill) is drawn');
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

test('generated candidates switch the palette and some carry clones', () => {
  store.load(fixture());
  store.state.project.style.palette = {
    colors: ['#101018', '#f4f1ea', '#ff5a5f', '#ffd166', '#06d6a0', '#118ab2', '#8338ec', '#ef476f', '#3a86ff', '#fb5607', '#ffbe0b', '#2b2d42'],
  };
  const made = store.commands.generateCandidates('c1', BEAT, { count: 6, mode: 'mixed' });
  assert.ok(made >= 4);
  const entry = store.commands.candidatesOf(BEAT);
  const generated = entry.items.filter((item) => item.kind !== 'original');
  // the colour axis switches the beat's whole palette
  const palettes = new Set(
    generated.map((item) => {
      const palette = item.look.beatBag.palette;
      return palette && palette.colors ? JSON.stringify(palette.colors) : '';
    }),
  );
  palettes.delete('');
  assert.ok(palettes.size >= 3, `distinct palettes: ${palettes.size}`);
  const cloned = generated.filter((item) => Array.isArray(item.look.beatBag.clones) && item.look.beatBag.clones.length);
  assert.ok(cloned.length >= 1, 'at least one candidate carries clones');
  assert.ok(cloned.length < generated.length, 'not every candidate carries clones');
});

test('narrowing the axes to typeface leaves colour and clones untouched', () => {
  store.load(fixture());
  store.commands.generateCandidates('c1', BEAT, { count: 4, mode: 'far', axes: ['font'] });
  const entry = store.commands.candidatesOf(BEAT);
  for (const item of entry.items.filter((candidate) => candidate.kind !== 'original')) {
    assert.equal(item.look.beatBag.color, undefined);
    assert.equal(item.look.beatBag.clones, undefined);
  }
});

test('a palette candidate repaints the backdrop clips under the beat and the original puts them back', () => {
  store.load(fixture());
  const palette = ['#101018', '#f4f1ea', '#ff5a5f', '#ffd166', '#06d6a0', '#118ab2', '#8338ec', '#ef476f', '#3a86ff', '#fb5607', '#ffbe0b', '#2b2d42'];
  store.state.project.style.palette = { colors: palette };
  const track = store.state.project.tracks.find((entry) => entry.kind === 'background');
  const clip = store.state.project.clips.find((entry) => entry.trackId === track.id) || store.state.project.clips[0];
  clip.trackId = track.id;
  clip.start = 0;
  clip.end = 4;
  clip.spec = { type: 'solid', params: { color: palette[2] } };
  clip.colors = [palette[2], palette[3]];
  const originalClip = JSON.stringify({ spec: clip.spec, colors: clip.colors });
  store.commands.generateCandidates('c1', BEAT, { count: 4, mode: 'near', axes: ['color'] });
  const entry = store.commands.candidatesOf(BEAT);
  const original = entry.items.find((item) => item.kind === 'original');
  assert.ok(original.look.clips[clip.id], 'the original records the clip');
  const other = entry.items.find((item) => item.kind !== 'original' && item.look.beatBag.palette);
  assert.ok(other, 'a candidate carries its own palette');
  store.commands.applyCandidate('c1', BEAT, other.id);
  const live = store.state.project.clips.find((entry2) => entry2.id === clip.id);
  assert.notEqual(JSON.stringify({ spec: live.spec, colors: live.colors }), originalClip);
  store.commands.applyCandidate('c1', BEAT, original.id);
  const back = store.state.project.clips.find((entry2) => entry2.id === clip.id);
  assert.equal(JSON.stringify({ spec: back.spec, colors: back.colors }), originalClip);
});

test('the clones switch is its own axis: off keeps the base clones, on may add them', () => {
  store.load(fixture());
  store.commands.generateCandidates('c1', BEAT, { count: 6, mode: 'mixed', axes: { color: true, font: true, effects: true, placement: true, clones: false } });
  const off = store.commands.candidatesOf(BEAT).items.filter((item) => item.kind !== 'original');
  assert.ok(off.length >= 1);
  for (const item of off) assert.equal(item.look.beatBag.clones, undefined);

  store.load(fixture());
  store.commands.generateCandidates('c1', BEAT, { count: 6, mode: 'mixed', axes: ['clones'] });
  const on = store.commands.candidatesOf(BEAT).items.filter((item) => item.kind !== 'original');
  assert.ok(on.some((item) => Array.isArray(item.look.beatBag.clones) && item.look.beatBag.clones.length));
  // only the clone family moved: no palette, no effect type changes
  for (const item of on) assert.equal(item.look.beatBag.palette, undefined);
});

test('ensureAllOriginals records every beat once, is idempotent and skips the history', () => {
  store.load(fixture());
  const made = store.commands.ensureAllOriginals();
  assert.ok(made >= 1);
  assert.equal(store.canUndo(), false, 'a candidate-only edit never reaches the history');
  assert.equal(store.isDirty(), true, 'but it still dirties the project');
  const entry = store.commands.candidatesOf(BEAT);
  assert.equal(entry.items.length, 1);
  assert.equal(entry.items[0].kind, 'original');
  // a second run has nothing to do: no command, no notify, no revision bump
  const rev = store.state.candidateRev;
  assert.equal(store.commands.ensureAllOriginals(), 0);
  assert.equal(store.state.candidateRev, rev);
});

test('clip snapshots are packed and shared through the pool', () => {
  const doc = fixture();
  doc.beats.c2 = [{ id: 'c2:page0', cueId: 'c2', kind: 'page', start: 7, end: 10, text: 'world' }];
  store.load(doc);
  // clip1 (background, 0..8) overlaps both beats
  store.commands.generateCandidates('c1', BEAT, { count: 1, mode: 'near' });
  store.commands.generateCandidates('c2', 'c2:page0', { count: 1, mode: 'near' });
  const first = store.commands.candidatesOf(BEAT).items[0].look.clips.clip1;
  const second = store.commands.candidatesOf('c2:page0').items[0].look.clips.clip1;
  assert.equal(typeof first, 'string', 'a stored look keeps a hash, not the snapshot');
  assert.equal(first, second, 'the shared clip is stored once');
  const pool = store.state.project.candidatePool;
  assert.equal(Object.keys(pool).length, 1);
  assert.ok(pool[first] && pool[first].spec);
});

test('candidates survive undo / redo and an undo of an apply restores the look only', () => {
  store.load(fixture());
  store.commands.generateCandidates('c1', BEAT, { count: 3, mode: 'far' });
  const entry = store.commands.candidatesOf(BEAT);
  const other = entry.items.find((item) => item.kind !== 'original');
  const originalLook = JSON.stringify(store.state.project.beatStyles[BEAT] || {});
  store.commands.applyCandidate('c1', BEAT, other.id);
  assert.equal(store.undo(), true);
  assert.equal(JSON.stringify(store.state.project.beatStyles[BEAT] || {}), originalLook);
  const afterUndo = store.commands.candidatesOf(BEAT);
  assert.ok(afterUndo, 'the list survives the undo');
  assert.ok(afterUndo.items.some((item) => item.id === other.id));
  // the active candidate is derived again: the original is what the beat wears
  assert.equal(afterUndo.activeId, afterUndo.items.find((item) => item.kind === 'original').id);
  assert.equal(store.redo(), true);
  assert.equal(store.commands.candidatesOf(BEAT).activeId, other.id);
});

test('a candidate-only change dirties the project without an undo entry', () => {
  store.load(fixture());
  store.markClean();
  assert.equal(store.isDirty(), false);
  store.commands.generateCandidates('c1', BEAT, { count: 2, mode: 'near' });
  assert.equal(store.canUndo(), false);
  assert.equal(store.isDirty(), true);
  store.markClean();
  assert.equal(store.isDirty(), false);
  const entry = store.commands.candidatesOf(BEAT);
  const victim = entry.items.find((item) => item.kind !== 'original');
  store.commands.removeCandidate(BEAT, victim.id);
  assert.equal(store.canUndo(), false);
  assert.equal(store.isDirty(), true);
});

test('save / load round trip keeps both candidate keys', () => {
  store.load(fixture());
  store.commands.generateCandidates('c1', BEAT, { count: 2, mode: 'near' });
  const raw = JSON.parse(JSON.stringify(store.state.project));
  const reloaded = projectModule.migrate(raw).project;
  assert.ok(Object.keys(reloaded.beatCandidates).length >= 1);
  assert.ok(Object.keys(reloaded.candidatePool).length >= 1);
  assert.deepEqual(reloaded.beatCandidates, raw.beatCandidates);
  assert.deepEqual(reloaded.candidatePool, raw.candidatePool);
});

test('regenerating keeps only the original, the pinned and the one in use, and never exceeds 15', () => {
  store.load(fixture());
  store.commands.generateCandidates('c1', BEAT, { count: 6, mode: 'mixed' });
  let entry = store.commands.candidatesOf(BEAT);
  const first = entry.items.filter((item) => item.kind !== 'original');
  assert.ok(first.length >= 3);
  const pinned = first[0];
  const inUse = first[1];
  const dropped = first.slice(2).map((item) => item.id);
  store.commands.toggleCandidatePin(BEAT, pinned.id);
  store.commands.applyCandidate('c1', BEAT, inUse.id);
  store.commands.generateCandidates('c1', BEAT, { count: 4, mode: 'near' });
  entry = store.commands.candidatesOf(BEAT);
  const ids = entry.items.map((item) => item.id);
  assert.ok(entry.items.some((item) => item.kind === 'original'), 'original stays');
  assert.ok(ids.includes(pinned.id), 'pinned stays');
  assert.ok(ids.includes(inUse.id), 'the one in use stays');
  for (const id of dropped) assert.equal(ids.includes(id), false, `${id} was dropped`);
  assert.equal(entry.activeId, inUse.id);
  // repeated draws never pile up past the per-beat limit
  for (let round = 0; round < 6; round += 1) store.commands.generateCandidates('c1', BEAT, { count: 12, mode: 'mixed' });
  assert.ok(store.commands.candidatesOf(BEAT).items.length <= 15);
});

test('with nothing but kept candidates the draw is limited by the room left', () => {
  store.load(fixture());
  store.commands.generateCandidates('c1', BEAT, { count: 12, mode: 'mixed' });
  const entry = store.commands.candidatesOf(BEAT);
  for (const item of entry.items.filter((candidate) => candidate.kind !== 'original').slice(0, 12)) {
    store.commands.toggleCandidatePin(BEAT, item.id);
  }
  const kept = store.commands.candidatesOf(BEAT).items.length;
  const made = store.commands.generateCandidates('c1', BEAT, { count: 12, mode: 'mixed' });
  assert.ok(made <= 15 - kept);
  assert.ok(store.commands.candidatesOf(BEAT).items.length <= 15);
});
