'use strict';

// Classification of the FX 800 catalog for the おまかせ flow.
//
// Every demo is measured with the real motion evaluator (SA.motion) over nine
// frames of a two-second beat and gets
//   - motion: the amplitude of movement (travel, scale, rotation, deform),
//     normalised to 0-1 and bucketed (still / small / medium / large / extreme),
//   - axes: the five mood axes (speed / energy / softness / density / brightness)
//     derived from the recipe (type traits, durations, structure, palette),
//   - themes: the genre profiles each demo fits, with a weight.
//
// `buildLooksData(catalog)` returns the runtime pool: the classification plus
// every style stored as a delta against the effect registry defaults
// (SA.looks.expand restores it), so renderer/data/fx800.looks.json stays small.

const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const requirePart = (relative) => require(path.join(ROOT, relative));

const fx400 = require('./fx400.js');
const moods = requirePart('renderer/js/lyrics/moods.js');
const genres = requirePart('renderer/js/lyrics/genres.js');
const color = requirePart('renderer/js/color.js');
const looks = requirePart('renderer/js/lyrics/looks.js');

const FRAME = { width: 1920, height: 1080 };
const SAMPLE_TIMES = [0, 0.1, 0.25, 0.5, 0.8, 1.1, 1.4, 1.7, 1.95];

// motion magnitude is normalised against this amplitude (roughly the 95th
// percentile of the 800 demos) so the axis matching works on a 0-1 scale
const MOTION_REF = 1.6;
const MOTION_BUCKETS = [
  { id: 'still', label: '静止', max: 0.15 },
  { id: 'small', label: '小', max: 0.5 },
  { id: 'medium', label: '中', max: 1.0 },
  { id: 'large', label: '大', max: 1.4 },
  { id: 'extreme', label: '特大', max: Infinity },
];

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.5;
  return Math.max(0, Math.min(1, number));
}

function round(value, digits) {
  const factor = Math.pow(10, digits == null ? 3 : digits);
  return Math.round(value * factor) / factor;
}

function deformScalar(state) {
  let max = 0;
  for (const item of (state && state.deform) || []) {
    if (!item || typeof item !== 'object') continue;
    const amount = Number(item.amount);
    if (!Number.isFinite(amount)) continue;
    const value = item.type === 'twist' ? Math.abs(amount) / 90 : Math.abs(amount);
    if (value > max) max = value;
  }
  return max;
}

// pairwise amplitude over the sampled frames: how far a letter travels, scales,
// rotates or deforms between any two moments of the beat. Reference-free, so a
// static-but-offset formation (circle, grid...) is not mistaken for movement.
// Each term is capped: a scale or rotation that swings through zero is a big
// change, but it must not drown out travel distance.
function motionMagnitude(states) {
  const height = FRAME.height;
  let max = 0;
  for (let i = 0; i < states.length; i += 1) {
    for (let j = i + 1; j < states.length; j += 1) {
      const a = states[i];
      const b = states[j];
      let sum = 0;
      for (let k = 0; k < a.length; k += 1) {
        const p = a[k];
        const q = b[k];
        const travel = Math.min(1.5, Math.hypot(p.x - q.x, p.y - q.y) / height);
        const scaleRatio = Math.max(0.15, Math.min(6.7, p.scaleX)) / Math.max(0.15, Math.min(6.7, q.scaleX));
        const scale = Math.min(1.6, Math.abs(Math.log(scaleRatio)));
        const rotate = Math.min(1.5, Math.abs((p.rot || 0) - (q.rot || 0)) / 180);
        const depth = Math.min(1, Math.abs((p.z || 0) - (q.z || 0)) / height);
        const deform = Math.min(1, Math.abs(deformScalar(p) - deformScalar(q)));
        const blur = Math.min(1, Math.abs((p.blur || 0) - (q.blur || 0)) / 60);
        sum += travel * travel + 0.6 * scale * scale + 0.6 * rotate * rotate + depth * depth + deform * deform + 0.5 * blur * blur;
      }
      const value = Math.sqrt(sum / Math.max(1, a.length));
      if (value > max) max = value;
    }
  }
  return max;
}

