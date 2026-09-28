(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.presets = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LIST = [
    {
      id: 'pop',
      label: 'fx.preset.pop',
      style: {
        layout: { type: 'row', params: {} },
        enter: { type: 'elasticPop', motion: { in: { duration: 0.7, ease: 'backOut' } } },
        hold: [{ type: 'floatBob', params: { amp: 0.02, speed: 0.5 } }],
        exit: { type: 'zoomOut', motion: { out: { duration: 0.45 } } },
        fill: { type: 'categoryColor', params: {} },
        edge: [{ type: 'outline', params: { width: 3, softness: 0.4 } }],
        background: { type: 'card', params: { dim: 0.4, focusBadge: true } },
      },
    },
    {
      id: 'cinematic',
      label: 'fx.preset.cinematic',
      style: {
        layout: { type: 'row', params: {} },
        enter: { type: 'blurIn', params: { radius: 16 }, motion: { in: { duration: 1.6, ease: 'quartOut' } } },
        hold: [{ type: 'kenBurns', params: { zoom: 0.12 } }],
        exit: { type: 'fade', motion: { out: { duration: 1.1 } } },
        fill: { type: 'solid', params: {} },
        edge: [{ type: 'dropShadow', params: { offset: { x: 0, y: 10 }, blur: 18, opacity: 0.55 } }],
        post: [{ type: 'filmGrain', params: { amount: 0.16 } }, { type: 'vignette', params: { amount: 0.55 } }],
        background: { type: 'cover', params: { dim: 0.55, blur: 6 } },
      },
    },
    {
      id: 'neon',
      label: 'fx.preset.neon',
      style: {
        layout: { type: 'row', params: {} },
        enter: { type: 'neonFlicker', motion: { in: { duration: 1.1 } } },
        fill: { type: 'solid', params: {} },
        edge: [{ type: 'neonGlow', params: { radius: 20, intensity: 1.2, bloom: true } }],
        post: [{ type: 'crt', params: { scanlines: 0.18, curvature: 0.08 } }],
        color: { fill: { kind: 'solid', value: '#8ef6ff', alpha: 1 } },
      },
    },
    {
      id: 'typewriter',
      label: 'fx.preset.typewriter',
      style: {
        layout: { type: 'row', params: {} },
        animation: { type: 'stagger', params: { order: 'ltr', each: 0.05 } },
        enter: { type: 'typewriter', params: { cursor: true }, motion: { in: { duration: 0.6 } } },
        exit: { type: 'typewriterReverse', motion: { out: { duration: 0.5 } } },
        fill: { type: 'solid', params: {} },
        edge: [],
        post: [],
      },
    },
    {
      id: 'glitch',
      label: 'fx.preset.glitch',
      style: {
        layout: { type: 'row', params: {} },
        enter: { type: 'glitchIn', params: { intensity: 0.6 }, motion: { in: { duration: 0.8 } } },
        hold: [{ type: 'jitter', params: { amp: 0.006, rate: 14 } }],
        exit: { type: 'dissolve', motion: { out: { duration: 0.5 } } },
        post: [
          { type: 'glitchBlocks', params: { blockSize: 28, rate: 8, intensity: 0.6 }, target: 'text' },
          { type: 'chromaticAberration', params: { amount: 0.4 } },
        ],
      },
    },
    {
      id: 'karaoke',
      label: 'fx.preset.karaoke',
      style: {
        layout: { type: 'row', params: {} },
        location: { type: 'karaoke', params: {} },
        fill: { type: 'karaokeWipe', params: { colorBefore: '#ffffff', colorAfter: '#ff8a3d', softness: 0.04 } },
        edge: [{ type: 'outline', params: { width: 2.5 } }],
      },
    },
    {
      id: 'chrome',
      label: 'fx.preset.chrome',
      style: {
        layout: { type: 'row', params: {} },
        enter: { type: 'flip3D', params: { axis: 'x', angle: 80 }, motion: { in: { duration: 0.9 } } },
        hold: [{ type: 'orbit3D', params: { tilt: 12, speed: 0.4 } }],
        fill: { type: 'chrome', params: {} },
        edge: [{ type: 'bevel', params: { depth: 0.6 } }, { type: 'extrude', params: { depth: 12 } }],
      },
    },
    {
      id: 'fire',
      label: 'fx.preset.fire',
      style: {
        layout: { type: 'row', params: {} },
        enter: { type: 'noiseDissolveIn', params: { scale: 12 }, motion: { in: { duration: 1.2 } } },
        hold: [{ type: 'wobbleWarp', params: { amount: 0.05 } }],
        exit: { type: 'burnAway', motion: { out: { duration: 0.9 } } },
        fill: { type: 'fire', params: { scale: 1.1, speed: 1.2 } },
        edge: [{ type: 'innerGlow', params: { color: '#ffb347', radius: 12 } }],
        post: [{ type: 'heatHaze', params: { amount: 0.25 } }],
      },
    },
    {
      id: 'hologram',
      label: 'fx.preset.hologram',
      style: {
        layout: { type: 'row', params: {} },
        enter: { type: 'particlesAssemble', params: { spread: 0.5, turbulence: 0.4 }, motion: { in: { duration: 1.1 } } },
        hold: [{ type: 'breathing', params: { amount: 0.04 } }],
        exit: { type: 'particlesDisperse', params: { drift: 0.4 }, motion: { out: { duration: 0.8 } } },
        fill: { type: 'holographic', params: { iridescence: 0.7, speed: 0.4 } },
        post: [{ type: 'chromaticAberration', params: { amount: 0.5 } }],
      },
    },
    {
      id: 'handwritten',
      label: 'fx.preset.handwritten',
      style: {
        layout: { type: 'row', params: {} },
        animation: { type: 'stagger', params: { order: 'ltr', each: 0.08 } },
        enter: { type: 'strokeDrawOn', params: { width: 5, fillDelay: 0.6 }, motion: { in: { duration: 1.4 } } },
        exit: { type: 'strokeErase', motion: { out: { duration: 0.8 } } },
        fill: { type: 'solid', params: {} },
        edge: [],
      },
    },
    {
      id: 'particleStorm',
      label: 'fx.preset.particleStorm',
      style: {
        layout: { type: 'row', params: { from: 'offscreenEdges', curve: 0.6, curveDir: 'random' } },
        enter: { type: 'particlesAssemble', params: { spread: 0.6, turbulence: 0.6 }, motion: { in: { duration: 1.3 } } },
        exit: { type: 'explode', params: { spread: 0.7 }, motion: { out: { duration: 0.7 } } },
        post: [{ type: 'sparkles', params: { count: 40, size: 2.4 } }],
      },
    },
    {
      id: 'circleBuild',
      label: 'fx.preset.circleBuild',
      style: {
        layout: {
          type: 'row',
          params: {
            from: 'point',
            curve: 0.4,
            sequence: [{ at: 0.25, type: 'circle', params: { radius: 0.26 }, duration: 0.7, ease: 'cubicInOut' }, { at: 0.7, type: 'row', params: {}, duration: 0.6, ease: 'cubicInOut' }],
          },
        },
        fill: { type: 'gradientSweep', params: { angle: 30, speed: 0.4 } },
      },
    },
    {
      id: 'tategaki',
      label: 'fx.preset.tategaki',
      style: {
        layout: { type: 'vertical', params: {} },
        animation: { type: 'stagger', params: { order: 'vertical-reading', unit: 'word', each: 0.08 } },
        enter: { type: 'slide', params: { dir: 'down', distance: 0.2 }, motion: { in: { duration: 0.7 } } },
        fill: { type: 'solid', params: {} },
        edge: [{ type: 'outline', params: { width: 2 } }],
      },
    },
    {
      id: 'achievementFanfare',
      label: 'fx.preset.achievementFanfare',
      style: {
        layout: { type: 'row', params: {} },
        location: { type: 'badgeAnchored', params: {} },
        enter: { type: 'elasticPop', motion: { in: { duration: 0.8, ease: 'backOut' } } },
        hold: [{ type: 'pulse', params: { amount: 0.06, bpm: 120 } }],
        fill: { type: 'categoryColor', params: {} },
        edge: [{ type: 'neonGlow', params: { radius: 16, bloom: true } }],
        post: [{ type: 'sparkles', params: { count: 32 } }],
        background: { type: 'card', params: { focusBadge: true, zoom: 1.9, dim: 0.45 } },
      },
    },
  ];

  // Generic text-background presets (the table in the plan).
  const BG_PRESETS = [
    {
      id: 'varietyBox',
      label: 'fx.preset.varietyBox',
      style: {
        fill: { type: 'solid', params: {} },
        bgShape: { type: 'square', params: { unit: 'cell', width: 1.15, height: 1.15, vary: 'alternate', skipSpaces: true } },
        bgFill: { type: 'solid', params: {} },
        bgMotion: { type: 'pop', params: { lead: 0.05, duration: 0.35, overshoot: 0.15 } },
      },
    },
    {
      id: 'marker',
      label: 'fx.preset.marker',
      style: {
        fill: { type: 'solid', params: {} },
        bgShape: { type: 'bar', params: { unit: 'cell', width: 1.2, height: 0.38, offset: { x: 0, y: 0.28 }, skipSpaces: true } },
        bgFill: { type: 'gradientSweep', params: { angle: 0, speed: 0.2 } },
        bgMotion: { type: 'grow', params: { axis: 'x', lead: 0.05, duration: 0.4 } },
      },
    },
    {
      id: 'badgeDots',
      label: 'fx.preset.badgeDots',
      style: {
        fill: { type: 'solid', params: {} },
        bgShape: {
          type: 'circle',
          params: { unit: 'em', width: 0.3, height: 0.3, offset: { x: 0.45, y: -0.45 }, layer: 'front', vary: 'cycle', skipSpaces: true },
        },
        bgFill: { type: 'solid', params: {} },
        bgMotion: { type: 'pop', params: { lead: 0, duration: 0.3 } },
      },
    },
    {
      id: 'bubbleLetters',
      label: 'fx.preset.bubbleLetters',
      style: {
        fill: { type: 'solid', params: {} },
        bgShape: { type: 'circle', params: { unit: 'cell', width: 1.3, height: 1.3, vary: 'charClass', skipSpaces: true } },
        bgFill: { type: 'solid', params: {} },
        bgMotion: { type: 'stamp', params: { lead: 0.03, duration: 0.25, from: 1.7 } },
      },
    },
    {
      id: 'confetti',
      label: 'fx.preset.confetti',
      style: {
        fill: { type: 'solid', params: {} },
        edge: [{ type: 'outline', params: { width: 2.5 }, enabled: true }],
        bgShape: {
          type: 'paper',
          params: { unit: 'em', width: 2.4, height: 2.4, opacity: 0.35, vary: 'random', varyRotation: 40, varyOffset: 0.3, skipSpaces: true },
        },
        bgFill: { type: 'solid', params: {} },
        bgMotion: { type: 'spin', params: { turns: 0.25, lead: -0.1, duration: 0.5 } },
      },
    },
    {
      id: 'dashedFrame',
      label: 'fx.preset.dashedFrame',
      style: {
        fill: { type: 'solid', params: {} },
        bgShape: { type: 'rounded', params: { unit: 'cell', width: 1.2, height: 1.2, opacity: 0, skipSpaces: true } },
        bgFill: { type: 'solid', params: {} },
        bgEdge: [{ type: 'outline', params: { width: 2, pattern: 'dashed', dashLength: 12, flow: 1, offset: 2 }, enabled: true }],
        bgMotion: { type: 'fade', params: { lead: 0.05, duration: 0.4 } },
      },
    },
    {
      id: 'typewriterCursor',
      label: 'fx.preset.typewriterCursor',
      style: {
        enter: { type: 'typewriter', params: { cursor: true, cursorShape: 'block', blink: 0.5 }, motion: { in: { duration: 0.8 } } },
        fill: { type: 'solid', params: {} },
        bgShape: { type: 'rounded', params: { unit: 'cell', width: 1.1, height: 1.1, opacity: 0.85, skipSpaces: true } },
        bgFill: { type: 'solid', params: { color: '#1a1a1a' } },
        bgMotion: { type: 'follow', params: {} },
      },
    },
  ];

  // Genre presets are generated from the genre profiles when the mood
  // generator is available (browser); the output is deterministic per genre.
  const GENRE_PRESETS = [
    { id: 'horrorBlood', genre: 'horror', signature: 'blood' },
    { id: 'horrorRansom', genre: 'horror', signature: 'ransom' },
    { id: 'horrorScratch', genre: 'horror', signature: 'claw' },
    { id: 'loveHeartbeat', genre: 'love', signature: 'heartbeat' },
    { id: 'loveHearts', genre: 'love', signature: 'heartAccent' },
    { id: 'heartbreakTears', genre: 'heartbreak', signature: 'tears' },
    { id: 'partyConfetti', genre: 'party', signature: 'confetti' },
  ];

  // --- staged looks (pack 'pro') ----------------------------------------------
  // Whole looks built *from combinations* of the extended primitives: an entrance /
  // exit animator, one or two holds (warp / letterWarp / font size / squash &
  // stretch / swirl), a dedicated background primitive, the frame posts and
  // a camera move - stacked on top of the classic kit (layout, fill, edge,
  // palette). Each one is a complete staging with its own palette, so applying
  // it to a cue immediately reads as a designed performance. They sit behind
  // pack 'pro' so the FX 400 / 800 catalogs keep their exact look list; the
  // No.801-1000 extension draws from them.
  const STAGED_LOOKS = [
    {
      id: 'movieTitle',
      name: 'シネマティック・タイトル',
      pack: 'pro',
      tags: ['cinematic', 'title', 'slow'],
      axes: { speed: 0.32, energy: 0.45, softness: 0.55, density: 0.3, brightness: 0.45 },
      style: {
        text: { size: 132, lineHeight: 1.14, letterSpacing: 0.06, align: 'center', maxWidth: 0.86 },
        palette: { name: 'aeMovie', colors: ['#0b0f1a', '#141b2d', '#f4f7ff', '#ffca6a', '#8fa8ff', '#ff9ab0'] },
        color: { fill: { kind: 'solid', value: '#f4f7ff', alpha: 1 }, stroke: { kind: 'solid', value: '#8fa8ff', alpha: 1 } },
        layout: { type: 'row', params: { from: 'depth', curve: 0.25 } },
        location: { type: 'center', params: {} },
        animation: { type: 'stagger', params: { order: 'center-out', each: 0.05, unit: 'letter' } },
        enter: { type: 'animator', params: { dy: 1.1, scale: 1.2, opacity: 0, blur: 26, tilt: 16, axis: 'y' }, motion: { in: { duration: 1.25, ease: 'expoOut' } } },
        hold: [
          { type: 'animator', params: { mode: 'float', dy: 0.03, rotate: 0.6, freq: 0.22 } },
          { type: 'letterWarp', params: { style: 'taper', amount: 0.05, speed: 0.2 } },
        ],
        exit: { type: 'animator', params: { dy: -0.7, opacity: 0, blur: 18, flash: 0.25 }, motion: { out: { duration: 0.7, ease: 'expoIn' } } },
        fill: { type: 'solid', params: {} },
        edge: [
          { type: 'neonGlow', params: { radius: 18, intensity: 0.9, bloom: true } },
          { type: 'dropShadow', params: { offset: { x: 0, y: 12 }, blur: 26, opacity: 0.5 } },
        ],
        post: [
          { type: 'camera', params: { move: 'pushIn', amount: 0.16, speed: 0.22 } },
          { type: 'anamorphicStreak', params: { threshold: 0.72, length: 0.35, intensity: 0.5 } },
          { type: 'filmGrain', params: { amount: 0.14, size: 1.2 } },
          { type: 'vignette', params: { amount: 0.5, softness: 0.5 } },
        ],
        background: { type: 'rays', params: { kind: 'lightRays', rays: 12, spin: 3, width: 0.3, softness: 0.75, center: { x: 0.5, y: -0.05 }, falloff: 0.4, noise: 0.2 } },
      },
    },
    {
      id: 'trailerGlitch',
      name: '予告編グリッチ',
      pack: 'pro',
      tags: ['glitch', 'aggressive', 'fast'],
      axes: { speed: 0.85, energy: 0.95, softness: 0.15, density: 0.55, brightness: 0.4 },
      style: {
        text: { size: 118, lineHeight: 1.06, letterSpacing: 0.01, align: 'center', maxWidth: 0.9 },
        palette: { name: 'aeTrailer', colors: ['#05060a', '#101319', '#f2f6ff', '#ff2d5e', '#37e0ff', '#ffd23d'] },
        color: { fill: { kind: 'solid', value: '#f2f6ff', alpha: 1 }, stroke: { kind: 'solid', value: '#ff2d5e', alpha: 1 } },
        layout: { type: 'row', params: { from: 'offscreenEdges', curve: 0.4, curveDir: 'alternate' } },
        location: { type: 'center', params: {} },
        animation: { type: 'stagger', params: { order: 'random', each: 0.018, unit: 'letter' } },
        enter: { type: 'animator', params: { dx: -0.7, skew: -22, scale: 1.5, opacity: 0, flash: 0.6 }, motion: { in: { duration: 0.42, ease: 'expoOut' } } },
        hold: [
          { type: 'animator', params: { mode: 'wiggle', dy: 0.02, rotate: 0.8, freq: 7, phase: 1 } },
          { type: 'letterWarp', params: { style: 'zigzag', amount: 0.12, freq: 3, animate: 'travel', speed: 1.4 } },
        ],
        exit: { type: 'animator', params: { dx: 0.8, skew: 26, opacity: 0, flash: 0.5 }, motion: { out: { duration: 0.32, ease: 'expoIn' } } },
        fill: { type: 'solid', params: {} },
        edge: [{ type: 'outline', params: { width: 3, pattern: 'dashed', dashLength: 10, flow: 2 } }],
        post: [
          { type: 'camera', params: { move: 'zoomPunch', amount: 0.26, speed: 0.9, shake: 0.22 } },
          { type: 'glitchSlice', params: { slices: 14, offset: 0.55, rate: 12 } },
          { type: 'rgbShift', params: { amount: 4, angle: 0, jitter: 0.6 } },
          { type: 'strobeFlash', params: { bpm: 'audio', intensity: 0.35, duty: 0.08, color: [1, 0.2, 0.35, 1] } },
          { type: 'scanTear', params: { lines: 40, amount: 0.45, speed: 1.6 } },
        ],
        background: { type: 'tunnel', params: { shape: 'square', rings: 16, speed: 1.6, twist: 0.4, stripes: 12, fog: 0.7 } },
      },
    },
    {
      id: 'lofiDream',
      name: 'ローファイ・ドリーム',
      pack: 'pro',
      tags: ['soft', 'dreamy', 'slow'],
      axes: { speed: 0.25, energy: 0.25, softness: 0.9, density: 0.35, brightness: 0.3 },
      style: {
        text: { size: 104, lineHeight: 1.2, letterSpacing: 0.03, align: 'center', maxWidth: 0.84 },
        palette: { name: 'aeLofi', colors: ['#12100f', '#1d1a18', '#f3e9dc', '#e0a96d', '#a8bfc9', '#c9a2c4'] },
        color: { fill: { kind: 'gradient', type: 'linear', angle: 100, stops: [{ color: '#f3e9dc' }, { color: '#e0a96d' }] } },
        layout: { type: 'row', params: { from: 'point' } },
        location: { type: 'center', params: {} },
        animation: { type: 'stagger', params: { order: 'ltr', each: 0.075, unit: 'word' } },
        enter: { type: 'animator', params: { scale: 1.14, opacity: 0, blur: 34 }, motion: { in: { duration: 1.5, ease: 'quartOut' } } },
        hold: [
          { type: 'animator', params: { mode: 'sine', dy: 0.035, scale: 0.02, freq: 0.2 } },
          { type: 'breathing', params: { amount: 0.018 } },
        ],
        exit: { type: 'animator', params: { scale: 0.94, opacity: 0, blur: 28 }, motion: { out: { duration: 1.1, ease: 'sineIn' } } },
        fill: { type: 'solid', params: {} },
        post: [
          { type: 'camera', params: { move: 'handheld', amount: 0.22, speed: 0.5, shake: 0.12 } },
          { type: 'filmGrain', params: { amount: 0.2, size: 1.6 } },
          { type: 'vignette', params: { amount: 0.55, softness: 0.4 } },
          { type: 'lightLeak', params: { color: [1, 0.72, 0.42, 1], x: 0.86, y: 0.24, intensity: 0.5 } },
        ],
        background: { type: 'particleField', params: { kind: 'bokeh', density: 22, size: 2.6, sizeVar: 0.6, layers: 3, speed: 0.06, direction: 90, twinkle: 0.25, softness: 0.85, base: 0.06 } },
      },
    },
    {
      id: 'synthwave',
      name: 'シンセウェーブ',
      pack: 'pro',
      tags: ['retro', 'neon', 'medium'],
      axes: { speed: 0.5, energy: 0.7, softness: 0.25, density: 0.5, brightness: 0.5 },
      style: {
        text: { size: 124, lineHeight: 1.08, letterSpacing: 0.04, align: 'center', maxWidth: 0.88 },
        palette: { name: 'aeSynth', colors: ['#120b2e', '#241652', '#fdf0ff', '#ff3fa4', '#3fe0ff', '#ffd166'] },
        color: { fill: { kind: 'gradient', type: 'linear', angle: 90, stops: [{ color: '#ff3fa4' }, { color: '#ffd166' }] }, stroke: { kind: 'solid', value: '#3fe0ff', alpha: 1 } },
        layout: { type: 'row', params: { from: 'depth' } },
        location: { type: 'center', params: {} },
        animation: { type: 'stagger', params: { order: 'center-out', each: 0.04, unit: 'letter' } },
        enter: { type: 'animator', params: { dy: -0.9, scale: 0.7, opacity: 0, blur: 14 }, motion: { in: { duration: 0.7, ease: 'backOut' } } },
        hold: [{ type: 'letterWarp', params: { style: 'shearWave', amount: 0.08, freq: 2, animate: 'travel', speed: 0.7 } }],
        exit: { type: 'animator', params: { dy: 0.8, opacity: 0, blur: 16 }, motion: { out: { duration: 0.5, ease: 'cubicIn' } } },
        fill: { type: 'gradientSweep', params: { angle: 30, speed: 0.35 } },
        edge: [
          { type: 'outline', params: { width: 2.5 } },
          { type: 'neonGlow', params: { radius: 24, intensity: 1.2, bloom: true } },
        ],
        post: [
          { type: 'camera', params: { move: 'panRight', amount: 0.18, speed: 0.35 } },
          { type: 'chromaticAberration', params: { amount: 0.35, radial: 0.5, angle: 0 } },
          { type: 'anamorphicStreak', params: { threshold: 0.6, length: 0.5, intensity: 0.7, tint: [0.3, 0.9, 1, 1] } },
          { type: 'vignette', params: { amount: 0.42, softness: 0.6 } },
        ],
        background: { type: 'perspectiveGrid', params: { sun: 'sun', horizon: 0.52, spacing: 0.22, speed: 0.55, lineWidth: 1.2, glow: 1.1, fog: 0.55, sunSize: 0.32 } },
      },
    },
    {
      id: 'idolPop',
      name: 'アイドルポップ',
      pack: 'pro',
      tags: ['pop', 'bright', 'fast'],
      axes: { speed: 0.8, energy: 0.9, softness: 0.3, density: 0.7, brightness: 0.85 },
      style: {
        text: { size: 128, lineHeight: 1.1, letterSpacing: 0.02, align: 'center', maxWidth: 0.9 },
        palette: { name: 'aeIdol', colors: ['#1b0f2b', '#2c1a44', '#ffffff', '#ff5ca8', '#5ce1ff', '#ffe066'] },
        color: { fill: { kind: 'gradient', type: 'linear', angle: 120, stops: [{ color: '#ffffff' }, { color: '#ffe066' }] } },
        layout: { type: 'row', params: { from: 'corners' } },
        location: { type: 'center', params: {} },
        animation: { type: 'cascade', params: { overlap: 0.6 } },
        enter: { type: 'animator', params: { scale: 0.35, rotate: -18, opacity: 0, flash: 0.5 }, motion: { in: { duration: 0.5, ease: 'backOut' } } },
        hold: [
          { type: 'animator', params: { mode: 'pulse', scale: 0.06, freq: 1, sync: 'beat' } },
          { type: 'swirl', params: { angle: 12, freq: 1.4, speed: 1.2 } },
        ],
        exit: { type: 'animator', params: { scale: 1.4, rotate: 14, opacity: 0, flash: 0.4 }, motion: { out: { duration: 0.4, ease: 'backIn' } } },
        fill: { type: 'gradientSweep', params: { angle: 20, speed: 0.6 } },
        edge: [
          { type: 'outline', params: { width: 4, softness: 0.2 } },
          { type: 'dropShadow', params: { offset: { x: 0, y: 8 }, blur: 0, opacity: 0.85 } },
        ],
        post: [
          { type: 'camera', params: { move: 'zoomPunch', amount: 0.18, speed: 1.1 } },
          { type: 'sparkles', params: { count: 44, size: 2.6, shape: 'star', color: [1, 0.92, 0.5, 1] } },
          { type: 'bloom', params: { threshold: 0.55, intensity: 0.9, radius: 0.6 } },
        ],
        background: { type: 'rays', params: { kind: 'rays', rays: 20, spin: 10, width: 0.22, softness: 0.35, center: { x: 0.5, y: 0.42 }, falloff: 0.55, noise: 0.15 } },
      },
    },
    {
      id: 'documentary',
      name: 'ドキュメンタリー',
      pack: 'pro',
      tags: ['calm', 'handheld', 'medium'],
      axes: { speed: 0.4, energy: 0.35, softness: 0.7, density: 0.3, brightness: 0.4 },
      style: {
        text: { size: 92, lineHeight: 1.28, letterSpacing: 0.02, align: 'left', maxWidth: 0.8 },
        palette: { name: 'aeDoc', colors: ['#0d1117', '#1a212b', '#eef2f7', '#e0b070', '#7fa8c9', '#c9a2a2'] },
        color: { fill: { kind: 'solid', value: '#eef2f7', alpha: 1 } },
        layout: { type: 'row', params: { from: 'offscreenEdges', curve: 0.15 } },
        location: { type: 'lowerThird', params: { offsetY: -0.02 } },
        animation: { type: 'stagger', params: { order: 'ltr', each: 0.045, unit: 'word' } },
        enter: { type: 'animator', params: { dy: 0.45, opacity: 0, blur: 10 }, motion: { in: { duration: 0.8, ease: 'cubicOut' } } },
        hold: [{ type: 'animator', params: { mode: 'float', dy: 0.02, freq: 0.18 } }],
        exit: { type: 'animator', params: { dy: -0.3, opacity: 0 }, motion: { out: { duration: 0.6, ease: 'cubicIn' } } },
        fill: { type: 'solid', params: {} },
        edge: [{ type: 'dropShadow', params: { offset: { x: 0, y: 6 }, blur: 14, opacity: 0.45 } }],
        post: [
          { type: 'camera', params: { move: 'handheld', amount: 0.14, speed: 0.35, shake: 0.08 } },
          { type: 'filmGrain', params: { amount: 0.16, size: 1.1 } },
          { type: 'vignette', params: { amount: 0.45, softness: 0.6 } },
        ],
        background: { type: 'fractalNoise', params: { scale: 2.6, stretch: 0.6, contrast: 1.1, brightness: -0.12, kind: 'basic', octaves: 5, ramp: 'three', evolution: 0.12, rate: 0.06, subInfluence: 0.35, subScale: 0.7, subRotation: 30, warp: 0.25 } },
      },
    },
    {
      id: 'cyberTunnel',
      name: 'サイバー・トンネル',
      pack: 'pro',
      tags: ['retro', 'fast', 'neon'],
      axes: { speed: 0.9, energy: 0.95, softness: 0.2, density: 0.6, brightness: 0.45 },
      style: {
        text: { size: 116, lineHeight: 1.06, letterSpacing: 0.05, align: 'center', maxWidth: 0.86 },
        palette: { name: 'aeCyber', colors: ['#04101a', '#08202e', '#dffaff', '#24f0b0', '#4da6ff', '#ff5cf0'] },
        color: { fill: { kind: 'solid', value: '#dffaff', alpha: 1 }, stroke: { kind: 'solid', value: '#24f0b0', alpha: 1 } },
        layout: { type: 'row', params: { from: 'depth' } },
        location: { type: 'center', params: {} },
        animation: { type: 'stagger', params: { order: 'center-out', each: 0.035, unit: 'letter' } },
        enter: { type: 'animator', params: { scale: 0.25, opacity: 0, blur: 22 }, motion: { in: { duration: 0.9, ease: 'expoOut' } } },
        hold: [
          { type: 'animator', params: { mode: 'sine', scale: 0.03, freq: 0.5, sync: 'beat' } },
          { type: 'letterWarp', params: { style: 'squash', amount: 0.1, freq: 1.5, animate: 'sway', sync: 'beat' } },
        ],
        exit: { type: 'animator', params: { scale: 2.4, opacity: 0, blur: 30 }, motion: { out: { duration: 0.6, ease: 'expoIn' } } },
        fill: { type: 'solid', params: {} },
        edge: [
          { type: 'outline', params: { width: 2 } },
          { type: 'neonGlow', params: { radius: 26, intensity: 1.3, bloom: true } },
        ],
        post: [
          { type: 'camera', params: { move: 'pushIn', amount: 0.3, speed: 0.7 } },
          { type: 'bloom', params: { threshold: 0.5, intensity: 1, radius: 0.7 } },
          { type: 'chromaticAberration', params: { amount: 0.3, radial: 0.8, angle: 0 } },
        ],
        background: { type: 'tunnel', params: { shape: 'circle', rings: 18, speed: 1.8, twist: 0.5, stripes: 12, fog: 0.5 } },
      },
    },
    {
      id: 'winterBallad',
      name: 'ウィンター・バラード',
      pack: 'pro',
      tags: ['soft', 'slow', 'cool'],
      axes: { speed: 0.3, energy: 0.3, softness: 0.85, density: 0.4, brightness: 0.55 },
      style: {
        text: { size: 112, lineHeight: 1.2, letterSpacing: 0.04, align: 'center', maxWidth: 0.85 },
        palette: { name: 'aeWinter', colors: ['#0a1220', '#152238', '#f0f6ff', '#9fd8ff', '#c9d8ff', '#ffd9e8'] },
        color: { fill: { kind: 'gradient', type: 'linear', angle: 90, stops: [{ color: '#f0f6ff' }, { color: '#9fd8ff' }] } },
        layout: { type: 'row', params: { from: 'point' } },
        location: { type: 'center', params: {} },
        animation: { type: 'stagger', params: { order: 'edges-in', each: 0.06, unit: 'letter' } },
        enter: { type: 'animator', params: { dy: -0.5, scale: 1.1, opacity: 0, blur: 30 }, motion: { in: { duration: 1.35, ease: 'quartOut' } } },
        hold: [
          { type: 'animator', params: { mode: 'sine', dy: 0.025, freq: 0.2 } },
          { type: 'fontSize', params: { from: 1, to: 1.07, period: 3.4, mode: 'pulse', ease: 'easeInOutSine' } },
        ],
        exit: { type: 'animator', params: { dy: 0.4, scale: 0.9, opacity: 0, blur: 26 }, motion: { out: { duration: 1.1, ease: 'sineIn' } } },
        fill: { type: 'solid', params: {} },
        edge: [{ type: 'neonGlow', params: { radius: 16, intensity: 0.7, bloom: true } }, { type: 'outline', params: { width: 1.5, softness: 0.5 } }],
        post: [
          { type: 'camera', params: { move: 'pushIn', amount: 0.1, speed: 0.18 } },
          { type: 'bloom', params: { threshold: 0.6, intensity: 0.7, radius: 0.5 } },
          { type: 'vignette', params: { amount: 0.42, softness: 0.7 } },
        ],
        background: { type: 'particleField', params: { kind: 'snow', density: 34, size: 1.1, sizeVar: 0.7, layers: 4, speed: 0.28, direction: 100, twinkle: 0.5, softness: 0.5, base: 0.05 } },
      },
    },
    {
      id: 'festival',
      name: 'フェスティバル',
      pack: 'pro',
      tags: ['party', 'bright', 'fast'],
      axes: { speed: 0.9, energy: 1, softness: 0.25, density: 0.8, brightness: 0.8 },
      style: {
        text: { size: 126, lineHeight: 1.06, letterSpacing: 0.02, align: 'center', maxWidth: 0.9 },
        palette: { name: 'aeFestival', colors: ['#160c1e', '#26123a', '#fff7e6', '#ff7a3d', '#ffd23d', '#4de0c0'] },
        color: { fill: { kind: 'gradient', type: 'linear', angle: 45, stops: [{ color: '#ffd23d' }, { color: '#ff7a3d' }] } },
        layout: { type: 'wave', params: { from: 'offscreenEdges', amp: 0.05 } },
        location: { type: 'center', params: {} },
        animation: { type: 'stagger', params: { order: 'random', each: 0.03, unit: 'letter' } },
        enter: { type: 'animator', params: { scale: 0.2, rotate: 26, opacity: 0, flash: 0.6 }, motion: { in: { duration: 0.55, ease: 'elasticOut' } } },
        hold: [
          { type: 'animator', params: { mode: 'pulse', scale: 0.09, freq: 1, sync: 'beat' } },
          { type: 'squashStretch', params: { amount: 0.18, speed: 1.8, phase: 0.3 } },
        ],
        exit: { type: 'animator', params: { scale: 1.6, rotate: -20, opacity: 0, flash: 0.5 }, motion: { out: { duration: 0.45, ease: 'backIn' } } },
        fill: { type: 'gradientSweep', params: { angle: 0, speed: 0.8 } },
        edge: [{ type: 'outline', params: { width: 3.5 } }],
        post: [
          { type: 'camera', params: { move: 'zoomPunch', amount: 0.2, speed: 1.2, shake: 0.18 } },
          { type: 'sparkles', params: { count: 60, size: 3, shape: 'star', color: [1, 0.95, 0.6, 1] } },
          { type: 'strobeFlash', params: { bpm: 'audio', intensity: 0.28, duty: 0.12, color: [1, 1, 0.95, 1] } },
        ],
        background: { type: 'particleField', params: { kind: 'embers', density: 30, size: 1.4, sizeVar: 0.6, layers: 3, speed: 0.5, direction: -80, twinkle: 0.7, softness: 0.35, base: 0.08 } },
      },
    },
    {
      id: 'poster',
      name: 'ポスター・タイポ',
      pack: 'pro',
      tags: ['design', 'still', 'medium'],
      axes: { speed: 0.35, energy: 0.4, softness: 0.5, density: 0.45, brightness: 0.5 },
      style: {
        text: { size: 138, lineHeight: 1, letterSpacing: 0.08, align: 'center', maxWidth: 0.82 },
        palette: { name: 'aePoster', colors: ['#101010', '#1c1c1c', '#f5f0e6', '#e94f37', '#4d8dff', '#f2c14e'] },
        color: { fill: { kind: 'solid', value: '#f5f0e6', alpha: 1 } },
        layout: { type: 'stackedWords', params: { fillWidth: 0.7 } },
        location: { type: 'center', params: {} },
        animation: { type: 'stagger', params: { order: 'ltr', each: 0.06, unit: 'line' } },
        enter: { type: 'animator', params: { dy: 0.7, opacity: 0, scale: 1.06 }, motion: { in: { duration: 0.7, ease: 'quintOut' } } },
        hold: [
          { type: 'warp', params: { style: 'arc', bend: 0.22, animate: 'sway', speed: 0.25 } },
          { type: 'animator', params: { mode: 'float', dy: 0.015, freq: 0.15 } },
        ],
        exit: { type: 'animator', params: { dy: -0.6, opacity: 0 }, motion: { out: { duration: 0.5, ease: 'quintIn' } } },
        fill: { type: 'solid', params: {} },
        edge: [{ type: 'longShadow', params: { angle: 135, length: 0.2, fade: 0.6 } }],
        post: [
          { type: 'camera', params: { move: 'orbit', amount: 0.16, speed: 0.25 } },
          { type: 'filmGrain', params: { amount: 0.12, size: 1 } },
        ],
        background: { type: 'gradient4', params: { speed: 0.18, swirl: 0.25, blend: 1.8, jitter: 0.25 } },
      },
    },
    {
      id: 'neonPulse',
      name: 'ネオン・パルス',
      pack: 'pro',
      tags: ['neon', 'night', 'medium'],
      axes: { speed: 0.55, energy: 0.7, softness: 0.35, density: 0.4, brightness: 0.6 },
      style: {
        text: { size: 122, lineHeight: 1.1, letterSpacing: 0.03, align: 'center', maxWidth: 0.88 },
        palette: { name: 'aeNeon', colors: ['#07070c', '#12121c', '#fdf7ff', '#ff2d8f', '#22e0ff', '#b16bff'] },
        color: { fill: { kind: 'solid', value: '#fdf7ff', alpha: 1 }, stroke: { kind: 'solid', value: '#22e0ff', alpha: 1 } },
        layout: { type: 'row', params: { from: 'point' } },
        location: { type: 'center', params: {} },
        animation: { type: 'stagger', params: { order: 'center-out', each: 0.045, unit: 'letter' } },
        enter: { type: 'neonFlicker', params: { flickers: 6 }, motion: { in: { duration: 1, ease: 'linear' } } },
        hold: [
          { type: 'animator', params: { mode: 'pulse', scale: 0.04, freq: 1, sync: 'beat' } },
          { type: 'swirl', params: { angle: 8, freq: 2, speed: 0.8 } },
        ],
        exit: { type: 'animator', params: { opacity: 0, flash: 0.6 }, motion: { out: { duration: 0.35, ease: 'cubicIn' } } },
        fill: { type: 'solid', params: {} },
        edge: [{ type: 'neonGlow', params: { radius: 30, intensity: 1.5, bloom: true } }],
        post: [
          { type: 'camera', params: { move: 'zoomPunch', amount: 0.14, speed: 0.9, shake: 0.1 } },
          { type: 'bloom', params: { threshold: 0.45, intensity: 1.1, radius: 0.65 } },
          { type: 'strobeFlash', params: { bpm: 'audio', intensity: 0.22, duty: 0.1, color: [1, 0.85, 1, 1] } },
        ],
        background: { type: 'cellPattern', params: { kind: 'cracks', scale: 16, contrast: 1.4, dispersion: 0.6, evolution: 0.15, edge: 0.45 } },
      },
    },
    {
      id: 'inkPoem',
      name: '墨・ポエム',
      pack: 'pro',
      tags: ['washu', 'calm', 'slow'],
      axes: { speed: 0.25, energy: 0.3, softness: 0.75, density: 0.35, brightness: 0.35 },
      style: {
        text: { size: 108, lineHeight: 1.3, letterSpacing: 0.06, align: 'center', maxWidth: 0.78 },
        palette: { name: 'aeInk', colors: ['#f4efe6', '#e6ded0', '#1b1a17', '#8c2f22', '#3a4a52', '#b08d57'] },
        color: { fill: { kind: 'solid', value: '#1b1a17', alpha: 1 } },
        layout: { type: 'vertical', params: {} },
        location: { type: 'center', params: {} },
        animation: { type: 'stagger', params: { order: 'vertical-reading', each: 0.09, unit: 'word' } },
        enter: { type: 'animator', params: { dx: 0.6, opacity: 0, blur: 18 }, motion: { in: { duration: 1.1, ease: 'cubicOut' } } },
        hold: [
          { type: 'letterWarp', params: { style: 'ripple', amount: 0.12, freq: 2.4, animate: 'travel', speed: 0.35, perLetterPhase: 0.25 } },
          { type: 'animator', params: { mode: 'float', dy: 0.02, rotate: 0.4, freq: 0.18 } },
        ],
        exit: { type: 'animator', params: { dx: -0.5, opacity: 0, blur: 22 }, motion: { out: { duration: 0.9, ease: 'cubicIn' } } },
        fill: { type: 'ink', params: { scale: 1.2, threshold: 0.5, softness: 0.4 } },
        edge: [{ type: 'dropShadow', params: { offset: { x: 2, y: 3 }, blur: 6, opacity: 0.35 } }],
        post: [
          { type: 'camera', params: { move: 'handheld', amount: 0.1, speed: 0.3, shake: 0.06 } },
          { type: 'filmGrain', params: { amount: 0.22, size: 1.8 } },
          { type: 'vignette', params: { amount: 0.35, softness: 0.75 } },
        ],
        background: { type: 'fractalNoise', params: { scale: 1.8, stretch: 1.4, contrast: 0.55, brightness: 0.28, kind: 'abs', octaves: 4, ramp: 'two', evolution: 0.06, rate: 0.04, subInfluence: 0.25, subScale: 0.6, subRotation: 15, warp: 0.35 } },
      },
    },
    {
      id: 'epicWide',
      name: 'エピック・ワイド',
      pack: 'pro',
      tags: ['cinematic', 'wide', 'medium'],
      axes: { speed: 0.5, energy: 0.6, softness: 0.5, density: 0.4, brightness: 0.5 },
      style: {
        text: { size: 140, lineHeight: 1.02, letterSpacing: 0.12, align: 'center', maxWidth: 0.95 },
        palette: { name: 'aeEpic', colors: ['#080c14', '#101a2b', '#f7faff', '#ffb547', '#5b8cff', '#e06b8b'] },
        color: { fill: { kind: 'gradient', type: 'linear', angle: 90, stops: [{ color: '#f7faff' }, { color: '#ffb547' }] } },
        layout: { type: 'row', params: { curve: 0.2, curveDir: 'alternate' } },
        location: { type: 'center', params: {} },
        animation: { type: 'stagger', params: { order: 'edges-in', each: 0.055, unit: 'letter' } },
        enter: { type: 'animator', params: { scale: 1.35, opacity: 0, blur: 20, tilt: 10, axis: 'x' }, motion: { in: { duration: 1.15, ease: 'quartOut' } } },
        hold: [
          { type: 'letterWarp', params: { style: 'flag', amount: 0.1, freq: 1.2, animate: 'sway', speed: 0.3 } },
          { type: 'animator', params: { mode: 'float', dy: 0.02, freq: 0.16 } },
        ],
        exit: { type: 'animator', params: { scale: 1.5, opacity: 0, blur: 24 }, motion: { out: { duration: 0.8, ease: 'quartIn' } } },
        fill: { type: 'gradientSweep', params: { angle: 90, speed: 0.2 } },
        edge: [{ type: 'outline', params: { width: 2 } }, { type: 'dropShadow', params: { offset: { x: 0, y: 14 }, blur: 30, opacity: 0.55 } }],
        post: [
          { type: 'camera', params: { move: 'tilt', amount: 0.12, speed: 0.25 } },
          { type: 'anamorphicStreak', params: { threshold: 0.7, length: 0.6, intensity: 0.6, tint: [1, 0.8, 0.5, 1] } },
          { type: 'bloom', params: { threshold: 0.62, intensity: 0.6, radius: 0.5 } },
        ],
        background: { type: 'fractalNoise', params: { scale: 1.4, stretch: 2.2, contrast: 1.5, brightness: -0.25, kind: 'ridged', octaves: 6, ramp: 'four', evolution: 0.1, rate: 0.05, subInfluence: 0.4, subScale: 0.45, subRotation: -25, warp: 0.5 } },
      },
    },
    {
      id: 'vhsRewind',
      name: 'VHSリワインド',
      pack: 'pro',
      tags: ['retro', 'glitch', 'medium'],
      axes: { speed: 0.6, energy: 0.6, softness: 0.3, density: 0.5, brightness: 0.5 },
      style: {
        text: { size: 110, lineHeight: 1.12, letterSpacing: 0.04, align: 'center', maxWidth: 0.88 },
        palette: { name: 'aeVhs', colors: ['#0d0a12', '#1b1424', '#f6f0ff', '#4de0c0', '#ff5cd0', '#ffd166'] },
        color: { fill: { kind: 'solid', value: '#f6f0ff', alpha: 1 }, stroke: { kind: 'solid', value: '#ff5cd0', alpha: 1 } },
        layout: { type: 'row', params: { from: 'mirror' } },
        location: { type: 'center', params: {} },
        animation: { type: 'stagger', params: { order: 'oddEven', each: 0.05, unit: 'letter' } },
        enter: { type: 'animator', params: { dx: 0.9, dy: -0.2, skew: -14, opacity: 0, flash: 0.35 }, motion: { in: { duration: 0.6, ease: 'cubicOut' } } },
        hold: [
          { type: 'animator', params: { mode: 'wiggle', dy: 0.012, freq: 3, phase: 0.6 } },
          { type: 'letterWarp', params: { style: 'shearWave', amount: 0.06, freq: 1.6, animate: 'sway', speed: 0.9 } },
        ],
        exit: { type: 'animator', params: { dx: -0.9, skew: 16, opacity: 0 }, motion: { out: { duration: 0.45, ease: 'cubicIn' } } },
        fill: { type: 'solid', params: {} },
        edge: [{ type: 'outline', params: { width: 2, pattern: 'double', dashLength: 8 } }, { type: 'innerGlow', params: { color: '#4de0c0', radius: 8, intensity: 0.8 } }],
        post: [
          { type: 'camera', params: { move: 'panLeft', amount: 0.16, speed: 0.5, shake: 0.12 } },
          { type: 'vhsTracking', params: { amount: 0.38, noise: 0.28, rollSpeed: 0.4 } },
          { type: 'crt', params: { scanlines: 0.28, curvature: 0.12, vignette: 0.4 } },
          { type: 'chromaticAberration', params: { amount: 0.5, radial: 0.2, angle: 0 } },
        ],
        background: { type: 'gradient4', params: { speed: 0.35, swirl: 0.45, blend: 1.5, jitter: 0.5 } },
      },
    },
    {
      id: 'springDance',
      name: 'スプリング・ダンス',
      pack: 'pro',
      tags: ['cute', 'bouncy', 'fast'],
      axes: { speed: 0.75, energy: 0.8, softness: 0.6, density: 0.55, brightness: 0.8 },
      style: {
        text: { size: 118, lineHeight: 1.14, letterSpacing: 0.02, align: 'center', maxWidth: 0.88 },
        palette: { name: 'aeSpring', colors: ['#14102a', '#241a44', '#fffdf5', '#7ee081', '#ffb3d9', '#ffe066'] },
        color: { fill: { kind: 'gradient', type: 'linear', angle: 120, stops: [{ color: '#fffdf5' }, { color: '#7ee081' }] } },
        layout: { type: 'row', params: { from: 'point', curve: 0.3, curveDir: 'alternate' } },
        location: { type: 'center', params: {} },
        animation: { type: 'stagger', params: { order: 'ltr', each: 0.04, unit: 'letter' } },
        enter: { type: 'animator', params: { dy: 0.9, scale: 0.6, opacity: 0 }, motion: { in: { duration: 0.7, ease: 'bounceOut' } } },
        hold: [
          { type: 'squashStretch', params: { amount: 0.22, speed: 1.6, phase: 0.2 } },
          { type: 'animator', params: { mode: 'float', dy: 0.03, rotate: 1, freq: 0.6 } },
        ],
        exit: { type: 'animator', params: { dy: -1, scale: 0.7, opacity: 0, rotate: 10 }, motion: { out: { duration: 0.5, ease: 'backIn' } } },
        fill: { type: 'solid', params: {} },
        edge: [{ type: 'outline', params: { width: 3 } }, { type: 'dropShadow', params: { offset: { x: 0, y: 6 }, blur: 10, opacity: 0.4 } }],
        post: [
          { type: 'camera', params: { move: 'handheld', amount: 0.16, speed: 0.9, shake: 0.15 } },
          { type: 'sparkles', params: { count: 30, size: 2, shape: 'heart', color: [1, 0.7, 0.85, 1] } },
        ],
        background: { type: 'cellPattern', params: { kind: 'bubbles', scale: 10, contrast: 1.1, dispersion: 0.7, evolution: 0.25, edge: 0.2 } },
      },
    },
    {
      id: 'deepSpace',
      name: 'ディープ・スペース',
      pack: 'pro',
      tags: ['space', 'slow', 'cool'],
      axes: { speed: 0.45, energy: 0.5, softness: 0.6, density: 0.45, brightness: 0.4 },
      style: {
        text: { size: 106, lineHeight: 1.22, letterSpacing: 0.1, align: 'center', maxWidth: 0.84 },
        palette: { name: 'aeSpace', colors: ['#03040c', '#0a1024', '#eaf2ff', '#6f8cff', '#9fe8ff', '#c9a2ff'] },
        color: { fill: { kind: 'gradient', type: 'linear', angle: 90, stops: [{ color: '#eaf2ff' }, { color: '#9fe8ff' }] } },
        layout: { type: 'row', params: { from: 'depth' } },
        location: { type: 'center', params: {} },
        animation: { type: 'stagger', params: { order: 'center-out', each: 0.07, unit: 'letter' } },
        enter: { type: 'animator', params: { scale: 0.4, opacity: 0, blur: 30 }, motion: { in: { duration: 1.3, ease: 'expoOut' } } },
        hold: [
          { type: 'letterWarp', params: { style: 'taper', amount: 0.08, animate: 'travel', speed: 0.2 } },
          { type: 'animator', params: { mode: 'sine', scale: 0.02, rotate: 0.4, freq: 0.18 } },
        ],
        exit: { type: 'animator', params: { scale: 1.8, opacity: 0, blur: 34 }, motion: { out: { duration: 0.9, ease: 'expoIn' } } },
        fill: { type: 'solid', params: {} },
        edge: [{ type: 'neonGlow', params: { radius: 22, intensity: 1, bloom: true } }],
        post: [
          { type: 'camera', params: { move: 'pushIn', amount: 0.24, speed: 0.3 } },
          { type: 'bloom', params: { threshold: 0.55, intensity: 0.9, radius: 0.7 } },
          { type: 'twirl', params: { center: { x: 0.5, y: 0.5 }, radius: 0.9, angle: 8, spin: 2 } },
          { type: 'vignette', params: { amount: 0.5, softness: 0.6 } },
        ],
        background: { type: 'particleField', params: { kind: 'hyperspace', density: 40, size: 1.2, sizeVar: 0.8, layers: 4, speed: 0.85, direction: 90, twinkle: 0.55, softness: 0.4, base: 0 } },
      },
    },
    // --- selector driven stagings ---------------------------------------------
    // The range selector paints a band over the string: it sweeps the letters
    // through a wave (waveThrough), repaints them towards the accent colour
    // (karaokeSweep), opens the tracking (trackingTitle) or throws them in at
    // random (randomFlicker).
    {
      id: 'trackingTitle',
      name: 'トラッキング・タイトル',
      pack: 'pro',
      tags: ['cinematic', 'title', 'medium'],
      axes: { speed: 0.3, energy: 0.45, softness: 0.55, density: 0.3, brightness: 0.5, weird: 0.35 },
      style: {
        text: { size: 148, lineHeight: 1.02, letterSpacing: 0.3, align: 'center', maxWidth: 0.96 },
        palette: { name: 'proTitle', colors: ['#07090f', '#0f1522', '#f6f9ff', '#ffcf6a', '#7fa8ff', '#ff9ab0'] },
        color: { fill: { kind: 'gradient', type: 'linear', angle: 90, stops: [{ color: '#f6f9ff' }, { color: '#ffcf6a' }] } },
        layout: { type: 'row', params: {} },
        location: { type: 'center', params: {} },
        animation: { type: 'simultaneous' },
        enter: { type: 'tracking', params: { amount: 1.6, trackAxis: 'x' }, motion: { in: { duration: 1.4, ease: 'expoOut' } } },
        hold: [{ type: 'tracking', params: { amount: 0.06, mode: 'breathe', freq: 0.18, trackAxis: 'x' } }],
        exit: { type: 'tracking', params: { amount: 1.1, trackAxis: 'x' }, motion: { out: { duration: 0.8, ease: 'expoIn' } } },
        fill: { type: 'solid', params: {} },
        edge: [{ type: 'outline', params: { width: 2 } }, { type: 'neonGlow', params: { radius: 20, intensity: 0.9, bloom: true } }],
        post: [
          { type: 'shapeLayer', params: { shape: 'underline', drive: 'enter', stroke: 5, padding: 0.1, feather: 0.04, glow: 0.3 } },
          { type: 'camera', params: { move: 'pushIn', amount: 0.14, speed: 0.2 } },
          { type: 'anamorphicStreak', params: { threshold: 0.72, length: 0.5, intensity: 0.6 } },
          { type: 'filmGrain', params: { amount: 0.12, size: 1.1 } },
          { type: 'vignette', params: { amount: 0.45, softness: 0.55 } },
        ],
        background: { type: 'rays', params: { kind: 'lightRays', rays: 10, spin: 2, width: 0.25, softness: 0.8, center: { x: 0.5, y: 0.1 }, falloff: 0.45, noise: 0.2 } },
      },
    },
    {
      id: 'karaokeSweep',
      name: 'カラオケ・スイープ',
      pack: 'pro',
      tags: ['karaoke', 'highlight', 'medium'],
      axes: { speed: 0.5, energy: 0.55, softness: 0.6, density: 0.5, brightness: 0.7, weird: 0.55 },
      style: {
        text: { size: 116, lineHeight: 1.18, letterSpacing: 0.02, align: 'center', maxWidth: 0.88 },
        palette: { name: 'proKaraoke', colors: ['#0b0a14', '#171528', '#f2f3ff', '#ff7ad9', '#4de0c0', '#ffd166'] },
        color: { fill: { kind: 'solid', value: '#f2f3ff', alpha: 1 }, fill2: { kind: 'solid', value: '#ff7ad9', alpha: 1 } },
        layout: { type: 'row', params: {} },
        location: { type: 'karaoke', params: {} },
        animation: { type: 'stagger', params: { order: 'ltr', each: 0.03, unit: 'letter' } },
        enter: { type: 'animator', params: { dy: 0.3, opacity: 0, blur: 8 }, motion: { in: { duration: 0.6, ease: 'cubicOut' } } },
        hold: [
          { type: 'rangeSelector', params: { selBasedOn: 'letter', selShape: 'smooth', selStart: 0, selEnd: 0.18, selSweep: 'loop', selSpeed: 0.22, selEaseHigh: 60, selEaseLow: 60, colorMix: 1, scale: 1.08, blur: 2 } },
          { type: 'animator', params: { mode: 'float', dy: 0.02, freq: 0.2 } },
        ],
        exit: { type: 'animator', params: { dy: -0.4, opacity: 0, blur: 10 }, motion: { out: { duration: 0.5, ease: 'cubicIn' } } },
        fill: { type: 'solid', params: {} },
        edge: [{ type: 'outline', params: { width: 2, softness: 0.4 } }],
        post: [
          { type: 'shapeLayer', params: { shape: 'underline', drive: 'hold', speed: 0.25, stroke: 6, padding: 0.08, feather: 0.12, repeat: 1, glow: 0.45 } },
          { type: 'camera', params: { move: 'pushIn', amount: 0.08, speed: 0.16 } },
          { type: 'bloom', params: { threshold: 0.62, intensity: 0.6, radius: 0.5 } },
          { type: 'sparkles', params: { count: 24, size: 2, shape: 'star', color: [1, 0.85, 0.95, 1] } },
        ],
        background: { type: 'gradient4', params: { speed: 0.22, swirl: 0.3, blend: 1.6, jitter: 0.3 } },
      },
    },
    {
      id: 'waveThrough',
      name: 'ウェーブ・スルー',
      pack: 'pro',
      tags: ['soft', 'wave', 'medium'],
      axes: { speed: 0.5, energy: 0.5, softness: 0.75, density: 0.45, brightness: 0.6, weird: 0.6 },
      style: {
        text: { size: 112, lineHeight: 1.2, letterSpacing: 0.03, align: 'center', maxWidth: 0.86 },
        palette: { name: 'proWave', colors: ['#08111c', '#122238', '#eef8ff', '#5fd0ff', '#a98cff', '#7ef0c0'] },
        color: { fill: { kind: 'gradient', type: 'linear', angle: 100, stops: [{ color: '#eef8ff' }, { color: '#5fd0ff' }] } },
        layout: { type: 'wave', params: { amp: 0.05 } },
        location: { type: 'center', params: {} },
        animation: { type: 'stagger', params: { order: 'ltr', each: 0.05, unit: 'word' } },
        enter: { type: 'animator', params: { dy: 0.6, opacity: 0, blur: 18 }, motion: { in: { duration: 0.9, ease: 'quartOut' } } },
        hold: [
          { type: 'rangeSelector', params: { selBasedOn: 'letter', selShape: 'smooth', selStart: 0, selEnd: 0, selWidth: 0.3, selSweep: 'loop', selSpeed: 0.3, selEaseHigh: 40, selEaseLow: 40, dy: -0.7, scale: 1.12, blur: 3, tracking: 0.08 } },
          { type: 'letterWarp', params: { style: 'ripple', amount: 0.1, freq: 2.4, animate: 'travel', speed: 0.5, perLetterPhase: 0.2 } },
        ],
        exit: { type: 'animator', params: { dy: -0.5, opacity: 0, blur: 20 }, motion: { out: { duration: 0.7, ease: 'cubicIn' } } },
        fill: { type: 'gradientSweep', params: { angle: 30, speed: 0.3 } },
        edge: [{ type: 'neonGlow', params: { radius: 18, intensity: 0.8, bloom: true } }],
        post: [
          { type: 'camera', params: { move: 'orbit', amount: 0.14, speed: 0.25 } },
          { type: 'bloom', params: { threshold: 0.6, intensity: 0.7, radius: 0.55 } },
          { type: 'vignette', params: { amount: 0.4, softness: 0.65 } },
        ],
        background: { type: 'gradient4', params: { speed: 0.3, swirl: 0.5, blend: 1.3, jitter: 0.4 } },
      },
    },
    {
      id: 'randomFlicker',
      name: 'ランダム・フリッカー',
      pack: 'pro',
      tags: ['glitch', 'random', 'fast'],
      axes: { speed: 0.85, energy: 0.9, softness: 0.25, density: 0.6, brightness: 0.6, weird: 0.9 },
      style: {
        text: { size: 120, lineHeight: 1.08, letterSpacing: 0.02, align: 'center', maxWidth: 0.9 },
        palette: { name: 'proFlicker', colors: ['#05060a', '#101423', '#f4f8ff', '#37e0ff', '#ff2d8f', '#ffd23d'] },
        color: { fill: { kind: 'solid', value: '#f4f8ff', alpha: 1 }, fill2: { kind: 'solid', value: '#37e0ff', alpha: 1 } },
        layout: { type: 'row', params: { from: 'offscreenEdges' } },
        location: { type: 'center', params: {} },
        animation: { type: 'stagger', params: { order: 'random', each: 0.02, unit: 'letter' } },
        enter: { type: 'rangeReveal', params: { selBasedOn: 'letter', selShape: 'square', selRandom: true, selSeed: 0.35, opacity: 0, blur: 22, dy: 0.2, flash: 0.4, selEaseHigh: -20, selEaseLow: -20 }, motion: { in: { duration: 0.8, ease: 'linear' } } },
        hold: [
          { type: 'rangeSelector', params: { selBasedOn: 'letter', selShape: 'square', selStart: 0, selEnd: 0.25, selWidth: 0.2, selSweep: 'loop', selSpeed: 1.6, selRandom: true, selSeed: 0.6, opacity: 0.35, flash: 0.18, colorMix: 0.5 } },
          { type: 'animator', params: { mode: 'wiggle', dy: 0.02, freq: 8, phase: 1 } },
        ],
        exit: { type: 'animator', params: { opacity: 0, flash: 0.5, dx: 0.5 }, motion: { out: { duration: 0.35, ease: 'cubicIn' } } },
        fill: { type: 'solid', params: {} },
        edge: [{ type: 'outline', params: { width: 2, pattern: 'dashed', dashLength: 8, flow: 2 } }],
        post: [
          { type: 'camera', params: { move: 'handheld', amount: 0.2, speed: 1, shake: 0.2 } },
          { type: 'glitchSlice', params: { slices: 12, offset: 0.4, rate: 10 } },
          { type: 'strobeFlash', params: { bpm: 'audio', intensity: 0.22, duty: 0.08, color: [0.6, 0.95, 1, 1] } },
          { type: 'bloom', params: { threshold: 0.55, intensity: 0.8, radius: 0.6 } },
        ],
        background: { type: 'cellPattern', params: { kind: 'sparkle', scale: 14, contrast: 1.6, dispersion: 0.8, evolution: 0.5, edge: 0.35 } },
      },
    },
    {
      id: 'beatStrike',
      name: 'ビート・ストライク',
      pack: 'pro',
      tags: ['party', 'beat', 'fast'],
      axes: { speed: 0.9, energy: 1, softness: 0.2, density: 0.6, brightness: 0.75, weird: 0.75 },
      style: {
        text: { size: 126, lineHeight: 1.06, letterSpacing: 0.03, align: 'center', maxWidth: 0.9 },
        palette: { name: 'proStrike', colors: ['#0d0616', '#1c0f33', '#fff6ff', '#ffd23d', '#ff5c8a', '#5ce1ff'] },
        color: { fill: { kind: 'gradient', type: 'linear', angle: 60, stops: [{ color: '#fff6ff' }, { color: '#ffd23d' }] }, fill2: { kind: 'solid', value: '#ff5c8a', alpha: 1 } },
        layout: { type: 'row', params: {} },
        location: { type: 'center', params: {} },
        animation: { type: 'simultaneous' },
        enter: { type: 'animator', params: { scale: 0.5, opacity: 0, flash: 0.7 }, motion: { in: { duration: 0.3, ease: 'backOut' } } },
        hold: [{ type: 'rangeSelector', params: { selBasedOn: 'letter', selShape: 'triangle', selStart: 0, selEnd: 0, selWidth: 0.35, selSweep: 'beat', scale: 1.3, rotate: -6, flash: 0.3, colorMix: 0.8, selEaseHigh: 40, selEaseLow: 40 } }],
        exit: { type: 'animator', params: { scale: 1.5, opacity: 0, flash: 0.6 }, motion: { out: { duration: 0.3, ease: 'backIn' } } },
        fill: { type: 'solid', params: {} },
        edge: [{ type: 'outline', params: { width: 3.5 } }, { type: 'longShadow', params: { angle: 135, length: 0.16, fade: 0.7 } }],
        post: [
          { type: 'shapeLayer', params: { shape: 'strike', drive: 'beat', stroke: 6, padding: 0.04, feather: 0.06, glow: 0.4 } },
          { type: 'camera', params: { move: 'zoomPunch', amount: 0.22, speed: 1.1, shake: 0.15 } },
          { type: 'strobeFlash', params: { bpm: 'audio', intensity: 0.3, duty: 0.1, color: [1, 1, 0.9, 1] } },
          { type: 'bloom', params: { threshold: 0.55, intensity: 0.9, radius: 0.6 } },
        ],
        background: { type: 'rays', params: { kind: 'rays', rays: 16, spin: 14, width: 0.2, softness: 0.3, center: { x: 0.5, y: 0.45 }, falloff: 0.5, noise: 0.2 } },
      },
    },
    {
      id: 'impactBurst',
      name: 'インパクト・バースト',
      pack: 'pro',
      tags: ['impact', 'aggressive', 'fast'],
      axes: { speed: 0.95, energy: 1, softness: 0.15, density: 0.55, brightness: 0.7, weird: 0.8 },
      style: {
        text: { size: 134, lineHeight: 1.02, letterSpacing: 0.02, align: 'center', maxWidth: 0.92 },
        palette: { name: 'proImpact', colors: ['#0a0710', '#1a0f1e', '#fff4f0', '#ff6a2a', '#ffd166', '#ff2d5e'] },
        color: { fill: { kind: 'solid', value: '#fff4f0', alpha: 1 }, stroke: { kind: 'solid', value: '#ff6a2a', alpha: 1 } },
        layout: { type: 'row', params: { from: 'point' } },
        location: { type: 'center', params: {} },
        animation: { type: 'stagger', params: { order: 'center-out', each: 0.02, unit: 'letter' } },
        enter: { type: 'rangeReveal', params: { selBasedOn: 'letter', selShape: 'rampUp', selStart: 0, selEnd: 1, scale: 3, opacity: 0, blur: 14, flash: 0.8, selEaseHigh: 80, selEaseLow: 20 }, motion: { in: { duration: 0.45, ease: 'expoOut' } } },
        hold: [{ type: 'animator', params: { mode: 'pulse', scale: 0.05, freq: 1, sync: 'beat' } }],
        exit: { type: 'animator', params: { scale: 0.6, opacity: 0, blur: 16 }, motion: { out: { duration: 0.3, ease: 'expoIn' } } },
        fill: { type: 'solid', params: {} },
        edge: [{ type: 'outline', params: { width: 3 } }, { type: 'neonGlow', params: { radius: 24, intensity: 1.2, bloom: true } }],
        post: [
          { type: 'shapeLayer', params: { shape: 'burst', drive: 'enter', stroke: 3, padding: 0.02, repeat: 12, repeatScale: 1.6, repeatOpacity: 0.9, feather: 0.1, glow: 0.5 } },
          { type: 'camera', params: { move: 'zoomPunch', amount: 0.26, speed: 1.3, shake: 0.2 } },
          { type: 'shockwave', params: { center: { x: 0.5, y: 0.5 }, radius: 0.3, width: 0.08, strength: 0.7 } },
          { type: 'bloom', params: { threshold: 0.5, intensity: 1, radius: 0.65 } },
        ],
        background: { type: 'tunnel', params: { shape: 'hex', rings: 14, speed: 2.2, twist: 0.3, stripes: 16, fog: 0.6 } },
      },
    },
    {
      id: 'frameDraw',
      name: 'フレーム・ドロー',
      pack: 'pro',
      tags: ['design', 'reveal', 'medium'],
      axes: { speed: 0.4, energy: 0.45, softness: 0.6, density: 0.4, brightness: 0.55, weird: 0.7 },
      style: {
        text: { size: 98, lineHeight: 1.3, letterSpacing: 0.04, align: 'left', maxWidth: 0.78 },
        palette: { name: 'proFrame', colors: ['#0c0c10', '#181820', '#f7f7fb', '#7c9cff', '#e0b070', '#9fe8ff'] },
        color: { fill: { kind: 'solid', value: '#f7f7fb', alpha: 1 }, fill2: { kind: 'solid', value: '#7c9cff', alpha: 1 } },
        layout: { type: 'row', params: { from: 'point' } },
        location: { type: 'lowerThird', params: {} },
        animation: { type: 'stagger', params: { order: 'ltr', each: 0.05, unit: 'word' } },
        enter: { type: 'rangeReveal', params: { selBasedOn: 'word', selShape: 'round', selStart: 0, selEnd: 1, dy: 0.35, opacity: 0, blur: 10 }, motion: { in: { duration: 0.9, ease: 'quartOut' } } },
        hold: [
          { type: 'rangeSelector', params: { selBasedOn: 'word', selShape: 'smooth', selStart: 0, selEnd: 0, selWidth: 0.4, selSweep: 'pingpong', selSpeed: 0.18, colorMix: 0.55, selEaseHigh: 70, selEaseLow: 70 } },
          { type: 'animator', params: { mode: 'float', dy: 0.015, freq: 0.16 } },
        ],
        exit: { type: 'rangeReveal', params: { selBasedOn: 'word', selShape: 'rampDown', dy: -0.25, opacity: 0, blur: 12 }, motion: { out: { duration: 0.7, ease: 'cubicIn' } } },
        fill: { type: 'solid', params: {} },
        edge: [{ type: 'outline', params: { width: 2, softness: 0.5 } }],
        post: [
          { type: 'shapeLayer', params: { shape: 'box', drive: 'enter', stroke: 3.5, padding: 0.14, feather: 0.02, glow: 0.25 } },
          { type: 'camera', params: { move: 'panRight', amount: 0.1, speed: 0.2 } },
          { type: 'filmGrain', params: { amount: 0.14, size: 1.2 } },
          { type: 'vignette', params: { amount: 0.4, softness: 0.7 } },
        ],
        background: { type: 'fractalNoise', params: { scale: 2.2, stretch: 1.2, contrast: 1.3, brightness: -0.2, kind: 'abs', octaves: 5, ramp: 'three', evolution: 0.1, rate: 0.05, subInfluence: 0.3, subScale: 0.6, subRotation: 20, warp: 0.4 } },
      },
    },
    {
      id: 'bracketCallout',
      name: 'ブラケット・コールアウト',
      pack: 'pro',
      tags: ['design', 'callout', 'medium'],
      axes: { speed: 0.5, energy: 0.5, softness: 0.6, density: 0.45, brightness: 0.6, weird: 0.65 },
      style: {
        text: { size: 96, lineHeight: 1.3, letterSpacing: 0.06, align: 'center', maxWidth: 0.8 },
        palette: { name: 'proBracket', colors: ['#080b12', '#121a28', '#eef4ff', '#4de0c0', '#ffd166', '#7c9cff'] },
        color: { fill: { kind: 'solid', value: '#eef4ff', alpha: 1 }, fill2: { kind: 'solid', value: '#4de0c0', alpha: 1 } },
        layout: { type: 'row', params: {} },
        location: { type: 'lowerThird', params: {} },
        animation: { type: 'stagger', params: { order: 'word', each: 0.08, unit: 'word' } },
        enter: { type: 'tracking', params: { amount: 1.2, trackAxis: 'x' }, motion: { in: { duration: 0.9, ease: 'quartOut' } } },
        hold: [
          { type: 'tracking', params: { amount: 0.05, mode: 'beat', trackAxis: 'x' } },
          { type: 'rangeSelector', params: { selBasedOn: 'word', selShape: 'square', selStart: 0, selEnd: 0.34, selWidth: 0.34, selSweep: 'loop', selSpeed: 0.35, colorMix: 0.7, scale: 1.06 } },
        ],
        exit: { type: 'animator', params: { dx: -0.4, opacity: 0, blur: 8 }, motion: { out: { duration: 0.5, ease: 'cubicIn' } } },
        fill: { type: 'solid', params: {} },
        edge: [{ type: 'outline', params: { width: 2, pattern: 'double', dashLength: 12 } }],
        post: [
          { type: 'shapeLayer', params: { shape: 'brackets', drive: 'enter', stroke: 4, padding: 0.12, feather: 0.05, glow: 0.3 } },
          { type: 'camera', params: { move: 'handheld', amount: 0.12, speed: 0.4, shake: 0.08 } },
          { type: 'bloom', params: { threshold: 0.62, intensity: 0.55, radius: 0.5 } },
        ],
        background: { type: 'perspectiveGrid', params: { sun: 'none', horizon: 0.68, spacing: 0.18, speed: 0.4, lineWidth: 1, glow: 0.7, fog: 0.65, sunSize: 0 } },
      },
    },
  ];



  let genreCache = null;

  function buildGenrePresets() {
    if (genreCache) return genreCache;
    if (typeof SA === 'undefined' || !SA.moods || !SA.genres) return [];
    genreCache = GENRE_PRESETS.map((entry) => {
      const genre = SA.genres.get(entry.genre);
      const generated = SA.moods.generate({ genre: entry.genre, axes: genre && genre.axes, seed: 1, ensureSignature: false });
      const style = JSON.parse(JSON.stringify(generated.style));
      const signature = ((genre && genre.signature) || []).find((item) => item.id === entry.signature);
      if (signature && signature.patch) {
        for (const [key, value] of Object.entries(signature.patch)) {
          style[key] = SA.project && SA.project.mergeDeep ? SA.project.mergeDeep(style[key] || {}, value) : value;
        }
      }
      return { id: entry.id, label: `fx.preset.${entry.id}`, genre: entry.genre, style };
    });
    return genreCache;
  }

  function allPresets() {
    return [...LIST, ...BG_PRESETS, ...buildGenrePresets(), ...STAGED_LOOKS];
  }

  // `options.packs` filters by pack ('all' includes everything). The default is
  // the unpacked presets, so the FX 400 / 800 catalogs keep the exact preset
  // list they were sampled from; the staged looks join the No.801+ extension.
  function packMatches(entry, packs) {
    if (packs === 'all') return true;
    if (!packs) return !entry.pack;
    const list = Array.isArray(packs) ? packs : [packs];
    if (list.includes('all')) return true;
    return list.includes(entry.pack);
  }

  function list(options) {
    const packs = options && options.packs;
    return allPresets()
      .filter((entry) => packMatches(entry, packs))
      .map((entry) => ({
        id: entry.id,
        label: entry.label,
        name: entry.name || entry.id,
        pack: entry.pack || null,
        tags: [...(entry.tags || [])],
        axes: entry.axes ? { ...entry.axes } : null,
        style: JSON.parse(JSON.stringify(entry.style)),
      }));
  }

  function get(id) {
    return allPresets().find((entry) => entry.id === id) || null;
  }

  function labelFor(preset) {
    const key = preset.label || `fx.preset.${preset.id}`;
    if (typeof SA !== 'undefined' && SA.i18n && SA.controls) {
      const translated = SA.i18n.t(key);
      if (translated !== key) return translated;
      if (preset.name) return preset.name;
      return SA.controls.prettify(preset.id);
    }
    return preset.name || preset.id;
  }

  return { list, get, labelFor, STAGED_LOOKS };
});
