'use strict';

// COLOR SHOWCASE: one project that walks the colour system, so the split
// schemes, the mood palettes and the wire patterns can be reviewed on their
// own from Help → Color showcase.
//
//   node scripts/color-showcase.js build [--sections scheme,palette] [--out <file>] [--md off]
//     writes renderer/data/color-showcase.json and demo/color-showcase.md
//   node scripts/color-showcase.js list [--section pattern]
//
// The walk has three sections. `scheme` is the split colour schemes alone
// (one cue per palette-roles SCHEME_IDS entry: tonal / analogous /
// complementary / triad / splitComplementary / neutralAccent, each on the
// same halves build with motion pinned to none). `palette` is one cue per
// moods PALETTE_FAMILIES entry (night .. festival, 14 families): each cue
// draws a split plane from a palette generated with
// moods.generatePalette(rng.rngFor(5000 + index, 'color', 'palette'), …,
// null, [family]). `pattern` is one cue per wire pattern (patterns PATTERNS,
// solid .. ornament, 20 entries): each cue keeps the same bright fill and
// varies only the outline pattern, with the text held still. Scheme and
// palette cues are four seconds, pattern cues three seconds, and one dark
// plate sits behind the whole walk so the colours read against the same
// ground.
//
// The output is generated, never hand edited: re-run this after the split
// schemes, the palette families or PATTERNS change.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const requirePart = (relative) => require(path.join(ROOT, relative));

const project = requirePart('renderer/js/studio/project.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');

// The effects registry must load before moods (same order as
// gen-genre-presets): moods reads the registered effect pool at require
// time, so requiring moods first would leave it with an empty pool.
const fx = requirePart('renderer/js/lyrics/effects/registry.js');
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg']) {
  requirePart(`renderer/js/lyrics/effects/${name}.js`);
}
const moods = requirePart('renderer/js/lyrics/moods.js');
const rng = requirePart('renderer/js/lyrics/rng.js');
let patternsMod = null;
try {
  patternsMod = requirePart('renderer/js/lyrics/patterns.js');
} catch {
  patternsMod = null;
}
let paletteRolesMod = null;
try {
  paletteRolesMod = requirePart('renderer/js/lyrics/palette-roles.js');
} catch {
  paletteRolesMod = null;
}

const SCHEME_SECONDS = 4;
const PALETTE_SECONDS = 4;
const PATTERN_SECONDS = 3;
// a fixed stamp keeps the generated file byte-identical on every run, so the
// build only writes when the walk itself changed
const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const OUT_PATH = path.join(ROOT, 'renderer', 'data', 'color-showcase.json');
const MD_PATH = path.join(ROOT, 'demo', 'color-showcase.md');
// every colour is read against the same ground: one deep plate, one label
// colour, one shared plane set for the scheme walk and one shared fill for
// the pattern walk
const PLATE = '#0d1220';
const LABEL_COLOR = '#e9edf8';
const FILL = '#f4f7ff';
const PLANE_COLORS = ['#23365f', '#2e4a7d', '#3a5f9e'];

const SAMPLE_JA = 'あいうえお カキクケコ 愛永漢字';
const SAMPLE_LATIN = 'Aiueo 0123';

// the split colour schemes the walk covers (palette-roles SCHEME_IDS)
const SCHEME_IDS = ['tonal', 'analogous', 'complementary', 'triad', 'splitComplementary', 'neutralAccent'];
// the mood families the walk covers (moods PALETTE_FAMILIES keys, walk order)
const PALETTE_FAMILIES = ['night', 'mono', 'gold', 'pastel', 'warm', 'neon', 'rose', 'ocean', 'blood', 'ash', 'blush', 'sunset', 'rain', 'festival'];
// the wire patterns the walk covers (patterns PATTERNS, vocabulary order)
const PATTERNS = (patternsMod && Array.isArray(patternsMod.PATTERNS) && patternsMod.PATTERNS.length === 20)
  ? patternsMod.PATTERNS.slice()
  : ['solid', 'dashed', 'dotted', 'dashDot', 'double', 'triple', 'stripes', 'checker', 'diamond', 'zigzag', 'wave', 'random', 'railroad', 'hatch', 'crosshatch', 'sketch', 'doubleDashed', 'squareChain', 'chain', 'ornament'];

// The pattern walk judges the line, so the text stays still: entrances and
// exits are instant fades and the animation is simultaneous (same rule as the
// font showcase).
const STATIC_ANIMATION = { type: 'simultaneous', enabled: true, params: {}, motion: { stagger: { each: 0 } } };
const STATIC_ENTER = { type: 'fade', enabled: true, params: {}, motion: { in: { duration: 0.01, ease: 'linear' } } };
const STATIC_EXIT = { type: 'fade', enabled: true, params: {}, motion: { out: { duration: 0.01, ease: 'linear' } } };

