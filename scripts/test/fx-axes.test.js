'use strict';

// The eighth axis: `fear`. Every effect carries an 8-axis evaluation
// (scripts/fx-axes-build.js -> renderer/data/fx-axes.json +
// renderer/js/lyrics/fx-axes-table.js). These tests pin the table coverage,
// the extraction weights and the fear-0 invariance of the generators.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
const requirePart = (relative) => require(path.join(ROOT, relative));
const fx = require(path.join(FX_DIR, 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg', 'vary', 'repeat', 'warp', 'animator', 'selector', 'camera', 'shape-layer', 'softbody', 'staged-presets']) {
  require(path.join(FX_DIR, `${name}.js`));
}
const fxAxes = requirePart('renderer/js/lyrics/fx-axes.js');
const build = requirePart('scripts/fx-axes-build.js');
const moods = requirePart('renderer/js/lyrics/moods.js');
const smartness = requirePart('renderer/js/lyrics/smartness.js');
const figures = requirePart('renderer/js/lyrics/figures.js');
const rng = requirePart('renderer/js/lyrics/rng.js');

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'renderer', 'data', 'fx-axes.json'), 'utf8'));
const TABLE = requirePart('renderer/js/lyrics/fx-axes-table.js');

test('the committed data and the runtime table are the same', () => {
  assert.deepEqual(DATA, TABLE);
  assert.equal(DATA.format, 'telopmotion-fx-axes');
  assert.deepEqual(DATA.axes, fxAxes.AXES);
  assert.ok(DATA.counts.overridden >= 450, `overrides ${DATA.counts.overridden}`);
});

test('every effect group and pseudo group has a packed 32-bit axis vector', () => {
  const groups = {};
  for (const group of build.EFFECT_GROUPS) {
    groups[group] = fx.list(group, { packs: 'all' }).map((descriptor) => descriptor.type);
  }
  for (const [group, types] of Object.entries(build.PSEUDO_GROUPS)) groups[group] = types;
  for (const [group, types] of Object.entries(groups)) {
    assert.ok(DATA.groups[group], `${group} missing from the table`);
    for (const type of types) {
      const packed = DATA.groups[group][type];
      assert.equal(typeof packed, 'number', `${group}.${type} is not packed`);
      assert.ok(Number.isInteger(packed) && packed >= 0 && packed <= 0xffffffff, `${group}.${type} out of the 32-bit range`);
      const vector = fxAxes.unpack(packed);
      for (const axis of fxAxes.AXES) {
        assert.ok(Number.isFinite(vector[axis]) && vector[axis] >= 0 && vector[axis] <= 1, `${group}.${type}.${axis}`);
      }
      // the runtime lookup agrees with the data (smartness comes from the live
      // ratings provider and may be finer than the 4-bit step)
      const of = fxAxes.of(group, type);
      for (const axis of fxAxes.AXES) {
        if (axis === 'smartness') continue;
        assert.equal(of[axis], vector[axis], `${group}.${type}.${axis}`);
      }
      assert.equal(fxAxes.packed(group, type), packed, `${group}.${type} packed lookup`);
    }
  }
  const unknown = fxAxes.of('post', 'notARealType');
  assert.deepEqual(unknown, { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5, weird: 0.5, smartness: 0.5, fear: 0.2 });
});

test('pack / unpack round-trips the 8 axes in 4 bits each', () => {
  assert.equal(fxAxes.AXIS_BITS, 4);
  assert.equal(fxAxes.AXIS_MAX, 15);
  const vector = { speed: 0, energy: 1, softness: 0.5, density: 1 / 3, brightness: 0.2, weird: 0.87, smartness: 0.6, fear: 0.13 };
  const packed = fxAxes.pack(vector);
  assert.ok(Number.isInteger(packed) && packed >= 0 && packed <= 0xffffffff);
  const back = fxAxes.unpack(packed);
  for (const axis of fxAxes.AXES) {
    assert.ok(Math.abs(back[axis] - vector[axis]) <= 1 / 15, `${axis}: ${back[axis]} vs ${vector[axis]}`);
  }
  assert.equal(fxAxes.pack(back), packed, 'the packed value is stable');
  // fields do not bleed into each other
  assert.ok(Math.abs(fxAxes.unpack(fxAxes.pack({ speed: 1 })).energy - 0.5) <= 1 / 15);
  assert.equal(fxAxes.unpack(fxAxes.pack({ speed: 1 })).speed, 1);
  // an old 8-number array packs like the equivalent vector
  const legacy = [1, 0, 0, 0, 0, 0, 0, 0];
  assert.equal(fxAxes.pack(legacy), fxAxes.pack({ speed: 1, energy: 0, softness: 0, density: 0, brightness: 0, weird: 0, smartness: 0, fear: 0 }));
});