function measureMotion(style) {
  const scene = fx400.measureScene(fx400.SAMPLE_TEXT);
  const states = fx400.evalStates(scene, style, SAMPLE_TIMES);
  return motionMagnitude(states);
}

function bucketIndex(score) {
  for (let i = 0; i < MOTION_BUCKETS.length; i += 1) {
    if (score < MOTION_BUCKETS[i].max) return i;
  }
  return MOTION_BUCKETS.length - 1;
}

// ---------------------------------------------------------------------------
// axes

function traitOf(group, type) {
  const table = moods.TRAITS[group];
  const entry = table && table[type];
  if (!entry) return null;
  return { energy: entry[0], softness: entry[1] };
}

function instancesOf(style) {
  const out = [];
  for (const group of ['animation', 'layout', 'enter', 'exit', 'location', 'fill']) {
    const value = style[group];
    if (value && value.type) out.push({ group, type: value.type, params: value.params || {}, motion: value.motion || {} });
  }
  for (const group of ['hold', 'edge', 'post']) {
    const list = Array.isArray(style[group]) ? style[group] : style[group] ? [style[group]] : [];
    for (const value of list) {
      if (value && value.type) out.push({ group, type: value.type, params: value.params || {}, motion: value.motion || {} });
    }
  }
  return out;
}

function durationSpeed(style) {
  const durations = [];
  const push = (value) => {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0 && number < 20) durations.push(number);
  };
  const enter = style.enter;
  const exit = style.exit;
  if (enter && enter.motion && enter.motion.in) push(enter.motion.in.duration);
  if (exit && exit.motion && exit.motion.out) push(exit.motion.out.duration);
  if (style.animation && style.animation.params) push(style.animation.params.each);
  for (const instance of instancesOf(style)) {
    push(instance.params.interval);
    push(instance.params.duration);
    push(instance.params.period);
    push(instance.params.speed == null ? null : 1 / (0.4 + Number(instance.params.speed)));
    push(instance.params.rate == null ? null : 1 / (0.4 + Number(instance.params.rate)));
  }
  if (!durations.length) return 0.5;
  const average = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  const low = Math.log(0.12);
  const high = Math.log(2.2);
  const t = (Math.log(Math.max(0.1, Math.min(2.5, average))) - low) / (high - low);
  return clamp01(1 - t);
}

function densityAxis(style) {
  let density = 0.3;
  const repeat = style.repeat;
  if (repeat && repeat.type && repeat.type !== 'none') {
    density += repeat.params && repeat.params.copies === 'many' ? 0.25 : 0.15;
  }
  const bgShape = style.bgShape;
  if (bgShape && bgShape.type && bgShape.type !== 'none') density += 0.08;
  const stacks = (Array.isArray(style.hold) ? style.hold.length : 0) + (Array.isArray(style.edge) ? style.edge.length : 0) + (Array.isArray(style.post) ? style.post.length : 0);
  density += Math.min(4, stacks) * 0.04;
  const layout = style.layout && style.layout.type;
  if (['stackedWords', 'vertical', 'grid', 'wave', 'staircase', 'scatter'].includes(layout)) density += 0.08;
  const size = Number(style.text && style.text.size);
  if (Number.isFinite(size) && size > 0) density += clamp01((110 - size) / 120) * 0.15;
  return clamp01(density);
}

function brightnessAxis(style) {
  const colors = (style.palette && style.palette.colors) || [];
  if (!colors.length) return 0.35;
  let sum = 0;
  let count = 0;
  for (const hex of colors.slice(0, 2)) {
    try {
      sum += color.rgbToHsv(color.parse(hex)).v;
      count += 1;
    } catch {
      // ignore malformed colours in the classification
    }
  }
  return count ? clamp01(sum / count) : 0.35;
}

