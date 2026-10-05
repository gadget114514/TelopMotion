'use strict';

// FILLER SHOWCASE: one project that walks the filler preset library, so every
// filler preset can be reviewed on its own from Help → Filler showcase.
//
//   node scripts/filler-showcase.js build [--sections pattern,split] [--out <file>] [--md off]
//     writes renderer/data/filler-showcase.json and demo/filler-showcase.md
//   node scripts/filler-showcase.js list [--section split]
//
// The walk has nine sections, one per filler preset group (pattern / split /
// shapes / particles / audio / figures / text / timer / combo). One cue is
// three seconds, the lyric text is the same sample everywhere, and one dark
// plate sits behind the whole walk so the layers read against the same ground.
//
// The output is generated, never hand edited: re-run this after the
// filler-presets library changes.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const requirePart = (relative) => require(path.join(ROOT, relative));

const project = requirePart('renderer/js/studio/project.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');
const fillerPresets = requirePart('renderer/js/lyrics/filler-presets.js');

const LIST = fillerPresets.list();

const FILLER_SECONDS = 3;
// a fixed stamp keeps the generated file byte-identical on every run, so the
// build only writes when the walk itself changed
const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const OUT_PATH = path.join(ROOT, 'renderer', 'data', 'filler-showcase.json');
const MD_PATH = path.join(ROOT, 'demo', 'filler-showcase.md');
// every preset is read against the same ground, so a cue differs only in the
// filler it draws: one deep plate and one label colour
const PLATE = '#0d1220';
const LABEL_COLOR = '#e9edf8';

const SAMPLE = 'あいうえお Aiueo 0123';

const GROUP_LABELS = {
  pattern: 'パターン',
  split: '分割面',
  shapes: '図形',
  particles: 'パーティクル',
  audio: 'オーディオ',
  figures: 'フィギュア',
  text: 'テキスト',
  timer: 'タイマー',
  combo: 'コンボ',
};

const GROUP_NOTES = {
  pattern: '模様レイヤーだけを出しています。1モードにつき2構成（静か・大胆）を見せます。',
  split: '色の分割面だけを出しています。動きの違いを見せます。',
  shapes: '図形レイヤーだけを出しています。1セットにつき2構成（少数・多数）を見せます。',
  particles: 'パーティクルだけを出しています。1流れにつき2構成（細か・やわらか）を見せます。',
  audio: '音声連動（波形・スペクトラム・サイン波）だけを出しています。',
  figures: 'フィギュア（図形アニメーション）だけを出しています。',
  text: 'テキストアニメだけを出しています。',
  timer: 'カウントダウン・プログレスだけを出しています。',
  combo: '複数レイヤーの組み合わせを出しています。',
};

const SECTIONS = fillerPresets.groups().map((id) => ({
  id,
  label: `${GROUP_LABELS[id] || id} (${id})`,
  note: GROUP_NOTES[id] || '',
}));

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function round(value, digits) {
  const factor = Math.pow(10, digits == null ? 3 : digits);
  return Math.round(value * factor) / factor;
}

function cueId(index) {
  return `fl_${String(index + 1).padStart(3, '0')}`;
}

function cueText(index, value) {
  return `${index}. ${value}\n${SAMPLE}`;
}

