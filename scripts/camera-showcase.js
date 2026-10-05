'use strict';

// CAMERA SHOWCASE: one project that walks every camera move, so the frame
// posts can be eyeballed from Help → Camera showcase.
//
//   node scripts/camera-showcase.js build [--sections push,pan] [--out <file>] [--md off]
//     writes renderer/data/camera-showcase.json and demo/camera-showcase.md
//   node scripts/camera-showcase.js list [--section pan]
//
// The walk is one cue per move in `lyrics/effects/camera.js` (10 moves:
// pushIn … orbit), grouped into three sections: `push` (dolly in / out /
// punch), `pan` (the four directions) and `tilt` (tilt / orbit / handheld).
// One cue is four seconds; the lyric text is the same sample everywhere, the
// entrance and exit stay fixed, and one dark plate sits behind the whole walk
// so the frame moves read against the same ground. Neighbouring cues differ
// only in the camera move under review.
//
// The output is generated, never hand edited: re-run this after
// `renderer/js/lyrics/effects/camera.js` gains or loses a move. The move ids
// are language-independent, so no re-labelling is needed (same shape as the
// ease showcase).

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const requirePart = (relative) => require(path.join(ROOT, relative));

const camera = requirePart('renderer/js/lyrics/effects/camera.js');
const project = requirePart('renderer/js/studio/project.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');

// The moves the walk covers, read from the effect itself so a new move fails
// loudly (unknown section below) instead of silently missing its cue.
const MOVES = camera.MOVES.slice();

const CAMERA_SECONDS = 4;
// a fixed stamp keeps the generated file byte-identical on every run, so the
// build only writes when the walk itself changed
const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const OUT_PATH = path.join(ROOT, 'renderer', 'data', 'camera-showcase.json');
const MD_PATH = path.join(ROOT, 'demo', 'camera-showcase.md');

const SAMPLE = 'あいうえお Aiueo 0123';
// one dark plate under the whole walk, so no move is judged against the
// preview backdrop
const PLATE = '#0d1220';

const SECTIONS = [
  { id: 'push', label: '寄り・引き (push)', note: 'フレーム全体に寄る・引く動き。pushIn / pullOut / zoomPunch。量 (amount) と速さ (speed) は全キュー固定。' },
  { id: 'pan', label: 'パン (pan)', note: '上下左右への平行移動。panLeft / panRight / panUp / panDown。向きだけが違う。' },
  { id: 'tilt', label: '傾き・揺れ (tilt)', note: '傾き・旋回・手持ちの揺れ。tilt / orbit / handheld。動きの質だけが違う。' },
];

// The section each move walks in, in playing order. Every MOVES entry must
// appear exactly once (checked in plan()).
const SECTION_MOVES = {
  push: ['pushIn', 'pullOut', 'zoomPunch'],
  pan: ['panLeft', 'panRight', 'panUp', 'panDown'],
  tilt: ['tilt', 'orbit', 'handheld'],
};

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function round(value, digits) {
  const factor = Math.pow(10, digits == null ? 3 : digits);
  return Math.round(value * factor) / factor;
}

function cueId(index) {
  return `cm_${String(index + 1).padStart(3, '0')}`;
}

function cueText(index, move) {
  return `${index}. ${move}\n${SAMPLE}`;
}

// One move cue's style: everything fixed except the camera move under review
// (amount 0.3 / speed 0.6), on the shared slide entrance and fade exit so
// neighbouring cues differ only in the move.
function cameraStyle(move) {
  return {
    enter: { type: 'slide', params: { dir: 'up', distance: 0.35 }, motion: { in: { duration: 1, ease: 'cubicOut' } } },
    exit: { type: 'fade', params: {}, motion: { out: { duration: 0.4, ease: 'cubicIn' } } },
    post: [{ type: 'camera', params: { move, amount: 0.3, speed: 0.6 }, enabled: true }],
  };
}

