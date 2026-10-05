'use strict';

// The letter-fx showcase: split-tone fills, per-letter strikes and per-letter
// shifts, one effect per cue. Every cue must survive the migration and keep
// its label, section and style.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const showcase = require(path.join(ROOT, 'scripts', 'letter-fx-showcase.js'));

let cached = null;
function built() {
  if (!cached) cached = showcase.buildShowcase();
  return cached;
}

function outPath() {
  return path.join(ROOT, 'renderer', 'data', 'letter-fx-showcase.json');
}

function mdPath() {
  return path.join(ROOT, 'demo', 'letter-fx-showcase.md');
}

test('the generated showcase migrates and keeps every cue', () => {
  const b = built();
  const migrated = project.migrate(JSON.parse(JSON.stringify(b.project)));
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.project.script.cues.length, b.entries.length);
  assert.equal(b.entries.filter((entry) => entry.section === 'split').length, 6);
  assert.equal(b.entries.filter((entry) => entry.section === 'strike').length, 8);
  assert.equal(b.entries.filter((entry) => entry.section === 'shift').length, 6);
  assert.equal(b.entries.filter((entry) => entry.section === 'combo').length, 1);
  assert.equal(b.entries.length, 21);
});

test('every cue carries its label, section and style', () => {
  const b = built();
  const cueById = new Map(b.project.script.cues.map((cue) => [cue.id, cue]));
  for (const entry of b.entries) {
    const cue = cueById.get(entry.cueId);
    assert.ok(cue, `cue ${entry.cueId} missing`);
    assert.equal(cue.end - cue.start, showcase.CUE_SECONDS, `${entry.cueId} span`);
    assert.ok(String(cue.text).includes(entry.value), `${entry.cueId} label must name ${entry.value}`);
    assert.equal(cue.meta.kind, 'letter-fx-showcase');
    assert.equal(cue.meta.section, entry.section);
    assert.equal(cue.meta.value, entry.value);
    const style = b.project.cueStyles[entry.cueId];
    assert.ok(style, `cue ${entry.cueId} style missing`);
    if (entry.section === 'split') assert.equal(style.fill && style.fill.type, 'splitTone');
    if (entry.section === 'strike') assert.ok(style.strike && style.strike.type, `${entry.cueId} strike missing`);
    if (entry.section === 'shift') {
      assert.ok(Array.isArray(style.clones) && style.clones.length === 1, `${entry.cueId} clone missing`);
      assert.ok(style.clones[0].perLetter && style.clones[0].perLetter.enabled !== false, `${entry.cueId} perLetter missing`);
    }
    if (entry.section === 'combo') {
      assert.equal(style.fill && style.fill.type, 'splitTone');
      assert.ok(style.strike && style.strike.type);
      assert.ok(style.clones && style.clones[0] && style.clones[0].perLetter);
    }
  }
});

test('the shift cues use bundled fonts for the font cycle', () => {
  const b = built();
  const entry = b.entries.find((item) => item.value === 'font');
  assert.ok(entry, 'font cue missing');
  const fonts = b.project.cueStyles[entry.cueId].clones[0].perLetter.fonts;
  assert.ok(Array.isArray(fonts) && fonts.length >= 2, 'font cycle needs typefaces');
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
  const b = showcase.buildShowcase({ sections: ['strike'] });
  assert.equal(b.entries.length, 8);
  for (const entry of b.entries) assert.equal(entry.section, 'strike');
  assert.equal(b.markers.length, 1);
});

test('the built showcase matches the committed files (deterministic build)', () => {
  const b = built();
  assert.equal(fs.readFileSync(outPath(), 'utf8'), showcase.serialize(b.project));
  assert.equal(fs.readFileSync(mdPath(), 'utf8'), showcase.indexMarkdown(b));
});

test('the Help menu offers the letter-fx showcase in all five languages', () => {
  const menu = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'menu.js'), 'utf8');
  assert.match(menu, /key: 'studio\.help\.letterFxShowcase', action: 'letterFxShowcase'/);
  const app = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'app.js'), 'utf8');
  assert.match(app, /letterFxShowcase: letterFxShowcaseProject/);
  assert.match(app, /openShowcaseAsset\('data\/letter-fx-showcase\.json'\)/);

  globalThis.window = globalThis;
  globalThis.SA = globalThis.SA || {};
  require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
  const i18n = globalThis.SA.i18n;
  for (const code of ['en', 'ja', 'es', 'fr', 'ru']) {
    i18n.set(code);
    const label = i18n.t('studio.help.letterFxShowcase');
    assert.ok(typeof label === 'string' && label.trim().length > 0, `${code} label`);
    assert.notEqual(label, 'studio.help.letterFxShowcase', `${code} label is missing`);
  }
});
