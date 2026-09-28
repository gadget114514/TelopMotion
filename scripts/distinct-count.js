'use strict';

// Counts perceptually distinct effect signatures (§8 of doc/repeat-design.md).
//
//   node scripts/distinct-count.js [--out test]
//
// The script never draws: it enumerates quantized representatives for every
// registered effect and computes a signature key per representative. Repeat is
// counted as arrangement signatures x variation signatures per count bin, the
// same factorisation the phase plan uses, with an optional merge table for
// pairs that are known to look the same.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');

const fx = require(path.join(FX_DIR, 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'repeat']) {
  require(path.join(FX_DIR, `${name}.js`));
}
const repeat = require(path.join(FX_DIR, 'repeat.js'));
const rng = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'rng.js'));

const MERGE_TABLE_PATH = path.join(__dirname, 'merge-table.json');

const DIMS = {
  width: 1920,
  height: 1080,
  aspect: 16 / 9,
  box: { w: 500, h: 120, cx: 960, cy: 540 },
  safeArea: { left: 38, top: 22, right: 38, bottom: 22 },
  mainFontClass: 'sans',
  fontClasses: ['sans', 'serif', 'round', 'hand', 'pop'],
};
const BEAT = { start: 0, end: 4 };
const TIMES = [0.05, 0.2, 0.5, 1, 1.5, 2, 2.5, 3, 3.4, 3.6, 3.8, 3.95];

// --- §2 perceptual boundaries -------------------------------------------------

const EASE_FAMILIES = [
  ['linear', /^linear$/],
  ['smooth', /(quad|cubic|quart|quint|sine|expo|circ)/],
  ['back', /back/],
  ['elastic', /elastic|spring/],
  ['bounce', /bounce/],
  ['steps', /step/],
];

function easeFamily(ease) {
  const name = String(ease || 'linear').toLowerCase();
  for (const [family, pattern] of EASE_FAMILIES) if (pattern.test(name)) return family;
  return 'smooth';
}

// durations: <0.15 / 0.15-0.35 / 0.35-0.8 / >0.8 seconds
function timeBucket(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  if (value < 0.15) return 0;
  if (value < 0.35) return 1;
  if (value < 0.8) return 2;
  return 3;
}

// sizes: log(1.4) buckets (floor, so 1.2x stays in the base bucket)
function sizeBucket(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.floor(Math.log(number) / Math.log(1.4));
}

// directions: four 90° quadrants
function directionBin(dx, dy) {
  const x = Number(dx) || 0;
  const y = Number(dy) || 0;
  if (Math.abs(x) < 1e-6 && Math.abs(y) < 1e-6) return 'o';
  const angle = Math.atan2(y, x);
  const quarter = Math.round(angle / (Math.PI / 2));
  return ['e', 's', 'w', 'n'][((quarter % 4) + 4) % 4];
}

// colours: 11 basic names x lightness steps -> the signature only needs the
// bucket, not the exact name, so hue steps of 30° map to names cyclically
const HUE_NAMES = ['red', 'orange', 'yellow', 'lime', 'green', 'teal', 'cyan', 'blue', 'violet', 'magenta', 'pink'];
function hueName(shift) {
  const value = Number(shift) || 0;
  const index = Math.round((((value % 360) + 360) % 360) / 30) % HUE_NAMES.length;
  return HUE_NAMES[index];
}

function quantizeNumber(value, reference) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  if (number === 0) return '0';
  const ref = Math.abs(Number(reference) || 1);
  const sign = number < 0 ? '-' : '';
  const magnitude = Math.abs(number);
  const bucket = Math.round(Math.log(magnitude / ref) / Math.log(1.4));
  return `${sign}${bucket}`;
}

// A copy gap below 1em reads as an echo/afterimage rather than a repeat.
function overlapClass(gapEm) {
  return Number(gapEm) < 1 ? 'echo' : 'separated';
}

// --- repeat signatures --------------------------------------------------------

