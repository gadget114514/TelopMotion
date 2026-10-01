'use strict';

// The auto-direct size ladder: ten levels from the legibility floor to the
// screen-filling size, walked by the change value v = 1 - (1 - weird)(1 -
// energy) above weird 0 and pinned to 0 at weird 0 (one size for the song).
// `sizeChange` also feeds the density -> letter spacing conversion, which is
// part of the width a "full screen" size is measured against.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const fx = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background']) {
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', `${name}.js`));
}

const SA = {
  fx,
  rng: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'rng.js')),
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
  direct: require(path.join(ROOT, 'renderer', 'js', 'studio', 'direct.js')),
};
globalThis.SA = SA;

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'direct-w0.json'), 'utf8'));

function runFixture(extra) {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const ctx = SA.direct.prepare(doc, {
    axes: FIXTURE.axes,
    seed: FIXTURE.seed,
    genre: null,
    direction: 'horizontal',
    look: null,
    lookClip: null,
    themeStyle: JSON.parse(JSON.stringify(FIXTURE.themeStyle)),
    cueLooks: {},
    analysis: null,
    ...(extra || {}),
  });
  SA.direct.run(doc, ctx);
  return { doc, ctx };
}

// The fixture's beats in song order, with the resolved text style and the
// ladder range each beat was sized against.
function beatRows(doc, ctx) {
  const rows = [];
  for (const cue of doc.script.cues) {
    for (const beat of (doc.beats && doc.beats[cue.id]) || []) {
      const text = SA.project.resolveStyle(doc, `cue:${cue.id}/beat:${beat.id}`).text || {};
      const range = SA.direct.sizeRangeFor(beat, text, ctx, 1);
      rows.push({ cue, beat, text, range, px: text.size * (beat.fontScale || 1) });
    }
  }
  return rows;
}

