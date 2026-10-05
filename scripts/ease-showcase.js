'use strict';

// EASE SHOWCASE: one project that walks every tween curve plus the slots an
// ease can plug into, so both can be eyeballed from Help → Ease showcase.
//
//   node scripts/ease-showcase.js build [--sections basic,quad] [--out <file>] [--md off]
//     writes renderer/data/ease-showcase.json and demo/ease-showcase.md
//   node scripts/ease-showcase.js list [--section parametric]
//
// The walk has two halves. `patterns` is one cue per named curve in
// `lyrics/easing.js` (34 names: linear … hold) plus six parametric recipes
// (`cubic-bezier` / `spring` / `steps`), each on the same slide entrance so
// neighbouring cues differ only in the curve under review. `usecase` is one
// cue per lyric slot that accepts an ease (in / out / stagger / loop /
// layout / sequence / timeWarp / ADSR / keyframes), each with that slot set
// to a characterful curve while everything else stays fixed, so the slot's
// job reads at a glance. One cue is three seconds for patterns and four
// seconds for use cases; the lyric text is the same sample everywhere (the
// stagger cue uses a longer line so the distribution reads), and one marker
// opens every family.
//
// The output is generated, never hand edited: re-run this after
// `renderer/js/lyrics/easing.js` gains or loses a curve. The ease ids are
// language-independent, so no re-labelling is needed (same shape as the font
// showcase).

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const requirePart = (relative) => require(path.join(ROOT, relative));

const easing = requirePart('renderer/js/lyrics/easing.js');
const project = requirePart('renderer/js/studio/project.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');

const EASE_SECONDS = 3;
const USECASE_SECONDS = 4;
// a fixed stamp keeps the generated file byte-identical on every run, so the
// build only writes when the walk itself changed
const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const OUT_PATH = path.join(ROOT, 'renderer', 'data', 'ease-showcase.json');
const MD_PATH = path.join(ROOT, 'demo', 'ease-showcase.md');

const SAMPLE = 'あいうえお Aiueo 0123';
const SAMPLE_LONG = 'スタッガー あいうえお かきくけこ さしすせそ';

// Named-curve families in walk order. `basic` holds the two extremes (steady
// vs wait-until-end), `smooth` the two smoothsteps; every other family is the
// In / Out / InOut triple of one base.
const FAMILY_EASES = {
  basic: ['linear', 'hold'],
  quad: ['quadIn', 'quadOut', 'quadInOut'],
  cubic: ['cubicIn', 'cubicOut', 'cubicInOut'],
  quart: ['quartIn', 'quartOut', 'quartInOut'],
  quint: ['quintIn', 'quintOut', 'quintInOut'],
  sine: ['sineIn', 'sineOut', 'sineInOut'],
  expo: ['expoIn', 'expoOut', 'expoInOut'],
  circ: ['circIn', 'circOut', 'circInOut'],
  back: ['backIn', 'backOut', 'backInOut'],
  elastic: ['elasticIn', 'elasticOut', 'elasticInOut'],
  bounce: ['bounceIn', 'bounceOut', 'bounceInOut'],
  smooth: ['smoothstep', 'smootherstep'],
};

// Numeric recipes for the parametric section: a gentle CSS ease, an overshoot
// bezier, a default and a bouncy spring, and both step directions.
const PARAMETRIC = [
  'cubic-bezier(0.25, 0.1, 0.25, 1)',
  'cubic-bezier(0.68, -0.55, 0.27, 1.55)',
  'spring(170, 26, 1)',
  'spring(100, 10, 1)',
  'steps(4, end)',
  'steps(5, start)',
];

