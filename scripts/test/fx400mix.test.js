'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const fx = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'registry.js'));
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const motion = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'motion.js'));
const mix = require(path.join(ROOT, 'scripts', 'fx400mix.js'));

// the catalog takes a few seconds to sample; every test reads the same build
const catalog = mix.buildCatalog();

function sceneFor(text, style) {
  const size = 96;
  const letters = [];
  let pen = 0;
  for (let i = 0; i < text.length; i += 1) {
    const width = size * 0.6;
    letters.push({
      path: `cue:c1/beat:c1:single0/line:0/word:${i}/letter:0`,
      cueId: 'c1',
      beatId: 'c1:single0',
      lineIdx: 0,
      wordIdx: i,
      letterIdx: 0,
      globalIdx: i,
      char: text[i],
      local: { x: pen, y: size, w: width, h: size, cx: pen + width / 2, cy: size * 0.7, penX: pen, penY: size },
      bbox: { x1: 0, y1: -size, x2: width, y2: 0 },
      outlineLength: 400 + i * 10,
    });
    pen += width;
  }
  return { cueId: 'c1', beatId: 'c1:single0', kind: 'single', start: 0, end: 3, text, style, letters, blockBBox: { x1: 0, y1: 0, x2: pen, y2: size }, size, direction: 'horizontal' };
}

test('400 numbered demos cover every registered type as a headline', () => {
  assert.equal(catalog.effects.length, 400);
  assert.deepEqual(catalog.effects.map((entry) => entry.n), Array.from({ length: 400 }, (_, index) => index + 1));
  assert.equal(new Set(catalog.effects.map((entry) => entry.id)).size, 400);
  const headlines = new Set(catalog.effects.map((entry) => `${entry.group}.${entry.type}`));
  for (const group of mix.HEADLINE_GROUPS) {
    for (const descriptor of fx.list(group)) {
      if (descriptor.type === 'none' && group !== 'background') continue;
      assert.ok(headlines.has(`${group}.${descriptor.type}`), `${group}.${descriptor.type} has no demo`);
    }
  }
});

test('every pattern background comes from the variant library and never repeats', () => {
  const patterns = catalog.effects.filter((entry) => entry.clip && entry.clip.type === 'pattern');
  assert.ok(patterns.length > 20, `only ${patterns.length} pattern backgrounds`);
  const keys = new Set();
  for (const entry of patterns) {
    const params = entry.clip.params || {};
    keys.add([params.mode || 'grid', params.size, params.count].join('|'));
    if (params.size != null) assert.ok(params.size >= 0.2 && params.size <= 3, `#${entry.n} size ${params.size}`);
    if (params.count != null) assert.ok(params.count >= 4 && params.count <= 120, `#${entry.n} count ${params.count}`);
  }
  assert.equal(keys.size, patterns.length, 'a demo reused a pattern variant');
  assert.ok(catalogMarkdownHasVariant(catalog), 'the md index does not show the pattern variant');
});

function catalogMarkdownHasVariant(catalog) {
  const md = mix.catalogMarkdown(catalog);
  return catalog.effects.some((entry) => entry.clip && entry.clip.type === 'pattern' && md.includes(` ${entry.clip.params.size}x${entry.clip.params.count})`));
}

test('every demo differs from every other demo in many slots', () => {
  const effects = catalog.effects;
  const tuples = new Set();
  for (let i = 0; i < effects.length; i += 1) {
    const s = effects[i].signature;
    tuples.add([s.enter, s.exit, s.hold, s.fill, s.edge, s.post, s.layout, s.bgShape, s.repeat].join('|'));
    for (let j = i + 1; j < effects.length; j += 1) {
      const d = mix.distance(s, effects[j].signature);
      assert.ok(d >= mix.MIN_DISTANCE, `#${effects[i].n} and #${effects[j].n} are too close (${d})`);
    }
    if (i > 0) {
      const previous = effects[i - 1].signature;
      const changed = Object.keys(mix.SLOT_WEIGHTS).filter((key) => s[key] !== previous[key]);
      assert.ok(mix.distance(s, previous) >= 7, `#${effects[i].n} looks like the demo before it`);
      assert.ok(changed.includes('enter') || changed.includes('fill'), `#${effects[i].n} keeps the previous enter and fill`);
    }
  }
  assert.equal(tuples.size, 400, 'effect combinations repeat');
});

test('font sizes and text colours are clearly stepped', () => {
  const stops = new Set(mix.SIZE_STOPS);
  const used = new Set();
  for (const entry of catalog.effects) {
    const size = entry.style.text && entry.style.text.size;
    assert.ok(stops.has(size), `#${entry.n} size ${size} is not a ladder step`);
    used.add(size);
    assert.ok(entry.style.color && entry.style.color.fill, `#${entry.n} has no text colour`);
  }
  assert.equal(used.size, mix.SIZE_STOPS.length, 'not every size step is used');
  // the colour roles cycle, so a neighbour can never repeat both dimensions
  for (let i = 1; i < catalog.effects.length; i += 1) {
    const before = catalog.effects[i - 1];
    const after = catalog.effects[i];
    const sameSize = before.style.text.size === after.style.text.size;
    const sameFill = JSON.stringify(before.style.color.fill) === JSON.stringify(after.style.color.fill);
    assert.ok(!(sameSize && sameFill), `#${after.n} repeats the size and colour of #${before.n}`);
  }
});

