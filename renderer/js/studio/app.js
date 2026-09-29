(() => {
  'use strict';

  const i18n = SA.i18n;
  const store = SA.store;
  const platform = SA.platform;
  const LS_KEY = 'sa.studio.layout';
  const MIN = { media: 200, inspector: 280, timeline: 140, preview: 150, console: 200 };
  const AUTO_DIRECT_GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'repeat', 'clones', 'text', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion'];
  // what a cue takes from its own drawn look when the weird axis gives it one:
  // the motion and the text treatment. Layout, location, colours and the font
  // stay with the song so the lyrics keep their place and palette (a very weird
  // song lets the cue look move layout and location too).
  const CUE_LOOK_GROUPS = ['animation', 'enter', 'exit', 'hold', 'fill', 'edge', 'post', 'repeat', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion'];
  const AUTO_DIRECT_BEAT_GROUPS = ['layout', 'location', 'edge', 'background', 'animation', 'enter', 'exit', 'hold', 'post', 'color', 'palette', 'text', 'transform', 'repeat', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion'];
  const AUTO_DIRECT_LOCKS = ['layout', 'fill', 'background', 'edge', 'location', 'bg'];

  const el = {};
  let layout = { mediaW: 260, inspectorW: 340, timelineH: 240, consoleW: 360, panels: { media: true, inspector: true, timeline: true }, preset: 'standard' };
  let autosaveEnabled = true;
  let welcomeDismissed = false;
  let toastTimer = null;
  let evaluationCache = { dataset: null, evaluation: null };
  let lastVersions = {};

  function t(key, vars) {
    return i18n.t(key, vars);
  }

  // local rng pick (a list is never empty where this is used)
  function pick(random, list) {
    return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  }

  function cacheElements() {
    el.studio = document.getElementById('studio');
    el.avatar = document.getElementById('media-avatar');
    el.name = document.getElementById('media-name');
    el.handle = document.getElementById('media-handle');
    el.songs = document.getElementById('media-songs');
    el.cues = document.getElementById('media-cues');
    el.aspect = document.getElementById('media-aspect');
    el.duration = document.getElementById('media-duration');
    el.mediaTabs = {
      info: document.getElementById('media-tab-info'),
      video: document.getElementById('media-tab-video'),
      audio: document.getElementById('media-tab-audio'),
    };
    el.mediaPanes = {
      info: document.getElementById('media-pane-info'),
      video: document.getElementById('media-pane-video'),
      audio: document.getElementById('media-pane-audio'),
    };
    el.videoImport = document.getElementById('media-video-import');
    el.videoList = document.getElementById('media-video-list');
    el.audioImport = document.getElementById('media-audio-import');
    el.audioCanvas = document.getElementById('media-audio-canvas');
    el.audioMeta = document.getElementById('media-audio-meta');
    el.canvas = document.getElementById('preview-canvas');
    el.previewStage = document.querySelector('.preview-stage');
    el.transport = document.querySelector('.transport');
    el.welcome = document.getElementById('welcome');
    el.welcomeStart = document.getElementById('welcome-start');

    el.welcomeOpen = document.getElementById('welcome-open');
    el.welcomeLyrics = document.getElementById('welcome-lyrics');
    el.tpStart = document.getElementById('tp-start');
    el.tpPrev = document.getElementById('tp-prev');
    el.tpPlay = document.getElementById('tp-play');
    el.tpNext = document.getElementById('tp-next');
    el.tpEnd = document.getElementById('tp-end');
    el.tpLoop = document.getElementById('tp-loop');
    el.tpSpeed = document.getElementById('tp-speed');
    el.tpTime = document.getElementById('tp-time');
    el.tpAspect = document.getElementById('tp-aspect');
    el.dialogRoot = document.getElementById('dialog-root');
    el.toast = document.getElementById('toast');
    el.inspectorBody = document.getElementById('inspector-body');
    el.splitMedia = document.getElementById('split-media');
    el.splitInspector = document.getElementById('split-inspector');
    el.splitTimeline = document.getElementById('split-timeline');
    el.splitConsole = document.getElementById('split-console');
    el.autoDirect = document.getElementById('tl-auto-direct');
  }

  function project() {
    return store.state.project;
  }

  function evaluation() {
    const data = project() && project().dataset;
    if (!data) return null;
    if (evaluationCache.dataset === data && evaluationCache.evaluation) return evaluationCache.evaluation;
    evaluationCache = { dataset: data, evaluation: SA.achievements.evaluate(data) };
    return evaluationCache.evaluation;
  }

  function duration() {
    return SA.preview ? SA.preview.duration() : 0;
  }

  function formatClock(seconds) {
    const value = Math.max(0, seconds || 0);
    const minutes = Math.floor(value / 60);
    const rest = value % 60;
    return `${minutes}:${rest.toFixed(2).padStart(5, '0')}`;
  }

  function loadLayout() {
    try {
      const stored = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (stored && stored.panels) layout = { ...layout, ...stored, panels: { ...layout.panels, ...stored.panels } };
    } catch {
      /* ignore */
    }
  }

  function saveLayout() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(layout));
    } catch {
      /* ignore */
    }
  }

  function maxTimelineHeight() {
    const chrome = 32 + 6; // menubar + splitter
    const available = Math.max(0, window.innerHeight - chrome);
    const transport = el.transport || document.querySelector('.transport');
    const transportH = transport ? Math.ceil(transport.getBoundingClientRect().height) : 49;
    // keep the transport plus a slice of the stage visible, even in short or narrow windows
    const minPreview = Math.max(MIN.preview, transportH + 48);
    return Math.max(MIN.timeline, available - minPreview);
  }

  function applyLayout() {
    el.studio.classList.toggle('panel-hidden-media', !layout.panels.media);
    el.studio.classList.toggle('panel-hidden-inspector', !layout.panels.inspector);
    el.studio.classList.toggle('panel-hidden-timeline', !layout.panels.timeline);
    const consoleOpen = !!(SA.debugConsole && SA.debugConsole.isOpen());
    el.studio.classList.toggle('console-hidden', !consoleOpen);
    document.documentElement.style.setProperty('--media-w', `${Math.max(0, layout.mediaW)}px`);
    document.documentElement.style.setProperty('--inspector-w', `${Math.max(0, layout.inspectorW)}px`);
    let consoleW = Math.max(MIN.console, layout.consoleW || 360);
    if (consoleOpen) {
      // keep a usable preview even in narrow windows
      const mediaW = layout.panels.media ? layout.mediaW : 0;
      const inspectorW = layout.panels.inspector ? layout.inspectorW : 0;
      const room = window.innerWidth - mediaW - inspectorW - 18 - 360;
      consoleW = Math.max(MIN.console, Math.min(consoleW, room));
    }
    document.documentElement.style.setProperty('--console-w', `${consoleW}px`);
    document.documentElement.style.setProperty('--timeline-h', `${Math.min(Math.max(MIN.timeline, layout.timelineH), maxTimelineHeight())}px`);
  }

  function setLayout(name) {
    if (name === 'reset') {
      layout = { mediaW: 260, inspectorW: 340, timelineH: 240, consoleW: 360, panels: { media: true, inspector: true, timeline: true }, preset: 'standard' };
    } else if (name === 'wide') {
      layout = { ...layout, preset: 'wide', timelineH: 160, panels: { ...layout.panels, media: false, timeline: true, inspector: true } };
    } else if (name === 'timeline') {
      layout = { ...layout, preset: 'timeline', timelineH: Math.round(window.innerHeight * 0.45), panels: { media: true, inspector: true, timeline: true } };
    } else {
      layout = { ...layout, preset: 'standard', mediaW: 260, inspectorW: 340, timelineH: 240, panels: { media: true, inspector: true, timeline: true } };
    }
    applyLayout();
    saveLayout();
    SA.menu.refresh();
    renderPreview();
  }

  function setupSplitter(node, axis) {
    if (!node) return;
    node.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      node.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startY = event.clientY;
      const start = { mediaW: layout.mediaW, inspectorW: layout.inspectorW, timelineH: layout.timelineH, consoleW: layout.consoleW || 360 };
      const onMove = (moveEvent) => {
        if (axis === 'media') layout.mediaW = Math.max(MIN.media, start.mediaW + (moveEvent.clientX - startX));
        else if (axis === 'inspector') layout.inspectorW = Math.max(MIN.inspector, start.inspectorW - (moveEvent.clientX - startX));
        else if (axis === 'console') layout.consoleW = Math.max(MIN.console, start.consoleW - (moveEvent.clientX - startX));
        else layout.timelineH = Math.max(MIN.timeline, Math.min(maxTimelineHeight(), start.timelineH - (moveEvent.clientY - startY)));
        applyLayout();
      };
      const onUp = () => {
        node.removeEventListener('pointermove', onMove);
        node.removeEventListener('pointerup', onUp);
        saveLayout();
        renderPreview();
      };
      node.addEventListener('pointermove', onMove);
      node.addEventListener('pointerup', onUp);
    });
  }

  function applyStaticText() {
    document.documentElement.lang = i18n.lang();
    for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
    for (const node of document.querySelectorAll('[data-i18n-title]')) node.title = t(node.dataset.i18nTitle);
    document.title = t('studio.title');
  }

  function toast(key, vars, duration) {
    el.toast.textContent = t(key, vars);
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.hidden = true;
    }, duration || 3200);
  }

  function renderMedia() {
    const doc = project();
    const dataset = doc && doc.dataset;
    const profile = dataset && dataset.profile;
    if (profile) {
      if (profile.avatar) {
        el.avatar.src = profile.avatar;
        el.avatar.hidden = false;
      } else {
        el.avatar.hidden = true;
      }
      el.name.textContent = profile.displayName || profile.handle || '—';
      el.handle.textContent = profile.handle ? `@${profile.handle}` : '';
    } else {
      el.avatar.hidden = true;
      el.name.textContent = '—';
      el.handle.textContent = '';
    }
    el.songs.textContent = dataset ? dataset.songs.length : 0;
    el.cues.textContent = doc ? doc.script.cues.length : 0;
    el.aspect.textContent = doc ? doc.output.aspect : '16:9';
    el.duration.textContent = formatClock(duration());
    renderVideoList();
    if (!el.mediaPanes.audio.hidden) renderMediaAudio();
  }

  let mediaTab = 'info';
  const videoThumbs = new Map();

  function setMediaTab(name) {
    if (!el.mediaPanes[name]) return;
    mediaTab = name;
    for (const key of Object.keys(el.mediaPanes)) {
      el.mediaPanes[key].hidden = key !== name;
      el.mediaTabs[key].classList.toggle('is-active', key === name);
    }
    if (name === 'audio') renderMediaAudio();
    if (name === 'video') renderVideoList();
  }

  function drawThumb(canvas, image) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const scale = Math.max(width / (image.width || 16), height / (image.height || 9));
    const w = (image.width || 16) * scale;
    const h = (image.height || 9) * scale;
    ctx.fillStyle = '#0d1017';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
  }

  function videoThumbnail(entry, canvas) {
    if (entry.thumb) {
      const image = new Image();
      image.onload = () => drawThumb(canvas, image);
      image.src = entry.thumb;
      return;
    }
    const cached = videoThumbs.get(entry.src);
    if (cached) {
      entry.thumb = cached;
      const image = new Image();
      image.onload = () => drawThumb(canvas, image);
      image.src = cached;
      return;
    }
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.addEventListener('loadeddata', () => {
      try {
        video.currentTime = Math.min(1, Math.max(0, (video.duration || 2) / 2));
      } catch {
        /* ignore */
      }
    });
    video.addEventListener('seeked', () => {
      try {
        drawThumb(canvas, video);
        const thumb = canvas.toDataURL('image/jpeg', 0.6);
        entry.thumb = thumb;
        videoThumbs.set(entry.src, thumb);
      } catch {
        /* tainted */
      }
      video.removeAttribute('src');
      video.load();
    });
    video.addEventListener('error', () => {
      /* keep the placeholder */
    });
    video.src = entry.src;
    video.load();
  }

  function renderVideoList() {
    if (!el.videoList) return;
    const doc = project();
    const list = (doc && doc.media && doc.media.videos) || [];
    el.videoList.innerHTML = '';
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'insp-inherit';
      empty.textContent = t('studio.media.noVideos');
      el.videoList.appendChild(empty);
      return;
    }
    for (const entry of list) {
      const item = document.createElement('div');
      item.className = 'media-item';
      item.draggable = true;
      item.dataset.mediaId = entry.id;
      item.title = entry.name || '';
      item.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/x-sa-media', entry.id);
        event.dataTransfer.setData('text/plain', entry.id);
        event.dataTransfer.effectAllowed = 'copy';
      });
      const canvas = document.createElement('canvas');
      canvas.width = 132;
      canvas.height = 74;
      canvas.className = 'media-thumb';
      item.appendChild(canvas);
      const name = document.createElement('div');
      name.className = 'media-item-name';
      name.textContent = entry.name || 'video';
      item.appendChild(name);
      const actions = document.createElement('div');
      actions.className = 'media-item-actions';
      const bg = document.createElement('button');
      bg.type = 'button';
      bg.className = 'btn btn-mini';
      bg.textContent = t('studio.media.asBackground');
      bg.addEventListener('click', () => addVideoLayer(entry, 'background'));
      const fg = document.createElement('button');
      fg.type = 'button';
      fg.className = 'btn btn-mini';
      fg.textContent = t('studio.media.asForeground');
      fg.addEventListener('click', () => addVideoLayer(entry, 'foreground'));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-mini';
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        SA.store.commands.removeMedia('videos', entry.id);
        renderVideoList();
      });
      actions.appendChild(bg);
      actions.appendChild(fg);
      actions.appendChild(remove);
      item.appendChild(actions);
      el.videoList.appendChild(item);
      videoThumbnail(entry, canvas);
    }
  }

  function addVideoLayer(entry, slot) {
    if (!entry) return;
    const layer = SA.layersDialog.defaults(slot);
    layer.type = 'video';
    layer.src = entry.src;
    layer.fit = 'cover';
    layer.color = '#ffffff';
    if (entry.width && entry.height) layer.video = { speed: 1, offset: 0, play: true, loop: true };
    SA.store.commands.addLayer(layer);
    toast('studio.media.layerAdded', { name: entry.name || '' });
  }

  async function importVideoMedia() {
    try {
      const picked = await platform.readFile('.mp4,.webm,.mov,video/mp4,video/webm');
      if (!picked || !picked.bytes) return;
      const extension = String(picked.name || '').split('.').pop().toLowerCase();
      const mime = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' }[extension] || picked.type || 'video/mp4';
      const src = URL.createObjectURL(new Blob([picked.bytes], { type: mime }));
      const meta = await new Promise((resolve) => {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.addEventListener('loadedmetadata', () => resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight }));
        video.addEventListener('error', () => resolve(null));
        video.src = src;
        video.load();
      });
      const entry = {
        id: `v${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`,
        name: picked.name || 'video',
        mime,
        src,
        duration: meta && meta.duration,
        width: meta && meta.width,
        height: meta && meta.height,
      };
      SA.store.commands.addMedia({ ...entry, kind: 'videos' });
      setMediaTab('video');
      toast('studio.media.videoImported', { name: entry.name });
    } catch {
      toast('studio.toast.error');
    }
  }

  async function refreshAudioVisual() {
    for (let i = 0; i < 60; i += 1) {
      if (SA.preview && SA.preview.getPeaks && SA.preview.getPeaks()) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    renderMediaAudio();
  }

  function renderMediaAudio() {
    const canvas = el.audioCanvas;
    if (!canvas) return;
    const width = Math.max(160, (canvas.parentElement && canvas.parentElement.clientWidth) || 220);
    const height = 96;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0d1017';
    ctx.fillRect(0, 0, width, height);
    const peaks = SA.preview && SA.preview.getPeaks ? SA.preview.getPeaks() : null;
    const analysis = SA.preview && SA.preview.getAudioAnalysis ? SA.preview.getAudioAnalysis() : null;
    if (analysis && analysis.frames && analysis.frames.length) {
      const frames = analysis.frames;
      const total = frames.length / analysis.fps;
      const groups = 24;
      const bandCount = frames[0].bands.length;
      const rowH = height / groups;
      for (let x = 0; x < width; x += 1) {
        const time = (x / width) * total;
        const frame = frames[Math.min(frames.length - 1, Math.floor(time * analysis.fps))];
        if (!frame) continue;
        for (let g = 0; g < groups; g += 1) {
          const lo = Math.floor((g * bandCount) / groups);
          const hi = Math.max(lo + 1, Math.floor(((g + 1) * bandCount) / groups));
          let sum = 0;
          for (let b = lo; b < hi && b < bandCount; b += 1) sum += frame.bands[b];
          const value = Math.min(1, (sum / (hi - lo)) * 2.6);
          if (value <= 0.03) continue;
          ctx.fillStyle = `rgba(${Math.round(50 + value * 190)}, ${Math.round(150 - value * 60)}, ${Math.round(230 - value * 90)}, ${0.2 + value * 0.75})`;
          ctx.fillRect(x, height - (g + 1) * rowH, 1, rowH);
        }
      }
    }
    if (peaks && peaks.peaks && peaks.peaks.length) {
      const samplesPerSecond = peaks.sampleRate / peaks.block;
      const total = peaks.peaks.length / samplesPerSecond;
      const middle = height / 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.beginPath();
      for (let x = 0; x < width; x += 1) {
        const time = (x / width) * total;
        const index = Math.floor(time * samplesPerSecond);
        let max = 0;
        for (let i = index; i < Math.min(peaks.peaks.length, index + Math.max(1, Math.round(samplesPerSecond / (width / total)))); i += 1) {
          if (peaks.peaks[i] > max) max = peaks.peaks[i];
        }
        const half = (height / 2 - 4) * Math.min(1, max * 1.4);
        ctx.moveTo(x + 0.5, middle - half);
        ctx.lineTo(x + 0.5, middle + half);
      }
      ctx.stroke();
      el.audioMeta.textContent = t('studio.media.audioMeta', {
        duration: formatClock(SA.preview.getAudioDuration() || total),
        rate: peaks.sampleRate,
      });
    } else {
      el.audioMeta.textContent = t('studio.media.noAudio');
    }
  }

  function renderInspector() {
    if (SA.inspector) SA.inspector.render();
  }

  function renderTimeline() {
    const doc = project();
    el.duration.textContent = doc ? formatClock(duration()) : '0:00.00';
  }

  function projectHasContent(doc) {
    if (!doc) return false;
    if (doc.dataset) return true;
    if (doc.script && doc.script.cues && doc.script.cues.length) return true;
    const media = doc.media || {};
    if (media.audio || (media.images || []).length || (media.videos || []).length) return true;
    if ((doc.layers || []).length) return true;
    return false;
  }

  function renderPreview() {
    const doc = project();
    el.welcome.hidden = projectHasContent(doc) || welcomeDismissed;
    if (SA.preview) SA.preview.render();
  }

  function renderTransport() {
    const doc = project();
    el.tpAspect.textContent = doc ? doc.output.aspect : '16:9';
  }

  function renderAll() {
    renderMedia();
    renderTimeline();
    renderInspector();
    renderPreview();
    renderTransport();
    if (SA.timeline) SA.timeline.draw();
    SA.menu.refresh();
  }

  function undoEdit() {
    if (store.undo()) SA.menu.refresh();
  }

  function redoEdit() {
    if (store.redo()) SA.menu.refresh();
  }

  function togglePlay() {
    SA.preview.togglePlay();
  }

  function seek(seconds) {
    SA.preview.seek(seconds);
  }

  function stepFrame(direction, large) {
    SA.preview.step(direction, large);
  }

  function jumpCue(direction) {
    SA.preview.jump(direction);
  }

  function editTime() {
    const node = el.tpTime;
    if (!node || node.contentEditable === 'true') return;
    node.contentEditable = 'true';
    node.focus();
    const selection = document.getSelection();
    if (selection) selection.selectAllChildren(node);
    let done = false;
    const finish = (apply) => {
      if (done) return;
      done = true;
      node.contentEditable = 'false';
      node.onkeydown = null;
      node.onblur = null;
      if (apply) {
        const seconds = SA.preview.parseClock(node.textContent);
        if (seconds != null) seek(seconds);
      }
      SA.preview.render();
    };
    node.onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    };
    node.onblur = () => finish(true);
  }

  function currentCue() {
    const cues = project() ? project().script.cues : [];
    const selected = store.state.selection.paths[0] || '';
    const selectedId = selected.startsWith('cue:') ? selected.slice(4).split('/')[0] : null;
    if (selectedId) {
      const found = cues.find((cue) => cue.id === selectedId);
      if (found) return found;
    }
    return cues.find((cue) => store.state.playhead >= cue.start && store.state.playhead <= cue.end) || null;
  }

  function splitAtPlayhead() {
    const cue = currentCue();
    if (!cue) return;
    store.commands.splitCue(cue.id, store.state.playhead);
    toast('studio.toast.saved');
  }

  function distributeCues() {
    const doc = project();
    if (!doc || !doc.script.cues.length) return;
    store.dispatch({
      label: 'distribute cues',
      areas: ['script'],
      do(projectDoc) {
        const cues = [...projectDoc.script.cues].sort((a, b) => a.start - b.start);
        let cursor = cues.length ? cues[0].start : 0;
        for (const cue of cues) {
          const length = cue.end - cue.start;
          cue.start = cursor;
          cue.end = cursor + length;
          cursor = cue.end + 0.3;
        }
        if (SA.textflow) SA.textflow.apply(projectDoc);
      },
    });
  }

  function restructureBeats() {
    if (!project()) return;
    store.commands.restructureAll();
    toast('studio.toast.beatsRestructured');
  }

  function generateScriptDialog() {
    const doc = project();
    if (!doc || !doc.dataset) {
      toast('studio.toast.needData');
      return;
    }
    const options = doc.script.options || {};
    const reveal = options.reveal || {};
    const stats = options.stats || {};
    const topSongs = options.topSongs || {};
    const timing = options.timing || {};
    const overflow = (doc.output && doc.output.overflow) || 'compress';
    el.dialogRoot.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    dialog.innerHTML = `
      <h3>${t('studio.dialog.script.title')}</h3>
      <label><input type="checkbox" data-field="intro" ${options.intro === false ? '' : 'checked'} />${t('studio.dialog.script.intro')}</label>
      <label><input type="checkbox" data-field="reveal" ${reveal.enabled === false ? '' : 'checked'} />${t('studio.dialog.script.reveal')}</label>
      <div class="field"><span>${t('studio.dialog.script.which')}</span>
        <select data-field="which">
          <option value="unlocked"${reveal.which !== 'all' ? ' selected' : ''}>${t('studio.dialog.script.unlocked')}</option>
          <option value="all"${reveal.which === 'all' ? ' selected' : ''}>${t('studio.dialog.script.all')}</option>
        </select>
      </div>
      <label><input type="checkbox" data-field="stats" ${stats.enabled === false ? '' : 'checked'} />${t('studio.dialog.script.stats')}</label>
      <label><input type="checkbox" data-field="topSongs" ${topSongs.enabled === false ? '' : 'checked'} />${t('studio.dialog.script.topSongs')}</label>
      <div class="field"><span>${t('studio.dialog.script.count')}</span><input type="number" min="0" max="10" value="${topSongs.n == null ? 3 : topSongs.n}" data-field="topCount" /></div>
      <label><input type="checkbox" data-field="completion" ${options.completion === false ? '' : 'checked'} />${t('studio.dialog.script.completion')}</label>
      <label><input type="checkbox" data-field="outro" ${options.outro === false ? '' : 'checked'} />${t('studio.dialog.script.outro')}</label>
      <div class="field"><span>${t('studio.dialog.script.perCue')}</span><input type="number" min="0.5" max="10" step="0.1" value="${timing.perCue == null ? 2.8 : timing.perCue}" data-field="perCue" /></div>
      <div class="field"><span>${t('studio.dialog.script.gap')}</span><input type="number" min="0" max="2" step="0.05" value="${timing.gap == null ? 0.3 : timing.gap}" data-field="gap" /></div>
      <div class="field"><span>${t('studio.dialog.script.maxDuration')}</span><input type="number" min="0" step="1" value="${doc.output.maxDuration == null ? '' : doc.output.maxDuration}" data-field="maxDuration" /></div>
      <div class="field"><span>${t('studio.dialog.script.overflow')}</span>
        <select data-field="overflow">
          <option value="compress"${overflow === 'compress' ? ' selected' : ''}>${t('studio.dialog.script.overflowCompress')}</option>
          <option value="drop"${overflow === 'drop' ? ' selected' : ''}>${t('studio.dialog.script.overflowDrop')}</option>
          <option value="cut"${overflow === 'cut' ? ' selected' : ''}>${t('studio.dialog.script.overflowCut')}</option>
        </select>
      </div>
      <div class="dialog-actions">
        <button type="button" class="btn" data-action="cancel">${t('studio.dialog.script.cancel')}</button>
        <button type="button" class="btn btn-primary" data-action="generate">${t('studio.dialog.script.generate')}</button>
      </div>`;
    el.dialogRoot.appendChild(dialog);
    el.dialogRoot.hidden = false;
    const field = (name) => dialog.querySelector(`[data-field="${name}"]`);
    dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      el.dialogRoot.hidden = true;
    });
    dialog.querySelector('[data-action="generate"]').addEventListener('click', () => {
      const maxDurationValue = field('maxDuration').value.trim();
      // output + script + fit-to-duration are one user action: one undo step
      store.beginTransaction('generate script');
      let cues = [];
      try {
        store.commands.setOutput({
          maxDuration: maxDurationValue === '' ? null : Number(maxDurationValue) || null,
          overflow: field('overflow').value,
        });
        const nextOptions = {
          intro: field('intro').checked,
          reveal: { enabled: field('reveal').checked, which: field('which').value, order: (reveal.order || 'grid') },
          stats: { enabled: field('stats').checked, items: stats.items || undefined },
          topSongs: { enabled: field('topSongs').checked, n: Number(field('topCount').value) || 0, by: topSongs.by || ['plays', 'likes'] },
          completion: field('completion').checked,
          outro: field('outro').checked,
          timing: { perCue: Number(field('perCue').value) || 2.8, gap: Number(field('gap').value) || 0, introLen: timing.introLen || 3.5, outroLen: timing.outroLen || 3 },
        };
        cues = SA.scriptGen.build(evaluation(), doc.dataset, nextOptions, i18n.t, SA.format);
        store.commands.generateScript(cues, nextOptions);
        const generatedDoc = project();
        if (generatedDoc && generatedDoc.output && generatedDoc.output.maxDuration && SA.duration) {
          store.dispatch({
            label: 'fit to max duration',
            areas: ['script'],
            do(projectDoc) {
              SA.duration.fit(projectDoc);
            },
          });
        }
      } finally {
        store.endTransaction();
      }
      el.dialogRoot.hidden = true;
      toast('studio.toast.scriptGenerated', { n: cues.length });
    });
  }

  async function saveImage(aspect, type) {
    const doc = project();
    if (!doc || !doc.dataset) {
      toast('studio.toast.needData');
      return;
    }
    try {
      const profile = doc.dataset.profile || {};
      const avatar = await platform.loadImage(profile.avatar, profile.displayName || profile.handle);
      const blob = await SA.card.renderToBlob({
        dataset: doc.dataset,
        evaluation: evaluation(),
        aspect,
        theme: SA.card.theme(doc),
        images: { avatar },
        lang: i18n.lang(),
        generatedAt: new Date().toISOString(),
        type,
        quality: 0.92,
      });
      const extension = type === 'image/png' ? 'png' : 'jpg';
      const result = await platform.saveFile({ blob, name: `suno-${aspect.replace(':', 'x')}.${extension}`, mime: type });
      if (!result || result.canceled) toast('studio.toast.cancelled');
      else toast('studio.toast.imageSaved', { path: result.filePath });
    } catch {
      toast('studio.toast.error');
    }
  }

  async function openProject() {
    try {
      const result = await SA.io.open();
      if (result.canceled) return;
      welcomeDismissed = false;
      toast('studio.toast.opened');
    } catch (error) {
      toast(error.code === 'newer-version' ? 'studio.toast.newerVersion' : 'studio.toast.invalidProject');
    }
  }

  async function openRecent(entry) {
    if (!entry || !entry.project) {
      toast('studio.toast.error');
      return;
    }
    try {
      SA.io.loadFromObject(entry.project);
      welcomeDismissed = false;
      toast('studio.toast.opened');
    } catch {
      toast('studio.toast.invalidProject');
    }
  }

  async function saveProject() {
    const doc = project();
    if (!doc) return;
    const result = await SA.io.save(doc);
    if (result.canceled) toast('studio.toast.cancelled');
    else toast('studio.toast.saved');
  }

  async function saveProjectAs() {
    const doc = project();
    if (!doc) return;
    const result = await SA.io.save(doc, { name: SA.io.fileName(doc) });
    if (result.canceled) toast('studio.toast.cancelled');
    else toast('studio.toast.saved');
  }

  async function importLyrics() {
    try {
      const result = await SA.io.readLyrics();
      if (result.canceled) return;
      if (result.project) {
        toast('studio.toast.projectFile');
        return;
      }
      toast('studio.toast.lyricsImported', { n: result.cues.length });
      if (result.warnings && result.warnings.length) toast('studio.toast.lyricsWarnings', { n: result.warnings.length });
    } catch (error) {
      if (error && error.code === 'no-lyrics') toast('studio.toast.noLyrics');
      else toast('studio.toast.error');
    }
  }

  async function importProfile() {
    try {
      const result = await SA.io.importProfile();
      if (result.canceled) return;
      toast('studio.toast.profileImported');
    } catch {
      toast('studio.toast.error');
    }
  }

  async function importAudio() {
    const result = await SA.preview.importAudio();
    if (result.canceled) toast('studio.toast.cancelled');
    else if (result.error) toast('studio.toast.error');
    else toast('studio.toast.audioImported', { name: result.name });
  }

  function fitAudio() {
    const cues = project() ? project().script.cues : [];
    const audioDuration = SA.preview.getAudioDuration();
    if (!cues.length || !audioDuration) {
      toast('studio.toast.needData');
      return;
    }
    const natural = cues.reduce((max, cue) => Math.max(max, cue.end), 0) || 1;
    const scale = audioDuration / natural;
    store.dispatch({
      label: 'fit to audio',
      areas: ['script'],
      do(projectDoc) {
        for (const cue of projectDoc.script.cues) {
          cue.start *= scale;
          cue.end *= scale;
        }
        if (SA.textflow) SA.textflow.apply(projectDoc);
      },
    });
    toast('studio.toast.fitAudio', { duration: SA.preview.formatClock(audioDuration) });
  }

  let lastRandom = { scope: 'project', seed: 12345, intensity: 1, locks: [] };

  function lockedFromDialog(dialog) {
    const locks = [];
    for (const input of dialog.querySelectorAll('[data-lock]:checked')) locks.push(input.dataset.lock);
    return locks;
  }

  function runRandomize(scope, options) {
    const doc = project();
    if (!doc) return;
    const opts = options || {};
    const selection = store.state.selection.paths || [];
    const paths = scope === 'elements' ? selection : [];
    if (scope === 'elements' && !paths.length) {
      toast('studio.random.selectElements');
      return;
    }
    lastRandom = {
      scope,
      seed: opts.seed == null ? lastRandom.seed : Number(opts.seed),
      intensity: opts.intensity == null ? lastRandom.intensity : Number(opts.intensity),
      locks: opts.locks == null ? lastRandom.locks : opts.locks,
    };
    // effect colors should come from the current palette, not the raw color pool
    const resolvedPalette = (doc.style && doc.style.palette) || null;
    const paletteColors = resolvedPalette && Array.isArray(resolvedPalette.colors) ? resolvedPalette.colors : [];
    const colors = paletteColors.length
      ? [paletteColors[2], paletteColors[3], paletteColors[5] || paletteColors[3]].filter(Boolean)
      : [];
    SA.random.apply(doc, {
      scope,
      paths,
      seed: lastRandom.seed,
      intensity: lastRandom.intensity,
      locks: lastRandom.locks,
      colors,
      avoidRepeats: true,
      overwriteManual: !!opts.overwriteManual,
    });
    toast('studio.toast.randomized', { seed: lastRandom.seed });
  }

  function reroll() {
    if (lastRandom.scope === '__auto') {
      autoDirect({ seed: lastRandom.seed + 1, exclude: lastRandom.lookN ? [lastRandom.lookN] : null });
      return;
    }
    lastRandom = { ...lastRandom, seed: lastRandom.seed + 1 };
    runRandomize(lastRandom.scope, lastRandom);
  }

  // weird axis: each cue independently draws a look of its own with
  // probability `weird` (0 = the whole song keeps one look, 1 = one per cue,
  // like the FX 800 demo). The draws are seeded, so a seed reproduces them.
  function drawCueLooks(pool, cues, options) {
    const weird = Math.max(0, Math.min(1, Number(options.axes && options.axes.weird) || 0));
    const out = {};
    if (!(weird > 0) || !pool) return out;
    const random = SA.rng.rngFor(options.seed, 'looks', 'weird');
    const used = new Set([options.songLook]);
    // I17: a very weird song lets a cue's look also move the text
    const groups = weird >= 0.8 ? [...CUE_LOOK_GROUPS, 'layout', 'location'] : CUE_LOOK_GROUPS;
    cues.forEach((cue, index) => {
      if (random() >= weird) return;
      const entry = pool.pick({ axes: options.axes, genre: options.genre, seed: options.seed + (index + 1) * 7919, exclude: used });
      if (!entry) return;
      used.add(entry.n);
      const expanded = pool.expand(entry.style);
      const style = {};
      for (const group of groups) {
        if (expanded[group] !== undefined) style[group] = expanded[group];
      }
      out[cue.id] = { n: entry.n, style };
    });
    return out;
  }

  // colour-only re-roll of the whole project: a new palette inside the
  // project's axes and genre, with every literal colour moved onto it (the
  // store does the work, so the inspector can do the same per cue / beat)
  function rerollColors() {
    if (!project()) return;
    const palette = store.commands.rerollPalette('project');
    if (palette) toast('studio.toast.colorsRerolled', { theme: palette.name || palette.id || '' });
  }

  async function autoDirect(options) {
    const doc = project();
    const opts = options || {};
    if (!doc) return;
    if (!doc.script.cues.length) {
      toast('studio.toast.noCues');
      return;
    }
    // genre first: an explicit genre, a random one, or the music's own axes
    const analysis = SA.preview.getAudioAnalysis ? SA.preview.getAudioAnalysis() : null;
    const explicitGenre = opts.genre && opts.genre !== '__random' ? opts.genre : null;
    const picked = SA.moods.randomGenre ? SA.moods.randomGenre() : SA.moods.randomAxes();
    const genre = explicitGenre || picked.genre || null;
    let axes;
    let direction = 'horizontal';
    if (analysis && !explicitGenre) {
      axes = SA.moods.axesFromAudio(SA.audioAnalysis.features(analysis));
    } else {
      axes = picked.axes;
      direction = picked.direction;
    }
    // weird is never derived from a genre or the music: it is the user's choice
    // (genre dialog / theme editor) and sticks to the project across re-rolls.
    // A project that never chose one opens at the UI default (0.7).
    const weirdSource = opts.weird != null ? opts.weird : SA.moods.projectWeird(doc);
    axes = { ...axes, weird: SA.moods.weirdOf({ weird: weirdSource }) };
    const seed = opts.seed == null ? Math.floor(Math.random() * 900000) + 1000 : Number(opts.seed);
    const context = SA.moods.contextFor(doc);
    // おまかせ: draw one of the 800 classified looks by theme + five axes, then
    // adjust the fine parameters (palette, text) from the same axes. When the
    // pool is unavailable, fall back to the generator-only theme. With music
    // the axes own the draw (the random genre would only pull it off target);
    // an explicit genre or a generated theme biases the draw as a theme.
    const lookGenre = explicitGenre || (analysis ? null : genre);
    let look = null;
    let lookClip = null;
    let themeStyle = null;
    let cueLooks = {};
    try {
      const pool = SA.looks && SA.looks.load ? await SA.looks.load() : null;
      if (pool) {
        const entry = pool.pick({ axes, genre: lookGenre, seed, exclude: opts.exclude });
        if (entry) {
          const composed = pool.compose(entry, { axes, seed, genre: lookGenre, direction, context });
          look = composed.look;
          lookClip = composed.clip;
          themeStyle = composed.style;
          cueLooks = drawCueLooks(pool, doc.script.cues, { axes, seed, genre: lookGenre, songLook: entry.n });
        }
      }
    } catch (error) {
      look = null;
      lookClip = null;
      themeStyle = null;
      cueLooks = {};
    }
    if (!themeStyle) themeStyle = SA.moods.generate({ axes, seed, direction, genre, context, ensureSignature: true }).style;
    const themeName = (themeStyle.palette && (themeStyle.palette.name || themeStyle.palette.id)) || '';
    // common preparation for the weird-aware patches below: the size band, the
    // palette and the accent colours that stay readable on the background
    const w = axes.weird;
    const portrait = doc.output && doc.output.aspect === '9:16';
    const minSize = (portrait ? 52 : 72) - 16 * w;
    const maxSize = (portrait ? 96 : 124) + (portrait ? 50 : 80) * w;
    if (themeStyle.text) {
      themeStyle.text = {
        ...themeStyle.text,
        size: Math.max(minSize, Math.min(maxSize, Number(themeStyle.text.size) || (portrait ? 72 : 96))),
      };
    }
    const pal = (themeStyle.palette && themeStyle.palette.colors) || [];
    const bgColor = SA.color.parse(pal[0] || '#000000');
    const accentIdx = [3, 5, 6, 2].filter((i) => pal[i] && SA.color.contrastRatio(SA.color.parse(pal[i]), bgColor) >= 3);
    const accentHexes = accentIdx.map((i) => pal[i]);
    store.dispatch({
      label: 'auto direct',
      areas: ['script', 'style'],
      do(projectDoc) {
        // 0) one beat per musical bar: the bar length comes from the audio BPM
        // when a track is loaded (4/4 assumed), otherwise from a 120 BPM default
        const features = analysis && SA.audioAnalysis ? SA.audioAnalysis.features(analysis) : null;
        const bpm = features && Number(features.bpm) > 0 ? Number(features.bpm) : 120;
        const barDuration = Math.round((60 / bpm) * 4 * 1000) / 1000;
        // G1: a weird song cuts its phrases into shorter chunks
        const chunkDuration = Math.round(barDuration * (1 - 0.5 * w) * 1000) / 1000;
        projectDoc.textFlow = { ...(projectDoc.textFlow || {}), chunk: 'phrase', targetChunkDuration: chunkDuration };
        for (const cue of projectDoc.script.cues) {
          cue.textFlow = { ...(cue.textFlow || {}), chunk: 'phrase', targetChunkDuration: chunkDuration };
        }
        if (SA.textflow) SA.textflow.apply(projectDoc);
        // 1) rebuild the theme from scratch so re-rolls never keep stale groups
        for (const group of AUTO_DIRECT_GROUPS) delete projectDoc.style[group];
        projectDoc.style = SA.project.mergeDeep(projectDoc.style, themeStyle);
        // remember which theme was applied so the UI can show it, and so cue /
        // clip re-rolls can stay inside the same axes
        projectDoc.styleMode = { ...(projectDoc.styleMode || {}), seed, theme: themeName, axes, direction, genre, look: look ? { n: look.n, name: look.name, group: look.group, type: look.type, motion: look.motion } : null, cueLooks: Object.fromEntries(Object.entries(cueLooks).map(([cueId, entry]) => [cueId, entry.n])) };
        for (const cue of projectDoc.script.cues) {
          const container = projectDoc.cueStyles[cue.id];
          if (!container) continue;
          for (const group of AUTO_DIRECT_GROUPS) delete container[group];
          delete container.palette; // a re-roll rebuilds the colours from scratch
          if (!Object.keys(container).length) delete projectDoc.cueStyles[cue.id];
        }
        // 2) per-cue motion inside the same theme: typeface, palette, color,
        // layout, edge, post and background stay fixed for the whole song;
        // only the entrance/exit change by section, and the beats breathe
        // just a little (plus a rare subtle accent).
        projectDoc.beatStyles = projectDoc.beatStyles || {};
        for (const [beatId, existing] of Object.entries(projectDoc.beatStyles)) {
          for (const group of AUTO_DIRECT_BEAT_GROUPS) delete existing[group];
          if (!Object.keys(existing).length) delete projectDoc.beatStyles[beatId];
        }
        const energy = Math.max(0, Math.min(1, Number(axes.energy) || 0.5));
        const baseSize = Number((themeStyle.text && themeStyle.text.size) || (portrait ? 72 : 96));
        projectDoc.script.cues.forEach((cue, cueIndex) => {
          // with a drawn look the entrance/exit are part of the look itself:
          // only the beats breathe (size jitter and the rare pulse) so the
          // whole song keeps the same face, unless the weird axis gave this
          // cue a look of its own
          if (cueLooks[cue.id]) {
            projectDoc.cueStyles[cue.id] = SA.project.mergeDeep(projectDoc.cueStyles[cue.id] || {}, JSON.parse(JSON.stringify(cueLooks[cue.id].style)));
          }
          const cueContext = SA.moods.contextForCue(projectDoc, cue);
          if (w > 0) {
            // E3: a weird song lets every cue draw its own colours, position,
            // font, repeat and clones. The draws are seeded per cue, so a seed
            // reproduces them and weird 0 consumes none of them.
            const cr = SA.rng.rngFor(seed + cueIndex * 131, cue.id, 'weird-cue');
            const own = () => projectDoc.cueStyles[cue.id] || (projectDoc.cueStyles[cue.id] = {});
            // palette
            if (themeStyle.palette && cr() < 0.6 * w) {
              const palette = SA.moods.weirdPalette(cr, themeStyle.palette, w);
              if (palette) projectDoc.cueStyles[cue.id] = { ...SA.moods.recolor(own(), themeStyle.palette.colors, palette.colors), palette };
            }
            // location (G8): nudge the anchor and sometimes let it float
            if (cr() < 0.5 * w) {
              const base = own().location || themeStyle.location || { type: 'center', params: {} };
              const type = w >= 0.6 && cr() < 0.3 * w ? 'randomSafe' : base.type;
              own().location = {
                ...base,
                type,
                params: {
                  ...(base.params || {}),
                  offsetX: Math.round((cr() * 2 - 1) * 0.25 * w * 100) / 100,
                  offsetY: Math.round((cr() * 2 - 1) * 0.25 * w * 100) / 100,
                },
                enabled: true,
              };
            }
            // font (I17)
            if (cr() < 0.3 * w) {
              const fontId = SA.moods.weirdFont(cr, cueContext, themeStyle.text && themeStyle.text.fontId);
              if (fontId) own().text = { ...(own().text || {}), fontId };
            }
            // repeat (G2)
            if (SA.random && SA.random.repeatPatch && cr() < 0.35 * w) {
              const merged = { ...themeStyle, ...own() };
              const repeat = SA.random.repeatPatch(cr, { ...cueContext, weird: w });
              if (repeat && !SA.random.repeatConflicts({ ...merged, repeat })) own().repeat = repeat;
            }
            // clones (G3)
            if (cr() < 0.5 * w) {
              const count = 1 + Math.floor(cr() * 3);
              const s = (a) => Math.round((cr() * 2 - 1) * a * 1000) / 1000;
              own().clones = Array.from({ length: count }, (_, i) => ({
                id: `wclone_${i}`,
                enabled: true,
                dx: s(0.06 * w),
                dy: s(0.06 * w),
                scale: Math.round((1 + s(0.3 * w)) * 100) / 100,
                rotate: Math.round(s(15 * w)),
                opacity: Math.round((0.35 + cr() * 0.25) * 100) / 100,
                hue: Math.round(s(180 * w)),
                delay: Math.round((0.03 + cr() * 0.09) * 100) / 100,
                motion: {
                  type: pick(cr, ['drift', 'float', 'pulse', 'orbit', 'spin']),
                  amount: Math.round((0.02 + 0.04 * w) * 1000) / 1000,
                  speed: Math.round((0.5 + cr() * 1.5) * 100) / 100,
                },
              }));
            }
          }
          if (!look) {
            const generated = SA.moods.generate({
              axes,
              seed: seed + cueIndex * 131 + 1,
              direction,
              genre,
              context: cueContext,
              emphasis: SA.moods.isEmphasis ? SA.moods.isEmphasis(cue) : false,
            }).style;
            projectDoc.cueStyles[cue.id] = SA.project.mergeDeep(projectDoc.cueStyles[cue.id] || {}, {
              enter: generated.enter,
              exit: generated.exit,
            });
          }
          const beats = (projectDoc.beats && projectDoc.beats[cue.id]) || [];
          beats.forEach((beat, beatIndex) => {
            const beatSeed = seed + cueIndex * 131 + beatIndex + 1;
            const beatRng = SA.rng.rngFor(beatSeed, beat.id, 'beat');
            const size = Math.round(baseSize * (0.9 + beatRng() * 0.25));
            const beatPatch = { text: { size } };
            const beatDuration = Math.max(0.2, beat.end - beat.start);
            if (beatDuration >= 1.2 && energy > 0.45 && beatRng() < 0.1) {
              beatPatch.hold = [
                {
                  type: 'pulse',
                  params: { amount: Math.round((0.02 + energy * 0.08) * 1000) / 1000, bpm: Math.round(bpm) },
                  enabled: true,
                },
              ];
            }
            if (w > 0) {
              // E4 / I18 / H5: a weird song steps the beat treatment as well:
              // size, colour, tilt, font and hold all jump half a bar
              const wr = SA.rng.rngFor(beatSeed, beat.id, 'weird');
              const lo = SA.moods.bend(0.9, 0.45, w);
              const hi = SA.moods.bend(1.15, 2.2, w);
              beatPatch.text.size = Math.round(Math.max(24, Math.min(portrait ? 220 : 320, baseSize * (lo + wr() * (hi - lo)))));
              if (accentIdx.length && wr() < 0.5 * w) {
                if (accentIdx.length >= 2 && wr() < 0.3 * w) {
                  const [a, b] = [accentIdx[Math.floor(wr() * accentIdx.length)], accentIdx[Math.floor(wr() * accentIdx.length)]];
                  beatPatch.color = {
                    fill: {
                      kind: 'gradient',
                      type: 'linear',
                      angle: Math.round(wr() * 360),
                      stops: [
                        { pos: 0, paletteIndex: a },
                        { pos: 1, paletteIndex: b },
                      ],
                      animate: { angleSpeed: Math.round((wr() * 2 - 1) * 90 * w), shiftSpeed: 0 },
                    },
                  };
                } else beatPatch.color = { fill: { kind: 'palette', index: accentIdx[Math.floor(wr() * accentIdx.length)] } };
              }
              if (wr() < 0.4 * w) {
                const r = (a) => Math.round((wr() * 2 - 1) * a * w * 10) / 10;
                beatPatch.transform = { rotate: r(25), tiltX: r(20), tiltY: r(20) }; // degrees (the shader converts)
              }
              if (!beatPatch.hold && beatDuration >= 0.6 && wr() < 0.45 * w) {
                const hold =
                  w >= 0.5
                    ? SA.moods.weirdBeatHold(wr, axes, cueContext, accentHexes)
                    : { type: 'pulse', params: { amount: Math.round((0.06 + 0.1 * w) * 1000) / 1000, bpm: Math.round(bpm) }, enabled: true };
                if (hold) beatPatch.hold = [hold];
              }
              if (wr() < 0.3 * w) {
                const g = SA.moods.generate({ axes, seed: beatSeed * 7 + 3, direction, genre, context: cueContext }).style;
                if (g.enter) beatPatch.enter = g.enter;
                if (g.exit) beatPatch.exit = g.exit;
              }
              if (w >= 0.6 && wr() < 0.25 * w) {
                const fontId = SA.moods.weirdFont(wr, cueContext, themeStyle.text && themeStyle.text.fontId);
                if (fontId) beatPatch.text.fontId = fontId;
              }
            }
            projectDoc.beatStyles[beat.id] = SA.project.mergeDeep(projectDoc.beatStyles[beat.id] || {}, beatPatch);
          });
        });

        // gaps between the lyrics get their own animated shapes/patterns, so
        // the background keeps moving where there is no text (and the timeline
        // shows the filler clips)
        const kinds = {
          intro: { type: 'shapes', params: { set: 'burst', count: 22, speed: 1.1, opacity: 0.5 } },
          interlude: analysis
            ? { type: 'spectrum', params: { mode: 'bars', bars: 48, falloff: 1.1 } }
            : { type: 'particles', params: { count: 40, flow: 'drift', size: 3 } },
          outro: { type: 'pattern', params: { mode: 'rings', count: 18, size: 1.2, speed: 0.5, opacity: 0.4 } },
        };
        if (w > 0) {
          for (const spec of Object.values(kinds)) {
            const params = spec.params || {};
            if (typeof params.count === 'number') params.count = Math.round(params.count * (1 + w));
            if (typeof params.speed === 'number') params.speed = Math.round(params.speed * (1 + w) * 100) / 100;
          }
        }
        if (w >= 0.5) {
          // I19: a very weird song re-rolls the filler clips as well
          ['intro', 'interlude', 'outro'].forEach((key, k) => {
            const rolled = SA.moods.rerollClipSpec('filler', { axes, seed: seed + 31 * (k + 1), genre });
            if (rolled && rolled.spec) kinds[key] = rolled.spec;
          });
        }
        projectDoc.fillers = SA.project.mergeDeep(projectDoc.fillers || {}, {
          enabled: true,
          minGap: 0.8,
          margin: 0.15,
          byKind: kinds,
          longGap: { threshold: 5, spec: { type: 'pattern', params: { mode: 'grid', count: 36, size: 1, speed: 0.4, opacity: 0.35 } } },
        });

        // 3) the look now lives on the tracks: one background clip for the whole
        // song, a backdrop clip per section when the density axis asks for one,
        // and filler clips materialised from the gaps. Re-rolling replaces the
        // clips auto-direct owns, leaving subtitle and hand-made clips alone.
        const cues = projectDoc.script.cues || [];
        const total = cues.reduce((max, cue) => Math.max(max, Number(cue.end) || 0), 0);
        const trackIdFor = (kind) => {
          const track = (projectDoc.tracks || []).find((entry) => entry.kind === kind);
          return track ? track.id : null;
        };
        const managed = new Set(
          (projectDoc.tracks || []).filter((track) => ['background', 'backdrop', 'filler'].includes(track.kind)).map((track) => track.id)
        );
        projectDoc.clips = (projectDoc.clips || []).filter((clip) => !managed.has(clip.trackId));
        const bgTrack = trackIdFor('background');
        if (bgTrack && total > 0) {
          // the drawn look brings its own background clip; otherwise the axes
          // roll one (noise gradients preferred, flat gradients as the floor).
          // A weird song may roll an extended background primitive instead.
          const bgRng = SA.rng.rngFor(seed, 'bg', 'weird');
          const weirdBg = w >= 0.35 && bgRng() < w ? SA.moods.rerollClipSpec('background', { axes, seed: seed + 17, genre, weirdBg: true }) : null;
          const result = weirdBg || (lookClip ? null : SA.moods.rerollClipSpec('background', { axes, seed, genre }));
          const spec = weirdBg
            ? weirdBg.spec
            : lookClip || (result && result.spec && result.spec.type !== 'solid' && result.spec.type !== 'gradient' ? result.spec : { type: 'gradient', params: { scale: 1.2, speed: 0.1 } });
          projectDoc.clips.push({
            id: SA.project.nextClipId(projectDoc, 'clip_bg'),
            trackId: bgTrack,
            start: 0,
            end: total,
            spec,
            opacity: 1,
            fadeIn: 0.6,
            fadeOut: 0.6,
            colors: result && result.colors ? result.colors : null,
          });
        }
        const midTrack = trackIdFor('backdrop');
        if (midTrack && axes.density > 0.45 * (1 - w)) {
          cues.forEach((cue, index) => {
            const result = SA.moods.rerollClipSpec('backdrop', { axes, seed: seed + index * 977 + 3, genre, index: seed + index });
            if (!result) return;
            projectDoc.clips.push({
              id: SA.project.nextClipId(projectDoc, 'clip_mid'),
              trackId: midTrack,
              start: cue.start,
              end: cue.end,
              spec: result.spec,
              opacity: 0.9,
              fadeIn: 0.4,
              fadeOut: 0.4,
              colors: result.colors,
            });
          });
        }
        const fillerTrack = trackIdFor('filler');
        if (fillerTrack && SA.fillers) {
          const gaps = SA.fillers.gaps(cues, total, SA.fillers.settingsFor(projectDoc));
          for (const gap of gaps) {
            projectDoc.clips.push({
              id: SA.project.nextClipId(projectDoc, 'clip_filler'),
              trackId: fillerTrack,
              start: gap.from,
              end: gap.to,
              spec: JSON.parse(JSON.stringify(gap.spec || { type: 'none', params: {} })),
              opacity: 1,
              fadeIn: 0.3,
              fadeOut: 0.3,
              colors: null,
            });
          }
        }
      },
    });
    lastRandom = { scope: '__auto', seed, intensity: 2, locks: AUTO_DIRECT_LOCKS, lookN: look ? look.n : null };
    if (look) toast('studio.toast.autoDirectedLook', { seed, theme: themeName, look: `${look.n} ${look.name}` });
    else toast('studio.toast.autoDirected', { seed, theme: themeName });
  }

  function genreDialog() {
    const doc = project();
    if (!doc) return;
    el.dialogRoot.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    const list = (SA.genres && SA.genres.LIST) || [];
    const weird = SA.moods.projectWeird(doc);
    dialog.innerHTML = `
      <h3>${t('studio.genres.title')}</h3>
      <div class="field"><span>${t('studio.genres.pick')}</span>
        <select data-field="genre">
          <option value="__random">${t('studio.genres.random')}</option>
          ${list.map((genre) => `<option value="${genre.id}">${t(`studio.genres.${genre.id}`)}</option>`).join('')}
        </select>
      </div>
      <label class="axis-row"><span>${t('studio.themeEditor.axis.weird')}</span>
        <input type="range" min="0" max="1" step="0.05" data-field="weird" value="${weird}">
        <span class="axis-value" data-field="weird-value">${weird.toFixed(2)}</span>
      </label>
      <div class="insp-inherit axis-hint">${t('studio.themeEditor.axisHint.weird')}</div>
      <div class="dialog-actions">
        <button type="button" class="btn" data-action="cancel">${t('studio.dialog.script.cancel')}</button>
        <button type="button" class="btn btn-primary" data-action="apply">${t('studio.random.apply')}</button>
      </div>`;
    el.dialogRoot.appendChild(dialog);
    el.dialogRoot.hidden = false;
    const weirdInput = dialog.querySelector('[data-field="weird"]');
    weirdInput.addEventListener('input', () => {
      dialog.querySelector('[data-field="weird-value"]').textContent = Number(weirdInput.value).toFixed(2);
    });
    dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      el.dialogRoot.hidden = true;
    });
    dialog.querySelector('[data-action="apply"]').addEventListener('click', () => {
      const genre = dialog.querySelector('[data-field="genre"]').value;
      el.dialogRoot.hidden = true;
      autoDirect({ genre, weird: Number(weirdInput.value) });
    });
  }

  function randomDialog() {
    const doc = project();
    if (!doc) return;
    el.dialogRoot.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    dialog.innerHTML = `
      <h3>${t('studio.random.title')}</h3>
      <div class="field"><span>${t('studio.random.scope')}</span>
        <select data-field="scope">
          <option value="project">${t('studio.random.project')}</option>
          <option value="cues">${t('studio.random.cues')}</option>
          <option value="elements">${t('studio.random.elements')}</option>
        </select>
      </div>
      <div class="field"><span>${t('studio.random.seed')}</span><input type="number" data-field="seed" value="${lastRandom.seed}" /></div>
      <div class="field"><span>${t('studio.random.intensity')}</span><input type="number" min="1" max="3" data-field="intensity" value="${lastRandom.intensity}" /></div>
      <div class="lock-grid">${['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post']
        .map((group) => `<label><input type="checkbox" data-lock="${group}" />${t(`studio.inspector.${group}`)}</label>`)
        .join('')}<label><input type="checkbox" data-lock="bg" />${t('studio.inspector.sectionBg')}</label></div>
      <div class="dialog-actions">
        <button type="button" class="btn" data-action="cancel">${t('studio.dialog.script.cancel')}</button>
        <button type="button" class="btn btn-primary" data-action="apply">${t('studio.random.apply')}</button>
      </div>`;
    el.dialogRoot.appendChild(dialog);
    el.dialogRoot.hidden = false;
    dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      el.dialogRoot.hidden = true;
    });
    dialog.querySelector('[data-action="apply"]').addEventListener('click', () => {
      const scope = dialog.querySelector('[data-field="scope"]').value;
      const seed = Number(dialog.querySelector('[data-field="seed"]').value) || 1;
      const intensity = Number(dialog.querySelector('[data-field="intensity"]').value) || 1;
      const locks = lockedFromDialog(dialog);
      el.dialogRoot.hidden = true;
      runRandomize(scope, { seed, intensity, locks });
    });
  }

  function presetDialog() {
    const doc = project();
    if (!doc) return;
    el.dialogRoot.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    const themes = SA.themes.list();
    const options = (entries) => entries.map((theme) => `<option value="${theme.id}">${theme.name}</option>`).join('');
    dialog.innerHTML = `
      <h3>${t('studio.preset.title')}</h3>
      <div class="field"><span>${t('studio.preset.preset')}</span>
        <select data-field="preset">
          <optgroup label="${t('studio.themes.builtin')}">${options(themes.filter((theme) => theme.builtin))}</optgroup>
          <optgroup label="${t('studio.themes.mine')}">${options(themes.filter((theme) => !theme.builtin))}</optgroup>
        </select>
      </div>
      <div class="field"><span>${t('studio.random.scope')}</span>
        <select data-field="scope">
          <option value="project">${t('studio.random.project')}</option>
          <option value="cues">${t('studio.random.cues')}</option>
        </select>
      </div>
      <div class="dialog-actions">
        <button type="button" class="btn" data-action="cancel">${t('studio.dialog.script.cancel')}</button>
        <button type="button" class="btn btn-primary" data-action="apply">${t('studio.random.apply')}</button>
      </div>`;
    el.dialogRoot.appendChild(dialog);
    el.dialogRoot.hidden = false;
    dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      el.dialogRoot.hidden = true;
    });
    dialog.querySelector('[data-action="apply"]').addEventListener('click', () => {
      const theme = SA.themes.get(dialog.querySelector('[data-field="preset"]').value);
      const scope = dialog.querySelector('[data-field="scope"]').value;
      el.dialogRoot.hidden = true;
      if (!theme) return;
      if (scope === 'project') {
        SA.themes.apply(theme.id);
      } else {
        const selected = store.state.selection.paths || [];
        const cueIds = selected.length
          ? [...new Set(selected.map((path) => path.split('/')[0].replace('cue:', '')))]
          : project().script.cues.map((cue) => cue.id);
        for (const cueId of cueIds) SA.themes.apply(theme.id, { cueId });
      }
      toast('studio.toast.presetApplied', { name: theme.name });
    });
  }

  async function exportSrt() {
    const doc = project();
    if (!doc) return;
    const result = await SA.io.exportSrt(doc, false);
    if (result.canceled) toast('studio.toast.cancelled');
    else toast('studio.toast.srtExported', { path: result.filePath });
  }

  async function exportSrtBeats() {
    const doc = project();
    if (!doc) return;
    const result = await SA.io.exportSrtBeats(doc);
    if (result.canceled) toast('studio.toast.cancelled');
    else toast('studio.toast.srtExported', { path: result.filePath });
  }

  async function exportLyrics(format) {
    const doc = project();
    if (!doc) return;
    const result = await SA.io.exportLyrics(doc, format);
    if (result.canceled) toast('studio.toast.cancelled');
    else toast('studio.toast.lyricsExported', { path: result.filePath });
  }

  function newProject() {
    welcomeDismissed = false;
    SA.io.newProject({ lang: i18n.lang() });
    toast('studio.toast.newProject');
  }

  function openAchievements() {
    const doc = project();
    if (SA.platform && SA.platform.openHome) SA.platform.openHome(doc ? doc.dataset : null, i18n.lang());
    else window.location.href = 'index.html';
  }

  function setAspect(aspect) {
    if (!project()) return;
    store.commands.setOutput({ aspect });
    renderAll();
  }

  function togglePanel(name) {
    layout.panels[name] = !layout.panels[name];
    applyLayout();
    saveLayout();
    SA.menu.refresh();
    renderPreview();
  }

  function toggleConsole() {
    const open = SA.debugConsole.toggle();
    applyLayout();
    if (SA.preview) SA.preview.render();
    SA.menu.refresh();
    return open;
  }

  function setLanguage(code) {
    i18n.set(code);
    try {
      localStorage.setItem('sa.lang', code);
    } catch {
      /* ignore */
    }
    applyStaticText();
    SA.menu.build();
    renderAll();
    toast('studio.toast.languageChanged');
  }

  function toggleGuides() {
    store.setView({ guides: !store.state.view.guides });
  }

  function toggleSnapping() {
    store.setView({ snapping: !store.state.view.snapping });
  }

  function toggleAutoKey() {
    store.setAutoKey(!store.state.view.autoKey);
    SA.menu.refresh();
  }

  function toggleAutosave() {
    autosaveEnabled = !autosaveEnabled;
    if (autosaveEnabled) SA.io.startAutosave(project, 30);
    else SA.io.stopAutosave();
    SA.menu.refresh();
  }

  function bindEvents() {
    el.welcomeStart.addEventListener('click', () => {
      welcomeDismissed = true;
      renderPreview();
    });

    el.welcomeOpen.addEventListener('click', openProject);
    el.welcomeLyrics.addEventListener('click', importLyrics);
    el.tpStart.addEventListener('click', () => seek(0));
    el.tpEnd.addEventListener('click', () => seek(duration()));
    el.tpPrev.addEventListener('click', () => jumpCue(-1));
    el.tpNext.addEventListener('click', () => jumpCue(1));
    el.tpPlay.addEventListener('click', togglePlay);
    el.tpLoop.addEventListener('click', () => SA.preview.setLoop(!SA.preview.isLoop()));
    el.tpSpeed.addEventListener('change', () => SA.preview.setSpeed(Number(el.tpSpeed.value)));
    el.tpTime.addEventListener('click', editTime);
    el.tpAspect.addEventListener('click', () => setAspect(project() && project().output.aspect === '16:9' ? '9:16' : '16:9'));
    el.mediaTabs.info.addEventListener('click', () => setMediaTab('info'));
    el.mediaTabs.video.addEventListener('click', () => setMediaTab('video'));
    el.mediaTabs.audio.addEventListener('click', () => setMediaTab('audio'));
    el.videoImport.addEventListener('click', importVideoMedia);
    el.audioImport.addEventListener('click', async () => {
      await importAudio();
      setMediaTab('audio');
      refreshAudioVisual();
    });
    setupSplitter(el.splitMedia, 'media');
    setupSplitter(el.splitInspector, 'inspector');
    setupSplitter(el.splitTimeline, 'timeline');
    setupSplitter(el.splitConsole, 'console');
    if (el.autoDirect) {
      el.autoDirect.addEventListener('click', () => autoDirect());
      el.autoDirect.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        genreDialog();
      });
    }
    window.addEventListener('resize', () => applyLayout());
    document.addEventListener('keydown', (event) => {
      const target = event.target;
      const tag = target && target.tagName;
      // text fields keep their native undo; sliders / selects / buttons hand
      // Ctrl+Z to the project history (focus often stays on them after a drag)
      const textEntry =
        target &&
        (target.isContentEditable ||
          tag === 'TEXTAREA' ||
          (tag === 'INPUT' && ['text', 'search', 'number', 'email', 'url', 'tel', 'password'].includes(String(target.type || 'text').toLowerCase())));
      if (textEntry) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redoEdit();
        else undoEdit();
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redoEdit();
        return;
      }
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveProject();
        return;
      }
      if (mod && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        openProject();
        return;
      }
      if (mod && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        importProfile();
        return;
      }
      if (mod && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        SA.exportDialog.open();
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        togglePlay();
      } else if (event.key === 'ArrowLeft') {
        if (store.state.selection.paths.length) SA.overlay.nudge(event.shiftKey ? -10 : -1, 0);
        else stepFrame(-1, event.shiftKey);
      } else if (event.key === 'ArrowRight') {
        if (store.state.selection.paths.length) SA.overlay.nudge(event.shiftKey ? 10 : 1, 0);
        else stepFrame(1, event.shiftKey);
      } else if (event.key === 'ArrowUp') {
        if (store.state.selection.paths.length) SA.overlay.nudge(0, event.shiftKey ? -10 : -1);
        else jumpCue(-1);
      } else if (event.key === 'ArrowDown') {
        if (store.state.selection.paths.length) SA.overlay.nudge(0, event.shiftKey ? 10 : 1);
        else jumpCue(1);
      } else if (event.key === 'Home') {
        seek(0);
      } else if (event.key === 'End') {
        seek(duration());
      } else if (event.key === 's' || event.key === 'S') {
        splitAtPlayhead();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        const cue = currentCue();
        if (cue) store.commands.deleteCue(cue.id);
      } else if (event.key === 'Escape') {
        if (store.state.selection.paths.length) SA.inspector.cycleLevel(-1);
        else store.setSelection([], null);
        el.dialogRoot.hidden = true;
      }
    });
    store.subscribe('all', (state) => {
      const areas = Object.keys(state.version);
      const changed = areas.some((area) => state.version[area] !== lastVersions[area]);
      lastVersions = { ...state.version };
      if (changed) renderAll();
      else renderTransport();
    });
  }

  function menuHandlers() {
    return {
      newProject,
      openProject,
      openRecent,
      saveProject,
      saveProjectAs,
      undo: undoEdit,
      redo: redoEdit,
      importLyrics,
      importAudio,
      distributeCues,
      restructureBeats,
      randomStyle: () => runRandomize('project', {}),
      randomStyleCues: () => runRandomize('cues', {}),
      randomStyleElements: () => runRandomize('elements', {}),
      randomSettings: randomDialog,
      reroll,
      rerollColors,
      autoDirect,
      applyPreset: presetDialog,
      fitAudio,
      palettes: () => SA.colors.paletteDialog(),
      themes: () => SA.themes.dialog(),
      editTheme: () => SA.themeEditor.open(null),
      layers: () => SA.layersDialog.open(),
      audio: () => SA.audioDialog.open(),
      fonts: () => SA.fontsDialog.open(),
      credits: () => SA.creditsDialog.open(),
      exportSrt,
      exportSrtBeats,
      exportLyrics,
      exportVideo: () => SA.exportDialog.open(),
      openExport: () => SA.exportDialog.open(),
      setAspect,
      setScale: (mode) => SA.preview.setScale(mode),
      getScaleMode: () => SA.preview.getScaleMode(),
      setLanguage,
      togglePanel,
      setLayout,
      toggleGuides,
      toggleSnapping,
      toggleAutoKey,
      toggleConsole,
      isConsoleOpen: () => SA.debugConsole.isOpen(),
      isAutoKeyOn: () => !!store.state.view.autoKey,
      toggleAutosave,
      isAutosaveEnabled: () => autosaveEnabled,
      getAspect: () => (project() ? project().output.aspect : '16:9'),
      isPanelVisible: (name) => !!layout.panels[name],
      getLayout: () => layout.preset,
      areGuidesOn: () => !!store.state.view.guides,
      isSnappingOn: () => !!store.state.view.snapping,
    };
  }

  async function startup() {
    const boot = SA.boot || { set() {}, busy() {}, finish() {} };
    try {
      boot.set(6, 'studio.boot.loading', 16, 1500);
      cacheElements();
      if (SA.debugConsole) SA.debugConsole.init();
      loadLayout();
      applyLayout();
      i18n.set(localStorage.getItem('sa.lang') || i18n.detect());
      applyStaticText();
      boot.set(16, 'studio.boot.interface', 34, 3000);
      bindEvents();
      SA.preview.init();
      SA.timeline.init();
      SA.inspector.init();
      SA.overlay.init();
      SA.menu.init({ handlers: menuHandlers() });
      platform.recent.list().then(SA.menu.setRecent).catch(() => {});
      boot.set(34, 'studio.boot.preview', 58, 3000);

      let handoff = null;
      if (!platform.isElectron) {
        if (window.location.hash === '#handoff') handoff = await platform.readHandoff();
      } else {
        const payload = await Promise.race([
          platform.waitForHandoff(),
          new Promise((resolve) => setTimeout(() => resolve(null), 900)),
        ]);
        if (payload && payload.cues) handoff = { cues: payload.cues, lang: payload.lang };
      }

      let projectDoc = null;
      if (handoff && handoff.cues) {
        projectDoc = SA.project.create({ lang: handoff.lang || i18n.lang(), aspect: '16:9' });
        projectDoc.script.cues = handoff.cues.map((cue) => ({ ...cue }));
      } else {
        projectDoc = await SA.io.loadAutosave();
      }

      boot.set(58, 'studio.boot.project', 74, 3000);
      if (projectDoc) {
        store.load(projectDoc);
      } else {
        SA.io.newProject({ lang: i18n.lang() });
      }
      if (SA.textflow && store.state.project) SA.textflow.apply(store.state.project);
      SA.io.startAutosave(project, autosaveEnabled ? 30 : 999999);
      boot.set(74, 'studio.boot.fonts', 96, 20000);
      renderAll();
      // fonts decide what the preview can draw: wait until every request has
      // settled (a textflow pass can start a second one) before revealing the
      // app, so parsed metrics are never shown mid-change. The 30 s cap is only
      // a safety net for a hung asset read; a failed load resolves on its own.
      if (boot.busy) boot.busy(true);
      const deadline = Date.now() + 30000;
      let fonts = SA.preview && SA.preview.whenFontsReady ? SA.preview.whenFontsReady() : null;
      while (fonts) {
        const remaining = Math.max(0, deadline - Date.now());
        await Promise.race([Promise.resolve(fonts).catch(() => {}), new Promise((resolve) => setTimeout(resolve, remaining))]);
        const next = SA.preview && SA.preview.whenFontsReady ? SA.preview.whenFontsReady() : null;
        if (!next || next === fonts || Date.now() >= deadline) break;
        fonts = next;
      }
      if (boot.busy) boot.busy(false);
      boot.set(96);
      renderAll();
    } catch (error) {
      console.error('studio startup failed', error);
    } finally {
      boot.finish();
    }
  }

  window.SA.studio = { startup, renderAll, toast, toggleConsole };
  startup();
})();
