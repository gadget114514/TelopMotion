'use strict';

// FX 400 MIX: 400 text-effect demos that all look different.
//
// scripts/fx400.js lists every registered type with small parameter steps,
// which leaves long runs of near-identical cues. This catalog instead builds
// each demo as a complete look: one headline (the effect the demo is about)
// on top of a supporting kit drawn from every group (enter, exit, hold, fill,
// edge, post, layout, text background, repeat, background clip, typeface and
// palette). Kits are sampled so that every demo differs from all the others in
// many visible slots, and adjacent demos differ in almost all of them.
//
//   node scripts/fx400mix.js build
//     writes demo/fx400mix.srt, demo/fx400mix.catalog.json, demo/fx400mix.md
//     and demo/fx400mix.telopmotion.json (cue n shows demo n)
//   node scripts/fx400mix.js show 42
//   node scripts/fx400mix.js list [--part type|variant|preset|genre]

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
const requirePart = (relative) => require(path.join(ROOT, relative));

const fx = require(path.join(FX_DIR, 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg', 'vary', 'repeat', 'warp', 'animator', 'selector', 'camera', 'shape-layer', 'staged-presets']) {
  require(path.join(FX_DIR, `${name}.js`));
}
const rng = requirePart('renderer/js/lyrics/rng.js');
const moods = requirePart('renderer/js/lyrics/moods.js');
const patternVariants = requirePart('renderer/js/lyrics/pattern-variants.js');
const presets = requirePart('renderer/js/lyrics/presets.js');
const project = requirePart('renderer/js/studio/project.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');
const srt = requirePart('renderer/js/srt.js');
const color = requirePart('renderer/js/color.js');
const strings = requirePart('renderer/js/studio/fx-strings.js');

const SEED = 400401;
const TOTAL = 400;
const CUE_SECONDS = 3;
const CANDIDATES = 48;
const MIN_DISTANCE = 5; // weighted slot distance every pair of demos must keep
const MAX_EXTRAS = 3; // hold / edge / post / text background / repeat slots a kit may switch on

const HEADLINE_GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion', 'repeat'];
const STACK_GROUPS = new Set(['hold', 'edge', 'post', 'bgEdge']);
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
  repeat: 'リピート',
};
const PART_LABELS = {
  type: '第1部 タイプ見本（全タイプ）',
  variant: '第2部 はっきり違う設定違い',
  preset: '第3部 プリセット',
  genre: '第4部 ジャンル／ムード生成',
};

// Text size and colour are designed look dimensions like the effect kit: five
// sizes about 1.3x apart (doc/repeat-design.md §2) and six palette-colour
// roles, both stepped by demo number so neighbouring demos never read as the
// same look. SIZE_STRIDE 2 makes every neighbour at least two ladder steps
// (1.56x) apart.
const SIZE_STOPS = [56, 70, 88, 110, 138];
const SIZE_STRIDE = 2;
const COLOR_ROLE_LABELS = { 2: 'テキスト色', 3: 'アクセント色', 5: 'アクセント色2' };
const FILL_STEPS = [
  { kind: 'palette', index: 3 }, // accent
  { kind: 'palette', index: 2 }, // theme text (bright on dark, dark on light)
  { kind: 'gradient', stops: [3, 5] }, // accent -> accent 2
  { kind: 'palette', index: 5 }, // accent 2 (hue +40 from the accent)
  { kind: 'gradient', stops: [2, 3] }, // text -> accent
  { kind: 'gradient', stops: [5, 2] }, // accent 2 -> text
];

// typefaces with Japanese glyphs (the demo text is Japanese)
const FONTS = [
  'NotoSansJP-Regular',
  'NotoSansJP-Bold',
  'DelaGothicOne-Regular',
  'NotoSerifJP-Regular',
  'ZenMaruGothic-Regular',
  'KleeOne-Regular',
  'RocknRollOne-Regular',
];
const GENRES = ['horror', 'love', 'heartbreak', 'party', 'ballad', 'cinematic', 'cute', 'electro', 'rock', 'washu'];
const GENRE_LABELS = { horror: 'ホラー', love: 'ラブ', heartbreak: '失恋', party: 'パーティー', ballad: 'バラード', cinematic: 'シネマ', cute: 'キュート', electro: 'エレクトロ', rock: 'ロック', washu: '和風' };
const MOOD_LABELS = { ballad: 'バラード', cinematic: 'シネマ', cute: 'キュート', electro: 'エレクトロ', rock: 'ロック', washu: '和風' };
const PRESET_LABELS = {
  pop: 'ポップ',
  cinematic: 'シネマティック',
  neon: 'ネオン',
  typewriter: 'タイプライター',
  glitch: 'グリッチ',
  karaoke: 'カラオケ',
  chrome: 'クローム',
  fire: 'ファイア',
  hologram: 'ホログラム',
  handwritten: '手書き',
  particleStorm: 'パーティクルストーム',
  circleBuild: 'サークルビルド',
  tategaki: '縦書き',
  achievementFanfare: '実績ファンファーレ',
  varietyBox: 'バラエティ箱',
  marker: 'マーカー',
  badgeDots: 'バッジドット',
  bubbleLetters: 'バブル文字',
  confetti: '紙吹雪',
  dashedFrame: '点線枠',
  typewriterCursor: 'カーソル付きタイプ',
};
const NOTES = {
  'fill.textureFill': '画像未設定でも手続きテクスチャで表示',
  'background.image': '画像未設定でも手続きパターンで表示',
  'background.cover': 'カバー元がない場合は単色',
  'background.card': 'カードテーマ未設定時は既定色',
  'location.badgeAnchored': 'バッジ未設定時は中央',
  'enter.morphFromPrevious': '前のキューの文字から変形',
};