// How far a look strays from a plain line of text: the sixth axis. Distortion,
// glitch, warps and heavy stacks read as odd; fades and rows read as plain.
const WEIRD_GROUPS = {
  animation: { stopMotion: 0.6, timeWarp: 0.5, echo: 0.5, cascade: 0.2, followThrough: 0.2 },
  layout: { scatter: 0.6, spiral: 0.5, circle: 0.4, staircase: 0.3, grid: 0.3, wave: 0.3, arc: 0.3, path: 0.3 },
  enter: { scramble: 0.8, glitchIn: 0.8, particlesAssemble: 0.7, shatterRebuild: 0.8, morphFromPrevious: 0.6, noiseDissolveIn: 0.5, flip3D: 0.5, elasticPop: 0.4 },
  exit: { explode: 0.7, gravityFall: 0.6, dissolve: 0.6, particlesDisperse: 0.7, melt: 0.7, burnAway: 0.7, strokeErase: 0.5, creepOut: 0.4 },
  hold: { letterWarp: 0.8, warp: 0.8, fontSize: 0.7, fillScreen: 0.7, swirl: 0.7, squashStretch: 0.6, jelly: 0.6, wobbleWarp: 0.5, twist: 0.5, shiver: 0.5, orbit3D: 0.4, marquee: 0.4 },
  fill: { fire: 0.6, holographic: 0.5, marble: 0.5, glass: 0.5, rainbowFlow: 0.5, caustics: 0.4 },
  edge: { neonGlow: 0.4, extrude: 0.5, longShadow: 0.4, bevel: 0.4, drip: 0.6 },
  post: {
    turbulentDisplace: 0.9, waveWarp: 0.8, twirl: 0.8, venetianBlinds: 0.8, strobeFlash: 0.8, glitchBlocks: 0.9, glitchSlice: 0.9,
    vhsTracking: 0.8, scanTear: 0.8, dataSmear: 0.8, rgbShift: 0.8, kaleidoscope: 0.8, spinBlur: 0.7, radialWipe: 0.7,
    digitalNoise: 0.7, pixelSort: 0.7, pixelate: 0.6, halftone: 0.6, crt: 0.6, heatHaze: 0.6, shockwave: 0.6, displacementMap: 0.6,
    lensDistortion: 0.6, echoTrail: 0.6, godRays: 0.5, anamorphicStreak: 0.5, zoomBlur: 0.4, lightLeak: 0.4, lightSweep: 0.4,
  },
  background: { tunnel: 0.8, perspectiveGrid: 0.7, cellPattern: 0.6, particleField: 0.5, rays: 0.5, fractalNoise: 0.4, gradient4: 0.4, shapes: 0.4, pattern: 0.3 },
};

function weirdOf(entry) {
  const style = (entry && entry.style) || {};
  let sum = 0;
  let weight = 0;
  for (const [group, table] of Object.entries(WEIRD_GROUPS)) {
    const list = Array.isArray(style[group]) ? style[group] : style[group] ? [style[group]] : [];
    for (const instance of list) {
      const value = table[instance && instance.type];
      if (value == null) continue;
      const w = group === entry.group ? 2.5 : 1;
      sum += value * w;
      weight += w;
    }
  }
  const stack =
    (Array.isArray(style.hold) ? style.hold.length : 0) +
    (Array.isArray(style.edge) ? style.edge.length : 0) +
    (Array.isArray(style.post) ? style.post.length : 0);
  const busy = Math.min(0.2, stack * 0.05);
  const base = weight ? sum / weight : 0.25;
  return round(clamp01(base * 0.85 + busy + 0.05), 3);
}

function axesOf(entry, motionNorm) {
  const style = entry.style || {};
  let energySum = 0;
  let softnessSum = 0;
  let traitWeight = 0;
  for (const instance of instancesOf(style)) {
    const trait = traitOf(instance.group, instance.type);
    if (!trait) continue;
    const weight = instance.group === entry.group ? 2 : 1;
    energySum += trait.energy * weight;
    softnessSum += trait.softness * weight;
    traitWeight += weight;
  }
  const traitEnergy = traitWeight ? energySum / traitWeight : 0.5;
  const traitSoftness = traitWeight ? softnessSum / traitWeight : 0.5;
  return {
    speed: round(durationSpeed(style), 3),
    energy: round(clamp01(0.5 * motionNorm + 0.5 * traitEnergy), 3),
    softness: round(clamp01(traitSoftness), 3),
    density: round(densityAxis(style), 3),
    brightness: round(brightnessAxis(style), 3),
    weird: weirdOf(entry),
  };
}

