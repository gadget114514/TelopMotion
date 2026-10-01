'use strict';

// Phase 0: `SA.direct` owns the automatic direction. The fixture was captured
// by running the pre-extraction `auto direct` dispatch body (HEAD's app.js) in
// Node, so this test pins the w=0 output to the old behaviour byte for byte.
// Later phases must keep reproducing it.

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
  rng: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'rng.js')),
  audioDriver: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'audio-driver.js')),
  sections: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'sections.js')),
  color: require(path.join(ROOT, 'renderer', 'js', 'color.js')),
  moods: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'moods.js')),
  weird: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'weird.js')),
  genParams: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gen-params.js')),
  legibility: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'legibility.js')),
  paletteRoles: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'palette-roles.js')),
  fxAxes: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'fx-axes.js')),
  textflow: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'textflow.js')),
  project: require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js')),
  fillers: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'fillers.js')),
  rhythm: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'rhythm.js')),
  figures: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'figures.js')),
  fillerRender: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-render.js')),
  fillerPresets: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-presets.js')),
  compositions: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'compositions.js')),
  audioAnalysis: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'audio-analysis.js')),
  genres: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'genres.js')),
  random: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'random.js')),
  direct: require(path.join(ROOT, 'renderer', 'js', 'studio', 'direct.js')),
};
globalThis.SA = SA;

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'direct-w0.json'), 'utf8'));

function prepare(doc, fixture, extra) {
  // the fixture predates the figure track: migrate it here
  if (!(doc.tracks || []).some((track) => track && track.kind === 'figure')) {
    const tracks = doc.tracks || (doc.tracks = []);
    const at = tracks.reduce((index, track, i) => (track && track.kind === 'subtitle' ? i : index), -1);
    tracks.splice(at + 1, 0, { id: 'fig', kind: 'figure', name: '図形' });
  }
  return SA.direct.prepare(doc, {
    axes: fixture.axes,
    seed: fixture.seed,
    genre: null,
    direction: 'horizontal',
    look: null,
    lookClip: null,
    themeStyle: JSON.parse(JSON.stringify(fixture.themeStyle)),
    cueLooks: {},
    analysis: null,
    ...(extra || {}),
  });
}

function runOn(doc, fixture, extra) {
  SA.direct.run(doc, prepare(doc, fixture, extra));
  return doc;
}

function outputOf(doc) {
  return JSON.parse(JSON.stringify({
    cueStyles: doc.cueStyles,
    beatStyles: doc.beatStyles,
    style: doc.style,
    styleMode: doc.styleMode,
    textFlow: doc.textFlow,
    fillers: doc.fillers,
    clips: (doc.clips || []).map((clip) => {
      const { auto, ...rest } = clip;
      return rest;
    }),
  }));
}

test('a weird run gives the mid track covered split planes and full-span timing', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const ctx = prepare(doc, FIXTURE, { axes: { ...FIXTURE.axes, weird: 1, density: 0.9 } });
  SA.direct.run(doc, ctx);
  const mid = doc.clips.filter((clip) => clip.trackId === 'mid');
  assert.ok(mid.length >= 2, `mid clips ${mid.length}`);
  for (const clip of mid) {
    assert.equal(clip.spec.type, 'combo');
    const plane = clip.spec.params.list[0];
    assert.equal(plane.type, 'split');
    assert.equal(plane.params.coverage, 1);
    assert.ok(Array.isArray(plane.params.colors) && plane.params.colors.length >= 2);
    assert.equal(clip.opacity, 1);
    assert.equal(clip.fadeIn, 0);
    assert.equal(clip.fadeOut, 0);
  }
  // tiles from 0 (first) to the last cue end (last)
  const first = mid.find((clip) => clip.start === 0);
  assert.ok(first, 'the first clip starts at 0');
  const total = Math.max(...doc.script.cues.map((cue) => cue.end));
  const last = mid.reduce((max, clip) => Math.max(max, clip.end), 0);
  assert.equal(last, total);
  // the mid colours move with weird (they are not the plain [3, 5] pair)
  const palette = ctx.themeStyle.palette.colors;
  const plain = [palette[3], palette[5] || palette[3]];
  assert.notDeepEqual(mid[0].colors, plain);
  // a figure clip per cue on the figure track
  const figureTrack = doc.tracks.find((track) => track.kind === 'figure');
  const figs = doc.clips.filter((clip) => clip.trackId === figureTrack.id);
  assert.ok(figs.length >= 2, `figure clips ${figs.length}`);
  for (const clip of figs) {
    assert.equal(clip.spec.type, 'figure');
    assert.ok(clip.auto === true);
    assert.ok(clip.spec.params.beats.length >= 1);
  }
});

test('a weird run leaves the user background alone and keeps the background calm', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const ctx = prepare(doc, FIXTURE, { axes: { ...FIXTURE.axes, weird: 1 } });
  SA.direct.run(doc, ctx);
  const bg = doc.clips.filter((clip) => clip.trackId === 'bg');
  assert.equal(bg.length, 1);
  assert.ok(['gradient', 'noiseGradient', 'solid'].includes(bg[0].spec.type), `bg type ${bg[0].spec.type}`);
  // no weird background primitive replaced it
  assert.ok(!['tunnel', 'rays', 'fractalNoise', 'perspectiveGrid'].includes(bg[0].spec.type));
});

test('the backdrop channel saturates at raw 0.2 (bg = 0.5): mid clips span cue to cue', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const ctx = prepare(doc, FIXTURE, { axes: { ...FIXTURE.axes, weird: 0.2 } });
  assert.equal(ctx.wb, 0.5, 'bg(0.2) = 0.5');
  assert.ok(Math.abs(ctx.w - 0.14) < 1e-9, `text weird ${ctx.w} is tamed`);
  SA.direct.run(doc, ctx);
  const mid = doc.clips.filter((clip) => clip.trackId === 'mid');
  assert.ok(mid.length >= 2, `mid clips ${mid.length}`);
  for (const clip of mid) {
    const plane = clip.spec.params.list[0];
    assert.equal(plane.type, 'split');
    assert.equal(plane.params.coverage, 0.5, 'coverage follows the backdrop channel');
    assert.equal(clip.opacity, 1);
    assert.equal(clip.fadeIn, 0);
    assert.equal(clip.fadeOut, 0);
    assert.ok(clip.spec.params.animate.sync > 0, 'a fully covered mid layer answers the text');
  }
  // spanning: the first starts at 0 and the last reaches the end of the song
  assert.ok(mid.find((clip) => clip.start === 0), 'the first clip starts at 0');
  const total = Math.max(...doc.script.cues.map((cue) => cue.end));
  const last = mid.reduce((max, clip) => Math.max(max, clip.end), 0);
  assert.equal(last, total);
  // and a figure clip already exists on the figure track
  const figureTrack = doc.tracks.find((track) => track.kind === 'figure');
  assert.ok(doc.clips.some((clip) => clip.trackId === figureTrack.id), 'figure clips open with the backdrop channel');
});

test('the text size band follows the tamed text channel, not the raw axis', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const tamed = prepare(doc, FIXTURE, { axes: { ...FIXTURE.axes, weird: 1 } });
  const half = prepare(doc, FIXTURE, { axes: { ...FIXTURE.axes, weird: 0.5 } });
  // weird 1 draws the band of the old 0.7
  assert.ok(Math.abs(tamed.w - 0.7) < 1e-9);
  assert.ok(tamed.themeStyle.text.size <= 124 + 80 * 0.7);
  assert.ok(half.w < tamed.w);
});