const SECTIONS = [
  { id: 'basic', label: '基本 (basic)', note: '止まらずに進む linear と、終わるまで待つ hold。すべての基準になる2種。' },
  { id: 'quad', label: '二次 (quad)', note: 'ゆるやかな加速・減速。字幕の出入りに無難。' },
  { id: 'cubic', label: '三次 (cubic)', note: '既定の出入り（easeOutCubic / easeInCubic）と同じ仲間。まず試すならここ。' },
  { id: 'quart', label: '四次 (quart)', note: '三次よりキビキビした出入り。' },
  { id: 'quint', label: '五次 (quint)', note: 'さらに強い加速・減速。短い尺でキレを出す。' },
  { id: 'sine', label: 'サイン (sine)', note: '柔らかい出入り。ゆったりした保持の往復にも。' },
  { id: 'expo', label: '指数 (expo)', note: '立ち上がり・吸い込みが鋭い。短い尺の強調に。' },
  { id: 'circ', label: '円 (circ)', note: '円弧の出入り。expo より少し穏やか。' },
  { id: 'back', label: 'バック (back)', note: '行き過ぎて戻る。登場の跳ね返りに。' },
  { id: 'elastic', label: 'エラスティック (elastic)', note: '弾んで収まる。ポップな登場に。' },
  { id: 'bounce', label: 'バウンス (bounce)', note: '跳ねて止まる。落下物の登場・退場に。' },
  { id: 'smooth', label: 'なめらか (smooth)', note: '両端の加減速が滑らか。ループのつなぎ目に。' },
  { id: 'parametric', label: 'パラメトリック (parametric)', note: '数値で形を作る cubic-bezier / spring / steps。CSS の ease、バネ、コマ送り。' },
  { id: 'usecase', label: '使いどころ (use cases)', note: 'ease が効く場所を1キューずつ。同じカーブでも効く場所で役割が違う。' },
];

// The lyric slots one ease can plug into, each demoed by one cue. `slot` is
// the inspector / project path, `ease` the demo curve pinned to it, `sample`
// the cue text body (the stagger cue needs a longer line).
const USECASES = [
  { id: 'in', slot: 'enter.motion.in.ease', ease: 'bounceOut', sample: SAMPLE, note: '登場の進行 pe（0→1）を曲げる。跳ねて入る。' },
  { id: 'out', slot: 'exit.motion.out.ease', ease: 'backIn', sample: SAMPLE, note: '退場の進行 px を曲げる。一旦引いてから消える。' },
  { id: 'stagger', slot: 'animation stagger.ease', ease: 'cubicInOut', sample: SAMPLE_LONG, note: '文字ごとの開始ずれの配分。中央をゆっくりに。' },
  { id: 'loop', slot: 'motion.loop.ease', ease: 'sineInOut', sample: SAMPLE, note: '保持の周回（hold-local time の折り返し）を曲げる。' },
  { id: 'layout', slot: 'layout.motion.in.ease', ease: 'backOut', sample: SAMPLE, note: '配置の合流（開始 formation→目標）を曲げる。行き過ぎて戻る。' },
  { id: 'sequence', slot: 'layout sequence[].ease', ease: 'elasticOut', sample: SAMPLE, note: 'ホールド中の formation 遷移を曲げる。弾んで収まる。' },
  { id: 'timeWarp', slot: 'animation timeWarp.ease', ease: 'sineInOut', sample: SAMPLE, note: '1キューの局所時間を伸縮する。緩急をつける。' },
  { id: 'adsr', slot: 'animation adsr.ease', ease: 'bounceOut', sample: SAMPLE, note: 'ADSR エンベロープの attack / decay / release を曲げる。' },
  { id: 'keyframes', slot: 'keyframes[].ease', ease: 'bounceOut', sample: SAMPLE, note: 'タイムラインの区間補間を開始キーの ease で曲げる。' },
];

