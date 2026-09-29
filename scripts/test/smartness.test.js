'use strict';

// The seventh axis: `smartness`. Every effect carries a rating; below
// s - 0.45 it is dropped, above it only loses weight. s = 0 is the engine
// default and disables the filter entirely (every existing draw stays
// byte-identical), so the tests pin both ends.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
const fx = require(path.join(FX_DIR, 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg', 'vary', 'repeat', 'warp', 'animator', 'selector', 'camera', 'shape-layer', 'staged-presets']) {
  require(path.join(FX_DIR, `${name}.js`));
}
const moods = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'moods.js'));
const figures = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'figures.js'));
const smartness = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'smartness.js'));
const rng = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'rng.js'));

const CONTEXT = { letterCount: 10, cjk: false, hasPrevious: true, badgeId: false, hasCard: false, aspect: '16:9' };
const SMART_AXES = { speed: 0.5, energy: 0.6, softness: 0.5, density: 0.6, brightness: 0.5, weird: 0.9, smartness: 0.9 };

function randomFor(index, tag) {
  return rng.rngFor(1000 + index, 'smartness-test', tag);
}

test('weight is disabled at 0, zero below the floor and monotonic in the rating', () => {
  assert.equal(smartness.weight(0, 0), 1);
  assert.equal(smartness.weight(0.5, 0), 1);
  assert.equal(smartness.weight(0.9, 0), 1);
  // rating < s - FLOOR_GAP is a hard exclusion
  assert.equal(smartness.weight(0.1, 0.9), 0);
  assert.equal(smartness.weight(0.45 - 1e-9, 0.9), 0);
  assert.equal(smartness.weight(0.45, 0.9) > 0, true);
  assert.equal(smartness.ok('post', 'vignette', 0.9), false);
  assert.equal(smartness.ok('post', 'bloom', 0.9), true);
  // monotonic: a better rating never weighs less
  for (const s of [0.3, 0.6, 0.9, 1]) {
    let previous = -1;
    for (let rating = 0; rating <= 1.0001; rating += 0.05) {
      const weight = smartness.weight(Math.min(1, rating), s);
      assert.ok(weight >= previous - 1e-9, `s ${s}: ${rating} weighs less than the previous step`);
      assert.ok(weight >= 0 && weight <= 1, `s ${s}: weight ${weight} outside 0..1`);
      previous = weight;
    }
  }
  // neutral types (not listed) are legal but weaker than the refined end
  assert.equal(smartness.rate('post', 'notARealType'), 0.5);
});

test('pickWeighted at s=0 consumes the random stream exactly like pick', () => {
  const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const direct = rng.mulberry32(77);
  const weighted = rng.mulberry32(77);
  for (let i = 0; i < 50; i += 1) {
    const expected = smartness.pick(direct, list);
    const actual = smartness.pickWeighted(weighted, 'post', list, 0);
    assert.equal(actual, expected, `draw ${i}`);
  }
  // the same holds through an actual generator call
  const a = moods.pickEntry(rng.mulberry32(3), 'post', { ...SMART_AXES, smartness: 0 }, CONTEXT, 'horizontal');
  const b = moods.pickEntry(rng.mulberry32(3), 'post', { ...SMART_AXES, smartness: 0 }, CONTEXT, 'horizontal');
  assert.equal(a, b);
});

test('s=0 is the engine default and projectSmartness opens at the UI default', () => {
  assert.equal(moods.SMART_DEFAULT, 0.6);
  assert.equal(smartness.SMART_DEFAULT, 0.6);
  assert.equal(moods.smartOf({}), 0);
  assert.equal(moods.smartOf({ smartness: 0.4 }), 0.4);
  assert.equal(moods.smartOf({ smartness: 2 }), 1);
  assert.equal(moods.normalizeAxes({}).smartness, 0);
  assert.equal(moods.projectSmartness(null), 0.6);
  assert.equal(moods.projectSmartness({}), 0.6);
  assert.equal(moods.projectSmartness({ styleMode: {} }), 0.6);
  assert.equal(moods.projectSmartness({ styleMode: { axes: { smartness: 0 } } }), 0);
  assert.equal(moods.projectSmartness({ styleMode: { axes: { smartness: 0.3 } } }), 0.3);
});

