(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'), require('../../color'), require('../patterns'));
  else {
    root.SA = root.SA || {};
    factory(root.SA.fx, root.SA.color, root.SA.patterns);
  }
})(typeof self !== 'undefined' ? self : this, function (fx, color, patternLib) {
  'use strict';

  const TYPES = { outline: 1, neonGlow: 2, innerGlow: 3, bevel: 4, extrude: 5, longShadow: 6, dropShadow: 7, drip: 8 };
  const TOP = new Set([3, 4]);
  // The decoration vocabulary lives in ../patterns.js (one list for the edge,
  // the shape layer and the pattern fills). 0 keeps the plain line, so the
  // codes 1..4 that the old outline wrote (dashed / dotted / double / sketch)
  // are unchanged.
  const PATTERNS = (patternLib && patternLib.CODES) || { solid: 0, dashed: 1, dotted: 2, double: 3, sketch: 4 };
  const PATTERN_OPTIONS = (patternLib && patternLib.PATTERNS) || ['solid', 'dashed', 'dotted', 'double', 'sketch'];

  fx.register({
    group: 'edge',
    type: 'outline',
    tags: ['basic'],
    stackable: true,
    params: [
      { key: 'width', kind: 'number', min: 0.1, max: 100, step: 0.1, default: 3, random: [1, 6] },
      { key: 'color', kind: 'color', default: null },
      { key: 'softness', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'pattern', kind: 'select', options: PATTERN_OPTIONS, default: 'solid' },
      { key: 'dashLength', kind: 'number', min: 2, max: 80, step: 1, default: 14 },
      { key: 'gapRatio', kind: 'number', min: 0.1, max: 0.9, step: 0.01, default: 0.45 },
      { key: 'flow', kind: 'number', min: -4, max: 4, step: 0.05, default: 0 },
      // the band's centre distance from the glyph edge; negative pulls the line
      // inside the glyph, positive pushes it out
      { key: 'offset', kind: 'number', min: -30, max: 30, step: 0.5, default: 0 },
      // cuts the band out of everything inside this distance, so one outline
      // can draw the outer line of a double rule and leave the gap
      { key: 'inner', kind: 'number', min: 0, max: 30, step: 0.5, default: 0 },
    ],
    cost: 1,
  });

  fx.register({
    group: 'edge',
    type: 'neonGlow',
    tags: ['glow'],
    stackable: true,
    params: [
      { key: 'color', kind: 'color', default: null },
      { key: 'radius', kind: 'number', min: 1, max: 80, step: 0.5, default: 18, random: [6, 30] },
      { key: 'intensity', kind: 'number', min: 0, max: 3, step: 0.05, default: 1, random: [0.5, 1.6] },
      { key: 'bloom', kind: 'bool', default: true },
    ],
    cost: 2,
  });

  fx.register({
    group: 'edge',
    type: 'innerGlow',
    tags: ['glow'],
    stackable: true,
    params: [
      { key: 'color', kind: 'color', default: null },
      { key: 'radius', kind: 'number', min: 1, max: 80, step: 0.5, default: 14 },
      { key: 'intensity', kind: 'number', min: 0, max: 3, step: 0.05, default: 0.9 },
    ],
    cost: 2,
  });

  fx.register({
    group: 'edge',
    type: 'bevel',
    stackable: true,
    params: [
      { key: 'depth', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
      { key: 'lightAngle', kind: 'number', min: -180, max: 180, step: 1, default: -60 },
      { key: 'highlight', kind: 'color', default: null },
      { key: 'shadow', kind: 'color', default: null },
    ],
    cost: 2,
  });

  fx.register({
    group: 'edge',
    type: 'extrude',
    stackable: true,
    params: [
      { key: 'depth', kind: 'number', min: 0, max: 60, step: 1, default: 16, random: [6, 30] },
      { key: 'angle', kind: 'number', min: -180, max: 180, step: 1, default: 135 },
      { key: 'colorNear', kind: 'color', default: null },
      { key: 'colorFar', kind: 'color', default: null },
    ],
    cost: 3,
  });

  fx.register({
    group: 'edge',
    type: 'longShadow',
    stackable: true,
    params: [
      { key: 'length', kind: 'number', min: 0, max: 120, step: 1, default: 40 },
      { key: 'angle', kind: 'number', min: -180, max: 180, step: 1, default: 135 },
      { key: 'color', kind: 'color', default: null },
      { key: 'fade', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.7 },
    ],
    cost: 3,
  });

  fx.register({
    group: 'edge',
    type: 'dropShadow',
    stackable: true,
    params: [
      { key: 'offset', kind: 'vec2', default: { x: 6, y: 8 } },
      { key: 'blur', kind: 'number', min: 0, max: 40, step: 0.5, default: 10 },
      { key: 'color', kind: 'color', default: null },
      { key: 'opacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    ],
    cost: 2,
  });

  fx.register({
    group: 'edge',
    type: 'drip',
    tags: ['featured'],
    stackable: true,
    params: [
      { key: 'length', kind: 'number', min: 4, max: 160, step: 1, default: 40 },
      { key: 'width', kind: 'number', min: 0.1, max: 1, step: 0.01, default: 0.35 },
      { key: 'grow', kind: 'number', min: 0, max: 2, step: 0.05, default: 0.5 },
      { key: 'color', kind: 'color', default: null },
    ],
    cost: 2,
  });

  function toRgba(value, fallback, ctx) {
    return color.toRgba(value, fallback, ctx);
  }

  // --- multi-line edge (P6) ---------------------------------------------------
  // Expands into `count` outline passes; the outer layers sit at increasing
  // SDF radii with a transparent inner gap, so a band look (double / triple
  // stroke) and RGB-shifted layer stacks come out of the same outline shader.
  function mixRgba(a, b, t) {
    const k = Math.max(0, Math.min(1, Number(t) || 0));
    const out = [];
    for (let i = 0; i < 4; i += 1) out.push((Number(a[i]) || 0) * (1 - k) + (Number(b[i]) || 0) * k);
    return out;
  }

  fx.register({
    group: 'edge',
    type: 'multiLine',
    tags: ['stroke', 'pro'],
    pack: 'pro',
    stackable: true,
    cost: 3,
    params: [
      { key: 'count', kind: 'int', min: 2, max: 4, step: 1, default: 2, random: [2, 3] },
      { key: 'width', kind: 'number', min: 0.1, max: 40, step: 0.1, default: 2, random: [1, 4] },
      { key: 'gap', kind: 'number', min: 0, max: 20, step: 0.5, default: 3 },
      { key: 'widthDecay', kind: 'number', min: 0.3, max: 1, step: 0.01, default: 0.75 },
      { key: 'colorRule', kind: 'select', options: ['same', 'alternate', 'gradient'], default: 'same' },
      { key: 'colorA', kind: 'color', default: null },
      { key: 'colorB', kind: 'color', default: null },
      { key: 'pattern', kind: 'select', options: PATTERN_OPTIONS, default: 'solid' },
      { key: 'layerOffset', kind: 'vec2', default: { x: 0, y: 0 } },
      { key: 'layerDelay', kind: 'number', min: 0, max: 0.4, step: 0.01, default: 0.06 },
    ],
  });

  function num(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  // One edge instance -> one or more uniform sets (multiLine expands).
  function edgeUniformsAll(instance, ctx) {
    if (!instance || instance.type !== 'multiLine') {
      const single = edgeUniforms(instance, ctx);
      return single ? [single] : [];
    }
    const params = instance.params || {};
    const context = ctx || {};
    const maxDistance = Math.max(1, context.maxDistance || 108);
    const toNorm = (px) => px / maxDistance;
    const base = toRgba(context.colorSet && context.colorSet.stroke, [0, 0, 0, 1], context);
    const count = Math.max(2, Math.min(4, Math.round(num(params.count, 2))));
    const width = Math.max(0.1, num(params.width, 2));
    const gap = Math.max(0, num(params.gap, 3));
    const decay = Math.max(0.05, Math.min(1, num(params.widthDecay, 0.75)));
    const rule = params.colorRule || 'same';
    const pattern = PATTERNS[params.pattern] == null ? 0 : PATTERNS[params.pattern];
    const colorA = toRgba(params.colorA, base, context);
    const colorB = toRgba(params.colorB, base, context);
    const offsetX = num(params.layerOffset && params.layerOffset.x, 0);
    const offsetY = num(params.layerOffset && params.layerOffset.y, 0);
    const delay = Math.max(0, num(params.layerDelay, 0.06));
    const localTime = context.localTime == null ? null : num(context.localTime, 0);
    const out = [];
    for (let layer = 0; layer < count; layer += 1) {
      const grow = delay > 0 && localTime != null && layer > 0 ? clamp01((localTime - layer * delay) / 0.25) : 1;
      if (grow <= 0.001) continue;
      const layerWidth = width * Math.pow(decay, layer) * grow;
      const radius = width * 0.5 + layer * (width + gap);
      const color = rule === 'alternate'
        ? (layer % 2 ? colorB : colorA)
        : rule === 'gradient'
          ? mixRgba(colorA, colorB, count > 1 ? layer / (count - 1) : 0)
          : colorA;
      out.push({
        u_type: 1,
        u_color: color,
        u_params: [toNorm(layerWidth), 14, toNorm(radius), 0.2],
        // the outline branch reads x = pattern, y = gap ratio, z = flow,
        // w = inner radius, so a multi-line stack can carry a pattern too
        u_params2: [pattern, 0.45, 0, toNorm(Math.max(0, radius - layerWidth))],
        u_direction: [1, 1],
        u_offset: [offsetX / Math.max(1, num(context.width, 1920)) * layer, -offsetY / Math.max(1, num(context.height, 1080)) * layer],
        u_time: context.time || 0,
        sdfTexture: context.sdfTexture || null,
        top: layer > 0,
      });
    }
    return out;
  }

  function edgeUniforms(instance, ctx) {
    const params = (instance && instance.params) || {};
    const type = TYPES[(instance && instance.type) || 'outline'] || 1;
    const context = ctx || {};
    const maxDistance = Math.max(1, context.maxDistance || 108);
    const toNorm = (px) => px / maxDistance;
    const defaultColor = type === 4 ? [1, 1, 1, 1] : [0, 0, 0, 1];
    const base = toRgba(context.colorSet && context.colorSet.stroke, defaultColor, context);
    let edgeColor = base;
    let params4 = [0, 0, 0, 0];
    let params4b = [0, 0, 0, 0];
    let direction = [1, 1];
    let offset = [0, 0];
    if (type === 1) {
      params4 = [toNorm(num(params.width, 3)), num(params.dashLength, 14), toNorm(num(params.offset, 0)), num(params.softness, 0.35)];
      params4b = [PATTERNS[params.pattern] || 0, num(params.gapRatio, 0.45), num(params.flow, 0), toNorm(Math.max(0, num(params.inner, 0)))];
      edgeColor = toRgba(params.color, base, context);
    } else if (type === 2 || type === 3) {
      params4 = [0, toNorm(num(params.radius, 14)), num(params.intensity, 1), 0];
      edgeColor = toRgba(params.color, type === 2 ? [1, 0.8, 0.4, 1] : [1, 1, 1, 1], context);
    } else if (type === 4) {
      params4 = [((num(params.lightAngle, -60) + 180) * Math.PI) / 180, Math.max(0.4, 1 + num(params.depth, 0.6)), 0, 0];
      edgeColor = toRgba(params.highlight, [1, 1, 1, 1], context);
    } else if (type === 5 || type === 6) {
      const angle = ((num(params.angle, 135) + 180) * Math.PI) / 180;
      direction = [Math.cos(angle), -Math.sin(angle)];
      params4 = [toNorm(num(type === 5 ? params.depth : params.length, type === 5 ? 16 : 40)), 0, 0, 0];
      edgeColor = toRgba(params.color || params.colorNear, base, context);
    } else if (type === 7) {
      const x = num(params.offset && params.offset.x, 6);
      const y = num(params.offset && params.offset.y, 8);
      offset = [x / context.width || 0.003, -y / (context.height || 1080)];
      params4 = [0, toNorm(num(params.blur, 10)), num(params.opacity, 0.6), 0];
      edgeColor = toRgba(params.color, [0, 0, 0, 1], context);
    } else if (type === 8) {
      params4 = [num(params.length, 40), num(params.width, 0.35), num(params.grow, 0.5), 0];
      edgeColor = toRgba(params.color, toRgba((context.colorSet && context.colorSet.glow) || null, [0.55, 0.05, 0.06, 1], context), context);
    }
    return {
      u_type: type,
      u_color: edgeColor,
      u_params: params4,
      u_params2: params4b,
      u_direction: direction,
      u_offset: offset,
      u_time: context.time || 0,
      sdfTexture: context.sdfTexture || null,
      top: TOP.has(type),
    };
  }

  fx.edgeUniforms = edgeUniforms;
  fx.edgeUniformsAll = edgeUniformsAll;
  fx.edgeTypes = TYPES;
  return fx;
});
