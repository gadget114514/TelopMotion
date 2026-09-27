(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./easing'), require('../color'));
  } else {
    root.SA = root.SA || {};
    root.SA.tween = factory(root.SA.easing, root.SA.color);
  }
})(typeof self !== 'undefined' ? self : this, function (easing, color) {
  'use strict';

  function clamp01(value) {
    if (Number.isNaN(value)) return 0;
    return value <= 0 ? 0 : value >= 1 ? 1 : value;
  }

  function easeValue(ease, p) {
    const fn = typeof ease === 'function' ? ease : easing.get(ease == null ? 'linear' : ease);
    return fn(p);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function resamplePoints(points, count) {
    const source = Array.isArray(points) ? points : [];
    if (!source.length || count <= 0) return [];
    if (source.length === count) return source.map((point) => ({ ...point }));
    const result = [];
    for (let i = 0; i < count; i += 1) {
      const position = (i / (count - 1 || 1)) * (source.length - 1);
      const index = Math.floor(position);
      const local = position - index;
      const start = source[index];
      const end = source[Math.min(source.length - 1, index + 1)];
      result.push({ x: start.x + (end.x - start.x) * local, y: start.y + (end.y - start.y) * local });
    }
    return result;
  }

  function tweenPoints(a, b, t) {
    const left = Array.isArray(a) ? a : [];
    const right = Array.isArray(b) ? b : [];
    const count = Math.max(left.length, right.length);
    const from = left.length === count ? left : resamplePoints(left, count);
    const to = right.length === count ? right : resamplePoints(right, count);
    return from.map((point, index) => {
      const target = to[index] || point;
      return { x: lerp(point.x, target.x, t), y: lerp(point.y, target.y, t) };
    });
  }

  function tweenPair(a, b, t) {
    const left = Array.isArray(a) ? a : [a];
    const right = Array.isArray(b) ? b : [b];
    const count = Math.max(left.length, right.length);
    const result = [];
    for (let i = 0; i < count; i += 1) {
      const from = left[Math.min(i, left.length - 1)] || 0;
      const to = right[Math.min(i, right.length - 1)] || 0;
      result.push(lerp(from, to, t));
    }
    return Array.isArray(a) || Array.isArray(b) ? result : result[0];
  }

  function value(kind, a, b, p, ease) {
    const raw = clamp01(p == null ? 0 : p);
    if (kind === 'step') return raw >= 1 ? b : a;
    if (kind === 'bool') return easeValue(ease, raw) >= 0.5 ? b : a;
    const t = easeValue(ease, raw);
    switch (kind) {
      case 'int':
        return Math.round(lerp(Number(a) || 0, Number(b) || 0, t));
      case 'color':
      case 'gradient':
        return color.lerpColorValue(a, b, t);
      case 'points':
        return tweenPoints(a, b, t);
      case 'vec2':
      case 'vec3':
        return tweenPair(a, b, t);
      case 'number':
      default:
        if (typeof a === 'number' && typeof b === 'number') return lerp(a, b, t);
        return tweenPair(a, b, t);
    }
  }

  function segment(track, t) {
    const keys = track && track.keys;
    if (!Array.isArray(keys) || !keys.length) return undefined;
    if (t <= keys[0].t) return keys[0].value;
    const last = keys[keys.length - 1];
    if (t >= last.t) return last.value;
    for (let i = 0; i < keys.length - 1; i += 1) {
      const start = keys[i];
      const end = keys[i + 1];
      if (t >= start.t && t <= end.t) {
        const span = end.t - start.t;
        const p = span <= 0 ? 1 : (t - start.t) / span;
        return value(track.kind, start.value, end.value, p, start.ease);
      }
    }
    return last.value;
  }

  return { value, segment };
});
