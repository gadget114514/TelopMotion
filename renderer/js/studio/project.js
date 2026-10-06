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
  const VERSION = 6;
  const DEFAULT_TRACKS = [
    { id: 'fg', kind: 'foreground', name: '前景' },
    { id: 'sub1', kind: 'subtitle', name: '字幕1' },
    { id: 'fig', kind: 'figure', name: '図形' },
    { id: 'filler', kind: 'filler', name: 'フィラー' },
    { id: 'mid', kind: 'backdrop', name: '後景' },
    { id: 'bg', kind: 'background', name: '背景' },
  ];
  const BACKDROP_FILLER_TYPES = new Set(['shapes', 'pattern', 'particles', 'spectrum', 'waveform', 'sineWave', 'progress']);

  // The tracks the automatic direction writes into. A document saved before one
  // of them existed simply gains the empty track (the id is stable, so nothing
  // else changes) - without it the run has nowhere to put its clips and the
  // gap is silently left unfilled.
  //
  // `after` is the kind the new track follows, so the row lands in the same
  // place as in DEFAULT_TRACKS: the figure track above the filler row, the
  // filler track above the backdrop.
  const MANAGED_TRACKS = [
    { kind: 'figure', after: 'subtitle', track: { id: 'fig', kind: 'figure', name: '図形' } },
    { kind: 'filler', after: 'figure', track: { id: 'filler', kind: 'filler', name: 'フィラー' } },
  ];

  function ensureManagedTracks(project) {
    const doc = project || {};
    const tracks = Array.isArray(doc.tracks) && doc.tracks.length ? doc.tracks : (doc.tracks = DEFAULT_TRACKS.map((track) => ({ ...track })));
    for (const entry of MANAGED_TRACKS) {
      if (tracks.some((track) => track && track.kind === entry.kind)) continue;
      let at = tracks.reduce((index, track, i) => (track && track.kind === entry.after ? i : index), -1);
      tracks.splice(at + 1, 0, { ...entry.track });
    }
    return tracks;
  }

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
      // The song's own identity and tempo: what the user types in Settings →
      // Song. `title` / `author` name the piece (the credits read them when no
      // profile data is loaded, and the first filler shows them), `titleFontId`
      // / `authorFontId` name the typefaces the title and the author render in
      // ('' = the main typeface), `bpm` is the
      // tempo every beat grid follows (0 = follow the loaded audio instead).
      song: { title: '', author: '', titleFontId: '', authorFontId: '', bpm: 0, length: 0 },
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
    if (ASPECT_SIZES[project.output.aspect]) Object.assign(project.output, ASPECT_SIZES[project.output.aspect]);
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

  // palette-roles is an optional runtime dependency (the project module never
  // requires anything at load time): the browser reads SA.paletteRoles, Node
  // resolves it next to this file. Without it the scheme features are ignored.
  function paletteRolesModule() {
    if (typeof SA !== 'undefined' && SA && SA.paletteRoles) return SA.paletteRoles;
    try {
      if (typeof require === 'function') return require('../lyrics/palette-roles');
    } catch {
      // not available
    }
    return null;
  }

  // text-bg is the split's single source of truth (background vs ornament); it
  // is loaded lazily the same way.
  function textBgModule() {
    if (typeof SA !== 'undefined' && SA && SA.textBg) return SA.textBg;
    try {
      if (typeof require === 'function') return require('../lyrics/effects/text-bg');
    } catch {
      // not available
    }
    return null;
  }

  // The raw weird axis of the project, clamped: it drives the scheme contrast
  // floor. Unset reads as 0 so old projects keep the old resolution exactly.
  function projectWeirdOf(doc) {
    const axes = doc && doc.styleMode && doc.styleMode.axes;
    const value = Number(axes && axes.weird);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return value > 1 ? 1 : value;
  }

  // A cue may carry its own auto-drawn palette. Its inherited literal colours
  // move onto that palette before the cue's own style is merged, so the cue
  // and every beat under it paint in the drawn colours.
  function applyCuePalette(merged, doc, parsed) {
    const cue = parsed.cueId && doc.cueStyles && doc.cueStyles[parsed.cueId];
    const palette = cue && cue.palette;
    if (!palette || palette.auto !== true) return merged;
    if (!merged.palette || !Array.isArray(merged.palette.colors) || !Array.isArray(palette.colors)) return merged;
    const roles = paletteRolesModule();
    if (!roles || typeof roles.recolor !== 'function') return merged;
    const { palette: inherited, ...rest } = merged;
    return { ...roles.recolor(rest, inherited.colors, palette.colors), palette: inherited };
  }

  // A beat may pick another palette of the theme's palette set and/or the
  // inverted role order. The inherited literal colours follow; the resolved
  // palette records where it came from so the stage can follow too.
  function applyBeatPalette(merged, doc, parsed) {
    const own = parsed.beatId && doc.beatStyles && doc.beatStyles[parsed.beatId];
    if (!own || (!own.paletteIndex && !own.paletteInvert)) return merged;
    if (!merged.palette || !Array.isArray(merged.palette.colors)) return merged;
    const roles = paletteRolesModule();
    if (!roles || typeof roles.setColors !== 'function') return merged;
    const from = merged.palette.colors;
    const index = Math.max(0, Math.floor(Number(own.paletteIndex) || 0));
    const entry = index > 0 ? roles.paletteSetOf(doc.style).extra[index - 1] : null;
    let to = index > 0 ? roles.setColors(doc.style, index) || from : from;
    if (own.paletteInvert) to = roles.applyScheme(to, roles.SCHEME_INVERT, projectWeirdOf(doc)) || to;
    if (to === from) return merged;
    const { palette, ...rest } = merged;
    return {
      ...roles.recolor(rest, from, to),
      palette: {
        ...palette,
        ...(entry ? { id: entry.id, name: entry.name } : {}),
        colors: to.slice(),
        set: { index, invert: !!own.paletteInvert, from: from.slice() },
      },
    };
  }

  // A beat may carry a 4-letter colour scheme. The colours themselves are not
  // stored: the scheme permutes the inherited palette and the inherited
  // literal colours follow their roles. The resolved palette carries the
  // scheme id and the pre-scheme colours so the stage can follow it too.
  function applyBeatScheme(merged, doc, parsed) {
    const own = parsed.beatId && doc.beatStyles && doc.beatStyles[parsed.beatId];
    const id = own && own.colorScheme;
    if (!id || !merged.palette || !Array.isArray(merged.palette.colors)) return merged;
    const roles = paletteRolesModule();
    const to = roles && typeof roles.applyScheme === 'function' ? roles.applyScheme(merged.palette.colors, id, projectWeirdOf(doc)) : null;
    if (!to) return merged;
    const { palette, ...rest } = merged;
    return {
      ...roles.recolor(rest, palette.colors, to),
      palette: { ...palette, colors: to, scheme: { id, from: palette.colors.slice() } },
    };
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

  // --- the song block ---------------------------------------------------------
  // `song` is what the user types in Settings → Song (title, author, tempo).
  // It is read from every layer that needs the song's identity or its tempo, so
  // a helper each of them shares keeps the shape in one place.

  // A tempo is written in beats per minute; the range keeps a typo from asking
  // for bars shorter than a frame.
  const MIN_BPM = 20;
  const MAX_BPM = 400;

  // A tempo written by hand, clamped into the usable range. Anything that is
  // not a number is no tempo at all (0 = follow the loaded audio instead).
  function normalizeBpm(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, number)) * 1000) / 1000;
  }

  function songOf(project) {
    const song = (project && project.song) || {};
    return {
      title: String(song.title == null ? '' : song.title),
      author: String(song.author == null ? '' : song.author),
      titleFontId: String(song.titleFontId == null ? '' : song.titleFontId),
      authorFontId: String(song.authorFontId == null ? '' : song.authorFontId),
      bpm: bpmOf(project),
      length: songLengthOf(project),
    };
  }

  // The song length in seconds the user wrote, or 0 to end with the last cue.
  // A length past the last cue is filled with fillers.
  function songLengthOf(project) {
    const value = Number(project && project.song && project.song.length);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function normalizeSongLength(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.round(Math.min(36000, number) * 1000) / 1000 : 0;
  }

  // The informed tempo in BPM, or 0 when the project never chose one (the
  // caller then falls back to the tempo of the loaded audio).
  function bpmOf(project) {
    const value = Number(project && project.song && project.song.bpm);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  // A tempo usable as a grid straight away: the informed BPM, else the caller's
  // fallback (the detected audio tempo), else the 120 BPM the engine assumes.
  function tempoOf(project, fallback) {
    const own = bpmOf(project);
    if (own > 0) return own;
    const value = Number(fallback);
    return Number.isFinite(value) && value > 0 ? value : 120;
  }

  function normalizeSong(project) {
    const doc = project || {};
    const song = isPlainObject(doc.song) ? doc.song : {};
    doc.song = {
      title: song.title == null ? '' : String(song.title),
      author: song.author == null ? '' : String(song.author),
      titleFontId: song.titleFontId == null ? '' : String(song.titleFontId),
      authorFontId: song.authorFontId == null ? '' : String(song.authorFontId),
      bpm: normalizeBpm(song.bpm),
      length: normalizeSongLength(song.length),
    };
    return doc.song;
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
              // system-drawn, so a later automatic run replaces these clips
              // instead of stacking a second set on top of them
              auto: true,
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

  const TRACK_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

  // Version 3 splits the old single `bg*` group into the definition background
  // (a per-letter cell square) and the text ornaments. Every bag is classified
  // by the shape resolved at its own level (so a bag that only patches
  // `bgFill` follows the shape it inherited); a bag that moves to the ornament
  // groups receives a `bgShape: none` marker so the background inherited from
  // an outer level does not show through. Keyframe property paths follow the
  // same decision.
  function migrateToV3(project) {
    const textBg = textBgModule();
    if (!textBg || typeof textBg.splitStyle !== 'function') return project;
    const snapshot = {
      style: JSON.parse(JSON.stringify(project.style || {})),
      cueStyles: JSON.parse(JSON.stringify(project.cueStyles || {})),
      beatKindStyle: JSON.parse(JSON.stringify(project.beatKindStyle || {})),
      beatStyles: JSON.parse(JSON.stringify(project.beatStyles || {})),
      overrides: JSON.parse(JSON.stringify(project.overrides || {})),
      beats: project.beats || {},
    };
    const shapeAt = (path) => {
      try {
        return resolveStyle(snapshot, path).bgShape || null;
      } catch {
        return snapshot.style.bgShape || null;
      }
    };
    const splitBag = (bag, shape, shadow) => {
      if (!isPlainObject(bag)) return bag;
      const result = textBg.splitStyle(bag, { shape, shadow });
      return result.changed ? result.style : bag;
    };
    // the root bag carries nothing to cancel
    project.style = splitBag(project.style || {}, snapshot.style.bgShape, false);
    for (const [cueId, bag] of Object.entries(project.cueStyles || {})) {
      project.cueStyles[cueId] = splitBag(bag, shapeAt(`cue:${cueId}`), true);
    }
    // a beat-kind bag resolves through a beat of that kind when one exists
    const anchorFor = new Map();
    for (const [cueId, beats] of Object.entries(project.beats || {})) {
      for (const beat of beats || []) {
        if (beat && beat.kind && !anchorFor.has(beat.kind)) anchorFor.set(beat.kind, { cueId, beatId: beat.id });
      }
    }
    for (const [kind, bag] of Object.entries(project.beatKindStyle || {})) {
      const anchor = anchorFor.get(kind);
      project.beatKindStyle[kind] = splitBag(bag, anchor ? shapeAt(`cue:${anchor.cueId}/beat:${anchor.beatId}`) : snapshot.style.bgShape, true);
    }
    for (const [beatId, bag] of Object.entries(project.beatStyles || {})) {
      const cueId = String(beatId).split(':')[0];
      project.beatStyles[beatId] = splitBag(bag, shapeAt(`cue:${cueId}/beat:${beatId}`), true);
    }
    for (const [key, bag] of Object.entries(project.overrides || {})) {
      project.overrides[key] = splitBag(bag, shapeAt(key), true);
    }
    const RENAMES = { bgShape: 'ornShape', bgFill: 'ornFill', bgEdge: 'ornEdge', bgMotion: 'ornMotion' };
    for (const [path, props] of Object.entries(project.keyframes || {})) {
      if (!isPlainObject(props)) continue;
      if (textBg.isBackground && textBg.isBackground(shapeAt(path))) continue;
      const next = {};
      for (const [propPath, keys] of Object.entries(props)) {
        const dot = propPath.indexOf('.');
        const head = dot < 0 ? propPath : propPath.slice(0, dot);
        const tail = dot < 0 ? '' : propPath.slice(dot);
        next[RENAMES[head] ? `${RENAMES[head]}${tail}` : propPath] = keys;
      }
      project.keyframes[path] = next;
    }
    return project;
  }

  // Version 4: the auto decoration used to freeze the palette role colours into
  // literal hexes (the outline took the TEXT_BG tone), so re-rolling a palette
  // moved the swatches but the rendered edge stayed dark. Decorations now store
  // live palette references; this rewrites the stored literals that exactly
  // match the role colour resolved for their own scope.
  function migrateToV4(project) {
    const roles = paletteRolesModule();
    if (!roles || typeof roles.get !== 'function' || !roles.SLOT || !Number.isFinite(roles.SIZE)) return project;
    const snapshot = {
      style: JSON.parse(JSON.stringify(project.style || {})),
      cueStyles: JSON.parse(JSON.stringify(project.cueStyles || {})),
      beatKindStyle: JSON.parse(JSON.stringify(project.beatKindStyle || {})),
      beatStyles: JSON.parse(JSON.stringify(project.beatStyles || {})),
      overrides: JSON.parse(JSON.stringify(project.overrides || {})),
      styleMode: project.styleMode,
      beats: project.beats,
    };
    const paletteAt = (path) => {
      try {
        const style = resolveStyle(snapshot, path);
        return style && style.palette && Array.isArray(style.palette.colors) ? style.palette.colors : [];
      } catch {
        return [];
      }
    };
    const roleHexOf = (colors, name) => {
      if (roles.SLOT[name] == null) return null;
      try {
        const hex = roles.get(colors, roles.SLOT[name]);
        return typeof hex === 'string' ? hex.toLowerCase() : null;
      } catch {
        return null;
      }
    };
    const refFor = (colors, name) => ({ kind: 'palette', index: roles.SLOT[name] });
    // [param key, the role the frozen literal matched, the role it becomes]
    const instanceRoles = {
      outline: [['color', 'TEXT_BG', 'TEXT_EDGE']],
      multiLine: [['colorA', 'TEXT_BG', 'TEXT_EDGE'], ['colorB', 'TEXT_FILL2', 'TEXT_FILL2']],
      extrude: [['colorNear', 'TEXT_EDGE', 'TEXT_EDGE']],
    };
    const rewriteInstance = (instance, colors) => {
      if (!isPlainObject(instance) || !isPlainObject(instance.params)) return;
      const targets = instanceRoles[instance.type];
      if (!targets) return;
      for (const [key, matchRole, targetRole] of targets) {
        const expected = roleHexOf(colors, matchRole);
        const value = instance.params[key];
        if (expected && typeof value === 'string' && value.toLowerCase() === expected) {
          instance.params[key] = refFor(colors, targetRole);
        }
      }
    };
    const rewriteBag = (bag, path) => {
      if (!isPlainObject(bag) || !Array.isArray(bag.edge) || !bag.edge.length) return;
      const colors = paletteAt(path);
      if (colors.length < 10) return;
      for (const instance of bag.edge) rewriteInstance(instance, colors);
    };
    rewriteBag(project.style, '');
    for (const [cueId, bag] of Object.entries(project.cueStyles || {})) rewriteBag(bag, `cue:${cueId}`);
    for (const [beatId, bag] of Object.entries(project.beatStyles || {})) {
      const cueId = String(beatId).split(':')[0];
      rewriteBag(bag, `cue:${cueId}/beat:${beatId}`);
    }
    for (const [kind, bag] of Object.entries(project.beatKindStyle || {})) {
      // resolve the kind's palette through the first beat of that kind
      let path = '';
      for (const [cueId, beats] of Object.entries(project.beats || {})) {
        const beat = (beats || []).find((entry) => entry && entry.kind === kind);
        if (beat) {
          path = `cue:${cueId}/beat:${beat.id}`;
          break;
        }
      }
      rewriteBag(bag, path);
    }
    for (const [key, bag] of Object.entries(project.overrides || {})) rewriteBag(bag, key);
    return project;
  }

  // Version 5: the layer order is the track order (upper = front) for every
  // kind, not the fixed kind stack. Old documents are re-sorted inside each
  // video-separated section into the old front-to-back draw order
  // (foreground, subtitle, textAnim, figure, filler, backdrop, background),
  // so the picture does not change; the foreground ends up first and the
  // background last. Video tracks stay where they are and only bound the
  // sections.
  function migrateToV5(project) {
    const tracks = Array.isArray(project.tracks) ? project.tracks : [];
    if (!tracks.length) return project;
    const rank = { foreground: 0, subtitle: 1, textAnim: 2, figure: 3, filler: 4, backdrop: 5, background: 6 };
    const groups = [];
    let current = [];
    for (const track of tracks) {
      if (track && track.kind === 'video') {
        groups.push(current);
        groups.push(track);
        current = [];
      } else {
        current.push(track);
      }
    }
    groups.push(current);
    for (const group of groups) {
      if (!Array.isArray(group)) continue;
      group.sort((a, b) => {
        const ra = a && rank[a.kind] != null ? rank[a.kind] : 99;
        const rb = b && rank[b.kind] != null ? rank[b.kind] : 99;
        return ra - rb;
      });
    }
    const ordered = [];
    for (const group of groups) {
      if (Array.isArray(group)) ordered.push(...group);
      else ordered.push(group);
    }
    const foreground = ordered.filter((track) => track && track.kind === 'foreground');
    const background = ordered.filter((track) => track && track.kind === 'background');
    const middle = ordered.filter((track) => !(track && (track.kind === 'foreground' || track.kind === 'background')));
    project.tracks = [...foreground, ...middle, ...background];
    return project;
  }

  function normalizeTrackColor(value) {
    if (!value) return null;
    if (typeof value === 'string') {
      return TRACK_COLOR_RE.test(value) ? { kind: 'solid', value, alpha: 1 } : null;
    }
    if (isPlainObject(value) && typeof value.value === 'string' && TRACK_COLOR_RE.test(value.value)) {
      const alpha = Number(value.alpha);
      return { kind: 'solid', value: value.value, alpha: Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1 };
    }
    return null;
  }

  // scene3d layers carry their scene parameters in `layer.scene`. Older exports
  // (or hand-edited projects) may miss it, so the migrate pass fills the
  // defaults the renderer expects. Pure, so the tests can pin it.
  function normalizeLayers(project) {
    for (const layer of project.layers || []) {
      if (!layer || layer.type !== 'scene3d') continue;
      const scene = isPlainObject(layer.scene) ? layer.scene : (layer.scene = {});
      if (typeof scene.preset !== 'string') scene.preset = 'starfield';
      const speed = Number(scene.speed);
      scene.speed = Number.isFinite(speed) && speed > 0 ? speed : 1;
      const density = Number(scene.density);
      scene.density = Number.isFinite(density) && density > 0 ? density : 1;
      if (scene.seed != null && !Number.isFinite(Number(scene.seed))) delete scene.seed;
    }
    return project;
  }

  // Version 6: every palette stores the 10 fixed slots. Short palettes are
  // expanded once (the old derived slots are materialised) and old palette
  // indices (0..6) are remapped to slots, so the runtime never derives.
  const V6_LEGACY_INDEX = { 0: 0, 1: 1, 2: 4, 3: 5, 4: 6, 5: 5, 6: 9 };

  function v6ExpandColors(colors) {
    const list = Array.isArray(colors) ? colors.slice() : [];
    if (list.length >= 10) return list.slice(0, 10);
    // one-time materialisation of the old derived slots (bg, bg2, text,
    // accent, stroke, accent2[, spare] -> 10 slots)
    const a = list[0] || '#101018';
    const b = list[1] || a;
    const edge = list[4] || a;
    const accent2 = list[5] || list[3] || b;
    const text = list[2] || '#eef2ff';
    // derive the same way the old runtime did, then store the result
    const shiftHex = (hex, h, s, v) => {
      try {
        const roles = paletteRolesModule();
        if (roles && typeof roles.shift === 'function') return roles.shift(hex, h, s, v);
      } catch { /* fall through */ }
      return hex;
    };
    const luminance = (hex) => {
      try {
        const roles = paletteRolesModule();
        if (roles && typeof roles.luminanceOpposite === 'function') return roles.luminanceOpposite(hex);
      } catch { /* fall through */ }
      return hex;
    };
    const deriveC = shiftHex(a, 24, 0.9, 0.14);
    const deriveD = shiftHex(b, -20, 0.85, -0.08);
    return [
      a,
      b,
      deriveC,
      deriveD,
      text,
      list[3] || '#ff8a3d',
      edge,
      luminance(text),
      accent2,
      shiftHex(accent2, 180, 0.9, 0),
    ];
  }

  function v6RemapRefs(value) {
    const walk = (node) => {
      if (Array.isArray(node)) return node.map(walk);
      if (!node || typeof node !== 'object') return node;
      if (node.kind === 'palette' && node.index != null) {
        const mapped = V6_LEGACY_INDEX[node.index];
        return { ...node, index: mapped == null ? node.index : mapped };
      }
      const out = {};
      for (const [key, entry] of Object.entries(node)) {
        if (key === 'paletteIndex' && entry != null && V6_LEGACY_INDEX[entry] != null) out[key] = V6_LEGACY_INDEX[entry];
        else out[key] = walk(entry);
      }
      return out;
    };
    return walk(value);
  }

  function migrateToV6(project) {
    const fixPalette = (palette) => {
      if (!palette || !Array.isArray(palette.colors) || !palette.colors.length) return;
      palette.colors = v6ExpandColors(palette.colors);
      palette.roles = 2;
    };
    if (project.style && project.style.palette) fixPalette(project.style.palette);
    if (project.style && project.style.paletteSet && Array.isArray(project.style.paletteSet.extra)) {
      for (const entry of project.style.paletteSet.extra) fixPalette(entry);
    }
    for (const bag of Object.values(project.cueStyles || {})) {
      if (bag && bag.palette) fixPalette(bag.palette);
    }
    for (const bag of Object.values(project.beatStyles || {})) {
      if (bag && bag.palette) fixPalette(bag.palette);
    }
    for (const bag of Object.values(project.beatKindStyle || {})) {
      if (bag && bag.palette) fixPalette(bag.palette);
    }
    if (Array.isArray(project.palettes)) {
      for (const entry of project.palettes) fixPalette(entry);
    }
    if (project.styleMode && Array.isArray(project.styleMode.usePalettes)) {
      for (const entry of project.styleMode.usePalettes) fixPalette(entry);
    }
    const remapBag = (bag) => {
      if (!bag || typeof bag !== 'object') return bag;
      return v6RemapRefs(bag);
    };
    if (project.style) project.style = remapBag(project.style);
    for (const [id, bag] of Object.entries(project.cueStyles || {})) project.cueStyles[id] = remapBag(bag);
    for (const [id, bag] of Object.entries(project.beatStyles || {})) project.beatStyles[id] = remapBag(bag);
    for (const [id, bag] of Object.entries(project.beatKindStyle || {})) project.beatKindStyle[id] = remapBag(bag);
    for (const [key, bag] of Object.entries(project.overrides || {})) project.overrides[key] = remapBag(bag);
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
    if (version < 3) migrateToV3(merged);
    if (version < 4) migrateToV4(merged);
    if (version < 5) migrateToV5(merged);
    if (version < 6) migrateToV6(merged);
    ensureManagedTracks(merged);
    normalizeLayers(merged);
    merged.version = VERSION;
    merged.format = FORMAT;
    // subtitle background visibility is a per-track boolean (absent = shown)
    for (const track of merged.tracks || []) {
      if (track && track.kind === 'subtitle' && track.textHidden != null) track.textHidden = !!track.textHidden;
      if (track && track.kind === 'subtitle' && track.bgHidden != null) track.bgHidden = !!track.bgHidden;
      if (track && track.kind === 'subtitle' && track.graphicsHidden != null) track.graphicsHidden = !!track.graphicsHidden;
      // the removed Text Graphics row (`fgHidden`) folds into the Graphics switch
      if (track && track.kind === 'subtitle' && track.fgHidden != null) {
        if (track.graphicsHidden == null) track.graphicsHidden = !!track.fgHidden;
        delete track.fgHidden;
      }
      // the text mask is a per-track boolean (absent = on), on every track kind
      // that may draw behind the lyrics
      if (track && track.textMask != null) track.textMask = !!track.textMask;
      if (track && (track.kind === 'backdrop' || track.kind === 'filler' || track.kind === 'figure')) {
        if (track.figureFgHidden != null) track.figureFgHidden = !!track.figureFgHidden;
        if (track.figureBgHidden != null) track.figureBgHidden = !!track.figureBgHidden;
        if (track.figureFgEnabled != null) track.figureFgEnabled = !!track.figureFgEnabled;
        if (track.figureBgEnabled != null) track.figureBgEnabled = !!track.figureBgEnabled;
        if (track.fgEnabled != null) track.fgEnabled = !!track.fgEnabled;
        if (track.bgEnabled != null) track.bgEnabled = !!track.bgEnabled;
        if (track.figureFg && typeof track.figureFg === 'object' && track.figureFg.enabled != null) {
          track.figureFg.enabled = !!track.figureFg.enabled;
        }
        if (track.figureBg && typeof track.figureBg === 'object' && track.figureBg.enabled != null) {
          track.figureBg.enabled = !!track.figureBg.enabled;
        }
        if (track.fg && typeof track.fg === 'object' && track.fg.enabled != null) {
          track.fg.enabled = !!track.fg.enabled;
        }
        if (track.bg && typeof track.bg === 'object' && track.bg.enabled != null) {
          track.bg.enabled = !!track.bg.enabled;
        }
      }
      // the background track owns the frame base colour; absent / junk = unset
      // (the canvas stays transparent)
      if (track && track.kind === 'background') {
        const color = normalizeTrackColor(track.color);
        if (color) track.color = color;
        else delete track.color;
      }
    }
    if (!merged.meta.createdAt) merged.meta.createdAt = new Date().toISOString();
    merged.meta.updatedAt = project.meta && project.meta.updatedAt ? project.meta.updatedAt : merged.meta.createdAt;
    normalizeSong(merged);
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
    merged = applyCuePalette(merged, doc, parsed);
    if (parsed.cueId && doc.cueStyles && doc.cueStyles[parsed.cueId]) {
      merged = mergeDeep(merged, doc.cueStyles[parsed.cueId]);
    }
    if (parsed.kind && doc.beatKindStyle && doc.beatKindStyle[parsed.kind]) {
      merged = mergeDeep(merged, doc.beatKindStyle[parsed.kind]);
    }
    merged = applyBeatPalette(merged, doc, parsed);
    merged = applyBeatScheme(merged, doc, parsed);
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

  // The plain subtitle: the project style goes back to the bare text (only the
  // chosen font stays), every per-cue / per-beat / per-element look and the
  // cue keyframes are dropped, and whatever was pinned by hand (beats, filler
  // clips) turns automatic again with its size change undone.
  function resetLook(project) {
    if (!project) return project;
    const plain = defaultStyleSet();
    const fontId = project.style && project.style.text && project.style.text.fontId;
    if (fontId) plain.text.fontId = fontId;
    project.style = plain;
    project.cueStyles = {};
    project.beatStyles = {};
    project.overrides = {};
    const kinds = Object.keys(project.beatKindStyle || {});
    project.beatKindStyle = {};
    for (const kind of kinds) project.beatKindStyle[kind] = {};
    for (const key of Object.keys(project.keyframes || {})) {
      if (key.startsWith('cue:')) delete project.keyframes[key];
    }
    for (const list of Object.values(project.beats || {})) {
      for (const beat of list || []) {
        if (!beat) continue;
        beat.pinned = false;
        beat.fontScale = 1;
        delete beat.fit;
        delete beat.bleed;
      }
    }
    if (project.fillers && project.fillers.clips) project.fillers.clips = {};
    return project;
  }

  // the output size of each aspect; every format keeps a 1080 short side, so
  // the text sizes tuned for 1080 read the same in all of them
  const ASPECT_SIZES = {
    '16:9': { width: 1920, height: 1080 },
    '3:2': { width: 1620, height: 1080 },
    '16:10': { width: 1728, height: 1080 },
    '9:16': { width: 1080, height: 1920 },
    '19.5:9': { width: 1080, height: 2340 },
  };

  function setDimensions(project, aspect) {
    const next = ASPECT_SIZES[aspect] || ASPECT_SIZES['16:9'];
    project.output = { ...project.output, aspect, ...next };
  }

  // The clip-beat spans of a figure / backdrop / filler clip, in seconds. A figure clip
  // owns its sub-beats (spec.params.beats); a backdrop or filler clip uses its
  // stored segments, or else is cut at the lyric beats it overlaps (the same rule as
  // figures.subBeats: edges at beat starts, spans under 0.12 s dropped).
  function clipBeatSpans(project, clip) {
    if (!clip) return [];
    const kind = trackKindOf(project, clip.trackId);
    if (kind === 'figure') {
      const beats = clip.spec && clip.spec.params && Array.isArray(clip.spec.params.beats) ? clip.spec.params.beats : [];
      return beats.map((beat, index) => ({ index, start: Number(beat.start), end: Number(beat.end), own: !!(beat.colors || beat.colorLock) }));
    }
    if (kind !== 'backdrop' && kind !== 'filler') return [];
    if (Array.isArray(clip.segments) && clip.segments.length) {
      return clip.segments
        .map((seg, index) => ({ index, start: Math.max(clip.start, seg.start), end: Math.min(clip.end, seg.end), own: !!seg.spec, disabled: !!(seg.disabled || seg.enabled === false) }))
        .filter((seg) => seg.end - seg.start > 1e-3);
    }
    return lyricBeatSpans(project, clip.start, clip.end).map((span, index) => ({ index, ...span, own: false, disabled: false }));
  }

  function lyricBeatSpans(project, start, end) {
    const edges = [];
    for (const cue of (project && project.script && project.script.cues) || []) {
      if (cue.disabled) continue;
      for (const beat of (project.beats && project.beats[cue.id]) || []) {
        if (beat.end > start + 0.05 && beat.start < end - 0.05) edges.push(Math.max(start, beat.start));
      }
    }
    const cuts = [...new Set(edges)].filter((at) => at > start + 0.05 && at < end - 0.05).sort((a, b) => a - b);
    const bounds = [start, ...cuts, end];
    const spans = [];
    for (let i = 0; i < bounds.length - 1; i += 1) {
      if (bounds[i + 1] - bounds[i] < 0.12) continue;
      spans.push({ start: bounds[i], end: bounds[i + 1] });
    }
    return spans.length ? spans : [{ start, end }];
  }

  return {
    FORMAT,
    VERSION,
    DEFAULT_CATEGORY_COLORS,
    DEFAULT_TRACKS,
    MANAGED_TRACKS,
    defaults,
    create,
    migrate,
    ensureManagedTracks,
    normalizeLayers,
    resolveStyle,
    resetLook,
    parsePath,
    mergeDeep,
    setDimensions,
    songOf,
    songLengthOf,
    normalizeSongLength,
    bpmOf,
    tempoOf,
    normalizeBpm,
    normalizeSong,
    trackKindOf,
    subtitleTracks,
    clipOf,
    clipsForTrack,
    nextClipId,
    clipBeatSpans,
    lyricBeatSpans,
  };
});