// Part 2: setting changes that read as a different effect on screen
// (direction, order, formation, pattern, preset), not a slightly different number.
const VARIANTS = [
  ['animation', 'stagger', { order: 'rtl', each: 0.06 }, '右から順に'],
  ['animation', 'stagger', { order: 'center-out', each: 0.06 }, '中央から外へ'],
  ['animation', 'stagger', { order: 'edges-in', each: 0.06 }, '両端から中央へ'],
  ['animation', 'stagger', { order: 'random', each: 0.07 }, 'ランダム順'],
  ['animation', 'stagger', { order: 'oddEven', each: 0.08 }, '奇数偶数'],
  ['animation', 'stagger', { order: 'word', unit: 'word', each: 0.15 }, '単語ずつ'],
  ['animation', 'stagger', { order: 'strokeLength', each: 0.06 }, '画数順'],
  ['animation', 'stagger', { order: 'ltr', each: 0.02, exitOrder: 'reverse' }, '逆順で退場'],
  ['animation', 'echo', { count: 5, offset: 0.18, scale: 1.12, opacity: 0.5 }, '5重エコー'],
  ['animation', 'loop', { period: 0.6, yoyo: false }, '高速ループ'],
  ['animation', 'stopMotion', { fps: 5 }, 'コマ撮り5fps'],
  ['layout', 'row', { from: 'offscreenEdges' }, '画面外から集合'],
  ['layout', 'row', { from: 'corners' }, '四隅から集合'],
  ['layout', 'row', { from: 'point' }, '一点から展開'],
  ['layout', 'row', { from: 'ring' }, 'リングから整列'],
  ['layout', 'row', { from: 'depth' }, '奥から整列'],
  ['layout', 'row', { from: 'mirror' }, '鏡像から整列'],
  ['layout', 'row', { from: 'formation', fromFormation: 'circle' }, '円から横一列へ'],
  ['layout', 'row', { from: 'formation', fromFormation: 'scatter' }, '散布から横一列へ'],
  ['layout', 'row', { to: 'circle' }, '横一列から円へ'],
  ['layout', 'row', { to: 'wave' }, '横一列から波へ'],
  ['layout', 'row', { curve: 0.6, curveDir: 'alternate' }, '交互カーブ'],
  ['layout', 'vertical', { from: 'offscreenEdges' }, '縦組み・画面外から'],
  ['layout', 'vertical', { to: 'row' }, '縦組みから横組みへ'],
  ['layout', 'circle', { from: 'point' }, '円・一点から'],
  ['layout', 'circle', { to: 'spiral' }, '円から渦巻きへ'],
  ['layout', 'arc', { from: 'depth' }, '円弧・奥から'],
  ['layout', 'spiral', { from: 'formation', fromFormation: 'row' }, '横一列から渦巻きへ'],
  ['layout', 'wave', { to: 'staircase' }, '波から階段へ'],
  ['layout', 'diagonal', { from: 'corners' }, '斜め・四隅から'],
  ['layout', 'staircase', { from: 'mirror' }, '階段・鏡像から'],
  ['layout', 'grid', { from: 'ring' }, 'グリッド・リングから'],
  ['layout', 'stackedWords', { to: 'arc' }, '積み重ねから円弧へ'],
  ['layout', 'scatter', { to: 'row' }, '散布から整列'],
  ['layout', 'path', { from: 'offscreenEdges' }, 'パス・画面外から'],
  ['enter', 'slide', { dir: 'down', distance: 0.5 }, '上から大きく'],
  ['enter', 'slide', { dir: 'left', distance: 0.5 }, '右から大きく'],
  ['enter', 'slide', { dir: 'right', distance: 0.5 }, '左から大きく'],
  ['enter', 'typewriter', { cursor: true, cursorShape: 'block', cursorAfter: 'stay' }, 'ブロックカーソル'],
  ['enter', 'typewriter', { cursor: true, cursorShape: 'underscore', cursorAfter: 'blink' }, '下線カーソル'],
  ['enter', 'scramble', { charset: 'katakana' }, 'カタカナ'],
  ['enter', 'scramble', { charset: 'digits' }, '数字'],
  ['enter', 'scramble', { charset: 'symbols' }, '記号'],
  ['enter', 'flip3D', { axis: 'y', angle: 180 }, 'Y軸180度'],
  ['enter', 'rotateIn', { angle: -180 }, '逆回転180度'],
  ['enter', 'zoomIn', { from: 0 }, 'ゼロから'],
  ['enter', 'dropBounce', { height: 1 }, '画面上端から'],
  ['enter', 'scatterIn', { spread: 0.6 }, '広範囲から'],
  ['exit', 'slide', { dir: 'up', distance: 0.6 }, '上へ'],
  ['exit', 'slide', { dir: 'left', distance: 0.6 }, '左へ'],
  ['exit', 'slide', { dir: 'right', distance: 0.6 }, '右へ'],
  ['exit', 'wipe', { dir: 'right' }, '右へワイプ'],
  ['exit', 'wipe', { dir: 'up' }, '上へワイプ'],
  ['exit', 'wipe', { dir: 'down' }, '下へワイプ'],
  ['exit', 'zoomOut', { to: 0 }, '点まで縮小'],
  ['exit', 'explode', { spread: 1.2 }, '大爆発'],
  ['hold', 'floatBob', { amp: 0.05, speed: 1 }, '大きく浮遊'],
  ['hold', 'sway', { angle: 8 }, '大きく揺れる'],
  ['hold', 'twist', { angle: 30 }, '強いねじれ'],
  ['hold', 'drift', { vx: 0.2, vy: -0.1 }, '斜めに流れる'],
  ['hold', 'kenBurns', { zoom: 0.35 }, '強いズーム'],
  ['hold', 'jelly', { amount: 0.25 }, '強いゼリー'],
  ['fill', 'rainbowFlow', { perLetter: true }, '文字ごとの虹'],
  ['edge', 'outline', { pattern: 'dashed', width: 5 }, '破線'],
  ['edge', 'outline', { pattern: 'dotted', width: 6 }, '点線'],
  ['edge', 'outline', { pattern: 'double', width: 5 }, '二重線'],
  ['edge', 'outline', { pattern: 'sketch', width: 4 }, 'スケッチ線'],
  ['edge', 'neonGlow', { radius: 30, intensity: 1.6 }, '強い発光'],
  ['edge', 'extrude', { depth: 30 }, '深い押し出し'],
  ['post', 'mirror', { axis: 'y' }, '上下ミラー'],
  ['post', 'sparkles', { shape: 'star' }, '星のきらめき'],
  ['post', 'sparkles', { shape: 'heart' }, 'ハートのきらめき'],
  ['background', 'pattern', { mode: 'dots' }, 'ドット'],
  ['background', 'pattern', { mode: 'stripes' }, 'ストライプ'],
  ['background', 'pattern', { mode: 'rings' }, 'リング'],
  ['background', 'shapes', { kind: 'particles' }, 'パーティクル'],
  ['background', 'shapes', { kind: 'waveform' }, '波形'],
  ['background', 'shapes', { kind: 'spectrum' }, 'スペクトラム'],
  ['background', 'shapes', { kind: 'sineWave' }, 'サイン波'],
  ['background', 'shapes', { kind: 'progress' }, 'プログレス'],
  ['background', 'shapes', { set: 'polygons' }, '多角形'],
  ['background', 'shapes', { set: 'lines' }, 'ライン'],
  ['background', 'shapes', { set: 'burst' }, 'バースト'],
  ['background', 'shapes', { set: 'grid' }, 'グリッド図形'],
  ['background', 'shapes', { set: 'orbit' }, '軌道'],
  ['bgShape', 'rounded', { layer: 'front', knockout: true, opacity: 1 }, '前面・くり抜き'],
  ['bgShape', 'circle', { layer: 'front', knockout: true, opacity: 1 }, '円の前面くり抜き'],
  ['bgShape', 'star', { width: 1.6, height: 1.6, rotation: 15 }, '大きな傾き星'],
  ['bgShape', 'square', { rotation: 45, width: 0.95, height: 0.95 }, '45度の菱形タイル'],
  ['bgMotion', 'follow', { hold: 'pulse', holdAmount: 0.6 }, '脈動'],
  ['bgMotion', 'follow', { hold: 'wobble', holdAmount: 0.6 }, 'ぐらつき'],
  ['bgMotion', 'follow', { hold: 'spin', holdAmount: 0.6 }, '回転し続ける'],
  ['bgMotion', 'follow', { hold: 'beat', holdAmount: 0.6 }, 'ビート'],
  ['bgMotion', 'follow', { hold: 'heartbeat', holdAmount: 0.6 }, '鼓動'],
  ['bgMotion', 'follow', { hold: 'shiver', holdAmount: 0.6 }, '震え'],
  ['bgMotion', 'follow', { hold: 'drift', holdAmount: 0.6 }, '漂う'],
  ['bgMotion', 'wipe', { dir: 'up' }, '下から上へ'],
  ['bgMotion', 'grow', { axis: 'y' }, '縦に伸びる'],
  ['bgMotion', 'stamp', { from: 2.6 }, '大きなスタンプ'],
  ['repeat', 'stackV', { variationPreset: 'perspectiveFade', copies: 3 }, '遠近フェード'],
  ['repeat', 'rowH', { variationPreset: 'popAlternate', copies: 3 }, '交互ポップ'],
  ['repeat', 'grid', { variationPreset: 'ransomNote', copies: 'many' }, '脅迫状風'],
  ['repeat', 'diagonal', { variationPreset: 'heroOutline', copies: 3 }, '主役アウトライン'],
  ['repeat', 'fan', { variationPreset: 'rainbowStep', copies: 'many' }, '虹色ステップ'],
  ['repeat', 'tunnel', { variationPreset: 'loudQuiet', copies: 'many' }, '強弱'],
  ['repeat', 'stackV', { sequence: 'counterSlide', copies: 3, dir: 'both' }, '逆方向スライド'],
  ['repeat', 'rowH', { sequence: 'counterScroll', copies: 'many', dir: 'both', fit: 'overflow' }, '逆スクロール'],
  ['repeat', 'radial', { sequence: 'wave', copies: 'many', dir: 'tangent' }, '円周ウェーブ'],
  ['repeat', 'brick', { sequence: 'static', copyOpacity: 'fade' }, '静止フェード'],
  ['repeat', 'scatter', { copies: 'many', var1Attr: 'size', var1Rule: 'random', var1Level: 'strong' }, 'サイズばらばら'],
  ['repeat', 'fill', { var1Attr: 'color', var1Rule: 'alternate', var1Level: 'strong' }, '交互色'],
  ['repeat', 'stackV', { copies: 'many', var1Attr: 'font', var1Rule: 'random' }, '書体ばらばら'],
  ['repeat', 'rowH', { copies: 3, var1Attr: 'decor', var1Rule: 'oddOne', var1Level: 'strong' }, '一つだけ装飾'],
  ['repeat', 'tunnel', { dir: 'up', copies: 'many', seqSpeed: 'slow' }, '上へ伸びるトンネル'],
  ['repeat', 'fan', { dir: 'wide', copies: 'many' }, '広い扇'],
  ['repeat', 'diagonal', { dir: 'upRight', copies: 'many', seqOrder: 'toMain' }, '右上へ集まる'],
  ['repeat', 'grid', { copies: 'many', var1Attr: 'color', var1ColorMode: 'light', var1Rule: 'progress', var2Attr: 'size', var2Rule: 'progress' }, '明度とサイズの段階'],
  ['location', 'custom', { x: 0.25, y: 0.3 }, '左上寄せ'],
  ['location', 'custom', { x: 0.72, y: 0.72 }, '右下寄せ'],
];

