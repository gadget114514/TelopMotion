(() => {
  'use strict';

  const i18n = SA.i18n;
  const cfg = SA.config;
  const data = SA.data;
  const platform = SA.platform;
  const { evaluate } = SA.achievements;
  const { esc, fmtInt, fmtNum, fmtDate, fmtDuration, fmtClock } = SA.format;

  const LS = { lang: 'sa.lang', handle: 'sa.handle', sort: 'sa.sort' };

  const state = {
    handle: null,
    dataset: null,
    evaluation: null,
    loading: false,
    sort: localStorage.getItem(LS.sort) || 'plays',
    query: '',
    category: 'all',
    playingId: null,
    status: null,
    error: null,
  };

  const el = {};
  let toastTimer = null;
  let refreshSeq = 0;

  const SORTERS = {
    plays: (a, b) => b.plays - a.plays,
    likes: (a, b) => b.likes - a.likes,
    comments: (a, b) => b.comments - a.comments,
    date: (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
    title: (a, b) => a.title.localeCompare(b.title, i18n.locale()),
  };

  const SORT_KEYS = [
    ['plays', 'songs.sortPlays'],
    ['likes', 'songs.sortLikes'],
    ['comments', 'songs.sortComments'],
    ['date', 'songs.sortDate'],
    ['title', 'songs.sortTitle'],
  ];

  function cacheElements() {
    el.cacheSelect = document.getElementById('cache-select');
    el.webImport = document.getElementById('web-import');
    el.webImportBtn = document.getElementById('web-import-btn');
    el.langSelect = document.getElementById('lang-select');
    el.profileForm = document.getElementById('profile-form');
    el.profileInput = document.getElementById('profile-input');
    el.status = document.getElementById('status');
    el.empty = document.getElementById('empty');
    el.error = document.getElementById('error');
    el.errorText = document.getElementById('error-text');
    el.content = document.getElementById('content');
    el.heroAvatar = document.getElementById('hero-avatar');
    el.heroName = document.getElementById('hero-name');
    el.heroVerified = document.getElementById('hero-verified');
    el.heroHandle = document.getElementById('hero-handle');
    el.heroDesc = document.getElementById('hero-desc');
    el.heroSince = document.getElementById('hero-since');
    el.btnSnapshot = document.getElementById('btn-snapshot');
    el.snapshotSplit = document.getElementById('snapshot-split');
    el.snapshotMenu = document.getElementById('snapshot-menu');
    el.btnStudio = document.getElementById('btn-studio');
    el.btnOpen = document.getElementById('btn-open');
    el.btnRefresh = document.getElementById('btn-refresh');
    el.btnExport = document.getElementById('btn-export');
    el.btnImport = document.getElementById('btn-import');
    el.statGrid = document.getElementById('stat-grid');
    el.ring = document.getElementById('ring');
    el.ringLabel = document.getElementById('ring-label');
    el.completionText = document.getElementById('completion-text');
    el.filterChips = document.getElementById('filter-chips');
    el.badgeGrid = document.getElementById('badge-grid');
    el.songsSearch = document.getElementById('songs-search');
    el.songsSort = document.getElementById('songs-sort');
    el.songList = document.getElementById('song-list');
    el.songsCount = document.getElementById('songs-count');
    el.footerUpdated = document.getElementById('footer-updated');
    el.toast = document.getElementById('toast');
    el.player = document.getElementById('player');
  }

  function bindEvents() {
    el.webImportBtn.addEventListener('click', () => importData());

    el.webImport.addEventListener('dragover', (event) => {
      event.preventDefault();
      el.webImport.classList.add('is-dragover');
    });

    el.webImport.addEventListener('dragleave', () => el.webImport.classList.remove('is-dragover'));

    el.webImport.addEventListener('drop', (event) => {
      event.preventDefault();
      el.webImport.classList.remove('is-dragover');
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) importFile(file);
    });

    el.profileForm.addEventListener('submit', (event) => {
      event.preventDefault();
      openProfile(el.profileInput.value);
    });

    el.langSelect.addEventListener('change', () => {
      i18n.set(el.langSelect.value);
      localStorage.setItem(LS.lang, i18n.lang());
      applyStaticText();
    });

    el.songsSearch.addEventListener('input', () => {
      state.query = el.songsSearch.value;
      renderSongs();
    });

    el.songsSort.addEventListener('change', () => {
      state.sort = el.songsSort.value;
      localStorage.setItem(LS.sort, state.sort);
      renderSongs();
    });

    el.filterChips.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-category]');
      if (!chip) return;
      state.category = chip.dataset.category;
      renderChips();
      renderBadges();
    });

    el.badgeGrid.addEventListener('click', (event) => {
      const button = event.target.closest('[data-song]');
      if (!button) return;
      const row = el.songList.querySelector(`[data-song-row="${CSS.escape(button.dataset.song)}"]`);
      if (!row) return;
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('is-highlight');
      setTimeout(() => row.classList.remove('is-highlight'), 1600);
    });

    el.songList.addEventListener('click', (event) => {
      const openButton = event.target.closest('[data-open]');
      if (openButton) {
        data.openExternal(cfg.songUrl(openButton.dataset.open));
        return;
      }
      const playButton = event.target.closest('[data-play]');
      if (playButton) {
        togglePlay(playButton.dataset.play);
        return;
      }
      const row = event.target.closest('[data-song-row]');
      if (row) togglePlay(row.dataset.songRow);
    });

    el.btnRefresh.addEventListener('click', () => refresh());
    el.btnExport.addEventListener('click', exportData);
    el.btnImport.addEventListener('click', importData);
    el.btnSnapshot.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleSnapshotMenu();
    });
    el.snapshotMenu.addEventListener('click', (event) => {
      const item = event.target.closest('[data-image-aspect]');
      if (!item) return;
      closeSnapshotMenu();
      saveCard(item.dataset.imageAspect, item.dataset.imageType);
    });
    document.addEventListener('click', (event) => {
      if (!el.snapshotSplit.contains(event.target)) closeSnapshotMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeSnapshotMenu();
    });

    el.btnStudio.addEventListener('click', () => {
      platform.openStudio(state.dataset || null, i18n.lang());
    });
    el.btnOpen.addEventListener('click', () => {
      if (state.handle) data.openExternal(cfg.profileUrl(state.handle));
    });

    el.cacheSelect.addEventListener('change', () => {
      if (el.cacheSelect.value) openProfile(el.cacheSelect.value);
    });

    el.player.addEventListener('ended', () => {
      state.playingId = null;
      markPlaying();
    });

    el.player.addEventListener('error', () => {
      if (state.playingId) {
        state.playingId = null;
        markPlaying();
      }
    });

    data.onProgress((progress) => {
      if (!state.loading || !state.handle) return;
      if (String(progress.handle || '').toLowerCase() !== state.handle.toLowerCase()) return;
      setStatus('fetching', { page: progress.page, songs: progress.songs });
    });
  }

  function renderLangOptions() {
    el.langSelect.innerHTML = i18n.languages
      .map((language) => `<option value="${language.code}">${esc(language.label)}</option>`)
      .join('');
    el.langSelect.value = i18n.lang();
  }

  function renderSortOptions() {
    el.songsSort.innerHTML = SORT_KEYS.map(([key, label]) => `<option value="${key}">${esc(i18n.t(label))}</option>`).join('');
    el.songsSort.value = state.sort;
  }

  function applyStaticText() {
    document.documentElement.lang = i18n.lang();
    for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = i18n.t(node.dataset.i18n);
    for (const node of document.querySelectorAll('[data-i18n-placeholder]')) node.placeholder = i18n.t(node.dataset.i18nPlaceholder);
    renderLangOptions();
    renderSortOptions();
    renderStatus();
    renderError();
    refreshCacheOptions();
    if (state.evaluation) {
      renderHero();
      renderStats();
      renderChips();
      renderBadges();
      renderSongs();
    }
  }

  function setStatus(key, vars) {
    state.status = key ? { key, vars } : null;
    renderStatus();
  }

  function renderStatus() {
    el.status.hidden = !state.status;
    el.status.textContent = state.status ? i18n.t(state.status.key, state.status.vars) : '';
  }

  function showError(code, message) {
    state.error = code ? { code, message } : null;
    renderError();
  }

  function renderError() {
    el.error.hidden = !state.error;
    if (!state.error) return;
    const map = {
      'invalid-handle': 'error.invalid',
      'not-found': 'error.notFound',
      'rate-limit': 'error.rateLimit',
      network: 'error.network',
    };
    el.errorText.textContent = i18n.t(map[state.error.code] || 'error.unknown', { message: state.error.message || state.error.code });
  }

  function toast(key, vars) {
    el.toast.textContent = i18n.t(key, vars);
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.hidden = true;
    }, 3200);
  }

  async function refreshCacheOptions() {
    const handles = await data.listCache();
    el.cacheSelect.innerHTML = '';
    if (!handles.length) {
      el.cacheSelect.hidden = true;
      return;
    }
    el.cacheSelect.hidden = false;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = i18n.t('input.cached');
    el.cacheSelect.appendChild(placeholder);
    for (const handle of handles) {
      const option = document.createElement('option');
      option.value = handle;
      option.textContent = `@${handle}`;
      el.cacheSelect.appendChild(option);
    }
    if (state.handle && handles.includes(state.handle.toLowerCase())) {
      el.cacheSelect.value = state.handle.toLowerCase();
    }
  }

  async function openProfile(raw) {
    const handle = data.normalizeHandle(raw);
    if (!handle) {
      showError('invalid-handle');
      return;
    }
    const switching = !!state.handle && state.handle.toLowerCase() !== handle.toLowerCase();
    state.handle = handle;
    localStorage.setItem(LS.handle, handle);
    el.profileInput.value = handle;
    document.title = `@${handle} · TelopMotion`;
    el.empty.hidden = true;
    showError(null);
    if (switching) {
      state.dataset = null;
      state.evaluation = null;
      state.playingId = null;
      el.player.pause();
      el.player.removeAttribute('src');
      el.player.load();
      el.content.hidden = true;
      el.footerUpdated.textContent = '';
      setStatus(null);
    }
    setStatus('loadingCache');
    const cached = await data.loadCache(handle);
    if (cached && state.handle === handle) {
      applyData(cached);
      setStatus('cached');
    }
    await refresh();
  }

  async function refresh() {
    if (!platform.isElectron) return;
    if (!state.handle) return;
    const currentHandle = state.handle;
    const seq = (refreshSeq += 1);
    state.loading = true;
    setStatus('fetching', { page: 1, songs: state.dataset ? state.dataset.songs.length : 0 });
    try {
      const fetched = await data.fetchProfile(currentHandle);
      if (seq !== refreshSeq || state.handle !== currentHandle) return;
      applyData(fetched);
      setStatus('updated', { date: fmtDate(fetched.fetchedAt) });
      showError(null);
      refreshCacheOptions();
      toast('toast.loaded');
    } catch (error) {
      if (seq !== refreshSeq || state.handle !== currentHandle) return;
      if (error.code === 'not-found') {
        state.dataset = null;
        state.evaluation = null;
        el.content.hidden = true;
        el.footerUpdated.textContent = '';
        setStatus(null);
        showError('not-found', error.message);
      } else if (state.dataset) {
        setStatus('cached');
      } else {
        setStatus(null);
        showError(error.code, error.message);
      }
    } finally {
      if (seq === refreshSeq) state.loading = false;
    }
  }

  function applyData(dataset) {
    if (!dataset || !dataset.profile) return;
    state.dataset = dataset;
    state.evaluation = evaluate(dataset);
    state.handle = dataset.profile.handle || state.handle;
    el.content.hidden = false;
    el.empty.hidden = true;
    renderHero();
    renderStats();
    renderChips();
    renderBadges();
    renderSongs();
    el.footerUpdated.textContent = dataset.fetchedAt ? i18n.t('status.updated', { date: fmtDate(dataset.fetchedAt) }) : '';
  }

  function renderHero() {
    const profile = state.dataset.profile;
    if (profile.avatar) {
      el.heroAvatar.src = profile.avatar;
      el.heroAvatar.hidden = false;
    } else {
      el.heroAvatar.hidden = true;
    }
    el.heroName.textContent = profile.displayName || profile.handle;
    el.heroVerified.hidden = !profile.isVerified;
    el.heroHandle.textContent = `@${profile.handle}`;
    el.heroDesc.textContent = profile.description || '';
    el.heroDesc.hidden = !profile.description;
    const firstDate = state.evaluation.agg.firstDate;
    el.heroSince.textContent = firstDate ? i18n.t('profile.memberSince', { date: fmtDate(firstDate) }) : '';
    el.heroSince.hidden = !firstDate;
  }

  function renderStats() {
    const agg = state.evaluation.agg;
    const tiles = [
      [i18n.t('stats.songs'), fmtInt(agg.songCount)],
      [i18n.t('stats.plays'), fmtNum(agg.totalPlays)],
      [i18n.t('stats.likes'), fmtNum(agg.totalLikes)],
      [i18n.t('stats.comments'), fmtNum(agg.totalComments)],
      [i18n.t('stats.runtime'), fmtDuration(agg.totalDuration)],
      [i18n.t('stats.followers'), fmtNum(agg.followers)],
    ];
    el.statGrid.innerHTML = tiles
      .map(([label, value]) => `<div class="stat-tile"><span class="stat-value">${esc(value)}</span><span class="stat-label">${esc(label)}</span></div>`)
      .join('');
  }

  function renderChips() {
    const categories = ['all', ...SA.achievements.categories];
    el.filterChips.innerHTML = categories
      .map((category) => {
        const label = category === 'all' ? i18n.t('achievements.filterAll') : i18n.t(`categories.${category}`);
        const active = state.category === category ? ' is-active' : '';
        return `<button type="button" class="chip${active}" data-category="${category}">${esc(label)}</button>`;
      })
      .join('');
  }

  function detailHtml(badge) {
    const detail = badge.detail;
    if (!detail) return '';
    if (detail.type === 'song' && detail.song) {
      const statKey = detail.stat || 'plays';
      const value = detail.song[statKey] || 0;
      return `<button type="button" class="badge-song" data-song="${esc(detail.song.id)}">${esc(detail.song.title)}</button><span class="muted"> · ${fmtNum(value)} ${esc(i18n.t(`stats.${statKey}`))}</span>`;
    }
    if (detail.type === 'count') return `<span class="muted">${esc(i18n.tPlural('achievements.songsCount', detail.n))}</span>`;
    if (detail.type === 'date') return `<span class="muted">${esc(fmtDate(detail.value))}</span>`;
    return '';
  }

  function badgeCard(badge) {
    const name = i18n.t(`badges.${badge.id}.name`);
    const desc = i18n.t(`badges.${badge.id}.desc`);
    const percent = Math.round(badge.progress * 100);
    const progressText = badge.kind === 'metric' || badge.kind === 'best' ? `${fmtNum(badge.current)} / ${fmtNum(badge.target)}` : '';
    return `
      <article class="badge ${badge.unlocked ? 'is-unlocked' : 'is-locked'}" data-category="${esc(badge.category)}" data-tier="${esc(badge.tier)}">
        <div class="badge-icon"><svg class="icon"><use href="#ic-${badge.icon}"></use></svg></div>
        <div class="badge-body">
          <div class="badge-top">
            <h3>${esc(name)}</h3>
            ${badge.unlocked ? `<span class="badge-state">${esc(i18n.t('achievements.unlocked'))}</span>` : ''}
          </div>
          <p class="badge-desc">${esc(desc)}</p>
          <div class="badge-detail">${detailHtml(badge)}</div>
          <div class="badge-progress">
            <div class="bar"><i data-progress="${percent}"></i></div>
            <span class="badge-progress-text">${esc(progressText)}</span>
          </div>
        </div>
      </article>`;
  }

  function renderBadges() {
    const evaluation = state.evaluation;
    if (!evaluation) return;
    const percent = Math.round(evaluation.completion * 100);
    el.ring.style.setProperty('--p', `${percent}%`);
    el.ringLabel.textContent = `${percent}%`;
    el.completionText.textContent = i18n.t('achievements.summary', { unlocked: evaluation.unlockedCount, total: evaluation.total });
    const badges = evaluation.badges.filter((badge) => state.category === 'all' || badge.category === state.category);
    el.badgeGrid.innerHTML = badges.map(badgeCard).join('');
    for (const bar of el.badgeGrid.querySelectorAll('.bar > i')) {
      bar.style.width = `${bar.dataset.progress}%`;
    }
  }

  function renderSongs() {
    const dataset = state.dataset;
    if (!dataset) return;
    const query = state.query.trim().toLowerCase();
    let songs = dataset.songs.filter((song) => {
      if (!query) return true;
      if (song.title.toLowerCase().includes(query)) return true;
      return song.tags.some((tag) => tag.toLowerCase().includes(query));
    });
    songs = [...songs].sort(SORTERS[state.sort] || SORTERS.plays);
    el.songsCount.textContent = fmtInt(songs.length);
    if (!songs.length) {
      el.songList.innerHTML = `<p class="songs-empty">${esc(i18n.t('songs.empty'))}</p>`;
      return;
    }
    el.songList.innerHTML = songs.map(songRow).join('');
  }

  function songRow(song) {
    const playing = state.playingId === song.id;
    const meta = [song.tags.slice(0, 3).join(' · '), song.model].filter(Boolean).join('  —  ');
    return `
      <div class="song${playing ? ' is-playing' : ''}" data-song-row="${esc(song.id)}">
        <button type="button" class="song-play" data-play="${esc(song.id)}" ${song.audio ? '' : 'disabled'}>
          <svg class="icon"><use href="#${playing ? 'ic-pause' : 'ic-play'}"></use></svg>
        </button>
        <img class="song-cover" src="${esc(song.image || '')}" alt="" loading="lazy" />
        <div class="song-main">
          <div class="song-title">${esc(song.title)}</div>
          <div class="song-meta">${esc(meta)}</div>
        </div>
        <div class="song-stats">
          <span class="song-stat" title="${esc(i18n.t('stats.plays'))}"><svg class="icon"><use href="#ic-play"></use></svg>${fmtNum(song.plays)}</span>
          <span class="song-stat" title="${esc(i18n.t('stats.likes'))}"><svg class="icon"><use href="#ic-heart"></use></svg>${fmtNum(song.likes)}</span>
          <span class="song-stat" title="${esc(i18n.t('stats.comments'))}"><svg class="icon"><use href="#ic-comment"></use></svg>${fmtNum(song.comments)}</span>
          <span class="song-duration">${esc(fmtClock(song.duration))}</span>
        </div>
        <div class="song-side">
          <span class="song-date">${esc(fmtDate(song.createdAt))}</span>
          <button type="button" class="song-open" data-open="${esc(song.id)}">
            <svg class="icon"><use href="#ic-external"></use></svg>
          </button>
        </div>
      </div>`;
  }

  function markPlaying() {
    for (const row of el.songList.querySelectorAll('[data-song-row]')) {
      const playing = row.dataset.songRow === state.playingId;
      row.classList.toggle('is-playing', playing);
      const use = row.querySelector('.song-play use');
      if (use) use.setAttribute('href', playing ? '#ic-pause' : '#ic-play');
    }
  }

  function togglePlay(id) {
    if (!state.dataset) return;
    const song = state.dataset.songs.find((entry) => entry.id === id);
    if (!song || !song.audio) return;
    if (state.playingId === id) {
      el.player.pause();
      state.playingId = null;
      markPlaying();
      return;
    }
    state.playingId = id;
    el.player.src = song.audio;
    el.player.play().catch(() => {
      state.playingId = null;
      markPlaying();
    });
    markPlaying();
  }

  async function exportData() {
    if (!state.dataset) return;
    try {
      const result = await data.exportData(state.dataset);
      if (!result || result.canceled) {
        toast('toast.cancelled');
        return;
      }
      toast('toast.exported', { path: result.filePath });
    } catch {
      toast('error.unknown', { message: 'export' });
    }
  }

  async function importData() {
    try {
      const result = await data.importData();
      if (!result || result.canceled) {
        toast('toast.cancelled');
        return;
      }
      applyData(result.data);
      setStatus('updated', { date: fmtDate(result.data.fetchedAt) });
      refreshCacheOptions();
      toast('toast.imported');
    } catch {
      toast('error.unknown', { message: 'import' });
    }
  }

  async function importFile(file) {
    try {
      const dataset = JSON.parse(await file.text());
      if (!platform.isDataset(dataset)) throw Object.assign(new Error('invalid-json'), { code: 'invalid-json' });
      applyData(dataset);
      setStatus('updated', { date: fmtDate(dataset.fetchedAt) });
      toast('toast.imported');
    } catch {
      toast('error.unknown', { message: 'import' });
    }
  }

  function toggleSnapshotMenu() {
    const open = el.snapshotMenu.hidden;
    el.snapshotMenu.hidden = !open;
    el.btnSnapshot.setAttribute('aria-expanded', String(open));
  }

  function closeSnapshotMenu() {
    if (el.snapshotMenu.hidden) return;
    el.snapshotMenu.hidden = true;
    el.btnSnapshot.setAttribute('aria-expanded', 'false');
  }

  async function saveCard(aspect, type) {
    if (!state.dataset || !state.evaluation) return;
    try {
      const profile = state.dataset.profile;
      const avatar = await platform.loadImage(profile.avatar, profile.displayName || profile.handle);
      const blob = await SA.card.renderToBlob({
        dataset: state.dataset,
        evaluation: state.evaluation,
        aspect,
        theme: SA.card.theme(),
        images: { avatar },
        lang: i18n.lang(),
        generatedAt: new Date().toISOString(),
        type,
        quality: 0.92,
      });
      const extension = type === 'image/png' ? 'png' : 'jpg';
      const name = `suno-${state.handle}-achievements-${aspect.replace(':', 'x')}.${extension}`;
      const result = await platform.saveFile({ blob, name, mime: type });
      if (!result || result.canceled) {
        toast('toast.cancelled');
        return;
      }
      toast('toast.snapshot', { path: result.filePath });
    } catch {
      toast('error.unknown', { message: 'snapshot' });
    }
  }

  async function init() {
    document.body.classList.toggle('is-web', !platform.isElectron);
    cacheElements();
    i18n.set(localStorage.getItem(LS.lang) || i18n.detect());
    bindEvents();
    applyStaticText();
    const wantsHandoff = location.hash === '#handoff' || /(?:^|[?&])home=1(?:&|$)/.test(location.search);
    if (wantsHandoff) {
      const payload = platform.isElectron
        ? await Promise.race([
            platform.waitForHandoff(),
            new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
          ])
        : await platform.readHandoff();
      const dataset = payload && (payload.data || payload.dataset);
      if (dataset) {
        applyData(dataset);
        refreshCacheOptions();
        return;
      }
    }
    if (!platform.isElectron) return;
    const last = localStorage.getItem(LS.handle);
    if (last) {
      el.profileInput.value = last;
      openProfile(last);
    }
    refreshCacheOptions();
  }

  window.SA.app = { init, openProfile, refresh, importFile, currentData: () => state.dataset };

  init();
})();
