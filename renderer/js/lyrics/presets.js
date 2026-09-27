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

  function list() {
    return LIST.map((entry) => ({ id: entry.id, label: entry.label, style: JSON.parse(JSON.stringify(entry.style)) }));
  }

  function get(id) {
    return LIST.find((entry) => entry.id === id) || null;
  }

  function labelFor(preset) {
    const key = preset.label || `fx.preset.${preset.id}`;
    if (typeof SA !== 'undefined' && SA.i18n && SA.controls) {
      const translated = SA.i18n.t(key);
      if (translated !== key) return translated;
      return SA.controls.prettify(preset.id);
    }
    return preset.id;
  }

  return { list, get, labelFor };
});
