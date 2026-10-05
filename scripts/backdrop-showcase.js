'use strict';

// BACKDROP SHOWCASE: one project that walks the backdrop (mid) track, so the
// layer behind the lyrics can be reviewed on its own from Help → Backdrop
// showcase.
//
//   node scripts/backdrop-showcase.js build [--sections accent,split] [--out <file>] [--md off]
//     writes renderer/data/backdrop-showcase.json and demo/backdrop-showcase.md
//   node scripts/backdrop-showcase.js list [--section split]
//
// The walk has three sections. `accent` is the texture layer alone (one cue per
// single-layer type: shapes / pattern / particles / spectrum / waveform /
// figures). `split` is the painted colour planes alone (one cue per split
// layout). `motion` pins one reference combo (halves planes + burst shapes) and
// varies only the clip-level motion (`animate.mode`), so neighbouring cues
// differ only in the motion under review. One cue is four seconds, the lyric
// text is the same sample everywhere, and one dark plate sits behind the whole
// walk so the layers read against the same ground.
//
// The output is generated, never hand edited: re-run this after the
// filler-render split layouts, the accent types or BACKDROP_MOTIONS change.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const requirePart = (relative) => require(path.join(ROOT, relative));

const project = requirePart('renderer/js/studio/project.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');

const BACKDROP_SECONDS = 4;
// a fixed stamp keeps the generated file byte-identical on every run, so the
// build only writes when the walk itself changed
const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const OUT_PATH = path.join(ROOT, 'renderer', 'data', 'backdrop-showcase.json');
const MD_PATH = path.join(ROOT, 'demo', 'backdrop-showcase.md');
// every layer is read against the same ground, so a cue differs only in the
// backdrop it draws: one deep plate, one label colour, one shared accent
// palette and one shared plane set
const PLATE = '#0d1220';
const LABEL_COLOR = '#e9edf8';
const BACKDROP_COLORS = ['#6f8bff', '#4dd6c1', '#ffd166'];
const PLANE_COLORS = ['#23365f', '#2e4a7d', '#3a5f9e'];

const SAMPLE_JA = 'あいうえお カキクケコ 愛永漢字';
const SAMPLE_LATIN = 'Aiueo 0123';

// the single-layer textures the walk covers: the five BACKDROP_TYPES the auto
// direction draws plus the figure accent the plane system can carry
const ACCENT_TYPES = ['shapes', 'pattern', 'particles', 'spectrum', 'waveform', 'figures'];
// every split layout filler-render knows
const SPLIT_LAYOUTS = ['halves', 'diagonal', 'thirds', 'bands', 'quads', 'grid', 'chevron', 'radial', 'mondrian', 'frame', 'shards'];
// the clip-level motions moods.BACKDROP_MOTIONS knows (read back in the test so
// a new motion fails loudly instead of silently missing its cue)
const MOTIONS = ['accent', 'swell', 'sway', 'drift', 'still', 'pulse', 'travel', 'zoom', 'tilt'];

const SECTIONS = [
  { id: 'accent', label: 'アクセント (accent)', note: '後景の質感レイヤーだけを1層で出しています。分割プレーンはありません。' },
  { id: 'split', label: '分割プレーン (split)', note: '色の面だけを出しています。質感レイヤーはありません。動きは breathe に固定しています。' },
  { id: 'motion', label: 'クリップモーション (motion)', note: '参照コンボ（halves + burst）を固定し、クリップ全体のモーション（animate.mode）だけを変えています。' },
];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function round(value, digits) {
  const factor = Math.pow(10, digits == null ? 3 : digits);
  return Math.round(value * factor) / factor;
}

function accentSpec(type) {
  switch (type) {
    case 'shapes':
      return { type: 'shapes', params: { set: 'burst', count: 12, speed: 0.8, opacity: 0.6 } };
    case 'pattern':
      return { type: 'pattern', params: { mode: 'stripes', count: 24, size: 1, speed: 0.4, opacity: 0.6 } };
    case 'particles':
      return { type: 'particles', params: { flow: 'rise', count: 24, size: 2.4 } };
    case 'spectrum':
      return { type: 'spectrum', params: { mode: 'bars', bars: 48, falloff: 1 } };
    case 'waveform':
      return { type: 'waveform', params: { mode: 'line', thickness: 2.5, amp: 1 } };
    case 'figures':
      return { type: 'figures', params: { motif: 'orbit', sync: 'free', density: 0.5, count: 8, opacity: 0.35 } };
    default:
      throw new Error(`unknown accent type ${type}`);
  }
}

function partsForLayout(layout) {
  if (layout === 'halves' || layout === 'diagonal' || layout === 'frame') return 2;
  if (layout === 'thirds' || layout === 'bands' || layout === 'chevron') return 3;
  return 4;
}

function splitSpec(layout) {
  return {
    type: 'split',
    params: {
      layout,
      parts: partsForLayout(layout),
      angle: layout === 'diagonal' ? 12 : 0,
      coverage: 0.85,
      scheme: 'tonal',
      motion: 'breathe',
      speed: 0.4,
      amp: 0.05,
      colors: PLANE_COLORS.slice(),
    },
  };
}

function referencePlane() {
  return splitSpec('halves');
}

function referenceAccent() {
  return accentSpec('shapes');
}

