(() => {
  'use strict';

  const i18n = SA.i18n;
  const store = SA.store;
  const platform = SA.platform;
  const LS_KEY = 'sa.studio.layout';
  const MIN = { media: 200, inspector: 280, timeline: 140, preview: 150, console: 200 };

  const el = {};
  let layout = { mediaW: 260, inspectorW: 340, timelineH: 240, consoleW: 360, panels: { media: true, inspector: true, timeline: true }, preset: 'standard' };
  let autosaveEnabled = true;
  // stateful figures (simulations): off by default, remembered across sessions
  const LS_STATEFUL = 'sa.stateful';
  let statefulEnabled = false;
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
    el.bpm = document.getElementById('media-bpm');
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
    el.rerollColors = document.getElementById('tl-reroll-colors');
    el.vary = document.getElementById('tl-vary');
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

  // The tempo the beats follow: the one informed in Settings → Song, else the
  // one measured from the loaded audio, else nothing yet.
  function tempoLabel() {
    const doc = project();
    const own = SA.project.bpmOf(doc);
    if (own > 0) return String(Math.round(own * 10) / 10);
    const analysis = SA.preview && SA.preview.getAudioAnalysis ? SA.preview.getAudioAnalysis() : null;
    const features = analysis && SA.audioAnalysis ? SA.audioAnalysis.features(analysis) : null;
    const detected = Number(features && features.bpm);
    if (Number.isFinite(detected) && detected > 0) return `${Math.round(detected * 10) / 10} ${t('song.auto')}`;
    return '—';
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

  // Generation (random look, script, randomize) runs on the main thread and
  // can hold it for seconds. `withBusy` puts up a modal progress dialog first,
  // lets it paint, then runs the work; `step(key, fraction)` updates the label
  // and yields a frame so each stage shows. The bar's shimmer is a compositor
  // animation, so it keeps moving through the blocking parts. A second request
  // while one is running is ignored (double clicks on ✨ / Re-roll).
  let busyRoot = null;
  let busyRunning = false;

  function nextPaint() {
    return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  }

  function busyDialog() {
    if (busyRoot) return busyRoot;
    busyRoot = document.createElement('div');
    busyRoot.className = 'dialog-backdrop busy-backdrop';
    busyRoot.hidden = true;
    busyRoot.setAttribute('role', 'alertdialog');
    busyRoot.setAttribute('aria-busy', 'true');
    busyRoot.innerHTML = `
      <div class="dialog busy-dialog">
        <h3 data-field="title"></h3>
        <div class="busy-bar"><div class="busy-fill" data-field="fill"></div></div>
        <div class="busy-status" data-field="status" aria-live="polite"></div>
      </div>`;
    document.body.appendChild(busyRoot);
    return busyRoot;
  }

  async function withBusy(titleKey, work) {
    if (busyRunning) return undefined;
    busyRunning = true;
    const root = busyDialog();
    const fill = root.querySelector('[data-field="fill"]');
    const status = root.querySelector('[data-field="status"]');
    root.querySelector('[data-field="title"]').textContent = t(titleKey);
    status.textContent = '';
    fill.style.transform = 'scaleX(0.04)';
    root.hidden = false;
    const step = async (key, fraction) => {
      status.textContent = key ? t(key) : '';
      if (fraction != null) fill.style.transform = `scaleX(${Math.max(0.04, Math.min(1, fraction))})`;
      await nextPaint();
    };
    try {
      await nextPaint();
      const result = await work(step);
      // the first preview frame after a big change (fonts, physics warm-up) is
      // often the slowest part: keep the dialog up through it
      await step('studio.busy.render', 1);
      await nextPaint();
      return result;
    } finally {
      root.hidden = true;
      busyRunning = false;
    }
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
    el.bpm.textContent = tempoLabel();
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
      const track = document.createElement('button');
      track.type = 'button';
      track.className = 'btn btn-mini';
      track.textContent = t('studio.track.video');
      track.addEventListener('click', () => addVideoLayer(entry, 'video'));
      actions.appendChild(bg);
      actions.appendChild(fg);
      actions.appendChild(track);
      actions.appendChild(remove);
      item.appendChild(actions);
      el.videoList.appendChild(item);
      videoThumbnail(entry, canvas);
    }
  }

  function addVideoLayer(entry, slot) {
    if (!entry) return;
    const layer = SA.layersDialog.defaults(slot);
    if (slot === 'video') {
      // the selected video track, else the first one, else a new one
      const doc = SA.store.state.project;
      const selected = (SA.store.state.selection.paths || []).map((path) => /^track:(.+)$/.exec(path)).filter(Boolean).map((match) => match[1]);
      const tracks = ((doc && doc.tracks) || []).filter((entry) => entry && entry.kind === 'video');
      const target = tracks.find((entry) => selected.includes(entry.id)) || tracks[0];
      layer.trackId = target ? target.id : SA.store.commands.addTrack('video');
      if (!layer.trackId) return;
    }
    layer.type = 'video';
    layer.src = entry.src;
    layer.fit = 'cover';
    layer.color = '#ffffff';
    if (entry.width && entry.height) layer.video = { speed: 1, offset: 0, play: true, loop: true };
    SA.store.commands.addLayer(layer);
    toast('studio.media.layerAdded', { name: entry.name || '' });
  }

  async function loadVideoBlob(blob, name, mimeType) {
    const src = URL.createObjectURL(blob);
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
      name: name || 'video',
      mime: mimeType || 'video/mp4',
      src,
      duration: meta && meta.duration,
      width: meta && meta.width,
      height: meta && meta.height,
    };
    SA.store.commands.addMedia({ ...entry, kind: 'videos' });
    const currentDoc = project();
    if (!(currentDoc.layers || []).some((l) => l && l.type === 'video')) {
      addVideoLayer(entry, 'background');
    }
    setMediaTab('video');
    renderTimeline();
    if (SA.timeline && typeof SA.timeline.draw === 'function') SA.timeline.draw();
    toast('studio.media.videoImported', { name: entry.name });
    return entry;
  }

  async function importVideoMedia() {
    try {
      const picked = await platform.readFile('.mp4,.webm,.mov,video/mp4,video/webm');
      if (!picked || !picked.bytes) return;
      const extension = String(picked.name || '').split('.').pop().toLowerCase();
      const mime = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' }[extension] || picked.type || 'video/mp4';
      await loadVideoBlob(new Blob([picked.bytes], { type: mime }), picked.name, mime);
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
    dialog.querySelector('[data-action="generate"]').addEventListener('click', async () => {
      const maxDurationValue = field('maxDuration').value.trim();
      el.dialogRoot.hidden = true;
      let cues = [];
      const done = await withBusy('studio.busy.script', async (step) => {
        await step('studio.busy.apply', 0.3);
        // output + script + fit-to-duration are one user action: one undo step
        store.beginTransaction('generate script');
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
        return true;
      }).catch(() => {
        toast('studio.toast.error');
        return false;
      });
      if (done) toast('studio.toast.scriptGenerated', { n: cues.length });
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

  async function showcaseProject() {
    try {
      const buffer = await SA.platform.readAsset('data/showcase.json');
      const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
      SA.io.loadFromObject(localizeShowcase(JSON.parse(text)));
      welcomeDismissed = false;
      toast('studio.toast.opened');
    } catch {
      toast('studio.toast.invalidProject');
    }
  }

  // The effects showcase is generated in Japanese, so its cue labels and
  // section markers are re-written in the language on screen: every effect cue
  // carries `{ kind: 'showcase', group, type, family?, target? }`, the effect
  // name comes from the same `fx.*` table the inspector reads, and the walk
  // scaffolding (group / post-family / text-vs-frame / page marker) from
  // `studio.showcase.*`. Markers are rebuilt from the cue order so they stay
  // in step with the cues in every language.
  function showcaseLabel(key, fallback) {
    const label = i18n.t(key);
    if (typeof label !== 'string' || label === key || !label.trim()) return fallback;
    return label;
  }

  function showcaseTypeName(group, type) {
    const base = SA.fx && typeof SA.fx.baseOf === 'function' ? SA.fx.baseOf(group) : group;
    const key = `fx.${base}.${type}`;
    const translated = i18n.t(key);
    if (typeof translated === 'string' && translated !== key && translated.trim()) return translated;
    return type;
  }

  function showcaseCueText(meta) {
    const groupLabel = showcaseLabel(`studio.showcase.group.${meta.group}`, meta.group);
    const typeName = showcaseTypeName(meta.group, meta.type);
    if (meta.group === 'post' && meta.family) {
      const familyLabel = showcaseLabel(`studio.showcase.family.${meta.family}`, meta.family);
      const targetLabel = showcaseLabel(`studio.showcase.target.${meta.target || 'text'}`, meta.target || 'text');
      return `${groupLabel}［${familyLabel}/${targetLabel}］ ${typeName} / ${meta.type}`;
    }
    return `${groupLabel} / ${typeName} / ${meta.type}`;
  }

  function localizeShowcase(doc) {
    const cues = (doc && doc.script && doc.script.cues) || [];
    for (const cue of cues) {
      const meta = cue && cue.meta;
      if (!meta || meta.kind !== 'showcase' || !meta.group || !meta.type) continue;
      cue.text = showcaseCueText(meta);
    }
    const markers = [];
    let lastGroup = null;
    let lastFamily = null;
    for (const cue of cues) {
      const meta = cue && cue.meta;
      if (!meta) continue;
      if (meta.kind === 'page') {
        if (lastGroup !== 'page') {
          lastGroup = 'page';
          lastFamily = null;
          markers.push({ t: cue.start, label: `${showcaseLabel('studio.showcase.page', '紙面レイアウト')} (page)` });
        }
      } else if (meta.kind === 'showcase') {
        if (meta.group === 'post') {
          if (meta.family !== lastFamily || lastGroup !== 'post') {
            lastGroup = 'post';
            lastFamily = meta.family || null;
            const groupLabel = showcaseLabel('studio.showcase.group.post', '後処理');
            const familyLabel = showcaseLabel(`studio.showcase.family.${meta.family}`, meta.family);
            markers.push({ t: cue.start, label: `${groupLabel}［${familyLabel}］ (post/${meta.family})` });
          }
        } else {
          lastFamily = null;
          if (meta.group !== lastGroup) {
            lastGroup = meta.group;
            markers.push({ t: cue.start, label: `${showcaseLabel(`studio.showcase.group.${meta.group}`, meta.group)} (${meta.group})` });
          }
        }
      }
    }
    if (markers.length) doc.markers = markers;
    return doc;
  }

  // The figure showcase is generated in Japanese, so its cue labels are
  // re-written in the language on screen: every cue carries the i18n namespace
  // and value its name lives under (`studio.figure.<namespace>.<value>`), which
  // is the same table the Studio's own figure labels come from.
  function localizeFigureShowcase(doc) {
    const cues = (doc && doc.script && doc.script.cues) || [];
    for (const cue of cues) {
      const meta = cue && cue.meta;
      if (!meta || meta.kind !== 'figure-showcase' || !meta.namespace || !meta.value) continue;
      const key = `studio.figure.${meta.namespace}.${meta.value}`;
      const label = i18n.t(key);
      if (typeof label !== 'string' || label === key || !label.trim()) continue;
      cue.text = `${meta.index}. ${label} / ${meta.value}`;
    }
    return doc;
  }

  // Four of the motifs are GPU simulations, and those sit behind Settings ->
  // "Allow stateful effects" (off by default, because a stateful figure needs the
  // frames before it). Showing them is the whole point of this walk, so the gate
  // is opened for the session only - the stored preference is left alone, and the
  // menu tick plus a toast say why the setting is on.
  function openStatefulGateForShowcase() {
    if (!SA.figures || typeof SA.figures.isStatefulAllowed !== 'function') return false;
    if (SA.figures.isStatefulAllowed()) return false;
    statefulEnabled = true;
    applyStateful();
    if (SA.menu && typeof SA.menu.refresh === 'function') SA.menu.refresh();
    return true;
  }

  // the figure track's own showcase: every motif and every motion axis, one cue
  // each. Same shape as the effects showcase, a different generated asset.
  async function figureShowcaseProject() {
    try {
      const buffer = await SA.platform.readAsset('data/figure-showcase.json');
      const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
      SA.io.loadFromObject(localizeFigureShowcase(JSON.parse(text)));
      const opened = openStatefulGateForShowcase();
      welcomeDismissed = false;
      toast('studio.toast.opened');
      if (opened) toast('studio.toast.statefulOn');
    } catch {
      toast('studio.toast.invalidProject');
    }
  }

  // the backdrop's own showcase: one cue per accent type, split layout and
  // clip motion, all on the `mid` track. The type ids are
  // language-independent, so no re-labelling is needed (same shape as the
  // font showcase).
  async function backdropShowcaseProject() {
    try {
      const buffer = await SA.platform.readAsset('data/backdrop-showcase.json');
      const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
      SA.io.loadFromObject(JSON.parse(text));
      welcomeDismissed = false;
      toast('studio.toast.opened');
    } catch {
      toast('studio.toast.invalidProject');
    }
  }

  // the bundled typefaces' own showcase: one cue per font, the cue style pins
  // `text.fontId` (and its weight) so neighbouring cues differ only in the
  // typeface. The family names and ids are language-independent, so no
  // re-labelling is needed.
  async function fontShowcaseProject() {
    try {
      const buffer = await SA.platform.readAsset('data/font-showcase.json');
      const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
      SA.io.loadFromObject(JSON.parse(text));
      welcomeDismissed = false;
      toast('studio.toast.opened');
    } catch {
      toast('studio.toast.invalidProject');
    }
  }

  // the ease curves' own showcase: one cue per named curve and parametric
  // recipe on the same slide entrance, plus one cue per lyric slot that
  // accepts an ease. The ease ids are language-independent, so no
  // re-labelling is needed (same shape as the font showcase).
  async function easeShowcaseProject() {
    try {
      const buffer = await SA.platform.readAsset('data/ease-showcase.json');
      const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
      SA.io.loadFromObject(JSON.parse(text));
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
    else {
      toast('studio.toast.audioImported', { name: result.name });
      setMediaTab('audio');
      refreshAudioVisual();
      if (SA.store && SA.store.commands && SA.store.commands.addMedia) {
        SA.store.commands.addMedia({
          id: 'audio',
          kind: 'audio',
          name: result.name,
        });
      }
      if (SA.timeline && typeof SA.timeline.draw === 'function') SA.timeline.draw();
      renderTimeline();
    }
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

  async function runRandomize(scope, options) {
    const doc = project();
    if (!doc || busyRunning) return;
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
    try {
      await withBusy('studio.busy.random', async (step) => {
        await step('studio.busy.apply', 0.5);
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
      });
    } catch {
      toast('studio.toast.error');
      return;
    }
    toast('studio.toast.randomized', { seed: lastRandom.seed });
  }

  function reroll() {
    if (busyRunning) return;
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
    const rawWeird = SA.weird.raw(options.axes && options.axes.weird);
    const weird = SA.weird.text(rawWeird);
    const out = {};
    if (!(weird > 0) || !pool) return out;
    const random = SA.rng.rngFor(options.seed, 'looks', 'weird');
    const used = new Set([options.songLook]);
    // I17: a very weird song lets a cue's look also move the text
    const groups = weird >= 0.8 ? [...SA.direct.CUE_LOOK_GROUPS, 'layout', 'location'] : SA.direct.CUE_LOOK_GROUPS;
    cues.forEach((cue, index) => {
      if (random() >= weird) return;
      const entry = pool.pick({ axes: options.axes, genre: options.genre, seed: options.seed + (index + 1) * 7919, exclude: used });
      if (!entry) return;
      used.add(entry.n);
      const expanded = pool.expand(entry.style);
      SA.moods.tameGlow(expanded, rawWeird);
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
  async function rerollColors() {
    if (!project()) return;
    let palette = null;
    try {
      await withBusy('studio.busy.colors', async (step) => {
        await step('studio.busy.apply', 0.5);
        palette = store.commands.rerollPalette('project');
      });
    } catch {
      toast('studio.toast.error');
      return;
    }
    if (palette) toast('studio.toast.colorsRerolled', { theme: palette.name || palette.id || '' });
  }

  // timeline Vary: the whole song in one undo, behind the progress bar
  async function varyAll() {
    if (!project()) return;
    try {
      await withBusy('studio.busy.vary', async (step) => {
        await step('studio.busy.apply', 0.5);
        store.commands.varyAll();
      });
    } catch {
      toast('studio.toast.error');
    }
  }

  async function autoDirect(options) {
    const doc = project();
    if (!doc) return;
    if (!doc.script.cues.length) {
      toast('studio.toast.noCues');
      return;
    }
    try {
      await withBusy('studio.busy.autoDirect', (step) => autoDirectWork(options, step));
    } catch {
      toast('studio.toast.error');
    }
  }

  async function autoDirectWork(options, step) {
    const doc = project();
    const opts = options || {};
    if (!doc) return;
    const mode = (doc && doc.styleMode) || {};
    const typeWeights = opts.typeWeights !== undefined ? opts.typeWeights : mode.typeWeights;
    const params = opts.params !== undefined ? opts.params : mode.params;
    const usePalettes = opts.usePalettes !== undefined ? opts.usePalettes : mode.usePalettes;
    // genre first: an explicit genre, a random one, or the music's own axes
    const analysis = SA.preview.getAudioAnalysis ? SA.preview.getAudioAnalysis() : null;
    const explicitGenre = opts.genre && opts.genre !== '__random' ? opts.genre : (opts.genre === '__random' ? null : mode.genre || null);
    const picked = SA.moods.randomGenre ? SA.moods.randomGenre() : SA.moods.randomAxes();
    const genre = explicitGenre || picked.genre || null;
    let axes;
    let direction = 'horizontal';
    if (analysis && !explicitGenre) {
      axes = SA.moods.axesFromAudio(SA.audioAnalysis.features(analysis));
    } else {
      axes = mode.axes ? { ...picked.axes, ...mode.axes } : picked.axes;
      direction = opts.direction || mode.direction || picked.direction;
    }
    // weird, smartness and fear are never derived from a genre or the music:
    // they are the user's choices (genre dialog / theme editor) and stick to
    // the project across re-rolls. A project that never chose them opens at the
    // UI defaults (weird 0.7, smartness 0.6, fear 0).
    const weirdSource = opts.weird != null ? opts.weird : SA.moods.projectWeird(doc);
    const smartSource = opts.smartness != null ? opts.smartness : SA.moods.projectSmartness(doc);
    const fearSource = opts.fear != null ? opts.fear : SA.moods.projectFear(doc);
    axes = {
      ...axes,
      weird: SA.moods.weirdOf({ weird: weirdSource }),
      smartness: SA.moods.smartOf({ smartness: smartSource }),
      fear: SA.moods.fearOf({ fear: fearSource }),
    };
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
      await step('studio.busy.looks', 0.15);
      const pool = SA.looks && SA.looks.load ? await SA.looks.load() : null;
      if (pool) {
        const entry = pool.pick({ axes, genre: lookGenre, seed, exclude: opts.exclude, typeWeights });
        if (entry) {
          await step('studio.busy.compose', 0.4);
          const composed = pool.compose(entry, { axes, seed, genre: lookGenre, direction, context, typeWeights, params });
          look = composed.look;
          lookClip = composed.clip;
          themeStyle = composed.style;
          // Composition mode (below) draws one picture per beat from
          // SA.compositions; the per-cue looks would fight it, so they are not
          // drawn. The weird axis still widens the allowed compositions.
          cueLooks = {};
        }
      }
    } catch (error) {
      look = null;
      lookClip = null;
      themeStyle = null;
      cueLooks = {};
    }
    if (!themeStyle) {
      await step('studio.busy.compose', 0.4);
      themeStyle = SA.moods.generate({ axes, seed, direction, genre, context, ensureSignature: true, typeWeights, params }).style;
    }
    await step('studio.busy.apply', 0.7);
    const themeName = (themeStyle.palette && (themeStyle.palette.name || themeStyle.palette.id)) || '';
    // hand the run to SA.direct: it owns the size band, the palette patches,
    // the filler settings and the clips the automatic direction replaces. In
    // composition mode the per-beat picture comes from SA.compositions.
    const ctx = SA.direct.prepare(doc, {
      axes,
      seed,
      genre,
      direction,
      look,
      lookClip,
      themeStyle,
      cueLooks,
      analysis,
      compose: true,
      params,
      typeWeights,
      usePalettes,
      // section following is off unless the dialog asked for it (a plain
      // "random look" keeps the classic one-axes-for-the-song run)
      sections: opts.sections ? { gap: opts.sections.gap, maxCues: opts.sections.maxCues, strength: opts.sections.strength } : null,
    });
    store.dispatch({
      label: 'auto direct',
      // the run also rewrites the filler settings and places the gap clips
      areas: ['script', 'style', 'fillers'],
      do: (projectDoc) => SA.direct.run(projectDoc, ctx),
    });
    // Generate also re-rolls the colours: a new palette inside the project's
    // axes, with every literal colour moved onto it
    await step('studio.busy.colors', 0.9);
    store.commands.rerollPalette('project');
    lastRandom = { scope: '__auto', seed, intensity: 2, locks: SA.direct.AUTO_DIRECT_LOCKS, lookN: look ? look.n : null };
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
    const smartness = SA.moods.projectSmartness(doc);
    const fear = SA.moods.projectFear(doc);
    const resolvedProfile = SA.genParams ? SA.genParams.resolve({ axes: (doc.styleMode && doc.styleMode.axes) || {} }) : null;
    const sizeCenter = resolvedProfile && resolvedProfile.sizeCenter != null ? resolvedProfile.sizeCenter : 0.6;
    let sizeTouched = false;
    // section following: on by default in the dialog, but a run only follows the
    // sections when it is asked to (autoDirect defaults to off)
    const savedSections = (doc.styleMode && doc.styleMode.sections) || null;
    const sectionGap = savedSections && Number(savedSections.gap) > 0 ? Number(savedSections.gap) : SA.sections ? SA.sections.DEFAULT_GAP : 2;
    const sectionMaxCues = savedSections && Number(savedSections.maxCues) > 0 ? Number(savedSections.maxCues) : SA.sections ? SA.sections.DEFAULT_MAX_CUES : 4;
    const sectionStrength = savedSections && Number(savedSections.strength) > 0 ? Number(savedSections.strength) : 1;
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
      <label class="axis-row"><span>${t('studio.themeEditor.axis.smartness')}</span>
        <input type="range" min="0" max="1" step="0.05" data-field="smartness" value="${smartness}">
        <span class="axis-value" data-field="smartness-value">${smartness.toFixed(2)}</span>
      </label>
      <div class="insp-inherit axis-hint">${t('studio.themeEditor.axisHint.smartness')}</div>
      <label class="axis-row"><span>${t('studio.themeEditor.axis.fear')}</span>
        <input type="range" min="0" max="1" step="0.05" data-field="fear" value="${fear}">
        <span class="axis-value" data-field="fear-value">${fear.toFixed(2)}</span>
      </label>
      <div class="insp-inherit axis-hint">${t('studio.themeEditor.axisHint.fear')}</div>
      <label class="axis-row"><span>${t('studio.themeEditor.param.sizeCenter')}</span>
        <input type="range" min="0" max="1" step="0.05" data-field="size-center" value="${sizeCenter}">
        <span class="axis-value" data-field="size-center-value">${Number(sizeCenter).toFixed(2)}</span>
      </label>
      <label class="axis-row"><span>${t('studio.genres.sections.title')}</span>
        <input type="checkbox" data-field="sections" checked>
      </label>
      <div class="insp-inherit axis-hint">${t('studio.genres.sections.hint')}</div>
      <label class="axis-row" data-sections-only><span>${t('studio.genres.sections.gap')}</span>
        <input type="range" min="0.5" max="6" step="0.1" data-field="sections-gap" value="${sectionGap}">
        <span class="axis-value" data-field="sections-gap-value">${sectionGap.toFixed(1)}</span>
      </label>
      <label class="axis-row" data-sections-only><span>${t('studio.genres.sections.maxCues')}</span>
        <input type="range" min="2" max="8" step="1" data-field="sections-max" value="${sectionMaxCues}">
        <span class="axis-value" data-field="sections-max-value">${sectionMaxCues}</span>
      </label>
      <label class="axis-row" data-sections-only><span>${t('studio.genres.sections.strength')}</span>
        <input type="range" min="0" max="2" step="0.05" data-field="sections-strength" value="${sectionStrength}">
        <span class="axis-value" data-field="sections-strength-value">${sectionStrength.toFixed(2)}</span>
      </label>
      <div class="dialog-actions">
        <button type="button" class="btn" data-action="cancel">${t('studio.dialog.script.cancel')}</button>
        <button type="button" class="btn btn-primary" data-action="apply">${t('studio.random.apply')}</button>
      </div>`;
    el.dialogRoot.appendChild(dialog);
    el.dialogRoot.hidden = false;
    // the section sliders only exist while the checkbox is on
    const sectionRows = Array.from(dialog.querySelectorAll('[data-sections-only]'));
    const sectionsInput = dialog.querySelector('[data-field="sections"]');
    const syncSections = () => {
      for (const row of sectionRows) row.hidden = !sectionsInput.checked;
    };
    sectionsInput.addEventListener('change', syncSections);
    syncSections();
    const weirdInput = dialog.querySelector('[data-field="weird"]');
    weirdInput.addEventListener('input', () => {
      dialog.querySelector('[data-field="weird-value"]').textContent = Number(weirdInput.value).toFixed(2);
    });
    const smartInput = dialog.querySelector('[data-field="smartness"]');
    smartInput.addEventListener('input', () => {
      dialog.querySelector('[data-field="smartness-value"]').textContent = Number(smartInput.value).toFixed(2);
    });
    const fearInput = dialog.querySelector('[data-field="fear"]');
    fearInput.addEventListener('input', () => {
      dialog.querySelector('[data-field="fear-value"]').textContent = Number(fearInput.value).toFixed(2);
    });
    const sizeInput = dialog.querySelector('[data-field="size-center"]');
    sizeInput.addEventListener('input', () => {
      sizeTouched = true;
      dialog.querySelector('[data-field="size-center-value"]').textContent = Number(sizeInput.value).toFixed(2);
    });
    const sectionGapInput = dialog.querySelector('[data-field="sections-gap"]');
    sectionGapInput.addEventListener('input', () => {
      dialog.querySelector('[data-field="sections-gap-value"]').textContent = Number(sectionGapInput.value).toFixed(1);
    });
    const sectionMaxInput = dialog.querySelector('[data-field="sections-max"]');
    sectionMaxInput.addEventListener('input', () => {
      dialog.querySelector('[data-field="sections-max-value"]').textContent = String(Math.round(Number(sectionMaxInput.value)));
    });
    const sectionStrengthInput = dialog.querySelector('[data-field="sections-strength"]');
    sectionStrengthInput.addEventListener('input', () => {
      dialog.querySelector('[data-field="sections-strength-value"]').textContent = Number(sectionStrengthInput.value).toFixed(2);
    });
    dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      el.dialogRoot.hidden = true;
    });
    dialog.querySelector('[data-action="apply"]').addEventListener('click', () => {
      const genre = dialog.querySelector('[data-field="genre"]').value;
      el.dialogRoot.hidden = true;
      autoDirect({
        genre,
        weird: Number(weirdInput.value),
        smartness: Number(smartInput.value),
        fear: Number(fearInput.value),
        params: sizeTouched ? { sizeCenter: Number(sizeInput.value) } : undefined,
        sections: sectionsInput.checked
          ? {
              gap: Number(sectionGapInput.value),
              maxCues: Math.round(Number(sectionMaxInput.value)),
              strength: Number(sectionStrengthInput.value),
            }
          : null,
      });
    });
  }

  // Help > About: the app version (package.json via the main process) and the
  // data file format version (project.js VERSION) the saved files carry.
  async function aboutDialog() {
    let appVersion = '1.0.20261006';
    let runtime = '';
    try {
      const reply = window.sunoApi && window.sunoApi.appInfo ? await window.sunoApi.appInfo() : null;
      const info = reply && (reply.data || reply.result || reply.value || reply);
      if (info && info.version) appVersion = info.version;
      if (info && info.electron) runtime = `Electron ${info.electron} / Chromium ${info.chrome}`;
    } catch {
      // keep the placeholder
    }
    const dataVersion = SA.project && SA.project.VERSION != null ? SA.project.VERSION : '-';
    el.dialogRoot.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    dialog.innerHTML = `
      <h3>${t('studio.about.title')}</h3>
      <div class="field"><span>${t('studio.about.app')}</span><strong>${appVersion}</strong></div>
      <div class="field"><span>${t('studio.about.data')}</span><strong>${dataVersion}</strong></div>
      <div class="dialog-hint">developed by 2nek and SIs</div>
      ${runtime ? `<div class="field"><span></span><small>${runtime}</small></div>` : ''}
      <div class="dialog-actions">
        <button type="button" class="btn btn-primary" data-action="ok">${t('studio.about.ok')}</button>
      </div>`;
    el.dialogRoot.appendChild(dialog);
    el.dialogRoot.hidden = false;
    dialog.querySelector('[data-action="ok"]').addEventListener('click', () => {
      el.dialogRoot.hidden = true;
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

  // Data-level: every subtitle track's `bgHidden` flag, one undo step. The
  // background shapes themselves are kept.
  function subtitleTracks(doc) {
    return ((doc && doc.tracks) || []).filter((track) => track && track.kind === 'subtitle');
  }

  function toggleSubtitleBackgrounds() {
    const doc = project();
    if (!doc) return;
    const tracks = subtitleTracks(doc);
    if (!tracks.length) return;
    const hidden = tracks.every((track) => track.bgHidden);
    store.commands.setSubtitleBackgroundsHidden(!hidden);
    SA.menu.refresh();
  }

  function areSubtitleBackgroundsOn() {
    const tracks = subtitleTracks(project());
    return tracks.length ? tracks.some((track) => !track.bgHidden) : true;
  }

  // Display-only preview view (never saved, never exported).
  function toggleSubtitleOnly() {
    store.setView({ subtitleOnly: !store.state.view.subtitleOnly });
    if (SA.preview) SA.preview.render();
    SA.menu.refresh();
  }

  function applyStateful() {
    if (SA.figures && typeof SA.figures.setStatefulAllowed === 'function') SA.figures.setStatefulAllowed(statefulEnabled);
  }

  function toggleStateful() {
    statefulEnabled = !statefulEnabled;
    try {
      localStorage.setItem(LS_STATEFUL, statefulEnabled ? '1' : '0');
    } catch (error) {
      // the preference just stays for this session
    }
    applyStateful();
    if (SA.preview) SA.preview.render();
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
    // the badge cycles 16:9 -> 3:2 -> 9:16
    el.tpAspect.addEventListener('click', () => {
      const order = ['16:9', '3:2', '16:10', '9:16', '19.5:9'];
      const current = order.indexOf(project() ? project().output.aspect : '16:9');
      setAspect(order[(current + 1) % order.length]);
    });
    el.mediaTabs.info.addEventListener('click', () => setMediaTab('info'));
    el.mediaTabs.video.addEventListener('click', () => setMediaTab('video'));
    el.mediaTabs.audio.addEventListener('click', () => setMediaTab('audio'));
    el.videoImport.addEventListener('click', importVideoMedia);
    el.audioImport.addEventListener('click', importAudio);
    if (el.mediaPanes && el.mediaPanes.audio) {
      el.mediaPanes.audio.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      });
      el.mediaPanes.audio.addEventListener('drop', (event) => {
        const transfer = event.dataTransfer;
        if (!transfer || !transfer.files || !transfer.files.length) return;
        const file = transfer.files[0];
        const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name);
        if (isAudio) {
          event.preventDefault();
          const url = URL.createObjectURL(file);
          SA.preview.setAudioSource(url, file.name);
          if (SA.store && SA.store.commands && SA.store.commands.addMedia) {
            SA.store.commands.addMedia({
              id: 'audio',
              kind: 'audio',
              name: file.name,
              mime: file.type || 'audio/mpeg',
            });
          }
          setMediaTab('audio');
          refreshAudioVisual();
          toast('studio.toast.audioImported', { name: file.name });
          if (SA.timeline && typeof SA.timeline.draw === 'function') SA.timeline.draw();
          renderTimeline();
        }
      });
    }
    if (el.mediaPanes && el.mediaPanes.video) {
      el.mediaPanes.video.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      });
      el.mediaPanes.video.addEventListener('drop', async (event) => {
        const transfer = event.dataTransfer;
        if (!transfer || !transfer.files || !transfer.files.length) return;
        const file = transfer.files[0];
        const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);
        if (isVideo) {
          event.preventDefault();
          await loadVideoBlob(file, file.name, file.type || 'video/mp4');
        }
      });
    }
    // Preview drop: an image / video file becomes a background layer,
    // or a foreground layer when dropped with Alt / Shift held.
    if (el.previewStage) {
      el.previewStage.addEventListener('dragover', (event) => {
        const types = event.dataTransfer ? event.dataTransfer.types || [] : [];
        if (types.indexOf('Files') >= 0) {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
        }
      });
      el.previewStage.addEventListener('drop', async (event) => {
        const transfer = event.dataTransfer;
        if (!transfer || !transfer.files || !transfer.files.length) return;
        const slot = event.altKey || event.shiftKey ? 'foreground' : 'background';
        event.preventDefault();
        try {
          await SA.backgroundDialog.setSlotFromFile(slot, transfer.files[0]);
        } catch {
          toast('studio.toast.error');
        }
      });
    }
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
    if (el.rerollColors) el.rerollColors.addEventListener('click', () => rerollColors());
    if (el.vary) el.vary.addEventListener('click', () => varyAll());
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
      showcase: showcaseProject,
      easeShowcase: easeShowcaseProject,
      figureShowcase: figureShowcaseProject,
      backdropShowcase: backdropShowcaseProject,
      fontShowcase: fontShowcaseProject,
      saveProject,
      saveProjectAs,
      undo: undoEdit,
      redo: redoEdit,
      importLyrics,
      importAudio,
      importVideo: importVideoMedia,
      distributeCues,
      randomStyle: () => runRandomize('project', {}),
      randomStyleCues: () => runRandomize('cues', {}),
      randomStyleElements: () => runRandomize('elements', {}),
      randomSettings: randomDialog,
      reroll,
      rerollColors,
      autoDirect,
      applyPreset: presetDialog,
      fitAudio,
      palettes: () => (SA.paletteDialog ? SA.paletteDialog.open() : SA.colors.paletteDialog()),
      themes: () => SA.themes.dialog(),
      editTheme: () => SA.themeEditor.open(null),
      layers: () => SA.layersDialog.open(),
      background: () => SA.backgroundDialog.open(),
      audio: () => SA.audioDialog.open(),
      fonts: () => SA.fontsDialog.open(),
      about: aboutDialog,
      credits: () => SA.creditsDialog.open(),
      song: () => SA.songDialog.open(),
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
      toggleSubtitleBackgrounds,
      areSubtitleBackgroundsOn,
      toggleSubtitleOnly,
      isSubtitleOnly: () => !!store.state.view.subtitleOnly,
      toggleConsole,
      isConsoleOpen: () => SA.debugConsole.isOpen(),
      isAutoKeyOn: () => !!store.state.view.autoKey,
      toggleAutosave,
      toggleStateful,
      isStatefulEnabled: () => statefulEnabled,
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
      try {
        statefulEnabled = localStorage.getItem(LS_STATEFUL) === '1';
      } catch (error) {
        statefulEnabled = false;
      }
      applyStateful();
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
        if (handoff.lang && handoff.lang !== i18n.lang()) {
          setLanguage(handoff.lang);
          if (el.toast) el.toast.hidden = true;
        }
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

  window.SA.studio = { startup, renderAll, toast, toggleConsole, autoDirect, rerollColors, setMediaTab, refreshAudioVisual, renderMediaAudio, importAudio, importVideo: importVideoMedia, addVideoLayer };
  startup();
})();
