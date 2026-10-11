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

test('generating keeps the beat untouched and records its look first (it is the adopted one)', () => {
  store.load(fixture());
  const before = snapshot();
  const made = store.commands.generateCandidates('c1', BEAT, { count: 4, mode: 'mixed' });
  assert.ok(made >= 1);
  const entry = store.commands.candidatesOf(BEAT);
  assert.equal(entry.items[0].kind, 'original', 'the first card is the look the beat had');
  assert.equal(entry.items[0].pinned, false, 'nothing is special about it: no master');
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

  // (the lists are not part of a rollback: applying swaps two rows, which a
  // rollback of the look does not undo — only the project itself is compared)
  const bare = () => {
    const { beatCandidates: _l, candidatePool: _p, ...rest } = store.state.project;
    return JSON.stringify(rest);
  };
  const before = bare();
  const target = store.commands.candidatesOf(BEAT).items.find((item) => item.kind !== 'original');
  store.beginTransaction('hover');
  store.commands.applyCandidate('c1', BEAT, target.id);
  store.cancelTransaction();
  assert.equal(bare(), before);
});

test('adopting a candidate swaps it with the adopted card and keeps six rows at most', () => {
  store.load(fixture());
  store.commands.generateCandidates('c1', BEAT, { count: 6, mode: 'far' });
  let entry = store.commands.candidatesOf(BEAT);
  assert.ok(entry.items.length <= 7, `one adopted + six rows (${entry.items.length})`);
  const master = entry.items.find((item) => item.kind === 'original');
  const other = entry.items.find((item) => item.kind !== 'original');
  const otherIndex = entry.items.indexOf(other);
  const masterIndex = entry.items.indexOf(master);
  store.commands.applyCandidate('c1', BEAT, other.id);
  entry = store.commands.candidatesOf(BEAT);
  // the master (adopted until now) took the picked card's place, and vice versa
  assert.equal(entry.items.indexOf(master), otherIndex);
  assert.equal(entry.items.indexOf(other), masterIndex);
  assert.equal(entry.activeId, other.id);
});

test('"another candidate" redraws every numbered row but keeps the adopted, pinned and master', () => {
  store.load(fixture());
  store.commands.generateCandidates('c1', BEAT, { count: 6, mode: 'far' });
  let entry = store.commands.candidatesOf(BEAT);
  const idsBefore = entry.items.map((item) => item.id);
  const pinned = entry.items.find((item) => item.kind !== 'original');
  store.commands.toggleCandidatePin(BEAT, pinned.id);
  store.commands.generateCandidates('c1', BEAT, { count: 6, mode: 'far' });
  entry = store.commands.candidatesOf(BEAT);
  assert.ok(entry.items.length <= 7);
  assert.equal(entry.items.some((item) => item.kind === 'original'), true);
  assert.equal(entry.items.some((item) => item.id === pinned.id), true);
  const fresh = entry.items.filter((item) => !idsBefore.includes(item.id));
  assert.ok(fresh.length >= 1, 'new candidates were drawn');
  const survivors = entry.items.filter((item) => idsBefore.includes(item.id));
  assert.deepEqual(survivors.map((item) => item.id).sort(), [pinned.id, entry.items.find((item) => item.kind === 'original').id].sort());
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
  // two beats of one cue with an identical clip each (same snapshot): the
  // pool stores that snapshot once
  doc.beats.c1 = [
    { id: 'c1:page0', cueId: 'c1', kind: 'page', start: 0, end: 2, text: 'he' },
    { id: 'c1:page1', cueId: 'c1', kind: 'page', start: 2, end: 4, text: 'llo' },
  ];
  doc.clips = [
    { id: 'clipA', trackId: 'bg', start: 0, end: 2, spec: { type: 'solid', params: {} }, opacity: 1, fadeIn: 0, fadeOut: 0, colors: null },
    { id: 'clipB', trackId: 'bg', start: 2, end: 4, spec: { type: 'solid', params: {} }, opacity: 1, fadeIn: 0, fadeOut: 0, colors: null },
  ];
  store.load(doc);
  store.commands.generateCandidates('c1', 'c1:page0', { count: 1, mode: 'near' });
  store.commands.generateCandidates('c1', 'c1:page1', { count: 1, mode: 'near' });
  const first = store.commands.candidatesOf('c1:page0').items[0].look.clips.clipA;
  const second = store.commands.candidatesOf('c1:page1').items[0].look.clips.clipB;
  assert.equal(typeof first, 'string', 'a stored look keeps a hash, not the snapshot');
  assert.equal(first, second, 'the same snapshot is stored once');
  const pool = store.state.project.candidatePool;
  assert.equal(Object.keys(pool).length, 1);
  assert.ok(pool[first] && pool[first].spec);
});

