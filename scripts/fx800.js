'use strict';

// FX 800: eight hundred numbered, named text-effect demos, split into four
// Studio projects of 200 cues each (No.1-200, 201-400, 401-600, 601-800).
//
// scripts/fx400mix.js samples every demo as a complete look: one headline
// effect on top of a supporting kit drawn from the whole registry, chosen so
// that every demo stays far from all the others on screen. This script builds
// the same sampling with 800 entries and slices the result into four projects:
// demo n lives on cue n of its part, so the four .telopmotion.json files
// together demo No.1-800.
//
//   node scripts/fx800.js build
//     writes demo/fx800.catalog.json, demo/fx800.md and, per demo,
//     demo/fx800-<part>.srt and demo/fx800-<part>.telopmotion.json
//   node scripts/fx800.js show 42
//     prints demo 42 (number, name, demo part and full recipe)
//   node scripts/fx800.js list [--part 1|2|3|4]
//     lists the demo numbers and names
//   node scripts/fx800.js apply 42 --project <file> --cue 12 [--out <file>]
//     applies demo 42 to one cue of an existing project (dry run without --out)

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const requirePart = (relative) => require(path.join(ROOT, relative));

const mix = require('./fx400mix.js');
const classify = require('./looks-classify.js');
const project = requirePart('renderer/js/studio/project.js');
const srt = requirePart('renderer/js/srt.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');

const TOTAL = 800;
const PART_SIZE = 200;
const PARTS = Math.ceil(TOTAL / PART_SIZE);

function demoOf(n) {
  return Math.floor((n - 1) / PART_SIZE) + 1;
}

function demoRange(part) {
  const from = (part - 1) * PART_SIZE + 1;
  return { part, from, to: Math.min(from + PART_SIZE - 1, TOTAL) };
}

function demoTitle(part) {
  const { from, to } = demoRange(part);
  return `FX 800-${part} テキスト効果デモ（No.${from}–${to}）`;
}

function demoFiles(part, dir) {
  const base = `fx800-${part}`;
  return {
    srt: path.join(dir, `${base}.srt`),
    project: path.join(dir, `${base}.telopmotion.json`),
  };
}

// ---------------------------------------------------------------------------
// catalog

function buildCatalog() {
  const catalog = mix.buildCatalog({ total: TOTAL });
  catalog.format = 'telopmotion-fx800';
  catalog.version = 1;
  catalog.total = TOTAL;
  catalog.partSize = PART_SIZE;
  for (const entry of catalog.effects) {
    entry.demo = demoOf(entry.n);
    entry.name = entry.label;
  }
  catalog.demos = Array.from({ length: PARTS }, (_, index) => {
    const { part, from, to } = demoRange(index + 1);
    const files = demoFiles(part, 'demo');
    return {
      demo: part,
      from,
      to,
      entries: to - from + 1,
      title: demoTitle(part),
      project: `demo/${path.basename(files.project)}`,
      srt: `demo/${path.basename(files.srt)}`,
    };
  });
  return catalog;
}

function nearestPairDistance(catalog) {
  const effects = catalog.effects;
  let nearest = Infinity;
  for (let i = 0; i < effects.length; i += 1) {
    for (let j = i + 1; j < effects.length; j += 1) {
      nearest = Math.min(nearest, mix.distance(effects[i].signature, effects[j].signature));
    }
  }
  return nearest;
}

function loadCatalog(file) {
  const catalogPath = file || path.join(ROOT, 'demo', 'fx800.catalog.json');
  return JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
}

function findEntry(catalog, n) {
  const entry = catalog.effects.find((item) => item.n === n);
  if (!entry) throw new Error(`demo ${n} not found (1-${catalog.effects.length})`);
  return entry;
}

// ---------------------------------------------------------------------------
// project

// one Studio project per demo part: cue n (0-based index i) carries effect i+1
function buildPartProject(part, entries) {
  const partCatalog = { effects: entries };
  const srtText = mix.catalogSrt(partCatalog);
  const parsed = srt.parse(srtText);
  const cues = parsed.cues.map((cue, index) => ({ ...cue, id: `fx800_${part}_${String(index + 1).padStart(3, '0')}` }));
  if (cues.length !== entries.length) throw new Error(`demo ${part}: SRT has ${cues.length} cues but the catalog has ${entries.length} entries`);
  const doc = project.create({});
  doc.meta.title = demoTitle(part);
  doc.meta.lang = 'ja';
  doc.script.cues = cues;
  doc.script.sourceName = `fx800-${part}.srt`;
  doc.style.text.fontId = 'NotoSansJP-Regular';
  textflow.apply(doc);
  for (let i = 0; i < entries.length; i += 1) mix.applyEntry(doc, entries[i], cues[i]);
  return { project: doc, cues, srtText };
}

// ---------------------------------------------------------------------------
// markdown index

