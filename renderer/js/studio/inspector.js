window.SA = window.SA || {};

SA.inspector = (() => {
  'use strict';

  // the Studio lists every effect pack: the built-ins, the font size pack and
  // the extended primitives
  const UI_PACKS = { packs: ['font', 'pro'] };

  const MOTION_GROUPS = ['animation', 'layout', 'enter', 'exit', 'location', 'fill', 'hold', 'page'];
  const STACK_GROUPS = ['hold', 'edge', 'post', 'bgEdge', 'ornEdge'];
  const GROUP_LABELS = {
    page: 'studio.inspector.page',
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
    text: 'studio.inspector.text',
    ornShape: 'studio.inspector.ornShape',
    ornFill: 'studio.inspector.ornFill',
    ornEdge: 'studio.inspector.ornEdge',
    ornMotion: 'studio.inspector.ornMotion',
    repeat: 'studio.inspector.repeat',
    strike: 'studio.inspector.strike',
  };
  const CONTROL_GROUPS = ['page', 'animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post'];

  const el = {};
  let lastSelection = '';

  function t(key, vars) {
    return SA.i18n.t(key, vars);
  }

  function project() {
    return SA.store.state.project;
  }

  function trackDisplayName(track) {
    if (!track) return '';
    if (track.kind === 'subtitle') {
      const suffix = track.name && /^字幕/.test(track.name) ? track.name.replace(/^字幕/, '') : '';
      return /^字幕/.test(track.name) ? (t('studio.track.subtitle') + (suffix ? ' ' + suffix : '')) : (track.name || track.id);
    }
    if (track.kind === 'video' && /^ビデオ/.test(track.name || '')) {
      const suffix = track.name.replace(/^ビデオ/, '');
      return t('studio.track.video') + (suffix ? ' ' + suffix : '');
    }
    return track.name || track.id;
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
    if (raw.startsWith('clip:')) {
      const [clipPart, beatPart] = raw.slice('clip:'.length).split('/beat:');
      return { kind: 'clip', clipId: clipPart, clipBeat: beatPart != null ? Number(beatPart) : null, path: raw, raw };
    }
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

  // --- layer keyframes -------------------------------------------------------
  // Image layers animate by absolute keyframes on `layer:<id>` paths, evaluated
  // at a time local to the layer (`playhead - layer.start`).

  const LAYER_PROP_DEFAULTS = {
    'transform.x': 0,
    'transform.y': 0,
    'transform.rotate': 0,
    'transform.scale': 1,
    'transform.scaleX': 1,
    'transform.scaleY': 1,
    'transform.anchorX': 0.5,
    'transform.anchorY': 0.5,
    opacity: 1,
    'crop.l': 0,
    'crop.t': 0,
    'crop.r': 0,
    'crop.b': 0,
  };

  function layerKeyContext() {
    const sel = selectionInfo();
    if (!sel.raw.startsWith('layer:')) return null;
    const id = sel.raw.slice('layer:'.length);
    const layer = (project().layers || []).find((entry) => entry && entry.id === id);
    if (!layer) return null;
    return { layer, path: sel.raw, local: SA.store.state.playhead - (layer.start || 0) };
  }

  // The value at the playhead: the keyframe evaluation when SA.glLayers is
  // available, otherwise the static field, otherwise the default.
  function layerValueAt(ctx, prop) {
    const doc = project();
    let source = ctx.layer;
    if (SA.glLayers && typeof SA.glLayers.resolveLayerAt === 'function') {
      try {
        source = SA.glLayers.resolveLayerAt(ctx.layer, doc && doc.keyframes, SA.store.state.playhead) || ctx.layer;
      } catch {
        source = ctx.layer;
      }
    }
    const dot = prop.indexOf('.');
    const raw = dot < 0 ? source[prop] : ((source[prop.slice(0, dot)] || {})[prop.slice(dot + 1)]);
    if (raw == null) return LAYER_PROP_DEFAULTS[prop];
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : LAYER_PROP_DEFAULTS[prop];
  }

  // Key-aware write: a prop that already has a track gets a keyframe at the
  // local playhead (preserving the existing key's ease); otherwise the static
  // layer field is updated (transform / crop merged, never replaced wholesale).
  function setLayerProp(ctx, prop, value) {
    const doc = project();
    const tracks = doc.keyframes && doc.keyframes[ctx.path];
    const keys = tracks && tracks[prop];
    if (Array.isArray(keys) && keys.length) {
      const existing = keys.find((key) => Math.abs(key.t - ctx.local) < 1e-4);
      SA.store.commands.setKeyframe(ctx.path, prop, ctx.local, value, (existing && existing.ease) || 'linear', {
        coalesceKey: `${ctx.path}|${prop}`,
      });
      return;
    }
    const dot = prop.indexOf('.');
    if (dot < 0) {
      SA.store.commands.setLayer(ctx.layer.id, { [prop]: value }, { coalesceKey: `layer:${ctx.layer.id}:${prop}` });
      return;
    }
    const head = prop.slice(0, dot);
    const tail = prop.slice(dot + 1);
    SA.store.commands.setLayer(
      ctx.layer.id,
      { [head]: { ...((ctx.layer[head] || {})), [tail]: value } },
      { coalesceKey: `layer:${ctx.layer.id}:${prop}` }
    );
  }

  function appendKeyButton(node, propPath, title) {
    const layerCtx = layerKeyContext();
    if (layerCtx && LAYER_PROP_DEFAULTS[propPath] !== undefined) {
      const tracks = project().keyframes && project().keyframes[layerCtx.path];
      const track = tracks && tracks[propPath];
      const hasKey = Array.isArray(track) && track.some((key) => Math.abs(key.t - layerCtx.local) < 1e-3);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `btn btn-key${hasKey ? ' is-on' : ''}`;
      button.textContent = hasKey ? '◆' : '◇';
      button.title = hasKey ? t('studio.inspector.removeKey') : t('studio.inspector.addKey');
      button.addEventListener('click', () => {
        if (hasKey) {
          SA.store.commands.deleteKeyframeAt(layerCtx.path, propPath, layerCtx.local);
        } else {
          SA.store.commands.setKeyframe(layerCtx.path, propPath, layerCtx.local, layerValueAt(layerCtx, propPath), 'linear');
        }
      });
      node.appendChild(button);
      if (title) button.title = title;
      return;
    }
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

  // Two x/y-style numbers side by side in one row: each cell keeps its own
  // control, keyframe button and reset button, so `transform.x` and
  // `transform.y` (or scaleX/scaleY, tiltX/tiltY, ...) stay independently
  // keyframable while sharing one line of vertical space.
  // specs: [{ propPath, sub, control, noKey, noReset }]
  function pairRow(container, label, specs, options) {
    const opts = options || {};
    const node = document.createElement('div');
    node.className = 'ctrl-row is-pair';
    const labelNode = document.createElement('label');
    labelNode.className = 'ctrl-label';
    labelNode.textContent = label;
    node.appendChild(labelNode);
    const wrap = document.createElement('div');
    wrap.className = 'ctrl-pair';
    for (const spec of specs) {
      const cell = document.createElement('span');
      cell.className = 'ctrl-pair-cell';
      const tag = document.createElement('span');
      tag.className = 'ctrl-pair-tag';
      tag.textContent = spec.sub;
      cell.appendChild(tag);
      cell.appendChild(spec.control);
      wrap.appendChild(cell);
    }
    node.appendChild(wrap);
    const btns = document.createElement('span');
    btns.className = 'ctrl-pair-btns';
    node.appendChild(btns);
    for (const spec of specs) {
      if (!opts.noKey && !spec.noKey) {
        appendKeyButton(btns, spec.propPath);
        if (btns.lastChild) btns.lastChild.title += ` (${spec.sub})`;
      }
      if (!opts.noReset && !spec.noReset) {
        appendReset(btns, spec.propPath);
        if (btns.lastChild && btns.lastChild.classList.contains('btn-reset')) btns.lastChild.title += ` (${spec.sub})`;
      }
    }
    if (!opts.noReset && specs.some((spec) => !spec.noReset && isSetAtScope(spec.propPath))) node.classList.add('is-set');
    container.appendChild(node);
    return node;
  }

  // Consecutive descriptor params that form an x/y-style pair share one row
  // (offsetX/Y, edgeX/Y, selEaseHigh/Low, a numeric from/to range, and the
  // textenter2 tilted-axis start scale with its link toggle).
  const PARAM_PAIR_DEFS = [
    { keys: ['offsetX', 'offsetY'], subs: ['X', 'Y'] },
    { keys: ['edgeX', 'edgeY'], subs: ['X', 'Y'] },
    { keys: ['selEaseHigh', 'selEaseLow'], subs: ['High', 'Low'] },
    { keys: ['scaleFromX', 'scaleFromY'], subs: ['X', 'Y'], chain: true },
    { keys: ['from', 'to'], subs: ['From', 'To'], kinds: ['number', 'int'] },
  ];

  function paramPairAt(list, index) {
    const first = list[index];
    if (!first) return null;
    for (const def of PARAM_PAIR_DEFS) {
      if (first.key !== def.keys[0]) continue;
      const second = list[index + 1];
      if (!second || second.key !== def.keys[1]) continue;
      if (def.kinds && (!def.kinds.includes(first.kind) || !def.kinds.includes(second.kind))) continue;
      return { first, second, def };
    }
    return null;
  }

  // Walk a descriptor's params, pairing x/y-style neighbours into one row.
  // single(param) renders one param row; pair(first, second, def) renders the
  // shared row and skips the second param.
  function eachParam(descriptor, single, pair) {
    const list = SA.controls.paramEntries(descriptor);
    for (let i = 0; i < list.length; i += 1) {
      const match = paramPairAt(list, i);
      if (match && typeof pair === 'function') {
        pair(match.first, match.second, match.def);
        i += 1;
      } else {
        single(list[i]);
      }
    }
  }

  function paramPairLabel(first, second) {
    return `${SA.controls.labelFor(first.key)} / ${SA.controls.labelFor(second.key)}`;
  }

  // A chained x/y pair (textenter2 §2.2 scaleFrom): two tagged number inputs
  // with a link toggle between them. Linked edits write both params, so the
  // tilted axis stays invisible (uniform start scale). makeControl builds one
  // number input, setParam writes one param, propPathFor names the track.
  // Each param carries its resolved `current` value.
  function chainPairRow(container, label, first, second, subs, makeControl, setParam, propPathFor) {
    const params = [first, second];
    let linked = params[0].current === params[1].current;
    const node = document.createElement('div');
    node.className = 'ctrl-row is-pair';
    const labelNode = document.createElement('label');
    labelNode.className = 'ctrl-label';
    labelNode.textContent = label;
    node.appendChild(labelNode);
    const wrap = document.createElement('div');
    wrap.className = 'ctrl-pair';
    node.appendChild(wrap);
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'btn btn-mini';
    const paint = () => {
      link.textContent = linked ? '🔗' : '↔';
      link.title = t(linked ? 'studio.inspector.unlinkPair' : 'studio.inspector.linkPair');
    };
    link.addEventListener('click', () => {
      linked = !linked;
      if (linked) setParam(params[1].key, params[0].current);
      paint();
    });
    params.forEach((param, k) => {
      const cell = document.createElement('span');
      cell.className = 'ctrl-pair-cell';
      const tag = document.createElement('span');
      tag.className = 'ctrl-pair-tag';
      tag.textContent = subs[k];
      cell.appendChild(tag);
      cell.appendChild(makeControl(param, param.current, (next) => {
        setParam(param.key, next);
        if (linked) setParam(params[1 - k].key, next);
      }));
      wrap.appendChild(cell);
      if (k === 0) wrap.appendChild(link);
    });
    const btns = document.createElement('span');
    btns.className = 'ctrl-pair-btns';
    node.appendChild(btns);
    for (const param of params) {
      appendKeyButton(btns, propPathFor(param.key));
      appendReset(btns, propPathFor(param.key));
    }
    container.appendChild(node);
    paint();
    return node;
  }

  const BG_GROUPS = ['bgShape', 'bgFill', 'bgEdge', 'bgMotion'];
  const TEXT_GROUPS = ['text', 'fill', 'edge', 'repeat', 'clones'];
  // groups hidden by the track's graphics switch (`graphicsHidden`): the
  // text-attached extras (fill effects, repeats, strike and the ornaments).
  // Edges follow Text FG with the glyphs; clones follow Text FG while their
  // copies land apart from the glyphs. The base glyphs stay, so `text`
  // itself is not listed.
  const GRAPHICS_GROUPS = ['fill', 'strike', 'repeat', 'ornShape', 'ornFill', 'ornEdge', 'ornMotion'];

  function section(container, key, title) {
    const node = document.createElement('details');
    node.className = 'insp-section';
    node.open = true;
    // the text background groups of a track that hides its background stay
    // editable but greyed out: nothing of them is drawn
    if (BG_GROUPS.includes(key) && (selectedSubtitleTrack() || {}).bgHidden) {
      node.classList.add('insp-track-off');
      node.title = t('studio.inspector.bgTrackOff');
    }
    const textTrack = selectedSubtitleTrack();
    const textDisabled = (textTrack && textTrack.textHidden) || readEffective('text.enabled') === false;
    if (TEXT_GROUPS.includes(key) && textDisabled) {
      node.classList.add('insp-track-off');
      node.title = t('studio.inspector.textTrackOff');
    }
    // the graphics groups of a track that hides its graphics stay
    // editable but greyed out: only the base glyphs are drawn
    if (GRAPHICS_GROUPS.includes(key) && textTrack && textTrack.graphicsHidden && !node.classList.contains('insp-track-off')) {
      node.classList.add('insp-track-off');
      node.title = t('studio.inspector.graphicsTrackOff');
    }
    if (key === 'clip') {
      const doc = project();
      const sel = selectionInfo();
      const clip = ((doc && doc.clips) || []).find((entry) => entry.id === sel.clipId);
      const track = clip && ((doc && doc.tracks) || []).find((entry) => entry.id === clip.trackId);
      const layer = clip && SA.lyricsEngine && SA.lyricsEngine.figureLayerOf ? SA.lyricsEngine.figureLayerOf(clip.spec) : null;
      if (layer && track && SA.lyricsEngine && SA.lyricsEngine.figureLayerOn && !SA.lyricsEngine.figureLayerOn(layer, track, SA.store && SA.store.state ? SA.store.state.view : null)) {
        node.classList.add('insp-track-off');
        node.title = t('studio.inspector.figureLayerOff');
      }
    }
    const summary = document.createElement('summary');
    summary.textContent = title;
    node.appendChild(summary);
    const body = document.createElement('div');
    body.className = 'insp-body';
    node.appendChild(body);
    container.appendChild(node);
    return body;
  }

  // glyph-only orange action buttons pinned to the right of a section's
  // summary (the label lives in the tooltip). A click must not fold the
  // section, so the summary's own toggle is cancelled.
  function summaryActions(body, buttons) {
    const summary = body.parentNode && body.parentNode.querySelector('summary');
    if (!summary) return;
    const box = document.createElement('span');
    box.className = 'insp-summary-actions';
    for (const [glyph, titleKey, run] of buttons) {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'btn btn-mini insp-regen-btn btn-orange';
      node.textContent = glyph;
      node.title = t(titleKey);
      node.setAttribute('aria-label', t(titleKey));
      node.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        run();
      });
      box.appendChild(node);
    }
    summary.appendChild(box);
  }

  // right-aligned "enabled" checkbox + delete button for an entry header row
  function headActions(head, enabled, onEnabled, onRemove) {
    const actions = document.createElement('span');
    actions.className = 'insp-head-actions';
    const toggle = document.createElement('label');
    toggle.className = 'ctrl-bool-row insp-head-enabled';
    toggle.title = t('studio.inspector.enabled');
    toggle.appendChild(SA.controls.boolControl(enabled, onEnabled));
    actions.appendChild(toggle);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-mini';
    remove.textContent = '✕';
    remove.title = t('studio.inspector.delete');
    remove.addEventListener('click', onRemove);
    actions.appendChild(remove);
    head.appendChild(actions);
    return actions;
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

  // --- style copy / paste ----------------------------------------------------
  // Same picture, different words: copy the look of a cue/beat and paste it
  // elsewhere. Text and timing never travel — only the style bags, the
  // sub-element overrides and the keyframes.

  function copyStyleAt(path) {
    const ok = SA.store.commands.copyStyle(path);
    if (SA.studio && SA.studio.toast) SA.studio.toast(ok ? 'studio.toast.styleCopied' : 'studio.toast.error');
  }

  function pasteStyleAt(path) {
    if (!SA.store.commands.hasStyleClipboard()) {
      if (SA.studio && SA.studio.toast) SA.studio.toast('studio.toast.noStyleClipboard');
      return;
    }
    const ok = SA.store.commands.pasteStyle(path);
    if (SA.studio && SA.studio.toast) SA.studio.toast(ok ? 'studio.toast.stylePasted' : 'studio.toast.error');
  }

  // --- top toolbar ------------------------------------------------------------

  // The palette draw lives in a strip pinned to the top of the inspector, above
  // the breadcrumb; the cue / beat draws (reroll / vary / recolour / delete)
  // sit in their own section headers (summaryActions).
  function renderRegenBar(container) {
    const sel = selectionInfo();
    if (sel.kind !== 'cue' && sel.kind !== 'beat' && sel.kind !== 'line' && sel.kind !== 'word' && sel.kind !== 'letter') return;
    if (!sel.cueId) return;
    const bar = document.createElement('div');
    bar.className = 'insp-regen';
    const group = (labelKey, icon) => {
      const box = document.createElement('div');
      box.className = 'insp-regen-group';
      const tag = document.createElement('span');
      tag.className = 'insp-regen-tag';
      tag.textContent = icon;
      tag.title = t(labelKey);
      box.appendChild(tag);
      bar.appendChild(box);
      return box;
    };
    // a glyph-only icon button: the label lives in the tooltip, so the strip
    // stays narrow however long the translations get
    const drawButton = (box, glyph, titleKey, run) => {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'btn btn-mini insp-regen-btn';
      node.textContent = glyph;
      node.title = t(titleKey);
      node.setAttribute('aria-label', t(titleKey));
      node.addEventListener('click', run);
      box.appendChild(node);
      return node;
    };

    // the colours of the selected level: a line / word / letter edits its beat
    const colorScope = sel.beatId ? { cueId: sel.cueId, beatId: sel.beatId } : { cueId: sel.cueId };
    const colorBox = group('studio.inspector.palette', '◑');
    drawButton(colorBox, '◐', 'studio.inspector.paletteReroll', () => SA.store.commands.rerollPalette(colorScope));

    container.appendChild(bar);
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
      chip.textContent = `${t('layers.title')} · ${layer ? SA.layersDialog.slotLabel(layer) : t('layers.slotBackground')}`;
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
      chip.textContent = `${t(CLIP_KIND_LABELS[kind] || 'studio.inspector.clip')}${clip ? ` · ${(clip.spec && clip.spec.type) || ''}` : ''}${sel.clipBeat != null ? ` · #${sel.clipBeat + 1}` : ''}`;
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
      chip.textContent = track ? trackDisplayName(track) : sel.trackId;
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
    // the whole cue: a fresh enter / exit pair plus a new size ladder (🎲),
    // or a light pass over its beats that keeps the structure (🔀);
    // ◐ recolors each child beat on its own, ◑ recolors once and sets
    // the same colours on every child beat
    summaryActions(body, [
      ['🎲', 'studio.inspector.rerollCue', () => SA.store.commands.rerollCue(sel.cueId)],
      ['🔀', 'studio.inspector.varyCue', () => SA.store.commands.varyCue(sel.cueId)],
      ['◐', 'studio.inspector.recolorCueBeats', () => {
        const result = SA.store.commands.recolorCueBeats(sel.cueId, { mode: 'each' });
        if (result && SA.studio && SA.studio.toast) SA.studio.toast('studio.toast.colorsRerolled', { theme: Array.isArray(result) ? String(result.length) : '' });
      }],
      ['◑', 'studio.inspector.recolorCueBeatsSame', () => {
        const palette = SA.store.commands.recolorCueBeats(sel.cueId, { mode: 'same' });
        if (palette && SA.studio && SA.studio.toast) SA.studio.toast('studio.toast.colorsRerolled', { theme: palette.name || palette.id || '' });
      }],
      ['📋', 'studio.inspector.copyStyle', () => copyStyleAt(`cue:${sel.cueId}`)],
      ['📑', 'studio.inspector.pasteStyle', () => pasteStyleAt(`cue:${sel.cueId}`)],
      ['🗑', 'studio.beat.deleteCue', () => SA.store.commands.deleteCue(sel.cueId)],
    ]);
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
    const disableControl = SA.controls.boolControl(!cue.disabled, (value) => {
      SA.store.commands.setCueDisabled(sel.cueId, !value);
    });
    row(body, 'cue.enabled', t('studio.inspector.enabled'), disableControl, { noKey: true, noReset: true });
    const startControl = SA.controls.numberControl({ min: 0, step: 0.05, default: cue.start }, cue.start, (value) => {
      SA.store.commands.moveCue(sel.cueId, value, { coalesceKey: `cue:${sel.cueId}:start` });
    });
    const endControl = SA.controls.numberControl({ min: 0, step: 0.05, default: cue.end }, cue.end, (value) => {
      SA.store.commands.trimCue(sel.cueId, 'end', value, { coalesceKey: `cue:${sel.cueId}:end` });
    });
    pairRow(body, `${t('studio.inspector.start')} / ${t('studio.inspector.end')}`, [
      { propPath: 'cue.start', sub: t('studio.inspector.start'), control: startControl },
      { propPath: 'cue.end', sub: t('studio.inspector.end'), control: endControl },
    ]);
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
        subtitleTracks.map((track) => ({ value: track.id, label: trackDisplayName(track) }))
      );
      row(body, 'cue.trackId', t('studio.inspector.track'), trackSelect, { noKey: true, noReset: true });
    }
    const actions = document.createElement('div');
    actions.className = 'layer-order';
    const addBeat = document.createElement('button');
    addBeat.type = 'button';
    addBeat.className = 'btn btn-mini';
    addBeat.textContent = `+ ${t('studio.beat.addBeat')}`;
    addBeat.addEventListener('click', () => SA.store.commands.addBeat(sel.cueId));
    actions.appendChild(addBeat);
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
    // the selected beat: its own grammar only
    summaryActions(body, [
      ['🎲', 'studio.inspector.rerollBeat', () => SA.store.commands.rerollBeat(sel.cueId, beat.id)],
      ['🔀', 'studio.inspector.varyBeat', () => SA.store.commands.varyBeat(sel.cueId, beat.id)],
      ['◐', 'studio.inspector.recolorBeat', () => {
        const palette = SA.store.commands.rerollPalette({ cueId: sel.cueId, beatId: beat.id });
        if (palette && SA.studio && SA.studio.toast) SA.studio.toast('studio.toast.colorsRerolled', { theme: palette.name || palette.id || '' });
      }],
      ['📋', 'studio.inspector.copyStyle', () => copyStyleAt(`cue:${sel.cueId}/beat:${beat.id}`)],
      ['📑', 'studio.inspector.pasteStyle', () => pasteStyleAt(`cue:${sel.cueId}/beat:${beat.id}`)],
      ['🗑', 'studio.beat.deleteBeat', () => SA.store.commands.deleteBeat(sel.cueId, beat.id)],
    ]);
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
    // textenter2 §4.6: full-split the enter into per-letter / per-word scoped
    // entries, or drop the split entries again
    const beatBag = (doc.beatStyles || {})[beat.id] || {};
    const splitScoped = (beatBag.scoped || []).some((entry) => entry && entry.split === true)
      || (beatBag.post || []).some((entry) => entry && entry.split === true);
    if (splitScoped) {
      button('studio.beat.unsplitEnter', () => SA.store.commands.unsplitEnter(sel.cueId, beat.id));
    } else {
      button('studio.beat.splitEnterLetter', () => SA.store.commands.splitEnter(sel.cueId, beat.id, 'letter'));
      button('studio.beat.splitEnterWord', () => SA.store.commands.splitEnter(sel.cueId, beat.id, 'word'));
    }
    // jump to the neighbouring beat inside the same cue
    const beatList = (doc.beats[sel.cueId] || []).length ? doc.beats[sel.cueId] : cue && SA.lyricsEngine ? [SA.lyricsEngine.beatForCue(cue)].filter(Boolean) : [];
    const beatIndex = beatList.findIndex((entry) => entry && entry.id === beat.id);
    if (beatIndex > 0) button('studio.beat.prevBeat', () => selectAt(`cue:${sel.cueId}/beat:${beatList[beatIndex - 1].id}`));
    if (beatIndex >= 0 && beatIndex < beatList.length - 1) button('studio.beat.nextBeat', () => selectAt(`cue:${sel.cueId}/beat:${beatList[beatIndex + 1].id}`));
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
    const disableControl = SA.controls.boolControl(!beat.disabled, (value) => {
      SA.store.commands.setBeatDisabled(sel.cueId, beat.id, !value);
    });
    row(body, `beat:${beat.id}:enabled`, t('studio.inspector.enabled'), disableControl, { noKey: true, noReset: true });
    const startControl = SA.controls.numberControl({ min: 0, step: 0.05, default: beat.start }, beat.start, (value) => {
      SA.store.commands.moveBeatEdge(sel.cueId, beat.id, 'start', value, { coalesceKey: `beat:${beat.id}:start` });
    });
    const endControl = SA.controls.numberControl({ min: 0, step: 0.05, default: beat.end }, beat.end, (value) => {
      SA.store.commands.moveBeatEdge(sel.cueId, beat.id, 'end', value, { coalesceKey: `beat:${beat.id}:end` });
    });
    pairRow(body, `${t('studio.inspector.start')} / ${t('studio.inspector.end')}`, [
      { propPath: `beat:${beat.id}:start`, sub: t('studio.inspector.start'), control: startControl },
      { propPath: `beat:${beat.id}:end`, sub: t('studio.inspector.end'), control: endControl },
    ], { noKey: true, noReset: true });
  }

  function renderTransform(container) {
    const body = section(container, 'transform', t('studio.inspector.transform'));
    const single = (propPath, label, param, fallback) => {
      const value = readEffective(propPath);
      const control = SA.controls.numberControl(param, value == null ? fallback : value, (next) => writeProp(propPath, next));
      row(body, propPath, label, control);
    };
    const cell = (propPath, fallback, param) => {
      const value = readEffective(propPath);
      return SA.controls.numberControl(param, value == null ? fallback : value, (next) => writeProp(propPath, next));
    };
    // position X / Y in one row
    pairRow(body, `${SA.controls.prettify('x')} / ${SA.controls.prettify('y')}`, [
      { propPath: 'transform.x', sub: 'X', control: cell('transform.x', 0, { step: 0.01, default: 0 }) },
      { propPath: 'transform.y', sub: 'Y', control: cell('transform.y', 0, { step: 0.01, default: 0 }) },
    ]);
    single('transform.rotate', SA.controls.prettify('rotate'), { step: 0.01, default: 0 }, 0);
    // the uniform scale stays for older projects (the engine multiplies
    // scale * scaleX * scaleY); the per-axis pair below is the decomposed one
    single('transform.scale', SA.controls.prettify('scale'), { min: 0, step: 0.01, default: 1 }, 1);
    pairRow(body, `${SA.controls.prettify('scaleX')} / ${SA.controls.prettify('scaleY')}`, [
      { propPath: 'transform.scaleX', sub: 'X', control: cell('transform.scaleX', 1, { min: 0, step: 0.01, default: 1 }) },
      { propPath: 'transform.scaleY', sub: 'Y', control: cell('transform.scaleY', 1, { min: 0, step: 0.01, default: 1 }) },
    ]);
    pairRow(body, `${SA.controls.prettify('tiltX')} / ${SA.controls.prettify('tiltY')}`, [
      { propPath: 'transform.tiltX', sub: 'X', control: cell('transform.tiltX', 0, { step: 0.01, default: 0 }) },
      { propPath: 'transform.tiltY', sub: 'Y', control: cell('transform.tiltY', 0, { step: 0.01, default: 0 }) },
    ]);
    single('transform.opacity', SA.controls.prettify('opacity'), { min: 0, max: 1, step: 0.01, default: 1 }, 1);
  }

  function renderTextSection(container) {
    const body = section(container, 'text', t('studio.inspector.text'));
    const textEnabled = readEffective('text.enabled') !== false;
    row(body, 'text.enabled', t('studio.inspector.enabled'), SA.controls.boolControl(textEnabled, (v) => writeProp('text.enabled', v)), { noKey: true });
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
    if (group === 'animation') {
      const adsr = motion.adsr || {};
      heading('studio.inspector.adsr');
      const presetPath = `${group}.motion.adsr`;
      row(body, presetPath, t('studio.inspector.adsrPreset'),
        SA.controls.selectControl({}, '', (next) => {
          if (!next) return;
          writeProp(presetPath, next === 'off' ? null : { ...SA.adsr.PRESETS[next] });
        }, [{ value: '', label: t('studio.inspector.selectPreset') }, ...['pluck', 'stab', 'pad', 'swell', 'off']
          .map((value) => ({ value, label: t(`studio.inspector.adsr_${value}`) }))]),
        { noKey: true, noReset: true });
      const ADSR_FIELDS_LIST = [
        { key: 'attack', kind: 'number', min: 0, step: 0.05, default: 0.5 },
        { key: 'attackEase', kind: 'ease' },
        { key: 'decay', kind: 'number', min: 0, step: 0.05, default: 0 },
        { key: 'decayEase', kind: 'ease' },
        { key: 'sustain', kind: 'number', min: 0, step: 0.05, default: 1 },
        { key: 'release', kind: 'number', min: 0, step: 0.05, default: 0.4 },
        { key: 'releaseEase', kind: 'ease' },
        { key: 'peak', kind: 'number', min: 0, step: 0.05, default: 1 },
        { key: 'punch', kind: 'number', min: 0, step: 0.05, default: 0 },
      ];
      for (const field of ADSR_FIELDS_LIST) {
        const propPath = `${group}.motion.adsr.${field.key}`;
        let control;
        if (field.kind === 'ease') {
          const easeDefault = field.key === 'decayEase' ? 'easeOutCubic' : 'linear';
          control = SA.controls.easeControl(adsr[field.key] || easeDefault, (next) => writeProp(propPath, next));
        } else {
          control = SA.controls.numberControl({ min: field.min, step: field.step, default: field.default }, adsr[field.key] == null ? field.default : adsr[field.key], (next) => writeProp(propPath, next));
        }
        row(body, propPath, t(`studio.inspector.adsr_${field.key}`), control, { noKey: true, noReset: true });
      }
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
      head.appendChild(up);
      head.appendChild(down);
      const update = (patch, coalesceKey) => {
        const next = list.map((entry, i) => (i === index ? { ...entry, ...patch } : entry));
        writeProp('motions', next, { coalesceKey });
      };
      headActions(head, motion.enabled !== false, (value) => update({ enabled: value }), () => writeProp('motions', list.filter((entry, i) => i !== index)));
      box.appendChild(head);
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
      const buildControl = (param) => SA.controls.paramControl(
        phase,
        param,
        params[param.key],
        (value) => update({ params: { ...params, [param.key]: value } }, `motion:${motion.id}:${param.key}`),
        { palette: style.palette || null, slotLabel: t('studio.inspector.palette') }
      );
      eachParam(descriptor,
        (param) => box.appendChild(fieldRow(SA.controls.labelFor(param.key), buildControl(param))),
        (first, second, def) => {
          const { row: node } = fieldRowPair(paramPairLabel(first, second), [first, second].map((param, k) => ({ sub: def.subs[k], control: buildControl(param) })));
          box.appendChild(node);
        });
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
      head.appendChild(up);
      head.appendChild(down);
      const key = clone.id || `clone_${index}`;
      const update = (patch, coalesceKey) => {
        const next = list.map((entry, i) => (i === index ? { ...entry, ...patch } : entry));
        writeProp('clones', next, { coalesceKey });
      };
      headActions(head, clone.enabled !== false, (value) => update({ enabled: value }), () => writeProp('clones', list.filter((entry, i) => i !== index)));
      box.appendChild(head);
      // dx / dy share one row
      {
        const cells = [
          { field: 'dx', sub: 'X', value: clone.dx == null ? 0 : clone.dx, param: { step: 0.01, default: 0 } },
          { field: 'dy', sub: 'Y', value: clone.dy == null ? 0 : clone.dy, param: { step: 0.01, default: 0 } },
        ].map((entry) => ({
          sub: entry.sub,
          control: SA.controls.numberControl(entry.param, entry.value, (next) => update({ [entry.field]: next }, `${key}:${entry.field}`)),
        }));
        const { row: pair } = fieldRowPair(`${t('studio.clones.dx')} / ${t('studio.clones.dy')}`, cells);
        box.appendChild(pair);
      }
      const fields = [
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
      box.appendChild(renderClonePerLetter(clone, key, update));
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

  function renderClonePerLetter(clone, key, update) {
    const details = document.createElement('details');
    details.className = 'insp-perletter';
    const summary = document.createElement('summary');
    summary.textContent = t('studio.clones.perLetter');
    details.appendChild(summary);
    const per = clone.perLetter && typeof clone.perLetter === 'object' ? clone.perLetter : null;
    const perUpdate = (patch, coalesceKey) => {
      update({ perLetter: { ...(per || {}), ...patch } }, coalesceKey || `${key}:perLetter`);
    };
    const DEFAULTS = {
      vary: 'alternate', dx: [0, 0], dy: [0.02, 0.04], opacity: [0.4, 0.8],
      skew: [0, 0], rotate: [0, 0], colors: [], fonts: [],
    };
    const enabledBox = document.createElement('input');
    enabledBox.type = 'checkbox';
    enabledBox.checked = !!(per && per.enabled !== false);
    enabledBox.addEventListener('change', () => {
      if (enabledBox.checked) update({ perLetter: { ...DEFAULTS, ...(per || {}), enabled: true } }, `${key}:perEnabled`);
      else perUpdate({ enabled: false }, `${key}:perEnabled`);
    });
    const enabledRow = document.createElement('label');
    enabledRow.className = 'insp-inherit';
    enabledRow.appendChild(enabledBox);
    const enabledText = document.createElement('span');
    enabledText.textContent = ` ${t('studio.clones.perLetter')}`;
    enabledRow.appendChild(enabledText);
    details.appendChild(enabledRow);
    const current = { ...DEFAULTS, ...(per || {}) };
    const varyOptions = ['alternate', 'random', 'wave', 'ramp', 'cycle'].map((value) => ({ value, label: SA.controls.valueLabel(value) }));
    details.appendChild(
      fieldRow(
        t('studio.clones.vary'),
        SA.controls.selectControl({}, current.vary || 'alternate', (value) => perUpdate({ vary: value }, `${key}:perVary`), varyOptions)
      )
    );
    const rangeRow = (field, param) => {
      const pair = Array.isArray(current[field]) ? current[field] : [0, 0];
      const wrap = document.createElement('div');
      wrap.className = 'ctrl-vec2';
      const commit = (index, next) => {
        const list = Array.isArray(per && per[field]) ? [...per[field]] : [pair[0], pair[1]];
        list[index] = next;
        perUpdate({ [field]: list }, `${key}:per${field}`);
      };
      for (const index of [0, 1]) {
        const control = SA.controls.numberControl(param, pair[index], (next) => commit(index, next));
        const tag = document.createElement('span');
        tag.className = 'ctrl-label';
        tag.textContent = index === 0 ? t('studio.clones.min') : t('studio.clones.max');
        const cell = document.createElement('span');
        cell.appendChild(tag);
        cell.appendChild(control);
        wrap.appendChild(cell);
      }
      return fieldRow(t(`studio.clones.${field}`), wrap);
    };
    details.appendChild(rangeRow('dx', { step: 0.005, default: 0 }));
    details.appendChild(rangeRow('dy', { step: 0.005, default: 0 }));
    details.appendChild(rangeRow('opacity', { min: 0, max: 1, step: 0.05, default: 0.5 }));
    details.appendChild(rangeRow('skew', { step: 1, default: 0 }));
    details.appendChild(rangeRow('rotate', { step: 1, default: 0 }));
    details.appendChild(
      fieldRow(
        t('studio.clones.colors'),
        SA.controls.colorsControl(Array.isArray(current.colors) ? current.colors : [], (next) => perUpdate({ colors: next }, `${key}:perColors`))
      )
    );
    details.appendChild(fieldRow(t('studio.clones.fonts'), renderCloneFontChoices(Array.isArray(current.fonts) ? current.fonts : [], (next) => perUpdate({ fonts: next }, `${key}:perFonts`))));
    details.appendChild(
      fieldRow(
        t('studio.clones.seed'),
        SA.controls.numberControl({ min: 0, step: 1, default: 0 }, current.seed == null ? 0 : current.seed, (next) => perUpdate({ seed: Math.round(next) }, `${key}:perSeed`))
      )
    );
    details.appendChild(
      fieldRow(
        t('studio.clones.waveFreq'),
        SA.controls.numberControl({ min: 1, step: 1, default: 1 }, current.waveFreq == null ? 1 : current.waveFreq, (next) => perUpdate({ waveFreq: next }, `${key}:perWaveFreq`))
      )
    );
    return details;
  }

  // per-letter clone typefaces: one checkbox per font choice, showing the
  // choice label instead of the raw value
  function renderCloneFontChoices(value, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'ctrl-multiselect';
    const choices = SA.controls.fontChoices();
    const selected = new Set(Array.isArray(value) ? value : []);
    for (const choice of choices) {
      const label = document.createElement('label');
      label.className = 'ctrl-bool-row';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = selected.has(choice.value);
      box.addEventListener('change', () => {
        if (box.checked) selected.add(choice.value);
        else selected.delete(choice.value);
        onChange([...selected]);
      });
      const text = document.createElement('span');
      text.textContent = choice.label;
      label.appendChild(box);
      label.appendChild(text);
      wrap.appendChild(label);
    }
    return wrap;
  }

  function instanceFor(group) {
    const style = resolvedStyle();
    const value = style[group];
    return value && value.type ? value : SA.fx.defaultsFor(group);
  }

  // textenter2 §3.3/§4.5: choosing an enter type with a companion writes the
  // sidecar groups that are still unset. Only cue/beat/project scope; the
  // scoped (substring) companions are added by hand in the scoped section.
  function applyCompanion(group, type) {
    if (!SA.fx.companionOf) return;
    const companion = SA.fx.companionOf(group, type);
    if (!companion) return;
    const sel = selectionInfo();
    if (sel.kind === 'letter' || sel.kind === 'word' || sel.kind === 'line') return;
    const style = scopeContainer();
    for (const [cGroup, value] of Object.entries(companion)) {
      const current = style[cGroup];
      if (Array.isArray(current)) {
        const entries = Array.isArray(value) ? value : [value];
        let changed = false;
        const next = [...current];
        for (const item of entries) {
          if (!item || !item.type) continue;
          if (next.some((entry) => entry && entry.type === item.type)) continue;
          next.push(JSON.parse(JSON.stringify(item)));
          changed = true;
        }
        if (changed) writeProp(cGroup, next);
      } else {
        if (current && current.type && current.type !== 'none') continue;
        writeProp(cGroup, JSON.parse(JSON.stringify(value)));
      }
    }
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
      if (next !== '__inherit') applyCompanion(group, next);
    }, entries);
    const typeRow = row(body, group, t('studio.inspector.type'), typeControl);
    if (explicit) {
      // delete: switch the effect off when the group has a "none" type,
      // otherwise drop the override so it follows the inherited value again
      headActions(
        typeRow,
        explicit.enabled !== false,
        (value) => writeProp(`${group}.enabled`, value),
        () => {
          const hasNone = SA.fx.list(group, UI_PACKS).some((descriptor) => descriptor.type === 'none');
          writeProp(group, hasNone ? { type: 'none', params: {} } : null, { coalesceKey: `${group}:type` });
        }
      );
    } else {
      const inherit = document.createElement('div');
      inherit.className = 'insp-inherit';
      inherit.textContent = t('studio.inspector.inheritedHint');
      body.appendChild(inherit);
      // switching an inherited effect off pins the inherited instance with enabled: false
      if (instance && instance.type && instance.type !== 'none') {
        const enabledRow = document.createElement('label');
        enabledRow.className = 'ctrl-bool-row';
        enabledRow.textContent = t('studio.inspector.enabled');
        enabledRow.appendChild(
          SA.controls.boolControl(instance.enabled !== false, (value) => writeProp(group, { ...instance, enabled: value }, { coalesceKey: `${group}:type` }))
        );
        body.appendChild(enabledRow);
      }
    }
    if (group === 'page') {
      const presetBtn = document.createElement('button');
      presetBtn.type = 'button';
      presetBtn.className = 'btn btn-mini btn-accent';
      presetBtn.style.marginTop = '4px';
      presetBtn.textContent = `✦ ${t('studio.inspector.selectPreset') || 'プリセットを選択…'}`;
      presetBtn.addEventListener('click', () => {
        if (SA.pageDialog && SA.pageDialog.open) SA.pageDialog.open();
      });
      body.appendChild(presetBtn);
    }
    if (group === 'layout') {
      const pageInst = style.page;
      if (pageInst && pageInst.type && pageInst.type !== 'none' && pageInst.enabled !== false) {
        const pageNotice = document.createElement('div');
        pageNotice.className = 'insp-inherit insp-page-notice';
        pageNotice.textContent = t('studio.inspector.pageActiveNotice') || '※ 紙面レイアウト有効中';
        body.appendChild(pageNotice);
      }
    }
    const descriptor = SA.fx.get(group, instance && instance.type);
    const params = (instance && instance.params) || {};
    const paletteOpts = { palette: style.palette || null, slotLabel: t('studio.inspector.palette') };
    const singleParam = (param) => {
      const value = params[param.key] != null ? params[param.key] : param.default;
      const propPath = `${group}.params.${param.key}`;
      const control = SA.controls.paramControl(group, param, value, (next) => writeProp(propPath, next), paletteOpts);
      row(body, propPath, SA.controls.labelFor(param.key), control);
    };
    const pairParams = (first, second, def) => {
      if (def.chain) {
        const enriched = [first, second].map((param) => ({ ...param, current: params[param.key] != null ? params[param.key] : param.default }));
        chainPairRow(body, paramPairLabel(first, second), enriched[0], enriched[1], def.subs,
          (param, value, onChange) => SA.controls.paramControl(group, param, value, onChange, paletteOpts),
          (key, next) => writeProp(`${group}.params.${key}`, next),
          (key) => `${group}.params.${key}`);
        return;
      }
      const specs = [first, second].map((param, k) => {
        const value = params[param.key] != null ? params[param.key] : param.default;
        const propPath = `${group}.params.${param.key}`;
        const control = SA.controls.paramControl(group, param, value, (next) => writeProp(propPath, next), paletteOpts);
        return { propPath, sub: def.subs[k], control };
      });
      pairRow(body, paramPairLabel(first, second), specs);
    };
    eachParam(descriptor, singleParam, pairParams);
    if (MOTION_GROUPS.includes(group)) renderMotion(container, group, instance);
    void typeRow;
  }

  // The subtitle track the selected cue sits on (null for a non-subtitle selection).
  function selectedSubtitleTrack() {
    const project = SA.store.state.project;
    if (!project) return null;
    const selection = selectionInfo();
    const cue = selection.cueId ? project.script.cues.find((entry) => entry.id === selection.cueId) : null;
    const track = cue ? (project.tracks || []).find((entry) => entry.id === (cue.trackId || 'sub1')) : null;
    return track && track.kind === 'subtitle' ? track : null;
  }

  function renderStackGroup(container, group) {
    const style = resolvedStyle();
    // a graphic (post) the track's graphics row hides stays editable
    // but greyed out: it is not drawn
    const graphicsOff = group === 'post' && !!(selectedSubtitleTrack() || {}).graphicsHidden;
    const list = Array.isArray(style[group]) ? style[group] : [];
    const body = section(container, group, t(GROUP_LABELS[group]));
    // objeffects §5-2: only the first physics hold simulates; a second one
    // (softBody/gravityHang/motionBend stacked) is inert — say so in place.
    if (group === 'hold') {
      const physCount = list.filter((entry) => {
        if (!entry || entry.enabled === false) return false;
        const descriptor = SA.fx.get('hold', entry.type);
        return descriptor && typeof descriptor.physics === 'function';
      }).length;
      if (physCount >= 2) {
        const warn = document.createElement('div');
        warn.className = 'insp-orphans';
        warn.textContent = t('studio.inspector.physicsStack');
        body.appendChild(warn);
      }
    }
    list.forEach((instance, index) => {
      const box = document.createElement('div');
      box.className = 'insp-stack-item';
      if (graphicsOff) {
        box.classList.add('insp-track-off');
        box.title = t('studio.inspector.graphicsTrackOff');
      }
      const head = document.createElement('div');
      head.className = 'insp-stack-head';
      head.appendChild(
        SA.controls.selectControl({}, instance.type, (next) => {
          const nextList = list.map((entry, i) => (i === index ? { ...entry, type: next, params: {} } : entry));
          writeProp(group, nextList, { coalesceKey: `${group}:${index}:type` });
        }, SA.fx.list(group, UI_PACKS).map((descriptor) => ({ value: descriptor.type, label: SA.controls.typeLabel(group, descriptor.type) })))
      );
      headActions(
        head,
        instance.enabled !== false,
        (value) => writeProp(group, list.map((entry, i) => (i === index ? { ...entry, enabled: value } : entry))),
        () => writeProp(group, list.filter((entry, i) => i !== index))
      );
      box.appendChild(head);
      const descriptor = SA.fx.get(group, instance.type);
      const params = instance.params || {};
      // the header checkbox is the one on / off switch of a stack entry; the
      // layer's own `enabled` parameter would be a second, confusing one
      const visible = { ...(descriptor || {}), params: ((descriptor && descriptor.params) || []).filter((param) => !(group === 'post' && param.key === 'enabled')) };
      const paletteOpts = { palette: style.palette || null, slotLabel: t('studio.inspector.palette') };
      const singleParam = (param) => {
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
          paletteOpts
        );
        row(box, propPath, SA.controls.labelFor(param.key), control);
      };
      const pairParams = (first, second, def) => {
        const specs = [first, second].map((param, k) => {
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
            paletteOpts
          );
          return { propPath, sub: def.subs[k], control };
        });
        pairRow(box, paramPairLabel(first, second), specs);
      };
      eachParam(visible, singleParam, pairParams);
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

  const SCOPED_GROUPS = ['enter', 'exit', 'hold', 'fill', 'edge', 'bgFill', 'bgShape', 'bgMotion', 'text'];
  const SCOPE_KINDS = ['all', 'range', 'word', 'keyword', 'span', 'nth', 'slice'];
  const SCOPE_KIND_LABELS = {
    all: 'studio.inspector.scopeAll',
    range: 'studio.inspector.scopeRange',
    word: 'studio.inspector.scopeWord',
    keyword: 'studio.inspector.scopeKeyword',
    span: 'studio.inspector.scopeSpan',
    nth: 'studio.inspector.scopeNth',
    slice: 'studio.inspector.scopeSlice',
  };
  // The scoped background colour is a plain fill: a per-letter gradient would
  // need a per-letter overlay pass. These groups list every type of their own
  // (`bgShape` / `text` register no packed entry and `solid` is the text fill),
  // so the picker is never empty for them.
  const SCOPED_TYPE_LIMIT = { bgFill: ['solid'] };
  const SCOPED_ALL_PACKS = new Set(['fill', 'bgFill', 'bgShape', 'text']);
  function scopedTypes(group) {
    const list = SA.fx.list(group, SCOPED_ALL_PACKS.has(group) ? { packs: 'all' } : UI_PACKS);
    const limit = SCOPED_TYPE_LIMIT[group];
    return limit ? list.filter((descriptor) => limit.includes(descriptor.type)) : list;
  }
  // A letter-wise preset pins the scope that makes its attribute letter-wise, so
  // picking the type adopts it instead of leaving the letters unscoped.
  function scopedDefaultScope(group, type) {
    const descriptor = SA.fx.get(group, type);
    const scope = descriptor && descriptor.defaults ? descriptor.defaults.scope : null;
    return scope ? JSON.parse(JSON.stringify(scope)) : null;
  }

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
          const descriptors = scopedTypes(next);
          const type = descriptors.length ? descriptors[0].type : item.type;
          update(list.map((item, i) => (i === index ? { ...item, group: next, type, params: {}, scope: scopedDefaultScope(next, type) || item.scope || null } : item)));
        }, SCOPED_GROUPS.map((group) => ({ value: group, label: t(GROUP_LABELS[group]) })))
      );
      head.appendChild(
        SA.controls.selectControl({}, entry.type, (next) => {
          update(list.map((item, i) => (i === index ? { ...item, type: next, params: {}, scope: scopedDefaultScope(item.group || 'hold', next) || item.scope || null } : item)));
        }, scopedTypes(entry.group || 'hold').map((descriptor) => ({ value: descriptor.type, label: SA.controls.typeLabel(entry.group || 'hold', descriptor.type) })))
      );
      headActions(
        head,
        entry.enabled !== false,
        (value) => update(list.map((item, i) => (i === index ? { ...item, enabled: value } : item))),
        () => update(list.filter((item, i) => i !== index))
      );
      box.appendChild(head);

      // the scope editor
      const scope = entry.scope && entry.scope.kind ? entry.scope : { kind: 'all' };
      const setScope = (patch) => update(list.map((item, i) => (i === index ? { ...item, scope: { ...scope, ...patch } } : item)));
      row(box, `scoped.${index}.kind`, t('studio.inspector.scopeKind'), SA.controls.selectControl({}, scope.kind || 'all', (next) => setScope({ kind: next }), SCOPE_KINDS.map((kind) => ({ value: kind, label: t(SCOPE_KIND_LABELS[kind]) }))));
      if (scope.kind === 'range') {
        pairRow(box, `${t('studio.inspector.scopeFrom')} / ${t('studio.inspector.scopeTo')}`, [
          { propPath: `scoped.${index}.from`, sub: t('studio.inspector.scopeFrom'), control: SA.controls.numberControl(numberParam('from', 0, 999, 1, 0), scope.from == null ? 0 : scope.from, (next) => setScope({ from: next }), { noSlider: true }) },
          { propPath: `scoped.${index}.to`, sub: t('studio.inspector.scopeTo'), control: SA.controls.numberControl(numberParam('to', 0, 999, 1, 0), scope.to == null ? '' : scope.to, (next) => setScope({ to: next }), { noSlider: true }) },
        ]);
      } else if (scope.kind === 'word') {
        row(box, `scoped.${index}.words`, t('studio.inspector.scopeWords'), SA.controls.textControl((scope.words || []).join(','), (next) => {
          const words = String(next).split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value));
          setScope({ words });
        }));
      } else if (scope.kind === 'keyword') {
        row(box, `scoped.${index}.match`, t('studio.inspector.scopeMatch'), SA.controls.textControl(scope.match || '', (next) => setScope({ match: String(next) })));
      } else if (scope.kind === 'span') {
        row(box, `scoped.${index}.spanIndex`, t('studio.inspector.scopeSpanIndex'), SA.controls.numberControl(numberParam('spanIndex', 0, 31, 1, 0), scope.spanIndex == null ? 0 : scope.spanIndex, (next) => setScope({ spanIndex: next }), { noSlider: true }));
      } else if (scope.kind === 'nth') {
        // the word / line units need the wrapped layout, which only exists once
        // the scene is built, so they are not offered on the `text` group
        const units = entry.group === 'text' ? ['letter'] : ['letter', 'word', 'line'];
        const unit = units.includes(scope.unit) ? scope.unit : 'letter';
        row(box, `scoped.${index}.unit`, t('studio.inspector.scopeUnit'), SA.controls.selectControl({}, unit, (next) => setScope({ unit: next }), units.map((value) => ({ value, label: t(`fx.value.${value}`) }))));
        row(box, `scoped.${index}.every`, t('studio.inspector.scopeEvery'), SA.controls.numberControl(numberParam('every', 1, 64, 1, 2), scope.every == null ? 2 : scope.every, (next) => setScope({ every: next }), { noSlider: true }));
        row(box, `scoped.${index}.offset`, t('studio.inspector.scopeOffset'), SA.controls.numberControl(numberParam('offset', 0, 63, 1, 0), scope.offset == null ? 0 : scope.offset, (next) => setScope({ offset: next }), { noSlider: true }));
        row(box, `scoped.${index}.skipSpaces`, t('studio.inspector.scopeSkipSpaces'), SA.controls.boolControl(scope.skipSpaces !== false, (value) => setScope({ skipSpaces: value })));
      } else if (scope.kind === 'slice') {
        // N letters from the head or the tail of the whole text, or of every
        // line. A length of 0 runs to the end. The wrapped line is unknown
        // before the layout, so `anchor: line` resolves per paragraph - the
        // same caveat the word / line units of `nth` carry.
        const anchor = scope.anchor === 'line' ? 'line' : 'text';
        row(box, `scoped.${index}.anchor`, t('studio.inspector.scopeAnchor'), SA.controls.selectControl({}, anchor, (next) => setScope({ anchor: next }), [
          { value: 'text', label: t('studio.inspector.scopeAnchorText') },
          { value: 'line', label: t('studio.inspector.scopeAnchorLine') },
        ]));
        const from = scope.from === 'end' ? 'end' : 'start';
        row(box, `scoped.${index}.from`, t('studio.inspector.scopeFrom'), SA.controls.selectControl({}, from, (next) => setScope({ from: next }), [
          { value: 'start', label: t('studio.inspector.scopeFromStart') },
          { value: 'end', label: t('studio.inspector.scopeFromEnd') },
        ]));
        row(box, `scoped.${index}.offset`, t('studio.inspector.scopeOffset'), SA.controls.numberControl(numberParam('offset', 0, 99, 1, 0), scope.offset == null ? 0 : scope.offset, (next) => setScope({ offset: next }), { noSlider: true }));
        row(box, `scoped.${index}.length`, t('studio.inspector.scopeLength'), SA.controls.numberControl(numberParam('length', 0, 99, 1, 0), scope.length == null ? 0 : scope.length, (next) => setScope({ length: next }), { noSlider: true }));
        row(box, `scoped.${index}.skipSpaces`, t('studio.inspector.scopeSkipSpaces'), SA.controls.boolControl(scope.skipSpaces !== false, (value) => setScope({ skipSpaces: value })));
      }
      // `local` treats the substring as a string of its own: the effect measures
      // around the substring's centre, and a substring that grows sideways
      // pushes the rest of its line aside.
      if (entry.group === 'enter' || entry.group === 'exit' || entry.group === 'hold') {
        row(box, `scoped.${index}.local`, t('studio.inspector.scopedLocal'), SA.controls.boolControl(entry.local === true, (value) => update(list.map((item, i) => (i === index ? { ...item, local: value } : item)))));
      }
      // textenter2 §4.3: the substring's own stagger (rank order inside the
      // run). Unset = the beat stagger offsets.
      if (entry.group === 'enter') {
        const stagger = entry.stagger || {};
        const setStagger = (patch) => {
          const next = { order: 'ltr', ease: 'linear', ...(entry.stagger || {}), ...patch };
          update(list.map((item, i) => {
            if (i !== index) return item;
            if (!(Number(next.each) > 0)) {
              const cleared = { ...item };
              delete cleared.stagger;
              return cleared;
            }
            return { ...item, stagger: next };
          }));
        };
        pairRow(box, `${t('studio.inspector.order')} / ${t('studio.inspector.each')}`, [
          {
            propPath: `scoped.${index}.stagger.order`, sub: t('studio.inspector.order'),
            control: SA.controls.selectControl({}, stagger.order || 'ltr', (next) => setStagger({ order: next }), ['ltr', 'rtl', 'center-out', 'random'].map((value) => ({ value, label: SA.controls.valueLabel(value) }))),
            noKey: true,
          },
          {
            propPath: `scoped.${index}.stagger.each`, sub: t('studio.inspector.each'),
            control: SA.controls.numberControl({ min: 0, step: 0.005, default: 0 }, stagger.each == null ? 0 : stagger.each, (next) => setStagger({ each: next })),
            noKey: true,
          },
        ], { noKey: true, noReset: true });
      }
      // textenter2 §4.7: user paint order (larger paints later = on top)
      row(box, `scoped.${index}.drawOrder`, t('studio.inspector.drawOrder'), SA.controls.numberControl({ min: -99, max: 99, step: 1, default: 0 }, entry.drawOrder == null ? 0 : entry.drawOrder, (next) => {
        update(list.map((item, i) => (i === index ? { ...item, drawOrder: Math.round(Number(next) || 0) } : item)));
      }), { noKey: true });

      // the effect parameters (the same rows as a stack group). A preset's own
      // defaults are resolved first, so picking `spanEveryThird` shows its 1.45
      // rather than the bare parameter default of 1
      const descriptor = SA.fx.get(entry.group || 'hold', entry.type);
      const params = (SA.fx.withDefaults({ type: entry.type, params: entry.params, enabled: true }, entry.group || 'hold') || {}).params || entry.params || {};
      const paletteOpts = { palette: style.palette || null, slotLabel: t('studio.inspector.palette') };
      const singleParam = (param) => {
        const value = params[param.key] != null ? params[param.key] : param.default;
        const control = SA.controls.paramControl(entry.group || 'hold', param, value, (next) => {
          update(list.map((item, i) => (i === index ? { ...item, params: { ...(item.params || {}), [param.key]: next } } : item)));
        }, paletteOpts);
        row(box, `scoped.${index}.params.${param.key}`, SA.controls.labelFor(param.key), control, { noKey: true });
      };
      const pairParams = (first, second, def) => {
        if (def.chain) {
          const enriched = [first, second].map((param) => ({ ...param, current: params[param.key] != null ? params[param.key] : param.default }));
          chainPairRow(box, paramPairLabel(first, second), enriched[0], enriched[1], def.subs,
            (param, value, onChange) => SA.controls.paramControl(entry.group || 'hold', param, value, onChange, paletteOpts),
            (key, next) => {
              update(list.map((item, i) => (i === index ? { ...item, params: { ...(item.params || {}), [key]: next } } : item)));
            },
            (key) => `scoped.${index}.params.${key}`);
          return;
        }
        const specs = [first, second].map((param, k) => {
          const value = params[param.key] != null ? params[param.key] : param.default;
          const control = SA.controls.paramControl(entry.group || 'hold', param, value, (next) => {
            update(list.map((item, i) => (i === index ? { ...item, params: { ...(item.params || {}), [param.key]: next } } : item)));
          }, paletteOpts);
          return { propPath: `scoped.${index}.params.${param.key}`, sub: def.subs[k], control, noKey: true };
        });
        pairRow(box, paramPairLabel(first, second), specs);
      };
      eachParam(descriptor, singleParam, pairParams);
      body.appendChild(box);
    });
    // The blue / white request in one click: two alternating pairs, each one a
    // background colour plus the text colour that reads on it. The text colour
    // is a scoped `text` span (the `fill` group takes no colour of its own).
    const alternate = document.createElement('button');
    alternate.type = 'button';
    alternate.className = 'btn btn-mini';
    alternate.textContent = t('studio.inspector.addAlternatingColors');
    alternate.addEventListener('click', () => {
      const pair = (offset, bg, fg) => ([
        { group: 'bgFill', type: 'solid', params: { color: bg }, enabled: true, scope: { kind: 'nth', unit: 'letter', every: 2, offset } },
        { group: 'text', type: 'span', params: { color: fg }, enabled: true, scope: { kind: 'nth', unit: 'letter', every: 2, offset } },
      ]);
      update([...list, ...pair(0, '#1e50ff', '#ffffff'), ...pair(1, '#ffffff', '#1e50ff')]);
    });
    body.appendChild(alternate);
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn-mini';
    add.textContent = `+ ${t('studio.inspector.addScoped')}`;
    add.addEventListener('click', () => {
      const descriptors = scopedTypes('hold');
      const type = descriptors.length ? descriptors[0].type : 'none';
      update([...list, { group: 'hold', type, params: {}, enabled: true, scope: scopedDefaultScope('hold', type) || { kind: 'all' } }]);
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
      const propPath = `color.${slot}`;
      // pass the full ColorValue (solid / palette / gradient / category) plus
      // the scoped palette so a palette reference resolves to its colour
      // instead of falling back to white
      const control = SA.controls.colorControl(value == null ? null : value, (next) => {
        if (next == null || next === '') {
          writeProp(propPath, null);
          return;
        }
        if (typeof next === 'string') {
          writeProp(propPath, { kind: 'solid', value: next, alpha: 1 });
          return;
        }
        writeProp(propPath, next);
      }, { palette: style.palette || null, slotLabel: t('studio.inspector.palette') });
      // `labelFor` collides with effect params (fill -> 埋める割合,
      // stroke -> 線幅), so the colour slots use their own names
      row(body, propPath, SA.controls.prettify(slot), control);
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
      const slot = SA.layersDialog.slotLabel(layer);
      const type = layer.type === 'solid' ? t('layers.typeSolid') : layer.type === 'video' ? t('layers.typeVideo') : layer.type === 'scene3d' ? t('layers.typeScene3d') : t('layers.typeImage');
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
    if (!track) return;
    if (track.kind === 'video') {
      renderVideoTrackSection(container, doc, track);
      return;
    }
    if (track.kind === 'figure' || track.kind === 'backdrop' || track.kind === 'filler') {
      const view = (SA.store && SA.store.state && SA.store.state.view) || null;
      const isFg = SA.lyricsEngine && SA.lyricsEngine.figureLayerOn ? SA.lyricsEngine.figureLayerOn('foreground', track, view) : !track.figureFgHidden;
      const isBg = SA.lyricsEngine && SA.lyricsEngine.figureLayerOn ? SA.lyricsEngine.figureLayerOn('background', track, view) : !track.figureBgHidden;
      const body = section(container, 'track', trackDisplayName(track) || t('studio.inspector.track'));
      const fgRow = document.createElement('label');
      fgRow.className = 'insp-inherit';
      const fgBox = document.createElement('input');
      fgBox.type = 'checkbox';
      fgBox.checked = isFg;
      fgBox.addEventListener('change', () => {
        SA.store.commands.setFigureLayerEnabled(track.id, 'foreground', fgBox.checked);
      });
      const fgText = document.createElement('span');
      fgText.textContent = ` ${t('studio.inspector.figureFgVisible')}`;
      fgRow.appendChild(fgBox);
      fgRow.appendChild(fgText);
      body.appendChild(fgRow);

      const bgRow = document.createElement('label');
      bgRow.className = 'insp-inherit';
      const bgBox = document.createElement('input');
      bgBox.type = 'checkbox';
      bgBox.checked = isBg;
      bgBox.addEventListener('change', () => {
        SA.store.commands.setFigureLayerEnabled(track.id, 'background', bgBox.checked);
      });
      const bgText = document.createElement('span');
      bgText.textContent = ` ${t('studio.inspector.figureBgVisible')}`;
      bgRow.appendChild(bgBox);
      bgRow.appendChild(bgText);
      body.appendChild(bgRow);
      return;
    }
    if (track.kind !== 'background') return;
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

  // A video track: its place in the track list decides what draws behind it,
  // and the chroma key cuts the key colour out of its video so those tracks
  // show through.
  function renderVideoTrackSection(container, doc, track) {
    const body = section(container, 'track', trackDisplayName(track) || t('studio.track.video'));
    const hint = document.createElement('div');
    hint.className = 'insp-inherit';
    hint.textContent = t('studio.track.videoHint');
    body.appendChild(hint);
    const chroma = { ...SA.glLayers.CHROMA_DEFAULTS, ...(track.chroma || {}) };
    const write = (patch, key) =>
      SA.store.commands.updateTrack(track.id, { chroma: { ...chroma, ...patch } }, key ? { coalesceKey: `track:${track.id}:chroma:${key}` } : undefined);
    body.appendChild(fieldRow(t('studio.track.chromaEnabled'), SA.controls.boolControl(!!chroma.enabled, (value) => write({ enabled: value }))));
    body.appendChild(
      fieldRow(
        t('studio.track.chromaColor'),
        SA.controls.colorControl(chroma.color, (next) => {
          const value = typeof next === 'string' ? next : next && next.value ? next.value : null;
          if (value) write({ color: value });
        })
      )
    );
    const numbers = [
      ['similarity', 'chromaSimilarity', 0, 1],
      ['smoothness', 'chromaSmoothness', 0, 0.5],
      ['spill', 'chromaSpill', 0, 1],
    ];
    for (const [key, label, min, max] of numbers) {
      const control = SA.controls.numberControl({ min, max, step: 0.01, default: SA.glLayers.CHROMA_DEFAULTS[key] }, chroma[key], (value) => write({ [key]: value }, key));
      body.appendChild(fieldRow(t(`studio.track.${label}`), control));
    }
    const videos = (doc.media && doc.media.videos) || [];
    if (videos.length) {
      const picker = SA.controls.selectControl({}, '', (id) => {
        const entry = videos.find((video) => video.id === id);
        if (!entry) return;
        const layer = { ...SA.layersDialog.defaults('video'), trackId: track.id, type: 'video', src: entry.src, fit: 'cover', color: '#ffffff' };
        SA.store.commands.addLayer(layer);
      }, [{ value: '', label: t('studio.track.addVideoLayer') }, ...videos.map((video) => ({ value: video.id, label: video.name || video.id }))]);
      body.appendChild(fieldRow(t('layers.typeVideo'), picker));
    }
  }

  // --- sheet editing (the inspector is the center of sheet editing) ------------
  // Every per-sheet property lives here and writes live through setLayer.
  // The layers dialog only manages the list (add / remove / reorder).

  function writeSheet(id, patch, coalesceKey) {
    SA.store.commands.setLayer(id, patch, coalesceKey ? { coalesceKey } : undefined);
  }

  function sheetTextInput(value, placeholder, onCommit) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ctrl-text';
    input.placeholder = placeholder || '';
    input.value = value == null ? '' : String(value);
    input.addEventListener('keydown', (event) => event.stopPropagation());
    input.addEventListener('change', () => onCommit(input.value));
    return input;
  }

  function sheetTypeOptions() {
    return [
      { value: 'solid', label: t('layers.typeSolid') },
      { value: 'image', label: t('layers.typeImage') },
      { value: 'video', label: t('layers.typeVideo') },
      { value: 'scene3d', label: t('layers.typeScene3d') },
    ];
  }

  function sheetSlotOptions() {
    const tracks = ((SA.store.state.project && SA.store.state.project.tracks) || []).filter((track) => track && track.kind === 'video');
    return [
      { value: 'background', label: t('layers.slotBackground') },
      { value: 'foreground', label: t('layers.slotForeground') },
      ...tracks.map((track) => ({ value: `video:${track.id}`, label: `${t('layers.slotVideo')}${track.name ? ` (${track.name})` : ''}` })),
    ];
  }

  function sheetSlotValue(layer) {
    return layer.slot === 'video' ? `video:${layer.trackId}` : layer.slot || 'background';
  }

  function sheetBlendOptions() {
    return [
      ['normal', 'layers.blendNormal'], ['add', 'layers.blendAdd'], ['multiply', 'layers.blendMultiply'], ['screen', 'layers.blendScreen'],
      ['overlay', 'layers.blendOverlay'], ['softLight', 'layers.blendSoftLight'], ['hardLight', 'layers.blendHardLight'],
      ['lighten', 'layers.blendLighten'], ['darken', 'layers.blendDarken'], ['difference', 'layers.blendDifference'],
      ['exclusion', 'layers.blendExclusion'], ['colorDodge', 'layers.blendColorDodge'], ['colorBurn', 'layers.blendColorBurn'],
    ].map(([value, key]) => ({ value, label: t(key) }));
  }

  function sheetFitOptions() {
    return [
      ['cover', 'layers.fitCover'], ['contain', 'layers.fitContain'], ['stretch', 'layers.fitStretch'], ['actual', 'layers.fitActual'],
    ].map(([value, key]) => ({ value, label: t(key) }));
  }

  function sheetColorValue(next) {
    if (typeof next === 'string') return next;
    if (next && typeof next === 'object' && typeof next.value === 'string') return next.value;
    return null;
  }

  async function sheetPickImage(layer) {
    const picked = await SA.platform.readFile('.png,.jpg,.jpeg,.webp,.gif,.bmp,image/png,image/jpeg,image/webp');
    if (!picked || !picked.bytes) return;
    const extension = String(picked.name || '').split('.').pop().toLowerCase();
    const mime = (SA.layersDialog.MIME && SA.layersDialog.MIME[extension]) || 'image/png';
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('read-failed'));
      reader.readAsDataURL(new Blob([picked.bytes], { type: mime }));
    }).catch(() => null);
    if (dataUrl) writeSheet(layer.id, { src: dataUrl }, `sheet:${layer.id}:src`);
  }

  function appendSheetSource(body, layer) {
    if (layer.type === 'solid') {
      const control = SA.controls.colorControl(layer.color || '#101826', (next) => {
        const hex = sheetColorValue(next);
        if (hex) writeSheet(layer.id, { color: hex }, `sheet:${layer.id}:color`);
      });
      body.appendChild(fieldRow(t('layers.color'), control));
      return;
    }
    if (layer.type === 'scene3d') {
      const scene = layer.scene || {};
      const presets = [
        { value: 'starfield', label: t('layers.scene3dStarfield') },
        { value: 'grid', label: t('layers.scene3dGrid') },
        { value: 'floating', label: t('layers.scene3dFloating') },
      ];
      body.appendChild(fieldRow(t('layers.scene3dPreset'),
        SA.controls.selectControl({}, scene.preset || 'starfield', (value) => {
          writeSheet(layer.id, { scene: { ...(layer.scene || {}), preset: value } });
        }, presets)));
      body.appendChild(fieldRow(t('layers.speed'),
        numberField(scene.speed == null ? 1 : scene.speed, { min: 0.05, step: 0.05, default: 1 }, (value) => {
          writeSheet(layer.id, { scene: { ...(layer.scene || {}), speed: value > 0 ? value : 1 } }, `sheet:${layer.id}:scene`);
        })));
      body.appendChild(fieldRow(t('layers.scene3dDensity'),
        numberField(scene.density == null ? 1 : scene.density, { min: 0.2, max: 3, step: 0.1, default: 1 }, (value) => {
          writeSheet(layer.id, { scene: { ...(layer.scene || {}), density: Math.max(0.2, Math.min(3, value || 1)) } }, `sheet:${layer.id}:scene`);
        })));
      body.appendChild(fieldRow(t('layers.scene3dColor'),
        sheetTextInput(scene.color || '', '#9fb8ff', (value) => {
          writeSheet(layer.id, { scene: { ...(layer.scene || {}), color: String(value || '').trim() } });
        })));
      return;
    }
    // image / video: file picker plus a URL field
    const isVideo = layer.type === 'video';
    const wrap = document.createElement('div');
    wrap.className = 'layer-source';
    const choose = document.createElement('button');
    choose.type = 'button';
    choose.className = 'btn btn-mini';
    choose.textContent = t(isVideo ? 'layers.chooseVideo' : 'layers.choose');
    choose.addEventListener('click', async () => {
      if (!isVideo) {
        sheetPickImage(layer);
        return;
      }
      const picked = await SA.platform.readFile('.mp4,.webm,.mov,video/mp4,video/webm');
      if (!picked || !picked.bytes) return;
      const url = URL.createObjectURL(new Blob([picked.bytes], { type: picked.type || 'video/mp4' }));
      writeSheet(layer.id, { src: url }, `sheet:${layer.id}:src`);
      SA.mediaNotice.warn('video');
    });
    wrap.appendChild(choose);
    wrap.appendChild(sheetTextInput(layer.src && layer.src.length < 200 ? layer.src : '', t('layers.url'), (value) => {
      writeSheet(layer.id, { src: String(value || '').trim() });
    }));
    body.appendChild(fieldRow(isVideo ? t('layers.video') : t('layers.image'), wrap));
    if (isVideo) {
      const video = layer.video || {};
      body.appendChild(fieldRow(t('layers.speed'),
        numberField(video.speed == null ? 1 : video.speed, { step: 0.05, default: 1 }, (value) => {
          writeSheet(layer.id, { video: { ...(layer.video || {}), speed: value || 1 } }, `sheet:${layer.id}:video`);
        })));
      body.appendChild(fieldRow(t('layers.offset'),
        numberField(video.offset == null ? 0 : video.offset, { step: 0.05, default: 0 }, (value) => {
          writeSheet(layer.id, { video: { ...(layer.video || {}), offset: value } }, `sheet:${layer.id}:video`);
        })));
      body.appendChild(fieldRow(t('layers.loop'), SA.controls.boolControl(video.loop !== false, (value) => {
        writeSheet(layer.id, { video: { ...(layer.video || {}), loop: value } });
      })));
      body.appendChild(fieldRow(t('layers.playInPreview'), SA.controls.boolControl(video.play !== false, (value) => {
        writeSheet(layer.id, { video: { ...(layer.video || {}), play: value } });
      })));
    }
  }

  function appendSheetMotion(body, layer, direction, group) {
    const fallback = { type: 'fade', duration: direction === 'in' ? 0.5 : 0.5, delay: 0, ease: direction === 'in' ? 'easeOutCubic' : 'easeInCubic', params: {} };
    const current = { ...fallback, ...((layer.motion || {})[direction] || {}) };
    const write = (part) => {
      writeSheet(layer.id, { motion: { ...(layer.motion || {}), [direction]: { ...current, ...part } } }, `sheet:${layer.id}:motion`);
    };
    appendLayerSubhead(body, direction === 'in' ? t('layers.motionIn') : t('layers.motionOut'));
    const types = SA.fx && SA.fx.list ? SA.fx.list(group) : [];
    const options = types.map((entry) => ({ value: entry.type, label: SA.controls.typeLabel(group, entry.type) }));
    if (!options.some((option) => option.value === current.type) && current.type) options.unshift({ value: current.type, label: current.type });
    body.appendChild(fieldRow(t('layers.motionType'), SA.controls.selectControl({}, current.type, (value) => {
      write({ type: value, params: {} });
    }, options)));
    body.appendChild(fieldRow(t('layers.duration'),
      numberField(current.duration, { min: 0, step: 0.05, default: 0.5 }, (value) => write({ duration: Math.max(0, value) }))));
    body.appendChild(fieldRow(t('layers.delay'),
      numberField(current.delay, { step: 0.05, default: 0 }, (value) => write({ delay: value }))));
    body.appendChild(fieldRow(t('layers.ease'), SA.controls.easeControl(current.ease, (value) => write({ ease: value }))));
    const descriptor = SA.fx && SA.fx.get ? SA.fx.get(group, current.type) : null;
    const buildControl = (param) => {
      const value = current.params && current.params[param.key] != null ? current.params[param.key] : param.default;
      return SA.controls.paramControl(group, param, value, (next) => {
        write({ params: { ...(current.params || {}), [param.key]: next } });
      });
    };
    eachParam(descriptor || { params: [] },
      (param) => body.appendChild(fieldRow(SA.controls.labelFor(param.key), buildControl(param))),
      (first, second, def) => {
        const { row: node } = fieldRowPair(paramPairLabel(first, second), [first, second].map((param, k) => ({ sub: def.subs[k], control: buildControl(param) })));
        body.appendChild(node);
      });
  }

  function appendSheetFilter(body, layer) {
    const current = layer.filter || { type: 'none', params: {} };
    appendLayerSubhead(body, t('layers.filters'));
    body.appendChild(fieldRow(t('layers.filter'), SA.controls.selectControl({}, current.type || 'none', (value) => {
      writeSheet(layer.id, { filter: { type: value, params: {} } });
    }, [
      { value: 'none', label: t('layers.filterNone') },
      { value: 'chromaticAberration', label: t('layers.filterChromatic') },
      { value: 'rgbShift', label: t('layers.filterRgbShift') },
      { value: 'glitchBlocks', label: t('layers.filterGlitch') },
    ])));
    for (const param of (SA.layersDialog.FILTERS || {})[current.type] || []) {
      const value = current.params && current.params[param.key] != null ? current.params[param.key] : param.default;
      const control = param.kind === 'bool'
        ? SA.controls.boolControl(value, (next) => {
          writeSheet(layer.id, { filter: { type: current.type, params: { ...(current.params || {}), [param.key]: next } } });
        })
        : SA.controls.numberControl({ min: param.min, max: param.max, step: param.step, default: param.default }, value, (next) => {
          writeSheet(layer.id, { filter: { type: current.type, params: { ...(current.params || {}), [param.key]: next } } }, `sheet:${layer.id}:filter`);
        });
      body.appendChild(fieldRow(SA.controls.labelFor(param.key), control));
    }
  }

  function renderLayerSection(container) {
    const doc = project();
    const id = String(selectionInfo().raw).replace(/^layer:/, '');
    const layer = (doc.layers || []).find((entry) => entry.id === id);
    if (!layer) return;
    const body = section(container, 'layer', t('layers.title'));
    // identity: type plus the source editor for that type
    body.appendChild(fieldRow(t('layers.type'),
      SA.controls.selectControl({}, layer.type || 'image', (value) => {
        writeSheet(layer.id, { type: value });
      }, sheetTypeOptions())));
    appendSheetSource(body, layer);
    // placement
    body.appendChild(fieldRow(t('layers.slot'),
      SA.controls.selectControl({}, sheetSlotValue(layer), (value) => {
        if (String(value).startsWith('video:')) {
          writeSheet(layer.id, { slot: 'video', trackId: String(value).slice('video:'.length) });
        } else {
          const patch = { slot: value };
          writeSheet(layer.id, patch);
        }
      }, sheetSlotOptions())));
    body.appendChild(fieldRow(t('layers.blend'),
      SA.controls.selectControl({}, layer.blend || 'normal', (value) => {
        writeSheet(layer.id, { blend: value });
      }, sheetBlendOptions())));
    body.appendChild(fieldRow(t('layers.fit'),
      SA.controls.selectControl({}, layer.fit || 'stretch', (value) => {
        writeSheet(layer.id, { fit: value });
      }, sheetFitOptions())));
    const layerStartControl = numberField(layer.start == null ? 0 : layer.start, { min: 0, step: 0.1, default: 0 }, (value) => {
      writeSheet(layer.id, { start: Math.max(0, value || 0) }, `sheet:${layer.id}:timing`);
    });
    const layerEndWrap = (() => {
      const wrap = document.createElement('div');
      wrap.className = 'layer-source';
      wrap.appendChild(numberField(layer.end, { min: 0, step: 0.1, default: 0 }, (value) => {
        writeSheet(layer.id, { end: Math.max(0, value || 0) }, `sheet:${layer.id}:timing`);
      }));
      const infinite = document.createElement('button');
      infinite.type = 'button';
      infinite.className = 'btn btn-mini';
      infinite.textContent = t('layers.endInfinity');
      infinite.title = t('layers.endInfinity');
      infinite.addEventListener('click', () => writeSheet(layer.id, { end: null }));
      wrap.appendChild(infinite);
      return wrap;
    })();
    {
      const { row: pair } = fieldRowPair(`${t('layers.start')} / ${t('layers.end')}`, [
        { sub: t('layers.start'), control: layerStartControl },
        { sub: t('layers.end'), control: layerEndWrap },
      ]);
      body.appendChild(pair);
    }
    body.appendChild(fieldRow(t('layers.radius'),
      numberField(layer.radius == null ? 0 : layer.radius, { min: 0, max: 0.5, step: 0.02, default: 0 }, (value) => {
        writeSheet(layer.id, { radius: Math.max(0, Math.min(0.5, value)) }, `sheet:${layer.id}:radius`);
      })));
    // keyframed numbers (transform / opacity / anchor / crop)
    appendLayerKeyframeRows(body, id);
    // in/out motion and filter
    appendSheetMotion(body, layer, 'in', 'enter');
    appendSheetMotion(body, layer, 'out', 'exit');
    appendSheetFilter(body, layer);
    // protection + visibility + list management
    body.appendChild(fieldRow(t('layers.locked'), SA.controls.boolControl(!!layer.locked, (value) => {
      writeSheet(layer.id, { locked: value });
    })));
    const actions = document.createElement('div');
    actions.className = 'layer-order';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn btn-mini';
    toggle.textContent = layer.enabled === false ? t('layers.show') : t('layers.hide');
    toggle.addEventListener('click', () => SA.store.commands.setLayer(layer.id, { enabled: layer.enabled === false }));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-mini';
    remove.textContent = t('layers.remove');
    if (layer.locked) {
      remove.disabled = true;
      remove.title = t('layers.locked');
    } else {
      remove.addEventListener('click', () => SA.store.commands.removeLayer(layer.id));
    }
    const list = document.createElement('button');
    list.type = 'button';
    list.className = 'btn btn-mini';
    list.textContent = t('layers.edit');
    list.title = t('layers.inspectorHint');
    list.addEventListener('click', () => SA.layersDialog.open());
    actions.appendChild(toggle);
    actions.appendChild(remove);
    actions.appendChild(list);
    body.appendChild(actions);
  }

  function appendLayerSubhead(body, text) {
    const head = document.createElement('div');
    head.className = 'layer-section-title';
    head.textContent = text;
    body.appendChild(head);
  }

  // Editable transform / anchor / crop rows for the selected layer. Values
  // show the keyframe evaluation at the playhead; a prop with any track is
  // marked is-keyed, and edits write keyframes when a track exists. X/Y-style
  // pairs share one row (position, scaleX/Y, anchor, crop L/R and T/B).
  function appendLayerKeyframeRows(body, id) {
    const ctx = layerKeyContext();
    if (!ctx || ctx.layer.id !== id) return;
    const tracks = (project().keyframes && project().keyframes[ctx.path]) || {};
    const hasTrack = (prop) => Array.isArray(tracks[prop]) && tracks[prop].length > 0;
    const addRow = (prop, label, param) => {
      const control = numberField(layerValueAt(ctx, prop), { ...(param || {}), default: LAYER_PROP_DEFAULTS[prop] }, (next) => {
        setLayerProp(ctx, prop, next);
      });
      const node = fieldRow(label, control);
      if (hasTrack(prop)) node.classList.add('is-keyed');
      appendKeyButton(node, prop);
      body.appendChild(node);
    };
    const addPair = (label, specs) => {
      const cells = specs.map(([prop, sub, param]) => ({
        sub,
        control: numberField(layerValueAt(ctx, prop), { ...(param || {}), default: LAYER_PROP_DEFAULTS[prop] }, (next) => {
          setLayerProp(ctx, prop, next);
        }),
      }));
      const { row: node, btns } = fieldRowPair(label, cells);
      specs.forEach(([prop, sub]) => {
        if (hasTrack(prop)) node.classList.add('is-keyed');
        appendKeyButton(btns, prop);
        if (btns.lastChild) btns.lastChild.title += ` (${sub})`;
      });
      body.appendChild(node);
    };
    appendLayerSubhead(body, t('layers.transformHeading'));
    addPair(`${t('layers.x')} / ${t('layers.y')}`, [
      ['transform.x', 'X', { step: 0.01 }],
      ['transform.y', 'Y', { step: 0.01 }],
    ]);
    addRow('transform.rotate', t('layers.rotate'), { step: 1 });
    addRow('transform.scale', t('layers.scale'), { step: 0.05, min: 0 });
    addPair(`${t('layers.scaleX')} / ${t('layers.scaleY')}`, [
      ['transform.scaleX', 'X', { step: 0.05 }],
      ['transform.scaleY', 'Y', { step: 0.05 }],
    ]);
    addRow('opacity', t('layers.opacity'), { step: 0.05, min: 0, max: 1 });
    appendLayerSubhead(body, t('layers.anchor'));
    addPair(`${t('layers.anchorX')} / ${t('layers.anchorY')}`, [
      ['transform.anchorX', 'X', { step: 0.05, min: 0, max: 1 }],
      ['transform.anchorY', 'Y', { step: 0.05, min: 0, max: 1 }],
    ]);
    const presets = document.createElement('div');
    presets.className = 'layer-order';
    for (const [labelKey, ax, ay] of [
      ['layers.anchorCenter', 0.5, 0.5],
      ['layers.anchorTopLeft', 0, 0],
      ['layers.anchorBottom', 0.5, 1],
    ]) {
      const preset = document.createElement('button');
      preset.type = 'button';
      preset.className = 'btn btn-mini';
      preset.textContent = t(labelKey);
      preset.addEventListener('click', () => {
        setLayerProp(ctx, 'transform.anchorX', ax);
        setLayerProp(ctx, 'transform.anchorY', ay);
      });
      presets.appendChild(preset);
    }
    body.appendChild(presets);
    appendLayerSubhead(body, t('layers.crop'));
    addPair(`${t('layers.cropLeft')} / ${t('layers.cropRight')}`, [
      ['crop.l', t('layers.cropLeft'), { step: 0.01, min: 0, max: 0.95 }],
      ['crop.r', t('layers.cropRight'), { step: 0.01, min: 0, max: 0.95 }],
    ]);
    addPair(`${t('layers.cropTop')} / ${t('layers.cropBottom')}`, [
      ['crop.t', t('layers.cropTop'), { step: 0.01, min: 0, max: 0.95 }],
      ['crop.b', t('layers.cropBottom'), { step: 0.01, min: 0, max: 0.95 }],
    ]);
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

  // Two layer/clone numbers side by side in one row. `cells` carries one
  // `{ sub, control }` per cell; the caller appends key buttons into the
  // returned `btns` span (layer rows) or leaves it empty (plain rows).
  function fieldRowPair(labelText, cells) {
    const row = document.createElement('div');
    row.className = 'ctrl-row is-pair';
    const label = document.createElement('span');
    label.className = 'ctrl-label';
    label.textContent = labelText;
    row.appendChild(label);
    const wrap = document.createElement('div');
    wrap.className = 'ctrl-pair';
    for (const cell of cells) {
      const holder = document.createElement('span');
      holder.className = 'ctrl-pair-cell';
      const tag = document.createElement('span');
      tag.className = 'ctrl-pair-tag';
      tag.textContent = cell.sub;
      holder.appendChild(tag);
      holder.appendChild(cell.control);
      wrap.appendChild(holder);
    }
    row.appendChild(wrap);
    const btns = document.createElement('span');
    btns.className = 'ctrl-pair-btns';
    row.appendChild(btns);
    return { row, btns };
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
    if (param.kind === 'stroke' && typeof SA !== 'undefined' && SA.controls) {
      const control = SA.controls.paramControl('filler', param, value == null ? param.default : value, onChange);
      return fieldRow(fillerParamLabel(param.key), control);
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
    const adsr = clip.adsr || {};
    const adsrPresetControl = SA.controls.selectControl({}, '', (next) => {
      if (!next) return;
      SA.store.commands.updateClip(clip.id, { adsr: next === 'off' ? null : { ...SA.adsr.PRESETS[next] } }, { coalesceKey: `clip:${clip.id}:adsr` });
    }, [{ value: '', label: t('studio.inspector.selectPreset') }, ...['pluck', 'stab', 'pad', 'swell', 'off']
      .map((value) => ({ value, label: t(`studio.inspector.adsr_${value}`) }))]);
    body.appendChild(fieldRow(t('studio.inspector.adsrPreset'), adsrPresetControl));
    const ADSR_FIELDS = { attack: [0, 0.05, 0.5], decay: [0, 0.05, 0], sustain: [0, 0.05, 1], release: [0, 0.05, 0.4], peak: [0, 0.05, 1], punch: [0, 0.05, 0] };
    for (const [key, [min, step, def]] of Object.entries(ADSR_FIELDS)) {
      const control = SA.controls.numberControl({ min, step, default: def }, adsr[key] == null ? def : adsr[key], (value) => {
        SA.store.commands.updateClip(clip.id, { adsr: { ...(clip.adsr || {}), [key]: value } }, { coalesceKey: `clip:${clip.id}:adsr` });
      });
      body.appendChild(fieldRow(t(`studio.inspector.adsr_${key}`), control));
    }
    const startControl = SA.controls.numberControl({ min: 0, step: 0.05, default: clip.start }, clip.start, (value) => {
      SA.store.commands.trimClip(clip.id, 'start', value, { coalesceKey: `clip:${clip.id}:start` });
    });
    const endControl = SA.controls.numberControl({ min: 0, step: 0.05, default: clip.end }, clip.end, (value) => {
      SA.store.commands.trimClip(clip.id, 'end', value, { coalesceKey: `clip:${clip.id}:end` });
    });
    {
      const { row: pair } = fieldRowPair(`${t('studio.inspector.start')} / ${t('studio.inspector.end')}`, [
        { sub: t('studio.inspector.start'), control: startControl },
        { sub: t('studio.inspector.end'), control: endControl },
      ]);
      body.appendChild(pair);
    }

    // split / reroll / vary / recolour / delete as glyph buttons in the
    // section header, like the cue / beat sections
    summaryActions(body, [
      ['✂', 'studio.timeline.splitClip', () => SA.store.commands.splitClip(clip.id, SA.store.state.playhead)],
      ['🎲', 'studio.inspector.reroll', () => { SA.store.commands.rerollClip(clip.id); reportClipOp({ start: clip.start, end: clip.end }); }],
      ['🔀', 'studio.inspector.varyClip', () => { SA.store.commands.varyClip(clip.id); reportClipOp({ start: clip.start, end: clip.end }); }],
      ['◐', 'studio.generate.rerollColors', () => {
        const kind = SA.project.trackKindOf(SA.store.state.project, clip.trackId);
        SA.store.commands.rerollColors({ kinds: [kind], clipIds: [clip.id], perClip: true });
      }],
      ['🗑', 'studio.inspector.delete', () => SA.store.commands.deleteClip(clip.id)],
    ]);
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
      // clip beats: per-layer reroll / vary / recolor (split planes are
      // structural, text layers keep their text — those only take recolor)
      const layerBeatBtn = (text, key, run) => {
        const node = document.createElement('button');
        node.type = 'button';
        node.className = 'btn btn-mini';
        node.textContent = text;
        node.title = t(key);
        node.addEventListener('click', run);
        summary.appendChild(node);
      };
      const structuralLayer = layer.type === 'split';
      const textLayer = layer.type === 'textAnim' || layer.type === 'credits';
      if (!structuralLayer && !textLayer) {
        layerBeatBtn('↻', 'studio.inspector.rerollBeat', () => reportClipOp(SA.store.commands.rerollClipLayer(clip.id, index), 'clipLayer'));
      }
      if (!structuralLayer) {
        layerBeatBtn('≋', 'studio.inspector.varyBeat', () => reportClipOp(SA.store.commands.varyClipLayer(clip.id, index), 'clipLayer'));
      }
      layerBeatBtn('◐', 'studio.inspector.recolorBeat', () => reportClipOp(SA.store.commands.recolorClipLayer(clip.id, index), 'clipLayer'));
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
        const value = params[param.key] != null ? params[param.key] : (param.key === 'enabled' && clip.disabled != null ? !clip.disabled : param.default);
        const control = SA.controls.paramControl('filler', param, value, (next) => {
          const patch = { spec: { ...spec, params: { ...params, [param.key]: next } } };
          if (param.key === 'enabled') patch.disabled = !next;
          SA.store.commands.updateClip(clip.id, patch, { coalesceKey: `clip:${clip.id}:${param.key}` });
        });
        body.appendChild(fieldRow(SA.controls.labelFor(param.key), control));
      }
      // the clip beats: one row per sub-beat with reroll / vary / recolor
      const subBeats = Array.isArray(params.beats) ? params.beats : [];
      if (subBeats.length) {
        const beatsTitle = document.createElement('div');
        beatsTitle.className = 'insp-section-title';
        beatsTitle.textContent = `${t('studio.inspector.beat')} · ${subBeats.length}`;
        body.appendChild(beatsTitle);
        const selectedBeat = selectionInfo().clipBeat;
        subBeats.forEach((sub, subIndex) => {
          const beatRow = document.createElement('div');
          beatRow.className = `insp-actions${selectedBeat === subIndex ? ' is-selected' : ''}`;
          const label = document.createElement('button');
          label.type = 'button';
          label.className = 'btn btn-mini insp-beat-label';
          const move = (sub && sub.move) || {};
          label.textContent = `#${subIndex + 1} ${Number(sub.start).toFixed(2)}–${Number(sub.end).toFixed(2)}s ${move.in || ''}/${move.hold || ''}/${move.out || ''}`;
          label.addEventListener('click', () => SA.store.setSelection([`clip:${clip.id}/beat:${subIndex}`], 'clip'));
          beatRow.appendChild(label);
          const subBtn = (text, key, run) => {
            const node = document.createElement('button');
            node.type = 'button';
            node.className = 'btn btn-mini';
            node.textContent = text;
            node.title = t(key);
            node.addEventListener('click', run);
            beatRow.appendChild(node);
          };
          subBtn('↻', 'studio.inspector.rerollBeat', () => reportClipOp(SA.store.commands.rerollFigureBeat(clip.id, subIndex), 'figureBeat'));
          subBtn('≋', 'studio.inspector.varyBeat', () => reportClipOp(SA.store.commands.varyFigureBeat(clip.id, subIndex), 'figureBeat'));
          subBtn('◐', 'studio.inspector.recolorBeat', () => reportClipOp(SA.store.commands.recolorFigureBeat(clip.id, subIndex), 'figureBeat'));
          body.appendChild(beatRow);
          if (selectedBeat === subIndex && typeof beatRow.scrollIntoView === 'function') beatRow.scrollIntoView({ block: 'nearest' });
        });
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
      const enabledControl = SA.controls.boolControl(!SA.lyricsEngine.isClipDisabled(clip), (value) => {
        const patch = { disabled: !value };
        if (spec.params) patch.spec = { ...spec, params: { ...spec.params, disabled: !value } };
        SA.store.commands.updateClip(clip.id, patch);
      });
      row(body, `clip:${clip.id}:enabled`, t('studio.inspector.enabled'), enabledControl, { noKey: true, noReset: true });
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
      ? SA.fx.list('background', { packs: [null, ...UI_PACKS.packs] }).map((descriptor) => descriptor.type)
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

    // combo beats: one row per layer with reroll / vary / recolor (split
    // planes are structural and only take recolor)
    if (SA.fillerRender && typeof SA.fillerRender.layersOf === 'function') {
      const comboLayers = SA.fillerRender.layersOf(spec);
      if (Array.isArray(comboLayers) && comboLayers.length > 1) {
        const layersTitle = document.createElement('div');
        layersTitle.className = 'insp-section-title';
        layersTitle.textContent = `${t('filler.layers')} · ${comboLayers.length}`;
        body.appendChild(layersTitle);
        comboLayers.forEach((comboLayer, layerIndex) => {
          const layerRow = document.createElement('div');
          layerRow.className = 'insp-actions';
          const layerLabel = document.createElement('span');
          layerLabel.className = 'insp-inherit';
          layerLabel.textContent = `#${layerIndex + 1} ${(comboLayer && comboLayer.type) || '?'}`;
          layerRow.appendChild(layerLabel);
          const comboBtn = (text, key, run) => {
            const node = document.createElement('button');
            node.type = 'button';
            node.className = 'btn btn-mini';
            node.textContent = text;
            node.title = t(key);
            node.addEventListener('click', run);
            layerRow.appendChild(node);
          };
          const planeLayer = !comboLayer || comboLayer.type === 'split';
          if (!planeLayer) {
            comboBtn('↻', 'studio.inspector.rerollBeat', () => reportClipOp(SA.store.commands.rerollClipLayer(clip.id, layerIndex), 'clipLayer'));
            comboBtn('≋', 'studio.inspector.varyBeat', () => reportClipOp(SA.store.commands.varyClipLayer(clip.id, layerIndex), 'clipLayer'));
          }
          comboBtn('◐', 'studio.inspector.recolorBeat', () => reportClipOp(SA.store.commands.recolorClipLayer(clip.id, layerIndex), 'clipLayer'));
          body.appendChild(layerRow);
        });
      }
    }

    if (kind === 'backdrop') {
      const spans = SA.project.clipBeatSpans(doc, clip);
      if (spans.length) {
        const segTitle = document.createElement('div');
        segTitle.className = 'insp-section-title';
        segTitle.textContent = `${t('studio.inspector.beat')} · ${spans.length}`;
        body.appendChild(segTitle);
        const selectedBeat = selectionInfo().clipBeat;
        spans.forEach((span) => {
          const segRow = document.createElement('div');
          segRow.className = `insp-actions${selectedBeat === span.index ? ' is-selected' : ''}`;
          const segLabel = document.createElement('button');
          segLabel.type = 'button';
          segLabel.className = 'btn btn-mini insp-beat-label';
          segLabel.textContent = `#${span.index + 1} ${Number(span.start).toFixed(2)}–${Number(span.end).toFixed(2)}s${span.own ? ` [${t('studio.inspector.segmentOwn')}]` : ''}`;
          segLabel.addEventListener('click', () => SA.store.setSelection([`clip:${clip.id}/beat:${span.index}`], 'clip'));
          segRow.appendChild(segLabel);
          const segBtn = (text, key, run) => {
            const node = document.createElement('button');
            node.type = 'button';
            node.className = 'btn btn-mini';
            node.textContent = text;
            node.title = t(key);
            node.addEventListener('click', run);
            segRow.appendChild(node);
          };
          segBtn('↻', 'studio.inspector.rerollBeat', () => reportClipOp(SA.store.commands.rerollClipSegment(clip.id, span.index), 'clipLayer'));
          segBtn('≋', 'studio.inspector.varyBeat', () => reportClipOp(SA.store.commands.varyClipSegment(clip.id, span.index), 'clipLayer'));
          segBtn('◐', 'studio.inspector.recolorBeat', () => reportClipOp(SA.store.commands.recolorClipSegment(clip.id, span.index), 'clipLayer'));
          if (span.own) {
            const reset = document.createElement('button');
            reset.type = 'button';
            reset.className = 'btn btn-mini';
            reset.textContent = '✕';
            reset.title = t('studio.inspector.resetSegment');
            reset.addEventListener('click', () => SA.store.commands.resetClipSegment(clip.id, span.index));
            segRow.appendChild(reset);
          }
          body.appendChild(segRow);
          if (selectedBeat === span.index && typeof segRow.scrollIntoView === 'function') segRow.scrollIntoView({ block: 'nearest' });
        });
      }
    }

    appendClipCommon(body, doc, clip);
  }

  // After a clip-beat / layer op: bring the playhead into the span that
  // changed (a paused preview otherwise keeps showing another beat) and say
  // what moved.
  function reportClipOp(report, kind) {
    if (!report) return;
    const playhead = SA.store.state.playhead;
    if (SA.preview && typeof SA.preview.seek === 'function' && Number.isFinite(report.start) && Number.isFinite(report.end)
      && !(playhead >= report.start && playhead < report.end)) {
      SA.preview.seek(report.start + Math.min(0.5, (report.end - report.start) / 2));
    }
    if (!kind || !SA.studio || !SA.studio.toast) return;
    const vars = { n: report.index + 1, type: report.type || '', detail: report.detail || '', theme: report.theme || '' };
    SA.studio.toast(`studio.toast.${kind}${report.op === 'recolor' ? 'Recolored' : report.op === 'vary' ? 'Varied' : 'Rerolled'}`, vars, 4200);
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
    const own = scope === 'project' ? doc.style : scope && scope.beatId ? (doc.beatStyles && doc.beatStyles[scope.beatId]) || null : scope ? (doc.cueStyles && doc.cueStyles[scope.cueId]) || null : null;
    const ownPalette = !!(own && own.palette);
    // entering a scheme switches the beat to the classic colour mode, so the
    // buttons stay enabled on palette-set (default) beats too
    const ownBeat = (scope && scope.beatId && doc.beatStyles && doc.beatStyles[scope.beatId]) || {};
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
      invertButton.disabled = !invertible;
      invertButton.title = !ownBeat.colorLegacy && invertible ? t('studio.inspector.colorLegacy') : '';
      invertButton.addEventListener('click', () => SA.store.commands.invertBeatScheme(scope.cueId, scope.beatId));
      const candidates = roles && parentColors.length ? roles.schemes(parentColors, schemeWeird, modeParams ? modeParams.schemeRange : undefined) : [];
      const rerollButton = document.createElement('button');
      rerollButton.type = 'button';
      rerollButton.className = 'btn btn-mini';
      rerollButton.textContent = t('studio.inspector.rerollBeatScheme');
      rerollButton.disabled = !candidates.length;
      rerollButton.title = !ownBeat.colorLegacy && candidates.length ? t('studio.inspector.colorLegacy') : '';
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
    renderRegenBar(el.body);
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
    heading('studio.inspector.sectionPage');
    renderGroups(['page']);
    heading('studio.inspector.sectionMotion');
    renderGroups(['animation', 'layout', 'enter', 'exit', 'hold', 'location']);
    heading('studio.inspector.sectionText');
    const selection = selectionInfo();
    const selectedCue = selection.cueId && SA.store.state.project ? SA.store.state.project.script.cues.find((entry) => entry.id === selection.cueId) : null;
    const cueTrack = selectedCue && SA.store.state.project ? (SA.store.state.project.tracks || []).find((entry) => entry.id === (selectedCue.trackId || 'sub1')) : null;
    if (cueTrack && cueTrack.kind === 'subtitle') {
      const row = document.createElement('label');
      row.className = 'insp-inherit';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !cueTrack.textHidden;
      box.addEventListener('change', () => {
        SA.store.commands.updateTrack(cueTrack.id, { textHidden: !box.checked });
      });
      const text = document.createElement('span');
      text.textContent = ` ${t('studio.inspector.textTrackVisible')}`;
      row.appendChild(box);
      row.appendChild(text);
      container.appendChild(row);
    }
    renderGroups(['fill', 'edge', 'strike', 'repeat']);
    heading('studio.inspector.sectionBg');
    // the subtitle track's background switch (data kept; the row's checkbox on
    // the timeline and this checkbox are the same flag)
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
    // the subtitle track's graphics switch (data kept; the row's checkbox on
    // the timeline and this checkbox are the same flag)
    if (cueTrack && cueTrack.kind === 'subtitle') {
      const row = document.createElement('label');
      row.className = 'insp-inherit';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !cueTrack.graphicsHidden;
      box.addEventListener('change', () => {
        SA.store.commands.updateTrack(cueTrack.id, { graphicsHidden: !box.checked });
      });
      const text = document.createElement('span');
      text.textContent = ` ${t('studio.inspector.graphicsTrackVisible')}`;
      row.appendChild(box);
      row.appendChild(text);
      container.appendChild(row);
    }
    renderGroups(['post']);
  }

  function init() {
    el.body = document.getElementById('inspector-body');
    if (!el.body) return;
    render();
  }

  return { init, render, selectAt, cycleLevel, selectionInfo, scopeOf, localTimeFor, readEffective, valueFor, writeProp, isSetAtScope, addMotion };
})();
