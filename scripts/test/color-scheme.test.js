'use strict';

// The beat colour schemes: a 4-letter role order applied to the cue palette.
// The colours are never stored — palette-roles derives them, project.js applies
// them, direct.js draws the order per beat and stage-palette.js makes the
// timeline clips follow the live beat.

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

// text <-> background: 12 fixed slots (mid A/B/C/D, text, accent, edge,
// text-bg, figure A/B, spare, glow). Generated once via upgradeColors from a
// 10-slot seed, which yields viable schemes under the 12-slot contract.
const SWAP_BG = ['#210b24', '#3e1837', '#1a240b', '#040a06', '#fff0d4', '#d13f94', '#86285f', '#1f1d1b', '#662b26', '#266166', '#50233a', '#d13f94'];
// text <-> backdrop: a second 12-slot palette
const SWAP_MID = ['#241a0b', '#0a0904', '#0b1524', '#102e31', '#d8ffd4', '#d1a53f', '#866a28', '#1b1f1b', '#4f6626', '#4c3080', '#1a1c0c', '#d1a53f'];

function contractPairs(palette, weirdRaw) {
  const pairs = [
    ['T', 'B', roles.ratioFor('text', weirdRaw)],
    ['T', 'M', roles.ratioFor('backdrop', weirdRaw)],
    ['D', 'T', roles.ratioFor('soft', weirdRaw)],
    ['M', 'B', roles.ratioFor('neighbour', weirdRaw)],
  ];
  if (palette.length >= 12) pairs.push(['H', 'B', 3]);
  return pairs;
}

function holdsContract(palette, weirdRaw) {
  const slots = roles.roleSlots(palette);
  return contractPairs(palette, weirdRaw).every(([a, b, ratio]) => roles.contrast(palette[slots[a]], palette[slots[b]]) >= ratio - 1e-6);
}

test('applyScheme assigns the stored hexes exactly', () => {
  const tm = roles.applyScheme(SWAP_BG, 'TMBD', 0.7);
  assert.ok(tm, 'TMBD resolves on the background-swap palette');
  const bg = roles.roleSlots(SWAP_BG);
  // the text and the ground carry the source hexes byte for byte (the other
  // roles may be nudged by the contrast repair)
  assert.equal(tm[bg.T], SWAP_BG[bg.B]);
  assert.equal(tm[bg.B], SWAP_BG[bg.T]);
  assert.equal(tm[bg.M], SWAP_BG[bg.M]);
  assert.notEqual(tm, SWAP_BG, 'a copy');

  const bt = roles.applyScheme(SWAP_MID, 'BTMD', 0);
  assert.ok(bt, 'BTMD resolves on the mid-swap palette');
  const mid = roles.roleSlots(SWAP_MID);
  assert.equal(bt[mid.T], SWAP_MID[mid.M]);
  assert.equal(bt[mid.M], SWAP_MID[mid.T]);
  assert.equal(bt[mid.B], SWAP_MID[mid.B]);
  assert.equal(bt[mid.D], SWAP_MID[mid.D]);
});

test('applyScheme rejects invalid ids and repair-immune palettes', () => {
  assert.equal(roles.applyScheme(SWAP_BG, 'BMTX', 0.7), null);
  assert.equal(roles.applyScheme(SWAP_BG, 'BMT', 0.7), null);
  assert.equal(roles.applyScheme(['#101018', '#202838'], 'TMBD', 0.7), null);
  // every role the same mid grey: no swap can reach the text ratio without
  // wiping the original character, so the permutation is refused
  const flat = ['#404040', '#414141', '#808080', '#808080', '#808080', '#808080'];
  assert.equal(roles.applyScheme(flat, 'BTMD', 1), null);
});