test('w=0 does not use the rhythm plan', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const ctx = prepare(doc, FIXTURE);
  assert.equal(ctx.rhythm, null);
  const weird = prepare(doc, FIXTURE, { axes: { ...FIXTURE.axes, weird: 1 } });
  assert.ok(weird.rhythm && Object.keys(weird.rhythm).length >= 1, 'a weird song plans its phrase rhythm');
  for (const cuts of Object.values(weird.rhythm)) assert.ok(Array.isArray(cuts));
});

test('w=0 reproduces the pre-extraction snapshot exactly', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  runOn(doc, FIXTURE);
  const output = outputOf(doc);
  // The filler gaps are the documented w=0 exception (item 8: they now show
  // figures); everything else must match the pre-extraction snapshot. The
  // second documented exception is the size ladder: the snapshot's sizes came
  // from the old per-beat jitter and the ladder now pins the base size at weird
  // 0, so `beatStyles[*].text.size` is stripped from both sides before the
  // comparison.
  const stripSizes = (styles) => {
    if (!styles) return styles;
    for (const style of Object.values(styles)) {
      if (style && style.text) delete style.text.size;
    }
    return styles;
  };
  const { fillers, clips, ...rest } = output;
  const { fillers: _fixtureFillers, clips: fixtureClips, ...fixtureRest } = {
    cueStyles: FIXTURE.cueStyles,
    beatStyles: FIXTURE.beatStyles,
    style: FIXTURE.style,
    styleMode: FIXTURE.styleMode,
    textFlow: FIXTURE.textFlow,
    fillers: FIXTURE.fillers,
    clips: FIXTURE.clips,
  };
  assert.deepEqual(stripSizes(rest.beatStyles), stripSizes(JSON.parse(JSON.stringify(fixtureRest.beatStyles))));
  assert.deepEqual({ ...rest, beatStyles: null }, { ...fixtureRest, beatStyles: null });
  const fillerIds = new Set(doc.tracks.filter((track) => track.kind === 'filler').map((track) => track.id));
  const nonFiller = (list) => list.filter((clip) => !fillerIds.has(clip.trackId));
  assert.deepEqual(nonFiller(clips), nonFiller(fixtureClips));
  assert.ok(clips.filter((clip) => fillerIds.has(clip.trackId)).every((clip) => clip.spec.presetId), 'the gaps show filler presets');
  assert.ok(fillers.byKind.interlude.presetId);
  assert.ok(fillers.longGap.spec.presetId);
  assert.equal(fillers.byKind.intro.type, 'combo');
});

test('filler specs come from the preset library, deterministically and genre-aware', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  runOn(doc, FIXTURE);
  const specs = [doc.fillers.byKind.interlude, doc.fillers.longGap.spec, doc.fillers.byKind.intro.params.list[1], doc.fillers.byKind.outro.params.list[1]];
  for (const spec of specs) {
    assert.ok(spec.presetId, 'a preset id');
    assert.ok(SA.fillerPresets.get(spec.presetId), `a known preset (${spec.presetId})`);
    assert.ok(SA.fillerRender.validate(spec).ok, `${spec.presetId} validates`);
  }
  // deterministic for the same seed
  const again = runOn(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE);
  assert.deepEqual(again.fillers, doc.fillers);
  // genre exclude: some seed draws the sine-wave combo without the filter, and
  // a genre excluding sineWave never gets it (the seed is found dynamically so
  // the assertion survives preset-library growth)
  let sineSeed = null;
  let freeSpec = null;
  for (let seed = 1; seed <= 200 && sineSeed == null; seed += 1) {
    const probe = prepare(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE, { seed });
    const candidate = SA.direct.fillerSettings(JSON.parse(JSON.stringify(FIXTURE.input)), probe);
    if (SA.fillerRender.layersOf(candidate.byKind.interlude).some((layer) => layer.type === 'sineWave')) {
      sineSeed = seed;
      freeSpec = candidate;
    }
  }
  assert.ok(sineSeed != null, 'no seed draws the sine combo');
  const filteredDoc = JSON.parse(JSON.stringify(FIXTURE.input));
  const filtered = prepare(filteredDoc, FIXTURE, { seed: sineSeed, genre: { clips: { filler: { exclude: ['sineWave'] } } } });
  const filteredSpec = SA.direct.fillerSettings(filteredDoc, filtered);
  void freeSpec;
  for (const entry of [filteredSpec.byKind.interlude, filteredSpec.longGap.spec, filteredSpec.byKind.intro.params.list[1], filteredSpec.byKind.outro.params.list[1]]) {
    assert.ok(!SA.fillerRender.layersOf(entry).some((layer) => layer.type === 'sineWave'), 'excluded layers never appear');
  }
});

test('a run fills the gaps, and an opted-out project keeps its filler track empty', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  delete doc.fillers;
  runOn(doc, FIXTURE);
  const fillerIds = new Set(doc.tracks.filter((track) => track.kind === 'filler').map((track) => track.id));
  const filled = doc.clips.filter((clip) => fillerIds.has(clip.trackId));
  assert.equal(doc.fillers.enabled, true, 'a document that never chose fills its gaps');
  assert.ok(filled.length >= 1, `a run materialises the gaps (${filled.length} clips)`);

  const off = JSON.parse(JSON.stringify(FIXTURE.input));
  off.fillers = { ...(off.fillers || {}), enabled: false };
  runOn(off, FIXTURE);
  assert.equal(off.clips.filter((clip) => fillerIds.has(clip.trackId)).length, 0, 'no filler clips are generated');
  assert.equal(off.fillers.enabled, false, 'the run does not switch fillers back on');
  // the explicit regeneration still materialises the gaps
  const total = Math.max(...off.script.cues.map((cue) => cue.end));
  const gaps = SA.fillers.gaps(off.script.cues, total, { ...SA.fillers.settingsFor(off), enabled: true });
  assert.ok(gaps.length >= 1, 'regeneration is not blocked by the flag');
});

test('every gap carries a figure animation', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  runOn(doc, FIXTURE);
  const fillerIds = new Set(doc.tracks.filter((track) => track.kind === 'filler').map((track) => track.id));
  const clips = doc.clips.filter((clip) => fillerIds.has(clip.trackId));
  assert.ok(clips.length >= 1, `a run materialises the gaps (${clips.length} clips)`);
  for (const clip of clips) {
    assert.ok(SA.direct.carriesFigures(clip.spec), `${clip.id} (${clip.spec.type}) has no figures layer`);
    const figures = SA.fillerRender.layersOf(clip.spec).filter((layer) => layer.type === 'figures');
    assert.equal(figures.length, 1, `${clip.id} shows the figure animation once`);
    // a generated gap motif: the figure layer is drawn, not an empty stub
    assert.ok((figures[0].params || {}).motif, `${clip.id} has no drawn motif`);
  }
  // the settings the inspector edits carry the same animation, so a re-run and
  // the stored kind agree
  const probe = prepare(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE, { seed: 7 });
  const settings = SA.direct.fillerSettings(JSON.parse(JSON.stringify(FIXTURE.input)), probe);
  for (const entry of [settings.byKind.intro, settings.byKind.interlude, settings.byKind.outro, settings.longGap.spec]) {
    assert.ok(SA.direct.carriesFigures(entry), `a stored kind (${entry.type}) has no figures layer`);
  }
});

