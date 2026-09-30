'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const requirePart = (relative) => require(path.join(ROOT, relative));

const fx = requirePart('renderer/js/lyrics/effects/registry.js');
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg', 'vary', 'repeat']) {
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', `${name}.js`));
}
const looks = requirePart('renderer/js/lyrics/looks.js');
const classify = requirePart('scripts/looks-classify.js');
const genres = requirePart('renderer/js/lyrics/genres.js');
const moods = requirePart('renderer/js/lyrics/moods.js');

const LOOKS_FILE = path.join(ROOT, 'renderer', 'data', 'fx800.looks.json');
const CATALOG_FILE = path.join(ROOT, 'demo', 'fx800.catalog.json');

const data = JSON.parse(fs.readFileSync(LOOKS_FILE, 'utf8'));
const catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
const pool = looks.create(data);
const GENRE_IDS = new Set(genres.LIST.map((genre) => genre.id));

test('the runtime pool carries all 800 looks with classification', () => {
  assert.equal(data.format, 'telopmotion-fx800-looks');
  assert.equal(data.total, 800);
  assert.equal(data.effects.length, 800);
  assert.deepEqual(data.effects.map((entry) => entry.n), Array.from({ length: 800 }, (_, index) => index + 1));
  assert.equal(new Set(data.effects.map((entry) => entry.name)).size, 800);
  const axes = moods.MATCH_AXES;
  const buckets = new Set();
  for (const entry of data.effects) {
    assert.ok(entry.name && entry.group && entry.type, `#${entry.n} identity`);
    assert.ok(entry.motion && entry.motion.score >= 0 && entry.motion.norm >= 0 && entry.motion.norm <= 1, `#${entry.n} motion`);
    buckets.add(entry.motion.bucket);
    for (const axis of axes) {
      const value = entry.axes[axis];
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `#${entry.n} ${axis}=${value}`);
    }
    assert.ok(entry.themes.length >= 1 && entry.themes.length <= 4, `#${entry.n} themes`);
    for (const theme of entry.themes) {
      assert.ok(GENRE_IDS.has(theme.id), `#${entry.n} unknown theme ${theme.id}`);
      assert.ok(theme.w > 0 && theme.w <= 1, `#${entry.n} theme weight`);
    }
    for (let i = 1; i < entry.themes.length; i += 1) {
      assert.ok(entry.themes[i - 1].w >= entry.themes[i].w, `#${entry.n} themes not sorted`);
    }
  }
  assert.equal(buckets.size, classify.MOTION_BUCKETS.length, 'every motion bucket is used');
});

test('the pool stays in sync with the catalog (delta encoding round trip)', () => {
  const byN = new Map(data.effects.map((entry) => [entry.n, entry]));
  for (const entry of catalog.effects) {
    const stored = byN.get(entry.n);
    const expected = JSON.parse(JSON.stringify(entry.style));
    delete expected.palette; // the palette is regenerated from the axes at draw time
    assert.deepEqual(looks.stripDefaults(expected), stored.style, `#${entry.n} style delta`);
    // the parameters the demo draws must survive the encode/decode, not just the
    // types: a base that includes the instance's own values would drop them all
    assert.deepEqual(looks.expand(stored.style), looks.expand(expected), `#${entry.n} delta round trip`);
    assert.deepEqual(stored.clip, entry.clip || null, `#${entry.n} clip`);
  }
  // the classification itself is reproducible from the catalog
  const rebuilt = classify.buildLooksData(catalog);
  assert.deepEqual(
    data.effects.map((entry) => ({ n: entry.n, motion: entry.motion, axes: entry.axes, themes: entry.themes })),
    rebuilt.effects.map((entry) => ({ n: entry.n, motion: entry.motion, axes: entry.axes, themes: entry.themes }))
  );
});

test('expand restores a usable style from the stored delta', () => {
  for (const n of [1, 42, 200, 401, 642, 800]) {
    const entry = pool.get(n);
    const style = looks.expand(entry.style);
    assert.ok(style.animation && style.animation.type, `#${n} animation`);
    assert.ok(style.layout && style.layout.type, `#${n} layout`);
    assert.ok(style.enter && style.enter.type, `#${n} enter`);
    assert.ok(style.exit && style.exit.type, `#${n} exit`);
    assert.ok(style.fill && style.fill.type, `#${n} fill`);
    assert.ok(Array.isArray(style.hold), `#${n} hold stack`);
    assert.ok(Array.isArray(style.edge), `#${n} edge stack`);
    assert.ok(Array.isArray(style.post), `#${n} post stack`);
    assert.equal(style.enter.type, pool.get(n).style.enter.type, `#${n} hero enter stays`);
  }
  assert.deepEqual(looks.expand(null), {});
  assert.deepEqual(looks.expand(pool.get(1).style), looks.expand(looks.stripDefaults(looks.expand(pool.get(1).style))));
});