test('a clip shared with other beats is neither recorded in a look nor rewritten by adopting one', () => {
  store.load(fixture());
  // clip1 (background, 0..8) runs past the beat (0..4): it is shared
  store.commands.generateCandidates('c1', BEAT, { count: 3, mode: 'near', axes: { color: true } });
  const entry = store.commands.candidatesOf(BEAT);
  for (const item of entry.items) assert.equal(Object.keys(item.look.clips || {}).length, 0, 'no shared clip in any look');
  const clipBefore = JSON.stringify(store.state.project.clips.find((clip) => clip.id === 'clip1'));
  const other = entry.items.find((item) => item.id !== entry.activeId);
  store.commands.applyCandidate('c1', BEAT, other.id);
  assert.equal(JSON.stringify(store.state.project.clips.find((clip) => clip.id === 'clip1')), clipBefore);
  // the palette stayed on the beat: no other beat's style moved
  assert.deepEqual(Object.keys(store.state.project.beatStyles), [BEAT]);
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
  const doc = fixture();
  // a clip inside the beat is recorded in its looks (and so lands in the pool)
  doc.clips = [{ id: 'clip1', trackId: 'bg', start: 0, end: 4, spec: { type: 'solid', params: {} }, opacity: 1, fadeIn: 0, fadeOut: 0, colors: null }];
  store.load(doc);
  store.commands.generateCandidates('c1', BEAT, { count: 2, mode: 'near' });
  const raw = JSON.parse(JSON.stringify(store.state.project));
  const reloaded = projectModule.migrate(raw).project;
  assert.ok(Object.keys(reloaded.beatCandidates).length >= 1);
  assert.ok(Object.keys(reloaded.candidatePool).length >= 1);
  assert.deepEqual(reloaded.beatCandidates, raw.beatCandidates);
  assert.deepEqual(reloaded.candidatePool, raw.candidatePool);
});

test('regenerating keeps only the pinned and the one in use, and never exceeds 6 rows + the adopted', () => {
  store.load(fixture());
  store.commands.generateCandidates('c1', BEAT, { count: 6, mode: 'mixed' });
  let entry = store.commands.candidatesOf(BEAT);
  const first = entry.items.filter((item) => item.id !== entry.activeId);
  assert.ok(first.length >= 3);
  const pinned = first[0];
  const inUse = first[1];
  const dropped = first.slice(2).map((item) => item.id);
  store.commands.toggleCandidatePin(BEAT, pinned.id);
  store.commands.applyCandidate('c1', BEAT, inUse.id);
  store.commands.generateCandidates('c1', BEAT, { count: 4, mode: 'near' });
  entry = store.commands.candidatesOf(BEAT);
  const ids = entry.items.map((item) => item.id);
  assert.ok(ids.includes(pinned.id), 'pinned stays');
  assert.ok(ids.includes(inUse.id), 'the one in use stays');
  for (const id of dropped) assert.equal(ids.includes(id), false, `${id} was dropped`);
  assert.equal(entry.activeId, inUse.id);
  // repeated draws never pile up past the per-beat limit
  for (let round = 0; round < 6; round += 1) store.commands.generateCandidates('c1', BEAT, { count: 12, mode: 'mixed' });
  assert.ok(store.commands.candidatesOf(BEAT).items.length <= 7);
});

