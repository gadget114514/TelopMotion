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
  let transaction = null;
  let savedId = null;
  let nextEntryId = 1;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function restructureProject(project) {
    if (typeof SA !== 'undefined' && SA.textflow && project && project.script) {
      SA.textflow.apply(project);
    }
  }

  // Re-flows one cue's beats (used both by restructureCue and by style edits
  // that change the fill sizing of a cue-wide style).
  function restructureOneCue(project, cueId, extraSettings, chunk) {
    const target = project.script.cues.find((entry) => entry.id === cueId);
    if (!target || !SA.textflow) return;
    const resolved = SA.textflow.cueOptions(project, target);
    if (extraSettings) resolved.settings = SA.project.mergeDeep(resolved.settings, extraSettings);
    if (chunk) resolved.settings = { ...resolved.settings, chunk };
    const result = SA.textflow.restructure(target, resolved);
    const merged = SA.textflow.mergePinned(project.beats[cueId], result.beats, target);
    project.beats[cueId] = merged.beats;
    if (merged.orphans.length) project.orphanBeats[cueId] = merged.orphans;
    if (result.warnings.length) project.beatWarnings[cueId] = result.warnings;
    else delete project.beatWarnings[cueId];
  }

  // Style edits that change how the text is wrapped must re-flow the beats in
  // fill mode; the fixed mode keeps its old lazy behavior (no re-flow).
  function needsReflow(project, scope, propPath) {
    if (!/^text\./.test(propPath) || (scope && scope.beatId)) return false;
    if (/^text\.(fit|fill[A-Z])/.test(propPath)) return true;
    if (!/^text\.(size|maxWidth|letterSpacing|lineHeight|fontId|direction)$/.test(propPath)) return false;
    const fillAt = (style) => !!(style && style.text && style.text.fit === 'fill');
    if (scope && scope.cueId) return fillAt(SA.project.resolveStyle(project, `cue:${scope.cueId}`));
    return fillAt(project.style) || Object.values(project.cueStyles || {}).some(fillAt);
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

  // Named one-shot events (a lyrics import, a regeneration) for UI modules
  // that must react once without diffing the whole version map.
  const events = new Map();

  function on(name, fn) {
    if (!events.has(name)) events.set(name, new Set());
    events.get(name).add(fn);
    return () => {
      const set = events.get(name);
      if (set) set.delete(fn);
    };
  }

  function fire(name, payload) {
    for (const fn of [...(events.get(name) || [])]) {
      try {
        fn(payload);
      } catch (error) {
        if (typeof console !== 'undefined') console.error(error);
      }
    }
  }

  function load(project) {
    state.project = project;
    state.playhead = 0;
    state.playing = false;
    state.selection = { paths: [], kind: null };
    undoStack.length = 0;
    redoStack.length = 0;
    coalesce = { key: null, time: 0 };
    transaction = null;
    savedId = null;
    bump(['project', 'style', 'script', 'overrides', 'keyframes', 'media', 'fillers', 'credits']);
    emit();
  }

  function selectionSnapshot() {
    return { paths: [...(state.selection.paths || [])], kind: state.selection.kind || null };
  }

  // A restored selection can point at an entity the undo removed (a deleted
  // cue, a split beat, a dropped clip). Keep only the paths that still resolve.
  function pathExists(project, path) {
    const parts = String(path || '').split('/');
    const [kind, ...rest] = (parts[0] || '').split(':');
    const id = rest.join(':');
    if (kind === 'cue') {
      const cue = ((project.script && project.script.cues) || []).find((entry) => entry.id === id);
      if (!cue) return false;
      const beatPart = parts.find((part) => part.startsWith('beat:'));
      if (!beatPart) return true;
      const beatId = beatPart.slice(5);
      if (findBeat(project, id, beatId)) return true;
      if (typeof SA !== 'undefined' && SA.lyricsEngine && SA.lyricsEngine.beatForCue) {
        const synthetic = SA.lyricsEngine.beatForCue(cue);
        return !!synthetic && synthetic.id === beatId;
      }
      return false;
    }
    if (kind === 'clip') return ((project.clips) || []).some((entry) => entry.id === id);
    if (kind === 'layer') return ((project.layers) || []).some((entry) => entry.id === id);
    if (kind === 'track') return ((project.tracks) || []).some((entry) => entry.id === id);
    return true;
  }

  function restoreSelection(selection) {
    const paths = ((selection && selection.paths) || []).filter((path) => pathExists(state.project, path));
    state.selection = { paths, kind: paths.length ? (selection && selection.kind) || null : null };
  }

  function topEntry() {
    return undoStack.length ? undoStack[undoStack.length - 1] : null;
  }

  function topEntryId() {
    const entry = topEntry();
    return entry ? entry.id : null;
  }

  function pushEntry(entry) {
    entry.id = nextEntryId;
    nextEntryId += 1;
    undoStack.push(entry);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
  }

  function dispatch(command) {
    if (!state.project || !command) return;
    const areas = command.areas || ['project'];
    if (transaction) {
      // inside a drag / scrub the snapshots are taken once at the boundaries;
      // every command still runs and notifies so the preview stays live
      command.do(state.project, state);
      for (const area of areas) if (!transaction.areas.includes(area)) transaction.areas.push(area);
      bump(areas);
      emit();
      return;
    }
    const before = clone(state.project);
    const beforeJson = JSON.stringify(before);
    command.do(state.project, state);
    const after = clone(state.project);
    if (beforeJson === JSON.stringify(after)) return; // no-op edits stay out of the history
    const now = Date.now();
    const selection = selectionSnapshot();
    const mergeable = !!command.coalesceKey && coalesce.key === command.coalesceKey && now - coalesce.time < COALESCE_MS && undoStack.length;
    if (mergeable) {
      const entry = topEntry();
      entry.after = after;
      entry.label = command.label || entry.label;
      entry.areas = [...new Set([...(entry.areas || []), ...areas])];
      entry.selectionAfter = selection;
      // a merged entry is a new edit: a fresh id keeps markClean honest
      entry.id = nextEntryId;
      nextEntryId += 1;
    } else {
      pushEntry({ label: command.label || 'edit', before, after, areas, selectionBefore: selection, selectionAfter: selection });
    }
    coalesce = { key: command.coalesceKey || null, time: now };
    bump(areas);
    emit();
  }

  // --- transactions (drags) ---------------------------------------------------
  // begin takes the snapshot once, dispatch runs without snapshots inside, and
  // end commits a single history entry if anything actually changed.

  function beginTransaction(label) {
    if (!state.project) return false;
    if (!transaction) {
      transaction = {
        depth: 0,
        label: label || 'edit',
        areas: [],
        before: clone(state.project),
        beforeJson: JSON.stringify(state.project),
        selectionBefore: selectionSnapshot(),
      };
    }
    transaction.depth += 1;
    return true;
  }

  function endTransaction() {
    if (!transaction) return false;
    transaction.depth -= 1;
    if (transaction.depth > 0) return false;
    const active = transaction;
    transaction = null;
    if (active.beforeJson === JSON.stringify(state.project)) return false;
    pushEntry({
      label: active.label,
      before: active.before,
      after: clone(state.project),
      areas: active.areas.length ? active.areas : ['project'],
      selectionBefore: active.selectionBefore,
      selectionAfter: selectionSnapshot(),
    });
    coalesce = { key: null, time: 0 };
    bump(active.areas.length ? active.areas : ['project']);
    emit();
    return true;
  }

  function cancelTransaction() {
    if (!transaction) return false;
    const active = transaction;
    transaction = null;
    state.project = active.before;
    restoreSelection(active.selectionBefore);
    bump(AREAS);
    emit();
    return true;
  }

  function undo() {
    if (transaction || !undoStack.length) return false;
    const entry = undoStack.pop();
    redoStack.push(entry);
    // a new edit right after a history jump must not coalesce into the entry
    // that happens to sit on top (its key is stale) nor keep a stale redo
    coalesce = { key: null, time: 0 };
    state.project = clone(entry.before);
    restoreSelection(entry.selectionBefore);
    bump(AREAS);
    emit();
    return true;
  }

  function redo() {
    if (transaction || !redoStack.length) return false;
    const entry = redoStack.pop();
    undoStack.push(entry);
    // same as undo: an edit after redo is a fresh history step
    coalesce = { key: null, time: 0 };
    state.project = clone(entry.after);
    restoreSelection(entry.selectionAfter);
    bump(AREAS);
    emit();
    return true;
  }

  function canUndo() {
    return undoStack.length > 0;
  }

  function canRedo() {
    return redoStack.length > 0;
  }

  function undoLabel() {
    const entry = topEntry();
    return entry ? entry.label : null;
  }

  function redoLabel() {
    const entry = redoStack.length ? redoStack[redoStack.length - 1] : null;
    return entry ? entry.label : null;
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
    savedId = topEntryId();
  }

  function touch(areas) {
    bump(areas || ['project']);
    emit();
  }

  function isDirty() {
    return topEntryId() !== savedId;
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
    const axes = SA.moods.normalizeAxes(mode.axes || {});
    // the resolved profile (derived + pinned) plus the manual map, so the
    // re-rolls draw inside the same curve the run used
    if (!SA.genParams || typeof SA.genParams.resolve !== 'function') throw new Error('SA.genParams is required by SA.store');
    const params = SA.genParams.resolve({ axes, params: mode.params || {} });
    const pinned = {};
    for (const def of SA.genParams.PARAMS) if (SA.genParams.isPinned(mode, def.key)) pinned[def.key] = params[def.key];
    const rawW = Number(axes.weird) || 0;
    return {
      axes,
      seed: Number(mode.seed) || 1,
      direction: mode.direction || 'horizontal',
      genre: mode.genre || null,
      rawW,
      params,
      pinned,
      curve: rawW > 0 || Object.keys(pinned).length > 0,
      typeWeights: mode.typeWeights || null,
      usePalettes: Array.isArray(mode.usePalettes) ? mode.usePalettes : [],
      sections: mode.sections || null,
    };
  }

  // The section plan a re-roll draws with: the run stored its blocks (with
  // their boost and staging salt) on the styleMode, so a re-rolled cue / beat
  // keeps the profile of the block it belongs to. `SA.direct.restoreSections`
  // rebuilds the entries from the stored boosts, so the boost formula stays in
  // one place.
  function sectionPlanFor(mode) {
    const saved = mode && mode.sections;
    if (!saved) return null;
    if (typeof SA === 'undefined' || !SA.direct || typeof SA.direct.restoreSections !== 'function') return null;
    const axes = (mode && mode.axes) || {};
    return SA.direct.restoreSections(
      {
        axes,
        rawW: typeof SA.moods && typeof SA.moods.weirdOf === 'function' ? SA.moods.weirdOf(axes) : Number(axes.weird) || 0,
        w: typeof SA.moods && typeof SA.moods.textWeirdOf === 'function' ? SA.moods.textWeirdOf(axes) : Number(axes.weird) || 0,
        energy: Number.isFinite(Number(axes.energy)) ? Number(axes.energy) : 0.5,
        // the resolved profile is what the run drew with; `pinned` keeps the
        // manual keys on top of a fresh resolve (the resolved values must not
        // become the new pins)
        params: (mode && mode.params) || null,
        paramsSource: (mode && mode.pinned) || {},
        seed: (mode && mode.seed) || 1,
      },
      saved
    );
  }

  // The raw weird axis the beat colour schemes are resolved with (the same
  // clamp project.resolveStyle applies).
  function beatSchemeWeird() {
    const mode = (state.project && state.project.styleMode) || {};
    const value = Number((mode.axes || {}).weird);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return value > 1 ? 1 : value;
  }

  // --- composition re-rolls -----------------------------------------------------
  // A project directed in composition mode rebuilds one beat's picture through
  // SA.direct.composeBeat. The neighbouring beats' compositions are read back
  // out of their beatStyles so the novelty weights know what not to repeat.

  function composeHistoryBefore(projectDoc, beatId) {
    const history = [];
    if (typeof SA === 'undefined' || !SA.compositions) return history;
    const cues = (projectDoc.script && projectDoc.script.cues) || [];
    for (const cue of cues) {
      const beats = (projectDoc.beats && projectDoc.beats[cue.id]) || [];
      for (const beat of beats) {
        if (beat.id === beatId) return history;
        const container = projectDoc.beatStyles && projectDoc.beatStyles[beat.id];
        const compose = container && container.text && container.text.compose;
        const comp = compose && compose.id ? SA.compositions.get(compose.id) : null;
        if (comp) history.push(comp);
      }
    }
    return history;
  }

  function composeRunContext(projectDoc, mode, seed, history) {
    const output = projectDoc.output || {};
    const frameW = Number(output.width) || 1920;
    const frameH = Number(output.height) || 1080;
    const axes = (mode && mode.axes) || {};
    const rawW = Number(axes.weird) || 0;
    // the cue-level patches varyBeat reads: the faces / repeats the run stored
    // and the theme's accent colours (cueShift is a run-only draw: a re-rolled
    // beat does not inherit the cue's location nudge)
    const palette = (projectDoc.style && projectDoc.style.palette && projectDoc.style.palette.colors) || [];
    const accents = SA.direct && typeof SA.direct.accentsOf === 'function' ? SA.direct.accentsOf(palette) : { accentIdx: [], accentHexes: [] };
    const cueFont = {};
    const cueRepeat = {};
    for (const [cueId, container] of Object.entries(projectDoc.cueStyles || {})) {
      if (container && container.text && container.text.fontId) cueFont[cueId] = container.text.fontId;
      if (container && container.repeat) cueRepeat[cueId] = container.repeat;
    }
    // the section plan the run stored: a re-rolled beat keeps its block's
    // profile (its own params copy is left null on a zero boost, so the run's
    // profile is used)
    const plan = sectionPlanFor(mode);
    return {
      compose: true,
      seed,
      rawW,
      w: typeof SA !== 'undefined' && SA.moods && typeof SA.moods.textWeirdOf === 'function' ? SA.moods.textWeirdOf(axes) : rawW,
      s: typeof SA !== 'undefined' && SA.moods && typeof SA.moods.smartOf === 'function' ? SA.moods.smartOf(axes) : 0,
      portrait: (output.aspect || '16:9') === '9:16',
      frameW,
      frameH,
      screen: Math.min(frameW, frameH),
      energy: Number.isFinite(Number(axes.energy)) ? Number(axes.energy) : 0.5,
      bpm: 120,
      beatFit: SA.direct && typeof SA.direct.beatFitOf === 'function' ? SA.direct.beatFitOf(null) : 0.25,
      analysis: null,
      genre: (mode && mode.genre) || null,
      direction: (mode && mode.direction) || 'horizontal',
      accentIdx: accents.accentIdx,
      accentHexes: accents.accentHexes,
      // the axes the re-roll draws with (composeBeat reads the energy channel,
      // and the section plan lifts its own copy of them)
      axes,
      cueFont,
      cueShift: {},
      cueRepeat,
      themeStyle: projectDoc.style || null,
      composeHistory: history || [],
      composeZones: {},
      paramsSource: (mode && mode.pinned) || {},
      params: (mode && mode.params) || null,
      pinned: (mode && mode.pinned) || {},
      curve: !!(mode && mode.curve),
      typeWeights: (mode && mode.typeWeights) || null,
      usePalettes: (mode && mode.usePalettes) || [],
      sections: plan ? plan.list : null,
      sectionConfig: plan ? { gap: plan.gap, maxCues: plan.maxCues, strength: plan.strength } : null,
      sectionOf: plan ? plan.sectionOf : null,
      cueForeground: {},
      cueBold: {},
    };
  }

  // --- palettes per scope -----------------------------------------------------
  // A palette lives on the project, a cue or a beat. Effects keep literal hex
  // colours, so changing a scope's palette also moves those colours: at the
  // project level every style follows (except cues / beats with a palette of
  // their own); at a cue or beat level the resolved groups are recoloured and
  // the ones that change are written into that scope as its own copy.
  const MANAGED_TRACK_KINDS = ['background', 'backdrop', 'filler', 'figure'];

  function paletteScope(scope) {
    if (!scope || scope === 'project') return { kind: 'project', path: '' };
    if (scope.beatId) return { kind: 'beat', cueId: scope.cueId, beatId: scope.beatId, path: `cue:${scope.cueId}/beat:${scope.beatId}` };
    if (scope.cueId) return { kind: 'cue', cueId: scope.cueId, path: `cue:${scope.cueId}` };
    return null;
  }

  function parentPathOf(target) {
    if (target.kind === 'beat') return `cue:${target.cueId}`;
    return '';
  }

  function paletteColorsAt(projectDoc, path) {
    const style = SA.project.resolveStyle(projectDoc, path);
    return style && style.palette && Array.isArray(style.palette.colors) ? style.palette.colors.slice() : [];
  }

  function scopeStyle(projectDoc, target) {
    if (target.kind === 'project') return projectDoc.style || (projectDoc.style = {});
    const bag = target.kind === 'cue' ? (projectDoc.cueStyles = projectDoc.cueStyles || {}) : (projectDoc.beatStyles = projectDoc.beatStyles || {});
    const id = target.kind === 'cue' ? target.cueId : target.beatId;
    return bag[id] || (bag[id] = {});
  }

  // backdrop / filler clips follow the palette of the lyrics they sit under
  function managedClipsWithin(projectDoc, start, end) {
    const managed = new Set((projectDoc.tracks || []).filter((track) => MANAGED_TRACK_KINDS.includes(track.kind)).map((track) => track.id));
    return (projectDoc.clips || []).filter((clip) => managed.has(clip.trackId) && clip.start >= start - 1e-4 && clip.end <= end + 1e-4);
  }

  function recolorClips(clips, from, to) {
    for (const clip of clips) {
      if (clip.spec) clip.spec = SA.moods.recolor(clip.spec, from, to);
      if (Array.isArray(clip.colors)) clip.colors = SA.moods.recolor(clip.colors, from, to);
    }
  }

  function repaintScope(projectDoc, target, from, to, options) {
    const withClips = !(options && options.clips === false);
    const move = (value) => SA.moods.recolor(value, from, to);
    if (target.kind === 'project') {
      const { palette, ...rest } = projectDoc.style || {};
      projectDoc.style = { ...move(rest), ...(palette ? { palette } : {}) };
      const cuePalette = new Set();
      for (const [cueId, container] of Object.entries(projectDoc.cueStyles || {})) {
        if (container.palette) cuePalette.add(cueId);
        else projectDoc.cueStyles[cueId] = move(container);
      }
      for (const [cueId, beats] of Object.entries(projectDoc.beats || {})) {
        if (cuePalette.has(cueId)) continue;
        for (const beat of beats || []) {
          const container = projectDoc.beatStyles && projectDoc.beatStyles[beat.id];
          if (container && !container.palette) projectDoc.beatStyles[beat.id] = move(container);
        }
      }
      const cues = (projectDoc.script && projectDoc.script.cues) || [];
      const owned = cues.filter((cue) => cuePalette.has(cue.id));
      const clips = managedClipsWithin(projectDoc, -Infinity, Infinity).filter(
        (clip) => !owned.some((cue) => clip.start >= cue.start - 1e-4 && clip.end <= cue.end + 1e-4)
      );
      if (withClips) recolorClips(clips, from, to);
      return;
    }
    const container = scopeStyle(projectDoc, target);
    const resolved = SA.project.resolveStyle(projectDoc, target.path);
    for (const key of Object.keys(resolved)) {
      if (key === 'palette') continue;
      const next = move(resolved[key]);
      if (JSON.stringify(next) !== JSON.stringify(resolved[key])) container[key] = next;
    }
    if (target.kind === 'cue') {
      for (const beat of (projectDoc.beats && projectDoc.beats[target.cueId]) || []) {
        const own = projectDoc.beatStyles && projectDoc.beatStyles[beat.id];
        if (own && !own.palette) projectDoc.beatStyles[beat.id] = move(own);
      }
      const cue = ((projectDoc.script && projectDoc.script.cues) || []).find((entry) => entry.id === target.cueId);
      if (cue && withClips) recolorClips(managedClipsWithin(projectDoc, cue.start, cue.end), from, to);
    }
  }

  function applyPalette(projectDoc, target, palette, options) {
    const from = paletteColorsAt(projectDoc, target.path);
    const to = palette.colors.slice();
    if (from.length) repaintScope(projectDoc, target, from, to, options);
    // the stored palette is a plain manual one: the auto marker and the
    // resolved scheme metadata belong to the generator, not to the project file
    const rest = clone(palette);
    delete rest.auto;
    delete rest.scheme;
    scopeStyle(projectDoc, target).palette = { ...rest, colors: to };
    if (target.kind === 'project') {
      if (SA.moods.enforceReadability) SA.moods.enforceReadability(projectDoc.style, to);
      projectDoc.styleMode = { ...(projectDoc.styleMode || {}), theme: palette.name || palette.id || '' };
    }
  }

  // a new palette inside the project's axes and genre, the furthest of a few
  // candidates from `current` so the change is always visible
  function drawPalette(current, tries) {
    if (!state.project || typeof SA === 'undefined' || !SA.moods) return null;
    const mode = modeAxes();
    const avoid = Array.isArray(current) ? current : [];
    // the profile's use-palettes replace the on-the-fly generation
    const usePalettes = mode.usePalettes || [];
    if (usePalettes.length && SA.direct && typeof SA.direct.pickUsePalette === 'function') {
      const seed = Math.floor(Math.random() * 900000) + 1000;
      const random = SA.rng && typeof SA.rng.rngFor === 'function' ? SA.rng.rngFor(seed, 'use-palette') : Math.random;
      const picked = SA.direct.pickUsePalette(random, usePalettes, [avoid], mode.rawW);
      if (picked) return picked;
    }
    const distance = (colors) => {
      if (!avoid.length) return 0;
      return colors.reduce((sum, hex, index) => {
        const a = SA.color.parse(hex);
        const b = SA.color.parse(avoid[index % avoid.length]);
        return sum + Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
      }, 0);
    };
    // a plain random RGB palette of the current size, the furthest of a few
    // candidates from the current one so the change is always visible
    const size = avoid.length || (SA.paletteRoles && SA.paletteRoles.SIZE) || 5;
    let palette = null;
    let best = -1;
    for (let i = 0; i < (tries || 4); i += 1) {
      const candidate = SA.colors.randomPalette(size);
      const score = distance(candidate.colors);
      if (score > best) {
        best = score;
        palette = candidate;
      }
    }
    return palette;
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
    const prefix = kind === 'subtitle' ? 'sub' : kind === 'backdrop' ? 'mid' : kind === 'filler' ? 'filler' : kind === 'figure' ? 'fig' : kind === 'textAnim' ? 'text' : kind === 'background' ? 'bg' : 'trk';
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
      fire('script-imported', { count: (cues || []).length, name: (options && options.name) || null });
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
          restructureOneCue(project, cueId, opts.settings, opts.chunk);
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
          // with fill sizing the user's line breaks survive: only the size is
          // re-solved for them
          const cueDoc = project.script.cues.find((entry) => entry.id === cueId);
          const resolved = cueDoc && SA.textflow ? SA.textflow.cueOptions(project, cueDoc) : null;
          if (resolved && resolved.style && resolved.style.fit === 'fill') {
            const fit = SA.textflow.fitLinesScale(target.lines, resolved);
            target.fontScale = fit.scale;
            target.fit = 'fill';
            target.bleed = fit.bleed || undefined;
          }
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
    resetTheme() {
      dispatch({
        label: 'reset theme',
        areas: ['style', 'script', 'overrides', 'keyframes', 'fillers'],
        do(project) {
          SA.project.resetLook(project);
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
      const reflow = needsReflow(state.project, scope, propPath);
      dispatch({
        label: `set ${propPath}`,
        areas: reflow ? ['style', 'script'] : ['style'],
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
          if (reflow) {
            if (scope && scope.cueId) restructureOneCue(project, scope.cueId);
            else restructureProject(project);
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
    // fontSet: { exclusive, fonts: [{ id, fontClass }] }; mediaFonts: the
    // user font metadata the set refers to (the bytes live in the library).
    setFontSet(fontSet, mediaFonts) {
      const beforeSet = clone(state.project.fontSet || null);
      const beforeMedia = clone((state.project.media && state.project.media.fonts) || []);
      dispatch({
        label: 'fonts',
        areas: ['fonts', 'style'],
        do(project) {
          project.fontSet = clone(fontSet || null);
          project.media = project.media || {};
          project.media.fonts = clone(mediaFonts || []);
        },
        undo(project) {
          project.fontSet = clone(beforeSet);
          project.media = project.media || {};
          project.media.fonts = clone(beforeMedia);
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
    // The background track's frame base colour: null removes it (transparent).
    setTrackColor(id, color) {
      if (!trackById(id)) return;
      dispatch({
        label: 'background colour',
        areas: ['project'],
        do(projectDoc) {
          const target = (projectDoc.tracks || []).find((track) => track && track.id === id);
          if (!target) return;
          if (color == null) delete target.color;
          else target.color = clone(color);
        },
      });
    },
    // One undo step for every subtitle track (the View menu toggle). The
    // background data (bgShape) is never touched, only the `bgHidden` flag.
    setSubtitleBackgroundsHidden(hidden) {
      const project = state.project;
      if (!project) return;
      const value = !!hidden;
      const tracks = (project.tracks || []).filter((track) => track && track.kind === 'subtitle');
      if (!tracks.length) return;
      dispatch({
        label: value ? 'hide subtitle backgrounds' : 'show subtitle backgrounds',
        areas: ['project'],
        do(projectDoc) {
          for (const track of projectDoc.tracks || []) {
            if (track && track.kind === 'subtitle') track.bgHidden = value;
          }
        },
      });
    },
    addTrack(kind) {
      const project = state.project;
      if (!project) return null;
      const trackKind = kind || 'subtitle';
      const subtitle = (project.tracks || []).filter((track) => track && track.kind === 'subtitle');
      const id = nextTrackId(project, trackKind);
      const labels = { subtitle: '字幕', backdrop: '後景', background: '背景', filler: 'フィラー', foreground: '前景', figure: '図形', textAnim: 'テキスト' };
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
      if (!['subtitle', 'backdrop', 'filler', 'background', 'figure', 'textAnim'].includes(track.kind)) return;
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
          if (target) {
            Object.assign(target, clone(patch));
            delete target.auto; // a hand edit pins the clip: a run will not replace it
          }
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
          delete target.auto;
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
          delete target.auto;
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
          delete target.auto;
          delete second.auto;
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
          delete copy.auto; // the copy is a hand-made clip
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
      // An explicit regeneration always materialises the gaps, even when the
      // document's `enabled` flag is off (that flag only governs the automatic
      // generation inside an auto-direct run).
      const gaps = SA.fillers.gaps(cues, duration, { ...SA.fillers.settingsFor(project), enabled: true });
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
          const change = mode.params.sizeChange;
          const context = SA.moods.contextForCue(projectDoc, target);
          const emphasis = SA.moods.isEmphasis ? SA.moods.isEmphasis(target) : false;
          const generated = SA.moods.generate({ axes: mode.axes, seed, direction: mode.direction, genre: mode.genre, context, emphasis }).style;
          projectDoc.cueStyles[cueId] = SA.project.mergeDeep(projectDoc.cueStyles[cueId] || {}, {
            enter: generated.enter,
            exit: generated.exit,
          });
          const beats = (projectDoc.beats && projectDoc.beats[cueId]) || [];
          if (projectDoc.styleMode && projectDoc.styleMode.compose && SA.direct && typeof SA.direct.composeBeat === 'function' && SA.compositions) {
            const cueIndex = (projectDoc.script.cues || []).indexOf(target);
            const history = composeHistoryBefore(projectDoc, beats.length ? beats[0].id : null);
            beats.forEach((beat, index) => {
              const ctx = composeRunContext(projectDoc, mode, seed + index + 1, history);
              SA.direct.composeBeat(projectDoc, target, beat, index, cueIndex, ctx);
            });
            // the ladder re-picks the sizes; at raw weird 0 it pins the run's
            // base size (matching run / composeBeat), while a weird run with
            // the change pinned to 0 keeps the compositions' own sizes
            if ((change > 0 || !(mode.rawW > 0)) && SA.direct && typeof SA.direct.resizeBeats === 'function' && beats.length) {
              SA.direct.resizeBeats(projectDoc, mode.axes, beats.map((beat) => beat.id), seed, { params: mode.params, curve: mode.curve });
            }
            return;
          }
          if (SA.direct && typeof SA.direct.resizeBeats === 'function') {
            SA.direct.resizeBeats(projectDoc, mode.axes, beats.map((beat) => beat.id), seed, { params: mode.params, curve: mode.curve });
          }
        },
      });
    },
    // Re-roll the selected beat's own grammar (animation / enter / exit / hold
    // / fill / edge / post) inside the project axes. The cue and the other
    // beats are untouched; one undo reverts the whole draw.
    rerollBeat(cueId, beatId) {
      const cue = findCue(cueId);
      if (!cue || typeof SA === 'undefined' || !SA.random || !SA.moods) return;
      const mode = modeAxes();
      dispatch({
        label: 'reroll beat',
        areas: ['style'],
        do(projectDoc) {
          const beats = (projectDoc.beats && projectDoc.beats[cueId]) || [];
          const beat = beats.find((entry) => entry.id === beatId);
          if (!beat) return;
          const path = `cue:${cueId}/beat:${beatId}`;
          const resolved = SA.project.resolveStyle(projectDoc, path);
          const palette = (resolved && resolved.palette && resolved.palette.colors) || (projectDoc.style.palette && projectDoc.style.palette.colors) || [];
          const colors = palette.length ? [palette[2], palette[3], palette[5] || palette[3]].filter(Boolean) : [];
          const seed = Math.floor(Math.random() * 900000) + 1000;
          const result = SA.random.randomize({
            project: projectDoc,
            scope: 'elements',
            paths: [path],
            seed,
            colors,
            overwriteManual: true,
          });
          const bag = projectDoc.beatStyles[beatId] || (projectDoc.beatStyles[beatId] = {});
          for (const patch of result.patches || []) {
            for (const [group, instance] of Object.entries(patch.style || {})) bag[group] = clone(instance);
          }
          // composition mode: the beat also redraws its picture, with the
          // neighbouring beats' compositions as the novelty context
          if (projectDoc.styleMode && projectDoc.styleMode.compose && SA.direct && typeof SA.direct.composeBeat === 'function' && SA.compositions) {
            const redrawSeed = Math.floor(Math.random() * 900000) + 1000;
            const history = composeHistoryBefore(projectDoc, beatId);
            const ctx = composeRunContext(projectDoc, mode, redrawSeed, history);
            const beatIndex = beats.indexOf(beat);
            const cueIndex = (projectDoc.script.cues || []).indexOf(cue);
            SA.direct.composeBeat(projectDoc, cue, beat, beatIndex, cueIndex, ctx);
          }
          // the size ladder re-picks the beat's size inside the song: the
          // neighbours' levels are respected and the other beats stay put.
          // In compose mode a weird run with the change pinned to 0 keeps the
          // composition's own size, while raw weird 0 pins the base size.
          const composeMode = !!(projectDoc.styleMode && projectDoc.styleMode.compose);
          const change = mode.params.sizeChange;
          const ladderActive = !composeMode || change > 0 || !(mode.rawW > 0);
          if (ladderActive && SA.direct && typeof SA.direct.resizeBeats === 'function') {
            SA.direct.resizeBeats(projectDoc, mode.axes, [beatId], Math.floor(Math.random() * 900000) + 1000, { params: mode.params, curve: mode.curve });
          }
        },
      });
    },
    rerollClip(clipId) {
      const clip = findClip(clipId);
      if (!clip || typeof SA === 'undefined' || !SA.moods) return;
      const mode = modeAxes();
      const kind = SA.project.trackKindOf(state.project, clip.trackId);
      dispatch({
        label: 'reroll clip',
        areas: ['project'],
        do(projectDoc) {
          const target = (projectDoc.clips || []).find((entry) => entry.id === clipId);
          if (!target) return;
          const seed = Math.floor(Math.random() * 900000) + 1000;
          // a figure clip re-rolls through the figure generator: same span,
          // fresh motif / sub-beats / moves from the project axes
          if (kind === 'figure' && SA.figures && typeof SA.figures.generate === 'function') {
            const beats = [];
            for (const cue of projectDoc.script.cues || []) {
              for (const beat of (projectDoc.beats && projectDoc.beats[cue.id]) || []) {
                if (beat.end > target.start && beat.start < target.end) beats.push({ start: beat.start, end: beat.end });
              }
            }
            const params = (target.spec && target.spec.params) || {};
            const palette = Array.isArray(target.colors) && target.colors.length ? target.colors : (projectDoc.style.palette && projectDoc.style.palette.colors) || [];
            target.spec = SA.figures.generate({
              span: { start: target.start, end: target.end },
              beats,
              axes: mode.axes,
              seed,
              id: target.id,
              palette,
              density: params.density,
              scale: params.scale,
              x: params.x,
              y: params.y,
              color: params.color,
              cuts: params.cuts,
            });
            return;
          }
          const result = SA.moods.rerollClipSpec(kind, {
            axes: mode.axes,
            seed,
            genre: mode.genre,
            usePresets: kind === 'filler',
            // the neighbouring backdrop clips never repeat their layout / plane
            // motion / clip mode / transition (a clip re-roll has no run ctx)
            avoid: kind === 'backdrop' && SA.direct && typeof SA.direct.avoidForClip === 'function' ? SA.direct.avoidForClip(projectDoc, target) : null,
          });
          if (!result) return;
          if (result.spec) target.spec = result.spec;
          if (result.colors) target.colors = result.colors;
        },
      });
    },
    // a palette for the project, a cue ({ cueId }) or a beat ({ cueId, beatId });
    // the literal colours of that scope move with it
    setPalette(scope, palette, options) {
      const target = paletteScope(scope);
      if (!target || !palette || !Array.isArray(palette.colors) || !palette.colors.length || typeof SA === 'undefined' || !SA.moods) return;
      const opts = options || {};
      dispatch({
        label: opts.label || 'set palette',
        areas: ['style', 'project'],
        coalesceKey: opts.coalesceKey,
        do(projectDoc) {
          applyPalette(projectDoc, target, palette);
        },
      });
    },
    // a batch of candidate palettes for the palette dialog (no dispatch, so it
    // never lands in the undo history)
    paletteCandidates(count) {
      if (!state.project || typeof SA === 'undefined' || !SA.moods) return [];
      const current = paletteColorsAt(state.project, '');
      const total = Math.max(1, Math.min(24, Math.round(Number(count) || 1)));
      const list = [];
      const seen = new Set();
      for (let i = 0; i < total; i += 1) {
        const palette = drawPalette(current, 1);
        if (!palette || seen.has(palette.id)) continue;
        seen.add(palette.id);
        list.push(palette);
      }
      return list;
    },
    // colour-only re-roll: a new palette (or the given one) plus every literal
    // colour of the selected style / clips moved onto it, in one history entry
    rerollColors(options) {
      const opts = options || {};
      if (!state.project || typeof SA === 'undefined' || !SA.moods) return null;
      const kinds = new Set(Array.isArray(opts.kinds) ? opts.kinds : []);
      const clipIds = Array.isArray(opts.clipIds) && opts.clipIds.length ? new Set(opts.clipIds) : null;
      const mode = modeAxes();
      const from = paletteColorsAt(state.project, '');
      const profileClip = (palette) => {
        if (!mode.curve || !mode.params) return { palette };
        const colors = (palette && palette.colors) || [];
        const roles = SA.paletteRoles;
        const textColors = roles && typeof roles.get === 'function'
          ? [roles.get(colors, roles.SLOT.TEXT_FILL), roles.get(colors, roles.SLOT.TEXT_FILL2)].filter(Boolean)
          : [colors[2], colors[3]].filter(Boolean);
        return { palette, planes: mode.params, rawW: mode.rawW, textColors };
      };
      const palette = opts.palette && Array.isArray(opts.palette.colors) && opts.palette.colors.length ? opts.palette : drawPalette(from);
      if (!palette) return null;
      const perClip = opts.perClip !== false && !opts.palette;
      const targets = ((state.project.clips) || []).filter((clip) => {
        if (clipIds && !clipIds.has(clip.id)) return false;
        return kinds.has(SA.project.trackKindOf(state.project, clip.trackId));
      });
      const clipPalettes = new Map(targets.map((clip) => [clip.id, perClip ? drawPalette(from, 1) : palette]));
      dispatch({
        label: 'reroll colors',
        areas: ['style', 'project'],
        do(projectDoc) {
          if (opts.style) applyPalette(projectDoc, { kind: 'project', path: '' }, palette, { clips: false });
          for (const clip of projectDoc.clips || []) {
            if (!clipPalettes.has(clip.id)) continue;
            const kind = SA.project.trackKindOf(projectDoc, clip.trackId);
            const clipPalette = clipPalettes.get(clip.id);
            const result = SA.moods.rerollClipColors(kind, clip, {
              ...profileClip(clipPalette),
              from,
              axes: mode.axes,
              seed: Math.floor(Math.random() * 900000) + 1000,
            });
            if (!result) continue;
            clip.spec = result.spec;
            if (result.colors) clip.colors = result.colors;
          }
        },
      });
      return palette;
    },
    // a new palette inside the project's axes and genre, the furthest of a few
    // candidates from the current one so the change is always visible
    rerollPalette(scope) {
      const target = paletteScope(scope);
      if (!target || !state.project || typeof SA === 'undefined' || !SA.moods) return null;
      const palette = drawPalette(paletteColorsAt(state.project, target.path));
      if (!palette) return null;
      commands.setPalette(scope, palette, { label: 'reroll palette' });
      return palette;
    },
    // back to the parent's palette: the scope's colours move back onto it
    resetPalette(scope) {
      const target = paletteScope(scope);
      if (!target || target.kind === 'project' || !state.project || typeof SA === 'undefined' || !SA.moods) return;
      dispatch({
        label: 'reset palette',
        areas: ['style', 'project'],
        do(projectDoc) {
          const container = scopeStyle(projectDoc, target);
          if (!container.palette) return;
          const from = paletteColorsAt(projectDoc, target.path);
          delete container.palette;
          const to = paletteColorsAt(projectDoc, parentPathOf(target));
          if (from.length && to.length) repaintScope(projectDoc, target, from, to);
        },
      });
    },
    // The beat colour schemes: the same palette in another role order. The
    // command only writes the id; the colours derive at resolve time.
    invertBeatScheme(cueId, beatId) {
      if (!state.project || typeof SA === 'undefined' || !SA.paletteRoles) return null;
      const weird = beatSchemeWeird();
      const roles = SA.paletteRoles;
      const own = state.project.beatStyles && state.project.beatStyles[beatId];
      const current = own && own.colorScheme;
      const next = current === roles.SCHEME_INVERT ? null : roles.SCHEME_INVERT;
      if (next) {
        const parent = paletteColorsAt(state.project, `cue:${cueId}`);
        if (!parent.length || !roles.applyScheme(parent, next, weird)) return null;
      }
      dispatch({
        label: 'invert beat colours',
        areas: ['style'],
        do(projectDoc) {
          const bag = projectDoc.beatStyles[beatId] || (projectDoc.beatStyles[beatId] = {});
          if (next) bag.colorScheme = next;
          else delete bag.colorScheme;
        },
      });
      return next;
    },
    rerollBeatScheme(cueId, beatId) {
      if (!state.project || typeof SA === 'undefined' || !SA.paletteRoles) return null;
      const mode = modeAxes();
      const weird = beatSchemeWeird();
      const roles = SA.paletteRoles;
      const parent = paletteColorsAt(state.project, `cue:${cueId}`);
      if (!parent.length) return null;
      // the profile's calm range mutes the automatic draw; a manual re-roll
      // still needs at least two choices, so it falls back to the full set
      let candidates = roles.schemes(parent, weird, mode.params ? mode.params.schemeRange : undefined);
      if (candidates.length < 2) candidates = roles.schemes(parent, weird);
      if (!candidates.length) return null;
      const own = state.project.beatStyles && state.project.beatStyles[beatId];
      const current = own && own.colorScheme;
      const pool = candidates.filter((entry) => entry.id !== current);
      const list = pool.length ? pool : candidates;
      const pick = list[Math.min(list.length - 1, Math.floor(Math.random() * list.length))];
      if (!pick) return null;
      dispatch({
        label: 'reroll beat colours',
        areas: ['style'],
        do(projectDoc) {
          const bag = projectDoc.beatStyles[beatId] || (projectDoc.beatStyles[beatId] = {});
          bag.colorScheme = pick.id;
        },
      });
      return pick;
    },
    // The beat's colour mode. ON: the classic cue lottery + role schemes (a scheme
    // is drawn now; the cue lottery needs the next auto-direct run). OFF: the
    // theme's palette set (a palette and the invert are drawn now). Always
    // returns the same shape: `{ scheme, index, invert }`, the unused draw
    // fields staying null / 0 / false.
    setBeatColorLegacy(cueId, beatId, on) {
      if (!state.project || typeof SA === 'undefined' || !SA.paletteRoles) return null;
      const roles = SA.paletteRoles;
      const weird = beatSchemeWeird();
      let scheme = null, index = 0, invert = false;
      if (on) {
        const parent = paletteColorsAt(state.project, `cue:${cueId}`);
        const candidates = parent.length ? roles.schemes(parent, weird) : [];
        if (candidates.length) scheme = candidates[Math.floor(Math.random() * candidates.length)].id;
      } else {
        const set = roles.paletteSetOf(state.project.style);
        const axes = state.project.styleMode && state.project.styleMode.axes;
        const count = Math.min(1 + set.extra.length, SA.weird ? SA.weird.paletteCount(axes, set.max) : 1);
        index = count > 1 ? Math.floor(Math.random() * count) : 0;
        invert = weird > 0 && Math.random() < set.invert
          && !!roles.applyScheme(roles.setColors(state.project.style, index) || [], roles.SCHEME_INVERT, weird);
      }
      dispatch({ label: 'beat colour mode', areas: ['style'], do(projectDoc) {
        const bag = projectDoc.beatStyles[beatId] || (projectDoc.beatStyles[beatId] = {});
        if (on) { bag.colorLegacy = true; delete bag.paletteIndex; delete bag.paletteInvert; if (scheme) bag.colorScheme = scheme; else delete bag.colorScheme; }
        else { delete bag.colorLegacy; delete bag.colorScheme; if (index) bag.paletteIndex = index; else delete bag.paletteIndex; if (invert) bag.paletteInvert = true; else delete bag.paletteInvert; }
        if (!Object.keys(bag).length) delete projectDoc.beatStyles[beatId];
      } });
      return { scheme, index, invert };
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
    on,
    fire,
    load,
    dispatch,
    beginTransaction,
    endTransaction,
    cancelTransaction,
    undo,
    redo,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
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
