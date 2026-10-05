'use strict';

// THEME SHOWCASE: one project that walks every theme preset, so the themes
// can be reviewed on their own from Help → Theme showcase.
//
//   node scripts/theme-showcase.js build [--sections standard,background] [--out <file>] [--md off]
//     writes renderer/data/theme-showcase.json and demo/theme-showcase.md
//   node scripts/theme-showcase.js list [--section pro]
//
// The walk has four sections. `standard` is the classic LIST presets,
// `background` is the text-background / ornament BG_PRESETS, `genre` is the
// generated genre presets and `pro` is the staged STAGED_LOOKS. One cue is
// four seconds, the lyric text names the preset id plus the same sample
// everywhere, and each cue pins the preset style in `cueStyles` so the walk
// reads as one theme per cue.
//
// The output is generated, never hand edited: re-run this after LIST,
// BG_PRESETS, the genre presets or STAGED_LOOKS change.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const requirePart = (relative) => require(path.join(ROOT, relative));

const project = requirePart('renderer/js/studio/project.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');

const THEME_SECONDS = 4;
// a fixed stamp keeps the generated file byte-identical on every run, so the
// build only writes when the walk itself changed
const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const OUT_PATH = path.join(ROOT, 'renderer', 'data', 'theme-showcase.json');
const MD_PATH = path.join(ROOT, 'demo', 'theme-showcase.md');

const SAMPLE_JA = 'あいうえお カキクケコ 愛永漢字';
const SAMPLE_LATIN = 'Aiueo 0123';

const SECTIONS = [
  { id: 'standard', label: '定番 (standard)', note: '基本のテーマプリセットです。1プリセット＝1キューで見せます。' },
  { id: 'background', label: '背景・装飾 (background)', note: '文字背景・オーナメントのプリセットです。1プリセット＝1キューで見せます。' },
  { id: 'genre', label: 'ジャンル (genre)', note: 'ジャンルから生成したプリセットです。ホラー・恋愛・失恋・パーティを見せます。' },
  { id: 'pro', label: 'プロ (pro)', note: 'ステージング済みのプロ向けルックです。1ルック＝1キューで見せます。' },
];

const GENRE_IDS = new Set([
  'horrorBlood',
  'horrorRansom',
  'horrorScratch',
  'loveHeartbeat',
  'loveHearts',
  'heartbreakTears',
  'partyConfetti',
]);

const BG_IDS = new Set([
  'varietyBox',
  'marker',
  'badgeDots',
  'bubbleLetters',
  'confetti',
  'dashedFrame',
  'typewriterCursor',
]);

const EFFECT_GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg'];

let cachedPresets = null;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function round(value, digits) {
  const factor = Math.pow(10, digits == null ? 3 : digits);
  return Math.round(value * factor) / factor;
}

// Genre presets are built lazily from the mood generator, so Node must load
// the effect registry first (same loop as scripts/gen-genre-presets.js) and
// expose moods/genres/project on global SA before listing.
function loadAllPresets() {
  if (cachedPresets) return cachedPresets;
  const registry = requirePart('renderer/js/lyrics/effects/registry.js');
  void registry;
  for (const name of EFFECT_GROUPS) {
    requirePart(`renderer/js/lyrics/effects/${name}.js`);
  }
  const moods = requirePart('renderer/js/lyrics/moods.js');
  const genres = requirePart('renderer/js/lyrics/genres.js');
  const presets = requirePart('renderer/js/lyrics/presets.js');
  global.SA = global.SA || {};
  global.SA.moods = global.SA.moods || moods;
  global.SA.genres = global.SA.genres || genres;
  global.SA.project = global.SA.project || project;
  cachedPresets = presets.list({ packs: 'all' });
  return cachedPresets;
}

function sectionOf(entry) {
  if (entry.pack === 'pro') return 'pro';
  if (GENRE_IDS.has(entry.id)) return 'genre';
  if (BG_IDS.has(entry.id)) return 'background';
  return 'standard';
}

function cueId(index) {
  return `th_${String(index + 1).padStart(3, '0')}`;
}

function cueText(index, id) {
  return `${index}. ${id}\n${SAMPLE_JA} ${SAMPLE_LATIN}`;
}

