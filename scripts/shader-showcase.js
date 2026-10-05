'use strict';

// SHADER SHOWCASE: one project that walks the five shader-break families —
// `mosaicBreak`, `fogBreak`, `windBreak`, `windNoBreak` and `cloth` — so they
// can be reviewed on their own from Help → Shader showcase.
//
//   node scripts/shader-showcase.js build [--sections mosaic,fog] [--out <file>] [--md off]
//     writes renderer/data/shader-showcase.json and demo/shader-showcase.md
//   node scripts/shader-showcase.js list [--section wind]
//
// Every family is registered in all three phases (enter / hold / exit), so one
// family expands to three cues in playing order: `enter` (the reveal),
// `hold` (the loop) and `exit` (the release). One cue is four seconds, one
// marker opens every section.
//
// The output is generated, never hand edited: re-run this after the families
// in `renderer/js/lyrics/effects/shader-fx.js` change.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const requirePart = (relative) => require(path.join(ROOT, relative));

const fx = requirePart('renderer/js/lyrics/effects/registry.js');
requirePart('renderer/js/lyrics/effects/shader-fx.js');
const project = requirePart('renderer/js/studio/project.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');

const CUE_SECONDS = 4;
// a fixed stamp keeps the generated file byte-identical on every run, so the
// build only writes when the walk itself changed
const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const OUT_PATH = path.join(ROOT, 'renderer', 'data', 'shader-showcase.json');
const MD_PATH = path.join(ROOT, 'demo', 'shader-showcase.md');

const SAMPLE = 'あいうえお Aiueo 123';
const LABEL_COLOR = '#e9edf8';

// read live from the registry so a new family fails loudly in the test
// instead of silently missing its cues
const FAMILIES = ['mosaicBreak', 'fogBreak', 'windBreak', 'windNoBreak', 'cloth'];
const PHASES = ['enter', 'hold', 'exit'];

const FAMILY_JA = {
  mosaicBreak: 'モザイク分解',
  fogBreak: '霧分解',
  windBreak: '風分解',
  windNoBreak: '風なびき',
  cloth: '布なびき',
};
const PHASE_JA = { enter: '入場', hold: '保持', exit: '退場' };

const SECTIONS = FAMILIES.map((type) => ({
  id: type,
  label: `${FAMILY_JA[type]} (${type})`,
  note: `シェーダ分解 \`${type}\` を入場・保持・退場の3キューで並べています。`,
}));

// demo params per family: the readable middle of each range
const FAMILY_PARAMS = {
  mosaicBreak: { cell: 8, scatter: 0.4 },
  fogBreak: { soft: 12, rise: 0.1 },
  windBreak: { wind: 0.5, grain: 3 },
  windNoBreak: { wind: 0.5, rise: 0.08 },
  cloth: { amount: 0.12, speed: 0.9 },
};

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
  return `sh_${String(index + 1).padStart(3, '0')}`;
}

function baseStyle() {
  return {
    color: { fill: { kind: 'solid', value: LABEL_COLOR, alpha: 1 } },
    animation: clone(STATIC_ANIMATION),
    enter: clone(STATIC_ENTER),
    exit: clone(STATIC_EXIT),
  };
}

// one family in one phase: the other two phases stay plain fades so the cue
// shows exactly the motion under review
function styleFor(type, phase) {
  const style = baseStyle();
  const resolved = fx.withDefaults({ type, params: FAMILY_PARAMS[type] || {} }, phase);
  const params = clone(resolved ? resolved.params : { ...(FAMILY_PARAMS[type] || {}) });
  if (phase === 'enter') {
    style.enter = { type, enabled: true, params, motion: { in: { duration: 1.2, ease: 'cubicOut' } } };
  } else if (phase === 'exit') {
    style.exit = { type, enabled: true, params, motion: { out: { duration: 1.0, ease: 'cubicIn' } } };
  } else {
    style.hold = [{ type, enabled: true, params }];
  }
  return style;
}

function cueText(index, type, phase) {
  const value = `${type}/${phase}`;
  const detail = `${FAMILY_JA[type] || type}・${PHASE_JA[phase] || phase}`;
  return `${index}. ${value} · ${detail}\n${SAMPLE}`;
}

