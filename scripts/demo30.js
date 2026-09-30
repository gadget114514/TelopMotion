'use strict';

// DEMO 30: 30-second showcase reels for auditioning looks.
//
// Every reel mixes two ways of cutting a song: by mood (horror, refreshing,
// love song...) and by style (rock, alternative, ballad...). Each mood has a
// fixed recipe built for impact: a palette of saturated primaries, a heavy
// typeface at a large size, and a kit of energetic enter / hold / post effects
// so every scene keeps moving after it lands. The mood engine only supplies
// the parts a recipe leaves open (exit and its timing), seeded per scene, so
// the four reels share their moods but not their exact look.
//
//   node scripts/demo30.js build [--reels A,B]
//     writes demo/demo30-<reel>.srt and demo/demo30-<reel>.telopmotion.json
//   node scripts/demo30.js list
//     prints every reel's lineup

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
const requirePart = (relative) => require(path.join(ROOT, relative));

const fx = require(path.join(FX_DIR, 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg', 'vary', 'repeat']) {
  require(path.join(FX_DIR, `${name}.js`));
}
const project = requirePart('renderer/js/studio/project.js');
const srt = requirePart('renderer/js/srt.js');
const textflow = requirePart('renderer/js/lyrics/textflow.js');
const moods = requirePart('renderer/js/lyrics/moods.js');

// palette slots: 0/1 ground (background gradient), 2 text, 3 accent,
// 4 dark (stroke, shadow, extrude), 5 second accent, 6 spare
const P = (name, colors) => ({ id: `demo30_${name}`, name, colors });

// id → label, look, lyric lines. Effects are [type, params]; hold, edge and
// post stack every entry they list.
const MOODS = {
  horror: {
    label: 'ホラー',
    genre: 'horror',
    palette: P('blood', ['#000000', '#2a0000', '#ff1a1a', '#ffffff', '#000000', '#ff1a1a', '#550000']),
    font: 'DelaGothicOne-Regular',
    fill: ['solid'],
    enter: ['glitchIn'],
    hold: [['shiver', { amount: 0.02 }], ['jitter', { amp: 0.012 }]],
    edge: [['drip']],
    post: [['vhsTracking'], ['rgbShift']],
    lines: ['闇の奥で 誰かが呼ぶ', '振り向くな'],
  },
  fresh: {
    label: 'さわやか',
    axes: { speed: 0.6, energy: 0.6, softness: 0.5, density: 0.3, brightness: 0.95 },
    palette: P('sky', ['#0066ff', '#00ccff', '#ffffff', '#ffe600', '#003399', '#ffffff', '#00ccff']),
    font: 'RocknRollOne-Regular',
    fill: ['solid'],
    enter: ['dropBounce'],
    hold: [['floatBob', { amp: 0.03, speed: 0.8 }]],
    edge: [['dropShadow']],
    post: [['lensFlare'], ['sparkles', { shape: 'star', count: 30, size: 3 }]],
    lines: ['青空へ 走り出せ！', '夏が はじまる'],
  },
  love: {
    label: 'ラブソング',
    genre: 'love',
    palette: P('hotpink', ['#ff0066', '#ff3399', '#ffffff', '#ffe600', '#990033', '#ffffff', '#ff66cc']),
    font: 'RocknRollOne-Regular',
    fill: ['solid'],
    enter: ['elasticPop'],
    hold: [['heartbeat', { amount: 0.12, bpm: 110 }]],
    edge: [['outline', { width: 8, color: '#990033' }]],
    post: [['sparkles', { shape: 'heart', count: 36, size: 4 }]],
    lines: ['君が 大好き！', 'ずっと そばにいて'],
  },
  rock: {
    label: 'ロック',
    genre: 'rock',
    palette: P('amp', ['#000000', '#1a1a1a', '#ffe600', '#ff0000', '#000000', '#ff0000', '#ffffff']),
    font: 'DelaGothicOne-Regular',
    fill: ['solid'],
    enter: ['shatterRebuild'],
    hold: [['jitter', { amp: 0.015, rate: 16 }], ['pulse', { amount: 0.1, bpm: 150 }]],
    edge: [['longShadow']],
    post: [['chromaticAberration'], ['zoomBlur']],
    lines: ['叫べ！ 限界の先へ', '鳴らせ！'],
  },
  alternative: {
    label: 'オルタナティブ',
    axes: { speed: 0.65, energy: 0.8, softness: 0.25, density: 0.6, brightness: 0.3 },
    palette: P('acid', ['#0a0a0a', '#2b0033', '#39ff14', '#ff00ff', '#000000', '#ff00ff', '#39ff14']),
    font: 'DelaGothicOne-Regular',
    fill: ['solid'],
    enter: ['scramble'],
    hold: [['wobbleWarp', { amount: 0.1, speed: 1.2 }]],
    edge: [['extrude']],
    post: [['glitchSlice'], ['rgbShift']],
    lines: ['歪んだ世界で 僕は立つ', '答えなんて 要らない'],
  },
  ballad: {
    label: 'バラード',
    genre: 'ballad',
    palette: P('midnight', ['#000033', '#0033cc', '#ffffff', '#ffd700', '#000022', '#66ccff', '#ffd700']),
    font: 'NotoSerifJP-Regular',
    fill: ['solid'],
    enter: ['blurIn'],
    hold: [['breathing'], ['drift']],
    edge: [['neonGlow', { color: '#ffd700', radius: 8, intensity: 0.5 }]],
    post: [['sparkles', { shape: 'star', count: 40, size: 2.5 }], ['lightLeak']],
    lines: ['静かに 雪が降る夜', 'あの日の約束を'],
  },
  heartbreak: {
    label: '失恋',
    genre: 'heartbreak',
    palette: P('tears', ['#000022', '#0000cc', '#00e5ff', '#ffffff', '#000011', '#00e5ff', '#3366ff']),
    font: 'NotoSansJP-Bold',
    fill: ['solid'],
    enter: ['waveRise'],
    hold: [['sway', { amount: 0.06 }]],
    edge: [['neonGlow', { color: '#3366ff', radius: 8, intensity: 0.6 }]],
    post: [['echoTrail']],
    lines: ['さよならは 言えなかった', '涙が とまらない'],
  },
  party: {
    label: 'パーティー',
    genre: 'party',
    palette: P('disco', ['#ff00cc', '#6600ff', '#ffff00', '#00ffff', '#330066', '#ffffff', '#ff6600']),
    font: 'DelaGothicOne-Regular',
    fill: ['solid'],
    enter: ['elasticPop'],
    hold: [['jelly', { amount: 0.18, freq: 3 }], ['pulse', { amount: 0.1, bpm: 128 }]],
    edge: [['outline', { width: 8, color: '#330066' }]],
    post: [['shockwave'], ['sparkles', { shape: 'star', count: 48, size: 3 }]],
    lines: ['今夜は 踊り明かそう！', 'ボリューム上げて！'],
  },
  electro: {
    label: 'エレクトロ',
    genre: 'electro',
    palette: P('laser', ['#000000', '#001a4d', '#00ffff', '#ff00ff', '#000000', '#ff00ff', '#ffffff']),
    font: 'NotoSansJP-Bold',
    fill: ['solid'],
    enter: ['neonFlicker'],
    hold: [['pulse', { amount: 0.08, bpm: 128 }]],
    edge: [['neonGlow', { color: '#ff00ff', radius: 16 }]],
    post: [['rgbShift'], ['bloom']],
    lines: ['シグナルが 止まらない', '光になれ'],
  },
  cute: {
    label: 'キュート',
    genre: 'cute',
    palette: P('candy', ['#ffe600', '#ff99cc', '#e6005c', '#0099ff', '#ffffff', '#0099ff', '#ffffff']),
    font: 'RocknRollOne-Regular',
    fill: ['solid'],
    enter: ['elasticPop'],
    hold: [['jelly', { amount: 0.16 }], ['floatBob', { amp: 0.025 }]],
    edge: [['outline', { width: 8, color: '#ffffff' }]],
    post: [['sparkles', { shape: 'star', count: 40, size: 4 }]],
    lines: ['ときめき 120%！', 'きらきら 魔法'],
  },
  cinematic: {
    label: 'シネマ',
    genre: 'cinematic',
    palette: P('gold', ['#000000', '#1a1000', '#ffd700', '#ffffff', '#000000', '#ff9900', '#ffd700']),
    font: 'NotoSerifJP-Regular',
    fill: ['goldFoil'],
    enter: ['blurIn'],
    hold: [['kenBurns']],
    edge: [['dropShadow']],
    post: [['lensFlare'], ['godRays']],
    lines: ['物語は ここから', 'その先へ'],
  },
  washu: {
    label: '和風',
    genre: 'washu',
    palette: P('shu', ['#cc0000', '#660000', '#ffffff', '#ffd700', '#000000', '#ffd700', '#ffffff']),
    font: 'NotoSerifJP-Regular',
    vertical: true,
    fill: ['solid'],
    enter: ['strokeDrawOn'],
    hold: [['sway', { amount: 0.04 }]],
    edge: [['dropShadow']],
    post: [['sparkles', { shape: 'dot', count: 36, size: 3 }]],
    lines: ['花は散りても 風は吹く', '月夜に舞う'],
  },
  dreamy: {
    label: 'ドリーミー',
    axes: { speed: 0.35, energy: 0.35, softness: 0.9, density: 0.45, brightness: 0.7 },
    palette: P('galaxy', ['#3300cc', '#cc00ff', '#ffffff', '#00ffff', '#1a0066', '#ffff66', '#ff66ff']),
    font: 'ZenMaruGothic-Regular',
    fill: ['holographic'],
    enter: ['scatterIn'],
    hold: [['floatBob', { amp: 0.035, speed: 0.6 }]],
    edge: [['neonGlow', { color: '#00ffff', radius: 14, intensity: 0.8 }]],
    post: [['bloom'], ['sparkles', { shape: 'star', count: 44, size: 3 }]],
    lines: ['夢の中で また会おう', 'ふわり 星をかぞえて'],
  },
  punk: {
    label: 'パンク',
    axes: { speed: 1, energy: 1, softness: 0.05, density: 0.85, brightness: 0.6 },
    palette: P('riot', ['#ffe600', '#ff3300', '#000000', '#ff0000', '#ffffff', '#ff0000', '#000000']),
    font: 'DelaGothicOne-Regular',
    fill: ['solid'],
    enter: ['zoomIn'],
    hold: [['shiver', { amount: 0.03 }], ['pulse', { amount: 0.12, bpm: 180 }]],
    edge: [['outline', { width: 10, color: '#ffffff' }]],
    post: [['shockwave'], ['rgbShift']],
    lines: ['ぶっ壊せ！', 'ルールなんか 知るか！'],
  },
};

// every reel: title, ten lyric scenes, title again
const REELS = {
  A: { title: 'MIX A — 王道ミックス', seed: 3001, open: 'cinematic', close: 'party', scenes: ['horror', 'fresh', 'love', 'rock', 'alternative', 'ballad', 'cute', 'electro', 'washu', 'punk'] },
  B: { title: 'MIX B — 光と影', seed: 3002, open: 'electro', close: 'love', scenes: ['fresh', 'horror', 'cute', 'punk', 'heartbreak', 'alternative', 'dreamy', 'rock', 'party', 'ballad'] },
  C: { title: 'MIX C — 感情ジェットコースター', seed: 3003, open: 'party', close: 'cinematic', scenes: ['love', 'heartbreak', 'rock', 'ballad', 'horror', 'cute', 'alternative', 'fresh', 'washu', 'electro'] },
  D: { title: 'MIX D — ナイトドライブ', seed: 3004, open: 'dreamy', close: 'rock', scenes: ['electro', 'alternative', 'love', 'horror', 'washu', 'punk', 'fresh', 'heartbreak', 'party', 'dreamy'] },
};

const TITLE_TEXT = 'TelopMotion';
const OPEN_SECONDS = 3;
const SCENE_SECONDS = 2.5;
const CLOSE_SECONDS = 2;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function srtTime(seconds) {
  const ms = Math.round(seconds * 1000);
  const pad = (value, width) => String(value).padStart(width, '0');
  return `${pad(Math.floor(ms / 3600000), 2)}:${pad(Math.floor((ms % 3600000) / 60000), 2)}:${pad(Math.floor((ms % 60000) / 1000), 2)},${pad(ms % 1000, 3)}`;
}

// [{ mood, text, seconds, title }] for one reel
function lineup(reelId) {
  const reel = REELS[reelId];
  const index = Object.keys(REELS).indexOf(reelId);
  const scenes = [{ mood: reel.open, text: TITLE_TEXT, seconds: OPEN_SECONDS, title: true }];
  for (const id of reel.scenes) {
    const lines = MOODS[id].lines;
    scenes.push({ mood: id, text: lines[index % lines.length], seconds: SCENE_SECONDS, title: false });
  }
  scenes.push({ mood: reel.close, text: TITLE_TEXT, seconds: CLOSE_SECONDS, title: true });
  return scenes;
}

function reelSrt(scenes) {
  let start = 0;
  return scenes
    .map((scene, index) => {
      const block = `${index + 1}\n${srtTime(start)} --> ${srtTime(start + scene.seconds)}\n${scene.text}\n`;
      start += scene.seconds;
      return block;
    })
    .join('\n');
}

function instance(group, [type, params], motion) {
  const made = fx.withDefaults({ type, params: clone(params || {}) }, group);
  if (motion) made.motion = { ...(made.motion || {}), ...clone(motion) };
  return made;
}

// big type: short lines fill the frame, long ones wrap onto two lines
function textSize(scene, vertical) {
  if (scene.title) return 240;
  const letters = [...scene.text.replace(/\s/g, '')].length;
  if (vertical) return letters > 6 ? 130 : 170;
  if (letters <= 6) return 250;
  if (letters <= 9) return 200;
  return 160;
}

// snappy entrances that ripple letter by letter
const ENTER_MOTION = {
  in: { duration: 0.55, delay: 0, ease: 'quartOut' },
  stagger: { each: 0.045, order: 'ltr', ease: 'linear', unit: 'letter', from: 0.5 },
};

function sceneLook(scene, seed) {
  const mood = MOODS[scene.mood];
  // the engine supplies what the recipe leaves open: the exit and its timing
  const generated = moods.generate({
    genre: mood.genre || null,
    axes: mood.axes || null,
    seed,
    emphasis: scene.title,
    context: { cjk: true, letterCount: [...scene.text].length },
    ensureSignature: true,
  });
  const style = clone(generated.style);
  delete style.background;
  const vertical = !!mood.vertical && !scene.title;
  style.palette = clone(mood.palette);
  style.color = { ...(style.color || {}), fill: { kind: 'palette', index: 2 }, stroke: { kind: 'palette', index: 4 } };
  style.text = {
    ...(style.text || {}),
    fontId: scene.title ? 'DelaGothicOne-Regular' : mood.font,
    size: textSize(scene, vertical),
    lineHeight: 1.25,
    maxWidth: 0.9,
    align: 'center',
  };
  style.layout = instance('layout', [vertical ? 'vertical' : 'row']);
  style.location = instance('location', ['center']);
  style.animation = instance('animation', ['stagger']);
  style.enter = instance('enter', mood.enter, ENTER_MOTION);
  style.fill = instance('fill', mood.fill);
  style.hold = mood.hold.map((entry) => instance('hold', entry));
  style.edge = mood.edge.map((entry) => instance('edge', entry));
  style.post = mood.post.map((entry) => instance('post', entry));
  style.bgShape = { type: 'none', params: {}, enabled: true };
  style.bgEdge = [];
  style.repeat = { type: 'none', params: {}, enabled: true };
  const colors = mood.palette.colors;
  // a moving two-colour gradient in the mood's own primaries
  const background = { spec: { type: 'noiseGradient', params: { scale: 1.6, speed: 0.35 } }, colors: [colors[0], colors[1]] };
  // a moving pattern or shape layer in the accent colours on top of it
  const backdropResult = moods.rerollClipSpec('backdrop', { axes: generated.axes, seed: seed + 977, genre: mood.genre || null, index: seed });
  const backdrop = backdropResult && backdropResult.spec ? { spec: backdropResult.spec, colors: [colors[3], colors[5]] } : null;
  return { style, background, backdrop };
}

function pushClip(doc, trackId, cue, result, opacity, fade) {
  if (!result || !result.spec || !result.spec.type || result.spec.type === 'none') return;
  // a cue background bleeds one fade past each edge so its fade-out overlaps
  // the next clip's fade-in: a cue switch never dips to the clear colour
  const bleed = trackId === 'bg' ? fade : 0;
  doc.clips.push({
    id: project.nextClipId(doc, `clip_${trackId}`),
    trackId,
    start: Math.max(0, cue.start - bleed),
    end: cue.end + bleed,
    spec: clone(result.spec),
    opacity,
    fadeIn: fade,
    fadeOut: fade,
    colors: result.colors ? clone(result.colors) : null,
  });
}

function buildReel(reelId) {
  const reel = REELS[reelId];
  const scenes = lineup(reelId);
  const srtText = reelSrt(scenes);
  const cues = srt.parse(srtText).cues.map((cue, index) => ({ ...cue, id: `demo30${reelId.toLowerCase()}_${String(index + 1).padStart(2, '0')}` }));
  const doc = project.create({});
  doc.meta.title = `TelopMotion 30秒デモ ${reel.title}`;
  doc.meta.lang = 'ja';
  doc.script.cues = cues;
  doc.script.sourceName = `demo30-${reelId}.srt`;
  doc.style.text.fontId = 'DelaGothicOne-Regular';
  // no song or profile behind the reel: the credit overlays would only add an
  // empty title card and five seconds of end card past the 30 s mark
  doc.credits.modes.element.enabled = false;
  doc.credits.modes.end.enabled = false;
  textflow.apply(doc);
  doc.clips = [];
  scenes.forEach((scene, index) => {
    const cue = cues[index];
    const look = sceneLook(scene, reel.seed * 100 + index * 37);
    doc.cueStyles[cue.id] = look.style;
    // hard cuts between scenes keep the pace up
    pushClip(doc, 'bg', cue, look.background, 1, 0.05);
    pushClip(doc, 'mid', cue, look.backdrop, 0.55, 0.05);
  });
  return { project: doc, srtText, cues, scenes };
}

function build(options) {
  const opts = options || {};
  const dir = opts.dir || path.join(ROOT, 'demo');
  const ids = opts.reels && opts.reels.length ? opts.reels : Object.keys(REELS);
  fs.mkdirSync(dir, { recursive: true });
  return ids.map((id) => {
    if (!REELS[id]) throw new Error(`unknown reel ${id} (${Object.keys(REELS).join(', ')})`);
    const built = buildReel(id);
    const migrated = project.migrate(clone(built.project));
    if (!migrated.ok) throw new Error(`reel ${id} did not migrate: ${migrated.error}`);
    const files = { srt: path.join(dir, `demo30-${id}.srt`), project: path.join(dir, `demo30-${id}.telopmotion.json`) };
    fs.writeFileSync(files.srt, built.srtText, 'utf8');
    fs.writeFileSync(files.project, `${JSON.stringify(built.project, null, 2)}\n`, 'utf8');
    return { id, files, cues: built.cues, scenes: built.scenes };
  });
}

function describe(id) {
  const lines = [`${id}: ${REELS[id].title}`];
  let t = 0;
  for (const scene of lineup(id)) {
    lines.push(`  ${t.toFixed(1).padStart(4)}s  ${MOODS[scene.mood].label.padEnd(8, '　')} ${scene.text}`);
    t += scene.seconds;
  }
  return lines.join('\n');
}

if (require.main === module) {
  const [command, flag, value] = process.argv.slice(2);
  if (command === 'build') {
    const reels = flag === '--reels' && value ? value.split(',').map((item) => item.trim().toUpperCase()) : null;
    for (const result of build({ reels })) {
      const end = result.cues[result.cues.length - 1].end;
      console.log(`${result.id}: ${result.cues.length} scenes, ${end}s — ${result.files.project}`);
    }
  } else if (command === 'list') {
    console.log(Object.keys(REELS).map(describe).join('\n\n'));
  } else {
    console.log('usage: node scripts/demo30.js build [--reels A,B] | list');
  }
}

module.exports = { MOODS, REELS, lineup, reelSrt, buildReel, build };