// Every slot an ease can plug into, for the markdown index (the walk demos
// the lyric ones; the rest are listed so the map is complete).
const EASE_SLOTS = [
  ['enter.motion.in.ease', '登場の進行 pe', 'インスペクター → モーション → In → イージング'],
  ['exit.motion.out.ease', '退場の進行 px', 'インスペクター → モーション → Out → イージング'],
  ['animation stagger.ease', '文字ごとの開始ずれ', 'インスペクター → モーション → Stagger → イージング（each / order / unit / from と併用）'],
  ['motion.loop.ease', '保持の周回（period + yoyo）', 'インスペクター → モーション → Loop → イージング'],
  ['animation timeWarp.ease', '1キューの局所時間の伸縮', 'animation タイプ timeWarp の ease パラメータ'],
  ['layout.motion.in/out.ease', '配置の合流・分離', 'layout のモーション In / Out → イージング（from: scatter 等と併用）'],
  ['layout sequence[].ease', 'ホールド中の formation 遷移', 'layout パラメータ sequence の各エントリの ease'],
  ['hold ease パラメータ', '保持エフェクトの波形（fontSize / fillScreen の mode pulse 等）', 'hold タイプの ease パラメータ'],
  ['bgMotion ease', '文字背景の追従モーション', 'bgMotion タイプの ease パラメータ'],
  ['animation adsr.ease', 'ADSR の attack / decay / release', 'インスペクター → モーション → ADSR → 各イージング'],
  ['keyframes[].ease', 'タイムラインの区間補間（開始キーの ease）', 'タイムライン → キーフレーム右クリック → イージング…'],
  ['motions[].ease', '追加モーション（PowerPoint 式）', 'インスペクター → アニメーション → 追加モーションのイージング'],
  ['figure inEase / outEase / holdEase / cameraEase', '図形トラックの出入り・保持・カメラ', 'figure クリップのパラメータ（inDur / outDur と併用）'],
  ['filler figures inEase / outEase / holdEase / cameraEase', 'フィラーの図形レイヤー', 'フィラープリセット figures のパラメータ'],
  ['layer motion in/out.ease', '背景・前景レイヤーの出入り', '設定 → レイヤー → Motion in / Motion out → イージング'],
  ['color transition', '前キュー色からの遷移（in.ease で混ぜる）', 'color パラメータ transition（OKLab ブレンド）'],
];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function round(value, digits) {
  const factor = Math.pow(10, digits == null ? 3 : digits);
  return Math.round(value * factor) / factor;
}

function cueId(index) {
  return `ez_${String(index + 1).padStart(3, '0')}`;
}

function patternText(index, ease) {
  return `${index}. ${ease}\n${SAMPLE}`;
}

function usecaseText(index, usecase) {
  return `${index}. ${usecase.slot} = ${usecase.ease}\n${usecase.sample}`;
}

// The shared staged entrance every pattern cue plays on: a 1.4 s slide so the
// curve reads inside a 3 s cue, with a fixed fade exit so neighbouring cues
// differ only in the entrance ease.
function patternStyle(ease) {
  return {
    enter: { type: 'slide', params: { dir: 'up', distance: 0.35 }, motion: { in: { duration: 1.4, ease } } },
    exit: { type: 'fade', params: {}, motion: { out: { duration: 0.4, ease: 'cubicIn' } } },
  };
}

