'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
globalThis.window = globalThis;
globalThis.SA = globalThis.SA || {};
require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'));
const engine = globalThis.SA.lyricsEngine;
const fillerRender = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-render.js'));
globalThis.SA.fillerRender = fillerRender;
const figures = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'figures.js'));
globalThis.SA.figures = figures;
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));

test('figureForegroundOn and figureBackgroundOn truth table', () => {
  assert.equal(engine.figureForegroundOn({}, {}), true);
  assert.equal(engine.figureBackgroundOn({}, {}), true);
  assert.equal(engine.figureForegroundOn(null, null), true);
  assert.equal(engine.figureBackgroundOn(null, null), true);

  assert.equal(engine.figureForegroundOn({ figureFgHidden: true }, {}), false);
  assert.equal(engine.figureForegroundOn({ figureFgHidden: false }, {}), true);
  assert.equal(engine.figureBackgroundOn({ figureBgHidden: true }, {}), false);
  assert.equal(engine.figureBackgroundOn({ figureBgHidden: false }, {}), true);

  // track-level enabled: false
  assert.equal(engine.figureForegroundOn({ kind: 'figure', enabled: false }, {}), false);
  assert.equal(engine.figureBackgroundOn({ kind: 'backdrop', enabled: false }, {}), false);
  assert.equal(engine.figureForegroundOn({ enabled: false }, {}), false);
  assert.equal(engine.figureBackgroundOn({ enabled: false }, {}), false);

  // fg / bg enabled flags (track level)
  assert.equal(engine.figureForegroundOn({ figureFgEnabled: false }, {}), false);
  assert.equal(engine.figureForegroundOn({ figureFgEnabled: true }, {}), true);
  assert.equal(engine.figureForegroundOn({ figureFg: { enabled: false } }, {}), false);
  assert.equal(engine.figureForegroundOn({ figureFg: { enabled: true } }, {}), true);
  assert.equal(engine.figureForegroundOn({ fg: { enabled: false } }, {}), false);
  assert.equal(engine.figureForegroundOn({ fg: { enabled: true } }, {}), true);
  assert.equal(engine.figureForegroundOn({ fgEnabled: false }, {}), false);
  assert.equal(engine.figureForegroundOn({ fgEnabled: true }, {}), true);

  assert.equal(engine.figureBackgroundOn({ figureBgEnabled: false }, {}), false);
  assert.equal(engine.figureBackgroundOn({ figureBgEnabled: true }, {}), true);
  assert.equal(engine.figureBackgroundOn({ figureBg: { enabled: false } }, {}), false);
  assert.equal(engine.figureBackgroundOn({ figureBg: { enabled: true } }, {}), true);
  assert.equal(engine.figureBackgroundOn({ bg: { enabled: false } }, {}), false);
  assert.equal(engine.figureBackgroundOn({ bg: { enabled: true } }, {}), true);
  assert.equal(engine.figureBackgroundOn({ bgEnabled: false }, {}), false);
  assert.equal(engine.figureBackgroundOn({ bgEnabled: true }, {}), true);

  // view level enabled flags
  assert.equal(engine.figureForegroundOn({}, { figureForeground: false }), false);
  assert.equal(engine.figureForegroundOn({}, { figureFgEnabled: false }), false);
  assert.equal(engine.figureForegroundOn({}, { figureFg: { enabled: false } }), false);
  assert.equal(engine.figureBackgroundOn({}, { figureBackground: false }), false);
  assert.equal(engine.figureBackgroundOn({}, { figureBgEnabled: false }), false);
  assert.equal(engine.figureBackgroundOn({}, { figureBg: { enabled: false } }), false);
  assert.equal(engine.figureForegroundOn({ figureFgHidden: false }, { figureForeground: false }), false);
  assert.equal(engine.figureBackgroundOn({ figureBgHidden: false }, { figureBackground: false }), false);

  assert.equal(engine.figureLayerOn('foreground', { figureFgHidden: true }, {}), false);
  assert.equal(engine.figureLayerOn('foreground', { figureFgEnabled: false }, {}), false);
  assert.equal(engine.figureLayerOn('foreground', { figureFg: { enabled: false } }, {}), false);
  assert.equal(engine.figureLayerOn('background', { figureBgHidden: true }, {}), false);
  assert.equal(engine.figureLayerOn('background', { figureBgEnabled: false }, {}), false);
  assert.equal(engine.figureLayerOn('background', { figureBg: { enabled: false } }, {}), false);
  assert.equal(engine.figureLayerOn('foreground', {}, {}), true);
  assert.equal(engine.figureLayerOn('background', {}, {}), true);
  assert.equal(engine.figureLayerOn('other', { figureFgHidden: true, figureBgHidden: true }, {}), true);

  assert.deepEqual(engine.figureLayerFlags({ figureFgHidden: true }, {}), { foreground: false, background: true });
  assert.deepEqual(engine.figureLayerFlags({ figureFgEnabled: false }, {}), { foreground: false, background: true });
  assert.deepEqual(engine.figureLayerFlags({ figureBgHidden: true }, {}), { foreground: true, background: false });
  assert.deepEqual(engine.figureLayerFlags({ figureBgEnabled: false }, {}), { foreground: true, background: false });
  assert.deepEqual(engine.figureLayerFlags({}, { figureForeground: false, figureBackground: false }), { foreground: false, background: false });
});

