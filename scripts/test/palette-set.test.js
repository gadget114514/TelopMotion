'use strict';

// The theme palette set: #1 plus `extra` palettes, the per-beat switch chance
// and the role-invert chance. weird picks how many palettes are in play, the
// run draws one per beat and project.js resolves the choice; the classic cue
// lottery + scheme path stays for the beats flagged `colorLegacy`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const fx = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background']) {
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', `${name}.js`));
}

const SA = {
  fx,
  color: require(path.join(ROOT, 'renderer', 'js', 'color.js')),
  rng: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'rng.js')),
  moods: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'moods.js')),
  weird: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'weird.js')),
  genParams: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gen-params.js')),
  legibility: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'legibility.js')),
  paletteRoles: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'palette-roles.js')),
  stagePalette: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'stage-palette.js')),
  fxAxes: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'fx-axes.js')),
  textflow: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'textflow.js')),
  project: require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js')),
  fillers: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'fillers.js')),
  rhythm: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'rhythm.js')),
  figures: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'figures.js')),
  fillerRender: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-render.js')),
  fillerPresets: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-presets.js')),
  compositions: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'compositions.js')),
  genres: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'genres.js')),
  direct: require(path.join(ROOT, 'renderer', 'js', 'studio', 'direct.js')),
};
globalThis.SA = SA;

const roles = SA.paletteRoles;
const color = SA.color;
const projectModule = SA.project;

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'direct-w0.json'), 'utf8'));

// text <-> background: a dark ground, a light text and a mid accent (the
// color-scheme fixture palette, whose TMBD resolves)
const SWAP_BG = ['#101018', '#202838', '#eef2ff', '#ff8a3d', '#05060a', '#ffc247'];
const EXTRA = roles.upgradeColors(['#0a1a10', '#12301c', '#f0fff0', '#00c060', '#001008', '#9be8c8']);

// --- weird.paletteCount / paletteSetOf --------------------------------------

test('paletteCount walks from one palette to the set maximum', () => {
  assert.equal(SA.weird.paletteCount({ weird: 0 }, 5), 1);
  assert.equal(SA.weird.paletteCount({ weird: 1 }, 5), 5);
  assert.equal(SA.weird.paletteCount({ weird: 0.5 }, 5), 3);
  assert.equal(SA.weird.paletteCount({ weird: 1 }, 3), 3);
  assert.equal(SA.weird.paletteCount({ weird: 1 }, 1), 1);
  assert.equal(SA.weird.paletteCount({}, 8), 1);
  assert.equal(SA.weird.paletteCount({ weird: 1 }, 0), 1, 'an explicit 0 clamps to one palette');
  assert.equal(SA.weird.paletteCount({ weird: 1 }), 5, 'a missing maximum uses the default');
});

test('paletteSetOf defaults and clamps a stored set', () => {
  const defaults = roles.paletteSetOf({});
  assert.deepEqual({ max: defaults.max, change: defaults.change, invert: defaults.invert }, { max: 5, change: 0.5, invert: 0.2 });
  assert.deepEqual(defaults.extra, []);
  const clamped = roles.paletteSetOf({ paletteSet: { max: 99, change: 2, invert: -1 } });
  assert.equal(clamped.max, 8);
  assert.equal(clamped.change, 1);
  assert.equal(clamped.invert, 0);
  const low = roles.paletteSetOf({ paletteSet: { max: 0 } });
  assert.equal(low.max, 1);
  // extra is returned as stored, so a stored index keeps pointing at it
  const extra = [{ id: 'p2' }];
  assert.equal(roles.paletteSetOf({ paletteSet: { extra } }).extra, extra);
  assert.equal(roles.setColors({ paletteSet: { extra } }, 1), null, 'a palette without colours is missing');
});

// --- createPaletteLadder ----------------------------------------------------

test('createPaletteLadder draws no random at change 0 or count 1', () => {
  const explode = () => {
    throw new Error('random was drawn');
  };
  for (const options of [{ count: 5, change: 0, random: explode }, { count: 1, change: 1, random: explode }]) {
    const ladder = SA.direct.createPaletteLadder(options);
    assert.equal(ladder.choose(null), 0);
    assert.equal(ladder.choose(0), 0);
    assert.equal(ladder.choose(3), 3);
  }
});

