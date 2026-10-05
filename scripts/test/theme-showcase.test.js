'use strict';

// The theme showcase: every theme preset must reach the generated project,
// survive the migration and keep its pinned cue style.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const showcase = require(path.join(ROOT, 'scripts', 'theme-showcase.js'));

let cached = null;
function built() {
  if (!cached) cached = showcase.buildShowcase();
  return cached;
}

function outPath() {
  return path.join(ROOT, 'renderer', 'data', 'theme-showcase.json');
}

function mdPath() {
  return path.join(ROOT, 'demo', 'theme-showcase.md');
}

test('the generated showcase migrates and keeps every cue', () => {
  const b = built();
  const migrated = project.migrate(JSON.parse(JSON.stringify(b.project)));
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.project.script.cues.length, b.entries.length);
  assert.equal(Object.keys(migrated.project.cueStyles || {}).length, b.entries.length);
  const bySection = (id) => b.entries.filter((entry) => entry.section === id).length;
  assert.equal(bySection('standard'), 14);
  assert.equal(bySection('background'), 7);
  assert.equal(bySection('genre'), 7);
  assert.equal(bySection('pro'), 25);
  assert.equal(b.entries.length, 53);
  assert.equal(b.total, 53 * showcase.THEME_SECONDS);
});

test('every theme preset gets its own cue with a pinned style', () => {
  const b = built();
  assert.deepEqual(
    b.sections.map((section) => section.id),
    ['standard', 'background', 'genre', 'pro']
  );
  const cueById = new Map(b.project.script.cues.map((cue) => [cue.id, cue]));
  for (const entry of b.entries) {
    const cue = cueById.get(entry.cueId);
    assert.ok(cue, `cue ${entry.cueId} missing`);
    assert.equal(cue.end - cue.start, showcase.THEME_SECONDS, `${entry.cueId} span`);
    assert.equal(
      cue.text,
      `${entry.index}. ${entry.value}\nあいうえお カキクケコ 愛永漢字 Aiueo 0123`,
      `${entry.cueId} text`
    );
    assert.equal(cue.meta.kind, 'theme-showcase');
    assert.equal(cue.meta.section, entry.section);
    assert.equal(cue.meta.value, entry.value);
    const container = b.project.cueStyles[entry.cueId];
    assert.ok(container, `cue ${entry.cueId} has no pinned style`);
    assert.deepEqual(container, entry.style, `cue ${entry.cueId} style`);
  }
});

test('every section opens a marker and is listed once', () => {
  const b = built();
  assert.equal(b.sections.length, 4);
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

test('the Help menu offers the theme showcase in all five languages', () => {
  const menu = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'menu.js'), 'utf8');
  assert.match(menu, /key: 'studio\.help\.themeShowcase', action: 'themeShowcase'/);
  const app = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'app.js'), 'utf8');
  assert.match(app, /themeShowcase: themeShowcaseProject/);
  assert.match(app, /readAsset\('data\/theme-showcase\.json'\)/);

  globalThis.window = globalThis;
  globalThis.SA = globalThis.SA || {};
  require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
  const i18n = globalThis.SA.i18n;
  for (const code of ['en', 'ja', 'es', 'fr', 'ru']) {
    i18n.set(code);
    const label = i18n.t('studio.help.themeShowcase');
    assert.ok(typeof label === 'string' && label.trim().length > 0, `${code} label`);
    assert.notEqual(label, 'studio.help.themeShowcase', `${code} label is missing`);
  }
});