test('figureLayerOf maps clip types to layers covering all TYPE_ORDER types', () => {
  const expected = {
    figure: 'foreground',
    figures: 'foreground',
    shapes: 'foreground',
    waveform: 'foreground',
    spectrum: 'foreground',
    countdown: 'foreground',
    progress: 'foreground',
    instrumental: 'foreground',
    nextLinePreview: 'foreground',
    previousLineGhost: 'foreground',
    split: 'background',
    pattern: 'background',
    particles: 'background',
    sineWave: 'background',
    none: null,
    credits: null,
    cardPeek: null,
    textAnim: null,
    combo: null,
  };

  const allTypes = fillerRender.types();
  for (const type of allTypes) {
    assert.ok(type in expected, `TYPE_ORDER type '${type}' is missing from classification table`);
  }

  for (const [type, expectedLayer] of Object.entries(expected)) {
    assert.equal(engine.figureLayerOf({ type }), expectedLayer, `figureLayerOf({ type: '${type}' }) mismatch`);
    if (type !== 'figure') {
      assert.equal(fillerRender.layerOf(type), expectedLayer, `fillerRender.layerOf('${type}') mismatch`);
    }
  }

  assert.equal(engine.figureLayerOf(null), null);
  assert.equal(engine.figureLayerOf({}), null);
});

test('fillerRender.drawList conditionally renders split, pattern, particles, sineWave, and foreground types based on layers', () => {
  const figSpec = figures.generate({ span: { start: 0, end: 4 }, motif: 'orbit', seed: 42, id: 'f1' });
  const baseCtx = {
    time: 2,
    frame: { width: 1920, height: 1080 },
    clip: { key: 'c1', start: 0, end: 4 },
    seed: 42,
    colors: ['#ffffff', '#ff8a3d'],
    beats: [{ start: 0, end: 4 }],
  };

  // Background types: split, pattern, particles, sineWave
  const bgSpecs = [
    { type: 'split', params: { mode: 'halves' } },
    { type: 'pattern', params: { mode: 'grid', size: 1 } },
    { type: 'particles', params: {} },
    { type: 'sineWave', params: {} },
  ];

  for (const spec of bgSpecs) {
    const normal = fillerRender.drawList(spec, baseCtx);
    assert.ok(normal.shapes.length > 0, `${spec.type} normal should draw shapes`);

    const bgOff = fillerRender.drawList(spec, { ...baseCtx, layers: { background: false, foreground: true } });
    assert.deepEqual(bgOff, { shapes: [], texts: [] }, `${spec.type} with background=false should be empty`);

    const fgOff = fillerRender.drawList(spec, { ...baseCtx, layers: { background: true, foreground: false } });
    assert.ok(fgOff.shapes.length > 0, `${spec.type} with foreground=false should still draw`);
  }

  // Foreground types: figures, shapes, waveform, spectrum, countdown, progress
  const fgSpecs = [
    { type: 'figures', params: figSpec.params },
    { type: 'shapes', params: {} },
    { type: 'waveform', params: {} },
    { type: 'spectrum', params: {} },
    { type: 'countdown', params: { from: 3 } },
    { type: 'progress', params: {} },
  ];

  for (const spec of fgSpecs) {
    const normal = fillerRender.drawList(spec, baseCtx);
    assert.ok((normal.shapes.length > 0) || (normal.texts.length > 0), `${spec.type} normal should draw shapes or texts`);

    const fgOff = fillerRender.drawList(spec, { ...baseCtx, layers: { background: true, foreground: false } });
    assert.deepEqual(fgOff, { shapes: [], texts: [] }, `${spec.type} with foreground=false should be empty`);

    const bgOff = fillerRender.drawList(spec, { ...baseCtx, layers: { background: false, foreground: true } });
    assert.ok((bgOff.shapes.length > 0) || (bgOff.texts.length > 0), `${spec.type} with background=false should still draw`);
  }

  // Combo: [split, figures] drops each part independently
  const splitSpec = { type: 'split', params: { mode: 'halves' } };
  const figuresSpec = { type: 'figures', params: figSpec.params };
  const splitNormal = fillerRender.drawList(splitSpec, baseCtx);
  const figuresNormal = fillerRender.drawList(figuresSpec, baseCtx);

  const comboSpec = {
    type: 'combo',
    params: {
      list: [splitSpec, figuresSpec],
    },
  };

  const comboAll = fillerRender.drawList(comboSpec, { ...baseCtx, layers: { background: true, foreground: true } });
  assert.equal(comboAll.shapes.length, splitNormal.shapes.length + figuresNormal.shapes.length);

  const comboBgOff = fillerRender.drawList(comboSpec, { ...baseCtx, layers: { background: false, foreground: true } });
  assert.equal(comboBgOff.shapes.length, figuresNormal.shapes.length);

  const comboFgOff = fillerRender.drawList(comboSpec, { ...baseCtx, layers: { background: true, foreground: false } });
  assert.equal(comboFgOff.shapes.length, splitNormal.shapes.length);

  const comboBothOff = fillerRender.drawList(comboSpec, { ...baseCtx, layers: { background: false, foreground: false } });
  assert.deepEqual(comboBothOff.shapes, []);
});

