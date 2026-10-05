'use strict';

// LETTER-FX SHOWCASE: one project that walks the letter-level decorations —
// the two-tone fill (`fill.splitTone`), the per-letter strike-through
// (`style.strike`) and the per-letter clone shift (`clones[].perLetter`) — so
// they can be reviewed on their own from Help → Letter effects showcase.
//
//   node scripts/letter-fx-showcase.js build [--sections split,strike] [--out <file>] [--md off]
//     writes renderer/data/letter-fx-showcase.json and demo/letter-fx-showcase.md
//   node scripts/letter-fx-showcase.js list [--section strike]
//
// One cue is four seconds, one marker opens every section.
//
// The output is generated, never hand edited: re-run this after the params in
// `renderer/js/lyrics/effects/fill.js` (splitTone), `letter-strike.js`,
// `letter-vary.js` or `renderer/js/lyrics/engine.js` (drawLetterClone) change.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const requirePart = (relative) => require(path.join(ROOT, relative));

const project = requirePart('renderer/js/studio/project.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');

const CUE_SECONDS = 4;
// a fixed stamp keeps the generated file byte-identical on every run, so the
// build only writes when the walk itself changed
const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const OUT_PATH = path.join(ROOT, 'renderer', 'data', 'letter-fx-showcase.json');
const MD_PATH = path.join(ROOT, 'demo', 'letter-fx-showcase.md');

const SAMPLE = 'あいうえお Aiueo 123';
const LABEL_COLOR = '#e9edf8';
const LABEL_COLOR2 = '#8fd0ff';

const SECTIONS = [
  { id: 'split', label: '上下2色 (split)', note: '1文字の上半分と下半分で色を変える塗り（`fill.splitTone`）です。glyph基準とem基準、ぼかし・傾き・帯・交互を並べています。' },
  { id: 'strike', label: '取り消し線 (strike)', note: '文字ごとに独立した取り消し線（`style.strike`）です。線は文字の回転・移動・拡大に追従します。種類・ばらつき・色分け・描き込み・背面を並べています。' },
  { id: 'shift', label: 'ずらし重ね (shift)', note: '重ね（クローン）を一文字ずつずらします（`clones[].perLetter`）。位置・色・透明度・傾き・書体を並べています。' },
  { id: 'combo', label: '組み合わせ (combo)', note: '3つの効果をすべて組み合わせた例です。' },
];

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
  return `lf_${String(index + 1).padStart(3, '0')}`;
}

function baseStyle(extra) {
  return {
    color: {
      fill: { kind: 'solid', value: LABEL_COLOR, alpha: 1 },
      fill2: { kind: 'solid', value: LABEL_COLOR2, alpha: 1 },
      stroke: { kind: 'solid', value: LABEL_COLOR, alpha: 1 },
    },
    animation: clone(STATIC_ANIMATION),
    enter: clone(STATIC_ENTER),
    exit: clone(STATIC_EXIT),
    ...(extra ? clone(extra) : {}),
  };
}

function splitFill(params) {
  return { type: 'splitTone', enabled: true, params: { ...(params || {}) } };
}

function strikeOf(type, params) {
  return { type, enabled: true, params: { ...(params || {}) } };
}