// The staged variation combinations per §7.3: none + the rules that are valid
// per count bin + the curated presets that fit the bin.
function repeatVariationCandidates(bin) {
  const candidates = [{ label: 'none', params: {} }];
  const attrs = ['size', 'color', 'font', 'decor'];
  if (bin === 'pair') {
    for (const attr of attrs) candidates.push({ label: `${attr}:oddOne`, params: { var1Attr: attr, var1Rule: 'oddOne' } });
    return candidates;
  }
  if (bin === 'tri') {
    for (const attr of attrs) {
      for (const rule of ['progress', 'random', 'oddOne']) candidates.push({ label: `${attr}:${rule}`, params: { var1Attr: attr, var1Rule: rule } });
    }
    for (const preset of ['perspectiveFade', 'ransomNote', 'heroOutline', 'rainbowStep']) candidates.push({ label: `preset:${preset}`, params: { variationPreset: preset } });
    return candidates;
  }
  if (bin === 'quad' || bin === 'few') {
    for (const attr of attrs) {
      for (const rule of ['progress', 'alternate', 'random', 'oddOne']) candidates.push({ label: `${attr}:${rule}`, params: { var1Attr: attr, var1Rule: rule } });
    }
    for (const preset of ['perspectiveFade', 'popAlternate', 'ransomNote', 'heroOutline', 'rainbowStep', 'loudQuiet']) candidates.push({ label: `preset:${preset}`, params: { variationPreset: preset } });
    return candidates;
  }
  // many: the design counts an effective 12 patterns, so the staged list is one
  // representative per texture family instead of every rule product
  candidates.push({ label: 'size:progress', params: { var1Attr: 'size', var1Rule: 'progress' } });
  candidates.push({ label: 'size:alternate', params: { var1Attr: 'size', var1Rule: 'alternate' } });
  candidates.push({ label: 'size:random', params: { var1Attr: 'size', var1Rule: 'random' } });
  candidates.push({ label: 'color:progress:hue', params: { var1Attr: 'color', var1Rule: 'progress' } });
  candidates.push({ label: 'color:progress:light', params: { var1Attr: 'color', var1Rule: 'progress', var1ColorMode: 'light' } });
  candidates.push({ label: 'color:alternate', params: { var1Attr: 'color', var1Rule: 'alternate' } });
  candidates.push({ label: 'color:random', params: { var1Attr: 'color', var1Rule: 'random' } });
  candidates.push({ label: 'decor:progress', params: { var1Attr: 'decor', var1Rule: 'progress' } });
  candidates.push({ label: 'decor:alternate', params: { var1Attr: 'decor', var1Rule: 'alternate' } });
  candidates.push({ label: 'decor:random', params: { var1Attr: 'decor', var1Rule: 'random' } });
  candidates.push({ label: 'font:random', params: { var1Attr: 'font', var1Rule: 'random' } });
  return candidates;
}

function repeatCountVariants(type) {
  const normal = [];
  for (const copies of [1, 2, 3]) {
    const normalized = repeat.normalize(type, { copies });
    normal.push(normalized.copies);
  }
  return [...new Set([...normal, 'many'])];
}

function repeatDirVariants(type) {
  const descriptor = fx.get('repeat', type);
  const dirParam = (descriptor.params || []).find((param) => param.key === 'dir');
  return dirParam ? dirParam.options : [undefined];
}

function repeatVariationSignature(countTotal, candidate, type) {
  const shape = type || 'stackV';
  const normalized = repeat.normalize(shape, { copies: countTotal - 1, ...candidate.params });
  const random = rng.mulberry32(rng.hash32('distinct-var', shape, countTotal, candidate.label));
  const copies = repeat.plan({ type: shape, params: normalized, enabled: true }, BEAT, 2, DIMS, random);
  if (!copies.length) return 'none';
  const parts = [];
  for (const copy of copies) {
    parts.push(
      [
        sizeBucket(copy.scale),
        hueName(copy.hueShift),
        copy.lightAmount ? Math.round(copy.lightAmount * 2) : 0,
        copy.colorIndex,
        copy.accentColor ? 'a' : '-',
        copy.decor,
        copy.fontClass || '-',
        copy.gradientInvert ? 'i' : '-',
      ].join(':')
    );
  }
  return parts.join('/');
}

// Canonical copy totals per count bin; §2 treats 3 and 4 straight copies as one.
function canonicalTotal(bin) {
  if (bin === 'pair') return 2;
  if (bin === 'tri') return 3;
  if (bin === 'quad') return 4;
  if (bin === 'few') return 4;
  return 8;
}

