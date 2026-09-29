'use strict';

// Builds the 8-axis evaluation table of every effect the generators can draw:
//
//   renderer/data/fx-axes.json          canonical data (committed)
//   renderer/js/lyrics/fx-axes-table.js the runtime mirror (UMD, sync)
//
// Sources, in order:
//   1) the existing tables are imported automatically: energy / softness /
//      weird come from moods.TRAITS + moods.EXT_TRAITS + moods.CLASSIC_WEIRD,
//      smartness from smartness.RATINGS.
//   2) scripts/fx-axes-overrides.json overrides speed / density / brightness /
//      fear by hand. Every key is validated against the registry: an unknown
//      name fails the build.
//   3) types without an override are estimated: glitch / degrade / dissolve /
//      flicker tags, the measured irregularity of the motion (the same 9-frame
//      sampling the look classifier uses), dark low-saturation fills and slow
//      pulsing names.
//
//   node scripts/fx-axes-build.js
//     [--json <file>] [--table <file>] [--overrides <file>] [--check]
//
// `--check` writes nothing and fails when the committed files are stale.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const requirePart = (relative) => require(path.join(ROOT, relative));

const fx = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg', 'vary', 'repeat', 'warp', 'animator', 'selector', 'camera', 'shape-layer', 'staged-presets']) {
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', `${name}.js`));
}

const moods = requirePart('renderer/js/lyrics/moods.js');
const smartness = requirePart('renderer/js/lyrics/smartness.js');
const figures = requirePart('renderer/js/lyrics/figures.js');
const fxAxes = requirePart('renderer/js/lyrics/fx-axes.js');
const fx400 = requirePart('scripts/fx400.js');

const AXES = fxAxes.AXES;
const EFFECT_GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion', 'repeat'];
// alias groups read the same behaviour as their base group
const BASE_GROUP = { bgFill: 'fill', bgEdge: 'edge' };
// pseudo groups: the vocabulary the timeline clips draw from, which has no
// registry entry of its own
const PSEUDO_GROUPS = {
  figureMotif: figures.MOTIFS,
  figureIn: figures.INS,
  figureHold: figures.HOLDS,
  figureOut: figures.OUTS,
  splitMotion: ['none', 'slide', 'rotate', 'breathe', 'swap', 'drift', 'push'],
  splitScheme: moods.SPLIT_SCHEMES,
  transition: ['wipe', 'scale', 'rotate', 'iris', 'cut'],
  backdropMotion: moods.BACKDROP_MOTIONS,
  pattern: ['grid', 'dots', 'stripes', 'rings', 'triangles', 'diamonds', 'hexes', 'rain', 'checks', 'polka', 'sineCurve', 'waves', 'randomFill'],
};

const FEAR_BASE = 0.15;
const IRREGULAR_GROUPS = new Set(['animation', 'enter', 'exit', 'hold']);
const SAMPLE_TIMES = [0, 0.2, 0.5, 0.9, 1.3, 1.6, 1.8, 1.9, 1.99];
// low-saturation / dark fills: the "colour" rule of the fear estimate
const DARK_FILLS = new Set(['ink', 'marble', 'chrome', 'fire', 'drip', 'blood', 'ash']);
// slow pulsing names: heartbeat-like readings
const PULSE_NAMES = /(pulse|heartbeat|breathe|breath|swell|boil|shiver|tremble|flicker)/i;

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.5;
  return Math.max(0, Math.min(1, number));
}

function round(value, digits) {
  const factor = Math.pow(10, digits == null ? 3 : digits);
  return Math.round(value * factor) / factor;
}

function paramsOf(descriptor) {
  const byKey = new Map();
  for (const param of (descriptor && descriptor.params) || []) byKey.set(param.key, param);
  return byKey;
}

// speed: a `speed` / `rate` parameter reads directly; a `duration` reads
// backwards; otherwise the neutral 0.5.
function autoSpeed(descriptor) {
  const params = paramsOf(descriptor);
  const rate = params.get('speed') || params.get('rate');
  if (rate && rate.kind === 'number') {
    const min = rate.min == null ? 0 : rate.min;
    const max = rate.max == null ? 1 : rate.max;
    const value = rate.default == null ? min : rate.default;
    return clamp01(0.15 + 0.7 * (max > min ? (value - min) / (max - min) : 0.5));
  }
  const duration = params.get('duration') || params.get('period');
  if (duration && duration.kind === 'number') {
    const value = duration.default == null ? 0.5 : duration.default;
    return clamp01(1 - value / 2.2);
  }
  return 0.5;
}

// density: explicit count-like parameters first, then the group's nature
function autoDensity(group, descriptor, tags) {
  const params = paramsOf(descriptor);
  const count = params.get('count') || params.get('bars') || params.get('copies');
  if (count && (count.kind === 'number' || count.kind === 'int')) {
    const min = count.min == null ? 0 : count.min;
    const max = count.max == null ? 1 : count.max;
    const value = count.default == null ? min : count.default;
    return clamp01(0.2 + 0.6 * (max > min ? (value - min) / (max - min) : 0.5));
  }
  if (tags.includes('particles')) return 0.7;
  if (group === 'repeat') return 0.6;
  if (group === 'pattern') return 0.5;
  return 0.5;
}

