(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng'), require('./effects/registry'), require('../color'), require('./genres'));
  else {
    root.SA = root.SA || {};
    root.SA.moods = factory(root.SA.rng, root.SA.fx, root.SA.color, root.SA.genres);
  }
})(typeof self !== 'undefined' ? self : this, function (rng, fx, color, genres) {
  'use strict';

  const AXES = ['speed', 'energy', 'softness', 'density', 'brightness'];

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
    // genre-only families: fixed hues and forced light levels
    blood: { energy: 0.5, bgHue: 355, accentHue: 0, genreOnly: true, bgS: 0.55, bgV: [0.03, 0.08], textHue: 40, textS: 0.12, accentS: 0.9, accentV: 0.55 },
    ash: { energy: 0.35, bgHue: 90, accentHue: 60, genreOnly: true, bgS: 0.12, bgV: [0.1, 0.2], textS: 0.08, accentS: 0.25, accentV: 0.5 },
    blush: { energy: 0.35, bgHue: 340, accentHue: 348, genreOnly: true, bgS: 0.18, bgV: [0.92, 0.98], textHue: 345, textS: 0.6, accentS: 0.55, accentV: 0.95 },
    sunset: { energy: 0.5, bgHue: 20, accentHue: 330, genreOnly: true, bgS: 0.55, accentS: 0.65 },
    rain: { energy: 0.3, bgHue: 212, accentHue: 200, genreOnly: true, bgS: 0.25, accentS: 0.3, accentV: 0.7 },
    festival: { energy: 0.8, bgHue: 45, accentHue: 355, genreOnly: true, bgS: 0.7, accentS: 0.9, accentV: 0.95 },
  };
  const PALETTES = PALETTE_FAMILIES;

  const FONTS = {
    soft: ['NotoSerif-Regular', 'NotoSans-Regular', 'NotoSansJP-Regular'],
    plain: ['NotoSans-Regular', 'NotoSansJP-Regular', 'NotoSans-Bold'],
    hard: ['DelaGothicOne', 'NotoSans-Bold', 'NotoSansJP-Bold'],
    latinHard: ['BebasNeue', 'DelaGothicOne', 'NotoSans-Bold'],
  };

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0.5;
    return Math.max(0, Math.min(1, number));
  }

  function normalizeAxes(axes) {
    const source = axes || {};
    const out = {};
    for (const key of AXES) out[key] = clamp01(source[key] == null ? 0.5 : source[key]);
    return out;
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

  function allowed(group, traits, context, direction, axes) {
    const flags = traits[2] || {};
    if (direction === 'vertical' && group === 'layout' && !flags.vertical) return false;
    if (direction === 'horizontal' && group === 'layout' && flags.vertical) return false;
    if (flags.needsCard && !context.hasCard) return false;
    if (flags.needsBadge && !context.badgeId) return false;
    if (flags.maxLetters != null && context.letterCount > flags.maxLetters) return false;
    // effects that only look good loud are gated behind high energy
    if (flags.minEnergy != null && (!axes || axes.energy < flags.minEnergy)) return false;
    return true;
  }

  // softness owns the texture: how the effect looks, not how loud it is.
  // energy only nudges the pick inside that family (and gates the loud effects
  // through `allowed`), so the two axes stay readable.
  function scoreEntry(traits, axes) {
    const energy = traits[0];
    const softness = traits[1];
    const texture = 1 - Math.abs(softness - axes.softness) / 1.15;
    const force = 1 - Math.abs(energy - axes.energy) * 0.3;
    return Math.max(0.02, texture * force);
  }

  function genreAffinity(genre, group, type) {
    if (!genre || !genres) return 1;
    return genres.affinity(genre, group, type);
  }

  function pickEntry(random, group, axes, context, direction, exclude, genre) {
    const pool = TRAITS[group] || {};
    const allowedTags = genre && Array.isArray(genre.allowTags) ? new Set(genre.allowTags) : null;
    const build = (useGenre) => {
      const scored = [];
      for (const [type, traits] of Object.entries(pool)) {
        if (exclude && exclude.has(type)) continue;
        if (useGenre && genreAffinity(genre, group, type) <= 0) continue;
        if (!allowed(group, traits, context, direction, axes)) continue;
        // skip glyph-destroying or overlapping effects (pixelate, halftone,
        // dissolves, scatter, echo trails...) when generating automatically;
        // they remain selectable by hand unless the genre opts in
        const descriptor = fx.get(group, type);
        if (descriptor) {
          if (descriptor.tags.includes('degrade') && !(allowedTags && allowedTags.has('degrade'))) continue;
          if (descriptor.tags.includes('overlap') && !(allowedTags && allowedTags.has('overlap'))) continue;
        }
        const fit = scoreEntry(traits, axes);
        // a sharp exponent keeps the mood's character instead of near-uniform picks
        const affinity = useGenre ? Math.max(0.05, genreAffinity(genre, group, type)) : 1;
        scored.push({ type, weight: Math.pow(fit, 4) * affinity * (0.7 + random() * 0.6) });
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
  // (`param.random`); without one the author's default is kept.
  function sampleParams(random, group, type, axes, colors) {
    const descriptor = fx.get(group, type);
    const params = {};
    if (!descriptor) return params;
    for (const param of descriptor.params || []) {
      if (param.kind === 'number' || param.kind === 'int') {
        const min = param.min == null ? 0 : param.min;
        const max = param.max == null ? min + 1 : param.max;
        const fallback = param.default == null ? min : param.default;
        const range = Array.isArray(param.random) && param.random.length >= 2 ? param.random : null;
        if (!range) {
          params[param.key] = param.kind === 'int' ? Math.round(fallback) : fallback;
          continue;
        }
        const bias = clamp01(axes.energy);
        const t = clamp01(bias * 0.6 + random() * 0.4);
        const value = Math.max(min, Math.min(max, range[0] + (range[1] - range[0]) * t));
        params[param.key] = param.kind === 'int' ? Math.round(value) : round(value, Math.abs(value) < 0.1 ? 4 : 2);
      } else if (param.kind === 'select') {
        params[param.key] = pick(random, param.options || [param.default]);
      } else if (param.kind === 'bool') {
        params[param.key] = param.key === 'enabled' ? true : random() < 0.3;
      } else if (param.kind === 'color') {
        params[param.key] = pick(random, colors && colors.length ? colors : ['#ffd7a8']);
      } else if (param.kind === 'vec2') {
        params[param.key] = param.default && typeof param.default === 'object' ? { ...param.default } : { x: 0, y: 0 };
      }
    }
    return params;
  }

  const SHADOW_TYPES = new Set(['dropShadow', 'longShadow', 'extrude']);

  function colorPoolFor(type, colors) {
    if (Array.isArray(colors)) return colors;
    if (!colors || !colors.bright) return [];
    return SHADOW_TYPES.has(type) && colors.dark ? [colors.dark, ...colors.bright] : colors.bright;
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
    return {
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
  }

  function instanceFor(random, group, axes, context, direction, colors, exclude, genre) {
    const type = pickEntry(random, group, axes, context, direction, exclude, genre);
    if (!type) return null;
    return { type, params: sampleParams(random, group, type, axes, colorPoolFor(type, colors)), enabled: true, motion: motionFor(random, group, axes) };
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
    const textHue = family.textHue != null ? family.textHue : family.accentHue;
    const bg = hsvHex(family.bgHue, bgS, bgV);
    const bg2 = hsvHex(family.bgHue + 14, bgS * 0.88, midV);
    let text = hsvHex(textHue, textS, textV);
    text = color.ensureContrast(text, bg, 4.5);
    const accent = hsvHex(family.accentHue, accentS, accentV);
    const stroke = hsvHex(family.bgHue + 5, 0.45, strokeV);
    const accent2 = hsvHex(family.accentHue + 40, accentS * 0.9, Math.min(1, accentV * 1.08));
    return [bg, bg2, text, accent, stroke, accent2];
  }

  function paletteFamilyFor(axes, random, allowed) {
    const permitted = Array.isArray(allowed) && allowed.length ? new Set(allowed) : null;
    const entries = Object.entries(PALETTE_FAMILIES)
      .filter(([id, family]) => (permitted ? permitted.has(id) : !family.genreOnly))
      .map(([id, family]) => {
        const fit = 1 - Math.abs(family.energy - axes.energy) / 1.15;
        const jitter = random ? 0.55 + random() * 0.9 : 1;
        return { id, family, weight: Math.pow(Math.max(0.05, fit), 3) * jitter };
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

  function repairContrast(colors) {
    if (!Array.isArray(colors) || colors.length < 3) return colors;
    colors[2] = color.ensureContrast(colors[2], colors[0] || '#000000', 4.5);
    return colors;
  }

  // a random palette that keeps the mood's character: derived from a matching family
  function generatePalette(random, axes, name, allowed) {
    const base = paletteFor(axes, random, allowed);
    // subtle variation only: the family harmony must survive
    const hueShift = (random() * 2 - 1) * 0.055;
    const satScale = 0.9 + random() * 0.2;
    const lightScale = 0.94 + random() * 0.12;
    const colors = base.colors.map((hex, index) => shiftColor(hex, hueShift * (index === 2 ? 0.3 : 1), satScale, lightScale));
    colors.push(shiftColor(colors[3], 0.04 + random() * 0.08, 1, 1.08));
    repairContrast(colors);
    return { id: `theme_${Math.floor(random() * 1e9).toString(16)}`, name: name || base.name, colors };
  }

  // a variant of an existing palette (used by the per-scope "random palette")
  function jitterPalette(random, palette) {
    const colors = (palette && palette.colors) || [];
    if (!colors.length) return generatePalette(random, normalizeAxes({}));
    const hueShift = (random() * 2 - 1) * 0.06;
    const satScale = 0.9 + random() * 0.3;
    const lightScale = 0.94 + random() * 0.16;
    const next = colors.map((hex, index) => shiftColor(hex, hueShift * (index === 2 ? 0.25 : 1), satScale, lightScale));
    repairContrast(next);
    return {
      id: `theme_${Math.floor(random() * 1e9).toString(16)}`,
      name: palette.name || 'palette',
      colors: next,
    };
  }

  // Softness owns the typeface family, density owns the size (a denser design
  // uses smaller text so more fits on screen).
  function textStyleFor(random, axes, context, genre) {
    const cjk = !!context.cjk;
    let pool = FONTS.plain;
    if (axes.softness > 0.62) pool = FONTS.soft;
    else if (axes.softness < 0.38) pool = cjk ? FONTS.hard : FONTS.latinHard;
    if (genre && genre.fonts) {
      const requested = (context.cjk ? genre.fonts.cjk : genre.fonts.latin) || genre.fonts.latin || genre.fonts.cjk || [];
      const usable = requested.filter(fontAvailable);
      if (usable.length) pool = usable;
    }
    const fontId = pick(random, pool);
    const portrait = context.aspect === '9:16';
    const base = portrait ? lerp(104, 58, axes.density) : lerp(134, 78, axes.density);
    // jitter the size per generation so re-rolls do not all land on the same value
    const size = Math.round((base * (0.85 + random() * 0.3)) / 2) * 2;
    const weight = genre && genre.fonts && genre.fonts.weight ? genre.fonts.weight : axes.softness < 0.4 ? 700 : 400;
    const letterSpacing = round(lerp(0, 0.06, axes.softness * (1 - axes.density)) * 100) / 100;
    return { fontId, size, weight, letterSpacing, lineHeight: 1.2, align: 'center', maxWidth: 0.86 };
  }

  function colorSetFor(random, palette) {
    const gradient = random() < 0.5;
    return {
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
    pattern: ['grid', 'dots', 'stripes', 'rings'],
    particles: ['rise', 'fall', 'drift', 'vortex'],
    spectrum: ['bars', 'radial', 'blob'],
    waveform: ['line', 'mirror', 'circle'],
  };

  function sampleClipParams(type, axes, random) {
    const density = axes.density;
    const speed = axes.speed;
    const params = { color: null };
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
    return params;
  }

  function clipSpec(kind, axes, random, genre) {
    const palette = paletteFor(axes, random, genre && genre.palettes);
    const colors = palette.colors;
    const overrides = genre && genre.clips ? genre.clips[kind] : null;
    if (kind === 'background') {
      const allowedTypes = overrides && Array.isArray(overrides.types) && overrides.types.length ? overrides.types : ['noiseGradient', 'gradient', 'solid'];
      const moving = random() < lerp(0.35, 0.85, axes.density);
      let type = moving ? 'noiseGradient' : random() < 0.5 ? 'gradient' : 'solid';
      if (!allowedTypes.includes(type)) type = allowedTypes[0];
      const params =
        type === 'noiseGradient'
          ? { scale: round(lerp(1.2, 4.6, axes.speed), 2), speed: round(lerp(0.08, 0.7, axes.energy), 2) }
          : type === 'gradient'
            ? { scale: round(lerp(0.6, 1.6, axes.softness), 2), speed: 0 }
            : {};
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
    const params = sampleClipParams(type, axes, random);
    const flowOverride = overrides && overrides[type];
    if (flowOverride && typeof flowOverride === 'object') {
      for (const [key, values] of Object.entries(flowOverride)) {
        if (Array.isArray(values) && values.length) params[key] = pick(random, values);
      }
    }
    return { spec: { type, params }, colors: [colors[3], colors[5] || colors[3]] };
  }

  // Re-rolls a timeline clip inside the project's axes (used by the inspector
  // and the clip context menu).
  function rerollClipSpec(kind, options) {
    const opts = options || {};
    const axes = normalizeAxes(opts.axes);
    const seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : Math.floor(Math.random() * 1e6);
    const random = rng.rngFor(seed, 'clip', kind || 'background');
    const genre = opts.genre && genres ? genres.get(opts.genre) : null;
    return clipSpec(kind, axes, random, genre);
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

  function applySignature(style, genre, random, emphasis, ensure) {
    if (!genre || !Array.isArray(genre.signature) || !genre.signature.length) return null;
    let pool = genre.signature;
    if (emphasis && genre.emphasis && Array.isArray(genre.emphasis.signature) && genre.emphasis.signature.length) {
      const ids = new Set(genre.emphasis.signature);
      const filtered = genre.signature.filter((entry) => ids.has(entry.id));
      if (filtered.length) pool = filtered;
    } else if (!emphasis && !ensure) {
      const rate = genre.signatureRate == null ? 1 : Number(genre.signatureRate);
      if (random() > rate) return null;
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

  function weightedFromTraits(table, weights, random, axes) {
    const target = axes || { softness: 0.5, energy: 0.5 };
    const entries = [];
    for (const [type, traits] of Object.entries(table)) {
      const weight = weights && weights[type] != null ? Number(weights[type]) : 1;
      if (weight <= 0) continue;
      entries.push({ type, weight: Math.pow(scoreEntry(traits, target), 2) * weight * (0.7 + random() * 0.6) });
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

  function enforceReadability(style, palette) {
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
    if (worst >= 3) return;
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
    if (bestRatio < 3) params.fgAutoContrast = true;
    // an enclose background must not fight text-shaping edges
    if (Array.isArray(style.edge)) {
      style.edge = style.edge.filter((edge) => !['extrude', 'longShadow'].includes(edge && edge.type));
      if (!style.edge.length) delete style.edge;
    }
  }

  function applyGenreBackground(style, genre, axes, random, palette, forced) {
    const config = genre && genre.bg ? genre.bg : null;
    const chance = config && config.chance != null ? Number(config.chance) : 0.08 + axes.density * 0.22;
    if (!forced && random() >= Math.min(1, chance)) return false;
    const placementTable = (config && config.placement) || { enclose: 0.55, accent: 0.25, underlay: 0.2 };
    const placement = pickWeightedEntry(placementTable, random) || 'enclose';
    const shapeWeights = config && config.shapes ? config.shapes : null;
    const shape = weightedFromTraits(BG_SHAPE_TRAITS, shapeWeights, random, axes) || 'square';
    // placement constraints
    let adjusted = placement;
    if (shape === 'bar' && placement !== 'enclose') adjusted = 'enclose';
    if ((shape === 'star' || shape === 'heart') && placement === 'enclose') adjusted = 'accent';
    if (shape === 'scratch' && placement !== 'underlay') adjusted = 'underlay';
    const jitter = 0.9 + random() * 0.2;
    const params = { color: null, skipSpaces: true };
    if (adjusted === 'enclose') {
      params.unit = 'cell';
      params.width = round(lerp(1.1, 1.4, random()) * jitter, 2);
      params.height = params.width;
      params.layer = 'behind';
      if (shape === 'bar') params.height = round(lerp(0.3, 0.45, random()), 2);
    } else if (adjusted === 'accent') {
      params.unit = 'em';
      const size = lerp(0.25, 0.45, random()) * jitter;
      params.width = round(size, 2);
      params.height = round(size, 2);
      params.offset = { x: (random() < 0.5 ? -1 : 1) * 0.45, y: -0.45 };
      params.layer = 'front';
    } else {
      params.unit = 'em';
      const size = lerp(1.8, 3.0, random()) * jitter;
      params.width = round(size, 2);
      params.height = round(size, 2);
      params.layer = 'behind';
      params.opacity = round(lerp(0.25, 0.5, random()), 2);
      params.varyRotation = round(random() * 25, 1);
    }
    if (shape === 'bar' && adjusted !== 'underlay') params.offset = { x: 0, y: 0.3 };
    // variation
    const varyTable = (config && config.vary) || null;
    const vary = pickWeightedEntry(varyTable, random) || (random() < 0.3 ? pick(random, ['alternate', 'charClass', 'cycle']) : 'none');
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
    let edgeType = pickWeightedEntry(edgeTable, random);
    if (!edgeType && random() < 0.4) edgeType = random() < 0.6 ? 'outline' : 'dropShadow';
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

  function contextFor(project) {
    const cues = (project && project.script && project.script.cues) || [];
    const text = cues.map((cue) => cue.text || '').join('');
    const longest = cues.reduce((max, cue) => Math.max(max, String(cue.text || '').replace(/\s/g, '').length), 0);
    return {
      letterCount: longest,
      cjk: /[\u3000-\u9fff\uff00-\uffef]/.test(text),
      hasPrevious: cues.length > 1,
      badgeId: cues.some((cue) => cue.meta && cue.meta.badgeId),
      hasCard: !!(project && project.dataset),
      aspect: (project && project.output && project.output.aspect) || '16:9',
    };
  }

  function contextForCue(project, cue) {
    const text = (cue && cue.text) || '';
    return {
      ...contextFor(project),
      letterCount: String(text).replace(/\s/g, '').length,
      cjk: /[\u3000-\u9fff\uff00-\uffef]/.test(text),
    };
  }

  // random genre (or a preset when no genre list is available)
  function randomGenre(random) {
    if (genres && typeof genres.randomGenre === 'function') return genres.randomGenre(random);
    const r = typeof random === 'function' ? random : Math.random;
    const preset = PRESETS[Math.min(PRESETS.length - 1, Math.floor(r() * PRESETS.length))];
    const axes = {};
    for (const axis of AXES) axes[axis] = clamp01(preset.axes[axis] + (r() * 2 - 1) * 0.12);
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

  function generate(options) {
    const opts = options || {};
    const genre = opts.genre && genres ? genres.get(opts.genre) : null;
    const axes = normalizeAxes(opts.axes || (genre && genre.axes));
    const emphasis = !!opts.emphasis;
    if (emphasis) axes.energy = clamp01(axes.energy + 0.2);
    const seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : 1;
    const context = {
      letterCount: opts.context && opts.context.letterCount != null ? opts.context.letterCount : 0,
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
    const colors = { bright, dark };
    style.color = colorSetFor(random, palette);
    // one hero effect per theme; genre profiles may override the weighting
    const hero = genre && genre.hero ? pickGenreHero(genre, random) : pickHero(random, axes);
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
      const instance = instanceFor(random, group, axes, context, direction, colors, null, genre);
      if (instance) style[group] = instance;
    }
    // holds: energy decides how often an idle motion shows up, softness its type
    const holdChance = genre && genre.density && genre.density.hold != null ? Number(genre.density.hold) : 0.1 + axes.energy * 0.6;
    if (random() < holdChance) {
      const instance = instanceFor(random, 'hold', axes, context, direction, colors, null, genre);
      if (instance) style.hold = [instance];
    }
    // edge / post: density decides how often and how many, softness the family
    for (const group of ['edge', 'post']) {
      const isHero = hero === group;
      const presence =
        genre && genre.density && genre.density[group] != null ? Number(genre.density[group]) : Math.max(0.08, 0.15 + axes.density * 0.7);
      if (!isHero && random() >= presence) continue;
      const count = isHero ? (axes.density > 0.6 && random() < 0.6 ? 2 : 1) : axes.density > 0.7 && random() < 0.5 ? 2 : 1;
      const stack = [];
      const used = new Set();
      for (let i = 0; i < count; i += 1) {
        const instance = instanceFor(random, group, axes, context, direction, colors, used, genre);
        if (!instance) break;
        if (!instance.params || !Object.keys(instance.params).length) instance.params = sampleParams(random, group, instance.type, axes, colorPoolFor(instance.type, colors));
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
    applyGenreBackground(style, genre, axes, random, palette.colors, forced);
    if (genre) signature = applySignature(style, genre, random, emphasis, !!opts.ensureSignature);
    style.text = textStyleFor(random, axes, context, genre);
    enforceReadability(style, palette.colors);
    return {
      style,
      axes,
      seed,
      direction: direction || 'horizontal',
      palette: palette.id,
      genre: genre ? genre.id : null,
      signature,
    };
  }

  return {
    AXES,
    PRESETS,
    GROUPS,
    THEME_TEXT_GROUPS,
    TRAITS,
    PALETTES,
    PALETTE_FAMILIES,
    generate,
    generatePalette,
    jitterPalette,
    paletteFor,
    paletteColors,
    rerollClipSpec,
    normalizeAxes,
    randomAxes,
    randomGenre,
    isEmphasis,
    applyGenreBackground,
    enforceReadability,
    axesFromAudio,
    contextFor,
    contextForCue,
    score: scoreEntry,
  };
});
