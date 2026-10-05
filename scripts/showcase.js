'use strict';

// SHOWCASE: one project that walks through every representative effect plus
// every page-layout preset, so both can be eyeballed from Help → Showcase.
//
//   node scripts/showcase.js [--groups enter,post] [--pages off] [--out <file>]
//     writes renderer/data/showcase.json
//
// The effect half is the fx400 catalogue's variant 1 of every type (the recipe
// that reproduces the type most plainly), plus the `repeat` group the
// catalogue does not cover. The page half is every page preset but `none`,
// each with a sample text built for the roles the preset reads
// (headline / deck / body / byline / name / price / note...). One effect is one
// three-second cue, one page is one four-second cue; a marker opens every
// section. Every effect cue is staged (see `stagedEntry`) so the effect has
// moving letters and a readable entrance to act on. The output is generated,
// never hand edited: re-run this after the fx400 catalogue changes.

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

const GROUP_ORDER = [...fx400.GROUP_ORDER, 'repeat'];
// fx400 does not catalogue `repeat`, so its group label lives here
const GROUP_LABELS = { ...fx400.GROUP_LABELS, repeat: '繰り返し' };
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
  // line 0 is the article headline (the preset reads it as `headline`), the
  // rest is split into three columns, so the label goes last as a credit
  newspaper: '夕暮れの街に朝刊が届く\n記録はここから\n始まりました。\n記者は駅で\n待っていました。\n霧の向こうの\n電灯は並んだ。\n明日の朝、\nさらに増える。\n— newspaper —',
  twoColumn: '2段組み twoColumn\n本文を二つの段に分けて配置します。\n新聞や雑誌のような組み方です。\n左右に分かれて読み進めます。',
  threeColumn: '3段組み threeColumn\n本文を三つの段に分けて配置します。\n短い行を並べて紙面らしく見せます。\n各段が独立して流れます。',
  // the whole cue fills the cells, so the sample has to be long enough to fill
  // the sheet (see PAGE_PARAMS.manuscript)
  manuscript: '吾輩は猫である。名前はまだ無い。\nどこで生れたか頓と見当がつかぬ。\n何でも薄暗いじめじめした所で\nニャーニャー泣いていた事だけは\n記憶している。吾輩はここで始めて\n人間を見た。しかもあとで聞くと\nそれは書生という人間中で一番\n獰悪な種族であった。',
  xCard: 'TelopMotion\nXのカード風レイアウトです。\n本文と時刻をカードに収めます。\n3:00 PM',
  chatBubble: 'Hey what is up?\nNot much, working on TelopMotion!\nNice!',
  cafeSign: 'CAFE SIGN\n自家焙煎のコーヒー\nOpen 8:00 - 20:00\n— cafeSign —',
  cafeMenu: 'MENU / cafeMenu\nCaramel Macchiato | ¥650\nCafe Latte | ¥580\nGreen Tea Latte | ¥560',
  boutique: 'BOUTIQUE\n上質な余白と細い罫線。\nブランドの世界観を伝えます。\n— atelier —',
  score: 'DO RE MI FA SO LA TI DO',
  poster: 'POSTER\nGraphic Design\nTypography Showcase\nTokyo Japan',
};
// page presets whose own params the sample depends on: the default 20x20
// manuscript grid is 400 cells, far more than one 10-line cue can fill, so the
// sheet is sized to the sample instead of leaving 90% of it empty
const PAGE_PARAMS = {
  manuscript: { cols: 14, rows: 10 },
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

// --- staging -----------------------------------------------------------------
// An effect on its own is often nothing to look at: a smear needs moving
// pixels, a spring needs something to overshoot on, a timing type needs a
// visible entrance to bend, and an entrance that lasts 0.25 s of a 3 s cue is
// over before the eye lands on it. Every cue therefore plays on a small staged
// scene, and the effect under test is the only thing that changes.

const STAGE_ENTER = { type: 'fade', enabled: true, params: { softness: 0.4 }, motion: { in: { duration: 0.6, ease: 'cubicOut' } } };
const STAGE_EXIT = { type: 'fade', enabled: true, params: {}, motion: { out: { duration: 0.5, ease: 'cubicIn' } } };
// a slow circle under the letters: the drift every smear / blur / bloom /
// dissolve / gradient needs before it can show what it does
const STAGE_HOLD = [{ type: 'orbit2D', params: { radius: 0.05, speed: 0.35, spread: 0.05 }, enabled: true }];
// the entrance an animation type bends: a slide has position and scale to
// overshoot on, a plain fade would hide every timing effect
const STAGE_ENTER_SLIDE = { type: 'slide', enabled: true, params: { dir: 'up', distance: 0.3 }, motion: { in: { duration: 0.9, ease: 'cubicOut' } } };
// an entrance long enough to watch inside a 3 s cue
const READABLE_IN = { duration: 1.1, ease: 'cubicOut' };
const READABLE_OUT = { duration: 1, ease: 'cubicIn' };
// the entrances that carry their own easing: the group ease is handed to the
// effect already eased, so a second curve on top (backOut over elasticOut) is
// what makes the pop read as a plain scale. Linear hands the effect the raw
// progress and lets it be itself.
const SELF_EASED_ENTER = new Set(['elasticPop', 'dropBounce']);
const SELF_EASED_EXIT = new Set(['typewriterReverse', 'creepOut']);
// the groups that need the moving letters, the groups that only need a frame
const MOVING_GROUPS = new Set(['fill', 'edge', 'post', 'background', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion', 'repeat', 'text']);
const FRAMED_GROUPS = new Set(['hold', 'location']);

// the staged recipe for one effect entry: the catalogue's own style / clip plus
// whatever the effect needs around it to be visible
function stagedEntry(entry) {
  const staged = clone(entry);
  const style = staged.style || {};
  if (staged.group === 'enter') {
    const current = (style.enter && style.enter.motion && style.enter.motion.in) || {};
    style.enter = {
      ...style.enter,
      motion: { ...(style.enter.motion || {}), in: { ...current, duration: READABLE_IN.duration, ease: SELF_EASED_ENTER.has(staged.type) ? 'linear' : current.ease || READABLE_IN.ease } },
    };
    staged.style = style;
    return staged;
  }
  if (staged.group === 'exit') {
    const current = (style.exit && style.exit.motion && style.exit.motion.out) || {};
    style.exit = {
      ...style.exit,
      motion: { ...(style.exit.motion || {}), out: { ...current, duration: READABLE_OUT.duration, ease: SELF_EASED_EXIT.has(staged.type) ? 'linear' : current.ease || READABLE_OUT.ease } },
    };
    staged.style = style;
    return staged;
  }
  if (staged.group === 'animation') {
    // the timing types (stagger, cascade, spring, stopMotion, timeWarp) are
    // only visible on an entrance that moves
    style.enter = clone(STAGE_ENTER_SLIDE);
    style.exit = clone(STAGE_EXIT);
  } else if (MOVING_GROUPS.has(staged.group)) {
    // the modifiers act on what the letters are doing, so they need the orbit
    if (!style.hold) style.hold = clone(STAGE_HOLD);
    style.enter = clone(STAGE_ENTER);
    style.exit = clone(STAGE_EXIT);
  } else if (FRAMED_GROUPS.has(staged.group)) {
    style.enter = clone(STAGE_ENTER);
    style.exit = clone(STAGE_EXIT);
  }
  staged.style = style;
  if (staged.clip && staged.clip.type === 'gradient') {
    // the gradient is the one background whose showcase frame has to pick its
    // own values: eight directions and two to four stops are the whole point,
    // so the staged cue shows a diagonal three-stop ramp
    staged.clip.params = {
      ...(staged.clip.params || {}),
      direction: 'toBottomRight',
      colors: [{ pos: 0, color: '#141c3a' }, { pos: 0.5, color: '#6d3fa8' }, { pos: 1, color: '#ff8a3d' }],
    };
  }
  return staged;
}

function pageCueId(index) {
  return `pg_${String(index + 1).padStart(2, '0')}`;
}

// the `repeat` group (the same string drawn several times over) is not part of
// the fx400 catalogue, so the showcase writes its recipe straight from the
// registry: the group is a pure arrangement, so its defaults are the recipe
function repeatEntries() {
  return fx.list('repeat').map((descriptor, index) => ({
    n: index + 1,
    group: 'repeat',
    type: descriptor.type,
    variant: 1,
    label: `${GROUP_LABELS.repeat} / ${fx400.typeLabel('repeat', descriptor.type)}`,
    apply: 'style',
    changes: [],
    verified: 'static',
    score: null,
    notes: [],
    style: { repeat: fx.withDefaults({ type: descriptor.type, params: {} }, 'repeat') },
  }));
}

function buildShowcase(options) {
  const opts = options || {};
  const catalog = opts.catalog || fx400.buildCatalog();
  const groups = opts.groups && opts.groups.length ? opts.groups : GROUP_ORDER;
  const includePages = opts.pages !== false;
  const entries = representativeEntries(catalog).concat(repeatEntries());
  const effects = entries.filter((entry) => groups.includes(entry.group));
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
    doc.cueStyles[cueId] = { page: { type, params: clone(PAGE_PARAMS[type] || {}) } };
  }
  for (const { entry, cueId } of effectRefs) {
    const cue = doc.script.cues.find((item) => item.id === cueId);
    const staged = stagedEntry(entry);
    fx400.applyEntry(doc, staged, cue);
    // the staged scene is merged on top of the recipe: the effect's own group
    // stays exactly as the catalogue measured it
    const container = doc.cueStyles[cueId] || (doc.cueStyles[cueId] = {});
    doc.cueStyles[cueId] = project.mergeDeep(container, clone(staged.style) || {});
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
  PAGE_PARAMS,
  OUT_PATH,
  pageTypes,
  representativeEntries,
  repeatEntries,
  effectText,
  stagedEntry,
  buildShowcase,
  build,
  serialize,
};
