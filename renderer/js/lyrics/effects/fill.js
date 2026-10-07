(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'), require('../../color'), require('../theme-colors'));
  else {
    root.SA = root.SA || {};
    factory(root.SA.fx, root.SA.color, root.SA.themeColors);
  }
})(typeof self !== 'undefined' ? self : this, function (fx, color, themeColors) {
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
    stripes: 15,
    checker: 16,
    diamondGrid: 17,
    halftone: 18,
    hatch: 19,
    randomSpeckle: 20,
    splitTone: 21,
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
      // deep / mid / hot stops; null keeps the built-in gold ramp
      { key: 'colors', kind: 'gradient', default: null },
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
      { key: 'veinWidth', kind: 'number', min: 0.01, max: 0.5, step: 0.01, default: 0.06 },
      // stone / vein colours; null keeps the built-in grey ramp
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

  // Pattern fills: the PowerPoint / After Effects geometry vocabulary as a
  // foreground texture. They are pack 'pro' so the fx400 / fx800 pools keep
  // their classic type list, while the Studio (packs font + pro) shows them.
  const PATTERN_FILL_PARAMS = [
    { key: 'colorA', kind: 'color', default: null },
    { key: 'colorB', kind: 'color', default: null },
    { key: 'angle', kind: 'number', min: -180, max: 180, step: 1, default: 0, random: [-30, 30] },
    { key: 'size', kind: 'number', min: 2, max: 120, step: 1, default: 24, random: [10, 36] },
    { key: 'ratio', kind: 'number', min: 0.05, max: 0.95, step: 0.01, default: 0.5 },
    { key: 'speed', kind: 'number', min: -2, max: 2, step: 0.05, default: 0.3 },
  ];

  fx.register({
    group: 'fill',
    type: 'stripes',
    tags: ['pro', 'pattern'],
    pack: 'pro',
    params: PATTERN_FILL_PARAMS,
    cost: 1,
  });

  fx.register({
    group: 'fill',
    type: 'checker',
    tags: ['pro', 'pattern'],
    pack: 'pro',
    params: PATTERN_FILL_PARAMS,
    cost: 1,
  });

  fx.register({
    group: 'fill',
    type: 'diamondGrid',
    tags: ['pro', 'pattern'],
    pack: 'pro',
    params: PATTERN_FILL_PARAMS,
    cost: 1,
  });

  fx.register({
    group: 'fill',
    type: 'halftone',
    tags: ['pro', 'pattern'],
    pack: 'pro',
    params: PATTERN_FILL_PARAMS,
    cost: 1,
  });

  fx.register({
    group: 'fill',
    type: 'hatch',
    tags: ['pro', 'pattern'],
    pack: 'pro',
    params: PATTERN_FILL_PARAMS,
    cost: 1,
  });

  fx.register({
    group: 'fill',
    type: 'randomSpeckle',
    tags: ['pro', 'pattern'],
    pack: 'pro',
    params: PATTERN_FILL_PARAMS,
    cost: 1,
  });

  fx.register({
    group: 'fill',
    type: 'splitTone',
    tags: ['pro', 'pattern'],
    pack: 'pro',
    params: [
      { key: 'top', kind: 'color', default: null },
      { key: 'bottom', kind: 'color', default: null },
      { key: 'split', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'softness', kind: 'number', min: 0, max: 0.3, step: 0.005, default: 0 },
      { key: 'angle', kind: 'number', min: -60, max: 60, step: 1, default: 0 },
      { key: 'basis', kind: 'select', options: ['glyph', 'em'], default: 'glyph' },
      { key: 'band', kind: 'number', min: 0, max: 0.2, step: 0.005, default: 0 },
      { key: 'bandColor', kind: 'color', default: null },
      { key: 'alternate', kind: 'bool', default: false },
    ],
    cost: 0,
  });

  function toRgba(value, fallback, ctx) {
    return color.toRgba(value, fallback || [1, 1, 1, 1], ctx);
  }

  // The Theme's decorative table for this fill's context (palette + weird),
  // or null when no Theme is in scope (the classic built-in ramps stay).
  function themeOf(context) {
    if (!themeColors || typeof themeColors.themeOf !== 'function') return null;
    try {
      return themeColors.themeOf(context);
    } catch {
      return null;
    }
  }

  function rampArrays(hexes, ctx) {
    return hexes.map((hex) => {
      try {
        const rgba = color.parse(hex);
        return [rgba.r, rgba.g, rgba.b, rgba.a == null ? 1 : rgba.a];
      } catch {
        return [1, 1, 1, 1];
      }
    });
  }

  function num(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  // The built-in ramps for the fills whose own params carry no colours. They
  // are what the effect falls back to when a project has not set `colors`, so a
  // flat palette (fill === fill2) still reads as marble / gold / fire instead of
  // mixing one colour with itself.
  const STONE = [[0.93, 0.93, 0.95, 1], [0.42, 0.44, 0.5, 1]];
  const GOLD_DEEP = [0.36, 0.22, 0.05, 1];
  const GOLD_MID = [0.86, 0.66, 0.22, 1];
  const GOLD_HOT = [1, 0.94, 0.7, 1];
  const FIRE = [[0.05, 0.01, 0.02, 1], [0.5, 0.05, 0.02, 1], [0.95, 0.45, 0.05, 1], [1, 0.9, 0.55, 1]];

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
    let params4b = [0, 0, 0, 0];
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
        const chromeRamp = (themeOf(context) || {}).chrome;
        const ramp = chromeRamp ? rampArrays(chromeRamp, context) : null;
        colorA = ramp ? ramp[0] : [0.75, 0.82, 0.95, 1];
        colorB = ramp ? ramp[1] : [0.35, 0.4, 0.5, 1];
        colorC = ramp ? ramp[2] : [0.12, 0.13, 0.16, 1];
      }
    } else if (type === 7) {
      // goldFoil: deep / mid / hot stops. `colors` overrides the Theme ramp;
      // without either the effect still reads as metal instead of the bare fill
      params4 = [num(params.grain, 0.5), num(params.sparkle, 0.4), 0, 0];
      const metalRamp = (themeOf(context) || {}).metal;
      const metal = metalRamp ? rampArrays(metalRamp, context) : null;
      if (Array.isArray(params.colors) && params.colors.length >= 2) {
        colorA = toRgba(params.colors[0].color || params.colors[0], colorA, context);
        colorB = toRgba(params.colors[1].color || params.colors[1], colorB, context);
        colorC = toRgba(params.colors[2] ? params.colors[2].color || params.colors[2] : null, metal ? metal[2] : GOLD_HOT, context);
      } else if (metal) {
        colorA = metal[0];
        colorB = metal[1];
        colorC = metal[2];
      } else {
        colorA = GOLD_DEEP;
        colorB = GOLD_MID;
        colorC = GOLD_HOT;
      }
    } else if (type === 8) {
      params4 = [num(params.scale, 1), 0, num(params.speed, 1), 0];
      const fireStops = Array.isArray(params.colors) ? params.colors : null;
      const emberRamp = (!fireStops && (themeOf(context) || {}).ember) || null;
      const ember = emberRamp ? rampArrays(emberRamp, context) : FIRE;
      colorA = fireStops ? toRgba(fireStops[0].color || fireStops[0], ember[0], context) : ember[0];
      colorB = fireStops ? toRgba(fireStops[Math.min(1, fireStops.length - 1)].color || fireStops[Math.min(1, fireStops.length - 1)], ember[1], context) : ember[1];
      colorC = ember[2];
      colorD = ember[3];
    } else if (type === 9) {
      params4 = [num(params.scale, 2), 0, num(params.speed, 0.4), 0];
      if (params.colorA) colorA = toRgba(params.colorA, colorA, context);
      if (params.colorB) colorB = toRgba(params.colorB, colorB, context);
    } else if (type === 10) {
      // marble: `colors` overrides the stone ramp; without one a flat palette
      // (fill === fill2) would mix a colour with itself and read as solid
      params4 = [num(params.scale, 2), num(params.veins, 6), num(params.veinWidth, 0.06), 0];
      const stone = Array.isArray(params.colors) && params.colors.length >= 2
        ? [toRgba(params.colors[0].color || params.colors[0], STONE[0], context),
           toRgba(params.colors[params.colors.length - 1].color || params.colors[params.colors.length - 1], STONE[1], context)]
        : null;
      const stoneRamp = (!stone && (themeOf(context) || {}).stone) || null;
      const stoneTheme = stoneRamp ? rampArrays(stoneRamp, context) : null;
      colorA = stone ? stone[0] : colorA;
      colorB = stone ? stone[1] : stoneTheme ? stoneTheme[1] : STONE[1];
    } else if (type === 11) {
      params4 = [num(params.refraction, 0.4), num(params.blur, 0.2), 0, 0];
      if (params.tint) colorA = toRgba(params.tint, colorA, context);
    } else if (type === 12) params4 = [num(params.scale, 1), num(params.pan && params.pan.x, 0), num(params.pan && params.pan.y, 0), 0];
    else if (type === 13) {
      params4 = [0, num(params.softness, 0.05), 0, 0];
      if (colors.fill) colorA = toRgba(colors.fill, null, context);
      colorB = toRgba(colors.fill2 || colors.fill, colorA, context);
      if (params.colorBefore) colorA = toRgba(params.colorBefore, null, context);
      if (params.colorAfter) colorB = toRgba(params.colorAfter, null, context);
    } else if (type === 14) {
      params4 = [num(params.scale, 3), num(params.threshold, 0.35), num(params.softness, 0.08), 0];
    } else if (type === 21) {
      if (params.top) colorA = toRgba(params.top, colorA, context);
      if (params.bottom) colorB = toRgba(params.bottom, colorB, context);
      else if (!colors.fill2) colorB = toRgba(colors.fill, colorA, context);
      if (params.bandColor) colorC = toRgba(params.bandColor, colorC, context);
      else colorC = toRgba(colors.stroke || colors.fill, colorC, context);
      params4 = [num(params.split, 0.5), num(params.softness, 0), (num(params.angle, 0) * Math.PI) / 180, num(params.band, 0)];
      params4b = [params.basis === 'em' ? 1 : 0, params.alternate ? 1 : 0, 0, 0];
    } else if (type >= 15) {
      // pattern fills: angle (rad), size, ratio, speed; the two colours come
      // from colorA / colorB so the palette drives them like every fill
      params4b = [
        (num(params.angle, 0) * Math.PI) / 180,
        Math.max(2, num(params.size, 24)),
        Math.max(0.02, Math.min(0.98, num(params.ratio, 0.5))),
        num(params.speed, 0.3),
      ];
      if (params.colorA) colorA = toRgba(params.colorA, colorA, context);
      if (params.colorB) colorB = toRgba(params.colorB, colorB, context);
    }
    return {
      u_type: type,
      u_colorA: colorA,
      u_colorB: colorB,
      u_colorC: colorC,
      u_colorD: colorD,
      u_params: params4,
      u_params2: params4b,
      u_maskTint: context.role === 'bg' && context.maskTint ? 1 : 0,
      // the glyph body takes the per-letter colour when one was declared
      u_letterTint: context.letterTint ? 1 : 0,
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