test('the run is deterministic for one seed', () => {
  const first = runOn(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE);
  const second = runOn(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE);
  assert.deepEqual(outputOf(first), outputOf(second));
});

// ---------------------------------------------------------------------------
// section awareness (direct side)
//
// `prepare` only plans the blocks when the caller passes `sections`, so the
// w=0 snapshot above still holds; a run without the option must stay identical.

const SECTIONS = { gap: 2, maxCues: 4, strength: 1 };

// Two seconds of analysis at 30 fps: the loud half sits where `loudSecond` says.
function fakeAnalysis(loudSecond) {
  const frames = [];
  for (let i = 0; i < 60; i += 1) {
    const loud = loudSecond ? i >= 30 : i < 30;
    frames.push({ rms: loud ? 0.5 : 0, bands: new Float32Array(128), wave: new Float32Array(4) });
  }
  return { fps: 30, frameCount: frames.length, frames };
}

test('without the sections option the run keeps its exact output', () => {
  const plain = runOn(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE);
  const withoutProfile = (doc) => {
    const out = outputOf(doc);
    delete out.styleMode;
    return out;
  };
  // `sections: false` / `sections: {}` (no cues in scope) must not add a plan
  const off = runOn(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE, { sections: false });
  assert.deepEqual(withoutProfile(off), withoutProfile(plain));
  assert.equal(prepare(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE).sections, null);
  assert.equal(prepare(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE, { sections: false }).sections, null);
});

test('a section-aware run plans the blocks and stores them on the project', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const ctx = prepare(doc, FIXTURE, { sections: SECTIONS });
  assert.ok(Array.isArray(ctx.sections) && ctx.sections.length >= 2, `sections ${ctx.sections && ctx.sections.length}`);
  // every cue belongs to exactly one block, and the blocks cover the run in order
  const seen = new Set();
  let at = 0;
  for (const section of ctx.sections) {
    assert.ok(section.cueIds.length >= 1, 'a block is never empty');
    for (const cueId of section.cueIds) {
      assert.ok(!seen.has(cueId), `${cueId} is in two blocks`);
      seen.add(cueId);
      assert.equal(ctx.sectionOf[cueId], section);
    }
    assert.ok(section.start >= at - 1e-9, `block ${section.index} starts before the previous one ends`);
    at = section.end;
  }
  assert.deepEqual([...seen], doc.script.cues.map((cue) => cue.id), 'every cue is covered');
  // the fixture's cue gaps: 0.5, 1.8, 1.8, 2.6 -> only the last one is a boundary
  assert.deepEqual(ctx.sections[0].cueIds, ['c1', 'c2', 'c3', 'c4']);
  assert.deepEqual(ctx.sections[1].cueIds, ['c5']);
  assert.equal(ctx.sectionConfig.gap, 2);
  assert.equal(ctx.sectionConfig.maxCues, 4);
  assert.equal(ctx.sectionConfig.strength, 1);
  SA.direct.run(doc, ctx);
  const saved = doc.styleMode.sections;
  assert.ok(saved && Array.isArray(saved.list), 'the plan is stored for the re-rolls');
  assert.equal(saved.gap, 2);
  assert.equal(saved.list.length, ctx.sections.length);
  for (const entry of saved.list) {
    assert.ok(Number.isFinite(entry.boost), 'the boost is stored');
    assert.equal(typeof entry.chorus, 'boolean');
    assert.ok(Array.isArray(entry.cueIds) && entry.cueIds.length);
  }
  // a run without the option clears the plan again (no stale blocks)
  runOn(doc, FIXTURE);
  assert.equal(doc.styleMode.sections, undefined);
});

test('the section-aware run is deterministic and pinned values survive the boost', () => {
  const first = runOn(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE, { sections: SECTIONS, params: { tiltChance: 0.42 } });
  const second = runOn(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE, { sections: SECTIONS, params: { tiltChance: 0.42 } });
  assert.deepEqual(outputOf(first), outputOf(second));
  // the pinned value is the same in every block (resolve is pure)
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const ctx = prepare(doc, FIXTURE, { sections: SECTIONS, params: { tiltChance: 0.42 } });
  assert.ok(ctx.sections.length >= 1);
  for (const section of ctx.sections) assert.equal(section.params.tiltChance, 0.42, `block ${section.index} lost the pin`);
  // the boost lifts the derived chances of the loud block only
  const boosted = ctx.sections.filter((section) => section.boost > 0);
  for (const section of boosted) {
    assert.ok(section.params.motionChance >= ctx.params.motionChance, `block ${section.index} motion`);
    assert.ok(section.axes.weird > ctx.rawW, `block ${section.index} weird`);
    assert.ok(section.axes.weird <= 1, 'the boost never passes the axis');
  }
  for (const section of ctx.sections.filter((entry) => entry.boost === 0)) {
    assert.equal(section.params, ctx.params, 'a zero boost reuses the song profile');
  }
});

test('weird 0 gives every block no boost at all', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const ctx = prepare(doc, FIXTURE, { sections: SECTIONS });
  assert.ok(ctx.sections.length >= 2, 'the blocks are still named');
  assert.equal(ctx.rawW, 0);
  for (const section of ctx.sections) {
    assert.equal(section.boost, 0, `block ${section.index} boosted without the axis`);
    assert.equal(section.params, ctx.params);
    assert.equal(section.axes, ctx.axes);
  }
});

test('the strength dial only scales the boost', () => {
  const axes = { ...FIXTURE.axes, weird: 0.5 };
  const at = (strength) => prepare(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE, { axes, sections: { ...SECTIONS, strength } }).sections;
  const base = at(1);
  for (const section of at(0)) assert.equal(section.boost, 0, 'strength 0 never boosts');
  for (const section of at(2)) {
    const plain = base.find((entry) => entry.index === section.index);
    assert.ok(section.boost >= plain.boost, `block ${section.index} got weaker with a higher strength`);
  }
});

test('a chorus block leans harder on the axis than the quiet one', () => {
  // The fixture runs 26 s, so the analysis is stretched to cover it: the first
  // half is the loud one and the last cue sits in the quiet half.
  const analysis = fakeAnalysis(false);
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const ctx = prepare(doc, FIXTURE, { axes: { ...FIXTURE.axes, weird: 0.6 }, analysis, sections: SECTIONS });
  assert.equal(ctx.sections.length, 2);
  const [first, second] = ctx.sections;
  assert.ok(first.energy > second.energy, `energy ${first.energy} vs ${second.energy}`);
  assert.equal(first.chorus, true, 'the loud block is the chorus');
  assert.equal(second.chorus, false);
  assert.ok(first.boost > second.boost, `boost ${first.boost} vs ${second.boost}`);
  // the chorus takes the stronger chances
  for (const key of ['motionChance', 'holdChance', 'accentColorChance', 'gradientColorChance', 'fillEffectChance', 'fgVivid']) {
    assert.ok(first.params[key] > second.params[key], `${key}: ${first.params[key]} vs ${second.params[key]}`);
  }
  for (const key of ['heroScale', 'figureDensity', 'sizeChange']) {
    assert.ok(first.params[key] >= second.params[key], `${key}: ${first.params[key]} vs ${second.params[key]}`);
  }
});