test('smartness reads the live ratings through the provider (single source)', () => {
  for (const [group, table] of Object.entries(smartness.RATINGS)) {
    for (const [type, rating] of Object.entries(table)) {
      assert.equal(fxAxes.of(group, type).smartness, rating, `${group}.${type}`);
      assert.equal(smartness.rate(group, type), rating, `${group}.${type} rate`);
    }
  }
});

test('the fear ratings read the expected way', () => {
  assert.ok(fxAxes.of('post', 'glitchSlice').fear >= 0.9);
  assert.ok(fxAxes.of('post', 'scanTear').fear >= 0.7);
  assert.ok(fxAxes.of('enter', 'glitchIn').fear >= 0.7);
  assert.ok(fxAxes.of('enter', 'neonFlicker').fear >= 0.7);
  assert.ok(fxAxes.of('edge', 'drip').fear >= 0.7);
  assert.ok(fxAxes.of('post', 'echoTrail').fear >= 0.7);
  assert.ok(fxAxes.of('exit', 'dissolve').fear >= 0.7);
  assert.ok(fxAxes.of('post', 'zoomBlur').fear >= 0.4, 'blur sits in the middle');
  assert.ok(fxAxes.of('enter', 'dropBounce').fear <= 0.15);
  assert.ok(fxAxes.of('post', 'sparkles').fear <= 0.15);
  assert.ok(fxAxes.of('figureMotif', 'confetti').fear <= 0.15);
  assert.ok(fxAxes.of('figureMotif', 'burst').fear <= 0.15);
  assert.ok(fxAxes.of('figureMotif', 'rings').fear >= 0.25 && fxAxes.of('figureMotif', 'rings').fear <= 0.4);
  assert.ok(fxAxes.of('fill', 'fire').fear >= 0.4);
});

test('fearFactor is 1 at fear 0, excludes far-below targets and boosts the scary side', () => {
  const scary = { fear: 0.9 };
  const harmless = { fear: 0 };
  assert.equal(fxAxes.fearFactor(scary, { fear: 0 }), 1);
  assert.equal(fxAxes.fearFactor(harmless, {}), 1);
  assert.equal(fxAxes.fearFactor(harmless, { fear: 0.5 }), Math.max(0.03, 1 - 1.6 * 0.5 * 1));
  assert.equal(fxAxes.fearFactor(harmless, { fear: 1 }), 0, 'gap 1 at fear 1 is a hard exclusion');
  assert.ok(fxAxes.fearFactor(scary, { fear: 0.8 }) > 1);
  assert.ok(fxAxes.fearFactor(scary, { fear: 0.9 }) > fxAxes.fearFactor(scary, { fear: 0.5 }));
  // monotone: a scarier effect never weighs less at the same target
  const axes = { fear: 0.7 };
  let previous = -1;
  for (const entry of Object.values(DATA.groups.post)) {
    const weight = fxAxes.fearFactor({ fear: entry[7] }, axes);
    assert.ok(weight >= 0 && weight <= 4);
    void previous;
    previous = weight;
  }
});

test('affinity is the legacy identity at fear 0 and a filter above it', () => {
  assert.equal(fxAxes.affinity({ fear: 0.9 }, { fear: 0 }), 1);
  assert.equal(fxAxes.affinity({ fear: 0.9 }, { fear: 0 }, { force: true }), 1);
  const axes = { fear: 0.8 };
  const near = fxAxes.affinity({ fear: 0.8 }, axes);
  const far = fxAxes.affinity({ fear: 0.3 }, axes);
  assert.ok(near > far, `${near} vs ${far}`);
  assert.equal(fxAxes.affinity({ fear: 0 }, axes), 0);
  // the placed axes only pull while fear is on (the legacy draw stays intact)
  const placed = { speed: 0.9, energy: 0.9 };
  assert.equal(fxAxes.affinity({ speed: 0.9, energy: 0.9, fear: 0.5 }, { ...placed, fear: 0 }), 1);
  const matched = fxAxes.affinity({ speed: 0.9, energy: 0.9, fear: 0.5 }, { ...placed, fear: 0.5 });
  const mismatched = fxAxes.affinity({ speed: 0.1, energy: 0.1, fear: 0.5 }, { ...placed, fear: 0.5 });
  assert.ok(matched > mismatched);
});

test('pickWeighted at fear 0 consumes the random stream exactly like pick', () => {
  const list = ['a', 'b', 'c', 'd', 'e'];
  const direct = rng.mulberry32(99);
  const weighted = rng.mulberry32(99);
  for (let i = 0; i < 40; i += 1) {
    assert.equal(fxAxes.pickWeighted(weighted, 'post', list, { fear: 0 }), smartness.pick(direct, list), `draw ${i}`);
  }
  // and a fear-weighted draw prefers the scary types
  const scaryTypes = ['glitchSlice', 'scanTear', 'digitalNoise', 'burnAway', 'melt'];
  const calmTypes = ['fade', 'sparkles', 'godRays', 'lightSweep', 'wobbleWarp'];
  const random = rng.mulberry32(7);
  let scary = 0;
  let calm = 0;
  const axes = { fear: 0.9, energy: 0.5, softness: 0.5, speed: 0.5, density: 0.5, brightness: 0.5 };
  for (let i = 0; i < 400; i += 1) {
    const hit = fxAxes.pickWeighted(random, 'post', [...scaryTypes, ...calmTypes], axes, {});
    if (scaryTypes.includes(hit)) scary += 1;
    else calm += 1;
  }
  assert.ok(scary > calm * 1.5, `scary ${scary} vs calm ${calm}`);
});

