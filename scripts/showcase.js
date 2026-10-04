'use strict';

// SHOWCASE: one project that walks through every representative effect plus
// every page-layout preset, so both can be eyeballed from Help → Showcase.
//
//   node scripts/showcase.js [--groups enter,post] [--pages off] [--out <file>]
//     writes renderer/data/showcase.json
//
// The effect half is the fx400 catalogue's variant 1 of every type (the recipe
// that reproduces the type most plainly). The page half is every page preset
// but `none`, each with a sample text built for the roles the preset reads
// (headline / deck / body / byline / name / price / note...). One effect is one
// three-second cue, one page is one four-second cue; a marker opens every
// section. The output is generated, never hand edited: re-run this after the
// fx400 catalogue changes.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
const requirePart = (relative) => require(path.join(ROOT, relative));

const fx = require(path.join(FX_DIR, 'registry.js'));
const fx400 = requirePart('scripts/fx400.js');
require(path.join(FX_DIR, 'page.js'));

const project = requirePart('renderer/js/studio/project.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');

const GROUP_ORDER = fx400.GROUP_ORDER;
const EFFECT_SECONDS = 3;
const PAGE_SECONDS = 4;
const OUT_PATH = path.join(ROOT, 'renderer', 'data', 'showcase.json');
// a fixed stamp keeps the generated file byte-identical on every run, so
// `npm run showcase` only writes when the catalogues actually changed
const FIXED_TIME = '2026-01-01T00:00:00.000Z';
// page layouts read their regions from the cue text, so a page cue must stay a
// single beat: raising maxLines lets the flow keep the explicit line breaks
const PAGE_TEXT_FLOW = { maxLines: { '16:9': 10, '9:16': 10 } };

const PAGE_MARKER = '紙面レイアウト (page)';
const PAGE_SAMPLES = {
  flushLeft: '左揃え flushLeft\n本文は左端をそろえて配置します。\n行頭がそろうと読みやすくなります。\n日本語でも自然に組めます。',
  center: '中央揃え center\n全体を中央に配置するレイアウトです。\n短い詩やタイトルに向いています。',
  flushRight: '右揃え flushRight\n右端をそろえる配置です。\n余白を生かした構成になります。',
  justify: '両端揃え justify\n行の左右の端をそろえて、\n紙面のように整った本文を組みます。\n文字の間隔を自動で調整します。',
  vertical: '縦書き vertical\n日本語の伝統的な組み方です。\n右から左へと読み進めます。',
  grid: 'GRID 格子\n文字を格子状に並べる\nレイアウト。',
  magazine: 'Magazine 雑誌\n特集のリード文をここに置きます\n本文の段落がここから始まります。\n詳しい説明が続きます。\n二つ目の段落です。\n最後に署名を置きます。',
  fashion: 'FASHION ファッション\n余白を広く取ったミニマルなレイアウト。\n細い文字と広い行間が特徴です。',
  newspaper: '新聞 newspaper\nHeadline Title Here\nSubheading or deck line\nFirst body paragraph goes here.\nSecond paragraph continues with details.\nFinal conclusion line.',
  twoColumn: '2段組み twoColumn\n本文を二つの段に分けて配置します。\n新聞や雑誌のような組み方です。\n左右に分かれて読み進めます。',
  threeColumn: '3段組み threeColumn\n本文を三つの段に分けて配置します。\n短い行を並べて紙面らしく見せます。\n各段が独立して流れます。',
  manuscript: '夏目漱石吾輩は猫である名前はまだ無いどこで生れたか頓と見当がつかぬ',
  xCard: 'TelopMotion\nXのカード風レイアウトです。\n本文と時刻をカードに収めます。\n3:00 PM',
  chatBubble: 'Hey what is up?\nNot much, working on TelopMotion!\nNice!',
  cafeSign: 'CAFE SIGN\n黒板にチョークで書いたような\nカフェの看板レイアウトです。',
  cafeMenu: 'MENU / cafeMenu\nCaramel Macchiato | ¥650\nCafe Latte | ¥580\nGreen Tea Latte | ¥560',
  boutique: 'BOUTIQUE\n上質な余白と細い罫線。\nブランドの世界観を伝えます。\n— atelier —',
  score: 'DO RE MI FA SO LA TI DO',
  poster: 'POSTER\nGraphic Design\nTypography Showcase\nTokyo Japan',
};

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function pageTypes() {
  return fx.list('page').map((descriptor) => descriptor.type).filter((type) => type !== 'none');
}

// fx400 numbers every type's most representative recipe as variant 1; that is
// exactly the one shape per type the showcase wants.
function representativeEntries(catalog) {
  const chosen = new Map();
  for (const entry of catalog.effects) {
    if (entry.variant !== 1) continue;
    const key = `${entry.group}.${entry.type}`;
    if (!chosen.has(key)) chosen.set(key, entry);
  }
  const ordered = [];
  for (const group of GROUP_ORDER) {
    for (const entry of chosen.values()) {
      if (entry.group === group) ordered.push(entry);
    }
  }
  return ordered;
}

