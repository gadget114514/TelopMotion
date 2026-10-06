'use strict';

// MOTION SHOWCASE: the motion gallery (SA.motion.motionPresets(), 424 entries)
// split into 16 sequential parts, so every part stays around 80 seconds and
// can be reviewed on its own from Help → Motion showcase.
//
//   node scripts/motion-showcase.js build [--parts 01,02] [--out <dir>] [--md off]
//     writes renderer/data/motion-showcase-01.json … -16.json and demo/motion-showcase.md
//   node scripts/motion-showcase.js list
//
// One cue is three seconds and carries exactly one custom motion
// (`style.motions`, the same shape the Motion gallery writes via
// SA.inspector.addMotion), on top of a neutral simultaneous animation with
// short fades — neighbouring cues differ only in the motion under review.
//
// The output is generated, never hand edited: re-run this after
// MOTION_PRESETS or text-effects-data changes.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const requirePart = (relative) => require(path.join(ROOT, relative));

const fx = requirePart('renderer/js/lyrics/effects/registry.js');
requirePart('renderer/js/lyrics/effects/enter.js');
requirePart('renderer/js/lyrics/effects/exit.js');
requirePart('renderer/js/lyrics/effects/hold.js');
requirePart('renderer/js/lyrics/effects/shader-fx.js');
const motion = requirePart('renderer/js/lyrics/motion.js');
const project = requirePart('renderer/js/studio/project.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');

const PART_COUNT = 16;
const MOTION_SECONDS = 3;
// a fixed stamp keeps the generated files byte-identical on every run, so the
// build only writes when the walk itself changed
const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const DATA_DIR = path.join(ROOT, 'renderer', 'data');
const MD_PATH = path.join(ROOT, 'demo', 'motion-showcase.md');

const SAMPLE = 'あいうえお Aiueo 0123';

// the still frame every motion plays on: simultaneous timing plus short fades,
// the same ground the Motion gallery assumes when a preset is added by hand
const STATIC_ANIMATION = { type: 'simultaneous', enabled: true, params: {} };
const STATIC_ENTER = { type: 'fade', enabled: true, params: {}, motion: { in: { duration: 0.4, ease: 'cubicOut' } } };
const STATIC_EXIT = { type: 'fade', enabled: true, params: {}, motion: { out: { duration: 0.4, ease: 'cubicIn' } } };

const PHASE_ORDER = { enter: 0, hold: 1, exit: 2 };

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function round(value, digits) {
  const factor = Math.pow(10, digits == null ? 3 : digits);
  return Math.round(value * factor) / factor;
}

function partId(index) {
  return String(index + 1).padStart(2, '0');
}

function fileName(index) {
  return `motion-showcase-${partId(index)}.json`;
}

// the full walk, without any timing: every motion preset in a stable order
// (phase, then category, then id) so neighbouring cues read as one family.
function plan() {
  const presets = motion.motionPresets();
  const ordered = presets.slice().sort((a, b) => {
    const pa = PHASE_ORDER[a.phase] != null ? PHASE_ORDER[a.phase] : 9;
    const pb = PHASE_ORDER[b.phase] != null ? PHASE_ORDER[b.phase] : 9;
    if (pa !== pb) return pa - pb;
    const ca = a.categoryJa || a.categoryEn || a.group || '';
    const cb = b.categoryJa || b.categoryEn || b.group || '';
    if (ca !== cb) return ca < cb ? -1 : 1;
    const ia = a.id || '';
    const ib = b.id || '';
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  });
  return ordered.map((preset, at) => ({
    index: at + 1,
    presetId: preset.id,
    group: preset.group || null,
    phase: preset.phase,
    type: preset.type,
    labelJa: preset.nameJa || null,
    labelEn: preset.nameEn || null,
    category: preset.categoryJa || preset.categoryEn || preset.group || '',
    from: preset.from === 'end' ? 'end' : 'start',
    delay: Number(preset.delay) || 0,
    duration: Number(preset.duration) || 0.6,
    ease: preset.ease || (preset.phase === 'enter' ? 'easeOutCubic' : preset.phase === 'exit' ? 'easeInCubic' : 'linear'),
    params: clone(preset.params || {}),
  }));
}

// 16 contiguous chunks; the first chunks take the remainder so every part
// holds 26 or 27 cues.
function partition(slots) {
  const base = Math.floor(slots.length / PART_COUNT);
  const extra = slots.length - base * PART_COUNT;
  const parts = [];
  let at = 0;
  for (let part = 0; part < PART_COUNT; part += 1) {
    const size = base + (part < extra ? 1 : 0);
    parts.push({ part: partId(part), slots: slots.slice(at, at + size) });
    at += size;
  }
  return parts;
}

