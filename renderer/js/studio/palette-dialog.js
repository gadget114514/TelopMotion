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
        roleMid: 'Mid',
        roleMid2: 'Mid 2',
        roleText: 'Text',
        roleAccent: 'Accent',
        roleEdge: 'Edge',
        roleTextBg: 'Text background',
        roleFig: 'Figure',
        roleFig2: 'Figure 2',
        roleHint0: 'P1 main background (MID_A)',
        roleHint1: 'P2 second background (MID_B)',
        roleHint2: 'P3 backdrop plane C (MID_C)',
        roleHint3: 'P4 backdrop plane D (MID_D)',
        roleHint4: 'P5 main text (TEXT_FILL)',
        roleHint5: 'P6 accent / hero text (TEXT_FILL2)',
        roleHint6: 'P7 edge / outline (TEXT_EDGE)',
        roleHint7: 'P8 text background (TEXT_BG)',
        roleHint8: 'P9 figure 1 (FIG_A)',
        roleHint9: 'P10 figure 2 (FIG_B)',
        name: 'Name',
        addColor: 'Add colour',
        rerollColor: 'Re-roll this colour',
        rerollColorWide: 'Re-roll this colour in any hue',
        contrastFix: 'Fix contrast against the background',
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
        rerollColors: 'Recolor only',
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
        roleMid: '中景',
        roleMid2: '中景2',
        roleText: '文字',
        roleAccent: 'アクセント',
        roleEdge: '縁',
        roleTextBg: '文字背景',
        roleFig: '図形',
        roleFig2: '図形2',
        roleHint0: 'P1 メイン背景（MID_A）',
        roleHint1: 'P2 サブ背景（MID_B）',
        roleHint2: 'P3 中景プレーンC（MID_C）',
        roleHint3: 'P4 中景プレーンD（MID_D）',
        roleHint4: 'P5 メイン文字（TEXT_FILL）',
        roleHint5: 'P6 アクセント・主役文字（TEXT_FILL2）',
        roleHint6: 'P7 縁・輪郭（TEXT_EDGE）',
        roleHint7: 'P8 文字背景（TEXT_BG）',
        roleHint8: 'P9 図形1（FIG_A）',
        roleHint9: 'P10 図形2（FIG_B）',
        name: '名前',
        addColor: '色を追加',
        rerollColor: 'この色を引き直す',
        rerollColorWide: 'この色を別の色相に引き直す',
        contrastFix: '背景とのコントラストを補正',
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
        rerollColors: '色だけ変更',
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
        roleMid: 'Medio',
        roleMid2: 'Medio 2',
        roleText: 'Texto',
        roleAccent: 'Acento',
        roleEdge: 'Borde',
        roleTextBg: 'Fondo de texto',
        roleFig: 'Figura',
        roleFig2: 'Figura 2',
        roleHint0: 'P1 fondo principal (MID_A)',
        roleHint1: 'P2 fondo secundario (MID_B)',
        roleHint2: 'P3 plano medio C (MID_C)',
        roleHint3: 'P4 plano medio D (MID_D)',
        roleHint4: 'P5 texto principal (TEXT_FILL)',
        roleHint5: 'P6 texto acento/héroe (TEXT_FILL2)',
        roleHint6: 'P7 borde/contorno (TEXT_EDGE)',
        roleHint7: 'P8 fondo de texto (TEXT_BG)',
        roleHint8: 'P9 figura 1 (FIG_A)',
        roleHint9: 'P10 figura 2 (FIG_B)',
        name: 'Nombre',
        addColor: 'Añadir color',
        rerollColor: 'Volver a sortear este color',
        rerollColorWide: 'Volver a sortear este color en otro tono',
        contrastFix: 'Corregir el contraste con el fondo',
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
        rerollColors: 'Recolorear',
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
        roleMid: 'Moyen',
        roleMid2: 'Moyen 2',
        roleText: 'Texte',
        roleAccent: 'Accent',
        roleEdge: 'Bord',
        roleTextBg: 'Fond de texte',
        roleFig: 'Figure',
        roleFig2: 'Figure 2',
        roleHint0: 'P1 fond principal (MID_A)',
        roleHint1: 'P2 fond secondaire (MID_B)',
        roleHint2: 'P3 plan moyen C (MID_C)',
        roleHint3: 'P4 plan moyen D (MID_D)',
        roleHint4: 'P5 texte principal (TEXT_FILL)',
        roleHint5: 'P6 texte accent/héros (TEXT_FILL2)',
        roleHint6: 'P7 bord/contour (TEXT_EDGE)',
        roleHint7: 'P8 fond de texte (TEXT_BG)',
        roleHint8: 'P9 figure 1 (FIG_A)',
        roleHint9: 'P10 figure 2 (FIG_B)',
        name: 'Nom',
        addColor: 'Ajouter une couleur',
        rerollColor: 'Retirer cette couleur au sort',
        rerollColorWide: 'Retirer cette couleur au sort sur une autre teinte',
        contrastFix: 'Corriger le contraste avec le fond',
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
        rerollColors: 'Recolorer',
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
        roleMid: 'Средний',
        roleMid2: 'Средний 2',
        roleText: 'Текст',
        roleAccent: 'Акцент',
        roleEdge: 'Обводка',
        roleTextBg: 'Фон текста',
        roleFig: 'Фигура',
        roleFig2: 'Фигура 2',
        roleHint0: 'P1 главный фон (MID_A)',
        roleHint1: 'P2 второй фон (MID_B)',
        roleHint2: 'P3 средняя плоскость C (MID_C)',
        roleHint3: 'P4 средняя плоскость D (MID_D)',
        roleHint4: 'P5 главный текст (TEXT_FILL)',
        roleHint5: 'P6 акцент/герой-текст (TEXT_FILL2)',
        roleHint6: 'P7 обводка/контур (TEXT_EDGE)',
        roleHint7: 'P8 фон текста (TEXT_BG)',
        roleHint8: 'P9 фигура 1 (FIG_A)',
        roleHint9: 'P10 фигура 2 (FIG_B)',
        name: 'Название',
        addColor: 'Добавить цвет',
        rerollColor: 'Пересобрать этот цвет',
        rerollColorWide: 'Пересобрать этот цвет в другом оттенке',
        contrastFix: 'Исправить контраст с фоном',
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
        rerollColors: 'Перекрасить',
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
  const SLOT_COUNT = 10;

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
    return path.startsWith('clip:') ? path.slice('clip:'.length).split('/')[0] : null;
  }

  function roleLabel(index) {
    if (index === 0) return t('palette.roleBackground');
    if (index === 1) return t('palette.roleBackground2');
    if (index === 2) return t('palette.roleMid');
    if (index === 3) return t('palette.roleMid2');
    if (index === 4) return t('palette.roleText');
    if (index === 5) return t('palette.roleAccent');
    if (index === 6) return t('palette.roleEdge');
    if (index === 7) return t('palette.roleTextBg');
    if (index === 8) return t('palette.roleFig');
    if (index === 9) return t('palette.roleFig2');
    return `P${index + 1}`;
  }

  function alphaOf(hex) {
    try {
      const parsed = SA.color.parse(hex);
      return parsed.a == null ? 1 : parsed.a;
    } catch {
      return 1;
    }
  }

  function withAlpha(hex, alpha) {
    if (alpha == null || !(alpha < 1)) return hex;
    try {
      return SA.color.toHex({ ...SA.color.parse(hex), a: alpha });
    } catch {
      return hex;
    }
  }

  // The shared picker returns `{ kind:'solid', value, alpha }` (or a plain
  // string for gradient stops); palette slots are plain strings, so the alpha
  // is folded into `#RRGGBBAA`.
  function pickerHex(value) {
    if (typeof SA !== 'undefined' && SA.colors && typeof SA.colors.pickerValueToHex === 'function') {
      return SA.colors.pickerValueToHex(value);
    }
    if (typeof value === 'string') return value;
    if (value && typeof value.value === 'string') {
      const alpha = value.alpha == null ? alphaOf(value.value) : Number(value.alpha);
      return withAlpha(value.value, alpha);
    }
    return null;
  }

  function paintSwatch(el, hex) {
    if (typeof SA !== 'undefined' && SA.colors && typeof SA.colors.paintSwatch === 'function') SA.colors.paintSwatch(el, hex);
    else el.style.background = hex;
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
    const out = (jittered && jittered.colors && jittered.colors[0]) || hex;
    return withAlpha(out, alphaOf(hex));
  }

  // The big-jump sibling of jitterOne: a plain random RGB, no axes or role.
  // The previous alpha rides along so a translucent slot stays translucent.
  function rerollOne(hex) {
    const channel = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
    return withAlpha(`#${channel()}${channel()}${channel()}`, alphaOf(hex));
  }

  // The nearest value of `hex` (lighter or darker, whichever moves less) that
  // clears `target` against `bg`; hue and saturation stay, alpha is kept.
  // No computed colours when a palette pool is given: the ideal is snapped to
  // the closest draft entry that clears the target.
  function fixContrastOne(hex, bg, target, pool) {
    const alpha = alphaOf(hex);
    const front = SA.color.parse(hex);
    const back = SA.color.parse(bg);
    if (SA.color.contrastRatio(front, back) >= target) return hex;
    const ideal = (() => {
      const hsv = SA.color.rgbToHsv(front);
      let best = hex;
      let bestRatio = SA.color.contrastRatio(front, back);
      for (let step = 1; step <= 20; step += 1) {
        for (const direction of [-1, 1]) {
          const v = Math.min(1, Math.max(0, hsv.v + direction * step * 0.05));
          const candidate = SA.color.hsvToRgb({ h: hsv.h, s: hsv.s, v, a: 1 });
          const ratio = SA.color.contrastRatio(candidate, back);
          if (ratio >= target) return withAlpha(SA.color.toHex(candidate), alpha);
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = withAlpha(SA.color.toHex(candidate), alpha);
          }
        }
      }
      return best;
    })();
    if (Array.isArray(pool) && pool.length && SA.paletteRoles) {
      try {
        if (typeof SA.paletteRoles.nearestMeeting === 'function') {
          const snapped = SA.paletteRoles.nearestMeeting(ideal, pool, bg, target);
          if (snapped) return snapped;
        }
        if (typeof SA.paletteRoles.snapToPalette === 'function') {
          const snapped = SA.paletteRoles.snapToPalette(ideal, pool);
          if (snapped) return snapped;
        }
      } catch { /* fall through to the computed ideal */ }
    }
    return ideal;
  }

  // Contrast correction of one palette entry: the background (index 0) moves
  // the whole palette through repairContrast, any other colour moves against
  // the background. The target is the theme's pinned contrast floor when the
  // project sets one, else the 4.5 WCAG floor.
  function contrastTarget() {
    try {
      const doc = SA.store && SA.store.state ? SA.store.state.project : null;
      const raw = doc && doc.styleMode && doc.styleMode.params ? doc.styleMode.params.contrast : null;
      if (raw == null || raw === '') return 4.5;
      const value = Number(raw);
      if (Number.isFinite(value)) return Math.max(1, Math.min(7, value));
    } catch { /* fall through */ }
    return 4.5;
  }

  function fixContrast(colors, index) {
    if (!Array.isArray(colors) || !colors.length) return colors;
    if (index === 0) {
      if (SA.moods && typeof SA.moods.repairContrast === 'function') SA.moods.repairContrast(colors, contrastTarget());
    } else {
      colors[index] = fixContrastOne(colors[index], colors[0], contrastTarget(), colors);
    }
    return colors;
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

  // manual library/candidate pick: at the project level every cue unifies onto
  // the palette, at the cue level its beats show through
  function applyLibraryPalette(entry) {
    if (!active || !entry || !Array.isArray(entry.colors)) return;
    active.draft = { id: entry.id, name: entry.name, colors: entry.colors.slice() };
    const colors = active.draft.colors.filter((hex) => typeof hex === 'string' && HEX.test(hex));
    if (!colors.length) return;
    const extra = active.target.kind === 'project' ? { propagate: true } : active.target.kind === 'cue' ? { force: true } : {};
    SA.store.commands.setPalette(
      active.scope,
      { id: active.draft.id, name: active.draft.name, colors },
      { label: 'apply palette', coalesceKey: `palette-dialog:${active.openId}`, ...extra }
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

  // A reusable palette editor for a plain `{ colors }` draft: exactly the 10
  // fixed slots with swatches, hex inputs, re-roll and the contrast readout.
  // Every mutation calls `onChange(palette)` and the component rebuilds
  // itself, so the palette dialog and the theme editor can both host it.
  function editorNode(palette, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'palette-editor';
    if (!Array.isArray(palette.colors)) palette.colors = [];
    while (palette.colors.length < SLOT_COUNT) palette.colors.push('#888888');
    palette.colors = palette.colors.slice(0, SLOT_COUNT);
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
      palette.colors.slice(0, SLOT_COUNT).forEach((hex, index) => {
        const row = document.createElement('div');
        row.className = 'palette-edit-row';
        const label = document.createElement('span');
        label.className = 'palette-role';
        label.textContent = `${roleLabel(index)} · P${index + 1}`;
        const slotHint = t(`palette.roleHint${index}`);
        if (slotHint !== `palette.roleHint${index}`) label.title = slotHint;
        row.appendChild(label);
        const swatch = button('', () => {
          SA.colors.openPicker({
            value: hex,
            anchor: swatch,
            onChange(value) {
              const next = pickerHex(value);
              if (next) setColor(index, next);
            },
          });
        }, 'color-swatch');
        paintSwatch(swatch, hex);
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
        const jump = button('🎲', () => setColor(index, rerollOne(hex)));
        jump.classList.add('btn', 'btn-mini');
        jump.title = t('palette.rerollColorWide');
        row.appendChild(jump);
        const fix = button('◐', () => {
          fixContrast(palette.colors, index);
          notify();
          rebuild();
        }, 'btn btn-mini');
        fix.title = t('palette.contrastFix');
        row.appendChild(fix);
        wrap.appendChild(row);
      });
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
      // text against background readability, the same 4.5 floor as the generator:
      // TEXT_FILL (4) vs MID_A (0)
      const colors = palette.colors;
      let ratio = null;
      if (colors[0] && colors[4] && HEX.test(colors[0]) && HEX.test(colors[4])) {
        ratio = SA.color.contrastRatio(SA.color.parse(colors[4]), SA.color.parse(colors[0]));
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
        applyLibraryPalette(candidate);
        render();
      }, 'palette-card');
      if (candidate.id === active.draft.id) card.classList.add('is-selected');
      const strip = document.createElement('span');
      strip.className = 'palette-card-strip';
      for (const color of candidate.colors.slice(0, SLOT_COUNT)) {
        const dot = document.createElement('i');
        paintSwatch(dot, color);
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
        applyLibraryPalette(entry);
        render();
      }, [{ value: '', label: t('palette.fromLibrary') }, ...SA.colors.allPalettes().map((entry) => ({ value: entry.id, label: entry.name }))])
    );
    // the visual preset browser next to the library select: ~40 entries are
    // hard to scan in a dropdown, so this opens the strip + name list
    const presetButton = button(`✦ ${SA.i18n.t('studio.inspector.selectPreset')}`, (event) => {
      if (!SA.colors || typeof SA.colors.openPresetPicker !== 'function') return;
      SA.colors.openPresetPicker({
        anchor: event && event.currentTarget ? event.currentTarget : null,
        selectedId: active && active.draft ? active.draft.id : null,
        onPick(entry) {
          applyLibraryPalette(entry);
          render();
        },
      });
    });
    presetButton.title = t('palette.fromLibrary');
    candidateActions.appendChild(presetButton);
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
      colors: active.draft.colors.slice(0, SLOT_COUNT),
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
        const next = { id, name: entry.name, builtin: false, colors: entry.colors.slice(0, SLOT_COUNT) };
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
    const fallback = SA.moods && typeof SA.moods.generatePalette === 'function'
      ? SA.moods.generatePalette(Math.random, (doc.styleMode && doc.styleMode.axes) || {}, 'palette').colors.slice(0, SLOT_COUNT)
      : ['#101018', '#1b2130', '#2a3348', '#3a4356', '#f5f7ff', '#6d8cff', '#2a3348', '#101018', '#9db2ff', '#ffd7a8'];
    const draft = original && Array.isArray(original.colors) && original.colors.length >= SLOT_COUNT
      ? { ...original, colors: original.colors.slice(0, SLOT_COUNT) }
      : { id: `theme_${Date.now().toString(16)}`, name: 'palette', colors: fallback };
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

  return { open, close, editorNode, fixContrast };
})();
