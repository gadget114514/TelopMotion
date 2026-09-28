window.SA = window.SA || {};

SA.themeEditor = (() => {
  'use strict';

  const SINGLE_GROUPS = ['animation', 'layout', 'enter', 'exit', 'location', 'fill', 'bgShape', 'bgFill', 'bgMotion'];
  const STACK_GROUPS = ['hold', 'edge', 'post', 'bgEdge'];
  const ALL_GROUPS = [...SINGLE_GROUPS, ...STACK_GROUPS];
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
    bgShape: 'studio.inspector.bgShape',
    bgFill: 'studio.inspector.bgFill',
    bgEdge: 'studio.inspector.bgEdge',
    bgMotion: 'studio.inspector.bgMotion',
  };
  const ORDER = ['layout', 'animation', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion'];

  let draft = null;
  let root = null;
  let openSections = new Set(['layout']);

  function t(key, vars) {
    return SA.i18n.t(key, vars);
  }

  function project() {
    return SA.store.state.project;
  }

  function seedNow() {
    return Math.floor(Math.random() * 900000) + 1000;
  }

  function defaultAxes() {
    return { speed: 0.5, energy: 0.5, softness: 0.6, density: 0.5, brightness: 0.6 };
  }

  function contextFor(doc) {
    return SA.moods.contextFor(doc);
  }

  function defaultMotion() {
    return {
      in: { duration: 0.6, delay: 0, ease: 'easeOutCubic' },
      out: { duration: 0.45, delay: 0, ease: 'easeInCubic' },
      stagger: { each: 0.035, order: 'ltr', ease: 'linear', unit: 'letter', from: 0.5 },
      loop: { period: 0, yoyo: true, ease: 'easeInOutSine' },
    };
  }

  function ensureMotion(instance) {
    const motion = instance.motion || (instance.motion = {});
    motion.in = motion.in || { duration: 0.6, delay: 0, ease: 'easeOutCubic' };
    motion.out = motion.out || { duration: 0.45, delay: 0, ease: 'easeInCubic' };
    motion.stagger = motion.stagger || { each: 0.035, order: 'ltr', ease: 'linear', unit: 'letter', from: 0.5 };
    motion.loop = motion.loop || { period: 0, yoyo: true, ease: 'easeInOutSine' };
    return motion;
  }

  function customRow(container, label, control) {
    const node = document.createElement('div');
    node.className = 'ctrl-row';
    const text = document.createElement('label');
    text.className = 'ctrl-label';
    text.textContent = label;
    node.appendChild(text);
    node.appendChild(control);
    container.appendChild(node);
    return node;
  }

  function buildParamRows(container, group, instance) {
    const descriptor = SA.fx.get(group, instance.type);
    for (const param of SA.controls.paramEntries(descriptor)) {
      const stored = instance.params ? instance.params[param.key] : undefined;
      const current = stored === undefined ? param.default : stored;
      const control = SA.controls.paramControl(group, param, current, (value) => {
        instance.params = instance.params || {};
        instance.params[param.key] = value;
      });
      SA.controls.row(container, { key: param.key, control });
    }
  }

  function buildMotionRows(container, instance) {
    const motion = ensureMotion(instance);
    customRow(
      container,
      t('studio.themeEditor.inDuration'),
      SA.controls.numberControl({ min: 0.05, max: 5, step: 0.05, default: 0.6 }, motion.in.duration, (value) => {
        motion.in.duration = value;
      })
    );
    customRow(container, t('studio.themeEditor.inEase'), SA.controls.easeControl(motion.in.ease, (value) => {
      motion.in.ease = value;
    }));
    customRow(
      container,
      t('studio.themeEditor.outDuration'),
      SA.controls.numberControl({ min: 0.05, max: 5, step: 0.05, default: 0.45 }, motion.out.duration, (value) => {
        motion.out.duration = value;
      })
    );
    customRow(container, t('studio.themeEditor.outEase'), SA.controls.easeControl(motion.out.ease, (value) => {
      motion.out.ease = value;
    }));
    customRow(
      container,
      t('studio.themeEditor.staggerEach'),
      SA.controls.numberControl({ min: 0, max: 0.3, step: 0.005, default: 0.035 }, motion.stagger.each, (value) => {
        motion.stagger.each = value;
      })
    );
    customRow(
      container,
      t('studio.themeEditor.staggerOrder'),
      SA.controls.selectControl({}, motion.stagger.order, (value) => {
        motion.stagger.order = value;
      }, ['ltr', 'rtl', 'center-out', 'edges-in', 'random', 'word', 'line', 'oddEven', 'vertical-reading'].map((value) => ({
        value,
        label: SA.controls.valueLabel(value),
      })))
    );
  }

  function buildInstance(container, group, instance, refresh) {
    const head = document.createElement('div');
    head.className = 'field theme-instance-head';
    const select = SA.controls.selectControl({}, instance.type, (value) => {
      instance.type = value;
      instance.params = {};
      refresh();
    }, SA.fx.list(group).map((descriptor) => ({ value: descriptor.type, label: SA.controls.typeLabel(group, descriptor.type) })));
    head.appendChild(select);
    if (STACK_GROUPS.includes(group)) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-mini';
      remove.textContent = '✕';
      remove.addEventListener('click', () => {
        const stack = draft.style[group] || [];
        const index = stack.indexOf(instance);
        if (index >= 0) stack.splice(index, 1);
        if (!stack.length) delete draft.style[group];
        refresh();
      });
      head.appendChild(remove);
    }
    container.appendChild(head);
    buildParamRows(container, group, instance);
    buildMotionRows(container, instance);
  }

  function buildGroupBody(body, group, refresh) {
    if (STACK_GROUPS.includes(group)) {
      const stack = draft.style[group] || [];
      for (const instance of [...stack]) buildInstance(body, group, instance, refresh);
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'btn btn-mini';
      add.textContent = t('studio.themeEditor.add');
      add.addEventListener('click', () => {
        const descriptor = SA.fx.list(group)[0];
        if (!descriptor) return;
        const list = draft.style[group] || (draft.style[group] = []);
        list.push({ type: descriptor.type, params: {}, enabled: true, motion: defaultMotion() });
        refresh();
      });
      body.appendChild(add);
      return;
    }
    const instance = draft.style[group];
    const head = document.createElement('div');
    head.className = 'field theme-instance-head';
    const select = SA.controls.selectControl({}, instance ? instance.type : '', (value) => {
      if (!value) {
        delete draft.style[group];
      } else {
        draft.style[group] = { type: value, params: {}, enabled: true, motion: instance ? ensureMotion(instance) : defaultMotion() };
      }
      refresh();
    }, [{ value: '', label: t('studio.themeEditor.none') }, ...SA.fx.list(group).map((descriptor) => ({ value: descriptor.type, label: SA.controls.typeLabel(group, descriptor.type) }))]);
    head.appendChild(select);
    body.appendChild(head);
    const current = draft.style[group];
    if (!current) return;
    buildParamRows(body, group, current);
    buildMotionRows(body, current);
  }

  function sectionFor(group) {
    const node = document.createElement('details');
    node.className = 'theme-group';
    node.open = openSections.has(group);
    const summary = document.createElement('summary');
    summary.textContent = t(GROUP_LABELS[group]);
    node.appendChild(summary);
    const body = document.createElement('div');
    body.className = 'theme-group-body';
    const refresh = () => {
      body.innerHTML = '';
      buildGroupBody(body, group, refresh);
    };
    refresh();
    node.appendChild(body);
    node.addEventListener('toggle', () => {
      if (node.open) openSections.add(group);
      else openSections.delete(group);
    });
    return node;
  }

  function textSection() {
    const node = document.createElement('details');
    node.className = 'theme-group';
    node.open = openSections.has('text');
    const summary = document.createElement('summary');
    summary.textContent = t('studio.inspector.text');
    node.appendChild(summary);
    const body = document.createElement('div');
    body.className = 'theme-group-body';
    const text = draft.style.text || (draft.style.text = {});
    const fonts = (SA.lyricsFont.builtins ? SA.lyricsFont.builtins() : []).map((entry) => ({ value: entry.id, label: entry.family }));
    customRow(
      body,
      SA.controls.labelFor('fontId'),
      SA.controls.selectControl({}, text.fontId, (value) => {
        text.fontId = value;
      }, fonts)
    );
    customRow(
      body,
      SA.controls.labelFor('size'),
      SA.controls.numberControl({ min: 24, max: 240, step: 2, default: 96 }, text.size, (value) => {
        text.size = value;
      })
    );
    customRow(
      body,
      SA.controls.labelFor('weight'),
      SA.controls.selectControl({}, String(text.weight || 400), (value) => {
        text.weight = Number(value);
      }, [
        { value: '400', label: '400' },
        { value: '700', label: '700' },
      ])
    );
    customRow(
      body,
      SA.controls.labelFor('letterSpacing'),
      SA.controls.numberControl({ min: 0, max: 0.3, step: 0.01, default: 0 }, text.letterSpacing, (value) => {
        text.letterSpacing = value;
      })
    );
    customRow(
      body,
      SA.controls.labelFor('align'),
      SA.controls.selectControl({}, text.align, (value) => {
        text.align = value;
      }, ['left', 'center', 'right'].map((value) => ({ value, label: SA.controls.valueLabel(value) })))
    );
    node.appendChild(body);
    node.addEventListener('toggle', () => {
      if (node.open) openSections.add('text');
      else openSections.delete('text');
    });
    return node;
  }

  function colorSection() {
    const node = document.createElement('details');
    node.className = 'theme-group';
    node.open = openSections.has('color');
    const summary = document.createElement('summary');
    summary.textContent = t('studio.inspector.color');
    node.appendChild(summary);
    const body = document.createElement('div');
    body.className = 'theme-group-body';
    const colorSet = draft.style.color || (draft.style.color = { fill: { kind: 'solid', value: '#ffffff', alpha: 1 } });
    const fill = colorSet.fill || (colorSet.fill = { kind: 'solid', value: '#ffffff', alpha: 1 });
    customRow(
      body,
      t('studio.themeEditor.fillKind'),
      SA.controls.selectControl({}, fill.kind || 'solid', (value) => {
        fill.kind = value;
        if (value === 'gradient' && !fill.stops) {
          fill.type = 'linear';
          fill.angle = 90;
          fill.stops = [
            { pos: 0, color: fill.value || '#ffd7a8', alpha: 1 },
            { pos: 1, color: '#ffffff', alpha: 1 },
          ];
        }
        refresh();
      }, [
        { value: 'solid', label: t('studio.themeEditor.fillSolid') },
        { value: 'gradient', label: t('studio.themeEditor.fillGradient') },
      ])
    );
    const refresh = () => {
      body.innerHTML = '';
      buildColorBody(body, fill);
    };
    node.addEventListener('toggle', () => {
      if (node.open) openSections.add('color');
      else openSections.delete('color');
    });
    buildColorBody(body, fill);
    node.appendChild(body);
    return node;
  }

  function buildColorBody(body, fill) {
    if (fill.kind === 'gradient') {
      customRow(body, t('studio.themeEditor.fillGradient'), SA.controls.gradientControl(fill, () => {}));
    } else {
      customRow(
        body,
        t('studio.themeEditor.fillSolid'),
        SA.controls.colorControl(fill.value, (value) => {
          fill.value = typeof value === 'string' ? value : (value && value.value) || fill.value;
        })
      );
    }
  }

  function generateFromAxes() {
    const doc = project();
    const result = SA.moods.generate({
      axes: draft.axes,
      seed: draft.seed,
      direction: draft.direction,
      genre: draft.genre || null,
      context: contextFor(doc),
      ensureSignature: true,
    });
    draft.style = result.style;
    render();
  }

  function applyDraft() {
    const doc = project();
    if (!doc) return;
    const style = SA.store.clone(draft.style);
    SA.store.dispatch({
      label: 'apply theme',
      areas: ['style'],
      do(projectDoc) {
        for (const group of SA.themes.THEME_GROUPS) delete projectDoc.style[group];
        projectDoc.style = SA.project.mergeDeep(projectDoc.style, style);
      },
    });
    SA.studio.toast('studio.toast.themeApplied', { name: draft.name });
  }

  function saveDraft() {
    const doc = project();
    const entry = draft.id
      ? SA.themes.update(draft.id, { name: draft.name, style: SA.store.clone(draft.style), axes: { ...draft.axes }, seed: draft.seed, direction: draft.direction, genre: draft.genre })
      : SA.themes.save(draft.name, SA.store.clone(draft.style), { ...draft.axes }, draft.genre);
    if (entry) {
      draft.id = entry.id;
      SA.studio.toast('studio.toast.themeSaved', { name: entry.name });
    }
    void doc;
  }

  function paletteSection() {
    const node = document.createElement('details');
    node.className = 'theme-group';
    node.open = openSections.has('palette');
    const summary = document.createElement('summary');
    summary.textContent = t('studio.themeEditor.palette');
    node.appendChild(summary);
    const body = document.createElement('div');
    body.className = 'theme-group-body';
    const palette = draft.style.palette && Array.isArray(draft.style.palette.colors)
      ? draft.style.palette
      : (draft.style.palette = SA.moods.generatePalette(Math.random, draft.axes, 'theme'));

    const swatches = document.createElement('div');
    swatches.className = 'palette-swatches';
    const renderSwatches = () => {
      swatches.innerHTML = '';
      palette.colors.forEach((hex, index) => {
        const item = document.createElement('span');
        item.className = 'palette-swatch-item';
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'ctrl-swatch';
        swatch.style.background = hex;
        swatch.title = hex;
        swatch.addEventListener('click', () => {
          SA.colors.openPicker({
            value: hex,
            anchor: swatch,
            onChange(next) {
              const value = typeof next === 'string' ? next : next && next.value ? next.value : hex;
              palette.colors[index] = value;
              swatch.style.background = value;
              swatch.title = value;
            },
          });
        });
        item.appendChild(swatch);
        if (palette.colors.length > 3) {
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'palette-remove';
          remove.textContent = '✕';
          remove.addEventListener('click', () => {
            palette.colors.splice(index, 1);
            renderSwatches();
          });
          item.appendChild(remove);
        }
        swatches.appendChild(item);
      });
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'btn btn-mini';
      add.textContent = '＋';
      add.addEventListener('click', () => {
        palette.colors.push(palette.colors[3] || palette.colors[palette.colors.length - 1] || '#ffffff');
        renderSwatches();
      });
      swatches.appendChild(add);
    };
    renderSwatches();
    body.appendChild(swatches);

    const actions = document.createElement('div');
    actions.className = 'insp-actions';
    const randomButton = document.createElement('button');
    randomButton.type = 'button';
    randomButton.className = 'btn btn-mini';
    randomButton.textContent = t('studio.themeEditor.paletteRandom');
    randomButton.addEventListener('click', () => {
      draft.style.palette = SA.moods.generatePalette(Math.random, draft.axes);
      render();
    });
    actions.appendChild(randomButton);
    const presetSelect = SA.controls.selectControl({}, '', (value) => {
      if (!value) return;
      const entry = SA.colors.allPalettes().find((item) => item.id === value);
      if (!entry) return;
      draft.style.palette = { id: entry.id, name: entry.name, colors: [...entry.colors] };
      render();
    }, [
      { value: '', label: t('studio.themeEditor.paletteFrom') },
      ...SA.colors.allPalettes().map((entry) => ({ value: entry.id, label: entry.name })),
    ]);
    actions.appendChild(presetSelect);
    body.appendChild(actions);

    node.appendChild(body);
    node.addEventListener('toggle', () => {
      if (node.open) openSections.add('palette');
      else openSections.delete('palette');
    });
    return node;
  }

  function render() {
    if (!root) return;
    root.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog dialog-wide theme-editor';
    const title = document.createElement('h3');
    title.textContent = t('studio.themeEditor.title');
    dialog.appendChild(title);

    // genre chips: a genre overrides the axes and adds signatures / materials
    const chips = document.createElement('div');
    chips.className = 'mood-chips';
    const genres = (SA.genres && SA.genres.LIST) || [];
    const genreEntries = [{ id: null, label: t('studio.genres.none') }].concat(
      genres.map((genre) => ({ id: genre.id, label: t(`studio.genres.${genre.id}`) }))
    );
    for (const entry of genreEntries) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `btn btn-mini${(draft.genre || null) === entry.id ? ' is-active' : ''}`;
      chip.textContent = entry.label;
      chip.addEventListener('click', () => {
        draft.genre = entry.id;
        const genre = entry.id && SA.genres ? SA.genres.get(entry.id) : null;
        if (genre) {
          draft.axes = SA.moods.normalizeAxes(genre.axes);
          if (genre.direction) draft.direction = genre.direction;
        }
        render();
      });
      chips.appendChild(chip);
    }
    dialog.appendChild(chips);
    const genreHint = document.createElement('div');
    genreHint.className = 'insp-inherit';
    genreHint.textContent = draft.genre ? t(`studio.genres.desc.${draft.genre}`) : t('studio.genres.desc.none');
    dialog.appendChild(genreHint);

    const axes = document.createElement('div');
    axes.className = 'axis-grid';
    for (const axis of SA.moods.MATCH_AXES) {
      const row = document.createElement('label');
      row.className = 'axis-row';
      const label = document.createElement('span');
      label.textContent = t(`studio.themeEditor.axis.${axis}`);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '0.05';
      input.value = String(draft.axes[axis]);
      const value = document.createElement('span');
      value.className = 'axis-value';
      value.textContent = Number(draft.axes[axis]).toFixed(2);
      input.addEventListener('input', () => {
        draft.axes[axis] = Number(input.value);
        value.textContent = Number(input.value).toFixed(2);
      });
      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(value);
      axes.appendChild(row);
      const hint = document.createElement('div');
      hint.className = 'insp-inherit axis-hint';
      hint.textContent = t(`studio.themeEditor.axisHint.${axis}`);
      axes.appendChild(hint);
    }
    dialog.appendChild(axes);
    const axesHint = document.createElement('div');
    axesHint.className = 'insp-inherit';
    axesHint.textContent = t('studio.themeEditor.axesHint');
    dialog.appendChild(axesHint);

    const tools = document.createElement('div');
    tools.className = 'theme-editor-tools';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'theme-name-input';
    nameInput.value = draft.name;
    nameInput.addEventListener('input', () => {
      draft.name = nameInput.value;
    });
    const seedInput = document.createElement('input');
    seedInput.type = 'number';
    seedInput.className = 'theme-seed-input';
    seedInput.value = String(draft.seed);
    seedInput.addEventListener('change', () => {
      draft.seed = Number(seedInput.value) || draft.seed;
    });
    const generate = document.createElement('button');
    generate.type = 'button';
    generate.className = 'btn btn-mini btn-primary';
    generate.textContent = t('studio.themeEditor.generate');
    generate.addEventListener('click', generateFromAxes);
    const reroll = document.createElement('button');
    reroll.type = 'button';
    reroll.className = 'btn btn-mini';
    reroll.textContent = t('studio.themeEditor.reroll');
    reroll.addEventListener('click', () => {
      draft.seed = seedNow();
      seedInput.value = String(draft.seed);
      generateFromAxes();
    });
    const randomAxes = document.createElement('button');
    randomAxes.type = 'button';
    randomAxes.className = 'btn btn-mini';
    randomAxes.textContent = t('studio.themeEditor.randomAxes');
    randomAxes.addEventListener('click', () => {
      // jitter the current axes without changing the genre
      const r = Math.random;
      const next = {};
      for (const axis of SA.moods.MATCH_AXES) next[axis] = Math.max(0, Math.min(1, Number(draft.axes[axis] == null ? 0.5 : draft.axes[axis]) + (r() * 2 - 1) * 0.12));
      draft.axes = next;
      draft.features = null;
      draft.seed = seedNow();
      generateFromAxes();
    });
    const fromAudio = document.createElement('button');
    fromAudio.type = 'button';
    fromAudio.className = 'btn btn-mini';
    fromAudio.textContent = t('studio.themeEditor.fromAudio');
    fromAudio.addEventListener('click', () => {
      const analysis = SA.preview.getAudioAnalysis ? SA.preview.getAudioAnalysis() : null;
      if (!analysis) {
        SA.studio.toast('studio.themeEditor.noAudio');
        return;
      }
      const features = SA.audioAnalysis.features(analysis);
      draft.axes = SA.moods.axesFromAudio(features);
      draft.direction = 'horizontal';
      draft.features = features;
      draft.seed = seedNow();
      generateFromAxes();
    });
    tools.appendChild(nameInput);
    tools.appendChild(seedInput);
    tools.appendChild(reroll);
    tools.appendChild(randomAxes);
    tools.appendChild(fromAudio);
    tools.appendChild(generate);
    dialog.appendChild(tools);
    if (draft.features) {
      const info = document.createElement('div');
      info.className = 'theme-editor-info';
      const percent = (value) => `${Math.round((Number(value) || 0) * 100)}%`;
      info.textContent = t('studio.themeEditor.detected', {
        bpm: draft.features.bpm ? draft.features.bpm : '—',
        energy: percent(draft.features.energy),
        brightness: percent(draft.features.brightness),
      });
      dialog.appendChild(info);
    }

    const body = document.createElement('div');
    body.className = 'theme-editor-body';
    body.appendChild(textSection());
    for (const group of ORDER) body.appendChild(sectionFor(group));
    body.appendChild(colorSection());
    body.appendChild(paletteSection());
    dialog.appendChild(body);

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'btn btn-primary';
    apply.textContent = t('studio.themes.apply');
    apply.addEventListener('click', applyDraft);
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn';
    save.textContent = t('studio.themeEditor.save');
    save.addEventListener('click', saveDraft);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn';
    close.textContent = t('studio.themes.close');
    close.addEventListener('click', () => {
      root.hidden = true;
    });
    actions.appendChild(apply);
    actions.appendChild(save);
    actions.appendChild(close);
    dialog.appendChild(actions);

    root.appendChild(dialog);
    root.hidden = false;
  }

  function open(themeId) {
    root = document.getElementById('dialog-root');
    if (!root) return;
    const existing = themeId ? SA.themes.get(themeId) : null;
    const doc = project();
    const axes = existing && existing.axes ? SA.moods.normalizeAxes(existing.axes) : defaultAxes();
    const seed = existing && existing.seed ? existing.seed : seedNow();
    const style = existing
      ? SA.store.clone(existing.style)
      : SA.moods.generate({ axes, seed, direction: 'horizontal', context: contextFor(doc) }).style;
    if (!style.text && doc && doc.style && doc.style.text) style.text = SA.store.clone(doc.style.text);
    draft = {
      id: existing && !existing.builtin ? existing.id : null,
      name: existing ? existing.name : t('studio.themes.untitled'),
      axes,
      seed,
      direction: (existing && existing.direction) || 'horizontal',
      genre: (existing && existing.genre) || null,
      style,
    };
    render();
  }

  return { open, getDraft: () => draft };
})();