test('schemes() only returns contract-holding, distinct permutations', () => {
  const ten = SA.moods.paletteFor10({ weird: 0.7, speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5 }, SA.rng.mulberry32(301)).colors;
  for (const [palette, label] of [[SWAP_BG, 'legacy'], [ten, '12 roles']]) {
    for (const w of [0, 0.7, 1]) {
      const list = roles.schemes(palette, w);
      assert.ok(list.length >= 1, `${label} w${w} has candidates`);
      const seen = new Set();
      for (const entry of list) {
        assert.notEqual(entry.id, roles.SCHEME_BASE, 'the identity is never a candidate');
        assert.ok(holdsContract(entry.colors, w), `${entry.id} holds the contract`);
        const key = entry.colors.join('|').toLowerCase();
        assert.ok(!seen.has(key), `${entry.id} is not a duplicate`);
        seen.add(key);
      }
      assert.deepEqual(roles.schemes(palette, w).map((s) => s.id), list.map((s) => s.id), 'deterministic order');
    }
  }
});

// --- resolveStyle -----------------------------------------------------------

function styleDoc() {
  const cue2 = SWAP_BG.slice().reverse();
  return {
    style: {
      palette: { id: 'base', name: 'base', colors: SWAP_BG },
      color: { fill: { kind: 'palette', index: 2 }, stroke: { kind: 'solid', value: SWAP_BG[4] } },
      edge: [{ type: 'outline', params: { color: SWAP_BG[2] } }],
    },
    cueStyles: {
      c1: { palette: { id: 'cue1', name: 'cue1', colors: SWAP_MID, auto: true } },
      c2: { palette: { id: 'cue2', name: 'cue2', colors: cue2 } },
    },
    beatKindStyle: {},
    beatStyles: { b1: { colorScheme: 'BTMD' }, b2: {} },
    styleMode: { axes: { weird: 0.7 } },
    overrides: {},
  };
}

test('resolveStyle moves the inherited colours onto an auto cue palette', () => {
  const doc = styleDoc();
  const base = projectModule.resolveStyle(doc, '');
  const cue = projectModule.resolveStyle(doc, 'cue:c1');
  assert.equal(cue.palette.colors.join('|'), doc.cueStyles.c1.palette.colors.join('|'));
  // the inherited edge colour follows the new cue palette
  assert.notEqual(cue.edge[0].params.color, base.edge[0].params.color);
  // a manual cue palette keeps the old behaviour (the store repainted it)
  const manual = projectModule.resolveStyle(doc, 'cue:c2');
  assert.equal(manual.edge[0].params.color, base.edge[0].params.color);
  assert.equal(manual.color.stroke.value, base.color.stroke.value);
});

test('resolveStyle applies the beat scheme and records its origin', () => {
  const doc = styleDoc();
  const cue = projectModule.resolveStyle(doc, 'cue:c1');
  const beat = projectModule.resolveStyle(doc, 'cue:c1/beat:b1');
  const expected = roles.applyScheme(cue.palette.colors, 'BTMD', 0.7);
  assert.ok(expected);
  assert.equal(beat.palette.colors.join('|'), expected.join('|'));
  assert.equal(beat.palette.scheme.id, 'BTMD');
  assert.equal(beat.palette.scheme.from.join('|'), cue.palette.colors.join('|'));
  // the scheme-free beat stays on the cue palette
  const plain = projectModule.resolveStyle(doc, 'cue:c1/beat:b2');
  assert.equal(plain.palette.colors.join('|'), cue.palette.colors.join('|'));
  assert.equal(plain.palette.scheme, undefined);
  // inherited literal colours follow the permutation, the beat's own do not
  doc.beatStyles.b1.edge = [{ type: 'outline', params: { color: '#123456' } }];
  const own = projectModule.resolveStyle(doc, 'cue:c1/beat:b1');
  assert.equal(own.edge[0].params.color, '#123456');
});

test('resolveStyle without a scheme or auto palette is the plain merge', () => {
  const doc = {
    style: { color: { fill: { kind: 'palette', index: 2 } }, text: { size: 96 } },
    cueStyles: { c1: { text: { size: 60 } } },
    beatKindStyle: {},
    beatStyles: { b1: { text: { size: 40 } } },
    overrides: {},
  };
  const resolved = projectModule.resolveStyle(doc, 'cue:c1/beat:b1');
  assert.deepEqual(resolved, {
    color: { fill: { kind: 'palette', index: 2 } },
    text: { size: 40 },
  });
});

// --- cue palette lottery ----------------------------------------------------

function themeCtx(axes, seed) {
  return { axes, seed, genre: null, params: SA.genParams.resolve({ axes }), themeStyle: { palette: { id: 't', name: 't', colors: SWAP_BG } } };
}