test('a block boundary always moves the palette, whatever the switch dice says', () => {
  // paletteSwitchChance 0: only a block boundary may change the cue palette
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const ctx = prepare(doc, FIXTURE, { sections: SECTIONS, params: { paletteSwitchChance: 0 } });
  const cues = doc.script.cues;
  const themeColors = ctx.themeStyle.palette.colors;
  const drawn = cues.map((cue) => {
    const palette = SA.direct.cuePalette(doc, cue, cues.indexOf(cue), ctx, null);
    return palette ? palette.colors : null;
  });
  // the first cue is the head of its block, so it draws; nothing else may
  assert.ok(drawn[0], 'the opening cue of a block draws a palette');
  assert.equal(drawn[1], null, 'a cue inside a block keeps the base palette');
  assert.equal(drawn[2], null);
  assert.equal(drawn[3], null);
  assert.ok(drawn[4], 'the cue that opens the second block draws a palette');
  // and the drawn palette really moves away from the base colours
  assert.notDeepEqual(drawn[0], themeColors);
  assert.notDeepEqual(drawn[4], themeColors);
  // without sections the same dice keeps every cue on the base palette
  const plain = prepare(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE, { params: { paletteSwitchChance: 0 } });
  for (const cue of cues) assert.equal(SA.direct.cuePalette(doc, cue, cues.indexOf(cue), plain, null), null);
});

test('a section-aware run stays legible in compose mode', () => {
  for (const seed of [4242, 777]) {
    const doc = JSON.parse(JSON.stringify(FIXTURE.input));
    const ctx = prepare(doc, FIXTURE, { axes: { ...FIXTURE.axes, weird: 0.6 }, seed, compose: true, sections: SECTIONS });
    SA.direct.run(doc, ctx);
    for (const cue of doc.script.cues) {
      const colors = (SA.project.resolveStyle(doc, `cue:${cue.id}`).palette || {}).colors || [];
      for (const beat of (doc.beats && doc.beats[cue.id]) || []) {
        const resolved = SA.project.resolveStyle(doc, `cue:${cue.id}/beat:${beat.id}`);
        const report = SA.legibility.check(resolved, { palette: colors, motion: false });
        assert.ok(report.ok, `seed ${seed} ${beat.id}: ${JSON.stringify(report.reasons)}`);
      }
    }
  }
});

test('restoreSections rebuilds the stored plan for a re-roll', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const ctx = prepare(doc, FIXTURE, { axes: { ...FIXTURE.axes, weird: 0.6 }, sections: SECTIONS, params: { tiltChance: 0.42 } });
  SA.direct.run(doc, ctx);
  const saved = doc.styleMode.sections;
  // a re-roll has no music: the stored boosts are what the blocks draw with
  const restored = SA.direct.restoreSections(
    { axes: ctx.axes, rawW: ctx.rawW, w: ctx.w, energy: ctx.energy, params: ctx.params, paramsSource: ctx.paramsSource, seed: ctx.seed },
    saved
  );
  assert.ok(restored && restored.list.length === ctx.sections.length);
  assert.equal(restored.gap, saved.gap);
  assert.equal(restored.maxCues, saved.maxCues);
  for (const [i, section] of restored.list.entries()) {
    assert.equal(section.boost, saved.list[i].boost, `block ${i} boost`);
    assert.deepEqual(section.cueIds, saved.list[i].cueIds);
    assert.equal(section.params.tiltChance, 0.42, `block ${i} lost the pin`);
  }
  assert.equal(SA.direct.restoreSections({ axes: ctx.axes, rawW: ctx.rawW }, null), null);
  assert.equal(SA.direct.restoreSections({ axes: ctx.axes, rawW: ctx.rawW }, { list: [] }), null);
});

test('generated clips carry auto: true and re-runs replace only those', () => {
  const doc = runOn(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE);
  assert.ok(doc.clips.length > 0);
  assert.ok(doc.clips.every((clip) => clip.auto === true), 'every generated clip is auto');
  const before = outputOf(doc);
  runOn(doc, FIXTURE);
  assert.deepEqual(outputOf(doc), before, 'a second run does not duplicate or move the clips');
});

test('clips without auto are kept', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const manualMid = { id: 'manual_mid', trackId: 'mid', start: 1, end: 2.5, spec: { type: 'solid', params: {} }, opacity: 1, fadeIn: 0, fadeOut: 0, colors: null };
  const manualFiller = { id: 'manual_filler', trackId: 'filler', start: 4, end: 5, spec: { type: 'none', params: {} }, opacity: 1, fadeIn: 0, fadeOut: 0, colors: null };
  const manualBg = { id: 'manual_bg', trackId: 'bg', start: 0, end: 26, spec: { type: 'solid', params: { color: '#123456' } }, opacity: 1, fadeIn: 0, fadeOut: 0, colors: null };
  const manualFigure = { id: 'manual_fig', trackId: 'fig', start: 1, end: 3, spec: { type: 'figure', params: { motif: 'orbit', sync: 'beat', density: 0.5, beats: [] } }, opacity: 1, fadeIn: 0, fadeOut: 0, colors: null };
  doc.clips = [manualMid, manualFiller, manualBg, manualFigure];
  runOn(doc, FIXTURE);
  const ids = doc.clips.map((clip) => clip.id);
  assert.ok(ids.includes('manual_mid'));
  assert.ok(ids.includes('manual_filler'));
  assert.ok(ids.includes('manual_bg'));
  assert.ok(ids.includes('manual_fig'), 'a hand-placed figure clip survives');
  assert.ok(!doc.clips.some((clip) => clip.trackId === 'bg' && clip.auto), 'a user background is not replaced');
  assert.ok(doc.clips.filter((clip) => clip.trackId === 'mid' && clip.auto).length > 0, 'auto backdrop clips still appear next to the manual one');
});

test('prepare clamps the theme size into the weird size band', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  doc.output = { ...doc.output, aspect: '9:16', width: 1080, height: 1920 };
  const huge = prepare(doc, FIXTURE, {
    axes: { ...FIXTURE.axes, weird: 1 },
    themeStyle: { ...JSON.parse(JSON.stringify(FIXTURE.themeStyle)), text: { ...(FIXTURE.themeStyle.text || {}), size: 9999 } },
  });
  assert.equal(huge.portrait, true);
  assert.ok(huge.themeStyle.text.size <= 146, `portrait weird=1 caps at 146, got ${huge.themeStyle.text.size}`);
  const small = prepare(doc, FIXTURE, {
    axes: { ...FIXTURE.axes, weird: 1 },
    themeStyle: { ...JSON.parse(JSON.stringify(FIXTURE.themeStyle)), text: { ...(FIXTURE.themeStyle.text || {}), size: 1 } },
  });
  assert.ok(small.themeStyle.text.size >= 36, `portrait weird=1 floor is 36, got ${small.themeStyle.text.size}`);
});

