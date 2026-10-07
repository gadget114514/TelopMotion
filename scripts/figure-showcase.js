'use strict';

// FIGURE SHOWCASE: one project that walks every figure motif and every figure
// motion axis, so the `figure` track can be reviewed on its own from
// Help → Figure showcase.
//
//   node scripts/figure-showcase.js build [--sections base,field] [--out <file>]
//     writes renderer/data/figure-showcase.json and demo/figure-showcase.md
//   node scripts/figure-showcase.js list [--section camera]
//
// The first half is the motifs themselves: the 64 ids in `figures.MOTIFS`, one
// cue each, split into the families the module grows them from (base / bold /
// proc / scene / geo / field). The second half pins the axes a clip can carry
// onto one reference motif, so the only thing that changes between two
// neighbouring cues is the axis under review: the in / hold / out move, the beat
// sync, the 2D camera and the procedural layer motion (the proc genome is grown
// from a seed, so every motion gets the first seed that draws it).
//
// The output is generated, never hand edited: re-run this after the motif
// registry or the scene3d / figure-geo / gl-fields tables change. One motif is a
// three second cue, one motion axis a four second cue, so the whole walk is
// about seven minutes.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const requirePart = (relative) => require(path.join(ROOT, relative));

const figures = requirePart('renderer/js/lyrics/figures.js');
const project = requirePart('renderer/js/studio/project.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');

const MOTIF_SECONDS = 3;
const AXIS_SECONDS = 4;
// a fixed stamp keeps the generated file byte-identical on every run, so
// `npm run figure-showcase` only writes when the registries actually changed
const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const OUT_PATH = path.join(ROOT, 'renderer', 'data', 'figure-showcase.json');
const MD_PATH = path.join(ROOT, 'demo', 'figure-showcase.md');
// every figure is read against the same ground, so a cue differs only in the
// figure it draws: one deep plate, one label colour, one shared figure palette
const PLATE = '#0d1220';
const LABEL_COLOR = '#e9edf8';
const FIGURE_COLORS = ['#6f8bff', '#4dd6c1', '#ffd166', '#ff6f91', '#c77dff', '#8ce99a'];
// the seed the standalone `proc` cue grows its genome from
const PROC_SEED = 20260804;
// where the procedural seed search starts looking for one seed per motion
const PROC_MOTION_SEED_BASE = 101;
// the seed the motif cues walk, stepped per cue so no two share a draw
const MOTIF_SEED_BASE = 1000;
// the motion axis sections all draw this motif, so two neighbouring cues differ
// only in the axis: `burst` is large, centred, and moves enough for a camera
// push or a whip to be obvious
const REFERENCE_MOTIF = 'burst';

// The names live in `studio.figure.*` in renderer/js/i18n.js, so the labels stay
// in step with the Studio instead of drifting into a second table here. A name
// with no entry falls back to its own id, and `figure-showcase.test.js` fails if
// that ever happens.
const FIGURE_LANG = 'ja';
const LABEL_NAMESPACE = {
  motif: 'motif',
  in: 'in',
  hold: 'hold',
  out: 'out',
  sync: 'sync',
  camera: 'camera',
  // the procedural layer motions are namespaced `proc` in i18n
  procMotion: 'proc',
  lineStyle: 'lineStyle',
  lineCap: 'lineCap',
  stroke: 'stroke',
  density: 'density',
  densityGeo: 'density',
  ease: 'ease',
  style: 'style',
};

const AXIS_TITLES = {
  in: '登場 (in)',
  hold: '保持 (hold)',
  out: '退場 (out)',
  sync: '同期 (sync)',
  camera: '2D カメラ (camera)',
  procMotion: '手続きモーション (proc motion)',
  lineStyle: '線スタイル (lineStyle)',
  lineCap: '線端 (lineCap)',
  stroke: '線幅 (stroke)',
  density: '密度 (density)',
  densityGeo: '密度・幾何 (densityGeo)',
  ease: 'イージング (ease)',
  style: 'cueStyle移植 (style)',
};