function countRepeatSignatures() {
  const arrangementsByBin = new Map();
  const variationsByBin = new Map();
  const allBins = new Set();
  for (const type of repeat.TYPES) {
    for (const countVariant of repeatCountVariants(type)) {
      const dirs = repeatDirVariants(type);
      for (const sequence of repeat.SEQUENCES) {
        const normalized = repeat.normalize(type, { copies: countVariant, sequence });
        const bin = repeat.countBin(type, normalized);
        allBins.add(bin);
        if (normalized.sequence !== sequence) continue; // normalize already collapsed it
        const isMany = normalized.copies === 'many';
        for (const dir of dirs) {
          const dirKey = isMany ? '-' : dir || '-';
          const key = ['repeat', type, bin, normalized.sequence, dirKey].join('|');
          if (!arrangementsByBin.has(bin)) arrangementsByBin.set(bin, new Set());
          arrangementsByBin.get(bin).add(key);
        }
      }
      allBins.add(repeat.countBin(type, { copies: countVariant }));
    }
  }
  for (const bin of allBins) {
    const set = new Set();
    const total = canonicalTotal(bin);
    for (const candidate of repeatVariationCandidates(bin)) set.add(repeatVariationSignature(total, candidate, 'stackV'));
    variationsByBin.set(bin, set);
  }
  let raw = 0;
  const byBin = {};
  const byMode = { normal: { arrangements: 0, variations: 0, raw: 0, discounted: 0 }, many: { arrangements: 0, variations: 0, raw: 0, discounted: 0 } };
  for (const bin of ['pair', 'few', 'tri', 'quad', 'many']) {
    if (!allBins.has(bin)) continue;
    const arrangements = (arrangementsByBin.get(bin) || new Set()).size;
    const variations = (variationsByBin.get(bin) || new Set()).size;
    const count = arrangements * variations;
    byBin[bin] = { arrangements, variations, raw: count };
    raw += count;
    const mode = bin === 'many' ? byMode.many : byMode.normal;
    mode.arrangements += arrangements;
    mode.variations = Math.max(mode.variations, variations);
    mode.raw += count;
  }
  // §7.4 placeholder discounts until the §8.3 manual review replaces them
  byMode.normal.discounted = Math.round(byMode.normal.raw * 0.29);
  byMode.many.discounted = Math.round(byMode.many.raw * 0.34);
  const discounted = byMode.normal.discounted + byMode.many.discounted;
  const arrangements = [...arrangementsByBin.values()].reduce((sum, set) => sum + set.size, 0);
  const variations = [...variationsByBin.values()].reduce((sum, set) => sum + set.size, 0);
  return { arrangements, variations, signatures: discounted, raw, discounted, byBin, byMode };
}

// --- existing groups ------------------------------------------------------------

function paramCandidates(param) {
  if (param.kind === 'select') return (param.options || [param.default]).slice();
  if (param.kind === 'bool') return [false, true];
  if (param.kind === 'number' || param.kind === 'int') {
    const values = new Set();
    if (param.default != null) values.add(param.default);
    if (Array.isArray(param.random) && param.random.length >= 2) {
      values.add(param.random[0]);
      values.add(param.random[1]);
    }
    return [...values].filter((value) => Number.isFinite(Number(value))).map((value) => (param.kind === 'int' ? Math.round(value) : Number(value)));
  }
  if (param.kind === 'ease') return [easeFamily(param.default)];
  return ['*'];
}

function quantizeParam(param, value) {
  if (param.kind === 'number' || param.kind === 'int') return quantizeNumber(value, param.default);
  if (param.kind === 'ease') return easeFamily(value);
  if (param.kind === 'color' || param.kind === 'gradient' || param.kind === 'points' || param.kind === 'text') return '*';
  if (param.kind === 'vec2') return '*';
  return String(value);
}

function countExistingSignatures() {
  const groups = {};
  let total = 0;
  const skip = new Set(['repeat']);
  for (const group of fx.groups.keys()) {
    if (skip.has(group)) continue;
    const list = fx.list(group);
    const signatures = new Set();
    for (const descriptor of list) {
      const params = descriptor.params || [];
      // one representative per quantized value plus the descriptor default
      const choices = params.map((param) => paramCandidates(param));
      const combos = [[]];
      let overflow = false;
      for (const options of choices) {
        if (combos.length * options.length > 64) {
          overflow = true;
          break;
        }
        const next = [];
        for (const combo of combos) for (const option of options) next.push([...combo, option]);
        combos.length = 0;
        combos.push(...next);
      }
      if (overflow) {
        combos.length = 0;
        combos.push(params.map((param) => (param.default == null ? '*' : param.default)));
        combos.push(params.map((param) => paramCandidates(param)[0]));
        combos.push(params.map((param) => paramCandidates(param)[paramCandidates(param).length - 1]));
      }
      for (const combo of combos) {
        const key = params.map((param, index) => quantizeParam(param, combo[index])).join(',');
        signatures.add(`${descriptor.type}#${key}`);
      }
    }
    groups[group] = signatures.size;
    total += signatures.size;
  }
  return { groups, total };
}

