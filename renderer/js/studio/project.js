(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.project = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FORMAT = 'telopmotion';
  const VERSION = 2;
  const DEFAULT_TRACKS = [
    { id: 'fg', kind: 'foreground', name: '前景' },
    { id: 'sub1', kind: 'subtitle', name: '字幕1' },
    { id: 'mid', kind: 'backdrop', name: '後景' },
    { id: 'filler', kind: 'filler', name: 'フィラー' },
    { id: 'bg', kind: 'background', name: '背景' },
  ];
  const BACKDROP_FILLER_TYPES = new Set(['shapes', 'pattern', 'particles', 'spectrum', 'waveform', 'sineWave', 'progress']);

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
      tracks: DEFAULT_TRACKS.map((track) => ({ ...track })),
      clips: [],
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

  function trackKindOf(project, trackId) {
    const track = ((project && project.tracks) || []).find((entry) => entry && entry.id === trackId);
    if (track) return track.kind;
    return trackId && /^sub/.test(trackId) ? 'subtitle' : null;
  }

  function subtitleTracks(project) {
    return ((project && project.tracks) || []).filter((track) => track && track.kind === 'subtitle');
  }

  function nextClipId(project, prefix) {
    const used = new Set(((project && project.clips) || []).map((clip) => clip && clip.id));
    let index = 0;
    let id = `${prefix}_${index}`;
    while (used.has(id)) {
      index += 1;
      id = `${prefix}_${index}`;
    }
    return id;
  }

  function clipOf(project, id) {
    return ((project && project.clips) || []).find((clip) => clip && clip.id === id) || null;
  }

  function clipsForTrack(project, trackId) {
    return ((project && project.clips) || []).filter((clip) => clip && clip.trackId === trackId);
  }

  // Version 1 kept one opaque `style.background` per beat and derived fillers
  // from cue gaps. Version 2 turns both into explicit timeline clips.
  function migrateToV2(project) {
    const cues = (project.script && project.script.cues) || [];
    const beats = project.beats || {};
    const total = cues.reduce((max, cue) => Math.max(max, Number(cue.end) || 0), 0);
    project.tracks = Array.isArray(project.tracks) && project.tracks.length ? project.tracks : DEFAULT_TRACKS.map((track) => ({ ...track }));
    project.clips = Array.isArray(project.clips) ? project.clips : [];
    const style = project.style || {};

    // 1) the old single style.background becomes one clip for the whole song
    const background = style.background;
    if (background && background.type && background.type !== 'none' && total > 0) {
      project.clips.push({
        id: nextClipId(project, 'clip_bg'),
        trackId: 'bg',
        start: 0,
        end: total,
        spec: { type: background.type, params: JSON.parse(JSON.stringify(background.params || {})) },
        opacity: 1,
        fadeIn: 0.3,
        fadeOut: 0.3,
        colors: null,
      });
    }

    // 2) beat-level shapes / pattern backgrounds become backdrop clips, merged
    // while the same treatment keeps running
    const sortedCues = [...cues].sort((a, b) => a.start - b.start);
    let run = null;
    const flushRun = () => {
      if (!run) return;
      project.clips.push({
        id: nextClipId(project, 'clip_mid'),
        trackId: 'mid',
        start: run.start,
        end: run.end,
        spec: run.spec,
        opacity: 1,
        fadeIn: 0.3,
        fadeOut: 0.3,
        colors: null,
      });
      run = null;
    };
    for (const cue of sortedCues) {
      const list = beats[cue.id] && beats[cue.id].length ? beats[cue.id] : cue.beat ? [cue.beat] : [];
      for (const beat of list) {
        const resolved = resolveStyle(project, `cue:${cue.id}/beat:${beat.id}`);
        const instance = resolved && resolved.background;
        if (!instance || !instance.type || instance.type === 'none') {
          flushRun();
          continue;
        }
        const kind = instance.type === 'shapes' ? (instance.params && instance.params.kind) || 'shapes' : instance.type;
        if (!BACKDROP_FILLER_TYPES.has(kind)) {
          flushRun();
          continue;
        }
        const params = JSON.parse(JSON.stringify(instance.params || {}));
        if (run && run.end >= beat.start - 1e-4 && run.spec.type === kind) {
          run.end = Math.max(run.end, beat.end);
        } else {
          flushRun();
          run = { start: beat.start, end: beat.end, spec: { type: kind, params } };
        }
      }
    }
    flushRun();

    // 3) the gap-derived fillers are materialised once; pinned specs carry over
    const fillerSettings = project.fillers || {};
    if (fillerSettings.enabled !== false && cues.length && total > 0) {
      const byKind = fillerSettings.byKind || {};
      const longGap = fillerSettings.longGap || {};
      const pinned = fillerSettings.clips || {};
      const margin = fillerSettings.margin == null ? 0.25 : fillerSettings.margin;
      const minGap = fillerSettings.minGap == null ? 1.5 : fillerSettings.minGap;
      let cursor = 0;
      for (let i = 0; i <= sortedCues.length; i += 1) {
        const next = sortedCues[i] || null;
        const to = next ? next.start : total;
        const rawFrom = cursor;
        if (to - rawFrom > 0) {
          const from = i === 0 ? rawFrom : rawFrom + margin;
          const end = next ? to - margin : to;
          if (end - from >= minGap) {
            const kind = i === 0 ? 'intro' : next ? 'interlude' : 'outro';
            const key = `${sortedCues[i - 1] ? sortedCues[i - 1].id : 'start'}>${next ? next.id : 'end'}`;
            const pin = pinned[key] || null;
            const long = end - from > (longGap.threshold || 8);
            const spec = pin || (long && longGap.spec ? longGap.spec : byKind[kind]) || { type: 'none', params: {} };
            project.clips.push({
              id: nextClipId(project, 'clip_filler'),
              trackId: 'filler',
              start: from,
              end,
              spec: JSON.parse(JSON.stringify(spec)),
              opacity: 1,
              fadeIn: 0.3,
              fadeOut: 0.3,
              colors: null,
            });
          }
        }
        cursor = next ? next.end : total;
      }
    }

    // 4) overlapping cues move on to extra subtitle tracks, greedy by start
    const tracks = project.tracks.filter((track) => track && track.kind === 'subtitle');
    const ends = new Map();
    for (const cue of sortedCues) {
      let assigned = null;
      for (const track of tracks) {
        const last = ends.get(track.id);
        if (last == null || last <= cue.start + 1e-4) {
          assigned = track.id;
          break;
        }
      }
      if (!assigned) {
        const id = `sub${tracks.length + 1}`;
        const created = { id, kind: 'subtitle', name: `字幕${tracks.length + 1}` };
        // keep subtitle tracks adjacent: insert after the last one
        const lastIndex = project.tracks.reduce((at, track, index) => (track.kind === 'subtitle' ? index : at), -1);
        project.tracks.splice(lastIndex + 1, 0, created);
        tracks.push(created);
        assigned = id;
      }
      cue.trackId = assigned;
      ends.set(assigned, Math.max(ends.get(assigned) == null ? 0 : ends.get(assigned), cue.end));
    }

    // 5) background is a clip now, not a beat style
    delete style.background;
    for (const container of Object.values(project.cueStyles || {})) {
      if (isPlainObject(container)) delete container.background;
    }
    for (const container of Object.values(project.beatStyles || {})) {
      if (isPlainObject(container)) delete container.background;
    }
    return project;
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
    if (version < 2) migrateToV2(merged);
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
    DEFAULT_TRACKS,
    defaults,
    create,
    migrate,
    resolveStyle,
    parsePath,
    mergeDeep,
    setDimensions,
    trackKindOf,
    subtitleTracks,
    clipOf,
    clipsForTrack,
    nextClipId,
  };
});
