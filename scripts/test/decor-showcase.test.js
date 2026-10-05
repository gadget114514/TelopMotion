'use strict';

// The decor showcase: every ornament shape, bubble tail/body combo, hollow
// line shape, ornament motion, ornament edge and frame shape must reach the
// generated project, survive the migration and carry a label.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const showcase = require(path.join(ROOT, 'scripts', 'decor-showcase.js'));

let cached = null;
function built() {
  if (!cached) cached = showcase.buildShowcase();
  return cached;
}

function outPath() {
  return path.join(ROOT, 'renderer', 'data', 'decor-showcase.json');
}

function mdPath() {
  return path.join(ROOT, 'demo', 'decor-showcase.md');
}

test('the generated showcase migrates and keeps every cue', () => {
  const b = built();
  const migrated = project.migrate(JSON.parse(JSON.stringify(b.project)));
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.project.script.cues.length, b.entries.length);
  assert.equal(b.entries.filter((entry) => entry.section === 'orn').length, showcase.ORN_SHAPES.length);
  assert.equal(b.entries.filter((entry) => entry.section === 'bubble').length, showcase.BUBBLE_TAILS.length * showcase.BUBBLE_BODIES.length);
  assert.equal(b.entries.filter((entry) => entry.section === 'line').length, showcase.LINE_SHAPES.length);
  assert.equal(b.entries.filter((entry) => entry.section === 'motion').length, showcase.ORN_MOTIONS.length);
  assert.equal(b.entries.filter((entry) => entry.section === 'edge').length, showcase.EDGE_TYPES.length);
  assert.equal(b.entries.filter((entry) => entry.section === 'frame').length, showcase.FRAME_SHAPES.length);
  assert.equal(b.entries.filter((entry) => entry.section === 'page').length, showcase.PAGE_TYPES.length);
  assert.equal(b.entries.length, 85);
});

test('the ornament walk covers the signboards and the bubble', () => {
  const b = built();
  const values = b.entries.filter((entry) => entry.section === 'orn').map((entry) => entry.value);
  assert.deepEqual(values, showcase.ORN_SHAPES);
  for (const type of ['plate', 'oval', 'bubble']) {
    assert.ok(values.includes(type), `${type} is missing from the ornament walk`);
  }
});

test('the bubble matrix covers every tail side and every body', () => {
  const b = built();
  const rows = b.entries.filter((entry) => entry.section === 'bubble');
  const combos = rows.map((entry) => entry.value).sort();
  const expected = [];
  for (const tail of showcase.BUBBLE_TAILS) {
    for (const body of showcase.BUBBLE_BODIES) expected.push(`bubble/${tail}/${body}`);
  }
  assert.deepEqual(combos, expected.sort());
  const doc = b.project;
  for (const entry of rows) {
    const style = doc.cueStyles[entry.cueId];
    assert.ok(style && style.ornShape, `cue ${entry.cueId} has no ornament`);
    assert.equal(style.ornShape.type, 'bubble', `cue ${entry.cueId} type`);
    const [, tail, body] = entry.value.split('/');
    assert.equal(style.ornShape.params.tail, tail, `cue ${entry.cueId} tail`);
    assert.equal(style.ornShape.params.body, body, `cue ${entry.cueId} body`);
  }
});

test('the line walk is hollow: no fill, only the stroke', () => {
  const b = built();
  const doc = b.project;
  for (const entry of b.entries.filter((entry) => entry.section === 'line')) {
    const style = doc.cueStyles[entry.cueId];
    assert.ok(style && style.ornShape, `cue ${entry.cueId} has no ornament`);
    assert.equal(style.ornShape.params.fill, 0, `cue ${entry.cueId} is filled`);
    assert.ok(style.ornShape.params.stroke > 0, `cue ${entry.cueId} has no stroke`);
  }
  // the filled walk next to it really is filled
  for (const entry of b.entries.filter((entry) => entry.section === 'orn')) {
    const style = doc.cueStyles[entry.cueId];
    assert.ok(style.ornShape.params.fill == null || style.ornShape.params.fill > 0, `cue ${entry.cueId} lost its fill`);
  }
});

test('the motion walk pins the reference ornament and varies only the motion', () => {
  const b = built();
  const doc = b.project;
  const used = b.entries.filter((entry) => entry.section === 'motion').map((entry) => entry.value);
  assert.deepEqual(used, showcase.ORN_MOTIONS);
  for (const entry of b.entries.filter((entry) => entry.section === 'motion')) {
    const style = doc.cueStyles[entry.cueId];
    assert.equal(style.ornShape.type, 'rounded', `cue ${entry.cueId} shape`);
    assert.equal(style.ornMotion.type, entry.value, `cue ${entry.cueId} motion`);
  }
});

