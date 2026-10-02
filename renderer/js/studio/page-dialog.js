window.SA = window.SA || {};

SA.pageDialog = (() => {
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

  const CATEGORY_MAP = {
    flushLeft: 'generic',
    center: 'generic',
    flushRight: 'generic',
    justify: 'generic',
    vertical: 'generic',
    grid: 'generic',
    magazine: 'editorial',
    fashion: 'editorial',
    newspaper: 'editorial',
    twoColumn: 'editorial',
    threeColumn: 'editorial',
    manuscript: 'editorial',
    xCard: 'ui',
    chatBubble: 'ui',
    cafeSign: 'shop',
    cafeMenu: 'shop',
    boutique: 'shop',
    score: 'music',
    poster: 'poster',
  };

  const SAMPLE_TEXTS_JA = {
    cafeMenu: ['ブレンドコーヒー ¥500', 'カフェラテ ¥580', '季節のタルト ¥650', 'アイスティー ¥480'],
    score: ['ドレミファソラシド', 'きらきらひかる', 'おそらのほしよ', 'まばたきしては'],
    xCard: ['TelopMotion', '@telopmotion', '紙面レイアウト機能が追加されました！多彩な表現が可能です。', '12:34 PM · Oct 2'],
    chatBubble: ['こんにちは！', '元気にしてる？', 'うん、新しい紙面を試してるよ', 'すごく良い感じ！'],
    manuscript: ['吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。'],
    cafeSign: ['CAFE & BAKERY', 'Fresh Coffee & Pastries', 'Open Daily 8:00 - 20:00'],
    boutique: ['AUTUMN COLLECTION', 'Crafted with premium materials and minimalist aesthetics.', 'Atelier No. 04'],
    fashion: ['VOGUE ELEGANCE', 'The essential silhouettes and pure forms of the new season.'],
    default: ['春はあけぼの', 'やうやう白くなりゆく山ぎは', '少しあかりて紫だちたる', '雲の細くたなびきたる'],
  };

  const SAMPLE_TEXTS_EN = {
    cafeMenu: ['Blend Coffee $4.50', 'Cafe Latte $5.20', 'Seasonal Tart $6.00', 'Iced Tea $4.00'],
    score: ['C D E F G A B C', 'Twinkle twinkle little star', 'How I wonder what you are', 'Up above the world so high'],
    xCard: ['TelopMotion', '@telopmotion', 'Page layout feature has been added! Rich editorial & UI styles.', '12:34 PM · Oct 2'],
    chatBubble: ['Hello there!', 'How is everything going?', 'Great, testing the new page layout', 'Looks fantastic!'],
    manuscript: ['To be, or not to be, that is the question: whether tis nobler in the mind to suffer.'],
    cafeSign: ['CAFE & BAKERY', 'Fresh Coffee & Pastries', 'Open Daily 8:00 - 20:00'],
    boutique: ['AUTUMN COLLECTION', 'Crafted with premium materials and minimalist aesthetics.', 'Atelier No. 04'],
    fashion: ['VOGUE ELEGANCE', 'The essential silhouettes and pure forms of the new season.'],
    default: ['The quick brown fox', 'jumps over the lazy dog', 'and runs across the field', 'under the midnight sun'],
  };

  function getSampleLines(type, isJa) {
    const table = isJa ? SAMPLE_TEXTS_JA : SAMPLE_TEXTS_EN;
    return table[type] || table.default;
  }

  function renderThumbnail(canvas, type, aspectMode, isJa) {
    if (!canvas || !SA.pageLayout || !SA.pageLayout.compose) return;
    const isPortrait = aspectMode === '9:16';
    const fw = isPortrait ? 180 : 320;
    const fh = isPortrait ? 320 : 180;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const displayW = isPortrait ? 100 : 160;
    const displayH = isPortrait ? 160 : 90;

    canvas.width = Math.round(displayW * dpr);
    canvas.height = Math.round(displayH * dpr);
    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale((displayW * dpr) / fw, (displayH * dpr) / fh);

    // Canvas background
    ctx.fillStyle = '#14151c';
    ctx.fillRect(0, 0, fw, fh);

    const lines = getSampleLines(type, isJa);
    const params = (SA.fx && SA.fx.paramDefaults && SA.fx.paramDefaults('page', type)) || {};
    const rng = SA.pageLayout.createRng ? SA.pageLayout.createRng(42) : Math.random;

    let res;
    try {
      res = SA.pageLayout.compose(type, params, {
        lines,
        text: lines.join('\n'),
        frame: { w: fw, h: fh },
        size: isPortrait ? 14 : 16,
        direction: 'horizontal',
        lang: isJa ? 'ja' : 'en',
        rng,
        aspect: fw / fh,
      });
    } catch {
      ctx.restore();
      return;
    }

    if (!res) {
      ctx.restore();
      return;
    }

    // 1. Draw Decor
    for (const d of res.decor || []) {
      ctx.save();
      const role = d.role || 'rule';
      let strokeColor = '#3a3d4f';
      let fillColor = 'rgba(255, 255, 255, 0.05)';

      if (role === 'accent') {
        strokeColor = '#4dc8ff';
        fillColor = 'rgba(77, 200, 255, 0.15)';
      } else if (role === 'paper') {
        fillColor = '#1e202a';
        strokeColor = '#2f3242';
      } else if (role === 'ink') {
        strokeColor = '#e0e2ec';
        fillColor = 'rgba(224, 226, 236, 0.8)';
      }

      if (d.opacity != null) ctx.globalAlpha = Math.max(0.1, Math.min(1, d.opacity));

      if (d.kind === 'rect' || d.kind === 'roundRect') {
        const r = d.radius || 0;
        ctx.beginPath();
        if (ctx.roundRect && r > 0) {
          ctx.roundRect(d.x, d.y, d.w, d.h, r);
        } else {
          ctx.rect(d.x, d.y, d.w, d.h);
        }
        if (d.role === 'paper' || d.fill) {
          ctx.fillStyle = fillColor;
          ctx.fill();
        }
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = d.lineWidth || 1;
        ctx.stroke();
      } else if (d.kind === 'circle' || d.kind === 'ring') {
        ctx.beginPath();
        ctx.arc(d.cx, d.cy, d.r, 0, Math.PI * 2);
        if (d.kind === 'circle' && d.fill) {
          ctx.fillStyle = fillColor;
          ctx.fill();
        }
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = d.lineWidth || 1;
        ctx.stroke();
      } else if (d.kind === 'line' || d.kind === 'dashLine') {
        ctx.beginPath();
        ctx.moveTo(d.x1, d.y1);
        ctx.lineTo(d.x2, d.y2);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = d.lineWidth || 1;
        if (d.kind === 'dashLine') ctx.setLineDash([3, 3]);
        ctx.stroke();
      } else if (d.kind === 'cells') {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 0.8;
        const cols = Math.min(d.cols || 10, 20);
        const rows = Math.min(d.rows || 10, 20);
        const cw = d.w / cols;
        const ch = d.h / rows;
        for (let c = 0; c <= cols; c += 2) {
          ctx.beginPath();
          ctx.moveTo(d.x + c * cw, d.y);
          ctx.lineTo(d.x + c * cw, d.y + d.h);
          ctx.stroke();
        }
        for (let r = 0; r <= rows; r += 2) {
          ctx.beginPath();
          ctx.moveTo(d.x, d.y + r * ch);
          ctx.lineTo(d.x + d.w, d.y + r * ch);
          ctx.stroke();
        }
      } else if (d.kind === 'staff') {
        ctx.strokeStyle = 'rgba(77, 200, 255, 0.3)';
        ctx.lineWidth = 0.8;
        const count = d.count || 5;
        const spacing = d.spacing || 4;
        for (let i = 0; i < count; i += 1) {
          ctx.beginPath();
          ctx.moveTo(d.x, d.y + i * spacing);
          ctx.lineTo(d.x + d.w, d.y + i * spacing);
          ctx.stroke();
        }
      } else if (d.kind === 'bubble') {
        ctx.fillStyle = d.side === 'right' ? 'rgba(77, 200, 255, 0.25)' : '#262835';
        ctx.strokeStyle = d.side === 'right' ? '#4dc8ff' : '#3c3f52';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(d.x, d.y, d.w, d.h, 6);
        else ctx.rect(d.x, d.y, d.w, d.h);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Draw Regions (stylized typography wireframe)
    for (const r of res.regions || []) {
      if (!r.rect) continue;
      ctx.save();
      const rect = r.rect;
      const isHero = r.role === 'hero' || r.role === 'headline';
      const isMuted = r.role === 'caption' || r.role === 'byline' || r.role === 'handle' || r.role === 'time';
      const isAccent = r.role === 'accent' || r.role === 'price';

      let barColor = isHero ? '#ffffff' : isAccent ? '#4dc8ff' : isMuted ? '#606477' : '#9ea2b5';
      ctx.fillStyle = barColor;

      if (r.flow === 'cells') {
        // Draw tiny cell dot grid
        const cols = (r.cells && r.cells.cols) || 10;
        const rows = (r.cells && r.cells.rows) || 10;
        const pw = rect.w / cols;
        const ph = rect.h / rows;
        for (let i = 0; i < Math.min(25, (r.text || '').length); i += 1) {
          const c = i % cols;
          const row = Math.floor(i / cols);
          ctx.fillRect(rect.x + c * pw + 2, rect.y + row * ph + 2, Math.max(2, pw - 4), Math.max(2, ph - 4));
        }
      } else if (r.flow === 'path') {
        // Draw miniature musical note dots
        for (let i = 0; i < 8; i += 1) {
          const nx = rect.x + (i / 7) * (rect.w - 10) + 5;
          const ny = rect.y + rect.h * 0.5 + Math.sin(i * 1.2) * (rect.h * 0.25);
          ctx.beginPath();
          ctx.arc(nx, ny, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(nx + 1.5, ny - 8, 1, 8);
        }
      } else {
        // Draw typographic skeleton bars
        const isVert = r.style && r.style.direction === 'vertical';
        if (isVert) {
          const barW = isHero ? 6 : 3;
          const colCount = Math.max(1, Math.min(4, Math.floor(rect.w / 14)));
          for (let c = 0; c < colCount; c += 1) {
            const bx = rect.x + rect.w - (c + 1) * 12;
            const bh = rect.h * (c === 0 ? 0.85 : 0.65);
            ctx.fillRect(bx, rect.y + 4, barW, bh);
          }
        } else {
          const lineH = isHero ? 6 : 3;
          const lineGap = isHero ? 6 : 4;
          const lineCount = Math.max(1, Math.min(5, Math.floor(rect.h / (lineH + lineGap))));
          for (let l = 0; l < lineCount; l += 1) {
            const by = rect.y + l * (lineH + lineGap) + 2;
            const bw = rect.w * (l === lineCount - 1 && lineCount > 1 ? 0.6 : 0.95);
            ctx.fillRect(rect.x, by, bw, lineH);
          }
        }
      }
      ctx.restore();
    }

    ctx.restore();
  }

  function open() {
    const root = document.getElementById('dialog-root');
    const doc = SA.store && SA.store.state && SA.store.state.project;
    const selection = (SA.store && SA.store.state && SA.store.state.selection) || {};
    if (!root || !doc) return;

    const lang = (SA.i18n && SA.i18n.currentLanguage && SA.i18n.currentLanguage()) || 'ja';
    const isJa = lang === 'ja';

    // Collect all preset descriptors from SA.pageLayout
    const presetsTable = (SA.pageLayout && SA.pageLayout.PRESETS) || {};
    const presetKeys = Object.keys(presetsTable);

    let activeAspect = '16:9';
    let activeCategory = 'all';

    root.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog dialog-wide page-dialog';

    // Header
    const head = document.createElement('div');
    head.className = 'dialog-header';
    const titleText = t('studio.pageDialog.title') || (isJa ? '紙面レイアウト プリセット' : 'Page Layout Presets');
    head.innerHTML = `<h3>${escapeHtml(titleText)}</h3>`;
    const hint = document.createElement('div');
    hint.className = 'dialog-hint insp-inherit';
    hint.textContent = t('studio.pageDialog.hint') || (isJa ? 'キューに適用する紙面レイアウトのプリセットを選択します。' : 'Select a page layout preset to apply to the cue.');
    head.appendChild(hint);
    dialog.appendChild(head);

    // Search bar
    const searchBar = document.createElement('div');
    searchBar.className = 'motion-dialog-search-bar page-dialog-search-bar';

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'input motion-dialog-search-input';
    searchInput.placeholder = t('studio.pageDialog.searchPlaceholder') || (isJa ? 'プリセット名や特徴で検索…' : 'Search presets by name or style…');
    searchBar.appendChild(searchInput);
    dialog.appendChild(searchBar);

    // Filter bar
    const filterBar = document.createElement('div');
    filterBar.className = 'motion-dialog-filter-bar page-dialog-filter-bar';

    const categories = [
      { id: 'all', label: t('studio.pageDialog.categories.all') || (isJa ? 'すべて' : 'All') },
      { id: 'editorial', label: t('studio.pageDialog.categories.editorial') || (isJa ? '紙面・出版' : 'Editorial') },
      { id: 'ui', label: t('studio.pageDialog.categories.ui') || (isJa ? '画面UI' : 'Screen UI') },
      { id: 'shop', label: t('studio.pageDialog.categories.shop') || (isJa ? '店舗・メニュー' : 'Shop / Menu') },
      { id: 'music', label: t('studio.pageDialog.categories.music') || (isJa ? '楽譜' : 'Music') },
      { id: 'poster', label: t('studio.pageDialog.categories.poster') || (isJa ? 'ポスター' : 'Poster') },
      { id: 'generic', label: t('studio.pageDialog.categories.generic') || (isJa ? '汎用' : 'Generic') },
    ];

    const tabContainer = document.createElement('div');
    tabContainer.className = 'motion-dialog-tabs';

    categories.forEach((cat) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = `motion-dialog-tab ${cat.id === activeCategory ? 'is-active' : ''}`;
      tab.textContent = cat.label;
      tab.addEventListener('click', () => {
        activeCategory = cat.id;
        tabContainer.querySelectorAll('.motion-dialog-tab').forEach((b) => b.classList.remove('is-active'));
        tab.classList.add('is-active');
        renderGrid();
      });
      tabContainer.appendChild(tab);
    });
    filterBar.appendChild(tabContainer);

    // Aspect ratio toggle
    const aspectContainer = document.createElement('div');
    aspectContainer.className = 'page-aspect-toggle';

    const btn169 = document.createElement('button');
    btn169.type = 'button';
    btn169.className = `motion-dialog-tab page-aspect-tab ${activeAspect === '16:9' ? 'is-active' : ''}`;
    btn169.textContent = '16:9';
    btn169.title = isJa ? '横長 (16:9)' : 'Landscape (16:9)';

    const btn916 = document.createElement('button');
    btn916.type = 'button';
    btn916.className = `motion-dialog-tab page-aspect-tab ${activeAspect === '9:16' ? 'is-active' : ''}`;
    btn916.textContent = '9:16';
    btn916.title = isJa ? '縦長 (9:16)' : 'Portrait (9:16)';

    btn169.addEventListener('click', () => {
      if (activeAspect === '16:9') return;
      activeAspect = '16:9';
      btn169.classList.add('is-active');
      btn916.classList.remove('is-active');
      renderGrid();
    });

    btn916.addEventListener('click', () => {
      if (activeAspect === '9:16') return;
      activeAspect = '9:16';
      btn916.classList.add('is-active');
      btn169.classList.remove('is-active');
      renderGrid();
    });

    aspectContainer.appendChild(btn169);
    aspectContainer.appendChild(btn916);
    filterBar.appendChild(aspectContainer);

    const countLabel = document.createElement('span');
    countLabel.className = 'motion-dialog-count';
    filterBar.appendChild(countLabel);

    dialog.appendChild(filterBar);

    // Grid container
    const gridContainer = document.createElement('div');
    gridContainer.className = 'motion-dialog-list page-dialog-grid';
    dialog.appendChild(gridContainer);

    function getPresetLabel(type) {
      if (SA.controls && SA.controls.typeLabel) {
        return SA.controls.typeLabel('page', type);
      }
      return presetsTable[type]?.label || type;
    }

    function getPresetSubLabel(type) {
      const enLabel = presetsTable[type]?.label || type;
      const curLabel = getPresetLabel(type);
      return curLabel !== enLabel ? enLabel : '';
    }

    function applyPreset(type) {
      const cueIds = new Set();
      if (selection.cueId) cueIds.add(selection.cueId);
      for (const p of selection.paths || []) {
        const m = String(p).match(/cue:([^/]+)/);
        if (m) cueIds.add(m[1]);
      }
      if (!cueIds.size) {
        const firstCue = doc.script && doc.script.cues && doc.script.cues[0];
        if (firstCue) cueIds.add(firstCue.id);
      }

      if (!cueIds.size) {
        if (SA.studio && SA.studio.toast) SA.studio.toast('studio.timeline.selectFirst');
        return;
      }

      for (const cueId of cueIds) {
        const params = (SA.fx && SA.fx.paramDefaults && SA.fx.paramDefaults('page', type)) || {};
        SA.store.commands.setStyleProp({ cueId }, 'page', {
          type,
          params,
          enabled: true,
        });
      }

      const pLabel = getPresetLabel(type);
      if (SA.studio && SA.studio.toast) {
        SA.studio.toast(isJa ? `「${pLabel}」を適用しました` : `Applied "${pLabel}"`);
      }
      close();
    }

    function clearPreset() {
      const cueIds = new Set();
      if (selection.cueId) cueIds.add(selection.cueId);
      for (const p of selection.paths || []) {
        const m = String(p).match(/cue:([^/]+)/);
        if (m) cueIds.add(m[1]);
      }
      if (!cueIds.size) {
        const firstCue = doc.script && doc.script.cues && doc.script.cues[0];
        if (firstCue) cueIds.add(firstCue.id);
      }

      for (const cueId of cueIds) {
        SA.store.commands.setStyleProp({ cueId }, 'page', { type: 'none', params: {} });
      }

      if (SA.studio && SA.studio.toast) {
        SA.studio.toast(isJa ? '紙面レイアウトを解除しました' : 'Cleared page layout');
      }
      close();
    }

    function renderGrid() {
      gridContainer.innerHTML = '';
      const query = searchInput.value.trim().toLowerCase();
      const terms = query ? query.split(/\s+/).filter(Boolean) : [];

      const filtered = presetKeys.filter((type) => {
        const cat = CATEGORY_MAP[type] || 'generic';
        if (activeCategory !== 'all' && cat !== activeCategory) return false;

        if (terms.length > 0) {
          const spec = presetsTable[type] || {};
          const pLabel = getPresetLabel(type);
          const pSubLabel = getPresetSubLabel(type);
          const tags = (spec.tags || []).join(' ');
          const searchTarget = [type, pLabel, pSubLabel, cat, tags].join(' ').toLowerCase();
          for (const term of terms) {
            if (!searchTarget.includes(term)) return false;
          }
        }
        return true;
      });

      countLabel.textContent = isJa ? `${filtered.length} 件 / 全 ${presetKeys.length} 件` : `${filtered.length} of ${presetKeys.length}`;

      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'motion-dialog-empty';
        empty.textContent = t('studio.pageDialog.empty') || (isJa ? '一致するプリセットが見つかりませんでした。' : 'No matching presets found.');
        gridContainer.appendChild(empty);
        return;
      }

      for (const type of filtered) {
        const spec = presetsTable[type] || {};
        const card = document.createElement('div');
        card.className = 'motion-card page-card';

        // Thumbnail Canvas Container
        const thumbWrap = document.createElement('div');
        thumbWrap.className = 'page-thumbnail-wrap';
        if (activeAspect === '9:16') thumbWrap.classList.add('is-portrait');

        const canvas = document.createElement('canvas');
        canvas.className = 'page-thumbnail-canvas';
        renderThumbnail(canvas, type, activeAspect, isJa);
        thumbWrap.appendChild(canvas);
        card.appendChild(thumbWrap);

        // Card Info
        const info = document.createElement('div');
        info.className = 'page-card-info';

        const name = getPresetLabel(type);
        const subName = getPresetSubLabel(type);

        const titleWrap = document.createElement('div');
        titleWrap.className = 'motion-card-title-wrap';

        const nameEl = document.createElement('span');
        nameEl.className = 'motion-card-name';
        nameEl.innerHTML = highlightMatch(name, query);
        titleWrap.appendChild(nameEl);

        if (subName) {
          const subEl = document.createElement('span');
          subEl.className = 'motion-card-subname';
          subEl.innerHTML = `(${highlightMatch(subName, query)})`;
          titleWrap.appendChild(subEl);
        }
        info.appendChild(titleWrap);

        const badges = document.createElement('div');
        badges.className = 'motion-card-badges';

        const cat = CATEGORY_MAP[type] || 'generic';
        const catBadge = document.createElement('span');
        catBadge.className = 'motion-badge motion-badge-category';
        catBadge.textContent = t(`studio.pageDialog.categories.${cat}`) || cat;
        badges.appendChild(catBadge);

        for (const tag of (spec.tags || []).slice(0, 2)) {
          const tagBadge = document.createElement('span');
          tagBadge.className = 'motion-badge';
          tagBadge.textContent = tag;
          badges.appendChild(tagBadge);
        }
        info.appendChild(badges);

        const bottom = document.createElement('div');
        bottom.className = 'motion-card-bottom';

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'btn btn-mini btn-accent motion-card-add-btn';
        applyBtn.textContent = isJa ? '適用' : 'Apply';
        bottom.appendChild(applyBtn);

        info.appendChild(bottom);
        card.appendChild(info);

        const handleApply = (e) => {
          if (e) e.stopPropagation();
          applyPreset(type);
        };

        card.addEventListener('click', handleApply);
        applyBtn.addEventListener('click', handleApply);

        gridContainer.appendChild(card);
      }
    }

    searchInput.addEventListener('input', renderGrid);
    renderGrid();

    // Footer actions
    const actions = document.createElement('div');
    actions.className = 'dialog-actions page-dialog-actions';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'btn btn-mini';
    clearBtn.textContent = t('studio.pageDialog.clear') || (isJa ? '紙面を解除' : 'Clear page layout');
    clearBtn.addEventListener('click', clearPreset);
    actions.appendChild(clearBtn);

    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    actions.appendChild(spacer);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-mini';
    closeBtn.textContent = t('studio.pageDialog.close') || (isJa ? '閉じる' : 'Close');
    closeBtn.addEventListener('click', close);
    actions.appendChild(closeBtn);

    dialog.appendChild(actions);

    function close() {
      root.hidden = true;
      root.innerHTML = '';
    }

    root.appendChild(dialog);
    root.hidden = false;
    searchInput.focus();
  }

  return { open };
})();