// One use-case cue's style: everything fixed except the slot under review,
// which gets its characterful curve.
function usecaseStyle(usecase) {
  const base = patternStyle('cubicOut');
  switch (usecase.id) {
    case 'in':
      return {
        enter: { type: 'slide', params: { dir: 'up', distance: 0.35 }, motion: { in: { duration: 1.4, ease: 'bounceOut' } } },
        exit: clone(base.exit),
      };
    case 'out':
      return {
        enter: { type: 'slide', params: { dir: 'up', distance: 0.35 }, motion: { in: { duration: 1, ease: 'cubicOut' } } },
        exit: { type: 'slide', params: { dir: 'down', distance: 0.35 }, motion: { out: { duration: 1.2, ease: 'backIn' } } },
      };
    case 'stagger':
      return {
        animation: { type: 'stagger', params: { order: 'ltr', each: 0.09, ease: 'cubicInOut', unit: 'letter', from: 0.5 } },
        enter: { type: 'slide', params: { dir: 'up', distance: 0.35 }, motion: { in: { duration: 1, ease: 'cubicOut' } } },
        exit: clone(base.exit),
      };
    case 'loop':
      return {
        animation: { type: 'loop', params: { period: 1.5, yoyo: true }, motion: { loop: { period: 1.5, yoyo: true, ease: 'sineInOut' } } },
        hold: [{ type: 'floatBob', params: { amp: 0.04, speed: 0.8 }, enabled: true }],
        enter: { type: 'slide', params: { dir: 'up', distance: 0.35 }, motion: { in: { duration: 1, ease: 'cubicOut' } } },
        exit: clone(base.exit),
      };
    case 'layout':
      return {
        layout: { type: 'row', params: { from: 'scatter' }, motion: { in: { duration: 1.2, ease: 'backOut' } } },
        enter: { type: 'slide', params: { dir: 'up', distance: 0.35 }, motion: { in: { duration: 1, ease: 'cubicOut' } } },
        exit: clone(base.exit),
      };
    case 'sequence':
      return {
        layout: { type: 'row', params: { sequence: [{ at: 0.4, type: 'circle', params: {}, duration: 1, ease: 'elasticOut' }] } },
        enter: { type: 'slide', params: { dir: 'up', distance: 0.35 }, motion: { in: { duration: 1, ease: 'cubicOut' } } },
        exit: clone(base.exit),
      };
    case 'timeWarp':
      return {
        animation: { type: 'timeWarp', params: { ease: 'sineInOut' } },
        enter: { type: 'slide', params: { dir: 'up', distance: 0.35 }, motion: { in: { duration: 1.2, ease: 'cubicOut' } } },
        exit: clone(base.exit),
      };
    case 'adsr':
      return {
        animation: {
          type: 'stagger',
          params: { order: 'ltr', each: 0.035, ease: 'linear', unit: 'letter', from: 0.5 },
          motion: {
            adsr: {
              attack: 0.8, decay: 0.3, sustain: 0.6, release: 0.6, peak: 1.2, punch: 0.2,
              attackEase: 'bounceOut', decayEase: 'sineInOut', releaseEase: 'backIn',
            },
          },
        },
        enter: { type: 'slide', params: { dir: 'up', distance: 0.35 }, motion: { in: { duration: 1, ease: 'cubicOut' } } },
        exit: clone(base.exit),
      };
    case 'keyframes':
      return {
        enter: { type: 'slide', params: { dir: 'up', distance: 0.35 }, motion: { in: { duration: 1, ease: 'cubicOut' } } },
        exit: clone(base.exit),
      };
    default:
      return base;
  }
}