// supporting-kit pools: [value, weight]; optional slots are switched off in drawKit
// (hold/edge/post/bgShape/repeat/bgMotion pools are filled from the registry below)
const POOLS = {
  animation: [
    [{ type: 'stagger', params: { order: 'ltr' } }, 3],
    [{ type: 'stagger', params: { order: 'rtl' } }, 1],
    [{ type: 'stagger', params: { order: 'center-out' } }, 1],
    [{ type: 'stagger', params: { order: 'edges-in' } }, 1],
    [{ type: 'stagger', params: { order: 'random' } }, 1],
    [{ type: 'simultaneous' }, 1.5],
    [{ type: 'cascade' }, 1],
    [{ type: 'spring' }, 1],
    [{ type: 'followThrough' }, 0.7],
  ],
  layout: [
    [{ type: 'row' }, 10],
    [{ type: 'row', params: { from: 'offscreenEdges' } }, 0.7],
    [{ type: 'row', params: { from: 'point' } }, 0.7],
    [{ type: 'row', params: { from: 'depth' } }, 0.7],
    [{ type: 'row', params: { curve: 0.4 } }, 0.7],
    [{ type: 'vertical' }, 0.8],
    [{ type: 'arc' }, 0.8],
    [{ type: 'wave' }, 0.8],
    [{ type: 'diagonal' }, 0.6],
    [{ type: 'staircase' }, 0.6],
    [{ type: 'circle' }, 0.6],
    [{ type: 'stackedWords' }, 0.4],
    [{ type: 'scatter' }, 0.4],
  ],
  location: [
    [{ type: 'center' }, 8],
    [{ type: 'lowerThird' }, 1.5],
    [{ type: 'upperThird' }, 1.2],
  ],
  background: [
    [{ type: 'solid' }, 1],
    [{ type: 'gradient' }, 1.6],
    [{ type: 'noiseGradient' }, 1.4],
    [{ type: 'pattern' }, 2.2],
    [{ type: 'shapes', params: { set: 'circles' } }, 0.5],
    [{ type: 'shapes', params: { set: 'polygons' } }, 0.5],
    [{ type: 'shapes', params: { set: 'orbit' } }, 0.4],
    [{ type: 'shapes', params: { kind: 'particles' } }, 0.5],
  ],
};
// types the supporting kit never picks on its own (they need data the demo
// project lacks, or they are too disruptive to sit under another headline)
const KIT_SKIP = {
  enter: new Set(['morphFromPrevious']),
  exit: new Set([]),
  hold: new Set(['none', 'marquee', 'pathFollow']),
  fill: new Set(['categoryColor', 'textureFill']),
  edge: new Set([]),
  post: new Set(['kaleidoscope', 'mirror', 'noiseDissolve', 'directionalDissolve', 'pixelDissolve', 'burnDissolve', 'halftoneDissolve', 'particleDissolve', 'pixelSort', 'displacementMap', 'digitalNoise']),
  bgShape: new Set(['none']),
  bgMotion: new Set(['none']),
  repeat: new Set(['none']),
};
for (const group of ['enter', 'exit', 'hold', 'fill', 'edge', 'post', 'bgShape', 'repeat', 'bgMotion']) {
  POOLS[group] = [];
  for (const descriptor of fx.list(group)) {
    if (KIT_SKIP[group] && KIT_SKIP[group].has(descriptor.type)) continue;
    POOLS[group].push([{ type: descriptor.type }, group === 'fill' && descriptor.type === 'solid' ? 3 : 1]);
  }
}

