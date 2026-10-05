'use strict';

// FONT SHOWCASE: one project that walks every bundled typeface, so the fonts
// can be eyeballed from Help → Font showcase.
//
//   node scripts/font-showcase.js build [--out <file>] [--md off]
//     writes renderer/data/font-showcase.json and demo/font-showcase.md
//   node scripts/font-showcase.js list
//
// One bundled font is one four-second cue: the first line names the family,
// the next lines show the same short Latin + digit + Japanese sample, so a
// CJK face and a Latin-only face read differently at a glance (a Latin-only
// face falls back per character to the bundled Noto Sans JP). Every cue
// renders at the same large size (150px): the lines stay short on purpose, so
// even the widest bundled face (Dela Gothic One) fits the frame without the
// renderer having to wrap mid-word, and a long label would spill past the
// frame at these sizes. The full font id lives in the cue meta and in
// demo/font-showcase.md.
// A cue shows its four lines at once: `textFlow.maxLines` lifts the default
// two-line lyric cap (the page showcase does the same), so the flow keeps the
// explicit breaks in a single beat instead of rebalancing them.
// Each cue pins `text.fontId` (with the matching weight and size), a bright
// solid `color.fill` of its own and one simple edge decoration — a dark
// `outline` on even sections, a soft `dropShadow` halo on odd ones — so the
// walk also shows colouring and simple decoration. The text holds still
// (instant simultaneous fades), so letterforms can be judged at any moment. Cues are
// grouped by `fontClass` — the perceptual class the repeat group's font
// variation swaps between — with one marker per class.
//
// The output is generated, never hand edited: re-run this after the bundled
// list in `renderer/js/lyrics/font.js` (BUILTINS) changes. The table below
// mirrors BUILTINS exactly; `font-showcase.test.js` fails if they drift apart.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const requirePart = (relative) => require(path.join(ROOT, relative));

const project = requirePart('renderer/js/studio/project.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');

// Mirrors `BUILTINS` in renderer/js/lyrics/font.js (id order is the walk
// order inside each class section, not the file order).
const FONTS = [
  { id: 'NotoSans-Regular', family: 'Noto Sans', weight: 400, cjk: false, fontClass: 'sans' },
  { id: 'NotoSansJP-Regular', family: 'Noto Sans JP', weight: 400, cjk: true, fontClass: 'sans' },
  { id: 'NotoSans-Bold', family: 'Noto Sans', weight: 700, cjk: false, fontClass: 'sansBold' },
  { id: 'NotoSansJP-Bold', family: 'Noto Sans JP', weight: 700, cjk: true, fontClass: 'sansBold' },
  { id: 'NotoSerif-Regular', family: 'Noto Serif', weight: 400, cjk: false, fontClass: 'serif' },
  { id: 'NotoSerifJP-Regular', family: 'Noto Serif JP', weight: 400, cjk: true, fontClass: 'serif' },
  { id: 'DelaGothicOne-Regular', family: 'Dela Gothic One', weight: 400, cjk: true, fontClass: 'display' },
  { id: 'BebasNeue-Regular', family: 'Bebas Neue', weight: 400, cjk: false, fontClass: 'display' },
  { id: 'ZenMaruGothic-Regular', family: 'Zen Maru Gothic', weight: 400, cjk: true, fontClass: 'round' },
  { id: 'KleeOne-Regular', family: 'Klee One', weight: 400, cjk: true, fontClass: 'hand' },
  { id: 'RocknRollOne-Regular', family: 'RocknRoll One', weight: 400, cjk: true, fontClass: 'pop' },
];

const FONT_SECONDS = 4;
// a fixed stamp keeps the generated file byte-identical on every run, so the
// build only writes when the font list actually changed
const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const OUT_PATH = path.join(ROOT, 'renderer', 'data', 'font-showcase.json');
const MD_PATH = path.join(ROOT, 'demo', 'font-showcase.md');

const SAMPLE_LATIN = 'AaBbCcDdEe';
const SAMPLE_DIGITS = '0123456789';
const SAMPLE_JA = 'あア愛永漢字';

// One large size for every cue (about twice the previous 77px rendering), so
// neighbouring cues stay comparable. Short lines keep even the widest face
// inside the frame at this size (verified with real font metrics).
const TEXT_SIZE = 150;

// One bright solid fill per font (all readable on the black preview).
const FONT_FILLS = {
  'NotoSans-Regular': '#f4f7ff',
  'NotoSansJP-Regular': '#ffe600',
  'NotoSans-Bold': '#00e5ff',
  'NotoSansJP-Bold': '#ff5cd0',
  'NotoSerif-Regular': '#7dff8a',
  'NotoSerifJP-Regular': '#ff8a3d',
  'DelaGothicOne-Regular': '#ff4d5e',
  'BebasNeue-Regular': '#c77dff',
  'ZenMaruGothic-Regular': '#8ef6ff',
  'KleeOne-Regular': '#d0ff4d',
  'RocknRollOne-Regular': '#4dd6c1',
};