test('the catalog is deterministic', () => {
  const again = mix.buildCatalog();
  assert.equal(JSON.stringify(again.effects), JSON.stringify(catalog.effects));
});

test('cue backgrounds crossfade so a switch never dips to the clear colour', () => {
  const doc = mix.buildProject(catalog, mix.catalogSrt(catalog)).project;
  const clips = doc.clips.filter((clip) => clip.trackId === 'bg').sort((a, b) => a.start - b.start);
  const fade = (clip, t) => {
    if (t < clip.start - 1e-4 || t > clip.end + 1e-4) return 0;
    const fi = Math.max(1e-4, clip.fadeIn == null ? 0.15 : clip.fadeIn);
    const fo = Math.max(1e-4, clip.fadeOut == null ? 0.15 : clip.fadeOut);
    return Math.max(0, Math.min(1, (t - clip.start) / fi, (clip.end - t) / fo));
  };
  for (let i = 0; i < clips.length - 1; i += 1) {
    const a = clips[i];
    const b = clips[i + 1];
    if (b.start >= a.end) continue; // a gap shows the dark base, not a dip
    for (let t = b.start; t <= a.end; t += 0.01) {
      const coverage = Math.max(fade(a, t), fade(b, t));
      assert.ok(coverage > 0.999, `background dips to ${coverage.toFixed(3)} at ${t.toFixed(2)}`);
    }
  }
});

test('the project puts demo n on cue n and migrates', () => {
  const srtText = mix.catalogSrt(catalog);
  const doc = mix.buildProject(catalog, srtText).project;
  assert.equal(doc.script.cues.length, 400);
  const migrated = project.migrate(JSON.parse(JSON.stringify(doc)));
  assert.equal(migrated.ok, true, migrated.error);
  for (let i = 0; i < 400; i += 1) {
    const entry = catalog.effects[i];
    const cue = doc.script.cues[i];
    assert.equal(cue.id, `mix_${String(i + 1).padStart(3, '0')}`);
    assert.equal(cue.end - cue.start, 3);
    assert.ok(cue.text.startsWith(`${i + 1} `), `cue ${cue.id} text`);
    const beat = doc.beats[cue.id][0];
    const style = project.resolveStyle(doc, `cue:${cue.id}/beat:${beat.id}`);
    assert.equal(style.enter.type, entry.style.enter.type, `cue ${cue.id} enter`);
    assert.equal(style.fill.type, entry.style.fill.type, `cue ${cue.id} fill`);
    // the cue's own clip bleeds one fade past each edge (crossfade with the
    // neighbour), so it is found by its start, not by an exact cue range
    const clipStart = Math.max(0, cue.start - 0.15);
    const clip = doc.clips.find((item) => item.trackId === 'bg' && Math.abs(item.start - clipStart) < 1e-4);
    if (entry.clip) assert.equal(clip && clip.spec.type, entry.clip.type, `cue ${cue.id} background`);
    else assert.equal(clip, undefined, `cue ${cue.id} should have no background`);
    if (entry.part === 'type' || entry.part === 'variant') {
      if (entry.group === 'background') continue;
      const value = style[entry.group];
      const instance = Array.isArray(value) ? value.find((item) => item.type === entry.type) : value;
      assert.ok(instance && instance.type === entry.type, `cue ${cue.id} lost its headline ${entry.group}.${entry.type}`);
      for (const [key, param] of Object.entries(entry.params || {})) {
        assert.deepEqual(instance.params[key], param, `cue ${cue.id} headline param ${key}`);
      }
    }
  }
});

test('every demo evaluates without NaN', () => {
  const times = [0, 0.2, 0.8, 1.5, 2.6, 2.95];
  for (const entry of catalog.effects) {
    const scene = sceneFor('12 テストABC', entry.style);
    for (const time of times) {
      const result = motion.evaluateBeat(scene, time, {
        frame: { width: 1920, height: 1080 },
        seed: 42,
        beat: { id: 'c1:single0', cueId: 'c1', kind: 'single', start: 0, end: 3, text: scene.text },
      });
      for (const state of result.letters) {
        for (const key of ['x', 'y', 'rot', 'scaleX', 'scaleY', 'opacity', 'visibleFrac']) {
          assert.ok(Number.isFinite(state[key]), `#${entry.n} @${time}: ${key}`);
        }
      }
    }
  }
});

test('the markdown index lists every demo', () => {
  const md = mix.catalogMarkdown(catalog);
  assert.equal(md.split('\n').filter((line) => /^\| \d+ \|/.test(line)).length, 400);
});
