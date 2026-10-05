'use strict';

// DECOR SHOWCASE: one project that walks the text decorations, so the
// speech-bubble / label / enclosure pieces can be reviewed on their own from
// Help → Decor showcase.
//
//   node scripts/decor-showcase.js build [--sections orn,motion] [--out <file>] [--md off]
//     writes renderer/data/decor-showcase.json and demo/decor-showcase.md
//   node scripts/decor-showcase.js list [--section frame]
//
// The walk has seven sections. `orn` is one cue per ornShape type (the
// per-letter ornament behind / in front of the lyric). `bubble` walks every
// tail side against every body of the speech bubble. `line` replays
// representative shapes hollow (stroke only, no fill). `motion` pins one
// reference ornament (rounded) and varies only ornMotion, so neighbouring
// cues differ only in the motion under review. `edge` pins the same reference
// and varies only ornEdge. `frame` is one cue per post.shapeLayer shape (the
// frame graphic that follows the text box: 囲み). `page` replays the chat /
// card page presets in a decoration context (chatBubble / xCard / cafeMenu /
// boutique). Every non-page cue shows the same sample text; page cues carry
// the roles their preset reads. One marker opens every section.
//
// The output is generated, never hand edited: re-run this after the ornShape
// types, the ornMotion types, the shapeLayer shapes or the page presets
// change.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const requirePart = (relative) => require(path.join(ROOT, relative));

const project = requirePart('renderer/js/studio/project.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');

const ORN_SECONDS = 3;
const MOTION_SECONDS = 3;
const FRAME_SECONDS = 3;
const PAGE_SECONDS = 4;
// a fixed stamp keeps the generated file byte-identical on every run, so the
// build only writes when the walk itself changed
const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const OUT_PATH = path.join(ROOT, 'renderer', 'data', 'decor-showcase.json');
const MD_PATH = path.join(ROOT, 'demo', 'decor-showcase.md');
// every decoration is read against the same ground: dark letterpress text on
// a bright ornament, the ornament fill rotating so neighbouring cues differ
// in colour too
const LABEL_COLOR = '#e9edf8';
const TEXT_DARK = '#14141c';
const TEXT_SIZE = 64;

// ornaments (and the frame shapeLayer) resolve their paint through the
// palette roles (fill:3 / stroke:4 / fill2:5). The walk used to pin no
// palette, so every cue fell back to white ornaments on near-white text:
// identical white blobs with unreadable letters. Each cue now carries its
// own palette with a bright ornament, and dark text on top of it.
const ORN_FILLS = [
  '#ffd166', '#ff5cd0', '#00e5ff', '#7dff8a', '#ff8a3d',
  '#ff4d5e', '#c77dff', '#8ef6ff', '#d0ff4d', '#4dd6c1',
];

function ornFillOf(index) {
  return ORN_FILLS[(index - 1) % ORN_FILLS.length];
}

function decorColorFor(index) {
  const main = ornFillOf(index);
  return {
    color: { fill: { kind: 'solid', value: TEXT_DARK, alpha: 1 } },
    palette: {
      colors: [
        '#101018', '#1a1a24', TEXT_DARK, main, '#ffffff',
        main, '#8fa8ff', '#101018', main, '#8fa8ff',
      ],
    },
  };
}

const SAMPLE = 'あいうえお カキクケコ Deco 123';

