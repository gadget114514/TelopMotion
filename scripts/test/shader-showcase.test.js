'use strict';

// The shader showcase: the five shader-break families in all three phases,
// one phase per cue. Every cue must survive the migration and keep its label,
// section and style.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const showcase = require(path.join(ROOT, 'scripts', 'shader-showcase.js'));

let cached = null;
function built() {
  if (!cached) cached = showcase.buildShowcase();
  return cached;
}

function outPath() {
  return path.join(ROOT, 'renderer', 'data', 'shader-showcase.json');
}

function mdPath() {
  return path.join(ROOT, 'demo', 'shader-showcase.md');
}

test('the generated showcase migrates and keeps every cue', () => {
  const b = built();
  const migrated = project.migrate(JSON.parse(JSON.stringify(b.project)));
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.project.script.cues.length, b.entries.length);
  for (const type of showcase.FAMILIES) {
    assert.equal(b.entries.filter((entry) => entry.section === type).length, 3, `${type} cues`);
  }
  assert.equal(b.entries.length, showcase.FAMILIES.length * 3);
});

test('every cue carries its label, phase and style', () => {
  const b = built();
  const cueById = new Map(b.project.script.cues.map((cue) => [cue.id, cue]));
  for (const entry of b.entries) {
    const cue = cueById.get(entry.cueId);
    assert.ok(cue, `cue ${entry.cueId} missing`);
    assert.equal(cue.end - cue.start, showcase.CUE_SECONDS, `${entry.cueId} span`);
    assert.ok(String(cue.text).includes(entry.value), `${entry.cueId} label must name ${entry.value}`);
    assert.equal(cue.meta.kind, 'shader-showcase');
    assert.equal(cue.meta.section, entry.section);
    assert.equal(cue.meta.phase, entry.phase);
    assert.equal(cue.meta.type, entry.type);
    const style = b.project.cueStyles[entry.cueId];
    assert.ok(style, `cue ${entry.cueId} style missing`);
    if (entry.phase === 'enter') assert.equal(style.enter && style.enter.type, entry.type, `${entry.cueId} enter`);
    if (entry.phase === 'exit') assert.equal(style.exit && style.exit.type, entry.type, `${entry.cueId} exit`);
    if (entry.phase === 'hold') {
      assert.ok(Array.isArray(style.hold) && style.hold.length === 1, `${entry.cueId} hold`);
      assert.equal(style.hold[0].type, entry.type, `${entry.cueId} hold type`);
    }
  }
});

test('every section opens a marker and is listed once', () => {
  const b = built();
  assert.equal(b.markers.length, b.sections.length);
  assert.deepEqual(
    b.markers.map((marker) => marker.label),
    b.sections.map((section) => section.label)
  );
});

test('the --sections filter keeps only the named sections', () => {
  const b = showcase.buildShowcase({ sections: ['windBreak'] });
  assert.equal(b.entries.length, 3);
  for (const entry of b.entries) assert.equal(entry.section, 'windBreak');
  assert.equal(b.markers.length, 1);
});

test('the built showcase matches the committed files (deterministic build)', () => {
  const b = built();
  assert.equal(fs.readFileSync(outPath(), 'utf8'), showcase.serialize(b.project));
  assert.equal(fs.readFileSync(mdPath(), 'utf8'), showcase.indexMarkdown(b));
});

test('the Help menu offers the shader showcase in all five languages', () => {
  const menu = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'menu.js'), 'utf8');
  assert.match(menu, /key: 'studio\.help\.shaderShowcase', action: 'shaderShowcase'/);
  const app = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'app.js'), 'utf8');
  assert.match(app, /shaderShowcase: shaderShowcaseProject/);
  assert.match(app, /openShowcaseAsset\('data\/shader-showcase\.json'\)/);

  globalThis.window = globalThis;
  globalThis.SA = globalThis.SA || {};
  require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
  const i18n = globalThis.SA.i18n;
  for (const code of ['en', 'ja', 'es', 'fr', 'ru']) {
    i18n.set(code);
    const label = i18n.t('studio.help.shaderShowcase');
    assert.ok(typeof label === 'string' && label.trim().length > 0, `${code} label`);
    assert.notEqual(label, 'studio.help.shaderShowcase', `${code} label is missing`);
  }
});