function shiftClone(perLetter) {
  return {
    dx: 0, dy: 0, scale: 1, rotate: 0, opacity: 0.85, hue: 0, delay: 0,
    motion: { type: 'none', amount: 0, speed: 0.5 },
    enabled: true,
    perLetter: { enabled: true, ...(perLetter || {}) },
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
    slots.push({ index: index + 1, section, value, detail, seconds: CUE_SECONDS, cueId: cueId(index), style: clone(style) });
  };
  // splitTone: the fill varies, the text stays still
  push('split', 'glyph', '基準=glyph', baseStyle({ fill: splitFill({ basis: 'glyph', split: 0.5 }) }));
  push('split', 'em', '基準=em', baseStyle({ fill: splitFill({ basis: 'em', split: 0.5 }) }));
  push('split', 'soft', 'softness 0.12', baseStyle({ fill: splitFill({ basis: 'glyph', split: 0.5, softness: 0.12 }) }));
  push('split', 'angle', 'angle 20°', baseStyle({ fill: splitFill({ basis: 'glyph', split: 0.5, angle: 20 }) }));
  push('split', 'band', 'band 0.06', baseStyle({ fill: splitFill({ basis: 'glyph', split: 0.5, band: 0.06 }) }));
  push('split', 'alternate', 'alternate on', baseStyle({ fill: splitFill({ basis: 'glyph', split: 0.5, alternate: true }) }));
  // strike: the strike varies, the fill stays solid
  push('strike', 'line', 'line', baseStyle({ strike: strikeOf('line', {}) }));
  push('strike', 'double', 'double', baseStyle({ strike: strikeOf('double', {}) }));
  push('strike', 'wave', 'wave', baseStyle({ strike: strikeOf('wave', {}) }));
  push('strike', 'slash', 'slash', baseStyle({ strike: strikeOf('slash', {}) }));
  push('strike', 'jitter', 'angleJitter 20° + random', baseStyle({ strike: strikeOf('line', { vary: 'random', angleJitter: 20, seed: 7 }) }));
  push('strike', 'colors', 'colors alternate', baseStyle({ strike: strikeOf('line', { vary: 'alternate', colors: ['#ff4d6d', '#4dd2ff'] }) }));
  push('strike', 'stagger', 'drawIn stagger', baseStyle({ strike: strikeOf('line', { drawIn: 'stagger', drawTime: 0.5, stagger: 0.08 }) }));
  push('strike', 'under', 'layer under', baseStyle({ strike: strikeOf('line', { layer: 'under' }) }));
  // shift: one clone with a perLetter shift
  push('shift', 'dx', 'dx alternate', baseStyle({ clones: [shiftClone({ vary: 'alternate', dx: [-0.02, 0.02] })] }));
  push('shift', 'dy', 'dy wave', baseStyle({ clones: [shiftClone({ vary: 'wave', dy: [0, 0.05], waveFreq: 1 })] }));
  push('shift', 'color', 'colors cycle', baseStyle({ clones: [shiftClone({ vary: 'alternate', colors: ['#ff4d6d', '#4dd2ff', '#ffe600'] })] }));
  push('shift', 'opacity', 'opacity ramp', baseStyle({ clones: [shiftClone({ vary: 'ramp', opacity: [0.2, 1] })] }));
  push('shift', 'skew', 'skew random', baseStyle({ clones: [shiftClone({ vary: 'random', skew: [-15, 15], seed: 3 })] }));
  push('shift', 'font', 'fonts cycle', baseStyle({ clones: [shiftClone({ vary: 'alternate', fonts: ['NotoSerifJP-Regular', 'NotoSansJP-Bold'] })] }));
  // combo: everything at once
  push('combo', 'combo', 'split + strike + shift', baseStyle({
    fill: splitFill({ basis: 'glyph', split: 0.5, band: 0.04 }),
    strike: strikeOf('wave', {}),
    clones: [shiftClone({ vary: 'alternate', dy: [0.01, 0.04], opacity: [0.4, 0.9] })],
  }));
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
      meta: { kind: 'letter-fx-showcase', index: slot.index, section: slot.section, value: slot.value, detail: slot.detail },
    });
    entries.push({ index: slot.index, section: slot.section, sectionLabel: sectionById.get(slot.section).label, cueId: id, start, end, value: slot.value, detail: slot.detail, style: clone(slot.style) });
    t = end;
  });
  const total = round(t);

  const doc = project.create({});
  doc.meta.title = 'TelopMotion 文字装飾見本';
  doc.meta.lang = 'ja';
  doc.meta.createdAt = FIXED_TIME;
  doc.meta.updatedAt = FIXED_TIME;
  doc.script.cues = cues;
  doc.script.sourceName = 'letter-fx-showcase.json';
  doc.markers = markers;
  doc.style.text.fontId = 'NotoSansJP-Regular';
  doc.style.text.size = 64;
  doc.style.text.align = 'center';
  doc.style.color = {
    fill: { kind: 'solid', value: LABEL_COLOR, alpha: 1 },
    fill2: { kind: 'solid', value: LABEL_COLOR2, alpha: 1 },
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
  lines.push('# 文字装飾見本 (letter-fx showcase)');
  lines.push('');
  lines.push('文字単位の装飾3種（上下2色 `fill.splitTone`・一文字取り消し線 `style.strike`・一文字ずらし重ね `clones[].perLetter`）を 1 キューずつ並べた見本プロジェクトです。');
  lines.push('');
  lines.push(`- 1 キュー＝${CUE_SECONDS} 秒。開くには Studio の *Help → 文字装飾見本*、または *File → Open project…* を使います`);
  lines.push('- split セクションは塗りだけ、strike セクションは取り消し線だけ、shift セクションは重ねだけを変えています');
  lines.push('- combo は3つの効果をすべて組み合わせた例です');
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
  lines.push('| `npm run letter-fx-showcase -- build` | このプロジェクトとこの一覧を再生成 |');
  lines.push('| `node scripts/letter-fx-showcase.js list` | セクションとキューを一覧 |');
  lines.push('| `node scripts/letter-fx-showcase.js list --section strike` | 1 セクションだけ表示 |');
  lines.push('| `npm run letter-fx-showcase -- build --sections split,strike` | セクションを絞って生成 |');
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
  const migratedStyles = Object.values(migrated.project.cueStyles || {});
  if (migratedStyles.length !== built.entries.length) {
    throw new Error(`generated project kept styles for ${migratedStyles.length} of ${built.entries.length} cues`);
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
    'LETTER-FX SHOWCASE: split-tone fills, per-letter strikes and per-letter shifts',
    '',
    '  node scripts/letter-fx-showcase.js build [--sections split,strike] [--out <file>] [--md off]',
    '  node scripts/letter-fx-showcase.js list [--section strike]',
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
    console.log(`letter-fx-showcase: ${result.written.out} (${result.entries.length} cues, ${result.total}s)${result.written.changed ? '' : ' [unchanged]'}`);
    if (result.written.md) console.log(`letter-fx-showcase: ${result.written.md}${result.written.mdChanged ? '' : ' [unchanged]'}`);
    return 0;
  } catch (error) {
    console.error(`letter-fx-showcase: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  CUE_SECONDS,
  SECTIONS,
  OUT_PATH,
  MD_PATH,
  splitFill,
  strikeOf,
  shiftClone,
  cueText,
  plan,
  buildShowcase,
  indexMarkdown,
  listText,
  build,
  serialize,
};
