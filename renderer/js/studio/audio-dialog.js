window.SA = window.SA || {};

SA.audioDialog = (() => {
  'use strict';

  const SINGLE_GROUPS = ['animation', 'layout', 'enter', 'exit', 'location', 'fill', 'background', 'bgShape', 'bgFill', 'bgMotion'];
  const STACK_GROUPS = ['hold', 'edge', 'post', 'bgEdge'];
  const BANDS = ['low', 'mid', 'high', 'rms'];

  function t(key, vars) {
    return SA.i18n.t(key, vars);
  }

  function groupLabel(group) {
    return t(`studio.inspector.${group}`);
  }

  function paramLabel(param) {
    return SA.controls && SA.controls.paramLabel ? SA.controls.paramLabel(param) : SA.controls.prettify(param.key);
  }

  function selectedScope(doc) {
    const selection = SA.store.state.selection || {};
    const paths = selection.paths || [];
    if (paths.length) {
      const path = paths[0];
      return { spec: 'element', path, style: SA.project.resolveStyle(doc, path) };
    }
    if (selection.cueId) {
      return { spec: { cueId: selection.cueId }, cueId: selection.cueId, style: SA.project.resolveStyle(doc, `cue:${selection.cueId}`) };
    }
    return { spec: 'project', style: SA.project.resolveStyle(doc, 'project') };
  }

  function instancesOf(style) {
    const list = [];
    for (const group of SINGLE_GROUPS) {
      if (style && style[group] && style[group].type) list.push({ group, index: -1, instance: style[group] });
    }
    for (const group of STACK_GROUPS) {
      const stack = style && style[group];
      if (Array.isArray(stack)) stack.forEach((instance, index) => list.push({ group, index, instance }));
    }
    return list;
  }

  function defaultGain(param) {
    if (param && param.max != null && param.max > 0 && (param.min == null || param.min >= 0)) {
      const raw = param.max * 0.6;
      return Math.max(0.01, Math.round(raw * 100) / 100);
    }
    return 1;
  }

  function open() {
    const doc = SA.store.state.project;
    const root = document.getElementById('dialog-root');
    if (!doc || !root) return;
    const scope = selectedScope(doc);
    const draft = JSON.parse(JSON.stringify(scope.style || {}));
    const list = instancesOf(draft);
    root.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog dialog-wide';
    dialog.innerHTML = `<h3>${t('audio.title')}</h3>`;
    const body = document.createElement('div');
    body.className = 'audio-body';
    const scopeRow = document.createElement('div');
    scopeRow.className = 'insp-inherit';
    scopeRow.textContent = `${t('audio.scope')}: ${t(scope.cueId ? 'audio.cue' : 'audio.project')}`;
    body.appendChild(scopeRow);
    dialog.appendChild(body);
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    dialog.appendChild(actions);
    root.appendChild(dialog);
    root.hidden = false;

    function rowFor(group, index, instance, param, value) {
      const row = document.createElement('div');
      row.className = 'ctrl-row audio-row';
      const label = document.createElement('span');
      label.className = 'ctrl-label';
      label.textContent = `${groupLabel(group)} · ${paramLabel(param)}`;
      row.appendChild(label);
      const controls = document.createElement('div');
      controls.className = 'audio-controls';
      const bound = value && typeof value === 'object' && value.audio;
      if (!bound) {
        const enable = document.createElement('button');
        enable.type = 'button';
        enable.className = 'btn btn-mini';
        enable.textContent = '♪';
        enable.title = t('audio.enable');
        enable.addEventListener('click', () => {
          const next = { audio: { band: 'mid', gain: defaultGain(param) } };
          if (index < 0) draft[group] = { ...instance, params: { ...instance.params, [param.key]: next } };
          else draft[group][index] = { ...instance, params: { ...instance.params, [param.key]: next } };
          render();
        });
        controls.appendChild(enable);
      } else {
        const band = document.createElement('select');
        for (const name of BANDS) {
          const option = document.createElement('option');
          option.value = name;
          option.textContent = t(`audio.band.${name}`);
          band.appendChild(option);
        }
        band.value = value.audio.band || 'mid';
        const gain = document.createElement('input');
        gain.type = 'number';
        gain.step = '0.05';
        gain.value = String(value.audio.gain == null ? 1 : value.audio.gain);
        const apply = () => {
          value.audio.band = band.value;
          value.audio.gain = Number(gain.value) || 0;
        };
        band.addEventListener('change', apply);
        gain.addEventListener('change', apply);
        const off = document.createElement('button');
        off.type = 'button';
        off.className = 'btn btn-mini';
        off.textContent = '×';
        off.title = t('audio.off');
        off.addEventListener('click', () => {
          const next = param.default == null ? 1 : param.default;
          if (index < 0) draft[group] = { ...instance, params: { ...instance.params, [param.key]: next } };
          else draft[group][index] = { ...instance, params: { ...instance.params, [param.key]: next } };
          render();
        });
        controls.appendChild(band);
        controls.appendChild(gain);
        controls.appendChild(off);
      }
      row.appendChild(controls);
      return row;
    }

    function render() {
      body.innerHTML = '';
      body.appendChild(scopeRow);
      const items = instancesOf(draft);
      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'insp-inherit';
        empty.textContent = t('audio.none');
        body.appendChild(empty);
        return;
      }
      for (const item of items) {
        const descriptor = SA.fx && SA.fx.get ? SA.fx.get(item.group, item.instance.type) : null;
        const params = (descriptor && descriptor.params) || [];
        for (const param of params) {
          if (param.kind !== 'number' && param.kind !== 'int') continue;
          const value = item.instance.params ? item.instance.params[param.key] : undefined;
          body.appendChild(rowFor(item.group, item.index, item.instance, param, value));
        }
      }
      const hint = document.createElement('div');
      hint.className = 'insp-inherit';
      hint.textContent = t('audio.hint');
      body.appendChild(hint);
    }

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-mini';
    cancel.textContent = t('audio.cancel');
    cancel.addEventListener('click', () => {
      root.hidden = true;
    });
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'btn btn-primary btn-mini';
    apply.textContent = t('audio.apply');
    apply.addEventListener('click', () => {
      const patch = {};
      for (const group of [...SINGLE_GROUPS, ...STACK_GROUPS]) {
        if (draft[group] === undefined) continue;
        patch[group] = draft[group];
      }
      if (Object.keys(patch).length) SA.store.commands.setStyle(scope.spec, patch);
      root.hidden = true;
    });
    actions.appendChild(cancel);
    actions.appendChild(apply);
    render();
  }

  return { open };
})();
