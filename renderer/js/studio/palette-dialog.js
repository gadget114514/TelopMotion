window.SA = window.SA || {};

// The palette editing dialog: edit the roles of one scope's palette live
// (one undo for the whole session), draw candidates from the project's axes,
// and re-roll the literal colours of the style / the managed clips.
(function () {
  if (typeof SA === 'undefined' || !SA.i18n || typeof SA.i18n.registerStrings !== 'function') return;
  SA.i18n.registerStrings({
    en: {
      palette: {
        title: 'Palette',
        target: 'Palette of {scope}',
        scopeProject: 'the whole project',
        scopeCue: 'this cue',
        scopeBeat: 'this beat',
        roleBackground: 'Background',
        roleBackground2: 'Background 2',
        roleText: 'Text',
        roleAccent: 'Accent',
        roleEdge: 'Edge',
        roleExtra: 'Extra {n}',
        name: 'Name',
        addColor: 'Add colour',
        rerollColor: 'Re-roll this colour',
        rerollColorWide: 'Re-roll this colour in any hue',
        removeColor: 'Remove colour',
        contrast: 'Text vs background: {ratio}:1',
        contrastWarn: 'text may be hard to read',
        candidates: 'Candidates',
        rerollCandidates: 'Reroll candidates',
        fromLibrary: 'From a palette…',
        targets: 'Apply to',
        targetStyle: 'Text & style',
        targetBackground: 'Background',
        targetBackdrop: 'Backdrop',
        targetFigure: 'Figures',
        targetFiller: 'Fillers',
        clipsCount: '{n} clips',
        perClip: 'Different colours per clip',
        selectedOnly: 'Selected clip only',
        noSelection: 'Select a clip first',
        rerollColors: 'Reroll colours only',
        applyTargets: 'Apply to targets',
        save: 'Save to library',
        import: 'Import',
        export: 'Export',
        cancel: 'Cancel',
        close: 'Close',
        saved: 'Palette saved: {name}',
        none: 'This scope has no palette yet.',
      },
      studio: { generate: { palette: 'Palette…' } },
    },
    ja: {
      palette: {
        title: 'パレット',
        target: '{scope}のパレット',
        scopeProject: 'プロジェクト全体',
        scopeCue: 'このキュー',
        scopeBeat: 'このビート',
        roleBackground: '背景',
        roleBackground2: '背景2',
        roleText: '文字',
        roleAccent: 'アクセント',
        roleEdge: '縁',
        roleExtra: '追加 {n}',
        name: '名前',
        addColor: '色を追加',
        rerollColor: 'この色を引き直す',
        rerollColorWide: 'この色を別の色相に引き直す',
        removeColor: 'この色を削除',
        contrast: '文字と背景のコントラスト: {ratio}:1',
        contrastWarn: '文字が読みにくい可能性があります',
        candidates: '候補',
        rerollCandidates: '候補を引き直す',
        fromLibrary: '既存のパレットから…',
        targets: '適用先',
        targetStyle: '文字とスタイル',
        targetBackground: '背景',
        targetBackdrop: '中景',
        targetFigure: '図形',
        targetFiller: 'フィラー',
        clipsCount: '{n}クリップ',
        perClip: 'クリップごとに別の色',
        selectedOnly: '選択中のクリップのみ',
        noSelection: '先にクリップを選択してください',
        rerollColors: '色だけ引き直す',
        applyTargets: '適用先に適用',
        save: 'ライブラリに保存',
        import: '読み込み',
        export: '書き出し',
        cancel: 'キャンセル',
        close: '閉じる',
        saved: 'パレットを保存しました: {name}',
        none: 'この範囲にはまだパレットがありません。',
      },
      studio: { generate: { palette: 'パレット…' } },
    },
    es: {
      palette: {
        title: 'Paleta',
        target: 'Paleta de {scope}',
        scopeProject: 'todo el proyecto',
        scopeCue: 'este cue',
        scopeBeat: 'este beat',
        roleBackground: 'Fondo',
        roleBackground2: 'Fondo 2',
        roleText: 'Texto',
        roleAccent: 'Acento',
        roleEdge: 'Borde',
        roleExtra: 'Extra {n}',
        name: 'Nombre',
        addColor: 'Añadir color',
        rerollColor: 'Volver a sortear este color',
        rerollColorWide: 'Volver a sortear este color en otro tono',
        removeColor: 'Quitar color',
        contrast: 'Texto sobre fondo: {ratio}:1',
        contrastWarn: 'el texto puede costar de leer',
        candidates: 'Candidatas',
        rerollCandidates: 'Sortear candidatas',
        fromLibrary: 'Desde una paleta…',
        targets: 'Aplicar a',
        targetStyle: 'Texto y estilo',
        targetBackground: 'Fondo',
        targetBackdrop: 'Fondo medio',
        targetFigure: 'Figuras',
        targetFiller: 'Rellenos',
        clipsCount: '{n} clips',
        perClip: 'Colores distintos por clip',
        selectedOnly: 'Solo el clip seleccionado',
        noSelection: 'Selecciona un clip primero',
        rerollColors: 'Sortear solo los colores',
        applyTargets: 'Aplicar a los destinos',
        save: 'Guardar en la biblioteca',
        import: 'Importar',
        export: 'Exportar',
        cancel: 'Cancelar',
        close: 'Cerrar',
        saved: 'Paleta guardada: {name}',
        none: 'Este ámbito aún no tiene paleta.',
      },
      studio: { generate: { palette: 'Paleta…' } },
    },
    fr: {
      palette: {
        title: 'Palette',
        target: 'Palette de {scope}',
        scopeProject: 'tout le projet',
        scopeCue: 'ce cue',
        scopeBeat: 'ce beat',
        roleBackground: 'Fond',
        roleBackground2: 'Fond 2',
        roleText: 'Texte',
        roleAccent: 'Accent',
        roleEdge: 'Bord',
        roleExtra: 'Supplément {n}',
        name: 'Nom',
        addColor: 'Ajouter une couleur',
        rerollColor: 'Retirer cette couleur au sort',
        rerollColorWide: 'Retirer cette couleur au sort sur une autre teinte',
        removeColor: 'Supprimer cette couleur',
        contrast: 'Texte sur fond : {ratio}:1',
        contrastWarn: 'le texte peut être difficile à lire',
        candidates: 'Candidates',
        rerollCandidates: 'Retirer les candidates au sort',
        fromLibrary: 'À partir d’une palette…',
        targets: 'Appliquer à',
        targetStyle: 'Texte et style',
        targetBackground: 'Fond',
        targetBackdrop: 'Arrière-plan moyen',
        targetFigure: 'Figures',
        targetFiller: 'Remplissages',
        clipsCount: '{n} clips',
        perClip: 'Couleurs différentes par clip',
        selectedOnly: 'Clip sélectionné uniquement',
        noSelection: 'Sélectionnez d’abord un clip',
        rerollColors: 'Relancer les couleurs seulement',
        applyTargets: 'Appliquer aux cibles',
        save: 'Enregistrer dans la bibliothèque',
        import: 'Importer',
        export: 'Exporter',
        cancel: 'Annuler',
        close: 'Fermer',
        saved: 'Palette enregistrée : {name}',
        none: 'Cette portée n’a pas encore de palette.',
      },
      studio: { generate: { palette: 'Palette…' } },
    },
    ru: {
      palette: {
        title: 'Палитра',
        target: 'Палитра: {scope}',
        scopeProject: 'весь проект',
        scopeCue: 'этот cue',
        scopeBeat: 'этот beat',
        roleBackground: 'Фон',
        roleBackground2: 'Фон 2',
        roleText: 'Текст',
        roleAccent: 'Акцент',
        roleEdge: 'Обводка',
        roleExtra: 'Дополнительный {n}',
        name: 'Название',
        addColor: 'Добавить цвет',
        rerollColor: 'Пересобрать этот цвет',
        rerollColorWide: 'Пересобрать этот цвет в другом оттенке',
        removeColor: 'Удалить цвет',
        contrast: 'Текст на фоне: {ratio}:1',
        contrastWarn: 'текст может плохо читаться',
        candidates: 'Варианты',
        rerollCandidates: 'Пересобрать варианты',
        fromLibrary: 'Из палитры…',
        targets: 'Применить к',
        targetStyle: 'Текст и стиль',
        targetBackground: 'Фон',
        targetBackdrop: 'Средний план',
        targetFigure: 'Фигуры',
        targetFiller: 'Заполнители',
        clipsCount: '{n} клипов',
        perClip: 'Свои цвета у каждого клипа',
        selectedOnly: 'Только выбранный клип',
        noSelection: 'Сначала выберите клип',
        rerollColors: 'Пересобрать только цвета',
        applyTargets: 'Применить к выбранным',
        save: 'Сохранить в библиотеку',
        import: 'Импорт',
        export: 'Экспорт',
        cancel: 'Отмена',
        close: 'Закрыть',
        saved: 'Палитра сохранена: {name}',
        none: 'У этой области пока нет палитры.',
      },
      studio: { generate: { palette: 'Палитра…' } },
    },
  });
})();

