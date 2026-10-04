'use strict';

// The figure showcase: every motif and every figure motion axis must reach the
// generated project, survive the migration and draw something.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const figures = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'figures.js'));
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const showcase = require(path.join(ROOT, 'scripts', 'figure-showcase.js'));

let cached = null;
function built() {
  if (!cached) cached = showcase.buildShowcase();
  return cached;
}

function outPath() {
  return path.join(ROOT, 'renderer', 'data', 'figure-showcase.json');
}

function mdPath() {
  return path.join(ROOT, 'demo', 'figure-showcase.md');
}

// one figure clip per cue, in cue order
function figureClips(doc) {
  const clips = (doc.clips || []).filter((clip) => clip.trackId === 'fig');
  return [...clips].sort((a, b) => a.start - b.start);
}

test('the generated showcase migrates and keeps every cue and clip', () => {
  const b = built();
  const migrated = project.migrate(JSON.parse(JSON.stringify(b.project)));
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.project.script.cues.length, b.entries.length);
  assert.equal(figureClips(migrated.project).length, b.entries.length);
  assert.ok(b.entries.length >= 100, `entries ${b.entries.length}`);
});

test('every motif in the registry gets its own cue', () => {
  const b = built();
  const used = b.entries.filter((entry) => entry.kind === 'motif').map((entry) => entry.value);
  assert.deepEqual(used, figures.MOTIFS, 'the motif walk must follow figures.MOTIFS in order');
  assert.equal(used.length, figures.MOTIFS.length);
  assert.equal(new Set(used).size, figures.MOTIFS.length, 'no motif may repeat');
});

test('every motion axis value gets its own cue', () => {
  const b = built();
  const axes = ['in', 'hold', 'out', 'sync', 'camera', 'procMotion'];
  for (const axis of axes) {
    const values = showcase.AXIS_VALUES[axis];
    assert.ok(values && values.length, `${axis} has no values`);
    const used = b.entries.filter((entry) => entry.axis === axis).map((entry) => entry.value);
    assert.deepEqual(used, values, `${axis} must list every value in registry order`);
  }
});

test('the axis cues pin the move / camera and hold the reference motif', () => {
  const b = built();
  for (const axis of ['in', 'hold', 'out']) {
    for (const entry of b.entries.filter((item) => item.axis === axis)) {
      assert.equal(entry.spec.params.motif, showcase.REFERENCE_MOTIF, `${axis} ${entry.value}`);
      for (const beat of entry.spec.params.beats) {
        assert.equal(beat.move[axis], entry.value, `${axis} ${entry.value} beat ${beat.start}`);
      }
    }
  }
  for (const entry of b.entries.filter((item) => item.axis === 'camera')) {
    assert.equal(entry.spec.params.motif, showcase.REFERENCE_MOTIF, `camera ${entry.value}`);
    assert.equal(entry.spec.params.camera, entry.value, `camera ${entry.value}`);
    // the camera reads params.seed; without it every clip shares one curve
    assert.ok(Number.isFinite(Number(entry.spec.params.seed)), `camera ${entry.value} has no seed`);
  }
  for (const entry of b.entries.filter((item) => item.axis === 'sync')) {
    assert.equal(entry.spec.params.sync, entry.value, `sync ${entry.value}`);
    // the beat and text syncs cut on the lyric beats, free on the cuts
    assert.ok(entry.spec.params.beats.length >= 1, `sync ${entry.value} has no sub-beats`);
  }
});

test('every procedural motion is drawn by its own seed', () => {
  const b = built();
  const seeds = b.entries.filter((entry) => entry.axis === 'procMotion');
  assert.equal(seeds.length, figures.PROC_LISTS.motions.length);
  const drawn = new Set();
  for (const entry of seeds) {
    const seed = entry.spec.params.seed;
    assert.ok(Number.isFinite(Number(seed)), `${entry.value} has no seed`);
    const genome = figures.procGenome(seed, 1);
    assert.ok(genome.some((layer) => layer.motion === entry.value), `seed ${seed} does not draw ${entry.value}`);
    drawn.add(seed);
  }
  assert.equal(drawn.size, seeds.length, 'two procedural motions share a seed');
});