const SECTIONS = [
  { id: 'scheme', label: '配色スキーム (scheme)', note: '分割プレーンの配色スキームだけを変えています。配置は halves（3面・60%）に、動きは none に固定し、違うのはスキームだけです。' },
  { id: 'palette', label: 'パレット (palette)', note: 'ムードのパレットを1種類ずつ。同じ halves の面に、そのパレットの先頭3色を載せています。動きは none に固定しています。' },
  { id: 'pattern', label: '線パターン (pattern)', note: '文字の縁取り（outline）の線パターンだけを変えています。塗りは同じ明るい単色で、テキストは静止表示です。' },
];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function round(value, digits) {
  const factor = Math.pow(10, digits == null ? 3 : digits);
  return Math.round(value * factor) / factor;
}

function secondsFor(section) {
  if (section === 'pattern') return PATTERN_SECONDS;
  return SCHEME_SECONDS;
}

function schemeSpecFor(scheme) {
  const colors = schemeColorsFor(scheme);
  return {
    spec: {
      type: 'split',
      params: {
        layout: 'halves',
        parts: 3,
        coverage: 0.6,
        scheme,
        motion: 'none',
        speed: 0.4,
        colors: colors.slice(),
      },
    },
    colors,
  };
}

// Per-scheme plane colours from one base hue. split.js paints the `colors`
// list in order and never reads `scheme`, so passing the same base list for
// every scheme renders six identical cues. Derive the three planes with the
// palette-roles hue angles instead (same source as moods.splitColors).
function schemeColorsFor(scheme) {
  const base = PLANE_COLORS[1] || PLANE_COLORS[0];
  const shift = paletteRolesMod && typeof paletteRolesMod.shift === 'function'
    ? paletteRolesMod.shift
    : null;
  if (!shift) return PLANE_COLORS.slice();
  try {
    if (scheme === 'analogous') return [base, shift(base, 30, 1, 0.08), shift(base, -30, 1, -0.06)];
    if (scheme === 'complementary') return [base, shift(base, 180, 1, 0.05), shift(base, 150, 0.9, 0.12)];
    if (scheme === 'triad') return [base, shift(base, 120, 1, 0.05), shift(base, 240, 1, -0.05)];
    if (scheme === 'splitComplementary') return [base, shift(base, 150, 1, 0.08), shift(base, 210, 1, -0.04)];
    if (scheme === 'neutralAccent') return [shift(base, 0, 0.12, 0.05), shift(base, 0, 0.1, -0.06), shift(base, 180, 0.9, 0.1)];
    // tonal: same hue, stepped lightness so the three planes still separate
    return [base, shift(base, 0, 0.9, 0.12), shift(base, 0, 0.85, -0.1)];
  } catch {
    return PLANE_COLORS.slice();
  }
}

// One palette per family: a deterministic draw pinned to the neutral axes,
// restricted to the single family under review. When moods / rng do not
// expose the expected entry points (or the draw fails), the cue falls back
// to a mid split clip with null colours so the walk still migrates.
function paletteSpecFor(family, index) {
  const axes = { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5 };
  try {
    if (moods && typeof moods.generatePalette === 'function' && rng && typeof rng.rngFor === 'function') {
      const random = rng.rngFor(5000 + index, 'color', 'palette');
      const palette = moods.generatePalette(random, axes, null, [family]);
      if (palette && Array.isArray(palette.colors) && palette.colors.length >= 3) {
        const colors = palette.colors.slice(0, 3);
        return {
          spec: {
            type: 'split',
            params: {
              layout: 'halves',
              parts: 3,
              coverage: 0.6,
              scheme: 'tonal',
              motion: 'none',
              speed: 0.4,
              colors: colors.slice(),
            },
          },
          colors,
          palette,
        };
      }
    }
  } catch {
    // fall through to the null-colours fallback below
  }
  return {
    spec: {
      type: 'split',
      params: {
        layout: 'halves',
        parts: 3,
        coverage: 0.6,
        scheme: 'tonal',
        motion: 'none',
        speed: 0.4,
        colors: PLANE_COLORS.slice(),
      },
    },
    colors: null,
    palette: null,
  };
}

function patternStyleFor(pattern) {
  return {
    color: { fill: { kind: 'solid', value: FILL, alpha: 1 } },
    edge: [{ type: 'outline', params: { width: 4, pattern }, enabled: true }],
    animation: clone(STATIC_ANIMATION),
    enter: clone(STATIC_ENTER),
    exit: clone(STATIC_EXIT),
  };
}

