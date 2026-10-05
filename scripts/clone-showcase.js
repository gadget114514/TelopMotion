'use strict';

// CLONE SHOWCASE: one project that walks the text clones (`style.clones`),
// so the "same string three times in parallel" copies can be reviewed on
// their own from Help → Clone showcase.
//
//   node scripts/clone-showcase.js build [--sections offset,scale] [--out <file>] [--md off]
//     writes renderer/data/clone-showcase.json and demo/clone-showcase.md
//   node scripts/clone-showcase.js list [--section motion]
//
// Every cue shows the same sample as three parallel strings: three clones
// spread with dx -0.14 / 0 / +0.14, differing only in the axis under review
// (the inspector vocabulary: dx / dy / scale / rotate / opacity / hue /
// delay / motion type). The `motion` section pins one motion type on all
// three copies per cue. One cue is four seconds, one marker opens every
// section.
//
// The output is generated, never hand edited: re-run this after the clone
// params in `renderer/js/lyrics/engine.js` (cloneTransform / cloneColors /
// cloneMotionState) or the inspector fields change.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const requirePart = (relative) => require(path.join(ROOT, relative));

const project = requirePart('renderer/js/studio/project.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');

const CLONE_SECONDS = 4;
// a fixed stamp keeps the generated file byte-identical on every run, so the
// build only writes when the walk itself changed
const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const OUT_PATH = path.join(ROOT, 'renderer', 'data', 'clone-showcase.json');
const MD_PATH = path.join(ROOT, 'demo', 'clone-showcase.md');

const SAMPLE = 'あいうえお Aiueo 123';
const LABEL_COLOR = '#e9edf8';
// hue shifts do nothing on grey, so the hue cues use a chromatic main fill
const HUE_COLOR = '#ff7a3d';

// the three parallel copies: spread wide enough to read as three strings,
// close enough to stay in frame at 64px
const SPREAD = [-0.14, 0, 0.14];

const SECTIONS = [
  { id: 'offset', label: 'ずらし (offset)', note: '同じ文字列を横（dx）・縦（dy）にずらして3つ並べます。他はすべて同じで、違うのは位置だけです。' },
  { id: 'scale', label: '大きさ (scale)', note: '3つのコピーの大きさを変えています（0.75 / 1 / 1.25）。位置の並びは固定です。' },
  { id: 'rotate', label: '回転 (rotate)', note: '3つのコピーの回転を変えています（-10° / 0° / +10°）。' },
  { id: 'opacity', label: '不透明度 (opacity)', note: '3つのコピーの濃さを変えています（0.25 / 0.5 / 0.8）。位置の並びは固定です。' },
  { id: 'hue', label: '色相 (hue)', note: '3つのコピーの色相をずらしています（-70° / 0° / +70°）。本体が有彩色なので回転が分かります。' },
  { id: 'delay', label: '遅延 (delay)', note: '3つのコピーの出現をずらしています（0秒 / 0.25秒 / 0.5秒）。頭で順に現れます。' },
  { id: 'motion', label: '動き (motion)', note: '3つのコピーに同じ動きを付けています。動きの種類だけが違う6キューです。' },
];

// motion types in walk order (matches the inspector select)
const MOTIONS = ['none', 'drift', 'float', 'pulse', 'orbit', 'spin'];
const MOTION_JA = { none: 'なし', drift: '漂流', float: '浮かぶ', pulse: '脈動', orbit: '周回', spin: '回転' };
// per-motion amounts that read at a glance (same units as dx/dy, fractions
// of the frame short side; pulse is a scale ratio, spin is ±amount*90°)
const MOTION_AMOUNT = { none: 0, drift: 0.05, float: 0.05, pulse: 0.1, orbit: 0.05, spin: 0.12 };

// the text stays still so the copies can be judged: entrances and exits are
// short fades and the animation is simultaneous (same rule as the font and
// decor showcases)
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

function cueId(index) {
  return `cl_${String(index + 1).padStart(3, '0')}`;
}

// one clone of the parallel trio: the neutral base plus the per-copy patch.
// `motion` always carries the inspector defaults so every cue shows the full
// stored shape.
function trioClone(patch) {
  return {
    dx: 0, dy: 0, scale: 1, rotate: 0, opacity: 0.5, hue: 0, delay: 0,
    motion: { type: 'none', amount: 0.03, speed: 0.8 },
    enabled: true,
    ...(patch || {}),
  };
}

function styleFor(clones, fill) {
  return {
    color: { fill: { kind: 'solid', value: fill || LABEL_COLOR, alpha: 1 } },
    clones: clones.map((entry) => trioClone(entry)),
    animation: clone(STATIC_ANIMATION),
    enter: clone(STATIC_ENTER),
    exit: clone(STATIC_EXIT),
  };
}

function cueText(index, value, detail) {
  const head = detail && detail !== value ? `${index}. ${value} · ${detail}` : `${index}. ${value}`;
  return `${head}\n${SAMPLE}`;
}