test('with nothing but kept candidates the draw is limited by the room left', () => {
  store.load(fixture());
  store.commands.generateCandidates('c1', BEAT, { count: 12, mode: 'mixed' });
  const entry = store.commands.candidatesOf(BEAT);
  for (const item of entry.items.filter((candidate) => candidate.id !== entry.activeId).slice(0, 12)) {
    store.commands.toggleCandidatePin(BEAT, item.id);
  }
  const kept = store.commands.candidatesOf(BEAT).items.length;
  const made = store.commands.generateCandidates('c1', BEAT, { count: 12, mode: 'mixed' });
  assert.ok(made <= 7 - kept);
  assert.ok(store.commands.candidatesOf(BEAT).items.length <= 15);
});

test('loading another project bumps the epoch the candidate UI resets on', () => {
  store.load(fixture());
  const first = store.state.projectEpoch;
  store.commands.generateCandidates('c1', BEAT, { count: 2, mode: 'near' });
  store.load(fixture());
  assert.equal(store.state.projectEpoch, first + 1);
  assert.equal(store.commands.candidatesOf(BEAT), null);
});

test('loading drops a previous candidate that only differs by clip colours', () => {
  store.load(fixture());
  store.commands.generateCandidates('c1', BEAT, { count: 2, mode: 'near' });
  const doc = snapshot();
  const entry = doc.beatCandidates[BEAT];
  const original = entry.items.find((item) => item.kind === 'original');
  const twin = JSON.parse(JSON.stringify(original));
  twin.id = 'c99';
  twin.kind = 'previous';
  twin.pinned = false;
  twin.look.clips = { clip1: 'ffffffffffffffff' };
  entry.items.push(twin);
  const before = entry.items.length;
  store.load(doc);
  const after = store.commands.candidatesOf(BEAT);
  assert.equal(after.items.length, before - 1);
  assert.equal(after.items.some((item) => item.id === 'c99'), false);
  assert.equal(after.items.some((item) => item.kind === 'original'), true);
});

test('a whole-song variation joins the list first and is the adopted card', () => {
  store.load(fixture());
  store.commands.generateCandidates('c1', BEAT, { count: 3, mode: 'near' });
  const before = store.commands.candidatesOf(BEAT);
  const idsBefore = before.items.map((item) => item.id);
  const firstLook = JSON.stringify(before.items[0].look);
  store.commands.varyAll();
  const entry = store.commands.candidatesOf(BEAT);
  assert.equal(entry.items.length, idsBefore.length + 1);
  // the new look is the adopted one and heads the list; the rest keep their order
  assert.equal(JSON.stringify(entry.items[0].look.beatBag || {}), JSON.stringify(store.state.project.beatStyles[BEAT] || {}));
  assert.equal(entry.activeId, entry.items[0].id);
  assert.deepEqual(entry.items.slice(1).map((item) => item.id), idsBefore);
  // the card adopted before is still there, untouched, one click away
  assert.equal(JSON.stringify(entry.items[1].look), firstLook);
});

test('the overflow of a variation goes from the bottom and keeps the kept ones', () => {
  store.load(fixture());
  store.commands.generateCandidates('c1', BEAT, { count: 6, mode: 'near' });
  let entry = store.commands.candidatesOf(BEAT);
  const bottom = entry.items[entry.items.length - 1];
  const pinned = entry.items[entry.items.length - 2];
  store.commands.toggleCandidatePin(BEAT, pinned.id);
  assert.equal(store.commands.candidatesOf(BEAT).items.find((item) => item.id === pinned.id).pinned, true);
  for (let round = 0; round < 3; round += 1) store.commands.varyAll();
  entry = store.commands.candidatesOf(BEAT);
  assert.ok(entry.items.length <= 7, 'the adopted card + six rows');
  assert.equal(entry.items.some((item) => item.id === pinned.id), true, 'a pinned candidate is never pushed out');
  assert.equal(entry.items.some((item) => item.id === bottom.id), false, 'the bottom one was pushed out');
  assert.equal(new Set(entry.items.map((item) => item.id)).size, entry.items.length);
});