// Even sections draw a dark outline, odd sections a soft halo: two simple
// decorations across the walk, one per section so neighbours in a section
// stay comparable.
const OUTLINE = { type: 'outline', enabled: true, params: { width: 5, color: '#101018', softness: 0.4 } };
const HALO = { type: 'dropShadow', enabled: true, params: { offset: { x: 0, y: 0 }, blur: 18, color: '#ffffff', opacity: 0.35 } };

// The walk judges letterforms, so the text stays still: entrances and exits
// are instant fades and the animation is simultaneous. Without this the
// engine default (fade + a per-letter stagger of ~35ms) smears the exit
// across more than a second, leaving the first letters half-exited at the
// capture point near the cue end.
const STATIC_ANIMATION = { type: 'simultaneous', enabled: true, params: {}, motion: { stagger: { each: 0 } } };
const STATIC_ENTER = { type: 'fade', enabled: true, params: {}, motion: { in: { duration: 0.01, ease: 'linear' } } };
const STATIC_EXIT = { type: 'fade', enabled: true, params: {}, motion: { out: { duration: 0.01, ease: 'linear' } } };

function edgeOf(sectionIndex) {
  return clone(sectionIndex % 2 === 0 ? OUTLINE : HALO);
}

function decorationName(sectionIndex) {
  return sectionIndex % 2 === 0 ? 'outline' : 'dropShadow';
}

const SECTIONS = [
  { id: 'sans', label: 'ゴシック (sans)', note: '本文の基本となるサンセリフ。欧文のみと和文の2書体を見比べます。' },
  { id: 'sansBold', label: 'ゴシック太字 (sansBold)', note: '同じゴシックの太字。見出しや強調の読みやすさを見ます。' },
  { id: 'serif', label: '明朝・セリフ (serif)', note: 'うろこのあるセリフ体。欧文のみと和文を見比べます。' },
  { id: 'display', label: 'ディスプレイ (display)', note: '見出し向けの強い書体。和文のデラゴシックと欧文のコンデンス体です。' },
  { id: 'round', label: '丸ゴシック (round)', note: '角の丸い柔らかい書体。' },
  { id: 'hand', label: '手書き (hand)', note: '手書き風の書体。' },
  { id: 'pop', label: 'ポップ (pop)', note: '勢いのあるポップ体。' },
];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function round(value, digits) {
  const factor = Math.pow(10, digits == null ? 3 : digits);
  return Math.round(value * factor) / factor;
}

function fontsOf(sectionId) {
  return FONTS.filter((entry) => entry.fontClass === sectionId);
}

function cueId(index) {
  return `font_${String(index + 1).padStart(2, '0')}`;
}

function cueLabel(index, entry) {
  const bold = (entry.weight || 400) >= 600 && !/bold/i.test(entry.family) ? ' Bold' : '';
  return `${index}. ${entry.family}${bold}`;
}

function cueText(index, entry) {
  return `${cueLabel(index, entry)}\n${SAMPLE_LATIN}\n${SAMPLE_DIGITS}\n${SAMPLE_JA}`;
}