test('cuePalette draws no random at weird 0 and a visible palette above it', () => {
  const original = SA.rng.rngFor;
  let calls = 0;
  SA.rng.rngFor = (...args) => {
    calls += 1;
    return original(...args);
  };
  try {
    const cue = { id: 'c1' };
    assert.equal(SA.direct.cuePalette({}, cue, 0, themeCtx({ weird: 0 }, 7), null), null);
    assert.equal(calls, 0, 'weird 0 consumes no random');
    const drawn = SA.direct.cuePalette({}, cue, 0, themeCtx({ weird: 1 }, 7), null);
    assert.ok(drawn && drawn.colors.length, 'weird 1 draws');
    assert.ok(calls > 0);
    assert.equal(drawn.auto, undefined, 'the auto marker is added by the caller');
    assert.notDeepEqual(drawn.colors, SWAP_BG);
    const other = SA.direct.cuePalette({}, cue, 0, themeCtx({ weird: 1 }, 8), SWAP_BG.slice().reverse());
    assert.ok(other && other.colors.length);
    // the text-vs-ground floor of the axis holds
    const ratio = color.contrastRatio(color.parse(drawn.colors[2]), color.parse(drawn.colors[0]));
    assert.ok(ratio >= 4.5 - 1e-6, `text contrast ${ratio}`);
  } finally {
    SA.rng.rngFor = original;
  }
});

test('the cue lottery keeps the base palette at about 1 - weird', () => {
  let basic = 0;
  const total = 120;
  for (let i = 0; i < total; i += 1) {
    const cue = { id: `c${i}` };
    const drawn = SA.direct.cuePalette({}, cue, i, themeCtx({ weird: 0.5 }, 12), null);
    if (!drawn) basic += 1;
  }
  assert.ok(basic > total * 0.35 && basic < total * 0.65, `basic ${basic}/${total}`);
});

// --- colour ladder ----------------------------------------------------------

test('createColorLadder moves away from the previous scheme and never flickers', () => {
  const drawn = roles.schemes(SWAP_BG, 0.7);
  assert.ok(drawn.length >= 2);
  const original = SA.rng.rngFor;
  let calls = 0;
  SA.rng.rngFor = (...args) => {
    calls += 1;
    return original(...args);
  };
  try {
    const still = SA.direct.createColorLadder({ change: 0, random: () => 0.5 });
    assert.equal(still.choose({ start: 0, duration: 1, candidates: drawn, prev: null }), null);
    assert.equal(still.choose({ start: 1, duration: 1, candidates: drawn, prev: { id: 'TMBD', start: 0 } }), null);
    assert.equal(calls, 0);
  } finally {
    SA.rng.rngFor = original;
  }
  const ladder = SA.direct.createColorLadder({ change: 1, random: SA.rng.rngFor(3, 'color-ladder-test') });
  let prev = null;
  let previousId = null;
  const ids = [null, ...drawn.map((entry) => entry.id)];
  for (let i = 0; i < 12; i += 1) {
    const id = ladder.choose({ start: i * 1.2, duration: 1.2, candidates: drawn, prev });
    if (previousId !== null) assert.notEqual(id, previousId, `beat ${i} repeats ${id}`);
    prev = { id, start: prev && prev.id === id ? prev.start : i * 1.2 };
    previousId = id;
    assert.ok(ids.includes(id));
  }
  // a beat closer than 0.5 s keeps the previous choice
  const flicker = SA.direct.createColorLadder({ change: 1, random: () => 0 });
  const kept = flicker.choose({ start: 0.2, duration: 0.2, candidates: drawn, prev: { id: 'TMBD', start: 0 } });
  assert.equal(kept, 'TMBD');
});