// The walk itself, without any timing: one slot per cue, in playing order.
function plan() {
  const slots = [];
  const push = (section, value, detail, seconds, style, extra) => {
    const index = slots.length;
    slots.push({ index: index + 1, section, value, detail, seconds, cueId: cueId(index), style: clone(style), ...(extra || {}) });
  };
  for (const section of SECTIONS) {
    if (section.id === 'parametric') {
      for (const ease of PARAMETRIC) push('parametric', ease, ease, EASE_SECONDS, patternStyle(ease));
    } else if (section.id === 'usecase') {
      for (const usecase of USECASES) {
        push('usecase', usecase.id, `${usecase.slot} = ${usecase.ease}`, USECASE_SECONDS, usecaseStyle(usecase), { usecase: usecase.id, slot: usecase.slot, ease: usecase.ease });
      }
    } else if (FAMILY_EASES[section.id]) {
      for (const ease of FAMILY_EASES[section.id]) push(section.id, ease, ease, EASE_SECONDS, patternStyle(ease));
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
    const isUsecase = slot.section === 'usecase';
    cues.push({
      id,
      start,
      end,
      text: isUsecase
        ? usecaseText(slot.index, USECASES.find((entry) => entry.id === slot.usecase))
        : patternText(slot.index, slot.value),
      // the ids are language-independent, so the Studio needs no re-labelling
      // (same shape as the font showcase's `{ kind, index }`)
      meta: isUsecase
        ? { kind: 'ease-showcase', section: slot.section, value: slot.usecase, slot: slot.slot, ease: slot.ease }
        : { kind: 'ease-showcase', section: slot.section, value: slot.value },
    });
    entries.push({ index: slot.index, section: slot.section, sectionLabel: sectionById.get(slot.section).label, cueId: id, start, end, value: slot.value, detail: slot.detail, style: clone(slot.style), ...(slot.usecase ? { usecase: slot.usecase, slot: slot.slot, ease: slot.ease } : {}) });
    t = end;
  });
  const total = round(t);

  const doc = project.create({});
  doc.meta.title = 'TelopMotion イージング見本';
  doc.meta.lang = 'ja';
  doc.meta.createdAt = FIXED_TIME;
  doc.meta.updatedAt = FIXED_TIME;
  doc.script.cues = cues;
  doc.script.sourceName = 'ease-showcase.json';
  doc.markers = markers;
  textflow.apply(doc);
  for (const entry of entries) {
    doc.cueStyles[entry.cueId] = clone(entry.style);
  }
  // the keyframes cue moves the whole block through the cue span with its own
  // ease, on top of the fixed slide entrance
  for (const entry of entries) {
    if (entry.usecase !== 'keyframes') continue;
    doc.keyframes[`cue:${entry.cueId}`] = {
      'transform.y': [
        { t: 0, value: -60, ease: 'bounceOut' },
        { t: round(USECASE_SECONDS - 1), value: 60, ease: 'linear' },
      ],
    };
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
  lines.push('# イージング見本 (ease showcase)');
  lines.push('');
  lines.push('tween の 34 カーブとパラメトリック形、そして ease が効く場所を 1 キューずつ並べた見本プロジェクトです。どのキューも同じスライド登場で始まり、違うのはカーブか効かせる場所だけです。');
  lines.push('');
  lines.push(`- パターン＝1カーブ1キュー（${EASE_SECONDS} 秒）、使いどころ＝1スロット1キュー（${USECASE_SECONDS} 秒）`);
  lines.push('- 開くには Studio の *Help → イージング見本*、または *File → Open project…* を使います');
  lines.push('- パラメトリック形（`cubic-bezier(...)` / `spring(...)` / `steps(...)`）はインスペクターのドロップダウンには出ません。見本の値をコピーして使います');
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
  lines.push('| `npm run ease-showcase -- build` | このプロジェクトとこの一覧を再生成 |');
  lines.push('| `node scripts/ease-showcase.js list` | セクションとキューを一覧 |');
  lines.push('| `node scripts/ease-showcase.js list --section parametric` | 1 セクションだけ表示 |');
  lines.push('| `npm run ease-showcase -- build --sections basic,quad` | セクションを絞って生成 |');
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
    lines.push('| # | キュー | 時間 | カーブ / スロット |');
    lines.push('|---:|---|---|---|');
    for (const entry of sectionRows) {
      lines.push(`| ${entry.index} | \`${entry.cueId}\` | ${formatRange(entry)} | \`${entry.detail}\` |`);
    }
    lines.push('');
  }
  lines.push('## 使いどころ一覧（ease が効く場所）');
  lines.push('');
  lines.push('見本の後半（usecase セクション）は歌詞トラックの代表 9 スロットを実演します。全スロットの一覧は以下です。');
  lines.push('');
  lines.push('| スロット | 役割 | 触る場所 |');
  lines.push('|---|---|---|');
  for (const [slot, role, where] of EASE_SLOTS) {
    lines.push(`| \`${slot}\` | ${role} | ${where} |`);
  }
  lines.push('');
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
    'EASE SHOWCASE: every tween curve and its slots in one project',
    '',
    '  node scripts/ease-showcase.js build [--sections basic,quad] [--out <file>] [--md off]',
    '  node scripts/ease-showcase.js list [--section parametric]',
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
    console.log(`ease-showcase: ${result.written.out} (${result.entries.length} cues, ${result.total}s)${result.written.changed ? '' : ' [unchanged]'}`);
    if (result.written.md) console.log(`ease-showcase: ${result.written.md}${result.written.mdChanged ? '' : ' [unchanged]'}`);
    return 0;
  } catch (error) {
    console.error(`ease-showcase: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  EASE_SECONDS,
  USECASE_SECONDS,
  SECTIONS,
  FAMILY_EASES,
  PARAMETRIC,
  USECASES,
  EASE_SLOTS,
  OUT_PATH,
  MD_PATH,
  patternStyle,
  usecaseStyle,
  plan,
  buildShowcase,
  indexMarkdown,
  listText,
  build,
  serialize,
};
