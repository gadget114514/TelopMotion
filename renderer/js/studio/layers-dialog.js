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

  function field(labelText, control) {
    const row = document.createElement('div');
    row.className = 'field';
    const label = document.createElement('span');
    label.textContent = labelText;
    row.appendChild(label);
    row.appendChild(control);
    return row;
  }

  function numberInput(value, onChange, options) {
    const opts = options || {};
    const input = document.createElement('input');
    input.type = 'number';
    input.step = String(opts.step == null ? 0.05 : opts.step);
    if (opts.min != null) input.min = String(opts.min);
    if (opts.max != null) input.max = String(opts.max);
    input.value = value == null ? '' : String(value);
    input.placeholder = opts.placeholder || '';
    input.addEventListener('change', () => {
      if (input.value.trim() === '' && opts.nullable) {
        onChange(null);
        return;
      }
      const next = Number(input.value);
      onChange(Number.isFinite(next) ? next : opts.fallback == null ? 0 : opts.fallback);
    });
    return input;
  }

  function selectInput(value, options, onChange) {
    const select = document.createElement('select');
    for (const option of options) {
      const item = document.createElement('option');
      item.value = option.value;
      item.textContent = option.label;
      select.appendChild(item);
    }
    select.value = value;
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  function checkbox(checked, labelText, onChange) {
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

  function typeLabel(group, type) {
    if (SA.controls && SA.controls.typeLabel) return SA.controls.typeLabel(group, type);
    return type;
  }

  function typeOptions(group, selected) {
    const list = SA.fx && SA.fx.list ? SA.fx.list(group) : [];
    const options = list.map((entry) => ({ value: entry.type, label: typeLabel(group, entry.type) }));
    if (!options.some((option) => option.value === selected) && selected) options.unshift({ value: selected, label: typeLabel(group, selected) });
    return options;
  }

  function easeOptions(selected) {
    const names = (SA.easing && SA.easing.names) || [];
    const options = names.map((name) => ({ value: name, label: name }));
    if (!options.some((option) => option.value === selected) && selected) options.unshift({ value: selected, label: selected });
    return options;
  }

  function paramDefaults(group, type) {
    if (SA.fx && SA.fx.paramDefaults) return SA.fx.paramDefaults(group, type);
    return {};
  }

  function paramField(param, value, onChange) {
    const labelText = SA.controls && SA.controls.labelFor ? SA.controls.labelFor(param.key) : param.key;
    if (param.kind === 'bool') return checkbox(value, labelText, onChange);
    if (param.kind === 'select') {
      const options = (param.options || []).map((option) => ({ value: option, label: option }));
      return field(labelText, selectInput(value, options, onChange));
    }
    if (param.kind === 'color') {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = typeof value === 'string' ? value : '';
      input.addEventListener('change', () => onChange(input.value.trim()));
      return field(labelText, input);
    }
    return field(
      labelText,
      numberInput(value, onChange, { step: param.step == null ? 0.05 : param.step, min: param.min, max: param.max, fallback: param.default })
    );
  }

  function open() {
    const doc = SA.store.state.project;
    const root = document.getElementById('dialog-root');
    if (!doc || !root) return;
    let draft = JSON.parse(JSON.stringify(doc.layers || []));
    let selected = draft.length ? 0 : -1;
    root.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog dialog-wide';
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
        }`;
        row.appendChild(name);
        row.addEventListener('click', () => {
          selected = index;
          renderList();
          renderEditor();
        });
        list.appendChild(row);
      });
    }

    function change(mutate) {
      const layer = draft[selected];
      if (!layer) return;
      mutate(layer);
      renderList();
      renderEditor();
    }

    function motionSection(layer, direction, group, fallbackLabel) {
      const key = direction;
      layer.motion = layer.motion || {};
      const current = layer.motion[key] || { type: group === 'enter' ? 'fade' : 'fade', duration: 0.5, delay: 0, ease: group === 'enter' ? 'easeOutCubic' : 'easeInCubic', params: {} };
      const box = document.createElement('div');
      box.className = 'layer-section';
      const heading = document.createElement('div');
      heading.className = 'layer-section-title';
      heading.textContent = fallbackLabel;
      box.appendChild(heading);
      const patch = (part) => change((next) => {
        next.motion = next.motion || {};
        next.motion[key] = { ...current, ...(next.motion[key] || {}), ...part };
      });
      box.appendChild(
        field(t('layers.motionType'), selectInput(current.type, typeOptions(group, current.type), (value) => {
          const target = (next) => {
            next.motion = next.motion || {};
            next.motion[key] = { type: value, duration: current.duration, delay: current.delay, ease: current.ease, params: {} };
          };
          change(target);
        }))
      );
      box.appendChild(field(t('layers.duration'), numberInput(current.duration, (value) => patch({ duration: Math.max(0, value) }), { min: 0, step: 0.05, fallback: 0.5 })));
      box.appendChild(field(t('layers.delay'), numberInput(current.delay, (value) => patch({ delay: value }), { step: 0.05, fallback: 0 })));
      box.appendChild(field(t('layers.ease'), selectInput(current.ease, easeOptions(current.ease), (value) => patch({ ease: value }))));
      const descriptor = SA.fx && SA.fx.get ? SA.fx.get(group, current.type) : null;
      for (const param of (descriptor && descriptor.params) || []) {
        layer.motion[key].params = layer.motion[key].params || {};
        const value = layer.motion[key].params[param.key] == null ? paramDefaults(group, current.type)[param.key] : layer.motion[key].params[param.key];
        box.appendChild(
          paramField(param, value, (next) => {
            change((target) => {
              target.motion = target.motion || {};
              target.motion[key] = { ...(target.motion[key] || current), params: { ...(target.motion[key] || current).params, [param.key]: next } };
            });
          })
        );
      }
      return box;
    }

    function renderEditor() {
      editor.innerHTML = '';
      const layer = draft[selected];
      if (!layer) return;
      layer.transform = layer.transform || { x: 0, y: 0, scale: 1, rotate: 0 };
      layer.motion = layer.motion || {};
      layer.filter = layer.filter || { type: 'none', params: {} };
      editor.appendChild(
        field(t('layers.type'), selectInput(layer.type, [
          { value: 'solid', label: t('layers.typeSolid') },
          { value: 'image', label: t('layers.typeImage') },
          { value: 'video', label: t('layers.typeVideo') },
          { value: 'scene3d', label: t('layers.typeScene3d') },
        ], (value) => change((next) => {
          next.type = value;
        })))
      );
      if (layer.type === 'solid') {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'ctrl-swatch';
        swatch.style.background = layer.color || '#101826';
        swatch.addEventListener('click', () => {
          SA.colors.openPicker({
            value: layer.color || '#101826',
            anchor: swatch,
            onChange(value) {
              const hex = typeof value === 'string' ? value : value && value.value;
              change((next) => {
                next.color = hex;
              });
              swatch.style.background = hex || '#101826';
            },
          });
        });
        editor.appendChild(field(t('layers.color'), swatch));
      } else if (layer.type === 'scene3d') {
        layer.scene = layer.scene || { preset: 'starfield', speed: 1, density: 1, color: '' };
        editor.appendChild(
          field(t('layers.scene3dPreset'), selectInput(layer.scene.preset || 'starfield', [
            { value: 'starfield', label: t('layers.scene3dStarfield') },
            { value: 'grid', label: t('layers.scene3dGrid') },
            { value: 'floating', label: t('layers.scene3dFloating') },
          ], (value) => change((next) => {
            next.scene = { ...(next.scene || {}), preset: value };
          })))
        );
        editor.appendChild(
          field(t('layers.speed'), numberInput(layer.scene.speed, (value) => change((next) => {
            next.scene = { ...(next.scene || {}), speed: value > 0 ? value : 1 };
          }), { min: 0.05, step: 0.05, fallback: 1 }))
        );
        editor.appendChild(
          field(t('layers.scene3dDensity'), numberInput(layer.scene.density, (value) => change((next) => {
            next.scene = { ...(next.scene || {}), density: Math.max(0.2, Math.min(3, value || 1)) };
          }), { min: 0.2, max: 3, step: 0.1, fallback: 1 }))
        );
        const accent = document.createElement('button');
        accent.type = 'button';
        accent.className = 'ctrl-swatch';
        accent.style.background = layer.scene.color || '#9fb8ff';
        accent.addEventListener('click', () => {
          SA.colors.openPicker({
            value: layer.scene.color || '#9fb8ff',
            anchor: accent,
            onChange(value) {
              const hex = typeof value === 'string' ? value : value && value.value;
              change((next) => {
                next.scene = { ...(next.scene || {}), color: hex || '' };
              });
              accent.style.background = hex || '#9fb8ff';
            },
          });
        });
        editor.appendChild(field(t('layers.scene3dColor'), accent));
      } else {
        const wrap = document.createElement('div');
        wrap.className = 'layer-source';
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.className = 'btn btn-mini';
        choose.textContent = t(layer.type === 'video' ? 'layers.chooseVideo' : 'layers.choose');
        choose.addEventListener('click', async () => {
          const accept =
            layer.type === 'video'
              ? '.mp4,.webm,.mov,video/mp4,video/webm'
              : '.png,.jpg,.jpeg,.webp,.gif,.bmp,image/png,image/jpeg,image/webp';
          const picked = await SA.platform.readFile(accept);
          if (!picked || !picked.bytes) return;
          const extension = String(picked.name || '').split('.').pop().toLowerCase();
          const mime = MIME[extension] || (layer.type === 'video' ? 'video/mp4' : 'image/png');
          if (layer.type === 'video') {
            const url = URL.createObjectURL(new Blob([picked.bytes], { type: mime }));
            change((next) => {
              next.src = url;
            });
            return;
          }
          const blob = new Blob([picked.bytes], { type: mime });
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('read-failed'));
            reader.readAsDataURL(blob);
          });
          change((next) => {
            next.src = dataUrl;
          });
        });
        const url = document.createElement('input');
        url.type = 'text';
        url.placeholder = t('layers.url');
        url.value = layer.src && layer.src.length < 200 ? layer.src : '';
        url.addEventListener('change', () => {
          change((next) => {
            next.src = url.value.trim();
          });
        });
        wrap.appendChild(choose);
        wrap.appendChild(url);
        editor.appendChild(field(t(layer.type === 'video' ? 'layers.video' : 'layers.image'), wrap));
        if (layer.type === 'video') {
          layer.video = layer.video || { speed: 1, offset: 0, play: true, loop: true };
          editor.appendChild(
            field(t('layers.speed'), numberInput(layer.video.speed, (value) => change((next) => {
              next.video = { ...(next.video || {}), speed: value || 1 };
            }), { step: 0.05, fallback: 1 }))
          );
          editor.appendChild(
            field(t('layers.offset'), numberInput(layer.video.offset, (value) => change((next) => {
              next.video = { ...(next.video || {}), offset: value };
            }), { step: 0.05, fallback: 0 }))
          );
          editor.appendChild(
            checkbox(layer.video.loop !== false, t('layers.loop'), (value) =>
              change((next) => {
                next.video = { ...(next.video || {}), loop: value };
              })
            )
          );
          editor.appendChild(
            checkbox(layer.video.play !== false, t('layers.playInPreview'), (value) =>
              change((next) => {
                next.video = { ...(next.video || {}), play: value };
              })
            )
          );
        }
      }
      const timing = document.createElement('div');
      timing.className = 'layer-section';
      const timingTitle = document.createElement('div');
      timingTitle.className = 'layer-section-title';
      timingTitle.textContent = t('layers.time');
      timing.appendChild(timingTitle);
      timing.appendChild(field(t('layers.start'), numberInput(layer.start, (value) => change((next) => {
        next.start = Math.max(0, value || 0);
      }), { min: 0, step: 0.1, fallback: 0 })));
      timing.appendChild(field(t('layers.end'), numberInput(layer.end, (value) => change((next) => {
        next.end = value == null ? null : Math.max(0, value);
      }), { min: 0, step: 0.1, nullable: true, placeholder: t('layers.endInfinity') })));
      editor.appendChild(timing);
      editor.appendChild(
        field(t('layers.slot'), selectInput(layer.slot === 'video' ? `video:${layer.trackId}` : layer.slot, [
          { value: 'background', label: t('layers.slotBackground') },
          { value: 'foreground', label: t('layers.slotForeground') },
          ...((SA.store.state.project && SA.store.state.project.tracks) || [])
            .filter((track) => track && track.kind === 'video')
            .map((track) => ({ value: `video:${track.id}`, label: slotLabel({ slot: 'video', trackId: track.id }) })),
        ], (value) => change((next) => {
          if (value.startsWith('video:')) {
            next.slot = 'video';
            next.trackId = value.slice('video:'.length);
          } else {
            next.slot = value;
            delete next.trackId;
          }
        })))
      );
      editor.appendChild(
        field(t('layers.blend'), selectInput(layer.blend || 'normal', [
          { value: 'normal', label: t('layers.blendNormal') },
          { value: 'add', label: t('layers.blendAdd') },
          { value: 'multiply', label: t('layers.blendMultiply') },
          { value: 'screen', label: t('layers.blendScreen') },
          { value: 'overlay', label: t('layers.blendOverlay') },
          { value: 'softLight', label: t('layers.blendSoftLight') },
          { value: 'hardLight', label: t('layers.blendHardLight') },
          { value: 'lighten', label: t('layers.blendLighten') },
          { value: 'darken', label: t('layers.blendDarken') },
          { value: 'difference', label: t('layers.blendDifference') },
          { value: 'exclusion', label: t('layers.blendExclusion') },
          { value: 'colorDodge', label: t('layers.blendColorDodge') },
          { value: 'colorBurn', label: t('layers.blendColorBurn') },
        ], (value) => change((next) => {
          next.blend = value;
        })))
      );
      editor.appendChild(
        field(t('layers.fit'), selectInput(layer.fit || 'stretch', [
          { value: 'cover', label: t('layers.fitCover') },
          { value: 'contain', label: t('layers.fitContain') },
          { value: 'stretch', label: t('layers.fitStretch') },
          { value: 'actual', label: t('layers.fitActual') },
        ], (value) => change((next) => {
          next.fit = value;
        })))
      );
      editor.appendChild(field(t('layers.opacity'), numberInput(layer.opacity, (value) => change((next) => {
        next.opacity = Math.max(0, Math.min(1, value));
      }), { min: 0, max: 1, step: 0.05, fallback: 1 })));
      editor.appendChild(field(t('layers.radius'), numberInput(layer.radius, (value) => change((next) => {
        next.radius = Math.max(0, Math.min(0.5, value));
      }), { min: 0, max: 0.5, step: 0.02, fallback: 0 })));
      editor.appendChild(field(t('layers.x'), numberInput(layer.transform.x, (value) => change((next) => {
        next.transform.x = value;
      }), { step: 0.01, fallback: 0 })));
      editor.appendChild(field(t('layers.y'), numberInput(layer.transform.y, (value) => change((next) => {
        next.transform.y = value;
      }), { step: 0.01, fallback: 0 })));
      editor.appendChild(field(t('layers.scale'), numberInput(layer.transform.scale, (value) => change((next) => {
        next.transform.scale = value || 1;
      }), { step: 0.05, fallback: 1 })));
      editor.appendChild(field(t('layers.scaleX'), numberInput(layer.transform.scaleX == null ? 1 : layer.transform.scaleX, (value) => change((next) => {
        next.transform.scaleX = value || 1;
      }), { step: 0.05, fallback: 1 })));
      editor.appendChild(field(t('layers.scaleY'), numberInput(layer.transform.scaleY == null ? 1 : layer.transform.scaleY, (value) => change((next) => {
        next.transform.scaleY = value || 1;
      }), { step: 0.05, fallback: 1 })));
      editor.appendChild(field(t('layers.rotate'), numberInput(layer.transform.rotate, (value) => change((next) => {
        next.transform.rotate = value;
      }), { step: 1, fallback: 0 })));
      editor.appendChild(field(t('layers.anchorX'), numberInput(layer.transform.anchorX == null ? 0.5 : layer.transform.anchorX, (value) => change((next) => {
        next.transform.anchorX = Math.max(0, Math.min(1, value));
      }), { min: 0, max: 1, step: 0.05, fallback: 0.5 })));
      editor.appendChild(field(t('layers.anchorY'), numberInput(layer.transform.anchorY == null ? 0.5 : layer.transform.anchorY, (value) => change((next) => {
        next.transform.anchorY = Math.max(0, Math.min(1, value));
      }), { min: 0, max: 1, step: 0.05, fallback: 0.5 })));
      editor.appendChild(field(t('layers.cropLeft'), numberInput(layer.crop && layer.crop.l, (value) => change((next) => {
        next.crop = { ...(next.crop || {}), l: Math.max(0, Math.min(0.95, value || 0)) };
      }), { min: 0, max: 0.95, step: 0.01, fallback: 0 })));
      editor.appendChild(field(t('layers.cropTop'), numberInput(layer.crop && layer.crop.t, (value) => change((next) => {
        next.crop = { ...(next.crop || {}), t: Math.max(0, Math.min(0.95, value || 0)) };
      }), { min: 0, max: 0.95, step: 0.01, fallback: 0 })));
      editor.appendChild(field(t('layers.cropRight'), numberInput(layer.crop && layer.crop.r, (value) => change((next) => {
        next.crop = { ...(next.crop || {}), r: Math.max(0, Math.min(0.95, value || 0)) };
      }), { min: 0, max: 0.95, step: 0.01, fallback: 0 })));
      editor.appendChild(field(t('layers.cropBottom'), numberInput(layer.crop && layer.crop.b, (value) => change((next) => {
        next.crop = { ...(next.crop || {}), b: Math.max(0, Math.min(0.95, value || 0)) };
      }), { min: 0, max: 0.95, step: 0.01, fallback: 0 })));
      editor.appendChild(motionSection(layer, 'in', 'enter', t('layers.motionIn')));
      editor.appendChild(motionSection(layer, 'out', 'exit', t('layers.motionOut')));
      const filterBox = document.createElement('div');
      filterBox.className = 'layer-section';
      const filterTitle = document.createElement('div');
      filterTitle.className = 'layer-section-title';
      filterTitle.textContent = t('layers.filters');
      filterBox.appendChild(filterTitle);
      filterBox.appendChild(
        field(t('layers.filter'), selectInput(layer.filter.type || 'none', [
          { value: 'none', label: t('layers.filterNone') },
          { value: 'chromaticAberration', label: t('layers.filterChromatic') },
          { value: 'rgbShift', label: t('layers.filterRgbShift') },
          { value: 'glitchBlocks', label: t('layers.filterGlitch') },
        ], (value) => change((next) => {
          next.filter = { type: value, params: {} };
        })))
      );
      for (const param of FILTERS[layer.filter.type] || []) {
        const value = layer.filter.params && layer.filter.params[param.key] != null ? layer.filter.params[param.key] : param.default;
        filterBox.appendChild(
          paramField(param, value, (next) => {
            change((target) => {
              target.filter = { type: target.filter.type, params: { ...(target.filter.params || {}), [param.key]: next } };
            });
          })
        );
      }
      editor.appendChild(filterBox);
      editor.appendChild(
        checkbox(layer.enabled !== false, t('layers.visible'), (value) =>
          change((next) => {
            next.enabled = value;
          })
        )
      );
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
      remove.addEventListener('click', () => {
        draft.splice(selected, 1);
        selected = Math.max(0, Math.min(draft.length - 1, selected));
        renderList();
        renderEditor();
      });
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
    actions.appendChild(cancel);
    actions.appendChild(apply);
    renderList();
    renderEditor();
  }

  return { open, defaults, slotLabel, FILTERS };
})();
