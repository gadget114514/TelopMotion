(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng'), require('./effects/registry'), require('../color'));
  else {
    root.SA = root.SA || {};
    root.SA.moods = factory(root.SA.rng, root.SA.fx, root.SA.color);
  }
})(typeof self !== 'undefined' ? self : this, function (rng, fx, color) {
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
    },
    hold: {
      breathing: [0.2, 0.9],
      kenBurns: [0.25, 0.8],
      floatBob: [0.3, 0.85],
      drift: [0.35, 0.85],
      sway: [0.4, 0.8],
      sineWave: [0.45, 0.8],
      pathFollow: [0.5, 0.6],
      twist: [0.6, 0.5],
      jelly: [0.7, 0.4],
      wobbleWarp: [0.75, 0.3],
      pulse: [0.8, 0.2],
      jitter: [0.95, 0.1],
    },
    location: {
      center: [0.4, 0.7],
      stacked: [0.45, 0.7],
      lowerThird: [0.4, 0.8],
      upperThird: [0.4, 0.8],
      badgeAnchored: [0.5, 0.6, { needsBadge: true }],
    },
    fill: {
      solid: [0.5, 0.5],
      categoryColor: [0.5, 0.5],
      glass: [0.45, 0.8],
      caustics: [0.5, 0.8],
      gradientSweep: [0.6, 0.6],
      holographic: [0.65, 0.5],
      rainbowFlow: [0.7, 0.5],
      chrome: [0.8, 0.2],
      goldFoil: [0.8, 0.2],
      fire: [1, 0.05],
    },
    edge: {
      dropShadow: [0.35, 0.85],
      outline: [0.5, 0.6],
      innerGlow: [0.6, 0.6],
      longShadow: [0.6, 0.4],
      bevel: [0.7, 0.3],
      extrude: [0.8, 0.2],
      neonGlow: [0.85, 0.3],
    },
    post: {
      vignette: [0.25, 0.9],
      filmGrain: [0.3, 0.8],
      colorGrade: [0.4, 0.7],
      sparkles: [0.5, 0.7],
      halftone: [0.6, 0.4],
      heatHaze: [0.5, 0.5],
      lightLeak: [0.62, 0.65],
      lightSweep: [0.78, 0.45],
      lensDistortion: [0.6, 0.4],
      zoomBlur: [0.6, 0.5],
      pixelate: [0.7, 0.3],
      chromaticAberration: [0.7, 0.3],
      crt: [0.7, 0.3],
      rgbShift: [0.8, 0.2],
      digitalNoise: [0.85, 0.15],
      glitchBlocks: [0.95, 0.1],
    },
    background: {
      noiseGradient: [0.4, 0.8],
      solid: [0.4, 0.6],
      card: [0.5, 0.7, { needsCard: true }],
    },
  };

  // curated colour themes: [energy, brightness] and a dark background with a bright text colour
  // ordered by role: 0 background, 1 background 2, 2 text, 3 accent, 4 stroke
  const PALETTES = {
    night: { traits: [0.3, 0.5], colors: ['#0b0d12', '#161c2a', '#eef2ff', '#9fc0ff', '#070a10'] },
    mono: { traits: [0.35, 0.55], colors: ['#0c0e13', '#181c26', '#f3f5fa', '#c9d1e0', '#0a0c11'] },
    gold: { traits: [0.45, 0.6], colors: ['#140f05', '#241c0a', '#fff3d6', '#ffc247', '#1d1405'] },
    pastel: { traits: [0.35, 0.85], colors: ['#1a1520', '#241c2c', '#fff3fb', '#ffb3d9', '#241420'] },
    warm: { traits: [0.6, 0.7], colors: ['#140f0c', '#241a12', '#ffe9d2', '#ffb26b', '#1a1005'] },
    neon: { traits: [0.75, 0.9], colors: ['#0a0713', '#1a1030', '#eaf6ff', '#5ce1ff', '#06121a'] },
    rose: { traits: [0.55, 0.8], colors: ['#170d13', '#26141f', '#ffeef5', '#ff5c8a', '#12060c'] },
  };

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

  function allowed(group, traits, context, direction) {
    const flags = traits[2] || {};
    if (direction === 'vertical' && group === 'layout' && !flags.vertical) return false;
    if (direction === 'horizontal' && group === 'layout' && flags.vertical) return false;
    if (flags.needsCard && !context.hasCard) return false;
    if (flags.needsBadge && !context.badgeId) return false;
    if (flags.maxLetters != null && context.letterCount > flags.maxLetters) return false;
    return true;
  }

  function scoreEntry(traits, axes) {
    const energy = traits[0];
    const softness = traits[1];
    const distance = Math.abs(energy - axes.energy) * 0.9 + Math.abs(softness - axes.softness) * 0.7;
    return Math.max(0.05, 1 - distance / 1.6);
  }

  function pickEntry(random, group, axes, context, direction, exclude) {
    const pool = TRAITS[group] || {};
    const scored = [];
    for (const [type, traits] of Object.entries(pool)) {
      if (exclude && exclude.has(type)) continue;
      if (!allowed(group, traits, context, direction)) continue;
      // skip glyph-destroying effects (pixelate, halftone, dissolves...) when
      // generating automatically; they remain selectable by hand
      const descriptor = fx.get(group, type);
      if (descriptor && descriptor.tags.includes('degrade')) continue;
      const fit = scoreEntry(traits, axes);
      scored.push({ type, weight: Math.pow(fit, 2) * (0.6 + random() * 0.8) });
    }
    if (!scored.length) return null;
    const total = scored.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = random() * total;
    for (const entry of scored) {
      roll -= entry.weight;
      if (roll <= 0) return entry.type;
    }
    return scored[scored.length - 1].type;
  }

  function sampleParams(random, group, type, axes, colors) {
    const descriptor = fx.get(group, type);
    const params = {};
    if (!descriptor) return params;
    for (const param of descriptor.params || []) {
      if (param.kind === 'number' || param.kind === 'int') {
        const min = param.min == null ? 0 : param.min;
        const max = param.max == null ? min + 1 : param.max;
        const zeroCentered = param.default === 0 && min < 0 && max > 0;
        let value;
        if (zeroCentered) {
          // offsets and curves stay near zero so text never leaves the frame
          const span = Math.min(group === 'location' ? 0.04 : 0.08, (max - min) * 0.06);
          value = (random() * 2 - 1) * span;
        } else if (param.unit === 'frame') {
          const base = param.default == null ? 0 : param.default;
          value = base + (random() * 2 - 1) * (max - min) * 0.05;
        } else {
          const level = 0.18 + 0.64 * Math.pow(random(), 1 / (0.5 + axes.energy));
          value = min + (max - min) * level;
        }
        value = Math.max(min, Math.min(max, value));
        params[param.key] = param.kind === 'int' ? Math.round(value) : round(value, 2);
      } else if (param.kind === 'select') {
        params[param.key] = pick(random, param.options || [param.default]);
      } else if (param.kind === 'bool') {
        params[param.key] = param.key === 'enabled' ? true : random() < 0.4 + axes.energy * 0.3;
      } else if (param.kind === 'color') {
        params[param.key] = pick(random, colors && colors.length ? colors : ['#ffd7a8']);
      } else if (param.kind === 'vec2') {
        const amount = 0.04 + axes.energy * 0.2;
        params[param.key] = { x: round((random() * 2 - 1) * amount, 2), y: round((random() * 2 - 1) * amount, 2) };
      }
    }
    return params;
  }

  // line-level motion: short entrances, small stagger, so a phrase reads at once
  function motionFor(random, group, axes) {
    const inBase = lerp(0.95, 0.3, axes.speed);
    const outBase = inBase * 0.7;
    const easeIn = pick(random, axes.speed > 0.55 ? ['expoOut', 'quartOut', 'backOut'] : ['quartOut', 'cubicOut', 'sineInOut']);
    const easeOut = pick(random, axes.speed > 0.55 ? ['quartIn', 'cubicIn', 'backIn'] : ['sineInOut', 'cubicIn']);
    const jitter = () => 0.85 + random() * 0.35;
    const loopPeriod = group === 'hold' ? round(lerp(3.4, 1, axes.speed) * jitter(), 1) : 0;
    return {
      in: { duration: round(inBase * jitter(), 2), delay: 0, ease: easeIn },
      out: { duration: round(outBase * jitter(), 2), delay: 0, ease: easeOut },
      stagger: {
        each: round(lerp(0.03, 0.004, axes.speed) * (0.7 + random() * 0.6), 3),
        order: pick(random, ['ltr', 'ltr', 'word', 'line']),
        ease: 'linear',
        unit: random() < 0.65 ? 'word' : 'letter',
        from: 0.5,
      },
      loop: { period: loopPeriod, yoyo: true, ease: 'easeInOutSine' },
    };
  }

  function instanceFor(random, group, axes, context, direction, colors, exclude) {
    const type = pickEntry(random, group, axes, context, direction, exclude);
    if (!type) return null;
    return { type, params: sampleParams(random, group, type, axes, colors), enabled: true, motion: motionFor(random, group, axes) };
  }

  function paletteFor(axes, random) {
    const entries = Object.entries(PALETTES).map(([id, palette]) => {
      const fit = 1 - (Math.abs(palette.traits[0] - axes.energy) * 0.9 + Math.abs(palette.traits[1] - axes.brightness) * 0.8) / 1.7;
      const jitter = random ? 0.55 + random() * 0.9 : 1;
      return { id, palette, weight: Math.pow(Math.max(0.05, fit), 3) * jitter };
    });
    if (!random) {
      entries.sort((a, b) => b.weight - a.weight);
      return { id: entries[0].id, ...entries[0].palette };
    }
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = random() * total;
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll <= 0) return { id: entry.id, ...entry.palette };
    }
    const last = entries[entries.length - 1];
    return { id: last.id, ...last.palette };
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

  // a random palette that keeps the mood's character: derived from a matching template
  function generatePalette(random, axes, name) {
    const base = paletteFor(axes, random);
    const hueShift = (random() * 2 - 1) * 0.12;
    const satScale = 0.85 + random() * 0.4;
    const lightScale = 0.92 + random() * 0.22;
    const colors = base.colors.map((hex, index) => shiftColor(hex, hueShift * (index === 2 ? 0.3 : 1), satScale, lightScale));
    colors.push(shiftColor(colors[3], 0.04 + random() * 0.08, 1, 1.08));
    return { id: `theme_${Math.floor(random() * 1e9).toString(16)}`, name: name || base.id, colors };
  }

  // a variant of an existing palette (used by the per-scope "random palette")
  function jitterPalette(random, palette) {
    const colors = (palette && palette.colors) || [];
    if (!colors.length) return generatePalette(random, normalizeAxes({}));
    const hueShift = (random() * 2 - 1) * 0.06;
    const satScale = 0.9 + random() * 0.3;
    const lightScale = 0.94 + random() * 0.16;
    return {
      id: `theme_${Math.floor(random() * 1e9).toString(16)}`,
      name: palette.name || 'palette',
      colors: colors.map((hex, index) => shiftColor(hex, hueShift * (index === 2 ? 0.25 : 1), satScale, lightScale)),
    };
  }

  function textStyleFor(random, axes, context) {
    const cjk = !!context.cjk;
    let pool = FONTS.plain;
    if (axes.softness > 0.65 && axes.energy < 0.5) pool = FONTS.soft;
    else if (axes.energy > 0.6 && axes.softness < 0.4) pool = cjk ? FONTS.hard : FONTS.latinHard;
    const fontId = pick(random, pool);
    const portrait = context.aspect === '9:16';
    const base = portrait ? lerp(94, 60, axes.density) : lerp(122, 84, axes.density);
    // jitter the size per generation so re-rolls do not all land on the same value
    const size = Math.round((base * (0.85 + random() * 0.3)) / 2) * 2;
    const weight = axes.energy > 0.6 || axes.softness < 0.35 ? 700 : 400;
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

  // the background always moves and takes its colours from the scoped palette
  function backgroundFor(random, axes, context) {
    const motion = motionFor(random, 'background', axes);
    if (context.hasCard && random() < 0.5) {
      return {
        type: 'card',
        params: {
          dim: round(0.3 + random() * 0.25, 2),
          blur: 0,
          focusBadge: true,
          zoom: round(1.2 + random() * 0.6, 2),
          parallax: round(0.05 + random() * 0.15, 2),
        },
        enabled: true,
        motion,
      };
    }
    if (random() < 0.75) {
      return {
        type: 'noiseGradient',
        params: { scale: round(1.6 + random() * 2.2, 1), speed: round(0.25 + axes.energy * 0.6, 2) },
        enabled: true,
        motion,
      };
    }
    return { type: 'solid', params: {}, enabled: true, motion };
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

  // random mood: a preset plus a jitter, so the axes stay coherent
  function randomAxes(random) {
    const r = typeof random === 'function' ? random : Math.random;
    const preset = PRESETS[Math.min(PRESETS.length - 1, Math.floor(r() * PRESETS.length))];
    const axes = {};
    for (const axis of AXES) axes[axis] = clamp01(preset.axes[axis] + (r() * 2 - 1) * 0.18);
    return { axes, direction: preset.direction || 'horizontal' };
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
    const axes = normalizeAxes(opts.axes);
    const seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : 1;
    const context = {
      letterCount: opts.context && opts.context.letterCount != null ? opts.context.letterCount : 0,
      cjk: !!(opts.context && opts.context.cjk),
      hasPrevious: !!(opts.context && opts.context.hasPrevious),
      badgeId: !!(opts.context && opts.context.badgeId),
      hasCard: !!(opts.context && opts.context.hasCard),
      aspect: (opts.context && opts.context.aspect) || '16:9',
    };
    const direction = opts.direction === 'vertical' ? 'vertical' : opts.direction === 'horizontal' ? 'horizontal' : null;
    const random = rng.rngFor(seed, 'mood', 'theme');
    const style = {};
    const palette = generatePalette(random, axes, 'theme');
    style.palette = palette;
    const swatches = palette.colors;
    style.color = colorSetFor(random, palette);
    for (const group of SINGLE_GROUPS) {
      if (group === 'layout' && direction === 'vertical') {
        style.layout = {
          type: 'vertical',
          params: sampleParams(random, 'layout', 'vertical', axes, swatches),
          enabled: true,
          motion: motionFor(random, 'layout', axes),
        };
        continue;
      }
      const instance = instanceFor(random, group, axes, context, direction, swatches);
      if (instance) style[group] = instance;
    }
    for (const group of STACK_GROUPS) {
      const count = group === 'edge' ? (random() < 0.55 ? 1 : 2) : random() < 0.5 ? 1 : 2;
      const stack = [];
      const used = new Set();
      for (let i = 0; i < count; i += 1) {
        const instance = instanceFor(random, group, axes, context, direction, swatches, used);
        if (!instance) break;
        used.add(instance.type);
        stack.push(instance);
      }
      if (stack.length) style[group] = stack;
    }
    style.background = backgroundFor(random, axes, context);
    style.text = textStyleFor(random, axes, context);
    return { style, axes, seed, direction: direction || 'horizontal', palette: palette.id };
  }

  return {
    AXES,
    PRESETS,
    GROUPS,
    THEME_TEXT_GROUPS,
    TRAITS,
    PALETTES,
    generate,
    generatePalette,
    jitterPalette,
    normalizeAxes,
    randomAxes,
    axesFromAudio,
    contextFor,
    contextForCue,
    score: scoreEntry,
  };
});