test('smartness 0.9 drops the tacky grammar from the automatic direction', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const ctx = prepare(doc, FIXTURE, { axes: { ...FIXTURE.axes, weird: 1, smartness: 0.9 }, seed: 42 });
  SA.direct.run(doc, ctx);
  const smartness = SA.moods.smartness;
  const bannedHold = new Set(['pulse', 'heartbeat', 'jitter', 'shiver', 'opacityPulse', 'jelly', 'squashStretch', 'swirl', 'beatPulse', 'beatHighlight']);
  const bannedEnter = new Set(['glitchIn', 'dropBounce', 'elasticPop', 'flip3D', 'scramble', 'neonFlicker', 'flickerIn', 'shatterRebuild', 'noiseDissolveIn', 'popIn', 'spinIn', 'scatterIn']);
  for (const container of Object.values(doc.cueStyles)) {
    for (const instance of container.hold || []) assert.ok(!bannedHold.has(instance.type), `cue hold ${instance.type}`);
    for (const group of ['enter', 'exit']) {
      const instance = container[group];
      if (instance) assert.ok(!bannedEnter.has(instance.type), `${group} ${instance.type}`);
    }
  }
  for (const container of Object.values(doc.beatStyles)) {
    for (const instance of container.hold || []) assert.ok(!bannedHold.has(instance.type), `beat hold ${instance.type}`);
  }
  const mid = doc.clips.filter((clip) => clip.trackId === 'mid');
  assert.ok(mid.length >= 1, 'mid clips exist');
  for (const clip of mid) {
    const parts = (clip.spec.params && clip.spec.params.list) || [];
    const planes = parts.find((part) => part.type === 'split');
    if (planes) assert.ok(['slide', 'swap', 'drift', 'push', 'sweep', 'turn', 'zoom', 'step'].includes(planes.params.motion), `split motion ${planes.params.motion}`);
    const animate = (clip.spec.params && clip.spec.params.animate) || {};
    assert.ok(['accent', 'swell', 'sway', 'drift', 'travel', 'zoom', 'tilt'].includes(animate.mode), `backdrop mode ${animate.mode}`);
  }
  for (const clip of doc.clips.filter((entry) => entry.trackId === 'bg')) {
    const spec = clip.spec || {};
    if (spec.type === 'gradient' || spec.type === 'noiseGradient') assert.equal(spec.params.glow, 0, 'no centre bright mask');
  }
  for (const clip of doc.clips.filter((entry) => entry.spec && entry.spec.type === 'figure')) {
    assert.ok(!['ribbon', 'confetti'].includes(clip.spec.params.motif), `motif ${clip.spec.params.motif}`);
    for (const beat of clip.spec.params.beats || []) assert.notEqual(beat.move.hold, 'pulse', 'figure hold');
  }
  const specs = [doc.fillers.byKind.interlude, doc.fillers.longGap.spec, doc.fillers.byKind.intro.params.list[1], doc.fillers.byKind.outro.params.list[1]];
  for (const spec of specs) {
    assert.ok(smartness.weight(smartness.rateSpec(spec), 0.9) > 0, `filler ${spec && spec.presetId} is below the floor`);
  }
});

// Every compose-only chance pinned off: the baseline compose run keeps its
// template picture, so the older assertions still hold.
const NO_VARIATION = {
  fontChance: 0,
  beatFontChance: 0,
  beatBoldChance: 0,
  spacingChance: 0,
  alignChance: 0,
  widthChance: 0,
  accentColorChance: 0,
  gradientColorChance: 0,
  fillEffectChance: 0,
  patternFillChance: 0,
  beatDecoChance: 0,
  maskChance: 0,
  textBgChance: 0,
  bgVaryChance: 0,
  bgEdgeChance: 0,
  tiltChance: 0,
  locationChance: 0,
  floatChance: 0,
  repeatChance: 0,
  clonesChance: 0,
  holdChance: 0,
  pulseChance: 0,
  motionChance: 0,
  paletteInvertChance: 0,
};

test('compose mode draws a composition per beat and drops the weird jitter', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const ctx = prepare(doc, FIXTURE, { axes: { ...FIXTURE.axes, weird: 1 }, compose: true, params: NO_VARIATION });
  assert.equal(ctx.compose, true);
  SA.direct.run(doc, ctx);
  assert.equal(doc.styleMode.compose, true, 'the mode is saved for re-rolls');
  const beats = [];
  for (const cue of doc.script.cues) {
    for (const beat of (doc.beats && doc.beats[cue.id]) || []) beats.push({ cue, beat });
  }
  assert.ok(beats.length >= 4, `beats ${beats.length}`);
  const compIds = [];
  const levels = [];
  for (const { cue, beat } of beats) {
    const style = doc.beatStyles[beat.id];
    assert.ok(style && style.text && style.text.compose, `${beat.id} has a composition`);
    assert.equal(style.text.compose.text, beat.text || '');
    assert.ok(SA.compositions.get(style.text.compose.id), `${beat.id} known composition ${style.text.compose.id}`);
    compIds.push(style.text.compose.id);
    assert.equal(style.transform.rotate, 0, `${beat.id} rotate`);
    assert.equal(style.transform.tiltX, 0, `${beat.id} tiltX`);
    assert.equal(style.transform.tiltY, 0, `${beat.id} tiltY`);
    assert.deepEqual(style.hold, [], `${beat.id} holds still`);
    assert.equal(style.location.type, 'grid', `${beat.id} grid location`);
    const cueStyle = doc.cueStyles[cue.id];
    assert.ok(!cueStyle || !cueStyle.clones, `${cue.id} has no clones`);
    // the ladder size belongs to this beat's own range: map it back to a level
    const text = style.text;
    const spans = (text.compose && text.compose.spans) || [];
    const scales = spans.map((span) => Number(span.scale) || 1);
    const range = SA.direct.sizeRangeFor(
      beat,
      text,
      { frameW: 1920, frameH: 1080, portrait: false, screen: 1080, lang: 'en' },
      scales.length ? Math.max(1, ...scales) : 1,
      scales.length ? Math.min(...scales) : 1
    );
    const size = style.text.size * (beat.fontScale || 1);
    let level = 0;
    for (let k = 0; k < 10; k += 1) {
      const px = Math.round(range.min + ((range.max - range.min) * k) / 9);
      const best = Math.round(range.min + ((range.max - range.min) * level) / 9);
      if (Math.abs(px - size) < Math.abs(best - size)) level = k;
    }
    levels.push(level);
  }
  for (let i = 1; i < compIds.length; i += 1) {
    assert.notEqual(compIds[i], compIds[i - 1], `beat ${i} repeats ${compIds[i]}`);
  }
  // weird 1 gives v = 1, so neighbouring beats never stay on the same ladder
  // level. (Different levels may still round to the same px when the ranges
  // differ, so the guarantee is level-based.)
  for (let i = 1; i < levels.length; i += 1) {
    assert.notEqual(levels[i], levels[i - 1], `beat ${i} repeats level ${levels[i]}`);
  }
  // the whole run is deterministic for one seed in compose mode too
  const again = runOn(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE, { axes: { ...FIXTURE.axes, weird: 1 }, compose: true, params: NO_VARIATION });
  for (const { beat } of beats) {
    assert.deepEqual(again.beatStyles[beat.id].text.compose, doc.beatStyles[beat.id].text.compose);
    assert.equal(again.beatStyles[beat.id].text.size, doc.beatStyles[beat.id].text.size);
    assert.deepEqual(again.beatStyles[beat.id].location, doc.beatStyles[beat.id].location);
  }
});

test('a compose run keeps the w=0 fixture untouched when compose is off', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  runOn(doc, FIXTURE);
  for (const [beatId, style] of Object.entries(doc.beatStyles)) {
    assert.ok(!(style.text && style.text.compose), `${beatId} stays plain`);
  }
  assert.equal(doc.styleMode.compose, undefined);
});

// ---------------------------------------------------------------------------
// the profile run (weird 0.6)

const PROFILE_SEEDS = [4242, 777, 31337];