// --- merge table ------------------------------------------------------------------

function loadMergeTable() {
  try {
    const raw = JSON.parse(fs.readFileSync(MERGE_TABLE_PATH, 'utf8'));
    return Array.isArray(raw.aliases) ? raw.aliases : [];
  } catch {
    return [];
  }
}

// --- report -----------------------------------------------------------------------

function countSignatures() {
  const repeatCounts = countRepeatSignatures();
  const existing = countExistingSignatures();
  const aliases = loadMergeTable();
  const groupCounts = { ...existing.groups, repeat: repeatCounts.signatures };
  for (const alias of aliases) {
    if (!alias || !alias.group || groupCounts[alias.group] == null) continue;
    // each alias removes one duplicate signature from its group
    groupCounts[alias.group] = Math.max(0, groupCounts[alias.group] - 1);
  }
  const total = Object.values(groupCounts).reduce((sum, value) => sum + value, 0);
  return {
    groups: groupCounts,
    repeat: repeatCounts,
    existing: { groups: existing.groups, total: existing.total },
    total,
    aliases: aliases.length,
  };
}

function toMarkdown(report) {
  const lines = [
    '# Distinct effect signatures',
    '',
    'Generated by `scripts/distinct-count.js` (see `doc/repeat-design.md` §8).',
    '',
    '| Group | Signatures |',
    '|---|---|',
  ];
  for (const [group, count] of Object.entries(report.groups).sort()) lines.push(`| ${group} | ${count} |`);
  lines.push('', `**Total**: ${report.total}`);
  lines.push(
    '',
    `Repeat: ${report.repeat.signatures} (raw ${report.repeat.raw}; arrangements ${report.repeat.arrangements}, variation signatures ${report.repeat.variations})`
  );
  lines.push('', '| Count bin | Arrangements | Variations | Raw |', '|---|---|---|---|');
  for (const [bin, entry] of Object.entries(report.repeat.byBin)) lines.push(`| ${bin} | ${entry.arrangements} | ${entry.variations} | ${entry.raw} |`);
  lines.push('', `Normal mode: raw ${report.repeat.byMode.normal.raw} → discount x0.29 → ${report.repeat.byMode.normal.discounted}`);
  lines.push(`Many mode: raw ${report.repeat.byMode.many.raw} → discount x0.34 → ${report.repeat.byMode.many.discounted}`);
  lines.push('', `Merge table aliases applied: ${report.aliases}`);
  lines.push('', 'Acceptance: repeat ≥ 300 and total ≥ 800 (doc/repeat-design.md §8.4).');
  lines.push('', 'The discount factors are the §7.4 placeholders until the §8.3 manual review replaces them.');
  lines.push('');
  lines.push('## Manual review (§8.3, pending)');
  lines.push('');
  lines.push('- Pick 40 signature pairs that differ in one boundary only (30 normal, 10 many).');
  lines.push('- Have three people judge each pair as same/different.');
  lines.push('- Merge any dimension where "same" answers exceed 30%, then re-run `npm run distinct`.');
  return `${lines.join('\n')}\n`;
}

function main() {
  const outIndex = process.argv.indexOf('--out');
  const outDir = path.resolve(ROOT, outIndex >= 0 ? process.argv[outIndex + 1] : 'test');
  const report = countSignatures();
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'distinct-count.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'distinct-count.md'), toMarkdown(report));
  console.log(`repeat: ${report.repeat.signatures} signatures (raw ${report.repeat.raw})`);
  console.log(`total:  ${report.total} signatures`);
  for (const [group, count] of Object.entries(report.groups).sort()) console.log(`  ${group}: ${count}`);
  const ok = report.repeat.signatures >= 300 && report.total >= 800;
  console.log(ok ? 'acceptance: ok' : 'acceptance: FAILED');
  return ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = {
  countSignatures,
  countRepeatSignatures,
  countExistingSignatures,
  toMarkdown,
  easeFamily,
  timeBucket,
  sizeBucket,
  directionBin,
  hueName,
  quantizeNumber,
  overlapClass,
  loadMergeTable,
};