test('engine source assertions for drawFigureClip, fillerClipContext, and drawShapeClip', () => {
  const source = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'), 'utf8');
  assert.ok(source.includes('figureForegroundOn(trackById('), 'drawFigureClip missing figureForegroundOn check');
  assert.ok(source.includes('layers: figureLayerFlags(clip ? trackById(state.project, clip.trackId) : null, state.view)'), 'drawShapeClip missing layers in context');
  assert.ok(source.includes('layers: figureLayerFlags(clip ? trackById(project, clip.trackId) : null, state.view)'), 'fillerClipContext missing layers in context');
});

test('project.migrate normalises figureFgHidden, figureBgHidden, and enabled flags to booleans and keeps them absent by default', () => {
  const doc = project.defaults({});
  doc.tracks = [
    { id: 'fig1', kind: 'figure', name: '図形1', figureFgHidden: 1, figureBgHidden: 0, figureFgEnabled: 0, figureBgEnabled: 1, figureFg: { enabled: 0 }, figureBg: { enabled: 1 } },
    { id: 'fig2', kind: 'figure', name: '図形2' },
    { id: 'bd1', kind: 'backdrop', name: '後景1', figureFgHidden: 0, figureBgHidden: 1, fgEnabled: 1, bgEnabled: 0, fg: { enabled: 1 }, bg: { enabled: 0 } },
    { id: 'bd2', kind: 'backdrop', name: '後景2' },
    { id: 'fl1', kind: 'filler', name: 'フィラー1', figureFgHidden: true },
    { id: 'sub1', kind: 'subtitle', name: '字幕1', figureFgHidden: 1 },
  ];
  const migrated = project.migrate(doc);
  assert.equal(migrated.ok, true);

  const fig1 = migrated.project.tracks.find((t) => t.id === 'fig1');
  assert.equal(fig1.figureFgHidden, true);
  assert.equal(fig1.figureBgHidden, false);
  assert.equal(fig1.figureFgEnabled, false);
  assert.equal(fig1.figureBgEnabled, true);
  assert.equal(fig1.figureFg.enabled, false);
  assert.equal(fig1.figureBg.enabled, true);

  const fig2 = migrated.project.tracks.find((t) => t.id === 'fig2');
  assert.equal(fig2.figureFgHidden, undefined);
  assert.equal(fig2.figureBgHidden, undefined);
  assert.equal(fig2.figureFgEnabled, undefined);
  assert.equal(fig2.figureBgEnabled, undefined);

  const bd1 = migrated.project.tracks.find((t) => t.id === 'bd1');
  assert.equal(bd1.figureFgHidden, false);
  assert.equal(bd1.figureBgHidden, true);
  assert.equal(bd1.fgEnabled, true);
  assert.equal(bd1.bgEnabled, false);
  assert.equal(bd1.fg.enabled, true);
  assert.equal(bd1.bg.enabled, false);

  const bd2 = migrated.project.tracks.find((t) => t.id === 'bd2');
  assert.equal(bd2.figureFgHidden, undefined);
  assert.equal(bd2.figureBgHidden, undefined);

  const fl1 = migrated.project.tracks.find((t) => t.id === 'fl1');
  assert.equal(fl1.figureFgHidden, true);
  assert.equal(fl1.figureBgHidden, undefined);

  // subtitle track should not have figureFgHidden normalised
  const sub1 = migrated.project.tracks.find((t) => t.id === 'sub1');
  assert.equal(sub1.figureFgHidden, 1);
});

