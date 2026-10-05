'use strict';

// The font showcase: every bundled typeface must reach the generated project,
// survive the migration and keep its cue style.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const showcase = require(path.join(ROOT, 'scripts', 'font-showcase.js'));

let cached = null;
function built() {
  if (!cached) cached = showcase.buildShowcase();
  return cached;
}

function outPath() {
  return path.join(ROOT, 'renderer', 'data', 'font-showcase.json');
}

function mdPath() {
  return path.join(ROOT, 'demo', 'font-showcase.md');
}

// BUILTINS lives in a browser-only module (`window.SA`), so the test reads
// the ids back from the file text instead of requiring it.
function builtinIds() {
  const text = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'font.js'), 'utf8');
  const ids = [];
  const re = /\{\s*id:\s*'([^']+)'/g;
  let match = null;
  while ((match = re.exec(text))) {
    if (/^[A-Za-z0-9_.+-]+-Regular$|^[A-Za-z0-9_.+-]+-Bold$/.test(match[1])) ids.push(match[1]);
  }
  return [...new Set(ids)];
}

test('the generated showcase migrates and keeps every cue', () => {
  const b = built();
  const migrated = project.migrate(JSON.parse(JSON.stringify(b.project)));
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.project.script.cues.length, b.entries.length);
  assert.equal(b.entries.length, showcase.FONTS.length);
  assert.equal(b.entries.length, 11);
});

test('every bundled font gets its own cue with a pinned style', () => {
  const b = built();
  const ids = builtinIds();
  assert.deepEqual(
    b.entries.map((entry) => entry.font.id).sort(),
    ids.slice().sort(),
    'the walk must cover every BUILTINS id'
  );
  assert.deepEqual(
    showcase.FONTS.map((entry) => entry.id).sort(),
    ids.slice().sort(),
    'scripts/font-showcase.js FONTS must mirror font.js BUILTINS'
  );
  const cueById = new Map(b.project.script.cues.map((cue) => [cue.id, cue]));
  for (const entry of b.entries) {
    const cue = cueById.get(entry.cueId);
    assert.ok(cue, `cue ${entry.cueId} missing`);
    assert.equal(cue.end - cue.start, showcase.FONT_SECONDS, `${entry.cueId} span`);
    assert.ok(String(cue.text).includes(entry.font.id), `${entry.cueId} label must name ${entry.font.id}`);
    assert.ok(String(cue.text).includes(showcase.SAMPLE_LATIN), `${entry.cueId} must show the latin sample`);
    assert.ok(String(cue.text).includes(showcase.SAMPLE_JA), `${entry.cueId} must show the japanese sample`);
    assert.equal(cue.meta.kind, 'font-showcase');
    assert.equal(cue.meta.fontId, entry.font.id);
    assert.equal(cue.meta.index, entry.index);
    const container = b.project.cueStyles[entry.cueId];
    assert.ok(container && container.text, `cue ${entry.cueId} has no text style`);
    assert.equal(container.text.fontId, entry.font.id, `cue ${entry.cueId} font`);
    assert.equal(container.text.weight, entry.font.weight, `cue ${entry.cueId} weight`);
  }
});

test('every section opens a marker and is listed once', () => {
  const b = built();
  assert.equal(b.markers.length, b.sections.length);
  const labels = b.markers.map((marker) => marker.label);
  for (const section of b.sections) assert.ok(labels.includes(section.label), `marker for ${section.id}`);
  // one marker per fontClass, in walk order
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

test('the Help menu offers the font showcase in all five languages', () => {
  const menu = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'menu.js'), 'utf8');
  assert.match(menu, /key: 'studio\.help\.fontShowcase', action: 'fontShowcase'/);
  const app = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'app.js'), 'utf8');
  assert.match(app, /fontShowcase: fontShowcaseProject/);
  assert.match(app, /readAsset\('data\/font-showcase\.json'\)/);

  globalThis.window = globalThis;
  globalThis.SA = globalThis.SA || {};
  require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
  const i18n = globalThis.SA.i18n;
  for (const code of ['en', 'ja', 'es', 'fr', 'ru']) {
    i18n.set(code);
    const label = i18n.t('studio.help.fontShowcase');
    assert.ok(typeof label === 'string' && label.trim().length > 0, `${code} label`);
    assert.notEqual(label, 'studio.help.fontShowcase', `${code} label is missing`);
  }
});