test('at 0.9 the post and hold pools never draw the tacky end', () => {
  const bannedPost = new Set(['vignette', 'lensFlare', 'sparkles', 'strobeFlash', 'crt', 'twirl', 'glitchBlocks', 'rgbShift', 'scanTear', 'vhsTracking']);
  const bannedHold = new Set(['pulse', 'heartbeat', 'jitter', 'shiver', 'opacityPulse', 'jelly', 'squashStretch', 'swirl', 'beatPulse']);
  for (let seed = 1; seed <= 200; seed += 1) {
    const post = moods.pickEntry(randomFor(seed, 'post'), 'post', SMART_AXES, CONTEXT, 'horizontal');
    assert.ok(post && !bannedPost.has(post), `post seed ${seed}: ${post}`);
    const hold = moods.pickEntry(randomFor(seed, 'hold'), 'hold', SMART_AXES, CONTEXT, 'horizontal');
    assert.ok(hold && !bannedHold.has(hold), `hold seed ${seed}: ${hold}`);
  }
});

test('at 0.9 the figure motifs / moves never draw ribbon, confetti or a pulsing hold', () => {
  const banned = new Set(['ribbon', 'confetti']);
  for (let seed = 1; seed <= 200; seed += 1) {
    const figure = figures.generate({ span: { start: 0, end: 4 }, axes: SMART_AXES, seed }).params;
    assert.ok(!banned.has(figure.motif), `motif seed ${seed}: ${figure.motif}`);
    for (const beat of figure.beats) {
      assert.notEqual(beat.move.in, 'scatterIn', `in seed ${seed}`);
      assert.notEqual(beat.move.hold, 'pulse', `hold seed ${seed}`);
      assert.notEqual(beat.move.out, 'burstOut', `out seed ${seed}`);
    }
  }
});

test('at 0.9 the backdrop motion and split motion never draw the per-beat pulse / breathe', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const motion = moods.backdropMotion(randomFor(seed, 'backdrop'), 0.9, SMART_AXES);
    assert.notEqual(motion.mode, 'pulse', `backdrop mode seed ${seed}`);
    assert.notEqual(motion.transition, 'rotate', `transition seed ${seed}`);
    const spec = moods.splitSpec(SMART_AXES, randomFor(seed, 'split'), ['#112233', '#223344', '#eeeeee', '#ff9900', '#334455', '#ffcc00'], 0.8, null);
    assert.notEqual(spec.params.motion, 'breathe', `split motion seed ${seed}`);
    if (spec.params.motion === 'breathe') assert.ok(spec.params.every);
  }
});

test('at 0.9 the generated background carries glow 0 (no centre bright mask)', () => {
  let gradientish = 0;
  for (let seed = 1; seed <= 80; seed += 1) {
    const result = moods.rerollClipSpec('background', { axes: SMART_AXES, seed });
    assert.ok(result, `seed ${seed}`);
    if (result.spec.type === 'gradient' || result.spec.type === 'noiseGradient') {
      gradientish += 1;
      assert.equal(result.spec.params.glow, 0, `seed ${seed} glow ${result.spec.params.glow}`);
    }
  }
  assert.ok(gradientish > 0, 'the smart background still draws a gradient sometimes');
  // at smartness 0 the glow key is not written at all (the shader default stays)
  const plain = moods.rerollClipSpec('background', { axes: { ...SMART_AXES, smartness: 0 }, seed: 1 });
  assert.equal(plain.spec.params.glow, undefined);
});