test('timeline menu, inspector controls, and i18n keys wiring', () => {
  const timeline = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'timeline.js'), 'utf8');
  assert.ok(timeline.includes("track.figureFgHidden ? t('studio.track.showFigureFg') : t('studio.track.hideFigureFg')"), 'timeline showFigureFg menu item missing');
  assert.ok(timeline.includes("track.figureBgHidden ? t('studio.track.showFigureBg') : t('studio.track.hideFigureBg')"), 'timeline showFigureBg menu item missing');
  assert.ok(timeline.includes('clipLayerHidden(clip, row.track)'), 'timeline clipLayerHidden call missing');

  const inspector = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'inspector.js'), 'utf8');
  assert.ok(inspector.includes('figureFgVisible'), 'figureFgVisible missing from inspector');
  assert.ok(inspector.includes('figureBgVisible'), 'figureBgVisible missing from inspector');
  assert.ok(inspector.includes('figureLayerOff'), 'figureLayerOff missing from inspector');
  assert.ok(inspector.includes('figureFgHidden'), 'figureFgHidden missing from inspector');
  assert.ok(inspector.includes('figureBgHidden'), 'figureBgHidden missing from inspector');

  const i18n = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'i18n.js'), 'utf8');
  for (const key of ['hideFigureFg', 'showFigureFg', 'hideFigureBg', 'showFigureBg', 'figureFgVisible', 'figureBgVisible', 'figureLayerOff']) {
    assert.ok(i18n.includes(key), `${key} missing from i18n`);
  }
});

test('backdrop track UI addition, timeline wiring, and i18n completeness', () => {
  const html = fs.readFileSync(path.join(ROOT, 'renderer', 'studio.html'), 'utf8');
  assert.ok(html.includes('id="tl-add-backdrop-track"'), 'studio.html missing tl-add-backdrop-track button');

  const timeline = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'timeline.js'), 'utf8');
  assert.ok(timeline.includes("el.addBackdropTrack = document.getElementById('tl-add-backdrop-track')"), 'timeline.js missing el.addBackdropTrack cache');
  assert.ok(timeline.includes("el.addBackdropTrack.addEventListener('click', () => addAnimationTrack('backdrop'))"), 'timeline.js missing click listener for addBackdropTrack');
  assert.ok(timeline.includes("backdrop: 'studio.toast.backdropTrack'"), 'timeline.js missing backdrop toast');

  require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
  const i18n = globalThis.SA.i18n;
  for (const lang of ['en', 'ja', 'es', 'fr', 'ru']) {
    i18n.set(lang);
    const addLabel = i18n.t('studio.timeline.addBackdropTrack');
    const toastLabel = i18n.t('studio.toast.backdropTrack');
    assert.ok(addLabel && addLabel !== 'studio.timeline.addBackdropTrack', `missing addBackdropTrack in ${lang}`);
    assert.ok(toastLabel && toastLabel !== 'studio.toast.backdropTrack', `missing backdropTrack toast in ${lang}`);
  }

  // Verify store.commands.addTrack('backdrop')
  globalThis.SA.project = project;
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'moods.js'));
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'weird.js'));
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gen-params.js'));
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'palette-roles.js'));
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'rng.js'));
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'fillers.js'));
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'random.js'));
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'keywords.js'));
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'compositions.js'));
  require(path.join(ROOT, 'renderer', 'js', 'studio', 'direct.js'));
  require(path.join(ROOT, 'renderer', 'js', 'studio', 'colors.js'));
  require(path.join(ROOT, 'renderer', 'js', 'studio', 'store.js'));

  const store = globalThis.SA.store;
  store.load(project.defaults({
    script: { cues: [{ id: 'c1', start: 0, end: 4, text: 'test', trackId: 'sub1' }] },
  }));

  const initialBackdrop = store.state.project.tracks.find((t) => t.id === 'mid');
  assert.ok(initialBackdrop, 'default mid track exists');

  const newTrackId = store.commands.addTrack('backdrop');
  assert.ok(newTrackId, 'addTrack returned a trackId');
  assert.equal(newTrackId, 'mid1', 'first added backdrop track gets mid1');

  const addedTrack = store.state.project.tracks.find((t) => t.id === newTrackId);
  assert.ok(addedTrack, 'new backdrop track is in project tracks');
  assert.equal(addedTrack.kind, 'backdrop');

  // Verify it is placed adjacent to existing backdrop track (before filler/bg)
  const tracks = store.state.project.tracks;
  const midIndex = tracks.findIndex((t) => t.id === 'mid');
  const mid1Index = tracks.findIndex((t) => t.id === 'mid1');
  assert.equal(mid1Index, midIndex + 1, 'mid1 placed directly after mid');

  // Clips can be added to the new backdrop track
  const clipId = store.commands.addClip({ start: 1, end: 3, spec: { type: 'split', params: {} } }, newTrackId);
  assert.ok(clipId, 'clip added to new backdrop track');
  assert.equal(store.state.project.clips.filter((c) => c.trackId === newTrackId).length, 1);

  // Removing the track removes it and its clips
  store.commands.removeTrack(newTrackId);
  assert.ok(!store.state.project.tracks.some((t) => t.id === newTrackId), 'track removed');
  assert.equal(store.state.project.clips.filter((c) => c.trackId === newTrackId).length, 0, 'clips cleaned up');
});

