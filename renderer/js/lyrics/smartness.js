(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./fx-axes'));
  else {
    root.SA = root.SA || {};
    root.SA.smartness = factory(root.SA.fxAxes);
  }
})(typeof self !== 'undefined' ? self : this, function (fxAxes) {
  'use strict';

  // The seventh axis: `smartness`. It rates every effect from 0 (tacky) to 1
  // (refined) and lets the generators drop or demote the cheap-looking ones
  // (per-beat pulse, vignette, ribbon, centre spotlight...). The engine default
  // is 0 = "not specified": s of 0 disables the whole filter and keeps every
  // existing draw byte-identical, the same way `weird` does. The UI and new
  // generation open at SMART_DEFAULT.
  const SMART_DEFAULT = 0.6;
  // a rating this far below `s` is a hard exclusion; closer ones only lose
  // weight, so a low `s` never forces a tacky effect back in
  const FLOOR_GAP = 0.45;
  // the weight of an effect whose rating sits just at the threshold
  const MIN_WEIGHT = 0.05;
  const PENALTY = 1.4;
  // types that are not listed read as neither tacky nor refined
  const NEUTRAL = 0.5;

  // Ratings per effect group / pseudo group. Types are addressed by their
  // registry type, pseudo groups by the vocabulary the generators draw from
  // (figure motifs, split motions, transitions, clip patterns...).
  const RATINGS = {
    // idle / loop motion on the text
    hold: {
      none: 0.95,
      animator: 0.7, floatBob: 0.45, sineWave: 0.4, jitter: 0.2, pulse: 0.15, opacityPulse: 0.3,
      kenBurns: 0.8, drift: 0.75, sway: 0.5, marquee: 0.4, jelly: 0.3, wobbleWarp: 0.25, twist: 0.35,
      breathing: 0.6, orbit3D: 0.35, pathFollow: 0.5, heartbeat: 0.2, shiver: 0.25, fontSize: 0.55,
      fillScreen: 0.3, squashStretch: 0.3, swirl: 0.3, rangeSelector: 0.8, tracking: 0.85,
      boil: 0.35, floatLoop: 0.5, breatheLoop: 0.6, swayLoop: 0.5, beatPulse: 0.2,
      highlightSweep: 0.5, waveLoop: 0.45, beatHighlight: 0.25, trackBreath: 0.6, trackBeat: 0.25,
      warp: 0.4, letterWarp: 0.4,
    },
    enter: {
      animator: 0.7, fade: 0.75, typewriter: 0.8, slide: 0.7, dropBounce: 0.25, zoomIn: 0.45,
      blurIn: 0.85, flip3D: 0.35, rotateIn: 0.45, scatterIn: 0.4, waveRise: 0.5, elasticPop: 0.3,
      scramble: 0.25, glitchIn: 0.15, neonFlicker: 0.2, flickerIn: 0.2, strokeDrawOn: 0.8,
      particlesAssemble: 0.4, shatterRebuild: 0.3, morphFromPrevious: 0.6, noiseDissolveIn: 0.35,
      megaZoomIn: 0.5, rangeReveal: 0.85, tracking: 0.9, riseIn: 0.6, fallIn: 0.5, popIn: 0.35,
      spinIn: 0.4, focusIn: 0.8, driftIn: 0.6, tiltIn: 0.45, revealSweep: 0.7, revealSoft: 0.7,
      revealRandom: 0.4, trackIn: 0.85,
    },
    exit: {
      animator: 0.7, fade: 0.75, slide: 0.7, zoomOut: 0.45, blurOut: 0.85, explode: 0.2,
      gravityFall: 0.25, dissolve: 0.5, wipe: 0.75, typewriterReverse: 0.8, shrinkToCenter: 0.35,
      particlesDisperse: 0.4, melt: 0.3, burnAway: 0.3, strokeErase: 0.8, creepOut: 0.5,
      megaZoomOut: 0.5, rangeReveal: 0.85, tracking: 0.9, riseOut: 0.6, fallOut: 0.45,
      zoomOutSoft: 0.6, spinOut: 0.35, focusOut: 0.8, trackOut: 0.85,
    },
    // whole-screen post effects
    post: {
      vignette: 0.1, lensFlare: 0.15, sparkles: 0.15, strobeFlash: 0.15, crt: 0.2, twirl: 0.2,
      glitchBlocks: 0.15, rgbShift: 0.2, scanTear: 0.2, vhsTracking: 0.2, dataSmear: 0.2,
      digitalNoise: 0.25, echoTrail: 0.25, godRays: 0.2, kaleidoscope: 0.25, pixelate: 0.25,
      turbulentDisplace: 0.25, spinBlur: 0.25, venetianBlinds: 0.25, cameraPunch: 0.2,
      lightLeak: 0.35, chromaticAberration: 0.45, glitchSlice: 0.45, halftone: 0.5,
      noiseDissolve: 0.35, directionalDissolve: 0.35, pixelDissolve: 0.35, burnDissolve: 0.3,
      halftoneDissolve: 0.3, particleDissolve: 0.35, shockwave: 0.35, zoomBlur: 0.4,
      motionBlur: 0.5, lightSweep: 0.4, mirror: 0.3, pixelSort: 0.3, lensDistortion: 0.45,
      displacementMap: 0.4, heatHaze: 0.4, waveWarp: 0.3, radialWipe: 0.35, shapeLayer: 0.6,
      anamorphicStreak: 0.55, bloom: 0.6, filmGrain: 0.7, camera: 0.75, colorGrade: 0.8,
      cameraPushIn: 0.7, cameraPullOut: 0.7, cameraPanLeft: 0.7, cameraPanRight: 0.7,
      cameraTilt: 0.6, cameraHandheld: 0.3, cameraOrbit: 0.4,
    },
    // text decoration
    edge: {
      bevel: 0.15, drip: 0.2, extrude: 0.25, neonGlow: 0.35, innerGlow: 0.4, longShadow: 0.4,
      outline: 0.6, dropShadow: 0.7,
    },
    fill: {
      rainbowFlow: 0.15, fire: 0.15, goldFoil: 0.2, chrome: 0.25, holographic: 0.3,
      marble: 0.45, gradientSweep: 0.5, caustics: 0.5, ink: 0.6, karaokeWipe: 0.6,
      glass: 0.7, categoryColor: 0.8, solid: 0.85, textureFill: 0.4,
    },
    layout: {
      spiral: 0.2, circle: 0.35, scatter: 0.35, wave: 0.35, arc: 0.4, path: 0.4,
      diagonal: 0.55, staircase: 0.55, grid: 0.65, vertical: 0.8, stackedWords: 0.8, row: 0.85,
    },
    animation: {
      echo: 0.3, loop: 0.4, stopMotion: 0.4, spring: 0.45, timeWarp: 0.55, simultaneous: 0.6,
      followThrough: 0.65, cascade: 0.7, stagger: 0.8,
    },
    location: {
      randomSafe: 0.4, custom: 0.5, center: 0.6, stacked: 0.6, badgeAnchored: 0.65,
      left: 0.7, right: 0.7, upperThird: 0.75, karaoke: 0.75, lowerThird: 0.8,
    },
    // timeline background clips
    background: {
      rays: 0.15, tunnel: 0.2, perspectiveGrid: 0.3, shapes: 0.35, particleField: 0.4,
      pattern: 0.45, cellPattern: 0.45, card: 0.5, cover: 0.5, image: 0.5, fractalNoise: 0.55,
      noiseGradient: 0.55, gradient: 0.6, gradient4: 0.6, shapeLayer: 0.6, solid: 0.8, none: 0.9,
    },
    // figure motifs / moves (the `figure` track and the figures filler)
    figureMotif: {
      ribbon: 0.1, confetti: 0.15, burst: 0.25, bracketsPop: 0.3, orbit: 0.4, polyMorph: 0.4,
      rings: 0.45, halftone: 0.55, bars: 0.6, ticker: 0.65, underlineSweep: 0.8, frame: 0.8,
    },
    figureIn: { pop: 0.35, scatterIn: 0.4, wipe: 0.8, draw: 0.85 },
    figureHold: { pulse: 0.15, spin: 0.35, morph: 0.5, drift: 0.75 },
    figureOut: { burstOut: 0.25, shrink: 0.45, fade: 0.75 },
    // the mid (backdrop) clip's own beat motion
    backdropMotion: { pulse: 0.1, sway: 0.45, accent: 0.55, swell: 0.6, drift: 0.8, still: 0.9 },
    // the backdrop clip's enter / exit transition
    transition: { rotate: 0.25, iris: 0.3, scale: 0.45, wipe: 0.75, cut: 0.85 },
    // the split planes' motion and colour scheme
    splitMotion: { breathe: 0.2, rotate: 0.35, swap: 0.5, push: 0.65, slide: 0.7, drift: 0.8, none: 0.9 },
    splitScheme: { triad: 0.3, complementary: 0.4, splitComplementary: 0.5, analogous: 0.75, tonal: 0.85, neutralAccent: 0.9 },
    // the pattern library's modes (clip patterns / backdrop patterns)
    pattern: {
      randomFill: 0.35, triangles: 0.4, diamonds: 0.4, polka: 0.4, rain: 0.45, stripes: 0.5,
      rings: 0.5, hexes: 0.5, checks: 0.5, sineCurve: 0.55, waves: 0.55, dots: 0.6, grid: 0.7,
    },
  };

  function has(v) {
    return v != null && v !== '' && Number.isFinite(Number(v));
  }

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(1, number));
  }

  // the axis value on an axes object: unset (the engine default) reads as 0
  function smartOf(axes) {
    return axes && has(axes.smartness) ? clamp01(axes.smartness) : 0;
  }

  // the value the UI and new generation use for a project that never chose one
  function projectSmartness(project) {
    const axes = project && project.styleMode && project.styleMode.axes;
    return axes && has(axes.smartness) ? clamp01(axes.smartness) : SMART_DEFAULT;
  }

  function rate(group, type) {
    const table = RATINGS[group];
    if (!table || type == null) return NEUTRAL;
    const value = table[type];
    return typeof value === 'number' ? clamp01(value) : NEUTRAL;
  }

  // s of 0 disables the filter entirely; below the floor the effect is dropped,
  // above it the weight falls off so the tacky end stays rare, never forced.
  function weight(rating, s) {
    const value = clamp01(rating);
    if (!(s > 0)) return 1;
    if (value < s - FLOOR_GAP) return 0;
    return Math.max(MIN_WEIGHT, 1 - PENALTY * Math.max(0, s - value));
  }

  function okRating(rating, s) {
    return weight(rating, s) > 0;
  }

  function ok(group, type, s) {
    return okRating(rate(group, type), s);
  }

  function pick(random, list) {
    if (!list || !list.length) return undefined;
    return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  }

  function typeOf(item) {
    if (item == null) return null;
    if (typeof item === 'string') return item;
    return item.type == null ? null : String(item.type);
  }

  // A smartness-weighted pick from `list`. `s <= 0` delegates to the plain
  // uniform pick and consumes the random stream exactly like the old draw, so
  // smartness 0 stays byte-identical. `group` may be a group name or a
  // `(item) => rating` function (spec ratings); `extraWeights` is an optional
  // per-item object / array multiplier.
  function pickWeighted(random, group, list, s, extraWeights) {
    if (!list || !list.length) return undefined;
    if (!(s > 0)) return pick(random, list);
    const ratingOf = typeof group === 'function' ? group : (item) => rate(group, typeOf(item));
    let total = 0;
    const weights = list.map((item, index) => {
      const extra = extraWeights == null ? 1 : Array.isArray(extraWeights) ? Number(extraWeights[index]) : extraWeights[item];
      const base = weight(ratingOf(item), s) * (extra == null ? 1 : Math.max(0, Number(extra)));
      total += base;
      return base;
    });
    if (!(total > 0)) return pick(random, list);
    let roll = random() * total;
    for (let i = 0; i < list.length; i += 1) {
      roll -= weights[i];
      if (roll <= 0) return list[i];
    }
    return list[list.length - 1];
  }

  function pushRating(out, group, type) {
    if (type == null) return;
    out.push({ group, type, rating: rate(group, type) });
  }

  // the minimum rating inside a filler / clip spec: combo layers, split motion,
  // figure motif + moves, clip pattern mode and background type. 1 when the
  // spec carries nothing rated.
  function rateSpec(spec) {
    const found = [];
    const walk = (node, depth) => {
      if (!node || typeof node !== 'object' || depth > 8) return;
      const type = node.type;
      if (type === 'combo') {
        for (const part of (node.params && node.params.list) || []) walk(part, depth + 1);
        return;
      }
      if (type === 'split') {
        pushRating(found, 'splitMotion', node.params && node.params.motion);
        return;
      }
      if (type === 'figures' || type === 'figure') {
        const params = node.params || {};
        pushRating(found, 'figureMotif', params.motif);
        for (const beat of params.beats || []) {
          if (!beat || !beat.move) continue;
          pushRating(found, 'figureIn', beat.move.in);
          pushRating(found, 'figureHold', beat.move.hold);
          pushRating(found, 'figureOut', beat.move.out);
        }
        return;
      }
      if (type === 'pattern') {
        pushRating(found, 'pattern', node.params && node.params.mode);
        return;
      }
      if (type && RATINGS.background[type] != null) pushRating(found, 'background', type);
    };
    walk(spec, 0);
    if (!found.length) return 1;
    return found.reduce((min, entry) => Math.min(min, entry.rating), 1);
  }

  // Every effect group of an expanded style with its rating. `min` is what the
  // look weighting uses; `offenders` lists the tacky entries.
  const STYLE_GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'bgShape', 'bgFill', 'bgMotion', 'repeat'];
  const STACK_GROUPS = ['hold', 'edge', 'post', 'bgEdge'];

  function rateStyle(style) {
    const entries = [];
    for (const group of STYLE_GROUPS) {
      const value = style && style[group];
      if (!value) continue;
      if (Array.isArray(value)) {
        for (const instance of value) if (instance && instance.type) entries.push({ group, type: instance.type, rating: rate(group, instance.type) });
      } else if (value.type) {
        entries.push({ group, type: value.type, rating: rate(group, value.type) });
      }
    }
    if (!entries.length) return { min: 1, mean: 1, offenders: [] };
    const min = entries.reduce((low, entry) => Math.min(low, entry.rating), 1);
    const mean = entries.reduce((sum, entry) => sum + entry.rating, 0) / entries.length;
    const offenders = entries.filter((entry) => entry.rating < NEUTRAL).sort((a, b) => a.rating - b.rating);
    return { min, mean, offenders };
  }

  // Drops the effects below the floor from the stack groups (a single group is
  // handled by the weights, not removed here).
  function prune(style, s) {
    if (!style || !(s > 0)) return style;
    const out = { ...style };
    for (const group of STACK_GROUPS) {
      const value = out[group];
      if (Array.isArray(value)) {
        const kept = value.filter((instance) => !instance || !instance.type || ok(group, instance.type, s));
        if (kept.length) out[group] = kept;
        else delete out[group];
      } else if (value && value.type && !ok(group, value.type, s)) {
        delete out[group];
      }
    }
    return out;
  }

  // fx-axes reads the smartness column through this provider, so the rated
  // table above stays the single source (an edited rating is live immediately
  // and the generated fx-axes table never goes stale on this axis).
  if (fxAxes && typeof fxAxes.setRateProvider === 'function') fxAxes.setRateProvider(rate);

  return {
    SMART_DEFAULT,
    FLOOR_GAP,
    RATINGS,
    STYLE_GROUPS,
    STACK_GROUPS,
    smartOf,
    projectSmartness,
    rate,
    weight,
    okRating,
    ok,
    pick,
    pickWeighted,
    rateSpec,
    rateStyle,
    prune,
  };
});