// per-letter ornaments in walk order (matches text-bg SHAPES without none)
const ORN_SHAPES = [
  'square', 'rounded', 'circle', 'diamond', 'ring', 'bar', 'star',
  'blob', 'heart', 'splatter', 'scratch', 'drop', 'bracket', 'paper', 'cloud',
  'plate', 'oval', 'bubble',
];
const ORN_JA = {
  square: '四角', rounded: '角丸', circle: '円', diamond: 'ひし形', ring: 'リング',
  bar: '帯', star: '星', blob: '不定形', heart: 'ハート', splatter: '血しぶき',
  scratch: 'ひっかき傷', drop: 'しずく', bracket: 'カギ括弧', paper: '紙片', cloud: '雲',
  plate: '看板', oval: '楕円看板', bubble: 'ふきだし',
};
// the speech bubble matrix: every tail side against every body, so the
// right/left/top/bottom tails and the oval/square/rounded/cloud bodies read
// as different nuances of the same bubble
const BUBBLE_TAILS = ['right', 'left', 'top', 'bottom'];
const BUBBLE_TAIL_JA = { right: '右しっぽ', left: '左しっぽ', top: '上しっぽ', bottom: '下しっぽ' };
const BUBBLE_BODIES = ['oval', 'square', 'rounded', 'cloud'];
const BUBBLE_BODY_JA = { oval: '楕円', square: '四角', rounded: '角丸', cloud: '雲' };
// outline (hollow) versions of representative shapes: no fill, only the
// stroke line, so filled vs line-only reads at a glance
const LINE_SHAPES = ['square', 'rounded', 'circle', 'plate', 'oval', 'bubble', 'cloud', 'star'];
// edge decorations on the reference ornament, so the edge vocab reads next
// to the plain filled shape (matches edge.js types)
const EDGE_TYPES = [
  'outline', 'neonGlow', 'innerGlow', 'bevel', 'extrude',
  'longShadow', 'dropShadow', 'drip', 'multiLine',
];
const EDGE_JA = {
  outline: '縁取り', neonGlow: 'ネオン', innerGlow: '内側の光', bevel: 'ベベル',
  extrude: '押し出し', longShadow: '長い影', dropShadow: 'ドロップシャドウ',
  drip: '滴り', multiLine: '多重線',
};
// ornament entrance motions in walk order (matches text-bg MOTIONS)
const ORN_MOTIONS = [
  'follow', 'fade', 'pop', 'stamp', 'wipe', 'spin', 'grow',
  'none', 'flicker', 'bleed', 'float', 'fall', 'draw',
];
const ORN_MOTION_JA = {
  follow: '文字に追従', fade: 'フェード', pop: 'ポップ', stamp: 'スタンプ',
  wipe: 'ワイプ', spin: '回転', grow: '伸びる', none: 'なし',
  flicker: 'ちらつき', bleed: 'にじみ', float: '浮かぶ', fall: '落下', draw: '描画',
};
// frame graphics in walk order (matches shape-ops SHAPES)
const FRAME_SHAPES = [
  'underline', 'strike', 'box', 'brackets', 'circle', 'ring', 'burst',
  'cross', 'diagonal', 'overline', 'topBottom', 'sides',
  'sidesSemicircle', 'sidesSemiellipse', 'capsule', 'plate', 'ornament',
];
const FRAME_JA = {
  underline: '下線', strike: '取り消し線', box: '四角囲み', brackets: 'カギ括弧',
  circle: '円囲み', ring: 'リング', burst: '爆発', cross: 'クロス',
  diagonal: '斜線', overline: '上線', topBottom: '上下線', sides: '両側線',
  sidesSemicircle: '両側半円', sidesSemiellipse: '両側半楕円',
  capsule: 'カプセル', plate: 'ラベル板', ornament: '飾り罫',
};
// chat / card pages replayed in a decoration context (a subset of the page
// walk in showcase.js: the full 19-preset walk stays there)
const PAGE_TYPES = ['chatBubble', 'xCard', 'cafeMenu', 'boutique'];
const PAGE_JA = {
  chatBubble: 'チャット', xCard: 'SNSカード', cafeMenu: 'カフェメニュー', boutique: 'ブティック',
};
const PAGE_SAMPLES = {
  chatBubble: 'Hey what is up?\nNot much, working on TelopMotion!\nNice!',
  xCard: 'TelopMotion\nXのカード風レイアウトです。\n本文と時刻をカードに収めます。\n3:00 PM',
  cafeMenu: 'MENU / cafeMenu\nCaramel Macchiato | ¥650\nCafe Latte | ¥580\nGreen Tea Latte | ¥560',
  boutique: 'BOUTIQUE\n上質な余白と細い罫線。\nブランドの世界観を伝えます。\n— atelier —',
};
// page cues must stay a single beat: raising maxLines keeps explicit breaks
const PAGE_TEXT_FLOW = { maxLines: { '16:9': 10, '9:16': 10 } };