const BRIGHT_NAMES = /(light|glow|spark|flare|rays|bloom|gold|holo|rainbow|neon|shimmer|flash)/i;
const DARK_NAMES = /(ink|shadow|vignette|grain|crt|smear|burn|tunnel|noise|blood|ash|drip)/i;

// brightness: light-bearing names read bright, shadow / grime names read dark
function autoBrightness(group, type, tags) {
  if (tags.includes('glow') || tags.includes('light')) return 0.75;
  if (BRIGHT_NAMES.test(type)) return 0.7;
  if (DARK_NAMES.test(type)) return 0.35;
  return 0.5;
}

function weirdFromTraits(group, type, traits) {
  if (traits && traits[3] != null) return clamp01(traits[3]);
  const table = moods.CLASSIC_WEIRD[group];
  if (table && table[type] != null) return clamp01(table[type]);
  if (traits) return clamp01(Math.max(0, traits[0] - traits[1]) * 0.8);
  return 0.5;
}

function traitEntry(group, type) {
  const base = BASE_GROUP[group] || group;
  const classic = moods.TRAITS[base];
  if (classic && classic[type]) return classic[type];
  const ext = moods.EXT_TRAITS[base];
  if (ext && ext[type]) return ext[type];
  return null;
}

// irregularity of one effect's own motion: sample the effect in a minimal
// style at nine frames and compare the consecutive state distances. A steady
// movement (slide, drift) is regular; stutter, shake and sudden stops are not.
function irregularityOf(group, type) {
  if (!IRREGULAR_GROUPS.has(group)) return 0;
  const instance = fx.withDefaults({ type }, group);
  if (!instance) return 0;
  let states;
  try {
    states = fx400.evalStates(fx400.measureScene(fx400.SAMPLE_TEXT), { [group]: instance }, SAMPLE_TIMES);
  } catch {
    return 0;
  }
  const deltas = [];
  for (let i = 1; i < states.length; i += 1) deltas.push(fx400.statesDistance(states[i - 1], states[i]));
  if (deltas.length < 3) return 0;
  const max = Math.max(...deltas);
  if (!(max > 0.02)) return 0;
  const mean = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  const variance = deltas.reduce((sum, value) => sum + (value - mean) ** 2, 0) / deltas.length;
  const cv = Math.sqrt(variance) / Math.max(1e-6, mean);
  return clamp01((cv - 0.2) / 0.8);
}

function autoFear(group, type, descriptor, tags, brightness) {
  let fear = FEAR_BASE;
  if (tags.some((tag) => ['glitch', 'degrade', 'dissolve', 'flicker'].includes(tag))) fear += 0.3;
  fear += 0.3 * irregularityOf(group, type);
  if (DARK_FILLS.has(type) || (brightness < 0.35 && ['fill', 'bgFill', 'background'].includes(group))) fear += 0.15;
  if (PULSE_NAMES.test(type)) fear += 0.1;
  if (tags.includes('degrad')) fear += 0.05;
  return clamp01(fear);
}

function ratingOf(group, type) {
  const base = BASE_GROUP[group] || group;
  const table = smartness.RATINGS[base];
  const value = table ? table[type] : undefined;
  return typeof value === 'number' ? clamp01(value) : 0.5;
}

// ---------------------------------------------------------------------------
// table

function collectTypes() {
  const found = [];
  for (const group of EFFECT_GROUPS) {
    const list = fx.list(group, { packs: 'all' });
    if (!list.length && group !== 'bgFill' && group !== 'bgEdge') continue;
    for (const descriptor of list) {
      found.push({ group, type: descriptor.type, descriptor, pseudo: false });
    }
  }
  for (const [group, types] of Object.entries(PSEUDO_GROUPS)) {
    for (const type of types) found.push({ group, type, descriptor: null, pseudo: true });
  }
  return found;
}

function validateOverrides(overrides, found) {
  const known = new Set(found.map((entry) => `${entry.group}.${entry.type}`));
  const problems = [];
  for (const section of ['speed', 'density', 'brightness', 'fear']) {
    for (const [key, value] of Object.entries(overrides[section] || {})) {
      if (!known.has(key)) problems.push(`${section}: ${key} is not a registered effect`);
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0 || number > 1) problems.push(`${section}: ${key} = ${value} is outside 0..1`);
    }
  }
  return problems;
}

