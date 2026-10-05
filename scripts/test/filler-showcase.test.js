'use strict';

// The filler showcase: every filler preset must reach the generated project,
// survive the migration and keep its mid-track clip.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const fillerPresets = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-presets.js'));
const showcase = require(path.join(ROOT, 'scripts', 'filler-showcase.js'));

let cached = null;
function built() {
  if (!cached) cached = showcase.buildShowcase();
  return cached;
}

function outPath() {
  return path.join(ROOT, 'renderer', 'data', 'filler-showcase.json');
}

function mdPath() {
  return path.join(ROOT, 'demo', 'filler-showcase.md');
}

function midClips(doc) {
  return (doc.clips || []).filter((clip) => clip && clip.trackId === 'mid');
}

test('the generated showcase migrates and keeps every cue and filler clip', () => {
  const b = built();
  const migrated = project.migrate(JSON.parse(JSON.stringify(b.project)));
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.project.script.cues.length, b.entries.length);
  assert.equal(midClips(migrated.project).length, b.entries.length);
  assert.deepEqual(
    b.sections.map((section) => section.id),
    fillerPresets.groups()
  );
  assert.equal(b.sections.length, 9);
  assert.equal(b.entries.length, 131);
  assert.equal(b.total, 131 * showcase.FILLER_SECONDS);
});

test('every filler preset gets its own cue with a mid clip of the same span', () => {
  const b = built();
  const cueById = new Map(b.project.script.cues.map((cue) => [cue.id, cue]));
  const clipById = new Map((b.project.clips || []).map((clip) => [clip.id, clip]));
  for (const entry of b.entries) {
    const cue = cueById.get(entry.cueId);
    assert.ok(cue, `cue ${entry.cueId} missing`);
    assert.equal(cue.end - cue.start, showcase.FILLER_SECONDS, `${entry.cueId} span`);
    assert.equal(cue.text, showcase.cueText(entry.index, entry.value), `${entry.cueId} text`);
    assert.equal(cue.meta.kind, 'filler-showcase');
    assert.equal(cue.meta.section, entry.section);
    assert.equal(cue.meta.value, entry.value);
    const clip = clipById.get(`clip_${entry.cueId}`);
    assert.ok(clip, `clip for ${entry.cueId} missing`);
    assert.equal(clip.trackId, 'mid');
    assert.equal(clip.start, cue.start, `${entry.cueId} clip start`);
    assert.equal(clip.end, cue.end, `${entry.cueId} clip end`);
    assert.deepEqual(clip.spec, entry.spec, `${entry.cueId} clip spec`);
    const preset = fillerPresets.get(entry.value);
    assert.ok(preset, `filler preset ${entry.value} missing`);
    assert.equal(entry.spec.type, preset.spec.type, `${entry.cueId} spec type`);
    assert.equal(clip.spec.type, preset.spec.type, `${entry.cueId} clip spec type`);
  }
  // one dark plate sits behind the whole walk so every preset reads the same
  const plate = (b.project.clips || []).find((clip) => clip && clip.id === 'clip_filler_plate');
  assert.ok(plate, 'the showcase needs its background plate');
  assert.equal(plate.trackId, 'bg');
  assert.equal(plate.start, 0);
  assert.equal(plate.end, b.total);
});

test('every section opens a marker and is listed once', () => {
  const b = built();
  assert.equal(b.markers.length, b.sections.length);
  assert.deepEqual(
    b.markers.map((marker) => marker.label),
    b.sections.map((section) => section.label)
  );
  let lastT = -Infinity;
  for (const marker of b.markers) {
    assert.ok(marker.t >= lastT, `marker ${marker.label} out of order`);
    lastT = marker.t;
  }
});

test('the built showcase matches the committed files (deterministic build)', () => {
  const b = built();
  assert.equal(fs.readFileSync(outPath(), 'utf8'), showcase.serialize(b.project));
  assert.equal(fs.readFileSync(mdPath(), 'utf8'), showcase.indexMarkdown(b));
});

test('the Help menu offers the filler showcase in all five languages', () => {
  const menu = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'menu.js'), 'utf8');
  assert.match(menu, /key: 'studio\.help\.fillerShowcase', action: 'fillerShowcase'/);
  const app = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'app.js'), 'utf8');
  assert.match(app, /fillerShowcase: fillerShowcaseProject/);
  assert.match(app, /readAsset\('data\/filler-showcase\.json'\)/);

  globalThis.window = globalThis;
  globalThis.SA = globalThis.SA || {};
  require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
  const i18n = globalThis.SA.i18n;
  for (const code of ['en', 'ja', 'es', 'fr', 'ru']) {
    i18n.set(code);
    const label = i18n.t('studio.help.fillerShowcase');
    assert.ok(typeof label === 'string' && label.trim().length > 0, `${code} label`);
    assert.notEqual(label, 'studio.help.fillerShowcase', `${code} label is missing`);
  }
});