const SECTIONS = [
  { id: 'orn', label: '文字飾り (ornShape)', note: '歌詞の文字ごとの飾り（ornShape）を1種類ずつ。塗りつぶしで、動きは追従（follow）に固定し、違うのは形だけです。' },
  { id: 'bubble', label: 'ふきだし (bubble)', note: 'ふきだしのしっぽの向き（右・左・上・下）×本体（楕円・四角・角丸・雲）を総当たりで。同じふきだしでも向きと本体でニュアンスが変わります。' },
  { id: 'line', label: '抜き・線だけ (stroke)', note: '代表8種の線だけ版（fill なし＋stroke）。塗りつぶしとの違いを見比べます。' },
  { id: 'motion', label: '飾りの動き (ornMotion)', note: '参照の飾り（rounded）を固定し、飾りの出方（ornMotion）だけを変えています。' },
  { id: 'edge', label: '飾りの縁 (ornEdge)', note: '参照の飾り（rounded・塗りつぶし）に縁飾り（ornEdge）を1種類ずつ。縁なしとの違いを見比べます。' },
  { id: 'frame', label: '囲みフレーム (shapeLayer)', note: '文ブロックを囲むフレーム線（post.shapeLayer）を1種類ずつ。テキストは同じ見本で、違うのは囲みだけです。' },
  { id: 'page', label: 'チャット・カード (page)', note: '装飾の文脈で使う紙面（chatBubble / xCard / cafeMenu / boutique）。全19種の見本はメインの Showcase にあります。' },
];

// the text stays still so the decoration can be judged: entrances and exits
// are short fades and the animation is simultaneous (same rule as the font
// showcase)
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

// One enclose ornament that hugs the letter: the same 1.25-cell build for
// every shape so neighbouring cues differ only in the shape under review.
// `bar` is the exception (a horizontal band, not a box).
function ornParamsFor(type) {
  const params = { unit: 'cell', width: 1.25, height: 1.25, skipSpaces: true, layer: 'behind', opacity: 1 };
  if (type === 'bar') {
    params.width = 1.3;
    params.height = 0.45;
  } else if (type === 'bracket' || type === 'ring') {
    params.width = 1.3;
    params.height = 1.3;
  } else if (type === 'cloud' || type === 'paper' || type === 'splatter' || type === 'blob') {
    params.width = 1.35;
    params.height = 1.35;
  } else if (type === 'scratch') {
    params.width = 1.4;
    params.height = 1.4;
  } else if (type === 'drop') {
    params.width = 1.2;
    params.height = 1.3;
  } else if (type === 'plate' || type === 'oval') {
    params.width = 1.4;
    params.height = 1.3;
  } else if (type === 'bubble') {
    // the tail sticks out of the letter box: a wider build keeps it on screen
    params.width = 1.5;
    params.height = 1.4;
  }
  if (type === 'paper') params.jag = 0.4;
  if (type === 'splatter') params.spikes = 0.5;
  if (type === 'star') params.points = 5;
  return params;
}

function bubbleParamsFor(tail, body) {
  const params = ornParamsFor('bubble');
  params.tail = tail;
  params.body = body;
  return params;
}

function ornStyleFor(type) {
  return {
    ornShape: { type, params: ornParamsFor(type), enabled: true },
    ornFill: { type: 'solid', params: {}, enabled: true },
    ornMotion: { type: 'follow', params: {}, enabled: true },
    animation: clone(STATIC_ANIMATION),
    enter: clone(STATIC_ENTER),
    exit: clone(STATIC_EXIT),
  };
}

function motionStyleFor(motion) {
  return {
    ornShape: { type: 'rounded', params: ornParamsFor('rounded'), enabled: true },
    ornFill: { type: 'solid', params: {}, enabled: true },
    ornMotion: { type: motion, params: {}, enabled: true },
    animation: clone(STATIC_ANIMATION),
    enter: clone(STATIC_ENTER),
    exit: clone(STATIC_EXIT),
  };
}

function bubbleStyleFor(tail, body) {
  return {
    ornShape: { type: 'bubble', params: bubbleParamsFor(tail, body), enabled: true },
    ornFill: { type: 'solid', params: {}, enabled: true },
    ornMotion: { type: 'follow', params: {}, enabled: true },
    animation: clone(STATIC_ANIMATION),
    enter: clone(STATIC_ENTER),
    exit: clone(STATIC_EXIT),
  };
}

function lineStyleFor(type) {
  // hollow version of the filled ornament: no interior fill, only the stroke
  // line, so filled vs line-only reads at a glance
  const params = ornParamsFor(type);
  params.fill = 0;
  params.stroke = 0.08;
  return {
    ornShape: { type, params, enabled: true },
    ornFill: { type: 'solid', params: {}, enabled: true },
    ornMotion: { type: 'follow', params: {}, enabled: true },
    animation: clone(STATIC_ANIMATION),
    enter: clone(STATIC_ENTER),
    exit: clone(STATIC_EXIT),
  };
}

