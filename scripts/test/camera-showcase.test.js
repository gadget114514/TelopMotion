'use strict';

// The camera showcase: every camera move must reach the generated project,
// survive the migration and keep its cue post.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const showcase = require(path.join(ROOT, 'scripts', 'camera-showcase.js'));
// camera.js registers on the effects registry at require time, so the
// registry must load first (same order as scripts/camera-showcase.js).
require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'registry.js'));
const camera = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'camera.js'));

let cached = null;
function built() {
  if (!cached) cached = showcase.buildShowcase();
  return cached;
}

function outPath() {
  return path.join(ROOT, 'renderer', 'data', 'camera-showcase.json');
}

function mdPath() {
  return path.join(ROOT, 'demo', 'camera-showcase.md');
}

test('the generated showcase migrates and keeps every cue', () => {
  const b = built();
  const migrated = project.migrate(JSON.parse(JSON.stringify(b.project)));
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.project.script.cues.length, b.entries.length);
  assert.equal(b.entries.length, showcase.MOVES.length);
  assert.equal(b.entries.length, 10);
  assert.deepEqual(showcase.MOVES, [
    'pushIn', 'pullOut', 'panLeft', 'panRight', 'panUp', 'panDown',
    'tilt', 'zoomPunch', 'handheld', 'orbit',
  ]);
});

test('the walk covers the camera module moves exactly', () => {
  assert.deepEqual(showcase.MOVES, camera.MOVES);
  const b = built();
  assert.deepEqual(
    b.entries.map((entry) => entry.value).sort(),
    camera.MOVES.slice().sort(),
    'the walk must cover every camera.js MOVES entry'
  );
});

test('every camera move gets its own cue with a pinned post', () => {
  const b = built();
  const cueById = new Map(b.project.script.cues.map((cue) => [cue.id, cue]));
  for (const entry of b.entries) {
    const cue = cueById.get(entry.cueId);
    assert.ok(cue, `cue ${entry.cueId} missing`);
    assert.equal(cue.end - cue.start, showcase.CAMERA_SECONDS, `${entry.cueId} span`);
    assert.ok(String(cue.text).includes(entry.value), `${entry.cueId} label must name ${entry.value}`);
    assert.equal(cue.meta.kind, 'camera-showcase');
    assert.equal(cue.meta.section, entry.section);
    assert.equal(cue.meta.value, entry.value);
    const container = b.project.cueStyles[entry.cueId];
    assert.ok(container && Array.isArray(container.post), `cue ${entry.cueId} has no post stack`);
    const post = container.post[0];
    assert.equal(post && post.type, 'camera', `cue ${entry.cueId} post type`);
    assert.equal(post.params && post.params.move, entry.value, `cue ${entry.cueId} move`);
  }
});

test('every section opens a marker and is listed once', () => {
  const b = built();
  assert.equal(b.markers.length, b.sections.length);
  assert.equal(b.sections.length, 3);
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

test('the --sections filter keeps only the named sections', () => {
  const b = showcase.buildShowcase({ sections: ['pan'] });
  assert.equal(b.entries.length, showcase.SECTION_MOVES.pan.length);
  for (const entry of b.entries) assert.equal(entry.section, 'pan');
  assert.equal(b.markers.length, 1);
});

test('the built showcase matches the committed files (deterministic build)', () => {
  const b = built();
  assert.equal(fs.readFileSync(outPath(), 'utf8'), showcase.serialize(b.project));
  assert.equal(fs.readFileSync(mdPath(), 'utf8'), showcase.indexMarkdown(b));
});

test('the Help menu offers the camera showcase in all five languages', () => {
  const menu = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'menu.js'), 'utf8');
  assert.match(menu, /key: 'studio\.help\.cameraShowcase', action: 'cameraShowcase'/);
  const app = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'app.js'), 'utf8');
  assert.match(app, /cameraShowcase: cameraShowcaseProject/);
  assert.match(app, /openShowcaseAsset\('data\/camera-showcase\.json'\)/);

  globalThis.window = globalThis;
  globalThis.SA = globalThis.SA || {};
  require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
  const i18n = globalThis.SA.i18n;
  for (const code of ['en', 'ja', 'es', 'fr', 'ru']) {
    i18n.set(code);
    const label = i18n.t('studio.help.cameraShowcase');
    assert.ok(typeof label === 'string' && label.trim().length > 0, `${code} label`);
    assert.notEqual(label, 'studio.help.cameraShowcase', `${code} label is missing`);
  }
});