// The walk itself, without any timing: one slot per cue, in playing order.
function plan() {
  const slots = [];
  const push = (section, value) => {
    const index = slots.length;
    slots.push({ index: index + 1, section, value, detail: value, seconds: CAMERA_SECONDS, cueId: cueId(index), style: cameraStyle(value) });
  };
  for (const section of SECTIONS) {
    const moves = SECTION_MOVES[section.id];
    if (!moves) throw new Error(`no moves listed for section ${section.id}`);
    for (const move of moves) push(section.id, move);
  }
  const walked = slots.map((slot) => slot.value).sort();
  const known = MOVES.slice().sort();
  if (walked.length !== known.length || walked.some((move, at) => move !== known[at])) {
    throw new Error(`walk covers [${walked.join(', ')}] but camera.js lists [${known.join(', ')}]`);
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
      text: cueText(slot.index, slot.value),
      // the ids are language-independent, so the Studio needs no re-labelling
      // (same shape as the ease showcase's `{ kind, section, value }`)
      meta: { kind: 'camera-showcase', section: slot.section, value: slot.value },
    });
    entries.push({ index: slot.index, section: slot.section, sectionLabel: sectionById.get(slot.section).label, cueId: id, start, end, value: slot.value, detail: slot.detail, style: clone(slot.style) });
    t = end;
  });
  const total = round(t);

  const doc = project.create({});
  doc.meta.title = 'TelopMotion カメラ見本';
  doc.meta.lang = 'ja';
  doc.meta.createdAt = FIXED_TIME;
  doc.meta.updatedAt = FIXED_TIME;
  doc.script.cues = cues;
  doc.script.sourceName = 'camera-showcase.json';
  doc.markers = markers;
  textflow.apply(doc);
  for (const entry of entries) {
    doc.cueStyles[entry.cueId] = clone(entry.style);
  }
  // one plate under the whole walk, so every frame move reads against the
  // same ground (same shape as the backdrop showcase plate)
  doc.clips = [{
    id: 'clip_cm_plate',
    trackId: 'bg',
    start: 0,
    end: total,
    spec: { type: 'solid', params: { color: PLATE } },
    opacity: 1,
    fadeIn: 0.2,
    fadeOut: 0.2,
    colors: null,
  }];

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
  lines.push('# カメラ見本 (camera showcase)');
  lines.push('');
  lines.push('フレーム全体を動かすカメラワーク（`post` の camera エフェクトの 10 ムーブ）を 1 キューずつ並べた見本プロジェクトです。どのキューも同じサンプル文・同じ出入りで始まり、違うのはカメラの動きだけです。');
  lines.push('');
  lines.push(`- 1ムーブ＝1キュー（${CAMERA_SECONDS} 秒）、量 (amount) 0.3・速さ (speed) 0.6 に固定`);
  lines.push('- 開くには Studio の *Help → カメラ見本*、または *File → Open project…* を使います');
  lines.push(`- 全キューの背後には濃色プレート（\`${PLATE}\`）を敷いています`);
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
  lines.push('| `npm run camera-showcase -- build` | このプロジェクトとこの一覧を再生成 |');
  lines.push('| `node scripts/camera-showcase.js list` | セクションとキューを一覧 |');
  lines.push('| `node scripts/camera-showcase.js list --section pan` | 1 セクションだけ表示 |');
  lines.push('| `npm run camera-showcase -- build --sections push,pan` | セクションを絞って生成 |');
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
    lines.push('| # | キュー | 時間 | 動き |');
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
  for (const entry of built.entries) {
    const container = migrated.project.cueStyles[entry.cueId];
    const posts = container && container.post;
    const found = Array.isArray(posts) && posts.some((post) => post && post.type === 'camera' && post.params && post.params.move === entry.value);
    if (!found) throw new Error(`generated project lost the camera move for ${entry.cueId}`);
  }
  const plate = (migrated.project.clips || []).find((clip) => clip.trackId === 'bg');
  if (!plate || !plate.spec || plate.spec.type !== 'solid') {
    throw new Error('generated project lost the background plate');
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
    'CAMERA SHOWCASE: every camera move in one project',
    '',
    '  node scripts/camera-showcase.js build [--sections push,pan] [--out <file>] [--md off]',
    '  node scripts/camera-showcase.js list [--section pan]',
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
    console.log(`camera-showcase: ${result.written.out} (${result.entries.length} cues, ${result.total}s)${result.written.changed ? '' : ' [unchanged]'}`);
    if (result.written.md) console.log(`camera-showcase: ${result.written.md}${result.written.mdChanged ? '' : ' [unchanged]'}`);
    return 0;
  } catch (error) {
    console.error(`camera-showcase: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  CAMERA_SECONDS,
  SECTIONS,
  SECTION_MOVES,
  MOVES,
  PLATE,
  OUT_PATH,
  MD_PATH,
  cameraStyle,
  plan,
  buildShowcase,
  indexMarkdown,
  listText,
  build,
  serialize,
};
