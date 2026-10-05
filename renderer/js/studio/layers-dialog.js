window.SA = window.SA || {};

SA.layersDialog = (() => {
  'use strict';

  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
  const FILTERS = {
    chromaticAberration: [
      { key: 'amount', kind: 'number', min: 0, max: 40, step: 1, default: 6 },
      { key: 'angle', kind: 'number', min: -180, max: 180, step: 5, default: 0 },
      { key: 'radial', kind: 'bool', default: false },
    ],
    rgbShift: [
      { key: 'amount', kind: 'number', min: 0, max: 40, step: 1, default: 4 },
      { key: 'angle', kind: 'number', min: -180, max: 180, step: 5, default: 0 },
      { key: 'jitter', kind: 'number', min: 0, max: 1, step: 0.05, default: 0.2 },
    ],
    glitchBlocks: [
      { key: 'blockSize', kind: 'number', min: 2, max: 128, step: 1, default: 24 },
      { key: 'rate', kind: 'number', min: 0, max: 1, step: 0.05, default: 0.3 },
      { key: 'rgbSplit', kind: 'number', min: 0, max: 10, step: 0.5, default: 2 },
    ],
  };

  function t(key, vars) {
    return SA.i18n.t(key, vars);
  }

  function defaults(slot) {
    return {
      id: `l${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`,
      slot: slot || 'background',
      type: 'solid',
      color: '#101826',
      src: '',
      opacity: 1,
      blend: 'normal',
      fit: 'stretch',
      radius: 0,
      enabled: true,
      locked: false,
      start: 0,
      end: null,
      video: { speed: 1, offset: 0, play: true, loop: true },
      scene: { preset: 'starfield', speed: 1, density: 1, color: '' },
      transform: { x: 0, y: 0, scale: 1, rotate: 0 },
      motion: {
        in: { type: 'fade', duration: 0.5, delay: 0, ease: 'easeOutCubic', params: {} },
        out: { type: 'fade', duration: 0.5, delay: 0, ease: 'easeInCubic', params: {} },
      },
      filter: { type: 'none', params: {} },
    };
  }

  // The slot a layer is listed under: foreground / background, or the video
  // track it sits on.
  function slotLabel(layer) {
    if (layer.slot === 'video') {
      const doc = SA.store && SA.store.state && SA.store.state.project;
      const track = ((doc && doc.tracks) || []).find((entry) => entry && entry.id === layer.trackId);
      return `${t('layers.slotVideo')}${track && track.name ? ` (${track.name})` : ''}`;
    }
    return layer.slot === 'foreground' ? t('layers.slotForeground') : t('layers.slotBackground');
  }

  function open() {
    const doc = SA.store.state.project;
    const root = document.getElementById('dialog-root');
    if (!doc || !root) return;
    let draft = JSON.parse(JSON.stringify(doc.layers || []));
    let selected = draft.length ? 0 : -1;
    root.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog dialog-wide layer-dialog';
    const title = document.createElement('h3');
    title.textContent = t('layers.title');
    const body = document.createElement('div');
    body.className = 'layer-body';
    const list = document.createElement('div');
    list.className = 'layer-list';
    const editor = document.createElement('div');
    editor.className = 'layer-editor';
    body.appendChild(list);
    body.appendChild(editor);
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    dialog.appendChild(title);
    dialog.appendChild(body);
    dialog.appendChild(actions);
    root.appendChild(dialog);
    root.hidden = false;

    function layerTypeName(layer) {
      if (layer.type === 'solid') return t('layers.typeSolid');
      if (layer.type === 'video') return t('layers.typeVideo');
      if (layer.type === 'scene3d') return t('layers.typeScene3d');
      return t('layers.typeImage');
    }

    function renderList() {
      list.innerHTML = '';
      if (!draft.length) {
        const empty = document.createElement('div');
        empty.className = 'insp-inherit';
        empty.textContent = t('layers.empty');
        list.appendChild(empty);
      }
      draft.forEach((layer, index) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = `layer-row${index === selected ? ' is-active' : ''}`;
        const name = document.createElement('span');
        name.textContent = `${index + 1}. ${slotLabel(layer)} · ${layerTypeName(layer)}${
          layer.enabled === false ? ` · ${t('layers.hidden')}` : ''
        }${layer.locked ? ` · ${t('layers.lockedBadge')}` : ''}`;
        row.appendChild(name);
        row.addEventListener('click', () => {
          selected = index;
          renderList();
          renderEditor();
        });
        list.appendChild(row);
      });
    }

    function renderEditor() {
      editor.innerHTML = '';
      const layer = draft[selected];
      const hint = document.createElement('p');
      hint.className = 'dialog-hint';
      hint.textContent = t('layers.inspectorHint');
      if (!layer) {
        editor.appendChild(hint);
        return;
      }
      // list management only: per-sheet editing lives in the inspector.
      // a read-only summary so the selected row is identifiable here.
      const summary = document.createElement('div');
      summary.className = 'layer-section';
      const title = document.createElement('div');
      title.className = 'layer-section-title';
      title.textContent = `${selected + 1}. ${slotLabel(layer)} · ${layerTypeName(layer)}${layer.locked ? ` · ${t('layers.lockedBadge')}` : ''}`;
      summary.appendChild(title);
      editor.appendChild(summary);
      editor.appendChild(hint);
      const order = document.createElement('div');
      order.className = 'layer-order';
      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'btn btn-mini';
      up.textContent = t('layers.up');
      up.disabled = selected <= 0;
      up.addEventListener('click', () => {
        if (selected <= 0) return;
        [draft[selected - 1], draft[selected]] = [draft[selected], draft[selected - 1]];
        selected -= 1;
        renderList();
        renderEditor();
      });
      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'btn btn-mini';
      down.textContent = t('layers.down');
      down.disabled = selected >= draft.length - 1;
      down.addEventListener('click', () => {
        if (selected >= draft.length - 1) return;
        [draft[selected + 1], draft[selected]] = [draft[selected], draft[selected + 1]];
        selected += 1;
        renderList();
        renderEditor();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-mini';
      remove.textContent = t('layers.remove');
      if (layer.locked) {
        remove.disabled = true;
        remove.title = t('layers.locked');
      } else {
        remove.addEventListener('click', () => {
          draft.splice(selected, 1);
          selected = Math.max(0, Math.min(draft.length - 1, selected));
          renderList();
          renderEditor();
        });
      }
      order.appendChild(up);
      order.appendChild(down);
      order.appendChild(remove);
      editor.appendChild(order);
    }

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn-mini';
    add.textContent = t('layers.add');
    add.addEventListener('click', () => {
      const current = selected >= 0 ? draft[selected] : null;
      const layer = defaults(current && (current.slot === 'foreground' || current.slot === 'video') ? current.slot : 'background');
      if (layer.slot === 'video') layer.trackId = current.trackId;
      draft.push(layer);
      selected = draft.length - 1;
      renderList();
      renderEditor();
    });
    const addMany = document.createElement('button');
    addMany.type = 'button';
    addMany.className = 'btn btn-mini';
    addMany.textContent = t('layers.addMany');
    addMany.addEventListener('click', async () => {
      const files = (await SA.platform.readFiles('.png,.jpg,.jpeg,.webp,.gif,.bmp,image/png,image/jpeg,image/webp')) || [];
      if (!files.length) return;
      const current = selected >= 0 ? draft[selected] : null;
      const slot = current && (current.slot === 'foreground' || current.slot === 'video') ? current.slot : 'background';
      for (const file of files) {
        if (!file || !file.bytes) continue;
        const extension = String(file.name || '').split('.').pop().toLowerCase();
        const mime = MIME[extension] || 'image/png';
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('read-failed'));
          reader.readAsDataURL(new Blob([file.bytes], { type: mime }));
        }).catch(() => null);
        if (!dataUrl) continue;
        const layer = defaults(slot);
        if (slot === 'video') layer.trackId = current.trackId;
        layer.type = 'image';
        layer.src = dataUrl;
        layer.fit = 'cover';
        layer.color = '#ffffff';
        draft.push(layer);
      }
      selected = draft.length - 1;
      renderList();
      renderEditor();
    });
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-mini';
    cancel.textContent = t('layers.cancel');
    cancel.addEventListener('click', () => {
      root.hidden = true;
    });
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'btn btn-primary btn-mini';
    apply.textContent = t('layers.apply');
    apply.addEventListener('click', () => {
      const next = JSON.parse(JSON.stringify(draft));
      SA.store.commands.setLayers(next);
      const renderer = SA.preview && SA.preview.renderer ? SA.preview.renderer : null;
      if (renderer && typeof renderer.preloadLayers === 'function') renderer.preloadLayers().catch(() => {});
      root.hidden = true;
    });
    actions.appendChild(add);
    actions.appendChild(addMany);
    actions.appendChild(cancel);
    actions.appendChild(apply);
    renderList();
    renderEditor();
  }

  return { open, defaults, slotLabel, FILTERS, MIME };
})();