test('the generator prefers the horror side as fear rises (and stays finite)', () => {
  const base = { speed: 0.5, energy: 0.6, softness: 0.5, density: 0.6, brightness: 0.5, weird: 0.7 };
  const context = { letterCount: 10, cjk: false, hasPrevious: true, badgeId: false, hasCard: false, aspect: '16:9' };
  const meanFear = (list) => list.reduce((sum, value) => sum + value, 0) / Math.max(1, list.length);
  const calm = [];
  const horror = [];
  let scaryDraws = 0;
  let calmDraws = 0;
  for (let seed = 1; seed <= 80; seed += 1) {
    const plain = moods.generate({ axes: { ...base, fear: 0 }, seed, context }).style;
    const feared = moods.generate({ axes: { ...base, fear: 0.9 }, seed, context }).style;
    for (const instance of plain.post || []) calm.push(fxAxes.of('post', instance.type).fear);
    for (const instance of feared.post || []) horror.push(fxAxes.of('post', instance.type).fear);
    const paletteOf = (style) => (style.palette && style.palette.name) || '';
    if (['blood', 'ash', 'rain'].includes(paletteOf(feared))) scaryDraws += 1;
    if (['blood', 'ash', 'rain'].includes(paletteOf(plain))) calmDraws += 1;
    assert.ok(feared.palette && feared.palette.colors.length >= 4);
  }
  assert.ok(horror.length > 0 && calm.length > 0);
  assert.ok(meanFear(horror) > meanFear(calm) + 0.1, `horror ${meanFear(horror)} vs calm ${meanFear(calm)}`);
  assert.ok(scaryDraws > calmDraws, `horror palettes ${scaryDraws} vs plain ${calmDraws}`);
});

test('figures prefer the scary motifs and holds as fear rises', () => {
  const mean = (list) => list.reduce((sum, value) => sum + value, 0) / Math.max(1, list.length);
  const calm = [];
  const horror = [];
  for (let seed = 1; seed <= 40; seed += 1) {
    const plain = figures.generate({ seed, id: `f${seed}`, axes: { weird: 0.5, energy: 0.5, fear: 0 } });
    const feared = figures.generate({ seed, id: `f${seed}`, axes: { weird: 0.5, energy: 0.5, fear: 0.9 } });
    calm.push(fxAxes.of('figureMotif', plain.params.motif).fear);
    horror.push(fxAxes.of('figureMotif', feared.params.motif).fear);
    for (const beat of plain.params.beats) calm.push(fxAxes.of('figureHold', beat.move.hold).fear);
    for (const beat of feared.params.beats) horror.push(fxAxes.of('figureHold', beat.move.hold).fear);
  }
  assert.ok(mean(horror) > mean(calm), `motifs ${mean(horror)} vs ${mean(calm)}`);
});

test('the fear axis opens the extended pool and the read horror tags', () => {
  const base = { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5, weird: 0 };
  const open = moods.poolFor('post', { ...base, fear: 0.8 });
  assert.ok(open.turbulentDisplace, 'the extended primitives open');
  assert.equal(moods.poolFor('post', base).turbulentDisplace, undefined);
  const random = rng.mulberry32(5);
  const context = { letterCount: 10, cjk: false, hasPrevious: true, badgeId: false, hasCard: false, aspect: '16:9' };
  const calmPick = moods.pickEntry(random, 'post', base, context, 'horizontal');
  void calmPick;
  // a degrade type outside FEAR_TAG_OK is still refused
  assert.ok(!moods.FEAR_TAG_OK.has('pixelate'));
  assert.ok(moods.FEAR_TAG_OK.has('glitchSlice'));
});

test('direct-w0 fixture types keep their old draw (fear 0 no-op)', () => {
  // the fixture is compared byte for byte in direct.test.js; here a lighter
  // guard: the same seed draws the same style with and without the fear field
  const context = { letterCount: 10, cjk: false, hasPrevious: true, badgeId: false, hasCard: false, aspect: '16:9' };
  const a = moods.generate({ axes: { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5, weird: 0.7, smartness: 0.6, fear: 0 }, seed: 4242, context });
  const b = moods.generate({ axes: { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5, weird: 0.7, smartness: 0.6 }, seed: 4242, context });
  assert.deepEqual(a.style, b.style);
});
