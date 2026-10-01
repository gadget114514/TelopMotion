'use strict';

// Save / load round trip through the real io.js pipeline (bytes in, bytes out),
// with the data of every recently added feature: font sets, the weird axis and
// keyword config, fill sizing, shape clips (trim / dash / path ops), per-scope
// palettes, staged-style groups and media layers.

const test = require('node:test');
const assert = require('node:assert/strict');

const project = require('../../renderer/js/studio/project.js');
const fontset = require('../../renderer/js/lyrics/fontset.js');
const keywords = require('../../renderer/js/lyrics/keywords.js');

globalThis.window = globalThis;
globalThis.SA = globalThis.SA || {};
globalThis.SA.project = project;
globalThis.SA.fontSet = fontset;
globalThis.SA.keywords = keywords;

// platform stub: saveFile captures the bytes, readFile returns them
let disk = null;
let autosave = null;
const recent = [];
globalThis.SA.platform = {
  async saveFile(payload) {
    disk = { name: payload.name, bytes: payload.bytes };
    return { canceled: false, filePath: `X:\\out\\${payload.name}` };
  },
  async readFile() {
    return disk ? { name: disk.name, bytes: disk.bytes, path: `X:\\out\\${disk.name}` } : null;
  },
  async writeAutosave(doc) {
    autosave = JSON.parse(JSON.stringify(doc));
    return true;
  },
  async readAutosave() {
    return autosave;
  },
  recent: {
    async add(entry) {
      recent.push(entry);
      return true;
    },
  },
};

require('../../renderer/js/studio/store.js');
const store = globalThis.SA.store;
require('../../renderer/js/studio/io.js');
const io = globalThis.SA.io;

