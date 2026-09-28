(typeof window !== 'undefined' ? window : globalThis).SA = (typeof window !== 'undefined' ? window : globalThis).SA || {};

SA.store = (() => {
  'use strict';

  const MAX_UNDO = 200;
  const COALESCE_MS = 400;
  const AREAS = ['project', 'style', 'script', 'overrides', 'keyframes', 'media', 'layers', 'fillers', 'credits', 'view'];

  const state = {
    project: null,
    selection: { paths: [], kind: null },
    playhead: 0,
    playing: false,
    view: { zoom: 1, guides: false, snapping: true, autoKey: false, panels: { media: true, inspector: true, timeline: true } },
    version: Object.fromEntries(AREAS.map((area) => [area, 0])),
  };

  const listeners = new Set();
  const undoStack = [];
  const redoStack = [];
  let coalesce = { key: null, time: 0 };
  let dirty = false;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function restructureProject(project) {
    if (typeof SA !== 'undefined' && SA.textflow && project && project.script) {
      SA.textflow.apply(project);
    }
  }

  function beatList(project, cueId) {
    return (project.beats && project.beats[cueId]) || [];
  }

  function findBeat(project, cueId, beatId) {
    return beatList(project, cueId).find((beat) => beat.id === beatId) || null;
  }

  function replaceBeat(project, cueId, beatId, next) {
    const list = beatList(project, cueId);
    const index = list.findIndex((beat) => beat.id === beatId);
    if (index < 0) return;
    if (next) list[index] = next;
    else list.splice(index, 1);
  }

  // Beats shown for a cue with no stored beats are synthetic. Editing one has
  // to materialize it into project.beats first, otherwise the edit is lost.
  function materializeBeat(project, cueId, beatId) {
    const existing = findBeat(project, cueId, beatId);
    if (existing) return existing;
    const cue = (project.script && project.script.cues || []).find((entry) => entry.id === cueId);
    const synthetic = cue && typeof SA !== 'undefined' && SA.lyricsEngine ? SA.lyricsEngine.beatForCue(cue) : null;
    if (!synthetic || synthetic.id !== beatId) return null;
    project.beats = project.beats || {};
    const list = [...beatList(project, cueId), clone(synthetic)];
    list.sort((a, b) => a.start - b.start || a.end - b.end);
    project.beats[cueId] = list;
    return findBeat(project, cueId, beatId);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function segmentWords(text) {
    const source = String(text == null ? '' : text);
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      return [...new Intl.Segmenter('en', { granularity: 'word' }).segment(source)]
        .map((entry) => entry.segment)
        .filter((segment) => !/^\s+$/.test(segment));
    }
    return source.split(/\s+/).filter(Boolean);
  }

  function segmentGraphemes(text) {
    const source = String(text == null ? '' : text);
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      return [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(source)].map((entry) => entry.segment);
    }
    return Array.from(source);
  }

  function parseOverrideKey(key) {
    const parts = String(key || '').split('/');
    const parsed = { kind: parts[0] || '', beatId: null, line: null, word: null, letter: null };
    for (const part of parts) {
      const [type, ...rest] = part.split(':');
      const value = rest.join(':');
      if (type === 'beat') parsed.beatId = value;
      else if (type === 'line') parsed.line = Number.parseInt(value, 10);
      else if (type === 'word') parsed.word = Number.parseInt(value, 10);
      else if (type === 'letter') parsed.letter = Number.parseInt(value, 10);
    }
    return parsed;
  }

  function pruneOrphanEdits(project, cueId) {
    if (!project) return 0;
    const beats = project.beats ? project.beats[cueId] || [] : [];
    const lineSets = new Map();
    for (const beat of beats) {
      const lines = Array.isArray(beat.lines) && beat.lines.length ? beat.lines : String(beat.text || '').split(/\r?\n/);
      lineSets.set(beat.id, lines);
    }
    const orphans = {};
    const checkPath = (key) => {
      const parsed = parseOverrideKey(key);
      if (!parsed.beatId) return true;
      const lines = lineSets.get(parsed.beatId);
      if (!lines) return false;
      if (parsed.line == null) return true;
      if (parsed.line >= lines.length) return false;
      if (parsed.word == null) return true;
      const words = segmentWords(lines[parsed.line]);
      if (parsed.word >= words.length) return false;
      if (parsed.letter == null) return true;
      return parsed.letter < segmentGraphemes(words[parsed.word]).length;
    };
    for (const [key, value] of Object.entries(project.overrides || {})) {
      const prefix = `cue:${cueId}/`;
      if (key !== `cue:${cueId}` && !key.startsWith(prefix)) continue;
      if (checkPath(key)) continue;
      orphans[key] = value;
      delete project.overrides[key];
    }
    for (const [key, value] of Object.entries(project.keyframes || {})) {
      const prefix = `cue:${cueId}/`;
      if (!key.startsWith(prefix)) continue;
      if (checkPath(key)) continue;
      orphans[key] = value;
      delete project.keyframes[key];
    }
    project.orphans = project.orphans || {};
    project.orphans[cueId] = { ...(project.orphans[cueId] || {}), ...orphans };
    return Object.keys(orphans).length;
  }

  function bump(areas) {
    for (const area of areas || ['project']) {
      if (state.version[area] == null) state.version[area] = 0;
      state.version[area] += 1;
    }
  }

  function emit() {
    for (const entry of [...listeners]) {
      try {
        entry.fn(state);
      } catch (error) {
        if (typeof console !== 'undefined') console.error(error);
      }
    }
  }

  function subscribe(selector, fn) {
    const entry = { selector, fn };
    listeners.add(entry);
    fn(state);
    return () => listeners.delete(entry);
  }

  function load(project) {
    state.project = project;
    state.playhead = 0;
    state.playing = false;
    state.selection = { paths: [], kind: null };
    undoStack.length = 0;
    redoStack.length = 0;
    coalesce = { key: null, time: 0 };
    bump(['project', 'style', 'script', 'overrides', 'keyframes', 'media', 'fillers', 'credits']);
    emit();
  }

  function dispatch(command) {
    if (!state.project || !command) return;
    const areas = command.areas || ['project'];
    const before = clone(state.project);
    command.do(state.project, state);
    const after = clone(state.project);
    const now = Date.now();
    const mergeable = !!command.coalesceKey && coalesce.key === command.coalesceKey && now - coalesce.time < COALESCE_MS && undoStack.length;
    if (mergeable) {
      undoStack[undoStack.length - 1].after = after;
      undoStack[undoStack.length - 1].label = command.label || undoStack[undoStack.length - 1].label;
    } else {
      undoStack.push({ label: command.label || 'edit', before, after, areas });
      if (undoStack.length > MAX_UNDO) undoStack.shift();
    }
    redoStack.length = 0;
    coalesce = { key: command.coalesceKey || null, time: now };
    bump(areas);
    dirty = true;
    emit();
  }

  function applySnapshot(snapshot, areas) {
    state.project = clone(snapshot);
    bump(areas || ['project']);
    dirty = true;
    emit();
  }

  function undo() {
    if (!undoStack.length) return false;
    const entry = undoStack.pop();
    redoStack.push(entry);
    applySnapshot(entry.before, entry.areas);
    return true;
  }

  function redo() {
    if (!redoStack.length) return false;
    const entry = redoStack.pop();
    undoStack.push(entry);
    applySnapshot(entry.after, entry.areas);
    return true;
  }

  function canUndo() {
    return undoStack.length > 0;
  }

  function canRedo() {
    return redoStack.length > 0;
  }

  function setSelection(paths, kind) {
    state.selection = { paths: [...(paths || [])], kind: kind || null };
    bump(['view']);
    emit();
  }

  function setPlayhead(seconds) {
    state.playhead = Math.max(0, seconds || 0);
    emit();
  }

  function setPlaying(value) {
    state.playing = !!value;
    emit();
  }

  function setView(patch) {
    state.view = { ...state.view, ...patch };
    bump(['view']);
    emit();
  }

  function setPanels(patch) {
    state.view = { ...state.view, panels: { ...state.view.panels, ...patch } };
    bump(['view']);
    emit();
  }

  function markClean() {
    dirty = false;
  }

  function touch(areas) {
    bump(areas || ['project']);
    emit();
  }

  function isDirty() {
    return dirty;
  }

  function findCue(cueId) {
    const cues = state.project && state.project.script ? state.project.script.cues : [];
    return cues.find((cue) => cue.id === cueId) || null;
  }

  function snapshotCue(cue) {
    return cue ? clone(cue) : null;
  }

  function replaceCue(cueId, next) {
    const project = state.project;
    const cues = project.script.cues;
    const index = cues.findIndex((cue) => cue.id === cueId);
    if (index < 0) return;
    if (next) cues[index] = next;
    else cues.splice(index, 1);
  }

  function deleteNested(object, propPath) {
    const parts = String(propPath).split('.');
    const stack = [];
    let node = object;
    for (let i = 0; i < parts.length - 1; i += 1) {
      node = node[parts[i]];
      if (!node || typeof node !== 'object') return;
      stack.push([node, parts[i]]);
    }
    delete node[parts[parts.length - 1]];
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const [parent, key] = stack[i];
      if (parent[key] && typeof parent[key] === 'object' && !Object.keys(parent[key]).length) delete parent[key];
      else break;
    }
  }

  function findClip(id) {
    return ((state.project && state.project.clips) || []).find((clip) => clip && clip.id === id) || null;
  }

  function trackById(id) {
    return ((state.project && state.project.tracks) || []).find((track) => track && track.id === id) || null;
  }

  function modeAxes() {
    const mode = (state.project && state.project.styleMode) || {};
    if (typeof SA === 'undefined' || !SA.moods) return { axes: mode.axes || {}, direction: mode.direction || 'horizontal', genre: mode.genre || null };
    return { axes: SA.moods.normalizeAxes(mode.axes || {}), direction: mode.direction || 'horizontal', genre: mode.genre || null };
  }

  function clipDurationOf(clip) {
    return Math.max(0.1, (Number(clip.end) || 0) - (Number(clip.start) || 0));
  }

  // Cues on a track may not overlap. Returns the overlapping cue, if any.
  function overlappingCue(project, trackId, cueId, start, end) {
    for (const cue of project.script.cues) {
      if (cue.id === cueId) continue;
      if (!subtitleCue(project, cue, trackId)) continue;
      if (cue.start < end - 1e-4 && cue.end > start + 1e-4) return cue;
    }
    return null;
  }

  function subtitleCue(project, cue, trackId) {
    const id = cue.trackId || 'sub1';
    return id === trackId;
  }

  function nextTrackId(project, kind) {
    const prefix = kind === 'subtitle' ? 'sub' : kind === 'backdrop' ? 'mid' : kind === 'filler' ? 'filler' : kind === 'background' ? 'bg' : 'trk';
    const used = new Set((project.tracks || []).map((track) => track && track.id));
    let index = 1;
    while (used.has(`${prefix}${index}`)) index += 1;
    return `${prefix}${index}`;
  }

  const commands = {
    setProp(path, propPath, value, options) {
      dispatch({
        label: `set ${propPath}`,
        areas: ['overrides'],
        coalesceKey: options && options.coalesceKey,
        do(project) {
          const overrides = project.overrides[path] || (project.overrides[path] = {});
          const parts = String(propPath).split('.');
          let node = overrides;
          for (let i = 0; i < parts.length - 1; i += 1) {
            const key = parts[i];
            node[key] = node[key] && typeof node[key] === 'object' ? node[key] : {};
            node = node[key];
          }
          node[parts[parts.length - 1]] = clone(value);
        },
        undo(project) {
          const overrides = project.overrides[path];
          if (!overrides) return;
          deleteNested(overrides, propPath);
          if (!Object.keys(overrides).length) delete project.overrides[path];
        },
      });
    },
    setOutput(patch) {
      dispatch({
        label: 'output',
        areas: ['project'],
        do(project) {
          project.output = { ...project.output, ...patch };
          if (patch.aspect) SA.project.setDimensions(project, patch.aspect);
          if (!patch.aspect && patch.width) project.output.width = patch.width;
          restructureProject(project);
        },
      });
    },
    setMeta(patch) {
      dispatch({
        label: 'meta',
        areas: ['project'],
        do(project) {
          project.meta = { ...project.meta, ...patch, updatedAt: new Date().toISOString() };
        },
      });
    },
    editCueText(cueId, text, options) {
      const cue = findCue(cueId);
      if (!cue) return;
      const before = snapshotCue(cue);
      const beforeSide = clone({
        overrides: state.project.overrides,
        keyframes: state.project.keyframes,
        orphans: state.project.orphans,
        beats: state.project.beats[cueId],
      });
      dispatch({
        label: 'edit text',
        areas: ['script'],
        coalesceKey: options && options.coalesceKey,
        do(project) {
          const target = project.script.cues.find((entry) => entry.id === cueId);
          if (!target) return;
          target.text = String(text);
          const orphans = [];
          for (const key of Object.keys(project.overrides)) {
            if (key.startsWith(`cue:${cueId}/`) || key === `cue:${cueId}`) orphans.push(key);
          }
          target.orphanEdits = orphans.length;
          restructureProject(project);
          target.orphanEdits = pruneOrphanEdits(project, cueId) || target.orphanEdits;
        },
        undo(project) {
          replaceCue(cueId, clone(before));
          project.overrides = beforeSide.overrides;
          project.keyframes = beforeSide.keyframes;
          project.orphans = beforeSide.orphans;
          if (project.beats) project.beats[cueId] = beforeSide.beats;
        },
      });
    },
    addCue(cue) {
      dispatch({
        label: 'add cue',
        areas: ['script'],
        do(project) {
          const entry = clone(cue);
          if (!entry.trackId) entry.trackId = 'sub1';
          project.script.cues.push(entry);
          project.script.cues.sort((a, b) => a.start - b.start);
          restructureProject(project);
        },
      });
    },
    addBeat(cueId) {
      const cue = findCue(cueId);
      if (!cue) return;
      const before = clone(beatList(state.project, cueId));
      dispatch({
        label: 'add beat',
        areas: ['script'],
        do(project) {
          project.beats = project.beats || {};
          let list = [...beatList(project, cueId)].sort((a, b) => a.start - b.start || a.end - b.end);
          if (!list.length) {
            const synthetic = SA.lyricsEngine ? SA.lyricsEngine.beatForCue(cue) : null;
            if (synthetic) list = [clone(synthetic)];
          }
          const cueLength = Math.max(0.5, cue.end - cue.start);
          const span = Math.max(0.5, Math.min(2, cueLength * 0.25));
          const last = list[list.length - 1];
          if (last && Math.abs(last.end - cue.end) < 1e-4) {
            last.end = Math.max(last.start + 0.2, cue.end - span);
            last.pinned = true;
          }
          const start = list.length ? Math.max(cue.start, list[list.length - 1].end) : cue.start;
          const end = Math.max(start + 0.2, cue.end);
          const kind = 'page';
          const index = list.filter((entry) => entry.kind === kind).length;
          list.push({
            id: `${cueId}:${kind}${index}`,
            cueId,
            kind,
            index,
            start,
            end,
            text: 'New line',
            lines: ['New line'],
            fontScale: 1,
            pinned: true,
          });
          list.sort((a, b) => a.start - b.start || a.end - b.end);
          project.beats[cueId] = list;
        },
        undo(project) {
          project.beats = project.beats || {};
          project.beats[cueId] = clone(before);
        },
      });
    },
    deleteBeat(cueId, beatId) {
      const beat = findBeat(state.project, cueId, beatId);
      if (!beat) return;
      const before = clone(beatList(state.project, cueId));
      dispatch({
        label: 'delete beat',
        areas: ['script'],
        do(project) {
          project.beats = project.beats || {};
          project.beats[cueId] = beatList(project, cueId).filter((entry) => entry.id !== beatId);
        },
        undo(project) {
          project.beats = project.beats || {};
          project.beats[cueId] = clone(before);
        },
      });
    },
    deleteCue(cueId) {
      const cue = findCue(cueId);
      if (!cue) return;
      dispatch({
        label: 'delete cue',
        areas: ['script'],
        do(project) {
          project.script.cues = project.script.cues.filter((entry) => entry.id !== cueId);
          if (project.beats) delete project.beats[cueId];
          restructureProject(project);
        },
        undo(project) {
          project.script.cues.push(clone(cue));
          project.script.cues.sort((a, b) => a.start - b.start);
        },
      });
    },
    moveCue(cueId, start, options) {
      const cue = findCue(cueId);
      if (!cue) return;
      const before = snapshotCue(cue);
      const duration = cue.end - cue.start;
      dispatch({
        label: 'move cue',
        areas: ['script'],
        coalesceKey: options && options.coalesceKey,
        do(project) {
          const target = project.script.cues.find((entry) => entry.id === cueId);
          if (!target) return;
          target.start = Math.max(0, start);
          target.end = target.start + duration;
          restructureProject(project);
        },
        undo(project) {
          replaceCue(cueId, clone(before));
        },
      });
    },
    trimCue(cueId, edge, time, options) {
      const cue = findCue(cueId);
      if (!cue) return;
      const before = snapshotCue(cue);
      dispatch({
        label: 'trim cue',
        areas: ['script'],
        coalesceKey: options && options.coalesceKey,
        do(project) {
          const target = project.script.cues.find((entry) => entry.id === cueId);
          if (!target) return;
          if (edge === 'start') target.start = Math.max(0, Math.min(time, target.end - 0.2));
          else target.end = Math.max(target.start + 0.2, time);
          restructureProject(project);
        },
        undo(project) {
          replaceCue(cueId, clone(before));
        },
      });
    },
    splitCue(cueId, time) {
      const cue = findCue(cueId);
      if (!cue || time <= cue.start || time >= cue.end) return;
      dispatch({
        label: 'split cue',
        areas: ['script'],
        do(project) {
          const target = project.script.cues.find((entry) => entry.id === cueId);
          if (!target) return;
          const second = { ...clone(target), id: `${cueId}_${Math.random().toString(16).slice(2, 6)}`, start: time };
          target.end = time;
          project.script.cues.push(second);
          project.script.cues.sort((a, b) => a.start - b.start);
          restructureProject(project);
        },
        undo(project) {
          project.script.cues = project.script.cues.filter((entry) => !entry.id.startsWith(`${cueId}_`));
          replaceCue(cueId, clone(cue));
          restructureProject(project);
        },
      });
    },
    mergeCues(cueId) {
      const cue = findCue(cueId);
      if (!cue) return;
      const cues = [...state.project.script.cues].sort((a, b) => a.start - b.start);
      const index = cues.findIndex((entry) => entry.id === cueId);
      const next = cues[index + 1];
      if (!next) return;
      dispatch({
        label: 'merge cues',
        areas: ['script'],
        do(project) {
          const target = project.script.cues.find((entry) => entry.id === cueId);
          const follower = project.script.cues.find((entry) => entry.id === next.id);
          if (!target || !follower) return;
          target.end = follower.end;
          target.text = `${target.text} ${follower.text}`.trim();
          project.script.cues = project.script.cues.filter((entry) => entry.id !== next.id);
          restructureProject(project);
        },
        undo(project) {
          replaceCue(cueId, clone(cue));
          project.script.cues.push(clone(next));
          project.script.cues.sort((a, b) => a.start - b.start);
          restructureProject(project);
        },
      });
    },
    importSrt(cues, options) {
      dispatch({
        label: 'import lyrics',
        areas: ['script'],
        do(project) {
          project.script.cues = clone(cues || []);
          project.script.imported = true;
          if (options && options.name) project.script.sourceName = options.name;
          restructureProject(project);
        },
      });
    },
    generateScript(cues, options) {
      dispatch({
        label: 'generate script',
        areas: ['script', 'style'],
        do(project) {
          project.script.cues = clone(cues || []);
          if (options) project.script.options = clone(options);
          restructureProject(project);
        },
      });
    },
    restructureCue(cueId, options) {
      const cue = findCue(cueId);
      if (!cue || !SA.textflow) return;
      const opts = options || {};
      dispatch({
        label: opts.label || 'restructure cue',
        areas: opts.style ? ['script', 'style'] : ['script'],
        do(project) {
          const target = project.script.cues.find((entry) => entry.id === cueId);
          if (!target) return;
          if (opts.chunk) target.textFlow = { ...(target.textFlow || {}), chunk: opts.chunk };
          if (opts.recap != null) {
            target.textFlow = {
              ...(target.textFlow || {}),
              recap: { minPages: 1, ...((target.textFlow && target.textFlow.recap) || {}), mode: opts.recap ? 'end' : 'off' },
            };
          }
          if (opts.style) project.cueStyles[cueId] = SA.project.mergeDeep(project.cueStyles[cueId] || {}, opts.style);
          const resolved = SA.textflow.cueOptions(project, target);
          if (opts.settings) resolved.settings = SA.project.mergeDeep(resolved.settings, opts.settings);
          if (opts.chunk) resolved.settings = { ...resolved.settings, chunk: opts.chunk };
          const result = SA.textflow.restructure(target, resolved);
          const merged = SA.textflow.mergePinned(project.beats[cueId], result.beats, target);
          project.beats[cueId] = merged.beats;
          if (merged.orphans.length) project.orphanBeats[cueId] = merged.orphans;
          if (result.warnings.length) project.beatWarnings[cueId] = result.warnings;
          else delete project.beatWarnings[cueId];
        },
      });
    },
    restructureCueRandom(cueId) {
      const cue = findCue(cueId);
      if (!cue || !SA.textflow || !SA.textflow.chunkThemes) return;
      const themes = SA.textflow.chunkThemes();
      const current = (cue.textFlow && cue.textFlow.chunk) || 'page';
      const choices = themes.filter((theme) => theme.chunk !== current);
      const pool = choices.length ? choices : themes;
      const theme = pool[Math.floor(Math.random() * pool.length)] || themes[0];
      if (!theme) return;
      commands.restructureCue(cueId, { chunk: theme.chunk, style: theme.style, label: 'random split' });
    },
    restructureAll() {
      dispatch({
        label: 'restructure beats',
        areas: ['script'],
        do(project) {
          restructureProject(project);
        },
      });
    },
    editBeatText(cueId, beatId, text, options) {
      const cue = findCue(cueId);
      const existing = findBeat(state.project, cueId, beatId);
      const synthetic = existing || (cue && SA.lyricsEngine ? SA.lyricsEngine.beatForCue(cue) : null);
      if (!synthetic) return;
      const before = clone(synthetic);
      const existedBefore = !!existing;
      dispatch({
        label: 'edit beat text',
        areas: ['script'],
        coalesceKey: options && options.coalesceKey,
        do(project) {
          const target = materializeBeat(project, cueId, beatId);
          if (!target) return;
          target.text = String(text);
          target.lines = String(text).split(/\r?\n/).filter((line) => line.length);
          target.pinned = true;
        },
        undo(project) {
          const list = beatList(project, cueId).filter((entry) => entry.id !== beatId);
          if (existedBefore) list.push(clone(before));
          list.sort((a, b) => a.start - b.start || a.end - b.end);
          project.beats = project.beats || {};
          project.beats[cueId] = list;
        },
      });
    },
    moveBeatEdge(cueId, beatId, edge, time, options) {
      const cue = findCue(cueId);
      const beat = findBeat(state.project, cueId, beatId) || (cue && SA.lyricsEngine ? SA.lyricsEngine.beatForCue(cue) : null);
      if (!cue || !beat) return;
      dispatch({
        label: 'move beat edge',
        areas: ['script'],
        coalesceKey: options && options.coalesceKey,
        do(project) {
          materializeBeat(project, cueId, beatId);
          const list = [...beatList(project, cueId)].sort((a, b) => a.start - b.start);
          const index = list.findIndex((entry) => entry.id === beatId);
          if (index < 0) return;
          const target = list[index];
          if (edge === 'start') {
            const previous = index > 0 ? list[index - 1] : null;
            const adjacent = !!previous && Math.abs(previous.end - target.start) < 1e-3;
            const min = adjacent ? previous.start + 0.2 : cue.start;
            const value = clamp(time, min, target.end - 0.2);
            target.start = value;
            if (adjacent) {
              previous.end = value;
              previous.pinned = true;
            }
          } else {
            const next = index < list.length - 1 ? list[index + 1] : null;
            const adjacent = !!next && Math.abs(next.start - target.end) < 1e-3;
            const max = adjacent ? next.end - 0.2 : cue.end;
            const value = clamp(time, target.start + 0.2, max);
            target.end = value;
            if (adjacent) {
              next.start = value;
              next.pinned = true;
            }
          }
          target.pinned = true;
        },
      });
    },
    splitBeat(cueId, beatId, time) {
      const cue = findCue(cueId);
      const beat = findBeat(state.project, cueId, beatId);
      if (!cue || !beat) return;
      if (time <= beat.start + 0.05 || time >= beat.end - 0.05) return;
      const before = clone(beat);
      dispatch({
        label: 'split beat',
        areas: ['script'],
        do(project) {
          const target = findBeat(project, cueId, beatId);
          if (!target) return;
          const list = beatList(project, cueId);
          const kind = target.kind || 'page';
          const end = target.end;
          const ratio = (time - target.start) / Math.max(0.01, end - target.start);
          const text = target.text || '';
          let cut = Math.round(text.length * ratio);
          for (let distance = 0; distance <= 10 && cut > 0 && cut < text.length; distance += 1) {
            const forward = cut + distance;
            const backward = cut - distance;
            if (forward < text.length && /\s/.test(text[forward])) {
              cut = forward;
              break;
            }
            if (backward > 0 && /\s/.test(text[backward - 1])) {
              cut = backward;
              break;
            }
          }
          cut = clamp(cut, 1, Math.max(1, text.length - 1));
          const leftText = text.slice(0, cut).trim();
          const rightText = text.slice(cut).trim();
          const index = list.filter((entry) => entry.kind === kind).length;
          const created = {
            ...clone(target),
            id: `${cueId}:${kind}${index}`,
            index,
            start: time,
            end,
            text: rightText,
            lines: rightText ? rightText.split(/\s*\n\s*/) : [],
            pinned: true,
          };
          target.text = leftText;
          target.lines = leftText ? leftText.split(/\s*\n\s*/) : [];
          target.end = time;
          target.pinned = true;
          list.push(created);
          list.sort((a, b) => a.start - b.start);
          project.beats[cueId] = list;
        },
        undo(project) {
          const list = beatList(project, cueId).filter((entry) => entry.start !== time || entry.end !== before.end);
          const index = list.findIndex((entry) => entry.id === beatId);
          if (index >= 0) list[index] = clone(before);
          project.beats[cueId] = list;
        },
      });
    },
    mergeBeats(cueId, beatId) {
      const beat = findBeat(state.project, cueId, beatId);
      if (!beat) return;
      const list = [...beatList(state.project, cueId)].sort((a, b) => a.start - b.start);
      const index = list.findIndex((entry) => entry.id === beatId);
      const next = index >= 0 ? list[index + 1] : null;
      if (!next) return;
      const before = clone(beat);
      dispatch({
        label: 'merge beats',
        areas: ['script'],
        do(project) {
          const target = findBeat(project, cueId, beatId);
          if (!target) return;
          const follower = findBeat(project, cueId, next.id);
          if (!follower) return;
          const text = `${target.text || ''} ${follower.text || ''}`.trim();
          target.text = text;
          target.lines = text ? text.split(/\s*\n\s*/) : [];
          target.end = follower.end;
          target.pinned = true;
          replaceBeat(project, cueId, next.id, null);
        },
        undo(project) {
          replaceBeat(project, cueId, beatId, clone(before));
          const restored = beatList(project, cueId);
          restored.push(clone(next));
          restored.sort((a, b) => a.start - b.start);
        },
      });
    },
    setBeatPinned(cueId, beatId, pinned) {
      const cue = findCue(cueId);
      const beat = findBeat(state.project, cueId, beatId) || (cue && SA.lyricsEngine ? SA.lyricsEngine.beatForCue(cue) : null);
      if (!beat || !!beat.pinned === !!pinned) return;
      dispatch({
        label: 'pin beat',
        areas: ['script'],
        do(project) {
          const target = materializeBeat(project, cueId, beatId);
          if (target) target.pinned = !!pinned;
        },
      });
    },
    addKeyframe(path, propPath, key) {
      dispatch({
        label: 'add keyframe',
        areas: ['keyframes'],
        do(project) {
          const tracks = project.keyframes[path] || (project.keyframes[path] = {});
          const track = tracks[propPath] || (tracks[propPath] = []);
          track.push(clone(key));
          track.sort((a, b) => a.t - b.t);
        },
      });
    },
    moveKeyframe(path, propPath, index, time) {
      dispatch({
        label: 'move keyframe',
        areas: ['keyframes'],
        do(project) {
          const track = project.keyframes[path] && project.keyframes[path][propPath];
          if (!track || !track[index]) return;
          track[index].t = time;
          track.sort((a, b) => a.t - b.t);
        },
      });
    },
    deleteKeyframe(path, propPath, index) {
      dispatch({
        label: 'delete keyframe',
        areas: ['keyframes'],
        do(project) {
          const track = project.keyframes[path] && project.keyframes[path][propPath];
          if (!track) return;
          track.splice(index, 1);
          if (!track.length) delete project.keyframes[path][propPath];
        },
      });
    },
    setKeyframeEase(path, propPath, index, ease) {
      dispatch({
        label: 'keyframe ease',
        areas: ['keyframes'],
        do(project) {
          const track = project.keyframes[path] && project.keyframes[path][propPath];
          if (track && track[index]) track[index].ease = ease;
        },
      });
    },
    resetOverrides(path, group) {
      const existing = state.project.overrides[path];
      if (!existing) return;
      dispatch({
        label: 'reset overrides',
        areas: ['overrides'],
        do(project) {
          const target = project.overrides[path];
          if (!target) return;
          if (!group) {
            delete project.overrides[path];
            return;
          }
          if (group.includes('.')) {
            const parts = group.split('.');
            let node = target;
            for (let i = 0; i < parts.length - 1; i += 1) {
              node = node[parts[i]];
              if (!node) return;
            }
            delete node[parts[parts.length - 1]];
          } else {
            delete target[group];
          }
          if (!Object.keys(target).length) delete project.overrides[path];
        },
        undo(project) {
          project.overrides[path] = clone(existing);
        },
      });
    },
    setStyleProp(scope, propPath, value, options) {
      const opts = options || {};
      dispatch({
        label: `set ${propPath}`,
        areas: ['style'],
        coalesceKey: opts.coalesceKey,
        do(project) {
          let container = null;
          if (!scope || scope === 'project') container = project.style;
          else if (scope.beatId) {
            project.beatStyles[scope.beatId] = project.beatStyles[scope.beatId] || {};
            container = project.beatStyles[scope.beatId];
          } else if (scope.cueId) {
            project.cueStyles[scope.cueId] = project.cueStyles[scope.cueId] || {};
            container = project.cueStyles[scope.cueId];
          }
          if (!container) return;
          const parts = String(propPath).split('.');
          let node = container;
          for (let i = 0; i < parts.length - 1; i += 1) {
            const key = parts[i];
            if (value === undefined) {
              if (!node[key]) return;
              node = node[key];
            } else {
              node[key] = node[key] && typeof node[key] === 'object' ? node[key] : {};
              node = node[key];
            }
          }
          const last = parts[parts.length - 1];
          if (value === undefined) {
            delete node[last];
            const empty = (obj) => obj && typeof obj === 'object' && !Object.keys(obj).length;
            if (empty(node) && parts.length > 1) {
              const parentParts = parts.slice(0, -1);
              let parent = container;
              for (let i = 0; i < parentParts.length - 1; i += 1) parent = parent[parentParts[i]];
              if (empty(parent[parentParts[parentParts.length - 1]])) delete parent[parentParts[parentParts.length - 1]];
            }
          } else {
            node[last] = clone(value);
          }
        },
      });
    },
    setKeyframe(path, propPath, t, value, ease, options) {
      const opts = options || {};
      dispatch({
        label: 'set keyframe',
        areas: ['keyframes'],
        coalesceKey: opts.coalesceKey,
        do(project) {
          const tracks = project.keyframes[path] || (project.keyframes[path] = {});
          const track = tracks[propPath] || (tracks[propPath] = []);
          const index = track.findIndex((key) => Math.abs(key.t - t) < 1e-4);
          const entry = { t, value: clone(value), ease: ease || 'linear' };
          if (index >= 0) track[index] = entry;
          else {
            track.push(entry);
            track.sort((a, b) => a.t - b.t);
          }
        },
      });
    },
    deleteKeyframeAt(path, propPath, t) {
      const tracks = state.project.keyframes[path];
      if (!tracks || !tracks[propPath]) return;
      const index = tracks[propPath].findIndex((key) => Math.abs(key.t - t) < 1e-4);
      if (index < 0) return;
      dispatch({
        label: 'delete keyframe',
        areas: ['keyframes'],
        do(project) {
          const track = project.keyframes[path] && project.keyframes[path][propPath];
          if (!track) return;
          track.splice(index, 1);
          if (!track.length) delete project.keyframes[path][propPath];
        },
      });
    },
    discardOrphans(cueId) {
      if (!state.project.orphans || !state.project.orphans[cueId]) return;
      const existing = clone(state.project.orphans[cueId]);
      dispatch({
        label: 'discard orphans',
        areas: ['overrides', 'keyframes'],
        do(project) {
          if (project.orphans) delete project.orphans[cueId];
        },
        undo(project) {
          project.orphans = project.orphans || {};
          project.orphans[cueId] = existing;
        },
      });
    },
    setAutoKey(value) {
      state.view = { ...state.view, autoKey: !!value };
      bump(['view']);
      emit();
    },
    setStyle(scope, patch, options) {
      dispatch({
        label: 'set style',
        areas: ['style'],
        coalesceKey: options && options.coalesceKey,
        do(project) {
          if (scope === 'project') project.style = SA.project.mergeDeep(project.style, patch);
          else if (scope && scope.beatId) {
            project.beatStyles[scope.beatId] = SA.project.mergeDeep(project.beatStyles[scope.beatId] || {}, patch);
          } else if (scope && scope.cueId) {
            project.cueStyles[scope.cueId] = SA.project.mergeDeep(project.cueStyles[scope.cueId] || {}, patch);
          }
        },
      });
    },
    setPalette(palettes) {
      dispatch({
        label: 'palettes',
        areas: ['style'],
        do(project) {
          project.palettes = clone(palettes || []);
        },
      });
    },
    addMedia(entry) {
      const kind = (entry && entry.kind) || 'images';
      dispatch({
        label: 'add media',
        areas: ['media'],
        do(project) {
          if (kind === 'audio') project.media.audio = clone(entry);
          else (project.media[kind] = project.media[kind] || []).push(clone(entry));
        },
      });
    },
    removeMedia(kind, id) {
      const media = state.project.media;
      const snapshot = kind === 'audio' ? clone(media.audio) : clone(media[kind]);
      dispatch({
        label: 'remove media',
        areas: ['media'],
        do(project) {
          if (kind === 'audio') project.media.audio = null;
          else project.media[kind] = (project.media[kind] || []).filter((entry) => entry.id !== id);
        },
        undo(project) {
          if (kind === 'audio') project.media.audio = clone(snapshot);
          else project.media[kind] = clone(snapshot);
        },
      });
    },
    setLayers(layers) {
      const before = clone(state.project.layers || []);
      dispatch({
        label: 'layers',
        areas: ['layers'],
        do(project) {
          project.layers = clone(layers || []);
        },
        undo(project) {
          project.layers = clone(before);
        },
      });
    },
    setLayer(id, patch, options) {
      const list = state.project.layers || [];
      const layer = list.find((entry) => entry.id === id);
      if (!layer) return;
      dispatch({
        label: `layer ${id}`,
        areas: ['layers'],
        coalesceKey: options && options.coalesceKey,
        do(project) {
          const target = (project.layers || []).find((entry) => entry.id === id);
          if (target) Object.assign(target, clone(patch));
        },
      });
    },
    addLayer(layer, index) {
      if (!layer) return;
      dispatch({
        label: 'add layer',
        areas: ['layers'],
        do(project) {
          project.layers = project.layers || [];
          const position = index == null ? project.layers.length : Math.max(0, Math.min(project.layers.length, index));
          project.layers.splice(position, 0, clone(layer));
        },
      });
    },
    removeLayer(id) {
      if (!(state.project.layers || []).some((entry) => entry.id === id)) return;
      dispatch({
        label: 'remove layer',
        areas: ['layers'],
        do(project) {
          project.layers = (project.layers || []).filter((entry) => entry.id !== id);
        },
      });
    },
    setFillers(patch, options) {
      dispatch({
        label: 'fillers',
        areas: ['fillers'],
        coalesceKey: options && options.coalesceKey,
        do(project) {
          project.fillers = SA.project.mergeDeep(project.fillers || {}, patch);
        },
      });
    },
    setFillerClip(key, spec) {
      if (!key) return;
      dispatch({
        label: 'filler clip',
        areas: ['fillers'],
        do(project) {
          project.fillers = project.fillers || {};
          const clips = project.fillers.clips || (project.fillers.clips = {});
          if (spec == null) delete clips[key];
          else clips[key] = { ...clone(spec), pinned: true };
        },
      });
    },
    updateTrack(id, patch, options) {
      if (!trackById(id)) return;
      dispatch({
        label: `track ${id}`,
        areas: ['project'],
        coalesceKey: options && options.coalesceKey,
        do(projectDoc) {
          const target = (projectDoc.tracks || []).find((track) => track.id === id);
          if (target) Object.assign(target, clone(patch));
        },
      });
    },
    addTrack(kind) {
      const project = state.project;
      if (!project) return null;
      const trackKind = kind || 'subtitle';
      const subtitle = (project.tracks || []).filter((track) => track && track.kind === 'subtitle');
      const id = nextTrackId(project, trackKind);
      const labels = { subtitle: '字幕', backdrop: '後景', background: '背景', filler: 'フィラー', foreground: '前景' };
      const lastSubtitle = (project.tracks || []).reduce((at, track, i) => (track.kind === 'subtitle' ? i : at), -1);
      const index = trackKind === 'subtitle' ? lastSubtitle + 1 : (project.tracks || []).length;
      dispatch({
        label: 'add track',
        areas: ['project'],
        do(projectDoc) {
          projectDoc.tracks = projectDoc.tracks || [];
          projectDoc.tracks.splice(Math.min(projectDoc.tracks.length, index), 0, {
            id,
            kind: trackKind,
            name: `${labels[trackKind] || trackKind}${trackKind === 'subtitle' ? subtitle.length + 1 : ''}`,
          });
        },
      });
      return id;
    },
    removeTrack(id) {
      const project = state.project;
      if (!project) return;
      const track = trackById(id);
      if (!track) return;
      const subtitles = (project.tracks || []).filter((entry) => entry && entry.kind === 'subtitle');
      if (track.kind === 'subtitle' && subtitles.length <= 1) return;
      if (!['subtitle', 'backdrop', 'filler', 'background'].includes(track.kind)) return;
      const fallback = track.kind === 'subtitle' ? subtitles.find((entry) => entry.id !== id) : null;
      dispatch({
        label: 'remove track',
        areas: ['project'],
        do(projectDoc) {
          projectDoc.tracks = (projectDoc.tracks || []).filter((entry) => entry.id !== id);
          if (fallback) {
            for (const cue of projectDoc.script.cues) {
              if ((cue.trackId || 'sub1') === id) cue.trackId = fallback.id;
            }
          }
          projectDoc.clips = (projectDoc.clips || []).filter((clip) => clip.trackId !== id);
        },
      });
    },
    moveTrack(id, direction) {
      const project = state.project;
      if (!project) return;
      const tracks = project.tracks || [];
      const index = tracks.findIndex((track) => track.id === id);
      if (index < 0) return;
      const step = direction === 'up' ? -1 : 1;
      const target = index + step;
      if (target < 0 || target >= tracks.length) return;
      if (tracks[index].kind !== tracks[target].kind) return;
      dispatch({
        label: 'move track',
        areas: ['project'],
        do(projectDoc) {
          const list = projectDoc.tracks || [];
          const at = list.findIndex((track) => track.id === id);
          if (at < 0 || at + step < 0 || at + step >= list.length) return;
          [list[at], list[at + step]] = [list[at + step], list[at]];
        },
      });
    },
    setCueTrack(cueId, trackId) {
      const cue = findCue(cueId);
      const track = trackById(trackId);
      if (!cue || !track || track.kind !== 'subtitle') return;
      if ((cue.trackId || 'sub1') === trackId) return;
      if (overlappingCue(state.project, trackId, cueId, cue.start, cue.end)) return;
      dispatch({
        label: 'move cue to track',
        areas: ['script'],
        do(projectDoc) {
          const target = projectDoc.script.cues.find((entry) => entry.id === cueId);
          if (target) target.trackId = trackId;
        },
      });
    },
    addClip(clip, trackId) {
      if (!clip) return null;
      const project = state.project;
      if (!project) return null;
      const id = clip.id || SA.project.nextClipId(project, 'clip');
      const start = Math.max(0, Number(clip.start) || 0);
      const end = Math.max(start + 0.1, Number(clip.end) || start + 1);
      dispatch({
        label: 'add clip',
        areas: ['project'],
        do(projectDoc) {
          projectDoc.clips = projectDoc.clips || [];
          projectDoc.clips.push({
            id,
            trackId: trackId || clip.trackId || 'bg',
            start,
            end,
            spec: clip.spec ? clone(clip.spec) : { type: 'solid', params: {} },
            opacity: clip.opacity == null ? 1 : clip.opacity,
            fadeIn: clip.fadeIn == null ? 0.3 : clip.fadeIn,
            fadeOut: clip.fadeOut == null ? 0.3 : clip.fadeOut,
            colors: clip.colors ? clone(clip.colors) : null,
          });
        },
      });
      return id;
    },
    updateClip(id, patch, options) {
      if (!findClip(id)) return;
      dispatch({
        label: `clip ${id}`,
        areas: ['project'],
        coalesceKey: options && options.coalesceKey,
        do(projectDoc) {
          const target = (projectDoc.clips || []).find((clip) => clip.id === id);
          if (target) Object.assign(target, clone(patch));
        },
      });
    },
    moveClip(id, start, options) {
      const clip = findClip(id);
      if (!clip) return;
      const span = clipDurationOf(clip);
      dispatch({
        label: 'move clip',
        areas: ['project'],
        coalesceKey: options && options.coalesceKey,
        do(projectDoc) {
          const target = (projectDoc.clips || []).find((entry) => entry.id === id);
          if (!target) return;
          target.start = Math.max(0, start);
          target.end = target.start + span;
        },
      });
    },
    trimClip(id, edge, time, options) {
      const clip = findClip(id);
      if (!clip) return;
      dispatch({
        label: 'trim clip',
        areas: ['project'],
        coalesceKey: options && options.coalesceKey,
        do(projectDoc) {
          const target = (projectDoc.clips || []).find((entry) => entry.id === id);
          if (!target) return;
          if (edge === 'start') target.start = Math.max(0, Math.min(time, target.end - 0.1));
          else target.end = Math.max(target.start + 0.1, time);
        },
      });
    },
    splitClip(id, time) {
      const clip = findClip(id);
      if (!clip || time <= clip.start + 1e-4 || time >= clip.end - 1e-4) return;
      const secondId = SA.project.nextClipId(state.project, 'clip');
      dispatch({
        label: 'split clip',
        areas: ['project'],
        do(projectDoc) {
          const target = (projectDoc.clips || []).find((entry) => entry.id === id);
          if (!target) return;
          const second = clone(target);
          second.id = secondId;
          second.start = time;
          projectDoc.clips.push(second);
          target.end = time;
        },
      });
    },
    deleteClip(id) {
      if (!findClip(id)) return;
      dispatch({
        label: 'delete clip',
        areas: ['project'],
        do(projectDoc) {
          projectDoc.clips = (projectDoc.clips || []).filter((clip) => clip.id !== id);
        },
      });
    },
    duplicateClip(id) {
      const clip = findClip(id);
      if (!clip) return null;
      const span = clipDurationOf(clip);
      const start = clip.end;
      const newId = SA.project.nextClipId(state.project, 'clip');
      dispatch({
        label: 'duplicate clip',
        areas: ['project'],
        do(projectDoc) {
          projectDoc.clips = projectDoc.clips || [];
          const copy = clone(clip);
          copy.id = newId;
          copy.start = start;
          copy.end = start + span;
          projectDoc.clips.push(copy);
        },
      });
      return newId;
    },
    regenerateFillers() {
      const project = state.project;
      if (!project || typeof SA === 'undefined' || !SA.fillers) return;
      const cues = (project.script && project.script.cues) || [];
      const duration = cues.reduce((max, cue) => Math.max(max, Number(cue.end) || 0), 0);
      const gaps = SA.fillers.gaps(cues, duration, SA.fillers.settingsFor(project));
      dispatch({
        label: 'regenerate fillers',
        areas: ['project'],
        do(projectDoc) {
          const tracks = projectDoc.tracks || [];
          const filler = tracks.find((track) => track.kind === 'filler');
          if (!filler) return;
          projectDoc.clips = (projectDoc.clips || []).filter((clip) => clip.trackId !== filler.id);
          for (const gap of gaps) {
            projectDoc.clips.push({
              id: SA.project.nextClipId(projectDoc, 'clip_filler'),
              trackId: filler.id,
              start: gap.from,
              end: gap.to,
              spec: clone(gap.spec || { type: 'none', params: {} }),
              opacity: 1,
              fadeIn: 0.3,
              fadeOut: 0.3,
              colors: null,
            });
          }
        },
      });
    },
    rerollCue(cueId) {
      const cue = findCue(cueId);
      if (!cue || typeof SA === 'undefined' || !SA.moods) return;
      const mode = modeAxes();
      dispatch({
        label: 'reroll cue',
        areas: ['style'],
        do(projectDoc) {
          const target = projectDoc.script.cues.find((entry) => entry.id === cueId);
          if (!target) return;
          const seed = Math.floor(Math.random() * 900000) + 1000;
          const context = SA.moods.contextForCue(projectDoc, target);
          const emphasis = SA.moods.isEmphasis ? SA.moods.isEmphasis(target) : false;
          const generated = SA.moods.generate({ axes: mode.axes, seed, direction: mode.direction, genre: mode.genre, context, emphasis }).style;
          projectDoc.cueStyles[cueId] = SA.project.mergeDeep(projectDoc.cueStyles[cueId] || {}, {
            enter: generated.enter,
            exit: generated.exit,
          });
          const baseSize = Number(
            (projectDoc.style && projectDoc.style.text && projectDoc.style.text.size) ||
              (generated.text && generated.text.size) ||
              96
          );
          const beats = (projectDoc.beats && projectDoc.beats[cueId]) || [];
          beats.forEach((beat, index) => {
            const random = SA.rng ? SA.rng.rngFor(seed + index + 1, beat.id, 'beat') : Math.random;
            const size = Math.round(baseSize * (0.9 + random() * 0.25));
            projectDoc.beatStyles[beat.id] = SA.project.mergeDeep(projectDoc.beatStyles[beat.id] || {}, { text: { size } });
          });
        },
      });
    },
    rerollClip(clipId) {
      const clip = findClip(clipId);
      if (!clip || typeof SA === 'undefined' || !SA.moods || !SA.moods.rerollClipSpec) return;
      const mode = modeAxes();
      const kind = SA.project.trackKindOf(state.project, clip.trackId);
      dispatch({
        label: 'reroll clip',
        areas: ['project'],
        do(projectDoc) {
          const target = (projectDoc.clips || []).find((entry) => entry.id === clipId);
          if (!target) return;
          const result = SA.moods.rerollClipSpec(kind, { axes: mode.axes, seed: Math.floor(Math.random() * 900000) + 1000, genre: mode.genre });
          if (!result) return;
          if (result.spec) target.spec = result.spec;
          if (result.colors) target.colors = result.colors;
        },
      });
    },
    setCredits(patch, options) {
      dispatch({
        label: 'credits',
        areas: ['credits'],
        coalesceKey: options && options.coalesceKey,
        do(project) {
          project.credits = SA.project.mergeDeep(project.credits || {}, patch);
        },
      });
    },
  };

  return {
    state,
    subscribe,
    load,
    dispatch,
    undo,
    redo,
    canUndo,
    canRedo,
    setSelection,
    setPlayhead,
    setPlaying,
    setView,
    setPanels,
    markClean,
    isDirty,
    touch,
    findCue,
    commands,
    clone,
  };
})();