function groupLabel(entry) {
  return String(entry.label || '').split(' / ')[0] || entry.group;
}

function effectText(entry) {
  const label = String(entry.label || '').replace(/（代表\d+）$/, '');
  return `${label} / ${entry.type}`;
}

function effectCueId(index) {
  return `fx_${String(index + 1).padStart(3, '0')}`;
}

function pageCueId(index) {
  return `pg_${String(index + 1).padStart(2, '0')}`;
}

function buildShowcase(options) {
  const opts = options || {};
  const catalog = opts.catalog || fx400.buildCatalog();
  const groups = opts.groups && opts.groups.length ? opts.groups : GROUP_ORDER;
  const includePages = opts.pages !== false;
  const effects = representativeEntries(catalog).filter((entry) => groups.includes(entry.group));
  const types = pageTypes();

  const cues = [];
  const markers = [];
  const pages = [];
  const effectRefs = [];
  let t = 0;

  if (includePages) {
    markers.push({ t: 0, label: PAGE_MARKER });
    types.forEach((type, index) => {
      const cue = {
        id: pageCueId(index),
        start: t,
        end: t + PAGE_SECONDS,
        text: PAGE_SAMPLES[type] || `page: ${type}`,
        textFlow: clone(PAGE_TEXT_FLOW),
        meta: { kind: 'page' },
      };
      cues.push(cue);
      pages.push({ type, cueId: cue.id });
      t += PAGE_SECONDS;
    });
  }

  let lastGroup = null;
  effects.forEach((entry, index) => {
    if (entry.group !== lastGroup) {
      lastGroup = entry.group;
      markers.push({ t, label: `${groupLabel(entry)} (${entry.group})` });
    }
    const cue = {
      id: effectCueId(index),
      start: t,
      end: t + EFFECT_SECONDS,
      text: effectText(entry),
    };
    cues.push(cue);
    effectRefs.push({ entry, cueId: cue.id });
    t += EFFECT_SECONDS;
  });

  const doc = project.create({});
  doc.meta.title = 'TelopMotion 効果・紙面レイアウト見本';
  doc.meta.lang = 'ja';
  doc.meta.createdAt = FIXED_TIME;
  doc.meta.updatedAt = FIXED_TIME;
  doc.script.cues = cues;
  doc.script.sourceName = 'showcase.json';
  doc.markers = markers;
  textflow.apply(doc);

  for (const { type, cueId } of pages) {
    doc.cueStyles[cueId] = { page: { type, params: {} } };
  }
  for (const { entry, cueId } of effectRefs) {
    const cue = doc.script.cues.find((item) => item.id === cueId);
    fx400.applyEntry(doc, entry, cue);
  }

  return { project: doc, catalog, cues: doc.script.cues, effects: effectRefs, pages, pageTypes: types, markers };
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

function build(options) {
  const opts = options || {};
  const out = opts.out || OUT_PATH;
  const built = buildShowcase(opts);
  const migrated = project.migrate(clone(built.project));
  if (!migrated.ok) throw new Error(`generated project did not migrate: ${migrated.error}`);
  if (migrated.project.script.cues.length !== built.project.script.cues.length) {
    throw new Error(`generated project lost cues: ${migrated.project.script.cues.length}`);
  }
  const text = serialize(built.project);
  const changed = writeFileIfChanged(out, text);
  return { ...built, written: { out, changed } };
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

function parseGroups(value) {
  if (typeof value !== 'string') return null;
  const groups = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (!groups.length) return null;
  for (const group of groups) {
    if (!GROUP_ORDER.includes(group)) throw new Error(`unknown group ${group} (${GROUP_ORDER.join(', ')})`);
  }
  return groups;
}

function help() {
  console.log([
    'SHOWCASE: representative effects and page layouts in one project',
    '',
    '  node scripts/showcase.js [options]',
    '',
    'options: [--groups enter,post] [--pages off] [--out <file>]',
  ].join('\n'));
}

function main(argv) {
  const args = parseArgs(argv);
  const command = args.positional[0] && args.positional[0] !== 'build' ? args.positional[0] : 'build';
  if (command === 'help') {
    help();
    return 0;
  }
  if (command !== 'build') {
    help();
    return 1;
  }
  try {
    const result = build({
      groups: parseGroups(args.flags.groups),
      pages: args.flags.pages === 'off' ? false : true,
      out: args.flags.out === true ? null : args.flags.out,
    });
    console.log(`showcase: ${result.written.out} (${result.effects.length} effects, ${result.pages.length} pages, ${result.project.script.cues.length} cues)${result.written.changed ? '' : ' [unchanged]'}`);
    return 0;
  } catch (error) {
    console.error(`showcase: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  EFFECT_SECONDS,
  PAGE_SECONDS,
  GROUP_ORDER,
  PAGE_SAMPLES,
  OUT_PATH,
  pageTypes,
  representativeEntries,
  effectText,
  buildShowcase,
  build,
  serialize,
};
