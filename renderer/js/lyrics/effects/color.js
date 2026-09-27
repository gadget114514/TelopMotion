(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'), require('../../color'));
  else {
    root.SA = root.SA || {};
    factory(root.SA.fx, root.SA.color);
  }
})(typeof self !== 'undefined' ? self : this, function (fx, color) {
  'use strict';

  // The Color group has no shader of its own: it edits the StyleSet color set.
  // resolveColorSet turns the project palette/category data plus the ColorSet
  // into concrete rgba arrays that the fill and edge passes consume.
  function resolveColorSet(colorSet, ctx) {
    const set = colorSet || {};
    const context = ctx || {};
    const resolve = (value, fallback) => {
      if (!value || !value.kind) return fallback;
      const resolved = color.resolve(value, {
        palettes: context.palettes || [],
        localPalette: context.palette || null,
        categoryColors: context.categoryColors || {},
        category: context.category || null,
        t: context.time || 0,
      });
      if (resolved.kind === 'gradient') {
        const stops = resolved.stops || [];
        const first = stops.length ? stops[0].rgba : null;
        const last = stops.length ? stops[stops.length - 1].rgba : null;
        return {
          kind: 'gradient',
          stops: stops.map((stop) => stop.rgba),
          positions: stops.map((stop) => stop.pos),
          angle: resolved.angle == null ? 90 : resolved.angle,
          shift: resolved.shift || 0,
          rgba: first || { r: 1, g: 1, b: 1, a: 1 },
          rgba2: last || first || { r: 1, g: 1, b: 1, a: 1 },
        };
      }
      return { kind: 'solid', stops: [resolved.rgba], positions: [0], rgba: resolved.rgba, rgba2: resolved.rgba };
    };
    const toArray = (rgba, fallback) => {
      if (!rgba) return fallback;
      return [rgba.r, rgba.g, rgba.b, rgba.a == null ? 1 : rgba.a];
    };
    const fill = resolve(set.fill || (context.defaultFill ? { kind: 'solid', value: context.defaultFill } : null), [1, 1, 1, 1]);
    const fill2 = resolve(set.fill2, fill.rgba);
    const stroke = resolve(set.stroke, [1, 1, 1, 1]);
    const glow = resolve(set.glow, null);
    return {
      fill,
      fill2,
      stroke,
      glow,
      arrays: {
        fill: toArray(fill.rgba, [1, 1, 1, 1]),
        fill2: toArray(fill2.rgba, [1, 1, 1, 1]),
        stroke: toArray(stroke.rgba, [1, 1, 1, 1]),
        glow: toArray(glow && glow.rgba, null),
      },
    };
  }

  fx.resolveColorSet = resolveColorSet;
  return fx;
});