const ENTER_MOTIONS = [
  { duration: 0.6, ease: 'cubicOut' },
  { duration: 0.9, ease: 'quartOut' },
  { duration: 1.1, ease: 'backOut' },
  { duration: 0.8, ease: 'expoOut' },
  { duration: 1.2, ease: 'elasticOut' },
  { duration: 0.7, ease: 'bounceOut' },
];
const EXIT_MOTIONS = [
  { duration: 0.45, ease: 'cubicIn' },
  { duration: 0.6, ease: 'quartIn' },
  { duration: 0.5, ease: 'backIn' },
  { duration: 0.4, ease: 'expoIn' },
];
const SLOT_WEIGHTS = {
  enter: 2,
  exit: 1.2,
  hold: 1.2,
  fill: 1.5,
  edge: 1.3,
  post: 1.3,
  layout: 1.5,
  location: 0.7,
  animation: 0.6,
  bgShape: 1.3,
  repeat: 1.6,
  background: 0.8,
  font: 0.8,
  size: 1.2,
  color: 0.9,
  palette: 0.7,
};

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function typeLabel(group, type) {
  const base = fx.baseOf(group);
  const table = strings.ja && strings.ja.fx ? strings.ja.fx[base] : null;
  return (table && table[type]) || type;
}

function valueLabel(key) {
  const table = strings.ja && strings.ja.fx ? strings.ja.fx.value : null;
  return (table && table[key]) || key;
}

function weightedPick(random, items) {
  let total = 0;
  for (const item of items) total += item[1];
  let at = random() * total;
  for (const item of items) {
    at -= item[1];
    if (at <= 0) return item[0];
  }
  return items[items.length - 1][0];
}

function slotKey(value) {
  if (!value) return 'none';
  const params = value.params ? Object.keys(value.params).sort().map((key) => `${key}=${JSON.stringify(value.params[key])}`).join(',') : '';
  return params ? `${value.type}(${params})` : value.type;
}

function instanceOf(group, spec, motion) {
  const instance = fx.withDefaults({ type: spec.type, params: clone(spec.params || {}) }, group);
  if (motion) instance.motion = { ...instance.motion, ...clone(motion) };
  return instance;
}

// ---------------------------------------------------------------------------
// headlines

function headlineList(total) {
  const limit = Number.isFinite(total) && total > 0 ? Math.floor(total) : TOTAL;
  const list = [];
  for (const group of HEADLINE_GROUPS) {
    for (const descriptor of fx.list(group)) {
      if (descriptor.type === 'none' && group !== 'hold' && group !== 'background') continue;
      if (group === 'hold' && descriptor.type === 'none') continue;
      if (group === 'bgMotion' && descriptor.type === 'none') continue;
      const params = group === 'location' && descriptor.type === 'custom' ? { x: 0.5, y: 0.35 } : {};
      list.push({ part: 'type', group, type: descriptor.type, params, name: typeLabel(group, descriptor.type), tag: '' });
    }
  }
  for (const [group, type, params, tag] of VARIANTS) {
    list.push({ part: 'variant', group, type, params, name: typeLabel(group, type), tag });
  }
  for (const preset of presets.list()) {
    list.push({ part: 'preset', group: 'preset', type: preset.id, params: {}, name: PRESET_LABELS[preset.id] || preset.id, tag: '', style: preset.style });
  }
  let seed = 1;
  while (list.length < limit) {
    const index = list.filter((item) => item.part === 'genre').length;
    const genre = GENRES[index % GENRES.length];
    const round = Math.floor(index / GENRES.length);
    if (round % 2 === 1 && moods.PRESETS[index % moods.PRESETS.length] && index % GENRES.length < moods.PRESETS.length) {
      const mood = moods.PRESETS[index % moods.PRESETS.length];
      list.push({ part: 'genre', group: 'mood', type: mood.id, params: {}, name: `ムード: ${MOOD_LABELS[mood.id] || mood.id}`, tag: `#${round + 1}`, mood, seed });
    } else {
      list.push({ part: 'genre', group: 'genre', type: genre, params: {}, name: `ジャンル: ${GENRE_LABELS[genre] || genre}`, tag: `#${round + 1}`, genre, seed });
    }
    seed += 1;
  }
  return list.slice(0, limit);
}

// ---------------------------------------------------------------------------
// kits

function paletteFor(n) {
  const genre = GENRES[(n * 7) % GENRES.length];
  const axes = moods.randomAxes ? moods.randomAxes(rng.rngFor(SEED, 'axes', n)) : null;
  const generated = moods.generate({
    genre: n % 3 === 0 ? genre : null,
    axes: n % 3 === 0 ? null : axes,
    seed: SEED + n * 31,
    context: { cjk: true, letterCount: 8 },
  });
  const colorSet = clone(generated.style.color);
  // the text itself uses a readable tone (2 text, 3/5 accents), never a backdrop or shadow tone
  if (colorSet.fill && colorSet.fill.kind === 'palette' && ![2, 3, 5].includes(colorSet.fill.index)) colorSet.fill = { kind: 'palette', index: 2 };
  return { palette: generated.style.palette, color: colorSet };
}

// a dark palette for kit demos: most fills and edges (chrome, glass, glow,
// gold...) are bright, so light backdrops would swallow them. `avoid` is the
// palette of the demo before it: a re-roll is taken so a neighbour never shows
// the same background colour family.
function darkPaletteFor(n, avoid) {
  let colors = paletteFor(n);
  for (let k = 1; (isLight(colors.palette.colors[0]) || (avoid && colors.palette.name === avoid)) && k < 40; k += 1) {
    colors = paletteFor(n + k * 1000);
  }
  return colors;
}

function isLight(hex) {
  const rgba = color.parse(hex || '#000000');
  return color.relativeLuminance(rgba) > 0.35;
}

function backgroundClip(input, palette, headline, variantIndex) {
  const colors = (palette && palette.colors) || [];
  // pattern and shapes draw over the dark studio backdrop: a light palette
  // (dark text) needs a backdrop painted in its own colours instead
  // (a background headline keeps its type; its demo gets a dark palette instead)
  const spec = !headline && (input.type === 'pattern' || input.type === 'shapes') && isLight(colors[0]) ? { type: 'noiseGradient' } : input;
  const params = clone(spec.params || {});
  if (spec.type === 'solid' && params.color == null) params.color = colors[0] || '#101018';
  if ((spec.type === 'gradient' || spec.type === 'noiseGradient') && params.colors == null) {
    params.colors = [colors[0] || '#101018', colors[1] || colors[4] || '#202838'];
  }
  if ((spec.type === 'pattern' || spec.type === 'shapes') && params.color == null) params.color = colors[3] || '#4d8dff';
  if (spec.type === 'pattern') {
    if (headline) {
      // a headline demo keeps the mode it demonstrates and the effect defaults
      // (the variants only decorate supporting backgrounds)
      if (params.count == null) params.count = 24;
      if (params.size == null) params.size = 1;
      if (params.speed == null) params.speed = 0.4;
    } else if (Number.isFinite(variantIndex)) {
      // every demo gets its own mode/size/count step from the pattern library,
      // so a 400/800 demo run never shows the same tiling twice
      const variant = patternVariants.at(variantIndex);
      params.mode = variant.mode;
      params.count = variant.count;
      params.size = variant.size;
      params.speed = variant.speed;
      params.opacity = variant.opacity;
    }
  }
  return { type: spec.type, params };
}

