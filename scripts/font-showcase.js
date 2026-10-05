'use strict';

// FONT SHOWCASE: one project that walks every bundled typeface, so the fonts
// can be eyeballed from Help → Font showcase.
//
//   node scripts/font-showcase.js build [--out <file>] [--md off]
//     writes renderer/data/font-showcase.json and demo/font-showcase.md
//   node scripts/font-showcase.js list
//
// One bundled font is one four-second cue: the cue text names the family and
// the id on the first line and shows the same Latin + Japanese sample on the
// next lines, so a CJK face and a Latin-only face read differently at a glance
// (a Latin-only face falls back per character to the bundled Noto Sans JP).
// The cue style pins `text.fontId` (and the matching weight), nothing else, so
// neighbouring cues differ only in the typeface. Cues are grouped by
// `fontClass` — the perceptual class the repeat group's font variation swaps
// between — with one marker per class.
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

const SAMPLE_LATIN = 'AaBbCcDdEeFfGg 0123456789';
const SAMPLE_JA = 'あいうえお カキクケコ 愛永漢字 0123';

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

function cueText(index, entry) {
  return `${index}. ${entry.family} / ${entry.id}\n${SAMPLE_LATIN}\n${SAMPLE_JA}`;
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
  for (const entry of entries) {
    doc.cueStyles[entry.cueId] = { text: { fontId: entry.font.id, weight: entry.font.weight } };
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
  lines.push(`同梱フォント ${FONTS.length} 書体を 1 キューずつ並べた見本プロジェクトです。各キューは同じ欧文・和文サンプルを表示し、キューの書体だけが違います（欧文専用書体の和文は Noto Sans JP へのフォールバックで表示されます）。`);
  lines.push('');
  lines.push(`- 1 書体 = 1 キュー（${FONT_SECONDS} 秒）`);
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
    lines.push('| # | キュー | 時間 | 書体 | 和文 |');
    lines.push('|---:|---|---|---|---|');
    for (const entry of sectionRows) {
      lines.push(`| ${entry.index} | \`${entry.cueId}\` | ${formatRange(entry)} | ${entry.font.family} \`${entry.font.id}\` | ${entry.font.cjk ? 'あり' : 'なし（フォールバック）'} |`);
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
    lines.push(`${order}. ${section.label} — ${rows.length} cues`);
    for (const entry of rows) {
      lines.push(`   ${String(entry.index).padStart(3, ' ')}. ${formatRange(entry)}  ${entry.font.family} / ${entry.font.id}`);
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
  SAMPLE_LATIN,
  SAMPLE_JA,
  OUT_PATH,
  MD_PATH,
  fontsOf,
  cueText,
  buildShowcase,
  indexMarkdown,
  listText,
  build,
  serialize,
};
