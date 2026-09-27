window.SA = window.SA || {};

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
          project.script.cues.push(clone(cue));
          project.script.cues.sort((a, b) => a.start - b.start);
          restructureProject(project);
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
      const beat = findBeat(state.project, cueId, beatId);
      if (!beat) return;
      const before = clone(beat);
      dispatch({
        label: 'edit beat text',
        areas: ['script'],
        coalesceKey: options && options.coalesceKey,
        do(project) {
          const target = findBeat(project, cueId, beatId);
          if (!target) return;
          target.text = String(text);
          target.lines = String(text).split(/\r?\n/).filter((line) => line.length);
          target.pinned = true;
        },
        undo(project) {
          replaceBeat(project, cueId, beatId, clone(before));
        },
      });
    },
    moveBeatEdge(cueId, beatId, edge, time, options) {
      const cue = findCue(cueId);
      const beat = findBeat(state.project, cueId, beatId);
      if (!cue || !beat) return;
      dispatch({
        label: 'move beat edge',
        areas: ['script'],
        coalesceKey: options && options.coalesceKey,
        do(project) {
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
      const beat = findBeat(state.project, cueId, beatId);
      if (!beat || !!beat.pinned === !!pinned) return;
      dispatch({
        label: 'pin beat',
        areas: ['script'],
        do(project) {
          const target = findBeat(project, cueId, beatId);
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