// the same entry SA.inspector.addMotion writes: the registry defaults under
// the preset params, over its own window.
function motionEntry(slot, cueId) {
  const phase = slot.phase === 'exit' ? 'exit' : slot.phase === 'hold' ? 'hold' : 'enter';
  return {
    id: `m_${cueId}`,
    phase,
    type: slot.type,
    from: slot.from,
    delay: slot.delay,
    duration: slot.duration,
    ease: slot.ease,
    params: { ...(fx.paramDefaults(phase, slot.type) || {}), ...(slot.params || {}) },
    enabled: true,
  };
}

function cueIdOf(part, offset) {
  return `mo${part}_${String(offset + 1).padStart(2, '0')}`;
}

function cueText(slot) {
  const label = slot.labelJa || slot.labelEn || slot.presetId;
  const sub = slot.labelJa && slot.labelEn && slot.labelEn !== slot.labelJa ? ` (${slot.labelEn})` : '';
  return `${slot.index}. ${label}${sub} · ${slot.type}\n${SAMPLE}`;
}

function buildPart(partEntry) {
  const { part, slots } = partEntry;
  const cues = [];
  const entries = [];
  const cueStyles = {};
  let t = 0;
  slots.forEach((slot, offset) => {
    const id = cueIdOf(part, offset);
    const start = round(t);
    const end = round(t + MOTION_SECONDS);
    cues.push({
      id,
      start,
      end,
      text: cueText(slot),
      meta: {
        kind: 'motion-showcase',
        part,
        index: slot.index,
        presetId: slot.presetId,
        group: slot.group,
        phase: slot.phase,
        type: slot.type,
      },
    });
    cueStyles[id] = {
      animation: clone(STATIC_ANIMATION),
      enter: clone(STATIC_ENTER),
      exit: clone(STATIC_EXIT),
      motions: [motionEntry(slot, id)],
    };
    entries.push({ ...slot, part, cueId: id, start, end });
    t = end;
  });
  const total = round(t);

  const doc = project.create({});
  doc.meta.title = `TelopMotion モーション見本 ${part}/16`;
  doc.meta.lang = 'ja';
  doc.meta.createdAt = FIXED_TIME;
  doc.meta.updatedAt = FIXED_TIME;
  doc.script.cues = cues;
  doc.script.sourceName = fileName(Number(part) - 1);
  doc.markers = [{ t: 0, label: `Motion ${part}/16` }];
  textflow.apply(doc);
  doc.cueStyles = cueStyles;

  return { part, project: doc, entries, total };
}

function buildShowcase(options) {
  const opts = options || {};
  const wanted = opts.parts && opts.parts.length ? new Set(opts.parts) : null;
  const slots = plan();
  const parts = partition(slots)
    .filter((entry) => !wanted || wanted.has(entry.part))
    .map(buildPart);
  if (!parts.length) throw new Error('no part matched; nothing to build');
  return { slots, parts };
}