// draw a supporting kit; `usage` balances type counts across the catalog
function drawKit(random, usage, size) {
  const pick = (group) => {
    const pool = POOLS[group];
    const items = pool.map(([value, weight]) => {
      const used = usage[group] ? usage[group].get(slotKey(value)) || 0 : 0;
      return [value, value ? weight / (1 + used * 0.9) : weight];
    });
    return clone(weightedPick(random, items));
  };
  const optional = (group, chance) => (random() < chance ? pick(group) : null);
  const kit = {
    animation: pick('animation'),
    layout: pick('layout'),
    location: pick('location'),
    enter: pick('enter'),
    exit: pick('exit'),
    hold: optional('hold', 0.6),
    fill: pick('fill'),
    edge: optional('edge', 0.55),
    post: optional('post', 0.45),
    bgShape: optional('bgShape', 0.22),
    bgMotion: null,
    repeat: optional('repeat', 0.1),
    background: pick('background'),
    font: FONTS[Math.floor(random() * FONTS.length)],
    size: Number.isFinite(size) ? size : SIZE_STOPS[0],
    enterMotion: ENTER_MOTIONS[Math.floor(random() * ENTER_MOTIONS.length)],
    exitMotion: EXIT_MOTIONS[Math.floor(random() * EXIT_MOTIONS.length)],
  };
  // at most MAX_EXTRAS decorations, so the headline stays readable
  const extras = ['hold', 'edge', 'post', 'bgShape', 'repeat'].filter((group) => kit[group]);
  while (extras.length > MAX_EXTRAS) kit[extras.splice(Math.floor(random() * extras.length), 1)[0]] = null;
  if (kit.bgShape) kit.bgMotion = pick('bgMotion');
  return kit;
}

// put the headline into the kit and repair combinations that fight each other
function applyHeadline(kit, headline, random) {
  const spec = { type: headline.type, params: clone(headline.params || {}) };
  const group = headline.group;
  if (group === 'bgFill' || group === 'bgEdge') {
    kit[group] = spec;
    if (!kit.bgShape) kit.bgShape = { type: ['rounded', 'square', 'circle', 'blob', 'paper'][Math.floor(random() * 5)] };
    if (!kit.bgMotion) kit.bgMotion = { type: 'follow' };
  } else if (group === 'bgMotion') {
    kit.bgMotion = spec;
    if (!kit.bgShape) kit.bgShape = { type: ['rounded', 'circle', 'diamond', 'star', 'heart'][Math.floor(random() * 5)] };
  } else if (group === 'bgShape') {
    kit.bgShape = spec;
    if (!kit.bgMotion) kit.bgMotion = { type: 'follow' };
  } else {
    kit[group] = spec;
  }
  if (group === 'animation' && headline.type !== 'stagger' && headline.type !== 'simultaneous') {
    // timing-shaped animations only read with a per-letter enter
    if (['fade', 'typewriter', 'strokeDrawOn', 'noiseDissolveIn', 'morphFromPrevious'].includes(kit.enter.type)) kit.enter = { type: 'slide', params: { dir: 'up', distance: 0.3 } };
  }
  const layoutType = kit.layout ? kit.layout.type : 'row';
  const plainRow = layoutType === 'row' && !(kit.layout.params && (kit.layout.params.to || kit.layout.params.from));
  if (kit.repeat) {
    if (group !== 'layout') kit.layout = { type: 'row' };
    else kit.repeat = null;
    if (kit.repeat) {
      if (group !== 'location') kit.location = { type: 'center' };
      if (group !== 'bgShape' && group !== 'bgFill' && group !== 'bgEdge' && group !== 'bgMotion') {
        kit.bgShape = null;
        kit.bgMotion = null;
      }
    }
  }
  if (!plainRow && kit.layout && layoutType !== 'vertical' && group !== 'location') kit.location = { type: 'center' };
  if (group === 'location' && !plainRow) kit.layout = { type: 'row' };
  if (group === 'location' && kit.repeat) kit.repeat = null;
  if (group === 'background' && headline.type === 'none') kit.background = { type: 'none' };
  return kit;
}

function kitSignature(kit, paletteName) {
  return {
    enter: slotKey(kit.enter),
    exit: slotKey(kit.exit),
    hold: slotKey(kit.hold),
    fill: slotKey(kit.fill),
    edge: kit.edge ? slotKey(kit.edge) : kit.bgEdge ? `bg:${slotKey(kit.bgEdge)}` : 'none',
    post: slotKey(kit.post),
    layout: slotKey(kit.layout),
    location: slotKey(kit.location),
    animation: slotKey(kit.animation),
    bgShape: kit.bgShape ? `${slotKey(kit.bgShape)}/${slotKey(kit.bgMotion)}/${slotKey(kit.bgFill)}` : 'none',
    repeat: slotKey(kit.repeat),
    background: slotKey(kit.background),
    font: kit.font,
    size: kit.size == null ? 'none' : String(kit.size),
    color: kit.color || 'none',
    palette: paletteName || '',
  };
}

function styleSignature(style, clip) {
  const first = (list) => (Array.isArray(list) && list.length ? list[0] : null);
  const kit = {
    enter: style.enter,
    exit: style.exit,
    hold: first(style.hold),
    fill: style.fill,
    edge: first(style.edge),
    bgEdge: first(style.bgEdge),
    post: first(style.post),
    layout: style.layout,
    location: style.location,
    animation: style.animation,
    bgShape: style.bgShape && style.bgShape.type !== 'none' ? style.bgShape : null,
    bgMotion: style.bgMotion,
    bgFill: style.bgFill,
    repeat: style.repeat && style.repeat.type !== 'none' ? style.repeat : null,
    background: clip,
    font: style.text && style.text.fontId,
    size: style.text && style.text.size,
    color: colorValueKey(style.color && style.color.fill),
  };
  const groups = { edge: 'edge', bgEdge: 'bgEdge', hold: 'hold', post: 'post', background: 'background' };
  const strip = (key, value) => {
    if (value == null) return null;
    if (typeof value !== 'object') return value;
    return value.type ? { type: value.type, params: signatureParams(groups[key] || key, value.type, value.params) } : value;
  };
  for (const key of Object.keys(kit)) if (key !== 'font' && key !== 'size' && key !== 'color') kit[key] = strip(key, kit[key]);
  return kitSignature(kit, style.palette && style.palette.name);
}

// only the parameters that change the look enough to count as another demo,
// and only when they differ from the type's defaults
const SIGNATURE_PARAMS = ['order', 'unit', 'from', 'fromFormation', 'to', 'curve', 'dir', 'axis', 'charset', 'cursorShape', 'pattern', 'shape', 'mode', 'kind', 'set', 'layer', 'knockout', 'hold', 'variationPreset', 'sequence', 'copies', 'var1Attr', 'perLetter', 'x', 'y'];

function signatureParams(group, type, params) {
  const defaults = fx.paramDefaults(group, type);
  const out = {};
  for (const key of SIGNATURE_PARAMS) {
    if (!params || params[key] === undefined) continue;
    if (JSON.stringify(params[key]) === JSON.stringify(defaults[key])) continue;
    out[key] = params[key];
  }
  return Object.keys(out).length ? out : undefined;
}