// cueStyle 移植 (style) の見本: テキストと同一の enter/exit/hold
// (互換型のみ。文字前提型は除外) で出入り・保持する。値は `enter/hold/exit`。
const STYLE_SETS = [
  { value: 'slide/pulse/floatOut', enter: { type: 'slide', params: { dir: 'up', distance: 0.25 } }, hold: { type: 'pulse', params: { amount: 0.06 } }, exit: { type: 'floatOut', params: { dir: 'up', distance: 0.25 } } },
  { value: 'zoomIn/drift/shrinkDir', enter: { type: 'zoomIn', params: { from: 0.4 } }, hold: { type: 'drift', params: {} }, exit: { type: 'shrinkDir', params: { dir: 'center' } } },
  { value: 'elasticPop/pulse/spiralOut', enter: { type: 'elasticPop', params: {} }, hold: { type: 'pulse', params: { amount: 0.08 } }, exit: { type: 'spiralOut', params: { turns: 1.25, radius: 0.5 } } },
  { value: 'charGrowIn/floatBob/vanish', enter: { type: 'charGrowIn', params: { from: 0, overshoot: 1.25, peak: 0.65, scaleFromX: 1.6, scaleFromY: 1.6 } }, hold: { type: 'floatBob', params: { amp: 0.02, speed: 0.5 } }, exit: { type: 'vanish', params: {} } },
  { value: 'scatterIn/shiver/rotateOut', enter: { type: 'scatterIn', params: { spread: 0.35 } }, hold: { type: 'shiver', params: {} }, exit: { type: 'rotateOut', params: { angle: 90 } } },
];

// the pools a clip can carry, read from the module so a new move is picked up
// without touching this script
const DENSITY_STEPS = { low: 0.15, mid: 0.5, high: 1 };
const AXIS_VALUES = {
  in: figures.INS,
  hold: figures.HOLDS,
  out: figures.OUTS,
  sync: figures.SYNCS,
  camera: figures.CAMERAS_2D,
  procMotion: figures.PROC_LISTS.motions,
  lineStyle: figures.LINE_STYLES.filter((s) => s !== 'mixed').concat('mixed'),
  lineCap: figures.LINE_CAPS,
  stroke: Object.keys(figures.STROKES),
  density: ['low', 'mid', 'high'],
  densityGeo: ['low', 'mid', 'high'],
  ease: ['linear', 'cubicOut', 'backOut', 'elasticOut', 'bounceOut', 'expoInOut'],
  style: STYLE_SETS.map((entry) => entry.value),
};

const AXIS_MOTIF = { densityGeo: 'voronoi', lineCap: 'scratches' };

const AXIS_NOTES = {
  in: `参照 Motif \`${REFERENCE_MOTIF}\` を固定し、\`in\`（登場の動き）だけを変えています。`,
  hold: `参照 Motif \`${REFERENCE_MOTIF}\` を固定し、\`hold\`（保持中の動き）だけを変えています。`,
  out: `参照 Motif \`${REFERENCE_MOTIF}\` を固定し、\`out\`（退場の動き）だけを変えています。`,
  sync: '参照 Motif を固定し、4 拍のグリッドを渡したうえで、同期だけを変えています。beat と text は同じ拍で区切るので、差が出るのは自動演出の可読性側です。',
  camera: '参照 Motif を固定し、クリップ全体にかかる 2D カメラだけを変えています。',
  procMotion: '手続き型の genome は seed から生まるので、1 Motif では全モーションを見られません。モーションごとにその動きを描く最初の seed を探して割り当てています。',
  lineStyle: '線の装飾（ダッシュや模様）だけを変えています。他の軸セクションは `solid` に固定し、Motif セクションは自動抽選のままです。',
  lineCap: '参照 Motif `scratches` を固定し、線端の形だけを変えています。',
  stroke: '線幅の段階だけを変えています。`weightVar` は 0.6 で固定し、線幅のゆらぎも同時に見られます。',
  density: '参照 Motif を固定し、要素の密度だけを変えています（low 0.15 / mid 0.5 / high 1）。',
  densityGeo: '参照 Motif `voronoi` を固定し、幾何図形の密度だけを変えています（low 0.15 / mid 0.5 / high 1）。',
  ease: '登場のイージングだけを変えています（`in: pop, hold: pulse, out: shrink`、1 拍グリッド、in 1.2 秒 / out 0.6 秒）。',
  style: '参照 Motif を固定し、テキストの cueStyle と同一の enter/exit/hold（互換型のみ。文字前提型は除外）で出入り・保持します。値は `enter/hold/exit`。生成時は cue の enter/exit/hold がそのまま焼かれます。',
};

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function round(value, digits) {
  const factor = Math.pow(10, digits == null ? 3 : digits);
  return Math.round(value * factor) / factor;
}

