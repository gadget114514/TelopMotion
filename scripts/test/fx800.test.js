'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const fx = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'registry.js'));
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const motion = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'motion.js'));
const mix = require(path.join(ROOT, 'scripts', 'fx400mix.js'));
const fx800 = require(path.join(ROOT, 'scripts', 'fx800.js'));

// the catalog takes a few seconds to sample; every test reads the same build
const catalog = fx800.buildCatalog();

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

test('800 demos are numbered 1-800, named, and split into four parts of 200', () => {
  assert.equal(catalog.effects.length, 800);
  assert.equal(catalog.total, 800);
  assert.deepEqual(catalog.effects.map((entry) => entry.n), Array.from({ length: 800 }, (_, index) => index + 1));
  assert.equal(new Set(catalog.effects.map((entry) => entry.id)).size, 800);
  assert.equal(new Set(catalog.effects.map((entry) => entry.name)).size, 800, 'names repeat');
  assert.equal(new Set(catalog.effects.map((entry) => entry.text)).size, 800, 'texts repeat');
  for (const entry of catalog.effects) {
    assert.equal(entry.name, entry.label, `#${entry.n} name`);
    assert.equal(entry.demo, fx800.demoOf(entry.n), `#${entry.n} demo`);
    assert.ok(entry.text.startsWith(`${entry.n} `), `#${entry.n} text starts with its number`);
  }
  assert.deepEqual(catalog.demos, [
    { demo: 1, from: 1, to: 200, entries: 200, title: 'FX 800-1 テキスト効果デモ（No.1–200）', project: 'demo/fx800-1.telopmotion.json', srt: 'demo/fx800-1.srt' },
    { demo: 2, from: 201, to: 400, entries: 200, title: 'FX 800-2 テキスト効果デモ（No.201–400）', project: 'demo/fx800-2.telopmotion.json', srt: 'demo/fx800-2.srt' },
    { demo: 3, from: 401, to: 600, entries: 200, title: 'FX 800-3 テキスト効果デモ（No.401–600）', project: 'demo/fx800-3.telopmotion.json', srt: 'demo/fx800-3.srt' },
    { demo: 4, from: 601, to: 800, entries: 200, title: 'FX 800-4 テキスト効果デモ（No.601–800）', project: 'demo/fx800-4.telopmotion.json', srt: 'demo/fx800-4.srt' },
  ]);
  const headlines = new Set(catalog.effects.map((entry) => `${entry.group}.${entry.type}`));
  for (const group of mix.HEADLINE_GROUPS) {
    for (const descriptor of fx.list(group)) {
      if (descriptor.type === 'none' && group !== 'background') continue;
      assert.ok(headlines.has(`${group}.${descriptor.type}`), `${group}.${descriptor.type} has no demo`);
    }
  }
});

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
  assert.equal(tuples.size, 800, 'effect combinations repeat');
  assert.ok(fx800.nearestPairDistance(catalog) >= mix.MIN_DISTANCE);
});

test('pattern backgrounds use the variant library without repeats', () => {
  const patterns = catalog.effects.filter((entry) => entry.clip && entry.clip.type === 'pattern');
  const keys = new Set(patterns.map((entry) => [entry.clip.params.mode || 'grid', entry.clip.params.size, entry.clip.params.count].join('|')));
  assert.equal(keys.size, patterns.length, 'a demo reused a pattern variant');
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
  for (let i = 1; i < catalog.effects.length; i += 1) {
    const before = catalog.effects[i - 1];
    const after = catalog.effects[i];
    const sameSize = before.style.text.size === after.style.text.size;
    const sameFill = JSON.stringify(before.style.color.fill) === JSON.stringify(after.style.color.fill);
    assert.ok(!(sameSize && sameFill), `#${after.n} repeats the size and colour of #${before.n}`);
  }
});

test('the catalog is deterministic', () => {
  const again = fx800.buildCatalog();
  assert.equal(JSON.stringify(again.effects), JSON.stringify(catalog.effects));
  assert.equal(JSON.stringify(again.demos), JSON.stringify(catalog.demos));
});

test('each demo project puts demo n on cue n and migrates', () => {
  for (const demo of catalog.demos) {
    const entries = catalog.effects.filter((entry) => entry.demo === demo.demo);
    const built = fx800.buildPartProject(demo.demo, entries);
    const doc = built.project;
    assert.equal(doc.meta.title, demo.title);
    assert.equal(doc.script.cues.length, 200);
    assert.equal(built.cues.length, 200);
    const migrated = project.migrate(JSON.parse(JSON.stringify(doc)));
    assert.equal(migrated.ok, true, migrated.error);
    for (let i = 0; i < 200; i += 1) {
      const entry = entries[i];
      const cue = doc.script.cues[i];
      assert.equal(entry.n, demo.from + i);
      assert.equal(cue.id, `fx800_${demo.demo}_${String(i + 1).padStart(3, '0')}`);
      assert.equal(cue.end - cue.start, 3);
      assert.ok(cue.text.startsWith(`${entry.n} `), `cue ${cue.id} text`);
      const beat = doc.beats[cue.id][0];
      const style = project.resolveStyle(doc, `cue:${cue.id}/beat:${beat.id}`);
      assert.equal(style.enter.type, entry.style.enter.type, `cue ${cue.id} enter`);
      assert.equal(style.fill.type, entry.style.fill.type, `cue ${cue.id} fill`);
      const clip = doc.clips.find((item) => item.trackId === 'bg' && item.start === cue.start);
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

test('the markdown index lists every demo with its number and name', () => {
  const md = fx800.catalogMarkdown(catalog);
  const rows = md.split('\n').filter((line) => /^\| \d+ \|/.test(line));
  assert.equal(rows.length, 800);
  for (const entry of catalog.effects) {
    const row = rows.find((line) => line.startsWith(`| ${entry.n} |`));
    assert.ok(row && row.includes(entry.name), `row ${entry.n}`);
  }
  for (const demo of catalog.demos) {
    assert.ok(md.includes(`## デモ ${demo.demo}: No.${demo.from}–${demo.to}`), `section ${demo.demo}`);
    assert.ok(md.includes(`\`${demo.project}\``), `project link ${demo.demo}`);
  }
});