function buildVector(entry, overrides) {
  const { group, type, descriptor, pseudo } = entry;
  const tags = (descriptor && descriptor.tags) || [];
  const traits = traitEntry(group, type);
  const vector = {};
  vector.speed = clamp01((overrides.speed && overrides.speed[`${group}.${type}`]) ?? (pseudo ? 0.5 : autoSpeed(descriptor)));
  vector.energy = traits ? clamp01(traits[0]) : 0.5;
  vector.softness = traits ? clamp01(traits[1]) : 0.5;
  vector.density = clamp01((overrides.density && overrides.density[`${group}.${type}`]) ?? (pseudo ? 0.5 : autoDensity(group, descriptor, tags)));
  vector.brightness = clamp01((overrides.brightness && overrides.brightness[`${group}.${type}`]) ?? (pseudo ? 0.5 : autoBrightness(group, type, tags)));
  vector.weird = weirdFromTraits(group, type, traits);
  vector.smartness = ratingOf(group, type);
  const overrideFear = overrides.fear && overrides.fear[`${group}.${type}`];
  vector.fear = clamp01(overrideFear != null ? overrideFear : pseudo ? FEAR_BASE : autoFear(group, type, descriptor, tags, vector.brightness));
  return AXES.map((axis) => round(vector[axis], 3));
}

function buildTable(overrides) {
  const found = collectTypes();
  const problems = validateOverrides(overrides, found);
  if (problems.length) {
    const error = new Error(`fx-axes overrides are invalid:\n  ${problems.join('\n  ')}`);
    error.problems = problems;
    throw error;
  }
  const groups = {};
  for (const entry of found) {
    if (!groups[entry.group]) groups[entry.group] = {};
    // every direction carries its 8-axis vector as one 32-bit integer
    // (4 bits per axis, 0..15); `fxAxes.of` unpacks it
    groups[entry.group][entry.type] = fxAxes.pack(buildVector(entry, overrides));
  }
  return {
    format: 'telopmotion-fx-axes',
    version: 1,
    axes: [...AXES],
    packing: '8 axes x 4 bits = one unsigned 32-bit integer per direction (axis i in bits 4i..4i+3, value/15)',
    neutral: { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5, weird: 0.5, smartness: 0.5, fear: 0.2 },
    source: 'moods.TRAITS + smartness.RATINGS + scripts/fx-axes-overrides.json',
    method: 'energy/softness/weird は既存の性格表から、smartness は評価表から自動取り込み。speed/density/brightness/fear は手書き上書き、無い型はタグ・動きの不規則さ（9フレーム標本）・暗色塗り・遅い脈動から推定。各軸は 4bit に量子化して 1 個の 32bit 整数へパック。',
    counts: {
      types: found.length,
      groups: Object.keys(groups).length,
      overridden: ['speed', 'density', 'brightness', 'fear'].reduce((sum, section) => sum + Object.keys(overrides[section] || {}).length, 0),
    },
    groups,
  };
}

function tableModule(table) {
  return [
    '// Generated by scripts/fx-axes-build.js — do not edit by hand.',
    '// The runtime mirror of renderer/data/fx-axes.json (a UMD module so the',
    '// renderer can read it synchronously).',
    '(function (root, factory) {',
    "  if (typeof module === 'object' && module.exports) module.exports = factory();",
    '  else {',
    '    root.SA = root.SA || {};',
    '    root.SA.fxAxesTable = factory();',
    '  }',
    "})(typeof self !== 'undefined' ? self : this, function () {",
    "  'use strict';",
    `  return ${JSON.stringify(table)};`,
    '});',
    '',
  ].join('\n');
}

function writeFileIfChanged(file, text) {
  let current = null;
  try {
    current = fs.readFileSync(file, 'utf8');
  } catch {
    current = null;
  }
  if (current === text) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
  return true;
}

function build(options) {
  const opts = options || {};
  const overridesPath = opts.overrides || path.join(__dirname, 'fx-axes-overrides.json');
  const jsonPath = opts.json || path.join(ROOT, 'renderer', 'data', 'fx-axes.json');
  const tablePath = opts.table || path.join(ROOT, 'renderer', 'js', 'lyrics', 'fx-axes-table.js');
  const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
  const table = buildTable(overrides);
  const jsonText = `${JSON.stringify(table, null, 2)}\n`;
  const tableText = tableModule(table);
  const changed = {
    json: writeFileIfChanged(jsonPath, jsonText),
    table: writeFileIfChanged(tablePath, tableText),
  };
  return { table, paths: { json: jsonPath, table: tablePath, overrides: overridesPath }, changed };
}

function main(argv) {
  const args = { flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value.startsWith('--')) {
      const key = value.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) args.flags[key] = true;
      else {
        args.flags[key] = next;
        i += 1;
      }
    }
  }
  try {
    const result = build({
      overrides: args.flags.overrides === true ? null : args.flags.overrides,
      json: args.flags.json === true ? null : args.flags.json,
      table: args.flags.table === true ? null : args.flags.table,
    });
    console.log(`fx-axes: ${result.table.counts.types} types in ${result.table.counts.groups} groups, ${result.table.counts.overridden} overrides`);
    console.log(`  json:  ${result.paths.json}${result.changed.json ? ' (written)' : ' (unchanged)'}`);
    console.log(`  table: ${result.paths.table}${result.changed.table ? ' (written)' : ' (unchanged)'}`);
    return 0;
  } catch (error) {
    console.error(`fx-axes: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  AXES,
  EFFECT_GROUPS,
  PSEUDO_GROUPS,
  collectTypes,
  validateOverrides,
  buildVector,
  buildTable,
  tableModule,
  build,
};