function buildShowcase() {
  const cues = [];
  const markers = [];
  const entries = [];
  let t = 0;
  let index = 0;
  for (const section of SECTIONS) {
    const list = fontsOf(section.id);
    if (!list.length) continue;
    markers.push({ t: round(t), label: section.label });
    for (const entry of list) {
      index += 1;
      const start = round(t);
      const end = round(t + FONT_SECONDS);
      const id = cueId(index - 1);
      cues.push({
        id,
        start,
        end,
        text: cueText(index, entry),
        // four lines shown at once: keep the lyric two-line cap from
        // rebalancing the explicit breaks (see showcase.js PAGE_TEXT_FLOW)
        textFlow: { maxLines: { '16:9': 4, '9:16': 4 } },
        meta: { kind: 'font-showcase', index, fontId: entry.id },
      });
      entries.push({ index, section: section.id, sectionLabel: section.label, cueId: id, start, end, font: entry });
      t = end;
    }
  }

  const doc = project.create({});
  doc.meta.title = 'TelopMotion フォント見本';
  doc.meta.lang = 'ja';
  doc.meta.createdAt = FIXED_TIME;
  doc.meta.updatedAt = FIXED_TIME;
  doc.script.cues = cues;
  doc.script.sourceName = 'font-showcase.json';
  doc.markers = markers;
  textflow.apply(doc);
  let sectionIndex = -1;
  let lastSection = null;
  for (const entry of entries) {
    if (entry.section !== lastSection) {
      lastSection = entry.section;
      sectionIndex += 1;
    }
    doc.cueStyles[entry.cueId] = {
      text: { fontId: entry.font.id, weight: entry.font.weight, size: TEXT_SIZE },
      color: { fill: { kind: 'solid', value: FONT_FILLS[entry.font.id], alpha: 1 } },
      edge: [edgeOf(sectionIndex)],
      animation: clone(STATIC_ANIMATION),
      enter: clone(STATIC_ENTER),
      exit: clone(STATIC_EXIT),
    };
  }

  return { project: doc, entries, markers, sections: SECTIONS.filter((section) => fontsOf(section.id).length), total: round(t) };
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
  lines.push('# フォント見本 (font showcase)');
  lines.push('');
  lines.push(`同梱フォント ${FONTS.length} 書体を 1 キューずつ並べた見本プロジェクトです。各キューは同じ欧文・数字・和文サンプルを大きなサイズ（${TEXT_SIZE}px）で表示し、書体ごとの色とシンプルな装飾（縁取り・影）も付けています（欧文専用書体の和文は Noto Sans JP へのフォールバックで表示されます）。`);
  lines.push('');
  lines.push(`- 1 書体 = 1 キュー（${FONT_SECONDS} 秒）、全文を1ビートで静止表示します`);
  lines.push('- 開くには Studio の *Help → フォント見本*、または *File → Open project…* を使います');
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
  lines.push('| `npm run font-showcase -- build` | このプロジェクトとこの一覧を再生成 |');
  lines.push('| `node scripts/font-showcase.js list` | セクションとキューを一覧 |');
  lines.push('');
  let sectionIndex = 0;
  for (const section of built.sections) {
    const sectionRows = built.entries.filter((entry) => entry.section === section.id);
    if (!sectionRows.length) continue;
    sectionIndex += 1;
    lines.push(`## ${sectionIndex}. ${section.label}`);
    lines.push('');
    if (section.note) lines.push(section.note);
    lines.push('');
    lines.push(`サイズ ${TEXT_SIZE}px・装飾 ${decorationName(sectionIndex - 1)}`);
    lines.push('');
    lines.push('| # | キュー | 時間 | 書体 | 和文 | 色 |');
    lines.push('|---:|---|---|---|---|---|');
    for (const entry of sectionRows) {
      lines.push(`| ${entry.index} | \`${entry.cueId}\` | ${formatRange(entry)} | ${entry.font.family} \`${entry.font.id}\` | ${entry.font.cjk ? 'あり' : 'なし（フォールバック）'} | \`${FONT_FILLS[entry.font.id]}\` |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function listText() {
  const built = buildShowcase();
  const lines = [];
  let order = 0;
  for (const section of built.sections) {
    const rows = built.entries.filter((entry) => entry.section === section.id);
    if (!rows.length) continue;
    order += 1;
    lines.push(`${order}. ${section.label} — ${rows.length} cues, ${TEXT_SIZE}px, ${decorationName(order - 1)}`);
    for (const entry of rows) {
      lines.push(`   ${String(entry.index).padStart(3, ' ')}. ${formatRange(entry)}  ${entry.font.family} / ${entry.font.id} ${FONT_FILLS[entry.font.id]}`);
    }
    lines.push('');
  }
  lines.push(`total ${built.entries.length} cues, ${built.total}s`);
  return lines.join('\n');
}

function build(options) {
  const opts = options || {};
  const out = opts.out || OUT_PATH;
  const md = opts.md === null ? null : opts.md || MD_PATH;
  const built = buildShowcase();
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

function help() {
  console.log([
    'FONT SHOWCASE: every bundled typeface in one project',
    '',
    '  node scripts/font-showcase.js build [--out <file>] [--md off]',
    '  node scripts/font-showcase.js list',
  ].join('\n'));
}

function main(argv) {
  const args = parseArgs(argv);
  const command = args.positional[0] && args.positional[0] !== 'build' ? args.positional[0] : 'build';
  if (command === 'help') {
    help();
    return 0;
  }
  try {
    if (command === 'list') {
      console.log(listText());
      return 0;
    }
    if (command !== 'build') {
      help();
      return 1;
    }
    const result = build({
      out: args.flags.out === true ? null : args.flags.out,
      md: args.flags.md === 'off' ? null : args.flags.md,
    });
    console.log(`font-showcase: ${result.written.out} (${result.entries.length} cues, ${result.total}s)${result.written.changed ? '' : ' [unchanged]'}`);
    if (result.written.md) console.log(`font-showcase: ${result.written.md}${result.written.mdChanged ? '' : ' [unchanged]'}`);
    return 0;
  } catch (error) {
    console.error(`font-showcase: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  FONTS,
  FONT_SECONDS,
  SECTIONS,
  TEXT_SIZE,
  FONT_FILLS,
  SAMPLE_LATIN,
  SAMPLE_DIGITS,
  SAMPLE_JA,
  OUT_PATH,
  MD_PATH,
  fontsOf,
  cueLabel,
  cueText,
  edgeOf,
  decorationName,
  buildShowcase,
  indexMarkdown,
  listText,
  build,
  serialize,
};