// The walk itself, without any timing: one slot per theme preset, in
// presets.list({ packs: 'all' }) order (standard, background, genre, pro).
function plan() {
  const presets = loadAllPresets();
  return presets.map((entry, at) => ({
    index: at + 1,
    section: sectionOf(entry),
    value: entry.id,
    seconds: THEME_SECONDS,
    cueId: cueId(at),
    style: clone(entry.style),
  }));
}

function buildShowcase(options) {
  const opts = options || {};
  const wanted = opts.sections && opts.sections.length ? new Set(opts.sections) : null;
  const slots = plan().filter((slot) => !wanted || wanted.has(slot.section));
  if (!slots.length) throw new Error('no section matched; nothing to build');

  const cues = [];
  const markers = [];
  const entries = [];
  const cueStyles = {};
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
      text: cueText(slot.index, slot.value),
      meta: { kind: 'theme-showcase', section: slot.section, value: slot.value },
    });
    cueStyles[id] = clone(slot.style);
    entries.push({ index: slot.index, section: slot.section, sectionLabel: sectionById.get(slot.section).label, cueId: id, start, end, value: slot.value, style: clone(slot.style) });
    t = end;
  });
  const total = round(t);

  const doc = project.create({});
  doc.meta.title = 'TelopMotion テーマ見本';
  doc.meta.lang = 'ja';
  doc.meta.createdAt = FIXED_TIME;
  doc.meta.updatedAt = FIXED_TIME;
  doc.script.cues = cues;
  doc.script.sourceName = 'theme-showcase.json';
  doc.markers = markers;
  textflow.apply(doc);
  doc.cueStyles = cueStyles;

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
  lines.push('# テーマ見本 (theme showcase)');
  lines.push('');
  lines.push(`テーマプリセットを 1 キューずつ並べた見本プロジェクトです。どのキューも同じサンプル文を表示し、違うのはテーマ（\`cueStyles\`）だけです。`);
  lines.push('');
  lines.push(`- 1テーマ = 1キュー（${THEME_SECONDS} 秒）`);
  lines.push('- 各キューはプリセットのスタイルをそのまま持ちます');
  lines.push('- 開くには Studio の *Help → テーマ見本*、または *File → Open project…* を使います');
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
  lines.push('| `npm run theme-showcase -- build` | このプロジェクトとこの一覧を再生成 |');
  lines.push('| `node scripts/theme-showcase.js list` | セクションとキューを一覧 |');
  lines.push('| `node scripts/theme-showcase.js list --section pro` | 1 セクションだけ表示 |');
  lines.push('| `npm run theme-showcase -- build --sections standard,pro` | セクションを絞って生成 |');
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
    lines.push('| # | キュー | 時間 | 値 |');
    lines.push('|---:|---|---|---|');
    for (const entry of sectionRows) {
      lines.push(`| ${entry.index} | \`${entry.cueId}\` | ${formatRange(entry)} | \`${entry.value}\` |`);
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
  const migratedStyles = migrated.project.cueStyles || {};
  if (Object.keys(migratedStyles).length !== built.entries.length) {
    throw new Error(`generated project has ${Object.keys(migratedStyles).length} cue styles for ${built.entries.length} cues`);
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
      lines.push(`   ${String(entry.index).padStart(3, ' ')}. ${formatRange(entry)}  ${entry.value}`);
    }
    lines.push('');
  }
  lines.push(`total ${built.entries.length} cues, ${built.total}s`);
  return lines.join('\n');
}

function help() {
  console.log([
    'THEME SHOWCASE: every theme preset in one project',
    '',
    '  node scripts/theme-showcase.js build [--sections standard,pro] [--out <file>] [--md off]',
    '  node scripts/theme-showcase.js list [--section pro]',
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
    console.log(`theme-showcase: ${result.written.out} (${result.entries.length} cues, ${result.total}s)${result.written.changed ? '' : ' [unchanged]'}`);
    if (result.written.md) console.log(`theme-showcase: ${result.written.md}${result.written.mdChanged ? '' : ' [unchanged]'}`);
    return 0;
  } catch (error) {
    console.error(`theme-showcase: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  SECTIONS,
  THEME_SECONDS,
  OUT_PATH,
  MD_PATH,
  plan,
  buildShowcase,
  indexMarkdown,
  listText,
  build,
  serialize,
};