// ---------------------------------------------------------------------------
// themes

function axesDistance(a, b) {
  const source = a || {};
  const target = b || {};
  let sum = 0;
  // the sixth axis is matched too: a weird look must not answer a plain mood
  const keys = [...moods.MATCH_AXES, 'weird'];
  for (const key of keys) sum += Math.abs(clamp01(source[key] == null ? 0.5 : source[key]) - clamp01(target[key] == null ? 0.5 : target[key]));
  return sum / keys.length;
}

function themesFor(entry, axes) {
  const list = [];
  for (const genre of genres.LIST) {
    let weight = Math.exp(-3 * axesDistance(axes, genre.axes));
    if (entry.group === 'genre' && entry.type === genre.id) weight = Math.max(weight, 1);
    if (entry.group === 'mood' && entry.type === genre.id) weight = Math.max(weight, 1);
    list.push({ id: genre.id, w: weight });
  }
  list.sort((a, b) => b.w - a.w);
  const top = list.slice(0, 4).filter((theme) => theme.w > 0.12);
  const max = top.length ? top[0].w : 1;
  return top.map((theme) => ({ id: theme.id, w: round(theme.w / max, 2) }));
}

// ---------------------------------------------------------------------------
// build

function buildLooksData(catalog, options) {
  const opts = options || {};
  const ref = Number.isFinite(opts.ref) ? opts.ref : MOTION_REF;
  const effects = [];
  const counts = MOTION_BUCKETS.map(() => 0);
  for (const entry of catalog.effects) {
    const score = measureMotion(entry.style);
    const norm = clamp01(score / ref);
    const bucket = bucketIndex(score);
    counts[bucket] += 1;
    const axes = axesOf(entry, norm);
    const style = looks.stripDefaults(entry.style);
    // the palette is regenerated from the axes on every draw; keeping 800
    // one-off palettes in the runtime file would be dead weight
    delete style.palette;
    effects.push({
      n: entry.n,
      name: entry.name || entry.label,
      part: entry.part,
      group: entry.group,
      type: entry.type,
      motion: { score: round(score, 4), norm: round(norm, 3), bucket },
      axes,
      themes: themesFor(entry, axes),
      style,
      clip: entry.clip ? JSON.parse(JSON.stringify(entry.clip)) : null,
    });
  }
  return {
    format: 'telopmotion-fx800-looks',
    version: 1,
    seed: catalog.seed,
    total: effects.length,
    source: 'test/fx800.catalog.json',
    motion: {
      metric: 'SA.motion の9フレーム標本から、レターの移動・拡大縮小・回転・変形の最大振幅（フレーム高で正規化）',
      ref,
      buckets: MOTION_BUCKETS.map((bucket) => ({ id: bucket.id, label: bucket.label, max: bucket.max === Infinity ? null : bucket.max })),
      counts,
    },
    effects,
  };
}

function motionLabel(entry) {
  const index = entry && entry.motion ? entry.motion.bucket : 0;
  const bucket = MOTION_BUCKETS[index] || MOTION_BUCKETS[0];
  return bucket.label;
}

function motionBucket(bucketIndex) {
  return MOTION_BUCKETS[bucketIndex] || MOTION_BUCKETS[0];
}

module.exports = {
  FRAME,
  SAMPLE_TIMES,
  MOTION_REF,
  MOTION_BUCKETS,
  measureMotion,
  motionMagnitude,
  motionLabel,
  motionBucket,
  axesOf,
  weirdOf,
  themesFor,
  axesDistance,
  buildLooksData,
};