function profileRun(seed, axes, extra) {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const ctx = prepare(doc, FIXTURE, { axes: { ...FIXTURE.axes, weird: 0.6, ...(axes || {}) }, seed, compose: true, ...(extra || {}) });
  SA.direct.run(doc, ctx);
  return { doc, ctx };
}

test('the profile backdrop paints few planes that hold their distance from the text', () => {
  for (const seed of PROFILE_SEEDS) {
    const { doc, ctx } = profileRun(seed, {});
    const mid = doc.clips.filter((clip) => clip.trackId === 'mid');
    assert.ok(mid.length >= 2, `mid clips ${mid.length}`);
    const floor = SA.weird.backdropContrast(0.6);
    for (const cue of doc.script.cues) {
      const planes = ctx.backdropPlanes[cue.id] || [];
      assert.ok(planes.length >= 1 && planes.length <= 3, `planes ${planes.length} at ${cue.id}`);
      const cueStyle = SA.project.resolveStyle(doc, `cue:${cue.id}`);
      const colors = (cueStyle.palette && cueStyle.palette.colors) || [];
      const text = SA.paletteRoles.get(colors, SA.paletteRoles.SLOT.TEXT_FILL);
      if (!text) continue;
      for (const plane of planes) {
        const ratio = SA.color.contrastRatio(SA.color.parse(text), SA.color.parse(plane));
        assert.ok(ratio >= floor - 1e-6, `seed ${seed} ${cue.id} plane ${plane} ratio ${ratio}`);
      }
      // the plane colours never come from the text / accent roles themselves
      for (const plane of planes) assert.ok(plane !== colors[2] && plane !== colors[3], 'a text role leaked into the planes');
    }
  }
});

test('the profile run stays legible on every beat and carries an edge on most cues', () => {
  for (const seed of PROFILE_SEEDS) {
    const { doc } = profileRun(seed, {});
    let edged = 0;
    for (const cue of doc.script.cues) {
      const cueStyle = SA.project.resolveStyle(doc, `cue:${cue.id}`);
      if (Array.isArray(cueStyle.edge) && cueStyle.edge.length) edged += 1;
      const colors = (cueStyle.palette && cueStyle.palette.colors) || [];
      for (const beat of (doc.beats && doc.beats[cue.id]) || []) {
        const resolved = SA.project.resolveStyle(doc, `cue:${cue.id}/beat:${beat.id}`);
        const report = SA.legibility.check(resolved, { palette: colors, motion: false });
        assert.ok(report.ok, `seed ${seed} ${beat.id}: ${JSON.stringify(report.reasons)}`);
      }
    }
    assert.ok(edged >= Math.ceil(doc.script.cues.length * 0.6), `seed ${seed} edged ${edged}/${doc.script.cues.length}`);
  }
});

test('the profile figures move with at least three motifs, avoid the smear posts and stay clear of the lyrics', () => {
  for (const seed of PROFILE_SEEDS) {
    const { doc, ctx } = profileRun(seed, {});
    const figureTrack = doc.tracks.find((track) => track.kind === 'figure');
    const figs = doc.clips.filter((clip) => clip.trackId === figureTrack.id);
    const motifs = new Set(figs.map((clip) => clip.spec && clip.spec.params && clip.spec.params.motif));
    assert.ok(motifs.size >= 3, `seed ${seed} motifs ${[...motifs].join(',')}`);
    // the auto direction never lays a figure over the cue's text box (the
    // geometric measure ignores the opacity, so a dimmed overlay would fail too)
    for (const cue of doc.script.cues) {
      const clip = figs.find((entry) => Math.abs(entry.start - cue.start) < 1e-6);
      if (!clip) continue;
      const overlap = SA.legibility.figureOverlap(clip.spec, {
        frame: { width: ctx.frameW, height: ctx.frameH },
        duration: Math.max(0.5, (Number(cue.end) || 0) - (Number(cue.start) || 0)),
        textBox: ctx.composeZones[cue.id],
        geometry: true,
      });
      assert.ok(overlap <= 0.05 + 1e-9, `seed ${seed} ${cue.id} figure overlap ${overlap}`);
    }
  }
  // a theme carrying a smear post: the gate removes it while postBlurChance is low
  const theme = JSON.parse(JSON.stringify(FIXTURE.themeStyle));
  theme.post = (theme.post || []).concat([{ type: 'godRays', params: {}, enabled: true }]);
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const ctx = prepare(doc, FIXTURE, { axes: { ...FIXTURE.axes, weird: 0.6 }, seed: 4242, themeStyle: theme, compose: true });
  SA.direct.run(doc, ctx);
  for (const cue of doc.script.cues) {
    for (const beat of (doc.beats && doc.beats[cue.id]) || []) {
      const resolved = SA.project.resolveStyle(doc, `cue:${cue.id}/beat:${beat.id}`);
      for (const instance of resolved.post || []) {
        assert.ok(!SA.legibility.SMEAR_POSTS.has(instance.type), `${instance.type} survived the gate`);
      }
    }
  }
  // at weird 1 postBlurChance allows it: the theme keeps its smear
  const keepTheme = JSON.parse(JSON.stringify(FIXTURE.themeStyle));
  keepTheme.post = [{ type: 'godRays', params: {}, enabled: true }];
  const keepDoc = JSON.parse(JSON.stringify(FIXTURE.input));
  const keepCtx = prepare(keepDoc, FIXTURE, { axes: { ...FIXTURE.axes, weird: 1 }, seed: 4242, themeStyle: keepTheme, compose: true });
  assert.ok(keepCtx.themeStyle.post.some((instance) => instance.type === 'godRays'), 'postBlurChance 1 keeps the smear');
});

test('a figure that cannot stay clear of the lyrics is dropped, not dimmed over it', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const ctx = prepare(doc, FIXTURE, { axes: { ...FIXTURE.axes, weird: 0.6 }, seed: 4242, compose: true });
  const cue = doc.script.cues[0];
  ctx.composeZones = { [cue.id]: { x0: ctx.frameW * 0.4, y0: ctx.frameH * 0.4, x1: ctx.frameW * 0.6, y1: ctx.frameH * 0.6 } };
  // every candidate is a dense centred motif, so nothing can stay clear
  const original = SA.figures.generate;
  SA.figures.generate = (options) => ({
    type: 'figure',
    params: {
      // ignore the requested motif: every candidate is the same dense centred
      // pattern, so the clearance test can never succeed
      motif: 'halftone',
      sync: options.sync || 'beat',
      density: 1,
      colors: null,
      beats: [{ start: cue.start, end: cue.end, move: { in: 'pop', hold: 'pulse', out: 'fade' }, variant: 0, accent: false }],
    },
  });
  try {
    const clip = SA.direct.figureClipFor(doc, cue, 0, ctx);
    assert.equal(clip, null, 'no figure over the lyrics');
  } finally {
    SA.figures.generate = original;
  }
});

