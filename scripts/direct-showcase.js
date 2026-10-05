'use strict';

// DIRECT SHOWCASE: one project that walks every composition template plus the
// genre and mood looks, so the automatic direction can be eyeballed from
// Help → Direct showcase.
//
//   node scripts/direct-showcase.js build [--sections comp,genre] [--out <file>] [--md off]
//     writes renderer/data/direct-showcase.json and demo/direct-showcase.md
//   node scripts/direct-showcase.js list [--section genre]
//
// The walk has three sections. `comp` is one cue per composition template in
// `renderer/js/lyrics/compositions.js` (10 ids: heroCenter … whisper), each
// built with `compositions.build` on the same sample beat so neighbouring
// cues differ only in the composition under review. `genre` is one cue per
// genre in `renderer/js/lyrics/genres.js` (10 ids: horror … washu), each drawn
// with `moods.generate({ genre })` so the genre's look reads at a glance.
// `mood` is one cue per mood preset in `renderer/js/lyrics/moods.js` PRESETS
// (6 ids: ballad … washu), each drawn with `moods.generate({ axes })`. One
// cue is four seconds; the lyric text names the section and the value, and
// one marker opens every section.
//
// The output is generated, never hand edited: re-run this after
// `compositions.js` gains or loses a template, or after `genres.js` /
// `moods.js` change their lists. The ids are language-independent, so no
// re-labelling is needed (same shape as the ease showcase).

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const requirePart = (relative) => require(path.join(ROOT, relative));

const registry = requirePart('renderer/js/lyrics/effects/registry.js');
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg']) {
  requirePart(`renderer/js/lyrics/effects/${name}.js`);
}
const rng = requirePart('renderer/js/lyrics/rng.js');
const moods = requirePart('renderer/js/lyrics/moods.js');
const genres = requirePart('renderer/js/lyrics/genres.js');
const compositions = requirePart('renderer/js/lyrics/compositions.js');
const project = requirePart('renderer/js/studio/project.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');

void registry;
void rng;

const DIRECT_SECONDS = 4;
// a fixed stamp keeps the generated file byte-identical on every run, so the
// build only writes when the walk itself changed
const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const OUT_PATH = path.join(ROOT, 'renderer', 'data', 'direct-showcase.json');
const MD_PATH = path.join(ROOT, 'demo', 'direct-showcase.md');

const SAMPLE = 'あいうえお Aiueo 0123';

// Composition templates in walk order (matches compositions.js LIST order).
const COMP_IDS = [
  'heroCenter',
  'leftHeadline',
  'lowerBand',
  'bracketCenter',
  'posterStack',
  'cornerQuiet',
  'verticalRight',
  'diagonalJump',
  'bleedHero',
  'whisper',
];

// Genres in walk order (matches genres.js LIST order).
const GENRE_IDS = [
  'horror',
  'love',
  'heartbreak',
  'party',
  'ballad',
  'cinematic',
  'cute',
  'electro',
  'rock',
  'washu',
];

// Mood presets in walk order (matches moods.js PRESETS order).
const MOOD_IDS = [
  'ballad',
  'cinematic',
  'cute',
  'electro',
  'rock',
  'washu',
];

// Fallback axes for the six mood presets (moods.js lines 124-131), used only
// when `moods.PRESETS` is not exported.
const FALLBACK_MOOD_AXES = {
  ballad: { speed: 0.15, energy: 0.15, softness: 0.85, density: 0.35, brightness: 0.45 },
  cinematic: { speed: 0.25, energy: 0.35, softness: 0.6, density: 0.4, brightness: 0.4 },
  cute: { speed: 0.6, energy: 0.45, softness: 0.75, density: 0.5, brightness: 0.85 },
  electro: { speed: 0.7, energy: 0.65, softness: 0.35, density: 0.6, brightness: 0.9 },
  rock: { speed: 0.9, energy: 0.9, softness: 0.15, density: 0.75, brightness: 0.75 },
  washu: { speed: 0.35, energy: 0.3, softness: 0.7, density: 0.25, brightness: 0.5 },
};

const SECTIONS = [
  { id: 'comp', label: '構図 (comp)', note: '作画の構図テンプレートを1キューずつ。同じ見本分で、違うのは構図だけです。' },
  { id: 'genre', label: 'ジャンル (genre)', note: 'ジャンルごとの見た目を1キューずつ。同じ種で、違うのはジャンルの演出だけです。' },
  { id: 'mood', label: 'ムード (mood)', note: 'ムードプリセットの見た目を1キューずつ。軸の組み合わせで雰囲気が変わります。' },
];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function round(value, digits) {
  const factor = Math.pow(10, digits == null ? 3 : digits);
  return Math.round(value * factor) / factor;
}

function cueId(index) {
  return `dr_${String(index + 1).padStart(3, '0')}`;
}

function cueText(index, section, id) {
  return `${index}. ${section}/${id}\n${SAMPLE}`;
}

function moodAxesFor(id) {
  if (moods && Array.isArray(moods.PRESETS)) {
    const preset = moods.PRESETS.find((entry) => entry && entry.id === id);
    if (preset && preset.axes) return clone(preset.axes);
  }
  if (FALLBACK_MOOD_AXES[id]) return clone(FALLBACK_MOOD_AXES[id]);
  return null;
}

