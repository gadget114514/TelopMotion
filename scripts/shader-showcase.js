'use strict';

// SHADER SHOWCASE: one project that walks the five shader-break families —
// `mosaicBreak`, `fogBreak`, `windBreak`, `windNoBreak` and `cloth` — so they
// can be reviewed on their own from Help → Shader showcase.
//
//   node scripts/shader-showcase.js build [--sections intro,mosaicBreak] [--out <file>] [--md off]
//     writes renderer/data/shader-showcase.json and demo/shader-showcase.md
//   node scripts/shader-showcase.js list [--section wind]
//
// The walk opens with a title cue, then one section per family. Every family
// expands to four cues in playing order: `full` (enter + hold + exit all of
// that family, the whole arc in one cue), `enter`, `hold` and `exit` (the
// phase under review with short fades around it).
//
// Every cue is two pinned beats (camera-showcase.js:161-172): a title beat
// pinned to the upper third and a body beat with the family's phrase, so the
// label never sits on the sample. Every family section plays against its own
// solid background plate.
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

// a fixed stamp keeps the generated file byte-identical on every run, so the
// build only writes when the walk itself changed
const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const OUT_PATH = path.join(ROOT, 'renderer', 'data', 'shader-showcase.json');
const MD_PATH = path.join(ROOT, 'demo', 'shader-showcase.md');

const LABEL_COLOR = '#e9edf8';
const INTRO_PLATE = '#0b0d14';

// read live from the registry so a new family fails loudly in the test
// instead of silently missing its cues
const FAMILIES = ['mosaicBreak', 'fogBreak', 'windBreak', 'windNoBreak', 'cloth'];
const PHASES = ['full', 'enter', 'hold', 'exit'];
const INTRO_SECONDS = 6;
const PHASE_SECONDS = { full: 6, enter: 5, hold: 5, exit: 5 };

const FAMILY_JA = {
  mosaicBreak: 'モザイク分解',
  fogBreak: '霧分解',
  windBreak: '風分解',
  windNoBreak: '風なびき',
  cloth: '布なびき',
};
const PHASE_JA = { full: '通し', enter: '入場', hold: '保持', exit: '退場' };

const FAMILY_LOOK = {
  mosaicBreak: { phrase: 'デジタルの欠片', plate: '#06141c', fill: '#5ce1ff' },
  fogBreak: { phrase: '霧の向こうへ', plate: '#151824', fill: '#d9dcf2' },
  windBreak: { phrase: '風に散る言葉', plate: '#1d140a', fill: '#ffb547' },
  windNoBreak: { phrase: '風に揺れて', plate: '#0a1c14', fill: '#7cf0b0' },
  cloth: { phrase: 'はためく想い', plate: '#200810', fill: '#ff5c7a' },
};

const SECTIONS = [
  { id: 'intro', label: 'シェーダ分解 5種 (intro)', note: 'タイトルキュー。シェーダ分解5家族の見本です。' },
  ...FAMILIES.map((type) => ({
    id: type,
    label: `${FAMILY_JA[type]} (${type})`,
    note: `シェーダ分解 \`${type}\` を通し・入場・保持・退場の4キューで並べています。本文は「${FAMILY_LOOK[type].phrase}」です。`,
  })),
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
  return `sh_${String(index + 1).padStart(3, '0')}`;
}

function familyParams(type, phase) {
  const resolved = fx.withDefaults({ type, params: {} }, phase);
  return clone(resolved ? resolved.params : {});
}

// the body style of one cue: the family's own phrase in its colour, a small
// stagger so the built-in cascade reads, and a readable enter / exit
function styleFor(type, phase) {
  const look = FAMILY_LOOK[type];
  const style = {
    color: { fill: { kind: 'solid', value: look.fill, alpha: 1 } },
    animation: { type: 'simultaneous', enabled: true, params: {}, motion: { stagger: { each: 0.05 } } },
    enter: clone(STATIC_ENTER),
    exit: clone(STATIC_EXIT),
  };
  const phases = phase === 'full' ? ['enter', 'hold', 'exit'] : [phase];
  for (const name of phases) {
    const params = familyParams(type, name);
    if (name === 'enter') {
      style.enter = { type, enabled: true, params, motion: { in: { duration: 1.6, ease: 'cubicOut' } } };
    } else if (name === 'exit') {
      style.exit = { type, enabled: true, params, motion: { out: { duration: 1.4, ease: 'cubicIn' } } };
    } else {
      style.hold = [{ type, enabled: true, params }];
    }
  }
  return style;
}

