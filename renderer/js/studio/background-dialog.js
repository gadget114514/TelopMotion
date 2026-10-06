((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.backgroundDialog = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';

  const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];
  const VIDEO_EXTS = ['mp4', 'webm', 'mov'];
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };

  function t(key, vars) {
    if (typeof SA !== 'undefined' && SA.i18n) return SA.i18n.t(key, vars);
    return key;
  }

  function doc() {
    return (typeof SA !== 'undefined' && SA.store && SA.store.state && SA.store.state.project) || null;
  }

  function extOf(name) {
    return String(name || '').split('.').pop().toLowerCase();
  }

  // File / picked-object -> 'image' | 'video' | null. Pure, so tests can pin it.
  function classifyFile(file) {
    if (!file) return null;
    const type = String((file && file.type) || (file && file.mime) || '');
    const ext = extOf(file && file.name);
    if (/^image\//.test(type) || IMAGE_EXTS.includes(ext)) return 'image';
    if (/^video\//.test(type) || VIDEO_EXTS.includes(ext)) return 'video';
    return null;
  }

  function bgTrackOf(project) {
    return ((project && project.tracks) || []).find((entry) => entry && entry.kind === 'background') || null;
  }

  function slotLayers(project, slot) {
    return ((project && project.layers) || []).filter((layer) => layer && (layer.slot || 'background') === slot);
  }

  function preloadLayers() {
    try {
      const renderer = SA.preview && SA.preview.renderer ? SA.preview.renderer : null;
      if (renderer && typeof renderer.preloadLayers === 'function') renderer.preloadLayers().catch(() => {});
    } catch {
      /* ignore */
    }
  }

  function toast(key, vars) {
    if (SA.studio && typeof SA.studio.toast === 'function') SA.studio.toast(key, vars);
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('read-failed'));
      reader.readAsDataURL(blob);
    });
  }

  // A dropped / picked file becomes a background / foreground layer.
  // `input` is a native File (DnD, preview) or a picked { name, type, bytes }.
  async function setSlotFromFile(slot, input) {
    const project = doc();
    if (!project || !input) return null;
    const kind = classifyFile(input);
    if (!kind) {
      toast('background.unsupported');
      return null;
    }
    const name = (input && input.name) || (kind === 'image' ? 'image' : 'video');
    const ext = extOf(name);
    const mime = (input && (input.type || input.mime)) || MIME[ext] || (kind === 'video' ? 'video/mp4' : 'image/png');
    const layer = SA.layersDialog.defaults(slot);
    layer.fit = 'cover';
    if (kind === 'video') {
      let url = input.src || null;
      if (!url) {
        const bytes = input.bytes;
        const blob = bytes ? new Blob([bytes], { type: mime }) : input;
        url = URL.createObjectURL(blob);
        SA.mediaNotice.warn('video');
      }
      layer.type = 'video';
      layer.src = url;
      layer.color = '#ffffff';
      layer.video = { speed: 1, offset: 0, play: true, loop: true };
      SA.store.commands.addMedia({ id: `v${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`, name, mime, src: url, kind: 'videos' });
      SA.store.commands.addLayer(layer);
      preloadLayers();
      toast('studio.media.videoImported', { name });
      return layer;
    }
    let dataUrl = input.src || null;
    if (!dataUrl) {
      const bytes = input.bytes;
      const blob = bytes ? new Blob([bytes], { type: mime }) : input;
      dataUrl = await blobToDataURL(blob);
    }
    layer.type = 'image';
    layer.src = dataUrl;
    layer.color = '#ffffff';
    SA.store.commands.addLayer(layer);
    preloadLayers();
    toast('studio.media.layerAdded', { name });
    return layer;
  }

  function clearSlot(slot) {
    const project = doc();
    if (!project) return;
    for (const layer of slotLayers(project, slot)) SA.store.commands.removeLayer(layer.id);
  }

  function clearAll() {
    const project = doc();
    if (!project) return;
    const bg = bgTrackOf(project);
    if (bg) SA.store.commands.setTrackColor(bg.id, null);
    clearSlot('background');
    clearSlot('foreground');
  }

  // --- dialog (browser only) -------------------------------------------------

  function field(labelText, control) {
    const row = document.createElement('div');
    row.className = 'field';
    const label = document.createElement('span');
    label.textContent = labelText;
    row.appendChild(label);
    row.appendChild(control);
    return row;
  }

  function section(titleText) {
    const box = document.createElement('div');
    box.className = 'layer-section';
    const heading = document.createElement('div');
    heading.className = 'layer-section-title';
    heading.textContent = titleText;
    box.appendChild(heading);
    return box;
  }

  function dropzone(slot, onFiles) {
    const zone = document.createElement('div');
    zone.className = 'bg-dropzone';
    zone.textContent = t('background.dropHint');
    zone.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      zone.classList.add('is-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      zone.classList.remove('is-over');
      const files = event.dataTransfer && event.dataTransfer.files;
      if (files && files.length) onFiles(slot, files);
    });
    return zone;
  }

  async function pickFileAs(slot, accept, kind) {
    const picked = await SA.platform.readFile(accept);
    if (!picked || !picked.bytes) return;
    if (kind === 'video') {
      const mime = MIME[extOf(picked.name)] || 'video/mp4';
      const url = URL.createObjectURL(new Blob([picked.bytes], { type: mime }));
      await setSlotFromFile(slot, { name: picked.name, type: mime, src: url });
      return;
    }
    const mime = MIME[extOf(picked.name)] || 'image/png';
    const dataUrl = await blobToDataURL(new Blob([picked.bytes], { type: mime }));
    await setSlotFromFile(slot, { name: picked.name, type: mime, src: dataUrl });
  }

  function open() {
    if (typeof document === 'undefined') return;
    const project = doc();
    const root = document.getElementById('dialog-root');
    if (!project || !root) return;

    root.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog dialog-wide';
    const title = document.createElement('h3');
    title.textContent = t('background.title');
    const body = document.createElement('div');
    dialog.appendChild(title);
    dialog.appendChild(body);
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    dialog.appendChild(actions);
    root.appendChild(dialog);
    root.hidden = false;

    function rerender() {
      open();
    }

    // --- base colour (the background track's own colour) ----------------------
    const bg = bgTrackOf(doc());
    const baseBox = section(t('background.base'));
    const baseHint = document.createElement('div');
    baseHint.className = 'insp-inherit';
    baseHint.textContent = t('background.baseHint');
    baseBox.appendChild(baseHint);
    if (bg) {
      const control = SA.controls.colorControl(bg.color || null, (next) => {
        const color = next == null ? null : typeof next === 'string' ? { kind: 'solid', value: next, alpha: 1 } : next;
        SA.store.commands.setTrackColor(bg.id, color);
        rerender();
      });
      if (!bg.color) {
        const swatch = control.querySelector('.ctrl-swatch');
        if (swatch) swatch.style.background = 'repeating-conic-gradient(#3a4050 0% 25%, #22262f 0% 50%) 50% / 8px 8px';
      }
      baseBox.appendChild(field(t('background.color'), control));
      const row = document.createElement('div');
      row.className = 'layer-order';
      const chroma = document.createElement('button');
      chroma.type = 'button';
      chroma.className = 'btn btn-mini';
      chroma.textContent = t('background.chroma');
      chroma.addEventListener('click', () => {
        SA.store.commands.setTrackColor(bg.id, { kind: 'solid', value: '#00b140', alpha: 1 });
        rerender();
      });
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'btn btn-mini';
      clear.textContent = t('background.clear');
      clear.addEventListener('click', () => {
        SA.store.commands.setTrackColor(bg.id, null);
        rerender();
      });
      row.appendChild(chroma);
      row.appendChild(clear);
      baseBox.appendChild(row);
    }
    body.appendChild(baseBox);

    // --- one slot (background / foreground) -----------------------------------
    function slotBox(slot, titleKey) {
      const box = section(t(titleKey));
      const layers = slotLayers(doc(), slot);
      if (!layers.length) {
        const empty = document.createElement('div');
        empty.className = 'insp-inherit';
        empty.textContent = t('background.empty');
        box.appendChild(empty);
      }
      layers.forEach((layer) => {
        const row = document.createElement('div');
        row.className = 'layer-row is-active';
        const badge = document.createElement('span');
        badge.textContent = layer.type === 'solid' ? t('layers.typeSolid') : layer.type === 'video' ? t('layers.typeVideo') : t('layers.typeImage');
        row.appendChild(badge);
        if (layer.type === 'solid') {
          const swatch = document.createElement('button');
          swatch.type = 'button';
          swatch.className = 'ctrl-swatch';
          if (typeof SA !== 'undefined' && SA.colors && typeof SA.colors.paintSwatch === 'function') SA.colors.paintSwatch(swatch, layer.color || '#101826');
          else swatch.style.background = layer.color || '#101826';
          swatch.addEventListener('click', () => {
            SA.colors.openPicker({
              value: layer.color || '#101826',
              anchor: swatch,
              onChange(value) {
                const hex = (SA.colors.pickerValueToHex && SA.colors.pickerValueToHex(value))
                  || (typeof value === 'string' ? value : value && value.value);
                SA.store.commands.setLayer(layer.id, { color: hex });
                if (SA.colors.paintSwatch) SA.colors.paintSwatch(swatch, hex || '#101826');
                else swatch.style.background = hex || '#101826';
              },
            });
          });
          row.appendChild(swatch);
        } else {
          const name = document.createElement('span');
          name.className = 'insp-inherit';
          const src = String(layer.src || '');
          name.textContent = src.length > 40 ? `${src.slice(0, 40)}…` : src || layer.type;
          name.title = src;
          row.appendChild(name);
        }
        const opacity = document.createElement('input');
        opacity.type = 'number';
        opacity.min = '0';
        opacity.max = '1';
        opacity.step = '0.05';
        opacity.value = String(layer.opacity == null ? 1 : layer.opacity);
        opacity.title = t('layers.opacity');
        opacity.addEventListener('change', () => {
          const next = Number(opacity.value);
          SA.store.commands.setLayer(layer.id, { opacity: Number.isFinite(next) ? Math.max(0, Math.min(1, next)) : 1 });
        });
        row.appendChild(opacity);
        const visible = document.createElement('input');
        visible.type = 'checkbox';
        visible.checked = layer.enabled !== false;
        visible.title = t('background.visible');
        visible.addEventListener('change', () => {
          SA.store.commands.setLayer(layer.id, { enabled: visible.checked });
        });
        row.appendChild(visible);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn btn-mini';
        remove.textContent = t('background.clear');
        remove.addEventListener('click', () => {
          SA.store.commands.removeLayer(layer.id);
          rerender();
        });
        row.appendChild(remove);
        box.appendChild(row);
      });
      const addRow = document.createElement('div');
      addRow.className = 'layer-order';
      const addSolid = document.createElement('button');
      addSolid.type = 'button';
      addSolid.className = 'btn btn-mini';
      addSolid.textContent = t('background.solidAdd');
      addSolid.addEventListener('click', () => {
        SA.store.commands.addLayer({ ...SA.layersDialog.defaults(slot), type: 'solid', color: '#101826' });
        rerender();
      });
      const addImage = document.createElement('button');
      addImage.type = 'button';
      addImage.className = 'btn btn-mini';
      addImage.textContent = t('layers.choose');
      addImage.addEventListener('click', async () => {
        await pickFileAs(slot, '.png,.jpg,.jpeg,.webp,.gif,.bmp,image/png,image/jpeg,image/webp', 'image');
        rerender();
      });
      const addVideo = document.createElement('button');
      addVideo.type = 'button';
      addVideo.className = 'btn btn-mini';
      addVideo.textContent = t('layers.chooseVideo');
      addVideo.addEventListener('click', async () => {
        await pickFileAs(slot, '.mp4,.webm,.mov,video/mp4,video/webm', 'video');
        rerender();
      });
      addRow.appendChild(addSolid);
      addRow.appendChild(addImage);
      addRow.appendChild(addVideo);
      box.appendChild(addRow);
      box.appendChild(dropzone(slot, async (target, files) => {
        await setSlotFromFile(target, files[0]);
        rerender();
      }));
      body.appendChild(box);
    }

    slotBox('background', 'background.background');
    slotBox('foreground', 'background.foreground');

    const clearEvery = document.createElement('button');
    clearEvery.type = 'button';
    clearEvery.className = 'btn btn-mini';
    clearEvery.textContent = t('background.clearAll');
    clearEvery.addEventListener('click', () => {
      clearAll();
      rerender();
    });
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-primary btn-mini';
    close.textContent = t('background.close');
    close.addEventListener('click', () => {
      root.hidden = true;
    });
    actions.appendChild(clearEvery);
    actions.appendChild(close);
    root.addEventListener('click', (event) => {
      if (event.target === root) root.hidden = true;
    }, { once: true });
  }

  return { open, classifyFile, setSlotFromFile, clearSlot, clearAll, IMAGE_EXTS, VIDEO_EXTS };
});