function distance(a, b) {
  let total = 0;
  for (const key of Object.keys(SLOT_WEIGHTS)) if (a[key] !== b[key]) total += SLOT_WEIGHTS[key];
  return total;
}

function kitStyle(kit, colors) {
  const style = {
    palette: clone(colors.palette),
    color: clone(colors.color),
    text: { fontId: kit.font, size: kit.size },
    animation: instanceOf('animation', kit.animation),
    layout: instanceOf('layout', kit.layout),
    location: instanceOf('location', kit.location),
    enter: instanceOf('enter', kit.enter, { in: { ...kit.enterMotion, delay: 0 } }),
    exit: instanceOf('exit', kit.exit, { out: { ...kit.exitMotion, delay: 0 } }),
    fill: instanceOf('fill', kit.fill),
    hold: kit.hold ? [instanceOf('hold', kit.hold)] : [],
    edge: kit.edge ? [instanceOf('edge', kit.edge)] : [],
    post: kit.post ? [instanceOf('post', kit.post)] : [],
    repeat: kit.repeat ? instanceOf('repeat', kit.repeat) : { type: 'none', params: {}, enabled: true },
  };
  if (kit.bgShape) {
    style.bgShape = instanceOf('bgShape', { type: kit.bgShape.type, params: { opacity: 0.92, fgAutoContrast: true, ...(kit.bgShape.params || {}) } });
    style.bgMotion = instanceOf('bgMotion', kit.bgMotion || { type: 'follow' });
    style.bgFill = instanceOf('bgFill', kit.bgFill || { type: 'solid' });
    style.bgEdge = kit.bgEdge ? [instanceOf('bgEdge', kit.bgEdge)] : [];
  } else {
    style.bgShape = { type: 'none', params: {}, enabled: true };
    style.bgEdge = [];
  }
  return style;
}

// full-style headlines (presets, genre and mood looks) keep their own design;
// the kit only supplies what the style leaves open
function wholeStyle(headline, kit, colors, attempt, variantIndex) {
  let style;
  let genre = null;
  if (headline.group === 'preset') {
    style = clone(headline.style);
  } else {
    genre = headline.genre || null;
    const generated = moods.generate({
      genre,
      axes: headline.mood ? headline.mood.axes : null,
      direction: headline.mood ? headline.mood.direction : null,
      seed: SEED + headline.seed * 101 + (attempt || 0) * 7919,
      context: { cjk: true, letterCount: 8 },
      ensureSignature: true,
    });
    style = clone(generated.style);
  }
  let clip = null;
  if (style.background && style.background.type && style.background.type !== 'none') {
    clip = { type: style.background.type, params: clone(style.background.params || {}) };
  }
  delete style.background;
  if (!style.palette) style.palette = clone(colors.palette);
  if (!style.color) style.color = clone(colors.color);
  const fontId = style.text && style.text.fontId;
  style.text = { ...(style.text || {}), fontId: FONTS.includes(fontId) ? fontId : kit.font };
  if (!style.text.size) style.text.size = kit.size;
  for (const group of ['hold', 'edge', 'post']) if (!Array.isArray(style[group])) style[group] = [];
  if (!style.enter) style.enter = instanceOf('enter', kit.enter, { in: { ...kit.enterMotion, delay: 0 } });
  if (!style.exit) style.exit = instanceOf('exit', kit.exit, { out: { ...kit.exitMotion, delay: 0 } });
  if (!style.layout) style.layout = instanceOf('layout', { type: 'row' });
  if (!style.location) style.location = instanceOf('location', { type: 'center' });
  if (!style.fill) style.fill = instanceOf('fill', { type: 'solid' });
  if (!style.animation) style.animation = instanceOf('animation', kit.animation);
  if (!style.bgShape) style.bgShape = { type: 'none', params: {}, enabled: true };
  if (!style.repeat) style.repeat = { type: 'none', params: {}, enabled: true };
  return { style, clip: clip || backgroundClip(kit.background, style.palette, false, variantIndex), genre };
}

// the demo text is a full caption: pull the formations that reach past the
// frame at their default size back inside it. The size itself comes from the
// stepped ladder (sizeStepFor) so every demo is clearly bigger or smaller than
// its neighbour; a cap falls back to the largest ladder step that fits instead
// of a free value, which would flatten the steps again.
function capSize(size, cap) {
  if (size <= cap) return size;
  let best = SIZE_STOPS[0];
  for (const stop of SIZE_STOPS) if (stop <= cap) best = stop;
  return best;
}

function sizeStepFor(n) {
  const index = ((n % SIZE_STOPS.length) * SIZE_STRIDE) % SIZE_STOPS.length;
  return SIZE_STOPS[index];
}

// the ladder step, capped for formations that need small text; when the cap
// would make two neighbours look the same size, step one ladder rung down
function keptSize(n, cap, previousSize) {
  let size = capSize(sizeStepFor(n), cap);
  if (previousSize && size === previousSize) {
    const smaller = SIZE_STOPS.filter((stop) => stop < size).pop();
    if (smaller != null) size = smaller;
  }
  return size;
}

function keepOnScreen(style, n, previousSize) {
  const layout = style.layout;
  style.text = style.text || {};
  if (layout && layout.type === 'arc' && !(layout.params && layout.params.radius < 0.4)) layout.params = { ...(layout.params || {}), radius: 0.36 };
  const side = style.location && (style.location.type === 'left' || style.location.type === 'right');
  const cap = layout && layout.type === 'vertical' ? 60 : side || (layout && layout.type !== 'row') ? 88 : SIZE_STOPS[SIZE_STOPS.length - 1];
  style.text.size = keptSize(n, cap, previousSize);
  if (layout && layout.type === 'vertical' && style.location && !['center', 'left', 'right', 'custom'].includes(style.location.type)) style.location = fx.withDefaults({ type: 'center' }, 'location');
}

// The text colour cycles through the palette's readable roles, so consecutive
// demos never show the same colour. Preset colours that are literal RGB values
// (a preset's identity) are left alone.
function applyFillStep(style, n) {
  const fill = style.color && style.color.fill;
  if (!fill || (fill.kind !== 'palette' && fill.kind !== 'gradient')) return;
  const step = FILL_STEPS[(n - 1) % FILL_STEPS.length];
  if (step.kind === 'palette') {
    style.color = { ...style.color, fill: { kind: 'palette', index: step.index } };
    return;
  }
  const angle = fill.kind === 'gradient' && Number.isFinite(fill.angle) ? fill.angle : (n * 47) % 360;
  style.color = { ...style.color, fill: { kind: 'gradient', type: 'linear', angle, stops: step.stops.map((paletteIndex) => ({ paletteIndex })) } };
}

function colorValueKey(value) {
  if (!value) return 'none';
  if (value.kind === 'palette') return `palette:${value.index == null ? 0 : value.index}`;
  if (value.kind === 'gradient') return `gradient:${(value.stops || []).map((stop) => (stop && stop.paletteIndex != null ? stop.paletteIndex : (stop && stop.color) || '?')).join('-')}`;
  if (value.kind === 'solid') return `solid:${value.value || ''}`;
  return value.kind || 'none';
}

// ---------------------------------------------------------------------------
// catalog