// The ladder level of an observed px inside one beat's range. The ladder may
// leave the same level twice on a keep, but above v = 0 moving always changes
// the level; the px can still collide when two ranges differ, so the tests
// compare levels.
function levelOf(range, px) {
  let best = 0;
  let bestDistance = Infinity;
  for (let k = 0; k < 10; k += 1) {
    const candidate = Math.round(range.min + ((range.max - range.min) * k) / 9);
    const distance = Math.abs(candidate - px);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = k;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// sizeChange

test('sizeChange is 0 at rest, 1 at weird 1 and monotone in each axis', () => {
  assert.equal(SA.weird.sizeChange({}), 0);
  assert.equal(SA.weird.sizeChange({ weird: 0, energy: 0 }), 0);
  assert.equal(SA.weird.sizeChange({ weird: 1 }), 1);
  assert.equal(SA.weird.sizeChange({ weird: 1, energy: 0 }), 1);
  // weird 0 ignores energy: the one size stays for the whole song
  assert.equal(SA.weird.sizeChange(FIXTURE.axes), 0);
  assert.equal(SA.weird.sizeChange({ weird: 0, energy: 1 }), 0);
  assert.equal(SA.weird.sizeChange({ energy: 0.55 }), 0);
  // above 0 the classic formula stands: 1 - (1 - 0.4)(1 - 0.4)
  assert.ok(Math.abs(SA.weird.sizeChange({ weird: 0.4, energy: 0.4 }) - 0.64) < 1e-9);
  // monotone in weird and in energy
  let previous = -1;
  for (let v = 0; v <= 1.0001; v += 0.05) {
    const value = SA.weird.sizeChange({ weird: Math.min(1, v), energy: 0.4 });
    assert.ok(value >= previous - 1e-12, `weird ${v} fell`);
    previous = value;
  }
  previous = -1;
  for (let v = 0; v <= 1.0001; v += 0.05) {
    const value = SA.weird.sizeChange({ weird: 0.4, energy: Math.min(1, v) });
    assert.ok(value >= previous - 1e-12, `energy ${v} fell`);
    previous = value;
  }
});

test('density does not change sizeChange', () => {
  const base = SA.weird.sizeChange({ weird: 0.6, energy: 0.4 });
  for (const density of [0, 0.25, 0.5, 0.75, 1]) {
    assert.equal(SA.weird.sizeChange({ weird: 0.6, energy: 0.4, density }), base);
  }
});

// ---------------------------------------------------------------------------
// densitySpacing

test('densitySpacing keeps the theme at 0.5 and opens / closes it at the ends', () => {
  assert.equal(SA.direct.densitySpacing(0.012, 0.5), 0.012);
  assert.equal(SA.direct.densitySpacing(0, 0.5), 0);
  assert.equal(SA.direct.densitySpacing(0.05, 0), 0.18);
  assert.equal(SA.direct.densitySpacing(0.05, 1), -0.03);
  assert.equal(SA.direct.densitySpacing(undefined, 0), 0.18, 'no theme value still opens');
  assert.equal(SA.direct.densitySpacing(0.05, undefined), 0.05, 'no density keeps the theme');
  let previous = Infinity;
  for (let v = 0; v <= 1.0001; v += 0.05) {
    const value = SA.direct.densitySpacing(0.02, Math.min(1, v));
    assert.ok(value <= previous + 1e-12, `spacing rose at ${v}`);
    previous = value;
  }
});

test('a density 1 run sets a tighter letterSpacing than the theme', () => {
  const { ctx } = runFixture({ axes: { ...FIXTURE.axes, density: 1 } });
  assert.equal(ctx.themeStyle.text.letterSpacing, -0.03);
  assert.ok(ctx.themeStyle.text.letterSpacing < FIXTURE.themeStyle.text.letterSpacing);
  const loose = runFixture({ axes: { ...FIXTURE.axes, density: 0 } });
  assert.equal(loose.ctx.themeStyle.text.letterSpacing, 0.18);
});

// ---------------------------------------------------------------------------
// maxSizeForLines

test('maxSizeForLines sizes a line against the renderer block limits', () => {
  const options = { frame: { width: 1920, height: 1080 }, lang: 'en' };
  const one = SA.textflow.maxSizeForLines(['Hello world'], options);
  // estimate measurer: 11 chars x 0.55em = 6.05em; 0.94 x 1920 / 6.05
  assert.ok(Math.abs(one - 298.3) < 1, `one line ${one}`);
  // two lines are height-capped long before the width: 0.8 x 1080 / (2 x 1.2)
  const two = SA.textflow.maxSizeForLines(['Hello', 'world'], options);
  assert.ok(Math.abs(two - 360) < 1e-6, `two lines ${two}`);
  // a short single line is not height-capped: its own width cap wins
  assert.ok(SA.textflow.maxSizeForLines(['Alright'], options) > two);
  assert.equal(SA.textflow.maxSizeForLines([], options), 0);
  assert.equal(SA.textflow.maxSizeForLines(['   '], options), 0);
});

test('maxSizeForLines shrinks a spaced line so it does not spill out of the frame', () => {
  const frame = { width: 1920, height: 1080 };
  const plain = SA.textflow.maxSizeForLines(['Hello world'], { frame, style: { letterSpacing: 0 } });
  const spaced = SA.textflow.maxSizeForLines(['Hello world'], { frame, style: { letterSpacing: 0.1 } });
  assert.ok(spaced < plain, `spaced ${spaced} vs plain ${plain}`);
  // the estimate measurer ignores spacing, so the helper adds 0.1em per char
  const expected = (0.94 * 1920) / (6.05 + 0.1 * 'Hello world'.length);
  assert.ok(Math.abs(spaced - expected) < 1, `spaced ${spaced} vs ${expected}`);
});

// ---------------------------------------------------------------------------
// the ladder

function ladderPicks(count, change, seedPath) {
  const ladder = SA.direct.createSizeLadder({ change, baseSize: 96, random: SA.rng.rngFor(999, seedPath) });
  const durations = SA.rng.rngFor(42, `${seedPath}-duration`);
  const range = { min: 60, max: 900 };
  const picks = [];
  for (let i = 0; i < count; i += 1) {
    const duration = 0.3 + durations() * 2.7;
    picks.push(ladder.choose({ duration, range, prev: picks.length ? picks[picks.length - 1] : null }));
  }
  return picks;
}

test('change 1 never repeats a level and balances the screen time', () => {
  const picks = ladderPicks(400, 1, 'ladder-1');
  let previous = null;
  const time = new Array(10).fill(0);
  for (const pick of picks) {
    if (previous) assert.notEqual(pick.level, previous.level, `level ${pick.level} repeated`);
    assert.ok(pick.px >= 60 && pick.px <= 900, `px ${pick.px} out of range`);
    time[pick.level] += 1;
    previous = pick;
  }
  for (let k = 0; k < 10; k += 1) assert.ok(time[k] > 0, `level ${k} was never used`);
  const mean = picks.length / 10;
  for (let k = 0; k < 10; k += 1) {
    assert.ok(Math.abs(time[k] - mean) / mean <= 0.15, `level ${k} got ${time[k]} of ${mean}`);
  }
});

test('the ladder levels include both ends of the range', () => {
  const picks = ladderPicks(400, 1, 'ladder-1');
  const seen = new Set(picks.map((pick) => pick.px));
  assert.ok(seen.has(60), 'the floor level appears');
  assert.ok(seen.has(900), 'the full-screen level appears');
});

test('change 0 keeps baseSize for every beat and draws no random', () => {
  const ladder = SA.direct.createSizeLadder({
    change: 0,
    baseSize: 96,
    random: () => {
      throw new Error('sizeChange 0 drew a random');
    },
  });
  let prev = null;
  for (let i = 0; i < 20; i += 1) {
    const pick = ladder.choose({ duration: 1 + i * 0.1, range: { min: 60, max: 900 }, prev });
    assert.equal(pick.px, 96);
    assert.equal(pick.level, null);
    prev = pick;
  }
});

test('change 0.5 keeps about half the sizes and still balances the levels', () => {
  const picks = ladderPicks(2000, 0.5, 'ladder-half');
  let keeps = 0;
  const time = new Array(10).fill(0);
  for (let i = 0; i < picks.length; i += 1) {
    if (i > 0 && picks[i].level === picks[i - 1].level) keeps += 1;
    time[picks[i].level] += 1;
  }
  const share = keeps / (picks.length - 1);
  assert.ok(share >= 0.4 && share <= 0.6, `keep share ${share}`);
  const mean = picks.length / 10;
  for (let k = 0; k < 10; k += 1) {
    assert.ok(Math.abs(time[k] - mean) / mean <= 0.25, `level ${k} got ${time[k]} of ${mean}`);
  }
});

// ---------------------------------------------------------------------------
// the run

test('a weird run never repeats a neighbour level and stays inside the range', () => {
  const { doc, ctx } = runFixture({ axes: { ...FIXTURE.axes, weird: 1 } });
  const rows = beatRows(doc, ctx);
  assert.ok(rows.length >= 4, `beats ${rows.length}`);
  let previous = null;
  for (const row of rows) {
    const range = SA.direct.sizeRangeFor(row.beat, row.text, ctx, 1);
    assert.ok(row.px >= range.min - 1, `${row.beat.id} px ${row.px} below ${range.min}`);
    assert.ok(row.px <= range.max + 1, `${row.beat.id} px ${row.px} above ${range.max}`);
    const level = levelOf(range, row.px);
    if (previous) assert.notEqual(level, previous, `${row.beat.id} repeats level ${level}`);
    previous = level;
  }
});

test('weird 0 keeps one size for the whole song at any energy', () => {
  for (const energy of [0, 0.55, 1]) {
    const axes = { ...FIXTURE.axes, weird: 0, energy };
    const { doc, ctx } = runFixture({ axes });
    assert.equal(SA.weird.sizeChange(axes), 0);
    for (const [beatId, style] of Object.entries(doc.beatStyles)) {
      assert.equal(style.text.size, ctx.baseSize, `${beatId} is ${style.text.size} at energy ${energy}`);
    }
  }
});

test('weird 0 keeps one size in compose mode too', () => {
  for (const energy of [0, 0.55, 1]) {
    const axes = { ...FIXTURE.axes, weird: 0, energy };
    const { doc, ctx } = runFixture({ axes, compose: true });
    assert.equal(SA.weird.sizeChange(axes), 0);
    let beats = 0;
    for (const cue of doc.script.cues) {
      for (const beat of (doc.beats && doc.beats[cue.id]) || []) {
        beats += 1;
        const style = doc.beatStyles[beat.id];
        assert.ok(style && style.text && style.text.compose, `${beat.id} has a composition`);
        assert.equal(style.text.size, ctx.baseSize, `${beat.id} is ${style.text.size} at energy ${energy}`);
      }
    }
    assert.ok(beats >= 4, `beats ${beats}`);
  }
});

test('a pinned sizeChange still moves the sizes at weird 0', () => {
  const axes = { ...FIXTURE.axes, weird: 0, energy: 0.55 };
  const { doc } = runFixture({ axes, params: { sizeChange: 1 } });
  const sizes = new Set(Object.values(doc.beatStyles).map((style) => style.text.size));
  assert.ok(sizes.size > 1, `a manual change must vary the sizes, got ${[...sizes].join(',')}`);
});

test('the ladder floor never drops below the legibility size threshold', () => {
  const beat = { id: 'b', text: 'Hello world' };
  for (const frame of [{ frameW: 1920, frameH: 1080, portrait: false }, { frameW: 1080, frameH: 1920, portrait: true }]) {
    const range = SA.direct.sizeRangeFor(beat, {}, { ...frame, screen: Math.min(frame.frameW, frame.frameH), lang: 'en' }, 1);
    assert.equal(range.min, Math.max(24, Math.ceil(SA.legibility.MIN_SIZE_RATIO * frame.frameH)));
    // size / frame.height >= MIN_SIZE_RATIO => the legibility `size` reason never fires
    assert.ok(range.min / frame.frameH >= SA.legibility.MIN_SIZE_RATIO - 1e-12, `${frame.frameH}p floor ${range.min}`);
  }
});

// ---------------------------------------------------------------------------
// resizeBeats

test('resizeBeats gives a target a level neither neighbour uses and leaves the rest alone', () => {
  const { doc, ctx } = runFixture({ axes: { ...FIXTURE.axes, weird: 1 } });
  const rows = beatRows(doc, ctx);
  const target = rows[Math.floor(rows.length / 2)];
  const before = new Map(rows.map((row) => [row.beat.id, row.px]));
  SA.direct.resizeBeats(doc, { ...FIXTURE.axes, weird: 1 }, [target.beat.id], 4242);
  const after = beatRows(doc, ctx);
  const index = after.findIndex((row) => row.beat.id === target.beat.id);
  assert.ok(index > 0 && index < after.length - 1, 'the target has both neighbours');
  const targetLevel = levelOf(after[index].range, after[index].px);
  const beforeLevel = levelOf(after[index - 1].range, after[index - 1].px);
  const nextLevel = levelOf(after[index + 1].range, after[index + 1].px);
  assert.notEqual(targetLevel, beforeLevel, 'the target repeats the previous level');
  assert.notEqual(targetLevel, nextLevel, 'the target repeats the next level');
  for (const row of after) {
    if (row.beat.id === target.beat.id) continue;
    assert.equal(row.px, before.get(row.beat.id), `${row.beat.id} moved`);
  }
});

// The app path: with fonts loaded, `measureLine` already includes
// letterSpacing, so `includesSpacing` must stop `maxSizeForLines` from adding
// it a second time. Skipped when the font assets / opentype.js are absent.
const realFontPath = path.join(ROOT, 'renderer', 'fonts', 'NotoSans-Regular.ttf');
let opentype = null;
try {
  opentype = require(path.join(ROOT, 'node_modules', 'opentype.js'));
} catch {
  opentype = null;
}
const hasRealFont = !!opentype && fs.existsSync(realFontPath);

test('a loaded font measurer includes letterSpacing only once', { skip: hasRealFont ? false : 'font assets not available' }, async () => {
  const previousWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window') ? globalThis.window : undefined;
  const previousOpentype = globalThis.opentype;
  const previousPlatform = SA.platform;
  globalThis.window = globalThis;
  globalThis.opentype = opentype;
  SA.platform = { readAsset: async (rel) => fs.readFileSync(path.join(ROOT, 'renderer', rel)) };
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'font.js'));
  try {
    const entry = await SA.lyricsFont.load('NotoSans-Regular');
    SA.lyricsFont.setActive([entry]);
    const style = { fontId: 'NotoSans-Regular', letterSpacing: 0.1 };
    const measurer = SA.textflow.makeMeasurer({ style, lang: 'en' });
    assert.equal(measurer.includesSpacing, true);
    const frame = { width: 1920, height: 1080 };
    const size = SA.textflow.maxSizeForLines(['Hello world'], { frame, style });
    // the measurer's own width is the single source of the spacing: the size
    // would be smaller if the helper added letterSpacing again
    const expected = (0.94 * 1920) / (measurer('Hello world', 100) / 100);
    assert.ok(Math.abs(size - expected) < 1e-6, `font size ${size} vs ${expected}`);
    const plain = SA.textflow.maxSizeForLines(['Hello world'], { frame, style: { fontId: 'NotoSans-Regular', letterSpacing: 0 } });
    assert.ok(size < plain, `spaced ${size} vs plain ${plain}`);
  } finally {
    if (SA.lyricsFont && typeof SA.lyricsFont.setActive === 'function') SA.lyricsFont.setActive([]);
    delete SA.lyricsFont;
    if (previousPlatform === undefined) delete SA.platform;
    else SA.platform = previousPlatform;
    if (previousOpentype === undefined) delete globalThis.opentype;
    else globalThis.opentype = previousOpentype;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

// ---------------------------------------------------------------------------
// the weighted curve (theme profile)

test('a weighted ladder gives every level about its own share of the time', () => {
  const weights = SA.weird.sizeWeights(10, 0.3, 0.2);
  const ladder = SA.direct.createSizeLadder({ change: 1, baseSize: 96, random: SA.rng.rngFor(11, 'weighted'), weights });
  const durations = SA.rng.rngFor(12, 'weighted-duration');
  const range = { min: 60, max: 900 };
  let prev = null;
  const time = new Array(10).fill(0);
  for (let i = 0; i < 3000; i += 1) {
    const duration = 0.3 + durations() * 2.7;
    const pick = ladder.choose({ duration, range, prev });
    time[pick.level] += duration;
    prev = pick;
  }
  const total = time.reduce((sum, value) => sum + value, 0);
  for (let k = 0; k < 10; k += 1) {
    const share = time[k] / total;
    assert.ok(Math.abs(share - weights[k]) <= weights[k] * 0.2 + 0.02, `level ${k} share ${share} vs ${weights[k]}`);
  }
});

test('a low size centre keeps the average size under a high one', () => {
  const average = (center) => {
    const ladder = SA.direct.createSizeLadder({ change: 1, baseSize: 96, random: SA.rng.rngFor(21, `centre-${center}`), center, spread: 0.2 });
    const durations = SA.rng.rngFor(22, `centre-duration-${center}`);
    const range = { min: 60, max: 900 };
    let prev = null;
    let sum = 0;
    for (let i = 0; i < 500; i += 1) {
      const pick = ladder.choose({ duration: 0.3 + durations() * 2.7, range, prev });
      sum += pick.px;
      prev = pick;
    }
    return sum / 500;
  };
  const low = average(0.3);
  const high = average(0.8);
  assert.ok(low < high, `low ${low} high ${high}`);
});

test('centerShift moves the opening pick towards the louder end', () => {
  const range = { min: 60, max: 900 };
  const low = SA.direct.createSizeLadder({ change: 1, baseSize: 96, random: SA.rng.rngFor(31, 'shift'), center: 0.5, spread: 0.15 });
  const high = SA.direct.createSizeLadder({ change: 1, baseSize: 96, random: SA.rng.rngFor(31, 'shift'), center: 0.5, spread: 0.15 });
  const a = low.choose({ duration: 1, range, prev: null, centerShift: 0 });
  const b = high.choose({ duration: 1, range, prev: null, centerShift: 0.35 });
  assert.ok(b.level > a.level, `shift ${a.level} -> ${b.level}`);
});

test('a particle span raises the body floor so every glyph keeps the minimum', () => {
  const ctx = { frameW: 1920, frameH: 1080, portrait: false, screen: 1080, lang: 'en' };
  const beat = { id: 'b', text: 'Hello world' };
  const plain = SA.direct.sizeRangeFor(beat, {}, ctx, 1);
  const withParticle = SA.direct.sizeRangeFor(beat, {}, ctx, 2, 0.55);
  assert.ok(withParticle.floor > plain.floor, `floor ${withParticle.floor} vs ${plain.floor}`);
  assert.ok(withParticle.min >= Math.ceil(SA.legibility.MIN_SIZE_RATIO * 1080 / 0.7) - 1, `min ${withParticle.min}`);
});

test('fitComposeSpans shrinks a hero and raises the particles to the floor', () => {
  const text = {
    size: 150,
    compose: {
      spans: [
        { from: 0, to: 5, scale: 3 },
        { from: 6, to: 8, scale: 0.55 },
      ],
    },
  };
  SA.direct.fitComposeSpans(text, { floor: 100, full: 120 }, 150);
  assert.ok(text.compose.spans[0].scale <= 1.2 + 1e-9, `hero ${text.compose.spans[0].scale}`);
  assert.ok(Math.abs(text.compose.spans[1].scale - 100 / 150) < 0.01, `particle ${text.compose.spans[1].scale}`);
  // without a hero overrun the hero stays
  const plain = { size: 150, compose: { spans: [{ from: 0, to: 5, scale: 1.5 }] } };
  SA.direct.fitComposeSpans(plain, { floor: 60, full: 300 }, 150);
  assert.equal(plain.compose.spans[0].scale, 1.5);
});
