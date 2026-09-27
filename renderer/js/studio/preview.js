window.SA = window.SA || {};

SA.preview = (() => {
  'use strict';

  const LS_SCALE = 'sa.studio.previewScale';
  const SCALE_VALUES = { full: 1, half: 0.5, quarter: 0.25 };

  const el = {};
  let renderer = null;
  let rendererKind = 'none';
  let scaleMode = 'auto';
  let scale = 1;
  let scaleAdjusted = false;
  let frameTimes = [];
  let fonts = null;
  let fontsKey = null;
  let fontRequest = 0;
  let rafId = null;
  let playing = false;
  let playAnchor = 0;
  let playFrom = 0;
  let speed = 1;
  let loop = false;
  let audio = null;
  let audioUrl = null;
  let audioPeaks = null;
  let audioDuration = 0;
  let audioDecode = null;
  let audioBuffer = null;
  let audioAnalysis = null;
  let lastVersion = {};
  let lastPlayhead = 0;

  function t(key, vars) {
    return SA.i18n.t(key, vars);
  }

  function project() {
    return SA.store.state.project;
  }

  function sceneDuration() {
    const doc = project();
    if (!doc) return 0;
    if (SA.duration && SA.duration.computeDuration) return SA.duration.computeDuration(doc);
    const cues = doc.script ? doc.script.cues || [] : [];
    return cues.reduce((max, cue) => Math.max(max, cue.end || 0), 0);
  }

  function outputSize(doc) {
    const width = (doc && doc.output && doc.output.width) || 1920;
    const height = (doc && doc.output && doc.output.height) || 1080;
    return { width, height };
  }

  function formatClock(seconds) {
    const value = Math.max(0, seconds || 0);
    const minutes = Math.floor(value / 60);
    const rest = value % 60;
    return `${minutes}:${rest.toFixed(2).padStart(5, '0')}`;
  }

  function parseClock(text) {
    const cleaned = String(text || '').trim().replace(/[^0-9:.,]/g, '');
    const match = cleaned.match(/^(?:(\d+):)?(\d+(?:[.,]\d+)?)$/);
    if (!match) return null;
    const minutes = match[1] ? Number(match[1]) : 0;
    const seconds = Number(String(match[2]).replace(',', '.'));
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    return minutes * 60 + seconds;
  }

  function setStatus(key) {
    if (!el.status) return;
    if (!key) {
      el.status.hidden = true;
      el.status.textContent = '';
      return;
    }
    el.status.hidden = false;
    el.status.textContent = t(key);
  }

  function effectiveScale() {
    if (scaleMode === 'auto') return scale;
    return SCALE_VALUES[scaleMode] || 1;
  }

  function createRenderer() {
    const size = outputSize(project());
    const requested = Math.max(0.25, effectiveScale());
    const width = Math.round(size.width * requested);
    const height = Math.round(size.height * requested);
    const forceFallback =
      typeof window !== 'undefined' &&
      /(^|[#&?])no-webgl2\b/.test(`${(window.location && window.location.search) || ''}\n${(window.location && window.location.hash) || ''}`);
    const created = forceFallback ? null : SA.lyricsEngine.createEngine({ canvas: el.canvas, width, height, quality: 'preview' });
    if (created) {
      rendererKind = 'webgl2';
      el.warn.hidden = true;
      return created;
    }
    rendererKind = 'canvas2d';
    const fallback = SA.canvas2dFallback.createRenderer({ canvas: el.canvas, width, height, quality: 'preview' });
    el.warn.hidden = false;
    el.warn.textContent = t('studio.warn.noWebGL');
    return fallback;
  }

  function versionChanged() {
    const version = SA.store.state.version || {};
    let changed = false;
    for (const key of Object.keys(version)) {
      if (version[key] !== lastVersion[key]) {
        changed = true;
        break;
      }
    }
    lastVersion = { ...version };
    return changed;
  }

  function fitFrame() {
    const stage = el.stage;
    const frame = el.frame;
    if (!stage || !frame) return;
    const doc = project();
    const aspect = doc && doc.output && doc.output.aspect === '9:16' ? 9 / 16 : 16 / 9;
    const styles = getComputedStyle(stage);
    const padX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
    const padY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
    const availW = stage.clientWidth - padX;
    const availH = stage.clientHeight - padY;
    if (availW <= 4 || availH <= 4) return;
    const width = Math.max(40, Math.min(availW, availH * aspect));
    frame.style.width = `${Math.round(width)}px`;
    frame.style.height = `${Math.round(width / aspect)}px`;
  }

  function render() {
    if (!renderer) return;
    fitFrame();
    const doc = project();
    if (versionChanged()) {
      ensureFonts();
      if (doc && SA.textflow) SA.textflow.apply(doc);
    }
    const size = outputSize(doc);
    const factor = Math.max(0.25, effectiveScale());
    const renderWidth = Math.round(size.width * factor);
    const renderHeight = Math.round(size.height * factor);
    renderer.resize(renderWidth, renderHeight);
    renderer.setProject(doc);
    renderer.setAssets({ fonts: fonts || [] });
    if (audioAnalysis && typeof renderer.setAudio === 'function') renderer.setAudio(audioAnalysis);
    if (typeof renderer.preloadLayers === 'function') renderer.preloadLayers().catch(() => {});
    if (typeof renderer.prepareLayers === 'function') renderer.prepareLayers(SA.store.state.playhead, { playback: 'preview' }).catch(() => {});
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const info = renderer.renderFrame(SA.store.state.playhead);
    if (SA.overlay) {
      SA.overlay.setSize(renderWidth, renderHeight);
      SA.overlay.setFrame(info);
    }
    const cost = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
    if (scaleMode === 'auto') {
      frameTimes.push(cost);
      if (frameTimes.length > 30) frameTimes.shift();
      if (frameTimes.length === 30) {
        const average = frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length;
        if (average > 20) {
          if (scale > 0.25) {
            scale = scale === 1 ? 0.5 : 0.25;
            scaleAdjusted = true;
            frameTimes.length = 0;
            render();
            return;
          }
        } else if (average < 8 && scale < 1) {
          scale = scale === 0.25 ? 0.5 : 1;
          frameTimes.length = 0;
          render();
          return;
        }
      }
    }
    updateTransport();
  }

  function updateTransport() {
    const doc = project();
    if (el.time) el.time.textContent = `${formatClock(SA.store.state.playhead)} / ${formatClock(sceneDuration())}`;
    if (el.play) el.play.textContent = playing ? '⏸' : '▶';
    if (el.loop) el.loop.classList.toggle('is-active', loop);
    if (el.aspect) el.aspect.textContent = doc ? doc.output.aspect : '16:9';
  }

  // Every font referenced by the theme, a cue or a beat has to be loaded:
  // per-beat styles switch typefaces.
  function collectFontIds(doc) {
    const ids = new Set();
    const add = (style) => {
      const id = style && style.text && style.text.fontId;
      if (id) ids.add(id);
    };
    add(doc.style);
    for (const style of Object.values(doc.cueStyles || {})) add(style);
    for (const style of Object.values(doc.beatStyles || {})) add(style);
    for (const style of Object.values(doc.beatKindStyle || {})) add(style);
    return [...ids];
  }

  async function ensureFonts() {
    const doc = project();
    if (!doc) return;
    const cues = doc.script ? doc.script.cues || [] : [];
    const text = cues.map((cue) => cue.text || '').join('\n');
    const textStyle = (doc.style && doc.style.text) || {};
    const fontIds = collectFontIds(doc);
    if (!fontIds.length) fontIds.push(textStyle.fontId || 'NotoSans-Regular');
    const key = `${fontIds.join(',')}|${textStyle.weight || 400}|${SA.rng.hash32(text)}|${cues.length}`;
    if (key === fontsKey && fonts) return;
    fontsKey = key;
    const request = ++fontRequest;
    setStatus('studio.preview.loadingFont');
    try {
      const list = [];
      const seen = new Set();
      const push = (entry) => {
        if (entry && entry.font && !seen.has(entry.id)) {
          seen.add(entry.id);
          list.push(entry);
        }
      };
      for (const id of fontIds) push(await SA.lyricsFont.load(id).catch(() => null));
      const fallback = await SA.lyricsFont.ensure(text, textStyle.fontId || fontIds[0], { weight: textStyle.weight || 400 });
      for (const entry of fallback) push(entry);
      if (request !== fontRequest) return;
      fonts = list;
      SA.lyricsFont.setActive(list);
      const doc2 = project();
      if (doc2 && SA.textflow) {
        SA.textflow.apply(doc2);
        SA.store.touch(['script']);
      }
    } catch {
      if (request !== fontRequest) return;
      fonts = [];
    }
    setStatus(null);
    render();
  }

  // --- playback ----------------------------------------------------------------

  function clockNow() {
    const wall = playFrom + ((performance.now() - playAnchor) / 1000) * speed;
    if (audio && !audio.paused) return audio.currentTime;
    return wall;
  }

  function play() {
    if (playing) return;
    if (SA.store.state.playhead >= sceneDuration() - 1e-4) SA.store.setPlayhead(0);
    playing = true;
    SA.store.setPlaying(true);
    playFrom = SA.store.state.playhead;
    playAnchor = performance.now();
    if (audio) {
      try {
        audio.currentTime = playFrom;
        audio.playbackRate = speed;
        const started = audio.play();
        if (started && typeof started.catch === 'function') started.catch(() => {});
      } catch {
        /* audio can fail to start until a user gesture; the clock still runs */
      }
    }
    updateTransport();
    rafId = requestAnimationFrame(tick);
  }

  function pause() {
    if (!playing) return;
    SA.store.setPlayhead(clockNow());
    playing = false;
    SA.store.setPlaying(false);
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (audio) audio.pause();
    updateTransport();
    render();
  }

  function togglePlay() {
    if (playing) pause();
    else play();
  }

  function seek(seconds) {
    const next = Math.max(0, Math.min(sceneDuration(), seconds));
    SA.store.setPlayhead(next);
    if (audio) {
      try {
        audio.currentTime = next;
      } catch {
        /* ignore seek errors before metadata loads */
      }
    }
    playFrom = next;
    playAnchor = performance.now();
    render();
  }

  function tick() {
    if (!playing) return;
    const total = sceneDuration();
    const now = clockNow();
    if (total <= 0) {
      pause();
      return;
    }
    if (now >= total) {
      if (loop) {
        SA.store.setPlayhead(0);
        playFrom = 0;
        playAnchor = performance.now();
        if (audio) {
          try {
            audio.currentTime = 0;
            const started = audio.play();
            if (started && typeof started.catch === 'function') started.catch(() => {});
          } catch {
            /* ignore */
          }
        }
        render();
        rafId = requestAnimationFrame(tick);
        return;
      }
      playing = false;
      SA.store.setPlaying(false);
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      if (audio) audio.pause();
      SA.store.setPlayhead(total);
      updateTransport();
      render();
      return;
    }
    SA.store.setPlayhead(now);
    rafId = requestAnimationFrame(tick);
  }

  function cueTimes() {
    const doc = project();
    return (doc && doc.script ? doc.script.cues || [] : []).map((cue) => cue.start).sort((a, b) => a - b);
  }

  function jump(direction) {
    const times = cueTimes();
    const current = SA.store.state.playhead;
    if (!times.length) return;
    if (direction > 0) {
      const next = times.find((time) => time > current + 1e-4);
      seek(next == null ? sceneDuration() : next);
    } else {
      const previous = [...times].reverse().find((time) => time < current - 1e-4);
      seek(previous == null ? 0 : previous);
    }
  }

  function step(direction, large) {
    const doc = project();
    const fps = (doc && doc.output && doc.output.fps) || 30;
    seek(SA.store.state.playhead + direction * (large ? 1 : 1 / fps));
  }

  // --- audio -------------------------------------------------------------------

  function setAudioSource(url, name) {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = url || null;
    audioPeaks = null;
    audioDuration = 0;
    audioDecode = null;
    if (audio) {
      audio.pause();
      audio = null;
    }
    if (!url) return;
    audio = new Audio();
    audio.preload = 'auto';
    audio.src = url;
    decodePeaks(url).catch(() => {});
    if (playing) {
      try {
        audio.currentTime = SA.store.state.playhead;
        audio.playbackRate = speed;
        const started = audio.play();
        if (started && typeof started.catch === 'function') started.catch(() => {});
      } catch {
        /* ignore */
      }
    }
    void name;
  }

  function decodePeaks(url) {
    if (audioDecode) return audioDecode;
    audioDecode = (async () => {
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      const context = new AudioContextClass();
      try {
        const decoded = await context.decodeAudioData(buffer.slice(0));
        audioBuffer = decoded;
        audioDuration = decoded.duration;
        const block = 512;
        const count = Math.max(1, Math.ceil(decoded.length / block));
        const peaks = new Float32Array(count);
        for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
          const data = decoded.getChannelData(channel);
          for (let i = 0; i < count; i += 1) {
            let max = 0;
            const start = i * block;
            const end = Math.min(data.length, start + block);
            for (let j = start; j < end; j += 1) {
              const value = Math.abs(data[j]);
              if (value > max) max = value;
            }
            if (max > peaks[i]) peaks[i] = max;
          }
        }
        audioPeaks = { peaks, sampleRate: decoded.sampleRate, block };
        if (SA.audioAnalysis) {
          const channels = [];
          for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) channels.push(decoded.getChannelData(channel));
          audioAnalysis = SA.audioAnalysis.analyze(channels, decoded.sampleRate, 30);
          if (renderer && typeof renderer.setAudio === 'function') renderer.setAudio(audioAnalysis);
        }
        return audioPeaks;
      } finally {
        if (context.close) context.close().catch(() => {});
      }
    })();
    return audioDecode;
  }

  function getPeaks() {
    return audioPeaks;
  }

  async function getAudioBuffer() {
    if (audioBuffer) return audioBuffer;
    if (!audioUrl) return null;
    try {
      await decodePeaks(audioUrl);
    } catch {
      return null;
    }
    return audioBuffer;
  }

  async function importAudio() {
    try {
      const picked = await SA.platform.readFile('audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac');
      if (!picked) return { canceled: true };
      const blob = new Blob([picked.bytes], { type: picked.type || 'audio/mpeg' });
      setAudioSource(URL.createObjectURL(blob), picked.name);
      return { canceled: false, name: picked.name };
    } catch (error) {
      return { canceled: false, error };
    }
  }

  function hasAudio() {
    return !!audio;
  }

  // --- scale / speed / loop ----------------------------------------------------

  function setScale(mode) {
    if (mode === 'auto' || SCALE_VALUES[mode]) {
      scaleMode = mode;
      if (mode === 'auto') {
        scale = scaleAdjusted ? scale : 1;
        frameTimes.length = 0;
      }
      try {
        localStorage.setItem(LS_SCALE, mode);
      } catch {
        /* ignore */
      }
      render();
    }
    return scaleMode;
  }

  function setSpeed(value) {
    speed = Math.max(0.25, Math.min(2, Number(value) || 1));
    if (audio) audio.playbackRate = speed;
    if (playing) {
      playFrom = SA.store.state.playhead;
      playAnchor = performance.now();
      if (audio) {
        try {
          audio.currentTime = playFrom;
        } catch {
          /* ignore */
        }
      }
    }
    return speed;
  }

  function setLoop(value) {
    loop = !!value;
    updateTransport();
    return loop;
  }

  // --- wiring ------------------------------------------------------------------

  function init() {
    el.canvas = document.getElementById('preview-canvas');
    el.stage = document.querySelector('.preview-stage');
    el.frame = document.querySelector('.preview-frame');
    el.time = document.getElementById('tp-time');
    el.play = document.getElementById('tp-play');
    el.loop = document.getElementById('tp-loop');
    el.aspect = document.getElementById('tp-aspect');
    el.warn = document.getElementById('preview-warn');
    el.status = document.getElementById('preview-status');
    try {
      const stored = localStorage.getItem(LS_SCALE);
      if (stored === 'auto' || SCALE_VALUES[stored]) scaleMode = stored;
    } catch {
      /* ignore */
    }
    renderer = createRenderer();
    lastVersion = { ...(SA.store.state.version || {}) };
    lastPlayhead = SA.store.state.playhead;
    SA.store.subscribe('preview', () => {
      const head = SA.store.state.playhead;
      if (head !== lastPlayhead) {
        lastPlayhead = head;
        render();
      }
    });
    ensureFonts();
    render();
    window.addEventListener('resize', render);
  }

  function captureRGBA(time) {
    if (!renderer) return null;
    if (typeof time === 'number') renderer.renderFrame(time);
    if (rendererKind !== 'webgl2' || typeof renderer.captureRGBA !== 'function') return null;
    return renderer.captureRGBA();
  }

  return {
    init,
    render,
    ensureFonts,
    play,
    pause,
    togglePlay,
    seek,
    jump,
    step,
    setScale,
    getScaleMode: () => scaleMode,
    getScale: effectiveScale,
    setSpeed,
    getSpeed: () => speed,
    setLoop,
    isLoop: () => loop,
    isPlaying: () => playing,
    duration: sceneDuration,
    hasAudio,
    getAudioTime: () => (audio ? audio.currentTime : null),
    isAudioPlaying: () => (audio ? !audio.paused : false),
    getPeaks,
    getAudioBuffer,
    getAudioAnalysis: () => audioAnalysis,
    getAudioDuration: () => audioDuration,
    setAudioSource,
    importAudio,
    captureRGBA,
    debugError: () => (renderer && typeof renderer.debugError === 'function' ? renderer.debugError() : 0),
    engine: () => renderer,
    isWebGL2: () => rendererKind === 'webgl2',
    formatClock,
    parseClock,
    outputSize,
  };
})();
