'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const fx = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'shape-layer']) {
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', `${name}.js`));
}

const SA = {
  fx,
  rng: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'rng.js')),
  audioDriver: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'audio-driver.js')),
  sections: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'sections.js')),
  color: require(path.join(ROOT, 'renderer', 'js', 'color.js')),
  moods: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'moods.js')),
  weird: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'weird.js')),
  genParams: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gen-params.js')),
  legibility: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'legibility.js')),
  paletteRoles: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'palette-roles.js')),
  fxAxes: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'fx-axes.js')),
  textflow: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'textflow.js')),
  project: require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js')),
  fillers: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'fillers.js')),
  rhythm: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'rhythm.js')),
  figures: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'figures.js')),
  fillerRender: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-render.js')),
  fillerPresets: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-presets.js')),
  compositions: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'compositions.js')),
  audioAnalysis: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'audio-analysis.js')),
  genres: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'genres.js')),
  random: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'random.js')),
  direct: require(path.join(ROOT, 'renderer', 'js', 'studio', 'direct.js')),
};
globalThis.SA = SA;

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'direct-w0.json'), 'utf8'));

function countShapeLayers(doc) {
  let count = 0;
  for (const style of Object.values(doc.beatStyles || {})) {
    if (style && Array.isArray(style.post)) {
      count += style.post.filter((p) => p && p.type === 'shapeLayer').length;
    }
  }
  return count;
}

test('POST shape layer occurrence is at most 1 across the song when weird is 1', () => {
  let count0 = 0;
  let count1 = 0;
  for (let seed = 100; seed < 125; seed += 1) {
    const doc = JSON.parse(JSON.stringify(FIXTURE.input));
    const ctx = SA.direct.prepare(doc, {
      axes: { ...FIXTURE.axes, weird: 1 },
      seed,
      compose: true,
      themeStyle: JSON.parse(JSON.stringify(FIXTURE.themeStyle)),
    });
    SA.direct.run(doc, ctx);
    const count = countShapeLayers(doc);
    assert.ok(count <= 1, `seed ${seed} produced ${count} shape layers (expected <= 1)`);
    if (count === 0) count0 += 1;
    if (count === 1) count1 += 1;
  }
  assert.ok(count1 > 0, `at least one seed produced 1 shape layer (got ${count1})`);
  assert.ok(count0 > 0, `at least one seed produced 0 shape layers (got ${count0})`);
});

test('POST shape layer occurrence is 0 across the song when weird is 0', () => {
  for (let seed = 100; seed < 110; seed += 1) {
    const doc = JSON.parse(JSON.stringify(FIXTURE.input));
    const ctx = SA.direct.prepare(doc, {
      axes: { ...FIXTURE.axes, weird: 0 },
      seed,
      compose: true,
      themeStyle: JSON.parse(JSON.stringify(FIXTURE.themeStyle)),
    });
    SA.direct.run(doc, ctx);
    const count = countShapeLayers(doc);
    assert.equal(count, 0, `weird 0 produced ${count} shape layers (expected 0)`);
  }
});

test('pinned graphicChance: 1 produces exactly 1 shape layer, and pinned 0 produces 0', () => {
  // Pinned to 1
  for (let seed = 1; seed <= 5; seed += 1) {
    const doc = JSON.parse(JSON.stringify(FIXTURE.input));
    const ctx = SA.direct.prepare(doc, {
      axes: { ...FIXTURE.axes, weird: 1 },
      seed,
      compose: true,
      params: { graphicChance: 1 },
      themeStyle: JSON.parse(JSON.stringify(FIXTURE.themeStyle)),
    });
    SA.direct.run(doc, ctx);
    assert.equal(countShapeLayers(doc), 1, `seed ${seed} with graphicChance: 1 should produce exactly 1 shape layer`);
  }

  // Pinned to 0
  for (let seed = 1; seed <= 5; seed += 1) {
    const doc = JSON.parse(JSON.stringify(FIXTURE.input));
    const ctx = SA.direct.prepare(doc, {
      axes: { ...FIXTURE.axes, weird: 1 },
      seed,
      compose: true,
      params: { graphicChance: 0 },
      themeStyle: JSON.parse(JSON.stringify(FIXTURE.themeStyle)),
    });
    SA.direct.run(doc, ctx);
    assert.equal(countShapeLayers(doc), 0, `seed ${seed} with graphicChance: 0 should produce 0 shape layers`);
  }
});

test('frame size (padding) is variable across runs', () => {
  const paddings = new Set();
  const strokes = new Set();
  const scales = new Set();
  for (let seed = 1; seed <= 20; seed += 1) {
    const doc = JSON.parse(JSON.stringify(FIXTURE.input));
    const ctx = SA.direct.prepare(doc, {
      axes: { ...FIXTURE.axes, weird: 1 },
      seed,
      compose: true,
      params: { graphicChance: 1 },
      themeStyle: JSON.parse(JSON.stringify(FIXTURE.themeStyle)),
    });
    SA.direct.run(doc, ctx);
    for (const style of Object.values(doc.beatStyles || {})) {
      for (const p of style.post || []) {
        if (p && p.type === 'shapeLayer' && (p.params.shape === 'box' || p.params.shape === 'brackets')) {
          assert.ok(typeof p.params.padding === 'number', 'padding should be a number');
          assert.ok(p.params.padding >= 0.05 && p.params.padding <= 0.3, `padding ${p.params.padding} out of expected range`);
          assert.ok(typeof p.params.scale === 'number', 'scale should be a number');
          assert.ok(p.params.scale >= 0.85 && p.params.scale <= 1.25, `scale ${p.params.scale} out of expected range`);
          paddings.add(p.params.padding);
          strokes.add(p.params.stroke);
          scales.add(p.params.scale);
        }
      }
    }
  }
  assert.ok(paddings.size >= 2, `paddings should be variable across seeds, got ${paddings.size} distinct values: ${Array.from(paddings)}`);
  assert.ok(strokes.size >= 2, `strokes should be variable across seeds, got ${strokes.size} distinct values: ${Array.from(strokes)}`);
  assert.ok(scales.size >= 2, `scales should be variable across seeds, got ${scales.size} distinct values: ${Array.from(scales)}`);
});

test('standalone beat re-rolls preserve the at-most-1 shape layer rule', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const ctx = SA.direct.prepare(doc, {
    axes: { ...FIXTURE.axes, weird: 1 },
    seed: 42,
    compose: true,
    params: { graphicChance: 1 },
    themeStyle: JSON.parse(JSON.stringify(FIXTURE.themeStyle)),
  });
  SA.direct.run(doc, ctx);
  assert.equal(countShapeLayers(doc), 1);

  // Reroll several beats one by one
  const cue = doc.script.cues[0];
  const beats = (doc.beats && doc.beats[cue.id]) || [];
  for (let i = 0; i < beats.length; i += 1) {
    const rerollCtx = {
      compose: true,
      seed: 999 + i,
      rawW: 1,
      w: 1,
      energy: 0.5,
      curve: true,
      params: { graphicChance: 1 },
      axes: { weird: 1, energy: 0.5 },
      cueBold: {},
      themeStyle: doc.style,
    };
    SA.direct.composeBeat(doc, cue, beats[i], i, 0, rerollCtx);
    const count = countShapeLayers(doc);
    assert.ok(count <= 1, `after rerolling beat ${i}, shape layer count ${count} should be <= 1`);
  }
});
