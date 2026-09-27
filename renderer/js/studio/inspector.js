window.SA = window.SA || {};

SA.inspector = (() => {
  'use strict';

  const MOTION_GROUPS = ['animation', 'layout', 'enter', 'exit', 'location', 'fill', 'background', 'hold'];
  const STACK_GROUPS = ['hold', 'edge', 'post'];
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
  };
  const CONTROL_GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background'];

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

  function renderCueSection(container) {
    const sel = selectionInfo();
    if (!sel.cueId) return;
    const doc = project();
    const cue = doc.script.cues.find((entry) => entry.id === sel.cueId);
    if (!cue) return;
    const body = section(container, 'cue', t('studio.inspector.cue'));
    const text = SA.controls.textControl(cue.text || '', (value) => {
      SA.store.commands.editCueText(sel.cueId, value, { coalesceKey: `cue:${sel.cueId}:text` });
    }, { multiline: true });
    text.classList.add('cue-text');
    const textRow = document.createElement('div');
    textRow.className = 'ctrl-row ctrl-row-block';
    const labelNode = document.createElement('label');
    labelNode.className = 'ctrl-label';
    labelNode.textContent = t('studio.inspector.text');
    textRow.appendChild(labelNode);
    textRow.appendChild(text);
    body.appendChild(textRow);
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
  }

  function renderBeatSection(container) {
    const sel = selectionInfo();
    if (!sel.beatId) return;
    const doc = project();
    const beat = (doc.beats[sel.cueId] || []).find((entry) => entry.id === sel.beatId);
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
    body.appendChild(head);
    const beatText = SA.controls.textControl(beat.text || '', (value) => {
      SA.store.commands.editBeatText(sel.cueId, beat.id, value, { coalesceKey: `beat:${beat.id}:text` });
    }, { multiline: true });
    beatText.classList.add('cue-text');
    body.appendChild(beatText);
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
        control = SA.controls.selectControl({}, value || 'NotoSans-Regular', (next) => writeProp(propPath, next), (SA.lyricsFont.builtins ? SA.lyricsFont.builtins() : []).map((entry) => ({ value: entry.id, label: entry.family })));
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
      SA.fx.list(group).map((descriptor) => ({ value: descriptor.type, label: SA.controls.typeLabel(group, descriptor.type) }))
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
      const control = SA.controls.paramControl(group, param, value, (next) => writeProp(propPath, next));
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
        }, SA.fx.list(group).map((descriptor) => ({ value: descriptor.type, label: SA.controls.typeLabel(group, descriptor.type) })))
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
        const control = SA.controls.paramControl(group, param, value, (next) => {
          const nextList = list.map((entry, i) => (i === index ? { ...entry, params: { ...(entry.params || {}), [param.key]: next } } : entry));
          writeProp(group, nextList, { coalesceKey: `${group}:${index}:${param.key}` });
        });
        row(box, propPath, SA.controls.labelFor(param.key), control);
      }
      body.appendChild(box);
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn-mini';
    add.textContent = `+ ${t('studio.inspector.add')}`;
    const descriptors = SA.fx.list(group);
    add.addEventListener('click', () => {
      if (!descriptors.length) return;
      writeProp(group, [...list, { type: descriptors[0].type, params: {}, enabled: true }]);
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

  function fillerParamControl(param, value, onChange) {
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
      const select = selectControl(value == null ? param.default : value, param.options || [], fillerValueLabel, onChange);
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

  function renderFillerSection(container) {
    const doc = project();
    const body = section(container, 'filler', t('filler.title'));
    const key = selectionInfo().fillerKey;
    const cues = (doc.script && doc.script.cues) || [];
    const clips = SA.fillers ? SA.fillers.clips(cues, SA.preview.duration(), SA.fillers.settingsFor(doc)) : [];
    const clip = clips.find((entry) => entry.key === key);
    if (!clip) {
      const empty = document.createElement('div');
      empty.className = 'insp-inherit';
      empty.textContent = t('filler.empty');
      body.appendChild(empty);
      return;
    }
    const summary = document.createElement('div');
    summary.className = 'insp-inherit';
    summary.textContent = `${t(`filler.kind.${clip.kind}`)} · ${clip.from.toFixed(2)}–${clip.to.toFixed(2)}s${clip.pinned ? ` · ${t('filler.pinned')}` : ''}`;
    body.appendChild(summary);

    const typeSelect = selectControl(clip.spec && clip.spec.type ? clip.spec.type : 'none', SA.fillerRender ? SA.fillerRender.types() : ['none'], fillerTypeLabel, (type) => {
      SA.store.commands.setFillerClip(clip.key, { ...(clip.spec || {}), ...SA.fillerRender.defaults(type) });
    });
    body.appendChild(fieldRow(t('filler.type'), typeSelect));

    const spec = clip.spec || { type: 'none', params: {} };
    const defaults = SA.fillerRender ? SA.fillerRender.paramDefaults(spec.type) : {};
    const params = { ...defaults, ...(spec.params || {}) };
    for (const param of SA.fillerRender ? SA.fillerRender.paramsOf(spec.type) : []) {
      body.appendChild(
        fillerParamControl(param, params[param.key], (value) => {
          SA.store.commands.setFillerClip(clip.key, { ...spec, params: { ...params, [param.key]: value } });
        })
      );
    }

    const actions = document.createElement('div');
    actions.className = 'layer-order';
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'btn btn-mini';
    pin.textContent = clip.pinned ? t('filler.unpin') : t('filler.pin');
    pin.addEventListener('click', () => SA.store.commands.setFillerClip(clip.key, clip.pinned ? null : spec));
    const applyKind = document.createElement('button');
    applyKind.type = 'button';
    applyKind.className = 'btn btn-mini';
    applyKind.textContent = t('filler.applyKind', { kind: t(`filler.kind.${clip.kind}`) });
    applyKind.addEventListener('click', () => SA.store.commands.setFillers({ byKind: { [clip.kind]: spec } }));
    const seek = document.createElement('button');
    seek.type = 'button';
    seek.className = 'btn btn-mini';
    seek.textContent = t('filler.goto');
    seek.addEventListener('click', () => SA.preview.seek(clip.from));
    actions.appendChild(pin);
    actions.appendChild(applyKind);
    actions.appendChild(seek);
    body.appendChild(actions);
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
    const swatches = document.createElement('div');
    swatches.className = 'palette-swatches';
    if (effective) {
      for (const hex of effective.colors) {
        const dot = document.createElement('span');
        dot.className = 'palette-dot';
        dot.style.background = hex;
        dot.title = hex;
        swatches.appendChild(dot);
      }
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
        if (entry) writeProp('palette', { id: entry.id, name: entry.name, colors: [...entry.colors] });
      }, [
        { value: '', label: t('studio.inspector.paletteFrom') },
        ...SA.colors.allPalettes().map((entry) => ({ value: entry.id, label: entry.name })),
      ])
    );
    body.appendChild(pickRow);

    const actions = document.createElement('div');
    actions.className = 'insp-actions';
    const randomButton = document.createElement('button');
    randomButton.type = 'button';
    randomButton.className = 'btn btn-mini';
    randomButton.textContent = t('studio.inspector.paletteRandom');
    randomButton.addEventListener('click', () => {
      writeProp('palette', SA.moods.jitterPalette(Math.random, effective || { colors: [] }));
    });
    actions.appendChild(randomButton);
    if (isSetAtScope('palette')) {
      const resetButton = document.createElement('button');
      resetButton.type = 'button';
      resetButton.className = 'btn btn-mini';
      resetButton.textContent = t('studio.inspector.reset');
      resetButton.addEventListener('click', () => writeProp('palette', undefined));
      actions.appendChild(resetButton);
    }
    body.appendChild(actions);
  }

  function render() {
    if (!el.body) return;
    const sel = selectionInfo();
    const key = `${sel.raw}|${SA.store.state.project ? SA.store.state.project.meta.updatedAt : ''}|${SA.store.state.playhead.toFixed(3)}`;
    el.body.innerHTML = '';
    renderBreadcrumb(el.body);
    if (sel.kind === 'none') return;
    if (sel.raw.startsWith('layer:')) {
      renderLayerSection(el.body);
      lastSelection = key;
      return;
    }
    if (sel.kind === 'filler') {
      renderFillerSection(el.body);
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
    for (const group of CONTROL_GROUPS) {
      if (STACK_GROUPS.includes(group)) renderStackGroup(el.body, group);
      else renderGroup(el.body, group);
    }
    renderColor(el.body);
    renderPalette(el.body);
    lastSelection = key;
  }

  function init() {
    el.body = document.getElementById('inspector-body');
    if (!el.body) return;
    render();
  }

  return { init, render, selectAt, cycleLevel, selectionInfo, scopeOf, localTimeFor, readEffective, valueFor, writeProp, isSetAtScope };
})();