test('createPaletteLadder change 1 always moves to another palette', () => {
  const ladder = SA.direct.createPaletteLadder({ count: 5, change: 1, random: SA.rng.rngFor(7, 'palette-ladder-test') });
  let prev = ladder.choose(null);
  assert.equal(prev, 0, 'the song opens on #1');
  for (let i = 0; i < 50; i += 1) {
    const next = ladder.choose(prev);
    assert.notEqual(next, prev, `beat ${i} repeats ${next}`);
    assert.ok(next >= 0 && next < 5, `beat ${i} index ${next}`);
    prev = next;
  }
});

test('createPaletteLadder change 0.5 switches about half the time', () => {
  const ladder = SA.direct.createPaletteLadder({ count: 5, change: 0.5, random: SA.rng.rngFor(11, 'palette-ladder-rate') });
  let prev = ladder.choose(null);
  let moves = 0;
  for (let i = 0; i < 400; i += 1) {
    const next = ladder.choose(prev);
    if (next !== prev) moves += 1;
    prev = next;
  }
  const rate = moves / 400;
  assert.ok(rate >= 0.35 && rate <= 0.65, `switch rate ${rate}`);
});

// --- resolveStyle -----------------------------------------------------------

function baseDoc() {
  return {
    style: {
      palette: { id: 'base', name: 'base', colors: SWAP_BG.slice() },
      paletteSet: { max: 5, change: 0.5, invert: 0.2, extra: [{ id: 'two', name: 'two', colors: EXTRA.slice() }] },
      edge: [{ type: 'outline', params: { color: SWAP_BG[4] } }],
    },
    cueStyles: {},
    beatKindStyle: {},
    beatStyles: { b1: { paletteIndex: 1 } },
    styleMode: { axes: { weird: 0.7 } },
    overrides: {},
  };
}

test('resolveStyle applies the beat palette and moves the inherited colours', () => {
  const doc = baseDoc();
  const resolved = projectModule.resolveStyle(doc, 'cue:c1/beat:b1');
  assert.deepEqual(resolved.palette.colors, EXTRA);
  assert.deepEqual(resolved.palette.set, { index: 1, invert: false, from: SWAP_BG.slice() });
  // the inherited literal edge colour follows the palette (the exact role)
  assert.equal(resolved.edge[0].params.color, EXTRA[4]);
  // the scheme-free beat keeps the base palette
  const plain = projectModule.resolveStyle(doc, 'cue:c1/beat:b2');
  assert.deepEqual(plain.palette.colors, SWAP_BG);
  assert.equal(plain.palette.set, undefined);
});

test('resolveStyle resolves paletteInvert through the invert scheme', () => {
  const doc = baseDoc();
  doc.beatStyles.b1 = { paletteInvert: true };
  const resolved = projectModule.resolveStyle(doc, 'cue:c1/beat:b1');
  const expected = roles.applyScheme(SWAP_BG, roles.SCHEME_INVERT, 0.7);
  assert.ok(expected, 'TMBD resolves on the fixture palette');
  assert.deepEqual(resolved.palette.colors, expected);
  assert.equal(resolved.palette.set.index, 0);
  assert.equal(resolved.palette.set.invert, true);
  assert.deepEqual(resolved.palette.set.from, SWAP_BG);
});

test('resolveStyle ignores an out-of-range palette index', () => {
  const doc = baseDoc();
  doc.beatStyles.b1 = { paletteIndex: 9 };
  const resolved = projectModule.resolveStyle(doc, 'cue:c1/beat:b1');
  assert.deepEqual(resolved.palette.colors, SWAP_BG);
  assert.equal(resolved.palette.set, undefined);
});

test('a beat palette sits on the cue palette and records it as from', () => {
  const CUE = ['#b0b0b0', '#a8a8a8', '#f0f0f0', '#151515', '#c0c0c0', '#d0d0d0'];
  const doc = baseDoc();
  doc.cueStyles.c1 = { palette: { id: 'cue1', name: 'cue1', colors: CUE.slice(), auto: true } };
  const resolved = projectModule.resolveStyle(doc, 'cue:c1/beat:b1');
  assert.deepEqual(resolved.palette.colors, EXTRA);
  assert.deepEqual(resolved.palette.set.from, CUE);
});

