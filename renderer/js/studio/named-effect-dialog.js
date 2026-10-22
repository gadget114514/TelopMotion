window.SA = window.SA || {};

// The named-effect picker: the 120 motion-prompt entries (5 packs of 24),
// searchable by id / name / meaning, applied as a style recipe to the selected
// cue or beat (or the whole project when nothing is selected). The card that
// matches the scope's current `namedEffect` shows as applied.
SA.namedEffectDialog = (() => {
  'use strict';

  function t(key, vars) {
    return SA.i18n.t(key, vars);
  }

  function lang() {
    return SA.i18n && typeof SA.i18n.lang === 'function' ? SA.i18n.lang() : 'ja';
  }

  function textOf(field) {
    if (!field) return '';
    const current = lang();
    return field[current] || field.en || field.ja || '';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function highlightMatch(text, queryRegex) {
    if (!text || !queryRegex) return escapeHtml(text || '');
    const escapedText = escapeHtml(text);
    return escapedText.replace(queryRegex, '<mark>$1</mark>');
  }

  function labelOf(entry) {
    const name = textOf(entry && entry.name);
    const id = String((entry && entry.id) || '').padStart(3, '0');
    return name ? `#${id} ${name}` : `#${id}`;
  }

  // The scope the dialog edits: the selected beat beats its cue, a selected
  // line / word / letter still belongs to its beat, nothing selected is the
  // whole project.
  function targetScope() {
    const paths = (SA.store.state.selection && SA.store.state.selection.paths) || [];
    let cueId = null;
    let beatId = null;
    for (const part of String(paths[0] || '').split('/')) {
      if (part.startsWith('cue:')) cueId = part.slice(4);
      else if (part.startsWith('beat:')) beatId = part.slice(5);
    }
    if (!cueId) return 'project';
    return beatId ? { beatId, cueId } : { cueId };
  }

  function bagOf(doc, scope) {
    if (scope === 'project') return doc.style || {};
    if (scope.beatId) return (doc.beatStyles && doc.beatStyles[scope.beatId]) || {};
    return (doc.cueStyles && doc.cueStyles[scope.cueId]) || {};
  }

  function shortText(text, max) {
    const clean = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    return clean.length > max ? `${clean.slice(0, max)}…` : clean;
  }

  function scopeLabel(scope) {
    const doc = SA.store.state.project;
    if (scope === 'project') return t('studio.namedEffect.scopeProject');
    const cue = ((doc && doc.script && doc.script.cues) || []).find((entry) => entry.id === scope.cueId);
    const text = shortText(cue && cue.text ? cue.text : scope.cueId, 24);
    if (scope.beatId) {
      const beats = (doc.beats && doc.beats[scope.cueId]) || [];
      const index = beats.findIndex((beat) => beat.id === scope.beatId);
      return t('studio.namedEffect.scopeBeat', { cue: text, n: index >= 0 ? index + 1 : 1 });
    }
    return t('studio.namedEffect.scopeCue', { cue: text });
  }

  async function open() {
    const root = document.getElementById('dialog-root');
    if (!root || !SA.namedEffects || !SA.store || !SA.store.state.project) return;
    const runtime = await SA.namedEffects.load();
    if (!runtime) {
      SA.studio.toast('studio.toast.error');
      return;
    }

    const packs = runtime.packs().slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const packById = new Map(packs.map((pack) => [pack.id, pack]));

    root.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog dialog-wide motion-dialog named-effect-dialog';

    // Header
    const head = document.createElement('div');
    head.className = 'dialog-header';
    const title = document.createElement('h3');
    title.textContent = t('studio.namedEffect.title');
    head.appendChild(title);
    const hint = document.createElement('div');
    hint.className = 'dialog-hint insp-inherit';
    hint.textContent = `${t('studio.namedEffect.hint')} ${scopeLabel(targetScope())}`;
    head.appendChild(hint);
    dialog.appendChild(head);

    // Search bar
    const searchBar = document.createElement('div');
    searchBar.className = 'motion-dialog-search-bar';
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'input motion-dialog-search-input';
    searchInput.placeholder = t('studio.namedEffect.searchPlaceholder');
    searchBar.appendChild(searchInput);
    dialog.appendChild(searchBar);

    // Pack tabs + counter
    let activePack = 'all';
    const filterBar = document.createElement('div');
    filterBar.className = 'motion-dialog-filter-bar';
    const tabContainer = document.createElement('div');
    tabContainer.className = 'motion-dialog-tabs';

    const packLabel = (pack) => {
      const key = `studio.namedEffect.pack.${pack.id}`;
      const label = t(key);
      return label === key ? textOf(pack.title) : label;
    };

    const tabs = [{ id: 'all', label: t('studio.namedEffect.all') }]
      .concat(packs.map((pack) => ({ id: pack.id, label: packLabel(pack) })));
    tabs.forEach((tabDef) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = `motion-dialog-tab ${tabDef.id === activePack ? 'is-active' : ''}`;
      tab.textContent = tabDef.label;
      tab.addEventListener('click', () => {
        activePack = tabDef.id;
        tabContainer.querySelectorAll('.motion-dialog-tab').forEach((button) => button.classList.remove('is-active'));
        tab.classList.add('is-active');
        renderList();
      });
      tabContainer.appendChild(tab);
    });
    filterBar.appendChild(tabContainer);

    const countLabel = document.createElement('span');
    countLabel.className = 'motion-dialog-count';
    filterBar.appendChild(countLabel);
    dialog.appendChild(filterBar);

    // List
    const listContainer = document.createElement('div');
    listContainer.className = 'motion-dialog-list';
    dialog.appendChild(listContainer);

    // Footer actions (built before renderList runs so it can sync `hidden`)
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'btn btn-mini';
    clearBtn.textContent = t('studio.namedEffect.clear');
    clearBtn.addEventListener('click', () => {
      if (SA.store.commands.clearNamedEffect(targetScope())) {
        SA.studio.toast('studio.toast.namedEffectCleared');
        renderList();
      }
    });
    actions.appendChild(clearBtn);
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

    function categoryLabel(entry) {
      const pack = packById.get(entry.pack);
      const category = pack && (pack.categories || []).find((item) => item.slug === entry.category);
      return category ? textOf(category) : '';
    }

    function currentNamed() {
      const bag = bagOf(SA.store.state.project, targetScope());
      return bag.namedEffect && bag.namedEffect.id ? bag.namedEffect : null;
    }

    function applyEffect(entry) {
      if (!SA.store.commands.applyNamedEffect(targetScope(), entry)) {
        SA.studio.toast('studio.toast.error');
        return;
      }
      SA.studio.toast('studio.toast.namedEffectApplied', { name: labelOf(entry) });
      renderList();
    }

    function renderList() {
      listContainer.innerHTML = '';
      const query = searchInput.value.trim();

      let queryRegex = null;
      if (query) {
        const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        queryRegex = new RegExp(`(${escapedQuery})`, 'gi');
      }

      const filtered = runtime.search(query, { pack: activePack });
      const current = currentNamed();
      clearBtn.hidden = !current;

      countLabel.textContent = t('studio.namedEffect.count', { n: filtered.length, total: runtime.count() });

      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'motion-dialog-empty';
        empty.textContent = t('studio.namedEffect.empty');
        listContainer.appendChild(empty);
        return;
      }

      for (const entry of filtered) {
        const card = document.createElement('div');
        const applied = !!current && current.id === entry.id;
        card.className = `motion-card${applied ? ' is-active' : ''}`;

        const top = document.createElement('div');
        top.className = 'motion-card-top';

        const nameWrap = document.createElement('div');
        nameWrap.className = 'motion-card-title-wrap';
        const nameEl = document.createElement('span');
        nameEl.className = 'motion-card-name';
        nameEl.innerHTML = highlightMatch(labelOf(entry), queryRegex);
        nameWrap.appendChild(nameEl);

        // the other language's name, so the two lookups agree
        const ja = lang() === 'ja';
        const otherName = ((ja ? entry.name && entry.name.en : entry.name && entry.name.ja) || '');
        if (otherName && otherName !== textOf(entry.name)) {
          const subEl = document.createElement('span');
          subEl.className = 'motion-card-subname';
          subEl.innerHTML = `(${highlightMatch(otherName, queryRegex)})`;
          nameWrap.appendChild(subEl);
        }
        top.appendChild(nameWrap);

        const badges = document.createElement('div');
        badges.className = 'motion-card-badges';
        const pack = packById.get(entry.pack);
        const packBadge = document.createElement('span');
        packBadge.className = 'motion-badge motion-badge-pack';
        packBadge.textContent = pack ? packLabel(pack) : entry.pack;
        badges.appendChild(packBadge);
        const category = categoryLabel(entry);
        if (category) {
          const categoryBadge = document.createElement('span');
          categoryBadge.className = 'motion-badge motion-badge-category';
          categoryBadge.textContent = category;
          badges.appendChild(categoryBadge);
        }
        top.appendChild(badges);
        card.appendChild(top);

        const meaning = textOf(entry.meaning);
        if (meaning) {
          const descEl = document.createElement('div');
          descEl.className = 'motion-card-desc';
          descEl.innerHTML = highlightMatch(meaning, queryRegex);
          card.appendChild(descEl);
        }

        const bottom = document.createElement('div');
        bottom.className = 'motion-card-bottom';
        const meta = document.createElement('span');
        meta.className = 'motion-card-meta';
        meta.textContent = entry.slug;
        bottom.appendChild(meta);

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'btn btn-mini motion-card-add-btn';
        applyBtn.textContent = applied ? `✓ ${t('studio.namedEffect.applied')}` : `+ ${t('studio.namedEffect.apply')}`;
        bottom.appendChild(applyBtn);
        card.appendChild(bottom);

        const handleApply = (event) => {
          if (event) event.stopPropagation();
          applyEffect(entry);
        };
        card.addEventListener('click', handleApply);
        applyBtn.addEventListener('click', handleApply);

        listContainer.appendChild(card);
      }
    }

    searchInput.addEventListener('input', renderList);

    renderList();

    root.appendChild(dialog);
    root.hidden = false;
    searchInput.focus();
  }

  return { open, targetScope };
})();
