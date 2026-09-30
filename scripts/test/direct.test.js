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
  weird: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'weird.js')),
  fxAxes: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'fx-axes.js')),
  textflow: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'textflow.js')),
  project: require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js')),
  fillers: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'fillers.js')),
  rhythm: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'rhythm.js')),
  figures: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'figures.js')),
  fillerRender: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-render.js')),
  fillerPresets: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-presets.js')),
  compositions: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'compositions.js')),
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
  // second documented exception is the size ladder: energy is not 0 at weird 0,
  // so `beatStyles[*].text.size` belongs to the ladder now and is stripped from
  // both sides before the comparison.
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
    if (planes) assert.ok(['slide', 'swap', 'drift', 'push'].includes(planes.params.motion), `split motion ${planes.params.motion}`);
    const animate = (clip.spec.params && clip.spec.params.animate) || {};
    assert.ok(['accent', 'swell', 'sway', 'drift', 'still'].includes(animate.mode), `backdrop mode ${animate.mode}`);
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

test('compose mode draws a composition per beat and drops the weird jitter', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const ctx = prepare(doc, FIXTURE, { axes: { ...FIXTURE.axes, weird: 1 }, compose: true });
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
    const range = SA.direct.sizeRangeFor(beat, text, { frameW: 1920, frameH: 1080, portrait: false, screen: 1080, lang: 'en' }, Math.max(1, ...spans.map((span) => Number(span.scale) || 1)));
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
  const again = runOn(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE, { axes: { ...FIXTURE.axes, weird: 1 }, compose: true });
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