// the clip-level motion on top of a combo: the same shape
// moods.backdropMotion returns, pinned to deterministic values so the walk is
// byte-identical on every run
function animateFor(mode) {
  const motion = { mode, pulse: 0.06, drift: mode === 'still' ? 0.006 : 0.024, transition: 'wipe', duration: 0.35 };
  if (mode !== 'still') motion.sync = 0.1;
  if (mode === 'accent') motion.every = 4;
  if (mode === 'swell' || mode === 'sway') motion.every = 8;
  if (mode === 'sway') motion.sway = 0.03;
  if (mode === 'travel') {
    motion.travel = 0.08;
    motion.dir = 'right';
  }
  if (mode === 'zoom') motion.zoom = 0.1;
  if (mode === 'tilt') motion.tilt = 0.02;
  return motion;
}

function comboSpec(mode) {
  return {
    type: 'combo',
    params: { list: [referencePlane(), referenceAccent()], animate: animateFor(mode) },
  };
}

function cueId(index) {
  return `bd_${String(index + 1).padStart(3, '0')}`;
}

function cueText(index, value) {
  return `${index}. ${value}\n${SAMPLE_JA} ${SAMPLE_LATIN}`;
}

// The walk itself, without any timing: one slot per cue, in playing order.
function plan() {
  const slots = [];
  const push = (section, value, spec) => {
    const index = slots.length;
    slots.push({ index: index + 1, section, value, seconds: BACKDROP_SECONDS, cueId: cueId(index), spec });
  };
  for (const type of ACCENT_TYPES) push('accent', type, accentSpec(type));
  for (const layout of SPLIT_LAYOUTS) push('split', layout, splitSpec(layout));
  for (const mode of MOTIONS) push('motion', mode, comboSpec(mode));
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
      // (same shape as the font showcase's `{ kind, index }`)
      meta: { kind: 'backdrop-showcase', index: slot.index, section: slot.section, value: slot.value },
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
      colors: BACKDROP_COLORS.slice(),
    });
    entries.push({ index: slot.index, section: slot.section, sectionLabel: sectionById.get(slot.section).label, cueId: id, start, end, value: slot.value, spec: clone(slot.spec) });
    t = end;
  });
  const total = round(t);

  const doc = project.create({});
  doc.meta.title = 'TelopMotion 後景見本';
  doc.meta.lang = 'ja';
  doc.meta.createdAt = FIXED_TIME;
  doc.meta.updatedAt = FIXED_TIME;
  doc.script.cues = cues;
  doc.script.sourceName = 'backdrop-showcase.json';
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
  // one plate under the whole walk, so no layer is judged against the preview
  // backdrop
  clips.unshift({
    id: 'clip_bd_plate',
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
  lines.push('# 後景見本 (backdrop showcase)');
  lines.push('');
  lines.push(`歌詞の後ろに敷く後景（\`mid\` トラック）を 1 キューずつ並べた見本プロジェクトです。どのキューも同じサンプル文を表示し、違うのは後景だけです。`);
  lines.push('');
  lines.push(`- 1 層・1 配置・1 モーション = 1 キュー（${BACKDROP_SECONDS} 秒）`);
  lines.push('- 後景は後景トラック（`mid`）のクリップです。キューは中央のサンプル文だけを持ちます');
  lines.push('- モーションのセクションは参照コンボ（halves + burst）を使い、隣り合うキューで違うのはクリップの動きだけです');
  lines.push('- 開くには Studio の *Help → 後景見本*、または *File → Open project…* を使います');
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
  lines.push('| `npm run backdrop-showcase -- build` | このプロジェクトとこの一覧を再生成 |');
  lines.push('| `node scripts/backdrop-showcase.js list` | セクションとキューを一覧 |');
  lines.push('| `node scripts/backdrop-showcase.js list --section split` | 1 セクションだけ表示 |');
  lines.push('| `npm run backdrop-showcase -- build --sections accent,split` | セクションを絞って生成 |');
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
  const backdropClips = migrated.project.clips.filter((clip) => clip.trackId === 'mid');
  if (backdropClips.length !== built.entries.length) {
    throw new Error(`generated project has ${backdropClips.length} backdrop clips for ${built.entries.length} cues`);
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
    'BACKDROP SHOWCASE: every backdrop layer and motion in one project',
    '',
    '  node scripts/backdrop-showcase.js build [--sections accent,split] [--out <file>] [--md off]',
    '  node scripts/backdrop-showcase.js list [--section split]',
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
    console.log(`backdrop-showcase: ${result.written.out} (${result.entries.length} cues, ${result.total}s)${result.written.changed ? '' : ' [unchanged]'}`);
    if (result.written.md) console.log(`backdrop-showcase: ${result.written.md}${result.written.mdChanged ? '' : ' [unchanged]'}`);
    return 0;
  } catch (error) {
    console.error(`backdrop-showcase: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  ACCENT_TYPES,
  BACKDROP_COLORS,
  BACKDROP_SECONDS,
  LABEL_COLOR,
  MD_PATH,
  MOTIONS,
  OUT_PATH,
  PLANE_COLORS,
  PLATE,
  SECTIONS,
  SPLIT_LAYOUTS,
  accentSpec,
  animateFor,
  comboSpec,
  cueText,
  plan,
  splitSpec,
  buildShowcase,
  indexMarkdown,
  listText,
  build,
  serialize,
};
