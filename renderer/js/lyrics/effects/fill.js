(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'), require('../../color'));
  else {
    root.SA = root.SA || {};
    factory(root.SA.fx, root.SA.color);
  }
})(typeof self !== 'undefined' ? self : this, function (fx, color) {
  'use strict';

  const TYPES = {
    solid: 1,
    categoryColor: 2,
    gradientSweep: 3,
    rainbowFlow: 4,
    holographic: 5,
    chrome: 6,
    goldFoil: 7,
    fire: 8,
    caustics: 9,
    marble: 10,
    glass: 11,
    textureFill: 12,
    karaokeWipe: 13,
    ink: 14,
  };

  fx.register({
    group: 'fill',
    type: 'solid',
    tags: ['basic'],
    params: [],
    cost: 0,
  });

  fx.register({
    group: 'fill',
    type: 'categoryColor',
    tags: ['basic'],
    params: [],
    cost: 0,
  });

  fx.register({
    group: 'fill',
    type: 'gradientSweep',
    params: [
      { key: 'angle', kind: 'number', min: -180, max: 180, step: 1, default: 0 },
      { key: 'speed', kind: 'number', min: 0, max: 2, step: 0.05, default: 0.3 },
    ],
    cost: 0,
  });

  fx.register({
    group: 'fill',
    type: 'rainbowFlow',
    params: [
      { key: 'saturation', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.7 },
      { key: 'lightness', kind: 'number', min: 0.1, max: 1, step: 0.01, default: 0.6 },
      { key: 'speed', kind: 'number', min: 0, max: 2, step: 0.05, default: 0.5 },
      { key: 'perLetter', kind: 'bool', default: false },
    ],
    cost: 0,
  });

  fx.register({
    group: 'fill',
    type: 'holographic',
    params: [
      { key: 'iridescence', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
      { key: 'fresnel', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
      { key: 'speed', kind: 'number', min: 0, max: 2, step: 0.05, default: 0.3 },
    ],
    cost: 1,
  });

  fx.register({
    group: 'fill',
    type: 'chrome',
    params: [
      { key: 'envColors', kind: 'gradient', default: null },
      { key: 'sharpness', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    ],
    cost: 1,
  });

  fx.register({
    group: 'fill',
    type: 'goldFoil',
    params: [
      { key: 'grain', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'sparkle', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
    ],
    cost: 1,
  });

  fx.register({
    group: 'fill',
    type: 'fire',
    params: [
      { key: 'scale', kind: 'number', min: 0.2, max: 4, step: 0.05, default: 1, random: [0.5, 2] },
      { key: 'speed', kind: 'number', min: 0.1, max: 4, step: 0.05, default: 1 },
      { key: 'colors', kind: 'gradient', default: null },
    ],
    cost: 2,
  });

  fx.register({
    group: 'fill',
    type: 'caustics',
    params: [
      { key: 'scale', kind: 'number', min: 0.5, max: 8, step: 0.1, default: 2 },
      { key: 'speed', kind: 'number', min: 0, max: 2, step: 0.05, default: 0.4 },
      { key: 'colorA', kind: 'color', default: null },
      { key: 'colorB', kind: 'color', default: null },
    ],
    cost: 2,
  });

  fx.register({
    group: 'fill',
    type: 'marble',
    params: [
      { key: 'scale', kind: 'number', min: 0.5, max: 8, step: 0.1, default: 2 },
      { key: 'veins', kind: 'number', min: 1, max: 16, step: 1, default: 6 },
      { key: 'colors', kind: 'gradient', default: null },
    ],
    cost: 2,
  });

  fx.register({
    group: 'fill',
    type: 'glass',
    params: [
      { key: 'refraction', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
      { key: 'blur', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.2 },
      { key: 'tint', kind: 'color', default: null },
    ],
    cost: 2,
  });

  fx.register({
    group: 'fill',
    type: 'textureFill',
    params: [
      { key: 'imageId', kind: 'text', default: '' },
      { key: 'scale', kind: 'number', min: 0.1, max: 8, step: 0.05, default: 1 },
      { key: 'pan', kind: 'vec2', default: { x: 0, y: 0 } },
    ],
    cost: 1,
  });

  fx.register({
    group: 'fill',
    type: 'karaokeWipe',
    params: [
      { key: 'colorBefore', kind: 'color', default: null },
      { key: 'colorAfter', kind: 'color', default: null },
      { key: 'softness', kind: 'number', min: 0.001, max: 0.5, step: 0.005, default: 0.05 },
    ],
    cost: 0,
  });

  fx.register({
    group: 'fill',
    type: 'ink',
    tags: ['featured'],
    params: [
      { key: 'scale', kind: 'number', min: 1, max: 10, step: 0.1, default: 3 },
      { key: 'threshold', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'softness', kind: 'number', min: 0.01, max: 0.4, step: 0.005, default: 0.08 },
    ],
    cost: 2,
  });

  function toRgba(value, fallback, ctx) {
    return color.toRgba(value, fallback || [1, 1, 1, 1], ctx);
  }

  function num(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function fillUniforms(instance, ctx) {
    const params = (instance && instance.params) || {};
    const type = TYPES[(instance && instance.type) || 'solid'] || 1;
    const context = ctx || {};
    const colors = context.colors || {};
    let colorA = toRgba(colors.fill, [1, 1, 1, 1], context);
    let colorB = toRgba(colors.fill2 || colors.fill, [1, 1, 1, 1], context);
    let colorC = toRgba(colors.glow || colors.fill, [1, 1, 1, 1], context);
    let colorD = toRgba(colors.stroke || colors.fill, [1, 1, 1, 1], context);
    let params4 = [0, 0, 0, 0];
    if (type === 2 && context.category) {
      colorA = toRgba(context.category.tint, colorA, context);
      colorB = toRgba(context.category.tint2 || context.category.tint, colorB, context);
    }
    if (type === 3) params4 = [(num(params.angle, 0) * Math.PI) / 180, num(params.speed, 0.3), 0, 0];
    else if (type === 4) params4 = [num(params.saturation, 0.7), num(params.lightness, 0.6), num(params.speed, 0.5), params.perLetter ? 1 : 0];
    else if (type === 5) params4 = [num(params.iridescence, 0.6), num(params.fresnel, 0.4), num(params.speed, 0.3), 0];
    else if (type === 6) {
      params4 = [0, num(params.sharpness, 0.6), 0, 0];
      if (Array.isArray(params.envColors) && params.envColors.length >= 3) {
        colorA = toRgba(params.envColors[0].color || params.envColors[0], null, context);
        colorB = toRgba(params.envColors[1].color || params.envColors[1], null, context);
        colorC = toRgba(params.envColors[2].color || params.envColors[2], null, context);
      } else {
        colorA = [0.75, 0.82, 0.95, 1];
        colorB = [0.35, 0.4, 0.5, 1];
        colorC = [0.12, 0.13, 0.16, 1];
      }
    } else if (type === 7) params4 = [num(params.grain, 0.5), num(params.sparkle, 0.4), 0, 0];
    else if (type === 8) {
      params4 = [num(params.scale, 1), 0, num(params.speed, 1), 0];
      colorA = [0.05, 0.01, 0.02, 1];
      colorB = [0.5, 0.05, 0.02, 1];
      colorC = [0.95, 0.45, 0.05, 1];
      colorD = [1, 0.9, 0.55, 1];
    } else if (type === 9) params4 = [num(params.scale, 2), 0, num(params.speed, 0.4), 0];
    else if (type === 10) params4 = [num(params.scale, 2), num(params.veins, 6), 0, 0];
    else if (type === 11) params4 = [num(params.refraction, 0.4), num(params.blur, 0.2), 0, 0];
    else if (type === 12) params4 = [num(params.scale, 1), num(params.pan && params.pan.x, 0), num(params.pan && params.pan.y, 0), 0];
    else if (type === 13) {
      params4 = [0, num(params.softness, 0.05), 0, 0];
      if (colors.fill) colorA = toRgba(colors.fill, null, context);
      colorB = toRgba(colors.fill2 || colors.fill, colorA, context);
      if (params.colorBefore) colorA = toRgba(params.colorBefore, null, context);
      if (params.colorAfter) colorB = toRgba(params.colorAfter, null, context);
    } else if (type === 14) {
      params4 = [num(params.scale, 3), num(params.threshold, 0.35), num(params.softness, 0.08), 0];
    }
    return {
      u_type: type,
      u_colorA: colorA,
      u_colorB: colorB,
      u_colorC: colorC,
      u_colorD: colorD,
      u_params: params4,
      u_maskTint: context.role === 'bg' && context.maskTint ? 1 : 0,
      u_time: context.time || 0,
      u_progress: context.progress == null ? 0 : context.progress,
      sdfTexture: context.sdfTexture || null,
      imageTexture: context.imageTexture || null,
    };
  }

  fx.fillUniforms = fillUniforms;
  fx.fillTypes = TYPES;
  return fx;
});
