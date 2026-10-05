'use strict';

// The backdrop showcase: every accent type, split layout and clip motion must
// reach the generated project, survive the migration and draw something.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const showcase = require(path.join(ROOT, 'scripts', 'backdrop-showcase.js'));
const fillerRender = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-render.js'));
const moods = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'moods.js'));

let cached = null;
function built() {
  if (!cached) cached = showcase.buildShowcase();
  return cached;
}

function outPath() {
  return path.join(ROOT, 'renderer', 'data', 'backdrop-showcase.json');
}

function mdPath() {
  return path.join(ROOT, 'demo', 'backdrop-showcase.md');
}

function backdropClips(doc) {
  return (doc.clips || []).filter((clip) => clip.trackId === 'mid').sort((a, b) => a.start - b.start);
}

test('the generated showcase migrates and keeps every cue and clip', () => {
  const b = built();
  const migrated = project.migrate(JSON.parse(JSON.stringify(b.project)));
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.project.script.cues.length, b.entries.length);
  assert.equal(backdropClips(migrated.project).length, b.entries.length);
  assert.equal(b.entries.filter((entry) => entry.section === 'accent').length, showcase.ACCENT_TYPES.length * 3);
  assert.equal(b.entries.filter((entry) => entry.section === 'split').length, showcase.SPLIT_LAYOUTS.length * 2);
  assert.equal(b.entries.filter((entry) => entry.section === 'motion').length, showcase.MOTIONS.length);
  assert.equal(b.entries.length, showcase.ACCENT_TYPES.length * 3 + showcase.SPLIT_LAYOUTS.length * 2 + showcase.MOTIONS.length);
  assert.equal(b.entries.length, 49);
});

test('every accent type gets three configuration variants', () => {
  const b = built();
  for (const type of showcase.ACCENT_TYPES) {
    const rows = b.entries.filter((entry) => entry.section === 'accent' && entry.value === type);
    assert.equal(rows.length, 3, `${type} has ${rows.length} variants`);
    assert.deepEqual(rows.map((entry) => entry.variant), [1, 2, 3]);
    // the variants really differ: mode/set/flow plus the width/height build
    const params = rows.map((entry) => JSON.stringify(entry.spec.params));
    assert.equal(new Set(params).size, 3, `${type} variants are identical`);
    for (const entry of rows) {
      assert.equal(entry.spec.type, type);
      assert.ok(entry.detail && entry.detail !== type, `${type} variant ${entry.variant} has no detail label`);
    }
  }
  assert.deepEqual(
    showcase.ACCENT_TYPES.map((type) => showcase.accentVariants(type).length),
    showcase.ACCENT_TYPES.map(() => 3)
  );
});

test('every split layout gets two builds: full-width and narrower/finer', () => {
  const b = built();
  for (const layout of showcase.SPLIT_LAYOUTS) {
    const rows = b.entries.filter((entry) => entry.section === 'split' && entry.value === layout);
    assert.equal(rows.length, 2, `${layout} has ${rows.length} builds`);
    assert.deepEqual(rows.map((entry) => entry.variant), [1, 2]);
    for (const entry of rows) {
      assert.equal(entry.spec.type, 'split');
      assert.equal(entry.spec.params.layout, layout);
    }
    // the second build is finer (more parts) over less of the frame
    assert.ok(rows[1].spec.params.parts >= rows[0].spec.params.parts, `${layout} second build is not finer`);
    assert.ok(rows[1].spec.params.coverage < rows[0].spec.params.coverage, `${layout} second build is not narrower`);
  }
});

test('every backdrop motion gets its own cue on the reference combo', () => {
  const b = built();
  // the script's motion list must follow the registry the renderer reads
  assert.deepEqual(showcase.MOTIONS, moods.BACKDROP_MOTIONS);
  const used = b.entries.filter((entry) => entry.section === 'motion').map((entry) => entry.value);
  assert.deepEqual(used, moods.BACKDROP_MOTIONS);
  for (const entry of b.entries.filter((entry) => entry.section === 'motion')) {
    assert.equal(entry.spec.type, 'combo');
    assert.equal(entry.spec.params.animate.mode, entry.value);
    const kinds = entry.spec.params.list.map((part) => part.type).sort();
    assert.deepEqual(kinds, ['shapes', 'split']);
  }
});

