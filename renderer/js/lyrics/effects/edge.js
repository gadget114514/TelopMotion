(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'), require('../../color'));
  else {
    root.SA = root.SA || {};
    factory(root.SA.fx, root.SA.color);
  }
})(typeof self !== 'undefined' ? self : this, function (fx, color) {
  'use strict';

  const TYPES = { outline: 1, neonGlow: 2, innerGlow: 3, bevel: 4, extrude: 5, longShadow: 6, dropShadow: 7, drip: 8 };
  const TOP = new Set([3, 4]);
  const PATTERNS = { solid: 0, dashed: 1, dotted: 2, double: 3, sketch: 4 };

  fx.register({
    group: 'edge',
    type: 'outline',
    tags: ['basic'],
    stackable: true,
    params: [
      { key: 'width', kind: 'number', min: 0.5, max: 20, step: 0.5, default: 3, random: [1, 6] },
      { key: 'color', kind: 'color', default: null },
      { key: 'softness', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'pattern', kind: 'select', options: ['solid', 'dashed', 'dotted', 'double', 'sketch'], default: 'solid' },
      { key: 'dashLength', kind: 'number', min: 2, max: 80, step: 1, default: 14 },
      { key: 'gapRatio', kind: 'number', min: 0.1, max: 0.9, step: 0.01, default: 0.45 },
      { key: 'flow', kind: 'number', min: -4, max: 4, step: 0.05, default: 0 },
      { key: 'offset', kind: 'number', min: 0, max: 30, step: 0.5, default: 0 },
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

  function num(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
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
      params4b = [PATTERNS[params.pattern] || 0, num(params.gapRatio, 0.45), num(params.flow, 0), 0];
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
  fx.edgeTypes = TYPES;
  return fx;
});
