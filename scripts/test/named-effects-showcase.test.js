'use strict';

// The named effects showcase: every named effect (120 entries) from motion-prompt
// must reach the generated project, survive the migration and keep its style.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const showcase = require(path.join(ROOT, 'scripts', 'named-effects-showcase.js'));

let cached = null;
function built() {
  if (!cached) cached = showcase.buildShowcase();
  return cached;
}

function outPath() {
  return path.join(ROOT, 'renderer', 'data', 'named-effects-showcase.json');
}

function mdPath() {
  return path.join(ROOT, 'demo', 'named-effects-showcase.md');
}

test('the generated showcase migrates and keeps every cue', () => {
  const b = built();
  const migrated = project.migrate(JSON.parse(JSON.stringify(b.project)));
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.project.script.cues.length, b.entries.length);
  assert.equal(Object.keys(migrated.project.cueStyles || {}).length, b.entries.length);
  const byPack = (id) => b.entries.filter((entry) => entry.pack === id).length;
  assert.equal(byPack('motion'), 24);
  assert.equal(byPack('camera'), 24);
  assert.equal(byPack('ui'), 24);
  assert.equal(byPack('lp'), 24);
  assert.equal(byPack('photo'), 24);
  assert.equal(b.entries.length, 120);
  assert.equal(b.total, 120 * showcase.SHOWCASE_SECONDS);
});

test('every named effect gets its own cue with applied recipe style', () => {
  const b = built();
  assert.deepEqual(
    b.packs.map((pack) => pack.id),
    ['motion', 'camera', 'ui', 'lp', 'photo']
  );
  const cueById = new Map(b.project.script.cues.map((cue) => [cue.id, cue]));
  for (const entry of b.entries) {
    const cue = cueById.get(entry.cueId);
    assert.ok(cue, `cue ${entry.cueId} missing`);
    assert.equal(cue.end - cue.start, showcase.SHOWCASE_SECONDS, `${entry.cueId} span`);
    assert.equal(
      cue.text,
      `${entry.index}. #${entry.id} ${entry.name.ja} (${entry.name.en})\nあいうえお カキクケコ 愛永漢字 Aiueo 0123`,
      `${entry.cueId} text`
    );
    assert.equal(cue.meta.kind, 'named-effects-showcase');
    assert.equal(cue.meta.pack, entry.pack);
    assert.equal(cue.meta.id, entry.id);
    const container = b.project.cueStyles[entry.cueId];
    assert.ok(container, `cue ${entry.cueId} has no style`);
    assert.deepEqual(container, entry.style, `cue ${entry.cueId} style`);
    assert.ok(container.namedEffect, `cue ${entry.cueId} missing namedEffect metadata`);
    assert.equal(container.namedEffect.id, entry.id);
  }
});

test('every pack opens a marker and is listed once', () => {
  const b = built();
  assert.equal(b.packs.length, 5);
  assert.equal(b.markers.length, b.packs.length);
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

test('the Help menu offers the named effects showcase in all five languages', () => {
  const menu = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'menu.js'), 'utf8');
  assert.match(menu, /key: 'studio\.help\.namedEffectsShowcase', action: 'namedEffectsShowcase'/);
  const app = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'app.js'), 'utf8');
  assert.match(app, /namedEffectsShowcase: namedEffectsShowcaseProject/);
  assert.match(app, /openShowcaseAsset\('data\/named-effects-showcase\.json'\)/);

  globalThis.window = globalThis;
  globalThis.SA = globalThis.SA || {};
  require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
  const i18n = globalThis.SA.i18n;
  for (const code of ['en', 'ja', 'es', 'fr', 'ru']) {
    i18n.set(code);
    const label = i18n.t('studio.help.namedEffectsShowcase');
    assert.ok(typeof label === 'string' && label.trim().length > 0, `${code} label`);
    assert.notEqual(label, 'studio.help.namedEffectsShowcase', `${code} label is missing`);
  }
});
