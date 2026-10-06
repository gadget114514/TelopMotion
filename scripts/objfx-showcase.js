'use strict';

// OBJFX SHOWCASE: one project that walks the seven motion-reactive holds —
// `timeDelay`, `colorShift`, `motionFlicker`, `motionEcho`, `strokeTrail`,
// `timeDisplacement` and `motionBend` — so they can be reviewed on their own
// from Help → Motion-fx showcase.
//
//   node scripts/objfx-showcase.js build [--sections intro,timeDelay] [--out <file>] [--md off]
//     writes renderer/data/objfx-showcase.json and demo/objfx-showcase.md
//   node scripts/objfx-showcase.js list [--section echo]
//
// The walk opens with a title cue, then one section per type with a cue per
// representative variant. Motion-reactive effects are invisible on a still
// beat, so every cue pairs a moving enter (slide), a drifting hold under the
// reviewed hold, and a fading exit.
//
// Every cue is two pinned beats: a title beat pinned to the upper third and
// a body beat with the section's phrase, so the label never sits on the
// sample. Every section plays against its own solid background plate.
//
// The output is generated, never hand edited: re-run this after the holds in
// `renderer/js/lyrics/effects/objfx.js` change.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const requirePart = (relative) => require(path.join(ROOT, relative));

const fx = requirePart('renderer/js/lyrics/effects/registry.js');
requirePart('renderer/js/lyrics/effects/hold.js');
requirePart('renderer/js/lyrics/effects/objfx.js');
const project = requirePart('renderer/js/studio/project.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');

// a fixed stamp keeps the generated file byte-identical on every run, so the
// build only writes when the walk itself changed
const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const OUT_PATH = path.join(ROOT, 'renderer', 'data', 'objfx-showcase.json');
const MD_PATH = path.join(ROOT, 'demo', 'objfx-showcase.md');

const LABEL_COLOR = '#e9edf8';
const INTRO_PLATE = '#0b0d14';
const INTRO_SECONDS = 6;
const CUE_SECONDS = 6;

// read live from the registry so a new type fails loudly in the test
// instead of silently missing its cues
const TYPES = ['timeDelay', 'colorShift', 'motionFlicker', 'motionEcho', 'strokeTrail', 'timeDisplacement', 'motionBend'];

const TYPE_JA = {
  timeDelay: '時間遅延',
  colorShift: 'カラーシフト',
  motionFlicker: 'フリッカー',
  motionEcho: 'エコー',
  strokeTrail: '塗りと線',
  timeDisplacement: '時間置換',
  motionBend: 'ベンド',
};

const VARIANTS = {
  timeDelay: [
    { id: 'letter', label: '文字ごと', params: { unit: 'letter', select: 'oddEven', lag: 0.15, props: 'pos' } },
    { id: 'word', label: '語ごと', params: { unit: 'word', select: 'all', lag: 0.2, props: 'pos' } },
    { id: 'region', label: '帯', params: { unit: 'region', select: 'all', lag: 0.2, band: 'top', bandSize: 0.5, feather: 0.4 } },
  ],
  colorShift: [
    { id: 'distance', label: '距離・色相', params: { driver: 'distance', palette: 'hueCycle', cycles: 1, mix: 0.85 } },
    { id: 'speed', label: '速度・勾配', params: { driver: 'speed', palette: 'gradient', colorA: '#ff3b6b', colorB: '#3bd1ff', cycles: 1, mix: 0.85 } },
  ],
  motionFlicker: [
    { id: 'random', label: 'ランダム', params: { wave: 'random', rate: 12, depth: 0.7 } },
    { id: 'strobe', label: 'ストロボ', params: { wave: 'strobe', rate: 8, depth: 0.8, duty: 0.5 } },
  ],
  motionEcho: [
    { id: 'trail', label: '残像', params: { count: 3, spacing: 0.06, colorA: '#ff3b6b', colorB: '#3b6bff', opacity: 0.6, decay: 0.35 } },
    { id: 'add', label: '加算', params: { count: 5, spacing: 0.05, colorA: '#ff3b6b', colorB: '#3b6bff', opacity: 0.5, decay: 0.3, blend: 'add' } },
  ],
  strokeTrail: [
    { id: 'line', label: '線の影', params: { count: 4, spacing: 0.05, width: 2, colorA: '#00e5ff', colorB: '#ff00c8', opacity: 0.9 } },
    { id: 'add', label: '加算', params: { count: 4, spacing: 0.05, width: 2, colorA: '#00e5ff', colorB: '#ff00c8', opacity: 0.8, blend: 'add' } },
  ],
  timeDisplacement: [
    { id: 'shear', label: 'せん断', params: { unit: 'letter', map: 'linearX', maxLag: 0.25 } },
    { id: 'velocity', label: '進行方向', params: { unit: 'letter', map: 'alongVelocity', maxLag: 0.25 } },
    { id: 'block', label: '行', params: { unit: 'block', map: 'linearX', maxLag: 0.3 } },
  ],
  motionBend: [
    { id: 'auto', label: '自動', params: { leadSide: 'auto', leadWidth: 0.45, stiffness: 0.14, damping: 0.05, inertia: 2.2, maxStretch: 1.1, rotLag: 0.85 } },
    { id: 'left', label: '左固定', params: { leadSide: 'left', leadWidth: 0.45, stiffness: 0.14, damping: 0.05, inertia: 2.2, maxStretch: 1.1, rotLag: 0.85 } },
  ],
};