test('a short extra under a 10-role base upgrades to the base role count', () => {
  const raw = ['#0a1a10', '#12301c', '#f0fff0', '#00c060', '#001008', '#9be8c8'];
  const doc = baseDoc();
  doc.style.palette.colors = roles.upgradeColors(SWAP_BG);
  doc.style.paletteSet.extra = [{ id: 'two', name: 'two', colors: raw.slice() }];
  assert.deepEqual(roles.setColors(doc.style, 1), roles.upgradeColors(raw));
  const resolved = projectModule.resolveStyle(doc, 'cue:c1/beat:b1');
  assert.deepEqual(resolved.palette.colors, roles.upgradeColors(raw));
  assert.equal(resolved.palette.set.from.length, resolved.palette.colors.length, 'both sides carry the same role count');
});

// --- stage follow -----------------------------------------------------------

test('stageAt uses the pre-beat palette as the clip source', () => {
  const doc = baseDoc();
  doc.script = { cues: [{ id: 'c1', start: 0, end: 10 }] };
  doc.beats = { c1: [{ id: 'c1:page0', cueId: 'c1', start: 0, end: 4, text: 'a' }] };
  doc.beatStyles = { 'c1:page0': { paletteIndex: 1 } };
  const stage = SA.stagePalette.stageAt(doc, 1, projectModule.resolveStyle);
  assert.ok(stage);
  assert.deepEqual(stage.cue, SWAP_BG.slice());
  assert.deepEqual(stage.to, EXTRA);
  // outside every beat the stage is plain
  assert.equal(SA.stagePalette.stageAt(doc, 11, projectModule.resolveStyle), null);
});

// --- run() ------------------------------------------------------------------

function prepareRun(doc, extra) {
  if (!(doc.tracks || []).some((track) => track && track.kind === 'figure')) {
    const tracks = doc.tracks || (doc.tracks = []);
    const at = tracks.reduce((index, track, i) => (track && track.kind === 'subtitle' ? i : index), -1);
    tracks.splice(at + 1, 0, { id: 'fig', kind: 'figure', name: 'figure' });
  }
  return SA.direct.prepare(doc, {
    axes: { ...FIXTURE.axes, ...((extra && extra.axes) || {}) },
    seed: FIXTURE.seed,
    genre: null,
    direction: 'horizontal',
    look: null,
    lookClip: null,
    themeStyle: JSON.parse(JSON.stringify(FIXTURE.themeStyle)),
    cueLooks: {},
    analysis: null,
    compose: true,
    ...(extra || {}),
  });
}

function runWith(mutate, extra) {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  if (typeof mutate === 'function') mutate(doc);
  SA.direct.run(doc, prepareRun(doc, extra));
  return doc;
}

function beatsOf(doc) {
  const out = [];
  for (const cue of doc.script.cues) for (const beat of (doc.beats && doc.beats[cue.id]) || []) out.push({ cue, beat, bag: doc.beatStyles[beat.id] || {} });
  return out;
}

test('a weird 0 run writes no palette set and no beat palette state', () => {
  for (const compose of [true, false]) {
    const doc = runWith(null, { axes: { weird: 0 }, compose });
    assert.equal(doc.style.paletteSet, undefined, `no palette set at weird 0 (compose ${compose})`);
    for (const { beat, bag } of beatsOf(doc)) {
      assert.equal(bag.paletteIndex, undefined, `${beat.id} paletteIndex`);
      assert.equal(bag.paletteInvert, undefined, `${beat.id} paletteInvert`);
      assert.equal(bag.colorScheme, undefined, `${beat.id} colorScheme`);
    }
  }
});

test('a weird 1 run generates the palette set and moves the beats', () => {
  for (const compose of [true, false]) {
    const doc = runWith(null, { axes: { weird: 1 }, compose });
    const set = doc.style.paletteSet;
    assert.ok(set, `the set is stored (compose ${compose})`);
    assert.equal(set.max, 5);
    assert.equal(set.change, 0.5);
    assert.equal(set.invert, 0.2);
    assert.equal(set.extra.length, 4);
    assert.ok(set.extra.every((entry) => entry.auto === true), 'every generated palette is auto');
    const indexed = [];
    let schemes = 0;
    for (const { beat, bag } of beatsOf(doc)) {
      if (bag.paletteIndex) indexed.push(bag.paletteIndex);
      if (bag.colorScheme) schemes += 1;
    }
    assert.ok(indexed.length > 0, `some beat picked a palette (compose ${compose})`);
    assert.ok(indexed.every((index) => index >= 1 && index <= 4), 'inside the set');
    assert.equal(schemes, 0, 'no classic scheme without a legacy beat');
    for (const cue of doc.script.cues) {
      const own = doc.cueStyles[cue.id];
      assert.ok(!(own && own.palette && own.palette.auto), `no auto cue palette (compose ${compose})`);
    }
    // every stored palette resolves to a usable colour list
    for (let index = 1; index <= 4; index += 1) {
      const colors = roles.setColors(doc.style, index);
      assert.ok(Array.isArray(colors) && colors.length >= 6, `palette #${index + 1}`);
    }
  }
});

