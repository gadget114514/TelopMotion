(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.fillers = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    enabled: true,
    minGap: 1.5,
    margin: 0.25,
    byKind: {
      intro: { type: 'credits', params: {} },
      interlude: { type: 'spectrum', params: {} },
      outro: { type: 'credits', params: {} },
    },
    longGap: { threshold: 8, spec: { type: 'shapes', params: {} } },
    clips: {},
  };

  function settingsFor(project) {
    const settings = (project && project.fillers) || {};
    return { ...DEFAULTS, ...settings, byKind: { ...DEFAULTS.byKind, ...(settings.byKind || {}) }, longGap: { ...DEFAULTS.longGap, ...(settings.longGap || {}) }, clips: settings.clips || {} };
  }

  function normalize(options) {
    if (!options) return DEFAULTS;
    return {
      ...DEFAULTS,
      ...options,
      byKind: { ...DEFAULTS.byKind, ...(options.byKind || {}) },
      longGap: { ...DEFAULTS.longGap, ...(options.longGap || {}) },
      clips: options.clips || DEFAULTS.clips,
    };
  }

  function gaps(cues, duration, options) {
    const settings = normalize(options);
    if (settings.enabled === false) return [];
    const sorted = [...(cues || [])].filter((cue) => cue && cue.end > cue.start).sort((a, b) => a.start - b.start);
    const total = duration && duration > 0 ? duration : sorted.length ? sorted[sorted.length - 1].end : 0;
    const result = [];
    const margin = settings.margin == null ? 0.25 : settings.margin;
    const minGap = settings.minGap == null ? 1.5 : settings.minGap;
    let cursor = 0;
    for (let i = 0; i <= sorted.length; i += 1) {
      const next = sorted[i] || null;
      const to = next ? next.start : total;
      const rawFrom = cursor;
      const rawTo = to;
      if (rawTo - rawFrom > 0) {
        const from = i === 0 ? rawFrom : rawFrom + margin;
        const end = next ? rawTo - margin : rawTo;
        if (end - from >= minGap) {
          const kind = i === 0 ? 'intro' : next ? 'interlude' : 'outro';
          const long = end - from > (settings.longGap.threshold || 8);
          const key = `${sorted[i - 1] ? sorted[i - 1].id : 'start'}>${next ? next.id : 'end'}`;
          const pinned = (settings.clips || {})[key] || null;
          const spec = pinned || (long && settings.longGap.spec ? settings.longGap.spec : settings.byKind[kind]) || { type: 'none', params: {} };
          result.push({
            key,
            kind,
            from,
            to: end,
            prevCueId: sorted[i - 1] ? sorted[i - 1].id : null,
            nextCueId: next ? next.id : null,
            long,
            pinned: !!pinned,
            spec,
          });
        }
      }
      cursor = next ? next.end : total;
    }
    return result;
  }

  function clips(cues, duration, options) {
    const settings = options || DEFAULTS;
    return gaps(cues, duration, settings).map((gap, index) => ({
      ...gap,
      index,
      spec: gap.spec,
    }));
  }

  return { DEFAULTS, settingsFor, gaps, clips };
});