// The Studio's dictionary, loaded the way the renderer loads it (i18n.js hangs
// its table off `window`). Falls back to an empty table when it cannot be read,
// so the ids still come through.
function dictionary(language) {
  const code = language || FIGURE_LANG;
  const globalScope = globalThis;
  globalScope.window = globalScope.window || globalScope;
  globalScope.SA = globalScope.SA || {};
  const file = requirePart('renderer/js/i18n.js');
  if (typeof file === 'function') return file(code);
  if (globalScope.SA.i18n && typeof globalScope.SA.i18n.set === 'function') {
    globalScope.SA.i18n.set(code);
    return (key) => globalScope.SA.i18n.t(key);
  }
  return () => null;
}

// `studio.figure.<namespace>.<value>`, or the value itself when the dictionary
// has no entry for it.
function nameOf(t, namespace, value) {
  const key = `studio.figure.${namespace}.${value}`;
  const label = t(key);
  return typeof label === 'string' && label !== key && label.trim() ? label : value;
}

function motifLabel(t, motif) {
  return nameOf(t, LABEL_NAMESPACE.motif, motif);
}

function axisLabel(t, axis, value) {
  return nameOf(t, LABEL_NAMESPACE[axis], value);
}

// The base family is the fixed list in MOTIFS; the bold six, the procedural
// motif, the pseudo-3D scenes, the geometry figures and the shader fields are
// appended by the module itself, so read them back instead of repeating them.
function motifFamilies() {
  const bold = new Set(figures.BOLD_MOTIFS);
  const grown = new Set([figures.PROC, ...figures.SCENE_MOTIFS, ...figures.GEO_MOTIFS, ...figures.FIELD_MOTIFS]);
  return [
    {
      id: 'base',
      label: '基本図形 (base)',
      note: 'figures.MOTIFS の固定 Motif 一覧。ビートの小さな動きだけで動く基本の群です。',
      list: figures.MOTIFS.filter((name) => !bold.has(name) && !grown.has(name)),
    },
    {
      id: 'bold',
      label: '太線リズム (bold)',
      note: 'figures.BOLD_MOTIFS。figureBoldChance が当たると、文字から離れた場所に太い図形を短く置きます。',
      list: figures.BOLD_MOTIFS,
    },
    {
      id: 'proc',
      label: '手続き型 (proc)',
      note: 'seed から genome（層 x 配置 x 対称 x 要素の種 x 大小と色と動きの規則）を生む Motif。ここでは通常の 1 通りだけを出しています。',
      list: [figures.PROC],
    },
    {
      id: 'scene',
      label: '疑似3D (scene)',
      note: 'scene3d.js のカメラと投影。惑星、N 体、振り子、重力井戸、多面体、アトラクター、結び目、星空。文字と重なる図形は後処理で切られます。',
      list: figures.SCENE_MOTIFS,
    },
    {
      id: 'geo',
      label: '幾何・データ構造 (geo)',
      note: 'figure-geo.js の k-d 木、ボロノイ、ドロネー、L システム、空間充填曲線、円充填、ツリーマップ、葉脈、糸かけ。',
      list: figures.GEO_MOTIFS,
    },
    {
      id: 'field',
      label: '数式フィールド (field)',
      note: 'gl/fields.js の 16 個の shader フィールドと、gl/sim.js の 4 個のシミュレーション（反応拡散・波動方程式・流体・セルオートマトン）。画面全体を塗る図形で、文字の部分だけ feathered な窓が開きます。',
      list: figures.FIELD_MOTIFS,
    },
  ];
}

