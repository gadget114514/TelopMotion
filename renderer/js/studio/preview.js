const root = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this;
root.SA = root.SA || {};

const preview = (() => {
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
  let lastMissingFonts = '';
  let fontRequest = 0;
  let fontsPromise = Promise.resolve();
  let rafId = null;
  const requestFrame = typeof requestAnimationFrame === 'function' ? (cb) => requestAnimationFrame(cb) : (cb) => setTimeout(cb, 1000 / 60);
  const cancelFrame = typeof cancelAnimationFrame === 'function' ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id);
  let playing = false;
  let playAnchor = 0;
  let playFrom = 0;
  let speed = 1;
  let loop = false;
  let audio = null;
  let audioUrl = null;
  let audioName = null;
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
    let dur = 0;
    if (doc) {
      if (SA.duration && SA.duration.computeDuration) dur = SA.duration.computeDuration(doc);
      else {
        const cues = doc.script ? doc.script.cues || [] : [];
        dur = cues.reduce((max, cue) => Math.max(max, cue.end || 0), 0);
      }
      if (Array.isArray(doc.clips)) {
        for (const clip of doc.clips) {
          // auto clips are regenerable: a stale auto backdrop must not stretch
          // the song past the lyrics / song-length end (manual clips still can)
          if (clip && clip.auto) continue;
          if (clip && Number.isFinite(clip.end) && clip.end > dur) dur = clip.end;
        }
      }
      if (Array.isArray(doc.layers)) {
        for (const layer of doc.layers) {
          if (layer && Number.isFinite(layer.end) && layer.end > dur) dur = layer.end;
        }
      }
      if (doc.media && Array.isArray(doc.media.videos)) {
        for (const v of doc.media.videos) {
          if (v && Number.isFinite(v.duration) && v.duration > dur) dur = v.duration;
        }
      }
    }
    const total = Math.max(dur, audioDuration || 0);
    const maxDur = doc && doc.output && doc.output.maxDuration;
    if (maxDur && maxDur > 0) return Math.min(maxDur, total);
    return total;
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
    const output = (doc && doc.output) || {};
    const aspect = output.width > 0 && output.height > 0 ? output.width / output.height : output.aspect === '9:16' ? 9 / 16 : 16 / 9;
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
    // display-only view toggles (never saved, never used by the export)
    if (typeof renderer.setView === 'function') {
      const view = SA.store.state.view || {};
      renderer.setView({ subtitleOnly: !!view.subtitleOnly, subtitleBackgrounds: view.subtitleBackgrounds !== false });
    }
    if (audioAnalysis && typeof renderer.setAudio === 'function') renderer.setAudio(audioAnalysis);
    if (typeof renderer.preloadLayers === 'function') renderer.preloadLayers().catch(() => {});
    if (typeof renderer.prepareLayers === 'function') {
      renderer.prepareLayers(SA.store.state.playhead, {
        playback: 'preview',
        playing,
        speed,
        hasAudio: hasAudio(),
      }).catch(() => {});
    }
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
  function usesFontVariation(style) {
    const repeat = style && style.repeat;
    if (!repeat || !repeat.type || repeat.type === 'none' || repeat.enabled === false) return false;
    const params = repeat.params || {};
    if (params.variationPreset === 'ransomNote' || params.variationPreset === 'loudQuiet') return true;
    return params.var1Attr === 'font' || params.var2Attr === 'font';
  }

  // Variant classes are loaded only when a repeat asks for font variation.
  // Japanese text uses the four added Japanese typefaces; latin text stays on
  // the already bundled latin families.
  function variationFontIds(ids, text) {
    if (!SA.lyricsFont || !SA.lyricsFont.builtins) return;
    // a project font set supplies its own variation typefaces (already loaded)
    if (SA.fontSet && SA.fontSet.isActive(SA.lyricsFont.getFontSet())) return;
    const builtins = SA.lyricsFont.builtins();
    const cjk = /[\u3000-\u9fff\uff00-\uffef]/.test(text || '');
    const mainClasses = new Set(
      [...ids]
        .map((id) => {
          const entry = builtins.find((candidate) => candidate.id === id);
          return entry && entry.fontClass;
        })
        .filter(Boolean)
    );
    const pool = cjk ? builtins.filter((entry) => entry.variation && entry.cjk) : builtins.filter((entry) => !entry.variation && !entry.cjk && entry.fontClass);
    const byClass = new Map();
    for (const entry of pool) if (!byClass.has(entry.fontClass)) byClass.set(entry.fontClass, entry);
    for (const entry of [...byClass.values()].filter((candidate) => !mainClasses.has(candidate.fontClass)).slice(0, 4)) {
      ids.add(entry.id);
    }
  }

  function collectFontIds(doc) {
    const ids = new Set();
    const resolve = (id) => (SA.lyricsFont.resolveFontId ? SA.lyricsFont.resolveFontId(id) : id);
    const add = (style) => {
      const id = style && style.text && style.text.fontId;
      if (id) ids.add(resolve(id));
    };
    for (const id of SA.fontSet ? SA.fontSet.fontIds(SA.lyricsFont.getFontSet()) : []) ids.add(id);
    const styles = [doc.style];
    for (const style of Object.values(doc.cueStyles || {})) styles.push(style);
    for (const style of Object.values(doc.beatStyles || {})) styles.push(style);
    for (const style of Object.values(doc.beatKindStyle || {})) styles.push(style);
    for (const style of styles) add(style);
    if (styles.some(usesFontVariation)) {
      const cues = doc.script ? doc.script.cues || [] : [];
      variationFontIds(ids, cues.map((cue) => cue.text || '').join('\n'));
    }
    return [...ids];
  }

  function fontsProgress() {
    const boot = (typeof SA !== 'undefined' && SA.boot) || null;
    if (boot && typeof boot.detail === 'function') return boot;
    return null;
  }

  function paintFontsStep() {
    // let the boot overlay paint the detail line before the next
    // (potentially blocking) opentype parse
    if (typeof requestAnimationFrame === 'function') {
      return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    }
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function ensureFonts(onProgress) {
    fontsPromise = loadFonts(onProgress);
    return fontsPromise;
  }

  // Puts the project's loaded fonts (bytes from the font library) into the
  // font registry; returns the families that are not in this library.
  async function registerProjectFonts(doc) {
    const missing = [];
    const metas = (doc.media && doc.media.fonts) || [];
    for (const meta of metas) {
      if (!meta || !meta.id || SA.lyricsFont.hasUserFont(meta.id)) continue;
      const record = SA.platform.fontLibrary ? await SA.platform.fontLibrary.get(meta.id) : null;
      if (!record || !record.bytes) {
        missing.push(meta.family || meta.fileName || meta.id);
        continue;
      }
      await SA.lyricsFont.registerUserFont({ ...record.meta, ...meta }, record.bytes).catch(() => missing.push(meta.family || meta.id));
    }
    return missing;
  }

  async function loadFonts(onProgress) {
    const doc = project();
    if (!doc) return;
    const report = typeof onProgress === 'function' ? onProgress : null;
    const boot = fontsProgress();
    const notify = (done, total, name) => {
      if (report) {
        try {
          report({ done, total, name });
        } catch {
          /* progress must never break loading */
        }
        return;
      }
      // no explicit listener (preview.init, later edits): only the detail
      // line moves. The percent stays with the current step (after boot it
      // is a no-op anyway), so an early load never jumps the bar.
      if (boot) boot.detail(total > 0 ? `${name || ''} ${Math.min(total, done + 1)}/${total}`.trim() : name || '');
    };
    SA.lyricsFont.setFontSet(doc.fontSet);
    const missing = await registerProjectFonts(doc);
    const missingKey = missing.join(', ');
    if (missingKey && missingKey !== lastMissingFonts && SA.studio && SA.studio.toast) SA.studio.toast('fonts.missing', { names: missingKey });
    lastMissingFonts = missingKey;
    const cues = doc.script ? doc.script.cues || [] : [];
    const text = cues.map((cue) => cue.text || '').join('\n');
    const textStyle = (doc.style && doc.style.text) || {};
    const fontIds = collectFontIds(doc);
    if (!fontIds.length) fontIds.push(textStyle.fontId || 'NotoSans-Regular');
    const key = `${fontIds.join(',')}|${JSON.stringify(doc.fontSet || null)}|${textStyle.weight || 400}|${SA.rng.hash32(text)}|${cues.length}`;
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
      for (let i = 0; i < fontIds.length; i += 1) {
        notify(i, fontIds.length, fontIds[i]);
        await paintFontsStep();
        push(await SA.lyricsFont.load(fontIds[i]).catch(() => null));
        if (request !== fontRequest) return;
      }
      notify(fontIds.length, fontIds.length + 1, 'fallback');
      await paintFontsStep();
      const fallback = await SA.lyricsFont.ensure(text, textStyle.fontId || fontIds[0], { weight: textStyle.weight || 400 });
      for (const entry of fallback) push(entry);
      if (request !== fontRequest) return;
      fonts = list;
      SA.lyricsFont.setActive(list);
      const doc2 = project();
      if (doc2 && SA.textflow) {
        notify(fontIds.length + 1, fontIds.length + 1, 'layout');
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
    render();
    rafId = requestFrame(tick);
  }

  function pause() {
    if (!playing) return;
    SA.store.setPlayhead(clockNow());
    playing = false;
    SA.store.setPlaying(false);
    if (rafId) cancelFrame(rafId);
    rafId = null;
    if (audio) audio.pause();
    if (renderer && typeof renderer.pauseVideos === 'function') renderer.pauseVideos();
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
    updateTransport();
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
        updateTransport();
        render();
        rafId = requestFrame(tick);
        return;
      }
      playing = false;
      SA.store.setPlaying(false);
      if (rafId) cancelFrame(rafId);
      rafId = null;
      if (audio) audio.pause();
      SA.store.setPlayhead(total);
      updateTransport();
      render();
      return;
    }
    SA.store.setPlayhead(now);
    updateTransport();
    rafId = requestFrame(tick);
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
    if (audioUrl && audioUrl !== url) {
      try {
        URL.revokeObjectURL(audioUrl);
      } catch {
        /* synthetic */
      }
    }
    audioUrl = url || null;
    audioName = name || null;
    audioPeaks = null;
    audioDuration = 0;
    audioDecode = null;
    if (audio) {
      try {
        audio.pause();
      } catch {
        /* synthetic */
      }
      audio = null;
    }
    if (!url) {
      updateTransport();
      if (SA.timeline && typeof SA.timeline.draw === 'function') SA.timeline.draw();
      return;
    }
    if (typeof Audio !== 'undefined') {
      audio = new Audio();
      audio.preload = 'auto';
      audio.src = url;
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        audioDuration = audio.duration;
      }
      audio.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          if (!audioDuration || audioDuration === 0) {
            audioDuration = audio.duration;
          }
          updateTransport();
          if (SA.timeline && typeof SA.timeline.draw === 'function') SA.timeline.draw();
        }
      });
      audio.addEventListener('ended', () => {
        if (!loop) {
          pause();
        }
      });
    }
    decodePeaks(url).catch(() => {});
    if (playing && audio) {
      try {
        audio.currentTime = SA.store.state.playhead;
        audio.playbackRate = speed;
        const started = audio.play();
        if (started && typeof started.catch === 'function') started.catch(() => {});
      } catch {
        /* ignore */
      }
    }
    updateTransport();
    if (SA.timeline && typeof SA.timeline.draw === 'function') SA.timeline.draw();
  }

  function decodePeaks(url) {
    if (audioDecode) return audioDecode;
    audioDecode = (async () => {
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      const AudioContextClass = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
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
        updateTransport();
        if (SA.timeline && typeof SA.timeline.draw === 'function') SA.timeline.draw();
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
    return !!audio || !!audioUrl || audioDuration > 0;
  }

  function hasVideo() {
    const doc = project();
    if (!doc) return false;
    const hasLayer = (doc.layers || []).some((l) => l && l.enabled !== false && l.type === 'video');
    const hasMedia = doc.media && Array.isArray(doc.media.videos) && doc.media.videos.length > 0;
    return hasLayer || hasMedia;
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
      if (SA.store && SA.store.state) {
        if (!SA.store.state.playing && playing) {
          pause();
        }
      }
      const head = SA.store.state.playhead;
      if (head !== lastPlayhead) {
        lastPlayhead = head;
        if (!playing && audio) {
          try {
            audio.currentTime = head;
          } catch {
            /* synthetic */
          }
        }
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
    whenFontsReady: () => fontsPromise,
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
    hasVideo,
    getAudioTime: () => (audio ? audio.currentTime : null),
    isAudioPlaying: () => (audio ? !audio.paused : false),
    getAudioName: () => audioName,
    getAudioUrl: () => audioUrl,
    getAudioElement: () => audio,
    setAudioDuration: (d) => {
      audioDuration = Number(d) || 0;
      updateTransport();
      if (SA.timeline && typeof SA.timeline.draw === 'function') SA.timeline.draw();
    },
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

root.SA.preview = preview;
if (typeof module === 'object' && module.exports) module.exports = preview;