function outPath(part) {
  return path.join(DATA_DIR, `motion-showcase-${part}.json`);
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

function indexMarkdown(built) {
  const lines = [];
  lines.push('# モーション見本 (motion showcase)');
  lines.push('');
  lines.push('モーションギャラリーのプリセットを1キューずつ並べた見本です。各キューは同じサンプル文に1モーションだけを載せています（`cueStyles.motions`）。424件を16ファイルに分け、1ファイルが約80秒です。');
  lines.push('');
  lines.push('- 1モーション = 1キュー（3秒）、1ファイル = 26〜27キュー');
  lines.push('- 開くには Studio の *Help → モーション見本 → Motion 01/16 … 16/16*、または *File → Open project…* を使います');
  lines.push('- すべて通しで見るには *Help → モーション見本 → すべて連続再生* を使います（中断可）');
  lines.push('');
  lines.push('| # | ファイル | キュー数 | 時間 | 内容 |');
  lines.push('|---:|---|---:|---|---|');
  for (const part of built.parts) {
    const first = part.entries[0];
    const last = part.entries[part.entries.length - 1];
    lines.push(`| ${part.part} | \`motion-showcase-${part.part}.json\` | ${part.entries.length} | ${round(0, 1)}–${round(part.total, 1)}s | ${first.phase} ${first.category} … ${last.phase} ${last.category} |`);
  }
  lines.push(`| | **合計** | **${built.slots.length}** | | |`);
  lines.push('');
  lines.push('## コマンド');
  lines.push('');
  lines.push('| コマンド | 内容 |');
  lines.push('|---|---|');
  lines.push('| `npm run motion-showcase -- build` | 16ファイルとこの一覧を再生成 |');
  lines.push('| `node scripts/motion-showcase.js list` | パートと件数を一覧 |');
  lines.push('| `npm run motion-showcase -- build --parts 01,02` | パートを絞って生成 |');
  lines.push('');
  for (const part of built.parts) {
    lines.push(`## Motion ${part.part}/16`);
    lines.push('');
    lines.push('| # | キュー | プリセット | phase | 分類 | type |');
    lines.push('|---:|---|---|---|---|---|---|');
    for (const entry of part.entries) {
      lines.push(`| ${entry.index} | \`${entry.cueId}\` | \`${entry.presetId}\` | ${entry.phase} | ${entry.category} | \`${entry.type}\` |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function build(options) {
  const opts = options || {};
  const dir = opts.out || DATA_DIR;
  const md = opts.md === null ? null : opts.md || MD_PATH;
  const built = buildShowcase(opts);
  const written = [];
  for (const part of built.parts) {
    const migrated = project.migrate(clone(part.project));
    if (!migrated.ok) throw new Error(`part ${part.part} did not migrate: ${migrated.error}`);
    if (migrated.project.script.cues.length !== part.entries.length) {
      throw new Error(`part ${part.part} lost cues: ${migrated.project.script.cues.length}`);
    }
    const migratedStyles = migrated.project.cueStyles || {};
    if (Object.keys(migratedStyles).length !== part.entries.length) {
      throw new Error(`part ${part.part} has ${Object.keys(migratedStyles).length} cue styles for ${part.entries.length} cues`);
    }
    const file = path.join(dir, `motion-showcase-${part.part}.json`);
    const changed = writeFileIfChanged(file, serialize(part.project));
    written.push({ part: part.part, file, changed, cues: part.entries.length, total: part.total });
  }
  const mdChanged = md ? writeFileIfChanged(md, indexMarkdown(built)) : false;
  return { ...built, written, md, mdChanged };
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

function parseParts(value) {
  if (typeof value !== 'string') return null;
  const ids = value.split(',').map((item) => item.trim()).filter(Boolean)
    .map((item) => item.padStart(2, '0'));
  if (!ids.length) return null;
  const known = [];
  for (let i = 1; i <= PART_COUNT; i += 1) known.push(String(i).padStart(2, '0'));
  for (const id of ids) {
    if (!known.includes(id)) throw new Error(`unknown part ${id} (${known[0]}-${known[known.length - 1]})`);
  }
  return ids;
}

function listText() {
  const slots = plan();
  const parts = partition(slots);
  const lines = [];
  for (const entry of parts) {
    const first = entry.slots[0];
    const last = entry.slots[entry.slots.length - 1];
    lines.push(`${entry.part}/16 — ${entry.slots.length} cues: #${first.index} ${first.phase}/${first.type} … #${last.index} ${last.phase}/${last.type}`);
  }
  lines.push(`total ${slots.length} cues in ${parts.length} parts`);
  return lines.join('\n');
}

function help() {
  console.log([
    'MOTION SHOWCASE: every motion preset in 16 sequential parts',
    '',
    '  node scripts/motion-showcase.js build [--parts 01,02] [--out <dir>] [--md off]',
    '  node scripts/motion-showcase.js list',
    '',
    `parts: 01-${String(PART_COUNT).padStart(2, '0')}`,
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
      parts: parseParts(args.flags.parts),
      out: args.flags.out === true ? null : args.flags.out,
      md: args.flags.md === 'off' ? null : args.flags.md,
    });
    for (const entry of result.written) {
      console.log(`motion-showcase: ${entry.file} (${entry.cues} cues, ${entry.total}s)${entry.changed ? '' : ' [unchanged]'}`);
    }
    if (result.md) console.log(`motion-showcase: ${result.md}${result.mdChanged ? '' : ' [unchanged]'}`);
    return 0;
  } catch (error) {
    console.error(`motion-showcase: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  PART_COUNT,
  MOTION_SECONDS,
  DATA_DIR,
  MD_PATH,
  plan,
  partition,
  motionEntry,
  cueText,
  buildPart,
  buildShowcase,
  indexMarkdown,
  listText,
  build,
  serialize,
  outPath,
};