function fixture() {
  const doc = project.create({ lang: 'ja', aspect: '16:9' });
  // the fixture pins the pre-split version so the v3 migration runs
  doc.version = 2;
  doc.meta.title = 'RoundTrip';
  doc.script.cues = [
    { id: 'c1', start: 0, end: 8, text: '愛を叫べ hello world', trackId: 'sub1' },
    { id: 'c2', start: 8.5, end: 14, text: 'weird axis emphasis', trackId: 'sub1' },
  ];
  doc.beats = {
    c1: [
      { id: 'c1:page0', cueId: 'c1', kind: 'page', index: 0, start: 0, end: 4, text: '愛を叫べ', lines: ['愛を叫べ'], fontScale: 1.82, fit: 'fill', bleed: true, pinned: true },
      { id: 'c1:page1', cueId: 'c1', kind: 'page', index: 1, start: 4, end: 8, text: 'hello world', lines: ['hello', 'world'], fontScale: 1.21, fit: 'fill', pinned: true },
    ],
    c2: [{ id: 'c2:repeat0', cueId: 'c2', kind: 'repeat', start: 8.5, end: 14, text: 'weird axis emphasis', pinned: true, cycle: 1 }],
  };
  doc.styleMode = {
    order: 'cycle',
    seed: 20260929,
    locked: ['fill'],
    axes: { speed: 0.42, energy: 0.77, softness: 0.31, density: 0.66, brightness: 0.58, weird: 0.83 },
    direction: 'horizontal',
    genre: 'pop',
    theme: 'theme_staged',
    keywords: { enabled: true, extra: ['検証', 'RoundTrip'], exclude: ['hello'] },
  };
  doc.style.text = { fontId: 'user:0123456789abcdef', size: 96, weight: 400, letterSpacing: 0, lineHeight: 1.2, align: 'center', maxWidth: 0.9, fit: 'fill', fillCoverage: 0.82, fillMinSize: 40, fillMaxLines: 2, fillConsistency: 'cue', fillBleed: 0.04 };
  doc.style.palette = { id: 'p1', name: 'RoundTrip', colors: ['#101018', '#202838', '#ffffff', '#ff5c8a', '#000000', '#ffc247', '#4dc8ff'] };
  doc.style.bgShape = { type: 'rounded', params: { unit: 'cell', width: 1.2, height: 1.2, opacity: 0.85, vary: 'alternate', varyColors: ['#ff5c8a', '#ffc247'], skipSpaces: true, layer: 'behind', fgAutoContrast: true }, enabled: true };
  doc.style.bgFill = { type: 'solid', params: {} };
  doc.style.bgMotion = { type: 'pop', params: { lead: 0.05 } };
  doc.style.repeat = { type: 'grid', params: { rows: 4, cols: 6, gap: 0.1, variationPreset: 'ransomNote' }, enabled: true };
  doc.style.clones = [{ id: 'cl1', enabled: true, dx: 0.06, dy: 0.05, scale: 0.9, rotate: -4, opacity: 0.5, hue: 30, delay: 0.1, motion: { type: 'drift', amount: 0.01, speed: 1 } }];
  doc.cueStyles = {
    c1: {
      palette: { id: 'p2', name: 'Cue', colors: ['#0a1a10', '#12301c', '#f0fff0', '#00c060', '#001008', '#40ff90', '#a0ffd0'] },
      enter: { type: 'particlesAssemble', params: { count: 40 }, enabled: true, motion: { in: { duration: 1, delay: 0, ease: 'easeOutCubic' } } },
      repeat: { type: 'spiral', params: { count: 8, radius: 0.3, variationPreset: 'loudQuiet' }, enabled: true },
      text: { fontId: 'DelagothicOne-Regular', size: 120 },
    },
  };
  doc.beatStyles = {
    'c1:page0': {
      palette: { id: 'p3', name: 'Beat', colors: ['#101018', '#202838', '#ffffff', '#ff0000', '#000000', '#00ff00', '#0000ff'] },
      text: { size: 160, fontId: 'user:0123456789abcdef' },
      hold: [{ type: 'pulse', params: { amount: 0.1, bpm: 128 }, enabled: true }],
      color: { fill: { kind: 'gradient', type: 'linear', angle: 42, stops: [{ pos: 0, paletteIndex: 3 }, { pos: 1, paletteIndex: 5 }], animate: { angleSpeed: 12, shiftSpeed: 0.2 } } },
    },
  };
  doc.clips = [
    { id: 'clip_bg0', trackId: 'bg', start: 0, end: 14, spec: { type: 'noiseGradient', params: { scale: 2.2, speed: 0.3 } }, opacity: 1, fadeIn: 0.3, fadeOut: 0.3, colors: null },
    {
      id: 'clip_shape',
      trackId: 'bg',
      start: 0,
      end: 6,
      spec: {
        type: 'shapeLayer',
        params: { shape: 'brackets', followText: 'block', drive: 'hold', speed: 0.8, trimStart: 0.05, trimEnd: 0.95, trimOffset: 0.2, dashOn: 0.08, dashOff: 0.04, dashOffset: -0.1, pathOp: 'zigzag', pathOpAmount: 0.4, pathOpFreq: 3.5, stroke: 6, corner: 0.2, padding: 0.12, repeat: 3, repeatOffset: 0.3, repeatScale: 1.4, repeatRotate: 12, repeatOpacity: 0.6, cap: 'round', opacity: 0.9, color: '#ffc247' },
      },
      opacity: 0.9,
      fadeIn: 0.2,
      fadeOut: 0.2,
      colors: ['#ffc247'],
    },
  ];
  doc.fontSet = { exclusive: true, fonts: [{ id: 'user:0123456789abcdef', fontClass: 'hand' }, { id: 'NotoSerif-Regular', fontClass: 'serif' }] };
  doc.media.fonts = [{ id: 'user:0123456789abcdef', family: 'RoundTrip Hand', fileName: 'roundtrip.ttf', hash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', size: 51234, weight: 400, cjk: true }];
  doc.layers = [{ id: 'l1', slot: 'background', type: 'image', color: '#101826', src: 'data:image/png;base64,iVBORw0KGgo=', opacity: 1, blend: 'normal', fit: 'cover', radius: 8, enabled: true, start: 0, end: null, video: { speed: 1, offset: 0, play: true, loop: true }, transform: { x: 0.1, y: -0.05, scale: 1.1, rotate: 3 }, motion: { in: { type: 'fade', duration: 0.5, delay: 0, ease: 'easeOutCubic', params: {} }, out: { type: 'fade', duration: 0.5, delay: 0, ease: 'easeInCubic', params: {} } }, filter: { type: 'chromaticAberration', params: { amount: 6, angle: 0, radial: false } } }];
  doc.textFlow = { chunk: 'phrase', targetChunkDuration: 1.8, recap: { mode: 'end', minPages: 2, fontScale: 'auto' } };
  doc.fillers = { enabled: true, minGap: 0.8, margin: 0.15, byKind: { intro: { type: 'shapes', params: { set: 'burst', count: 22, speed: 1.1, opacity: 0.5 } } }, longGap: { threshold: 5, spec: { type: 'pattern', params: { mode: 'grid', count: 36, size: 1, speed: 0.4, opacity: 0.35 } } }, clips: { 'c1>c2': { type: 'shapeLayer', params: { shape: 'underline', drive: 'hold', speed: 0.25, stroke: 5 }, pinned: true } } };
  doc.markers = [{ id: 'm1', time: 4, label: 'A', color: '#ff5c8a' }];
  return doc;
}

function savedBytes() {
  return new TextDecoder().decode(disk.bytes);
}

test('save -> open keeps the project and every new feature field', async () => {
  const doc = project.migrate(fixture()).project;
  store.load(doc);
  const result = await io.save(store.state.project);
  assert.equal(result.canceled, false);
  assert.ok(disk && disk.bytes, 'saveFile received bytes');
  assert.equal(store.isDirty(), false, 'save marks the project clean');

  const opened = await io.open();
  assert.equal(opened.canceled, false);
  assert.deepEqual(store.state.project, project.migrate(JSON.parse(savedBytes())).project);
  assert.equal(store.isDirty(), false, 'open leaves the project clean');
  assert.equal(store.canUndo(), false, 'open resets the undo history');
});

test('new feature data survives the round trip unchanged', async () => {
  const doc = project.migrate(fixture()).project;
  store.load(doc);
  await io.save(store.state.project);
  await io.open();
  const loaded = store.state.project;
  assert.deepEqual(loaded.fontSet, doc.fontSet);
  assert.deepEqual(loaded.media.fonts, doc.media.fonts);
  assert.equal(fontset.isActive(loaded.fontSet), true);
  assert.equal(fontset.resolveId(loaded.fontSet, 'NoSuchFont'), 'user:0123456789abcdef');
  assert.equal(loaded.styleMode.axes.weird, 0.83);
  assert.deepEqual(loaded.styleMode.keywords, doc.styleMode.keywords);
  assert.ok(keywords.listFor(loaded.styleMode).words.includes('検証'));
  assert.ok(!keywords.listFor(loaded.styleMode).words.map((word) => word.toLowerCase()).includes('hello'));
  assert.equal(loaded.style.text.fit, 'fill');
  assert.equal(loaded.beats.c1[0].fit, 'fill');
  assert.equal(loaded.beats.c1[0].fontScale, 1.82);
  assert.equal(loaded.beats.c1[0].bleed, true);
  const shape = loaded.clips.find((clip) => clip.id === 'clip_shape');
  assert.deepEqual(shape, doc.clips.find((clip) => clip.id === 'clip_shape'));
  assert.equal(shape.spec.params.pathOp, 'zigzag');
  assert.equal(shape.spec.params.dashOn, 0.08);
  assert.deepEqual(loaded.style.palette, doc.style.palette);
  assert.deepEqual(loaded.cueStyles.c1.palette, doc.cueStyles.c1.palette);
  assert.deepEqual(loaded.beatStyles['c1:page0'].palette, doc.beatStyles['c1:page0'].palette);
  // the v3 migration split the old single group: the rounded shape is an
  // ornament now, geometry kept, and the root carries no background at all
  assert.equal(loaded.style.ornShape.type, 'rounded');
  assert.equal(loaded.style.ornShape.params.width, 1.2);
  assert.equal(loaded.style.ornShape.params.opacity, 0.85);
  assert.equal(loaded.style.bgShape, undefined);
  assert.equal(loaded.style.ornFill.type, 'solid');
  assert.equal(loaded.style.ornMotion.type, 'pop');
  assert.equal(loaded.version, 4);
  assert.deepEqual(loaded.style.repeat, doc.style.repeat);
  assert.deepEqual(loaded.style.clones, doc.style.clones);
  assert.deepEqual(loaded.layers, doc.layers);
  assert.deepEqual(loaded.fillers, doc.fillers);
  assert.deepEqual(loaded.markers, doc.markers);
});

test('autosave -> loadAutosave keeps the new feature fields', async () => {
  const doc = project.migrate(fixture()).project;
  store.load(doc);
  await io.saveAutosave(store.state.project);
  assert.ok(autosave, 'autosave was written');
  const restored = await io.loadAutosave();
  assert.deepEqual(restored, project.migrate(autosave).project);
  assert.deepEqual(restored.fontSet, doc.fontSet);
  assert.deepEqual(restored.style.text, doc.style.text);
  assert.equal(restored.styleMode.axes.weird, 0.83);
});

test('a project from a newer version is rejected and the loaded project is kept', async () => {
  const doc = project.migrate(fixture()).project;
  store.load(doc);
  await io.save(store.state.project);
  const raw = JSON.parse(savedBytes());
  raw.version = project.VERSION + 1;
  raw.meta.title = 'From the future';
  const bytes = new TextEncoder().encode(JSON.stringify(raw));
  disk = { name: 'future.telopmotion.json', bytes };
  await assert.rejects(() => io.open(), (error) => error.code === 'newer-version');
  assert.equal(store.state.project.meta.title, doc.meta.title, 'the previous project stays loaded');
});

test('migration is a fixed point for a fully defaulted project', () => {
  const once = project.migrate(fixture()).project;
  const twice = project.migrate(JSON.parse(JSON.stringify(once))).project;
  assert.deepEqual(twice, once);
});

test('save names the file after the sanitized title', async () => {
  const doc = project.migrate(fixture()).project;
  doc.meta.title = 'My Demo!';
  store.load(doc);
  await io.save(store.state.project);
  assert.equal(io.fileName(doc), 'My-Demo.telopmotion.json');
});
