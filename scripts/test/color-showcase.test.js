'use strict';

// The color showcase: every split scheme, mood palette and wire pattern must
// reach the generated project, survive the migration and keep its cue clip or
// style.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const showcase = require(path.join(ROOT, 'scripts', 'color-showcase.js'));

let cached = null;
function built() {
  if (!cached) cached = showcase.buildShowcase();
  return cached;
}

function outPath() {
  return path.join(ROOT, 'renderer', 'data', 'color-showcase.json');
}

function mdPath() {
  return path.join(ROOT, 'demo', 'color-showcase.md');
}

function midClip(doc, cueId) {
  return (doc.clips || []).find((clip) => clip.id === `clip_${cueId}` && clip.trackId === 'mid');
}

test('the generated showcase migrates and keeps every cue', () => {
  const b = built();
  const migrated = project.migrate(JSON.parse(JSON.stringify(b.project)));
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.project.script.cues.length, b.entries.length);
  assert.equal(b.entries.filter((entry) => entry.section === 'scheme').length, showcase.SCHEME_IDS.length);
  assert.equal(b.entries.filter((entry) => entry.section === 'scheme').length, 6);
  assert.equal(b.entries.filter((entry) => entry.section === 'palette').length, showcase.PALETTE_FAMILIES.length);
  assert.equal(b.entries.filter((entry) => entry.section === 'palette').length, 14);
  assert.equal(b.entries.filter((entry) => entry.section === 'pattern').length, showcase.PATTERNS.length);
  assert.equal(b.entries.filter((entry) => entry.section === 'pattern').length, 20);
  assert.equal(b.entries.length, 40);
  // scheme + palette cues each own one mid clip; pattern cues own a cueStyle
  // instead
  const midWanted = 6 + 14;
  const midClips = (migrated.project.clips || []).filter((clip) => clip.trackId === 'mid');
  assert.equal(midClips.length, midWanted);
  assert.equal(Object.keys(migrated.project.cueStyles || {}).length, 20);
});

test('every scheme cue carries its own split clip', () => {
  const b = built();
  const used = b.entries.filter((entry) => entry.section === 'scheme').map((entry) => entry.value);
  assert.deepEqual(used, showcase.SCHEME_IDS);
  for (const entry of b.entries.filter((entry) => entry.section === 'scheme')) {
    const clip = midClip(b.project, entry.cueId);
    assert.ok(clip, `cue ${entry.cueId} has no mid clip`);
    assert.equal(clip.spec.type, 'split', `cue ${entry.cueId} clip type`);
    assert.equal(clip.spec.params.scheme, entry.value, `cue ${entry.cueId} scheme`);
    assert.equal(clip.start, entry.start, `cue ${entry.cueId} clip start`);
    assert.equal(clip.end, entry.end, `cue ${entry.cueId} clip end`);
  }
});

test('every palette cue carries its own mid split clip', () => {
  const b = built();
  const used = b.entries.filter((entry) => entry.section === 'palette').map((entry) => entry.value);
  assert.deepEqual(used, showcase.PALETTE_FAMILIES);
  for (const entry of b.entries.filter((entry) => entry.section === 'palette')) {
    const clip = midClip(b.project, entry.cueId);
    assert.ok(clip, `cue ${entry.cueId} has no mid clip`);
    assert.equal(clip.spec.type, 'split', `cue ${entry.cueId} clip type`);
    assert.equal(clip.start, entry.start, `cue ${entry.cueId} clip start`);
    assert.equal(clip.end, entry.end, `cue ${entry.cueId} clip end`);
  }
});

test('every pattern cue carries its own outline pattern', () => {
  const b = built();
  const used = b.entries.filter((entry) => entry.section === 'pattern').map((entry) => entry.value);
  assert.deepEqual(used, showcase.PATTERNS);
  for (const entry of b.entries.filter((entry) => entry.section === 'pattern')) {
    const container = b.project.cueStyles[entry.cueId];
    assert.ok(container && Array.isArray(container.edge), `cue ${entry.cueId} has no edge stack`);
    const edge = container.edge[0];
    assert.equal(edge && edge.type, 'outline', `cue ${entry.cueId} edge type`);
    assert.equal(edge.params && edge.params.pattern, entry.value, `cue ${entry.cueId} pattern`);
  }
});

test('every cue carries a label and the showcase meta', () => {
  const b = built();
  const cueById = new Map(b.project.script.cues.map((cue) => [cue.id, cue]));
  for (const entry of b.entries) {
    const cue = cueById.get(entry.cueId);
    assert.ok(cue, `cue ${entry.cueId} missing`);
    assert.ok(String(cue.text).includes(entry.value), `${entry.cueId} label must name ${entry.value}`);
    assert.equal(cue.meta.kind, 'color-showcase');
    assert.equal(cue.meta.section, entry.section);
    assert.equal(cue.meta.value, entry.value);
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
  const b = showcase.buildShowcase({ sections: ['pattern'] });
  assert.equal(b.entries.length, showcase.PATTERNS.length);
  for (const entry of b.entries) assert.equal(entry.section, 'pattern');
  assert.equal(b.markers.length, 1);
});

test('the built showcase matches the committed files (deterministic build)', () => {
  const b = built();
  assert.equal(fs.readFileSync(outPath(), 'utf8'), showcase.serialize(b.project));
  assert.equal(fs.readFileSync(mdPath(), 'utf8'), showcase.indexMarkdown(b));
});

test('the Help menu offers the color showcase in all five languages', () => {
  const menu = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'menu.js'), 'utf8');
  assert.match(menu, /key: 'studio\.help\.colorShowcase', action: 'colorShowcase'/);
  const app = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'app.js'), 'utf8');
  assert.match(app, /colorShowcase: colorShowcaseProject/);
  assert.match(app, /readAsset\('data\/color-showcase\.json'\)/);

  globalThis.window = globalThis;
  globalThis.SA = globalThis.SA || {};
  require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
  const i18n = globalThis.SA.i18n;
  for (const code of ['en', 'ja', 'es', 'fr', 'ru']) {
    i18n.set(code);
    const label = i18n.t('studio.help.colorShowcase');
    assert.ok(typeof label === 'string' && label.trim().length > 0, `${code} label`);
    assert.notEqual(label, 'studio.help.colorShowcase', `${code} label is missing`);
  }
});