test('a colour change also joins the list instead of replacing the adopted card', () => {
  store.load(fixture());
  store.state.project.style.palette = {
    colors: ['#101018', '#f4f1ea', '#ff5a5f', '#ffd166', '#06d6a0', '#118ab2', '#8338ec', '#ef476f', '#3a86ff', '#fb5607', '#ffbe0b', '#2b2d42'],
  };
  store.commands.generateCandidates('c1', BEAT, { count: 2, mode: 'near' });
  const before = store.commands.candidatesOf(BEAT);
  const originalBefore = JSON.stringify(before.items[0].look);
  const count = before.items.length;
  store.commands.rerollColors();
  const entry = store.commands.candidatesOf(BEAT);
  assert.equal(JSON.stringify(entry.items[0].look), originalBefore);
  assert.ok(entry.items.length >= count);
});

test('a beat that wears one of its candidates keeps its original card', () => {
  store.load(fixture());
  store.commands.generateCandidates('c1', BEAT, { count: 2, mode: 'far' });
  const entry = store.commands.candidatesOf(BEAT);
  const originalBefore = JSON.stringify(entry.items.find((item) => item.kind === 'original').look);
  const other = entry.items.find((item) => item.kind !== 'original');
  store.commands.applyCandidate('c1', BEAT, other.id);
  assert.equal(JSON.stringify(store.commands.candidatesOf(BEAT).items.find((item) => item.kind === 'original').look), originalBefore);
});

test('an edit made while the thumbnail transaction is open is not rolled back with it', () => {
  store.load(fixture());
  store.commands.generateCandidates('c1', BEAT, { count: 2, mode: 'near' });
  store.beginTransaction('candidate thumbnails', { ephemeral: true });
  const token = store.transactionToken();
  const other = store.commands.candidatesOf(BEAT).items.find((item) => item.kind !== 'original');
  store.runEphemeral(() => store.commands.applyCandidate('c1', BEAT, other.id));
  // the user edits meanwhile
  store.commands.setBeatText ? 0 : 0;
  const cueBefore = store.state.project.script.cues[1].start;
  store.commands.moveCue('c2', 1);
  assert.notEqual(store.transactionToken(), token, 'the scratch transaction was rolled back first');
  const moved = store.state.project.script.cues.find((cue) => cue.id === 'c2').start;
  assert.notEqual(moved, cueBefore, 'the edit is applied');
  // and the owner finishing its job must not undo it
  if (store.transactionToken() === token) store.cancelTransaction();
  assert.equal(store.state.project.script.cues.find((cue) => cue.id === 'c2').start, moved);
  assert.equal(store.canUndo(), true, 'the edit reached the history');
});


test('the filler in the gap right after a beat follows that beat palette (and only that gap)', () => {
  const doc = fixture();
  doc.clips = [
    { id: 'fillerNear', trackId: 'filler', start: 4, end: 7, spec: { type: 'solid', params: { color: '#112233' } }, opacity: 1, fadeIn: 0, fadeOut: 0, colors: ['#112233'] },
  ];
  store.load(doc);
  store.commands.generateCandidates('c1', BEAT, { count: 2, mode: 'near' });
  const entry = store.commands.candidatesOf(BEAT);
  // the filler between beat c1 (0-4) and the next beat (7) is part of the beat's look
  assert.ok(entry.items[0].look.clips && 'fillerNear' in entry.items[0].look.clips, 'the gap filler is recorded');
});