test('activeClips filters out tracks where track.enabled === false', () => {
  const p = {
    tracks: [
      { id: 'f1', kind: 'figure', enabled: true },
      { id: 'f2', kind: 'figure', enabled: false },
      { id: 'b1', kind: 'backdrop', enabled: true },
      { id: 'b2', kind: 'backdrop', enabled: false },
    ],
    clips: [
      { id: 'c1', trackId: 'f1', start: 0, end: 2, spec: { type: 'figure' } },
      { id: 'c2', trackId: 'f2', start: 1, end: 3, spec: { type: 'figure' } },
      { id: 'c3', trackId: 'b1', start: 0, end: 2, spec: { type: 'split' } },
      { id: 'c4', trackId: 'b2', start: 1, end: 3, spec: { type: 'split' } },
    ],
  };

  const activeFigures = engine.activeClips(p, 'figure');
  assert.equal(activeFigures.length, 1);
  assert.equal(activeFigures[0].id, 'c1');

  const activeBackdrops = engine.activeClips(p, 'backdrop');
  assert.equal(activeBackdrops.length, 1);
  assert.equal(activeBackdrops[0].id, 'c3');
});

test('turning off fg and bg checkboxes sets enabled to false', () => {
  const store = globalThis.SA.store;
  store.load(project.defaults({}));

  const figTrack = store.state.project.tracks.find((t) => t.kind === 'figure');
  assert.ok(figTrack, 'figure track exists');

  // Turn off fg on figure track -> figureFgEnabled: false, figureFg: { enabled: false }, enabled: false
  store.commands.updateTrack(figTrack.id, {
    figureFgHidden: true,
    figureFgEnabled: false,
    figureFg: { enabled: false },
    fg: { enabled: false },
    fgEnabled: false,
    enabled: false,
  });

  const updatedFig = store.state.project.tracks.find((t) => t.id === figTrack.id);
  assert.equal(updatedFig.enabled, false);
  assert.equal(updatedFig.figureFgEnabled, false);
  assert.equal(updatedFig.figureFg.enabled, false);
  assert.equal(engine.figureForegroundOn(updatedFig), false);

  const backdropTrack = store.state.project.tracks.find((t) => t.kind === 'backdrop');
  assert.ok(backdropTrack, 'backdrop track exists');

  // Turn off bg on backdrop track -> figureBgEnabled: false, figureBg: { enabled: false }, enabled: false
  store.commands.updateTrack(backdropTrack.id, {
    figureBgHidden: true,
    figureBgEnabled: false,
    figureBg: { enabled: false },
    bg: { enabled: false },
    bgEnabled: false,
    enabled: false,
  });

  const updatedBackdrop = store.state.project.tracks.find((t) => t.id === backdropTrack.id);
  assert.equal(updatedBackdrop.enabled, false);
  assert.equal(updatedBackdrop.figureBgEnabled, false);
  assert.equal(updatedBackdrop.figureBg.enabled, false);
  assert.equal(engine.figureBackgroundOn(updatedBackdrop), false);
});