test('neighbouring profile backdrops never repeat their motion, mode or transition', () => {
  const seeds = [...PROFILE_SEEDS, 1, 99, 2024, 555, 8080];
  for (const seed of seeds) {
    const { doc } = profileRun(seed, {});
    const mid = doc.clips.filter((clip) => clip.trackId === 'mid');
    assert.ok(mid.length >= 2, `seed ${seed} mid clips ${mid.length}`);
    const fields = (clip) => {
      const spec = clip.spec || {};
      const plane = ((spec.params && spec.params.list) || []).find((entry) => entry && entry.type === 'split');
      const animate = (spec.params && spec.params.animate) || {};
      return {
        layout: plane && plane.params ? plane.params.layout : null,
        parts: plane && plane.params ? plane.params.parts : null,
        motion: plane && plane.params ? plane.params.motion : null,
        mode: animate.mode,
        transition: animate.transition,
      };
    };
    for (let i = 1; i < mid.length; i += 1) {
      const a = fields(mid[i - 1]);
      const b = fields(mid[i]);
      // motion / mode / transition always keep at least two candidates after
      // the ban, so a repeat is a bug
      assert.notEqual(b.motion, a.motion, `seed ${seed} clip ${i} motion ${b.motion}`);
      assert.notEqual(b.mode, a.mode, `seed ${seed} clip ${i} mode ${b.mode}`);
      assert.notEqual(b.transition, a.transition, `seed ${seed} clip ${i} transition ${b.transition}`);
      // the plane-count draw only guarantees a second layout at 2-3 planes
      // (1 -> halves only, 4 -> two names); those pairs may repeat by design
      if (a.parts >= 2 && a.parts <= 3 && b.parts >= 2 && b.parts <= 3) {
        assert.notEqual(b.layout, a.layout, `seed ${seed} clip ${i} layout ${b.layout}`);
      }
    }
  }
});

test('the profile use-palettes are the only source of the cue palettes', () => {
  const paletteA = { id: 'pa', name: 'A', colors: ['#101018', '#202838', '#eef2ff', '#ff8a3d', '#05060a', '#ffc247'] };
  const paletteB = { id: 'pb', name: 'B', colors: ['#1d0b0b', '#331111', '#ffe0d0', '#ff5a5a', '#180404', '#ffb37a'] };
  // the use-palettes feed the classic cue lottery: flag the beats the run builds
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const originalApply = SA.textflow.apply;
  SA.textflow.apply = (project, options) => {
    const result = originalApply(project, options);
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
    SA.direct.run(doc, prepare(doc, FIXTURE, { axes: { ...FIXTURE.axes, weird: 0.6 }, seed: 4242, compose: true, usePalettes: [paletteA, paletteB] }));
  } finally {
    SA.textflow.apply = originalApply;
  }
  const texts = new Set();
  for (const cue of doc.script.cues) {
    const own = doc.cueStyles[cue.id];
    if (own && own.palette && own.palette.colors) texts.add(own.palette.colors[2]);
  }
  assert.ok(texts.size >= 1 && texts.size <= 2, `distinct cue text colours ${texts.size}`);
  for (const text of texts) assert.ok([paletteA.colors[2], paletteB.colors[2]].includes(text), `unexpected text ${text}`);
});

test('a pinned decoOutline gives every cue an outline and a zeroed type never appears', () => {
  const params = { decoNone: 0, decoOutline: 1, decoShadow: 0, decoExtrude: 0, decoLongShadow: 0, decoDouble: 0, decoGlow: 0 };
  const { doc } = profileRun(4242, {}, { params });
  for (const cue of doc.script.cues) {
    const cueStyle = SA.project.resolveStyle(doc, `cue:${cue.id}`);
    assert.ok(Array.isArray(cueStyle.edge) && cueStyle.edge.some((entry) => entry && entry.type === 'outline'), `${cue.id} has no outline`);
    // the outline wears the palette's edge role as a live reference, so a
    // palette re-roll moves the rendered edge
    const outline = cueStyle.edge.find((entry) => entry && entry.type === 'outline');
    const colors = (cueStyle.palette && cueStyle.palette.colors) || [];
    const slot = colors.length >= SA.paletteRoles.SIZE ? SA.paletteRoles.SLOT.TEXT_EDGE : 4;
    assert.deepEqual(outline.params.color, { kind: 'palette', index: slot }, `${cue.id} outline is not the edge role`);
    const before = SA.color.toRgba(outline.params.color, null, { palette: cueStyle.palette });
    const rerolled = { ...cueStyle.palette, colors: colors.map((hex, index) => (index === slot ? '#ff00ff' : hex)) };
    const after = SA.color.toRgba(outline.params.color, null, { palette: rerolled });
    assert.notDeepEqual(before, after, `${cue.id} edge does not follow the palette`);
  }
  const { doc: glitch } = profileRun(4242, {}, { typeWeights: { enter: { glitchIn: 0 } } });
  for (const cue of glitch.script.cues) {
    const cueStyle = SA.project.resolveStyle(glitch, `cue:${cue.id}`);
    assert.notEqual(cueStyle.enter && cueStyle.enter.type, 'glitchIn', `${cue.id} drew glitchIn`);
    for (const beat of (glitch.beats && glitch.beats[cue.id]) || []) {
      const resolved = SA.project.resolveStyle(glitch, `cue:${cue.id}/beat:${beat.id}`);
      assert.notEqual(resolved.enter && resolved.enter.type, 'glitchIn', `${beat.id} drew glitchIn`);
    }
  }
});

// ---------------------------------------------------------------------------
// the compose profile expansion

// Every compose-only chance on at once: each element must appear.
const ALL_CHANCES = {
  fontChance: 1,
  beatFontChance: 1,
  beatBoldChance: 1,
  spacingChance: 1,
  alignChance: 1,
  widthChance: 1,
  accentColorChance: 1,
  gradientColorChance: 1,
  fillEffectChance: 1,
  patternFillChance: 1,
  beatDecoChance: 1,
  maskChance: 1,
  textBgChance: 1,
  bgVaryChance: 1,
  bgEdgeChance: 1,
  tiltChance: 1,
  locationChance: 1,
  floatChance: 1,
  repeatChance: 1,
  clonesChance: 1,
  holdChance: 1,
  pulseChance: 1,
  motionChance: 1,
  figureBoldChance: 1,
};

function composedDoc(params, extra) {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const ctx = prepare(doc, FIXTURE, { axes: { ...FIXTURE.axes, weird: 0.6 }, compose: true, params, ...(extra || {}) });
  SA.direct.run(doc, ctx);
  return doc;
}

function stylesOf(doc) {
  const out = [];
  for (const cue of doc.script.cues) for (const beat of (doc.beats && doc.beats[cue.id]) || []) out.push({ cue, beat, style: doc.beatStyles[beat.id] || {} });
  return out;
}

test('the compose chances off leave the template picture untouched', () => {
  const doc = composedDoc({ ...NO_VARIATION });
  const beats = stylesOf(doc);
  for (const cue of doc.script.cues) {
    const own = doc.cueStyles[cue.id] || {};
    assert.ok(!own.clones, `${cue.id} clones`);
    assert.ok(!own.repeat, `${cue.id} repeat`);
    assert.ok(!own.bgShape && !own.ornShape, `${cue.id} text background / ornament`);
    assert.ok(!own.text || !own.text.fontId, `${cue.id} font`);
  }
  for (const { beat, style } of beats) {
    assert.ok(!style.edge, `${beat.id} edge`);
    assert.ok(!Array.isArray(style.hold) || !style.hold.length, `${beat.id} hold`);
    assert.ok(!style.transform || (!style.transform.rotate && !style.transform.tiltX), `${beat.id} transform`);
    assert.ok(!style.location || style.location.type === 'grid', `${beat.id} location`);
    assert.ok(!style.enter || !style.enter.params || !style.enter.params.wipe || style.enter.params.wipe === 'none', `${beat.id} mask`);
    assert.ok(!style.repeat, `${beat.id} repeat`);
  }
});