SA.paletteDialog = (() => {
  'use strict';

  const HEX = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;
  const KINDS = ['background', 'backdrop', 'figure', 'filler'];
  const KIND_LABEL = { background: 'palette.targetBackground', backdrop: 'palette.targetBackdrop', figure: 'palette.targetFigure', filler: 'palette.targetFiller' };
  const MAX_COLORS = 12;

  let active = null;

  function t(key, vars) {
    return SA.i18n.t(key, vars);
  }

  function toast(key, vars) {
    if (SA.studio && typeof SA.studio.toast === 'function') SA.studio.toast(key, vars);
  }

  function scopeTarget(scope) {
    if (!scope || scope === 'project') return { kind: 'project', path: '', label: t('palette.scopeProject') };
    if (scope.beatId) {
      return { kind: 'beat', cueId: scope.cueId, beatId: scope.beatId, path: `cue:${scope.cueId}/beat:${scope.beatId}`, label: t('palette.scopeBeat') };
    }
    if (scope.cueId) return { kind: 'cue', cueId: scope.cueId, path: `cue:${scope.cueId}`, label: t('palette.scopeCue') };
    return null;
  }

  function currentPalette(doc, target) {
    const style = SA.project.resolveStyle(doc, target.path);
    if (style && style.palette && Array.isArray(style.palette.colors) && style.palette.colors.length) return SA.store.clone(style.palette);
    return null;
  }

  function clipCounts(doc) {
    const counts = Object.fromEntries(KINDS.map((kind) => [kind, 0]));
    for (const clip of doc.clips || []) {
      const kind = SA.project.trackKindOf(doc, clip.trackId);
      if (counts[kind] != null) counts[kind] += 1;
    }
    return counts;
  }

  function selectedClipId() {
    const selection = SA.store.state.selection || {};
    if (selection.kind !== 'clip') return null;
    const path = (selection.paths || [])[0] || '';
    return path.startsWith('clip:') ? path.slice('clip:'.length) : null;
  }

  function roleLabel(index) {
    if (index === 0) return t('palette.roleBackground');
    if (index === 1) return t('palette.roleBackground2');
    if (index === 2) return t('palette.roleText');
    if (index === 3) return t('palette.roleAccent');
    if (index === 4) return t('palette.roleEdge');
    return t('palette.roleExtra', { n: index });
  }

  // The edge role of the palette being edited: its re-rolls sweep the light
  // level (the other colours keep their own).
  function isEdgeIndex(index, colors) {
    return typeof SA !== 'undefined' && SA.moods && typeof SA.moods.edgeIndexOf === 'function' && SA.moods.edgeIndexOf(colors) === index;
  }

  function jitterOne(hex, index, colors) {
    if (typeof SA === 'undefined' || !SA.moods || !SA.rng) return hex;
    const mode = (SA.store.state.project && SA.store.state.project.styleMode) || {};
    const random = SA.rng.rngFor(Math.floor(Math.random() * 900000) + 1000, 'palette-dialog', index);
    const options = isEdgeIndex(index, colors) ? { edgeIndex: 0 } : null;
    const jittered = SA.moods.jitterPalette(random, { colors: [hex] }, mode.axes, 2.5, null, options);
    return (jittered && jittered.colors && jittered.colors[0]) || hex;
  }

  // The big-jump sibling of jitterOne: a plain random RGB, no axes or role.
  function rerollOne() {
    const channel = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
    return `#${channel()}${channel()}${channel()}`;
  }

  function preview() {
    if (!active) return;
    const colors = active.draft.colors.filter((hex) => typeof hex === 'string' && HEX.test(hex));
    if (!colors.length) return;
    SA.store.commands.setPalette(
      active.scope,
      { id: active.draft.id, name: active.draft.name, colors },
      { label: 'edit palette', coalesceKey: `palette-dialog:${active.openId}` }
    );
  }

  function setColor(index, value) {
    if (!active || typeof value !== 'string' || !HEX.test(value)) return;
    active.draft.colors[index] = value;
    preview();
    render();
  }

  function enabledKinds() {
    return KINDS.filter((kind) => active.targets[kind]);
  }

  function targetClipIds() {
    if (!active.selectedOnly) return null;
    const id = selectedClipId();
    return id ? [id] : null;
  }

  // --- rendering ---------------------------------------------------------------

  function render() {
    if (!active || !active.root) return;
    const doc = SA.store.state.project;
    if (!doc) return;
    const root = active.root;
    root.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog dialog-wide';
    const title = document.createElement('h3');
    title.textContent = `${t('palette.title')} — ${t('palette.target', { scope: active.target.label })}`;
    dialog.appendChild(title);

    const body = document.createElement('div');
    body.className = 'palette-body';
    body.appendChild(buildEditor());
    body.appendChild(buildSide(doc));
    dialog.appendChild(body);

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    actions.appendChild(button(t('palette.rerollColors'), () => rerollOnly(), 'btn btn-mini'));
    actions.appendChild(button(t('palette.applyTargets'), () => applyTargets(), 'btn btn-mini btn-primary'));
    actions.appendChild(button(t('palette.save'), () => saveToLibrary(), 'btn btn-mini'));
    actions.appendChild(button(t('palette.import'), () => importPalettes(), 'btn btn-mini'));
    actions.appendChild(button(t('palette.export'), () => exportPalettes(), 'btn btn-mini'));
    actions.appendChild(button(t('palette.cancel'), () => close(false), 'btn btn-mini'));
    actions.appendChild(button(t('palette.close'), () => close(true), 'btn btn-mini'));
    dialog.appendChild(actions);

    root.appendChild(dialog);
    root.hidden = false;
  }

  function button(label, onClick, className) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = className || 'btn btn-mini';
    node.textContent = label;
    node.addEventListener('click', onClick);
    return node;
  }

  // A reusable palette editor for a plain `{ colors }` draft: role rows with
  // swatches, hex inputs, re-roll, add / remove and the contrast readout. Every
  // mutation calls `onChange(palette)` and the component rebuilds itself, so
  // the palette dialog and the theme editor can both host it.
  function editorNode(palette, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'palette-editor';
    const notify = () => {
      if (typeof onChange === 'function') onChange(palette);
    };
    const setColor = (index, value) => {
      if (typeof value !== 'string' || !HEX.test(value)) return;
      palette.colors[index] = value;
      notify();
      rebuild();
    };
    const rebuild = () => {
      wrap.innerHTML = '';
      palette.colors.forEach((hex, index) => {
        const row = document.createElement('div');
        row.className = 'palette-edit-row';
        const label = document.createElement('span');
        label.className = 'palette-role';
        label.textContent = roleLabel(index);
        row.appendChild(label);
        const swatch = button('', () => {
          SA.colors.openPicker({
            value: hex,
            anchor: swatch,
            onChange(value) {
              setColor(index, typeof value === 'string' ? value : value && value.value);
            },
          });
        }, 'color-swatch');
        swatch.style.background = hex;
        swatch.title = hex;
        row.appendChild(swatch);
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'ctrl-hex';
        input.value = hex;
        input.addEventListener('change', () => {
          if (!HEX.test(input.value)) {
            input.value = palette.colors[index];
            return;
          }
          setColor(index, input.value);
        });
        row.appendChild(input);
        const reroll = button('↻', () => setColor(index, jitterOne(hex, index, palette.colors)));
        reroll.classList.add('btn', 'btn-mini');
        reroll.title = t('palette.rerollColor');
        row.appendChild(reroll);
        const jump = button('🎲', () => setColor(index, rerollOne()));
        jump.classList.add('btn', 'btn-mini');
        jump.title = t('palette.rerollColorWide');
        row.appendChild(jump);
        if (index >= 5) {
          const remove = button('✕', () => {
            palette.colors.splice(index, 1);
            notify();
            rebuild();
          });
          remove.classList.add('btn', 'btn-mini');
          remove.title = t('palette.removeColor');
          row.appendChild(remove);
        }
        wrap.appendChild(row);
      });
      const addRow = document.createElement('div');
      addRow.className = 'palette-edit-row palette-edit-add';
      addRow.appendChild(
        button(t('palette.addColor'), () => {
          if (palette.colors.length >= MAX_COLORS) return;
          const last = palette.colors[palette.colors.length - 1] || '#ffffff';
          palette.colors.push(jitterOne(last, palette.colors.length, palette.colors));
          notify();
          rebuild();
        })
      );
      wrap.appendChild(addRow);
      const nameRow = document.createElement('div');
      nameRow.className = 'field';
      const nameLabel = document.createElement('span');
      nameLabel.textContent = t('palette.name');
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = palette.name || '';
      nameInput.addEventListener('change', () => {
        palette.name = nameInput.value;
        notify();
      });
      nameRow.appendChild(nameLabel);
      nameRow.appendChild(nameInput);
      wrap.appendChild(nameRow);
      // text against background readability, the same 4.5 floor as the generator
      const colors = palette.colors;
      let ratio = null;
      if (colors[0] && colors[2] && HEX.test(colors[0]) && HEX.test(colors[2])) {
        ratio = SA.color.contrastRatio(SA.color.parse(colors[2]), SA.color.parse(colors[0]));
      }
      const contrast = document.createElement('div');
      contrast.className = 'palette-contrast';
      if (ratio == null) contrast.textContent = t('palette.none');
      else {
        contrast.textContent = `${t('palette.contrast', { ratio: ratio.toFixed(2) })}${ratio < 4.5 ? ` ⚠ ${t('palette.contrastWarn')}` : ''}`;
        contrast.classList.toggle('warn', ratio < 4.5);
      }
      wrap.appendChild(contrast);
    };
    rebuild();
    return wrap;
  }

  function buildEditor() {
    return editorNode(active.draft, () => preview());
  }

  function buildSide(doc) {
    const wrap = document.createElement('div');
    wrap.className = 'palette-side';
    const heading = document.createElement('div');
    heading.className = 'insp-inherit';
    heading.textContent = t('palette.candidates');
    wrap.appendChild(heading);
    const candidates = document.createElement('div');
    candidates.className = 'palette-cands';
    for (const candidate of active.candidates) {
      const card = button('', () => {
        active.draft = { ...candidate, colors: candidate.colors.slice() };
        preview();
        render();
      }, 'palette-card');
      if (candidate.id === active.draft.id) card.classList.add('is-selected');
      const strip = document.createElement('span');
      strip.className = 'palette-card-strip';
      for (const color of candidate.colors.slice(0, 6)) {
        const dot = document.createElement('i');
        dot.style.background = color;
        strip.appendChild(dot);
      }
      const name = document.createElement('span');
      name.className = 'palette-card-name';
      name.textContent = candidate.name || candidate.id;
      card.appendChild(strip);
      card.appendChild(name);
      candidates.appendChild(card);
    }
    wrap.appendChild(candidates);
    const candidateActions = document.createElement('div');
    candidateActions.className = 'insp-actions';
    candidateActions.appendChild(
      button(t('palette.rerollCandidates'), () => {
        active.candidates = SA.store.commands.paletteCandidates(8);
        render();
      })
    );
    candidateActions.appendChild(
      SA.controls.selectControl({}, '', (value) => {
        if (!value) return;
        const entry = SA.colors.allPalettes().find((item) => item.id === value);
        if (!entry) return;
        active.draft = { id: entry.id, name: entry.name, colors: entry.colors.slice() };
        preview();
        render();
      }, [{ value: '', label: t('palette.fromLibrary') }, ...SA.colors.allPalettes().map((entry) => ({ value: entry.id, label: entry.name }))])
    );
    wrap.appendChild(candidateActions);

    const targetsHead = document.createElement('div');
    targetsHead.className = 'insp-inherit';
    targetsHead.textContent = t('palette.targets');
    wrap.appendChild(targetsHead);
    const counts = clipCounts(doc);
    wrap.appendChild(checkbox(t('palette.targetStyle'), active.targets.style, (checked) => {
      active.targets.style = checked;
    }));
    for (const kind of KINDS) {
      wrap.appendChild(checkbox(`${t(KIND_LABEL[kind])} · ${t('palette.clipsCount', { n: counts[kind] })}`, active.targets[kind], (checked) => {
        active.targets[kind] = checked;
      }));
    }
    wrap.appendChild(checkbox(t('palette.perClip'), active.perClip, (checked) => {
      active.perClip = checked;
    }));
    const selected = selectedClipId();
    const selectedRow = checkbox(selected ? t('palette.selectedOnly') : t('palette.noSelection'), !!active.selectedOnly && !!selected, (checked) => {
      active.selectedOnly = checked;
    });
    if (!selected) {
      const box = selectedRow.querySelector('input');
      if (box) box.disabled = true;
      selectedRow.classList.add('is-disabled');
    }
    wrap.appendChild(selectedRow);
    return wrap;
  }

  function checkbox(label, checked, onChange) {
    const row = document.createElement('label');
    row.className = 'ctrl-bool-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!checked;
    box.addEventListener('change', () => onChange(box.checked));
    const text = document.createElement('span');
    text.textContent = label;
    row.appendChild(box);
    row.appendChild(text);
    return row;
  }

  // --- actions -----------------------------------------------------------------

  function rerollOnly() {
    const palette = SA.store.commands.rerollColors({
      style: active.targets.style,
      kinds: enabledKinds(),
      clipIds: targetClipIds(),
      perClip: active.perClip,
    });
    if (!palette) return;
    active.draft = { ...active.draft, id: palette.id, name: palette.name || active.draft.name, colors: palette.colors.slice() };
    toast('studio.toast.colorsRerolled', { theme: palette.name || palette.id || '' });
    render();
  }

  function applyTargets() {
    const result = SA.store.commands.rerollColors({
      style: active.targets.style,
      kinds: enabledKinds(),
      clipIds: targetClipIds(),
      palette: { id: active.draft.id, name: active.draft.name, colors: active.draft.colors.slice() },
      perClip: false,
    });
    if (result) toast('studio.toast.colorsRerolled', { theme: active.draft.name || active.draft.id || '' });
  }

  function saveToLibrary() {
    const entry = {
      id: active.draft.id || `p_${Math.random().toString(16).slice(2, 8)}`,
      name: active.draft.name || t('palette.title'),
      builtin: false,
      colors: active.draft.colors.slice(0, MAX_COLORS),
    };
    const custom = SA.colors.customPalettes().filter((item) => item.id !== entry.id);
    custom.push(entry);
    SA.colors.saveCustomPalettes(custom);
    toast('palette.saved', { name: entry.name });
    render();
  }

  async function exportPalettes() {
    const bytes = new TextEncoder().encode(JSON.stringify({ palettes: SA.colors.customPalettes() }, null, 2));
    await SA.platform.saveFile({ bytes, name: 'telopmotion-palettes.json', mime: 'application/json' });
  }

  async function importPalettes() {
    const picked = await SA.platform.readFile('.json,application/json');
    if (!picked) return;
    try {
      const parsed = JSON.parse(new TextDecoder().decode(picked.bytes));
      const incoming = Array.isArray(parsed) ? parsed : parsed.palettes;
      if (!Array.isArray(incoming)) return;
      const custom = SA.colors.customPalettes();
      for (const entry of incoming) {
        if (!entry || !entry.name || !Array.isArray(entry.colors)) continue;
        const id = entry.id || `p_${Math.random().toString(16).slice(2, 8)}`;
        const next = { id, name: entry.name, builtin: false, colors: entry.colors.slice(0, MAX_COLORS) };
        const index = custom.findIndex((item) => item.id === id);
        if (index >= 0) custom[index] = next;
        else custom.push(next);
      }
      SA.colors.saveCustomPalettes(custom);
      render();
    } catch {
      /* ignore invalid files */
    }
  }

  // --- lifecycle ---------------------------------------------------------------

  function refresh() {
    if (!active) return;
    const doc = SA.store.state.project;
    if (!doc) return;
    const palette = currentPalette(doc, active.target);
    if (!palette) return;
    if (JSON.stringify(palette.colors) !== JSON.stringify(active.draft.colors)) {
      active.draft = { ...palette };
      render();
    }
  }

  function close(commit) {
    if (!active) return;
    const current = active;
    active = null;
    if (current.unsubscribe) current.unsubscribe();
    if (SA.store) {
      if (commit) SA.store.endTransaction();
      else SA.store.cancelTransaction();
    }
    if (current.root) current.root.hidden = true;
  }

  function open(scope) {
    const root = document.getElementById('dialog-root');
    const doc = SA.store.state.project;
    const target = scopeTarget(scope);
    if (!root || !doc || !target || !SA.store.commands.paletteCandidates) return;
    close(true);
    const original = currentPalette(doc, target);
    const draft = original || { id: `theme_${Date.now().toString(16)}`, name: 'palette', colors: ['#101018', '#1b2130', '#f5f7ff', '#6d8cff', '#2a3348', '#9db2ff'] };
    active = {
      root,
      scope: scope || 'project',
      target,
      original,
      draft: { ...draft, colors: draft.colors.slice() },
      candidates: SA.store.commands.paletteCandidates(8),
      targets: { style: true, background: false, backdrop: true, figure: true, filler: true },
      perClip: true,
      selectedOnly: false,
      openId: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      unsubscribe: null,
    };
    SA.store.beginTransaction('edit palette');
    render();
    active.unsubscribe = SA.store.subscribe(null, () => refresh());
  }

  return { open, close, editorNode };
})();