test('the edge walk pins the reference ornament and varies only the edge', () => {
  const b = built();
  const doc = b.project;
  const used = b.entries.filter((entry) => entry.section === 'edge').map((entry) => entry.value);
  assert.deepEqual(used, showcase.EDGE_TYPES);
  for (const entry of b.entries.filter((entry) => entry.section === 'edge')) {
    const style = doc.cueStyles[entry.cueId];
    assert.equal(style.ornShape.type, 'rounded', `cue ${entry.cueId} shape`);
    assert.ok(Array.isArray(style.ornEdge) && style.ornEdge.length === 1, `cue ${entry.cueId} edge`);
    assert.equal(style.ornEdge[0].type, entry.value, `cue ${entry.cueId} edge type`);
  }
});

test('the frame walk carries one shape layer per cue', () => {
  const b = built();
  const doc = b.project;
  const used = b.entries.filter((entry) => entry.section === 'frame').map((entry) => entry.value);
  assert.deepEqual(used, showcase.FRAME_SHAPES);
  for (const entry of b.entries.filter((entry) => entry.section === 'frame')) {
    const style = doc.cueStyles[entry.cueId];
    assert.ok(style && Array.isArray(style.post), `cue ${entry.cueId} has no post stack`);
    const layer = style.post.find((item) => item && item.type === 'shapeLayer');
    assert.ok(layer, `cue ${entry.cueId} has no shape layer`);
    assert.equal(layer.params.shape, entry.value, `cue ${entry.cueId} frame shape`);
  }
});

test('every page cue stays a single beat', () => {
  const b = built();
  for (const entry of b.entries.filter((entry) => entry.section === 'page')) {
    const beats = b.project.beats[entry.cueId] || [];
    assert.equal(beats.length, 1, `page cue ${entry.cueId} has ${beats.length} beats`);
    const style = b.project.cueStyles[entry.cueId];
    assert.ok(style && style.page, `page cue ${entry.cueId} has no page style`);
    assert.equal(style.page.type, entry.pageType, `page cue ${entry.cueId} type`);
  }
});

test('every cue carries a label and the showcase meta', () => {
  const b = built();
  const cueById = new Map(b.project.script.cues.map((cue) => [cue.id, cue]));
  for (const entry of b.entries) {
    const cue = cueById.get(entry.cueId);
    assert.ok(cue, `cue ${entry.cueId} missing`);
    // page cues carry role text for their preset, so the type only rides in
    // the meta (the page style is checked with the single-beat test above)
    if (entry.section !== 'page') {
      assert.ok(String(cue.text).includes(entry.value), `${entry.cueId} label must name ${entry.value}`);
    }
    assert.equal(cue.meta.kind, 'decor-showcase');
    assert.equal(cue.meta.section, entry.section);
    assert.equal(cue.meta.value, entry.value);
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
  const b = showcase.buildShowcase({ sections: ['bubble'] });
  assert.equal(b.entries.length, showcase.BUBBLE_TAILS.length * showcase.BUBBLE_BODIES.length);
  for (const entry of b.entries) assert.equal(entry.section, 'bubble');
  assert.equal(b.markers.length, 1);
});

test('the built showcase matches the committed files (deterministic build)', () => {
  const b = built();
  assert.equal(fs.readFileSync(outPath(), 'utf8'), showcase.serialize(b.project));
  assert.equal(fs.readFileSync(mdPath(), 'utf8'), showcase.indexMarkdown(b));
});

test('the Help menu offers the decor showcase in all five languages', () => {
  const menu = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'menu.js'), 'utf8');
  assert.match(menu, /key: 'studio\.help\.decorShowcase', action: 'decorShowcase'/);
  const app = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'app.js'), 'utf8');
  assert.match(app, /decorShowcase: decorShowcaseProject/);
  assert.match(app, /readAsset\('data\/decor-showcase\.json'\)/);

  globalThis.window = globalThis;
  globalThis.SA = globalThis.SA || {};
  require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
  const i18n = globalThis.SA.i18n;
  for (const code of ['en', 'ja', 'es', 'fr', 'ru']) {
    i18n.set(code);
    const label = i18n.t('studio.help.decorShowcase');
    assert.ok(typeof label === 'string' && label.trim().length > 0, `${code} label`);
    assert.notEqual(label, 'studio.help.decorShowcase', `${code} label is missing`);
  }
});