test('the compose chances on draw every optional element', () => {
  const doc = composedDoc({ ...NO_VARIATION, ...ALL_CHANCES });
  const base = composedDoc({ ...NO_VARIATION });
  const beats = stylesOf(doc);
  const baseBeats = new Map(stylesOf(base).map((entry) => [entry.beat.id, entry.style]));
  const cues = doc.script.cues;
  assert.ok(cues.some((cue) => (doc.cueStyles[cue.id] || {}).text && (doc.cueStyles[cue.id] || {}).text.fontId), 'a cue face');
  assert.ok(beats.some(({ style }) => style.text && style.text.weight === 700), 'a bold beat');
  assert.ok(beats.some(({ beat, style }) => style.text && baseBeats.get(beat.id) && style.text.letterSpacing !== baseBeats.get(beat.id).text.letterSpacing), 'tracking');
  assert.ok(beats.some(({ beat, style }) => style.text && baseBeats.get(beat.id) && style.text.lineHeight !== baseBeats.get(beat.id).text.lineHeight), 'leading');
  assert.ok(beats.some(({ style }) => style.text && style.text.align !== 'center'), 'alignment');
  assert.ok(beats.some(({ beat, style }) => style.text && baseBeats.get(beat.id) && style.text.maxWidth !== baseBeats.get(beat.id).text.maxWidth), 'line width');
  assert.ok(beats.some(({ style }) => style.color && style.color.fill), 'beat colour');
  assert.ok(beats.some(({ style }) => style.enter && style.enter.params && style.enter.params.wipe && style.enter.params.wipe !== 'none'), 'entrance mask');
  assert.ok(beats.some(({ style }) => style.transform && (style.transform.rotate || style.transform.tiltX)), 'tilt');
  assert.ok(beats.some(({ style }) => Array.isArray(style.hold) && style.hold.length), 'hold');
  assert.ok(beats.some(({ beat, style }) => style.exit && baseBeats.get(beat.id) && JSON.stringify(style.exit) !== JSON.stringify(baseBeats.get(beat.id).exit)), 'entrance/exit motion');
  assert.ok(beats.some(({ style }) => style.location && (style.location.type === 'randomSafe' || style.location.params.offsetX || style.location.params.offsetY)), 'location nudge');
  assert.ok(cues.some((cue) => (doc.cueStyles[cue.id] || {}).repeat), 'a cue repeat');
  assert.ok(cues.some((cue) => (doc.cueStyles[cue.id] || {}).clones), 'a cue clone');
  assert.ok(cues.some((cue) => (doc.cueStyles[cue.id] || {}).bgShape || (doc.cueStyles[cue.id] || {}).ornShape), 'a text background or ornament');
  for (const cue of cues) {
    const own = doc.cueStyles[cue.id] || {};
    if (own.bgShape && own.bgShape.type && own.bgShape.type !== 'none') {
      assert.equal(own.bgShape.type, 'square', `${cue.id} background is not a square`);
    }
  }
  assert.ok(beats.some(({ style }) => Array.isArray(style.edge) && style.edge.length), 'beat decoration');
  const figureTrack = doc.tracks.find((track) => track.kind === 'figure');
  assert.ok(
    doc.clips.filter((clip) => clip.trackId === figureTrack.id).some((clip) => clip.spec.params.stroke === 'bold'),
    'a bold-stroke figure'
  );
  // the theme palette set's invert chance toggles the roles somewhere (the
  // default 0.2; the compose-only paletteInvertChance now belongs to the
  // legacy beat path only)
  const paletteState = (document) => {
    const out = [];
    for (const cue of document.script.cues) for (const beat of (document.beats && document.beats[cue.id]) || []) {
      const own = (document.beatStyles && document.beatStyles[beat.id]) || {};
      out.push(`${own.paletteIndex || 0}${own.paletteInvert ? 'i' : ''}`);
    }
    return out.join(',');
  };
  assert.ok(paletteState(doc).includes('i'), `the palette invert toggled (${paletteState(doc)})`);
});

test('the fill effect draw only applies to a theme without its own fill', () => {
  const theme = JSON.parse(JSON.stringify(FIXTURE.themeStyle));
  delete theme.fill;
  const doc = composedDoc({ ...NO_VARIATION, fillEffectChance: 1 }, { themeStyle: theme });
  const beats = stylesOf(doc);
  assert.ok(beats.some(({ style }) => style.fill && style.fill.type), `no beat drew a fill effect (${beats.map(({ beat, style }) => `${beat.id}:${!!style.fill}`).join(' ')})`);
});

test('the pattern fill draw paints a readable pattern between two palette colours', () => {
  const theme = JSON.parse(JSON.stringify(FIXTURE.themeStyle));
  delete theme.fill;
  const doc = composedDoc({ ...NO_VARIATION, fillEffectChance: 0, patternFillChance: 1 }, { themeStyle: theme });
  const fills = stylesOf(doc).map(({ style }) => style.fill).filter(Boolean);
  assert.ok(fills.length, 'no beat drew a pattern fill');
  for (const fill of fills) {
    assert.ok(['stripes', 'checker', 'diamondGrid', 'hatch'].includes(fill.type), fill.type);
    assert.equal(fill.params.colorA.kind, 'palette');
    assert.notEqual(fill.params.colorA.index, fill.params.colorB.index);
  }
});

// The chances only the compose path reads: pinning them must not move the
// classic output.
const COMPOSE_ONLY_CHANCES = {
  beatBoldChance: 1,
  spacingChance: 1,
  alignChance: 1,
  widthChance: 1,
  fillEffectChance: 1,
  patternFillChance: 1,
  maskChance: 1,
  beatDecoChance: 1,
  textBgChance: 1,
  bgVaryChance: 1,
  bgEdgeChance: 1,
  paletteInvertChance: 1,
  boldChance: 1,
};

test('the classic path ignores the compose-only chances', () => {
  const plain = runOn(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE, { axes: { ...FIXTURE.axes, weird: 0.6 } });
  const pinned = runOn(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE, { axes: { ...FIXTURE.axes, weird: 0.6 }, params: { ...COMPOSE_ONLY_CHANCES } });
  // the pinned map itself is stored (styleMode.params); everything else must be
  // byte-identical because the classic path never reads the new chances
  const withoutProfile = (doc) => {
    const out = outputOf(doc);
    delete out.styleMode;
    return out;
  };
  assert.deepEqual(withoutProfile(pinned), withoutProfile(plain));
});

test('a pinned text background chance overrides the genre setting', () => {
  const genre = SA.genres.LIST[0].id;
  // pinned chance 1 applies even when the genre's own table says less
  const on = composedDoc({ ...NO_VARIATION, textBgChance: 1 }, { genre });
  assert.ok(on.script.cues.some((cue) => (on.cueStyles[cue.id] || {}).bgShape || (on.cueStyles[cue.id] || {}).ornShape), 'pinned 1 did not apply');
  // pinned chance 0 blocks it everywhere
  const off = composedDoc({ ...NO_VARIATION, textBgChance: 0 }, { genre });
  assert.ok(off.script.cues.every((cue) => !(off.cueStyles[cue.id] || {}).bgShape && !(off.cueStyles[cue.id] || {}).ornShape), 'pinned 0 did not block');
});
