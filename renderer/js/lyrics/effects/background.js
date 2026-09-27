(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'), require('../../color'));
  else {
    root.SA = root.SA || {};
    factory(root.SA.fx, root.SA.color);
  }
})(typeof self !== 'undefined' ? self : this, function (fx, color) {
  'use strict';

  const TYPES = { none: 1, solid: 1, noiseGradient: 2, card: 3, cover: 4, image: 5 };

  fx.register({
    group: 'background',
    type: 'none',
    tags: ['basic'],
    params: [],
    cost: 0,
  });

  fx.register({
    group: 'background',
    type: 'solid',
    params: [{ key: 'color', kind: 'color', default: null }],
    cost: 0,
  });

  fx.register({
    group: 'background',
    type: 'noiseGradient',
    params: [
      { key: 'colors', kind: 'gradient', default: null },
      { key: 'scale', kind: 'number', min: 0.5, max: 12, step: 0.1, default: 3 },
      { key: 'speed', kind: 'number', min: 0, max: 2, step: 0.05, default: 0.2 },
    ],
    cost: 2,
  });

  fx.register({
    group: 'background',
    type: 'card',
    tags: ['basic'],
    params: [
      { key: 'dim', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'blur', kind: 'number', min: 0, max: 40, step: 0.5, default: 0 },
      { key: 'focusBadge', kind: 'bool', default: true },
      { key: 'zoom', kind: 'number', min: 1, max: 3, step: 0.05, default: 1.6 },
      { key: 'parallax', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.1 },
    ],
    cost: 1,
  });

  fx.register({
    group: 'background',
    type: 'cover',
    params: [
      { key: 'songId', kind: 'text', default: '' },
      { key: 'blur', kind: 'number', min: 0, max: 40, step: 0.5, default: 0 },
      { key: 'dim', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
      { key: 'zoomSpeed', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.1 },
    ],
    cost: 2,
  });

  fx.register({
    group: 'background',
    type: 'image',
    params: [
      { key: 'imageId', kind: 'text', default: '' },
      { key: 'fit', kind: 'select', options: ['cover', 'contain'], default: 'cover' },
      { key: 'blur', kind: 'number', min: 0, max: 40, step: 0.5, default: 0 },
      { key: 'dim', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
    ],
    cost: 2,
  });

  // Animated background patterns (grid / dots / stripes / rings).
  fx.register({
    group: 'background',
    type: 'pattern',
    tags: ['featured'],
    params: [
      { key: 'mode', kind: 'select', options: ['grid', 'dots', 'stripes', 'rings'], default: 'grid' },
      { key: 'count', kind: 'int', min: 4, max: 120, step: 1, default: 24 },
      { key: 'size', kind: 'number', min: 0.2, max: 3, step: 0.05, default: 1 },
      { key: 'speed', kind: 'number', min: 0, max: 3, step: 0.05, default: 0.4 },
      { key: 'opacity', kind: 'number', min: 0.05, max: 1, step: 0.05, default: 0.55 },
      { key: 'color', kind: 'color', default: null },
    ],
    cost: 2,
  });

  // Animated shapes drawn behind the lyrics (reuses the filler shape renderer).
  fx.register({
    group: 'background',
    type: 'shapes',
    tags: ['featured'],
    params: [
      { key: 'kind', kind: 'select', options: ['shapes', 'particles', 'waveform', 'spectrum', 'sineWave', 'progress'], default: 'shapes' },
      { key: 'set', kind: 'select', options: ['circles', 'polygons', 'lines', 'burst', 'grid', 'orbit'], default: 'circles' },
      { key: 'count', kind: 'int', min: 1, max: 48, step: 1, default: 10 },
      { key: 'speed', kind: 'number', min: 0, max: 4, step: 0.1, default: 0.8 },
      { key: 'opacity', kind: 'number', min: 0.05, max: 1, step: 0.05, default: 0.45 },
      { key: 'color', kind: 'color', default: null },
    ],
    cost: 2,
  });

  function toRgb(value, fallback, ctx) {
    return color.toRgba(value, fallback, ctx);
  }

  function num(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function backgroundUniforms(instance, ctx) {
    const params = (instance && instance.params) || {};
    const type = TYPES[(instance && instance.type) || 'none'] || 1;
    const context = ctx || {};
    let colorA = toRgb(context.theme && context.theme.bg, [0.043, 0.051, 0.07, 1]);
    let colorB = toRgb(context.theme && context.theme.bgSoft, [0.063, 0.075, 0.106, 1]);
    // the scoped (theme / cue / beat) palette drives the background unless the instance overrides it
    const palette = context.palette && Array.isArray(context.palette.colors) ? context.palette.colors : null;
    if (palette && palette.length) {
      colorA = toRgb(palette[0], colorA);
      colorB = toRgb(palette[palette.length > 1 ? 1 : 0], colorB);
    }
    let p4 = [num(params.scale, 3), 0, 0, 0];
    if (type === 1) {
      colorA = toRgb(params.color, colorA, context);
    } else if (type === 2) {
      const stops = Array.isArray(params.colors)
        ? params.colors
        : params.colors && Array.isArray(params.colors.stops)
          ? params.colors.stops
          : null;
      if (stops && stops.length >= 2) {
        colorA = toRgb(stops[0].color || stops[0], null, context);
        colorB = toRgb(stops[1].color || stops[1], null, context);
      }
      p4 = [num(params.scale, 3), num(params.speed, 0.3), 0, 0];
    } else if (type === 3 || type === 4 || type === 5) {
      const zoom = num(params.zoom, 1.6);
      p4 = [zoom, num(context.focusX, 0), num(context.focusY, 0), num(params.dim, 0.35)];
      if (context.cardTheme) colorB = toRgb(context.cardTheme.bg, colorB);
    }
    return {
      u_type: type,
      u_colorA: colorA,
      u_colorB: colorB,
      u_params: p4,
      u_time: context.time || 0,
      cardTexture: context.cardTexture || null,
    };
  }

  fx.backgroundUniforms = backgroundUniforms;
  fx.backgroundTypes = TYPES;
  return fx;
});