test('createColorLadder toggles the invert on its own stream', () => {
  const invertId = roles.SCHEME_INVERT;
  const candidates = roles.schemes(SWAP_BG, 0.7);
  assert.ok(candidates.some((entry) => entry.id === invertId), 'the fixture palette lacks TMBD');
  const ladder = SA.direct.createColorLadder({ change: 1, random: () => 0, invert: 1, invertRandom: () => 0 });
  assert.equal(ladder.choose({ start: 0, duration: 1, candidates, prev: null }), null);
  assert.equal(ladder.choose({ start: 1, duration: 1, candidates, prev: { id: null, start: 0 } }), invertId);
  assert.equal(ladder.choose({ start: 2, duration: 1, candidates, prev: { id: invertId, start: 1 } }), null);
  // without TMBD in the pool the toggle is skipped and the normal draw decides
  const pool = candidates.filter((entry) => entry.id !== invertId);
  const noInvert = SA.direct.createColorLadder({ change: 1, random: () => 0.9, invert: 1, invertRandom: () => 0 });
  const pick = noInvert.choose({ start: 1, duration: 1, candidates: pool, prev: { id: null, start: 0 } });
  assert.notEqual(pick, invertId);
});

// --- run() ------------------------------------------------------------------

function prepareRun(doc, extra) {
  if (!(doc.tracks || []).some((track) => track && track.kind === 'figure')) {
    const tracks = doc.tracks || (doc.tracks = []);
    const at = tracks.reduce((index, track, i) => (track && track.kind === 'subtitle' ? i : index), -1);
    tracks.splice(at + 1, 0, { id: 'fig', kind: 'figure', name: '図形' });
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

// Flags every beat the run builds with the classic colour mode. The run calls
// SA.textflow.apply itself (with its own chunk settings and rhythm plan), so the
// beat ids only exist then: wrap the pass and flag what it produced.
function withLegacyBeats(doc, fn) {
  const original = SA.textflow.apply;
  SA.textflow.apply = (project, options) => {
    const result = original(project, options);
    project.beatStyles = project.beatStyles || {};
    for (const cue of project.script.cues || []) {
      for (const beat of (project.beats && project.beats[cue.id]) || []) {
        const bag = project.beatStyles[beat.id] || (project.beatStyles[beat.id] = {});
        bag.colorLegacy = true;
      }
    }
    return result;
  };
  try {
    return fn();
  } finally {
    SA.textflow.apply = original;
  }
}

function runOn(extra) {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const opts = extra || {};
  // the legacy option flags every beat with the classic colour mode: only then
  // does the run use the cue palette lottery and the scheme ladder
  if (opts.legacy) withLegacyBeats(doc, () => SA.direct.run(doc, prepareRun(doc, opts)));
  else SA.direct.run(doc, prepareRun(doc, opts));
  return doc;
}

function schemesOf(doc) {
  const out = [];
  for (const cue of doc.script.cues) {
    for (const beat of doc.beats[cue.id] || []) {
      const style = doc.beatStyles[beat.id];
      out.push((style && style.colorScheme) || null);
    }
  }
  return out;
}

function autoCues(doc) {
  return doc.script.cues.filter((cue) => {
    const own = doc.cueStyles[cue.id];
    return !!(own && own.palette && own.palette.auto);
  }).length;
}

test('a weird run draws cue palettes and beat schemes, weird 0 draws neither', () => {
  for (const compose of [true, false]) {
    const zero = runOn({ legacy: true, axes: { weird: 0 }, compose });
    assert.equal(autoCues(zero), 0, `no cue palette at weird 0 (compose ${compose})`);
    assert.ok(schemesOf(zero).every((id) => id == null), `no beat scheme at weird 0 (compose ${compose})`);

    const weird = runOn({ legacy: true, axes: { weird: 1 }, compose });
    assert.equal(autoCues(weird), weird.script.cues.length, `weird 1 re-rolls every cue (compose ${compose})`);
    const schemes = schemesOf(weird);
    assert.ok(schemes.some((id) => id != null), `at least one beat carries a scheme (compose ${compose})`);
    for (const id of schemes) {
      if (id == null) continue;
      assert.ok(roles.BEAT_SCHEME_IDS.includes(id));
      assert.notEqual(id, roles.SCHEME_BASE);
    }
    // the cue's text is still readable on its ground
    for (const cue of weird.script.cues) {
      const style = projectModule.resolveStyle(weird, `cue:${cue.id}`);
      const palette = style.palette.colors;
      assert.ok(color.contrastRatio(color.parse(palette[2]), color.parse(palette[0])) >= 4.5 - 1e-6, cue.id);
    }
  }
});

test('a re-run replaces the schemes instead of stacking them', () => {
  const first = runOn({ legacy: true, axes: { weird: 1, seed: 5 } });
  const before = schemesOf(first).join(',');
  SA.direct.run(first, prepareRun(first, { axes: { weird: 1, seed: 5 } }));
  const after = schemesOf(first).join(',');
  const fresh = runOn({ legacy: true, axes: { weird: 1, seed: 5 } });
  assert.equal(after, schemesOf(fresh).join(','));
  assert.ok(before.length > 0);
});

test('a hidden background track skips the beat schemes', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const track = (doc.tracks || []).find((entry) => entry.kind === 'background');
  assert.ok(track, 'the fixture has a background track');
  track.hidden = true;
  withLegacyBeats(doc, () => SA.direct.run(doc, prepareRun(doc, { axes: { weird: 1 } })));
  assert.ok(schemesOf(doc).every((id) => id == null));
});

test('without the legacy beat flag the run draws the palette set instead', () => {
  for (const compose of [true, false]) {
    const doc = runOn({ axes: { weird: 1 }, compose });
    assert.equal(autoCues(doc), 0, `no cue palette without a legacy beat (compose ${compose})`);
    assert.ok(schemesOf(doc).every((id) => id == null), `no beat scheme without a legacy beat (compose ${compose})`);
    const indexed = [];
    for (const cue of doc.script.cues) {
      for (const beat of (doc.beats && doc.beats[cue.id]) || []) {
        const own = doc.beatStyles && doc.beatStyles[beat.id];
        if (own && own.paletteIndex) indexed.push(own.paletteIndex);
      }
    }
    assert.ok(indexed.length > 0, `the palette ladder moved some beat (compose ${compose})`);
  }
});

// --- stage follow -----------------------------------------------------------

const STAGE_ID = 'stage-test';

// A cue palette drawn from the base and a beat scheme that still resolves on
// top of it (the inverse of a swap can be refused by the contract, so the pair
// is picked with schemes() itself).
const STAGE_CUE = SWAP_MID.slice();
const STAGE_SCHEME = roles.schemes(STAGE_CUE, 0.7)[0];

function stageDoc() {
  return {
    script: { cues: [{ id: 'c1', start: 0, end: 10, trackId: 'sub1' }, { id: 'c2', start: 12, end: 20, trackId: 'sub1' }] },
    beats: {
      c1: [
        { id: 'c1:page0', cueId: 'c1', start: 0, end: 4, text: 'a' },
        { id: 'c1:page1', cueId: 'c1', start: 5, end: 9, text: 'b' },
      ],
      c2: [{ id: 'c2:page0', cueId: 'c2', start: 12, end: 16, text: 'c' }],
    },
    style: { palette: { id: 'base', name: 'base', colors: SWAP_BG } },
    cueStyles: { c1: { palette: { id: 'cue1', name: 'cue1', colors: STAGE_CUE, auto: true } }, c2: {} },
    beatKindStyle: {},
    beatStyles: { 'c1:page0': { colorScheme: STAGE_SCHEME.id } },
    styleMode: { axes: { weird: 0.7 } },
    overrides: {},
    id: STAGE_ID,
  };
}

test('stageAt answers the live beat and keeps the colours through a cue gap', () => {
  const doc = stageDoc();
  const resolve = projectModule.resolveStyle;
  const onBeat = SA.stagePalette.stageAt(doc, 1, resolve);
  assert.ok(onBeat);
  assert.equal(onBeat.beatId, 'c1:page0');
  assert.equal(onBeat.base.join('|'), SWAP_BG.join('|'));
  assert.equal(onBeat.cue.join('|'), STAGE_CUE.join('|'));
  assert.equal(onBeat.to.join('|'), STAGE_SCHEME.colors.join('|'));
  assert.equal(onBeat.text.length, 2, 'the healed text colours travel with the stage');
  // between the beats of the cue the last one keeps painting
  const gap = SA.stagePalette.stageAt(doc, 4.5, resolve);
  assert.equal(gap.beatId, 'c1:page0');
  // the scheme-free beat still follows the cue palette
  const plain = SA.stagePalette.stageAt(doc, 6, resolve);
  assert.equal(plain.beatId, 'c1:page1');
  assert.equal(plain.cue.join('|'), plain.to.join('|'));
  // no cue, no stage
  assert.equal(SA.stagePalette.stageAt(doc, 11, resolve), null);
  // a manual cue palette without a scheme keeps the classic path
  assert.equal(SA.stagePalette.stageAt(doc, 13, resolve), null);
});

test('recolorClip maps the clip onto the live palette and separates the splits', () => {
  const doc = stageDoc();
  const stage = SA.stagePalette.stageAt(doc, 1, projectModule.resolveStyle);
  const clip = {
    id: 'mid1',
    colors: [SWAP_MID[3], SWAP_MID[5]],
    spec: { type: 'combo', params: { list: [{ type: 'split', params: { colors: [SWAP_MID[2], SWAP_MID[3]] } }] } },
  };
  const result = SA.stagePalette.recolorClip(clip, stage.cue, stage, 0.7);
  assert.ok(result);
  assert.notEqual(result.spec, clip.spec);
  assert.deepEqual(clip.spec.params.list[0].params.colors, [SWAP_MID[2], SWAP_MID[3]], 'the input is untouched');
  // the clip colours equal the cue palette roles, so they land on the same roles
  const cue = stage.cue;
  assert.equal(result.colors[0], stage.to[cue.indexOf(SWAP_MID[3])]);
  assert.equal(result.colors[1], stage.to[cue.indexOf(SWAP_MID[5])]);
  // the split planes are pushed away from the live text colours (the repair is
  // a best effort: a colour sandwiched between the text and the hero may not
  // reach the full ratio, but it must never sit closer than before)
  const raw = SA.paletteRoles.recolor(clip.spec, stage.cue, stage.to);
  const minRatio = (colors) =>
    Math.min(...colors.map((hex) => Math.min(...stage.text.map((text) => color.contrastRatio(color.parse(hex), color.parse(text))))));
  const separated = result.spec.params.list[0].params.colors;
  assert.ok(minRatio(separated) > minRatio(raw.params.list[0].params.colors) + 1e-6, 'the split improved');
  for (const hex of separated) assert.ok(!stage.text.includes(hex), `split ${hex} is not the text itself`);
  // the same clip object and key are cached
  assert.equal(SA.stagePalette.recolorClip(clip, stage.cue, stage, 0.7), result);
  // a clip already on the palette comes back as-is
  const same = SA.stagePalette.recolorClip(clip, stage.to, stage, 0.7);
  assert.equal(same.spec, clip.spec);
  assert.equal(same.colors, clip.colors);
});

test('a background clip lands on the first two roles of the live palette', () => {
  const doc = stageDoc();
  const stage = SA.stagePalette.stageAt(doc, 1, projectModule.resolveStyle);
  const clip = { id: 'bg1', colors: [SWAP_BG[0], SWAP_BG[1]], spec: { type: 'noiseGradient', params: { scale: 2, speed: 0.3, colors: [SWAP_BG[0], SWAP_BG[1]] } } };
  const result = SA.stagePalette.recolorClip(clip, stage.base, stage, 0.7);
  assert.ok(result);
  assert.equal(result.colors[0], stage.to[0]);
  assert.equal(result.colors[1], stage.to[1]);
});

test('a calm scheme range keeps only the readable role swaps', () => {
  for (const palette of [SWAP_BG, SWAP_MID]) {
    const calm = roles.schemes(palette, 0.7, 0.2);
    assert.ok(calm.length <= 3, `calm candidates ${calm.length}`);
    for (const entry of calm) assert.ok(['TMBD', 'MBTD', 'TBMD'].includes(entry.id), `unexpected ${entry.id}`);
  }
  // the whole 23-permutation set is unchanged when the range is omitted or 1
  const full = roles.schemes(SWAP_BG, 0.7);
  assert.deepEqual(roles.schemes(SWAP_BG, 0.7, 1).map((entry) => entry.id), full.map((entry) => entry.id));
  assert.deepEqual(roles.schemes(SWAP_BG, 0.7, undefined).map((entry) => entry.id), full.map((entry) => entry.id));
});