test('rateSpec walks combos, split motion, figure moves and pattern modes', () => {
  const combo = {
    type: 'combo',
    params: {
      list: [
        { type: 'split', params: { layout: 'halves', motion: 'breathe' } },
        { type: 'figures', params: { motif: 'ribbon', beats: [{ move: { in: 'pop', hold: 'pulse', out: 'fade' } }] } },
      ],
    },
  };
  assert.equal(smartness.rateSpec(combo), 0.1);
  assert.equal(smartness.rateSpec({ type: 'figures', params: { motif: 'frame', beats: [{ move: { in: 'draw', hold: 'drift', out: 'fade' } }] } }), 0.75);
  assert.equal(smartness.rateSpec({ type: 'pattern', params: { mode: 'randomFill' } }), 0.35);
  assert.equal(smartness.rateSpec({ type: 'gradient', params: { glow: 0 } }), 0.6);
  assert.equal(smartness.rateSpec({ type: 'spectrum', params: {} }), 1);
  assert.equal(smartness.rateSpec(null), 1);
});

test('rateStyle reports the minimum and the offenders; prune drops them from the stacks', () => {
  const style = {
    post: [{ type: 'vignette', params: {} }, { type: 'bloom', params: {} }],
    hold: [{ type: 'drift', params: {} }],
    enter: { type: 'fade', params: {} },
  };
  const rated = smartness.rateStyle(style);
  assert.equal(rated.min, 0.1);
  assert.ok(rated.mean > 0.1 && rated.mean < 1);
  assert.ok(rated.offenders.some((entry) => entry.group === 'post' && entry.type === 'vignette'));
  const pruned = smartness.prune(style, 0.6);
  assert.deepEqual(pruned.post.map((entry) => entry.type), ['bloom']);
  assert.deepEqual(pruned.hold.map((entry) => entry.type), ['drift']);
  assert.equal(pruned.enter.type, 'fade');
  // s=0 is a no-op that returns the same object
  assert.equal(smartness.prune(style, 0), style);
});

test('every rated name exists in the registry and every rating is in 0..1', () => {
  const realGroups = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background'];
  for (const group of realGroups) {
    const known = new Set(fx.list(group, { packs: 'all' }).map((descriptor) => descriptor.type));
    for (const [type, rating] of Object.entries(smartness.RATINGS[group] || {})) {
      assert.ok(known.has(type), `${group}.${type} is not a registered type`);
      assert.ok(rating >= 0 && rating <= 1, `${group}.${type} rating ${rating}`);
    }
  }
  const pseudo = {
    figureMotif: figures.MOTIFS,
    figureIn: figures.INS,
    figureHold: figures.HOLDS,
    figureOut: figures.OUTS,
    backdropMotion: moods.BACKDROP_MOTIONS,
    splitScheme: moods.SPLIT_SCHEMES,
    splitMotion: ['none', 'slide', 'rotate', 'breathe', 'swap', 'drift', 'push'],
    transition: ['wipe', 'scale', 'rotate', 'iris', 'cut'],
  };
  for (const [group, list] of Object.entries(pseudo)) {
    const known = new Set(list);
    for (const [type, rating] of Object.entries(smartness.RATINGS[group] || {})) {
      assert.ok(known.has(type), `${group}.${type} is not a known ${group}`);
      assert.ok(rating >= 0 && rating <= 1, `${group}.${type} rating ${rating}`);
    }
  }
  const fillerRender = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-render.js'));
  const patternParam = (fillerRender.paramsOf('pattern') || []).find((param) => param.key === 'mode');
  const patternModes = new Set((patternParam && patternParam.options) || []);
  for (const [type, rating] of Object.entries(smartness.RATINGS.pattern || {})) {
    assert.ok(patternModes.has(type), `pattern.${type} is not a filler pattern mode`);
    assert.ok(rating >= 0 && rating <= 1, `pattern.${type} rating ${rating}`);
  }
});