// The sections in playing order: the six motif families, then the six axes.
function sections() {
  const list = motifFamilies().map((family) => ({
    id: family.id,
    label: family.label,
    kind: 'motif',
    note: family.note,
    motifs: family.list,
    seconds: MOTIF_SECONDS,
  }));
  for (const axis of Object.keys(AXIS_VALUES)) {
    list.push({
      id: axis,
      label: AXIS_TITLES[axis],
      kind: 'axis',
      note: AXIS_NOTES[axis],
      axis,
      values: AXIS_VALUES[axis],
      seconds: AXIS_SECONDS,
    });
  }
  return list;
}

// One seed per procedural motion rule: scan the seeds in order and take the
// first one whose genome carries the motion and whose layer composition has not
// been used yet, so the 17 cues do not become 17 views of the same picture.
function procMotionSeeds() {
  const motions = figures.PROC_LISTS.motions;
  const found = new Map();
  const used = new Set();
  const limit = PROC_MOTION_SEED_BASE + 20000;
  for (let seed = PROC_MOTION_SEED_BASE; found.size < motions.length && seed < limit; seed += 1) {
    const genome = figures.procGenome(seed, 1);
    for (const motion of motions) {
      if (found.has(motion)) continue;
      if (!genome.some((layer) => layer.motion === motion)) continue;
      const signature = genome.map((layer) => `${layer.layout}/${layer.motion}`).join('|');
      if (used.has(signature)) continue;
      found.set(motion, seed);
      used.add(signature);
    }
  }
  const missing = motions.filter((motion) => !found.has(motion));
  if (missing.length) throw new Error(`no procedural seed draws ${missing.join(', ')}`);
  return found;
}

// The beat grid the `sync` section needs: four one-second spans, so the beat and
// text syncs really do switch their sub-beat and the free sync has cuts to cut
// on. The figure clip stores the grid in `params.beats`, so the project's own
// beats do not have to be re-cut.
function beatGrid(span, count) {
  const steps = count || 4;
  const step = (span.end - span.start) / steps;
  const beats = [];
  const cuts = [];
  for (let i = 0; i < steps; i += 1) {
    beats.push({ start: round(span.start + i * step), end: round(span.start + (i + 1) * step) });
    if (i > 0) cuts.push(round(span.start + i * step));
  }
  return { beats, cuts, beatSeconds: step };
}

function figureSpec(options) {
  const opts = options || {};
  const span = opts.span;
  const grid = beatGrid(span, opts.beatCount);
  const generateOptions = {
    span,
    beats: grid.beats,
    cuts: grid.cuts,
    beatSeconds: grid.beatSeconds,
    axes: { weird: 1, energy: 0.6, density: 0.6, speed: 0.5, softness: 0.4, brightness: 0.5, fear: 0.3 },
    // the full draw: a showcase must show what a motif can reach
    rand: 1,
    seed: opts.seed,
    id: opts.id,
    motif: opts.motif,
    density: opts.density != null ? opts.density : 0.6,
    sync: opts.sync || 'free',
  };
  if (opts.procSeed != null) generateOptions.procSeed = opts.procSeed;
  if (opts.in) generateOptions.in = opts.in;
  if (opts.hold) generateOptions.hold = opts.hold;
  if (opts.out) generateOptions.out = opts.out;
  if (opts.camera) generateOptions.camera = opts.camera;
  if (opts.lineStyle) generateOptions.lineStyle = opts.lineStyle;
  if (opts.lineCap) generateOptions.lineCap = opts.lineCap;
  if (opts.stroke) generateOptions.stroke = opts.stroke;
  if (opts.weightVar != null) generateOptions.weightVar = opts.weightVar;
  if (opts.inEase) generateOptions.inEase = opts.inEase;
  if (opts.outEase) generateOptions.outEase = opts.outEase;
  if (opts.holdEase) generateOptions.holdEase = opts.holdEase;
  if (opts.cameraEase) generateOptions.cameraEase = opts.cameraEase;
  if (opts.inDur != null) generateOptions.inDur = opts.inDur;
  if (opts.outDur != null) generateOptions.outDur = opts.outDur;
  const spec = figures.generate(generateOptions);
  // cueStyle 移植 (style): 生成後に fxEnter/fxExit/fxHold を焼く
  if (opts.fx) {
    if (opts.fx.enter) spec.params.fxEnter = { type: opts.fx.enter.type, params: clone(opts.fx.enter.params || {}), motion: { in: { duration: 0.6, delay: 0, ease: 'easeOutCubic' } } };
    if (opts.fx.exit) spec.params.fxExit = { type: opts.fx.exit.type, params: clone(opts.fx.exit.params || {}), motion: { out: { duration: 0.5, delay: 0, ease: 'easeInCubic' } } };
    if (opts.fx.hold) spec.params.fxHold = [{ type: opts.fx.hold.type, params: clone(opts.fx.hold.params || {}), motion: {} }];
  }
  // pin the camera explicitly, so a `none` row is visible in the file too
  if (opts.camera) spec.params.camera = opts.camera;
  // the camera reads `params.seed`; a motif that stores no seed would share one
  // camera curve across every clip of the section
  if (opts.camera && spec.params.seed == null) spec.params.seed = opts.seed;
  return spec;
}