const SECTION_LOOK = {
  timeDelay: { phrase: '遅れて追いかける', plate: '#0d1520', fill: '#7cc4ff' },
  colorShift: { phrase: '動けば色が巡る', plate: '#1c0f22', fill: '#e07cff' },
  motionFlicker: { phrase: '動く間だけ瞬く', plate: '#191910', fill: '#ffe47c' },
  motionEcho: { phrase: '過去の位置に影', plate: '#220f14', fill: '#ff7c8a' },
  strokeTrail: { phrase: '線だけがついてくる', plate: '#062024', fill: '#4de8ff' },
  timeDisplacement: { phrase: '軸がずれてねじれる', plate: '#101a10', fill: '#8df07c' },
  motionBend: { phrase: '先頭が引っ張るゴム', plate: '#201408', fill: '#ffb547' },
};

const SECTIONS = [
  { id: 'intro', label: 'モーションFX 7種 (intro)', note: 'タイトルキュー。動きに反応する7種の見本です。' },
  ...TYPES.map((type) => ({
    id: type,
    label: `${TYPE_JA[type]} (${type})`,
    note: `動き反応 \`${type}\` の見本です。本文は「${SECTION_LOOK[type].phrase}」です。`,
  })),
];

const STATIC_ANIMATION = { type: 'simultaneous', enabled: true, params: {}, motion: { stagger: { each: 0.05 } } };
const MOVE_ENTER = { type: 'slide', enabled: true, params: { dir: 'left', distance: 0.35 }, motion: { in: { duration: 1.2, ease: 'cubicOut' } } };
const MOVE_EXIT = { type: 'slide', enabled: true, params: { dir: 'right', distance: 0.3 }, motion: { out: { duration: 0.8, ease: 'cubicIn' } } };
const DRIFT_HOLD = { type: 'drift', enabled: true, params: { vx: 0.35, vy: 0 } };
// deform showcase drives: a constant drift alone has ~zero acceleration, so
// the bend lattice stays flat. Both get a stronger drift plus a vertical bob
// for continuous acceleration; bend additionally gets snappy expo slides.
const BEND_ENTER = { type: 'slide', enabled: true, params: { dir: 'left', distance: 0.5 }, motion: { in: { duration: 0.8, ease: 'expoOut' } } };
const BEND_EXIT = { type: 'slide', enabled: true, params: { dir: 'right', distance: 0.45 }, motion: { out: { duration: 0.6, ease: 'expoIn' } } };
const BEND_DRIFT = { type: 'drift', enabled: true, params: { vx: 0.8, vy: 0 } };
const BEND_BOB = { type: 'floatBob', enabled: true, params: { amp: 0.04, speed: 0.9 } };
const DISP_DRIFT = { type: 'drift', enabled: true, params: { vx: 0.7, vy: 0 } };
const DISP_BOB = { type: 'floatBob', enabled: true, params: { amp: 0.03, speed: 0.8 } };

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function round(value, digits) {
  const factor = Math.pow(10, digits == null ? 3 : digits);
  return Math.round(value * factor) / factor;
}

function cueId(index) {
  return `ox_${String(index + 1).padStart(3, '0')}`;
}

function holdParams(type, variant) {
  const resolved = fx.withDefaults({ type, params: variant.params }, 'hold');
  if (!resolved) throw new Error(`hold.${type} did not resolve`);
  return clone(resolved.params);
}