test('pick is deterministic per seed and stays inside the theme and the axes', () => {
  const calm = { speed: 0.1, energy: 0.1, softness: 0.9, density: 0.3, brightness: 0.5 };
  const loud = { speed: 0.9, energy: 0.95, softness: 0.1, density: 0.8, brightness: 0.9 };
  const same = pool.pick({ axes: calm, seed: 1234 });
  assert.equal(same.n, pool.pick({ axes: calm, seed: 1234 }).n, 'same seed, same look');
  const calmPicks = [];
  const loudPicks = [];
  const rockPicks = [];
  for (let seed = 1; seed <= 120; seed += 1) {
    calmPicks.push(pool.pick({ axes: calm, seed }));
    loudPicks.push(pool.pick({ axes: loud, seed }));
    rockPicks.push(pool.pick({ axes: { speed: 0.9, energy: 0.9, softness: 0.15, density: 0.75, brightness: 0.75 }, genre: 'rock', seed }));
  }
  const meanMotion = (list) => list.reduce((sum, entry) => sum + entry.motion.norm, 0) / list.length;
  const meanSoftness = (list) => list.reduce((sum, entry) => sum + entry.axes.softness, 0) / list.length;
  assert.ok(meanMotion(loudPicks) > meanMotion(calmPicks) + 0.2, `loud ${meanMotion(loudPicks)} vs calm ${meanMotion(calmPicks)}`);
  assert.ok(meanSoftness(calmPicks) > meanSoftness(loudPicks) + 0.06, 'softness follows the axis');
  assert.ok(new Set(calmPicks.map((entry) => entry.n)).size >= 30, 'the draw has variety');
  assert.ok(new Set(loudPicks.map((entry) => entry.n)).size >= 30, 'the draw has variety');
  // a themed draw keeps the average theme weight clearly above the pool average
  const weight = (entry, id) => {
    const theme = entry.themes.find((item) => item.id === id);
    return theme ? theme.w : 0;
  };
  const poolAverage = data.effects.reduce((sum, entry) => sum + weight(entry, 'rock'), 0) / data.effects.length;
  const pickedAverage = rockPicks.reduce((sum, entry) => sum + weight(entry, 'rock'), 0) / rockPicks.length;
  assert.ok(pickedAverage > poolAverage + 0.2, `rock ${pickedAverage.toFixed(2)} vs pool ${poolAverage.toFixed(2)}`);
});

test('pick can exclude looks (re-roll) and falls back when everything is excluded', () => {
  const axes = { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5 };
  const first = pool.pick({ axes, seed: 7 });
  for (let seed = 1; seed <= 20; seed += 1) {
    const entry = pool.pick({ axes, seed, exclude: [first.n] });
    assert.notEqual(entry.n, first.n, 'excluded look returned');
  }
  assert.equal(pool.pick({ axes, seed: 7, exclude: data.effects.map((entry) => entry.n) }), null);
});

test('compose keeps the drawn structure and adjusts palette and text from the axes', () => {
  const axes = { speed: 0.8, energy: 0.9, softness: 0.2, density: 0.7, brightness: 0.8 };
  const entry = pool.pick({ axes, seed: 99 });
  assert.equal(looks.compose(null, { axes }), null, 'a missing entry is not an error');
  const first = pool.compose(entry, { axes, seed: 99, context: { cjk: true, letterCount: 12 } });
  assert.equal(first.look.n, entry.n);
  assert.ok(first.style.palette && first.style.palette.colors.length >= 4, 'palette from the axes');
  assert.ok(first.style.text && first.style.text.size > 0, 'text size from the axes');
  // the drawn entrance stays the drawn entrance (the look's identity)
  assert.equal(first.style.enter.type, looks.expand(entry.style).enter.type);
  // deterministic for the same inputs, varies with the seed
  const again = pool.compose(entry, { axes, seed: 99, context: { cjk: true, letterCount: 12 } });
  const other = pool.compose(entry, { axes, seed: 100, context: { cjk: true, letterCount: 12 } });
  assert.deepEqual(again.style.text, first.style.text);
  assert.notDeepEqual(other.style.palette, first.style.palette);
  // the demo font survives the fine adjustment
  const drawn = looks.expand(entry.style);
  if (drawn.text && drawn.text.fontId) assert.equal(first.style.text.fontId, drawn.text.fontId);
});

// ---------------------------------------------------------------------------
// the profile: type weights and the compose repair

test('compose survives the legibility-repair axes without throwing', () => {
  const axes = { speed: 0.6, energy: 0.55, softness: 0.4, density: 0.5, brightness: 0.45, weird: 0.6, smartness: 0.6, fear: 0 };
  const context = { letterCount: 12, wordCount: 3, cjk: false, aspect: '16:9' };
  for (const entry of data.effects.slice(0, 40)) {
    const composed = pool.compose(entry, { axes, seed: 7, genre: null, direction: 'horizontal', context });
    assert.ok(composed && composed.style, `#${entry.n} compose returned nothing`);
    assert.ok(composed.palette && Array.isArray(composed.palette.colors), `#${entry.n} palette`);
  }
});

test('typeWeights zero removes a type from weightFor and from a composed look', () => {
  const axes = { energy: 0.5, weird: 0 };
  const groups = ['enter', 'exit', 'hold', 'fill', 'edge', 'post', 'layout', 'animation'];
  let checked = 0;
  for (const entry of data.effects) {
    const style = looks.expand(entry.style);
    const group = groups.find((name) => style[name] && (Array.isArray(style[name]) ? style[name].length : style[name].type));
    if (!group) continue;
    const instance = Array.isArray(style[group]) ? style[group][0] : style[group];
    const typeWeights = { [group]: { [instance.type]: 0 } };
    assert.equal(looks.weightFor(entry, { axes, typeWeights }), 0, `#${entry.n} weightFor`);
    const composed = pool.compose(entry, { axes, seed: 3, genre: null, direction: 'horizontal', context: {}, typeWeights });
    const value = composed.style[group];
    const list = Array.isArray(value) ? value : value ? [value] : [];
    assert.ok(!list.some((item) => item && item.type === instance.type), `#${entry.n} kept ${group}.${instance.type}`);
    checked += 1;
    if (checked >= 25) break;
  }
  assert.ok(checked >= 25, `checked ${checked} looks`);
});