function cueId(index) {
  return `fig_${String(index + 1).padStart(3, '0')}`;
}

function styleSetOf(value) {
  return STYLE_SETS.find((entry) => entry.value === value) || null;
}

// The walk itself, without any timing: one slot per cue, in playing order. The
// numbers are the cue ids and the index rows, so they stay put when the build is
// filtered down to a few sections.
function plan(options) {
  const opts = options || {};
  const t = opts.t || dictionary(opts.lang);
  const procSeeds = procMotionSeeds();
  const slots = [];
  let seed = MOTIF_SEED_BASE;
  for (const section of sections()) {
    const values = section.kind === 'motif' ? section.motifs : section.values;
    for (const value of values) {
      seed += 37;
      const procedural = value === figures.PROC || section.axis === 'procMotion';
      const index = slots.length;
      slots.push({
        index: index + 1,
        section: section.id,
        sectionLabel: section.label,
        kind: section.kind,
        axis: section.axis || null,
        // the i18n namespace this name lives under, so the Studio can re-label
        // the cue in whatever language is on screen
        namespace: section.kind === 'motif' ? LABEL_NAMESPACE.motif : LABEL_NAMESPACE[section.axis],
        label: section.kind === 'motif' ? motifLabel(t, value) : axisLabel(t, section.axis, value),
        value,
        seconds: section.seconds,
        cueId: cueId(index),
        // the generator's own options; the span is filled in once the slot knows
        // where it sits on the timeline
        generate: {
          seed,
          motif: procedural ? figures.PROC : section.kind === 'motif' ? value : AXIS_MOTIF[section.axis] || REFERENCE_MOTIF,
          procSeed: procedural ? (section.axis === 'procMotion' ? procSeeds.get(value) : PROC_SEED) : undefined,
          id: cueId(index),
          in: section.axis === 'in' ? value : section.axis === 'ease' ? 'pop' : undefined,
          hold: section.axis === 'hold' ? value : section.axis === 'ease' ? 'pulse' : undefined,
          out: section.axis === 'out' ? value : section.axis === 'ease' ? 'shrink' : undefined,
          sync: section.axis === 'sync' ? value : undefined,
          camera: section.axis === 'camera' ? value : undefined,
          // the line axes pin their value and neutralise the rest, so two
          // neighbouring cues differ only in the axis under review; the motif
          // walk leaves them unset so the automatic variety shows
          lineStyle: section.axis === 'lineStyle' ? value : section.kind === 'axis' ? 'solid' : undefined,
          lineCap: section.axis === 'lineCap' ? value : section.kind === 'axis' ? 'round' : undefined,
          stroke: section.axis === 'stroke' ? value : section.kind === 'axis' ? 'med' : undefined,
          weightVar: section.axis === 'stroke' ? 0.6 : section.kind === 'axis' ? 0 : undefined,
          density: section.axis === 'density' || section.axis === 'densityGeo' ? DENSITY_STEPS[value] : 0.6,
          inEase: section.axis === 'ease' ? value : undefined,
          inDur: section.axis === 'ease' ? 1.2 : undefined,
          outDur: section.axis === 'ease' ? 0.6 : undefined,
          beatCount: section.axis === 'ease' ? 1 : undefined,
          fx: section.axis === 'style' ? styleSetOf(value) : undefined,
        },
      });
    }
  }
  return slots;
}