function cueId(index) {
  return `color_${String(index + 1).padStart(3, '0')}`;
}

function cueText(index, value, detail) {
  const head = detail && detail !== value ? `${index}. ${value} · ${detail}` : `${index}. ${value}`;
  return `${head}\n${SAMPLE_JA} ${SAMPLE_LATIN}`;
}

// The walk itself, without any timing: one slot per cue, in playing order.
// Scheme cues carry their split spec, palette cues their family draw and
// pattern cues their outline style; the timing joins in buildShowcase.
function plan() {
  const slots = [];
  const push = (section, value, detail, seconds, extra) => {
    const index = slots.length;
    slots.push({
      index: index + 1, section, value, detail, seconds,
      cueId: cueId(index), ...(extra || {}),
    });
  };
  for (const scheme of SCHEME_IDS) {
    push('scheme', scheme, scheme, SCHEME_SECONDS, { scheme });
  }
  PALETTE_FAMILIES.forEach((family, at) => {
    push('palette', family, family, PALETTE_SECONDS, { family, paletteIndex: at });
  });
  for (const pattern of PATTERNS) {
    push('pattern', pattern, pattern, PATTERN_SECONDS, { pattern });
  }
  return slots;
}

function buildShowcase(options) {
  const opts = options || {};
  const wanted = opts.sections && opts.sections.length ? new Set(opts.sections) : null;
  const slots = plan().filter((slot) => !wanted || wanted.has(slot.section));
  if (!slots.length) throw new Error('no section matched; nothing to build');

  const cues = [];
  const markers = [];
  const clips = [];
  const styles = new Map();
  const entries = [];
  let t = 0;
  let lastSection = null;
  const sectionById = new Map(SECTIONS.map((section) => [section.id, section]));

  slots.forEach((slot, offset) => {
    const start = round(t);
    const end = round(t + slot.seconds);
    const id = cueId(offset);
    if (slot.section !== lastSection) {
      lastSection = slot.section;
      markers.push({ t: start, label: sectionById.get(slot.section).label });
    }
    cues.push({
      id,
      start,
      end,
      text: cueText(slot.index, slot.value, slot.detail),
      // the ids are language-independent, so the Studio needs no re-labelling
      // (same shape as the backdrop showcase's `{ kind, section, value }`)
      meta: { kind: 'color-showcase', index: slot.index, section: slot.section, value: slot.value },
    });
    if (slot.section === 'scheme') {
      const built = schemeSpecFor(slot.scheme);
      clips.push({
        id: `clip_${id}`,
        trackId: 'mid',
        start,
        end,
        spec: clone(built.spec),
        opacity: 1,
        fadeIn: 0.25,
        fadeOut: 0.25,
        colors: built.colors.slice(),
      });
      entries.push({ index: slot.index, section: slot.section, sectionLabel: sectionById.get(slot.section).label, cueId: id, start, end, value: slot.value, detail: slot.detail, spec: clone(built.spec), colors: built.colors.slice() });
    } else if (slot.section === 'palette') {
      const built = paletteSpecFor(slot.family, slot.paletteIndex);
      clips.push({
        id: `clip_${id}`,
        trackId: 'mid',
        start,
        end,
        spec: clone(built.spec),
        opacity: 1,
        fadeIn: 0.25,
        fadeOut: 0.25,
        colors: built.colors ? built.colors.slice() : null,
      });
      entries.push({ index: slot.index, section: slot.section, sectionLabel: sectionById.get(slot.section).label, cueId: id, start, end, value: slot.value, detail: slot.detail, spec: clone(built.spec), colors: built.colors ? built.colors.slice() : null });
    } else {
      const style = patternStyleFor(slot.pattern);
      styles.set(id, style);
      entries.push({ index: slot.index, section: slot.section, sectionLabel: sectionById.get(slot.section).label, cueId: id, start, end, value: slot.value, detail: slot.detail, style: clone(style) });
    }
    t = end;
  });
  const total = round(t);

  const doc = project.create({});
  doc.meta.title = 'TelopMotion カラー見本';
  doc.meta.lang = 'ja';
  doc.meta.createdAt = FIXED_TIME;
  doc.meta.updatedAt = FIXED_TIME;
  doc.script.cues = cues;
  doc.script.sourceName = 'color-showcase.json';
  doc.markers = markers;
  // the sample stays in the middle of the frame, large enough to judge the
  // separation between the lyrics and the colour behind / around them
  doc.style.text.fontId = 'NotoSansJP-Regular';
  doc.style.text.size = 64;
  doc.style.text.align = 'center';
  doc.style.color = {
    fill: { kind: 'solid', value: LABEL_COLOR, alpha: 1 },
    stroke: { kind: 'solid', value: LABEL_COLOR, alpha: 1 },
  };
  textflow.apply(doc);
  for (const [id, style] of styles) doc.cueStyles[id] = clone(style);
  // one plate under the whole walk, so no colour is judged against the
  // preview backdrop
  clips.unshift({
    id: 'clip_color_plate',
    trackId: 'bg',
    start: 0,
    end: total,
    spec: { type: 'solid', params: { color: PLATE } },
    opacity: 1,
    fadeIn: 0.2,
    fadeOut: 0.2,
    colors: null,
  });
  doc.clips = clips;

  return {
    project: doc,
    entries,
    markers,
    sections: SECTIONS.filter((section) => !wanted || wanted.has(section.id)),
    total,
  };
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

function serialize(projectDoc) {
  return `${JSON.stringify(projectDoc, null, 2)}\n`;
}

function formatRange(entry) {
  return `${round(entry.start, 1)}–${round(entry.end, 1)}s`;
}

function indexMarkdown(built) {
  const lines = [];
  lines.push('# カラー見本 (color showcase)');
  lines.push('');
  lines.push('配色スキーム・ムードのパレット・線パターンを 1 キューずつ並べた見本プロジェクトです。どのキューも同じサンプル文を表示し、違うのは色だけです。');
  lines.push('');
  lines.push(`- 配色スキーム・パレットは1項目＝1キュー（${SCHEME_SECONDS} 秒/キュー）、線パターンは1種類＝1キュー（${PATTERN_SECONDS} 秒/キュー）`);
  lines.push('- 配色スキームとパレットは後景トラック（`mid`）の分割プレーン、線パターンは文字の縁取り（`outline`）です。キューは中央のサンプル文だけを持ちます');
  lines.push('- 開くには Studio の *Help → カラー見本*、または *File → Open project…* を使います');
  lines.push('');
  lines.push('| # | セクション | キュー数 | 時間 |');
  lines.push('|---:|---|---:|---|');
  let order = 0;
  const rows = new Map();
  for (const entry of built.entries) {
    const row = rows.get(entry.section) || { label: entry.sectionLabel, count: 0, from: entry.start, to: entry.end };
    row.count += 1;
    row.to = entry.end;
    rows.set(entry.section, row);
  }
  for (const section of built.sections) {
    const row = rows.get(section.id);
    if (!row) continue;
    order += 1;
    lines.push(`| ${order} | ${row.label} | ${row.count} | ${round(row.from, 1)}–${round(row.to, 1)}s |`);
  }
  lines.push(`| | **合計** | **${built.entries.length}** | **${built.total}s** |`);
  lines.push('');
  lines.push('## コマンド');
  lines.push('');
  lines.push('| コマンド | 内容 |');
  lines.push('|---|---|');
  lines.push('| `npm run color-showcase -- build` | このプロジェクトとこの一覧を再生成 |');
  lines.push('| `node scripts/color-showcase.js list` | セクションとキューを一覧 |');
  lines.push('| `node scripts/color-showcase.js list --section pattern` | 1 セクションだけ表示 |');
  lines.push('| `npm run color-showcase -- build --sections scheme,palette` | セクションを絞って生成 |');
  lines.push('');
  let sectionIndex = 0;
  for (const section of built.sections) {
    const sectionRows = built.entries.filter((entry) => entry.section === section.id);
    if (!sectionRows.length) continue;
    sectionIndex += 1;
    lines.push(`## ${sectionIndex}. ${section.label} (${section.id})`);
    lines.push('');
    if (section.note) lines.push(section.note);
    lines.push('');
    if (section.id === 'pattern') lines.push(`塗り \`${FILL}\`・縁取り幅 4・テキスト静止表示`);
    else if (section.id === 'scheme') lines.push(`配置 halves・3面・60%・動き none・${SCHEME_SECONDS} 秒/キュー`);
    else lines.push(`配置 halves・3面・60%・動き none・スキーム tonal 固定・${PALETTE_SECONDS} 秒/キュー`);
    lines.push('');
    lines.push('| # | キュー | 時間 | 値 | 内容 |');
    lines.push('|---:|---|---|---|---|');
    for (const entry of sectionRows) {
      lines.push(`| ${entry.index} | \`${entry.cueId}\` | ${formatRange(entry)} | \`${entry.value}\` | ${entry.detail} |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function build(options) {
  const opts = options || {};
  const out = opts.out || OUT_PATH;
  const md = opts.md === null ? null : opts.md || MD_PATH;
  const built = buildShowcase(opts);
  const migrated = project.migrate(clone(built.project));
  if (!migrated.ok) throw new Error(`generated project did not migrate: ${migrated.error}`);
  if (migrated.project.script.cues.length !== built.project.script.cues.length) {
    throw new Error(`generated project lost cues: ${migrated.project.script.cues.length}`);
  }
  // scheme + palette cues each own one mid clip; pattern cues own a cueStyle
  // instead, so the mid-clip count trails the cue count by the pattern rows
  const midWanted = built.entries.filter((entry) => entry.section === 'scheme' || entry.section === 'palette').length;
  const midClips = migrated.project.clips.filter((clip) => clip.trackId === 'mid');
  if (midClips.length !== midWanted) {
    throw new Error(`generated project has ${midClips.length} mid clips for ${midWanted} scheme/palette cues`);
  }
  const patternWanted = built.entries.filter((entry) => entry.section === 'pattern').length;
  const styled = Object.keys(migrated.project.cueStyles || {}).length;
  if (styled !== patternWanted) {
    throw new Error(`generated project has ${styled} cue styles for ${patternWanted} pattern cues`);
  }
  const changed = writeFileIfChanged(out, serialize(built.project));
  const mdChanged = md ? writeFileIfChanged(md, indexMarkdown(built)) : false;
  return { ...built, written: { out, changed, md, mdChanged } };
}

function parseArgs(argv) {
  const args = { positional: [], flags: {} };
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
    } else {
      args.positional.push(value);
    }
  }
  return args;
}

function parseSections(value) {
  if (typeof value !== 'string') return null;
  const ids = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (!ids.length) return null;
  const known = SECTIONS.map((section) => section.id);
  for (const id of ids) {
    if (!known.includes(id)) throw new Error(`unknown section ${id} (${known.join(', ')})`);
  }
  return ids;
}

function listText(options) {
  const built = buildShowcase(options || {});
  const lines = [];
  let order = 0;
  for (const section of built.sections) {
    const rows = built.entries.filter((entry) => entry.section === section.id);
    if (!rows.length) continue;
    order += 1;
    lines.push(`${order}. ${section.label} — ${rows.length} cues`);
    for (const entry of rows) {
      lines.push(`   ${String(entry.index).padStart(3, ' ')}. ${formatRange(entry)}  ${entry.value} · ${entry.detail}`);
    }
    lines.push('');
  }
  lines.push(`total ${built.entries.length} cues, ${built.total}s`);
  return lines.join('\n');
}

function help() {
  console.log([
    'COLOR SHOWCASE: every split scheme, mood palette and wire pattern in one project',
    '',
    '  node scripts/color-showcase.js build [--sections scheme,palette] [--out <file>] [--md off]',
    '  node scripts/color-showcase.js list [--section pattern]',
    '',
    `sections: ${SECTIONS.map((section) => section.id).join(', ')}`,
  ].join('\n'));
}

function main(argv) {
  const args = parseArgs(argv);
  const command = args.positional[0] && args.positional[0] !== 'build' ? args.positional[0] : 'build';
  if (command === 'help') {
    help();
    return 0;
  }
  let sectionsOption = null;
  try {
    sectionsOption = parseSections(args.flags.sections || args.flags.section);
    if (command === 'list') {
      console.log(listText({ sections: sectionsOption }));
      return 0;
    }
    if (command !== 'build') {
      help();
      return 1;
    }
    const result = build({
      sections: sectionsOption,
      out: args.flags.out === true ? null : args.flags.out,
      md: args.flags.md === 'off' ? null : args.flags.md,
    });
    console.log(`color-showcase: ${result.written.out} (${result.entries.length} cues, ${result.total}s)${result.written.changed ? '' : ' [unchanged]'}`);
    if (result.written.md) console.log(`color-showcase: ${result.written.md}${result.written.mdChanged ? '' : ' [unchanged]'}`);
    return 0;
  } catch (error) {
    console.error(`color-showcase: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  SCHEME_IDS,
  PALETTE_FAMILIES,
  PATTERNS,
  SCHEME_SECONDS,
  PALETTE_SECONDS,
  PATTERN_SECONDS,
  LABEL_COLOR,
  FILL,
  MD_PATH,
  OUT_PATH,
  PLANE_COLORS,
  PLATE,
  SECTIONS,
  schemeSpecFor,
  paletteSpecFor,
  patternStyleFor,
  cueText,
  plan,
  buildShowcase,
  indexMarkdown,
  listText,
  build,
  serialize,
};
