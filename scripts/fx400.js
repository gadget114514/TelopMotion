'use strict';

// FX 400: a numbered catalog of representative effects and a test project that
// applies them one by one to the cues of test/test_1_to_400.srt.
//
//   node scripts/fx400.js build [--text raw]
//     writes test/fx400.catalog.json, test/fx400.md and test/fx400.telopmotion.json
//   node scripts/fx400.js show 42
//     prints effect 42 (the recipe that reproduces it)
//   node scripts/fx400.js list [--group post] [--type vignette]
//     lists the catalog entries
//   node scripts/fx400.js apply 42 --project some.telopmotion.json [--cue 12|fx_012] [--out patched.json]
//     applies effect 42 to one cue of an existing project (dry run without --out)
//
// The catalog is deterministic. Motion-driven groups (animation, layout, enter,
// exit, hold, location) are measured with the real motion evaluator against the
// plain default look: candidates below the perceptual threshold are dropped, so
// every entry is a visible effect instead of a parameter permutation. Shader
// groups (fill, edge, post, background, bg*) keep type identity and add only
// parameter steps that are strong enough to be told apart.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
const requirePart = (relative) => require(path.join(ROOT, relative));

const fx = require(path.join(FX_DIR, 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg', 'vary', 'repeat']) {
  require(path.join(FX_DIR, `${name}.js`));
}
const rng = requirePart('renderer/js/lyrics/rng.js');
const motion = requirePart('renderer/js/lyrics/motion.js');
const project = requirePart('renderer/js/studio/project.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');
const srt = requirePart('renderer/js/srt.js');
const strings = requirePart('renderer/js/studio/fx-strings.js');

const SEED = 400400;
const TOTAL = 400;
const SAMPLE_TEXT = '今日はとてもいい天気ですね、散歩でもしましょうか';
const FRAME = { width: 1920, height: 1080 };
const TEXT_NORM = 96; // letter-level motions are measured against the glyph size
const SAMPLE_TIMES = [0, 0.1, 0.25, 0.5, 0.8, 1.1, 1.4, 1.7, 1.95];
const THRESHOLD = { plain: 0.15, sameType: 0.25 };
const K_MOTION = 8;
const K_STATIC = 12;

const GROUP_ORDER = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion'];
const GROUP_LABELS = {
  animation: 'アニメーション',
  layout: '配置',
  enter: '登場',
  exit: '退場',
  hold: '保持',
  location: '位置',
  fill: '塗り',
  edge: '縁取り',
  post: '後処理',
  background: '背景',
  bgShape: '文字背景',
  bgFill: '文字背景の塗り',
  bgEdge: '文字背景の縁取り',
  bgMotion: '文字背景の動き',
};
const MOTION_GROUPS = new Set(['animation', 'layout', 'enter', 'exit', 'hold', 'location']);
const STACK_GROUPS = new Set(['hold', 'edge', 'post', 'bgEdge']);
const BG_GROUPS = new Set(['bgFill', 'bgEdge', 'bgMotion']);
const ENGINE_TYPES = new Set(['animation.echo']);
// effects that only mean something together with another group: the audit style
// carries that minimal context, and only the effect's own params vary
const CONTEXTS = {
  'animation.loop': { hold: [{ type: 'floatBob', params: { amp: 0.05, speed: 1 } }] },
  'animation.followThrough': {
    layout: { type: 'row', params: { from: 'offscreenEdges', curve: 0.5, curveDir: 'left' }, motion: { in: { duration: 0.9, ease: 'cubicOut' } } },
  },
};
// the text-background groups need a shape to paint, so every entry of those
// groups carries this neutral companion (reproducing the entry alone is enough)
const BG_COMPANION = {
  type: 'rounded',
  params: { unit: 'cell', width: 1.15, height: 1.15, opacity: 0.9, skipSpaces: true },
  enabled: true,
};
const MOTION_PRESETS = {
  enter: [
    { duration: 0.55, ease: 'cubicOut' },
    { duration: 0.25, ease: 'cubicOut' },
    { duration: 1.2, ease: 'backOut' },
    { duration: 0.7, ease: 'elasticOut' },
  ],
  exit: [
    { duration: 0.4, ease: 'cubicIn' },
    { duration: 0.2, ease: 'cubicIn' },
    { duration: 1.0, ease: 'backIn' },
    { duration: 0.6, ease: 'bounceIn' },
  ],
};
const ACCENT_COLORS = ['#ff8a3d', '#4dc8ff'];
const GRADIENT_STOPS = [
  { pos: 0, color: '#ff8a3d' },
  { pos: 1, color: '#4dc8ff' },
];
const NOTES = {
  'fill.textureFill': '画像未設定でも手続きテクスチャで表示',
  'background.image': '画像未設定でも手続きパターンで表示',
  'background.cover': 'カバー元がない場合は単色',
  'background.card': 'カードテーマ未設定時は既定色',
  'location.badgeAnchored': 'バッジ未設定時は中央＋オフセット',
  'animation.loop': 'hold効果の周期を上書き（コンテキスト付き）',
  'animation.followThrough': 'layout.from との組み合わせ（コンテキスト付き）',
  'animation.echo': 'engine の残像描画（モーション実測の対象外）',
  'animation.simultaneous': '文字ごとの時間差をなくす（既定のstaggerを解除）',
  'animation.spring': '登場と退場のイージングをスプリングに置換',
};

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function typeLabel(group, type) {
  const base = fx.baseOf(group);
  const table = strings.ja && strings.ja.fx ? strings.ja.fx[base] : null;
  return (table && table[type]) || type;
}

function paramScore(param) {
  if (param.kind === 'select') return 3;
  if (param.kind === 'ease') return 2.5;
  if (param.kind === 'number' || param.kind === 'int') return param.random ? 2 : 1.5;
  if (param.kind === 'color' || param.kind === 'gradient' || param.kind === 'colors') return 2;
  if (param.kind === 'bool') return 1;
  return 0;
}

function clampToParam(value, param) {
  const min = param.min == null ? value : param.min;
  const max = param.max == null ? value : param.max;
  return Math.max(min, Math.min(max, value));
}

function quantize(value, param) {
  if (param.kind === 'int') return Math.round(value);
  const step = Number(param.step);
  if (!Number.isFinite(step) || step <= 0) return Math.round(value * 1000) / 1000;
  const snapped = Math.round(value / step) * step;
  return Math.round(snapped * 1000) / 1000;
}

function numberRange(param) {
  if (Array.isArray(param.random) && param.random.length >= 2 && Math.abs(param.random[1] - param.random[0]) > 1e-9) {
    return [Math.min(param.random[0], param.random[1]), Math.max(param.random[0], param.random[1])];
  }
  if (Number.isFinite(param.min) && Number.isFinite(param.max) && param.max - param.min > 1e-9) {
    const at = (ratio) => param.min + (param.max - param.min) * ratio;
    return [at(0.25), at(0.75)];
  }
  return null;
}

// the representative values of one parameter, default first
function candidateValues(param) {
  if (param.key === 'enabled' || param.key === 'in' || param.key === 'out') return [];
  if (param.kind === 'number' || param.kind === 'int') {
    const range = numberRange(param);
    if (!range) return [];
    const values = [param.default];
    for (const value of range) {
      const next = quantize(clampToParam(value, param), param);
      if (!values.some((item) => JSON.stringify(item) === JSON.stringify(next))) values.push(next);
    }
    return values;
  }
  if (param.kind === 'select') {
    const options = param.options || [];
    if (options.length < 2) return [];
    return [...options];
  }
  if (param.kind === 'bool') return [param.default, !param.default];
  if (param.kind === 'ease') {
    return [param.default, 'linear', 'cubicOut', 'backOut', 'elasticOut', 'bounceOut'];
  }
  if (param.kind === 'color') return [param.default, ...ACCENT_COLORS];
  if (param.kind === 'gradient' || param.kind === 'colors') return [param.default, clone(GRADIENT_STOPS)];
  return [];
}

function baseInstance(group, descriptor) {
  const instance = fx.withDefaults({ type: descriptor.type, params: {} }, group);
  instance.motion = clone((descriptor.defaults && descriptor.defaults.motion) || {});
  return instance;
}

// mixed-radix walk over the three most perceptible parameters of the type, so
// candidate k explores a different combination instead of one random roll
function candidateInstance(group, descriptor, k) {
  const instance = baseInstance(group, descriptor);
  const ranked = (descriptor.params || [])
    .map((param) => ({ param, values: candidateValues(param), score: paramScore(param) }))
    .filter((item) => item.values.length > 1 && item.values.some((value) => JSON.stringify(value) !== JSON.stringify(item.param.default)))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const changes = [];
  let divisor = 1;
  for (const item of ranked) {
    const value = item.values[Math.floor(k / divisor) % item.values.length];
    divisor *= item.values.length;
    if (value === undefined) continue;
    if (JSON.stringify(value) === JSON.stringify(item.param.default)) continue;
    if (JSON.stringify((instance.params || {})[item.param.key]) === JSON.stringify(value)) continue;
    instance.params[item.param.key] = clone(value);
    changes.push({ key: item.param.key, from: item.param.default === undefined ? null : clone(item.param.default), to: clone(value) });
  }
  if (MOTION_PRESETS[group]) {
    const key = group === 'enter' ? 'in' : 'out';
    const before = (instance.motion && instance.motion[key]) || null;
    const preset = MOTION_PRESETS[group][k % MOTION_PRESETS[group].length];
    const next = { ...(before || {}), ...preset };
    if (k > 0 && JSON.stringify(before) !== JSON.stringify(next)) {
      changes.push({ key: `motion.${key}`, from: before ? `${before.duration}s/${before.ease}` : '(既定)', to: `${next.duration}s/${next.ease}` });
    }
    instance.motion = { ...(instance.motion || {}), [key]: next };
  }
  return { instance, changes };
}

function styleFor(group, instance) {
  const style = {};
  if (BG_GROUPS.has(group)) style.bgShape = clone(BG_COMPANION);
  style[group] = STACK_GROUPS.has(group) ? [clone(instance)] : clone(instance);
  return style;
}

function styleWithContext(group, type, style) {
  const context = CONTEXTS[`${group}.${type}`];
  return context ? { ...clone(context), ...style } : style;
}

// ---------------------------------------------------------------------------
// Perceptual measurement (motion-driven groups)
// ---------------------------------------------------------------------------

function measureScene(text) {
  const size = 96;
  const letters = [];
  let pen = 0;
  let wordIdx = 0;
  let lineIdx = 0;
  let segment = null;
  const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('ja', { granularity: 'word' }) : null;
  const words = segmenter ? [...segmenter.segment(text)].map((entry) => entry.segment) : [text];
  for (const word of words) {
    if (/^\s+$/.test(word)) {
      pen += size * 0.3;
      continue;
    }
    for (const char of Array.from(word)) {
      const width = size * (char === ' ' ? 0.3 : 1);
      if (pen > 0 && pen + width > FRAME.width * 0.86) {
        pen = 0;
        lineIdx += 1;
      }
      letters.push({
        path: `cue:c1/beat:c1:single0/line:${lineIdx}/word:${wordIdx}/letter:0`,
        cueId: 'c1',
        beatId: 'c1:single0',
        lineIdx,
        wordIdx,
        letterIdx: 0,
        globalIdx: letters.length,
        char,
        local: { x: pen, y: lineIdx * size * 1.2 + size, w: width, h: size, cx: pen + width / 2, cy: lineIdx * size * 1.2 + size * 0.7, penX: pen, penY: lineIdx * size * 1.2 + size },
        bbox: { x1: 0, y1: -size, x2: width, y2: 0 },
        outlineLength: 400 + letters.length * 10,
      });
      pen += width;
    }
    wordIdx += 1;
  }
  return {
    cueId: 'c1',
    beatId: 'c1:single0',
    kind: 'single',
    start: 0,
    end: 2,
    text,
    letters,
    blockBBox: { x1: 0, y1: 0, x2: FRAME.width * 0.7, y2: 96 },
    size,
    direction: 'horizontal',
  };
}

function evalStates(scene, style, times) {
  const beat = { id: 'c1:single0', cueId: 'c1', kind: 'single', start: 0, end: 2, text: scene.text };
  scene.style = style || {};
  return times.map((time) => motion.evaluateBeat(scene, time, { frame: FRAME, seed: 42, beat }).letters);
}

function deformScalar(state) {
  let max = 0;
  for (const item of state.deform || []) {
    if (!item || typeof item !== 'object') continue;
    const amount = Number(item.amount);
    if (!Number.isFinite(amount)) continue;
    const value = item.type === 'twist' ? Math.abs(amount) / 90 : Math.abs(amount);
    if (value > max) max = value;
  }
  return max;
}

function letterDistance(a, b) {
  const dx = (a.x - b.x) / TEXT_NORM;
  const dy = (a.y - b.y) / TEXT_NORM;
  const ds = Math.abs(Math.log(Math.max(1e-6, a.scaleX) / Math.max(1e-6, b.scaleX)));
  const dop = Math.abs(a.opacity - b.opacity);
  const dr = Math.abs(a.rot - b.rot) / 180;
  const dt = Math.hypot((a.tiltX || 0) - (b.tiltX || 0), (a.tiltY || 0) - (b.tiltY || 0)) / 180;
  const dz = Math.abs((a.z || 0) - (b.z || 0)) / TEXT_NORM;
  const db = Math.abs((a.blur || 0) - (b.blur || 0)) / 60;
  const dd = Math.abs(deformScalar(a) - deformScalar(b));
  const dv = Math.abs((a.visibleFrac == null ? 1 : a.visibleFrac) - (b.visibleFrac == null ? 1 : b.visibleFrac));
  return Math.sqrt(dx * dx + dy * dy + ds * ds + 2 * dop * dop + dr * dr + dt * dt + dz * dz + 0.3 * db * db + 3 * dd * dd + 2 * dv * dv);
}

function statesDistance(a, b) {
  let max = 0;
  for (let t = 0; t < a.length; t += 1) {
    let sum = 0;
    for (let i = 0; i < a[t].length; i += 1) sum += letterDistance(a[t][i], b[t][i]);
    const value = Math.sqrt(sum / Math.max(1, a[t].length));
    if (value > max) max = value;
  }
  return max;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

function makeEntry(group, type, ordinal, style, changes, n, meta) {
  const baseGroup = fx.baseOf(group);
  const variantLabel = ordinal === 1 ? '代表1' : `代表${ordinal}`;
  const entry = {
    n,
    id: `${group}.${type}.v${ordinal}`,
    group,
    type,
    variant: ordinal,
    label: `${GROUP_LABELS[group] || group} / ${typeLabel(group, type)}（${variantLabel}）`,
    apply: group === 'background' ? 'clip' : 'style',
    changes,
    verified: meta.verified,
    score: meta.score == null ? null : Math.round(meta.score * 1000) / 1000,
    notes: NOTES[`${group}.${type}`] ? [NOTES[`${group}.${type}`]] : [],
  };
  if (entry.apply === 'clip') {
    entry.clip = { type: style[group] ? style[group].type : type, params: clone((style[group] && style[group].params) || {}) };
  } else {
    entry.style = style;
  }
  return entry;
}

function collectCandidates() {
  const scene = measureScene(SAMPLE_TEXT);
  const plain = evalStates(scene, {}, SAMPLE_TIMES);
  const entries = [];
  const types = [];
  const typeOrder = new Map();
  for (const group of GROUP_ORDER) {
    for (const descriptor of fx.list(group)) {
      typeOrder.set(`${group}.${descriptor.type}`, typeOrder.size);
      types.push({ group, descriptor });
    }
  }
  const excluded = [];

  for (const target of types) {
    const { group, descriptor } = target;
    const key = `${group}.${descriptor.type}`;
    const isMotion = MOTION_GROUPS.has(group);
    const isEngine = ENGINE_TYPES.has(key);
    const kMax = isMotion ? K_MOTION : K_STATIC;
    const candidates = [];
    for (let k = 0; k < kMax; k += 1) {
      const produced = candidateInstance(group, descriptor, k);
      const style = styleWithContext(group, descriptor.type, styleFor(group, produced.instance));
      candidates.push({ k, style, changes: produced.changes });
    }
    const measured = [];
    for (const candidate of candidates) {
      if (isEngine) {
        candidate.vsPlain = null;
        candidate.states = null;
      } else if (isMotion) {
        const states = evalStates(scene, candidate.style, SAMPLE_TIMES);
        candidate.vsPlain = statesDistance(states, plain);
        candidate.states = states;
      } else {
        candidate.vsPlain = null;
        candidate.states = null;
        if (candidate.k > 0 && candidate.changes.length === 0) continue;
      }
      measured.push(candidate);
    }
    measured.sort((a, b) => b.k - a.k);
    const acceptedHere = [];
    for (const candidate of measured) {
      if (isEngine) {
        // engine-drawn (echo): no motion measurement, keep the parameter steps
      } else if (isMotion) {
        if (candidate.vsPlain < THRESHOLD.plain) continue;
        let ok = true;
        for (const other of acceptedHere) {
          if (statesDistance(candidate.states, other.states) < THRESHOLD.sameType) { ok = false; break; }
        }
        if (!ok) continue;
      } else {
        if (candidate.changes.length === 0) continue;
        let ok = true;
        for (const other of acceptedHere) {
          if (!paramsDifferStrongly(group, descriptor, candidate.style[group], other.style[group])) { ok = false; break; }
        }
        if (!ok) continue;
      }
      acceptedHere.push(candidate);
    }
    if (!acceptedHere.length) {
      excluded.push({ group, type: descriptor.type, reason: isMotion ? '通常表示と区別できる変化なし（実測）' : '強いパラメータ差を作れない' });
      continue;
    }
    // stable order: the candidate closest to the defaults first
    acceptedHere.sort((a, b) => a.k - b.k);
    acceptedHere.forEach((candidate, index) => {
      entries.push({
        group,
        type: descriptor.type,
        descriptor,
        variant: index + 1,
        style: candidate.style,
        changes: candidate.changes,
        verified: isEngine ? 'engine' : isMotion ? 'motion' : 'static',
        score: candidate.vsPlain,
      });
    });
  }
  return { entries, excluded, typeOrder };
}

function paramsDifferStrongly(group, descriptor, instanceA, instanceB) {
  const a = (instanceA && instanceA.params) || {};
  const b = (instanceB && instanceB.params) || {};
  for (const param of descriptor.params || []) {
    const va = a[param.key];
    const vb = b[param.key];
    if (JSON.stringify(va) === JSON.stringify(vb)) continue;
    if (param.kind === 'bool' || param.kind === 'select' || param.kind === 'ease' || param.kind === 'color' || param.kind === 'gradient' || param.kind === 'colors') return true;
    if (param.kind === 'number' || param.kind === 'int') {
      const min = Number.isFinite(param.min) ? param.min : Math.min(Number(va) || 0, Number(vb) || 0);
      const max = Number.isFinite(param.max) ? param.max : Math.max(Number(va) || 0, Number(vb) || 0);
      if (Math.abs((Number(va) || 0) - (Number(vb) || 0)) >= 0.2 * Math.max(1e-6, max - min)) return true;
    }
  }
  return false;
}

function allocateEntries(built) {
  const byType = new Map();
  for (const entry of built.entries) {
    const key = `${entry.group}.${entry.type}`;
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key).push(entry);
  }
  const keys = [...byType.keys()].sort((a, b) => {
    const [ga, ta] = a.split('.');
    const [gb, tb] = b.split('.');
    const groupDelta = GROUP_ORDER.indexOf(ga) - GROUP_ORDER.indexOf(gb);
    if (groupDelta !== 0) return groupDelta;
    return (built.typeOrder.get(a) || 0) - (built.typeOrder.get(b) || 0) || ta.localeCompare(tb);
  });
  const selected = [];
  for (let round = 0; selected.length < TOTAL; round += 1) {
    let added = 0;
    for (const key of keys) {
      if (selected.length >= TOTAL) break;
      const list = byType.get(key);
      if (round >= list.length) continue;
      selected.push(list[round]);
      added += 1;
    }
    if (!added) break;
  }
  if (selected.length < TOTAL) {
    // shader pools can always be extended by more parameter combinations
    for (const key of keys) {
      if (selected.length >= TOTAL) break;
      const list = byType.get(key);
      for (const entry of list) {
        if (selected.length >= TOTAL) break;
        if (selected.includes(entry)) continue;
        selected.push(entry);
      }
    }
  }
  selected.sort((a, b) => {
    const groupDelta = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
    if (groupDelta !== 0) return groupDelta;
    // interleave types: round 1 of every type comes first, so consecutive
    // numbers are different effects instead of variants of one effect
    if (a.variant !== b.variant) return a.variant - b.variant;
    return (built.typeOrder.get(`${a.group}.${a.type}`) || 0) - (built.typeOrder.get(`${b.group}.${b.type}`) || 0);
  });
  return selected;
}

function finalizeCatalog(built) {
  const selected = allocateEntries(built);
  const entries = selected.map((entry, index) => makeEntry(
    entry.group,
    entry.type,
    entry.variant,
    entry.style,
    entry.changes,
    index + 1,
    { verified: entry.verified, score: entry.score }
  ));
  const groups = GROUP_ORDER.map((group) => ({
    group,
    types: fx.list(group).length,
    entries: entries.filter((entry) => entry.group === group).length,
  }));
  return {
    format: 'telopmotion-fx400',
    version: 2,
    seed: SEED,
    total: entries.length,
    typeCount: built.typeOrder.size,
    sample: SAMPLE_TEXT,
    verification: {
      motion: [...MOTION_GROUPS],
      static: GROUP_ORDER.filter((group) => !MOTION_GROUPS.has(group) && fx.list(group).length),
      threshold: THRESHOLD,
      note: 'motion系は SA.motion の実測で通常表示との差がしきい値以上のみ収録。shader系はタイプ同一性＋強いパラメータ段差で選定。',
    },
    groups,
    excluded: built.excluded,
    effects: entries,
  };
}

function buildCatalog() {
  return finalizeCatalog(collectCandidates());
}

function catalogSignature(catalog) {
  return JSON.stringify(catalog.effects.map((entry) => [entry.group, entry.type, entry.apply, entry.clip || null, entry.style || null]));
}

function applyEntry(doc, entry, cue) {
  if (entry.apply === 'clip') {
    doc.clips = (doc.clips || []).filter((clip) => !(clip.trackId === 'bg' && clip.start < cue.end - 1e-4 && clip.end > cue.start + 1e-4));
    if (entry.clip && entry.clip.type && entry.clip.type !== 'none') {
      doc.clips.push({
        id: project.nextClipId(doc, 'clip_bg'),
        trackId: 'bg',
        start: cue.start,
        end: cue.end,
        spec: clone(entry.clip),
        opacity: 1,
        fadeIn: 0.12,
        fadeOut: 0.12,
        colors: null,
      });
    }
    return doc;
  }
  const container = doc.cueStyles[cue.id] || (doc.cueStyles[cue.id] = {});
  for (const group of Object.keys(entry.style)) delete container[group];
  doc.cueStyles[cue.id] = project.mergeDeep(container, clone(entry.style));
  return doc;
}

function readCues(srtPath, count) {
  const text = fs.readFileSync(srtPath, 'utf8');
  const parsed = srt.parse(text);
  return parsed.cues.slice(0, count).map((cue, index) => ({ ...cue, id: `fx_${String(index + 1).padStart(3, '0')}` }));
}

function buildProject(catalog, options) {
  const opts = options || {};
  const srtPath = opts.srtPath || path.join(ROOT, 'test', 'test_1_to_400.srt');
  const cues = readCues(srtPath, catalog.effects.length);
  if (cues.length < catalog.effects.length) {
    throw new Error(`SRT has ${cues.length} cues but the catalog has ${catalog.effects.length} effects`);
  }
  const doc = project.create({});
  doc.meta.title = 'FX 400 代表効果テスト';
  doc.meta.lang = 'ja';
  doc.script.cues = cues.map((cue, index) => ({
    ...cue,
    text: opts.rawText ? cue.text : `${catalog.effects[index].n} ${catalog.sample || SAMPLE_TEXT}`,
  }));
  doc.script.sourceName = path.basename(srtPath);
  textflow.apply(doc);
  for (let i = 0; i < catalog.effects.length; i += 1) applyEntry(doc, catalog.effects[i], doc.script.cues[i]);
  return { project: doc, cues: doc.script.cues, srtPath };
}

function formatChange(change) {
  const from = change.from == null ? '(既定)' : JSON.stringify(change.from);
  return `${change.key}: ${from} → ${JSON.stringify(change.to)}`;
}

function catalogMarkdown(catalog) {
  const lines = [];
  lines.push('# FX 400 代表効果一覧');
  lines.push('');
  lines.push('`test/fx400.telopmotion.json` のキュー n に、この表の n 番の効果を適用しています。');
  lines.push('表示テキストは番号＋長いサンプル文（`' + (catalog.sample || SAMPLE_TEXT) + '`）、時刻は `test/test_1_to_400.srt` のままです。');
  lines.push('モーション系（アニメーション・配置・登場・退場・保持・位置）は `SA.motion` の実測で「通常表示との差」がしきい値以上のみ収録しています。');
  lines.push('');
  lines.push('| コマンド | 内容 |');
  lines.push('|---|---|');
  lines.push('| `npm run fx400 -- build` | カタログとプロジェクトを再生成（既定は長いサンプル文） |');
  lines.push('| `npm run fx400 -- build --text raw` | 表示テキストを SRT のままにする |');
  lines.push('| `npm run fx400 -- show 42` | 42番の効果の定義を表示 |');
  lines.push('| `npm run fx400 -- apply 42 --project <file> --cue 12 --out <file>` | 42番を既存プロジェクトのキュー12へ適用 |');
  lines.push('');
  lines.push(`- 効果数: ${catalog.effects.length} / タイプ数: ${catalog.typeCount} / seed: ${catalog.seed}`);
  lines.push(`- 知覚差のしきい値: 通常表示 ${catalog.verification.threshold.plain} / 同型 ${catalog.verification.threshold.sameType}`);
  lines.push('- スコア = 通常表示との最大差（モーション実測）。「静的」は描画計測なし（タイプ差＋強いパラメータ段差）');
  lines.push('');
  let lastGroup = null;
  for (const entry of catalog.effects) {
    if (entry.group !== lastGroup) {
      lastGroup = entry.group;
      lines.push('');
      lines.push(`## ${GROUP_LABELS[entry.group] || entry.group} (${entry.group})`);
      lines.push('');
      lines.push('| No. | タイプ | 代表 | 検証 | スコア | 変更点 | 備考 |');
      lines.push('|---:|---|---|---|---:|---|---|');
    }
    const changes = entry.changes.length ? entry.changes.map(formatChange).join('<br>') : '—';
    const notes = entry.notes.length ? entry.notes.join('<br>') : '';
    const score = entry.score == null ? '—' : entry.score.toFixed(2);
    lines.push(`| ${entry.n} | ${typeLabel(entry.group, entry.type)} \`${entry.type}\` | ${entry.variant} | ${entry.verified} | ${score} | ${changes} | ${notes} |`);
  }
  if (catalog.excluded && catalog.excluded.length) {
    lines.push('');
    lines.push('## 収録しなかったタイプ');
    lines.push('');
    lines.push('| グループ | タイプ | 理由 |');
    lines.push('|---|---|---|');
    for (const item of catalog.excluded) {
      lines.push(`| ${item.group} | ${item.type} | ${item.reason} |`);
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
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

function build(options) {
  const opts = options || {};
  const catalogPath = opts.catalog || path.join(ROOT, 'test', 'fx400.catalog.json');
  const projectPath = opts.out || path.join(ROOT, 'test', 'fx400.telopmotion.json');
  const mdPath = opts.md || path.join(ROOT, 'test', 'fx400.md');
  const catalog = buildCatalog();
  const built = buildProject(catalog, opts);
  const migrated = project.migrate(JSON.parse(JSON.stringify(built.project)));
  if (!migrated.ok) throw new Error(`generated project did not migrate: ${migrated.error}`);
  if (migrated.project.script.cues.length !== catalog.effects.length) {
    throw new Error(`generated project lost cues: ${migrated.project.script.cues.length}`);
  }
  const catalogJson = `${JSON.stringify(catalog, null, 2)}\n`;
  const projectJson = `${JSON.stringify(built.project, null, 2)}\n`;
  const md = catalogMarkdown(catalog);
  const written = {
    catalog: catalogPath,
    project: projectPath,
    md: mdPath,
    changed: {
      catalog: writeFileIfChanged(catalogPath, catalogJson),
      project: writeFileIfChanged(projectPath, projectJson),
      md: writeFileIfChanged(mdPath, md),
    },
  };
  return { catalog, built, written };
}

function loadCatalog(file) {
  const catalogPath = file || path.join(ROOT, 'test', 'fx400.catalog.json');
  return JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
}

function findEntry(catalog, n) {
  const entry = catalog.effects.find((item) => item.n === n);
  if (!entry) throw new Error(`effect ${n} not found (1-${catalog.effects.length})`);
  return entry;
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

function resolveCue(doc, value) {
  const cues = doc.script.cues || [];
  if (value == null) throw new Error('--cue is required (1-based index or cue id)');
  const asIndex = Number.parseInt(value, 10);
  if (/^\d+$/.test(String(value))) {
    const cue = cues[asIndex - 1];
    if (cue) return cue;
  }
  const cue = cues.find((item) => item.id === value);
  if (!cue) throw new Error(`cue ${value} not found`);
  return cue;
}

function commandApply(args) {
  const n = Number.parseInt(args.positional[1], 10);
  if (!Number.isFinite(n)) throw new Error('usage: fx400 apply <n> --project <file> [--cue 12] [--out file]');
  const projectFile = args.flags.project;
  if (!projectFile || projectFile === true) throw new Error('--project <file> is required');
  const doc = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
  const migrated = project.migrate(doc);
  if (!migrated.ok) throw new Error(`not a valid project: ${migrated.error}`);
  const target = migrated.project;
  const cue = resolveCue(target, args.flags.cue);
  const entry = findEntry(loadCatalog(args.flags.catalog === true ? null : args.flags.catalog), n);
  applyEntry(target, entry, cue);
  const out = args.flags.out;
  console.log(`#${entry.n} ${entry.label} → cue ${cue.id} (${cue.start}s-${cue.end}s)`);
  if (!out || out === true) {
    console.log('dry run (pass --out <file> to write the patched project)');
    return;
  }
  fs.writeFileSync(out, `${JSON.stringify(target, null, 2)}\n`, 'utf8');
  console.log(`written: ${path.resolve(out)}`);
}

function commandShow(args) {
  const n = Number.parseInt(args.positional[1], 10);
  if (!Number.isFinite(n)) throw new Error('usage: fx400 show <n>');
  const entry = findEntry(loadCatalog(args.flags.catalog === true ? null : args.flags.catalog), n);
  console.log(JSON.stringify(entry, null, 2));
}

function commandList(args) {
  const catalog = loadCatalog(args.flags.catalog === true ? null : args.flags.catalog);
  const group = typeof args.flags.group === 'string' ? args.flags.group : null;
  const type = typeof args.flags.type === 'string' ? args.flags.type : null;
  for (const entry of catalog.effects) {
    if (group && entry.group !== group) continue;
    if (type && entry.type !== type) continue;
    const changes = entry.changes.length ? ` — ${entry.changes.map(formatChange).join(', ')}` : '';
    console.log(`${entry.n}\t${entry.group}.${entry.type} [${entry.verified}${entry.score == null ? '' : ' ' + entry.score}]${changes}`);
  }
}

function help() {
  console.log([
    'FX 400: numbered representative effects',
    '',
    '  node scripts/fx400.js build [--text raw]',
    '  node scripts/fx400.js show <n>',
    '  node scripts/fx400.js list [--group <group>] [--type <type>]',
    '  node scripts/fx400.js apply <n> --project <file> [--cue <index|id>] [--out <file>]',
    '',
    'build options: [--text raw] [--srt <file>] [--catalog <file>] [--out <project file>] [--md <file>]',
  ].join('\n'));
}

function main(argv) {
  const args = parseArgs(argv);
  const command = args.positional[0] || 'help';
  try {
    if (command === 'build') {
      const result = build({
        srtPath: args.flags.srt === true ? null : args.flags.srt,
        catalog: args.flags.catalog === true ? null : args.flags.catalog,
        out: args.flags.out === true ? null : args.flags.out,
        md: args.flags.md === true ? null : args.flags.md,
        rawText: args.flags.text === 'raw',
      });
      console.log(`catalog: ${result.written.catalog} (${result.catalog.effects.length} effects, ${result.catalog.typeCount} types)`);
      console.log(`project: ${result.written.project} (${result.built.project.script.cues.length} cues)`);
      console.log(`index:   ${result.written.md}`);
      return 0;
    }
    if (command === 'show') {
      commandShow(args);
      return 0;
    }
    if (command === 'list') {
      commandList(args);
      return 0;
    }
    if (command === 'apply') {
      commandApply(args);
      return 0;
    }
    help();
    return 0;
  } catch (error) {
    console.error(`fx400: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  SEED,
  TOTAL,
  SAMPLE_TEXT,
  GROUP_ORDER,
  MOTION_GROUPS,
  THRESHOLD,
  buildCatalog,
  buildCatalogEntries: buildCatalog,
  catalogSignature,
  buildProject,
  applyEntry,
  build,
  loadCatalog,
  findEntry,
  formatChange,
  catalogMarkdown,
  measureScene,
  evalStates,
  statesDistance,
};
