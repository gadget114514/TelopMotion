window.SA = window.SA || {};

SA.motionDialog = (() => {
  'use strict';

  function t(key, vars) {
    return SA.i18n.t(key, vars);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function highlightMatch(text, query) {
    if (!text || !query) return escapeHtml(text || '');
    const escapedText = escapeHtml(text);
    const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return escapedText.replace(regex, '<mark>$1</mark>');
  }

  function open() {
    const root = document.getElementById('dialog-root');
    const doc = SA.store.state.project;
    const selection = SA.store.state.selection || {};
    if (!root || !doc) return;
    if (!selection.cueId && !(selection.paths || []).length) {
      SA.studio.toast('studio.timeline.selectFirst');
      return;
    }

    const lang = (SA.i18n && SA.i18n.currentLanguage && SA.i18n.currentLanguage()) || 'ja';
    const isJa = lang === 'ja';

    const presets = SA.motion && SA.motion.motionPresets ? SA.motion.motionPresets() : [];

    root.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog dialog-wide motion-dialog';

    // Header
    const head = document.createElement('div');
    head.className = 'dialog-header';
    head.innerHTML = `<h3>${t('studio.motion.title')}</h3>`;
    const hint = document.createElement('div');
    hint.className = 'dialog-hint insp-inherit';
    hint.textContent = t('studio.motion.hint');
    head.appendChild(hint);
    dialog.appendChild(head);

    // Search bar
    const searchBar = document.createElement('div');
    searchBar.className = 'motion-dialog-search-bar';

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'input motion-dialog-search-input';
    searchInput.placeholder = isJa ? '効果名や効果内容で検索…' : 'Search effects by name or description…';
    searchBar.appendChild(searchInput);
    dialog.appendChild(searchBar);

    // Filter bar (Group tabs + category select + counter)
    const filterBar = document.createElement('div');
    filterBar.className = 'motion-dialog-filter-bar';

    let activeGroup = 'all';
    let activeCategory = 'all';

    const groupOptions = [
      { id: 'all', label: isJa ? 'すべて' : 'All' },
      { id: 'entrance', label: t('studio.motion.group.entrance') || (isJa ? '開始' : 'Entrance') },
      { id: 'emphasis', label: t('studio.motion.group.emphasis') || (isJa ? '強調' : 'Emphasis') },
      { id: 'exit', label: t('studio.motion.group.exit') || (isJa ? '終了' : 'Exit') },
    ];

    const tabContainer = document.createElement('div');
    tabContainer.className = 'motion-dialog-tabs';

    groupOptions.forEach((opt) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = `motion-dialog-tab ${opt.id === activeGroup ? 'is-active' : ''}`;
      tab.textContent = opt.label;
      tab.dataset.group = opt.id;
      tab.addEventListener('click', () => {
        activeGroup = opt.id;
        tabContainer.querySelectorAll('.motion-dialog-tab').forEach((b) => b.classList.remove('is-active'));
        tab.classList.add('is-active');
        renderList();
      });
      tabContainer.appendChild(tab);
    });
    filterBar.appendChild(tabContainer);

    // Category Select
    const catSelect = document.createElement('select');
    catSelect.className = 'motion-dialog-cat-select select-mini';
    const allCatOpt = document.createElement('option');
    allCatOpt.value = 'all';
    allCatOpt.textContent = isJa ? 'すべてのカテゴリ' : 'All Categories';
    catSelect.appendChild(allCatOpt);

    const categories = new Set();
    presets.forEach((p) => {
      const cat = isJa ? (p.categoryJa || p.categoryEn) : (p.categoryEn || p.categoryJa);
      if (cat) categories.add(cat);
    });
    Array.from(categories).sort().forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      catSelect.appendChild(opt);
    });

    catSelect.addEventListener('change', () => {
      activeCategory = catSelect.value;
      renderList();
    });
    filterBar.appendChild(catSelect);

    const countLabel = document.createElement('span');
    countLabel.className = 'motion-dialog-count';
    filterBar.appendChild(countLabel);

    dialog.appendChild(filterBar);

    // List container
    const listContainer = document.createElement('div');
    listContainer.className = 'motion-dialog-list';
    dialog.appendChild(listContainer);

    function getPresetLabel(preset) {
      if (isJa) {
        return preset.nameJa || preset.nameEn || (SA.controls ? SA.controls.typeLabel(preset.phase === 'hold' ? 'hold' : preset.phase, preset.type) : preset.type);
      }
      return preset.nameEn || preset.nameJa || (SA.controls ? SA.controls.typeLabel(preset.phase === 'hold' ? 'hold' : preset.phase, preset.type) : preset.type);
    }

    function getPresetSubLabel(preset) {
      if (isJa) return preset.nameEn && preset.nameEn !== preset.nameJa ? preset.nameEn : '';
      return preset.nameJa && preset.nameJa !== preset.nameEn ? preset.nameJa : '';
    }

    function getPresetDesc(preset) {
      if (isJa) return preset.descJa || preset.descEn || '';
      return preset.descEn || preset.descJa || '';
    }

    function getPresetCategory(preset) {
      if (isJa) return preset.categoryJa || preset.categoryEn || '';
      return preset.categoryEn || preset.categoryJa || '';
    }

    function renderList() {
      listContainer.innerHTML = '';
      const query = searchInput.value.trim().toLowerCase();
      const terms = query ? query.split(/\s+/).filter(Boolean) : [];

      const filtered = presets.filter((preset) => {
        // Group filter
        if (activeGroup !== 'all' && preset.group !== activeGroup) return false;

        // Category filter
        const cat = isJa ? (preset.categoryJa || preset.categoryEn) : (preset.categoryEn || preset.categoryJa);
        if (activeCategory !== 'all' && cat !== activeCategory) return false;

        // Search query filter (matches name, description, category, type in both EN and JA)
        if (terms.length > 0) {
          const searchTarget = [
            preset.nameJa,
            preset.nameEn,
            preset.descJa,
            preset.descEn,
            preset.categoryJa,
            preset.categoryEn,
            preset.type,
            preset.id,
          ].filter(Boolean).join(' ').toLowerCase();

          for (const term of terms) {
            if (!searchTarget.includes(term)) return false;
          }
        }

        return true;
      });

      countLabel.textContent = isJa ? `${filtered.length} 件 / 全 ${presets.length} 件` : `${filtered.length} of ${presets.length}`;

      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'motion-dialog-empty';
        empty.textContent = isJa ? '一致する効果が見つかりませんでした。別のキーワードをお試しください。' : 'No matching effects found. Try a different keyword.';
        listContainer.appendChild(empty);
        return;
      }

      // Render cards
      for (const preset of filtered) {
        const card = document.createElement('div');
        card.className = 'motion-card';

        const name = getPresetLabel(preset);
        const subName = getPresetSubLabel(preset);
        const desc = getPresetDesc(preset);
        const cat = getPresetCategory(preset);

        const groupBadgeClass = preset.group === 'entrance' ? 'motion-badge-entrance' : preset.group === 'exit' ? 'motion-badge-exit' : 'motion-badge-emphasis';
        const groupLabel = preset.group === 'entrance' ? (isJa ? '開始' : 'In') : preset.group === 'exit' ? (isJa ? '終了' : 'Out') : (isJa ? '強調' : 'Hold');

        const top = document.createElement('div');
        top.className = 'motion-card-top';

        const nameWrap = document.createElement('div');
        nameWrap.className = 'motion-card-title-wrap';
        const nameEl = document.createElement('span');
        nameEl.className = 'motion-card-name';
        nameEl.innerHTML = highlightMatch(name, query);
        nameWrap.appendChild(nameEl);

        if (subName) {
          const subEl = document.createElement('span');
          subEl.className = 'motion-card-subname';
          subEl.innerHTML = `(${highlightMatch(subName, query)})`;
          nameWrap.appendChild(subEl);
        }
        top.appendChild(nameWrap);

        const badges = document.createElement('div');
        badges.className = 'motion-card-badges';

        const gBadge = document.createElement('span');
        gBadge.className = `motion-badge ${groupBadgeClass}`;
        gBadge.textContent = groupLabel;
        badges.appendChild(gBadge);

        if (cat) {
          const cBadge = document.createElement('span');
          cBadge.className = 'motion-badge motion-badge-category';
          cBadge.textContent = cat;
          badges.appendChild(cBadge);
        }
        top.appendChild(badges);
        card.appendChild(top);

        if (desc) {
          const descEl = document.createElement('div');
          descEl.className = 'motion-card-desc';
          descEl.innerHTML = highlightMatch(desc, query);
          card.appendChild(descEl);
        }

        const bottom = document.createElement('div');
        bottom.className = 'motion-card-bottom';

        const meta = document.createElement('span');
        meta.className = 'motion-card-meta';
        meta.textContent = `${preset.phase}.${preset.type} (${preset.duration || 0.6}s)`;
        bottom.appendChild(meta);

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn btn-mini motion-card-add-btn';
        addBtn.textContent = `+ ${isJa ? '追加' : 'Add'}`;
        bottom.appendChild(addBtn);

        card.appendChild(bottom);

        // Click handler to add
        const handleAdd = (e) => {
          if (e) e.stopPropagation();
          SA.inspector.addMotion(preset);
          card.classList.add('is-active');
          addBtn.textContent = `✓ ${isJa ? '追加済み' : 'Added'}`;
          setTimeout(() => {
            addBtn.textContent = `+ ${isJa ? '追加' : 'Add'}`;
            card.classList.remove('is-active');
          }, 1200);
          if (SA.studio && SA.studio.toast) {
            SA.studio.toast(isJa ? `「${name}」を追加しました` : `Added "${name}"`);
          }
        };

        card.addEventListener('click', handleAdd);
        addBtn.addEventListener('click', handleAdd);

        listContainer.appendChild(card);
      }
    }

    searchInput.addEventListener('input', renderList);

    // Initial render
    renderList();

    // Footer actions
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-mini';
    close.textContent = t('studio.motion.close');
    close.addEventListener('click', () => {
      root.hidden = true;
      root.innerHTML = '';
    });
    actions.appendChild(close);
    dialog.appendChild(actions);

    root.appendChild(dialog);
    root.hidden = false;
    searchInput.focus();
  }

  return { open };
})();