// The walk itself, without any timing: one slot per cue, in playing order.
// Every family expands to enter → hold → exit so the three phases of one
// family play back to back.
function plan() {
  const slots = [];
  for (const type of FAMILIES) {
    const entry = fx.get('enter', type) && fx.get('hold', type) && fx.get('exit', type);
    if (!entry) throw new Error(`shader family ${type} is not registered in all three phases`);
    for (const phase of PHASES) {
      const index = slots.length;
      const value = `${type}/${phase}`;
      slots.push({
        index: index + 1, section: type, phase, type, value,
        detail: `${FAMILY_JA[type] || type}・${PHASE_JA[phase] || phase}`,
        seconds: CUE_SECONDS, cueId: cueId(index), style: styleFor(type, phase),
      });
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
      text: cueText(slot.index, slot.type, slot.phase),
      // language-independent ids, so the Studio needs no re-labelling (same
      // shape as the letter-fx showcase's meta)
      meta: {
        kind: 'shader-showcase', index: slot.index, section: slot.section,
        phase: slot.phase, type: slot.type, value: slot.value, detail: slot.detail,
      },
    });
    entries.push({
      index: slot.index, section: slot.section, sectionLabel: sectionById.get(slot.section).label,
      cueId: id, start, end, phase: slot.phase, type: slot.type,
      value: slot.value, detail: slot.detail, style: clone(slot.style),
    });
    t = end;
  });
  const total = round(t);

  const doc = project.create({});
  doc.meta.title = 'TelopMotion シェーダ分解見本';
  doc.meta.lang = 'ja';
  doc.meta.createdAt = FIXED_TIME;
  doc.meta.updatedAt = FIXED_TIME;
  doc.script.cues = cues;
  doc.script.sourceName = 'shader-showcase.json';
  doc.markers = markers;
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
  lines.push('# シェーダ分解見本 (shader showcase)');
  lines.push('');
  lines.push('シェーダ分解5種（モザイク・霧・風分解・風なびき・布なびき）を入場・保持・退場の3キューずつ並べた見本プロジェクトです。1家族の3相が連続再生されます。');
  lines.push('');
  lines.push(`- 1 キュー＝${CUE_SECONDS} 秒。開くには Studio の *Help → シェーダ見本*、または *File → Open project…* を使います`);
  lines.push('- 入場キューは該当enterのみ1.2秒、退場キューは該当exitのみ1.0秒、保持キューは該当holdのみ。それ以外は短いフェードです');
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
  lines.push('| `npm run shader-showcase -- build` | このプロジェクトとこの一覧を再生成 |');
  lines.push('| `node scripts/shader-showcase.js list` | セクションとキューを一覧 |');
  lines.push('| `node scripts/shader-showcase.js list --section wind` | 1 セクションだけ表示 |');
  lines.push('| `npm run shader-showcase -- build --sections mosaic,fog` | セクションを絞って生成 |');
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
  const known = SECTIONS.map((section) => section.id);
  const alias = { mosaic: 'mosaicBreak', fog: 'fogBreak', wind: 'windBreak', drift: 'windNoBreak', cloth: 'cloth' };
  const ids = value.split(',').map((item) => item.trim()).filter(Boolean).map((item) => alias[item] || item);
  if (!ids.length) return null;
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
    'SHADER SHOWCASE: the five shader-break families in all three phases',
    '',
    '  node scripts/shader-showcase.js build [--sections mosaic,fog] [--out <file>] [--md off]',
    '  node scripts/shader-showcase.js list [--section wind]',
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
    // section filter accepts family ids and short aliases (mosaic/fog/wind/drift/cloth)
    const raw = args.flags.sections || args.flags.section;
    sectionsOption = parseSections(raw);
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
    console.log(`shader-showcase: ${result.written.out} (${result.entries.length} cues, ${result.total}s)${result.written.changed ? '' : ' [unchanged]'}`);
    if (result.written.md) console.log(`shader-showcase: ${result.written.md}${result.written.mdChanged ? '' : ' [unchanged]'}`);
    return 0;
  } catch (error) {
    console.error(`shader-showcase: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  CUE_SECONDS,
  FAMILIES,
  PHASES,
  SECTIONS,
  OUT_PATH,
  MD_PATH,
  styleFor,
  cueText,
  plan,
  buildShowcase,
  indexMarkdown,
  listText,
  build,
  serialize,
};