// The walk itself, without any timing: one slot per filler preset, in group
// order and in library order inside each group.
function plan() {
  const slots = [];
  const push = (section, value, spec) => {
    const index = slots.length;
    slots.push({ index: index + 1, section, value, seconds: FILLER_SECONDS, cueId: cueId(index), spec });
  };
  for (const group of fillerPresets.groups()) {
    for (const preset of LIST) {
      if (preset.group !== group) continue;
      push(group, preset.id, clone(preset.spec));
    }
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
      text: cueText(slot.index, slot.value),
      // the ids are language-independent, so the Studio needs no re-labelling
      meta: { kind: 'filler-showcase', section: slot.section, value: slot.value },
    });
    clips.push({
      id: `clip_${id}`,
      trackId: 'mid',
      start,
      end,
      spec: clone(slot.spec),
      opacity: 1,
      fadeIn: 0.25,
      fadeOut: 0.25,
      colors: null,
    });
    entries.push({ index: slot.index, section: slot.section, sectionLabel: sectionById.get(slot.section).label, cueId: id, start, end, value: slot.value, spec: clone(slot.spec) });
    t = end;
  });
  const total = round(t);

  const doc = project.create({});
  doc.meta.title = 'TelopMotion フィラー見本';
  doc.meta.lang = 'ja';
  doc.meta.createdAt = FIXED_TIME;
  doc.meta.updatedAt = FIXED_TIME;
  doc.script.cues = cues;
  doc.script.sourceName = 'filler-showcase.json';
  doc.markers = markers;
  // the sample stays in the middle of the frame, large enough to judge the
  // separation between the lyrics and the layer behind them
  doc.style.text.fontId = 'NotoSansJP-Regular';
  doc.style.text.size = 64;
  doc.style.text.align = 'center';
  doc.style.color = {
    fill: { kind: 'solid', value: LABEL_COLOR, alpha: 1 },
    stroke: { kind: 'solid', value: LABEL_COLOR, alpha: 1 },
  };
  textflow.apply(doc);
  // one plate under the whole walk, so no preset is judged against the preview
  // backdrop
  clips.unshift({
    id: 'clip_filler_plate',
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
  lines.push('# フィラー見本 (filler showcase)');
  lines.push('');
  lines.push(`フィラープリセット（\`mid\` トラック）を 1 キューずつ並べた見本プロジェクトです。どのキューも同じサンプル文を表示し、違うのはフィラーだけです。`);
  lines.push('');
  lines.push(`- 1プリセット＝1キュー（${FILLER_SECONDS} 秒/キュー）、グループごとに見出しを付けています`);
  lines.push('- フィラーは後景トラック（`mid`）のクリップです。キューは中央のサンプル文だけを持ちます');
  lines.push('- 開くには Studio の *Help → フィラー見本*、または *File → Open project…* を使います');
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
  lines.push('| `npm run filler-showcase -- build` | このプロジェクトとこの一覧を再生成 |');
  lines.push('| `node scripts/filler-showcase.js list` | セクションとキューを一覧 |');
  lines.push('| `node scripts/filler-showcase.js list --section split` | 1 セクションだけ表示 |');
  lines.push('| `npm run filler-showcase -- build --sections pattern,split` | セクションを絞って生成 |');
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
    lines.push('| # | キュー | 時間 | 値 | 仕様 |');
    lines.push('|---:|---|---|---|---|');
    for (const entry of sectionRows) {
      lines.push(`| ${entry.index} | \`${entry.cueId}\` | ${formatRange(entry)} | \`${entry.value}\` | ${entry.spec.type} |`);
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
  const fillerClips = migrated.project.clips.filter((clip) => clip.trackId === 'mid');
  if (fillerClips.length !== built.entries.length) {
    throw new Error(`generated project has ${fillerClips.length} filler clips for ${built.entries.length} cues`);
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
    'FILLER SHOWCASE: every filler preset in one project',
    '',
    '  node scripts/filler-showcase.js build [--sections pattern,split] [--out <file>] [--md off]',
    '  node scripts/filler-showcase.js list [--section split]',
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
    console.log(`filler-showcase: ${result.written.out} (${result.entries.length} cues, ${result.total}s)${result.written.changed ? '' : ' [unchanged]'}`);
    if (result.written.md) console.log(`filler-showcase: ${result.written.md}${result.written.mdChanged ? '' : ' [unchanged]'}`);
    return 0;
  } catch (error) {
    console.error(`filler-showcase: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  SECTIONS,
  FILLER_SECONDS,
  LABEL_COLOR,
  MD_PATH,
  OUT_PATH,
  PLATE,
  cueText,
  plan,
  buildShowcase,
  indexMarkdown,
  listText,
  build,
  serialize,
};
