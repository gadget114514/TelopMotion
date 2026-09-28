'use strict';

// FX 400: a numbered catalog of representative effects and a test project that
// applies them one by one to the cues of test/test_1_to_400.srt.
//
//   node scripts/fx400.js build
//     writes test/fx400.catalog.json, test/fx400.md and test/fx400.telopmotion.json
//   node scripts/fx400.js show 42
//     prints effect 42 (the recipe that reproduces it)
//   node scripts/fx400.js list [--group post] [--type vignette]
//     lists the catalog entries
//   node scripts/fx400.js apply 42 --project some.telopmotion.json [--cue 12|fx_012] [--out patched.json]
//     applies effect 42 to one cue of an existing project (dry run without --out)
//
// The catalog is deterministic: the same seed and registry always produce the
// same 400 entries, and every entry is stored in full (type, params, motion and
// companions), so a number alone is enough to reproduce the effect.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
const requirePart = (relative) => require(path.join(ROOT, relative));

const fx = require(path.join(FX_DIR, 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg', 'vary']) {
  require(path.join(FX_DIR, `${name}.js`));
}
const rng = requirePart('renderer/js/lyrics/rng.js');
const project = requirePart('renderer/js/studio/project.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');
const srt = requirePart('renderer/js/srt.js');
const strings = requirePart('renderer/js/studio/fx-strings.js');

const SEED = 400400;
const TOTAL = 400;
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
const STACK_GROUPS = new Set(['hold', 'edge', 'post', 'bgEdge']);
const BG_GROUPS = new Set(['bgFill', 'bgEdge', 'bgMotion']);
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
  ],
  exit: [
    { duration: 0.4, ease: 'cubicIn' },
    { duration: 0.2, ease: 'cubicIn' },
    { duration: 1.0, ease: 'backIn' },
  ],
};
const NOTES = {
  'fill.textureFill': '画像未設定でも手続きテクスチャで表示',
  'background.image': '画像未設定でも手続きパターンで表示',
  'background.cover': 'カバー元がない場合は単色',
  'background.card': 'カードテーマ未設定時は既定色',
  'location.badgeAnchored': 'バッジ未設定時は中央',
};

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function typeLabel(group, type) {
  const base = fx.baseOf(group);
  const table = strings.ja && strings.ja.fx ? strings.ja.fx[base] : null;
  return (table && table[type]) || type;
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

// one representative value per variant index: the ends of the author's
// recommended range for numbers, the next option for selects, the flip for bools
function variantValue(param, variant, random) {
  if (param.key === 'enabled' || param.key === 'in' || param.key === 'out') return undefined; // never turn an effect off or shorten its window
  if (param.kind === 'number' || param.kind === 'int') {
    const hasRandom = Array.isArray(param.random) && param.random.length >= 2 && Math.abs(param.random[1] - param.random[0]) > 1e-9;
    if (!hasRandom && !(Number.isFinite(param.min) && Number.isFinite(param.max) && param.max - param.min > 1e-9)) return undefined;
    let value;
    if (hasRandom) {
      const lo = Math.min(param.random[0], param.random[1]);
      const hi = Math.max(param.random[0], param.random[1]);
      const flip = random() < 0.5;
      value = variant === 1 ? (flip ? hi : lo) : (flip ? lo : hi);
    } else {
      // no recommended range: stay away from the extremes (25% / 75% points)
      const at = variant === 1 ? 0.25 : 0.75;
      value = param.min + (param.max - param.min) * at;
    }
    return quantize(clampToParam(value, param), param);
  }
  if (param.kind === 'select') {
    const options = param.options || [];
    if (options.length < 2) return undefined;
    const at = Math.max(0, options.indexOf(param.default));
    const next = options[(at + variant) % options.length];
    return next === param.default ? undefined : next;
  }
  if (param.kind === 'ease') {
    const pool = ['linear', 'cubicOut', 'backOut', 'elasticOut', 'bounceOut'];
    const value = pool[(variant - 1) % pool.length];
    return value === param.default ? undefined : value;
  }
  if (param.kind === 'bool') return !param.default;
  return undefined;
}

function motionFor(group, descriptor, variant) {
  const desc = clone((descriptor.defaults && descriptor.defaults.motion) || {});
  const presets = MOTION_PRESETS[group];
  if (!presets) return desc;
  const key = group === 'enter' ? 'in' : 'out';
  const value = variant > 0 ? clone(presets[Math.min(variant, 2)]) : { ...presets[0], ...(desc[key] || {}) };
  return { ...desc, [key]: value };
}

function baseInstance(group, descriptor, variant) {
  const instance = fx.withDefaults({ type: descriptor.type, params: {} }, group);
  instance.motion = motionFor(group, descriptor, variant || 0);
  return instance;
}

function paramScore(param) {
  if (param.kind === 'select') return 3;
  if (param.kind === 'ease') return 2.5;
  if (param.kind === 'number' || param.kind === 'int') return param.random ? 2 : 1.5;
  if (param.kind === 'bool') return 1;
  return 0;
}

function variantInstance(group, descriptor, variant) {
  const base = baseInstance(group, descriptor, variant);
  const random = rng.rngFor(SEED, 'fx400', group, descriptor.type, `v${variant}`);
  const instance = { ...base, params: clone(base.params || {}) };
  // change only the few most perceptible dimensions so a variant stays a
  // readable step away from the base form instead of a different effect
  const ranked = [];
  for (const param of descriptor.params || []) {
    const next = variantValue(param, variant, random);
    if (next === undefined) continue;
    ranked.push({ param, next, score: paramScore(param) });
  }
  ranked.sort((a, b) => b.score - a.score);
  const changes = [];
  for (const item of ranked.slice(0, 3)) {
    const before = (instance.params || {})[item.param.key];
    if (JSON.stringify(before) === JSON.stringify(item.next)) continue;
    instance.params[item.param.key] = item.next;
    changes.push({ key: item.param.key, from: before === undefined ? null : before, to: item.next });
  }
  return { instance, changes };
}

function styleFor(group, instance) {
  const style = {};
  if (BG_GROUPS.has(group)) style.bgShape = clone(BG_COMPANION);
  style[group] = STACK_GROUPS.has(group) ? [clone(instance)] : clone(instance);
  return style;
}

function makeEntry(group, descriptor, variant, instance, changes, n) {
  const baseGroup = fx.baseOf(group);
  const variantLabel = variant === 0 ? '基本形' : `バリエーション${variant}`;
  const entry = {
    n,
    id: `${group}.${descriptor.type}.v${variant}`,
    group,
    type: descriptor.type,
    variant,
    label: `${GROUP_LABELS[group] || group} / ${typeLabel(group, descriptor.type)}（${variantLabel}）`,
    apply: group === 'background' ? 'clip' : 'style',
    changes,
    notes: NOTES[`${group}.${descriptor.type}`] ? [NOTES[`${group}.${descriptor.type}`]] : [],
  };
  if (entry.apply === 'clip') {
    entry.clip = { type: instance.type, params: clone(instance.params || {}) };
  } else {
    entry.style = styleFor(group, instance);
  }
  return entry;
}

function buildCatalog() {
  const types = [];
  const typeOrder = new Map();
  for (const group of GROUP_ORDER) {
    for (const descriptor of fx.list(group)) {
      typeOrder.set(`${group}.${descriptor.type}`, typeOrder.size);
      types.push({ group, descriptor });
    }
  }
  // every type contributes its base form first; the remaining slots are handed
  // out one variant at a time to the type with the fewest entries, so no group
  // or type runs away with the budget
  const pools = types.map((target) => {
    const variants = [];
    const seen = new Set();
    for (let variant = 0; variant <= 6 && variants.length < 5; variant += 1) {
      const produced = variant === 0
        ? { instance: baseInstance(target.group, target.descriptor, 0), changes: [] }
        : variantInstance(target.group, target.descriptor, variant);
      const signature = JSON.stringify({ params: produced.instance.params, motion: produced.instance.motion });
      if (seen.has(signature)) continue;
      seen.add(signature);
      variants.push({ variant, instance: produced.instance, changes: produced.changes });
    }
    return { target, variants, taken: 0 };
  });
  const selected = [];
  const pushNext = (pool) => {
    const next = pool.variants[pool.taken];
    if (!next) return false;
    pool.taken += 1;
    selected.push({ pool, ...next });
    return true;
  };
  for (const pool of pools) pushNext(pool);
  while (selected.length < TOTAL) {
    let best = null;
    for (const pool of pools) {
      if (pool.taken >= pool.variants.length) continue;
      if (!best || pool.taken < best.taken) best = pool;
    }
    if (!best) break;
    pushNext(best);
  }
  selected.sort((a, b) => {
    const groupDelta = GROUP_ORDER.indexOf(a.pool.target.group) - GROUP_ORDER.indexOf(b.pool.target.group);
    if (groupDelta !== 0) return groupDelta;
    const typeDelta = (typeOrder.get(`${a.pool.target.group}.${a.pool.target.descriptor.type}`) || 0) - (typeOrder.get(`${b.pool.target.group}.${b.pool.target.descriptor.type}`) || 0);
    if (typeDelta !== 0) return typeDelta;
    return a.variant - b.variant;
  });
  const entries = selected.map((item, index) => {
    const ordinal = item.variant === 0 ? 0 : selected.filter((other) => other.pool === item.pool && other.variant !== 0 && other.variant <= item.variant).length;
    return makeEntry(item.pool.target.group, item.pool.target.descriptor, ordinal, item.instance, item.changes, index + 1);
  });
  return {
    format: 'telopmotion-fx400',
    version: 1,
    seed: SEED,
    total: TOTAL,
    typeCount: types.length,
    groups: GROUP_ORDER.map((group) => ({ group, types: fx.list(group).length, entries: entries.filter((entry) => entry.group === group).length })),
    effects: entries,
  };
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
  doc.script.cues = cues;
  doc.script.sourceName = path.basename(srtPath);
  textflow.apply(doc);
  for (let i = 0; i < catalog.effects.length; i += 1) applyEntry(doc, catalog.effects[i], cues[i]);
  return { project: doc, cues, srtPath };
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
  lines.push('効果は `scripts/fx400.js` が効果レジストリから決定的に生成したもので、`test/fx400.catalog.json` に完全なレシピを記録しています。');
  lines.push('');
  lines.push('| コマンド | 内容 |');
  lines.push('|---|---|');
  lines.push('| `node scripts/fx400.js build` | カタログとプロジェクトを再生成 |');
  lines.push('| `node scripts/fx400.js show 42` | 42番の効果の定義を表示 |');
  lines.push('| `node scripts/fx400.js apply 42 --project <file> --cue 12 --out <file>` | 42番を既存プロジェクトのキュー12へ適用 |');
  lines.push('');
  lines.push(`- 効果数: ${catalog.effects.length} / タイプ数: ${catalog.typeCount} / seed: ${catalog.seed}`);
  lines.push('- 背景（background）グループは bg トラックのクリップとして適用（v2 の仕様）');
  lines.push('');
  let lastGroup = null;
  for (const entry of catalog.effects) {
    if (entry.group !== lastGroup) {
      lastGroup = entry.group;
      lines.push('');
      lines.push(`## ${GROUP_LABELS[entry.group] || entry.group} (${entry.group})`);
      lines.push('');
      lines.push('| No. | タイプ | 種類 | 変更点 | 備考 |');
      lines.push('|---:|---|---|---|---|');
    }
    const changes = entry.changes.length ? entry.changes.map(formatChange).join('<br>') : '—';
    const notes = entry.notes.length ? entry.notes.join('<br>') : '';
    lines.push(`| ${entry.n} | ${typeLabel(entry.group, entry.type)} \`${entry.type}\` | ${entry.variant === 0 ? '基本形' : `バリエーション${entry.variant}`} | ${changes} | ${notes} |`);
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
  if (String(asIndex) === String(value) || /^\d+$/.test(String(value))) {
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
    console.log(`${entry.n}\t${entry.group}.${entry.type}${changes}`);
  }
}

function help() {
  console.log([
    'FX 400: numbered representative effects',
    '',
    '  node scripts/fx400.js build',
    '  node scripts/fx400.js show <n>',
    '  node scripts/fx400.js list [--group <group>] [--type <type>]',
    '  node scripts/fx400.js apply <n> --project <file> [--cue <index|id>] [--out <file>]',
    '',
    'build options: [--srt <file>] [--catalog <file>] [--out <project file>] [--md <file>]',
  ].join('\n'));
}

function main(argv) {
  const args = parseArgs(argv);
  const command = args.positional[0] || 'help';
  try {
    if (command === 'build') {
      const result = build({ srtPath: args.flags.srt === true ? null : args.flags.srt, catalog: args.flags.catalog === true ? null : args.flags.catalog, out: args.flags.out === true ? null : args.flags.out, md: args.flags.md === true ? null : args.flags.md });
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
  GROUP_ORDER,
  buildCatalog,
  catalogSignature,
  buildProject,
  applyEntry,
  build,
  loadCatalog,
  findEntry,
  formatChange,
  catalogMarkdown,
};
