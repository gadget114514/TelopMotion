(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.fillers = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Fillers are on by default: a gap is dead air, and the automatic direction
  // fills it. A project that switched them off (`project.fillers.enabled:
  // false`) keeps that choice, and `regenerate fillers` always materialises the
  // gaps whatever the flag says.
  const DEFAULTS = {
    enabled: true,
    minGap: 1.5,
    margin: 0.25,
    byKind: {
      intro: { type: 'combo', params: { list: [{ type: 'credits', params: {} }, { type: 'figures', params: {} }] } },
      interlude: { type: 'figures', params: {} },
      outro: { type: 'combo', params: { list: [{ type: 'credits', params: {} }, { type: 'figures', params: {} }] } },
    },
    longGap: { threshold: 8, spec: { type: 'figures', params: {} } },
    clips: {},
    // the informed tempo (0 = none); a gap is then divided bar by bar
    bpm: 0,
  };

  // The meter the bar grid assumes, the same one the text flow cuts cues on.
  const BEATS_PER_BAR = 4;
  // A bar shorter than this is not worth a clip of its own (the tail merges
  // into the bar before it), so a slow tempo cannot shred a gap into slivers.
  const MIN_SEGMENT = 0.6;

  // The tempo the project informed the app with, 0 when it never chose one.
  function bpmOf(project) {
    const value = Number(project && project.song && project.song.bpm);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  // The bar edges of a gap: the spans a bar grid cuts it into. One span means
  // the gap is shorter than a bar (or no tempo is known) and stays whole.
  function beatSegments(from, to, bpm) {
    const bar = (60 / (Number(bpm) || 0)) * BEATS_PER_BAR;
    const whole = [[from, to]];
    if (!Number.isFinite(bar) || bar <= MIN_SEGMENT) return whole;
    const edges = [from];
    for (let at = Math.ceil((from + 1e-6) / bar) * bar; at < to - MIN_SEGMENT - 1e-6; at += bar) edges.push(at);
    edges.push(to);
    const spans = edges.slice(0, -1).map((edge, index) => [edge, edges[index + 1]]);
    if (spans.length < 2) return whole;
    // a leftover shorter than a usable clip joins the span before it
    const merged = [];
    for (const span of spans) {
      const last = merged[merged.length - 1];
      if (last && span[1] - span[0] < MIN_SEGMENT) last[1] = span[1];
      else merged.push(span.slice());
    }
    const first = merged[0];
    if (merged.length > 1 && first[1] - first[0] < MIN_SEGMENT) {
      merged.splice(0, 1);
      merged[0][0] = first[0];
    }
    return merged;
  }

  // The credits layer of a spec. It names the song, so it belongs to the first
  // beat of a gap only - the later bars keep the moving part without repeating
  // the title.
  function withoutCredits(spec) {
    if (!spec || typeof spec !== 'object') return spec;
    const list = spec.params && Array.isArray(spec.params.list) ? spec.params.list : null;
    if (spec.type !== 'combo' || !list) {
      return spec.type === 'credits' ? { type: 'none', params: {} } : spec;
    }
    const kept = list.filter((part) => part && part.type !== 'credits');
    if (kept.length === list.length) return spec;
    if (!kept.length) return { type: 'none', params: {} };
    return { ...spec, params: { ...spec.params, list: kept } };
  }

  function settingsFor(project) {
    const settings = (project && project.fillers) || {};
    return {
      ...DEFAULTS,
      ...settings,
      byKind: { ...DEFAULTS.byKind, ...(settings.byKind || {}) },
      longGap: { ...DEFAULTS.longGap, ...(settings.longGap || {}) },
      clips: settings.clips || {},
      // the informed tempo is the project's, never a value the fillers stored
      bpm: bpmOf(project),
    };
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
    const bpm = Number(settings.bpm) > 0 ? Number(settings.bpm) : 0;
    let cursor = 0;
    for (let i = 0; i <= sorted.length; i += 1) {
      const next = sorted[i] || null;
      const to = next ? next.start : total;
      const rawFrom = cursor;
      if (to - rawFrom > 0) {
        const from = i === 0 ? rawFrom : rawFrom + margin;
        const end = next ? to - margin : to;
        if (end - from >= minGap) {
          const kind = i === 0 ? 'intro' : next ? 'interlude' : 'outro';
          const long = end - from > (settings.longGap.threshold || 8);
          const key = `${sorted[i - 1] ? sorted[i - 1].id : 'start'}>${next ? next.id : 'end'}`;
          const pinned = (settings.clips || {})[key] || null;
          const spec = pinned || (long && settings.longGap.spec ? settings.longGap.spec : settings.byKind[kind]) || { type: 'none', params: {} };
          // An informed tempo divides the gap bar by bar, so the filler track
          // carries one clip per bar instead of one clip for the whole gap.
          const spans = bpm > 0 ? beatSegments(from, end, bpm) : [[from, end]];
          spans.forEach((span, part) => {
            result.push({
              key,
              clipKey: spans.length > 1 ? `${key}#${part}` : key,
              kind,
              from: span[0],
              to: span[1],
              prevCueId: sorted[i - 1] ? sorted[i - 1].id : null,
              nextCueId: next ? next.id : null,
              long,
              pinned: !!pinned,
              part,
              parts: spans.length,
              // the song name belongs to the first beat of the gap only, so the
              // later bars keep moving without repeating the title
              spec: part === 0 ? spec : withoutCredits(spec),
            });
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

  return { DEFAULTS, BEATS_PER_BAR, MIN_SEGMENT, settingsFor, bpmOf, beatSegments, withoutCredits, gaps, clips };
});
