(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.project = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FORMAT = 'sunostudio';
  const VERSION = 1;

  const DEFAULT_CATEGORY_COLORS = {
    catalog: { tint: '#4d8dff', tint2: '#6f5bff' },
    plays: { tint: '#5fd44d', tint2: '#22c07a' },
    likes: { tint: '#ff5c8a', tint2: '#ff2d68' },
    tiers: { tint: '#ffc247', tint2: '#ff8a3d' },
    superlatives: { tint: '#b06bff', tint2: '#8a5cff' },
    time: { tint: '#4dc8ff', tint2: '#2f7cf6' },
    diversity: { tint: '#ff5cd0', tint2: '#b44dff' },
    community: { tint: '#7c8cff', tint2: '#5566ff' },
    gem: { tint: '#2ee6c0', tint2: '#0fb8b8' },
  };

  function defaultStyleSet() {
    return {
      text: { fontId: 'NotoSans-Regular', size: 96, weight: 400, letterSpacing: 0, lineHeight: 1.2, align: 'center', maxWidth: 0.9 },
      hold: [],
      edge: [],
      post: [],
    };
  }

  function defaults(overrides) {
    const base = {
      format: FORMAT,
      version: VERSION,
      meta: { title: 'Untitled', createdAt: null, updatedAt: null, lang: 'en' },
      output: {
        aspect: '16:9',
        fps: 30,
        width: 1920,
        height: 1080,
        durationMode: 'cues',
        range: null,
        maxDuration: null,
        overflow: 'compress',
        audioFadeOut: 1.5,
      },
      dataset: null,
      media: { audio: null, images: [], videos: [], fonts: [] },
      palettes: [],
      categoryColors: {},
      cardTheme: {},
      script: { options: {}, cues: [] },
      style: defaultStyleSet(),
      styleMode: { order: 'cycle', seed: 12345, locked: [] },
      cueStyles: {},
      beatKindStyle: {
        page: { enter: { motion: { in: { duration: 0.35, delay: 0, ease: 'easeOutCubic' }, out: { duration: 0.25, delay: 0, ease: 'easeInCubic' } } } },
        recap: { enter: { motion: { in: { duration: 0.45, delay: 0, ease: 'easeOutCubic' }, out: { duration: 0.35, delay: 0, ease: 'easeInCubic' } } }, post: [{ type: 'lightSweep', params: {}, enabled: true }] },
        repeat: { enter: { motion: { in: { duration: 0.3, delay: 0, ease: 'easeOutCubic' }, out: { duration: 0.25, delay: 0, ease: 'easeInCubic' } } } },
        emphasis: { hold: [{ type: 'pulse', params: { amount: 0.06, bpm: 120 }, enabled: true }] },
        single: {},
      },
      beats: {},
      beatStyles: {},
      beatWarnings: {},
      orphanBeats: {},
      orphans: {},
      textFlow: {},
      overrides: {},
      keyframes: {},
      markers: [],
      layers: [],
      fillers: { enabled: true, minGap: 1.5, margin: 0.25, byKind: {}, longGap: { threshold: 8, spec: null }, clips: {} },
      credits: { title: { source: 'song', songId: null, text: '' }, artist: { source: 'profile', text: '', showHandle: true }, extra: { text: '' }, template: '{title}\n{artist}', modes: { element: { enabled: true, at: 'start', time: 0, duration: 4 }, always: { enabled: false }, end: { enabled: true, duration: 5, style: 'endCard', afterLastCue: true } }, styles: {} },
    };
    return mergeDeep(base, overrides || {});
  }

  function create(context) {
    const now = new Date().toISOString();
    const project = defaults({
      meta: { title: 'Untitled', createdAt: now, updatedAt: now, lang: (context && context.lang) || 'en' },
      dataset: (context && context.dataset) || null,
      output: context && context.aspect ? { aspect: context.aspect } : {},
    });
    if (project.output.aspect === '9:16') {
      project.output.width = 1080;
      project.output.height = 1920;
    }
    return project;
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function mergeDeep(base, patch) {
    const result = Array.isArray(base) ? [...base] : { ...base };
    if (!isPlainObject(patch)) return patch === undefined ? result : patch;
    for (const [key, value] of Object.entries(patch)) {
      if (isPlainObject(value) && isPlainObject(result[key])) result[key] = mergeDeep(result[key], value);
      else result[key] = value;
    }
    return result;
  }

  function migrate(input) {
    if (!isPlainObject(input)) {
      return { ok: false, error: 'invalid-project', project: null };
    }
    const project = { ...input };
    if (project.format !== FORMAT) {
      return { ok: false, error: 'invalid-project', project: null };
    }
    const version = Number.isInteger(project.version) ? project.version : 1;
    if (version > VERSION) {
      return { ok: false, error: 'newer-version', project: null };
    }
    const merged = defaults(project);
    merged.version = VERSION;
    merged.format = FORMAT;
    if (!merged.meta.createdAt) merged.meta.createdAt = new Date().toISOString();
    merged.meta.updatedAt = project.meta && project.meta.updatedAt ? project.meta.updatedAt : merged.meta.createdAt;
    return { ok: true, project: merged };
  }

  function parsePath(elementPath) {
    const parts = String(elementPath || '').split('/').filter(Boolean);
    const parsed = { root: parts[0] || '', cueId: null, beatId: null, kind: null, line: null, word: null, letter: null };
    for (const part of parts) {
      const [type, ...rest] = part.split(':');
      const value = rest.join(':');
      if (type === 'cue') {
        parsed.root = 'cue';
        parsed.cueId = value;
      } else if (type === 'beat') {
        parsed.beatId = value;
        const suffix = value.split(':').pop() || '';
        parsed.kind = suffix.replace(/\d+$/, '') || null;
      } else if (type === 'credit' || type === 'layer') {
        parsed.root = type;
      } else if (type === 'line') {
        parsed.line = Number.parseInt(value, 10);
      } else if (type === 'word') {
        parsed.word = Number.parseInt(value, 10);
      } else if (type === 'letter') {
        parsed.letter = Number.parseInt(value, 10);
      }
    }
    return parsed;
  }

  function ancestorsOf(parsed) {
    const cues = [];
    if (parsed.root === 'cue') {
      if (parsed.cueId) cues.push(parsed.cueId);
      if (parsed.kind) cues.push(`kind:${parsed.kind}`);
      if (parsed.beatId) cues.push(parsed.beatId);
    }
    return cues;
  }

  function resolveStyle(project, elementPath) {
    const doc = project || {};
    const parsed = parsePath(elementPath);
    let merged = mergeDeep({}, doc.style || {});
    if (parsed.cueId && doc.cueStyles && doc.cueStyles[parsed.cueId]) {
      merged = mergeDeep(merged, doc.cueStyles[parsed.cueId]);
    }
    if (parsed.kind && doc.beatKindStyle && doc.beatKindStyle[parsed.kind]) {
      merged = mergeDeep(merged, doc.beatKindStyle[parsed.kind]);
    }
    if (parsed.beatId && doc.beatStyles && doc.beatStyles[parsed.beatId]) {
      merged = mergeDeep(merged, doc.beatStyles[parsed.beatId]);
    }
    const overrides = doc.overrides || {};
    const overrideKeys = [];
    if (parsed.cueId) overrideKeys.push(`cue:${parsed.cueId}`);
    if (parsed.beatId) overrideKeys.push(`cue:${parsed.cueId}/beat:${parsed.beatId}`);
    if (parsed.line != null && parsed.beatId) overrideKeys.push(`cue:${parsed.cueId}/beat:${parsed.beatId}/line:${parsed.line}`);
    if (parsed.word != null && parsed.line != null && parsed.beatId) overrideKeys.push(`cue:${parsed.cueId}/beat:${parsed.beatId}/line:${parsed.line}/word:${parsed.word}`);
    if (parsed.letter != null && parsed.word != null && parsed.line != null && parsed.beatId) {
      overrideKeys.push(`cue:${parsed.cueId}/beat:${parsed.beatId}/line:${parsed.line}/word:${parsed.word}/letter:${parsed.letter}`);
    }
    for (const key of overrideKeys) {
      if (overrides[key]) merged = mergeDeep(merged, overrides[key]);
    }
    return merged;
  }

  function setDimensions(project, aspect) {
    const next = aspect === '9:16' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
    project.output = { ...project.output, aspect, ...next };
  }

  return {
    FORMAT,
    VERSION,
    DEFAULT_CATEGORY_COLORS,
    defaults,
    create,
    migrate,
    resolveStyle,
    parsePath,
    mergeDeep,
    setDimensions,
  };
});
