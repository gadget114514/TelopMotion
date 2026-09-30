(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng'), require('./effects/registry'), require('../color'), require('./genres'), require('./pattern-variants'), require('./smartness'), require('./weird'), require('./fx-axes'), require('./legibility'), require('./palette-roles'), require('./textflow'), require('./gen-params'));
  else {
    root.SA = root.SA || {};
    root.SA.moods = factory(root.SA.rng, root.SA.fx, root.SA.color, root.SA.genres, root.SA.patternVariants, root.SA.smartness, root.SA.weird, root.SA.fxAxes, root.SA.legibility, root.SA.paletteRoles, root.SA.textflow, root.SA.genParams);
  }
})(typeof self !== 'undefined' ? self : this, function (rng, fx, color, genres, patternVariants, smartness, weirdMod, fxAxes, legibilityMod, paletteRoles, textflowMod, genParamsMod) {
  'use strict';

  // `weird` is the sixth axis: how far a song strays from one look. At 0 the
  // whole song keeps the drawn look; towards 1 more and more cues draw a look
  // of their own (the FX 800 demo shows one per cue). The looks themselves are
  // classified on the first five only (MATCH_AXES).
  // `smartness` is the seventh: how much cheap-looking grammar (per-beat pulse,
  // vignette, ribbon, centre spotlight...) is dropped. 0 is the engine default
  // and disables the filter, so every existing draw stays byte-identical.
  // `fear` is the eighth: how strongly the draw prefers the horror side. It is
  // rated for every effect in `renderer/data/fx-axes.json`; 0 is the engine
  // default and multiplies every weight by 1.
  const AXES = ['speed', 'energy', 'softness', 'density', 'brightness', 'weird', 'smartness', 'fear'];
  const MATCH_AXES = ['speed', 'energy', 'softness', 'density', 'brightness'];
  const AXIS_DEFAULTS = { weird: 0, smartness: 0, fear: 0 };

  // The UI and the project entry points open at 0.7; the engine keeps 0 as the
  // "not specified" default so old projects and the existing tests draw exactly
  // as before.
  const WEIRD_DEFAULT = 0.7;
  const SMART_DEFAULT = smartness.SMART_DEFAULT;

  function has(v) {
    return v != null && v !== '' && Number.isFinite(Number(v));
  }

  const CJK_RE = /[\u3000-\u9fff\uff00-\uffef]/;

  // Word count for the legibility hold: the same tokenizer the beat analysis
  // uses (TinySegmenter / Intl.Segmenter), counting word-like segments only.
  function countWords(text) {
    const source = String(text == null ? '' : text);
    if (!source.trim()) return 0;
    const segments = textflowMod && typeof textflowMod.segmentWords === 'function' ? textflowMod.segmentWords(source, CJK_RE.test(source) ? 'ja' : 'en') : source.split(/\s+/);
    let count = 0;
    for (const segment of segments) {
      if (!segment || /^\s+$/.test(segment)) continue;
      if (CJK_RE.test(segment) || /[A-Za-z0-9]/.test(segment)) count += 1;
    }
    return count;
  }

  function weirdOf(axes) {
    return axes && has(axes.weird) ? clamp01(axes.weird) : 0;
  }

  // The two channels the raw axis feeds: the text side is tamed (raw 1 draws
  // what raw 0.7 used to), the backdrop side saturates at raw 0.4.
  function textWeirdOf(axes) {
    return weirdMod.text(weirdOf(axes));
  }

  function bgWeirdOf(axes) {
    return weirdMod.bg(weirdOf(axes));
  }

  function projectWeird(project) {
    const axes = project && project.styleMode && project.styleMode.axes;
    return axes && has(axes.weird) ? clamp01(axes.weird) : WEIRD_DEFAULT;
  }

  // the eighth axis: the engine default is 0 (no horror preference), so every
  // existing project and draw stays exactly as before
  function fearOf(axes) {
    return fxAxes && typeof fxAxes.fearOf === 'function' ? fxAxes.fearOf(axes) : axes && has(axes.fear) ? clamp01(axes.fear) : 0;
  }

  function projectFear(project) {
    return fxAxes && typeof fxAxes.projectFear === 'function' ? fxAxes.projectFear(project) : project && project.styleMode && project.styleMode.axes && has(project.styleMode.axes.fear) ? clamp01(project.styleMode.axes.fear) : 0;
  }

  // the seventh axis: the engine default is 0 (no filtering); the UI default is
  // SMART_DEFAULT so new generation opens smart
  function smartOf(axes) {
    return smartness.smartOf(axes);
  }

  function projectSmartness(project) {
    return smartness.projectSmartness(project);
  }

  // Bend the premise `base` towards `alt` by w; `breaks` drops the premise with
  // probability w·k. Both consume no random while w is 0, so weird 0 stays
  // byte-identical to the classic draw.
  function bend(base, alt, w) {
    return w > 0 ? base + (alt - base) * w : base;
  }

  function breaks(random, w, k) {
    return w > 0 && random() < Math.min(1, w * (k == null ? 1 : k));
  }

  function signed(random) {
    return random() < 0.5 ? -1 : 1;
  }

  function shuffle(random, list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function clampParam(group, type, key, value) {
    const d = fx.get(group, type);
    const p = d && (d.params || []).find((x) => x.key === key);
    if (!p) return value;
    const lo = p.min == null ? -Infinity : p.min;
    const hi = p.max == null ? Infinity : p.max;
    const v = Math.max(lo, Math.min(hi, value));
    return p.kind === 'int' ? Math.round(v) : round(v, Math.abs(v) < 0.1 ? 4 : 2);
  }

  // human pick: a small vector that constrains the generator
  const PRESETS = [
    { id: 'ballad', axes: { speed: 0.15, energy: 0.15, softness: 0.85, density: 0.35, brightness: 0.45 } },
    { id: 'cinematic', axes: { speed: 0.25, energy: 0.35, softness: 0.6, density: 0.4, brightness: 0.4 } },
    { id: 'cute', axes: { speed: 0.6, energy: 0.45, softness: 0.75, density: 0.5, brightness: 0.85 } },
    { id: 'electro', axes: { speed: 0.7, energy: 0.65, softness: 0.35, density: 0.6, brightness: 0.9 } },
    { id: 'rock', axes: { speed: 0.9, energy: 0.9, softness: 0.15, density: 0.75, brightness: 0.75 } },
    { id: 'washu', axes: { speed: 0.35, energy: 0.3, softness: 0.7, density: 0.25, brightness: 0.5 }, direction: 'vertical' },
  ];

  const GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background'];
  const STACK_GROUPS = ['hold', 'edge', 'post'];
  const SINGLE_GROUPS = ['animation', 'layout', 'enter', 'exit', 'location', 'fill'];
  const THEME_TEXT_GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color'];

  // curated pools: readable, line-level presentation only, so a lyric video stays a lyric video
  // [energy, softness] and optional flags
  const TRAITS = {
    animation: {
      stagger: [0.5, 0.85],
      followThrough: [0.55, 0.75],
      loop: [0.5, 0.6],
      simultaneous: [0.6, 0.4],
      cascade: [0.7, 0.45],
      spring: [0.75, 0.5],
      timeWarp: [0.8, 0.3],
      stopMotion: [0.95, 0.1],
    },
    // whole lines / phrases only: words stay together and in reading order
    layout: {
      row: [0.5, 0.85],
      stackedWords: [0.45, 0.8],
      wave: [0.55, 0.75],
      vertical: [0.25, 0.85, { vertical: true, maxLetters: 14 }],
      arc: [0.45, 0.7, { maxLetters: 24 }],
      circle: [0.5, 0.6, { maxLetters: 24 }],
      diagonal: [0.55, 0.6],
      grid: [0.5, 0.55, { maxLetters: 32 }],
      staircase: [0.6, 0.5],
      spiral: [0.7, 0.45, { maxLetters: 24 }],
      path: [0.6, 0.5],
      scatter: [0.8, 0.3, { maxLetters: 20 }],
    },
    enter: {
      fade: [0.2, 0.9],
      blurIn: [0.2, 1],
      waveRise: [0.45, 0.8],
      slide: [0.5, 0.7],
      flip3D: [0.6, 0.5],
      zoomIn: [0.6, 0.5],
      rotateIn: [0.6, 0.6],
      elasticPop: [0.7, 0.6],
      noiseDissolveIn: [0.7, 0.4],
      particlesAssemble: [0.75, 0.5],
      dropBounce: [0.75, 0.35],
      neonFlicker: [0.8, 0.4],
      flickerIn: [0.85, 0.15],
      shatterRebuild: [0.95, 0.1],
      glitchIn: [1, 0.05],
    },
    exit: {
      fade: [0.2, 0.9],
      blurOut: [0.2, 1],
      shrinkToCenter: [0.4, 0.7],
      wipe: [0.45, 0.65],
      slide: [0.5, 0.65],
      dissolve: [0.6, 0.5],
      zoomOut: [0.6, 0.5],
      gravityFall: [0.8, 0.2],
      particlesDisperse: [0.8, 0.3],
      melt: [0.85, 0.15],
      burnAway: [0.95, 0.1],
      explode: [1, 0.05],
      creepOut: [0.8, 0.2],
    },
    hold: {
      breathing: [0.2, 0.9],
      kenBurns: [0.25, 0.8],
      floatBob: [0.3, 0.85],
      drift: [0.35, 0.85],
      sway: [0.4, 0.8],
      sineWave: [0.45, 0.8],
      pathFollow: [0.5, 0.6],
      twist: [0.6, 0.5, { minEnergy: 0.72 }],
      jelly: [0.7, 0.4],
      wobbleWarp: [0.75, 0.3, { minEnergy: 0.72 }],
      pulse: [0.8, 0.2],
      jitter: [0.95, 0.1, { minEnergy: 0.72 }],
      heartbeat: [0.5, 0.85],
      shiver: [0.9, 0.15],
    },
    location: {
      center: [0.4, 0.7],
      stacked: [0.45, 0.7],
      lowerThird: [0.4, 0.8],
      upperThird: [0.4, 0.8],
      badgeAnchored: [0.5, 0.6, { needsBadge: true }],
    },
    fill: {
      solid: [0.45, 0.9],
      categoryColor: [0.5, 0.75],
      glass: [0.45, 0.92],
      caustics: [0.5, 0.85],
      gradientSweep: [0.6, 0.6],
      holographic: [0.65, 0.55, { minEnergy: 0.72 }],
      rainbowFlow: [0.7, 0.5, { minEnergy: 0.72 }],
      chrome: [0.8, 0.15],
      goldFoil: [0.8, 0.15],
      ink: [0.4, 0.7],
      fire: [1, 0.05, { minEnergy: 0.72 }],
    },
    edge: {
      dropShadow: [0.35, 0.88],
      innerGlow: [0.6, 0.78],
      neonGlow: [0.85, 0.5],
      outline: [0.6, 0.3],
      longShadow: [0.7, 0.25],
      bevel: [0.75, 0.2],
      extrude: [0.85, 0.12],
      drip: [0.8, 0.3],
    },
    post: {
      vignette: [0.25, 0.9],
      filmGrain: [0.3, 0.8],
      colorGrade: [0.4, 0.7],
      sparkles: [0.5, 0.7],
      halftone: [0.6, 0.4],
      heatHaze: [0.5, 0.5, { minEnergy: 0.72 }],
      lightLeak: [0.62, 0.65],
      lightSweep: [0.78, 0.45],
      lensDistortion: [0.6, 0.4, { minEnergy: 0.72 }],
      zoomBlur: [0.6, 0.5, { minEnergy: 0.72 }],
      pixelate: [0.7, 0.3],
      chromaticAberration: [0.7, 0.3],
      crt: [0.7, 0.3, { minEnergy: 0.72 }],
      rgbShift: [0.8, 0.2, { minEnergy: 0.72 }],
      digitalNoise: [0.85, 0.15],
      glitchBlocks: [0.95, 0.1],
    },
    background: {
      noiseGradient: [0.4, 0.8],
      solid: [0.4, 0.6],
      shapes: [0.5, 0.6],
      pattern: [0.5, 0.6],
      card: [0.5, 0.7, { needsCard: true }],
    },
  };

  // --- sixth axis: `weird` ------------------------------------------------------
  // The extended primitives are *not* in the default pool (the earlier catalogs
  // were sampled from the tables above). They open up as the sixth axis rises:
  // `weird` says how far a look may stray, so a calm ballad never draws a
  // turbulent, glitch-heavy or camera-flying staging while a weird-heavy song
  // does. Each entry carries its own profile: [energy, softness, flags, weird].
  //   flags.minWeird / maxWeird   gate the type by the sixth axis
  //   flags.minEnergy / maxEnergy gate it by how loud the mood is
  const EXT_REVEAL = 0.35;
  const EXT_TRAITS = {
    enter: {
      animator: [0.5, 0.6, {}, 0.45],
      rangeReveal: [0.45, 0.75, {}, 0.6],
      tracking: [0.3, 0.9, {}, 0.55],
      megaZoomIn: [0.8, 0.3, { minWeird: 0.55 }, 0.8],
      gravityDrop: [0.7, 0.5, {}, 0.55],
    },
    exit: {
      animator: [0.5, 0.6, {}, 0.45],
      rangeReveal: [0.45, 0.75, {}, 0.6],
      tracking: [0.3, 0.9, {}, 0.55],
      megaZoomOut: [0.8, 0.3, { minWeird: 0.55 }, 0.8],
    },
    hold: {
      animator: [0.4, 0.7, {}, 0.4],
      rangeSelector: [0.45, 0.65, {}, 0.7],
      warp: [0.55, 0.4, { minWeird: 0.55 }, 0.9],
      letterWarp: [0.6, 0.45, { minWeird: 0.5 }, 0.85],
      fontSize: [0.75, 0.3, { minWeird: 0.6 }, 0.85],
      fillScreen: [0.85, 0.25, { minWeird: 0.6 }, 0.9],
      squashStretch: [0.8, 0.4, { minWeird: 0.5 }, 0.75],
      swirl: [0.7, 0.35, { minWeird: 0.55 }, 0.8],
      softBody: [0.5, 0.9, { minWeird: 0.55 }, 0.9],
      gravityHang: [0.35, 0.8, { minWeird: 0.5 }, 0.65],
    },
    fill: {
      marble: [0.55, 0.5, { minWeird: 0.4 }, 0.75],
    },
    post: {
      camera: [0.55, 0.5, {}, 0.7],
      waveWarp: [0.6, 0.5, { minWeird: 0.6 }, 0.85],
      twirl: [0.65, 0.4, { minWeird: 0.6 }, 0.85],
      turbulentDisplace: [0.7, 0.35, { minWeird: 0.6 }, 0.9],
      spinBlur: [0.75, 0.4, { minWeird: 0.5 }, 0.8],
      strobeFlash: [0.95, 0.1, { minWeird: 0.6, minEnergy: 0.6 }, 0.9],
      anamorphicStreak: [0.7, 0.4, { minWeird: 0.5 }, 0.75],
      radialWipe: [0.6, 0.5, { minWeird: 0.55 }, 0.8],
      venetianBlinds: [0.65, 0.45, { minWeird: 0.55 }, 0.85],
      echoTrail: [0.7, 0.4, { minWeird: 0.75 }, 0.9],
      glitchSlice: [0.9, 0.1, { minWeird: 0.75 }, 0.95],
      godRays: [0.6, 0.6, { minWeird: 0.75 }, 0.7],
      lensFlare: [0.6, 0.6, { minWeird: 0.75 }, 0.65],
    },
    background: {
      fractalNoise: [0.35, 0.8, { minWeird: 0.5 }, 0.6],
      rays: [0.6, 0.5, { minWeird: 0.5 }, 0.7],
      gradient4: [0.4, 0.7, { minWeird: 0.5 }, 0.65],
      cellPattern: [0.55, 0.45, { minWeird: 0.55 }, 0.8],
      particleField: [0.5, 0.6, { minWeird: 0.5 }, 0.75],
      perspectiveGrid: [0.6, 0.4, { minWeird: 0.55 }, 0.85],
      tunnel: [0.7, 0.3, { minWeird: 0.6 }, 0.9],
    },
  };

  // How weird each classic primitive reads. Only consulted while w > 0 (a w of
  // 0 must keep the classic scoring), so the table never touches the default
  // draw. An effect without its own entry falls back to energy - softness.
  const CLASSIC_WEIRD = {
    fill: { solid: 0, categoryColor: 0.15, glass: 0.35, caustics: 0.55, ink: 0.4, gradientSweep: 0.45, chrome: 0.6, goldFoil: 0.55, holographic: 0.8, rainbowFlow: 0.85, fire: 0.9 },
    edge: { dropShadow: 0, innerGlow: 0.3, outline: 0.35, neonGlow: 0.7, longShadow: 0.6, bevel: 0.5, extrude: 0.75, drip: 0.85 },
  };

  // Effects the automatic picker normally refuses (overlap / degrade) that a
  // weird look may still draw: the text stays readable.
  const WEIRD_TAG_OK = new Set(['echoTrail', 'glitchSlice', 'godRays', 'lensFlare', 'anamorphicStreak', 'halftone', 'lightLeak', 'staircase', 'path']);

  // The readable end of the tag-gated pool a fear-heavy look may draw: glitch
  // and dissolve entrances / exits and the frame effects that separate the
  // text from the background instead of mangling its glyphs.
  const FEAR_TAG_OK = new Set([
    'glitchIn', 'flickerIn', 'scramble', 'shatterRebuild', 'noiseDissolveIn', 'particlesAssemble',
    'dissolve', 'melt', 'burnAway', 'creepOut', 'particlesDisperse', 'gravityFall',
    'echoTrail', 'glitchSlice', 'vhsTracking', 'scanTear', 'rgbShift', 'chromaticAberration',
    'noiseDissolve', 'directionalDissolve', 'pixelDissolve', 'burnDissolve', 'halftoneDissolve', 'particleDissolve',
    'lightLeak', 'lensFlare', 'godRays', 'anamorphicStreak', 'halftone', 'staircase', 'path',
  ]);

  // the fear multiplier of one effect at a target: 1 while fear is 0, 0 when the
  // effect is far too harmless for the target, > 1 for the scary side
  function fearWeightOf(group, type, axes) {
    if (!fxAxes || typeof fxAxes.fearFactor !== 'function') return 1;
    return fxAxes.fearFactor(fxAxes.of(group, type), axes);
  }

  // Hue systems only: the brightness axis decides how light the background is
  // and whether the text is bright or dark. Roles: 0 background, 1 background 2,
  // 2 text, 3 accent, 4 stroke, 5 accent 2.
  const PALETTE_FAMILIES = {
    night: { energy: 0.3, bgHue: 225, accentHue: 215 },
    mono: { energy: 0.35, bgHue: 220, accentHue: 225 },
    gold: { energy: 0.45, bgHue: 35, accentHue: 42 },
    pastel: { energy: 0.35, bgHue: 295, accentHue: 325 },
    warm: { energy: 0.6, bgHue: 25, accentHue: 30 },
    neon: { energy: 0.75, bgHue: 265, accentHue: 190 },
    rose: { energy: 0.55, bgHue: 330, accentHue: 345 },
    ocean: { energy: 0.4, bgHue: 205, accentHue: 165 },
    // genre-only families: fixed hues and forced light levels. The fear axis
    // opens the horror trio to every genre.
    blood: { energy: 0.5, bgHue: 355, accentHue: 0, genreOnly: true, fear: 1, bgS: 0.55, bgV: [0.03, 0.08], textHue: 40, textS: 0.12, accentS: 0.9, accentV: 0.55 },
    ash: { energy: 0.35, bgHue: 90, accentHue: 60, genreOnly: true, fear: 0.8, bgS: 0.12, bgV: [0.1, 0.2], textS: 0.08, accentS: 0.25, accentV: 0.5 },
    blush: { energy: 0.35, bgHue: 340, accentHue: 348, genreOnly: true, bgS: 0.18, bgV: [0.92, 0.98], textHue: 345, textS: 0.6, accentS: 0.55, accentV: 0.95 },
    sunset: { energy: 0.5, bgHue: 20, accentHue: 330, genreOnly: true, bgS: 0.55, accentS: 0.65 },
    rain: { energy: 0.3, bgHue: 212, accentHue: 200, genreOnly: true, fear: 0.7, bgS: 0.25, accentS: 0.3, accentV: 0.7 },
    festival: { energy: 0.8, bgHue: 45, accentHue: 355, genreOnly: true, bgS: 0.7, accentS: 0.9, accentV: 0.95 },
  };
  const PALETTES = PALETTE_FAMILIES;

  const FONTS = {
    soft: ['NotoSerif-Regular', 'NotoSans-Regular', 'NotoSansJP-Regular'],
    plain: ['NotoSans-Regular', 'NotoSansJP-Regular', 'NotoSans-Bold'],
    hard: ['DelaGothicOne-Regular', 'NotoSans-Bold', 'NotoSansJP-Bold'],
    latinHard: ['BebasNeue-Regular', 'DelaGothicOne-Regular', 'NotoSans-Bold'],
    // the CJK soft / pop families: the bundled display faces the moods
    // generator can actually load (the latin serif / script names it used to
    // ask for are not bundled, so they always fell back to Noto Sans)
    softCjk: ['NotoSerifJP-Regular', 'ZenMaruGothic-Regular', 'KleeOne-Regular'],
    popCjk: ['RocknRollOne-Regular', 'ZenMaruGothic-Regular'],
  };

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0.5;
    return Math.max(0, Math.min(1, number));
  }

  function normalizeAxes(axes) {
    const source = axes || {};
    const out = {};
    for (const key of AXES) out[key] = clamp01(source[key] == null ? axisDefault(key) : source[key]);
    return out;
  }

  function axisDefault(key) {
    return AXIS_DEFAULTS[key] == null ? 0.5 : AXIS_DEFAULTS[key];
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function round(value, digits) {
    const factor = Math.pow(10, digits == null ? 2 : digits);
    return Math.round(value * factor) / factor;
  }

  function pick(random, list) {
    if (!list || !list.length) return undefined;
    return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  }

  function allowed(group, traits, context, direction, axes, type, options) {
    const flags = traits[2] || {};
    const w = textWeirdOf(axes);
    // a weird look may cross the vertical / horizontal layout boundary (a
    // vertical layout in a horizontal song and the other way round)
    const cross = w >= 0.7 && (!flags.vertical || context.letterCount <= 14);
    if (direction === 'vertical' && group === 'layout' && !flags.vertical && !cross) return false;
    if (direction === 'horizontal' && group === 'layout' && flags.vertical && !cross) return false;
    if (flags.needsCard && !context.hasCard) return false;
    if (flags.needsBadge && !context.badgeId) return false;
    if (flags.maxLetters != null && context.letterCount > flags.maxLetters * (1 + w)) return false;
    // effects that only look good loud are gated behind high energy; a weird
    // look loosens the gate
    if (flags.minEnergy != null && (!axes || axes.energy < flags.minEnergy - 0.4 * w)) return false;
    // the sixth axis gates the extended primitives: a calm look never draws a
    // turbulent or glitch-heavy effect, a weird-heavy one can
    if (flags.minWeird != null && (!axes || textWeirdOf(axes) < flags.minWeird)) return false;
    if (flags.maxWeird != null && axes && textWeirdOf(axes) > flags.maxWeird) return false;
    if (flags.maxEnergy != null && axes && clamp01(axes.energy) > flags.maxEnergy) return false;
    // the seventh axis drops the tacky end of the pool. The genre's hero group
    // is exempt: it takes the weight penalty but keeps the genre's identity.
    const s = smartOf(axes);
    if (!(options && options.hero) && type != null && !smartness.ok(group, type, s)) return false;
    // the eighth axis: an effect far below the target's fear level is excluded
    if (type != null && fearOf(axes) > 0) {
      const fw = fearWeightOf(group, type, axes);
      if (!(fw > 0)) return false;
    }
    return true;
  }

  // softness owns the texture: how the effect looks, not how loud it is.
  // energy only nudges the pick inside that family (and gates the loud effects
  // through `allowed`), so the two axes stay readable. `weird` matches how far
  // the effect strays from a plain line of text: a classic primitive reads its
  // own weird value (CLASSIC_WEIRD) once the axis is on.
  function scoreEntry(traits, axes, group, type) {
    const w = textWeirdOf(axes);
    const energy = traits[0];
    const softness = traits[1];
    const own = traits[3];
    const table = group && CLASSIC_WEIRD[group];
    const tw = own != null ? own : w > 0 ? (table && table[type] != null ? table[type] : Math.max(0, traits[0] - traits[1]) * 0.8) : 0;
    const texture = 1 - Math.abs(softness - axes.softness) / 1.15;
    const force = 1 - Math.abs(energy - axes.energy) * 0.3;
    const novelty = 1 - Math.abs(tw - w) * (0.7 + 0.6 * w);
    // the seventh axis demotes the tacky end (a no-op while smartness is 0)
    const smart = group && type != null ? smartness.weight(smartness.rate(group, type), smartOf(axes)) : 1;
    return Math.max(0.02, texture * force * novelty) * smart;
  }

  // the pool the picker draws from: the classic tables, plus the extended
  // primitives once the sixth axis opens them up (or the eighth: a fear-heavy
  // look opens them too, so the horror side has material to draw)
  function poolFor(group, axes) {
    const base = TRAITS[group] || {};
    const ext = EXT_TRAITS[group];
    if (!ext) return base;
    const reveal = Math.max(textWeirdOf(axes), fearOf(axes) >= 0.5 ? 1 : 0);
    if (reveal < EXT_REVEAL) return base;
    return { ...base, ...ext };
  }

  function genreAffinity(genre, group, type) {
    if (!genre || !genres) return 1;
    return genres.affinity(genre, group, type);
  }

  // The profile's type weights: missing = 1, 0 removes the type from the draw.
  function typeWeightOf(options, group, type) {
    const table = options && options.typeWeights && options.typeWeights[group];
    const value = table && type != null ? table[type] : null;
    if (value == null || !Number.isFinite(Number(value))) return 1;
    return Math.max(0, Number(value));
  }

  function pickEntry(random, group, axes, context, direction, exclude, genre, options) {
    const pool = poolFor(group, axes);
    const w = textWeirdOf(axes);
    const fearOn = fearOf(axes) >= 0.5;
    const allowedTags = genre && Array.isArray(genre.allowTags) ? new Set(genre.allowTags) : null;
    const build = (useGenre) => {
      const scored = [];
      for (const [type, traits] of Object.entries(pool)) {
        if (exclude && exclude.has(type)) continue;
        if (useGenre && genreAffinity(genre, group, type) <= 0) continue;
        if (!allowed(group, traits, context, direction, axes, type, options)) continue;
        // skip glyph-destroying or overlapping effects (pixelate, halftone,
        // dissolves, scatter, echo trails...) when generating automatically;
        // they remain selectable by hand unless the genre opts in. A weird
        // enough look may draw the readable ones (WEIRD_TAG_OK) and a
        // fear-heavy one the readable horror ones (FEAR_TAG_OK).
        const descriptor = fx.get(group, type);
        // a pack primitive whose whole behaviour is a simulation (softBody,
        // gravityHang, gravityDrop) never passes the legibility contract: the
        // generator leaves it to hand editing, so the mood pool draws stay
        // byte-identical for every existing type
        if (descriptor && descriptor.pack && typeof descriptor.physics === 'function') continue;
        const tagOk = (w >= 0.75 && WEIRD_TAG_OK.has(type)) || (fearOn && FEAR_TAG_OK.has(type));
        if (descriptor) {
          if (descriptor.tags.includes('degrade') && !tagOk && !(allowedTags && allowedTags.has('degrade'))) continue;
          if (descriptor.tags.includes('overlap') && !tagOk && !(allowedTags && allowedTags.has('overlap'))) continue;
        }
        const fear = fearWeightOf(group, type, axes);
        if (!(fear > 0)) continue;
        // the profile's type weights multiply the draw; a 0 never appears
        const tw = typeWeightOf(options, group, type);
        if (!(tw > 0)) continue;
        const fit = scoreEntry(traits, axes, group, type);
        // a sharp exponent keeps the mood's character instead of near-uniform picks
        const affinity = useGenre ? Math.max(0.05, genreAffinity(genre, group, type)) : 1;
        scored.push({ type, weight: Math.pow(fit, 4) * affinity * fear * tw * (0.7 + random() * 0.6) });
      }
      return scored;
    };
    let scored = build(true);
    if (!scored.length && genre) scored = build(false);
    if (!scored.length) return null;
    const total = scored.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = random() * total;
    for (const entry of scored) {
      roll -= entry.weight;
      if (roll <= 0) return entry.type;
    }
    return scored[scored.length - 1].type;
  }

  // The hero effect carries the mood: energy chooses how loud it is, softness
  // chooses which family it comes from.
  const HERO_TRAITS = {
    enter: [0.45, 0.78],
    fill: [0.5, 0.6],
    edge: [0.88, 0.22],
    post: [0.72, 0.4],
  };

  function pickHero(random, axes) {
    const scored = [];
    for (const [hero, traits] of Object.entries(HERO_TRAITS)) {
      const texture = scoreEntry(traits, axes);
      const force = Math.max(0.05, 1 - Math.abs(traits[0] - axes.energy) / 1.2);
      scored.push({ hero, weight: Math.pow(texture * force, 2) * (0.7 + random() * 0.6) });
    }
    const total = scored.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = random() * total;
    for (const entry of scored) {
      roll -= entry.weight;
      if (roll <= 0) return entry.hero;
    }
    return scored[scored.length - 1].hero;
  }

  // Numeric parameters stay inside the author's recommended range
  // (`param.random`); without one the author's default is kept. The sixth axis
  // may leave both premises: it widens the range and moves parameters that have
  // no range off their default, but never past the author's absolute min/max.
  function sampleParams(random, group, type, axes, colors) {
    const descriptor = fx.get(group, type);
    const params = {};
    if (!descriptor) return params;
    const w = textWeirdOf(axes);
    for (const param of descriptor.params || []) {
      // optional params (the newer additions like gravityFall's floor) are
      // never auto-drawn: they are hand-edited only, so the existing type
      // draws keep their exact random stream
      if (param.optional === true) continue;
      if (param.kind === 'number' || param.kind === 'int') {
        const min = param.min == null ? 0 : param.min;
        const max = param.max == null ? min + 1 : param.max;
        const fallback = param.default == null ? min : param.default;
        const range = Array.isArray(param.random) && param.random.length >= 2 ? param.random : null;
        if (!range) {
          // I15: "no recommended range means the default" stops holding
          if (w > 0 && param.min != null && param.max != null && random() < w) {
            let v = fallback + (random() * 2 - 1) * 0.35 * w * (max - min);
            if (param.key === 'opacity') v = Math.max(0.6, v); // never erase text or decoration
            params[param.key] = clampParam(group, type, param.key, v);
          } else params[param.key] = param.kind === 'int' ? Math.round(fallback) : fallback;
          continue;
        }
        let lo = range[0];
        let hi = range[1];
        // I16: the recommended range is widened outwards by up to half its span
        if (w > 0 && random() < 0.5 * w) {
          const span = (hi - lo) * 0.5 * w;
          lo -= span;
          hi += span;
        }
        const bias = clamp01(axes.energy);
        const t = clamp01(bias * 0.6 + random() * 0.4);
        // the sixth axis pushes a parameter towards either end of the author's
        // range, so a weird look reads as "more of everything" without touching
        // the classic draws (no random() is consumed while weird is 0)
        const widened = w > 0 && random() < w ? (random() < 0.5 ? 0 : 1) : t;
        const value = Math.max(min, Math.min(max, lo + (hi - lo) * widened));
        params[param.key] = param.kind === 'int' ? Math.round(value) : round(value, Math.abs(value) < 0.1 ? 4 : 2);
      } else if (param.kind === 'select') {
        params[param.key] = pick(random, param.options || [param.default]);
      } else if (param.kind === 'bool') {
        // G12: booleans flip on more often as the axis rises
        params[param.key] = param.key === 'enabled' ? true : random() < 0.3 + 0.4 * w;
      } else if (param.kind === 'color') {
        params[param.key] = pick(random, colors && colors.length ? colors : ['#ffd7a8']);
      } else if (param.kind === 'vec2') {
        params[param.key] = param.default && typeof param.default === 'object' ? { ...param.default } : { x: 0, y: 0 };
      }
    }
    return params;
  }

  const SHADOW_TYPES = new Set(['dropShadow', 'longShadow', 'extrude']);

  // I1: shadows are dark by default; a weird look may draw them from the bright
  // accents too (a coloured shadow, a white extrusion). H4: the accents join
  // every colour pool.
  function colorPoolFor(type, colors, random, w) {
    if (Array.isArray(colors)) return colors;
    if (!colors || !colors.bright) return [];
    const pool = w > 0 && colors.accents ? [...colors.bright, ...colors.accents] : colors.bright;
    if (!SHADOW_TYPES.has(type) || !colors.dark) return pool;
    if (random && breaks(random, w)) return pool;
    return [colors.dark, ...colors.bright];
  }

  // line-level motion: speed owns every duration and interval, energy owns how
  // springy the easing is, density owns whether the stagger works per word or
  // per letter
  function motionFor(random, group, axes) {
    const inBase = lerp(0.95, 0.3, axes.speed);
    const outBase = inBase * 0.7;
    const bouncy = axes.energy > 0.65;
    const easeIn = pick(random, bouncy ? ['expoOut', 'quartOut', 'backOut'] : ['quartOut', 'cubicOut', 'sineInOut']);
    const easeOut = pick(random, bouncy ? ['quartIn', 'cubicIn', 'backIn'] : ['sineInOut', 'cubicIn']);
    const jitter = () => 0.85 + random() * 0.35;
    // loops are off by default; energetic moods get a slow idle loop whose
    // period follows the speed axis
    const loopPeriod = group === 'hold' && axes.energy > 0.55 ? round(lerp(3.4, 1.6, axes.speed) * jitter(), 1) : 0;
    const m = {
      in: { duration: round(inBase * jitter(), 2), delay: 0, ease: easeIn },
      out: { duration: round(outBase * jitter(), 2), delay: 0, ease: easeOut },
      stagger: {
        each: round(lerp(0.03, 0.004, axes.speed) * (0.7 + random() * 0.6), 3),
        order: pick(random, ['ltr', 'ltr', 'word', 'line']),
        ease: 'linear',
        unit: axes.density > 0.5 ? 'letter' : 'word',
        from: 0.5,
      },
      loop: { period: loopPeriod, yoyo: true, ease: 'easeInOutSine' },
    };
    const w = textWeirdOf(axes);
    if (w > 0) {
      if (breaks(random, w, 0.5)) m.stagger.unit = m.stagger.unit === 'letter' ? 'word' : 'letter'; // I9
      if (breaks(random, w)) {
        // I10 + B9: the reading order and the easing leave their families
        m.stagger.order = pick(random, ['random', 'center-out', 'edges-in', 'oddEven']);
        m.in.ease = pick(random, bouncy ? ['sineInOut', 'cubicOut', 'elasticOut'] : ['backOut', 'elasticOut', 'expoOut']);
        m.out.ease = pick(random, ['backIn', 'quartIn', 'sineInOut']);
      }
      if (breaks(random, w)) {
        // I11: the durations stretch / compress
        m.in.duration = round(Math.max(0.08, m.in.duration * (1 + (random() * 2 - 1) * 0.6 * w)), 2);
        m.out.duration = round(Math.max(0.08, m.in.duration * bend(0.7, 0.3 + random() * 1.1, w)), 2);
      }
      // G11: even a hold without a period may start to breathe
      if (group === 'hold' && !m.loop.period && axes.energy > 0.55 - 0.4 * w) {
        m.loop.period = round(lerp(3.4, 1.6, axes.speed) * (1 - 0.4 * w), 1);
      }
    }
    return m;
  }

  function instanceFor(random, group, axes, context, direction, colors, exclude, genre, options) {
    const type = pickEntry(random, group, axes, context, direction, exclude, genre, options);
    if (!type) return null;
    const w = textWeirdOf(axes);
    const instance = { type, params: sampleParams(random, group, type, axes, colorPoolFor(type, colors, random, w)), enabled: true, motion: motionFor(random, group, axes) };
    return weirdDecoration(instance, group, random, w, weirdOf(axes));
  }

  // H3: a weird look exaggerates the decoration it draws. Only the edge keys
  // the effect actually declares are touched, and every value stays inside the
  // author's min / max. The glows take the raw axis: as weird rises they shrink
  // back towards their default instead of bleeding over the letters.
  function weirdDecoration(instance, group, random, w, rawW) {
    if (!(w > 0) || !instance || group !== 'edge') return instance;
    const p = instance.params || (instance.params = {});
    const set = (key, v) => {
      p[key] = clampParam(group, instance.type, key, v);
    };
    const num = (key, d) => (typeof p[key] === 'number' ? p[key] : d);
    switch (instance.type) {
      case 'outline':
        if (breaks(random, w)) {
          p.pattern = pick(random, ['dashed', 'dotted', 'double', 'sketch']);
          if (p.pattern !== 'double') set('flow', signed(random) * (0.5 + random() * 1.5) * w);
        }
        set('width', num('width', 3) * (1 + w));
        break;
      case 'neonGlow':
      case 'innerGlow': {
        const glow = weirdMod.glowScale(rawW == null ? w : rawW);
        set('radius', num('radius', 18) * glow);
        set('intensity', num('intensity', 1) * glow);
        break;
      }
      case 'extrude':
        set('depth', num('depth', 16) * (1 + 1.2 * w));
        if (breaks(random, w)) set('angle', (random() * 2 - 1) * 180);
        break;
      case 'longShadow':
        set('length', num('length', 40) * (1 + 1.2 * w));
        if (breaks(random, w)) set('angle', (random() * 2 - 1) * 180);
        break;
      case 'drip':
        set('length', num('length', 40) * (1 + w));
        set('grow', num('grow', 0.5) * (1 + w));
        break;
      case 'dropShadow': {
        const o = p.offset && typeof p.offset === 'object' ? p.offset : { x: 6, y: 8 };
        p.offset = { x: round(o.x * (1 + 1.5 * w), 1), y: round(o.y * (1 + 1.5 * w), 1) };
        set('blur', num('blur', 10) * (1 - 0.5 * w));
        break;
      }
      default:
        break;
    }
    return instance;
  }

  // Glow taming for styles that did not come from the generator (the stored
  // looks and the drawn per-cue looks): as the raw axis rises the neon / inner
  // glow shrink with `glowScale`, and from raw 0.3 the stack gains a palette
  // outline when it carries no outline / shadow to keep the letters separated.
  // Idempotent per instance object, so applying it at several boundaries (look
  // composition, cue looks, automatic direction) scales each stack only once.
  const tamedGlow = new WeakSet();

  function tameGlow(style, rawW) {
    if (!style || !(Number(rawW) > 0)) return style;
    const scale = weirdMod.glowScale(rawW);
    const single = !Array.isArray(style.edge) && style.edge && typeof style.edge === 'object';
    const edges = Array.isArray(style.edge) ? style.edge : single ? [style.edge] : [];
    let hasGlow = false;
    let hasOutline = false;
    for (const instance of edges) {
      if (!instance || !instance.type) continue;
      if (instance.type === 'neonGlow' || instance.type === 'innerGlow') {
        hasGlow = true;
        if (tamedGlow.has(instance)) continue;
        const p = instance.params || (instance.params = {});
        if (typeof p.radius === 'number') p.radius = clampParam('edge', instance.type, 'radius', p.radius * scale);
        if (typeof p.intensity === 'number') p.intensity = clampParam('edge', instance.type, 'intensity', p.intensity * scale);
      } else if (instance.type === 'outline' || instance.type === 'dropShadow') {
        hasOutline = true;
      }
    }
    if (hasGlow && !hasOutline && Number(rawW) > 0.3) {
      const outline = { type: 'outline', params: { width: 2, color: null }, enabled: true };
      if (single) style.edge = [style.edge, outline];
      else if (Array.isArray(style.edge)) style.edge.push(outline);
      else style.edge = [outline];
    }
    for (const instance of edges) if (instance) tamedGlow.add(instance);
    if (Array.isArray(style.edge)) for (const instance of style.edge) if (instance) tamedGlow.add(instance);
    return style;
  }

  function pickGenreHero(genre, random) {
    const entries = Object.entries(genre.hero || {}).filter(([, weight]) => Number(weight) > 0);
    if (!entries.length) return null;
    const total = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);
    let roll = random() * total;
    for (const [hero, weight] of entries) {
      roll -= Number(weight);
      if (roll <= 0) return hero;
    }
    return entries[entries.length - 1][0];
  }

  function hsvHex(h, s, v) {
    const rgb = color.hsvToRgb({ h, s: clamp01(s), v: clamp01(v), a: 1 });
    return color.toHex({ r: rgb.r, g: rgb.g, b: rgb.b, a: 1 });
  }

  // Brightness does not pick a palette: it sets the light level. Low brightness
  // gives a dark background with bright text, mid gives a tinted mid tone, high
  // gives a light background with dark text. Text contrast is always repaired
  // to at least 4.5:1.
  function paletteColors(family, axes) {
    const brightness = clamp01(axes.brightness);
    let bgV;
    let bgS;
    let midV;
    let textV;
    let textS;
    let accentV;
    let accentS;
    let strokeV;
    if (brightness < 0.4) {
      const t = brightness / 0.4;
      bgV = lerp(0.08, 0.18, t);
      bgS = 0.3;
      midV = bgV + 0.05;
      textV = 0.95;
      textS = Math.max(0.05, 0.25 * (1 - brightness));
      accentS = 0.65;
      accentV = 0.78;
      strokeV = 0.06;
    } else if (brightness <= 0.7) {
      const t = (brightness - 0.4) / 0.3;
      bgV = lerp(0.25, 0.45, t);
      bgS = lerp(0.35, 0.6, t);
      midV = bgV * 0.82;
      textV = 0.96;
      textS = 0.12;
      accentS = 0.7;
      accentV = 0.82;
      strokeV = lerp(0.1, 0.2, t);
    } else {
      const t = (brightness - 0.7) / 0.3;
      bgV = lerp(0.85, 0.97, t);
      bgS = lerp(0.45, 0.2, t);
      midV = bgV * 0.92;
      textV = lerp(0.2, 0.1, t);
      textS = 0.3;
      accentS = 0.75;
      accentV = 0.3;
      strokeV = 0.95;
    }
    // a family may force its own saturation / value ranges and text hue
    if (family.bgS != null) bgS = family.bgS;
    if (Array.isArray(family.bgV)) bgV = lerp(family.bgV[0], family.bgV[1], brightness < 0.5 ? brightness * 2 : 1);
    else if (family.bgV != null) bgV = family.bgV;
    if (family.textS != null) textS = family.textS;
    if (family.accentS != null) accentS = family.accentS;
    if (family.accentV != null) accentV = family.accentV;
    // I4 / I3: "backgrounds are calm, text is low-saturation" are premises; the
    // sixth axis drops them. I3 also moves the text hue away from the accent.
    const w = textWeirdOf(axes);
    bgS = bend(bgS, 0.95, w);
    textS = bend(textS, 0.85, w);
    // the eighth axis darkens the whole palette (the contrast repair below
    // keeps the text readable); 0 is a no-op
    const f = fearOf(axes);
    if (f > 0) {
      bgV = bend(bgV, Math.max(0.03, bgV * (1 - 0.5 * f)), f);
      midV = bend(midV, Math.max(0.02, midV * (1 - 0.55 * f)), f);
      accentV = bend(accentV, accentV * (1 - 0.25 * f), f);
    }
    const textHue = (family.textHue != null ? family.textHue : family.accentHue) + 150 * w;
    const bg = hsvHex(family.bgHue, bgS, bgV);
    const bg2 = hsvHex(family.bgHue + 14, bgS * 0.88, midV);
    let text = hsvHex(textHue, textS, textV);
    // the minimum contrast is the legibility contract's floor and never moves
    // (the weird axis only raises it through repairContrast / paletteContrast)
    text = color.ensureContrast(text, bg, 4.5);
    const accent = hsvHex(family.accentHue, accentS, accentV);
    const stroke = hsvHex(family.bgHue + 5, 0.45, strokeV);
    const accent2 = hsvHex(family.accentHue + 40, accentS * 0.9, Math.min(1, accentV * 1.08));
    return [bg, bg2, text, accent, stroke, accent2];
  }

  function paletteFamilyFor(axes, random, allowed) {
    const w = textWeirdOf(axes);
    const f = fearOf(axes);
    const permitted = Array.isArray(allowed) && allowed.length ? new Set(allowed) : null;
    const entries = Object.entries(PALETTE_FAMILIES)
      // genre-only families open up for a weird look and for the fear axis
      .filter(([id, family]) => (permitted ? permitted.has(id) : !family.genreOnly || w >= 0.6 || f >= 0.5))
      .map(([id, family]) => {
        const fit = 1 - Math.abs(family.energy - axes.energy) / 1.15;
        const jitter = random ? 0.55 + random() * 0.9 : 1;
        // B3: a weird look flattens the fit weighting, so the family is freer.
        // The fear axis promotes the horror families (blood / ash / rain).
        const fearBoost = f > 0 && family.fear ? 1 + 3 * f * family.fear : 1;
        return { id, family, weight: Math.pow(Math.max(0.05, fit), 3 * (1 - 0.8 * w)) * jitter * fearBoost };
      });
    if (!entries.length) return paletteFamilyFor(axes, random);
    if (!random) {
      entries.sort((a, b) => b.weight - a.weight);
      return { id: entries[0].id, ...entries[0].family };
    }
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = random() * total;
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll <= 0) return { id: entry.id, ...entry.family };
    }
    const last = entries[entries.length - 1];
    return { id: last.id, ...last.family };
  }

  function paletteFor(axes, random, allowed) {
    const family = paletteFamilyFor(axes, random, allowed);
    return { id: family.id, name: family.id, colors: paletteColors(family, axes) };
  }

  // --- fixed palette slots (10 colours) ---------------------------------------
  // The slot layout is defined in palette-roles: mid A/B/C/D, text fill /
  // gradient end / edge / text background, figure A/B. C/D sit at the scheme's
  // complement angles from the background hue, TEXT_BG is the luminance
  // opposite of TEXT_FILL and FIG_B the hue complement of FIG_A, so contrast
  // is wired by construction; repairPalette only nudges the leftovers.
  function schemeFor(random, axes) {
    const w = textWeirdOf(axes);
    const candidates =
      w <= 0.35
        ? ['tonal', 'analogous']
        : w >= 0.7
          ? ['complementary', 'triad', 'splitComplementary', 'neutralAccent']
          : ['tonal', 'analogous', 'complementary', 'triad', 'splitComplementary'];
    return random ? pick(random, candidates) : candidates[0];
  }

  function repairSlotPalette(colors, axes) {
    const raw = weirdOf(axes);
    const textTarget = weirdMod.paletteContrast(raw);
    const backdropTarget = weirdMod.backdropContrast(raw);
    // the text decides the side: a light text pushes every mid plane dark and
    // the other way round, so every text pair holds by construction whatever
    // the hues are; the small plane steps are then trivial
    const textHsv = color.rgbToHsv(color.parse(colors[4]));
    const lightText = textHsv.v >= 0.5;
    const textS = textHsv.s * 0.35;
    colors[4] = hsvHex(textHsv.h, textS, lightText ? 1 : 0.03);
    const forceSide = (hex, limit) => {
      const hsv = color.rgbToHsv(color.parse(hex));
      return hsvHex(hsv.h, hsv.s, lightText ? Math.min(hsv.v, limit) : Math.max(hsv.v, 1 - limit));
    };
    for (const index of [0, 1, 2, 3]) colors[index] = forceSide(colors[index], 0.14);
    // the figures stay on the same side but further from the extrema, so they
    // keep a step against both the text and the mid planes
    for (const index of [8, 9]) {
      const hsv = color.rgbToHsv(color.parse(colors[index]));
      colors[index] = hsvHex(hsv.h, hsv.s, lightText ? Math.min(hsv.v, 0.4) : Math.max(hsv.v, 0.6));
    }
    colors[1] = color.ensureContrast(colors[1], colors[0], 1.15);
    colors[3] = color.ensureContrast(colors[3], colors[2], 1.15);
    for (const index of [8, 9]) {
      colors[index] = color.ensureContrast(colors[index], colors[4], backdropTarget);
      if (color.contrastRatio(color.parse(colors[index]), color.parse(colors[4])) < backdropTarget - 1e-6) {
        colors[index] = color.separateFrom(colors[index], [colors[4]], backdropTarget) || colors[index];
      }
      // and a readable step against the plane it sits on
      colors[index] = color.ensureContrast(colors[index], colors[0], 1.5);
      if (color.contrastRatio(color.parse(colors[index]), color.parse(colors[0])) < 1.5 - 1e-6) {
        colors[index] = color.separateFrom(colors[index], [colors[0]], 1.5) || colors[index];
      }
      if (color.contrastRatio(color.parse(colors[index]), color.parse(colors[4])) < backdropTarget - 1e-6) {
        colors[index] = color.ensureContrast(colors[index], colors[4], backdropTarget);
      }
    }
    colors[7] = paletteRoles.luminanceOpposite(colors[4]);
    colors[7] = color.ensureContrast(colors[7], colors[4], textTarget);
    if (color.contrastRatio(color.parse(colors[7]), color.parse(colors[4])) < textTarget - 1e-6) {
      colors[7] = color.separateFrom(colors[7], [colors[4]], textTarget) || colors[7];
    }
    // the edge only needs a readable step against the fill and the background
    colors[6] = color.ensureContrast(colors[6], colors[4], 1.5);
    colors[6] = color.ensureContrast(colors[6], colors[7], 1.5);
    if (color.contrastRatio(color.parse(colors[6]), color.parse(colors[7])) < 1.5 - 1e-6) {
      colors[6] = color.separateFrom(colors[6], [colors[7]], 1.5) || colors[6];
    }
    // the gradient end keeps a readable step from the fill
    colors[5] = color.ensureContrast(colors[5], colors[4], 1.5);
    if (color.contrastRatio(color.parse(colors[5]), color.parse(colors[4])) < 1.5 - 1e-6) {
      colors[5] = color.separateFrom(colors[5], [colors[4]], 1.5) || colors[5];
    }
    // the text was chosen first, so a later nudge could only have moved the
    // mids away; one final pass guarantees the floor
    for (const index of [0, 1]) {
      if (color.contrastRatio(color.parse(colors[4]), color.parse(colors[index])) < textTarget - 1e-6) {
        colors[index] = color.ensureContrast(colors[index], colors[4], textTarget);
        if (color.contrastRatio(color.parse(colors[4]), color.parse(colors[index])) < textTarget - 1e-6) {
          colors[index] = color.separateFrom(colors[index], [colors[4]], textTarget) || colors[index];
        }
      }
    }
    return colors;
  }

  function paletteColors10(family, axes, random) {
    const base = paletteColors(family, axes);
    const scheme = schemeFor(random, axes);
    const angles = paletteRoles.SCHEMES[scheme] || paletteRoles.SCHEMES.tonal;
    const bgHsv = color.rgbToHsv(color.parse(base[0]));
    const midS = Math.max(0.35, Math.min(0.8, bgHsv.s));
    const midC = hsvHex(bgHsv.h + angles[0], midS, clamp01(bgHsv.v + 0.1));
    const midD = hsvHex(bgHsv.h + angles[1], clamp01(midS * 0.95), clamp01(bgHsv.v - 0.05));
    const figA = base[5] || base[3];
    const figHsv = color.rgbToHsv(color.parse(figA));
    const figB = hsvHex(figHsv.h + 180, figHsv.s, figHsv.v);
    const colors = [base[0], base[1], midC, midD, base[2], base[3], base[4], paletteRoles.luminanceOpposite(base[2]), figA, figB];
    repairSlotPalette(colors, axes);
    return { colors, scheme };
  }

  function paletteFor10(axes, random, allowed) {
    const family = paletteFamilyFor(axes, random, allowed);
    const built = paletteColors10(family, axes, random);
    return { id: family.id, name: family.id, colors: built.colors, scheme: built.scheme, roles: 2 };
  }

  // A member of the palette set: the same slots with a relationship-preserving
  // change (rotate the mid pair, step every hue together, flip the accents) so
  // any member's text still contrasts any member's mid planes.
  function variantPalette(base, kind, random, axes) {
    const colors = (base && Array.isArray(base.colors) ? base.colors : []).slice(0, paletteRoles.SIZE);
    while (colors.length < paletteRoles.SIZE) colors.push(colors[colors.length - 1] || '#888888');
    const swap = (a, b) => {
      const t = colors[a];
      colors[a] = colors[b];
      colors[b] = t;
    };
    if (kind === 'swapMid') {
      swap(0, 2);
      swap(1, 3);
    } else if (kind === 'hueStep') {
      const delta = (random() * 2 - 1) * 30 + (random() < 0.5 ? -45 : 45);
      for (const index of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) colors[index] = paletteRoles.shift(colors[index], delta, 1, 0);
    } else if (kind === 'accentFlip') {
      colors[5] = paletteRoles.shift(colors[5], 180, 0.9, 0);
      colors[7] = paletteRoles.shift(colors[7], 180, 0.9, 0);
      swap(8, 9);
    } else {
      const step = kind === 'lift' ? 0.1 : -0.1;
      for (const index of [0, 1, 2, 3]) colors[index] = paletteRoles.shift(colors[index], 0, 1, step);
    }
    repairSlotPalette(colors, axes || {});
    return {
      ...(base || {}),
      id: `${(base && base.id) || 'palette'}_${kind}`,
      name: `${(base && (base.name || base.id)) || 'palette'} ${kind}`,
      colors,
      scheme: (base && base.scheme) || null,
      roles: 2,
    };
  }

  function generatePaletteSet(random, axes, n, allowed) {
    const count = Math.max(1, Math.min(4, Number(n) || 3));
    const base = paletteFor10(axes, random, allowed);
    const set = [base];
    const kinds = ['swapMid', 'hueStep', 'accentFlip'];
    for (let i = 1; i < count; i += 1) set.push(variantPalette(base, kinds[(i - 1) % kinds.length], random, axes));
    return set;
  }

  function shiftColor(hex, hueShift, satScale, lightScale) {
    const rgba = color.parse(hex);
    const hsv = color.rgbToHsv(rgba);
    const next = {
      // rgbToHsv / hsvToRgb use degrees
      h: hsv.h + hueShift * 360,
      s: clamp01(hsv.s * satScale),
      v: clamp01(hsv.v * lightScale),
      a: 1,
    };
    return color.toHex({ ...color.hsvToRgb(next), a: 1 });
  }

  function repairContrast(colors, min, options) {
    if (!Array.isArray(colors) || colors.length < 3) return colors;
    const target = min == null ? 4.5 : min;
    // `keepText` (a weird profile) tries the background first: the drawn text
    // colour survives and only a background that cannot clear the floor moves
    // the text itself. The default order is the classic one.
    const keepText = !!(options && options.keepText);
    let ratio = 0;

    const shrinkText = () => {
      colors[2] = color.ensureContrast(colors[2], colors[0] || '#000000', target);
      const bg = color.parse(colors[0] || '#000000');
      ratio = color.contrastRatio(color.parse(colors[2]), bg);
      if (ratio < target) {
        // ensureContrast only moves the value; a fully saturated colour (a weird
        // palette can produce one) may already sit at v = 1 and miss the target,
        // so it is desaturated towards white or black as a last resort. The target
        // itself climbs with the weird axis (4.5 -> 7), so the floor climbs too.
        const hsv = color.rgbToHsv(color.parse(colors[2]));
        const white = { h: hsv.h, s: 0, v: 1, a: 1 };
        const black = { h: hsv.h, s: hsv.s, v: 0, a: 1 };
        const end = color.contrastRatio(color.hsvToRgb(white), bg) >= color.contrastRatio(color.hsvToRgb(black), bg) ? white : black;
        let best = colors[2];
        for (let step = 1; step <= 20; step += 1) {
          const t = step / 20;
          const candidate = color.hsvToRgb({ h: hsv.h, s: hsv.s + (end.s - hsv.s) * t, v: hsv.v + (end.v - hsv.v) * t, a: 1 });
          const next = color.contrastRatio(candidate, bg);
          if (next > ratio) {
            ratio = next;
            best = color.toHex(candidate);
          }
          if (next >= target) break;
        }
        colors[2] = best;
      }
    };

    const moveBackground = () => {
      if (!(ratio < target)) return;
      // Even a pure white / black text cannot clear the target on a background
      // in the mid value range. Move the background away from the text (its
      // hue survives; a very light or very dark background also loses
      // saturation) until the target clears. weird 0 never enters this branch
      // in the classic order: the 4.5 target is always reachable.
      const textHsv = color.rgbToHsv(color.parse(colors[2]));
      const bgHsv = color.rgbToHsv(color.parse(colors[0] || '#000000'));
      const direction = textHsv.v >= 0.5 ? -1 : 1; // light text darkens the bg, dark text lightens it
      let best = colors[0];
      let bestRatio = ratio;
      let v = bgHsv.v;
      let s = bgHsv.s;
      for (let step = 1; step <= 50 && bestRatio < target; step += 1) {
        v = clamp01(v + direction * 0.025);
        // at the value limit the colour also loses saturation, so pure white or
        // black (and with it any target) is reachable
        const atEdge = direction > 0 ? v >= 1 - 1e-9 : v <= 1e-9;
        if (atEdge) s *= 0.85;
        const candidate = color.hsvToRgb({ h: bgHsv.h, s, v, a: 1 });
        const next = color.contrastRatio(candidate, color.parse(colors[2]));
        if (next > bestRatio) {
          bestRatio = next;
          best = color.toHex(candidate);
        }
      }
      const resolved = color.rgbToHsv(color.parse(best));
      colors[0] = best;
      ratio = bestRatio;
      if (colors[1]) {
        // the secondary background keeps its offset from the first
        const second = color.rgbToHsv(color.parse(colors[1]));
        colors[1] = color.toHex({ ...color.hsvToRgb({ h: second.h, s: second.s, v: clamp01(second.v + (resolved.v - bgHsv.v)), a: 1 }), a: 1 });
      }
    };

    if (keepText) {
      ratio = color.contrastRatio(color.parse(colors[2]), color.parse(colors[0] || '#000000'));
      moveBackground();
      if (ratio < target) {
        shrinkText();
        if (ratio < target) moveBackground();
      }
    } else {
      shrinkText();
      moveBackground();
    }
    return colors;
  }

  // a random palette that keeps the mood's character: derived from a matching family
  function generatePalette(random, axes, name, allowed) {
    const w = textWeirdOf(axes);
    const s = smartOf(axes);
    const base = paletteFor(axes, random, allowed);
    // subtle variation only: the family harmony must survive. B4: the sixth
    // axis widens the jitter and may clash the accents on purpose; the seventh
    // narrows both back down (a smart palette stays on family)
    const narrow = s > 0 ? 1 - 0.6 * s : 1;
    const hueShift = (random() * 2 - 1) * (0.055 + 0.4 * w) * narrow;
    const satScale = 0.9 + random() * (0.2 + 0.5 * w);
    const lightScale = 0.94 + random() * 0.12;
    const colors = base.colors.map((hex, index) => shiftColor(hex, hueShift * (index === 2 ? 0.3 : 1), satScale, lightScale));
    colors.push(shiftColor(colors[3], 0.04 + random() * 0.08, 1, 1.08));
    if (w > 0 && random() < w * narrow) {
      const clash = pick(random, [0.33, 0.5, 0.67]) + (random() * 2 - 1) * 0.05;
      for (const i of [3, 5, 6]) if (colors[i]) colors[i] = shiftColor(colors[i], clash, 1 + 0.3 * w, 1);
    }
    repairContrast(colors, weirdMod.paletteContrast(weirdOf(axes)), { keepText: w > 0 });
    return { id: `theme_${Math.floor(random() * 1e9).toString(16)}`, name: name || base.name, colors };
  }

  // a variant of an existing palette (used by the per-scope "random palette"
  // and by the mid layer's per-section shift). `spread` widens the jitter: the
  // default keeps the old values exactly.
  function jitterPalette(random, palette, axes, spread) {
    const colors = (palette && palette.colors) || [];
    if (!colors.length) return generatePalette(random, normalizeAxes({}));
    const k = spread == null || !(Number(spread) > 0) ? 1 : Number(spread);
    const hueShift = (random() * 2 - 1) * 0.06 * k;
    const satScale = 1 + (0.9 + random() * 0.3 - 1) * k;
    const lightScale = 1 + (0.94 + random() * 0.16 - 1) * k;
    const next = colors.map((hex, index) => shiftColor(hex, hueShift * (index === 2 ? 0.25 : 1), satScale, lightScale));
    repairContrast(next, weirdMod.paletteContrast(weirdOf(axes)));
    return {
      id: `theme_${Math.floor(random() * 1e9).toString(16)}`,
      name: palette.name || 'palette',
      colors: next,
    };
  }

  // A per-cue palette for the weird axis: the same roles with the hue moved and
  // the accents swapped, still readable on the background.
  function weirdPalette(random, palette, w) {
    const colors = (palette && palette.colors) || [];
    if (!colors.length || !(w > 0)) return null;
    const hue = (random() * 2 - 1) * 0.5 * w;
    const sat = 1 + random() * 0.4 * w;
    const next = colors.map((hex, i) => shiftColor(hex, hue * (i === 2 ? 0.3 : 1), sat, 0.95 + random() * 0.1));
    if (next.length >= 6 && random() < 0.5 * w) [next[3], next[5]] = [next[5], next[3]];
    repairContrast(next, 4.5 + 2.5 * w);
    return { id: `theme_${Math.floor(random() * 1e9).toString(16)}`, name: palette.name || 'palette', colors: next };
  }

  // --- colour-only re-roll ---------------------------------------------------
  // `recolor` / `remapColor` live in palette-roles now (the beat colour schemes
  // use them too); moods re-exports them so the existing callers stay put.
  const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
  const recolor = paletteRoles.recolor;

  // Softness owns the typeface family, density owns the size (a denser design
  // uses smaller text so more fits on screen).
  function textStyleFor(random, axes, context, genre) {
    const cjk = !!context.cjk;
    let pool = FONTS.plain;
    if (axes.softness > 0.62) pool = cjk ? FONTS.softCjk : FONTS.soft;
    else if (axes.softness < 0.38) pool = cjk ? FONTS.hard : FONTS.latinHard;
    if (genre && genre.fonts) {
      const requested = (context.cjk ? genre.fonts.cjk : genre.fonts.latin) || genre.fonts.latin || genre.fonts.cjk || [];
      const usable = requested.filter(fontAvailable);
      if (usable.length) pool = usable;
    }
    // the eighth axis leans the typeface towards the hard / plain side (the
    // project's exclusive font set still wins below)
    const fear = fearOf(axes);
    if (fear >= 0.4 && !(genre && genre.fonts)) pool = cjk ? FONTS.hard : FONTS.latinHard;
    else if (fear >= 0.2 && !(genre && genre.fonts) && axes.softness > 0.62) pool = FONTS.plain;
    // an exclusive project font set replaces every other pool
    const setPool = fontSetPool(cjk);
    if (setPool.length) pool = setPool;
    // only bundled faces can load: a pool that emptied out falls back to the
    // plain family. An exclusive project set is trusted as-is.
    if (!setPool.length) {
      const usable = pool.filter(fontAvailable);
      pool = usable.length ? usable : FONTS.plain.filter(fontAvailable);
      if (!pool.length) pool = FONTS.plain;
    }
    const fontId = pick(random, pool);
    const portrait = context.aspect === '9:16';
    const base = portrait ? lerp(104, 58, axes.density) : lerp(134, 78, axes.density);
    // jitter the size per generation so re-rolls do not all land on the same value
    const w = textWeirdOf(axes);
    const jitter = w > 0 ? 0.85 - 0.25 * w + random() * (0.3 + 0.7 * w) : 0.85 + random() * 0.3;
    const size = Math.round((base * jitter) / 2) * 2;
    let weight = genre && genre.fonts && genre.fonts.weight ? genre.fonts.weight : axes.softness < 0.4 ? 700 : 400;
    let letterSpacing = round(lerp(0, 0.06, axes.softness * (1 - axes.density)) * 100) / 100;
    let lineHeight = 1.2;
    let align = 'center';
    let maxWidth = 0.86;
    let font = fontId;
    if (w > 0) {
      if (breaks(random, w, 0.8)) font = weirdFont(random, context, font) || font; // I5: the family leaves softness
      if (breaks(random, w, 0.3)) weight = weight === 700 ? 400 : 700; // I6
      if (breaks(random, w)) {
        // I7: the tracking and the line height leave their narrow bands
        letterSpacing = round(-0.04 * w + random() * (0.1 + 0.25 * w), 2);
        lineHeight = round(1.2 + (random() * 2 - 1) * 0.35 * w, 2);
      }
      if (breaks(random, w, 0.3)) align = pick(random, ['left', 'right']);
      if (breaks(random, w, 0.5)) maxWidth = round(bend(0.86, 0.5 + random() * 0.48, w), 2);
    }
    return { fontId: font, size, weight, letterSpacing, lineHeight, align, maxWidth };
  }

  // I5: a font outside the softness family. The project's exclusive font set
  // still wins (it is never dropped).
  function weirdFont(random, context, current) {
    const cjk = !!(context && context.cjk);
    const setPool = fontSetPool(cjk);
    const base = setPool.length
      ? setPool
      : [...new Set([...FONTS.soft, ...FONTS.plain, ...(cjk ? [...FONTS.hard, ...FONTS.softCjk, ...FONTS.popCjk] : FONTS.latinHard)])].filter(fontAvailable);
    const pool = base.filter((id) => id !== current);
    return pool.length ? pick(random, pool) : null;
  }

  function colorSetFor(random, palette, axes) {
    const gradient = random() < 0.5;
    const base = {
      fill: gradient
        ? {
            kind: 'gradient',
            type: 'linear',
            angle: Math.round(random() * 360),
            stops: [
              { pos: 0, paletteIndex: 2 },
              { pos: 1, paletteIndex: 3 },
            ],
          }
        : { kind: 'palette', index: 2 },
      stroke: { kind: 'palette', index: 4 },
    };
    const w = textWeirdOf(axes);
    if (!(w > 0) || random() >= w) return base;
    // B6 / H5: the fill may leave the text role and the 2 -> 3 gradient, as
    // long as every colour it uses still clears the legibility floor (4.5)
    const colors = (palette && palette.colors) || [];
    const bg = color.parse(colors[0] || '#000000');
    const readable = [2, 3, 5, 6].filter((i) => colors[i] && color.contrastRatio(color.parse(colors[i]), bg) >= 4.5);
    if (!readable.length) return base;
    let fill;
    if (readable.length >= 2 && random() < 0.55) {
      const order = shuffle(random, readable).slice(0, Math.min(3, readable.length));
      fill = {
        kind: 'gradient',
        type: 'linear',
        angle: Math.round(random() * 360),
        stops: order.map((index, k) => ({ pos: order.length === 1 ? 0 : k / (order.length - 1), paletteIndex: index })),
      };
      if (random() < w) {
        fill.animate = {
          angleSpeed: round(signed(random) * (20 + random() * 70) * w, 1),
          shiftSpeed: round(signed(random) * (0.1 + random() * 0.4) * w, 2),
        };
      }
    } else fill = { kind: 'palette', index: pick(random, readable) };
    return {
      fill,
      stroke: { kind: 'palette', index: pick(random, [0, 4, 3, 5].filter((i) => colors[i])) },
    };
  }

  // --- timeline clip specs -----------------------------------------------------
  // Background: one clip for the whole song. Density decides whether it moves
  // (noise gradient) or sits still (solid); brightness already shapes the
  // palette. Backdrop / filler: per-section texture whose count follows density
  // and whose animation speed follows speed.

  const BACKDROP_TYPES = ['shapes', 'pattern', 'particles', 'spectrum', 'waveform'];
  const FILLER_TYPES = ['shapes', 'particles', 'spectrum', 'sineWave', 'waveform', 'pattern'];

  const CLIP_MODES = {
    shapes: ['circles', 'polygons', 'lines', 'burst', 'grid', 'orbit'],
    pattern: ['grid', 'dots', 'stripes', 'rings', 'triangles', 'diamonds', 'hexes', 'rain', 'checks', 'polka', 'sineCurve', 'waves', 'randomFill'],
    particles: ['rise', 'fall', 'drift', 'vortex'],
    spectrum: ['bars', 'radial', 'blob'],
    waveform: ['line', 'mirror', 'circle'],
  };

  function sampleClipParams(type, axes, random, index) {
    const density = axes.density;
    const speed = axes.speed;
    const params = { color: null };
    const w = bgWeirdOf(axes);
    if (type === 'pattern') {
      // backdrop patterns cycle through the 400+ kind library (pattern-variants)
      // so a per-cue run of clips never shows the same look twice; without an
      // index (a manual re-roll) the look is drawn from the same library
      const variant = patternVariants.at(Number.isFinite(index) ? index : Math.floor(random() * patternVariants.count()));
      params.mode = variant.mode;
      params.count = variant.count;
      params.size = variant.size;
      params.speed = variant.speed;
      params.opacity = variant.opacity;
      // I19: a weird backdrop moves more of everything, still inside the ranges
      if (w > 0) {
        params.count = Math.round(params.count * (1 + w));
        params.speed = round(params.speed * (1 + w), 2);
      }
      return params;
    }
    if (CLIP_MODES[type]) {
      const modes = CLIP_MODES[type];
      params[type === 'particles' ? 'flow' : 'mode'] = pick(random, modes);
    }
    if (type === 'shapes' || type === 'particles' || type === 'pattern') {
      params.count = Math.round(lerp(6, 44, density) * (0.75 + random() * 0.5));
      params.speed = round(lerp(0.25, 1.6, speed) * (0.8 + random() * 0.4), 2);
    }
    if (type === 'pattern') params.size = round(lerp(0.6, 1.8, density), 2);
    if (type === 'particles') params.size = round(lerp(1.2, 4.5, density), 2);
    if (type === 'spectrum') {
      params.bars = Math.round(lerp(20, 96, density));
      params.falloff = round(lerp(0.8, 1.4, speed), 2);
    }
    if (type === 'sineWave') {
      params.waves = Math.max(1, Math.min(5, Math.round(lerp(1, 4, density))));
      params.speed = round(lerp(0.3, 2, speed), 2);
    }
    // I19: a weird backdrop moves more of everything, still inside the ranges
    if (w > 0) {
      if (params.count != null) params.count = Math.round(params.count * (1 + w));
      if (typeof params.speed === 'number') params.speed = round(params.speed * (1 + w), 2);
      if (type === 'spectrum' && params.falloff != null) params.falloff = round(params.falloff * (1 + 0.5 * w), 2);
    }
    return params;
  }

  // --- backdrop colours and split planes (item 1 / 9) --------------------------
  // The mid layer's colours move with the sixth axis: the hue rotates towards
  // the complement, saturation bends and the value spread widens. w=0 keeps the
  // caller's exact two colours, so the classic output is untouched.
  function weirdClipColors(random, palette, w) {
    const source = Array.isArray(palette) && palette.length ? palette : ['#8f8f8f'];
    const width = clamp01(w);
    const pickSource = (index) => source[(3 + index) % source.length] || source[source.length - 1];
    const count = 2 + Math.floor(random() * (width > 0.5 ? 3 : 2)); // 2..4
    const hueShift = (random() * 2 - 1) * 180 * width;
    const satScale = bend(1, 0.9, width);
    const valueSpan = 0.25 + 0.5 * width;
    const colors = [];
    for (let i = 0; i < count; i += 1) {
      const hsv = color.rgbToHsv(color.parse(pickSource(i)));
      const v = Math.max(0.06, Math.min(0.95, hsv.v + (i === 0 ? valueSpan * 0.5 : (random() * 2 - 1) * valueSpan * 0.5)));
      colors.push(
        color.toHex({
          ...color.hsvToRgb({
            h: hsv.h + hueShift + (i === 0 ? 0 : (random() * 2 - 1) * (20 + 60 * width)),
            s: clamp01(hsv.s * satScale),
            v,
            a: 1,
          }),
          a: 1,
        })
      );
    }
    return colors;
  }

  // Palette for the split planes: tonal / analogous reads calm, complementary /
  // triad reads loud. The returned order is primary first (60-30-10).
  const SPLIT_SCHEMES = ['tonal', 'analogous', 'complementary', 'triad', 'splitComplementary', 'neutralAccent'];
  const SPLIT_SCHEME_HUES = {
    tonal: [0, 0, 0, 0],
    analogous: [0, -30, 30, -15],
    complementary: [0, 180, 0, 180],
    triad: [0, 120, 240, 60],
    splitComplementary: [0, 150, 210, 180],
    neutralAccent: [0, 0, 180, 0],
  };

  function splitColors(palette, n, w, random, axes) {
    const source = Array.isArray(palette) && palette.length ? palette : ['#222222', '#111111', '#eeeeee', '#ff9900', '#333333', '#ffcc00'];
    const width = clamp01(w);
    const s = smartOf(axes);
    const candidates =
      width <= 0.35
        ? ['tonal', 'analogous']
        : width >= 0.7
          ? ['complementary', 'triad', 'splitComplementary', 'neutralAccent']
          : ['tonal', 'analogous', 'complementary', 'triad'];
    const scheme = s > 0 ? smartness.pickWeighted(random, 'splitScheme', candidates, s) : pick(random, candidates);
    const count = Math.max(2, Math.min(6, Math.round(n) || 3));
    const order = [3, 5, 6, 2, 0, 4];
    const hues = SPLIT_SCHEME_HUES[scheme];
    const values = [1, 0.72, 0.5, 0.62, 0.86, 0.4];
    const colors = [];
    for (let i = 0; i < count; i += 1) {
      const slot = order[i % order.length];
      const hsv = color.rgbToHsv(color.parse(source[slot] || source[source.length - 1]));
      const hue = hsv.h + (hues[i % hues.length] || 0) + (i >= hues.length ? (random() * 2 - 1) * 40 * width : 0);
      const neutral = scheme === 'neutralAccent' && i < 2;
      colors.push(
        color.toHex({
          ...color.hsvToRgb({
            h: (hue + 360) % 360,
            s: clamp01(neutral ? hsv.s * 0.12 : Math.max(0.35, Math.min(0.8, hsv.s)) * (scheme === 'tonal' ? 0.9 : 1)),
            v: clamp01(Math.max(0.18, Math.min(0.85, hsv.v)) * values[i % values.length] + (i >= values.length ? (random() * 2 - 1) * 0.1 : 0)),
            a: 1,
          }),
          a: 1,
        })
      );
    }
    return { scheme, colors };
  }

  // --- the profile's backdrop planes -------------------------------------------
  // The automatic direction builds the mid layer from the background slot
  // alone (never the text / accent slots): the second plane steps the
  // lightness of the first, the third takes the scheme hue, the fourth its
  // companion. Every plane passes the backdrop contrast floor against the
  // cue's text colours, so the lyrics keep their separation.
  const PLANE_LAYOUTS = {
    1: ['halves'],
    2: ['halves', 'diagonal', 'frame'],
    3: ['thirds', 'bands', 'chevron'],
    4: ['quads', 'mondrian'],
  };
  const PLANE_EXTRAS = ['shards', 'radial'];

  function planeWeightOf(planes, count) {
    if (!planes) return 0;
    const value = planes[`planes${count}`] != null ? planes[`planes${count}`] : planes[String(count)];
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  // The number of coloured planes, weighted by the profile (1..4).
  function planeCount(random, planes) {
    const weights = {};
    for (const key of genParamsMod.PLANE_KEYS) weights[key] = planeWeightOf(planes, Number(String(key).replace('planes', '')));
    const picked = genParamsMod.pickWeighted(random, weights, genParamsMod.PLANE_KEYS);
    if (picked == null) return 1;
    const count = Number(String(picked).replace('planes', ''));
    return count >= 1 && count <= 4 ? count : 1;
  }

  function planeScheme(random, rawW) {
    const w = clamp01(rawW);
    if (w < 0.5) return pick(random, ['tonal', 'analogous']);
    return pick(random, ['analogous', 'complementary']);
  }

  // Moves one plane colour away from the text when the contrast floor fails.
  // The full text set (body + hero) is tried first; when no colour can satisfy
  // both, the body colour (the legibility contract's own anchor) decides.
  function separatePlane(hex, texts, target) {
    if (!texts.length || !(target > 0)) return hex;
    const worst = (candidate, list) => (list || texts).reduce((min, text) => Math.min(min, color.contrastRatio(color.parse(candidate), color.parse(text))), Infinity);
    const attempt = (candidate, list) => {
      if (worst(candidate, list) >= target - 1e-6) return candidate;
      const separated = color.separateFrom(candidate, list, target);
      let best = separated && worst(separated, list) > worst(candidate, list) ? separated : candidate;
      if (worst(best, list) >= target - 1e-6) return best;
      // the separation could not reach the floor: move the lightness towards
      // the background side of the text until it does (or the value ends)
      let hsv = color.rgbToHsv(color.parse(best));
      const textV = list.reduce((sum, text) => sum + color.rgbToHsv(color.parse(text)).v, 0) / list.length;
      const direction = textV >= 0.5 ? -1 : 1;
      for (let i = 0; i < 50 && worst(best, list) < target - 1e-6; i += 1) {
        hsv = { ...hsv, v: clamp01(hsv.v + direction * 0.02) };
        const next = color.toHex({ ...color.hsvToRgb(hsv), a: 1 });
        if (worst(next, list) > worst(best, list)) best = next;
      }
      return best;
    };
    let best = attempt(hex, texts);
    if (worst(best) < target - 1e-6 && texts.length > 1) {
      // the body colour decides: a plane that cannot clear both still clears
      // the legibility contract's own anchor
      const primary = attempt(hex, [texts[0]]);
      if (worst(primary, [texts[0]]) > worst(best, [texts[0]])) best = primary;
    }
    return best;
  }

  function planeColors(palette, n, scheme, textColors, rawW) {
    const source = Array.isArray(palette) ? palette : palette && Array.isArray(palette.colors) ? palette.colors : [];
    const baseHex = paletteRoles.get(source, paletteRoles.SLOT.MID_A) || source[0] || '#101018';
    const base = color.rgbToHsv(color.parse(baseHex));
    const count = Math.max(1, Math.min(4, Math.round(n) || 1));
    const wide = clamp01(rawW);
    const step = Math.min(0.16, 0.10 + 0.06 * wide);
    const hue = scheme === 'complementary' ? 180 : scheme === 'analogous' ? 30 : 0;
    const out = [];
    for (let i = 0; i < count; i += 1) {
      let h = base.h;
      let s = base.s;
      let v = base.v;
      if (i === 1) {
        // the second plane steps away from the background's own lightness
        v = clamp01(base.v + (base.v < 0.5 ? step : -step));
        s = clamp01(base.s * 0.9);
      } else if (i === 2) {
        h = base.h + hue;
        s = Math.max(0.35, Math.min(0.7, base.s));
        v = base.v;
      } else if (i === 3) {
        h = base.h + hue - 30;
        s = Math.max(0.35, Math.min(0.7, base.s));
        v = clamp01(base.v - 0.06);
      } else {
        s = clamp01(base.s * 0.9);
      }
      out.push(color.toHex({ ...color.hsvToRgb({ h: (h + 360) % 360, s, v, a: 1 }), a: 1 }));
    }
    const target = weirdMod.backdropContrast(rawW);
    const texts = (Array.isArray(textColors) ? textColors : []).filter((hex) => typeof hex === 'string' && hex);
    return out.map((hex) => separatePlane(hex, texts, target));
  }

  // The accent layer above the planes: two steps of the plane colours, so the
  // texture stays in the same family as the planes.
  function accentColors(planes) {
    const list = (Array.isArray(planes) ? planes : []).filter((hex) => typeof hex === 'string' && hex);
    if (!list.length) return [];
    const shiftV = (hex, delta) => {
      const hsv = color.rgbToHsv(color.parse(hex));
      return color.toHex({ ...color.hsvToRgb({ ...hsv, v: clamp01(hsv.v + delta), a: 1 }), a: 1 });
    };
    return [shiftV(list[0], 0.12), shiftV(list[1 % list.length], -0.12)];
  }

  function planeBackdropSpec(axes, random, paletteColors, options, w) {
    const opts = options || {};
    const rawW = opts.rawW != null ? opts.rawW : w;
    const coverage = opts.coverage != null ? clamp01(opts.coverage) : w;
    const count = planeCount(random, opts.planes);
    let layouts = (PLANE_LAYOUTS[count] || PLANE_LAYOUTS[1]).slice();
    // shards / radial only join the four-plane draw
    if (count === 4 && planeWeightOf(opts.planes, 4) > 0) layouts = layouts.concat(PLANE_EXTRAS);
    const layout = pick(random, layouts);
    const scheme = planeScheme(random, rawW);
    const textColors = Array.isArray(opts.textColors) ? opts.textColors : [];
    const colors = planeColors(paletteColors, count, scheme, textColors, rawW);
    const s = smartOf(axes);
    const motions =
      s > 0
        ? w >= 0.6
          ? ['slide', 'rotate', 'breathe', 'swap', 'drift', 'push']
          : ['breathe', 'slide', 'drift', 'push']
        : w >= 0.6
          ? ['slide', 'rotate', 'breathe', 'swap', 'drift']
          : ['breathe', 'slide', 'drift'];
    const motion = s > 0 ? smartness.pickWeighted(random, 'splitMotion', motions, s) : pick(random, motions);
    const plane = {
      type: 'split',
      params: {
        layout,
        parts: count,
        // the angle is one of the discrete readable values (diagonal widens)
        angle: layout === 'diagonal' ? pick(random, [-12, 0, 12, 30]) : pick(random, [0, -12, 12]),
        coverage: round(clamp01(coverage), 3),
        scheme,
        motion,
        speed: round(0.2 + random() * 0.8 * (0.5 + 0.5 * w), 2),
        // the old amp read as jitter; the profile keeps half of it
        amp: round((0.02 + 0.06 * w) * 0.5 * (0.5 + random()), 3),
        colors,
        cuts: Array.isArray(opts.cuts) ? opts.cuts.slice(0, 16) : null,
      },
    };
    if (s > 0 && motion === 'breathe') plane.params.every = pick(random, [1, 2, 4]);
    // the accent texture above the planes, drawn from the plane family and
    // capped quiet so the lyrics stay in front
    const type = pick(random, BACKDROP_TYPES);
    const params = sampleClipParams(type, axes, random, opts.index);
    const cap = count === 1 ? 0.25 : 0.45;
    params.opacity = Math.round(Math.min(Number(params.opacity) || 0.6, cap) * 100) / 100;
    const accent = { type, params };
    return {
      spec: { type: 'combo', params: { list: [plane, accent], animate: backdropMotion(random, w, axes) } },
      colors: accentColors(colors),
    };
  }


  // The split plane spec a weird mid clip carries: layout, part count, motion
  // and the palette, all drawn from the axes. `coverage` is the share of the
  // frame the planes paint (the weird axis).
  function splitSpec(axes, random, palette, coverage, cuts) {
    const w = bgWeirdOf(axes);
    const layouts =
      w <= 0.3
        ? ['halves', 'diagonal', 'bands', 'thirds', 'grid']
        : w >= 0.7
          ? ['mondrian', 'chevron', 'radial', 'quads', 'frame', 'shards']
          : ['halves', 'diagonal', 'thirds', 'bands', 'grid', 'mondrian', 'chevron', 'radial'];
    const layout = pick(random, layouts);
    const parts = Math.max(2, Math.min(8, 2 + Math.round(random() * (1 + 4 * w))));
    const { scheme, colors } = splitColors(palette, Math.min(6, parts), w, random, axes);
    const s = smartOf(axes);
    const motions =
      s > 0
        ? w >= 0.6
          ? ['slide', 'rotate', 'breathe', 'swap', 'drift', 'push']
          : ['breathe', 'slide', 'drift', 'push']
        : w >= 0.6
          ? ['slide', 'rotate', 'breathe', 'swap', 'drift']
          : ['breathe', 'slide', 'drift'];
    const motion = s > 0 ? smartness.pickWeighted(random, 'splitMotion', motions, s) : pick(random, motions);
    const split = {
      type: 'split',
      params: {
        layout,
        parts,
        angle: round(layout === 'diagonal' ? 30 + (random() * 2 - 1) * 25 * w : (random() * 2 - 1) * 30 * w, 2),
        coverage: round(clamp01(coverage), 3),
        scheme,
        motion,
        speed: round(0.2 + random() * 0.8 * (0.5 + 0.5 * w), 2),
        amp: round((0.02 + 0.06 * w) * (0.5 + random()), 3),
        colors,
        cuts: Array.isArray(cuts) ? cuts.slice(0, 16) : null,
      },
    };
    // `breathe` on a bar / phrase period reads calmer than a metronome; the
    // period is only drawn once smartness is on, so old clips keep the beat
    if (s > 0 && motion === 'breathe') split.params.every = pick(random, [1, 2, 4]);
    return split;
  }

  // The mid clip's own motion on top of its planes. Not every clip pulses on
  // the beat: some hit only on the bar's downbeat, breathe over a phrase, rock,
  // float or hold still, so a song's mid layer changes character clip by clip.
  // The seventh axis drops the per-beat pulse in favour of the calmer set and
  // widens the transition choices to the hard `cut`.
  const BACKDROP_MOTIONS = ['accent', 'swell', 'sway', 'drift', 'still', 'pulse'];

  function backdropMotion(random, w, axes) {
    const s = smartOf(axes);
    const transition =
      s > 0 ? smartness.pickWeighted(random, 'transition', ['wipe', 'scale', 'rotate', 'iris', 'cut'], s) : pick(random, ['wipe', 'scale', 'rotate', 'iris']);
    // a backdrop that is fully on (w > 0.5) stops holding still and starts
    // answering the text: `sync` is the amplitude of the per-kick bounce the
    // renderer adds on top of the mode (absent while w is 0, so saved clips
    // keep their look)
    const modes = w > 0.5 ? BACKDROP_MOTIONS.filter((mode) => mode !== 'still') : BACKDROP_MOTIONS;
    const mode = s > 0 ? smartness.pickWeighted(random, 'backdropMotion', modes, s) : pick(random, modes);
    const duration = s > 0 ? pick(random, [0.2, 0.35, 0.6]) : 0.35;
    const motion = { mode, pulse: round(0.03 * (1 + w), 3), drift: round(0.012 * (1 + w), 3), transition, duration };
    if (w > 0) motion.sync = round(0.05 + 0.10 * w, 3);
    if (mode === 'accent') motion.every = pick(random, [2, 4]);
    if (mode === 'swell' || mode === 'sway') motion.every = pick(random, [4, 8, 16]);
    if (mode === 'sway') motion.sway = round(0.015 + 0.03 * w * random(), 3);
    if (mode === 'drift') motion.drift = round(0.01 + 0.02 * w, 3);
    if (mode === 'still') motion.drift = 0.006;
    return motion;
  }

  function clipSpec(kind, axes, random, genre, options) {
    const palette = paletteFor(axes, random, genre && genre.palettes);
    const colors = palette.colors;
    const overrides = genre && genre.clips ? genre.clips[kind] : null;
    if (kind === 'background') {
      const w = bgWeirdOf(axes);
      // B10: a weird background may be one of the extended primitives instead
      // of the flat noise gradient (the genre's explicit type list wins)
      if (options && options.weirdBg && w > 0 && !(overrides && overrides.types)) {
        const table = EXT_TRAITS.background;
        const sub = Object.fromEntries(
          Object.entries(table).filter(([type, tr]) => allowed('background', tr, { letterCount: 0 }, null, axes, type))
        );
        const type = Object.keys(sub).length ? weightedFromTraits(sub, null, random, axes, 'background') : null;
        if (type) {
          const params = sampleParams(random, 'background', type, axes, [colors[3], colors[5] || colors[3]]);
          if (typeof params.speed === 'number') params.speed = clampParam('background', type, 'speed', params.speed * (1 + w));
          return { spec: { type, params }, colors: colors.slice() };
        }
      }
      const allowedTypes = overrides && Array.isArray(overrides.types) && overrides.types.length ? overrides.types : ['noiseGradient', 'gradient', 'solid'];
      const moving = random() < Math.min(1, lerp(0.35, 0.85, axes.density) + w);
      let type = moving ? 'noiseGradient' : random() < 0.5 ? 'gradient' : 'solid';
      if (!allowedTypes.includes(type)) type = allowedTypes[0];
      const s = smartOf(axes);
      if (s > 0) {
        // the noise gradient carries the centre-bright mask; smartness prefers
        // the flat gradient / solid instead of the moving one
        const candidates = ['noiseGradient', 'gradient', 'solid'].filter((entry) => allowedTypes.includes(entry));
        const table = Object.fromEntries(candidates.map((entry) => [entry, TRAITS.background[entry] || [0.4, 0.7]]));
        const picked = candidates.length ? weightedFromTraits(table, null, random, axes, 'background') : null;
        if (picked) type = picked;
      }
      const params =
        type === 'noiseGradient'
          ? { scale: round(lerp(1.2, 4.6, axes.speed) * (1 + 0.5 * w), 2), speed: round(lerp(0.08, 0.7, axes.energy) * (1 + 2 * w), 2) }
          : type === 'gradient'
            ? { scale: round(lerp(0.6, 1.6, axes.softness), 2), speed: 0 }
            : {};
      // the built-in centre lift fades out with the axis: at 0.5 or more the
      // background is perfectly even
      if (s > 0 && (type === 'gradient' || type === 'noiseGradient')) params.glow = round(0.22 * Math.max(0, 1 - s / 0.5), 3);
      return { spec: { type, params }, colors: [colors[0], colors[1]] };
    }
    let pool = kind === 'backdrop' ? BACKDROP_TYPES : kind === 'filler' ? FILLER_TYPES : [];
    if (overrides && Array.isArray(overrides.types) && overrides.types.length) {
      const allowed = new Set(overrides.types);
      pool = pool.filter((type) => allowed.has(type));
    }
    if (overrides && Array.isArray(overrides.exclude) && overrides.exclude.length) {
      const blocked = new Set(overrides.exclude);
      pool = pool.filter((type) => !blocked.has(type));
    }
    if (!pool.length) return null;
    const type = pick(random, pool);
    const params = sampleClipParams(type, axes, random, options && options.index);
    const flowOverride = overrides && overrides[type];
    if (flowOverride && typeof flowOverride === 'object') {
      for (const [key, values] of Object.entries(flowOverride)) {
        if (Array.isArray(values) && values.length) params[key] = pick(random, values);
      }
    }
    const w = bgWeirdOf(axes);
    const rawPalette = options && options.palette;
    const paletteColors = Array.isArray(rawPalette)
      ? rawPalette
      : rawPalette && Array.isArray(rawPalette.colors) && rawPalette.colors.length
        ? rawPalette.colors
        : colors;
    const coverage = options && options.coverage != null ? clamp01(options.coverage) : w;
    // the profile's plane system: direct passes the plane weights and the
    // cue's text colours and gets the quiet backdrop. A caller without
    // `planes` (manual re-rolls, the old tests) keeps the classic draw.
    if (kind === 'backdrop' && options && options.planes) {
      return planeBackdropSpec(axes, random, paletteColors, options, w);
    }
    if (kind === 'backdrop' && w > 0 && coverage >= 0.02) {
      // two layers: the painted planes (the dominant layer) and the accent
      params.opacity = Math.max(
        Number(params.opacity) || 0.6,
        Math.round((0.35 + 0.4 * clamp01(axes.energy) + 0.2 * w) * 100) / 100
      );
      const plane = splitSpec(axes, random, paletteColors, coverage, options && options.cuts);
      return {
        spec: {
          type: 'combo',
          params: {
            list: [plane, { type, params }],
            animate: backdropMotion(random, w, axes),
          },
        },
        colors: weirdClipColors(random, paletteColors, w),
      };
    }
    return { spec: { type, params }, colors: w > 0 ? weirdClipColors(random, paletteColors, w) : [colors[3], colors[5] || colors[3]] };
  }

  // Re-rolls a timeline clip inside the project's axes (used by the inspector
  // and the clip context menu). `usePresets` on a filler clip draws from the
  // built-in filler preset library instead.
  function rerollClipSpec(kind, options) {
    const opts = options || {};
    const axes = normalizeAxes(opts.axes);
    const seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : Math.floor(Math.random() * 1e6);
    if (opts.usePresets && kind === 'filler' && typeof SA !== 'undefined' && SA && SA.fillerPresets && SA.fillerRender) {
      const random = rng.rngFor(seed, 'filler-preset-reroll', kind);
      const genre = opts.genre && genres ? genres.get(opts.genre) : null;
      const exclude = new Set(genre && genre.clips && genre.clips.filler && Array.isArray(genre.clips.filler.exclude) ? genre.clips.filler.exclude : []);
      const groups = new Set(['pattern', 'split', 'figures', 'combo', 'particles']);
      const pool = SA.fillerPresets
        .list()
        .filter((preset) => groups.has(preset.group) && !SA.fillerRender.layersOf(preset.spec).some((layer) => exclude.has(layer.type)));
      if (pool.length) {
        const preset = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
        const spec = SA.fillerPresets.specOf(preset.id);
        if (spec) return { spec, colors: null };
      }
    }
    const random = rng.rngFor(seed, 'clip', kind || 'background');
    const genre = opts.genre && genres ? genres.get(opts.genre) : null;
    return clipSpec(kind, axes, random, genre, {
      index: opts.index,
      weirdBg: opts.weirdBg,
      palette: opts.palette,
      coverage: opts.coverage,
      cuts: opts.cuts,
      planes: opts.planes,
      textColors: opts.textColors,
      rawW: opts.rawW,
    });
  }

  // Colour-only re-roll of a timeline clip: the spec keeps its layout, motion
  // and timing; split planes draw a fresh scheme from `palette`, the clip's
  // own colours are drawn again from it, and any other literal colour moves
  // from `from` (the palette the clip was made with) onto the new one.
  function rerollClipColors(kind, clip, options) {
    const opts = options || {};
    const colorsOf = (value) => (Array.isArray(value) ? value : value && Array.isArray(value.colors) ? value.colors : []).filter((hex) => typeof hex === 'string' && HEX.test(hex));
    const to = colorsOf(opts.palette);
    if (!clip || !to.length) return null;
    const from = colorsOf(opts.from);
    const axes = normalizeAxes(opts.axes);
    const w = bgWeirdOf(axes);
    const seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : Math.floor(Math.random() * 1e6);
    const random = rng.rngFor(seed, 'clip-colors', kind || 'backdrop');
    const rawW = opts.rawW != null && Number.isFinite(Number(opts.rawW)) ? Number(opts.rawW) : w;
    const textColors = (Array.isArray(opts.textColors) ? opts.textColors : []).filter((hex) => typeof hex === 'string');
    let planeList = null;
    const walk = (node) => {
      if (typeof node === 'string') return from.length && HEX.test(node) ? recolor(node, from, to) : node;
      if (Array.isArray(node)) return node.map(walk);
      if (!node || typeof node !== 'object') return node;
      const out = {};
      for (const [key, entry] of Object.entries(node)) out[key] = walk(entry);
      if (node.type === 'split' && node.params && Array.isArray(node.params.colors) && node.params.colors.length) {
        if (opts.planes) {
          // the profile path rebuilds the planes from the background slot
          const count = Math.max(1, Math.min(4, Math.round(Number(node.params.parts) || node.params.colors.length)));
          const scheme = planeScheme(random, rawW);
          const colors = planeColors(to, count, scheme, textColors, rawW);
          planeList = colors;
          out.params = { ...out.params, scheme, colors };
        } else {
          const { scheme, colors } = splitColors(to, Math.min(6, node.params.colors.length), w, random, axes);
          out.params = { ...out.params, scheme, colors };
        }
      }
      return out;
    };
    const spec = clip.spec ? walk(clip.spec) : clip.spec;
    let colors;
    if (kind === 'background') colors = [to[0], to[1] || to[0]];
    else if (opts.planes && planeList) colors = accentColors(planeList);
    else if (w > 0) colors = weirdClipColors(random, to, w);
    else colors = [to[3] || to[to.length - 1], to[5] || to[3] || to[to.length - 1]];
    return { spec, colors };
  }

  // --- genre helpers -----------------------------------------------------------

  function mergePatch(base, patch) {
    const result = Array.isArray(base) ? [...base] : { ...(base || {}) };
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch === undefined ? result : patch;
    for (const [key, value] of Object.entries(patch)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
        result[key] = mergePatch(result[key], value);
      } else {
        result[key] = JSON.parse(JSON.stringify(value));
      }
    }
    return result;
  }

  function fontSetPool(cjk) {
    if (typeof SA === 'undefined' || !SA.lyricsFont || typeof SA.lyricsFont.fontPool !== 'function') return [];
    try {
      return SA.lyricsFont.fontPool(cjk) || [];
    } catch {
      return [];
    }
  }

  function fontAvailable(id) {
    if (typeof SA === 'undefined' || !SA.lyricsFont || typeof SA.lyricsFont.builtins !== 'function') return true;
    try {
      return SA.lyricsFont.builtins().some((entry) => entry.id === id);
    } catch {
      return true;
    }
  }

  function sampleGenreParam(spec, random) {
    if (Array.isArray(spec) && spec.length >= 2 && Number.isFinite(Number(spec[0]))) {
      return round(lerp(Number(spec[0]), Number(spec[1]), random()), 3);
    }
    if (spec && typeof spec === 'object' && Array.isArray(spec.pick)) return pick(random, spec.pick);
    return spec;
  }

  function applyGenreParams(style, genre, random) {
    if (!genre || !genre.params) return;
    for (const [path, table] of Object.entries(genre.params)) {
      const [group, type] = String(path).split('.');
      if (!group || !type) continue;
      const apply = (instance) => {
        if (!instance || instance.type !== type) return;
        instance.params = instance.params || {};
        for (const [key, spec] of Object.entries(table)) instance.params[key] = sampleGenreParam(spec, random);
      };
      const value = style[group];
      if (Array.isArray(value)) value.forEach(apply);
      else apply(value);
    }
  }

  function pickWeightedEntry(table, random) {
    const entries = Object.entries(table || {}).filter(([, weight]) => Number(weight) > 0);
    if (!entries.length) return null;
    const total = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);
    let roll = random() * total;
    for (const [key, weight] of entries) {
      roll -= Number(weight);
      if (roll <= 0) return key;
    }
    return entries[entries.length - 1][0];
  }

  function applySignature(style, genre, random, emphasis, ensure, w) {
    if (!genre || !Array.isArray(genre.signature) || !genre.signature.length) return null;
    let pool = genre.signature;
    if (emphasis && genre.emphasis && Array.isArray(genre.emphasis.signature) && genre.emphasis.signature.length) {
      const ids = new Set(genre.emphasis.signature);
      const filtered = genre.signature.filter((entry) => ids.has(entry.id));
      if (filtered.length) pool = filtered;
    } else if (!emphasis && !ensure) {
      // G10: a weird look draws its genre signature more often
      const rate = genre.signatureRate == null ? 1 : Number(genre.signatureRate);
      if (random() > Math.min(1, rate + 0.5 * (w || 0))) return null;
    }
    const total = pool.reduce((sum, entry) => sum + Math.max(0, Number(entry.weight) || 0), 0);
    let chosen = pool[pool.length - 1];
    if (total > 0) {
      let roll = random() * total;
      for (const entry of pool) {
        roll -= Math.max(0, Number(entry.weight) || 0);
        if (roll <= 0) {
          chosen = entry;
          break;
        }
      }
    }
    if (chosen && chosen.patch) {
      for (const [key, value] of Object.entries(chosen.patch)) {
        style[key] = mergePatch(style[key], value);
      }
    }
    return chosen ? chosen.id : null;
  }

  function applyGenreMotion(style, genre, random) {
    if (!genre || !genre.motion) return;
    const motion = genre.motion;
    for (const group of ['enter', 'exit']) {
      const instance = style[group];
      if (!instance || !instance.motion) continue;
      const isEnter = group === 'enter';
      const scale = isEnter ? motion.inScale : motion.outScale;
      const eases = isEnter ? motion.inEase : motion.outEase;
      if (scale) {
        instance.motion[isEnter ? 'in' : 'out'].duration = round(instance.motion[isEnter ? 'in' : 'out'].duration * scale, 3);
      }
      if (Array.isArray(eases) && eases.length) {
        instance.motion[isEnter ? 'in' : 'out'].ease = pick(random, eases);
      }
      if (instance.motion.stagger) {
        if (Array.isArray(motion.staggerEach) && motion.staggerEach.length >= 2) {
          instance.motion.stagger.each = round(lerp(motion.staggerEach[0], motion.staggerEach[1], random()), 3);
        }
        if (Array.isArray(motion.staggerOrder) && motion.staggerOrder.length) {
          instance.motion.stagger.order = pick(random, motion.staggerOrder);
        }
      }
    }
  }

  const BG_SHAPE_TRAITS = {
    square: [0.6, 0.55],
    rounded: [0.4, 0.8],
    circle: [0.55, 0.6],
    diamond: [0.7, 0.3],
    ring: [0.6, 0.5],
    bar: [0.35, 0.8],
    star: [0.85, 0.3],
    blob: [0.5, 0.7],
    heart: [0.4, 0.85],
    splatter: [0.8, 0.3],
    scratch: [0.85, 0.2],
    drop: [0.4, 0.8],
    bracket: [0.75, 0.35],
    paper: [0.6, 0.5],
    cloud: [0.3, 0.9],
  };

  const BG_MOTION_TRAITS = {
    follow: [0.3, 0.8],
    fade: [0.2, 0.9],
    grow: [0.4, 0.7],
    float: [0.3, 0.9],
    wipe: [0.5, 0.6],
    pop: [0.7, 0.5],
    spin: [0.75, 0.4],
    stamp: [0.85, 0.2],
    fall: [0.6, 0.5],
    flicker: [0.9, 0.15],
    bleed: [0.8, 0.25],
  };

  function weightedFromTraits(table, weights, random, axes, group) {
    const target = axes || { softness: 0.5, energy: 0.5 };
    const s = smartOf(target);
    const entries = [];
    for (const [type, traits] of Object.entries(table)) {
      const weight = weights && weights[type] != null ? Number(weights[type]) : 1;
      if (weight <= 0) continue;
      const smart = group ? smartness.weight(smartness.rate(group, type), s) : 1;
      if (smart <= 0) continue;
      const fear = group ? fearWeightOf(group, type, target) : 1;
      if (!(fear > 0)) continue;
      entries.push({ type, weight: Math.pow(scoreEntry(traits, target), 2) * weight * smart * fear * (0.7 + random() * 0.6) });
    }
    if (!entries.length) return null;
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = random() * total;
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll <= 0) return entry.type;
    }
    return entries[entries.length - 1].type;
  }

  function colorRefHex(value, palette) {
    if (!value) return null;
    if (value.kind === 'palette') return palette[Math.abs(Math.floor(value.index || 0)) % palette.length] || null;
    if (value.kind === 'gradient') {
      const stop = (value.stops || [])[0];
      if (!stop) return null;
      if (stop.paletteIndex != null) return palette[Math.abs(Math.floor(stop.paletteIndex)) % palette.length] || null;
      return stop.color || null;
    }
    if (typeof value.value === 'string') return value.value;
    return null;
  }

  function enforceReadability(style, palette, random, w, rawW, rawFear) {
    const shape = style.bgShape;
    if (!shape || !shape.type || shape.type === 'none') return;
    const params = shape.params || (shape.params = {});
    if (params.unit !== 'cell') return;
    if (params.opacity != null && params.opacity < 0.5) return;
    const bgColors = Array.isArray(params.varyColors) && params.varyColors.length ? params.varyColors : [palette[3] || '#888888'];
    const fill = style.color && style.color.fill;
    const fgHex = colorRefHex(fill, palette);
    if (!fgHex) return;
    const ratio = (a, b) => color.contrastRatio(color.parse(a), color.parse(b));
    const worst = Math.min(...bgColors.map((hex) => ratio(fgHex, hex || '#000000')));
    // the minimum the auto-contrast aims for: the legibility floor (4.5) as
    // soon as an axis that may break readability (weird / fear) is on; the
    // untouched legacy draw keeps its old 3:1 floor so old catalogs stay
    // byte-identical
    const active = clamp01(rawW) > 0 || clamp01(rawFear) > 0;
    const floor = active ? 4.5 : 3;
    if (worst >= floor) return;
    const options = [2, 4];
    let best = null;
    let bestRatio = worst;
    for (const index of options) {
      const candidate = palette[index % palette.length];
      const candidateRatio = Math.min(...bgColors.map((hex) => ratio(candidate, hex || '#000000')));
      if (candidateRatio > bestRatio) {
        bestRatio = candidateRatio;
        best = index;
      }
    }
    if (best != null) style.color = { ...(style.color || {}), fill: { kind: 'palette', index: best } };
    if (bestRatio < floor) params.fgAutoContrast = true;
    // an enclose background must not fight text-shaping edges; a weird look may
    // keep them (I14)
    if (Array.isArray(style.edge) && !(random && breaks(random, w, 0.7))) {
      style.edge = style.edge.filter((edge) => !['extrude', 'longShadow'].includes(edge && edge.type));
      if (!style.edge.length) delete style.edge;
    }
  }

  // Picks one of the three placements from a weight map keyed by the profile's
  // keys (bgEnclose / bgAccent / bgUnderlay).
  function pickPlacement(weights, random) {
    return pickWeightedEntry({
      enclose: weights && weights.bgEnclose,
      accent: weights && weights.bgAccent,
      underlay: weights && weights.bgUnderlay,
    }, random);
  }

  // The text background of one look. The optional `options` (the compose
  // profile) may pin the presence chance / placement weights / vary and edge
  // chances; a pinned value overrides the genre's own table, an absent one
  // keeps the classic order (genre config first, then the derived defaults), so
  // a call without options reproduces the old draw exactly.
  function applyGenreBackground(style, genre, axes, random, palette, forced, options) {
    const opts = options || {};
    const w = textWeirdOf(axes);
    const config = genre && genre.bg ? genre.bg : null;
    // presence: pinned profile chance, then the genre's own, then the derived
    // default (which equals the classic 0.08 + 0.22*density + 0.5*w). G9: a
    // weird look grows a text background more often.
    let chance;
    if (opts.chance != null) chance = clamp01(opts.chance);
    else if (config && config.chance != null) chance = Number(config.chance) + 0.5 * w;
    else chance = genParamsMod.derive(axes).textBgChance;
    if (!forced && random() >= Math.min(1, chance)) return false;
    // placement: pinned weights, then the genre's table, then the derived
    // defaults (the classic 0.55 / 0.25 / 0.2)
    let placement;
    if (opts.placement) {
      placement = pickPlacement(opts.placement, random) || 'enclose';
    } else if (config && config.placement) {
      placement = pickWeightedEntry(config.placement, random) || 'enclose';
    } else {
      const auto = genParamsMod.derive(axes);
      placement = pickWeightedEntry({ enclose: auto.bgEnclose, accent: auto.bgAccent, underlay: auto.bgUnderlay }, random) || 'enclose';
    }
    const shapeWeights = config && config.shapes ? config.shapes : null;
    const shape = weightedFromTraits(BG_SHAPE_TRAITS, shapeWeights, random, axes) || 'square';
    // placement constraints (I13: a weird look may break them)
    let adjusted = placement;
    if (!breaks(random, w, 0.6)) {
      if (shape === 'bar' && placement !== 'enclose') adjusted = 'enclose';
      if ((shape === 'star' || shape === 'heart') && placement === 'enclose') adjusted = 'accent';
      if (shape === 'scratch' && placement !== 'underlay') adjusted = 'underlay';
    }
    const jitter = 0.9 + random() * 0.2;
    const params = { color: null, skipSpaces: true };
    if (adjusted === 'enclose') {
      params.unit = 'cell';
      // the background hugs the cell (P-E-2): 0.9-1.1 cells, never a slab
      params.width = round(lerp(0.9, 1.1, random()) * jitter, 2);
      params.height = params.width;
      params.layer = 'behind';
      if (shape === 'bar') params.height = round(lerp(0.3, 0.45, random()), 2);
    } else if (adjusted === 'accent') {
      params.unit = 'em';
      // an accent does not grow with the weird axis (it must not swallow text)
      const size = lerp(0.25, 0.45, random()) * jitter;
      params.width = round(size, 2);
      params.height = round(size, 2);
      params.offset = { x: (random() < 0.5 ? -1 : 1) * 0.45, y: -0.45 };
      params.layer = 'front';
    } else {
      params.unit = 'em';
      // the underlay is a soft wash behind the line: 1.2-1.6 em
      const size = lerp(1.2, 1.6, random()) * jitter;
      params.width = round(size, 2);
      params.height = round(size, 2);
      params.layer = 'behind';
      params.opacity = round(lerp(0.25, 0.5, random()), 2);
      params.varyRotation = round(random() * 25 * (1 + 2 * w), 1);
    }
    if (shape === 'bar' && adjusted !== 'underlay') params.offset = { x: 0, y: 0.3 };
    // variation
    const varyTable = (config && config.vary) || null;
    let vary;
    if (opts.varyChance != null) {
      vary = random() < clamp01(opts.varyChance) ? pick(random, ['alternate', 'charClass', 'cycle']) : 'none';
    } else {
      vary = pickWeightedEntry(varyTable, random) || (random() < 0.3 + 0.7 * w ? pick(random, ['alternate', 'charClass', 'cycle']) : 'none');
    }
    params.vary = vary;
    const colorMode = (config && config.colors) || 'accent';
    const varyColors =
      colorMode === 'text'
        ? [palette[2], palette[4]].filter(Boolean)
        : colorMode === 'mixed'
          ? [palette[3], palette[5], palette[2]].filter(Boolean)
          : [palette[3], palette[5] || palette[3]].filter(Boolean);
    params.varyColors = varyColors.length ? varyColors : [];
    style.bgShape = { type: shape, params, enabled: true };
    // fill
    const fillTable = (config && config.fill) || null;
    let fillType = pickWeightedEntry(fillTable, random);
    if (!fillType) {
      const holographic = axes.energy >= 0.72;
      const roll = random();
      fillType = roll < 0.7 ? 'solid' : roll < 0.9 ? 'gradientSweep' : holographic ? 'holographic' : 'solid';
    }
    style.bgFill = { type: fillType, params: fx.paramDefaults('bgFill', fillType), enabled: true };
    // edge
    const edgeTable = (config && config.edge) || null;
    let edgeType;
    if (opts.edgeChance != null) {
      edgeType = random() < clamp01(opts.edgeChance) ? (random() < 0.6 ? 'outline' : 'dropShadow') : null;
    } else {
      edgeType = pickWeightedEntry(edgeTable, random);
      if (!edgeType && random() < 0.4) edgeType = random() < 0.6 ? 'outline' : 'dropShadow';
    }
    if (edgeType && edgeType !== 'none') {
      const edgeParams = fx.paramDefaults('bgEdge', edgeType);
      if (edgeType === 'outline') {
        const patternRoll = random();
        edgeParams.pattern = patternRoll < 0.6 ? 'solid' : patternRoll < 0.85 ? 'dashed' : 'dotted';
      }
      style.bgEdge = [{ type: edgeType, params: edgeParams, enabled: true }];
    }
    // motion
    const motionTable = (config && config.motions) || null;
    const motionType = pickWeightedEntry(motionTable, random) || weightedFromTraits(BG_MOTION_TRAITS, null, random, axes) || 'follow';
    const motionParams = fx.paramDefaults('bgMotion', motionType);
    motionParams.lead = round(lerp(0.12, 0.02, axes.speed), 2);
    motionParams.duration = round(lerp(0.5, 0.2, axes.speed), 2);
    style.bgMotion = { type: motionType, params: motionParams, enabled: true };
    return true;
  }

  function isEmphasis(cue) {
    const text = (cue && cue.text) || '';
    if (/[!！?？]\s*$/.test(text)) return true;
    if (text.replace(/\s/g, '').length <= 4) return true;
    return !!(cue && cue.meta && cue.meta.section === 'chorus');
  }

  // The fields shared by every scope: they only read the cue list, so a cue
  // context does not have to run the per-cue letter / word aggregates.
  function projectBase(project) {
    const cues = (project && project.script && project.script.cues) || [];
    const text = cues.map((cue) => cue.text || '').join('');
    return {
      cjk: CJK_RE.test(text),
      hasPrevious: cues.length > 1,
      badgeId: cues.some((cue) => cue.meta && cue.meta.badgeId),
      hasCard: !!(project && project.dataset),
      aspect: (project && project.output && project.output.aspect) || '16:9',
    };
  }

  function contextFor(project) {
    const cues = (project && project.script && project.script.cues) || [];
    const longest = cues.reduce((max, cue) => Math.max(max, String(cue.text || '').replace(/\s/g, '').length), 0);
    const words = cues.reduce((max, cue) => Math.max(max, countWords(cue && cue.text)), 0);
    return {
      ...projectBase(project),
      letterCount: longest,
      wordCount: words,
    };
  }

  function contextForCue(project, cue) {
    const text = (cue && cue.text) || '';
    return {
      ...projectBase(project),
      letterCount: String(text).replace(/\s/g, '').length,
      wordCount: countWords(text),
      cjk: CJK_RE.test(text),
    };
  }

  // random genre (or a preset when no genre list is available)
  function randomGenre(random) {
    if (genres && typeof genres.randomGenre === 'function') return genres.randomGenre(random);
    const r = typeof random === 'function' ? random : Math.random;
    const preset = PRESETS[Math.min(PRESETS.length - 1, Math.floor(r() * PRESETS.length))];
    const axes = {};
    for (const axis of MATCH_AXES) axes[axis] = clamp01(preset.axes[axis] + (r() * 2 - 1) * 0.12);
    return { genre: preset.id, axes, direction: preset.direction || 'horizontal' };
  }

  // kept for compatibility: returns the axes of a random genre
  function randomAxes(random) {
    const picked = randomGenre(random);
    return { axes: picked.axes, direction: picked.direction || 'horizontal' };
  }

  // music -> axes: loudness, dynamics, spectral brightness, onset density and BPM
  function axesFromAudio(features) {
    const source = features || {};
    const energy = clamp01(source.energy == null ? 0.5 : source.energy);
    const dynamics = clamp01(source.dynamics == null ? 0.4 : source.dynamics);
    const brightness = clamp01(source.brightness == null ? 0.5 : source.brightness);
    const onsets = Number(source.onsets) || 0;
    const bpm = Number(source.bpm) || 0;
    const speedFromBpm = bpm >= 60 ? clamp01((bpm - 70) / 90) : clamp01(onsets / 5);
    return {
      speed: clamp01(speedFromBpm * 0.7 + energy * 0.3),
      energy: clamp01(energy * 0.65 + Math.min(1, onsets / 5) * 0.35),
      softness: clamp01(1 - (brightness * 0.55 + energy * 0.45)),
      density: clamp01(0.2 + dynamics * 0.5 + energy * 0.3),
      brightness: clamp01(0.35 + brightness * 0.6),
    };
  }

  function frameForContext(context) {
    const aspect = (context && context.aspect) || '16:9';
    if (aspect === '9:16') return { width: 1080, height: 1920 };
    if (aspect === '1:1') return { width: 1080, height: 1080 };
    return { width: 1920, height: 1080 };
  }

  // The legibility repair engages only while the axes that may break
  // readability are on: weird (raw) or fear. At 0 every existing draw stays
  // byte-identical and consumes no extra random.
  function legibilityActive(axes) {
    return weirdOf(axes) > 0 || fearOf(axes) > 0;
  }

  function repairLegibility(style, axes, context, palette, extra) {
    if (!legibilityMod || typeof legibilityMod.repair !== 'function' || !legibilityActive(axes)) return style;
    const repaired = legibilityMod.repair(style, {
      frame: frameForContext(context),
      palette: (palette && palette.colors) || palette || [],
      letterCount: (context && context.letterCount) || 12,
      aspect: context && context.aspect,
      duration: (context && context.duration) || 3,
      // the fully-displayed hold (the stop) the lyric must keep: 0.2 s plus
      // 0.05 s per word at weird 0.6, growing below the anchor and shrinking
      // towards 0 as the axis rises
      holdMin: legibilityMod.holdMinFor ? legibilityMod.holdMinFor(weirdOf(axes), fearOf(axes), context && context.wordCount) : undefined,
      ...(extra || {}),
    });
    return repaired && repaired.style ? repaired.style : style;
  }

  function generate(options) {
    const opts = options || {};
    const genre = opts.genre && genres ? genres.get(opts.genre) : null;
    const axes = normalizeAxes(opts.axes || (genre && genre.axes));
    const w = textWeirdOf(axes);
    const emphasis = !!opts.emphasis;
    if (emphasis) axes.energy = clamp01(axes.energy + 0.2);
    const seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : 1;
    const context = {
      letterCount: opts.context && opts.context.letterCount != null ? opts.context.letterCount : 0,
      wordCount: opts.context && opts.context.wordCount != null ? Math.max(0, Number(opts.context.wordCount) || 0) : 0,
      cjk: !!(opts.context && opts.context.cjk),
      hasPrevious: !!(opts.context && opts.context.hasPrevious),
      badgeId: !!(opts.context && opts.context.badgeId),
      hasCard: !!(opts.context && opts.context.hasCard),
      aspect: (opts.context && opts.context.aspect) || '16:9',
    };
    const direction =
      opts.direction === 'vertical'
        ? 'vertical'
        : opts.direction === 'horizontal'
          ? 'horizontal'
          : (genre && genre.direction) || null;
    const random = rng.rngFor(seed, 'mood', 'theme');
    const style = {};
    const palette = generatePalette(random, axes, null, genre && genre.palettes);
    style.palette = palette;
    // effect colors come from the readable part of the palette (text / accent),
    // plus one dark tone for shadows and extruded edges only. On a light theme
    // the text itself is dark, so keep a visible tone in the pool.
    const visible = (hex) => color.rgbToHsv(color.parse(hex)).v >= 0.25;
    const brightPool = [palette.colors[2], palette.colors[3], palette.colors[5] || palette.colors[3]].filter(Boolean);
    let bright = brightPool.filter(visible);
    if (!bright.length) bright = brightPool;
    const dark = palette.colors[4] || palette.colors[0];
    // H4: the accents join every colour pool once the axis is on
    const colors = { bright, dark, accents: [palette.colors[3], palette.colors[5], palette.colors[6]].filter(Boolean) };
    style.color = colorSetFor(random, palette, axes);
    // one hero effect per theme; genre profiles may override the weighting
    const hero = genre && genre.hero ? pickGenreHero(genre, random) : pickHero(random, axes);
    // B8: a weird look may carry a second hero family (an edge and a post at once)
    const hero2 = w > 0 && breaks(random, w, 0.6) ? pickHero(random, axes) : null;
    for (const group of SINGLE_GROUPS) {
      if (group === 'layout' && direction === 'vertical') {
        style.layout = {
          type: 'vertical',
          params: sampleParams(random, 'layout', 'vertical', axes, bright),
          enabled: true,
          motion: motionFor(random, 'layout', axes),
        };
        continue;
      }
      const instance = instanceFor(random, group, axes, context, direction, colors, null, genre, { typeWeights: opts.typeWeights });
      if (instance) style[group] = instance;
    }
    // holds: energy decides how often an idle motion shows up, softness its type
    const holdChance =
      (genre && genre.density && genre.density.hold != null ? Number(genre.density.hold) : 0.1 + axes.energy * 0.6) + 0.5 * w;
    if (random() < holdChance) {
      const instance = instanceFor(random, 'hold', axes, context, direction, colors, null, genre, { typeWeights: opts.typeWeights });
      if (instance) style.hold = [instance];
    }
    // edge / post: density decides how often and how many, softness the family
    for (const group of ['edge', 'post']) {
      const isHero = hero === group || hero2 === group;
      const presence =
        (genre && genre.density && genre.density[group] != null ? Number(genre.density[group]) : Math.max(0.08, 0.15 + axes.density * 0.7)) +
        0.35 * w;
      if (!isHero && random() >= presence) continue;
      let count = isHero ? (axes.density > 0.6 - 0.3 * w && random() < 0.6 ? 2 : 1) : axes.density > 0.7 - 0.3 * w && random() < 0.5 ? 2 : 1;
      // H2: a very weird look may stack three
      if (group === 'edge' && w > 0.5 && breaks(random, w, 0.5)) count = 3;
      const stack = [];
      const used = new Set();
      for (let i = 0; i < count; i += 1) {
        // the genre's hero group is exempt from the hard exclusion (it keeps the
        // genre's identity; only the weight penalty applies)
        const instance = instanceFor(random, group, axes, context, direction, colors, used, genre, { hero: isHero && !!genre, typeWeights: opts.typeWeights });
        if (!instance) break;
        if (!instance.params || !Object.keys(instance.params).length) instance.params = sampleParams(random, group, instance.type, axes, colorPoolFor(instance.type, colors, random, w));
        used.add(instance.type);
        stack.push(instance);
      }
      if (stack.length) style[group] = stack;
    }
    let signature = null;
    if (genre) {
      applyGenreParams(style, genre, random);
      applyGenreMotion(style, genre, random);
    }
    // generic background rules also apply without a genre (low chance)
    const forced = hero === 'bg';
    applyGenreBackground(style, genre, axes, random, palette.colors, forced || hero2 === 'bg');
    if (genre) signature = applySignature(style, genre, random, emphasis, !!opts.ensureSignature, w);
    style.text = textStyleFor(random, axes, context, genre);
    enforceReadability(style, palette.colors, random, w, weirdOf(axes), fearOf(axes));
    const finalStyle = repairLegibility(style, axes, context, palette);
    return {
      style: finalStyle,
      axes,
      seed,
      direction: direction || 'horizontal',
      palette: palette.id,
      genre: genre ? genre.id : null,
      signature,
    };
  }

  // 2-14: the beat-level hold a very weird auto-direct draw may insert (a
  // louder instance than the generator's own hold pool would pick).
  function weirdBeatHold(random, axes, context, colors) {
    const a = normalizeAxes(axes);
    a.energy = Math.max(a.energy, 0.75);
    return instanceFor(random, 'hold', a, { letterCount: 0, ...(context || {}) }, null, colors || [], null, null);
  }

  return {
    AXES,
    MATCH_AXES,
    PRESETS,
    GROUPS,
    THEME_TEXT_GROUPS,
    TRAITS,
    EXT_TRAITS,
    EXT_REVEAL,
    CLASSIC_WEIRD,
    WEIRD_TAG_OK,
    WEIRD_DEFAULT,
    SMART_DEFAULT,
    smartOf,
    projectSmartness,
    smartness,
    poolFor,
    allowed,
    pickEntry,
    PALETTES,
    PALETTE_FAMILIES,
    FONTS,
    generate,
    generatePalette,
    generatePaletteSet,
    paletteColors10,
    paletteFor10,
    variantPalette,
    schemeFor,
    jitterPalette,
    recolor,
    paletteFor,
    paletteColors,
    rerollClipSpec,
    rerollClipColors,
    normalizeAxes,
    randomAxes,
    randomGenre,
    isEmphasis,
    applyGenreBackground,
    enforceReadability,
    axesFromAudio,
    contextFor,
    contextForCue,
    countWords,
    weirdOf,
    textWeirdOf,
    bgWeirdOf,
    projectWeird,
    fearOf,
    projectFear,
    fearWeightOf,
    FEAR_TAG_OK,
    legibilityActive,
    repairLegibility,
    frameForContext,
    legibility: legibilityMod,
    tameGlow,
    repairContrast,
    weirdPalette,
    weirdBeatHold,
    weirdFont,
    weirdDecoration,
    weirdClipColors,
    splitColors,
    splitSpec,
    PLANE_LAYOUTS,
    planeCount,
    planeScheme,
    planeColors,
    accentColors,
    separatePlane,
    planeBackdropSpec,
    backdropMotion,
    BACKDROP_MOTIONS,
    SPLIT_SCHEMES,
    clipSpec,
    bend,
    score: scoreEntry,
  };
});