function buildCatalog(options) {
  const opts = options || {};
  const total = Number.isFinite(opts.total) && opts.total > 0 ? Math.floor(opts.total) : TOTAL;
  const headlines = headlineList(total);
  const usage = {};
  const bump = (group, value) => {
    if (!usage[group]) usage[group] = new Map();
    const key = slotKey(value);
    usage[group].set(key, (usage[group].get(key) || 0) + 1);
  };
  const signatures = [];
  const entries = [];
  let previousPalette = null;
  let previousSize = null;
  for (let i = 0; i < headlines.length; i += 1) {
    const n = i + 1;
    const headline = headlines[i];
    const size = sizeStepFor(n);
    const colors = darkPaletteFor(n, previousPalette);
    const random = rng.rngFor(SEED, 'fx400mix', n);
    let best = null;
    for (let attempt = 0; attempt < CANDIDATES; attempt += 1) {
      const kit = applyHeadline(drawKit(random, usage, size), headline, random);
      let built;
      if (headline.style || headline.part === 'genre') {
        built = wholeStyle(headline, kit, colors, attempt, n);
      } else {
        const style = kitStyle(kit, colors);
        const clip = headline.group === 'background'
          ? (headline.type === 'none' ? null : backgroundClip({ type: headline.type, params: headline.params }, colors.palette, true, n))
          : backgroundClip(kit.background, colors.palette, false, n);
        built = { style, clip };
      }
      keepOnScreen(built.style, n, previousSize);
      applyFillStep(built.style, n);
      const signature = styleSignature(built.style, built.clip);
      let nearest = Infinity;
      let sum = 0;
      for (const other of signatures) {
        const d = distance(signature, other);
        if (d < nearest) nearest = d;
        sum += d;
      }
      const previous = signatures.length ? distance(signature, signatures[signatures.length - 1]) : Infinity;
      const last = signatures[signatures.length - 1];
      const sameLead = last && last.enter === signature.enter && last.fill === signature.fill ? 1000 : 0;
      // generated looks: prefer seeds whose text colour does not depend on data the demo lacks
      const blind = built.style.fill && ['categoryColor', 'textureFill'].includes(built.style.fill.type) && headline.part === 'genre' ? 200 : 0;
      const score = Math.min(nearest, 30) * 10 + Math.min(previous, 30) * 3 + (signatures.length ? sum / signatures.length : 0) - sameLead - blind;
      if (!best || score > best.score) best = { kit, built, signature, score, nearest };
      // a generated look is one seed of the generator: a few seeds are enough to choose from
      if (headline.part === 'genre' && attempt >= 7) break;
    }
    for (const group of ['enter', 'exit', 'hold', 'fill', 'edge', 'post', 'bgShape', 'repeat', 'bgMotion', 'animation', 'layout', 'location', 'background']) {
      if (best.kit[group]) bump(group, best.kit[group]);
    }
    signatures.push(best.signature);
    entries.push(makeEntry(n, headline, best.built, best.signature));
    previousPalette = best.built.style.palette && best.built.style.palette.name;
    previousSize = best.built.style.text && best.built.style.text.size;
  }
  return {
    format: 'telopmotion-fx400mix',
    version: 1,
    seed: SEED,
    total: total,
    cueSeconds: CUE_SECONDS,
    parts: Object.keys(PART_LABELS).map((part) => ({ part, label: PART_LABELS[part], entries: entries.filter((entry) => entry.part === part).length })),
    effects: entries,
  };
}

function headlineTitle(headline) {
  if (headline.part === 'genre') return `${headline.name} ${headline.tag}`;
  if (headline.group === 'preset') return `プリセット: ${headline.name}`;
  const group = GROUP_LABELS[headline.group] || headline.group;
  return headline.tag ? `${group} / ${headline.name}（${headline.tag}）` : `${group} / ${headline.name}`;
}

function shortText(headline) {
  if (headline.part === 'genre') return headline.name.replace(/^.*: /, '') + headline.tag.replace('#', '');
  if (headline.group === 'preset') return `プリセット ${headline.name}`;
  const group = GROUP_LABELS[headline.group] || headline.group;
  if (headline.tag) return `${headline.name} ${headline.tag}`;
  return `${group} ${headline.name}`;
}

function colorLabel(value) {
  if (!value) return '';
  if (value.kind === 'palette') return COLOR_ROLE_LABELS[value.index] || `パレット${value.index}`;
  if (value.kind === 'gradient') {
    const stops = (value.stops || []).map((stop) => (stop && stop.paletteIndex != null ? COLOR_ROLE_LABELS[stop.paletteIndex] || `パレット${stop.paletteIndex}` : (stop && stop.color) || '?'));
    return `グラデ(${stops.join('→')})`;
  }
  if (value.kind === 'solid') return '単色';
  return value.kind || '';
}

function describeKit(style, clip) {
  const parts = [];
  const add = (label, value) => {
    if (value) parts.push(`${label}:${value}`);
  };
  add('登場', style.enter && typeLabel('enter', style.enter.type));
  add('退場', style.exit && typeLabel('exit', style.exit.type));
  add('保持', (style.hold || []).map((item) => typeLabel('hold', item.type)).join('+'));
  add('塗り', style.fill && typeLabel('fill', style.fill.type));
  add('縁', (style.edge || []).map((item) => typeLabel('edge', item.type)).join('+'));
  add('後処理', (style.post || []).map((item) => typeLabel('post', item.type)).join('+'));
  if (style.layout && style.layout.type !== 'row') add('配置', typeLabel('layout', style.layout.type));
  if (style.bgShape && style.bgShape.type !== 'none') add('文字背景', typeLabel('bgShape', style.bgShape.type));
  if (style.repeat && style.repeat.type !== 'none') add('リピート', style.repeat.type);
  if (clip && clip.type === 'pattern') {
    const params = clip.params || {};
    add('背景', `${typeLabel('background', clip.type)}(${valueLabel(params.mode || 'grid')} ${params.size}x${params.count})`);
  } else {
    add('背景', clip ? typeLabel('background', clip.type) : 'なし');
  }
  add('書体', style.text && style.text.fontId && style.text.fontId.replace(/-Regular$/, ''));
  add('サイズ', style.text && style.text.size);
  add('色', colorLabel(style.color && style.color.fill));
  return parts.join(' / ');
}

function makeEntry(n, headline, built, signature) {
  const key = headline.part === 'variant' ? `${headline.group}.${headline.type}.${slotKey({ type: '', params: headline.params })}` : `${headline.group}.${headline.type}`;
  const notes = NOTES[`${headline.group}.${headline.type}`] ? [NOTES[`${headline.group}.${headline.type}`]] : [];
  return {
    n,
    id: `${String(n).padStart(3, '0')}.${headline.part === 'genre' ? `${headline.group}.${headline.type}${headline.tag}` : key}`,
    part: headline.part,
    group: headline.group,
    type: headline.type,
    params: clone(headline.params),
    label: headlineTitle(headline),
    text: `${n} ${shortText(headline)}`,
    kit: describeKit(built.style, built.clip),
    notes,
    signature,
    style: built.style,
    clip: built.clip,
  };
}

// ---------------------------------------------------------------------------
// project

