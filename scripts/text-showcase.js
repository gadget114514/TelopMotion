'use strict';

// TEXT SHOWCASE: one project that walks every text fill, every text edge and
// every text background, so the three vocabularies can be reviewed on their
// own from Help → Text showcase.
//
//   node scripts/text-showcase.js build [--sections fill,edge] [--out <file>] [--md off]
//     writes renderer/data/text-showcase.json and demo/text-showcase.md
//   node scripts/text-showcase.js list [--section edge]
//
// The walk has three sections. `fill` is one cue per `fill` type, `edge` one
// cue per `edge` type, `background` one cue per `background` type (all packs,
// read live from the registry so a new type fails loudly instead of silently
// missing its cue). Every type expands to four variants in playing order:
// `base` (the single string), `double` (main + one offset clone = 2重),
// `dx` (three clones spread horizontally) and `dy` (three clones spread
// vertically, with the same horizontal spread so they stay in frame). The
// clones ride on top of the fill / edge / background under review, so
// neighbouring cues differ only in the parallel demo.
//
// One fill / edge cue is three seconds, one background cue four seconds; one
// marker opens every section. Background cues own one `bg`-track clip each
// (`none` owns no clip); fill / edge cues own only a cueStyle.
//
// The output is generated, never hand edited: re-run this after the fill,
// edge or background types change.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const requirePart = (relative) => require(path.join(ROOT, relative));

const fx = requirePart('renderer/js/lyrics/effects/registry.js');
requirePart('renderer/js/lyrics/effects/fill.js');
requirePart('renderer/js/lyrics/effects/edge.js');
requirePart('renderer/js/lyrics/effects/background.js');
const project = requirePart('renderer/js/studio/project.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');

const FILL_SECONDS = 3;
const EDGE_SECONDS = 3;
const BG_SECONDS = 4;
// a fixed stamp keeps the generated file byte-identical on every run, so the
// build only writes when the walk itself changed
const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const OUT_PATH = path.join(ROOT, 'renderer', 'data', 'text-showcase.json');
const MD_PATH = path.join(ROOT, 'demo', 'text-showcase.md');

const SAMPLE = 'あいうえお Aiueo 123';
const LABEL_COLOR = '#e9edf8';
const FILL_COLOR = '#f4f7ff';

// every type list is read live (all packs), so a new registration fails
// loudly in the test instead of silently missing its cue
const FILL_TYPES = fx.list('fill', { packs: 'all' }).map((entry) => entry.type);
const EDGE_TYPES = fx.list('edge', { packs: 'all' }).map((entry) => entry.type);
const BG_TYPES = fx.list('background', { packs: 'all' }).map((entry) => entry.type);

const VARIANTS = ['base', 'double', 'dx', 'dy'];
const VARIANT_JA = { base: '単体', double: '二重', dx: '横並列', dy: '縦並列' };

// the parallel copies: the same spread as the clone showcase, so the two
// walks read as the same vocabulary
const SPREAD_X = [-0.14, 0, 0.14];
const SPREAD_Y = [-0.12, 0, 0.12];
// the double-text offset: one clone behind the main string, close enough to
// read as a double exposure, far enough to see both layers
const DOUBLE_DX = 0.035;
const DOUBLE_DY = -0.035;

const SECTIONS = [
  { id: 'fill', label: '塗り (fill)', note: '文字の塗り（fill）を1種類ずつ。単体・二重・横並列・縦並列の4キューで見せます。並列は同じ塗りのまま、違うのはコピーだけです。' },
  { id: 'edge', label: '縁取り (edge)', note: '文字の縁取り（edge）を1種類ずつ。単体・二重・横並列・縦並列の4キューで見せます。本体は同じ明るい単色に固定し、違うのは縁とコピーだけです。' },
  { id: 'background', label: '背景 (background)', note: '文字の後ろの背景（background）を1種類ずつ。単体・二重・横並列・縦並列の4キューで見せます。背景は `bg` トラックのクリップ、並列はキューのクローンです。`none` はクリップなし（素の画面）です。' },
];

