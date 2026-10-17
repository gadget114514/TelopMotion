'use strict';

// NAMED EFFECTS SHOWCASE: one project that walks every named effect (120 entries)
// from the motion-prompt catalogue, so all ready-made looks can be reviewed
// from Help → Named effects showcase.
//
//   node scripts/named-effects-showcase.js build [--packs motion,camera] [--out <file>] [--md off]
//     writes renderer/data/named-effects-showcase.json and demo/named-effects-showcase.md
//   node scripts/named-effects-showcase.js list [--pack ui]
//
// The walk has five sections corresponding to the motion-prompt packs:
// motion (001-024), camera (025-048), ui (049-072), lp (073-096) and photo (097-120).
// One cue is four seconds, text shows the entry number, name, and sample lyrics.
// Each cue sets its style in `cueStyles` using `namedEffects.applyToBag`.
//
// The output is generated, never hand edited: re-run this after
// scripts/named-effects.js or test/motion-prompt.catalog.json change.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const requirePart = (relative) => require(path.join(ROOT, relative));

const project = requirePart('renderer/js/studio/project.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');
const namedEffects = requirePart('scripts/named-effects.js');

const SHOWCASE_SECONDS = 4;
const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const OUT_PATH = path.join(ROOT, 'renderer', 'data', 'named-effects-showcase.json');
const MD_PATH = path.join(ROOT, 'demo', 'named-effects-showcase.md');

const SAMPLE_JA = 'あいうえお カキクケコ 愛永漢字';
const SAMPLE_LATIN = 'Aiueo 0123';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function round(value, digits) {
  const factor = Math.pow(10, digits == null ? 3 : digits);
  return Math.round(value * factor) / factor;
}

function cueId(index) {
  return `ne_${String(index + 1).padStart(3, '0')}`;
}

function cueText(index, effect) {
  return `${index}. #${effect.id} ${effect.name.ja} (${effect.name.en})\n${SAMPLE_JA} ${SAMPLE_LATIN}`;
}

function plan() {
  const data = namedEffects.buildData();
  const packsById = new Map(data.packs.map((p) => [p.id, p]));
  return {
    data,
    packs: data.packs,
    slots: data.effects.map((effect, at) => {
      const pack = packsById.get(effect.pack);
      return {
        index: at + 1,
        pack: effect.pack,
        packTitleJa: pack ? pack.title.ja : effect.pack,
        packTitleEn: pack ? pack.title.en : effect.pack,
        effect,
        seconds: SHOWCASE_SECONDS,
        cueId: cueId(at),
      };
    }),
  };
}