test('every cue carries a label, a clip span and the shared plate', () => {
  const b = built();
  const cueById = new Map(b.project.script.cues.map((cue) => [cue.id, cue]));
  const clips = backdropClips(b.project);
  b.entries.forEach((entry, index) => {
    const cue = cueById.get(entry.cueId);
    assert.ok(cue, `cue ${entry.cueId} missing`);
    assert.equal(cue.end - cue.start, showcase.BACKDROP_SECONDS, `${entry.cueId} span`);
    assert.ok(String(cue.text).includes(entry.value), `${entry.cueId} label must name ${entry.value}`);
    if (entry.detail && entry.detail !== entry.value) {
      assert.ok(String(cue.text).includes(entry.detail), `${entry.cueId} label must name its build ${entry.detail}`);
    }
    assert.equal(cue.meta.kind, 'backdrop-showcase');
    assert.equal(cue.meta.section, entry.section);
    assert.equal(cue.meta.value, entry.value);
    assert.equal(cue.meta.variant, entry.variant);
    const clip = clips[index];
    assert.equal(clip.start, cue.start, `${entry.cueId} clip start`);
    assert.equal(clip.end, cue.end, `${entry.cueId} clip end`);
    assert.deepEqual(clip.colors, showcase.BACKDROP_COLORS, `${entry.cueId} colours`);
  });
  const plate = (b.project.clips || []).find((clip) => clip.trackId === 'bg');
  assert.ok(plate, 'the showcase needs one plate clip so the layers read');
  assert.equal(plate.spec.type, 'solid');
  assert.equal(plate.end, b.project.script.cues[b.project.script.cues.length - 1].end);
});

test('every section opens a marker and is listed once', () => {
  const b = built();
  assert.equal(b.markers.length, b.sections.length);
  assert.deepEqual(
    b.markers.map((marker) => marker.label),
    b.sections.map((section) => section.label)
  );
});

test('every showcase clip draws shapes through its span', () => {
  const b = built();
  const FRAME = { width: 1920, height: 1080 };
  const FRACTIONS = [0.3, 0.5, 0.7];
  for (const clip of backdropClips(b.project)) {
    let drew = 0;
    for (const fraction of FRACTIONS) {
      const time = clip.start + (clip.end - clip.start) * fraction;
      const list = fillerRender.drawList(clip.spec, {
        time,
        frame: FRAME,
        clip: { key: clip.id, start: clip.start, end: clip.end, spec: clip.spec },
        progress: fraction,
        bpm: 120,
        seed: 12345,
        colors: clip.colors,
      });
      assert.ok(list && Array.isArray(list.shapes), `${clip.id} returned no shape list`);
      if (list.shapes.length || (list.texts && list.texts.length)) drew += 1;
    }
    assert.ok(drew > 0, `${clip.id} (${clip.spec.type}) never drew anything`);
  }
});

test('the --sections filter keeps only the named sections', () => {
  const b = showcase.buildShowcase({ sections: ['split'] });
  assert.equal(b.entries.length, showcase.SPLIT_LAYOUTS.length * 2);
  for (const entry of b.entries) assert.equal(entry.section, 'split');
  assert.equal(b.markers.length, 1);
});

test('the built showcase matches the committed files (deterministic build)', () => {
  const b = built();
  assert.equal(fs.readFileSync(outPath(), 'utf8'), showcase.serialize(b.project));
  assert.equal(fs.readFileSync(mdPath(), 'utf8'), showcase.indexMarkdown(b));
});

test('the Help menu offers the backdrop showcase in all five languages', () => {
  const menu = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'menu.js'), 'utf8');
  assert.match(menu, /key: 'studio\.help\.backdropShowcase', action: 'backdropShowcase'/);
  const app = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'app.js'), 'utf8');
  assert.match(app, /backdropShowcase: backdropShowcaseProject/);
  assert.match(app, /readAsset\('data\/backdrop-showcase\.json'\)/);

  globalThis.window = globalThis;
  globalThis.SA = globalThis.SA || {};
  require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
  const i18n = globalThis.SA.i18n;
  for (const code of ['en', 'ja', 'es', 'fr', 'ru']) {
    i18n.set(code);
    const label = i18n.t('studio.help.backdropShowcase');
    assert.ok(typeof label === 'string' && label.trim().length > 0, `${code} label`);
    assert.notEqual(label, 'studio.help.backdropShowcase', `${code} label is missing`);
  }
});
