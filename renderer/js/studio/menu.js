window.SA = window.SA || {};

SA.menu = (() => {
  'use strict';

  let handlers = {};
  let root = null;
  let bar = null;
  let openId = null;
  let dropdown = null;
  let submenuEl = null;
  let submenuFor = null;
  let recent = [];

  function t(key) {
    return SA.i18n.t(key);
  }

  function itemSeparator() {
    return { type: 'separator' };
  }

  function setRecent(list) {
    recent = Array.isArray(list) ? list : [];
    if (openId) refresh();
  }

  function recentItems() {
    if (!recent.length) return [{ key: 'studio.file.noRecent', enabled: () => false }];
    return recent.map((entry) => ({
      key: entry.name || entry.path,
      run: () => handlers.openRecent && handlers.openRecent(entry),
    }));
  }

  function layoutItems() {
    return [
      { key: 'studio.view.layoutStandard', action: 'setLayout', args: ['standard'], checked: () => handlers.getLayout && handlers.getLayout() === 'standard' },
      { key: 'studio.view.layoutWide', action: 'setLayout', args: ['wide'], checked: () => handlers.getLayout && handlers.getLayout() === 'wide' },
      { key: 'studio.view.layoutTimeline', action: 'setLayout', args: ['timeline'], checked: () => handlers.getLayout && handlers.getLayout() === 'timeline' },
      { key: 'studio.view.layoutReset', action: 'setLayout', args: ['reset'] },
    ];
  }

  function languageItems() {
    return SA.i18n.languages.map((language) => ({
      key: `language.${language.code}`,
      raw: language.label,
      action: 'setLanguage',
      args: [language.code],
      checked: () => SA.i18n.lang() === language.code,
    }));
  }

  function imageItems() {
    return [
      { key: 'studio.output.image169Jpg', action: 'saveImage', args: ['16:9', 'image/jpeg'] },
      { key: 'studio.output.image169Png', action: 'saveImage', args: ['16:9', 'image/png'] },
      { key: 'studio.output.image916Jpg', action: 'saveImage', args: ['9:16', 'image/jpeg'] },
      { key: 'studio.output.image916Png', action: 'saveImage', args: ['9:16', 'image/png'] },
    ];
  }

  const MENUS = [
    {
      id: 'file',
      labelKey: 'studio.menu.file',
      items: () => [
        { key: 'studio.file.new', action: 'newProject' },
        { key: 'studio.file.open', action: 'openProject', shortcut: 'Ctrl+O' },
        { key: 'studio.file.save', action: 'saveProject', shortcut: 'Ctrl+S' },
        { key: 'studio.file.saveAs', action: 'saveProjectAs' },
        itemSeparator(),
        { key: 'studio.file.importJson', action: 'importProfile' },
        { key: 'studio.file.importLyrics', action: 'importLyrics' },
        { key: 'studio.file.importAudio', action: 'importAudio' },
        { key: 'studio.file.recent', items: recentItems },
        itemSeparator(),
        { key: 'studio.file.achievement', action: 'openAchievements' },
      ],
    },
    {
      id: 'generate',
      labelKey: 'studio.menu.generate',
      items: () => [
        { key: 'studio.generate.script', action: 'generateScript', enabled: () => !!SA.store.state.project },
        { key: 'studio.generate.distribute', action: 'distributeCues', enabled: () => !!(SA.store.state.project && SA.store.state.project.script.cues.length) },
        { key: 'studio.generate.restructure', action: 'restructureBeats', enabled: () => !!(SA.store.state.project && SA.store.state.project.script.cues.length) },
        { key: 'studio.generate.credits', action: 'credits', enabled: () => !!SA.store.state.project },
        itemSeparator(),
        { key: 'studio.generate.autoDirect', action: 'autoDirect', enabled: () => !!(SA.store.state.project && SA.store.state.project.script.cues.length) },
        { key: 'studio.generate.randomStyle', items: () => [
          { key: 'studio.generate.randomProject', action: 'randomStyle', enabled: () => !!SA.store.state.project },
          { key: 'studio.generate.randomCues', action: 'randomStyleCues', enabled: () => !!(SA.store.state.project && SA.store.state.project.script.cues.length) },
          { key: 'studio.generate.randomElements', action: 'randomStyleElements', enabled: () => !!(SA.store.state.selection && SA.store.state.selection.paths.length) },
        ] },
        { key: 'studio.generate.randomSettings', action: 'randomSettings' },
        { key: 'studio.generate.reroll', action: 'reroll' },
        itemSeparator(),
        { key: 'studio.generate.applyPreset', action: 'applyPreset', enabled: () => !!(SA.store.state.project && SA.store.state.project.script.cues.length) },
        { key: 'studio.generate.fitAudio', action: 'fitAudio', enabled: () => !!(SA.store.state.project && SA.store.state.project.script.cues.length && SA.preview.getAudioDuration()) },
      ],
    },
    {
      id: 'output',
      labelKey: 'studio.menu.output',
      items: () => [
        { key: 'studio.output.saveImage', items: imageItems, enabled: () => !!(SA.store.state.project && SA.store.state.project.dataset) },
        { key: 'studio.output.cardTheme', action: 'cardTheme', enabled: () => !!SA.store.state.project },
        itemSeparator(),
        { key: 'studio.output.exportLyrics', items: () => [
          { key: 'studio.output.exportSrt', action: 'exportSrt' },
          { key: 'studio.output.exportSrtBeats', action: 'exportSrtBeats' },
          { key: 'studio.output.exportLrc', action: 'exportLyrics', args: ['lrc'] },
          { key: 'studio.output.exportJson', action: 'exportLyrics', args: ['json'] },
        ], enabled: () => !!(SA.store.state.project && SA.store.state.project.script.cues.length) },
        { key: 'studio.output.exportVideo', action: 'exportVideo', shortcut: 'Ctrl+E', enabled: () => !!SA.store.state.project },
      ],
    },
    {
      id: 'settings',
      labelKey: 'studio.menu.settings',
      items: () => [
        { key: 'studio.settings.language', items: languageItems },
        { key: 'studio.settings.previewQuality', items: () => [
          { key: 'studio.settings.qualityAuto', action: 'setScale', args: ['auto'], checked: () => handlers.getScaleMode && handlers.getScaleMode() === 'auto' },
          { key: 'studio.settings.qualityFull', action: 'setScale', args: ['full'], checked: () => handlers.getScaleMode && handlers.getScaleMode() === 'full' },
          { key: 'studio.settings.qualityHalf', action: 'setScale', args: ['half'], checked: () => handlers.getScaleMode && handlers.getScaleMode() === 'half' },
          { key: 'studio.settings.qualityQuarter', action: 'setScale', args: ['quarter'], checked: () => handlers.getScaleMode && handlers.getScaleMode() === 'quarter' },
        ] },
        itemSeparator(),
        { key: 'studio.settings.themes', action: 'themes' },
        { key: 'studio.settings.layers', action: 'layers' },
        { key: 'studio.settings.audio', action: 'audio' },
        { key: 'studio.settings.autosave', action: 'toggleAutosave', checked: () => !!(handlers.isAutosaveEnabled && handlers.isAutosaveEnabled()) },
      ],
    },
    {
      id: 'view',
      labelKey: 'studio.menu.view',
      items: () => [
        { key: 'studio.view.aspect169', action: 'setAspect', args: ['16:9'], checked: () => handlers.getAspect && handlers.getAspect() === '16:9' },
        { key: 'studio.view.aspect916', action: 'setAspect', args: ['9:16'], checked: () => handlers.getAspect && handlers.getAspect() === '9:16' },
        itemSeparator(),
        { key: 'studio.view.panels', items: () => [
          { key: 'studio.view.panelMedia', action: 'togglePanel', args: ['media'], checked: () => handlers.isPanelVisible && handlers.isPanelVisible('media') },
          { key: 'studio.view.panelInspector', action: 'togglePanel', args: ['inspector'], checked: () => handlers.isPanelVisible && handlers.isPanelVisible('inspector') },
          { key: 'studio.view.panelTimeline', action: 'togglePanel', args: ['timeline'], checked: () => handlers.isPanelVisible && handlers.isPanelVisible('timeline') },
        ] },
        { key: 'studio.view.layout', items: layoutItems },
        itemSeparator(),
        { key: 'studio.view.guides', action: 'toggleGuides', checked: () => handlers.areGuidesOn && handlers.areGuidesOn() },
        { key: 'studio.view.snapping', action: 'toggleSnapping', checked: () => handlers.isSnappingOn && handlers.isSnappingOn() },
        { key: 'studio.view.autoKey', action: 'toggleAutoKey', checked: () => handlers.isAutoKeyOn && handlers.isAutoKeyOn() },
        itemSeparator(),
        { key: 'studio.view.debugConsole', action: 'toggleConsole', checked: () => handlers.isConsoleOpen && handlers.isConsoleOpen() },
      ],
    },
  ];

  function itemLabel(item) {
    if (item.raw) return item.raw;
    return t(item.key);
  }

  function close() {
    if (dropdown) dropdown.remove();
    dropdown = null;
    closeSubmenu();
    openId = null;
    for (const node of bar.querySelectorAll('.menu-title')) node.classList.remove('is-open');
  }

  function closeSubmenu() {
    if (submenuEl) submenuEl.remove();
    submenuEl = null;
    submenuFor = null;
  }

  function runItem(item) {
    if (item.enabled && !item.enabled()) return;
    close();
    if (item.run) {
      item.run();
      return;
    }
    const handler = handlers[item.action];
    if (handler) handler(...(item.args || []));
  }

  function buildItem(item) {
    if (item.type === 'separator') {
      const node = document.createElement('div');
      node.className = 'menu-separator';
      return node;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-item';
    const check = document.createElement('span');
    check.className = 'menu-check';
    check.textContent = item.checked && item.checked() ? '✓' : '';
    const label = document.createElement('span');
    label.textContent = itemLabel(item);
    button.appendChild(check);
    button.appendChild(label);
    if (item.shortcut) {
      const shortcut = document.createElement('span');
      shortcut.className = 'menu-key';
      shortcut.textContent = item.shortcut;
      button.appendChild(shortcut);
    }
    if (item.items) {
      const arrow = document.createElement('span');
      arrow.className = 'menu-arrow';
      arrow.textContent = '›';
      button.appendChild(arrow);
    } else if (item.action === 'none') {
      button.disabled = true;
    }
    if (item.enabled && !item.enabled()) button.disabled = true;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (item.items) return;
      runItem(item);
    });
    if (item.items) {
      button.addEventListener('mouseenter', () => openSubmenu(button, item.items()));
    } else {
      button.addEventListener('mouseenter', closeSubmenu);
    }
    return button;
  }

  function openSubmenu(anchor, items) {
    if (submenuFor === anchor && submenuEl) return;
    closeSubmenu();
    submenuFor = anchor;
    submenuEl = document.createElement('div');
    submenuEl.className = 'submenu';
    for (const item of items) submenuEl.appendChild(buildItem(item));
    dropdown.appendChild(submenuEl);
    const rect = anchor.getBoundingClientRect();
    const dropRect = dropdown.getBoundingClientRect();
    let left = dropRect.width - 4;
    let top = rect.top - dropRect.top - 5;
    submenuEl.style.left = `${left}px`;
    submenuEl.style.top = `${Math.max(-5, top)}px`;
    const subRect = submenuEl.getBoundingClientRect();
    if (dropRect.left + left + subRect.width > window.innerWidth - 8) {
      submenuEl.style.left = `${-subRect.width + 4}px`;
    }
    if (dropRect.top + top + subRect.height > window.innerHeight - 8) {
      submenuEl.style.top = `${Math.max(-5, window.innerHeight - 8 - dropRect.top - subRect.height)}px`;
    }
  }

  function open(menu) {
    const wasOpen = openId === menu.id;
    close();
    if (wasOpen) return;
    openId = menu.id;
    const title = bar.querySelector(`[data-menu="${menu.id}"]`);
    title.classList.add('is-open');
    dropdown = document.createElement('div');
    dropdown.className = 'dropdown';
    for (const item of menu.items()) dropdown.appendChild(buildItem(item));
    root.appendChild(dropdown);
    const rect = title.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    dropdown.style.left = `${Math.max(4, rect.left - rootRect.left)}px`;
    dropdown.style.top = `${rect.bottom - rootRect.top + 2}px`;
    const dropRect = dropdown.getBoundingClientRect();
    if (rect.left + dropRect.width > window.innerWidth - 8) {
      dropdown.style.left = `${Math.max(4, window.innerWidth - dropRect.width - 8)}px`;
    }
    const first = dropdown.querySelector('.menu-item:not(:disabled)');
    if (first) first.focus();
  }

  function refresh() {
    if (!openId) return;
    const menu = MENUS.find((entry) => entry.id === openId);
    if (menu) {
      closeSubmenu();
      open(menu);
    }
  }

  function moveFocus(step) {
    if (!dropdown || !dropdown.children.length) return;
    const items = [...dropdown.querySelectorAll(':scope > .menu-item:not(:disabled)')];
    if (!items.length) return;
    const current = items.indexOf(document.activeElement);
    const next = (current + step + items.length) % items.length;
    items[next].focus();
  }

  function build() {
    bar = document.getElementById('menubar');
    root = document.getElementById('studio');
    bar.innerHTML = '';
    for (const menu of MENUS) {
      const title = document.createElement('button');
      title.type = 'button';
      title.className = 'menu-title';
      title.dataset.menu = menu.id;
      title.setAttribute('role', 'menuitem');
      title.textContent = t(menu.labelKey);
      title.addEventListener('click', (event) => {
        event.stopPropagation();
        open(menu);
      });
      title.addEventListener('mouseenter', () => {
        if (openId && openId !== menu.id) open(menu);
      });
      title.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open(menu);
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault();
          const index = MENUS.indexOf(menu);
          const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + MENUS.length) % MENUS.length;
          const nextMenu = MENUS[next];
          open(nextMenu);
          bar.querySelector(`[data-menu="${nextMenu.id}"]`).focus();
        } else if (event.key === 'Escape') {
          close();
        }
      });
      bar.appendChild(title);
    }
    const spacer = document.createElement('div');
    spacer.className = 'menu-spacer';
    bar.appendChild(spacer);
    const status = document.createElement('div');
    status.className = 'menu-status';
    status.id = 'menu-status';
    bar.appendChild(status);
  }

  function init(options) {
    handlers = (options && options.handlers) || {};
    build();
    document.addEventListener('click', (event) => {
      if (!dropdown) return;
      if (!bar.contains(event.target) && !dropdown.contains(event.target)) close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && dropdown) {
        const title = bar.querySelector('.menu-title.is-open');
        close();
        if (title) title.focus();
      }
      if (!dropdown) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveFocus(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveFocus(-1);
      } else if (event.key === 'Enter' && document.activeElement && document.activeElement.classList.contains('menu-item')) {
        event.preventDefault();
        document.activeElement.click();
      }
    });
  }

  function setStatus(text) {
    const node = document.getElementById('menu-status');
    if (node) node.textContent = text || '';
  }

  return { init, build, refresh, close, setRecent, setStatus };
})();