// the body style of one cue: the reviewed hold over a drifting hold (the
// motion it reacts to), a moving slide enter and exit, and the section colour.
// displacement / bend get the stronger drives above so the deform shows.
function styleFor(type, variant) {
  const look = SECTION_LOOK[type];
  if (type === 'motionBend') {
    return {
      color: { fill: { kind: 'solid', value: look.fill, alpha: 1 } },
      animation: clone(STATIC_ANIMATION),
      enter: clone(BEND_ENTER),
      exit: clone(BEND_EXIT),
      hold: [clone(BEND_DRIFT), clone(BEND_BOB), { type, enabled: true, params: holdParams(type, variant) }],
    };
  }
  if (type === 'timeDisplacement') {
    return {
      color: { fill: { kind: 'solid', value: look.fill, alpha: 1 } },
      animation: clone(STATIC_ANIMATION),
      enter: clone(MOVE_ENTER),
      exit: clone(MOVE_EXIT),
      hold: [clone(DISP_DRIFT), clone(DISP_BOB), { type, enabled: true, params: holdParams(type, variant) }],
    };
  }
  return {
    color: { fill: { kind: 'solid', value: look.fill, alpha: 1 } },
    animation: clone(STATIC_ANIMATION),
    enter: clone(MOVE_ENTER),
    exit: clone(MOVE_EXIT),
    hold: [clone(DRIFT_HOLD), { type, enabled: true, params: holdParams(type, variant) }],
  };
}

function introStyle() {
  return {
    color: { fill: { kind: 'solid', value: LABEL_COLOR, alpha: 1 } },
    animation: clone(STATIC_ANIMATION),
    enter: { type: 'fade', enabled: true, params: {}, motion: { in: { duration: 1.2, ease: 'cubicOut' } } },
    exit: { type: 'fade', enabled: true, params: {}, motion: { out: { duration: 0.8, ease: 'cubicIn' } } },
    hold: [clone(DRIFT_HOLD)],
  };
}