// the text stays still so the fill / edge / background can be judged:
// entrances and exits are short fades and the animation is simultaneous
// (same rule as the clone showcase)
const STATIC_ANIMATION = { type: 'simultaneous', enabled: true, params: {}, motion: { stagger: { each: 0 } } };
const STATIC_ENTER = { type: 'fade', enabled: true, params: {}, motion: { in: { duration: 0.4, ease: 'cubicOut' } } };
const STATIC_EXIT = { type: 'fade', enabled: true, params: {}, motion: { out: { duration: 0.4, ease: 'cubicIn' } } };

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function round(value, digits) {
  const factor = Math.pow(10, digits == null ? 3 : digits);
  return Math.round(value * factor) / factor;
}

function secondsFor(section) {
  return section === 'background' ? BG_SECONDS : section === 'edge' ? EDGE_SECONDS : FILL_SECONDS;
}

// one clone entry: the neutral base plus the per-copy patch (same shape as
// the clone showcase's trioClone, so the inspector vocabulary matches)
function textClone(patch) {
  return {
    dx: 0, dy: 0, scale: 1, rotate: 0, opacity: 0.5, hue: 0, delay: 0,
    motion: { type: 'none', amount: 0.03, speed: 0.8 },
    enabled: true,
    ...(patch || {}),
  };
}

function clonesFor(variant) {
  if (variant === 'double') return [textClone({ dx: DOUBLE_DX, dy: DOUBLE_DY, opacity: 0.6 })];
  if (variant === 'dx') return SPREAD_X.map((dx) => textClone({ dx }));
  if (variant === 'dy') return SPREAD_Y.map((dy, i) => textClone({ dx: SPREAD_X[i], dy }));
  return null;
}

function baseStyleFor(section, type) {
  const base = {
    color: { fill: { kind: 'solid', value: section === 'edge' ? FILL_COLOR : FILL_COLOR, alpha: 1 } },
    animation: clone(STATIC_ANIMATION),
    enter: clone(STATIC_ENTER),
    exit: clone(STATIC_EXIT),
  };
  if (section === 'fill') {
    base.fill = { type, params: {}, enabled: true };
  } else if (section === 'edge') {
    base.fill = { type: 'solid', params: {}, enabled: true };
    base.edge = [{ type, params: {}, enabled: true }];
  }
  // background section: no fill / edge override (the default solid body), the
  // background itself rides on a bg clip (see clipSpecFor)
  return base;
}

function styleFor(section, type, variant) {
  const style = baseStyleFor(section, type);
  const clones = clonesFor(variant);
  if (clones) style.clones = clones;
  return style;
}

function clipSpecFor(section, type) {
  if (section !== 'background') return null;
  if (type === 'none') return null;
  const resolved = fx.withDefaults({ type, params: {} }, 'background');
  return { type, params: clone(resolved ? resolved.params : {}) };
}

function cueId(index) {
  return `tx_${String(index + 1).padStart(3, '0')}`;
}

function cueText(index, type, variant) {
  const detail = VARIANT_JA[variant] || variant;
  return `${index}. ${type}/${variant} · ${detail}\n${SAMPLE}`;
}

