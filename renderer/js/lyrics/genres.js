(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.genres = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LIST = [
    {
      id: 'horror',
      randomWeight: 1,
      axes: { speed: 0.25, energy: 0.55, softness: 0.3, density: 0.45, brightness: 0.12 },
      palettes: ['blood', 'ash'],
      fonts: { cjk: ['NotoSerifJP-Regular', 'NotoSansJP-Regular'], latin: ['NotoSerif-Regular'], weight: 400 },
      hero: { enter: 2, edge: 2, post: 1, bg: 2 },
      density: { hold: 0.8, edge: 0.6, post: 0.8 },
      allowTags: ['degrade'],
      signatureRate: 0.5,
      affinity: {
        animation: { stagger: 2, stopMotion: 1.5, spring: 0, '*': 0.4 },
        enter: { flickerIn: 5, blurIn: 2, noiseDissolveIn: 2, fade: 1.5, typewriter: 1.5, elasticPop: 0, dropBounce: 0, particlesAssemble: 0, flip3D: 0, '*': 0.3 },
        exit: { creepOut: 4, melt: 3, dissolve: 2, blurOut: 1.5, explode: 0, zoomOut: 0, particlesDisperse: 0, '*': 0.3 },
        hold: { shiver: 5, wobbleWarp: 2, breathing: 2, floatBob: 0, jelly: 0, pulse: 0, orbit3D: 0, heartbeat: 0, '*': 0.2 },
        fill: { solid: 3, ink: 3, rainbowFlow: 0, holographic: 0, goldFoil: 0, chrome: 0, caustics: 0, '*': 0.3 },
        edge: { drip: 4, dropShadow: 2, outline: 1.5, innerGlow: 1, neonGlow: 0, bevel: 0, extrude: 0, '*': 0.3 },
        post: { vhsTracking: 3, filmGrain: 3, vignette: 3, rgbShift: 2, scanTear: 2, glitchSlice: 1, sparkles: 0, lensFlare: 0, lightLeak: 0, kaleidoscope: 0, bloom: 0, '*': 0.3 },
        layout: { row: 2, staircase: 1, scatter: 1, circle: 0, spiral: 0, '*': 0.6 },
      },
      params: {
        'hold.shiver': { amount: [0.4, 1], interval: [2, 5] },
        'edge.drip': { length: [24, 70], grow: [0.3, 0.8] },
        'edge.outline': { pattern: 'sketch', width: [1.5, 3] },
        'post.vignette': { amount: [0.6, 0.85] },
        'post.filmGrain': { amount: [0.2, 0.35] },
        'enter.flickerIn': { flickers: [4, 8] },
      },
      motion: { inScale: 1.5, outScale: 0.3, inEase: ['sineInOut', 'quartOut'], outEase: ['expoIn'], staggerEach: [0.06, 0.12], staggerOrder: ['ltr', 'random'] },
      bg: {
        chance: 0.45,
        placement: { enclose: 0.35, accent: 0.2, underlay: 0.45 },
        shapes: { paper: 3, splatter: 3, scratch: 2, blob: 1, '*': 0 },
        motions: { bleed: 3, flicker: 3, stamp: 1, none: 1, '*': 0 },
        vary: { random: 3, none: 2, '*': 0 },
        fill: { solid: 3, ink: 2, '*': 0 },
        edge: { none: 3, outline: 1, dropShadow: 1 },
        colors: 'accent',
      },
      signature: [
        {
          id: 'blood',
          weight: 3,
          patch: {
            edge: [{ type: 'drip', params: { length: 48, grow: 0.6 }, enabled: true }],
            color: { fill: { kind: 'palette', index: 2 }, stroke: { kind: 'palette', index: 3 } },
          },
        },
        {
          id: 'ransom',
          weight: 3,
          patch: {
            ornShape: {
              type: 'paper',
              params: {
                unit: 'cell', width: 1.12, height: 1.18, lockAspect: false, jag: 0.5, vary: 'random',
                varyColors: ['#e8e2d0', '#111111', '#b3121b', '#d9c9a3', '#f4f4f4'], varyRotation: 12, varySize: 0.12,
                varyOffset: 0.06, fgAutoContrast: true, skipSpaces: true,
              },
            },
            ornFill: { type: 'solid', params: {} },
            ornEdge: [{ type: 'dropShadow', params: { offset: { x: 3, y: 4 }, blur: 3, opacity: 0.6 }, enabled: true }],
            ornMotion: { type: 'stamp', params: { from: 1.6, lead: 0.04, duration: 0.18 } },
            fill: { type: 'solid', params: {} },
            animation: { type: 'stagger', params: { each: 0.09, order: 'random' } },
          },
        },
        {
          id: 'claw',
          weight: 2,
          patch: {
            ornShape: {
              type: 'scratch',
              params: { unit: 'em', width: 2.4, height: 2.4, rotation: -25, count: 3, opacity: 0.55, varyRotation: 10, skipSpaces: true },
            },
            ornFill: { type: 'solid', params: {} },
            ornMotion: { type: 'bleed', params: { lead: -0.1, duration: 0.25, roughness: 0.7 } },
          },
        },
        {
          id: 'flicker',
          weight: 2,
          patch: {
            enter: { type: 'flickerIn', params: { flickers: 7 }, motion: { in: { duration: 1.2 } } },
            hold: [{ type: 'shiver', params: { amount: 0.6, interval: 3 }, enabled: true }],
            post: [
              { type: 'vhsTracking', params: { amount: 0.25, noise: 0.25 }, enabled: true },
              { type: 'vignette', params: { amount: 0.75 }, enabled: true },
            ],
          },
        },
      ],
      emphasis: { signature: ['claw', 'flicker'] },
      clips: {
        background: { types: ['noiseGradient'], scale: [1.5, 3.5], speed: [0.05, 0.2] },
        backdrop: { types: ['pattern', 'particles'], particles: { flow: ['fall'] }, pattern: { mode: ['stripes'] } },
        filler: { exclude: ['sineWave'] },
      },
    },
    {
      id: 'love',
      randomWeight: 1,
      axes: { speed: 0.3, energy: 0.3, softness: 0.85, density: 0.4, brightness: 0.72 },
      palettes: ['blush', 'rose', 'sunset'],
      fonts: { cjk: ['ZenMaruGothic-Regular', 'RocknRollOne-Regular', 'NotoSerifJP-Regular', 'NotoSansJP-Regular'], latin: ['NotoSerif-Regular'], weight: 400 },
      hero: { enter: 1, fill: 2, post: 1, bg: 2 },
      density: { hold: 0.9, edge: 0.5, post: 0.6 },
      signatureRate: 0.6,
      affinity: {
        animation: { stagger: 2, followThrough: 2, loop: 1, stopMotion: 0, timeWarp: 0, '*': 0.5 },
        enter: { blurIn: 3, fade: 3, waveRise: 2, zoomIn: 1, glitchIn: 0, shatterRebuild: 0, scramble: 0, neonFlicker: 0, dropBounce: 0, flickerIn: 0, '*': 0.3 },
        exit: { blurOut: 3, fade: 3, shrinkToCenter: 1.5, explode: 0, burnAway: 0, melt: 0, gravityFall: 0, creepOut: 0, '*': 0.3 },
        hold: { heartbeat: 5, floatBob: 3, breathing: 3, sway: 2, jitter: 0, shiver: 0, twist: 0, wobbleWarp: 0, '*': 0.2 },
        fill: { gradientSweep: 3, solid: 2, holographic: 1.5, glass: 1, fire: 0, marble: 0, chrome: 0, ink: 0, '*': 0.3 },
        edge: { innerGlow: 3, neonGlow: 2, dropShadow: 1, extrude: 0, longShadow: 0, bevel: 0, drip: 0, '*': 0.3 },
        post: { sparkles: 3, lightLeak: 3, bloom: 2, vignette: 1, vhsTracking: 0, crt: 0, halftone: 0, pixelate: 0, '*': 0.2 },
        layout: { row: 2, wave: 2, arc: 1.5, scatter: 0, grid: 0, staircase: 0, '*': 0.5 },
      },
      params: {
        'hold.heartbeat': { amount: [0.04, 0.08], bpm: 'audio' },
        'edge.neonGlow': { radius: [10, 20], intensity: [0.4, 0.8] },
        'post.sparkles': { shape: 'heart', count: [10, 20], size: [2, 4] },
        'fill.gradientSweep': { speed: [0.1, 0.25] },
      },
      motion: { inScale: 1.3, outScale: 1.2, inEase: ['sineInOut', 'cubicOut'], outEase: ['sineInOut'], staggerEach: [0.04, 0.07], staggerOrder: ['ltr'] },
      bg: {
        chance: 0.5,
        placement: { enclose: 0.3, accent: 0.45, underlay: 0.25 },
        shapes: { heart: 4, circle: 2, cloud: 1, '*': 0 },
        motions: { float: 3, pop: 2, fade: 2, '*': 0 },
        vary: { alternate: 3, none: 2, cycle: 1, '*': 0 },
        fill: { solid: 2, gradientSweep: 2, '*': 0 },
        edge: { none: 3, innerGlow: 1 },
        colors: 'accent',
      },
      signature: [
        {
          id: 'heartbeat',
          weight: 3,
          patch: {
            hold: [{ type: 'heartbeat', params: { amount: 0.06, bpm: 'audio' }, enabled: true }],
            edge: [{ type: 'neonGlow', params: { radius: 14, intensity: 0.6, bloom: true }, enabled: true }],
          },
        },
        {
          id: 'heartAccent',
          weight: 3,
          patch: {
            ornShape: {
              type: 'heart',
              params: {
                unit: 'em', width: 0.32, offset: { x: 0.48, y: -0.46 }, rotation: 12, layer: 'front',
                vary: 'alternate', varyColors: ['#ff5c8a', '#ff9eb5'], varyRotation: 10, skipSpaces: true,
              },
            },
            ornFill: { type: 'solid', params: {} },
            ornMotion: { type: 'float', params: { lead: -0.05, duration: 0.6, rise: 0.3, hold: 'heartbeat', holdAmount: 0.3 } },
          },
        },
        {
          id: 'heartUnderlay',
          weight: 2,
          patch: {
            ornShape: { type: 'heart', params: { unit: 'em', width: 2.1, opacity: 0.22, skipSpaces: true } },
            ornFill: { type: 'gradientSweep', params: { angle: 90, speed: 0.15 } },
            ornMotion: { type: 'pop', params: { overshoot: 0.1, lead: 0.1, duration: 0.5, hold: 'heartbeat', holdAmount: 0.4 } },
          },
        },
        {
          id: 'sparkle',
          weight: 2,
          patch: {
            post: [
              { type: 'sparkles', params: { shape: 'heart', count: 16, size: 3 }, enabled: true },
              { type: 'lightLeak', params: { intensity: 0.5 }, enabled: true },
            ],
          },
        },
      ],
      emphasis: { signature: ['heartUnderlay', 'heartbeat'] },
      clips: {
        background: { types: ['noiseGradient', 'gradient'], scale: [1, 3], speed: [0.04, 0.1] },
        backdrop: { types: ['particles', 'shapes'], particles: { flow: ['rise'] } },
      },
    },
    {
      id: 'heartbreak',
      randomWeight: 1,
      axes: { speed: 0.15, energy: 0.2, softness: 0.8, density: 0.3, brightness: 0.3 },
      palettes: ['rain', 'night'],
      fonts: { cjk: ['NotoSerifJP-Regular'], latin: ['NotoSerif-Regular'], weight: 400 },
      hero: { enter: 3, fill: 2, post: 2, bg: 3 },
      density: { hold: 0.85, edge: 0.4, post: 0.7 },
      signatureRate: 0.7,
      affinity: {
        animation: { stagger: 2, followThrough: 2, loop: 1, stopMotion: 0, '*': 0.4 },
        enter: { blurIn: 3, fade: 3, elasticPop: 0, dropBounce: 0, glitchIn: 0, neonFlicker: 0, '*': 0.3 },
        exit: { melt: 3, dissolve: 2, blurOut: 2, '*': 0.3 },
        hold: { drift: 3, breathing: 2, pulse: 0, jelly: 0, jitter: 0, heartbeat: 0, '*': 0.3 },
        fill: { glass: 3, solid: 2, rainbowFlow: 0, goldFoil: 0, fire: 0, '*': 0.3 },
        edge: { dropShadow: 2, innerGlow: 1.5, outline: 1, '*': 0.3 },
        post: { filmGrain: 2, vignette: 2, heatHaze: 1.5, sparkles: 0, lensFlare: 0, '*': 0.3 },
        layout: { row: 2, wave: 1.5, '*': 0.5 },
      },
      params: {
        'hold.drift': { vx: 0, vy: 0.05 },
        'exit.melt': { drip: [0.7, 0.95] },
      },
      motion: { inScale: 1.6, outScale: 1.8, inEase: ['sineInOut', 'cubicOut'], outEase: ['sineInOut'], staggerEach: [0.07, 0.12], staggerOrder: ['ltr', 'word'] },
      bg: {
        chance: 0.3,
        placement: { enclose: 0.05, accent: 0.7, underlay: 0.25 },
        shapes: { drop: 4, blob: 1, '*': 0 },
        motions: { fall: 3, fade: 1, '*': 0 },
        vary: { random: 1, none: 1, '*': 0 },
        fill: { solid: 2, glass: 2, '*': 0 },
        edge: { none: 3, dropShadow: 1 },
        colors: 'text',
      },
      signature: [
        {
          id: 'tears',
          weight: 3,
          patch: {
            ornShape: {
              type: 'drop',
              params: {
                unit: 'em', width: 0.18, height: 0.26, lockAspect: false, offset: { x: 0.1, y: 0.62 },
                skipRate: 0.7, opacity: 0.85,
              },
            },
            ornFill: { type: 'glass', params: {} },
            ornMotion: { type: 'fall', params: { from: 0.4, lead: -0.3, duration: 0.9 } },
          },
        },
        {
          id: 'blur',
          weight: 2,
          patch: {
            exit: { type: 'melt', params: { drip: 0.9 } },
            fill: { type: 'glass', params: {} },
            post: [{ type: 'heatHaze', params: { amount: 0.15 }, enabled: true }],
          },
        },
      ],
      emphasis: { signature: ['tears'] },
      clips: {
        background: { types: ['noiseGradient'], speed: [0.02, 0.08] },
        backdrop: { types: ['particles'], particles: { flow: ['fall'] } },
      },
    },
    {
      id: 'party',
      randomWeight: 1,
      axes: { speed: 0.85, energy: 0.85, softness: 0.4, density: 0.75, brightness: 0.85 },
      palettes: ['festival', 'neon'],
      fonts: { cjk: ['RocknRollOne-Regular', 'DelaGothicOne-Regular'], latin: ['DelaGothicOne-Regular', 'BebasNeue-Regular'], weight: 700 },
      hero: { enter: 3, fill: 1, edge: 1, post: 1, bg: 3 },
      density: { hold: 0.8, edge: 0.7, post: 0.6 },
      signatureRate: 0.6,
      affinity: {
        animation: { stagger: 2, spring: 2, cascade: 1, stopMotion: 0, '*': 0.5 },
        enter: { elasticPop: 3, dropBounce: 3, zoomIn: 2, melt: 0, blurIn: 0, creepOut: 0, '*': 0.4 },
        exit: { zoomOut: 2, shrinkToCenter: 2, explode: 1.5, melt: 0, burnAway: 0, '*': 0.4 },
        hold: { pulse: 3, jelly: 2, shiver: 0, '*': 0.4 },
        fill: { solid: 2, gradientSweep: 2, fire: 1.5, '*': 0.4 },
        edge: { outline: 2, extrude: 2, dropShadow: 1, '*': 0.4 },
        post: { sparkles: 2, lightLeak: 1.5, bloom: 1.5, glitchBlocks: 1, '*': 0.4 },
        layout: { row: 1.5, grid: 1.5, scatter: 1.5, '*': 0.6 },
      },
      params: {
        'hold.pulse': { bpm: 'audio' },
        'post.sparkles': { count: [16, 40] },
      },
      motion: { inScale: 0.8, outScale: 0.8, inEase: ['backOut', 'elasticOut'], outEase: ['backIn'], staggerEach: [0.02, 0.05], staggerOrder: ['random', 'ltr'] },
      bg: {
        chance: 0.6,
        placement: { enclose: 0.5, accent: 0.1, underlay: 0.4 },
        shapes: { square: 2, circle: 2, star: 2, paper: 1, '*': 0 },
        motions: { pop: 3, stamp: 2, fall: 2, '*': 0 },
        vary: { alternate: 2, cycle: 2, random: 2, '*': 0 },
        fill: { solid: 2, gradientSweep: 2, '*': 0 },
        edge: { none: 2, outline: 1, dropShadow: 1 },
        colors: 'mixed',
      },
      signature: [
        {
          id: 'varietyBox',
          weight: 3,
          patch: {
            bgShape: { type: 'square', params: { vary: 'alternate', varyColors: [], skipSpaces: true } },
            bgFill: { type: 'solid', params: {} },
            bgMotion: { type: 'pop', params: { overshoot: 0.2, lead: 0.05, duration: 0.3 } },
            edge: [{ type: 'outline', params: { width: 3 }, enabled: true }],
          },
        },
        {
          id: 'confetti',
          weight: 3,
          patch: {
            ornShape: {
              type: 'paper',
              params: { unit: 'em', width: 2.4, height: 2.4, opacity: 0.4, vary: 'random', varyRotation: 40, varyOffset: 0.3, skipSpaces: true },
            },
            ornFill: { type: 'solid', params: {} },
            ornMotion: { type: 'fall', params: { from: 0.8, lead: -0.15, duration: 0.8 } },
          },
        },
        {
          id: 'stampBeat',
          weight: 2,
          patch: {
            ornShape: { type: 'circle', params: { unit: 'cell', width: 1.25, height: 1.25 } },
            ornFill: { type: 'solid', params: {} },
            ornMotion: { type: 'stamp', params: { from: 1.8, lead: 0.02, duration: 0.25, hold: 'beat', holdAmount: 0.4 } },
          },
        },
      ],
      emphasis: { signature: ['confetti', 'stampBeat'] },
      clips: {
        background: { types: ['noiseGradient', 'gradient'], speed: [0.2, 0.6] },
        backdrop: { types: ['particles', 'shapes', 'spectrum'], particles: { flow: ['rise', 'vortex'] } },
      },
    },
    {
      id: 'ballad',
      randomWeight: 1,
      axes: { speed: 0.15, energy: 0.15, softness: 0.85, density: 0.35, brightness: 0.45 },
      palettes: ['night', 'gold', 'rose'],
      fonts: { cjk: ['NotoSerifJP-Regular', 'NotoSansJP-Regular'], latin: ['NotoSerif-Regular'], weight: 400 },
      hero: { enter: 2, fill: 1, post: 2, bg: 1 },
      density: { hold: 0.6, edge: 0.3, post: 0.4 },
      signatureRate: 0.5,
      affinity: {
        animation: { spring: 0, '*': 0.5 },
        enter: { blurIn: 3, fade: 3, glitchIn: 0, explode: 0, '*': 0.4 },
        exit: { explode: 0, '*': 0.4 },
        hold: { breathing: 3, jitter: 0, shiver: 0, '*': 0.4 },
        fill: { solid: 2, glass: 2, '*': 0.4 },
        edge: { innerGlow: 2, '*': 0.4 },
        post: { lightLeak: 2, filmGrain: 1.5, '*': 0.4 },
        layout: { row: 2, '*': 0.6 },
      },
      params: {},
      motion: { inScale: 1.2, outScale: 1.2, inEase: ['sineInOut'], outEase: ['sineInOut'], staggerEach: [0.04, 0.08], staggerOrder: ['ltr'] },
      bg: {
        chance: 0.15,
        placement: { enclose: 0.3, accent: 0.2, underlay: 0.5 },
        shapes: { blob: 2, circle: 1, '*': 0 },
        motions: { fade: 2, float: 1, '*': 0 },
        vary: { none: 2, '*': 0 },
        fill: { solid: 2, gradientSweep: 1, '*': 0 },
        edge: { none: 3, innerGlow: 1 },
        colors: 'text',
      },
      signature: [
        {
          id: 'glow',
          weight: 1,
          patch: {
            edge: [{ type: 'innerGlow', params: { radius: 18, intensity: 0.7 }, enabled: true }],
            post: [{ type: 'lightLeak', params: { intensity: 0.4 }, enabled: true }],
          },
        },
      ],
      emphasis: { signature: ['glow'] },
      clips: {},
    },
    {
      id: 'cinematic',
      randomWeight: 1,
      axes: { speed: 0.25, energy: 0.35, softness: 0.6, density: 0.4, brightness: 0.4 },
      palettes: ['night', 'mono', 'gold'],
      fonts: { cjk: ['NotoSerifJP-Regular'], latin: ['NotoSerif-Regular', 'NotoSans-Regular'], weight: 400 },
      hero: { enter: 2, fill: 1, edge: 1, post: 2, bg: 1 },
      density: { hold: 0.7, edge: 0.4, post: 0.6 },
      signatureRate: 0.5,
      affinity: {
        animation: { spring: 0, '*': 0.5 },
        enter: { blurIn: 3, fade: 2, elasticPop: 0, '*': 0.4 },
        exit: { '*': 0.4 },
        hold: { kenBurns: 3, jelly: 0, '*': 0.4 },
        fill: { solid: 2, glass: 1.5, '*': 0.4 },
        edge: { dropShadow: 2, '*': 0.4 },
        post: { lightSweep: 3, filmGrain: 2, sparkles: 0, '*': 0.4 },
        layout: { row: 2, '*': 0.6 },
      },
      params: {},
      motion: { inScale: 1.1, outScale: 1, inEase: ['sineInOut'], outEase: ['sineInOut'], staggerEach: [0.03, 0.06], staggerOrder: ['ltr'] },
      bg: {
        chance: 0.1,
        placement: { enclose: 0, accent: 0.1, underlay: 0.9 },
        shapes: { bar: 3, '*': 0 },
        motions: { grow: 2, fade: 1, '*': 0 },
        vary: { none: 3, '*': 0 },
        fill: { solid: 2, gradientSweep: 1, '*': 0 },
        edge: { none: 3 },
        colors: 'accent',
      },
      signature: [
        {
          id: 'sweep',
          weight: 1,
          patch: {
            post: [{ type: 'lightSweep', params: { width: 0.1, speed: 0.4 }, enabled: true }],
            edge: [{ type: 'dropShadow', params: { blur: 18, opacity: 0.55 }, enabled: true }],
          },
        },
      ],
      emphasis: { signature: ['sweep'] },
      clips: {},
    },
    {
      id: 'cute',
      randomWeight: 1,
      axes: { speed: 0.6, energy: 0.45, softness: 0.75, density: 0.5, brightness: 0.85 },
      palettes: ['pastel', 'rose'],
      fonts: { cjk: ['ZenMaruGothic-Regular', 'NotoSansJP-Regular'], latin: ['NotoSans-Regular'], weight: 400 },
      hero: { enter: 3, fill: 1, edge: 1, post: 1, bg: 3 },
      density: { hold: 0.7, edge: 0.4, post: 0.4 },
      signatureRate: 0.6,
      affinity: {
        animation: { spring: 2, stagger: 1.5, '*': 0.5 },
        enter: { elasticPop: 3, dropBounce: 2, glitchIn: 0, '*': 0.4 },
        exit: { melt: 0, creepOut: 0, '*': 0.4 },
        hold: { floatBob: 3, jelly: 3, shiver: 0, '*': 0.4 },
        fill: { solid: 2, gradientSweep: 1.5, '*': 0.4 },
        edge: { outline: 2, dropShadow: 1.5, '*': 0.4 },
        post: { sparkles: 2, bloom: 1.5, '*': 0.4 },
        layout: { row: 1.5, wave: 1.5, arc: 1.5, '*': 0.6 },
      },
      params: {},
      motion: { inScale: 0.85, outScale: 0.9, inEase: ['backOut'], outEase: ['backIn'], staggerEach: [0.02, 0.05], staggerOrder: ['ltr'] },
      bg: {
        chance: 0.55,
        placement: { enclose: 0.55, accent: 0.25, underlay: 0.2 },
        shapes: { circle: 2, cloud: 2, star: 2, heart: 1, '*': 0 },
        motions: { pop: 3, float: 2, '*': 0 },
        vary: { cycle: 3, alternate: 2, '*': 0 },
        fill: { solid: 2, gradientSweep: 1, '*': 0 },
        edge: { none: 2, innerGlow: 1 },
        colors: 'accent',
      },
      signature: [
        {
          id: 'cloudBubble',
          weight: 2,
          patch: {
            ornShape: { type: 'cloud', params: { unit: 'cell', width: 1.3, height: 1.3, vary: 'cycle', skipSpaces: true } },
            ornFill: { type: 'solid', params: {} },
            ornMotion: { type: 'pop', params: { overshoot: 0.2, lead: 0.05, duration: 0.35 } },
          },
        },
        {
          id: 'starAccent',
          weight: 2,
          patch: {
            ornShape: {
              type: 'star',
              params: { unit: 'em', width: 0.3, height: 0.3, offset: { x: 0.5, y: -0.5 }, layer: 'front', varyRotation: 20, skipSpaces: true },
            },
            ornFill: { type: 'gradientSweep', params: { speed: 0.2 } },
            ornMotion: { type: 'spin', params: { turns: 0.25, lead: 0, duration: 0.4 } },
          },
        },
      ],
      emphasis: { signature: ['cloudBubble', 'starAccent'] },
      clips: {},
    },
    {
      id: 'electro',
      randomWeight: 1,
      axes: { speed: 0.7, energy: 0.65, softness: 0.35, density: 0.6, brightness: 0.9 },
      palettes: ['neon'],
      fonts: { cjk: ['DelaGothicOne-Regular', 'NotoSansJP-Bold'], latin: ['DelaGothicOne-Regular', 'BebasNeue-Regular'], weight: 700 },
      hero: { enter: 2, fill: 1, edge: 2, post: 2, bg: 2 },
      density: { hold: 0.6, edge: 0.6, post: 0.7 },
      signatureRate: 0.5,
      affinity: {
        animation: { stagger: 1.5, timeWarp: 1.5, '*': 0.5 },
        enter: { glitchIn: 3, neonFlicker: 2, flickerIn: 1.5, '*': 0.4 },
        exit: { glitchIn: 0, '*': 0.4 },
        hold: { jitter: 2, pulse: 1.5, jelly: 0, '*': 0.4 },
        fill: { solid: 2, holographic: 2, rainbowFlow: 1.5, '*': 0.4 },
        edge: { neonGlow: 3, outline: 2, '*': 0.4 },
        post: { rgbShift: 3, scanTear: 2, crt: 1.5, glitchBlocks: 1.5, '*': 0.4 },
        layout: { row: 2, grid: 1.5, '*': 0.6 },
      },
      params: {
        'edge.outline': { pattern: 'dashed', dashLength: [8, 14], flow: [0.8, 1.6] },
      },
      motion: { inScale: 0.9, outScale: 0.8, inEase: ['linear', 'backOut'], outEase: ['backIn'], staggerEach: [0.015, 0.04], staggerOrder: ['ltr', 'random'] },
      bg: {
        chance: 0.4,
        placement: { enclose: 0.7, accent: 0.1, underlay: 0.2 },
        shapes: { bracket: 3, square: 1, ring: 1, '*': 0 },
        motions: { pop: 2, spin: 1.5, wipe: 1.5, '*': 0 },
        vary: { none: 3, '*': 0 },
        fill: { solid: 3, '*': 0 },
        edge: { none: 3 },
        colors: 'accent',
      },
      signature: [
        {
          id: 'bracket',
          weight: 2,
          patch: {
            ornShape: { type: 'bracket', params: { unit: 'cell', width: 1.3, height: 1.3, opacity: 1, skipSpaces: true } },
            ornFill: { type: 'solid', params: { color: null } },
            ornEdge: [{ type: 'outline', params: { width: 2, pattern: 'dashed', dashLength: 10, flow: 1.2 }, enabled: true }],
            ornMotion: { type: 'wipe', params: { dir: 'left', lead: 0.05, duration: 0.3 } },
          },
        },
        {
          id: 'neonTube',
          weight: 2,
          patch: {
            edge: [{ type: 'neonGlow', params: { radius: 22, intensity: 1.3, bloom: true }, enabled: true }],
            enter: { type: 'neonFlicker', params: { flickers: 6 }, motion: { in: { duration: 1 } } },
          },
        },
      ],
      emphasis: { signature: ['neonTube'] },
      clips: {},
    },
    {
      id: 'rock',
      randomWeight: 1,
      axes: { speed: 0.9, energy: 0.9, softness: 0.15, density: 0.75, brightness: 0.75 },
      palettes: ['warm', 'mono'],
      fonts: { cjk: ['NotoSansJP-Bold', 'DelaGothicOne-Regular'], latin: ['BebasNeue-Regular', 'DelaGothicOne-Regular'], weight: 700 },
      hero: { enter: 1, fill: 1, edge: 3, post: 2, bg: 2 },
      density: { hold: 0.7, edge: 0.8, post: 0.7 },
      signatureRate: 0.5,
      affinity: {
        animation: { stopMotion: 2, timeWarp: 1.5, '*': 0.5 },
        enter: { shatterRebuild: 3, dropBounce: 2, blurIn: 0, '*': 0.4 },
        exit: { explode: 2, burnAway: 1.5, '*': 0.4 },
        hold: { jitter: 3, floatBob: 0, heartbeat: 0, '*': 0.4 },
        fill: { chrome: 2, goldFoil: 2, fire: 1.5, marble: 1.5, '*': 0.4 },
        edge: { extrude: 3, longShadow: 2, outline: 2, dropShadow: 1.5, '*': 0.4 },
        post: { scanTear: 2, chromaticAberration: 2, filmGrain: 1.5, '*': 0.4 },
        layout: { row: 2, staircase: 1.5, diagonal: 1.5, '*': 0.6 },
      },
      params: {},
      motion: { inScale: 0.7, outScale: 0.7, inEase: ['expoOut', 'backOut'], outEase: ['expoIn'], staggerEach: [0.01, 0.03], staggerOrder: ['ltr', 'random'] },
      bg: {
        chance: 0.3,
        placement: { enclose: 0.5, accent: 0.2, underlay: 0.3 },
        shapes: { scratch: 2, bar: 2, square: 1, '*': 0 },
        motions: { stamp: 3, bleed: 2, '*': 0 },
        vary: { alternate: 2, none: 1, '*': 0 },
        fill: { solid: 2, chrome: 1, '*': 0 },
        edge: { none: 2, outline: 1, extrude: 1 },
        colors: 'accent',
      },
      signature: [
        {
          id: 'slash',
          weight: 2,
          patch: {
            ornShape: { type: 'scratch', params: { unit: 'em', width: 2.2, height: 2.2, rotation: -20, count: 3, opacity: 0.6, skipSpaces: true } },
            ornFill: { type: 'solid', params: {} },
            ornMotion: { type: 'bleed', params: { lead: 0.02, duration: 0.2, roughness: 0.6 } },
          },
        },
        {
          id: 'tiltBar',
          weight: 2,
          patch: {
            ornShape: { type: 'bar', params: { unit: 'cell', width: 1.3, height: 1.1, rotation: -6, vary: 'alternate', varyRotation: 8, skipSpaces: true } },
            ornFill: { type: 'gradientSweep', params: { angle: 20, speed: 0.3 } },
            ornMotion: { type: 'stamp', params: { from: 1.8, lead: 0.03, duration: 0.2 } },
          },
        },
      ],
      emphasis: { signature: ['slash'] },
      clips: {},
    },
    {
      id: 'washu',
      randomWeight: 1,
      axes: { speed: 0.35, energy: 0.3, softness: 0.7, density: 0.25, brightness: 0.5 },
      direction: 'vertical',
      palettes: ['gold', 'mono', 'rose'],
      fonts: { cjk: ['NotoSerifJP-Regular', 'KleeOne-Regular'], latin: ['NotoSerif-Regular'], weight: 400 },
      hero: { enter: 2, fill: 3, edge: 1, post: 1, bg: 2 },
      density: { hold: 0.5, edge: 0.3, post: 0.4 },
      signatureRate: 0.7,
      affinity: {
        animation: { stagger: 2, '*': 0.5 },
        enter: { fade: 3, blurIn: 2, '*': 0.4 },
        exit: { '*': 0.4 },
        hold: { breathing: 2, floatBob: 2, '*': 0.4 },
        fill: { ink: 4, solid: 2, rainbowFlow: 0, '*': 0.4 },
        edge: { neonGlow: 0, outline: 1.5, dropShadow: 1, '*': 0.4 },
        post: { sparkles: 0, filmGrain: 1.5, vignette: 1.5, '*': 0.4 },
        layout: { vertical: 3, row: 1, '*': 0.6 },
      },
      params: {
        'fill.ink': { scale: [2, 4], threshold: [0.28, 0.42] },
      },
      motion: { inScale: 1.2, outScale: 1.2, inEase: ['sineInOut'], outEase: ['sineInOut'], staggerEach: [0.05, 0.1], staggerOrder: ['vertical-reading'] },
      bg: {
        chance: 0.35,
        placement: { enclose: 0.3, accent: 0.4, underlay: 0.3 },
        shapes: { circle: 1, square: 1, '*': 0 },
        motions: { stamp: 2, fade: 1, '*': 0 },
        vary: { last: 2, none: 2, '*': 0 },
        fill: { solid: 2, '*': 0 },
        edge: { none: 3 },
        colors: 'accent',
      },
      signature: [
        {
          id: 'sumi',
          weight: 2,
          patch: { fill: { type: 'ink', params: { scale: 3, threshold: 0.35 } } },
        },
        {
          id: 'rakkan',
          weight: 3,
          patch: {
            ornShape: {
              type: 'square',
              params: { unit: 'em', width: 0.42, height: 0.42, offset: { x: 0.62, y: 0.62 }, vary: 'last', varyColors: ['#c0392b'], skipSpaces: true },
            },
            ornFill: { type: 'solid', params: {} },
            ornMotion: { type: 'stamp', params: { from: 1.7, lead: 0.02, duration: 0.2 } },
          },
        },
      ],
      emphasis: { signature: ['sumi', 'rakkan'] },
      clips: {},
    },
  ];

  const BY_ID = new Map(LIST.map((genre) => [genre.id, genre]));

  function get(id) {
    return (id && BY_ID.get(id)) || null;
  }

  // Each genre carries its seven axes as one 4-byte integer: 4 bits per axis
  // (0..15 = round(value * 15)), in the order below, most significant nibble
  // first, so the hex form reads speed-energy-softness-density-brightness-weird-
  // smartness (e.g. 0x5A3B2C1). The top nibble is left 0 (reserved). Genres only
  // list the five placed axes; weird / smartness fall back to the UI defaults
  // (moods.js WEIRD_DEFAULT, smartness.js SMART_DEFAULT).
  const CODE_AXES = ['speed', 'energy', 'softness', 'density', 'brightness', 'weird', 'smartness'];
  const CODE_DEFAULTS = { weird: 0.7, smartness: 0.6 };

  function encodeAxes(axes) {
    let code = 0;
    for (const axis of CODE_AXES) {
      let value = axes && Number.isFinite(Number(axes[axis])) && axes[axis] !== '' && axes[axis] != null ? Number(axes[axis]) : CODE_DEFAULTS[axis] == null ? 0.5 : CODE_DEFAULTS[axis];
      value = Math.max(0, Math.min(1, value));
      code = code * 16 + Math.round(value * 15);
    }
    return code >>> 0;
  }

  // -> { speed..smartness } quantized back to 0..1 (steps of 1/15)
  function decodeAxes(code) {
    let rest = Number(code) >>> 0;
    const out = {};
    for (let i = CODE_AXES.length - 1; i >= 0; i -= 1) {
      out[CODE_AXES[i]] = (rest & 15) / 15;
      rest >>>= 4;
    }
    return out;
  }

  for (const genre of LIST) genre.code = encodeAxes(genre.axes);

  function list() {
    return LIST.map((genre) => ({ ...genre }));
  }

  function weightOf(entry, key) {
    if (!entry) return 0;
    const value = entry[key];
    return value == null ? 0 : Number(value);
  }

  function randomGenre(random) {
    const r = typeof random === 'function' ? random : Math.random;
    const total = LIST.reduce((sum, genre) => sum + (Number(genre.randomWeight) || 1), 0);
    let roll = r() * total;
    let picked = LIST[LIST.length - 1];
    for (const genre of LIST) {
      roll -= Number(genre.randomWeight) || 1;
      if (roll <= 0) {
        picked = genre;
        break;
      }
    }
    const axes = {};
    for (const [key, value] of Object.entries(picked.axes)) axes[key] = Math.max(0, Math.min(1, value + (r() * 2 - 1) * 0.12));
    return { genre: picked.id, axes, direction: picked.direction || 'horizontal' };
  }

  // Weight multiplier of a type inside a genre: specific entry, then '*', then 1.
  function affinity(genre, group, type) {
    if (!genre || !genre.affinity || !genre.affinity[group]) return 1;
    const table = genre.affinity[group];
    if (table[type] != null) return Number(table[type]);
    if (table['*'] != null) return Number(table['*']);
    return 1;
  }

  function weightedPick(entries, random) {
    const source = entries && typeof entries === 'object' ? Object.entries(entries) : [];
    const pool = source.filter(([, weight]) => Number(weight) > 0);
    if (!pool.length) return null;
    const total = pool.reduce((sum, [, weight]) => sum + Number(weight), 0);
    let roll = (typeof random === 'function' ? random() : Math.random()) * total;
    for (const [key, weight] of pool) {
      roll -= Number(weight);
      if (roll <= 0) return key;
    }
    return pool[pool.length - 1][0];
  }

  return {
    LIST,
    CODE_AXES,
    encodeAxes,
    decodeAxes,
    get,
    list,
    randomGenre,
    affinity,
    weightOf,
    weightedPick,
  };
});