function plan() {
  const slots = [];
  const push = (slot) => {
    const index = slots.length;
    slots.push({ index: index + 1, cueId: cueId(index), ...slot });
  };
  push({
    section: 'intro', phase: 'intro', type: null, variant: null,
    value: 'intro', detail: 'モーションFX 7種',
    title: 'モーションFX 7種', body: 'MOTION FX',
    seconds: INTRO_SECONDS, style: introStyle(), plate: INTRO_PLATE,
  });
  for (const type of TYPES) {
    const entry = fx.get('hold', type);
    if (!entry) throw new Error(`objfx type hold.${type} is not registered`);
    const look = SECTION_LOOK[type];
    for (const variant of VARIANTS[type]) {
      const value = `${type}/${variant.id}`;
      push({
        section: type, phase: variant.id, type, variant: variant.id,
        value, detail: `${TYPE_JA[type]}・${variant.label}`,
        title: `${slots.length + 1}. ${TYPE_JA[type]} ${type} · ${variant.label}`,
        body: look.phrase,
        seconds: CUE_SECONDS, style: styleFor(type, variant), plate: look.plate,
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
      text: `${slot.title}\n${slot.body}`,
      meta: {
        kind: 'objfx-showcase', index: slot.index, section: slot.section,
        phase: slot.phase, type: slot.type, variant: slot.variant, value: slot.value, detail: slot.detail,
      },
    });
    entries.push({
      index: slot.index, section: slot.section, sectionLabel: sectionById.get(slot.section).label,
      cueId: id, start, end, phase: slot.phase, type: slot.type, variant: slot.variant,
      value: slot.value, detail: slot.detail, title: slot.title, body: slot.body,
      style: clone(slot.style), plate: slot.plate,
    });
    t = end;
  });
  const total = round(t);

  const doc = project.create({});
  doc.meta.title = 'TelopMotion モーションFX見本';
  doc.meta.lang = 'ja';
  doc.meta.createdAt = FIXED_TIME;
  doc.meta.updatedAt = FIXED_TIME;
  doc.script.cues = cues;
  doc.script.sourceName = 'objfx-showcase.json';
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
  // the phrase centered
  for (const entry of entries) {
    doc.cueStyles[entry.cueId] = clone(entry.style);
    doc.beats[entry.cueId] = [
      { id: `${entry.cueId}:title`, cueId: entry.cueId, kind: 'single', index: 0, start: entry.start, end: entry.end, text: entry.title, lines: [entry.title], fontScale: 1, pinned: true },
      { id: `${entry.cueId}:body`, cueId: entry.cueId, kind: 'single', index: 1, start: entry.start, end: entry.end, text: entry.body, lines: [entry.body], fontScale: 1, pinned: true },
    ];
    doc.beatStyles[`${entry.cueId}:title`] = {
      location: { type: 'upperThird', params: {} },
      text: { size: 34 },
      color: { fill: { kind: 'solid', value: LABEL_COLOR, alpha: 0.85 } },
      animation: clone(STATIC_ANIMATION),
      enter: { type: 'fade', enabled: true, params: {}, motion: { in: { duration: 0.4, ease: 'cubicOut' } } },
      exit: { type: 'fade', enabled: true, params: {}, motion: { out: { duration: 0.4, ease: 'cubicIn' } } },
      hold: [],
    };
    if (doc.beatWarnings) delete doc.beatWarnings[entry.cueId];
  }
  // one solid plate per drawn section, so every family reads against its own
  // ground
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
      const id = `clip_ox_${entry.section}`;
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
  lines.push('# モーションFX見本 (objfx showcase)');
  lines.push('');
  lines.push('動きに反応する7種（時間遅延・カラーシフト・フリッカー・エコー・塗りと線・時間置換・ベンド）の見本プロジェクトです。タイトルに続き、1種につき2〜3キュー（代表的な値の組み合わせ）で並べています。');
  lines.push('');
  lines.push(`- タイトル ${INTRO_SECONDS} 秒、各キュー ${CUE_SECONDS} 秒。入場スライド＋漂流ホールドの上に審査対象を重ねているので、静止では何も起きません`);
  lines.push('- 各キューは2ビート（上部のタイトル＋中央の本文句）で、ラベルと本文が重なりません');
  lines.push('- 各区間は固有色の背景クリップ付き。本文は区間ごとの句・色です');
  lines.push('- 開くには Studio の *Help → モーションFX見本*、または *File → Open project…* を使います');
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
  lines.push('| `npm run objfx-showcase -- build` | このプロジェクトとこの一覧を再生成 |');
  lines.push('| `node scripts/objfx-showcase.js list` | セクションとキューを一覧 |');
  lines.push('| `node scripts/objfx-showcase.js list --section echo` | 1 セクションだけ表示 |');
  lines.push('| `npm run objfx-showcase -- build --sections intro,timeDelay` | セクションを絞って生成 |');
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
  // every section plays against its own plate: each body must sit
  // inside a bg clip of that section's colour
  const cueById = new Map(built.project.script.cues.map((cue) => [cue.id, cue]));
  for (const entry of built.entries) {
    const cue = cueById.get(entry.cueId);
    const cover = (built.project.clips || []).filter((clip) => clip.trackId === 'bg' && clip.start <= cue.start + 1e-4 && clip.end >= cue.end - 1e-4);
    if (!cover.length) throw new Error(`cue ${entry.cueId} has no background plate`);
    if (entry.section !== 'intro') {
      const style = built.project.cueStyles[entry.cueId];
      const holds = Array.isArray(style.hold) ? style.hold : [];
      if (!holds.some((hold) => hold && hold.type === entry.type)) throw new Error(`cue ${entry.cueId} hold is not ${entry.type}`);
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
  const alias = { intro: 'intro', delay: 'timeDelay', color: 'colorShift', flicker: 'motionFlicker', echo: 'motionEcho', stroke: 'strokeTrail', disp: 'timeDisplacement', bend: 'motionBend' };
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
    'OBJFX SHOWCASE: the seven motion-reactive holds, one section per type',
    '',
    '  node scripts/objfx-showcase.js build [--sections intro,timeDelay] [--out <file>] [--md off]',
    '  node scripts/objfx-showcase.js list [--section echo]',
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
    console.log(`objfx-showcase: ${result.written.out} (${result.entries.length} cues, ${result.total}s)${result.written.changed ? '' : ' [unchanged]'}`);
    if (result.written.md) console.log(`objfx-showcase: ${result.written.md}${result.written.mdChanged ? '' : ' [unchanged]'}`);
    return 0;
  } catch (error) {
    console.error(`objfx-showcase: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  INTRO_SECONDS,
  CUE_SECONDS,
  TYPES,
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