function srtTime(seconds) {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const rest = ms % 1000;
  const pad = (value, width) => String(value).padStart(width, '0');
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(rest, 3)}`;
}

function catalogSrt(catalog) {
  const blocks = catalog.effects.map((entry, index) => {
    const start = index * CUE_SECONDS;
    return `${index + 1}\n${srtTime(start)} --> ${srtTime(start + CUE_SECONDS)}\n${entry.text}\n`;
  });
  return `${blocks.join('\n')}`;
}

function applyEntry(doc, entry, cue) {
  // replace the background clip this cue owns (its start lies inside the cue);
  // the previous cue's clip bleeds into this one by the fade and must survive
  doc.clips = (doc.clips || []).filter((clip) => !(clip.trackId === 'bg' && clip.start >= cue.start - 1e-4 && clip.start <= cue.end - 1e-4));
  if (entry.clip && entry.clip.type && entry.clip.type !== 'none') {
    // the clip bleeds one fade past each edge so its fade-out overlaps the
    // next clip's fade-in: a cue switch never dips to the clear colour
    const fade = 0.15;
    doc.clips.push({
      id: project.nextClipId(doc, 'clip_bg'),
      trackId: 'bg',
      start: Math.max(0, cue.start - fade),
      end: cue.end + fade,
      spec: clone(entry.clip),
      opacity: 1,
      fadeIn: fade,
      fadeOut: fade,
      colors: null,
    });
  }
  doc.cueStyles[cue.id] = clone(entry.style);
  return doc;
}

function buildProject(catalog, srtText) {
  const parsed = srt.parse(srtText);
  const cues = parsed.cues.map((cue, index) => ({ ...cue, id: `mix_${String(index + 1).padStart(3, '0')}` }));
  if (cues.length !== catalog.effects.length) throw new Error(`SRT has ${cues.length} cues but the catalog has ${catalog.effects.length}`);
  const doc = project.create({});
  doc.meta.title = 'FX 400 MIX テキスト効果デモ';
  doc.meta.lang = 'ja';
  doc.script.cues = cues;
  doc.script.sourceName = 'fx400mix.srt';
  doc.style.text.fontId = 'NotoSansJP-Regular';
  textflow.apply(doc);
  for (let i = 0; i < catalog.effects.length; i += 1) applyEntry(doc, catalog.effects[i], cues[i]);
  return { project: doc, cues };
}

function catalogMarkdown(catalog) {
  const lines = [];
  lines.push('# FX 400 MIX テキスト効果デモ一覧');
  lines.push('');
  lines.push('`demo/fx400mix.telopmotion.json` のキュー n（`demo/fx400mix.srt`、1キュー3秒）に n 番のデモを割り当てています。');
  lines.push('各デモは「主役」の効果に、登場・退場・保持・塗り・縁取り・後処理・配置・文字背景・リピート・背景・書体・配色を組み合わせた完成形のルックです。');
  lines.push('組み合わせは全デモが互いに多くの要素で異なるように選ばれ、隣り合うデモはほぼ全要素が入れ替わります。');
  lines.push('');
  lines.push('| コマンド | 内容 |');
  lines.push('|---|---|');
  lines.push('| `node scripts/fx400mix.js build` | SRT・カタログ・プロジェクト・この一覧を再生成 |');
  lines.push('| `node scripts/fx400mix.js show 42` | 42番のスタイル定義を表示 |');
  lines.push('');
  for (const part of catalog.parts) lines.push(`- ${part.label}: ${part.entries} 件`);
  lines.push('');
  let lastPart = null;
  for (const entry of catalog.effects) {
    if (entry.part !== lastPart) {
      lastPart = entry.part;
      lines.push('');
      lines.push(`## ${PART_LABELS[entry.part]}`);
      lines.push('');
      lines.push('| No. | 主役 | 組み合わせ | 備考 |');
      lines.push('|---:|---|---|---|');
    }
    lines.push(`| ${entry.n} | ${entry.label} | ${entry.kit} | ${entry.notes.join('<br>')} |`);
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

function paths(options) {
  const opts = options || {};
  const dir = opts.dir || path.join(ROOT, 'demo');
  return {
    srt: path.join(dir, 'fx400mix.srt'),
    catalog: path.join(dir, 'fx400mix.catalog.json'),
    md: path.join(dir, 'fx400mix.md'),
    project: path.join(dir, 'fx400mix.telopmotion.json'),
  };
}

function build(options) {
  const out = paths(options);
  const catalog = buildCatalog();
  const srtText = catalogSrt(catalog);
  const built = buildProject(catalog, srtText);
  const migrated = project.migrate(JSON.parse(JSON.stringify(built.project)));
  if (!migrated.ok) throw new Error(`generated project did not migrate: ${migrated.error}`);
  writeFileIfChanged(out.srt, srtText);
  writeFileIfChanged(out.catalog, `${JSON.stringify(catalog, null, 2)}\n`);
  writeFileIfChanged(out.md, catalogMarkdown(catalog));
  writeFileIfChanged(out.project, `${JSON.stringify(built.project, null, 2)}\n`);
  return { catalog, built, paths: out };
}

function main(argv) {
  const command = argv[0] || 'help';
  try {
    if (command === 'build') {
      const result = build();
      const minimum = Math.min(...result.catalog.effects.map((entry, index) => {
        let nearest = Infinity;
        for (let j = 0; j < result.catalog.effects.length; j += 1) if (j !== index) nearest = Math.min(nearest, distance(entry.signature, result.catalog.effects[j].signature));
        return nearest;
      }));
      console.log(`catalog: ${result.paths.catalog} (${result.catalog.effects.length} demos, nearest pair distance ${minimum.toFixed(1)})`);
      console.log(`project: ${result.paths.project}`);
      console.log(`srt:     ${result.paths.srt}`);
      console.log(`index:   ${result.paths.md}`);
      return 0;
    }
    if (command === 'show' || command === 'list') {
      const catalog = JSON.parse(fs.readFileSync(paths().catalog, 'utf8'));
      if (command === 'show') {
        const n = Number.parseInt(argv[1], 10);
        const entry = catalog.effects.find((item) => item.n === n);
        if (!entry) throw new Error(`demo ${argv[1]} not found (1-${catalog.effects.length})`);
        console.log(JSON.stringify(entry, null, 2));
      } else {
        const at = argv.indexOf('--part');
        const part = at >= 0 ? argv[at + 1] : null;
        for (const entry of catalog.effects) if (!part || entry.part === part) console.log(`${entry.n}\t${entry.label}\t${entry.kit}`);
      }
      return 0;
    }
    console.log('usage: node scripts/fx400mix.js build | show <n> | list [--part type|variant|preset|genre]');
    return 0;
  } catch (error) {
    console.error(`fx400mix: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  SEED,
  TOTAL,
  MIN_DISTANCE,
  SLOT_WEIGHTS,
  SIZE_STOPS,
  FILL_STEPS,
  HEADLINE_GROUPS,
  sizeStepFor,
  headlineList,
  buildCatalog,
  catalogSrt,
  buildProject,
  distance,
  styleSignature,
  applyEntry,
  catalogMarkdown,
  build,
};
