(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.audioDriver = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PRESETS = {
    low: [0, 10],
    mid: [11, 45],
    high: [46, 100],
    rms: null,
  };

  function frameAt(analysis, t) {
    if (!analysis || !Array.isArray(analysis.frames) || !analysis.frames.length) return null;
    const fps = analysis.fps || 30;
    const index = Math.max(0, Math.min(analysis.frames.length - 1, Math.floor(Math.max(0, t) * fps)));
    return analysis.frames[index] || null;
  }

  function level(frame, band) {
    if (!frame) return 0;
    if (band === 'rms') return Number(frame.rms) || 0;
    if (typeof band === 'number') {
      if (!frame.bands) return 0;
      const index = Math.max(0, Math.min(frame.bands.length - 1, Math.round(band)));
      return Number(frame.bands[index]) || 0;
    }
    const range = PRESETS[band] || PRESETS.mid;
    if (!frame.bands) return 0;
    let sum = 0;
    let count = 0;
    for (let i = range[0]; i <= Math.min(range[1], frame.bands.length - 1); i += 1) {
      sum += Number(frame.bands[i]) || 0;
      count += 1;
    }
    return count ? sum / count : 0;
  }

  function specFor(descriptor) {
    if (typeof descriptor === 'string') return { band: descriptor };
    if (descriptor && descriptor.audio) return descriptor.audio;
    return descriptor || {};
  }

  function sample(analysis, t, descriptor) {
    const spec = specFor(descriptor);
    const frame = frameAt(analysis, t);
    const raw = level(frame, spec.band == null ? 'mid' : spec.band);
    const gain = spec.gain == null ? 1 : Number(spec.gain);
    const offset = spec.offset == null ? 0 : Number(spec.offset);
    const min = spec.min == null ? 0 : Number(spec.min);
    const max = spec.max == null ? Infinity : Number(spec.max);
    const value = offset + raw * gain;
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }

  function isAudioValue(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value) && !!value.audio;
  }

  // The average RMS over a time range, normalised to the song's own p90 so the
  // value means "how loud is this beat for this song" (0..1) instead of an
  // absolute level. No analysis frame -> null, so callers keep their fallback.
  function rangeEnergy(analysis, start, end) {
    if (!analysis || !Array.isArray(analysis.frames) || !analysis.frames.length) return null;
    const fps = analysis.fps || 30;
    const last = analysis.frames.length - 1;
    const from = Math.max(0, Math.min(last, Math.floor(Math.max(0, Number(start) || 0) * fps)));
    const to = Math.max(from, Math.min(last, Math.ceil(Math.max(0, Number(end) || 0) * fps) - 1));
    let sum = 0;
    let count = 0;
    for (let i = from; i <= to; i += 1) {
      sum += Number(analysis.frames[i].rms) || 0;
      count += 1;
    }
    if (!count) return null;
    const average = sum / count;
    const sorted = analysis.frames.map((frame) => Number(frame.rms) || 0).sort((a, b) => a - b);
    const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] || 0;
    if (!(p90 > 0)) return 0;
    return Math.max(0, Math.min(1, average / p90));
  }

  function resolveValue(value, analysis, t) {
    return isAudioValue(value) ? sample(analysis, t, value) : value;
  }

  function resolveParams(params, analysis, t) {
    if (!params || typeof params !== 'object') return params;
    let changed = false;
    const next = {};
    for (const [key, value] of Object.entries(params)) {
      if (isAudioValue(value)) {
        next[key] = sample(analysis, t, value);
        changed = true;
      } else {
        next[key] = value;
      }
    }
    return changed ? next : params;
  }

  function resolveInstance(instance, analysis, t) {
    if (!instance || !instance.params) return instance;
    const params = resolveParams(instance.params, analysis, t);
    if (params === instance.params) return instance;
    return { ...instance, params };
  }

  const SINGLE_GROUPS = ['animation', 'layout', 'enter', 'exit', 'location', 'fill', 'background', 'bgShape', 'bgFill', 'bgMotion'];
  const STACK_GROUPS = ['hold', 'edge', 'post', 'bgEdge'];

  function resolveStyle(style, analysis, t) {
    if (!style || !analysis) return style;
    let changed = false;
    const next = { ...style };
    for (const group of SINGLE_GROUPS) {
      const instance = style[group];
      if (!instance || !instance.params) continue;
      const resolved = resolveInstance(instance, analysis, t);
      if (resolved !== instance) {
        next[group] = resolved;
        changed = true;
      }
    }
    for (const group of STACK_GROUPS) {
      const list = style[group];
      if (!Array.isArray(list)) continue;
      let listChanged = false;
      const mapped = list.map((instance) => {
        const resolved = resolveInstance(instance, analysis, t);
        if (resolved !== instance) listChanged = true;
        return resolved;
      });
      if (listChanged) {
        next[group] = mapped;
        changed = true;
      }
    }
    return changed ? next : style;
  }

  function reactiveParams(style) {
    const result = [];
    const visit = (group, instance) => {
      if (!instance || !instance.params) return;
      for (const [key, value] of Object.entries(instance.params)) {
        if (isAudioValue(value)) result.push({ group, key, audio: specFor(value) });
      }
    };
    for (const group of SINGLE_GROUPS) visit(group, style && style[group]);
    for (const group of STACK_GROUPS) {
      const list = style && style[group];
      if (Array.isArray(list)) list.forEach((instance) => visit(group, instance));
    }
    return result;
  }

  return {
    PRESETS,
    frameAt,
    level,
    sample,
    rangeEnergy,
    isAudioValue,
    resolveValue,
    resolveParams,
    resolveInstance,
    resolveStyle,
    reactiveParams,
  };
});