// The walk itself, without any timing: one slot per cue, in playing order.
// Every type expands to base → double → dx → dy so the four variants of one
// type play back to back.
function plan() {
  const slots = [];
  const push = (section, type, variant) => {
    const index = slots.length;
    slots.push({
      index: index + 1, section, type, variant,
      value: `${type}/${variant}`,
      detail: VARIANT_JA[variant] || variant,
      seconds: secondsFor(section),
      cueId: cueId(index),
      style: styleFor(section, type, variant),
      clipSpec: clipSpecFor(section, type),
    });
  };
  for (const type of FILL_TYPES) for (const variant of VARIANTS) push('fill', type, variant);
  for (const type of EDGE_TYPES) for (const variant of VARIANTS) push('edge', type, variant);
  for (const type of BG_TYPES) for (const variant of VARIANTS) push('background', type, variant);
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
      text: cueText(slot.index, slot.type, slot.variant),
      // language-independent ids, so the Studio needs no re-labelling (same
      // shape as the clone showcase's meta)
      meta: {
        kind: 'text-showcase', index: slot.index, section: slot.section,
        type: slot.type, variant: slot.variant, value: slot.value, detail: slot.detail,
      },
    });
    if (slot.clipSpec) {
      clips.push({
        id: `clip_${id}`,
        trackId: 'bg',
        start,
        end,
        spec: clone(slot.clipSpec),
        opacity: 1,
        fadeIn: 0.25,
        fadeOut: 0.25,
        colors: null,
      });
    }
    entries.push({
      index: slot.index, section: slot.section, sectionLabel: sectionById.get(slot.section).label,
      cueId: id, start, end, type: slot.type, variant: slot.variant,
      value: slot.value, detail: slot.detail,
      style: clone(slot.style), clipSpec: clone(slot.clipSpec),
    });
    t = end;
  });
  const total = round(t);

  const doc = project.create({});
  doc.meta.title = 'TelopMotion テキスト見本';
  doc.meta.lang = 'ja';
  doc.meta.createdAt = FIXED_TIME;
  doc.meta.updatedAt = FIXED_TIME;
  doc.script.cues = cues;
  doc.script.sourceName = 'text-showcase.json';
  doc.markers = markers;
  // the sample stays in the middle of the frame, leaving room for the outer
  // copies on both sides (same size as the clone showcase)
  doc.style.text.fontId = 'NotoSansJP-Regular';
  doc.style.text.size = 64;
  doc.style.text.align = 'center';
  doc.style.color = {
    fill: { kind: 'solid', value: LABEL_COLOR, alpha: 1 },
    stroke: { kind: 'solid', value: LABEL_COLOR, alpha: 1 },
  };
  textflow.apply(doc);
  for (const entry of entries) {
    doc.cueStyles[entry.cueId] = clone(entry.style);
  }
  if (clips.length) doc.clips = (doc.clips || []).concat(clips);

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
  lines.push('# テキスト見本 (text showcase)');
  lines.push('');
  lines.push('文字の塗り・縁取り・背景を 1 種類ずつ並べた見本プロジェクトです。1種類につき4キュー（単体・二重・横並列・縦並列）で、違うのは重ね・並べ方だけです。');
  lines.push('');
  lines.push(`- 塗り・縁取りは1種類＝4キュー（${FILL_SECONDS} 秒/キュー）、背景は1種類＝4キュー（${BG_SECONDS} 秒/キュー）`);
  lines.push('- 二重は本体＋1コピー（`dx +0.035 / dy -0.035`）、横並列は3コピー（`dx -0.14 / 0 / +0.14`）、縦並列は3コピー（`dy -0.12 / 0 / +0.12`＋横の広がり）です');
  lines.push('- 背景は `bg` トラックのクリップ（`none` はクリップなし）。塗り・縁取りはキューのスタイルです');
  lines.push('- 開くには Studio の *Help → テキスト見本*、または *File → Open project…* を使います');
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
  lines.push('| `npm run text-showcase -- build` | このプロジェクトとこの一覧を再生成 |');
  lines.push('| `node scripts/text-showcase.js list` | セクションとキューを一覧 |');
  lines.push('| `node scripts/text-showcase.js list --section edge` | 1 セクションだけ表示 |');
  lines.push('| `npm run text-showcase -- build --sections fill,edge` | セクションを絞って生成 |');
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
    'TEXT SHOWCASE: every text fill, edge and background in one project',
    '',
    '  node scripts/text-showcase.js build [--sections fill,edge] [--out <file>] [--md off]',
    '  node scripts/text-showcase.js list [--section edge]',
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
    console.log(`text-showcase: ${result.written.out} (${result.entries.length} cues, ${result.total}s)${result.written.changed ? '' : ' [unchanged]'}`);
    if (result.written.md) console.log(`text-showcase: ${result.written.md}${result.written.mdChanged ? '' : ' [unchanged]'}`);
    return 0;
  } catch (error) {
    console.error(`text-showcase: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  FILL_SECONDS,
  EDGE_SECONDS,
  BG_SECONDS,
  OUT_PATH,
  MD_PATH,
  FILL_TYPES,
  EDGE_TYPES,
  BG_TYPES,
  VARIANTS,
  SECTIONS,
  SPREAD_X,
  SPREAD_Y,
  styleFor,
  clipSpecFor,
  clonesFor,
  cueText,
  plan,
  buildShowcase,
  indexMarkdown,
  listText,
  build,
  serialize,
};