test('every cue carries a label, a clip span and the shared plate', () => {
  const b = built();
  const cueById = new Map(b.project.script.cues.map((cue) => [cue.id, cue]));
  const clips = figureClips(b.project);
  b.entries.forEach((entry, index) => {
    const cue = cueById.get(entry.cueId);
    assert.ok(cue, `cue ${entry.cueId} missing`);
    assert.equal(cue.end - cue.start, entry.seconds, `${entry.cueId} span`);
    assert.ok(String(cue.text).includes(entry.value), `${entry.cueId} label must name ${entry.value}`);
    const clip = clips[index];
    assert.equal(clip.start, cue.start, `${entry.cueId} clip start`);
    assert.equal(clip.end, cue.end, `${entry.cueId} clip end`);
    assert.equal(clip.spec.type, 'figure');
    assert.deepEqual(clip.colors, showcase.FIGURE_COLORS, `${entry.cueId} colours`);
  });
  const plate = (b.project.clips || []).find((clip) => clip.trackId === 'bg');
  assert.ok(plate, 'the showcase needs one plate clip so the figures read');
  assert.equal(plate.spec.type, 'solid');
  assert.equal(plate.end, b.project.script.cues[b.project.script.cues.length - 1].end);
});

test('every section opens a marker and is listed once', () => {
  const b = built();
  assert.equal(b.markers.length, b.sections.length);
  const labels = b.markers.map((marker) => marker.label);
  for (const section of b.sections) assert.ok(labels.includes(section.label), `marker for ${section.id}`);
  const ids = b.entries.map((entry) => entry.section);
  let last = null;
  for (const id of ids) {
    if (id !== last) {
      assert.ok(!labels.filter((label) => label === b.entries.find((entry) => entry.section === id).sectionLabel).length < 2, `duplicate marker for ${id}`);
      last = id;
    }
  }
});

test('every showcase clip draws finite shapes through its span', () => {
  const b = built();
  const FRAME = { width: 1920, height: 1080 };
  // the entrance starts and the exit ends from nothing, so a clip is sampled
  // across its span: every sample must stay finite, and at least one of them
  // must actually draw (the point of the walk)
  const FRACTIONS = [0.15, 0.3, 0.5, 0.7, 0.85, 0.95];
  for (const clip of figureClips(b.project)) {
    const textBox = { x0: 420, y0: 880, x1: 1500, y1: 980 };
    let drew = 0;
    for (const fraction of FRACTIONS) {
      const time = clip.start + (clip.end - clip.start) * fraction;
      const list = figures.drawList(clip.spec, {
        time,
        frame: FRAME,
        clip: { key: clip.id, start: clip.start, end: clip.end, spec: clip.spec },
        beats: [],
        seed: 12345,
        colors: clip.colors,
        textBox,
      });
      const shapes = list.shapes || [];
      assert.ok(Array.isArray(shapes), `${clip.id} returned no shape list`);
      // a field motif returns a field spec instead of shapes
      if (shapes.length || list.field) drew += 1;
      for (const shape of shapes) {
        for (const key of ['x', 'y', 'r', 'w', 'h', 'opacity']) {
          if (shape[key] != null) assert.ok(Number.isFinite(shape[key]), `${clip.id} ${key} at ${time}`);
        }
        if (shape.points) {
          for (const point of shape.points) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), `${clip.id} point at ${time}`);
        }
      }
    }
    assert.ok(drew > 0, `${clip.id} (${clip.spec.params.motif}) never drew anything`);
  }
});

test('the --sections filter keeps only the named sections', () => {
  const b = showcase.buildShowcase({ sections: ['camera'] });
  assert.equal(b.entries.length, showcase.AXIS_VALUES.camera.length);
  for (const entry of b.entries) assert.equal(entry.section, 'camera');
  assert.equal(b.markers.length, 1);
  assert.equal(b.entries[0].spec.params.camera, showcase.AXIS_VALUES.camera[0]);
});

test('the built showcase matches the committed file (deterministic build)', () => {
  const b = built();
  assert.equal(fs.readFileSync(outPath(), 'utf8'), showcase.serialize(b.project));
  assert.equal(fs.readFileSync(mdPath(), 'utf8'), showcase.indexMarkdown(b));
});

test('the Help menu offers the figure showcase in all five languages', () => {
  const menu = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'menu.js'), 'utf8');
  assert.match(menu, /key: 'studio\.help\.figureShowcase', action: 'figureShowcase'/);
  const app = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'app.js'), 'utf8');
  assert.match(app, /figureShowcase: figureShowcaseProject/);
  assert.match(app, /readAsset\('data\/figure-showcase\.json'\)/);

  globalThis.window = globalThis;
  globalThis.SA = globalThis.SA || {};
  require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
  const i18n = globalThis.SA.i18n;
  for (const code of ['en', 'ja', 'es', 'fr', 'ru']) {
    i18n.set(code);
    const label = i18n.t('studio.help.figureShowcase');
    assert.ok(typeof label === 'string' && label.trim().length > 0, `${code} label`);
    assert.notEqual(label, 'studio.help.figureShowcase', `${code} label is missing`);
  }
});