// One composition cue's style: the template built on the shared sample beat.
function compStyle(id, index) {
  const analysis = compositions.analyzeBeat(SAMPLE, 'ja');
  const patch = compositions.build(compositions.get(id), analysis, { seed: 1000 + index, beatId: `direct_${id}`, screen: 1080 });
  return clone(patch);
}

// One genre cue's style: the genre's generated look.
function genreStyle(id, index) {
  const generated = moods.generate({ genre: id, seed: 2000 + index });
  return clone(generated.style);
}

// One mood cue's style: the preset axes' generated look.
function moodStyle(id, index) {
  const axes = moodAxesFor(id);
  const generated = moods.generate({ axes, seed: 3000 + index });
  return clone(generated.style);
}

function styleFor(section, id, index) {
  if (section === 'comp') return compStyle(id, index);
  if (section === 'genre') return genreStyle(id, index);
  return moodStyle(id, index);
}

// The walk itself, without any timing: one slot per cue, in playing order.
function plan() {
  const slots = [];
  const push = (section, value, detail, seconds, style) => {
    const index = slots.length;
    slots.push({ index: index + 1, section, value, detail, seconds, cueId: cueId(index), style: clone(style) });
  };
  for (const id of COMP_IDS) {
    const index = slots.length + 1;
    push('comp', id, id, DIRECT_SECONDS, styleFor('comp', id, index));
  }
  for (const id of GENRE_IDS) {
    const index = slots.length + 1;
    push('genre', id, id, DIRECT_SECONDS, styleFor('genre', id, index));
  }
  for (const id of MOOD_IDS) {
    const index = slots.length + 1;
    push('mood', id, id, DIRECT_SECONDS, styleFor('mood', id, index));
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
      text: cueText(slot.index, slot.section, slot.value),
      // the ids are language-independent, so the Studio needs no re-labelling
      // (same shape as the ease showcase's `{ kind, section, value }`)
      meta: { kind: 'direct-showcase', section: slot.section, value: slot.value },
    });
    entries.push({ index: slot.index, section: slot.section, sectionLabel: sectionById.get(slot.section).label, cueId: id, start, end, value: slot.value, detail: slot.detail, style: clone(slot.style) });
    t = end;
  });
  const total = round(t);

  const doc = project.create({});
  doc.meta.title = 'TelopMotion 演出見本';
  doc.meta.lang = 'ja';
  doc.meta.createdAt = FIXED_TIME;
  doc.meta.updatedAt = FIXED_TIME;
  doc.script.cues = cues;
  doc.script.sourceName = 'direct-showcase.json';
  doc.markers = markers;
  textflow.apply(doc);
  for (const entry of entries) {
    doc.cueStyles[entry.cueId] = clone(entry.style);
  }

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
  lines.push('# 演出見本 (direct showcase)');
  lines.push('');
  lines.push('構図テンプレート10種・ジャンル10種・ムード6種を 1 キューずつ並べた見本プロジェクトです。どのキューも同じ見本分を表示し、違うのは構図か演出だけです。');
  lines.push('');
  lines.push(`- 1演出＝1キュー（${DIRECT_SECONDS} 秒）`);
  lines.push('- 開くには Studio の *Help → 演出見本*、または *File → Open project…* を使います');
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
  lines.push('| `npm run direct-showcase -- build` | このプロジェクトとこの一覧を再生成 |');
  lines.push('| `node scripts/direct-showcase.js list` | セクションとキューを一覧 |');
  lines.push('| `node scripts/direct-showcase.js list --section genre` | 1 セクションだけ表示 |');
  lines.push('| `npm run direct-showcase -- build --sections comp,genre` | セクションを絞って生成 |');
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
      lines.push(`| ${entry.index} | \`${entry.cueId}\` | ${formatRange(entry)} | \`${entry.detail}\` |`);
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
      lines.push(`   ${String(entry.index).padStart(3, ' ')}. ${formatRange(entry)}  ${entry.detail}`);
    }
    lines.push('');
  }
  lines.push(`total ${built.entries.length} cues, ${built.total}s`);
  return lines.join('\n');
}

function help() {
  console.log([
    'DIRECT SHOWCASE: every composition, genre and mood in one project',
    '',
    '  node scripts/direct-showcase.js build [--sections comp,genre] [--out <file>] [--md off]',
    '  node scripts/direct-showcase.js list [--section genre]',
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
    console.log(`direct-showcase: ${result.written.out} (${result.entries.length} cues, ${result.total}s)${result.written.changed ? '' : ' [unchanged]'}`);
    if (result.written.md) console.log(`direct-showcase: ${result.written.md}${result.written.mdChanged ? '' : ' [unchanged]'}`);
    return 0;
  } catch (error) {
    console.error(`direct-showcase: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  DIRECT_SECONDS,
  SECTIONS,
  COMP_IDS,
  GENRE_IDS,
  MOOD_IDS,
  OUT_PATH,
  MD_PATH,
  plan,
  buildShowcase,
  indexMarkdown,
  listText,
  build,
  serialize,
};
