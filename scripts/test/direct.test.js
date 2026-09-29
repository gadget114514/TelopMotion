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
  color: require(path.join(ROOT, 'renderer', 'js', 'color.js')),
  moods: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'moods.js')),
  textflow: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'textflow.js')),
  project: require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js')),
  fillers: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'fillers.js')),
  rhythm: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'rhythm.js')),
  figures: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'figures.js')),
  fillerRender: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-render.js')),
  fillerPresets: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-presets.js')),
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
  // figures); everything else must match the pre-extraction snapshot.
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
  assert.deepEqual(rest, fixtureRest);
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
  // genre exclude: seed 29 draws the sine-wave combo without the filter, and a
  // genre excluding sineWave never gets it
  const free = prepare(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE, { seed: 29 });
  const freeSpec = SA.direct.fillerSettings(JSON.parse(JSON.stringify(FIXTURE.input)), free);
  assert.ok(
    SA.fillerRender.layersOf(freeSpec.byKind.interlude).some((layer) => layer.type === 'sineWave'),
    'seed 29 picks the sine combo without the genre filter'
  );
  const filteredDoc = JSON.parse(JSON.stringify(FIXTURE.input));
  const filtered = prepare(filteredDoc, FIXTURE, { seed: 29, genre: { clips: { filler: { exclude: ['sineWave'] } } } });
  const filteredSpec = SA.direct.fillerSettings(filteredDoc, filtered);
  for (const entry of [filteredSpec.byKind.interlude, filteredSpec.longGap.spec, filteredSpec.byKind.intro.params.list[1], filteredSpec.byKind.outro.params.list[1]]) {
    assert.ok(!SA.fillerRender.layersOf(entry).some((layer) => layer.type === 'sineWave'), 'excluded layers never appear');
  }
});

test('the run is deterministic for one seed', () => {
  const first = runOn(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE);
  const second = runOn(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE);
  assert.deepEqual(outputOf(first), outputOf(second));
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