// Place the slots on the timeline and grow each figure spec for the span it
// actually sits on: a figure's sub-beats are absolute times (`beatAt` reads them
// against the clock), so a spec generated for a relative span would draw nothing.
function materialize(slots) {
  const entries = [];
  let t = 0;
  for (const slot of slots) {
    const start = round(t);
    const end = round(t + slot.seconds);
    const spec = figureSpec({ ...slot.generate, span: { start, end } });
    entries.push({
      index: slot.index,
      section: slot.section,
      sectionLabel: slot.sectionLabel,
      kind: slot.kind,
      axis: slot.axis,
      namespace: slot.namespace,
      label: slot.label,
      value: slot.value,
      seconds: slot.seconds,
      cueId: slot.cueId,
      start,
      end,
      spec,
    });
    t = end;
  }
  return entries;
}

function buildEntries(options) {
  return materialize(plan(options));
}

function buildShowcase(options) {
  const opts = options || {};
  const wanted = opts.sections && opts.sections.length ? new Set(opts.sections) : null;
  // one dictionary read for the whole walk
  const planOptions = { t: opts.t || dictionary(opts.lang) };
  const slots = plan(planOptions);
  const entries = materialize(wanted ? slots.filter((slot) => wanted.has(slot.section)) : slots);
  if (!entries.length) throw new Error('no section matched; nothing to build');

  const cues = [];
  const markers = [];
  const clips = [];
  let lastSection = null;

  for (const entry of entries) {
    if (entry.section !== lastSection) {
      lastSection = entry.section;
      markers.push({ t: entry.start, label: entry.sectionLabel });
    }
    cues.push({
      id: entry.cueId,
      start: entry.start,
      end: entry.end,
      text: `${entry.index}. ${entry.label} / ${entry.value}`,
      // the Studio re-labels the cue from these when it opens the project, so
      // the walk reads in whatever language is on screen
      meta: { kind: 'figure-showcase', index: entry.index, namespace: entry.namespace, value: entry.value },
    });
    clips.push({
      id: `clip_${entry.cueId}`,
      trackId: 'fig',
      start: entry.start,
      end: entry.end,
      spec: clone(entry.spec),
      opacity: 0.95,
      fadeIn: 0.25,
      fadeOut: 0.25,
      colors: FIGURE_COLORS.slice(),
    });
  }
  const total = entries.length ? entries[entries.length - 1].end : 0;

  const doc = project.create({});
  doc.meta.title = 'TelopMotion 図形モーション見本';
  doc.meta.lang = 'ja';
  doc.meta.createdAt = FIXED_TIME;
  doc.meta.updatedAt = FIXED_TIME;
  doc.script.cues = cues;
  doc.script.sourceName = 'figure-showcase.json';
  doc.markers = markers;
  // the label sits under the figure, so the picture is never cut in half by it
  doc.style.text.fontId = 'NotoSansJP-Regular';
  doc.style.text.size = 52;
  doc.style.text.align = 'center';
  doc.style.color = {
    fill: { kind: 'solid', value: LABEL_COLOR, alpha: 1 },
    stroke: { kind: 'solid', value: LABEL_COLOR, alpha: 1 },
  };
  doc.style.location = { type: 'custom', params: { x: 0.5, y: 0.9 } };
  textflow.apply(doc);
  // one plate under the whole walk, so no figure is judged against the preview
  // backdrop
  clips.unshift({
    id: 'clip_fig_plate',
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
    sections: sections().filter((section) => !wanted || wanted.has(section.id)),
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
  lines.push('# 図形モーション見本 (figure showcase)');
  lines.push('');
  lines.push(`\`figures.MOTIFS\` の ${figures.MOTIFS.length} 個の Motif と、図形クリップが持つモーション軸（登場 / 保持 / 退場 / 同期 / 2D カメラ / 手続きモーション）を 1 キューずつ並べた見本プロジェクトです。`);
  lines.push('');
  lines.push(`- 1 Motif = 1 キュー（${MOTIF_SECONDS} 秒）、モーション軸 = 1 キュー（${AXIS_SECONDS} 秒）`);
  lines.push(`- 図形は図形トラック（\`fig\`）のクリップです。キューは下部のラベルだけを持ちます`);
  lines.push(`- モーション軸のセクションは参照 Motif \`${REFERENCE_MOTIF}\` を使い、隣り合うキューで違うのは見ている軸だけです`);
  // `figures.SIM_MOTIFS` is a Set, not a list
  const stateful = [...(figures.SIM_MOTIFS || [])];
  if (stateful.length) {
    lines.push(`- シミュレーションの Motif（${stateful.map((name) => `\`${name}\``).join(' / ')}）は *Settings → 状態をもつ演出を使う* のゲートに掛かっています。既定ではオフですが、Studio からこの見本を開くとゲートがそのセッションだけオンになります（保存された設定は変わりません）`);
  }
  lines.push('- 開くには Studio の *Help → 図形見本*、または *File → Open project…* を使います');
  lines.push('');
  const rows = new Map();
  for (const entry of built.entries) {
    const row = rows.get(entry.section) || { label: entry.sectionLabel, count: 0, from: entry.start, to: entry.end };
    row.count += 1;
    row.to = entry.end;
    rows.set(entry.section, row);
  }
  lines.push('| # | セクション | キュー数 | 時間 |');
  lines.push('|---:|---|---:|---|');
  let order = 0;
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
  lines.push('| `npm run figure-showcase -- build` | このプロジェクトとこの一覧を再生成 |');
  lines.push('| `node scripts/figure-showcase.js list` | セクションとキューを一覧 |');
  lines.push('| `node scripts/figure-showcase.js list --section camera` | 1 セクションだけ表示 |');
  lines.push('| `npm run figure-showcase -- build --sections base,field` | Motif 家族を絞って生成 |');
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
    lines.push('| # | キュー | 時間 | 名前 | 値 |');
    lines.push('|---:|---|---|---|---|');
    for (const entry of sectionRows) {
      const note = entry.axis === 'procMotion' ? `（seed ${entry.spec.params.seed}）` : '';
      lines.push(`| ${entry.index} | \`${entry.cueId}\` | ${formatRange(entry)} | ${entry.label} | \`${entry.value}\`${note} |`);
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
  const figureClips = migrated.project.clips.filter((clip) => clip.trackId === 'fig');
  if (figureClips.length !== built.entries.length) {
    throw new Error(`generated project has ${figureClips.length} figure clips for ${built.entries.length} cues`);
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
  const known = sections().map((section) => section.id);
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
    lines.push(`${order}. ${section.label} (${section.id}) — ${rows.length} cues`);
    for (const entry of rows) {
      lines.push(`   ${String(entry.index).padStart(3, ' ')}. ${formatRange(entry)}  ${entry.label} / ${entry.value}`);
    }
    lines.push('');
  }
  lines.push(`total ${built.entries.length} cues, ${built.total}s`);
  return lines.join('\n');
}

function help() {
  console.log([
    'FIGURE SHOWCASE: every figure motif and figure motion axis in one project',
    '',
    '  node scripts/figure-showcase.js build [--sections base,field] [--out <file>] [--md off]',
    '  node scripts/figure-showcase.js list [--section camera]',
    '',
    `sections: ${sections().map((section) => section.id).join(', ')}`,
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
    console.log(`figure-showcase: ${result.written.out} (${result.entries.length} cues, ${result.total}s)${result.written.changed ? '' : ' [unchanged]'}`);
    if (result.written.md) console.log(`figure-showcase: ${result.written.md}${result.written.mdChanged ? '' : ' [unchanged]'}`);
    return 0;
  } catch (error) {
    console.error(`figure-showcase: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  AXIS_SECONDS,
  AXIS_TITLES,
  AXIS_VALUES,
  AXIS_MOTIF,
  STYLE_SETS,
  DENSITY_STEPS,
  FIGURE_COLORS,
  FIGURE_LANG,
  LABEL_COLOR,
  LABEL_NAMESPACE,
  MD_PATH,
  MOTIF_SECONDS,
  OUT_PATH,
  PLATE,
  PROC_SEED,
  REFERENCE_MOTIF,
  axisLabel,
  dictionary,
  motifLabel,
  motifFamilies,
  nameOf,
  sections,
  procMotionSeeds,
  figureSpec,
  plan,
  materialize,
  buildEntries,
  buildShowcase,
  indexMarkdown,
  build,
  serialize,
};