function introStyle() {
  const style = {
    color: { fill: { kind: 'solid', value: LABEL_COLOR, alpha: 1 } },
    animation: { type: 'simultaneous', enabled: true, params: {}, motion: { stagger: { each: 0.05 } } },
    enter: { type: 'mosaicBreak', enabled: true, params: familyParams('mosaicBreak', 'enter'), motion: { in: { duration: 1.6, ease: 'cubicOut' } } },
    exit: { type: 'windBreak', enabled: true, params: familyParams('windBreak', 'exit'), motion: { out: { duration: 1.4, ease: 'cubicIn' } } },
    hold: [{ type: 'windNoBreak', enabled: true, params: familyParams('windNoBreak', 'hold') }],
  };
  return style;
}

// The walk itself, without any timing: one slot per cue, in playing order.
// The title cue opens, then every family expands to full → enter → hold →
// exit so the whole arc plays first and the phases follow in isolation.
function plan() {
  const slots = [];
  const push = (slot) => {
    const index = slots.length;
    slots.push({ index: index + 1, cueId: cueId(index), ...slot });
  };
  push({
    section: 'intro', phase: 'intro', type: null,
    value: 'intro', detail: 'シェーダ分解 5種',
    title: 'シェーダ分解 5種', body: 'SHADER BREAKS',
    seconds: INTRO_SECONDS, style: introStyle(), plate: INTRO_PLATE,
  });
  for (const type of FAMILIES) {
    for (const phase of ['enter', 'hold', 'exit']) {
      const entry = fx.get(phase, type);
      if (!entry) throw new Error(`shader family ${type} is not registered in ${phase}`);
    }
    const look = FAMILY_LOOK[type];
    for (const phase of PHASES) {
      const value = `${type}/${phase}`;
      push({
        section: type, phase, type,
        value, detail: `${FAMILY_JA[type]}・${PHASE_JA[phase]}`,
        title: `${slots.length + 1}. ${FAMILY_JA[type]} ${type} · ${PHASE_JA[phase]}`,
        body: look.phrase,
        seconds: PHASE_SECONDS[phase], style: styleFor(type, phase), plate: look.plate,
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
  const clips = [];
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
      // title + phrase: the cue text keeps naming the value, as before
      text: `${slot.title}\n${slot.body}`,
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
      value: slot.value, detail: slot.detail, title: slot.title, body: slot.body,
      style: clone(slot.style), plate: slot.plate,
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
  doc.style.text.size = 96;
  doc.style.text.align = 'center';
  doc.style.color = {
    fill: { kind: 'solid', value: LABEL_COLOR, alpha: 1 },
    stroke: { kind: 'solid', value: LABEL_COLOR, alpha: 1 },
  };
  textflow.apply(doc);
  // one cue, two full-span beats: the label pinned to the top of the frame,
  // the phrase centered (same shape as camera-showcase.js:161-172)
  for (const entry of entries) {
    doc.cueStyles[entry.cueId] = clone(entry.style);
    doc.beats[entry.cueId] = [
      { id: `${entry.cueId}:title`, cueId: entry.cueId, kind: 'single', index: 0, start: entry.start, end: entry.end, text: entry.title, lines: [entry.title], fontScale: 1, pinned: true },
      { id: `${entry.cueId}:body`, cueId: entry.cueId, kind: 'single', index: 1, start: entry.start, end: entry.end, text: entry.body, lines: [entry.body], fontScale: 1, pinned: true },
    ];
    // mergeDeep (project.js:138) replaces arrays, so hold:[] takes the shader
    // hold off the title: the label itself never breaks apart
    doc.beatStyles[`${entry.cueId}:title`] = {
      location: { type: 'upperThird', params: {} },
      text: { size: 34 },
      color: { fill: { kind: 'solid', value: LABEL_COLOR, alpha: 0.85 } },
      animation: clone(STATIC_ANIMATION),
      enter: clone(STATIC_ENTER),
      exit: clone(STATIC_EXIT),
      hold: [],
    };
    if (doc.beatWarnings) delete doc.beatWarnings[entry.cueId];
  }
  // one solid plate per drawn section, so every family reads against its own
  // ground (same shape as the camera-showcase plate)
  {
    let plateStart = null;
    let plateId = null;
    let plateSpec = null;
    const flush = (end) => {
      if (plateStart == null) return;
      clips.push({
        id: plateId, trackId: 'bg', start: plateStart, end,
        spec: plateSpec, opacity: 1, fadeIn: 0.4, fadeOut: 0.4, colors: null,
      });
      plateStart = null;
    };
    for (const entry of entries) {
      const id = `clip_sh_${entry.section}`;
      if (plateStart == null || plateId !== id) {
        flush(entry.start);
        plateStart = entry.start;
        plateId = id;
        plateSpec = { type: 'solid', params: { color: entry.plate } };
      }
    }
    flush(total);
    doc.clips = (doc.clips || []).concat(clips);
  }

  return {
    project: doc,
    entries,
    markers,
    clips,
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
  lines.push('シェーダ分解5種（モザイク・霧・風分解・風なびき・布なびき）の見本プロジェクトです。タイトルに続き、1家族につき4キュー（通し・入場・保持・退場）で、通しで全体の流れを、残り3つで各相を単独で見せます。');
  lines.push('');
  lines.push(`- タイトル ${INTRO_SECONDS} 秒、各家族は通し ${PHASE_SECONDS.full} 秒＋入場・保持・退場 各${PHASE_SECONDS.enter} 秒`);
  lines.push('- 各キューは2ビート（上部のタイトル＋中央の本文句）で、ラベルと本文が重なりません。タイトルビートは shader hold を外しています');
  lines.push('- 各家族区間は固有色の背景クリップ付き。本文は家族ごとの句・色です');
  lines.push('- 開くには Studio の *Help → シェーダ見本*、または *File → Open project…* を使います');
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
  lines.push('| `npm run shader-showcase -- build --sections intro,mosaicBreak` | セクションを絞って生成 |');
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
  // every family section plays against its own plate: each body must sit
  // inside a bg clip of that section's colour
  const cueById = new Map(built.project.script.cues.map((cue) => [cue.id, cue]));
  for (const entry of built.entries) {
    const cue = cueById.get(entry.cueId);
    const cover = (built.project.clips || []).filter((clip) => clip.trackId === 'bg' && clip.start <= cue.start + 1e-4 && clip.end >= cue.end - 1e-4);
    if (!cover.length) throw new Error(`cue ${entry.cueId} has no background plate`);
    if (entry.phase === 'full') {
      const style = built.project.cueStyles[entry.cueId];
      if (!style || !style.enter || style.enter.type !== entry.type) throw new Error(`full cue ${entry.cueId} enter is not ${entry.type}`);
      if (!style.exit || style.exit.type !== entry.type) throw new Error(`full cue ${entry.cueId} exit is not ${entry.type}`);
      const hold = Array.isArray(style.hold) ? style.hold[0] : null;
      if (!hold || hold.type !== entry.type) throw new Error(`full cue ${entry.cueId} hold is not ${entry.type}`);
    }
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
  const alias = { intro: 'intro', mosaic: 'mosaicBreak', fog: 'fogBreak', wind: 'windBreak', drift: 'windNoBreak', cloth: 'cloth' };
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
    'SHADER SHOWCASE: the five shader-break families, full arc plus each phase',
    '',
    '  node scripts/shader-showcase.js build [--sections intro,mosaicBreak] [--out <file>] [--md off]',
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
  INTRO_SECONDS,
  PHASE_SECONDS,
  FAMILIES,
  PHASES,
  SECTIONS,
  OUT_PATH,
  MD_PATH,
  styleFor,
  plan,
  buildShowcase,
  indexMarkdown,
  listText,
  build,
  serialize,
};