test('the palette set is deterministic for one seed', () => {
  const first = runWith(null, { axes: { weird: 1 } });
  const second = runWith(null, { axes: { weird: 1 } });
  assert.deepEqual(first.style.paletteSet, second.style.paletteSet);
  assert.deepEqual(first.beatStyles, second.beatStyles);
});

test('a re-run rebuilds the auto palettes and keeps the user palettes', () => {
  const doc = runWith(null, { axes: { weird: 1 } });
  const user = { id: 'mine', name: 'mine', colors: ['#000000', '#111111', '#ffffff', '#ff0000', '#000010', '#ff8080'] };
  doc.style.paletteSet.extra.unshift(user);
  SA.direct.run(doc, prepareRun(doc, { axes: { weird: 1 } }));
  const extra = doc.style.paletteSet.extra;
  assert.equal(extra.length, 4);
  assert.equal(extra[0].id, 'mine', 'the user palette keeps its slot');
  assert.deepEqual(extra[0].colors, user.colors);
  assert.equal(extra.filter((entry) => entry && entry.auto).length, 3, 'the auto palettes were rebuilt');
});

test('invert: 1 marks beats and every resolved beat stays readable', () => {
  const doc = runWith((projectDoc) => {
    projectDoc.style.paletteSet = { max: 5, change: 0.5, invert: 1, extra: [] };
  }, { axes: { weird: 1 } });
  let inverted = 0;
  for (const { cue, beat } of beatsOf(doc)) {
    const bag = doc.beatStyles[beat.id] || {};
    if (bag.paletteInvert) inverted += 1;
    const resolved = projectModule.resolveStyle(doc, `cue:${cue.id}/beat:${beat.id}`);
    const colors = (resolved.palette && resolved.palette.colors) || [];
    const text = roles.get(colors, roles.SLOT.TEXT_FILL);
    const bg = roles.get(colors, roles.SLOT.MID_A);
    if (!text || !bg) continue;
    const ratio = color.contrastRatio(color.parse(text), color.parse(bg));
    assert.ok(ratio >= 4.5 - 1e-6, `${beat.id} text/background ${ratio}`);
  }
  assert.ok(inverted > 0, 'some beat inverted');
});

test('a beat that switched palette draws its own edge in the new colours', () => {
  // pin one outline deco so every beat draws a literal edge colour; a change:0
  // run is the cue-palette baseline and change:1 forces a switch on every beat
  const params = { beatDecoChance: 1, decoNone: 0, decoOutline: 1, decoShadow: 0, decoExtrude: 0, decoLongShadow: 0, decoDouble: 0, decoGlow: 0 };
  const withChange = (change) => (projectDoc) => {
    projectDoc.style.paletteSet = { max: 5, change, invert: 0, extra: [] };
  };
  const switched = runWith(withChange(1), { axes: { weird: 1 }, compose: true, params });
  const plain = runWith(withChange(0), { axes: { weird: 1 }, compose: true, params });
  const edgesOf = (doc) => {
    const map = new Map();
    for (const { beat, bag } of beatsOf(doc)) if (Array.isArray(bag.edge)) map.set(beat.id, JSON.stringify(bag.edge));
    return map;
  };
  const after = edgesOf(switched);
  const before = edgesOf(plain);
  let followed = 0;
  for (const { beat, bag } of beatsOf(switched)) {
    if (!bag.paletteIndex || !after.has(beat.id) || !before.has(beat.id)) continue;
    // the same beat-deco draw ran in both runs (same seed / pins): only the
    // palette it drew from changed, so the stack must differ
    assert.notEqual(after.get(beat.id), before.get(beat.id), `${beat.id} own edge follows the beat palette`);
    followed += 1;
  }
  assert.ok(followed > 0, 'some switched beat drew its own edge');
});