function catalogMarkdown(catalog, options) {
  const opts = options || {};
  const motionOf = typeof opts.motionOf === 'function' ? opts.motionOf : null;
  const lines = [];
  lines.push('# FX 800 番号付きテキスト効果デモ一覧');
  lines.push('');
  lines.push('No.1–800 の各番号に効果の名前と完全なレシピを付け、200 番ごとに 4 つの Studio プロジェクトへ分けています。');
  lines.push('各デモは「主役」の効果（タイプ見本・はっきり違う設定違い・プリセット・ジャンル／ムード生成）に、登場・退場・保持・塗り・縁取り・後処理・配置・文字背景・リピート・背景・書体・配色を組み合わせた完成形のルックです。');
  lines.push('組み合わせは全 800 デモが互いに多くの要素で異なるように選ばれ、隣り合うデモはほぼ全要素が入れ替わります。');
  if (motionOf) {
    lines.push('');
    lines.push('「動き」は `SA.motion` の9フレーム標本から測った移動・拡大縮小・回転・変形の最大振幅で、`おまかせ` が5軸（特に energy / speed）と照合する分類です（`renderer/data/fx800.looks.json`）。');
  }
  lines.push('');
  lines.push('| デモ | 番号 | プロジェクト | SRT | 効果数 |');
  lines.push('|---:|---|---|---|---:|');
  for (const demo of catalog.demos) {
    lines.push(`| デモ${demo.demo} | No.${demo.from}–${demo.to} | \`${demo.project}\` | \`${demo.srt}\` | ${demo.entries} |`);
  }
  lines.push('');
  lines.push('開き方: Studio の *File → Open project…* でプロジェクトを開き、タイムラインを再生（またはスクラブ）すると 3 秒ごとにその番号の効果が表示されます。');
  lines.push('');
  lines.push('| コマンド | 内容 |');
  lines.push('|---|---|');
  lines.push('| `node scripts/fx800.js build` | カタログ・この一覧・4 プロジェクト・おまかせ用ルックを再生成 |');
  lines.push('| `node scripts/fx800.js show 42` | 42 番の名前とレシピを表示 |');
  lines.push('| `node scripts/fx800.js list --part 2` | No.201–400 の名前を一覧 |');
  lines.push('| `node scripts/fx800.js apply 42 --project <file> --cue 12 --out <file>` | 42 番を既存プロジェクトのキュー 12 へ適用 |');
  lines.push('');
  lines.push(`- シード: ${catalog.seed} / 全 ${catalog.effects.length} 件`);
  for (const part of catalog.parts) lines.push(`- ${part.label}: ${part.entries} 件`);
  if (motionOf) {
    const counts = new Map();
    for (const entry of catalog.effects) {
      const motion = motionOf(entry);
      const label = motion ? motion.label : '—';
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    lines.push(`- 動きの分類: ${[...counts.entries()].map(([label, count]) => `${label} ${count}件`).join(' / ')}`);
  }
  lines.push('');
  for (const demo of catalog.demos) {
    lines.push(`## デモ ${demo.demo}: No.${demo.from}–${demo.to}`);
    lines.push('');
    lines.push(motionOf ? '| No. | 名前 | 動き | 組み合わせ | 備考 |' : '| No. | 名前 | 組み合わせ | 備考 |');
    lines.push(motionOf ? '|---:|---|---|---|---|' : '|---:|---|---|---|');
    for (const entry of catalog.effects) {
      if (entry.demo !== demo.demo) continue;
      const notes = entry.notes.length ? entry.notes.join('<br>') : '';
      if (motionOf) {
        const motion = motionOf(entry);
        const cell = motion ? `${motion.label} (${motion.score.toFixed(2)})` : '—';
        lines.push(`| ${entry.n} | ${entry.name} | ${cell} | ${entry.kit} | ${notes} |`);
      } else {
        lines.push(`| ${entry.n} | ${entry.name} | ${entry.kit} | ${notes} |`);
      }
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// build

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
  const dir = opts.dir || path.join(ROOT, 'demo');
  const catalogPath = opts.catalog || path.join(dir, 'fx800.catalog.json');
  const mdPath = opts.md || path.join(dir, 'fx800.md');
  const looksPath = opts.looks || path.join(ROOT, 'renderer', 'data', 'fx800.looks.json');
  const catalog = buildCatalog();
  const catalogChanged = writeFileIfChanged(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  // おまかせ pool: classification (motion / axes / themes) + delta-encoded looks
  const looks = classify.buildLooksData(catalog);
  const motionOf = (entry) => {
    const match = looks.effects.find((item) => item.n === entry.n);
    return match ? { label: classify.motionLabel(match), score: match.motion.score } : null;
  };
  const looksChanged = writeFileIfChanged(looksPath, `${JSON.stringify(looks)}\n`);
  const demos = [];
  for (const demo of catalog.demos) {
    const entries = catalog.effects.filter((entry) => entry.demo === demo.demo);
    const built = buildPartProject(demo.demo, entries);
    const migrated = project.migrate(JSON.parse(JSON.stringify(built.project)));
    if (!migrated.ok) throw new Error(`demo ${demo.demo} did not migrate: ${migrated.error}`);
    if (migrated.project.script.cues.length !== entries.length) {
      throw new Error(`demo ${demo.demo} lost cues: ${migrated.project.script.cues.length}`);
    }
    const files = demoFiles(demo.demo, dir);
    const srtChanged = writeFileIfChanged(files.srt, built.srtText);
    const projectChanged = writeFileIfChanged(files.project, `${JSON.stringify(built.project, null, 2)}\n`);
    demos.push({ demo: demo.demo, srt: files.srt, project: files.project, entries: entries.length, srtChanged, projectChanged });
  }
  const mdChanged = writeFileIfChanged(mdPath, catalogMarkdown(catalog, { motionOf }));
  return {
    catalog,
    looks,
    written: { catalog: catalogPath, catalogChanged, md: mdPath, mdChanged, looks: looksPath, looksChanged, demos },
  };
}

// ---------------------------------------------------------------------------
// CLI

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

function commandShow(args) {
  const n = Number.parseInt(args.positional[1], 10);
  if (!Number.isFinite(n)) throw new Error('usage: fx800 show <n>');
  const entry = findEntry(loadCatalog(args.flags.catalog === true ? null : args.flags.catalog), n);
  console.log(JSON.stringify(entry, null, 2));
}

function commandList(args) {
  const catalog = loadCatalog(args.flags.catalog === true ? null : args.flags.catalog);
  const part = args.flags.part === true ? null : Number.parseInt(args.flags.part, 10);
  for (const entry of catalog.effects) {
    if (Number.isFinite(part) && entry.demo !== part) continue;
    console.log(`${entry.n}\t[デモ${entry.demo}] ${entry.name}\t${entry.kit}`);
  }
}

function commandApply(args) {
  const n = Number.parseInt(args.positional[1], 10);
  if (!Number.isFinite(n)) throw new Error('usage: fx800 apply <n> --project <file> [--cue 12] [--out file]');
  const projectFile = args.flags.project;
  if (!projectFile || projectFile === true) throw new Error('--project <file> is required');
  const doc = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
  const migrated = project.migrate(doc);
  if (!migrated.ok) throw new Error(`not a valid project: ${migrated.error}`);
  const target = migrated.project;
  const cue = resolveCue(target, args.flags.cue);
  const entry = findEntry(loadCatalog(args.flags.catalog === true ? null : args.flags.catalog), n);
  mix.applyEntry(target, entry, cue);
  const out = args.flags.out;
  console.log(`#${entry.n} ${entry.name}（デモ${entry.demo}）→ cue ${cue.id} (${cue.start}s-${cue.end}s)`);
  if (!out || out === true) {
    console.log('dry run (pass --out <file> to write the patched project)');
    return;
  }
  fs.writeFileSync(out, `${JSON.stringify(target, null, 2)}\n`, 'utf8');
  console.log(`written: ${path.resolve(out)}`);
}

function help() {
  console.log([
    'FX 800: numbered effects, four 200-effect demo projects',
    '',
    '  node scripts/fx800.js build',
    '  node scripts/fx800.js show <n>',
    '  node scripts/fx800.js list [--part 1|2|3|4]',
    '  node scripts/fx800.js apply <n> --project <file> [--cue <index|id>] [--out <file>]',
    '',
    'build options: [--dir <directory>] [--catalog <file>] [--md <file>] [--looks <file>]',
  ].join('\n'));
}

function main(argv) {
  const args = parseArgs(argv);
  const command = args.positional[0] || 'help';
  try {
    if (command === 'build') {
      const result = build({
        dir: args.flags.dir === true ? null : args.flags.dir,
        catalog: args.flags.catalog === true ? null : args.flags.catalog,
        md: args.flags.md === true ? null : args.flags.md,
        looks: args.flags.looks === true ? null : args.flags.looks,
      });
      const nearest = nearestPairDistance(result.catalog);
      console.log(`catalog: ${result.written.catalog} (${result.catalog.effects.length} demos, nearest pair distance ${nearest.toFixed(1)})`);
      for (const demo of result.written.demos) console.log(`demo ${demo.demo}: ${demo.entries} cues — ${demo.srt} / ${demo.project}`);
      console.log(`index:   ${result.written.md}`);
      const buckets = result.looks.motion.buckets.map((bucket, index) => `${bucket.label} ${result.looks.motion.counts[index]}`).join(' / ');
      console.log(`looks:   ${result.written.looks} (motion ${buckets})`);
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
    console.error(`fx800: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  TOTAL,
  PART_SIZE,
  PARTS,
  demoOf,
  demoRange,
  demoTitle,
  demoFiles,
  buildCatalog,
  nearestPairDistance,
  buildPartProject,
  catalogMarkdown,
  build,
  loadCatalog,
  findEntry,
  catalogSrt: mix.catalogSrt,
  applyEntry: mix.applyEntry,
  distance: mix.distance,
};
