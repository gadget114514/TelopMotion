'use strict';

// The text showcase: every text fill, every text edge and every text
// background, each in four variants (base / double / dx / dy). Every cue must
// survive the migration and keep its label; background cues (except `none`)
// must own one bg clip.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const showcase = require(path.join(ROOT, 'scripts', 'text-showcase.js'));

let cached = null;
function built() {
  if (!cached) cached = showcase.buildShowcase();
  return cached;
}

function outPath() {
  return path.join(ROOT, 'renderer', 'data', 'text-showcase.json');
}

function mdPath() {
  return path.join(ROOT, 'demo', 'text-showcase.md');
}

test('the generated showcase migrates and keeps every cue', () => {
  const b = built();
  const migrated = project.migrate(JSON.parse(JSON.stringify(b.project)));
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.project.script.cues.length, b.entries.length);
  assert.equal(b.entries.filter((entry) => entry.section === 'fill').length, showcase.FILL_TYPES.length * 4);
  assert.equal(b.entries.filter((entry) => entry.section === 'edge').length, showcase.EDGE_TYPES.length * 4);
  assert.equal(b.entries.filter((entry) => entry.section === 'background').length, showcase.BG_TYPES.length * 4);
  assert.equal(b.entries.length, (showcase.FILL_TYPES.length + showcase.EDGE_TYPES.length + showcase.BG_TYPES.length) * 4);
  // the type lists track the registry (all packs)
  const fx = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'registry.js'));
  for (const name of ['fill', 'edge', 'background']) require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', `${name}.js`));
  assert.deepEqual(fx.list('fill', { packs: 'all' }).map((entry) => entry.type), showcase.FILL_TYPES);
  assert.deepEqual(fx.list('edge', { packs: 'all' }).map((entry) => entry.type), showcase.EDGE_TYPES);
  assert.deepEqual(fx.list('background', { packs: 'all' }).map((entry) => entry.type), showcase.BG_TYPES);
});

test('every type plays base, double, dx and dy back to back', () => {
  const b = built();
  const cueById = new Map(b.project.script.cues.map((cue) => [cue.id, cue]));
  for (const entry of b.entries) {
    const cue = cueById.get(entry.cueId);
    assert.ok(cue, `cue ${entry.cueId} missing`);
    assert.equal(cue.meta.kind, 'text-showcase');
    assert.equal(cue.meta.section, entry.section);
    assert.equal(cue.meta.type, entry.type);
    assert.equal(cue.meta.variant, entry.variant);
    assert.ok(String(cue.text).includes(entry.type), `${entry.cueId} label must name ${entry.type}`);
    const style = b.project.cueStyles[entry.cueId];
    assert.ok(style, `cue ${entry.cueId} style missing`);
    const clones = style.clones || [];
    if (entry.variant === 'base') {
      assert.ok(!style.clones, `base cue ${entry.cueId} must carry no clones`);
    } else if (entry.variant === 'double') {
      assert.equal(clones.length, 1, `double cue ${entry.cueId} must carry one clone`);
      assert.equal(clones[0].dx, 0.035);
      assert.equal(clones[0].dy, -0.035);
    } else if (entry.variant === 'dx') {
      assert.deepEqual(clones.map((entry) => entry.dx), showcase.SPREAD_X, `dx cue ${entry.cueId} spread`);
    } else if (entry.variant === 'dy') {
      assert.deepEqual(clones.map((entry) => entry.dy), showcase.SPREAD_Y, `dy cue ${entry.cueId} spread`);
      assert.deepEqual(clones.map((entry) => entry.dx), showcase.SPREAD_X, `dy cue ${entry.cueId} horizontal spread`);
    }
  }
  // neighbouring variants of one type differ only in the clones
  const of = (section, type, variant) => b.entries.find((entry) => entry.section === section && entry.type === type && entry.variant === variant);
  const solidBase = b.project.cueStyles[of('fill', 'solid', 'base').cueId];
  const solidDouble = b.project.cueStyles[of('fill', 'solid', 'double').cueId];
  assert.equal(solidBase.fill.type, 'solid');
  assert.equal(solidDouble.fill.type, 'solid');
  assert.deepEqual({ ...solidDouble, clones: null }, { ...solidBase, clones: null });
});

test('fill cues pin the fill, edge cues pin the edge, background cues own a clip', () => {
  const b = built();
  for (const entry of b.entries.filter((entry) => entry.section === 'fill')) {
    assert.equal(b.project.cueStyles[entry.cueId].fill.type, entry.type, `${entry.cueId} fill`);
  }
  for (const entry of b.entries.filter((entry) => entry.section === 'edge')) {
    const edge = b.project.cueStyles[entry.cueId].edge;
    assert.ok(Array.isArray(edge) && edge.length === 1, `${entry.cueId} edge`);
    assert.equal(edge[0].type, entry.type, `${entry.cueId} edge type`);
  }
  const clipsByCue = new Map((b.project.clips || []).map((clip) => [clip.id.replace(/^clip_/, ''), clip]));
  for (const entry of b.entries.filter((entry) => entry.section === 'background')) {
    if (entry.type === 'none') {
      assert.ok(!clipsByCue.has(entry.cueId), `${entry.cueId} none must own no clip`);
    } else {
      const clip = clipsByCue.get(entry.cueId);
      assert.ok(clip, `${entry.cueId} clip missing`);
      assert.equal(clip.trackId, 'bg');
      assert.equal(clip.spec.type, entry.type);
    }
  }
  for (const entry of b.entries.filter((entry) => entry.section !== 'background')) {
    assert.ok(!clipsByCue.has(entry.cueId), `${entry.cueId} must own no clip`);
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
  const b = showcase.buildShowcase({ sections: ['edge'] });
  assert.equal(b.entries.length, showcase.EDGE_TYPES.length * 4);
  for (const entry of b.entries) assert.equal(entry.section, 'edge');
  assert.equal(b.markers.length, 1);
});

test('the built showcase matches the committed files (deterministic build)', () => {
  const b = built();
  assert.equal(fs.readFileSync(outPath(), 'utf8'), showcase.serialize(b.project));
  assert.equal(fs.readFileSync(mdPath(), 'utf8'), showcase.indexMarkdown(b));
});

test('the Help menu offers the text showcase in all five languages', () => {
  const menu = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'menu.js'), 'utf8');
  assert.match(menu, /key: 'studio\.help\.textShowcase', action: 'textShowcase'/);
  const app = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'app.js'), 'utf8');
  assert.match(app, /textShowcase: textShowcaseProject/);
  assert.match(app, /openShowcaseAsset\('data\/text-showcase\.json'\)/);

  globalThis.window = globalThis;
  globalThis.SA = globalThis.SA || {};
  require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
  const i18n = globalThis.SA.i18n;
  for (const code of ['en', 'ja', 'es', 'fr', 'ru']) {
    i18n.set(code);
    const label = i18n.t('studio.help.textShowcase');
    assert.ok(typeof label === 'string' && label.trim().length > 0, `${code} label`);
    assert.notEqual(label, 'studio.help.textShowcase', `${code} label is missing`);
  }
});