function edgeStyleFor(edge) {
  return {
    ornShape: { type: 'rounded', params: ornParamsFor('rounded'), enabled: true },
    ornFill: { type: 'solid', params: {}, enabled: true },
    ornEdge: [{ type: edge, params: {}, enabled: true }],
    ornMotion: { type: 'follow', params: {}, enabled: true },
    animation: clone(STATIC_ANIMATION),
    enter: clone(STATIC_ENTER),
    exit: clone(STATIC_EXIT),
  };
}

function frameStyleFor(shape) {
  return {
    animation: clone(STATIC_ANIMATION),
    enter: clone(STATIC_ENTER),
    exit: clone(STATIC_EXIT),
    post: [{
      type: 'shapeLayer',
      params: {
        shape, drive: 'enter', enterAnim: 'draw', exitAnim: 'erase', holdAnim: 'flow',
        stroke: 6, padding: 0.12,
      },
      enabled: true,
    }],
  };
}

function cueId(index) {
  return `dc_${String(index + 1).padStart(3, '0')}`;
}

function cueText(index, value, detail) {
  const head = detail && detail !== value ? `${index}. ${value} · ${detail}` : `${index}. ${value}`;
  return `${head}\n${SAMPLE}`;
}

// The walk itself, without any timing: one slot per cue, in playing order.
function plan() {
  const slots = [];
  const push = (section, value, detail, seconds, style, pageType) => {
    const index = slots.length;
    slots.push({
      index: index + 1, section, value, detail, seconds,
      cueId: cueId(index), style: style || null, pageType: pageType || null,
    });
  };
  for (const type of ORN_SHAPES) push('orn', type, ORN_JA[type] || type, ORN_SECONDS, ornStyleFor(type));
  for (const tail of BUBBLE_TAILS) {
    for (const body of BUBBLE_BODIES) {
      push('bubble', `bubble/${tail}/${body}`, `${BUBBLE_TAIL_JA[tail]}×${BUBBLE_BODY_JA[body]}`, ORN_SECONDS, bubbleStyleFor(tail, body));
    }
  }
  for (const type of LINE_SHAPES) push('line', type, `${ORN_JA[type] || type}・線だけ`, ORN_SECONDS, lineStyleFor(type));
  for (const motion of ORN_MOTIONS) push('motion', motion, ORN_MOTION_JA[motion] || motion, MOTION_SECONDS, motionStyleFor(motion));
  for (const edge of EDGE_TYPES) push('edge', edge, EDGE_JA[edge] || edge, ORN_SECONDS, edgeStyleFor(edge));
  for (const shape of FRAME_SHAPES) push('frame', shape, FRAME_JA[shape] || shape, FRAME_SECONDS, frameStyleFor(shape));
  for (const type of PAGE_TYPES) push('page', type, PAGE_JA[type] || type, PAGE_SECONDS, null, type);
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
    const isPage = slot.section === 'page';
    cues.push({
      id,
      start,
      end,
      text: isPage ? (PAGE_SAMPLES[slot.pageType] || `page: ${slot.pageType}`) : cueText(slot.index, slot.value, slot.detail),
      textFlow: isPage ? clone(PAGE_TEXT_FLOW) : undefined,
      // language-independent ids, so the Studio needs no re-labelling (same
      // shape as the backdrop showcase's meta)
      meta: {
        kind: 'decor-showcase', index: slot.index, section: slot.section,
        value: slot.value, detail: slot.detail,
      },
    });
    // textFlow undefined must not survive (the migration keeps unknown keys,
    // but a missing key is cleaner than an explicit undefined)
    const cue = cues[cues.length - 1];
    if (cue.textFlow === undefined) delete cue.textFlow;
    entries.push({
      index: slot.index, section: slot.section, sectionLabel: sectionById.get(slot.section).label,
      cueId: id, start, end, value: slot.value, detail: slot.detail,
      // page cues paint their own paper from the ink, so they keep the light
      // text; every other cue gets dark text on a bright ornament (see
      // decorColorFor) so the shape under review actually reads
      style: slot.style ? { ...decorColorFor(slot.index), ...clone(slot.style) } : clone(slot.style),
      pageType: slot.pageType,
    });
    t = end;
  });
  const total = round(t);

  const doc = project.create({});
  doc.meta.title = 'TelopMotion 装飾見本';
  doc.meta.lang = 'ja';
  doc.meta.createdAt = FIXED_TIME;
  doc.meta.updatedAt = FIXED_TIME;
  doc.script.cues = cues;
  doc.script.sourceName = 'decor-showcase.json';
  doc.markers = markers;
  // the sample stays in the middle of the frame, large enough to judge the
  // separation between the lyrics and the decoration
  doc.style.text.fontId = 'NotoSansJP-Regular';
  doc.style.text.size = TEXT_SIZE;
  doc.style.text.align = 'center';
  doc.style.color = {
    fill: { kind: 'solid', value: LABEL_COLOR, alpha: 1 },
    stroke: { kind: 'solid', value: LABEL_COLOR, alpha: 1 },
  };
  textflow.apply(doc);
  for (const entry of entries) {
    if (entry.pageType) {
      doc.cueStyles[entry.cueId] = { page: { type: entry.pageType, params: {} } };
    } else if (entry.style) {
      doc.cueStyles[entry.cueId] = clone(entry.style);
    }
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
  lines.push('# 装飾見本 (decor showcase)');
  lines.push('');
  lines.push('吹き出し・ラベル・囲み・チャットの装飾だけを 1 キューずつ並べた見本プロジェクトです。文字飾りと囲みフレームのキューは同じ見本分を表示し、違うのは装飾だけです。');
  lines.push('');
  lines.push('- 文字飾り・ふきだし・抜き・飾りの動き・縁・囲みフレームは1種類＝1キュー（3 秒/キュー）、紙面は1種類＝1キュー（4 秒/キュー）');
  lines.push('- 飾りの動き・縁のセクションは参照の飾り（rounded）を使い、隣り合うキューで違うのは動き・縁だけです');
  lines.push('- 紙面の全 19 種はメインの Showcase にあります。ここでは装飾の文脈で使う 4 種（チャット・カード・メニュー）だけを抜粋します');
  lines.push('- 開くには Studio の *Help → 装飾見本*、または *File → Open project…* を使います');
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
  lines.push('| `npm run decor-showcase -- build` | このプロジェクトとこの一覧を再生成 |');
  lines.push('| `node scripts/decor-showcase.js list` | セクションとキューを一覧 |');
  lines.push('| `node scripts/decor-showcase.js list --section frame` | 1 セクションだけ表示 |');
  lines.push('| `npm run decor-showcase -- build --sections orn,motion` | セクションを絞って生成 |');
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
      lines.push(`   ${String(entry.index).padStart(3, ' ')}. ${formatRange(entry)}  ${entry.value} · ${entry.detail}`);
    }
    lines.push('');
  }
  lines.push(`total ${built.entries.length} cues, ${built.total}s`);
  return lines.join('\n');
}

