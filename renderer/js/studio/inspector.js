window.SA = window.SA || {};

SA.inspector = (() => {
  'use strict';

  // the Studio lists every effect pack: the built-ins, the font size pack and
  // the extended primitives
  const UI_PACKS = { packs: ['font', 'pro'] };

  const MOTION_GROUPS = ['animation', 'layout', 'enter', 'exit', 'location', 'fill', 'hold'];
  const STACK_GROUPS = ['hold', 'edge', 'post', 'bgEdge', 'ornEdge'];
  const GROUP_LABELS = {
    animation: 'studio.inspector.animation',
    layout: 'studio.inspector.layout',
    enter: 'studio.inspector.enter',
    exit: 'studio.inspector.exit',
    hold: 'studio.inspector.hold',
    location: 'studio.inspector.location',
    fill: 'studio.inspector.fill',
    edge: 'studio.inspector.edge',
    post: 'studio.inspector.post',
    background: 'studio.inspector.background',
    color: 'studio.inspector.color',
    bgShape: 'studio.inspector.bgShape',
    bgFill: 'studio.inspector.bgFill',
    bgEdge: 'studio.inspector.bgEdge',
    bgMotion: 'studio.inspector.bgMotion',
    ornShape: 'studio.inspector.ornShape',
    ornFill: 'studio.inspector.ornFill',
    ornEdge: 'studio.inspector.ornEdge',
    ornMotion: 'studio.inspector.ornMotion',
    repeat: 'studio.inspector.repeat',
  };
  const CONTROL_GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post'];

  const el = {};
  let lastSelection = '';

  function t(key, vars) {
    return SA.i18n.t(key, vars);
  }

  function project() {
    return SA.store.state.project;
  }

  function localTimeFor(cueId, beatId) {
    const doc = project();
    if (!doc) return 0;
    const beat = beatId && doc.beats[cueId] ? doc.beats[cueId].find((entry) => entry.id === beatId) : null;
    const cue = doc.script.cues.find((entry) => entry.id === cueId);
    const start = beat ? beat.start : cue ? cue.start : 0;
    return SA.store.state.playhead - start;
  }

  function selectionInfo() {
    const raw = (SA.store.state.selection.paths || [])[0] || '';
    if (!raw) return { kind: 'none', path: '', raw };
    if (raw.startsWith('track:')) return { kind: 'track', trackId: raw.slice('track:'.length), path: raw, raw };
    if (raw.startsWith('clip:')) return { kind: 'clip', clipId: raw.slice('clip:'.length), path: raw, raw };
    if (raw.startsWith('filler:')) return { kind: 'filler', fillerKey: raw.slice('filler:'.length), path: raw, raw };
    if (raw.startsWith('credit:')) return { kind: 'credit', creditMode: raw.slice('credit:'.length), path: raw, raw };
    const parts = raw.split('/');
    const info = { raw, path: raw, kind: 'cue', cueId: null, beatId: null, lineIdx: null, wordIdx: null, letterIdx: null };
    for (const part of parts) {
      const [type, ...rest] = part.split(':');
      const value = rest.join(':');
      if (type === 'cue') info.cueId = value;
      else if (type === 'beat') info.beatId = value;
      else if (type === 'line') info.lineIdx = Number(value);
      else if (type === 'word') info.wordIdx = Number(value);
      else if (type === 'letter') info.letterIdx = Number(value);
    }
    if (info.letterIdx != null) info.kind = 'letter';
    else if (info.wordIdx != null) info.kind = 'word';
    else if (info.lineIdx != null) info.kind = 'line';
    else if (info.beatId) info.kind = 'beat';
    else info.kind = 'cue';
    return info;
  }

  function scopeOf(sel) {
    if (!sel || sel.kind === 'none') return 'project';
    if (sel.kind === 'cue') return { cueId: sel.cueId };
    if (sel.kind === 'beat') return { beatId: sel.beatId, cueId: sel.cueId };
    return null;
  }

  function scopeContainer() {
    const doc = project();
    const sel = selectionInfo();
    if (!doc) return doc ? doc.style : {};
    if (sel.kind === 'cue') return doc.cueStyles[sel.cueId] || {};
    if (sel.kind === 'beat') return doc.beatStyles[sel.beatId] || {};
    return doc.style;
  }

  function resolvedStyle() {
    const doc = project();
    const sel = selectionInfo();
    if (!doc || sel.kind === 'none') return doc ? doc.style : {};
    return SA.project.resolveStyle(doc, sel.path);
  }

  function getProp(object, propPath) {
    let node = object;
    for (const part of String(propPath).split('.')) {
      if (!node || typeof node !== 'object') return undefined;
      node = node[part];
    }
    return node;
  }

  function isSetAtScope(propPath) {
    const sel = selectionInfo();
    if (sel.kind === 'letter' || sel.kind === 'word' || sel.kind === 'line') {
      const overrides = project().overrides[sel.path];
      return overrides ? getProp(overrides, propPath) !== undefined : false;
    }
    return getProp(scopeContainer(), propPath) !== undefined;
  }

  function writeProp(propPath, value, options) {
    const opts = options || {};
    const sel = selectionInfo();
    const coalesceKey = opts.coalesceKey || `${sel.path}|${propPath}`;
    if (sel.kind === 'letter' || sel.kind === 'word' || sel.kind === 'line') {
      SA.store.commands.setProp(sel.path, propPath, value, { coalesceKey });
      return;
    }
    const scope = scopeOf(sel);
    SA.store.commands.setStyleProp(scope, propPath, value, { coalesceKey });
  }

  function readEffective(propPath) {
    const style = resolvedStyle();
    if (getProp(style, propPath) !== undefined) return getProp(style, propPath);
    const sel = selectionInfo();
    const overrides = project().overrides[sel.path];
    return overrides ? getProp(overrides, propPath) : undefined;
  }

  // --- row helpers -------------------------------------------------------------

  const PROP_DEFAULTS = {
    'transform.x': 0,
    'transform.y': 0,
    'transform.rotate': 0,
    'transform.scale': 1,
    'transform.scaleX': 1,
    'transform.scaleY': 1,
    'transform.tiltX': 0,
    'transform.tiltY': 0,
    'transform.opacity': 1,
    'text.size': 96,
  };

  function valueFor(propPath) {
    const direct = readEffective(propPath);
    if (direct !== undefined && direct !== null) return direct;
    if (PROP_DEFAULTS[propPath] !== undefined) return PROP_DEFAULTS[propPath];
    const match = String(propPath).match(/^(\w+)\.params\.([\w.]+)$/);
    if (match) {
      const style = resolvedStyle();
      const instance = style[match[1]] || (SA.fx.defaultsFor ? SA.fx.defaultsFor(match[1]) : null);
      const descriptor = SA.fx.get(match[1], instance && instance.type);
      const param = ((descriptor && descriptor.params) || []).find((entry) => entry.key === match[2]);
      if (param && param.default !== undefined) return param.default;
    }
    return undefined;
  }

  function appendKeyButton(node, propPath, title) {
    const sel = selectionInfo();
    if (!sel.cueId) return;
    const local = localTimeFor(sel.cueId, sel.beatId);
    const track = project().keyframes[sel.path] && project().keyframes[sel.path][propPath];
    const hasKey = Array.isArray(track) && track.some((key) => Math.abs(key.t - local) < 1e-3);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn btn-key${hasKey ? ' is-on' : ''}`;
    button.textContent = hasKey ? '◆' : '◇';
    button.title = hasKey ? t('studio.inspector.removeKey') : t('studio.inspector.addKey');
    button.addEventListener('click', () => {
      if (hasKey) {
        SA.store.commands.deleteKeyframeAt(sel.path, propPath, local);
      } else {
        const value = valueFor(propPath);
        if (value === undefined || value === null || typeof value === 'object') return;
        SA.store.commands.setKeyframe(sel.path, propPath, local, value, 'linear');
      }
    });
    node.appendChild(button);
    if (title) button.title = title;
  }

  function appendReset(node, propPath) {
    if (!isSetAtScope(propPath)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-reset';
    button.textContent = '↺';
    button.title = t('studio.inspector.reset');
    button.addEventListener('click', () => {
      const sel = selectionInfo();
      if (sel.kind === 'letter' || sel.kind === 'word' || sel.kind === 'line') {
        SA.store.commands.resetOverrides(sel.path, propPath);
      } else {
        const scope = scopeOf(sel);
        SA.store.commands.setStyleProp(scope, propPath, undefined);
      }
    });
    node.appendChild(button);
  }

  function row(container, propPath, label, control, options) {
    const opts = options || {};
    const node = document.createElement('div');
    node.className = 'ctrl-row';
    const labelNode = document.createElement('label');
    labelNode.className = 'ctrl-label';
    labelNode.textContent = label;
    node.appendChild(labelNode);
    node.appendChild(control);
    if (!opts.noKey) appendKeyButton(node, propPath);
    if (!opts.noReset) appendReset(node, propPath);
    if (!opts.noReset && isSetAtScope(propPath)) node.classList.add('is-set');
    container.appendChild(node);
    return node;
  }

  function section(container, key, title) {
    const node = document.createElement('details');
    node.className = 'insp-section';
    node.open = true;
    const summary = document.createElement('summary');
    summary.textContent = title;
    node.appendChild(summary);
    const body = document.createElement('div');
    body.className = 'insp-body';
    node.appendChild(body);
    container.appendChild(node);
    return body;
  }

  // --- selection ---------------------------------------------------------------

  function selectAt(rawPath) {
    const parts = String(rawPath || '').split('/');
    let kind = 'cue';
    if (parts.some((part) => part.startsWith('letter:'))) kind = 'letter';
    else if (parts.some((part) => part.startsWith('word:'))) kind = 'word';
    else if (parts.some((part) => part.startsWith('line:'))) kind = 'line';
    else if (parts.some((part) => part.startsWith('beat:'))) kind = 'beat';
    SA.store.setSelection([rawPath], kind);
    if (kind === 'cue') SA.store.setSelection([rawPath], 'cue');
  }

  function cycleLevel(direction) {
    const sel = selectionInfo();
    if (sel.kind === 'none') return;
    if (direction > 0) {
      const doc = project();
      const beats = (doc.beats[sel.cueId] || []).filter((beat) => sel.beatId == null || beat.id === sel.beatId);
      const beat = beats[0] || (doc.beats[sel.cueId] || [])[0];
      if (sel.kind === 'cue' && beat) selectAt(`cue:${sel.cueId}/beat:${beat.id}`);
      else if (sel.kind === 'beat' || sel.kind === 'line') selectAt(`${sel.path}/line:0`.replace('/beat:', '/beat:') + (sel.kind === 'line' ? '' : ''));
      else return;
      // descending further happens through the overlay picks
    } else {
      const parts = sel.path.split('/');
      if (parts.length <= 1) {
        SA.store.setSelection([], null);
        return;
      }
      selectAt(parts.slice(0, -1).join('/'));
    }
  }

  // --- sections ----------------------------------------------------------------

  function renderBreadcrumb(container) {
    const sel = selectionInfo();
    const head = document.createElement('div');
    head.className = 'insp-breadcrumb';
    if (sel.kind === 'none') {
      head.textContent = t('studio.inspector.nothing');
      container.appendChild(head);
      return;
    }
    const doc = project();
    if (sel.raw.startsWith('layer:')) {
      const layerId = sel.raw.slice('layer:'.length);
      const layer = (doc.layers || []).find((entry) => entry.id === layerId);
      const line = document.createElement('div');
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'btn btn-mini is-active';
      chip.textContent = `${t('layers.title')} · ${layer && layer.slot === 'foreground' ? t('layers.slotForeground') : t('layers.slotBackground')}`;
      line.appendChild(chip);
      head.appendChild(line);
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn btn-mini';
      edit.textContent = t('layers.edit');
      edit.addEventListener('click', () => SA.layersDialog.open());
      head.appendChild(edit);
      container.appendChild(head);
      return;
    }
    if (sel.kind === 'clip') {
      const clip = ((doc.clips) || []).find((entry) => entry.id === sel.clipId);
      const kind = clip ? SA.project.trackKindOf(doc, clip.trackId) : null;
      const line = document.createElement('div');
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'btn btn-mini is-active';
      chip.textContent = `${t(CLIP_KIND_LABELS[kind] || 'studio.inspector.clip')}${clip ? ` · ${(clip.spec && clip.spec.type) || ''}` : ''}`;
      line.appendChild(chip);
      head.appendChild(line);
      container.appendChild(head);
      return;
    }
    if (sel.kind === 'filler') {
      const line = document.createElement('div');
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'btn btn-mini is-active';
      chip.textContent = `${t('filler.title')} · ${sel.fillerKey}`;
      line.appendChild(chip);
      head.appendChild(line);
      container.appendChild(head);
      return;
    }
    if (sel.kind === 'credit') {
      const line = document.createElement('div');
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'btn btn-mini is-active';
      chip.textContent = `${t('credits.title')} · ${t(`credits.mode${sel.creditMode.charAt(0).toUpperCase()}${sel.creditMode.slice(1)}`)}`;
      line.appendChild(chip);
      head.appendChild(line);
      container.appendChild(head);
      return;
    }
    if (sel.kind === 'track') {
      const track = ((doc.tracks) || []).find((entry) => entry.id === sel.trackId);
      const line = document.createElement('div');
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'btn btn-mini is-active';
      chip.textContent = track ? track.name || track.id : sel.trackId;
      line.appendChild(chip);
      head.appendChild(line);
      container.appendChild(head);
      return;
    }
    const cue = doc.script.cues.find((entry) => entry.id === sel.cueId);
    const beat = sel.beatId && doc.beats[sel.cueId] ? doc.beats[sel.cueId].find((entry) => entry.id === sel.beatId) : null;
    const parts = [];
    parts.push({ label: `Cue ${cue ? cue.start.toFixed(2) : sel.cueId}`, path: `cue:${sel.cueId}` });
    if (beat) parts.push({ label: `${t(`studio.beat.${beat.kind}`)} ${beat.index}`, path: `cue:${sel.cueId}/beat:${beat.id}` });
    if (sel.lineIdx != null) parts.push({ label: `Line ${sel.lineIdx + 1}`, path: `${sel.path.split('/line:')[0]}/line:${sel.lineIdx}` });
    if (sel.wordIdx != null) parts.push({ label: `Word ${sel.wordIdx + 1}`, path: sel.path.split('/letter:')[0] });
    if (sel.letterIdx != null) parts.push({ label: `"${'?'}"`, path: sel.path });
    const line = document.createElement('div');
    for (let i = 0; i < parts.length; i += 1) {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'insp-sep';
        sep.textContent = ' › ';
        line.appendChild(sep);
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `btn btn-mini${i === parts.length - 1 ? ' is-active' : ''}`;
      button.textContent = parts[i].label;
      button.addEventListener('click', () => selectAt(parts[i].path));
      line.appendChild(button);
    }
    head.appendChild(line);
    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'btn btn-mini';
    up.textContent = '↑';
    up.title = t('studio.inspector.up');
    up.addEventListener('click', () => cycleLevel(-1));
    head.appendChild(up);
    container.appendChild(head);
    const orphans = doc.orphans && doc.orphans[sel.cueId] ? Object.keys(doc.orphans[sel.cueId]).length : 0;
    if (orphans) {
      const warn = document.createElement('div');
      warn.className = 'insp-orphans';
      warn.textContent = t('studio.inspector.orphans', { n: orphans });
      const discard = document.createElement('button');
      discard.type = 'button';
      discard.className = 'btn btn-mini';
      discard.textContent = t('studio.inspector.discard');
      discard.addEventListener('click', () => SA.store.commands.discardOrphans(sel.cueId));
      warn.appendChild(discard);
      container.appendChild(warn);
    }
  }

  // The cue only controls its lifetime (time span). Text, motion and style are
  // edited on the selected beat.
  function renderCueSection(container) {
    const sel = selectionInfo();
    if (!sel.cueId) return;
    const doc = project();
    const cue = doc.script.cues.find((entry) => entry.id === sel.cueId);
    if (!cue) return;
    const body = section(container, 'cue', t('studio.inspector.cue'));
    const hint = document.createElement('div');
    hint.className = 'insp-inherit';
    hint.textContent = t('studio.inspector.cueHint');
    body.appendChild(hint);
    // the cue's beats as jump buttons: a click selects that beat
    const cueBeats = (doc.beats[sel.cueId] || []).length ? doc.beats[sel.cueId] : cue && SA.lyricsEngine ? [SA.lyricsEngine.beatForCue(cue)].filter(Boolean) : [];
    if (cueBeats.length) {
      const list = document.createElement('div');
      list.className = 'layer-order';
      cueBeats.forEach((beat, index) => {
        const jump = document.createElement('button');
        jump.type = 'button';
        jump.className = 'btn btn-mini';
        jump.textContent = `${index + 1} · ${t(`studio.beat.${beat.kind}`)}`;
        jump.addEventListener('click', () => selectAt(`cue:${sel.cueId}/beat:${beat.id}`));
        list.appendChild(jump);
      });
      body.appendChild(list);
    }
    const startControl = SA.controls.numberControl({ min: 0, step: 0.05, default: cue.start }, cue.start, (value) => {
      SA.store.commands.moveCue(sel.cueId, value, { coalesceKey: `cue:${sel.cueId}:start` });
    });
    row(body, 'cue.start', t('studio.inspector.start'), startControl);
    const endControl = SA.controls.numberControl({ min: 0, step: 0.05, default: cue.end }, cue.end, (value) => {
      SA.store.commands.trimCue(sel.cueId, 'end', value, { coalesceKey: `cue:${sel.cueId}:end` });
    });
    row(body, 'cue.end', t('studio.inspector.end'), endControl);
    const kindSelect = SA.controls.selectControl({}, (cue.meta && cue.meta.kind) || 'custom', (value) => {
      SA.store.dispatch({
        label: 'cue meta',
        areas: ['script'],
        do(projectDoc) {
          const target = projectDoc.script.cues.find((entry) => entry.id === sel.cueId);
          if (target) target.meta = { ...(target.meta || {}), kind: value };
        },
      });
    }, ['custom', 'intro', 'badge', 'stat', 'song', 'completion', 'outro'].map((value) => ({ value, label: SA.controls.prettify(value) })));
    row(body, 'meta.kind', t('studio.inspector.kind'), kindSelect);
    const subtitleTracks = SA.project.subtitleTracks(doc);
    if (subtitleTracks.length) {
      const currentTrack = cue.trackId || 'sub1';
      const trackSelect = SA.controls.selectControl(
        {},
        currentTrack,
        (value) => SA.store.commands.setCueTrack(sel.cueId, value),
        subtitleTracks.map((track) => ({ value: track.id, label: track.name || track.id }))
      );
      row(body, 'cue.trackId', t('studio.inspector.track'), trackSelect, { noKey: true, noReset: true });
    }
    const actions = document.createElement('div');
    actions.className = 'layer-order';
    const rerollCue = document.createElement('button');
    rerollCue.type = 'button';
    rerollCue.className = 'btn btn-mini';
    rerollCue.textContent = t('studio.inspector.rerollCue');
    rerollCue.addEventListener('click', () => SA.store.commands.rerollCue(sel.cueId));
    const addBeat = document.createElement('button');
    addBeat.type = 'button';
    addBeat.className = 'btn btn-mini';
    addBeat.textContent = `+ ${t('studio.beat.addBeat')}`;
    addBeat.addEventListener('click', () => SA.store.commands.addBeat(sel.cueId));
    const removeCue = document.createElement('button');
    removeCue.type = 'button';
    removeCue.className = 'btn btn-mini';
    removeCue.textContent = t('studio.beat.deleteCue');
    removeCue.addEventListener('click', () => SA.store.commands.deleteCue(sel.cueId));
    actions.appendChild(rerollCue);
    actions.appendChild(addBeat);
    actions.appendChild(removeCue);
    body.appendChild(actions);
  }

  function renderBeatSection(container) {
    const sel = selectionInfo();
    if (!sel.beatId) return;
    const doc = project();
    const cue = doc.script.cues.find((entry) => entry.id === sel.cueId);
    const beat =
      (doc.beats[sel.cueId] || []).find((entry) => entry.id === sel.beatId) ||
      (cue && SA.lyricsEngine ? SA.lyricsEngine.beatForCue(cue) : null);
    if (!beat) return;
    const body = section(container, 'beat', `${t('studio.inspector.beat')} · ${t(`studio.beat.${beat.kind}`)}`);
    const head = document.createElement('div');
    head.className = 'insp-beat-actions';
    const button = (key, run) => {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'btn btn-mini';
      node.textContent = t(key);
      node.addEventListener('click', run);
      head.appendChild(node);
    };
    button(beat.pinned ? 'studio.beat.unpin' : 'studio.beat.pin', () => SA.store.commands.setBeatPinned(sel.cueId, beat.id, !beat.pinned));
    button('studio.beat.splitAtPlayhead', () => SA.store.commands.splitBeat(sel.cueId, beat.id, SA.store.state.playhead));
    button('studio.beat.mergeNext', () => SA.store.commands.mergeBeats(sel.cueId, beat.id));
    button('studio.beat.restructureCue', () => SA.store.commands.restructureCue(sel.cueId));
    // jump to the neighbouring beat inside the same cue
    const beatList = (doc.beats[sel.cueId] || []).length ? doc.beats[sel.cueId] : cue && SA.lyricsEngine ? [SA.lyricsEngine.beatForCue(cue)].filter(Boolean) : [];
    const beatIndex = beatList.findIndex((entry) => entry && entry.id === beat.id);
    if (beatIndex > 0) button('studio.beat.prevBeat', () => selectAt(`cue:${sel.cueId}/beat:${beatList[beatIndex - 1].id}`));
    if (beatIndex >= 0 && beatIndex < beatList.length - 1) button('studio.beat.nextBeat', () => selectAt(`cue:${sel.cueId}/beat:${beatList[beatIndex + 1].id}`));
    button('studio.inspector.rerollBeat', () => SA.store.commands.rerollBeat(sel.cueId, beat.id));
    button('studio.inspector.rerollBeatColors', () => {
      const palette = SA.store.commands.rerollPalette({ cueId: sel.cueId, beatId: beat.id });
      if (palette && SA.studio && SA.studio.toast) SA.studio.toast('studio.toast.colorsRerolled', { theme: palette.name || palette.id || '' });
    });
    button('studio.beat.deleteBeat', () => SA.store.commands.deleteBeat(sel.cueId, beat.id));
    body.appendChild(head);
    const ownBeat = (doc.beatStyles && doc.beatStyles[beat.id]) || {};
    body.appendChild(
      creditsToggle(t('studio.inspector.colorLegacy'), !!ownBeat.colorLegacy, (on) => SA.store.commands.setBeatColorLegacy(sel.cueId, beat.id, on))
    );
    const beatText = SA.controls.textControl(beat.text || '', (value) => {
      SA.store.commands.editBeatText(sel.cueId, beat.id, value, { coalesceKey: `beat:${beat.id}:text` });
    }, { multiline: true });
    beatText.classList.add('cue-text');
    body.appendChild(beatText);
    const startControl = SA.controls.numberControl({ min: 0, step: 0.05, default: beat.start }, beat.start, (value) => {
      SA.store.commands.moveBeatEdge(sel.cueId, beat.id, 'start', value, { coalesceKey: `beat:${beat.id}:start` });
    });
    row(body, `beat:${beat.id}:start`, t('studio.inspector.start'), startControl, { noKey: true, noReset: true });
    const endControl = SA.controls.numberControl({ min: 0, step: 0.05, default: beat.end }, beat.end, (value) => {
      SA.store.commands.moveBeatEdge(sel.cueId, beat.id, 'end', value, { coalesceKey: `beat:${beat.id}:end` });
    });
    row(body, `beat:${beat.id}:end`, t('studio.inspector.end'), endControl, { noKey: true, noReset: true });
  }

  function renderTransform(container) {
    const body = section(container, 'transform', t('studio.inspector.transform'));
    const fields = [
      ['transform.x', 'x'],
      ['transform.y', 'y'],
      ['transform.rotate', 'rotate'],
      ['transform.scale', 'scale'],
      ['transform.tiltX', 'tiltX'],
      ['transform.tiltY', 'tiltY'],
      ['transform.opacity', 'opacity'],
    ];
    const defaults = { x: 0, y: 0, rotate: 0, scale: 1, tiltX: 0, tiltY: 0, opacity: 1 };
    for (const [propPath, label] of fields) {
      const value = readEffective(propPath);
      const param = { min: propPath === 'transform.opacity' ? 0 : propPath === 'transform.scale' ? 0 : null, max: propPath === 'transform.opacity' ? 1 : null, step: 0.01, default: defaults[label] };
      const control = SA.controls.numberControl(param, value == null ? defaults[label] : value, (next) => writeProp(propPath, next));
      row(body, propPath, SA.controls.prettify(label), control);
    }
  }

  function renderTextSection(container) {
    const body = section(container, 'text', t('studio.inspector.text'));
    const fields = [
      ['text.fontId', 'font'],
      ['text.size', 'size'],
      ['text.weight', 'weight'],
      ['text.letterSpacing', 'letterSpacing'],
      ['text.lineHeight', 'lineHeight'],
      ['text.maxWidth', 'maxWidth'],
    ];
    for (const [propPath, key] of fields) {
      const value = readEffective(propPath);
      let control;
      if (key === 'font') {
        control = SA.controls.selectControl({}, SA.lyricsFont.resolveFontId(value || 'NotoSans-Regular'), (next) => writeProp(propPath, next), SA.controls.fontChoices());
      } else {
        control = SA.controls.numberControl({ step: 0.01, default: 0 }, value == null ? 0 : value, (next) => writeProp(propPath, next));
      }
      row(body, propPath, SA.controls.labelFor(key), control);
    }
    const alignValue = readEffective('text.align') || 'center';
    row(
      body,
      'text.align',
      SA.controls.labelFor('align'),
      SA.controls.selectControl({}, alignValue, (next) => writeProp('text.align', next), ['left', 'center', 'right'].map((value) => ({ value, label: SA.controls.valueLabel(value) })))
    );
    const directionValue = readEffective('text.direction') || 'horizontal';
    row(
      body,
      'text.direction',
      SA.controls.labelFor('direction'),
      SA.controls.selectControl({}, directionValue, (next) => writeProp('text.direction', next), ['horizontal', 'vertical'].map((value) => ({ value, label: SA.controls.valueLabel(value) })))
    );
    const fitValue = readEffective('text.fit') || 'fixed';
    row(
      body,
      'text.fit',
      SA.controls.labelFor('textFit'),
      SA.controls.selectControl({}, fitValue, (next) => writeProp('text.fit', next), [
        { value: 'fixed', label: SA.controls.valueLabel('fixed') },
        { value: 'fill', label: SA.controls.valueLabel('fitScreen') },
      ])
    );
    if (fitValue === 'fill') {
      const portrait = (project().output && project().output.aspect) === '9:16';
      const fillFields = [
        ['text.fillCoverage', 'fillCoverage', { min: 0.02, max: 0.5, step: 0.01, default: portrait ? 0.2 : 0.14 }],
        ['text.fillBleed', 'fillBleed', { min: 0, max: 0.2, step: 0.01, default: 0.04 }],
        ['text.fillMaxWidth', 'fillMaxWidth', { min: 0.3, max: 1.15, step: 0.01, default: 0.94 }],
        ['text.fillMaxHeight', 'fillMaxHeight', { min: 0.1, max: 1, step: 0.01, default: 0.6 }],
        ['text.fillMinSize', 'fillMinSize', { min: 0.01, max: 0.2, step: 0.005, default: 0.045 }],
        ['text.fillMaxSize', 'fillMaxSize', { min: 0.05, max: 0.8, step: 0.01, default: 0.32 }],
      ];
      for (const [propPath, key, param] of fillFields) {
        const value = readEffective(propPath);
        row(body, propPath, SA.controls.labelFor(key), SA.controls.numberControl(param, value == null ? param.default : value, (next) => writeProp(propPath, next)));
      }
      const consistency = readEffective('text.fillConsistency') || 'page';
      row(
        body,
        'text.fillConsistency',
        SA.controls.labelFor('fillConsistency'),
        SA.controls.selectControl({}, consistency, (next) => writeProp('text.fillConsistency', next), ['page', 'cue'].map((value) => ({ value, label: SA.controls.valueLabel(value) })))
      );
    }
  }

  function renderMotion(container, group, instance) {
    const details = document.createElement('details');
    details.className = 'insp-motion-details';
    const summary = document.createElement('summary');
    summary.textContent = t('studio.inspector.motion');
    details.appendChild(summary);
    const body = document.createElement('div');
    body.className = 'insp-motion';
    details.appendChild(body);
    const motion = (instance && instance.motion) || {};
    const heading = (key) => {
      const node = document.createElement('div');
      node.className = 'insp-inherit';
      node.textContent = t(key);
      body.appendChild(node);
    };
    for (const phase of ['in', 'out']) {
      heading(`studio.inspector.${phase}`);
      const current = motion[phase] || {};
      for (const key of ['duration', 'delay', 'ease']) {
        const propPath = `${group}.motion.${phase}.${key}`;
        const value = current[key] != null ? current[key] : key === 'ease' ? 'linear' : 0;
        const control =
          key === 'ease'
            ? SA.controls.easeControl(value, (next) => writeProp(propPath, next))
            : SA.controls.numberControl({ min: 0, step: 0.05, default: 0 }, value, (next) => writeProp(propPath, next));
        row(body, propPath, t(`studio.inspector.${key}`), control, { noKey: true, noReset: true });
      }
    }
    const stagger = motion.stagger || {};
    heading('studio.inspector.stagger');
    for (const key of ['each', 'order', 'ease', 'from', 'unit']) {
      const propPath = `${group}.motion.stagger.${key}`;
      let control;
      if (key === 'ease') control = SA.controls.easeControl(stagger[key] || 'linear', (next) => writeProp(propPath, next));
      else if (key === 'order') {
        control = SA.controls.selectControl(
          {},
          stagger[key] || 'ltr',
          (next) => writeProp(propPath, next),
          ['ltr', 'rtl', 'center-out', 'edges-in', 'random', 'word', 'line', 'strokeLength', 'oddEven', 'vertical-reading'].map((value) => ({ value, label: SA.controls.valueLabel(value) }))
        );
      } else if (key === 'unit') {
        control = SA.controls.selectControl({}, stagger[key] || 'letter', (next) => writeProp(propPath, next), ['letter', 'word', 'line'].map((value) => ({ value, label: SA.controls.valueLabel(value) })));
      } else {
        control = SA.controls.numberControl({ min: 0, step: 0.005, default: 0 }, stagger[key] == null ? (key === 'from' ? 0.5 : 0.035) : stagger[key], (next) => writeProp(propPath, next));
      }
      row(body, propPath, t(`studio.inspector.${key}`), control, { noKey: true, noReset: true });
    }
    const loop = motion.loop || {};
    heading('studio.inspector.loop');
    for (const key of ['period', 'yoyo', 'ease']) {
      const propPath = `${group}.motion.loop.${key}`;
      const control =
        key === 'yoyo'
          ? SA.controls.boolControl(!!loop[key], (next) => writeProp(propPath, next))
          : key === 'ease'
            ? SA.controls.easeControl(loop[key] || 'easeInOutSine', (next) => writeProp(propPath, next))
            : SA.controls.numberControl({ min: 0, step: 0.1, default: 2 }, loop[key] == null ? 2 : loop[key], (next) => writeProp(propPath, next));
      row(body, propPath, t(`studio.inspector.${key}`), control, { noKey: true, noReset: true });
    }
    container.appendChild(details);
  }

  function motionList() {
    const style = resolvedStyle();
    return Array.isArray(style.motions) ? style.motions : [];
  }

  function addMotion(preset) {
    if (!preset || !SA.fx) return;
    const phase = preset.phase || 'enter';
    const entry = {
      id: `m_${Math.random().toString(36).slice(2, 8)}`,
      phase,
      type: preset.type,
      from: preset.from === 'end' ? 'end' : 'start',
      delay: Number(preset.delay) || 0,
      duration: Number(preset.duration) || 0.6,
      ease: preset.ease || (phase === 'enter' ? 'easeOutCubic' : phase === 'exit' ? 'easeInCubic' : 'linear'),
      params: { ...(SA.fx.paramDefaults(phase, preset.type) || {}), ...(preset.params || {}) },
      enabled: true,
    };
    writeProp('motions', [...motionList(), entry]);
  }

  function renderCustomMotions(container) {
    const style = resolvedStyle();
    const list = motionList();
    const body = section(container, 'motions', t('studio.motion.title'));
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'insp-inherit';
      empty.textContent = t('studio.motion.empty');
      body.appendChild(empty);
    }
    list.forEach((motion, index) => {
      const phase = motion.phase === 'exit' ? 'exit' : motion.phase === 'hold' ? 'hold' : 'enter';
      const box = document.createElement('div');
      box.className = 'insp-stack-item';
      const head = document.createElement('div');
      head.className = 'insp-stack-head';
      const name = document.createElement('span');
      name.className = 'insp-inherit';
      name.textContent = SA.controls.typeLabel(phase, motion.type);
      head.appendChild(name);
      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'btn btn-mini';
      up.textContent = '↑';
      up.addEventListener('click', () => {
        if (index <= 0) return;
        const next = [...list];
        [next[index - 1], next[index]] = [next[index], next[index - 1]];
        writeProp('motions', next);
      });
      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'btn btn-mini';
      down.textContent = '↓';
      down.addEventListener('click', () => {
        if (index >= list.length - 1) return;
        const next = [...list];
        [next[index + 1], next[index]] = [next[index], next[index + 1]];
        writeProp('motions', next);
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-mini';
      remove.textContent = '✕';
      remove.addEventListener('click', () => writeProp('motions', list.filter((entry, i) => i !== index)));
      head.appendChild(up);
      head.appendChild(down);
      head.appendChild(remove);
      box.appendChild(head);

      const update = (patch, coalesceKey) => {
        const next = list.map((entry, i) => (i === index ? { ...entry, ...patch } : entry));
        writeProp('motions', next, { coalesceKey });
      };
      const enabledRow = document.createElement('label');
      enabledRow.className = 'ctrl-bool-row';
      enabledRow.textContent = t('studio.inspector.enabled');
      enabledRow.appendChild(SA.controls.boolControl(motion.enabled !== false, (value) => update({ enabled: value })));
      box.appendChild(enabledRow);
      box.appendChild(
        fieldRow(
          t('studio.motion.from'),
          selectControl(
            motion.from === 'end' ? 'end' : 'start',
            ['start', 'end'],
            (value) => t(value === 'end' ? 'studio.motion.fromEnd' : 'studio.motion.fromStart'),
            (value) => update({ from: value })
          )
        )
      );
      box.appendChild(
        fieldRow(
          t('studio.inspector.delay'),
          numberField(motion.delay == null ? 0 : motion.delay, { step: 0.05, default: 0, kind: 'number' }, (value) => update({ delay: value }, `motion:${motion.id}:delay`))
        )
      );
      box.appendChild(
        fieldRow(
          t('studio.inspector.duration'),
          numberField(
            motion.duration == null ? 0.6 : motion.duration,
            { min: 0.05, step: 0.05, default: 0.6, kind: 'number' },
            (value) => update({ duration: value }, `motion:${motion.id}:duration`)
          )
        )
      );
      if (phase !== 'hold') {
        box.appendChild(
          fieldRow(
            t('studio.inspector.ease'),
            SA.controls.easeControl(motion.ease || (phase === 'enter' ? 'easeOutCubic' : 'easeInCubic'), (value) => update({ ease: value }, `motion:${motion.id}:ease`))
          )
        );
      }
      const descriptor = SA.fx.get(phase, motion.type);
      const defaults = SA.fx.paramDefaults(phase, motion.type);
      const params = { ...defaults, ...(motion.params || {}) };
      for (const param of SA.controls.paramEntries(descriptor)) {
        const control = SA.controls.paramControl(
          phase,
          param,
          params[param.key],
          (value) => update({ params: { ...params, [param.key]: value } }, `motion:${motion.id}:${param.key}`),
          { palette: style.palette || null, slotLabel: t('studio.inspector.palette') }
        );
        box.appendChild(fieldRow(SA.controls.labelFor(param.key), control));
      }
      body.appendChild(box);
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn-mini';
    add.textContent = `+ ${t('studio.motion.add')}`;
    add.addEventListener('click', () => SA.motionDialog.open());
    body.appendChild(add);
  }

  // Clones: draw the same string several times with per-copy offsets.
  function renderClones(container) {
    const style = resolvedStyle();
    const list = Array.isArray(style.clones) ? style.clones : [];
    const body = section(container, 'clones', t('studio.clones.title'));
    const hint = document.createElement('div');
    hint.className = 'insp-inherit';
    hint.textContent = t('studio.clones.hint');
    body.appendChild(hint);
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'insp-inherit';
      empty.textContent = t('studio.clones.empty');
      body.appendChild(empty);
    }
    list.forEach((clone, index) => {
      const box = document.createElement('div');
      box.className = 'insp-stack-item';
      const head = document.createElement('div');
      head.className = 'insp-stack-head';
      const name = document.createElement('span');
      name.className = 'insp-inherit';
      name.textContent = `${t('studio.clones.title')} ${index + 1}`;
      head.appendChild(name);
      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'btn btn-mini';
      up.textContent = '↑';
      up.addEventListener('click', () => {
        if (index <= 0) return;
        const next = [...list];
        [next[index - 1], next[index]] = [next[index], next[index - 1]];
        writeProp('clones', next);
      });
      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'btn btn-mini';
      down.textContent = '↓';
      down.addEventListener('click', () => {
        if (index >= list.length - 1) return;
        const next = [...list];
        [next[index + 1], next[index]] = [next[index], next[index + 1]];
        writeProp('clones', next);
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-mini';
      remove.textContent = '✕';
      remove.addEventListener('click', () => writeProp('clones', list.filter((entry, i) => i !== index)));
      head.appendChild(up);
      head.appendChild(down);
      head.appendChild(remove);
      box.appendChild(head);
      const key = clone.id || `clone_${index}`;
      const update = (patch, coalesceKey) => {
        const next = list.map((entry, i) => (i === index ? { ...entry, ...patch } : entry));
        writeProp('clones', next, { coalesceKey });
      };
      const enabledRow = document.createElement('label');
      enabledRow.className = 'ctrl-bool-row';
      enabledRow.textContent = t('studio.inspector.enabled');
      enabledRow.appendChild(SA.controls.boolControl(clone.enabled !== false, (value) => update({ enabled: value })));
      box.appendChild(enabledRow);
      const fields = [
        ['dx', clone.dx == null ? 0 : clone.dx, { step: 0.01, default: 0 }],
        ['dy', clone.dy == null ? 0 : clone.dy, { step: 0.01, default: 0 }],
        ['scale', clone.scale == null ? 1 : clone.scale, { min: 0.05, step: 0.05, default: 1 }],
        ['rotate', clone.rotate == null ? 0 : clone.rotate, { step: 1, default: 0 }],
        ['opacity', clone.opacity == null ? 0.5 : clone.opacity, { min: 0, max: 1, step: 0.05, default: 0.5 }],
        ['hue', clone.hue == null ? 0 : clone.hue, { step: 5, default: 0 }],
        ['delay', clone.delay == null ? 0 : clone.delay, { min: 0, step: 0.05, default: 0 }],
      ];
      for (const [field, value, param] of fields) {
        const control = SA.controls.numberControl(param, value, (next) => update({ [field]: next }, `${key}:${field}`));
        box.appendChild(fieldRow(t(`studio.clones.${field}`), control));
      }
      const motion = clone.motion || {};
      box.appendChild(
        fieldRow(
          t('studio.clones.motion'),
          SA.controls.selectControl({}, motion.type || 'none', (value) => update({ motion: { ...motion, type: value } }), ['none', 'drift', 'float', 'pulse', 'orbit', 'spin'].map((value) => ({ value, label: SA.controls.valueLabel(value) })))
        )
      );
      box.appendChild(
        fieldRow(
          t('studio.clones.amount'),
          SA.controls.numberControl({ min: 0, step: 0.005, default: 0.02 }, motion.amount == null ? 0.02 : motion.amount, (next) => update({ motion: { ...motion, amount: next } }, `${key}:amount`))
        )
      );
      box.appendChild(
        fieldRow(
          t('studio.clones.speed'),
          SA.controls.numberControl({ min: 0, step: 0.05, default: 0.5 }, motion.speed == null ? 0.5 : motion.speed, (next) => update({ motion: { ...motion, speed: next } }, `${key}:speed`))
        )
      );
      body.appendChild(box);
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn-mini';
    add.textContent = `+ ${t('studio.clones.add')}`;
    add.addEventListener('click', () => {
      const id = `clone_${Math.random().toString(36).slice(2, 8)}`;
      writeProp('clones', [
        ...list,
        {
          id,
          dx: 0,
          dy: 0.05,
          scale: 0.94,
          rotate: 0,
          opacity: 0.4,
          hue: 25,
          delay: 0.08,
          motion: { type: 'drift', amount: 0.015, speed: 0.6 },
          enabled: true,
        },
      ]);
    });
    body.appendChild(add);
  }

  function instanceFor(group) {
    const style = resolvedStyle();
    const value = style[group];
    return value && value.type ? value : SA.fx.defaultsFor(group);
  }

  function renderGroup(container, group) {
    const style = resolvedStyle();
    const explicit = style[group] && style[group].type ? style[group] : null;
    const instance = explicit || SA.fx.defaultsFor(group);
    const body = section(container, group, t(GROUP_LABELS[group]));
    const entries = [{ value: '__inherit', label: t('studio.inspector.inherited') }].concat(
      SA.fx.list(group, UI_PACKS).map((descriptor) => ({ value: descriptor.type, label: SA.controls.typeLabel(group, descriptor.type) }))
    );
    const typeControl = SA.controls.selectControl({}, explicit ? explicit.type : '__inherit', (next) => {
      const current = explicit || {};
      const merged = next === '__inherit' ? null : { ...current, type: next, params: { ...(current.params || {}) }, motion: { ...(current.motion || {}) } };
      writeProp(group, merged, { coalesceKey: `${group}:type` });
    }, entries);
    const typeRow = row(body, group, t('studio.inspector.type'), typeControl);
    if (explicit) {
      const enabled = explicit.enabled !== false;
      const enabledRow = document.createElement('label');
      enabledRow.className = 'ctrl-bool-row';
      enabledRow.textContent = t('studio.inspector.enabled');
      enabledRow.appendChild(SA.controls.boolControl(enabled, (value) => writeProp(`${group}.enabled`, value)));
      body.appendChild(enabledRow);
    } else {
      const inherit = document.createElement('div');
      inherit.className = 'insp-inherit';
      inherit.textContent = t('studio.inspector.inheritedHint');
      body.appendChild(inherit);
    }
    const descriptor = SA.fx.get(group, instance && instance.type);
    const params = (instance && instance.params) || {};
    for (const param of SA.controls.paramEntries(descriptor)) {
      const value = params[param.key] != null ? params[param.key] : param.default;
      const propPath = `${group}.params.${param.key}`;
      const control = SA.controls.paramControl(group, param, value, (next) => writeProp(propPath, next), {
        palette: style.palette || null,
        slotLabel: t('studio.inspector.palette'),
      });
      row(body, propPath, SA.controls.labelFor(param.key), control);
    }
    if (MOTION_GROUPS.includes(group)) renderMotion(container, group, instance);
    void typeRow;
  }

  function renderStackGroup(container, group) {
    const style = resolvedStyle();
    const list = Array.isArray(style[group]) ? style[group] : [];
    const body = section(container, group, t(GROUP_LABELS[group]));
    list.forEach((instance, index) => {
      const box = document.createElement('div');
      box.className = 'insp-stack-item';
      const head = document.createElement('div');
      head.className = 'insp-stack-head';
      head.appendChild(
        SA.controls.selectControl({}, instance.type, (next) => {
          const nextList = list.map((entry, i) => (i === index ? { ...entry, type: next, params: {} } : entry));
          writeProp(group, nextList, { coalesceKey: `${group}:${index}:type` });
        }, SA.fx.list(group, UI_PACKS).map((descriptor) => ({ value: descriptor.type, label: SA.controls.typeLabel(group, descriptor.type) })))
      );
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-mini';
      remove.textContent = '✕';
      remove.addEventListener('click', () => writeProp(group, list.filter((entry, i) => i !== index)));
      head.appendChild(remove);
      box.appendChild(head);
      const descriptor = SA.fx.get(group, instance.type);
      const params = instance.params || {};
      for (const param of SA.controls.paramEntries(descriptor)) {
        const value = params[param.key] != null ? params[param.key] : param.default;
        const propPath = `${group}.${index}.params.${param.key}`;
        const control = SA.controls.paramControl(
          group,
          param,
          value,
          (next) => {
            const nextList = list.map((entry, i) => (i === index ? { ...entry, params: { ...(entry.params || {}), [param.key]: next } } : entry));
            writeProp(group, nextList, { coalesceKey: `${group}:${index}:${param.key}` });
          },
          { palette: style.palette || null, slotLabel: t('studio.inspector.palette') }
        );
        row(box, propPath, SA.controls.labelFor(param.key), control);
      }
      body.appendChild(box);
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn-mini';
    add.textContent = `+ ${t('studio.inspector.add')}`;
    const descriptors = SA.fx.list(group, UI_PACKS);
    add.addEventListener('click', () => {
      if (!descriptors.length) return;
      writeProp(group, [...list, { type: descriptors[0].type, params: {}, enabled: true }]);
    });
    body.appendChild(add);
  }

  // --- partial decorations (style.scoped) -------------------------------------
  // One entry applies one effect to a subset of the letters: enter / exit
  // replace the base instance for the covered letters, hold adds to the stack,
  // fill / edge draw a scoped overlay mask in the engine.

  const SCOPED_GROUPS = ['enter', 'exit', 'hold', 'fill', 'edge'];
  const SCOPE_KINDS = ['all', 'range', 'word', 'keyword', 'span'];
  const SCOPE_KIND_LABELS = {
    all: 'studio.inspector.scopeAll',
    range: 'studio.inspector.scopeRange',
    word: 'studio.inspector.scopeWord',
    keyword: 'studio.inspector.scopeKeyword',
    span: 'studio.inspector.scopeSpan',
  };

  function numberParam(key, min, max, step, fallback) {
    return { key, kind: 'number', min, max, step, default: fallback };
  }

  function renderScopedSection(container) {
    const sel = selectionInfo();
    if (sel.kind === 'letter' || sel.kind === 'word' || sel.kind === 'line') return;
    const style = resolvedStyle();
    const list = Array.isArray(style.scoped) ? style.scoped : [];
    const body = section(container, 'scoped', t('studio.inspector.scoped'));
    const update = (next) => writeProp('scoped', next, { coalesceKey: `scoped:${sel.path}` });
    list.forEach((entry, index) => {
      const box = document.createElement('div');
      box.className = 'insp-stack-item';
      const head = document.createElement('div');
      head.className = 'insp-stack-head';
      head.appendChild(
        SA.controls.selectControl({}, entry.group || 'hold', (next) => {
          const descriptors = SA.fx.list(next, UI_PACKS);
          update(list.map((item, i) => (i === index ? { ...item, group: next, type: descriptors.length ? descriptors[0].type : item.type, params: {} } : item)));
        }, SCOPED_GROUPS.map((group) => ({ value: group, label: t(GROUP_LABELS[group]) })))
      );
      head.appendChild(
        SA.controls.selectControl({}, entry.type, (next) => {
          update(list.map((item, i) => (i === index ? { ...item, type: next, params: {} } : item)));
        }, SA.fx.list(entry.group || 'hold', UI_PACKS).map((descriptor) => ({ value: descriptor.type, label: SA.controls.typeLabel(entry.group || 'hold', descriptor.type) })))
      );
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-mini';
      remove.textContent = '✕';
      remove.addEventListener('click', () => update(list.filter((item, i) => i !== index)));
      head.appendChild(remove);
      box.appendChild(head);

      // the scope editor
      const scope = entry.scope && entry.scope.kind ? entry.scope : { kind: 'all' };
      const setScope = (patch) => update(list.map((item, i) => (i === index ? { ...item, scope: { ...scope, ...patch } } : item)));
      row(box, `scoped.${index}.kind`, t('studio.inspector.scopeKind'), SA.controls.selectControl({}, scope.kind || 'all', (next) => setScope({ kind: next }), SCOPE_KINDS.map((kind) => ({ value: kind, label: t(SCOPE_KIND_LABELS[kind]) }))));
      if (scope.kind === 'range') {
        row(box, `scoped.${index}.from`, t('studio.inspector.scopeFrom'), SA.controls.numberControl(numberParam('from', 0, 999, 1, 0), scope.from == null ? 0 : scope.from, (next) => setScope({ from: next }), { noSlider: true }));
        row(box, `scoped.${index}.to`, t('studio.inspector.scopeTo'), SA.controls.numberControl(numberParam('to', 0, 999, 1, 0), scope.to == null ? '' : scope.to, (next) => setScope({ to: next }), { noSlider: true }));
      } else if (scope.kind === 'word') {
        row(box, `scoped.${index}.words`, t('studio.inspector.scopeWords'), SA.controls.textControl((scope.words || []).join(','), (next) => {
          const words = String(next).split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value));
          setScope({ words });
        }));
      } else if (scope.kind === 'keyword') {
        row(box, `scoped.${index}.match`, t('studio.inspector.scopeMatch'), SA.controls.textControl(scope.match || '', (next) => setScope({ match: String(next) })));
      } else if (scope.kind === 'span') {
        row(box, `scoped.${index}.spanIndex`, t('studio.inspector.scopeSpanIndex'), SA.controls.numberControl(numberParam('spanIndex', 0, 31, 1, 0), scope.spanIndex == null ? 0 : scope.spanIndex, (next) => setScope({ spanIndex: next }), { noSlider: true }));
      }

      // the effect parameters (the same rows as a stack group)
      const descriptor = SA.fx.get(entry.group || 'hold', entry.type);
      const params = entry.params || {};
      for (const param of SA.controls.paramEntries(descriptor)) {
        const value = params[param.key] != null ? params[param.key] : param.default;
        const control = SA.controls.paramControl(entry.group || 'hold', param, value, (next) => {
          update(list.map((item, i) => (i === index ? { ...item, params: { ...(item.params || {}), [param.key]: next } } : item)));
        }, { palette: style.palette || null, slotLabel: t('studio.inspector.palette') });
        row(box, `scoped.${index}.params.${param.key}`, SA.controls.labelFor(param.key), control, { noKey: true });
      }
      body.appendChild(box);
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn-mini';
    add.textContent = `+ ${t('studio.inspector.addScoped')}`;
    add.addEventListener('click', () => {
      const descriptors = SA.fx.list('hold', UI_PACKS);
      update([...list, { group: 'hold', type: descriptors.length ? descriptors[0].type : 'none', params: {}, enabled: true, scope: { kind: 'all' } }]);
    });
    body.appendChild(add);
  }

  function renderColor(container) {
    const body = section(container, 'color', t('studio.inspector.color'));
    const style = resolvedStyle();
    const colorSet = style.color || {};
    const slots = ['fill', 'fill2', 'stroke', 'glow', 'shadow'];
    for (const slot of slots) {
      const value = colorSet[slot];
      const current = value && value.kind === 'solid' ? value.value : value && value.value ? value.value : '';
      const propPath = `color.${slot}`;
      const control = SA.controls.colorControl(current, (next) => {
        writeProp(propPath, next == null ? null : { kind: 'solid', value: next, alpha: 1 });
      });
      row(body, propPath, SA.controls.labelFor(slot), control);
    }
    const useCategory = !!colorSet.useCategory;
    const catRow = document.createElement('label');
    catRow.className = 'ctrl-bool-row';
    catRow.textContent = t('studio.inspector.useCategory');
    catRow.appendChild(SA.controls.boolControl(useCategory, (value) => writeProp('color.useCategory', value)));
    body.appendChild(catRow);
  }

  // Quick background / foreground layer list so the layers can be changed
  // without opening the Layers dialog.
  function renderLayersSummary(container) {
    const doc = project();
    const layers = Array.isArray(doc && doc.layers) ? doc.layers : [];
    const body = section(container, 'layers', t('layers.title'));
    if (!layers.length) {
      const empty = document.createElement('div');
      empty.className = 'insp-inherit';
      empty.textContent = t('layers.empty');
      body.appendChild(empty);
    }
    const move = (from, to) => {
      if (to < 0 || to >= layers.length) return;
      const next = [...layers];
      [next[from], next[to]] = [next[to], next[from]];
      SA.store.commands.setLayers(next);
    };
    layers.forEach((layer, index) => {
      const line = document.createElement('div');
      line.className = 'ctrl-row';
      const label = document.createElement('span');
      label.className = 'ctrl-label';
      const slot = layer.slot === 'foreground' ? t('layers.slotForeground') : t('layers.slotBackground');
      const type = layer.type === 'solid' ? t('layers.typeSolid') : layer.type === 'video' ? t('layers.typeVideo') : t('layers.typeImage');
      label.textContent = `${slot} · ${type}`;
      line.appendChild(label);
      const actions = document.createElement('span');
      actions.className = 'layer-order';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'btn btn-mini';
      toggle.textContent = layer.enabled === false ? t('layers.show') : t('layers.hide');
      toggle.addEventListener('click', () => SA.store.commands.setLayer(layer.id, { enabled: layer.enabled === false }));
      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'btn btn-mini';
      up.textContent = '↑';
      up.addEventListener('click', () => move(index, index - 1));
      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'btn btn-mini';
      down.textContent = '↓';
      down.addEventListener('click', () => move(index, index + 1));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-mini';
      remove.textContent = '✕';
      remove.addEventListener('click', () => SA.store.commands.removeLayer(layer.id));
      actions.appendChild(toggle);
      actions.appendChild(up);
      actions.appendChild(down);
      actions.appendChild(remove);
      line.appendChild(actions);
      body.appendChild(line);
    });
    const actions = document.createElement('div');
    actions.className = 'layer-order';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'btn btn-mini';
    edit.textContent = t('layers.edit');
    edit.addEventListener('click', () => SA.layersDialog.open());
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn-mini';
    add.textContent = `+ ${t('layers.add')}`;
    add.addEventListener('click', () => {
      const layer = SA.layersDialog.defaults('background');
      SA.store.commands.addLayer(layer);
      SA.layersDialog.open();
    });
    actions.appendChild(add);
    actions.appendChild(edit);
    body.appendChild(actions);
  }

  // The background track owns the frame base colour: the stage behind the
  // clips and the layers. Unset = transparent; the chroma key green is a
  // preset. The track's own checkbox hides the colour with its clips/layers.
  function renderTrackSection(container) {
    const doc = project();
    const sel = selectionInfo();
    const track = ((doc && doc.tracks) || []).find((entry) => entry.id === sel.trackId);
    if (!track || track.kind !== 'background') return;
    const body = section(container, 'trackColor', t('studio.inspector.bgColor'));
    const hint = document.createElement('div');
    hint.className = 'insp-inherit';
    hint.textContent = t('studio.inspector.bgColorHint');
    body.appendChild(hint);
    const control = SA.controls.colorControl(track.color || null, (next) => {
      const color = next == null ? null : typeof next === 'string' ? { kind: 'solid', value: next, alpha: 1 } : next;
      SA.store.commands.setTrackColor(track.id, color);
    });
    if (!track.color) {
      const swatch = control.querySelector('.ctrl-swatch');
      if (swatch) {
        swatch.style.background = 'repeating-conic-gradient(#3a4050 0% 25%, #22262f 0% 50%) 50% / 8px 8px';
        swatch.title = t('studio.inspector.bgColorTransparent');
      }
    }
    row(body, 'track.color', t('studio.inspector.bgColor'), control, { noKey: true, noReset: true });
    const actions = document.createElement('div');
    actions.className = 'layer-order';
    const chroma = document.createElement('button');
    chroma.type = 'button';
    chroma.className = 'btn btn-mini';
    chroma.textContent = t('studio.inspector.bgColorChroma');
    chroma.addEventListener('click', () => SA.store.commands.setTrackColor(track.id, { kind: 'solid', value: '#00b140', alpha: 1 }));
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'btn btn-mini';
    clear.textContent = t('studio.inspector.bgColorTransparent');
    clear.addEventListener('click', () => SA.store.commands.setTrackColor(track.id, null));
    actions.appendChild(chroma);
    actions.appendChild(clear);
    body.appendChild(actions);
  }

  function renderLayerSection(container) {
    const doc = project();
    const id = String(selectionInfo().raw).replace(/^layer:/, '');
    const layer = (doc.layers || []).find((entry) => entry.id === id);
    if (!layer) return;
    const body = section(container, 'layer', t('layers.title'));
    const typeName = layer.type === 'solid' ? t('layers.typeSolid') : layer.type === 'video' ? t('layers.typeVideo') : t('layers.typeImage');
    const filterName = layer.filter && layer.filter.type && layer.filter.type !== 'none' ? layer.filter.type : t('layers.filterNone');
    const rows = [
      [t('layers.type'), typeName],
      [t('layers.slot'), layer.slot === 'foreground' ? t('layers.slotForeground') : t('layers.slotBackground')],
      [t('layers.blend'), String(layer.blend || 'normal')],
      [t('layers.opacity'), String(layer.opacity == null ? 1 : layer.opacity)],
      [t('layers.start'), String(layer.start == null ? 0 : layer.start)],
      [t('layers.end'), layer.end == null ? '∞' : String(layer.end)],
      [t('layers.filter'), filterName],
    ];
    for (const [label, value] of rows) {
      const row = document.createElement('div');
      row.className = 'ctrl-row';
      const left = document.createElement('span');
      left.className = 'ctrl-label';
      left.textContent = label;
      const right = document.createElement('span');
      right.textContent = value;
      row.appendChild(left);
      row.appendChild(right);
      body.appendChild(row);
    }
    const actions = document.createElement('div');
    actions.className = 'layer-order';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'btn btn-mini';
    edit.textContent = t('layers.edit');
    edit.addEventListener('click', () => SA.layersDialog.open());
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn btn-mini';
    toggle.textContent = layer.enabled === false ? t('layers.show') : t('layers.hide');
    toggle.addEventListener('click', () => SA.store.commands.setLayer(layer.id, { enabled: layer.enabled === false }));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-mini';
    remove.textContent = t('layers.remove');
    remove.addEventListener('click', () => SA.store.commands.removeLayer(layer.id));
    actions.appendChild(edit);
    actions.appendChild(toggle);
    actions.appendChild(remove);
    body.appendChild(actions);
  }

  function fieldRow(labelText, control) {
    const row = document.createElement('div');
    row.className = 'ctrl-row';
    const label = document.createElement('span');
    label.className = 'ctrl-label';
    label.textContent = labelText;
    row.appendChild(label);
    row.appendChild(control);
    return row;
  }

  function fillerParamLabel(key) {
    const translation = t(`filler.param.${key}`);
    if (translation !== `filler.param.${key}`) return translation;
    return SA.controls ? SA.controls.prettify(key) : key;
  }

  function fillerTypeLabel(type) {
    const translation = t(`filler.type.${type}`);
    if (translation !== `filler.type.${type}`) return translation;
    return SA.controls ? SA.controls.prettify(type) : String(type || '');
  }

  function fillerValueLabel(value) {
    const translation = t(`filler.value.${value}`);
    if (translation !== `filler.value.${value}`) return translation;
    return SA.controls ? SA.controls.prettify(value) : String(value);
  }

  function selectControl(value, options, labelFor, onChange) {
    const select = document.createElement('select');
    for (const option of options) {
      const item = document.createElement('option');
      item.value = option;
      item.textContent = labelFor(option);
      select.appendChild(item);
    }
    select.value = value;
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  function numberField(value, param, onChange) {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = String(param.step == null ? 0.05 : param.step);
    if (param.min != null) input.min = String(param.min);
    if (param.max != null) input.max = String(param.max);
    input.value = value == null ? '' : String(value);
    input.addEventListener('change', () => {
      const parsed = Number(input.value);
      const fallback = param.default == null ? 0 : param.default;
      const raw = Number.isFinite(parsed) ? parsed : fallback;
      const min = param.min == null ? -Infinity : param.min;
      const max = param.max == null ? Infinity : param.max;
      const clamped = Math.max(min, Math.min(max, raw));
      onChange(param.kind === 'int' ? Math.round(clamped) : clamped);
    });
    return input;
  }

  // `labelFor` overrides the option labels (the textAnim theme / fx selects
  // carry their own); it falls back to the filler value dictionary.
  function fillerParamControl(param, value, onChange, labelFor) {
    const optionLabel = labelFor || fillerValueLabel;
    if (param.kind === 'bool') {
      const row = document.createElement('label');
      row.className = 'ctrl-bool-row';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !!value;
      box.addEventListener('change', () => onChange(box.checked));
      const label = document.createElement('span');
      label.textContent = fillerParamLabel(param.key);
      row.appendChild(box);
      row.appendChild(label);
      return row;
    }
    if (param.kind === 'select') {
      const select = selectControl(value == null ? param.default : value, param.options || [], optionLabel, onChange);
      return fieldRow(fillerParamLabel(param.key), select);
    }
    if (param.kind === 'color' || param.kind === 'text') {
      const input = document.createElement('input');
      input.type = param.kind === 'color' ? 'color' : 'text';
      if (param.kind === 'text') input.className = 'ctrl-text';
      input.value = value == null ? (param.default || '') : String(value);
      if (param.kind === 'color' && !/^#[0-9a-f]{6}$/i.test(input.value)) input.value = param.default || '#ffffff';
      input.addEventListener('change', () => onChange(input.value));
      return fieldRow(fillerParamLabel(param.key), input);
    }
    return fieldRow(fillerParamLabel(param.key), numberField(value, param, onChange));
  }

  const CLIP_KIND_LABELS = { background: 'studio.track.background', backdrop: 'studio.track.backdrop', filler: 'filler.track', figure: 'studio.track.figure', textAnim: 'studio.track.textAnim' };

  // The shared tail of every clip section: colours (optional), opacity, fades,
  // start / end and the split / reroll / delete actions.
  function appendClipCommon(body, doc, clip, options) {
    const opts = options || {};
    if (opts.colors !== false) {
      // two colours, picked from the palette or set by hand; null follows the theme
      const palette = (doc.style && doc.style.palette) || null;
      const paletteColors = palette && Array.isArray(palette.colors) ? palette.colors : [];
      const current = Array.isArray(clip.colors) && clip.colors.length ? clip.colors : [];
      const colorRow = document.createElement('div');
      colorRow.className = 'insp-actions';
      for (let index = 0; index < 2; index += 1) {
        const fallback = paletteColors[index === 0 ? 0 : 1] || paletteColors[0] || '#000000';
        const control = SA.controls.colorControl(current[index] || fallback, (next) => {
          const value = typeof next === 'string' ? next : next && next.value ? next.value : null;
          if (!value) return;
          const colors = [current[0] || paletteColors[0] || '#000000', current[1] || paletteColors[1] || fallback];
          colors[index] = value;
          SA.store.commands.updateClip(clip.id, { colors });
        }, { palette });
        colorRow.appendChild(control);
      }
      body.appendChild(fieldRow(t('studio.inspector.colors'), colorRow));
    }

    const opacityControl = SA.controls.numberControl({ min: 0, max: 1, step: 0.05, default: 1 }, clip.opacity == null ? 1 : clip.opacity, (value) => {
      SA.store.commands.updateClip(clip.id, { opacity: value }, { coalesceKey: `clip:${clip.id}:opacity` });
    });
    body.appendChild(fieldRow(t('studio.inspector.opacity'), opacityControl));
    const fadeInControl = SA.controls.numberControl({ min: 0, step: 0.05, default: 0.3 }, clip.fadeIn == null ? 0.3 : clip.fadeIn, (value) => {
      SA.store.commands.updateClip(clip.id, { fadeIn: value }, { coalesceKey: `clip:${clip.id}:fadeIn` });
    });
    body.appendChild(fieldRow(t('studio.inspector.fadeIn'), fadeInControl));
    const fadeOutControl = SA.controls.numberControl({ min: 0, step: 0.05, default: 0.3 }, clip.fadeOut == null ? 0.3 : clip.fadeOut, (value) => {
      SA.store.commands.updateClip(clip.id, { fadeOut: value }, { coalesceKey: `clip:${clip.id}:fadeOut` });
    });
    body.appendChild(fieldRow(t('studio.inspector.fadeOut'), fadeOutControl));
    const startControl = SA.controls.numberControl({ min: 0, step: 0.05, default: clip.start }, clip.start, (value) => {
      SA.store.commands.trimClip(clip.id, 'start', value, { coalesceKey: `clip:${clip.id}:start` });
    });
    body.appendChild(fieldRow(t('studio.inspector.start'), startControl));
    const endControl = SA.controls.numberControl({ min: 0, step: 0.05, default: clip.end }, clip.end, (value) => {
      SA.store.commands.trimClip(clip.id, 'end', value, { coalesceKey: `clip:${clip.id}:end` });
    });
    body.appendChild(fieldRow(t('studio.inspector.end'), endControl));

    const actions = document.createElement('div');
    actions.className = 'layer-order';
    const split = document.createElement('button');
    split.type = 'button';
    split.className = 'btn btn-mini';
    split.textContent = t('studio.timeline.splitClip');
    split.addEventListener('click', () => SA.store.commands.splitClip(clip.id, SA.store.state.playhead));
    const reroll = document.createElement('button');
    reroll.type = 'button';
    reroll.className = 'btn btn-mini';
    reroll.textContent = t('studio.inspector.reroll');
    reroll.addEventListener('click', () => SA.store.commands.rerollClip(clip.id));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-mini';
    remove.textContent = t('studio.inspector.delete');
    remove.addEventListener('click', () => SA.store.commands.deleteClip(clip.id));
    const rerollColors = document.createElement('button');
    rerollColors.type = 'button';
    rerollColors.className = 'btn btn-mini';
    rerollColors.textContent = t('studio.generate.rerollColors');
    rerollColors.addEventListener('click', () => {
      const kind = SA.project.trackKindOf(SA.store.state.project, clip.trackId);
      SA.store.commands.rerollColors({ kinds: [kind], clipIds: [clip.id], perClip: true });
    });
    actions.appendChild(split);
    actions.appendChild(reroll);
    actions.appendChild(rerollColors);
    actions.appendChild(remove);
    body.appendChild(actions);
  }

  // --- filler clip editor ------------------------------------------------------

  let fillerLibraryBound = false;

  function fillerLayerTypes() {
    const excluded = new Set(['combo', 'credits', 'cardPeek', 'none']);
    return SA.fillerRender.types().filter((type) => !excluded.has(type));
  }

  function themeLabelFor(id) {
    if (!id) return '—';
    const theme = SA.themes && SA.themes.get ? SA.themes.get(id) : null;
    return theme ? theme.name : String(id);
  }

  // The params of one layer; the textAnim theme / fx selects are filled from the
  // live theme and effect registries (the descriptor only carries placeholders).
  function fillerLayerParams(layer) {
    const params = SA.fillerRender.paramsOf(layer.type);
    if (layer.type !== 'textAnim') return params;
    return params.map((param) => {
      const entry = { ...param };
      if (param.key === 'theme') {
        const themes = SA.themes && SA.themes.list ? SA.themes.list() : [];
        entry.options = ['', ...themes.map((theme) => theme.id)];
        entry.labelFor = (value) => themeLabelFor(value);
      } else if (param.key === 'enter' || param.key === 'hold' || param.key === 'exit') {
        const descriptors = SA.fx && SA.fx.list ? SA.fx.list(param.key) : [];
        entry.options = ['auto', ...descriptors.map((descriptor) => descriptor.type)];
        entry.labelFor = (value) => (value === 'auto' ? fillerValueLabel('auto') : SA.controls.typeLabel(param.key, value));
      }
      return entry;
    });
  }

  function fillerPresetLabel(preset, lang) {
    return SA.fillerPresets.labelFor(preset, lang);
  }

  function renderFillerClipEditor(body, doc, clip) {
    const spec = clip.spec || { type: 'none', params: {} };
    const lang = SA.i18n.lang();
    // one editor row per layer; the first edit is a custom filler, so the stored
    // preset id never rides along on the layer copies
    const layers = SA.fillerRender.layersOf(spec).map((layer) => {
      const copy = JSON.parse(JSON.stringify(layer));
      delete copy.presetId;
      return copy;
    });

    // 1) preset picker: a text filter over a grouped select
    const presetRow = document.createElement('div');
    presetRow.className = 'filler-preset-row';
    const filter = document.createElement('input');
    filter.type = 'search';
    filter.className = 'ctrl-text filler-filter';
    filter.placeholder = t('filler.filter');
    const presetSelect = document.createElement('select');
    presetSelect.className = 'filler-preset-select';
    const rebuildPresets = () => {
      const query = String(filter.value || '').trim().toLowerCase();
      presetSelect.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = t('filler.presetPlaceholder');
      presetSelect.appendChild(placeholder);
      const appendGroup = (label, entries) => {
        const matches = entries.filter((entry) => !query || String(entry.name).toLowerCase().includes(query));
        if (!matches.length) return;
        const group = document.createElement('optgroup');
        group.label = label;
        for (const entry of matches) {
          const option = document.createElement('option');
          option.value = entry.id;
          option.textContent = entry.name;
          group.appendChild(option);
        }
        presetSelect.appendChild(group);
      };
      if (SA.fillerPresets) {
        const presets = SA.fillerPresets.list();
        for (const groupId of SA.fillerPresets.groups()) {
          appendGroup(
            t(`filler.group.${groupId}`),
            presets.filter((preset) => preset.group === groupId).map((preset) => ({ id: preset.id, name: fillerPresetLabel(preset, lang) }))
          );
        }
      }
      if (SA.fillerLibrary) {
        const mine = SA.fillerLibrary.userList();
        if (mine.length) appendGroup(t('filler.group.mine'), mine.map((entry) => ({ id: entry.id, name: entry.name })));
      }
      presetSelect.value = spec.presetId || '';
    };
    rebuildPresets();
    filter.addEventListener('input', rebuildPresets);
    presetSelect.addEventListener('change', () => {
      const id = presetSelect.value;
      if (!id || !SA.fillerLibrary) return;
      const next = SA.fillerLibrary.specOf(id);
      if (next) SA.store.commands.updateClip(clip.id, { spec: next });
    });
    presetRow.appendChild(filter);
    presetRow.appendChild(presetSelect);
    body.appendChild(fieldRow(t('filler.presets'), presetRow));

    // 2) the layer stack: every edit commits the whole list (one undo step)
    const commit = (list, key, layerIndex) => {
      const next = SA.fillerRender.fromLayers(list, { name: spec.name });
      SA.store.commands.updateClip(
        clip.id,
        { spec: next },
        key ? { coalesceKey: `clip:${clip.id}:L${layerIndex}:${key}` } : undefined
      );
    };
    const heading = document.createElement('div');
    heading.className = 'insp-section-title';
    heading.textContent = t('filler.layers');
    body.appendChild(heading);

    layers.forEach((layer, index) => {
      const details = document.createElement('details');
      details.className = 'filler-layer';
      details.open = true;
      const summary = document.createElement('summary');
      const position = document.createElement('span');
      position.className = 'filler-layer-index';
      position.textContent = `#${index + 1}`;
      const typeSelect = selectControl(layer.type, fillerLayerTypes(), fillerTypeLabel, (type) => {
        const list = layers.map((entry) => JSON.parse(JSON.stringify(entry)));
        list[index] = SA.fillerRender.defaults(type);
        commit(list, null, index);
      });
      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'btn btn-mini';
      up.textContent = '↑';
      up.title = t('filler.layerUp');
      up.disabled = index === 0;
      up.addEventListener('click', () => {
        const list = layers.map((entry) => JSON.parse(JSON.stringify(entry)));
        [list[index - 1], list[index]] = [list[index], list[index - 1]];
        commit(list, null, index);
      });
      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'btn btn-mini';
      down.textContent = '↓';
      down.title = t('filler.layerDown');
      down.disabled = index === layers.length - 1;
      down.addEventListener('click', () => {
        const list = layers.map((entry) => JSON.parse(JSON.stringify(entry)));
        [list[index + 1], list[index]] = [list[index], list[index + 1]];
        commit(list, null, index);
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-mini';
      remove.textContent = '✕';
      remove.title = t('filler.layerRemove');
      remove.addEventListener('click', () => {
        commit(layers.filter((entry, at) => at !== index), null, index);
      });
      summary.appendChild(position);
      summary.appendChild(typeSelect);
      summary.appendChild(up);
      summary.appendChild(down);
      summary.appendChild(remove);
      // interactive controls inside a summary must not toggle the box
      summary.addEventListener('click', (event) => {
        if (event.target !== summary) event.preventDefault();
      });
      details.appendChild(summary);

      const params = { ...(layer.params || {}) };
      for (const param of fillerLayerParams(layer)) {
        const value = params[param.key] != null ? params[param.key] : param.default;
        const onChange = (next) => {
          const list = layers.map((entry) => JSON.parse(JSON.stringify(entry)));
          list[index] = { ...layer, params: { ...(layer.params || {}), [param.key]: next } };
          commit(list, param.key, index);
        };
        if (layer.type === 'textAnim' && param.key === 'text') {
          const control = SA.controls.textControl(value == null ? '' : String(value), onChange, { multiline: true });
          control.classList.add('cue-text');
          details.appendChild(control);
        } else {
          details.appendChild(fieldRow(fillerParamLabel(param.key), fillerParamControl(param, value, onChange, param.labelFor)));
        }
      }
      body.appendChild(details);
    });

    if (!layers.length) {
      const empty = document.createElement('div');
      empty.className = 'insp-inherit';
      empty.textContent = t('filler.layersEmpty');
      body.appendChild(empty);
    }

    // 3) add a layer
    const addRow = document.createElement('div');
    addRow.className = 'insp-actions';
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'btn btn-mini';
    addButton.textContent = `+ ${t('filler.addLayer')}`;
    addButton.addEventListener('click', () => {
      const list = layers.map((entry) => JSON.parse(JSON.stringify(entry)));
      list.push(SA.fillerRender.defaults('pattern'));
      commit(list, null, layers.length);
    });
    addRow.appendChild(addButton);
    body.appendChild(addRow);

    // 4) the user library row
    const libRow = document.createElement('div');
    libRow.className = 'filler-lib-row';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'ctrl-text';
    nameInput.placeholder = t('filler.myName');
    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'btn btn-mini btn-primary';
    saveButton.textContent = t('filler.saveMine');
    saveButton.addEventListener('click', () => {
      if (!SA.fillerLibrary) return;
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }
      SA.fillerLibrary.save(name, spec);
      nameInput.value = '';
    });
    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.className = 'btn btn-mini';
    exportButton.textContent = t('filler.export');
    exportButton.addEventListener('click', () => {
      if (SA.fillerLibrary) SA.fillerLibrary.exportFile();
    });
    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.className = 'btn btn-mini';
    importButton.textContent = t('filler.import');
    importButton.addEventListener('click', async () => {
      if (!SA.fillerLibrary) return;
      const result = await SA.fillerLibrary.importFile();
      if (result.canceled) return;
      SA.studio.toast('filler.imported', { added: result.added, rejected: result.rejected.length });
    });
    libRow.appendChild(nameInput);
    libRow.appendChild(saveButton);
    libRow.appendChild(exportButton);
    libRow.appendChild(importButton);
    const current = spec.presetId && SA.fillerLibrary ? SA.fillerLibrary.get(spec.presetId) : null;
    if (current && !current.builtin) {
      const renameButton = document.createElement('button');
      renameButton.type = 'button';
      renameButton.className = 'btn btn-mini';
      renameButton.textContent = t('filler.rename');
      renameButton.addEventListener('click', () => {
        const name = nameInput.value.trim() || current.name;
        SA.fillerLibrary.rename(current.id, name);
      });
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'btn btn-mini';
      deleteButton.textContent = t('filler.delete');
      deleteButton.addEventListener('click', () => {
        SA.fillerLibrary.remove(current.id);
      });
      libRow.appendChild(renameButton);
      libRow.appendChild(deleteButton);
    }
    body.appendChild(libRow);

    if (!fillerLibraryBound) {
      fillerLibraryBound = true;
      window.addEventListener('sa:filler-library', () => {
        const sel = selectionInfo();
        if (sel.kind !== 'clip') return;
        const currentDoc = project();
        const target = ((currentDoc && currentDoc.clips) || []).find((entry) => entry.id === sel.clipId);
        if (target && SA.project.trackKindOf(currentDoc, target.trackId) === 'filler') render();
      });
    }

    appendClipCommon(body, doc, clip);
  }

  function renderClipSection(container) {
    const doc = project();
    const clip = ((doc && doc.clips) || []).find((entry) => entry.id === selectionInfo().clipId);
    if (!clip) return;
    const kind = SA.project.trackKindOf(doc, clip.trackId) || 'background';
    const isBackground = kind === 'background';
    const body = section(container, 'clip', t('studio.inspector.clip'));
    const summary = document.createElement('div');
    summary.className = 'insp-inherit';
    summary.textContent = `${t(CLIP_KIND_LABELS[kind] || 'studio.inspector.clip')} · ${Number(clip.start).toFixed(2)}–${Number(clip.end).toFixed(2)}s`;
    body.appendChild(summary);

    const spec = clip.spec || { type: 'none', params: {} };
    // the animation tracks draw their own content: the inspector edits the
    // motif parameters or the clip's own text instead of the filler type list
    if (kind === 'figure') {
      const descriptor = { params: SA.fillerRender ? SA.fillerRender.paramsOf('figures') : [] };
      const params = { ...(spec.params || {}) };
      for (const param of SA.controls.paramEntries(descriptor)) {
        const value = params[param.key] != null ? params[param.key] : param.default;
        const control = SA.controls.paramControl('filler', param, value, (next) => {
          SA.store.commands.updateClip(clip.id, { spec: { ...spec, params: { ...params, [param.key]: next } } }, { coalesceKey: `clip:${clip.id}:${param.key}` });
        });
        body.appendChild(fieldRow(SA.controls.labelFor(param.key), control));
      }
      appendClipCommon(body, doc, clip);
      return;
    }
    if (kind === 'textAnim') {
      const params = { ...(spec.params || {}) };
      // the same multiline text box the beat text uses (no label)
      const text = SA.controls.textControl(params.text || '', (value) => {
        SA.store.commands.updateClip(clip.id, { spec: { ...spec, params: { ...params, text: value } } }, { coalesceKey: `clip:${clip.id}:text` });
      }, { multiline: true });
      text.classList.add('cue-text');
      body.appendChild(text);
      appendClipCommon(body, doc, clip, { colors: false });
      return;
    }
    if (kind === 'filler') {
      renderFillerClipEditor(body, doc, clip);
      return;
    }
    // `shapes` / `pattern` (and the pro primitives) live in the fx background
    // group; `shapeLayer` is the user-placeable shape clip built by shape-ops.
    const fxBackground = isBackground || spec.type === 'shapeLayer';
    const usedTypes = isBackground
      ? SA.fx.list('background', UI_PACKS).map((descriptor) => descriptor.type)
      : [...new Set(['none'].concat(SA.fillerRender ? SA.fillerRender.types() : []).concat('shapeLayer'))];
    const typeLabelFor = (type) => (isBackground || type === 'shapeLayer' ? SA.controls.typeLabel('background', type) : fillerTypeLabel(type));
    const typeSelect = selectControl(
      spec.type || 'none',
      [...new Set(usedTypes)],
      typeLabelFor,
      (type) => {
        const params = isBackground || type === 'shapeLayer' ? {} : SA.fillerRender ? SA.fillerRender.paramDefaults(type) : {};
        SA.store.commands.updateClip(clip.id, { spec: { type, params } });
      }
    );
    body.appendChild(fieldRow(t('studio.inspector.type'), typeSelect));

    const descriptor = fxBackground ? SA.fx.get('background', spec.type) : { params: SA.fillerRender ? SA.fillerRender.paramsOf(spec.type) : [] };
    const defaults = fxBackground ? {} : SA.fillerRender ? SA.fillerRender.paramDefaults(spec.type) : {};
    const params = { ...defaults, ...(spec.params || {}) };
    for (const param of SA.controls.paramEntries(descriptor)) {
      const value = params[param.key] != null ? params[param.key] : param.default;
      const control = SA.controls.paramControl(fxBackground ? 'background' : kind, param, value, (next) => {
        SA.store.commands.updateClip(
          clip.id,
          { spec: { ...spec, params: { ...params, [param.key]: next } } },
          { coalesceKey: `clip:${clip.id}:${param.key}` }
        );
      });
      body.appendChild(fieldRow(SA.controls.labelFor(param.key), control));
    }

    appendClipCommon(body, doc, clip);
  }

  function creditsToggle(labelText, checked, onChange) {
    const row = document.createElement('label');
    row.className = 'ctrl-bool-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!checked;
    box.addEventListener('change', () => onChange(box.checked));
    const label = document.createElement('span');
    label.textContent = labelText;
    row.appendChild(box);
    row.appendChild(label);
    return row;
  }

  function renderCreditsSection(container) {
    const doc = project();
    const mode = selectionInfo().creditMode || 'element';
    const settings = SA.credits.settingsFor(doc);
    const body = section(container, 'credits', t('credits.title'));
    const summary = document.createElement('div');
    summary.className = 'insp-inherit';
    summary.textContent = t(`credits.mode${mode.charAt(0).toUpperCase()}${mode.slice(1)}`);
    body.appendChild(summary);
    const preview = document.createElement('div');
    preview.className = 'insp-inherit';
    preview.textContent = SA.credits.expandTemplate(doc, settings, {}).join(' / ');
    body.appendChild(preview);

    const setMode = (patch) => SA.store.commands.setCredits({ modes: { [mode]: patch } });
    const config = settings.modes[mode] || {};
    body.appendChild(creditsToggle(t('credits.enabled'), config.enabled !== false, (value) => setMode({ enabled: value })));

    if (mode === 'element') {
      body.appendChild(
        fieldRow(
          t('credits.at'),
          selectControl(config.at || 'start', ['start', 'time'], (value) => t(value === 'start' ? 'credits.atStart' : 'credits.atTime'), (value) => setMode({ at: value }))
        )
      );
      body.appendChild(fieldRow(t('credits.time'), numberField(config.time == null ? 0 : config.time, { min: 0, step: 0.5, default: 0, kind: 'number' }, (value) => setMode({ time: value }))));
      body.appendChild(fieldRow(t('credits.duration'), numberField(config.duration == null ? 4 : config.duration, { min: 0.5, step: 0.5, default: 4, kind: 'number' }, (value) => setMode({ duration: value }))));
    } else if (mode === 'always') {
      body.appendChild(
        fieldRow(
          t('credits.position'),
          selectControl(
            config.position || 'topRight',
            ['topLeft', 'topRight', 'bottomLeft', 'bottomRight', 'lowerThird', 'custom'],
            (value) => t(`credits.position${value.charAt(0).toUpperCase()}${value.slice(1)}`),
            (value) => setMode({ position: value })
          )
        )
      );
      body.appendChild(fieldRow(t('credits.opacity'), numberField(config.opacity == null ? 0.85 : config.opacity, { min: 0, max: 1, step: 0.05, default: 0.85, kind: 'number' }, (value) => setMode({ opacity: value }))));
      body.appendChild(fieldRow(t('credits.scale'), numberField(config.scale == null ? 0.45 : config.scale, { min: 0.05, max: 2, step: 0.05, default: 0.45, kind: 'number' }, (value) => setMode({ scale: value }))));
      body.appendChild(creditsToggle(t('credits.hideDuringCues'), !!config.hideDuringCues, (value) => setMode({ hideDuringCues: value })));
    } else {
      body.appendChild(fieldRow(t('credits.duration'), numberField(config.duration == null ? 5 : config.duration, { min: 0.5, step: 0.5, default: 5, kind: 'number' }, (value) => setMode({ duration: value }))));
      body.appendChild(
        fieldRow(
          t('credits.endStyle'),
          selectControl(config.style || 'endCard', ['endCard', 'rollCredits'], (value) => t(value === 'endCard' ? 'credits.endCard' : 'credits.rollCredits'), (value) => setMode({ style: value }))
        )
      );
      body.appendChild(creditsToggle(t('credits.afterLastCue'), config.afterLastCue !== false, (value) => setMode({ afterLastCue: value })));
    }

    const actions = document.createElement('div');
    actions.className = 'layer-order';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'btn btn-mini';
    edit.textContent = t('credits.edit');
    edit.addEventListener('click', () => SA.creditsDialog.open(mode));
    actions.appendChild(edit);
    body.appendChild(actions);
  }

  function renderPalette(container) {
    const body = section(container, 'palette', t('studio.inspector.palette'));
    const style = resolvedStyle();
    const effective = style.palette && Array.isArray(style.palette.colors) && style.palette.colors.length ? style.palette : null;
    // the palette is edited at the selected level: nothing selected = the whole
    // project, a cue, or a beat (a line / word / letter edits its beat)
    const sel = selectionInfo();
    let scope = scopeOf(sel);
    if (!scope && sel.beatId) scope = { cueId: sel.cueId, beatId: sel.beatId };
    const scopeLabel = t(scope === 'project' ? 'studio.inspector.paletteScopeProject' : scope && scope.beatId ? 'studio.inspector.paletteScopeBeat' : 'studio.inspector.paletteScopeCue');
    const doc = project();
    const own = scope === 'project' ? doc.style : scope && scope.beatId ? doc.beatStyles[scope.beatId] : scope ? doc.cueStyles[scope.cueId] : null;
    const ownPalette = !!(own && own.palette);
    // the role schemes belong to the classic colour mode only: a beat on the
    // palette set (the default) never uses them
    const ownBeat = (scope && scope.beatId && doc.beatStyles && doc.beatStyles[scope.beatId]) || {};
    const beatLegacy = !scope || !scope.beatId || !!ownBeat.colorLegacy;
    const nameNode = document.createElement('div');
    nameNode.className = 'insp-inherit';
    const paletteName = effective ? `${effective.name || effective.id}` : t('studio.inspector.paletteNone');
    const schemeId = scope && scope.beatId && own ? own.colorScheme : null;
    nameNode.textContent = `${t('studio.inspector.paletteTarget', { scope: scopeLabel })} · ${paletteName}${scope !== 'project' && !ownPalette ? ` ${t('studio.inspector.inherited')}` : ''}`;
    body.appendChild(nameNode);
    // the beat colour scheme: an independent row carrying the standard /
    // inverted state and the invert / re-draw buttons
    if (scope && scope.beatId) {
      const roles = typeof SA !== 'undefined' && SA.paletteRoles ? SA.paletteRoles : null;
      const mode = (doc && doc.styleMode) || {};
      const axes = mode.axes || {};
      const rawWeird = Number(axes.weird);
      const schemeWeird = Number.isFinite(rawWeird) && rawWeird > 0 ? Math.min(1, rawWeird) : 0;
      const cueStyle = SA.project.resolveStyle(doc, `cue:${scope.cueId}`);
      const parentColors = cueStyle && cueStyle.palette && Array.isArray(cueStyle.palette.colors) ? cueStyle.palette.colors : [];
      const modeParams = SA.genParams && typeof SA.genParams.resolve === 'function' ? SA.genParams.resolve({ axes, params: mode.params || {} }) : null;
      const label = schemeId
        ? schemeId === (roles && roles.SCHEME_INVERT)
          ? t('studio.inspector.schemeInverted')
          : t('studio.inspector.schemeCustom', { id: schemeId })
        : t('studio.inspector.schemeStandard');
      const schemeRow = document.createElement('div');
      schemeRow.className = 'insp-actions scheme-row';
      const schemeText = document.createElement('span');
      schemeText.className = 'insp-inherit';
      schemeText.textContent = `${t('studio.inspector.scheme')}: ${label}`;
      schemeRow.appendChild(schemeText);
      const invertible = !!(roles && parentColors.length && roles.applyScheme(parentColors, roles.SCHEME_INVERT, schemeWeird));
      const invertButton = document.createElement('button');
      invertButton.type = 'button';
      invertButton.className = 'btn btn-mini';
      invertButton.textContent = t('studio.inspector.invertBeatScheme');
      invertButton.disabled = !invertible || !beatLegacy;
      invertButton.addEventListener('click', () => SA.store.commands.invertBeatScheme(scope.cueId, scope.beatId));
      const candidates = roles && parentColors.length ? roles.schemes(parentColors, schemeWeird, modeParams ? modeParams.schemeRange : undefined) : [];
      const rerollButton = document.createElement('button');
      rerollButton.type = 'button';
      rerollButton.className = 'btn btn-mini';
      rerollButton.textContent = t('studio.inspector.rerollBeatScheme');
      rerollButton.disabled = !candidates.length || !beatLegacy;
      rerollButton.addEventListener('click', () => SA.store.commands.rerollBeatScheme(scope.cueId, scope.beatId));
      schemeRow.appendChild(invertButton);
      schemeRow.appendChild(rerollButton);
      body.appendChild(schemeRow);
    }
    const swatches = document.createElement('div');
    swatches.className = 'palette-swatches';
    if (effective) {
      effective.colors.forEach((hex, index) => {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'palette-dot palette-dot-edit';
        swatch.style.background = hex;
        swatch.title = `${hex} — ${t('studio.inspector.paletteEdit')}`;
        swatch.addEventListener('click', () => {
          const key = `palette|${sel.path}|${index}|${Date.now()}`;
          SA.colors.openPicker({
            value: hex,
            anchor: swatch,
            onChange(next) {
              const value = typeof next === 'string' ? next : next && next.value ? next.value : null;
              if (!value || !scope) return;
              // read the palette again: earlier picks of this drag already moved it
              const latest = resolvedStyle().palette || effective;
              const colors = latest.colors.slice();
              colors[index] = value;
              SA.store.commands.setPalette(scope, { ...latest, colors }, { label: 'edit palette', coalesceKey: key });
            },
          });
        });
        swatches.appendChild(swatch);
      });
    } else {
      const none = document.createElement('span');
      none.className = 'panel-placeholder';
      none.textContent = t('studio.inspector.paletteNone');
      swatches.appendChild(none);
    }
    body.appendChild(swatches);

    const pickRow = document.createElement('div');
    pickRow.className = 'ctrl-row';
    pickRow.appendChild(
      SA.controls.selectControl({}, '', (value) => {
        if (!value) return;
        const entry = SA.colors.allPalettes().find((item) => item.id === value);
        if (entry && scope) SA.store.commands.setPalette(scope, { id: entry.id, name: entry.name, colors: [...entry.colors] }, { label: 'apply palette' });
      }, [
        { value: '', label: t('studio.inspector.paletteFrom') },
        ...SA.colors.allPalettes().map((entry) => ({ value: entry.id, label: entry.name })),
      ])
    );
    body.appendChild(pickRow);

    const actions = document.createElement('div');
    actions.className = 'insp-actions';
    const rerollButton = document.createElement('button');
    rerollButton.type = 'button';
    rerollButton.className = 'btn btn-mini';
    rerollButton.textContent = t('studio.inspector.paletteReroll');
    rerollButton.disabled = !scope;
    rerollButton.addEventListener('click', () => {
      if (scope) SA.store.commands.rerollPalette(scope);
    });
    actions.appendChild(rerollButton);
    const paletteDialogButton = document.createElement('button');
    paletteDialogButton.type = 'button';
    paletteDialogButton.className = 'btn btn-mini';
    paletteDialogButton.textContent = t('studio.generate.palette');
    paletteDialogButton.addEventListener('click', () => {
      if (SA.paletteDialog) SA.paletteDialog.open(scope || 'project');
    });
    actions.appendChild(paletteDialogButton);
    if (ownPalette && scope !== 'project') {
      const resetButton = document.createElement('button');
      resetButton.type = 'button';
      resetButton.className = 'btn btn-mini';
      resetButton.textContent = t('studio.inspector.reset');
      resetButton.addEventListener('click', () => SA.store.commands.resetPalette(scope));
      actions.appendChild(resetButton);
    }
    body.appendChild(actions);
    // theme editing entry points: current look -> new theme, or the theme list
    const themeActions = document.createElement('div');
    themeActions.className = 'insp-actions';
    const editTheme = document.createElement('button');
    editTheme.type = 'button';
    editTheme.className = 'btn btn-mini';
    editTheme.textContent = t('studio.settings.editTheme');
    editTheme.addEventListener('click', () => SA.themeEditor.open(null));
    const themeList = document.createElement('button');
    themeList.type = 'button';
    themeList.className = 'btn btn-mini';
    themeList.textContent = t('studio.settings.themes');
    themeList.addEventListener('click', () => SA.themes.dialog());
    const resetTheme = document.createElement('button');
    resetTheme.type = 'button';
    resetTheme.className = 'btn btn-mini';
    resetTheme.textContent = t('studio.themes.reset');
    resetTheme.addEventListener('click', () => {
      SA.store.commands.resetTheme();
      SA.studio.toast('studio.toast.themeReset');
    });
    themeActions.appendChild(editTheme);
    themeActions.appendChild(themeList);
    themeActions.appendChild(resetTheme);
    body.appendChild(themeActions);
  }

  function render() {
    if (!el.body) return;
    const sel = selectionInfo();
    const key = `${sel.raw}|${SA.store.state.project ? SA.store.state.project.meta.updatedAt : ''}|${SA.store.state.playhead.toFixed(3)}`;
    el.body.innerHTML = '';
    renderBreadcrumb(el.body);
    if (sel.kind === 'none') return;
    if (sel.kind === 'track') {
      renderTrackSection(el.body);
      lastSelection = key;
      return;
    }
    if (sel.raw.startsWith('layer:')) {
      renderLayerSection(el.body);
      lastSelection = key;
      return;
    }
    if (sel.kind === 'clip') {
      renderClipSection(el.body);
      lastSelection = key;
      return;
    }
    if (sel.kind === 'filler') {
      lastSelection = key;
      return;
    }
    if (sel.kind === 'credit') {
      renderCreditsSection(el.body);
      lastSelection = key;
      return;
    }
    renderCueSection(el.body);
    renderBeatSection(el.body);
    renderTransform(el.body);
    renderTextSection(el.body);
    renderLayersSummary(el.body);
    renderStyleSections(el.body);
    renderScopedSection(el.body);
    renderCustomMotions(el.body);
    renderClones(el.body);
    renderColor(el.body);
    renderPalette(el.body);
    lastSelection = key;
  }

  // The effect groups are grouped into readable sections: motion, foreground
  // text, the per-letter text background, the text ornaments and the overall
  // look.
  function renderStyleSections(container) {
    const heading = (key) => {
      const node = document.createElement('div');
      node.className = 'insp-section-title';
      node.textContent = t(key);
      container.appendChild(node);
    };
    const renderGroups = (groups) => {
      for (const group of groups) {
        if (STACK_GROUPS.includes(group)) renderStackGroup(container, group);
        else renderGroup(container, group);
      }
    };
    // The shape section of one group: the empty state offers Add, the active
    // state the full editor plus Remove.
    const shapeSection = (group, options) => {
      const opts = options || {};
      const style = resolvedStyle();
      const shape = style[group];
      const active = !!(shape && shape.type && shape.type !== 'none');
      if (!active) {
        const body = section(container, group, t(GROUP_LABELS[group]));
        const hint = document.createElement('div');
        hint.className = 'insp-inherit';
        hint.textContent = t(opts.emptyKey);
        body.appendChild(hint);
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'btn btn-mini';
        add.textContent = `+ ${t(opts.addKey)}`;
        add.addEventListener('click', () => writeProp(group, { type: opts.addType, params: SA.fx.paramDefaults(group, opts.addType), enabled: true }));
        body.appendChild(add);
      } else {
        renderGroups([group, ...(opts.companions || [])]);
        renderStackGroup(container, opts.edge);
        const actions = document.createElement('div');
        actions.className = 'insp-actions';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn btn-mini';
        remove.textContent = t(opts.removeKey);
        remove.addEventListener('click', () => writeProp(group, { type: 'none', params: {} }));
        actions.appendChild(remove);
        container.appendChild(actions);
      }
    };
    heading('studio.inspector.sectionMotion');
    renderGroups(['animation', 'layout', 'enter', 'exit', 'hold', 'location']);
    heading('studio.inspector.sectionText');
    renderGroups(['fill', 'edge', 'repeat']);
    heading('studio.inspector.sectionBg');
    // the subtitle track's background switch (data kept; the row's checkbox on
    // the timeline and this checkbox are the same flag)
    const selection = selectionInfo();
    const selectedCue = selection.cueId && SA.store.state.project ? SA.store.state.project.script.cues.find((entry) => entry.id === selection.cueId) : null;
    const cueTrack = selectedCue && SA.store.state.project ? (SA.store.state.project.tracks || []).find((entry) => entry.id === (selectedCue.trackId || 'sub1')) : null;
    if (cueTrack && cueTrack.kind === 'subtitle') {
      const row = document.createElement('label');
      row.className = 'insp-inherit';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !cueTrack.bgHidden;
      box.addEventListener('change', () => {
        SA.store.commands.updateTrack(cueTrack.id, { bgHidden: !box.checked });
      });
      const text = document.createElement('span');
      text.textContent = ` ${t('studio.inspector.bgTrackVisible')}`;
      row.appendChild(box);
      row.appendChild(text);
      container.appendChild(row);
    }
    shapeSection('bgShape', {
      addType: 'square',
      companions: ['bgFill', 'bgMotion'],
      edge: 'bgEdge',
      emptyKey: 'studio.inspector.bgEmpty',
      addKey: 'studio.inspector.bgAdd',
      removeKey: 'studio.inspector.bgRemove',
    });
    heading('studio.inspector.sectionOrn');
    shapeSection('ornShape', {
      addType: 'bar',
      companions: ['ornFill', 'ornMotion'],
      edge: 'ornEdge',
      emptyKey: 'studio.inspector.ornEmpty',
      addKey: 'studio.inspector.ornAdd',
      removeKey: 'studio.inspector.ornRemove',
    });
    heading('studio.inspector.sectionOverall');
    renderGroups(['post']);
  }

  function init() {
    el.body = document.getElementById('inspector-body');
    if (!el.body) return;
    render();
  }

  return { init, render, selectAt, cycleLevel, selectionInfo, scopeOf, localTimeFor, readEffective, valueFor, writeProp, isSetAtScope, addMotion };
})();