// The walk itself, without any timing: one slot per cue, in playing order.
function plan() {
  const slots = [];
  const push = (section, value, detail, style) => {
    const index = slots.length;
    slots.push({ index: index + 1, section, value, detail, seconds: CLONE_SECONDS, cueId: cueId(index), style: clone(style) });
  };
  // horizontal and vertical trios: only the position differs
  push('offset', 'dx', 'X -0.14 / 0 / +0.14', styleFor(SPREAD.map((dx) => ({ dx }))));
  push('offset', 'dy', 'Y -0.12 / 0 / +0.12', styleFor([-0.12, 0, 0.12].map((dy, i) => ({ dx: SPREAD[i], dy }))));
  push('scale', 'scale', '0.75 / 1 / 1.25', styleFor([0.75, 1, 1.25].map((scale, i) => ({ dx: SPREAD[i], scale }))));
  push('rotate', 'rotate', '-10° / 0° / +10°', styleFor([-10, 0, 10].map((rotate, i) => ({ dx: SPREAD[i], rotate }))));
  push('opacity', 'opacity', '0.25 / 0.5 / 0.8', styleFor([0.25, 0.5, 0.8].map((opacity, i) => ({ dx: SPREAD[i], opacity }))));
  push('hue', 'hue', '-70° / 0° / +70°', styleFor([-70, 0, 70].map((hue, i) => ({ dx: SPREAD[i], hue })), HUE_COLOR));
  push('delay', 'delay', '0秒 / 0.25秒 / 0.5秒', styleFor([0, 0.25, 0.5].map((delay, i) => ({ dx: SPREAD[i], delay }))));
  for (const motion of MOTIONS) {
    push(
      'motion',
      motion,
      `${MOTION_JA[motion] || motion} ×3`,
      styleFor(SPREAD.map((dx) => ({ dx, motion: { type: motion, amount: MOTION_AMOUNT[motion], speed: 1 } })))
    );
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
      text: cueText(slot.index, slot.value, slot.detail),
      // the ids are language-independent, so the Studio needs no re-labelling
      // (same shape as the font showcase's `{ kind, index }`)
      meta: { kind: 'clone-showcase', index: slot.index, section: slot.section, value: slot.value, detail: slot.detail },
    });
    entries.push({ index: slot.index, section: slot.section, sectionLabel: sectionById.get(slot.section).label, cueId: id, start, end, value: slot.value, detail: slot.detail, style: clone(slot.style) });
    t = end;
  });
  const total = round(t);

  const doc = project.create({});
  doc.meta.title = 'TelopMotion クローン見本';
  doc.meta.lang = 'ja';
  doc.meta.createdAt = FIXED_TIME;
  doc.meta.updatedAt = FIXED_TIME;
  doc.script.cues = cues;
  doc.script.sourceName = 'clone-showcase.json';
  doc.markers = markers;
  // the sample stays in the middle of the frame, leaving room for the outer
  // copies on both sides
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
  lines.push('# クローン見本 (clone showcase)');
  lines.push('');
  lines.push('同じ文字列を3つ平行に描くクローン（`style.clones`）を 1 キューずつ並べた見本プロジェクトです。どのキューも同じ見本分を3コピー（dx -0.14 / 0 / +0.14）で描き、違うのは見比べる軸だけです。');
  lines.push('');
  lines.push(`- 1 キュー＝${CLONE_SECONDS} 秒。コピーはインスペクターの語彙そのまま（dx / dy / scale / rotate / opacity / hue / delay / motion）です`);
  lines.push('- 動きのセクションは3コピーに同じ動きを付け、種類だけを変えた6キューです');
  lines.push('- 色相は無彩色だと回転が分からないため、本体に有彩色を使っています');
  lines.push('- 開くには Studio の *Help → クローン見本*、または *File → Open project…* を使います');
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
  lines.push('| `npm run clone-showcase -- build` | このプロジェクトとこの一覧を再生成 |');
  lines.push('| `node scripts/clone-showcase.js list` | セクションとキューを一覧 |');
  lines.push('| `node scripts/clone-showcase.js list --section motion` | 1 セクションだけ表示 |');
  lines.push('| `npm run clone-showcase -- build --sections offset,scale` | セクションを絞って生成 |');
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
  const migratedClones = Object.values(migrated.project.cueStyles || {}).filter((bag) => Array.isArray(bag.clones));
  if (migratedClones.length !== built.entries.length) {
    throw new Error(`generated project kept clones for ${migratedClones.length} of ${built.entries.length} cues`);
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
    'CLONE SHOWCASE: the same string three times in parallel, one axis at a time',
    '',
    '  node scripts/clone-showcase.js build [--sections offset,scale] [--out <file>] [--md off]',
    '  node scripts/clone-showcase.js list [--section motion]',
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
    console.log(`clone-showcase: ${result.written.out} (${result.entries.length} cues, ${result.total}s)${result.written.changed ? '' : ' [unchanged]'}`);
    if (result.written.md) console.log(`clone-showcase: ${result.written.md}${result.written.mdChanged ? '' : ' [unchanged]'}`);
    return 0;
  } catch (error) {
    console.error(`clone-showcase: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  CLONE_SECONDS,
  SECTIONS,
  MOTIONS,
  MOTION_AMOUNT,
  SPREAD,
  OUT_PATH,
  MD_PATH,
  trioClone,
  styleFor,
  cueText,
  plan,
  buildShowcase,
  indexMarkdown,
  listText,
  build,
  serialize,
};