function help() {
  console.log([
    'DECOR SHOWCASE: every text decoration and frame in one project',
    '',
    '  node scripts/decor-showcase.js build [--sections orn,motion] [--out <file>] [--md off]',
    '  node scripts/decor-showcase.js list [--section frame]',
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
    console.log(`decor-showcase: ${result.written.out} (${result.entries.length} cues, ${result.total}s)${result.written.changed ? '' : ' [unchanged]'}`);
    if (result.written.md) console.log(`decor-showcase: ${result.written.md}${result.written.mdChanged ? '' : ' [unchanged]'}`);
    return 0;
  } catch (error) {
    console.error(`decor-showcase: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  ORN_SECONDS,
  MOTION_SECONDS,
  FRAME_SECONDS,
  PAGE_SECONDS,
  OUT_PATH,
  MD_PATH,
  ORN_SHAPES,
  ORN_MOTIONS,
  BUBBLE_TAILS,
  BUBBLE_BODIES,
  LINE_SHAPES,
  EDGE_TYPES,
  FRAME_SHAPES,
  PAGE_TYPES,
  SECTIONS,
  TEXT_DARK,
  ORN_FILLS,
  ornParamsFor,
  bubbleParamsFor,
  ornFillOf,
  decorColorFor,
  ornStyleFor,
  bubbleStyleFor,
  lineStyleFor,
  motionStyleFor,
  edgeStyleFor,
  frameStyleFor,
  cueText,
  plan,
  buildShowcase,
  indexMarkdown,
  listText,
  build,
  serialize,
};