function buildShowcase(options) {
  const opts = options || {};
  const wantedPacks = opts.packs && opts.packs.length ? new Set(opts.packs) : null;
  const { data, packs, slots } = plan();
  const filteredSlots = slots.filter((slot) => !wantedPacks || wantedPacks.has(slot.pack));
  if (!filteredSlots.length) throw new Error('no pack matched; nothing to build');

  const cues = [];
  const markers = [];
  const entries = [];
  const cueStyles = {};
  let t = 0;
  let lastPack = null;

  filteredSlots.forEach((slot, offset) => {
    const start = round(t);
    const end = round(t + slot.seconds);
    const id = cueId(offset);
    if (slot.pack !== lastPack) {
      lastPack = slot.pack;
      markers.push({ t: start, label: `${slot.packTitleJa} (${slot.pack})` });
    }
    const { effect } = slot;
    cues.push({
      id,
      start,
      end,
      text: cueText(slot.index, effect),
      meta: {
        kind: 'named-effects-showcase',
        pack: effect.pack,
        id: effect.id,
        name: effect.name.ja,
      },
    });

    const styleBag = namedEffects.applyToBag({}, effect);
    cueStyles[id] = styleBag;

    entries.push({
      index: slot.index,
      pack: effect.pack,
      packTitleJa: slot.packTitleJa,
      cueId: id,
      id: effect.id,
      name: effect.name,
      meaning: effect.meaning,
      groups: effect.groups,
      start,
      end,
      style: styleBag,
    });
    t = end;
  });
  const total = round(t);

  const doc = project.create({});
  doc.meta.title = 'TelopMotion ネームドエフェクト見本';
  doc.meta.lang = 'ja';
  doc.meta.createdAt = FIXED_TIME;
  doc.meta.updatedAt = FIXED_TIME;
  doc.script.cues = cues;
  doc.script.sourceName = 'named-effects-showcase.json';
  doc.markers = markers;
  textflow.apply(doc);
  doc.cueStyles = cueStyles;

  const activePacks = packs.filter((p) => !wantedPacks || wantedPacks.has(p.id));

  return {
    project: doc,
    entries,
    markers,
    packs: activePacks,
    data,
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
  lines.push('# ネームドエフェクト見本 (named effects showcase)');
  lines.push('');
  lines.push('https://showheyohtaki.github.io/motion-prompt/ の 120 種の演出（5 パック × 24）を 1 キューずつ並べた見本プロジェクトです。');
  lines.push('どのキューも同じサンプル文を表示し、レシピスタイル（`cueStyles`）が適用されています。');
  lines.push('');
  lines.push(`- 1エフェクト = 1キュー（${SHOWCASE_SECONDS} 秒）`);
  lines.push('- 開くには Studio の *Help → ネームドエフェクト見本*、または *File → Open project…* を使います');
  lines.push('');
  lines.push('| # | パック | キュー数 | 時間 |');
  lines.push('|---:|---|---:|---|');
  let order = 0;
  const rows = new Map();
  for (const entry of built.entries) {
    const row = rows.get(entry.pack) || { label: entry.packTitleJa, count: 0, from: entry.start, to: entry.end };
    row.count += 1;
    row.to = entry.end;
    rows.set(entry.pack, row);
  }
  for (const pack of built.packs) {
    const row = rows.get(pack.id);
    if (!row) continue;
    order += 1;
    lines.push(`| ${order} | ${pack.title.ja} (${pack.id}) | ${row.count} | ${round(row.from, 1)}–${round(row.to, 1)}s |`);
  }
  lines.push(`| | **合計** | **${built.entries.length}** | **${built.total}s** |`);
  lines.push('');
  lines.push('## コマンド');
  lines.push('');
  lines.push('| コマンド | 内容 |');
  lines.push('|---|---|');
  lines.push('| `npm run named-effects-showcase -- build` | このプロジェクトとこの一覧を再生成 |');
  lines.push('| `node scripts/named-effects-showcase.js list` | パックとキューを一覧 |');
  lines.push('| `node scripts/named-effects-showcase.js list --pack ui` | 1 パックだけ表示 |');
  lines.push('| `npm run named-effects-showcase -- build --packs motion,ui` | パックを絞って生成 |');
  lines.push('');
  let packIndex = 0;
  for (const pack of built.packs) {
    const packRows = built.entries.filter((entry) => entry.pack === pack.id);
    if (!packRows.length) continue;
    packIndex += 1;
    lines.push(`## ${packIndex}. ${pack.title.ja} (${pack.id})`);
    lines.push('');
    lines.push('| # | キュー | 時間 | No. | 名前 | 構成 |');
    lines.push('|---:|---|---|---|---|---|');
    for (const entry of packRows) {
      lines.push(`| ${entry.index} | \`${entry.cueId}\` | ${formatRange(entry)} | #${entry.id} | ${entry.name.ja} (${entry.name.en}) | ${entry.groups.join(' / ')} |`);
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
  const migratedStyles = migrated.project.cueStyles || {};
  if (Object.keys(migratedStyles).length !== built.entries.length) {
    throw new Error(`generated project has ${Object.keys(migratedStyles).length} cue styles for ${built.entries.length} cues`);
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

function parsePacks(value) {
  if (typeof value !== 'string') return null;
  const ids = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (!ids.length) return null;
  const data = namedEffects.buildData();
  const known = data.packs.map((pack) => pack.id);
  for (const id of ids) {
    if (!known.includes(id)) throw new Error(`unknown pack ${id} (${known.join(', ')})`);
  }
  return ids;
}

function listText(options) {
  const built = buildShowcase(options || {});
  const lines = [];
  let order = 0;
  for (const pack of built.packs) {
    const rows = built.entries.filter((entry) => entry.pack === pack.id);
    if (!rows.length) continue;
    order += 1;
    lines.push(`${order}. ${pack.title.ja} (${pack.id}) — ${rows.length} cues`);
    for (const entry of rows) {
      lines.push(`   ${String(entry.index).padStart(3, ' ')}. ${formatRange(entry)}  #${entry.id} ${entry.name.ja} (${entry.name.en})`);
    }
    lines.push('');
  }
  lines.push(`total ${built.entries.length} cues, ${built.total}s`);
  return lines.join('\n');
}

function help() {
  console.log([
    'NAMED EFFECTS SHOWCASE: every named effect in one project',
    '',
    '  node scripts/named-effects-showcase.js build [--packs motion,camera] [--out <file>] [--md off]',
    '  node scripts/named-effects-showcase.js list [--pack ui]',
    '',
    'packs: motion, camera, ui, lp, photo',
  ].join('\n'));
}

function main(argv) {
  const args = parseArgs(argv);
  const command = args.positional[0] && args.positional[0] !== 'build' ? args.positional[0] : 'build';
  if (command === 'help') {
    help();
    return 0;
  }
  let packsOption = null;
  try {
    packsOption = parsePacks(args.flags.packs || args.flags.pack);
    if (command === 'list') {
      console.log(listText({ packs: packsOption }));
      return 0;
    }
    if (command !== 'build') {
      help();
      return 1;
    }
    const result = build({
      packs: packsOption,
      out: args.flags.out === true ? null : args.flags.out,
      md: args.flags.md === 'off' ? null : args.flags.md,
    });
    console.log(`named-effects-showcase: ${result.written.out} (${result.entries.length} cues, ${result.total}s)${result.written.changed ? '' : ' [unchanged]'}`);
    if (result.written.md) console.log(`named-effects-showcase: ${result.written.md}${result.written.mdChanged ? '' : ' [unchanged]'}`);
    return 0;
  } catch (error) {
    console.error(`named-effects-showcase: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  SHOWCASE_SECONDS,
  OUT_PATH,
  MD_PATH,
  plan,
  buildShowcase,
  indexMarkdown,
  listText,
  build,
  serialize,
};
