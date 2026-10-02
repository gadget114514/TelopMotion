window.SA = window.SA || {};

SA.timeline = (() => {
  'use strict';

  const LS_ZOOM = 'sa.studio.timeline.zoom';
  const ROW_H = 26;
  const RULER_H = 24;
  const AUDIO_H = 30;
  const LANE_H = 22;
  const LAYER_H = 22;
  const LABEL_W = 90;
  const KEY_SIZE = 5;
  const MIN_ZOOM = 10;
  const MAX_ZOOM = 800;
  const SNAP_PX = 7;
  const TICK_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  // tracks whose clips are placed by hand with drag / double-click / Add cue
  const CREATABLE_CLIP_KINDS = ['figure', 'textAnim', 'filler'];

  const el = {};
  let ctx = null;
  let rulerCtx = null;
  let fixedHeight = RULER_H;
  let dpr = 1;
  let pxPerSecond = 120;
  let scrollX = 0;
  let hitRegions = [];
  let keyRegions = [];
  // Row labels that `fitLabel` had to truncate: hovering the fixed label column
  // shows their full text in a tooltip. Recorded on every draw.
  let labelRegions = [];
  let tipSize = { w: 0, h: 0 };
  let rows = [];
  let cueRects = new Map();
  let drag = null;
  let menu = null;
  let editing = null;
  let expanded = new Set();
  let selectedKeys = new Set();
  let clipboard = [];
  let lastVersion = {};
  let lastPlayhead = -1;

  function t(key, vars) {
    return SA.i18n.t(key, vars);
  }

  function project() {
    return SA.store.state.project;
  }

  function duration() {
    return SA.preview ? SA.preview.duration() : 0;
  }

  function fps() {
    const doc = project();
    return (doc && doc.output && doc.output.fps) || 30;
  }

  function cueList() {
    const doc = project();
    return doc && doc.script ? doc.script.cues || [] : [];
  }

  function layerList(slot) {
    const doc = project();
    const list = (doc && doc.layers) || [];
    return list.filter((layer) => (layer && (layer.slot === 'foreground') === (slot === 'foreground')));
  }

  function trackList() {
    const doc = project();
    return (doc && doc.tracks) || [];
  }

  function clipsOnTrack(doc, trackId) {
    return ((doc && doc.clips) || []).filter((clip) => clip && clip.trackId === trackId).sort((a, b) => a.start - b.start);
  }

  function trackTitle(track) {
    if (!track) return '';
    if (track.kind === 'foreground') return t('layers.slotForeground');
    if (track.kind === 'background') return t('layers.slotBackground');
    if (track.kind === 'backdrop') return t('studio.inspector.background');
    if (track.kind === 'figure') return t('studio.track.figure');
    if (track.kind === 'filler') return t('filler.track');
    if (track.kind === 'subtitle') {
      const suffix = track.name && /^字幕/.test(track.name) ? track.name.replace(/^字幕/, '') : '';
      return suffix ? `${t('studio.track.subtitle')} ${suffix}` : track.name || t('studio.track.subtitle');
    }
    return track.name || track.id;
  }

  // Packs overlapping items into as few lanes as possible so a track only grows
  // a row where it actually overlaps itself.
  function packRows(items, startOf, endOf) {
    const lanes = [];
    const sorted = [...(items || [])].sort((a, b) => startOf(a) - startOf(b));
    for (const item of sorted) {
      const start = Number(startOf(item)) || 0;
      const end = endOf(item) == null ? start + 0.1 : Number(endOf(item));
      let lane = lanes.find((entry) => entry.end <= start + 1e-4);
      if (!lane) {
        lane = { end: -Infinity, items: [] };
        lanes.push(lane);
      }
      lane.items.push(item);
      lane.end = Math.max(lane.end, end);
    }
    return lanes.map((lane) => lane.items);
  }

  function creditClips() {
    const doc = project();
    if (!doc || !SA.credits) return [];
    const list = SA.credits.elements(doc).map((element) => ({ mode: element.mode, start: element.start, end: element.end }));
    const settings = SA.credits.settingsFor(doc);
    const always = settings.modes.always;
    if (always && always.enabled) list.push({ mode: 'always', start: always.from || 0, end: always.to == null ? duration() : always.to });
    return list;
  }

  function fillerTypeLabel(type) {
    const key = `filler.type.${type}`;
    const translated = t(key);
    if (translated !== key) return translated;
    return SA.controls ? SA.controls.prettify(type) : String(type || '');
  }

  const CREDIT_LABELS = { element: 'credits.modeElement', end: 'credits.modeEnd', always: 'credits.modeAlways' };

  function creditModeLabel(mode) {
    return t(CREDIT_LABELS[mode] || 'credits.title');
  }

  function beatsFor(projectDoc, cue) {
    const list = projectDoc.beats && projectDoc.beats[cue.id];
    if (list && list.length) return list;
    const beat = SA.lyricsEngine.beatForCue(cue);
    return beat ? [beat] : [];
  }

  // Beats whose resolved look carries a frame-wide graphic (see
  // SA.fx.isGraphicsPost). Resolved once per project version.
  let graphicsSpanCache = { version: -1, spans: new Map() };
  function graphicsSpans(doc, cue) {
    const version = SA.store.state.version && SA.store.state.version.project;
    if (graphicsSpanCache.version !== version) graphicsSpanCache = { version, spans: new Map() };
    if (graphicsSpanCache.spans.has(cue.id)) return graphicsSpanCache.spans.get(cue.id);
    const spans = [];
    if (SA.fx && SA.fx.isGraphicsPost) {
      for (const beat of beatsFor(doc, cue)) {
        const style = SA.project.resolveStyle(doc, `cue:${cue.id}/beat:${beat.id}`);
        if ((style.post || []).some((instance) => SA.fx.isGraphicsPost(instance))) spans.push({ start: beat.start, end: beat.end });
      }
    }
    graphicsSpanCache.spans.set(cue.id, spans);
    return spans;
  }

  // Beats whose resolved look carries a text background (a `bgShape` other
  // than none), the same test the engine draws by. Resolved once per project
  // version.
  let backgroundSpanCache = { version: -1, spans: new Map() };
  function backgroundSpans(doc, cue) {
    const version = SA.store.state.version && SA.store.state.version.project;
    if (backgroundSpanCache.version !== version) backgroundSpanCache = { version, spans: new Map() };
    if (backgroundSpanCache.spans.has(cue.id)) return backgroundSpanCache.spans.get(cue.id);
    const spans = [];
    for (const beat of beatsFor(doc, cue)) {
      const style = SA.project.resolveStyle(doc, `cue:${cue.id}/beat:${beat.id}`);
      const shape = style && style.bgShape;
      if (!shape || !shape.type || shape.type === 'none') continue;
      // only the definition background (the per-letter cell square) is painted
      // on this row
      if (SA.textBg && typeof SA.textBg.isBackground === 'function' && !SA.textBg.isBackground(shape)) continue;
      spans.push({ start: beat.start, end: beat.end });
    }
    backgroundSpanCache.spans.set(cue.id, spans);
    return spans;
  }

  function originFor(path, cueId) {
    const doc = project();
    if (!doc) return 0;
    const beatId = (String(path).split('/beat:')[1] || '').split('/')[0];
    if (beatId && doc.beats[cueId]) {
      const beat = doc.beats[cueId].find((entry) => entry.id === beatId);
      if (beat) return beat.start;
    }
    const cue = cueList().find((entry) => entry.id === cueId);
    return cue ? cue.start : 0;
  }

  // The left LABEL_W pixels are a fixed row-label column: the time axis starts
  // to its right and never overlaps the labels.
  function timeAt(x) {
    return Math.max(0, (x - LABEL_W + scrollX) / pxPerSecond);
  }

  function xOf(time) {
    return LABEL_W + time * pxPerSecond - scrollX;
  }

  function timeViewWidth() {
    const width = ((el.scroll && el.scroll.clientWidth) || 600) - LABEL_W;
    return Math.max(80, width);
  }

  // Zoom that makes the whole timeline fit the time area.
  function fitZoom() {
    const total = Math.max(0.1, duration());
    return Math.max(0.5, Math.min(MAX_ZOOM, timeViewWidth() / total));
  }

  // Zoom that makes the cue list fit the time area. Imports use this so the
  // whole script is visible right away; it may be below MIN_ZOOM and minZoom()
  // follows it, so the slider can always come back.
  function cueFitZoom() {
    const cues = cueList();
    const end = Math.max(0.1, ...cues.map((cue) => Math.max(0, Number(cue.end) || 0)));
    return Math.max(0.5, Math.min(MAX_ZOOM, timeViewWidth() / (end * 1.02)));
  }

  function minZoom() {
    return Math.min(MIN_ZOOM, fitZoom(), cueFitZoom());
  }

  function defer(fn) {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn);
    else setTimeout(fn, 0);
  }

  function applyZoomView() {
    try {
      localStorage.setItem(LS_ZOOM, String(Math.round(pxPerSecond)));
    } catch {
      /* ignore */
    }
    if (el.zoom) el.zoom.value = String(Math.round(pxPerSecond));
    if (el.zoomLabel) el.zoomLabel.textContent = `${Math.round(pxPerSecond)} px/s`;
  }

  // Shows the whole cue list (after a lyrics import, or from the menu).
  function fitToCues() {
    if (!cueList().length) {
      fit();
      return;
    }
    pxPerSecond = Math.max(0.5, Math.min(MAX_ZOOM, cueFitZoom()));
    scrollX = 0;
    applyZoomView();
    draw();
  }

  function timeContentWidth() {
    return Math.max(0.1, duration()) * pxPerSecond;
  }

  function maxScrollX() {
    return Math.max(0, timeContentWidth() - timeViewWidth() + 20);
  }

  function clampScrollX(value) {
    return Math.max(0, Math.min(maxScrollX(), value));
  }

  function formatClock(seconds) {
    return SA.preview ? SA.preview.formatClock(seconds) : `${Math.floor(seconds)}s`;
  }

  // Truncates a label with an ellipsis so it never leaves the fixed label
  // column and overlaps the time-based blocks.
  function fitLabel(text, maxWidth) {
    const value = String(text == null ? '' : text);
    if (!ctx || maxWidth <= 0) return '';
    if (ctx.measureText(value).width <= maxWidth) return value;
    let end = value.length;
    while (end > 1 && ctx.measureText(`${value.slice(0, end)}…`).width > maxWidth) end -= 1;
    return `${value.slice(0, end)}…`;
  }

  function snapFrame(time) {
    const step = 1 / fps();
    return Math.round(time / step) * step;
  }

  function snapTime(time, exclude) {
    const doc = project();
    if (!doc || SA.store.state.view.snapping === false) return snapFrame(time);
    const threshold = SNAP_PX / pxPerSecond;
    const candidates = [0, SA.store.state.playhead];
    for (const cue of doc.script.cues) {
      if (exclude && exclude.cueId === cue.id) continue;
      candidates.push(cue.start, cue.end);
    }
    for (const marker of doc.markers || []) candidates.push(marker.t);
    let best = time;
    let bestDistance = threshold;
    for (const candidate of candidates) {
      const distance = Math.abs(candidate - time);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    if (best !== time) return best;
    const whole = Math.round(time);
    if (Math.abs(whole - time) < threshold) return whole;
    return snapFrame(time);
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
    const playhead = SA.store.state.playhead;
    if (playhead !== lastPlayhead) {
      lastPlayhead = playhead;
      changed = true;
    }
    return changed;
  }

  // --- layout ------------------------------------------------------------------

  function laneEntriesForCues(doc, cues) {
    const entries = [];
    for (const cue of cues) {
      for (const [path, props] of Object.entries(doc.keyframes || {})) {
        if (!path.startsWith(`cue:${cue.id}/`) && path !== `cue:${cue.id}`) continue;
        for (const propPath of Object.keys(props)) {
          if (!props[propPath] || !props[propPath].length) continue;
          entries.push({ cueId: cue.id, path, propPath });
        }
      }
    }
    entries.sort((a, b) => (a.path + a.propPath).localeCompare(b.path + b.propPath));
    return entries;
  }

  // One row per track, top to bottom. Tracks only grow extra rows when their own
  // clips overlap.
  function layoutRows() {
    const doc = project();
    rows = [];
    cueRects = new Map();
    let y = RULER_H;
    rows.push({ type: 'ruler', y, h: RULER_H });
    if (SA.preview && SA.preview.getPeaks && SA.preview.getPeaks()) {
      rows.push({ type: 'audio', y, h: AUDIO_H });
      y += AUDIO_H;
    }
    const tracks = trackList();
    for (const track of tracks) {
      if (!track) continue;
      if (track.kind === 'foreground' || track.kind === 'background') {
        const slot = track.kind === 'foreground' ? 'foreground' : 'background';
        const layers = layerList(slot);
        const packed = packRows(layers, (layer) => (layer.start == null ? 0 : layer.start), (layer) => (layer.end == null ? duration() : layer.end));
        const laneCount = Math.max(1, packed.length);
        for (let lane = 0; lane < laneCount; lane += 1) {
          rows.push({ type: 'layer-track', y, h: LAYER_H, trackId: track.id, track, slot, layers: packed[lane] || [], first: lane === 0, last: lane === laneCount - 1 });
          y += LAYER_H;
        }
        // the background track also owns the background clips (the auto
        // direction places the song's background here): show them as clip
        // lanes under the layer lanes so they can be selected and edited
        if (track.kind === 'background') {
          const clips = clipsOnTrack(doc, track.id);
          const clipPacked = packRows(clips, (clip) => clip.start, (clip) => clip.end);
          for (let lane = 0; lane < clipPacked.length; lane += 1) {
            rows.push({ type: 'clip-track', y, h: LAYER_H, trackId: track.id, track, kind: 'background', clips: clipPacked[lane] || [], first: false, last: lane === clipPacked.length - 1 });
            y += LAYER_H;
          }
        }
        continue;
      }
      if (track.kind === 'subtitle') {
        const cues = cueList().filter((cue) => (cue.trackId || 'sub1') === track.id);
        rows.push({ type: 'cue-track', y, h: ROW_H, trackId: track.id, track, cues, first: true, last: false });
        y += ROW_H;
        for (const cue of cues) cueRects.set(cue.id, rows[rows.length - 1]);
        // the track's two switch rows sit directly under its cues: the text
        // background (the shapes behind the glyphs) ...
        rows.push({ type: 'bg-track', y, h: LAYER_H, trackId: track.id, track, cues });
        y += LAYER_H;
        // ... and the graphics: the frame-wide posts its look carries (see
        // SA.fx.isGraphicsPost)
        rows.push({ type: 'graphics-track', y, h: LAYER_H, trackId: track.id, track, cues });
        y += LAYER_H;
        if (!expanded.has(track.id)) continue;
        const entries = laneEntriesForCues(doc, cues);
        for (const entry of entries) {
          rows.push({ type: 'lane', y, h: LANE_H, trackId: track.id, cueId: entry.cueId, path: entry.path, propPath: entry.propPath, origin: originFor(entry.path, entry.cueId) });
          y += LANE_H;
        }
        if (!entries.length) {
          rows.push({ type: 'lane-empty', y, h: LANE_H, trackId: track.id });
          y += LANE_H;
        }
        continue;
      }
      if (track.kind === 'backdrop' || track.kind === 'filler' || track.kind === 'background' || track.kind === 'figure' || track.kind === 'textAnim') {
        const clips = clipsOnTrack(doc, track.id);
        const packed = packRows(clips, (clip) => clip.start, (clip) => clip.end);
        const laneCount = Math.max(1, packed.length);
        for (let lane = 0; lane < laneCount; lane += 1) {
          rows.push({ type: 'clip-track', y, h: LAYER_H, trackId: track.id, track, kind: track.kind, clips: packed[lane] || [], first: lane === 0, last: lane === laneCount - 1 });
          y += LAYER_H;
        }
      }
    }
    rows.push({ type: 'credits', y, h: LAYER_H, trackId: null });
    y += LAYER_H;
    return y + 6;
  }

  function resize() {
    if (!el.canvas) return { width: 600, height: 200 };
    // use the scroll container's content width so the canvas never overflows
    // horizontally (a mismatched width used to shift the 0 s position).
    const width = Math.max(240, (el.scroll && el.scroll.clientWidth) || el.canvas.parentElement.clientWidth || 600);
    const fullHeight = Math.max(RULER_H + ROW_H, layoutRows());
    const audioRow = rows.find((row) => row.type === 'audio');
    fixedHeight = RULER_H + (audioRow ? AUDIO_H : 0);
    const rowsHeight = Math.max(ROW_H, fullHeight - fixedHeight);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    if (el.rulerCanvas && rulerCtx) {
      el.rulerCanvas.width = Math.round(width * dpr);
      el.rulerCanvas.height = Math.round(fixedHeight * dpr);
      el.rulerCanvas.style.width = `${width}px`;
      el.rulerCanvas.style.height = `${fixedHeight}px`;
      rulerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    el.canvas.width = Math.round(width * dpr);
    el.canvas.height = Math.round(rowsHeight * dpr);
    el.canvas.style.width = `${width}px`;
    el.canvas.style.height = `${rowsHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height: fullHeight };
  }

  // --- drawing -----------------------------------------------------------------

  function tickStep() {
    for (const step of TICK_STEPS) {
      if (step * pxPerSecond >= 64) return step;
    }
    return TICK_STEPS[TICK_STEPS.length - 1];
  }

  function drawRuler(size) {
    const total = Math.max(duration(), 1);
    ctx.fillStyle = '#0d1017';
    ctx.fillRect(0, 0, size.width, RULER_H);
    ctx.strokeStyle = '#252c3d';
    ctx.beginPath();
    ctx.moveTo(0, RULER_H - 0.5);
    ctx.lineTo(size.width, RULER_H - 0.5);
    ctx.stroke();
    const step = tickStep();
    const start = Math.floor(Math.max(0, (scrollX - LABEL_W) / pxPerSecond) / step) * step;
    ctx.font = '10px "Segoe UI", Arial, sans-serif';
    ctx.textBaseline = 'top';
    for (let time = start; time <= total + step; time += step) {
      const x = Math.round(xOf(time));
      if (x < LABEL_W - 1 || x > size.width + 40) continue;
      ctx.strokeStyle = '#39435c';
      ctx.beginPath();
      ctx.moveTo(x + 0.5, RULER_H - 9);
      ctx.lineTo(x + 0.5, RULER_H);
      ctx.stroke();
      if (step * pxPerSecond >= 40) {
        ctx.fillStyle = '#8d96ab';
        ctx.fillText(formatClock(time), x + 3, 4);
      }
    }
  }

  function drawAudio(size, peaks) {
    const row = rows.find((entry) => entry.type === 'audio');
    if (!row) return;
    ctx.fillStyle = '#0d1017';
    ctx.fillRect(0, row.y, size.width, row.h);
    ctx.strokeStyle = '#252c3d';
    ctx.beginPath();
    ctx.moveTo(0, row.y + row.h - 0.5);
    ctx.lineTo(size.width, row.y + row.h - 0.5);
    ctx.stroke();
    if (!peaks) return;
    const samplesPerSecond = peaks.sampleRate / peaks.block;
    const total = peaks.peaks.length / samplesPerSecond;
    if (!total) return;
    const middle = row.y + row.h / 2;
    const adjacent = Math.max(1, Math.round(samplesPerSecond / pxPerSecond));
    ctx.strokeStyle = '#3f6f8f';
    ctx.beginPath();
    for (let x = LABEL_W; x < size.width; x += 1) {
      const time = timeAt(x);
      if (time < 0 || time > total) continue;
      const index = Math.floor(time * samplesPerSecond);
      let max = 0;
      for (let i = index; i < Math.min(peaks.peaks.length, index + adjacent); i += 1) {
        if (peaks.peaks[i] > max) max = peaks.peaks[i];
      }
      const half = (row.h / 2 - 3) * Math.min(1, max * 1.4);
      ctx.moveTo(x + 0.5, middle - half);
      ctx.lineTo(x + 0.5, middle + half);
    }
    ctx.stroke();
    hitRegions.push({ type: 'audio', x: LABEL_W, y: row.y, w: size.width - LABEL_W, h: row.h });
  }

  function rounded(px, py, pw, ph, radius) {
    ctx.beginPath();
    ctx.moveTo(px + radius, py);
    ctx.lineTo(px + pw - radius, py);
    ctx.quadraticCurveTo(px + pw, py, px + pw, py + radius);
    ctx.lineTo(px + pw, py + ph - radius);
    ctx.quadraticCurveTo(px + pw, py + ph, px + pw - radius, py + ph);
    ctx.lineTo(px + radius, py + ph);
    ctx.quadraticCurveTo(px, py + ph, px, py + ph - radius);
    ctx.lineTo(px, py + radius);
    ctx.quadraticCurveTo(px, py, px + radius, py);
    ctx.closePath();
  }

  function categoryColor(cue) {
    const category = cue.meta && cue.meta.category;
    const table = SA.project.DEFAULT_CATEGORY_COLORS;
    const entry = category && table[category];
    return entry ? entry.tint : '#ff8a3d';
  }

  function trackHidden(track) {
    return !!(track && track.hidden);
  }

  // A track the timeline offers a remove button for. The two layer tracks
  // (foreground / background) are structural: their content is managed in the
  // Layers dialog, so they stay. The last subtitle track stays too.
  function removableTrack(track) {
    if (!track) return false;
    if (track.kind === 'subtitle') return trackList().filter((entry) => entry && entry.kind === 'subtitle').length > 1;
    return ['backdrop', 'filler', 'figure', 'textAnim'].includes(track.kind);
  }

  // Thin per-track header: name, visibility checkbox, a remove button and (for
  // subtitle tracks) the keyframe twisty.
  function drawTrackHeader(row, title, options) {
    const opts = options || {};
    const y = row.y;
    const height = row.h;
    const track = trackList().find((entry) => entry.id === row.trackId) || null;
    const removable = opts.toggle !== false && opts.removable !== false && removableTrack(track);
    const selected = (SA.store.state.selection.paths || []).some((path) => path === `track:${row.trackId}`);
    ctx.save();
    ctx.fillStyle = selected ? 'rgba(255, 138, 61, 0.1)' : opts.active ? 'rgba(255, 138, 61, 0.05)' : '#0d1017';
    ctx.fillRect(0, y, LABEL_W - 1, height);
    ctx.strokeStyle = '#1c2230';
    ctx.beginPath();
    ctx.moveTo(0, y + height - 0.5);
    ctx.lineTo(LABEL_W - 1, y + height - 0.5);
    ctx.stroke();
    ctx.font = '10px "Segoe UI", "Yu Gothic UI", Arial, sans-serif';
    ctx.textBaseline = 'middle';
    const labelX = opts.twisty ? 20 : 8;
    let textX = labelX;
    if (opts.swatch) {
      const swatchY = y + height / 2 - 4.5;
      ctx.save();
      ctx.fillStyle = opts.swatch;
      ctx.fillRect(labelX + 1, swatchY, 9, 9);
      ctx.strokeStyle = '#0b0d12';
      ctx.lineWidth = 1;
      ctx.strokeRect(labelX + 1.5, swatchY + 0.5, 8, 8);
      ctx.restore();
      textX = labelX + 14;
    }
    ctx.fillStyle = opts.hidden ? '#5a6175' : opts.color || '#8d96ab';
    const removeSize = 14;
    const removeX = LABEL_W - 20 - removeSize - 2;
    const reserve = (opts.toggle === false ? 6 : 22) + (removable ? removeSize + 4 : 0);
    const fullTitle = String(title == null ? '' : title);
    const titleText = fitLabel(title, LABEL_W - textX - reserve);
    ctx.fillText(titleText, textX, y + height / 2);
    labelRegions.push({
      x: textX,
      y,
      w: Math.max(1, LABEL_W - textX - reserve),
      h: height,
      text: fullTitle,
      clipped: titleText !== fullTitle,
    });
    ctx.restore();
    hitRegions.push({ type: 'track-header', trackId: row.trackId, x: 0, y, w: LABEL_W - 1, h: height });
    if (removable) {
      const cx = removeX + removeSize / 2;
      const cy = y + height / 2;
      ctx.save();
      ctx.strokeStyle = '#8d96ab';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - 3.5, cy - 3.5);
      ctx.lineTo(cx + 3.5, cy + 3.5);
      ctx.moveTo(cx + 3.5, cy - 3.5);
      ctx.lineTo(cx - 3.5, cy + 3.5);
      ctx.stroke();
      ctx.restore();
      hitRegions.push({ type: 'track-remove', trackId: row.trackId, x: removeX, y, w: removeSize, h: height });
    }
    if (opts.twisty) {
      const twistyX = 7;
      const twistyY = y + height / 2 - 2;
      ctx.save();
      ctx.fillStyle = opts.expanded ? '#ff8a3d' : '#8d96ab';
      ctx.beginPath();
      if (opts.expanded) {
        ctx.moveTo(twistyX, twistyY);
        ctx.lineTo(twistyX + 7, twistyY);
        ctx.lineTo(twistyX + 3.5, twistyY + 6);
      } else {
        ctx.moveTo(twistyX, twistyY);
        ctx.lineTo(twistyX + 6, twistyY + 3.5);
        ctx.lineTo(twistyX, twistyY + 7);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      hitRegions.push({ type: 'track-twisty', trackId: row.trackId, x: 2, y, w: 16, h: height });
    }
    if (opts.toggle !== false) {
      // a real checkbox: checked means "this track is drawn"
      const size = 9;
      const boxX = LABEL_W - 9 - size;
      const boxY = y + height / 2 - size / 2;
      ctx.save();
      ctx.strokeStyle = opts.hidden ? '#6b7386' : '#4dc8a0';
      ctx.fillStyle = opts.hidden ? 'transparent' : 'rgba(77, 200, 160, 0.16)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.rect(boxX, boxY, size, size);
      ctx.fill();
      ctx.stroke();
      if (!opts.hidden) {
        ctx.beginPath();
        ctx.moveTo(boxX + 2, boxY + size / 2);
        ctx.lineTo(boxX + size * 0.42, boxY + size - 2.2);
        ctx.lineTo(boxX + size - 1.6, boxY + 1.8);
        ctx.stroke();
      }
      ctx.restore();
      hitRegions.push({ type: opts.checkType || 'track-check', trackId: row.trackId, x: LABEL_W - 20, y, w: 20, h: height });
    }
  }

  function drawCueTrack(size, projectDoc, row) {
    const y = row.y;
    const height = ROW_H - 4;
    drawTrackHeader(row, trackTitle(row.track), {
      twisty: true,
      expanded: expanded.has(row.trackId),
      hidden: trackHidden(row.track),
      color: trackHidden(row.track) ? '#5a6175' : '#8d96ab',
    });
    const selectedCue = row.cues.find((cue) =>
      (SA.store.state.selection.paths || []).some((path) => path === `cue:${cue.id}` || path.startsWith(`cue:${cue.id}/`))
    );
    const beatStyles = projectDoc.beatStyles || {};
    ctx.save();
    ctx.beginPath();
    // time-based content is clipped to the right of the fixed header column
    ctx.rect(LABEL_W, RULER_H, Math.max(0, size.width - LABEL_W), size.height - RULER_H);
    ctx.clip();
    if (selectedCue) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 138, 61, 0.08)';
      ctx.fillRect(LABEL_W, y, Math.max(0, size.width - LABEL_W), row.h);
      ctx.restore();
    }
    for (const cue of row.cues) {
      const x = xOf(cue.start);
      const width = Math.max(2, (cue.end - cue.start) * pxPerSecond);
      if (x + width < LABEL_W || x > size.width) continue;
      const selected = (SA.store.state.selection.paths || []).some((path) => path === `cue:${cue.id}` || path.startsWith(`cue:${cue.id}/`));
      const warnings = (projectDoc.beatWarnings && projectDoc.beatWarnings[cue.id]) || [];
      const tint = categoryColor(cue);
      const cueDisabled = !!cue.disabled;
      if (cueDisabled) {
        ctx.save();
        ctx.globalAlpha = 0.42;
      }
      const textDimmed = trackHidden(row.track) || !!(row.track && row.track.textHidden);
      ctx.fillStyle = textDimmed ? 'rgba(21, 25, 36, 0.55)' : 'rgba(21, 25, 36, 0.92)';
      rounded(x, y + 2, width, height, 6);
      ctx.fill();
      ctx.strokeStyle = warnings.length ? '#ff5c5c' : selected ? '#ff8a3d' : tint;
      ctx.lineWidth = selected || warnings.length ? 1.6 : 1;
      ctx.stroke();

      const beats = beatsFor(projectDoc, cue);
      const inner = x + 3;
      const innerWidth = Math.max(0, width - 6);
      // pushed before the beats so a click on a beat block wins over the cue
      hitRegions.push({ type: 'cue', x, y, w: width, h: height, cueId: cue.id, trackId: row.trackId, edgeLeft: x, edgeRight: x + width });
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 2, y, width - 4, height + 4);
      ctx.clip();
      ctx.fillStyle = textDimmed ? 'rgba(233, 236, 244, 0.22)' : 'rgba(233, 236, 244, 0.45)';
      ctx.font = '11px "Segoe UI", "Yu Gothic UI", Arial, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText((cue.text || '').split('\n')[0], x + 6, y + 4);
      ctx.restore();
      let beatIndex = 0;
      for (const beat of beats) {
        const bx = inner + ((beat.start - cue.start) / Math.max(0.001, cue.end - cue.start)) * innerWidth;
        const bw = Math.max(1.5, ((beat.end - beat.start) / Math.max(0.001, cue.end - cue.start)) * innerWidth);
        if (bx + bw < 0 || bx > size.width) continue;
        const selectedBeat = (SA.store.state.selection.paths || []).includes(`cue:${cue.id}/beat:${beat.id}`);
        const beatDisabled = !cueDisabled && !!beat.disabled;
        if (beatDisabled) {
          ctx.save();
          ctx.globalAlpha = 0.38;
        }
        ctx.fillStyle = beat.pinned
          ? 'rgba(255, 138, 61, 0.34)'
          : beat.kind === 'recap'
            ? 'rgba(176, 107, 255, 0.28)'
            : beat.kind === 'repeat'
              ? 'rgba(77, 200, 255, 0.24)'
              : beat.kind === 'emphasis'
                ? 'rgba(255, 92, 138, 0.24)'
                : 'rgba(255, 255, 255, 0.10)';
        rounded(bx, y + 2, bw, height - 8, 3);
        ctx.fill();
        ctx.strokeStyle = selectedBeat ? '#ff8a3d' : 'rgba(255, 255, 255, 0.16)';
        ctx.lineWidth = selectedBeat ? 1.4 : 0.8;
        ctx.stroke();
        if (beatIndex > 0) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(bx + 0.5, y + 4);
          ctx.lineTo(bx + 0.5, y + height - 4);
          ctx.stroke();
        }
        if (beat.pinned) {
          ctx.fillStyle = '#ff8a3d';
          ctx.beginPath();
          ctx.arc(bx + 3, y + 5.5, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
        const hasMotions = !!(beatStyles[beat.id] && Array.isArray(beatStyles[beat.id].motions) && beatStyles[beat.id].motions.length);
        if (hasMotions) {
          ctx.fillStyle = '#4dc8ff';
          ctx.beginPath();
          ctx.arc(bx + bw - 3, y + 5.5, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
        if (bw > 26) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(bx + 3, y + 2, bw - 6, height - 8);
          ctx.clip();
          ctx.fillStyle = '#d6dbe9';
          ctx.font = '10px "Segoe UI", "Yu Gothic UI", Arial, sans-serif';
          ctx.textBaseline = 'middle';
          const label = beat.text ? beat.text.replace(/\s+/g, ' ').slice(0, Math.floor(bw / 6)) : t(`studio.beat.${beat.kind}`);
          ctx.fillText(label, bx + 4, y + height / 2 - 0.5);
          ctx.restore();
        }
        hitRegions.push({ type: 'beat', x: bx, y, w: bw, h: height, cueId: cue.id, beatId: beat.id, edgeLeft: bx, edgeRight: bx + bw, hasMotions });
        if (beatDisabled) ctx.restore();
        beatIndex += 1;
      }
      if (warnings.length) {
        ctx.fillStyle = '#ff5c5c';
        ctx.beginPath();
        ctx.moveTo(x + width - 11, y + 4);
        ctx.lineTo(x + width - 4, y + 4);
        ctx.lineTo(x + width - 7.5, y + 10);
        ctx.closePath();
        ctx.fill();
      }
      if (cueDisabled) ctx.restore();
    }
    ctx.restore();
  }

  function layerTypeLabel(layer) {
    if (layer.type === 'solid') return t('layers.typeSolid');
    if (layer.type === 'video') return t('layers.typeVideo');
    return t('layers.typeImage');
  }

  // The subtitle track's text-background row: the beats whose look draws a
  // shape behind the glyphs. Its checkbox is the track's `bgHidden` flag, the
  // off switch of the text background; the style data is never touched.
  function drawBackgroundTrack(size, doc, row) {
    const hidden = trackHidden(row.track) || !!(row.track && row.track.bgHidden);
    drawTrackHeader(row, `${trackTitle(row.track)} ${t('studio.track.textBackground')}`, {
      color: '#ffd166',
      hidden,
      removable: false,
      checkType: 'track-bg',
    });
    const y = row.y;
    const height = LAYER_H - 3;
    ctx.save();
    ctx.beginPath();
    ctx.rect(LABEL_W, RULER_H, Math.max(0, size.width - LABEL_W), size.height - RULER_H);
    ctx.clip();
    for (const cue of row.cues) {
      for (const span of backgroundSpans(doc, cue)) {
        const x = xOf(span.start);
        const width = Math.max(2, (span.end - span.start) * pxPerSecond);
        if (x + width < LABEL_W || x > size.width) continue;
        ctx.fillStyle = hidden ? 'rgba(30, 34, 44, 0.6)' : 'rgba(255, 209, 102, 0.24)';
        rounded(x, y + 1.5, width, height, 4);
        ctx.fill();
        ctx.strokeStyle = hidden ? '#3a4050' : '#ffd166';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // The subtitle track's graphics row: the frame-wide posts its look carries
  // (light leaks, vignette, camera ...). Its checkbox is the track's
  // `graphicsHidden` flag; the style data is never touched.
  function drawGraphicsTrack(size, doc, row) {
    const hidden = trackHidden(row.track) || !!(row.track && row.track.graphicsHidden);
    drawTrackHeader(row, `${trackTitle(row.track)} ${t('studio.track.graphics')}`, {
      color: '#c8a0ff',
      hidden,
      removable: false,
      checkType: 'track-graphics-check',
    });
    const y = row.y;
    const height = LAYER_H - 3;
    ctx.save();
    ctx.beginPath();
    ctx.rect(LABEL_W, RULER_H, Math.max(0, size.width - LABEL_W), size.height - RULER_H);
    ctx.clip();
    for (const cue of row.cues) {
      for (const span of graphicsSpans(doc, cue)) {
        const x = xOf(span.start);
        const width = Math.max(2, (span.end - span.start) * pxPerSecond);
        if (x + width < LABEL_W || x > size.width) continue;
        ctx.fillStyle = hidden ? 'rgba(30, 34, 44, 0.6)' : 'rgba(200, 160, 255, 0.28)';
        rounded(x, y + 1.5, width, height, 4);
        ctx.fill();
        ctx.strokeStyle = hidden ? '#3a4050' : '#c8a0ff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawLayerTrack(size, row) {
    const foreground = row.slot === 'foreground';
    const anyEnabled = row.layers.some((layer) => layer.enabled !== false);
    // the background track also owns the frame base colour: a set colour keeps
    // the track "visible" even without layers (the header shows a swatch)
    const baseColor = !foreground && row.track && row.track.color ? (typeof row.track.color === 'string' ? row.track.color : row.track.color.value) : null;
    // ... and the background clips the auto direction places on it: they are
    // content of the same track, so the header checkbox has to count them too
    const clips = foreground ? [] : clipsOnTrack(project(), row.trackId);
    if (row.first) {
      drawTrackHeader(row, trackTitle(row.track), {
        color: foreground ? '#4dc8a0' : '#4d8fc8',
        hidden: trackHidden(row.track) || !(anyEnabled || !!baseColor || clips.length > 0),
        swatch: baseColor,
      });
    }
    const y = row.y;
    const height = LAYER_H - 3;
    const total = Math.max(1, duration());
    ctx.save();
    ctx.beginPath();
    ctx.rect(LABEL_W, RULER_H, Math.max(0, size.width - LABEL_W), size.height - RULER_H);
    ctx.clip();
    for (const layer of row.layers) {
      const start = Math.max(0, layer.start == null ? 0 : layer.start);
      const end = layer.end == null ? Math.max(total, start + 1) : Math.max(start + 0.1, layer.end);
      const x = xOf(start);
      const width = Math.max(3, (end - start) * pxPerSecond);
      const selected = (SA.store.state.selection.paths || []).some((path) => path === `layer:${layer.id}`);
      const enabled = layer.enabled !== false;
      if (x + width < 0 || x > size.width) continue;
      ctx.fillStyle = enabled ? (foreground ? 'rgba(30, 64, 52, 0.92)' : 'rgba(28, 46, 74, 0.92)') : 'rgba(30, 34, 44, 0.7)';
      rounded(x, y + 1.5, width, height, 4);
      ctx.fill();
      ctx.strokeStyle = selected ? '#ff8a3d' : enabled ? (foreground ? '#4dc8a0' : '#4d8fc8') : '#4a5266';
      ctx.lineWidth = selected ? 1.6 : 1;
      if (!enabled) ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 2, y, width - 4, height + 3);
      ctx.clip();
      ctx.fillStyle = enabled ? '#d6dbe9' : '#8d96ab';
      ctx.font = '10px "Segoe UI", "Yu Gothic UI", Arial, sans-serif';
      ctx.textBaseline = 'middle';
      const label = `${foreground ? 'FG' : 'BG'} · ${layerTypeLabel(layer)}${layer.src || layer.type !== 'solid' ? '' : ` ${layer.color || ''}`}`;
      ctx.fillText(label, x + 5, y + height / 2 + 0.5);
      ctx.restore();
      hitRegions.push({ type: 'layer', x, y: row.y, w: width, h: LAYER_H, layerId: layer.id, edgeLeft: x, edgeRight: x + width });
    }
    ctx.restore();
  }

  const CLIP_COLORS = {
    none: ['rgba(40, 46, 60, 0.75)', '#5a6175'],
    solid: ['rgba(40, 70, 96, 0.85)', '#4d8fc8'],
    gradient: ['rgba(64, 56, 120, 0.85)', '#8a7cff'],
    noiseGradient: ['rgba(64, 56, 120, 0.85)', '#8a7cff'],
    card: ['rgba(90, 56, 128, 0.85)', '#b06bff'],
    cover: ['rgba(40, 88, 110, 0.85)', '#4dc8ff'],
    image: ['rgba(30, 96, 84, 0.85)', '#2ee6c0'],
    shapes: ['rgba(110, 66, 36, 0.9)', '#ff8a3d'],
    pattern: ['rgba(52, 92, 46, 0.9)', '#5fd44d'],
    particles: ['rgba(110, 66, 36, 0.9)', '#ffb26b'],
    spectrum: ['rgba(52, 92, 46, 0.9)', '#7ce0a4'],
    waveform: ['rgba(64, 56, 120, 0.9)', '#9db2ff'],
    sineWave: ['rgba(64, 56, 120, 0.9)', '#9db2ff'],
    countdown: ['rgba(110, 90, 36, 0.9)', '#ffd166'],
    progress: ['rgba(110, 90, 36, 0.9)', '#ffd166'],
    credits: ['rgba(90, 56, 128, 0.85)', '#b06bff'],
    cardPeek: ['rgba(90, 56, 128, 0.85)', '#b06bff'],
    instrumental: ['rgba(52, 74, 96, 0.85)', '#9db2ff'],
    nextLinePreview: ['rgba(52, 74, 96, 0.85)', '#9db2ff'],
    previousLineGhost: ['rgba(52, 74, 96, 0.85)', '#9db2ff'],
    combo: ['rgba(64, 56, 120, 0.85)', '#8a7cff'],
    split: ['rgba(96, 44, 110, 0.9)', '#c86bff'],
    figure: ['rgba(96, 44, 110, 0.9)', '#c86bff'],
    textAnim: ['rgba(110, 94, 36, 0.9)', '#e8c85a'],
  };

  // The text a textAnim clip shows in the timeline: tokens expanded, newlines
  // folded into one line.
  function expandedClipText(clip) {
    const raw = (clip && clip.spec && clip.spec.params && clip.spec.params.text) || '';
    if (!SA.fillerRender || typeof SA.fillerRender.expandTokens !== 'function') return String(raw).replace(/\s+/g, ' ');
    const doc = project();
    const settings = SA.credits && SA.credits.settingsFor ? SA.credits.settingsFor(doc) : null;
    const cues = cueList();
    const next = cues.find((cue) => cue.start >= clip.end - 1e-4);
    const previous = [...cues].reverse().find((cue) => cue.end <= clip.start + 1e-4);
    return SA.fillerRender
      .expandTokens(raw, {
        meta: {
          title: settings && doc ? SA.credits.titleText(doc, settings) : '',
          artist: settings && doc ? SA.credits.artistText(doc, settings) : '',
        },
        nextText: next ? next.text : '',
        prevText: previous ? previous.text : '',
      })
      .replace(/\s+/g, ' ');
  }

  function clipTypeLabel(clip) {
    const spec = (clip && clip.spec) || {};
    const type = spec.type || 'none';
    // a preset shows its library name, a hand-made combo its layer types
    if (spec.presetId) {
      const user = SA.fillerLibrary && SA.fillerLibrary.get ? SA.fillerLibrary.get(spec.presetId) : null;
      if (user) return user.name;
      const preset = SA.fillerPresets && SA.fillerPresets.get ? SA.fillerPresets.get(spec.presetId) : null;
      if (preset) return SA.fillerPresets.labelFor(preset, SA.i18n.lang());
    }
    // a text-animation clip shows its own text, a figure clip its motif
    if (type === 'textAnim') return expandedClipText(clip);
    if (type === 'combo' && SA.fillerRender) {
      const layers = SA.fillerRender.layersOf(spec);
      if (layers.length) return layers.map((layer) => fillerTypeLabel(layer.type)).join(' + ');
    }
    if (type === 'figure' && spec.params && spec.params.motif) return SA.controls ? SA.controls.prettify(spec.params.motif) : spec.params.motif;
    const translated = t(`filler.type.${type}`);
    if (translated !== `filler.type.${type}`) return translated;
    return SA.controls ? SA.controls.prettify(type) : String(type);
  }

  function isClipDisabled(clip) {
    if (!clip) return false;
    if (clip.disabled || clip.enabled === false) return true;
    const params = clip.spec && clip.spec.params;
    if (params && (params.disabled || params.enabled === false)) return true;
    return false;
  }

  // One generic renderer for backdrop / filler / background clips.
  function drawClipTrack(size, row) {
    if (row.first) {
      const colors = { background: '#4d8fc8', backdrop: '#ff8a3d', filler: '#4dc8a0', figure: '#c86bff', textAnim: '#e8c85a' };
      drawTrackHeader(row, trackTitle(row.track), { color: colors[row.kind] || '#8d96ab', hidden: trackHidden(row.track) });
    }
    const y = row.y;
    const height = LAYER_H - 3;
    ctx.save();
    ctx.beginPath();
    ctx.rect(LABEL_W, RULER_H, Math.max(0, size.width - LABEL_W), size.height - RULER_H);
    ctx.clip();
    for (const clip of row.clips) {
      const x = xOf(clip.start);
      const width = Math.max(3, (clip.end - clip.start) * pxPerSecond);
      if (x + width < 0 || x > size.width) continue;
      const selected = (SA.store.state.selection.paths || []).some((path) => path === `clip:${clip.id}`);
      const disabled = isClipDisabled(clip);
      const fill = CLIP_COLORS[(clip.spec && clip.spec.type) || 'none'] || CLIP_COLORS.none;
      ctx.fillStyle = disabled || trackHidden(row.track) ? 'rgba(30, 34, 44, 0.6)' : fill[0];
      rounded(x, y + 1.5, width, height, 4);
      ctx.fill();
      ctx.strokeStyle = selected ? '#ff8a3d' : (disabled ? '#4a5266' : fill[1]);
      ctx.lineWidth = selected ? 1.6 : 1;
      if (disabled) ctx.setLineDash([3, 3]);
      ctx.stroke();
      if (disabled) ctx.setLineDash([]);
      // fade wedges show the envelope
      const fadeIn = Math.max(0, Number(clip.fadeIn) || 0);
      const fadeOut = Math.max(0, Number(clip.fadeOut) || 0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 1, y + 1.5, width - 2, height);
      ctx.clip();
      ctx.fillStyle = 'rgba(11, 13, 18, 0.45)';
      if (fadeIn > 1e-4) {
        const fw = Math.max(2, fadeIn * pxPerSecond);
        ctx.beginPath();
        ctx.moveTo(x, y + 1.5);
        ctx.lineTo(x + Math.min(fw, width), y + 1.5);
        ctx.lineTo(x, y + height + 1.5);
        ctx.closePath();
        ctx.fill();
      }
      if (fadeOut > 1e-4) {
        const fw = Math.max(2, fadeOut * pxPerSecond);
        ctx.beginPath();
        ctx.moveTo(x + width, y + 1.5);
        ctx.lineTo(x + width - Math.min(fw, width), y + 1.5);
        ctx.lineTo(x + width, y + height + 1.5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      if (width > 34) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 3, y, width - 6, height);
        ctx.clip();
        ctx.fillStyle = disabled ? '#8d96ab' : '#d6dbe9';
        ctx.font = '10px "Segoe UI", "Yu Gothic UI", Arial, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(clipTypeLabel(clip), x + 6, y + height / 2 + 0.5);
        ctx.restore();
      }
      hitRegions.push({ type: 'clip', x, y, w: width, h: LAYER_H, clipId: clip.id, trackId: row.trackId, kind: row.kind, edgeLeft: x, edgeRight: x + width });
    }
    // a drag on an animation track's empty span creates a clip (the region is
    // pushed before the clip hits, so dragging a clip still moves it)
    if (CREATABLE_CLIP_KINDS.includes(row.kind)) {
      hitRegions.unshift({ type: 'track-empty', trackId: row.trackId, kind: row.kind, x: LABEL_W, y: row.y, w: 100000, h: LAYER_H });
    }
    if (drag && drag.type === 'clip-create' && drag.trackId === row.trackId) {
      const from = Math.min(drag.from, drag.to);
      const to = Math.max(drag.from, drag.to);
      const x0 = xOf(from);
      const width = Math.max(3, (to - from) * pxPerSecond);
      ctx.save();
      ctx.fillStyle = 'rgba(255, 138, 61, 0.18)';
      ctx.strokeStyle = '#ff8a3d';
      ctx.setLineDash([4, 3]);
      ctx.fillRect(x0, y + 1.5, width, height);
      ctx.strokeRect(x0, y + 1.5, width, height);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawCredits(size, row) {
    const clips = creditClips();
    drawTrackHeader({ ...row, trackId: 'credits' }, t('credits.track'), { toggle: false, color: '#b06bff' });
    ctx.save();
    ctx.beginPath();
    ctx.rect(LABEL_W, row.y, Math.max(0, size.width - LABEL_W), row.h);
    ctx.clip();
    for (const clip of clips) {
      const x = xOf(clip.start);
      const w = Math.max(3, (clip.end - clip.start) * pxPerSecond);
      if (x + w < 0 || x > size.width) continue;
      const selected = (SA.store.state.selection.paths || []).some((path) => path === `credit:${clip.mode}`);
      ctx.fillStyle = clip.mode === 'end' ? 'rgba(58, 44, 30, 0.92)' : clip.mode === 'always' ? 'rgba(30, 52, 44, 0.9)' : 'rgba(44, 32, 64, 0.92)';
      rounded(x, row.y + 2, w, row.h - 5, 4);
      ctx.fill();
      ctx.strokeStyle = selected ? '#ff8a3d' : clip.mode === 'end' ? '#ffc247' : clip.mode === 'always' ? '#4dc8a0' : '#b06bff';
      ctx.lineWidth = selected ? 1.6 : 1;
      ctx.stroke();
      if (w > 34) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 3, row.y, w - 6, row.h);
        ctx.clip();
        ctx.fillStyle = '#d6dbe9';
        ctx.font = '10px "Segoe UI", "Yu Gothic UI", Arial, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(creditModeLabel(clip.mode), x + 6, row.y + row.h / 2 + 0.5);
        ctx.restore();
      }
      hitRegions.push({ type: 'credit', x, y: row.y, w, h: row.h, mode: clip.mode });
    }
    ctx.restore();
  }

  function laneLabel(path) {
    const parts = String(path).split('/');
    const tail = parts.slice(1).map((part) => part.replace(':', ' ')).join(' · ');
    return tail || path;
  }

  function drawLane(size, row) {
    const doc = project();
    if (row.type === 'lane-empty') {
      ctx.fillStyle = '#0d1017';
      ctx.fillRect(LABEL_W, row.y, Math.max(0, size.width - LABEL_W), row.h);
      ctx.fillStyle = '#5d6785';
      ctx.font = '10px "Segoe UI", Arial, sans-serif';
      ctx.textBaseline = 'middle';
      const emptyText = t('studio.timeline.noKeys');
      const emptyLabel = fitLabel(emptyText, LABEL_W - 16);
      ctx.fillText(emptyLabel, 8, row.y + row.h / 2);
      labelRegions.push({ x: 0, y: row.y, w: LABEL_W - 1, h: row.h, text: emptyText, clipped: emptyLabel !== emptyText });
      return;
    }
    const cue = cueList().find((entry) => entry.id === row.cueId);
    if (!cue) return;
    const track = ((doc.keyframes[row.path] || {})[row.propPath] || []).slice();
    ctx.fillStyle = row.y % 2 === 0 ? '#0f121a' : '#0d1017';
    ctx.fillRect(LABEL_W, row.y, Math.max(0, size.width - LABEL_W), row.h);
    ctx.strokeStyle = '#1c2230';
    ctx.beginPath();
    ctx.moveTo(0, row.y + row.h - 0.5);
    ctx.lineTo(size.width, row.y + row.h - 0.5);
    ctx.stroke();
    const start = xOf(cue.start);
    const end = xOf(cue.end);
    ctx.save();
    ctx.beginPath();
    ctx.rect(LABEL_W, row.y, Math.max(0, size.width - LABEL_W), row.h);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.strokeRect(start, row.y + 2, Math.max(2, end - start), row.h - 4);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = '#6f7a94';
    ctx.font = '10px "Segoe UI", Arial, sans-serif';
    ctx.textBaseline = 'middle';
    const fullLane = `${laneLabel(row.path)} · ${SA.controls ? SA.controls.labelFor(row.propPath.split('.').pop()) : row.propPath}`;
    const laneText = fitLabel(fullLane, LABEL_W - 16);
    ctx.fillText(laneText, 8, row.y + row.h / 2);
    labelRegions.push({ x: 0, y: row.y, w: LABEL_W - 1, h: row.h, text: fullLane, clipped: laneText !== fullLane });
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(LABEL_W, row.y, Math.max(0, size.width - LABEL_W), row.h);
    ctx.clip();
    const segments = [];
    const middle = row.y + row.h / 2;
    for (let i = 0; i < track.length; i += 1) {
      const key = track[i];
      const x = xOf(row.origin + key.t);
      if (i > 0) {
        const previous = track[i - 1];
        const px = xOf(row.origin + previous.t);
        segments.push({ x0: px, x1: x });
      }
      const selected = selectedKeys.has(`${row.path}|${row.propPath}|${i}`);
      ctx.save();
      ctx.translate(x, middle);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = selected ? '#ff8a3d' : '@' === key.ease || key.ease === 'hold' ? '#4dc8ff' : '#d6dbe9';
      ctx.strokeStyle = '#0b0d12';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(-KEY_SIZE, -KEY_SIZE, KEY_SIZE * 2, KEY_SIZE * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      keyRegions.push({ x, y: middle, path: row.path, propPath: row.propPath, index: i, cueId: row.cueId, origin: row.origin, key });
    }
    ctx.save();
    ctx.strokeStyle = 'rgba(214, 219, 233, 0.25)';
    ctx.lineWidth = 1;
    for (const segment of segments) {
      ctx.beginPath();
      ctx.moveTo(segment.x0, middle);
      ctx.lineTo(segment.x1, middle);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
    hitRegions.push({ type: 'lane', x: 0, y: row.y, w: size.width, h: row.h, cueId: row.cueId, path: row.path, propPath: row.propPath, origin: row.origin });
  }

  function drawMarkers(size) {
    const doc = project();
    const maxDuration = doc.output && doc.output.maxDuration;
    if (maxDuration && maxDuration > 0) {
      const limitX = xOf(maxDuration);
      if (limitX >= LABEL_W - 1 && limitX <= size.width + 1) {
        ctx.save();
        ctx.strokeStyle = '#ff8a3d';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(limitX, RULER_H);
        ctx.lineTo(limitX, size.height);
        ctx.stroke();
        ctx.restore();
      }
    }
    for (const marker of doc.markers || []) {
      const x = xOf(marker.t);
      if (x < LABEL_W || x > size.width + 10) continue;
      ctx.fillStyle = '#4dc8ff';
      ctx.beginPath();
      ctx.moveTo(x, RULER_H - 12);
      ctx.lineTo(x + 4, RULER_H - 8);
      ctx.lineTo(x, RULER_H - 4);
      ctx.lineTo(x - 4, RULER_H - 8);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Runs draw helpers against a specific canvas while keeping the absolute
  // row coordinates used everywhere else.
  function withCtx(target, run) {
    const previous = ctx;
    ctx = target;
    try {
      run();
    } finally {
      ctx = previous;
    }
  }

  function drawPlayhead(size, yEnd, head) {
    const playheadX = xOf(SA.store.state.playhead);
    if (playheadX < LABEL_W || playheadX > size.width + 1) return;
    ctx.strokeStyle = '#ff4d4d';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(playheadX + 0.5, head ? 2 : 0);
    ctx.lineTo(playheadX + 0.5, yEnd);
    ctx.stroke();
    if (!head) return;
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath();
    ctx.moveTo(playheadX - 5, 2);
    ctx.lineTo(playheadX + 5, 2);
    ctx.lineTo(playheadX, 10);
    ctx.closePath();
    ctx.fill();
  }

  function updateZoomBounds() {
    if (!el.zoom) return;
    const min = Math.max(1, Math.floor(minZoom()));
    if (Number(el.zoom.min) !== min) el.zoom.min = String(min);
    if (pxPerSecond < minZoom() - 1e-9) pxPerSecond = minZoom();
    if (Number(el.zoom.value) !== Math.round(pxPerSecond)) el.zoom.value = String(Math.round(pxPerSecond));
    if (el.zoomLabel) el.zoomLabel.textContent = `${Math.round(pxPerSecond)} px/s`;
  }

  function updateHScroll() {
    if (!el.hscroll || !el.hscrollThumb) return;
    const content = timeContentWidth();
    const view = timeViewWidth();
    if (content <= view + 1) {
      el.hscroll.hidden = true;
      return;
    }
    // unhide before measuring: a hidden element has no layout width
    el.hscroll.hidden = false;
    const track = el.hscroll.clientWidth;
    if (track <= 0) return;
    const ratio = Math.max(0.05, Math.min(1, view / content));
    const thumbLength = Math.max(24, Math.round(ratio * track));
    const travel = Math.max(1, track - thumbLength);
    const maxScroll = maxScrollX();
    const position = maxScroll > 0 ? Math.round((scrollX / maxScroll) * travel) : 0;
    el.hscrollThumb.style.width = `${thumbLength}px`;
    el.hscrollThumb.style.transform = `translateX(${position}px)`;
  }

  function draw() {
    if (!ctx) return;
    labelRegions = [];
    const size = resize();
    updateZoomBounds();
    updateHScroll();
    if (!project()) {
      hideLabelTip();
      if (rulerCtx) {
        rulerCtx.clearRect(0, 0, size.width, fixedHeight);
        rulerCtx.fillStyle = '#10131b';
        rulerCtx.fillRect(0, 0, size.width, fixedHeight);
      }
      ctx.clearRect(0, 0, size.width, size.height);
      ctx.fillStyle = '#10131b';
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.fillStyle = '#8d96ab';
      ctx.font = '12px "Segoe UI", Arial, sans-serif';
      ctx.fillText(t('studio.timeline.empty'), 12, 16);
      return;
    }
    const doc = project();
    hitRegions = [];
    keyRegions = [];
    const peaks = SA.preview && SA.preview.getPeaks ? SA.preview.getPeaks() : null;
    // fixed part: ruler and audio stay visible while the rows scroll
    if (el.rulerCanvas && rulerCtx) {
      rulerCtx.clearRect(0, 0, size.width, fixedHeight);
      rulerCtx.fillStyle = '#10131b';
      rulerCtx.fillRect(0, 0, size.width, fixedHeight);
      withCtx(rulerCtx, () => {
        drawRuler(size);
        drawAudio(size, peaks);
        drawMarkers(size);
        drawPlayhead(size, fixedHeight, true);
      });
      // fixed label column on top of the ruler
      rulerCtx.fillStyle = '#0d1017';
      rulerCtx.fillRect(0, 0, LABEL_W, fixedHeight);
      rulerCtx.strokeStyle = '#252c3d';
      rulerCtx.beginPath();
      rulerCtx.moveTo(LABEL_W - 0.5, 0);
      rulerCtx.lineTo(LABEL_W - 0.5, fixedHeight);
      rulerCtx.stroke();
    }
    // scrollable part: every row is drawn with the shared absolute coordinates
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = '#10131b';
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.save();
    ctx.translate(0, -fixedHeight);
    // fixed label column background and separator (labels are drawn on top)
    ctx.fillStyle = '#0d1017';
    ctx.fillRect(0, 0, LABEL_W, size.height);
    ctx.strokeStyle = '#252c3d';
    ctx.beginPath();
    ctx.moveTo(LABEL_W - 0.5, 0);
    ctx.lineTo(LABEL_W - 0.5, size.height);
    ctx.stroke();
    for (const row of rows) {
      if (row.type === 'cue-track') drawCueTrack(size, doc, row);
      else if (row.type === 'bg-track') drawBackgroundTrack(size, doc, row);
      else if (row.type === 'graphics-track') drawGraphicsTrack(size, doc, row);
      else if (row.type === 'layer-track') drawLayerTrack(size, row);
      else if (row.type === 'clip-track') drawClipTrack(size, row);
      else if (row.type === 'credits') drawCredits(size, row);
      else if (row.type === 'lane' || row.type === 'lane-empty') drawLane(size, row);
    }
    drawMarkers(size);
    drawPlayhead(size, size.height, false);
    ctx.restore();
  }

  // --- interactions ------------------------------------------------------------

  function localPoint(event) {
    const target = event.currentTarget === el.rulerCanvas ? el.rulerCanvas : el.canvas;
    const rect = target.getBoundingClientRect();
    const offset = target === el.rulerCanvas ? 0 : fixedHeight;
    return { x: event.clientX - rect.left, y: event.clientY - rect.top + offset };
  }

  function keyAt(point) {
    for (let i = keyRegions.length - 1; i >= 0; i -= 1) {
      const region = keyRegions[i];
      if (Math.abs(point.x - region.x) <= KEY_SIZE + 2 && Math.abs(point.y - region.y) <= KEY_SIZE + 2) return region;
    }
    return null;
  }

  function hitTest(point) {
    const ruler = rows.find((row) => row.type === 'ruler');
    if (ruler && point.y < RULER_H && point.x >= LABEL_W) return { type: 'ruler' };
    const key = keyAt(point);
    if (key) return { type: 'key', ...key };
    // cue / layer / clip edges win over the beat edges that sit on them, so the
    // clip length can be dragged even when beats cover the whole clip
    if (point.x >= LABEL_W) {
      for (const region of hitRegions) {
        if (point.y < region.y || point.y > region.y + region.h) continue;
        if (point.x < region.x - 2 || point.x > region.x + region.w + 2) continue;
        if (region.type === 'cue') {
          if (Math.abs(point.x - region.edgeLeft) <= 4) return { type: 'cue-edge', cueId: region.cueId, edge: 'start' };
          if (Math.abs(point.x - region.edgeRight) <= 4) return { type: 'cue-edge', cueId: region.cueId, edge: 'end' };
        }
        if (region.type === 'clip') {
          if (Math.abs(point.x - region.edgeLeft) <= 4) return { type: 'clip-edge', clipId: region.clipId, kind: region.kind, edge: 'start' };
          if (Math.abs(point.x - region.edgeRight) <= 4) return { type: 'clip-edge', clipId: region.clipId, kind: region.kind, edge: 'end' };
        }
      }
    }
    let found = null;
    for (const region of hitRegions) {
      if (point.y < region.y || point.y > region.y + region.h) continue;
      if (point.x < region.x - 2 || point.x > region.x + region.w + 2) continue;
      if (region.type === 'beat') {
        if (Math.abs(point.x - region.edgeLeft) <= 3) return { type: 'divider', cueId: region.cueId, beatId: region.beatId, edge: 'start' };
        if (Math.abs(point.x - region.edgeRight) <= 3) return { type: 'divider', cueId: region.cueId, beatId: region.beatId, edge: 'end' };
      }
      if (region.type === 'cue') {
        if (Math.abs(point.x - region.edgeLeft) <= 4) return { type: 'cue-edge', cueId: region.cueId, edge: 'start' };
        if (Math.abs(point.x - region.edgeRight) <= 4) return { type: 'cue-edge', cueId: region.cueId, edge: 'end' };
      }
      if (region.type === 'layer') {
        if (Math.abs(point.x - region.edgeLeft) <= 4) return { type: 'layer-edge', layerId: region.layerId, edge: 'start' };
        if (Math.abs(point.x - region.edgeRight) <= 4) return { type: 'layer-edge', layerId: region.layerId, edge: 'end' };
      }
      found = region;
    }
    return found || { type: 'empty' };
  }

  // drags that change the project are wrapped in one history transaction, so a
  // pointerup is a single undo step no matter how many pointermove commands ran
  const TRANSACTION_DRAGS = {
    'clip-move': 'move clip',
    'clip-edge': 'trim clip',
    divider: 'move beat edge',
    'cue-edge': 'trim cue',
    'cue-move': 'move cue',
    'layer-move': 'move layer',
    'layer-edge': 'trim layer',
    key: 'move keyframe',
  };

  function onPointerDown(event) {
    if (event.button !== 0) return;
    hideMenu();
    hideLabelTip();
    const point = localPoint(event);
    const hit = hitTest(point);
    if (event.shiftKey && (hit.type === 'lane' || hit.type === 'empty')) {
      drag = { type: 'box', start: point, additive: true };
      try {
        if (event.currentTarget) event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* synthetic */
      }
      return;
    }
    if (!event.shiftKey) selectedKeys.clear();
    try {
      if (event.currentTarget) event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* synthetic */
    }
    if (hit.type === 'ruler') {
      drag = { type: 'scrub' };
      SA.preview.seek(snapFrame(timeAt(point.x)));
    } else if (hit.type === 'audio') {
      drag = { type: 'scrub' };
      SA.preview.seek(snapFrame(timeAt(point.x)));
    } else if (hit.type === 'track-twisty') {
      if (expanded.has(hit.trackId)) expanded.delete(hit.trackId);
      else expanded.add(hit.trackId);
      drag = null;
      draw();
    } else if (hit.type === 'track-header') {
      SA.store.setSelection([`track:${hit.trackId}`], 'track');
      drag = null;
    } else if (hit.type === 'track-check') {
      const track = trackList().find((entry) => entry.id === hit.trackId);
      if (track && (track.kind === 'foreground' || track.kind === 'background')) {
        // layer tracks toggle every layer of their slot; a hidden track (or a
        // disabled layer) means the next click shows it
        const slot = track.kind;
        const layers = layerList(slot);
        const show = !!track.hidden || layers.some((layer) => layer.enabled === false);
        const next = ((project().layers) || []).map((layer) => ((layer.slot || 'background') === slot ? { ...layer, enabled: show } : layer));
        SA.store.commands.setLayers(next);
        // the background track also owns its clips: the same checkbox hides
        // them (the auto direction places the song's background here)
        if (track.kind === 'background') SA.store.commands.updateTrack(hit.trackId, { hidden: !show });
      } else if (track) {
        SA.store.commands.updateTrack(hit.trackId, { hidden: !track.hidden });
      }
      drag = null;
      draw();
    } else if (hit.type === 'track-graphics-check') {
      const track = trackList().find((entry) => entry.id === hit.trackId);
      if (track && track.kind === 'subtitle') SA.store.commands.updateTrack(hit.trackId, { graphicsHidden: !track.graphicsHidden });
      drag = null;
      draw();
    } else if (hit.type === 'track-bg') {
      const track = trackList().find((entry) => entry.id === hit.trackId);
      if (track && track.kind === 'subtitle') SA.store.commands.updateTrack(hit.trackId, { bgHidden: !track.bgHidden });
      drag = null;
      draw();
    } else if (hit.type === 'track-remove') {
      const track = trackList().find((entry) => entry.id === hit.trackId);
      if (track && removableTrack(track)) SA.store.commands.removeTrack(hit.trackId);
      drag = null;
      draw();
    } else if (hit.type === 'track-empty' && CREATABLE_CLIP_KINDS.includes(hit.kind)) {
      // dragging on an animation track creates a clip for that span
      const at = Math.max(0, timeAt(point.x));
      drag = { type: 'clip-create', trackId: hit.trackId, kind: hit.kind, from: at, to: at };
    } else if (hit.type === 'clip') {
      SA.store.setSelection([`clip:${hit.clipId}`], 'clip');
      const doc = project();
      const clip = ((doc && doc.clips) || []).find((entry) => entry.id === hit.clipId);
      drag = clip ? { type: 'clip-move', clipId: clip.id, start: timeAt(point.x), original: { start: clip.start, end: clip.end } } : null;
    } else if (hit.type === 'clip-edge') {
      const doc = project();
      const clip = ((doc && doc.clips) || []).find((entry) => entry.id === hit.clipId);
      if (clip) drag = { type: 'clip-edge', clipId: clip.id, edge: hit.edge, original: { start: clip.start, end: clip.end } };
    } else if (hit.type === 'divider') {
      drag = { type: 'divider', cueId: hit.cueId, beatId: hit.beatId, edge: hit.edge };
    } else if (hit.type === 'cue-edge') {
      const cue = cueList().find((entry) => entry.id === hit.cueId);
      drag = { type: 'cue-edge', cueId: hit.cueId, edge: hit.edge, original: cue ? { ...cue } : null };
    } else if (hit.type === 'cue') {
      SA.store.setSelection([`cue:${hit.cueId}`], 'cue');
      const cue = cueList().find((entry) => entry.id === hit.cueId);
      if (cue) drag = { type: 'cue-move', cueId: hit.cueId, trackId: cue.trackId || 'sub1', start: timeAt(point.x), original: { ...cue } };
    } else if (hit.type === 'layer-eye') {
      const layer = ((project().layers) || []).find((entry) => entry.id === hit.layerId);
      if (layer) SA.store.commands.setLayer(hit.layerId, { enabled: layer.enabled === false });
      drag = null;
      draw();
    } else if (hit.type === 'layer-edge') {
      const layer = ((project().layers) || []).find((entry) => entry.id === hit.layerId);
      if (layer) drag = { type: 'layer-edge', layerId: hit.layerId, edge: hit.edge, original: { ...layer } };
    } else if (hit.type === 'layer') {
      SA.store.setSelection([`layer:${hit.layerId}`], 'layer');
      const layer = ((project().layers) || []).find((entry) => entry.id === hit.layerId);
      if (layer) drag = { type: 'layer-move', layerId: hit.layerId, start: timeAt(point.x), original: { start: layer.start, end: layer.end } };
    } else if (hit.type === 'filler') {
      SA.store.setSelection([`filler:${hit.key}`], 'filler');
      drag = null;
      draw();
    } else if (hit.type === 'credit') {
      SA.store.setSelection([`credit:${hit.mode}`], 'credit');
      drag = null;
      draw();
    } else if (hit.type === 'beat') {
      SA.store.setSelection([`cue:${hit.cueId}/beat:${hit.beatId}`], 'beat');
      // dragging a beat block moves the whole cue, so moving still feels natural
      const cue = cueList().find((entry) => entry.id === hit.cueId);
      if (cue) drag = { type: 'cue-move', cueId: hit.cueId, start: timeAt(point.x), original: { ...cue } };
    } else if (hit.type === 'key') {
      selectedKeys.add(`${hit.path}|${hit.propPath}|${hit.index}`);
      SA.store.setSelection([hit.path], hit.path.includes('/letter:') ? 'letter' : hit.path.includes('/word:') ? 'word' : hit.path.includes('/line:') ? 'line' : 'beat');
      drag = { type: 'key', path: hit.path, propPath: hit.propPath, index: hit.index, origin: hit.origin, key: { ...hit.key } };
      draw();
    } else if (hit.type === 'lane') {
      SA.store.setSelection([hit.path], hit.path.includes('/letter:') ? 'letter' : hit.path.includes('/word:') ? 'word' : hit.path.includes('/line:') ? 'line' : 'beat');
    } else {
      SA.store.setSelection([], null);
    }
    if (drag && TRANSACTION_DRAGS[drag.type] && SA.store.beginTransaction) {
      SA.store.beginTransaction(TRANSACTION_DRAGS[drag.type]);
      drag.transaction = true;
    }
  }

  function updateCursor(event) {
    const target = event.currentTarget;
    if (!target || !target.style) return;
    const point = localPoint(event);
    const hit = hitTest(point);
    let cursor = 'default';
    if (hit.type === 'cue-edge' || hit.type === 'clip-edge' || hit.type === 'divider' || hit.type === 'layer-edge' || hit.type === 'ruler' || hit.type === 'audio') cursor = 'ew-resize';
    else if (hit.type === 'cue' || hit.type === 'beat' || hit.type === 'layer' || hit.type === 'clip' || hit.type === 'credit') cursor = 'pointer';
    else if (hit.type === 'track-check' || hit.type === 'track-graphics-check' || hit.type === 'track-bg' || hit.type === 'track-remove' || hit.type === 'track-twisty' || hit.type === 'track-header') cursor = 'pointer';
    if (target.style.cursor !== cursor) target.style.cursor = cursor;
  }

  // --- row label tooltip -------------------------------------------------------

  function hideLabelTip() {
    if (el.tip && !el.tip.hidden) {
      el.tip.hidden = true;
      el.tip.textContent = '';
    }
  }

  function labelAt(point) {
    for (let i = labelRegions.length - 1; i >= 0; i -= 1) {
      const region = labelRegions[i];
      if (point.x < region.x || point.x > region.x + region.w) continue;
      if (point.y < region.y || point.y > region.y + region.h) continue;
      return region;
    }
    return null;
  }

  // Shows the full text of a truncated row label while the pointer rests on the
  // fixed label column.
  function updateLabelTip(event) {
    if (!el.tip || event.currentTarget !== el.canvas) {
      hideLabelTip();
      return;
    }
    const point = localPoint(event);
    const region = point.x <= LABEL_W ? labelAt(point) : null;
    if (!region || !region.clipped) {
      hideLabelTip();
      return;
    }
    if (el.tip.textContent !== region.text) {
      el.tip.textContent = region.text;
      el.tip.hidden = false;
      tipSize = { w: el.tip.offsetWidth || 0, h: el.tip.offsetHeight || 0 };
    } else if (el.tip.hidden) {
      el.tip.hidden = false;
    }
    const bodyRect = el.body ? el.body.getBoundingClientRect() : null;
    if (!bodyRect) return;
    const maxLeft = Math.max(4, (bodyRect.width || 0) - tipSize.w - 6);
    const maxTop = Math.max(4, (bodyRect.height || 0) - tipSize.h - 6);
    const left = Math.max(4, Math.min(event.clientX - bodyRect.left + 14, maxLeft));
    const top = Math.max(4, Math.min(event.clientY - bodyRect.top + 16, maxTop));
    el.tip.style.left = `${left}px`;
    el.tip.style.top = `${top}px`;
  }

  function onPointerMove(event) {
    if (!drag) {
      updateCursor(event);
      updateLabelTip(event);
      return;
    }
    const point = localPoint(event);
    if (drag.type === 'scrub') {
      SA.preview.seek(snapFrame(timeAt(point.x)));
    } else if (drag.type === 'box') {
      drag.current = point;
      draw();
      ctx.save();
      ctx.translate(0, -fixedHeight);
      ctx.strokeStyle = '#ff8a3d';
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(Math.min(drag.start.x, point.x), Math.min(drag.start.y, point.y), Math.abs(point.x - drag.start.x), Math.abs(point.y - drag.start.y));
      ctx.restore();
    } else if (drag.type === 'divider') {
      SA.store.commands.moveBeatEdge(drag.cueId, drag.beatId, drag.edge, snapTime(timeAt(point.x)), { coalesceKey: `beat:${drag.beatId}:${drag.edge}` });
    } else if (drag.type === 'cue-move' && drag.original) {
      const row = rows.find((entry) => entry.type === 'cue-track' && point.y >= entry.y && point.y <= entry.y + entry.h);
      if (row && row.trackId !== drag.trackId) {
        SA.store.commands.setCueTrack(drag.cueId, row.trackId);
        drag.trackId = row.trackId;
      }
      const delta = timeAt(point.x) - drag.start;
      const next = Math.max(0, snapTime(drag.original.start + delta, { cueId: drag.cueId }));
      SA.store.commands.moveCue(drag.cueId, next, { coalesceKey: `cue:${drag.cueId}:move` });
    } else if (drag.type === 'clip-move' && drag.original) {
      const delta = timeAt(point.x) - drag.start;
      const next = Math.max(0, snapTime(drag.original.start + delta));
      SA.store.commands.moveClip(drag.clipId, next, { coalesceKey: `clip:${drag.clipId}:move` });
    } else if (drag.type === 'clip-create') {
      drag.to = Math.max(0, snapTime(timeAt(point.x)));
      draw();
    } else if (drag.type === 'clip-edge' && drag.original) {
      const time = snapTime(timeAt(point.x));
      SA.store.commands.trimClip(drag.clipId, drag.edge, time, { coalesceKey: `clip:${drag.clipId}:trim:${drag.edge}` });
    } else if (drag.type === 'cue-edge' && drag.original) {
      const time = drag.edge === 'start' ? Math.max(0, snapTime(timeAt(point.x), { cueId: drag.cueId })) : snapTime(timeAt(point.x), { cueId: drag.cueId });
      SA.store.commands.trimCue(drag.cueId, drag.edge, time, { coalesceKey: `cue:${drag.cueId}:trim:${drag.edge}` });
    } else if (drag.type === 'layer-move' && drag.original) {
      const origin = drag.original.start == null ? 0 : drag.original.start;
      const span = drag.original.end == null ? null : drag.original.end - origin;
      const delta = timeAt(point.x) - drag.start;
      const start = Math.max(0, snapTime(origin + delta));
      const end = span == null ? null : start + span;
      SA.store.commands.setLayer(drag.layerId, { start, end }, { coalesceKey: `layer:${drag.layerId}:move` });
    } else if (drag.type === 'layer-edge' && drag.original) {
      const time = snapTime(timeAt(point.x));
      if (drag.edge === 'start') SA.store.commands.setLayer(drag.layerId, { start: Math.max(0, time) }, { coalesceKey: `layer:${drag.layerId}:trim:start` });
      else
        SA.store.commands.setLayer(drag.layerId, { end: Math.max((drag.original.start || 0) + 0.1, time) }, {
          coalesceKey: `layer:${drag.layerId}:trim:end`,
        });
    } else if (drag.type === 'key' && drag.key) {
      const time = snapFrame(timeAt(point.x) - drag.origin);
      if (Math.abs(time - drag.key.t) < 1e-4) return;
      SA.store.commands.moveKeyframe(drag.path, drag.propPath, drag.index, time);
      const track = ((project().keyframes[drag.path] || {})[drag.propPath] || []);
      const index = track.findIndex((key) => Math.abs(key.t - time) < 1e-4);
      if (index >= 0) drag.index = index;
      drag.key.t = time;
    }
  }

  function onPointerUp(event) {
    if (!drag) return;
    try {
      const target = event.currentTarget;
      if (target && target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    } catch {
      /* synthetic */
    }
    if (drag.type === 'box' && drag.current) {
      const x0 = Math.min(drag.start.x, drag.current.x);
      const x1 = Math.max(drag.start.x, drag.current.x);
      const y0 = Math.min(drag.start.y, drag.current.y);
      const y1 = Math.max(drag.start.y, drag.current.y);
      for (const region of keyRegions) {
        if (region.x >= x0 && region.x <= x1 && region.y >= y0 && region.y <= y1) {
          selectedKeys.add(`${region.path}|${region.propPath}|${region.index}`);
        }
      }
    }
    if (drag.type === 'clip-create') {
      // a drag on an animation track makes a clip for the span; a plain click
      // only selects the track (a double-click adds a default-length clip)
      const from = Math.max(0, Math.min(drag.from, drag.to));
      const to = Math.max(drag.from, drag.to);
      if (to - from >= 0.15) addAnimationClip(drag.trackId, drag.kind, from, to);
      else SA.store.setSelection([`track:${drag.trackId}`], 'track');
    }
    if (drag.transaction && SA.store.endTransaction) SA.store.endTransaction();
    drag = null;
    draw();
  }

  function onPointerCancel(event) {
    if (!drag) return;
    try {
      const target = event.currentTarget;
      if (target && target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    } catch {
      /* synthetic */
    }
    if (drag.transaction && SA.store.cancelTransaction) SA.store.cancelTransaction();
    drag = null;
    draw();
  }

  function onDoubleClick(event) {
    const point = localPoint(event);
    const hit = hitTest(point);
    if (hit.type === 'beat') {
      const beat = ((project().beats[hit.cueId] || []).find((entry) => entry.id === hit.beatId)) || null;
      if (beat) editBeat(hit.cueId, hit.beatId, hit);
      return;
    }
    if (hit.type === 'cue') {
      const cue = cueList().find((entry) => entry.id === hit.cueId);
      if (cue) editCueText(hit.cueId, hit);
      return;
    }
    if (hit.type === 'empty' || hit.type === 'track-empty') addAtRow(point);
  }

  // Double-clicking empty space creates a clip on that track (or a cue on a
  // subtitle track) at the clicked time.
  function addAtRow(point) {
    const row = rows.find((entry) => point.y >= entry.y && point.y <= entry.y + entry.h);
    if (!row || point.x < LABEL_W) return;
    const time = Math.max(0, snapFrame(timeAt(point.x)));
    if (row.type === 'clip-track' && CREATABLE_CLIP_KINDS.includes(row.kind)) {
      addAnimationClip(row.trackId, row.kind, time);
      return;
    }
    // background / backdrop clips keep their fixed defaults
    if (row.type === 'clip-track') {
      const kind = row.kind;
      const defaults =
        kind === 'background'
          ? { type: 'noiseGradient', params: { scale: 2, speed: 0.2 } }
          : kind === 'backdrop'
            ? { type: 'pattern', params: { mode: 'grid', count: 24, size: 1, speed: 0.4, opacity: 0.35 } }
            : { type: 'particles', params: { count: 32, flow: 'rise', size: 2.4 } };
      const id = SA.store.commands.addClip({ start: time, end: time + 2, spec: defaults, colors: null }, row.trackId);
      if (id) SA.store.setSelection([`clip:${id}`], 'clip');
      return;
    }
    if (row.type === 'cue-track') {
      const cue = {
        id: `cue_${Math.random().toString(16).slice(2, 10)}`,
        start: time,
        end: time + 2.8,
        text: t('studio.timeline.newCueText'),
        spans: [],
        fx: {},
        meta: { kind: 'custom' },
        trackId: row.trackId,
      };
      SA.store.commands.addCue(cue);
      SA.store.setSelection([`cue:${cue.id}`], 'cue');
      if (SA.preview) SA.preview.seek(time);
    }
  }

  function editBeat(cueId, beatId, region) {
    if (editing) editing.remove();
    const cue = cueList().find((entry) => entry.id === cueId);
    const beat =
      (project().beats[cueId] || []).find((entry) => entry.id === beatId) ||
      (cue && SA.lyricsEngine ? SA.lyricsEngine.beatForCue(cue) : null);
    if (!beat) return;
    const input = document.createElement('textarea');
    input.className = 'timeline-edit';
    input.value = beat.text || '';
    input.style.left = `${Math.max(4, region.x)}px`;
    input.style.top = `${Math.max(0, region.y - 2)}px`;
    input.style.width = `${Math.max(140, region.w)}px`;
    el.body.appendChild(input);
    editing = input;
    input.focus();
    input.select();
    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      editing = null;
      const value = input.value;
      input.remove();
      SA.store.commands.editBeatText(cueId, beatId, value, { coalesceKey: `beat:${beatId}:text` });
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        commit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        done = true;
        editing = null;
        input.remove();
      }
    });
    input.addEventListener('blur', commit);
  }

  function editCueText(cueId, region) {
    if (editing) editing.remove();
    const cue = cueList().find((entry) => entry.id === cueId);
    if (!cue) return;
    const input = document.createElement('textarea');
    input.className = 'timeline-edit';
    input.value = cue.text || '';
    input.style.left = `${Math.max(4, region.x)}px`;
    input.style.top = `${Math.max(0, region.y - 2)}px`;
    input.style.width = `${Math.max(160, region.w)}px`;
    el.body.appendChild(input);
    editing = input;
    input.focus();
    input.select();
    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      editing = null;
      const value = input.value;
      input.remove();
      SA.store.commands.editCueText(cueId, value, { coalesceKey: `cue:${cueId}:text` });
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        commit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        done = true;
        editing = null;
        input.remove();
      }
    });
    input.addEventListener('blur', commit);
  }

  // --- context menu ------------------------------------------------------------

  function hideMenu() {
    if (menu) menu.remove();
    menu = null;
  }

  function showMenu(event) {
    event.preventDefault();
    hideMenu();
    hideLabelTip();
    const point = localPoint(event);
    const hit = hitTest(point);
    if (hit.type === 'empty') return;
    menu = document.createElement('div');
    menu.className = 'timeline-menu';
    menu.id = 'timeline-menu';
    const add = (label, run) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-item';
      button.textContent = label;
      button.addEventListener('click', () => {
        hideMenu();
        run();
      });
      menu.appendChild(button);
    };
    const addEaseMenu = (path, propPath, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-item';
      button.textContent = t('studio.timeline.ease');
      button.addEventListener('mouseenter', () => {
        hideMenu();
        menu = document.createElement('div');
        menu.className = 'timeline-menu';
        for (const name of ['hold'].concat(SA.easing.names)) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'menu-item';
          item.textContent = name.startsWith('ease') ? name : SA.controls.prettify(name);
          item.addEventListener('click', () => {
            hideMenu();
            SA.store.commands.setKeyframeEase(path, propPath, index, name);
          });
          menu.appendChild(item);
        }
        el.body.appendChild(menu);
        const rect = el.body.getBoundingClientRect();
        menu.style.left = `${Math.max(0, event.clientX - rect.left + 120)}px`;
        menu.style.top = `${Math.max(0, event.clientY - rect.top)}px`;
      });
      menu.appendChild(button);
    };
    if (hit.type === 'key') {
      selectedKeys.add(`${hit.path}|${hit.propPath}|${hit.index}`);
      addEaseMenu(hit.path, hit.propPath, hit.index);
      add(t('studio.timeline.copyKeys'), () => copyKeys());
      add(t('studio.timeline.deleteKeys'), () => deleteSelectedKeys());
      draw();
      void point;
      el.body.appendChild(menu);
      positionMenu(event);
      return;
    }
    if (hit.type === 'layer' || hit.type === 'layer-edge' || hit.type === 'layer-eye') {
      const layer = ((project().layers) || []).find((entry) => entry.id === hit.layerId);
      if (!layer) return;
      SA.store.setSelection([`layer:${layer.id}`], 'layer');
      add(layer.enabled === false ? t('layers.show') : t('layers.hide'), () => SA.store.commands.setLayer(layer.id, { enabled: layer.enabled === false }));
      add(t('layers.edit'), () => SA.layersDialog.open());
      add(t('layers.remove'), () => SA.store.commands.removeLayer(layer.id));
      draw();
      el.body.appendChild(menu);
      positionMenu(event);
      return;
    }
    const addTypeMenu = (clip) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-item';
      button.textContent = t('filler.changeType');
      button.addEventListener('mouseenter', () => {
        hideMenu();
        menu = document.createElement('div');
        menu.className = 'timeline-menu';
        for (const type of SA.fillerRender.types()) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'menu-item';
          item.textContent = fillerTypeLabel(type);
          item.addEventListener('click', () => {
            hideMenu();
            const params = { ...SA.fillerRender.paramDefaults(type), ...(clip.spec && clip.spec.type === type ? clip.spec.params || {} : {}) };
            SA.store.commands.setFillerClip(clip.key, { ...(clip.spec || {}), type, params });
          });
          menu.appendChild(item);
        }
        el.body.appendChild(menu);
        const rect = el.body.getBoundingClientRect();
        menu.style.left = `${Math.max(0, event.clientX - rect.left + 120)}px`;
        menu.style.top = `${Math.max(0, event.clientY - rect.top)}px`;
      });
      menu.appendChild(button);
    };
    // Background / backdrop clips: every background primitive is offered (the
    // extended pack included) plus the user-placeable shape layer on the
    // backdrop track.
    const addClipTypeMenu = (clip, kind) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-item';
      button.textContent = t('filler.changeType');
      button.addEventListener('mouseenter', () => {
        hideMenu();
        menu = document.createElement('div');
        menu.className = 'timeline-menu';
        const options =
          kind === 'background'
            ? SA.fx.list('background', { packs: [null, 'font', 'pro'] }).map((descriptor) => ({ type: descriptor.type, fx: true }))
            : [...new Set([...SA.fillerRender.types(), 'shapeLayer'])].map((type) => ({ type, fx: type === 'shapeLayer' }));
        for (const option of options) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'menu-item';
          item.textContent = option.fx ? SA.controls.typeLabel('background', option.type) : fillerTypeLabel(option.type);
          item.addEventListener('click', () => {
            hideMenu();
            const params = option.fx ? {} : { ...SA.fillerRender.paramDefaults(option.type), ...(clip.spec && clip.spec.type === option.type ? clip.spec.params || {} : {}) };
            SA.store.commands.updateClip(clip.id, { spec: { type: option.type, params } });
          });
          menu.appendChild(item);
        }
        el.body.appendChild(menu);
        const rect = el.body.getBoundingClientRect();
        menu.style.left = `${Math.max(0, event.clientX - rect.left + 120)}px`;
        menu.style.top = `${Math.max(0, event.clientY - rect.top)}px`;
      });
      menu.appendChild(button);
    };
    // Filler clips: the built-in preset library and the user fillers, grouped;
    // hovering a group opens its presets in a menu offset to the right.
    const addFillerPresetMenu = (clip) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-item';
      button.textContent = t('filler.presets');
      button.addEventListener('mouseenter', () => {
        hideMenu();
        menu = document.createElement('div');
        menu.className = 'timeline-menu';
        const groups = [];
        if (SA.fillerPresets) {
          const presets = SA.fillerPresets.list();
          for (const groupId of SA.fillerPresets.groups()) {
            groups.push({
              id: groupId,
              label: t(`filler.group.${groupId}`),
              entries: presets.filter((preset) => preset.group === groupId).map((preset) => ({
                id: preset.id,
                name: SA.fillerPresets.labelFor(preset, SA.i18n.lang()),
              })),
            });
          }
        }
        if (SA.fillerLibrary) {
          const mine = SA.fillerLibrary.userList();
          if (mine.length) groups.push({ id: 'mine', label: t('filler.group.mine'), entries: mine.map((entry) => ({ id: entry.id, name: entry.name })) });
        }
        for (const group of groups) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'menu-item';
          item.textContent = group.label;
          item.addEventListener('mouseenter', () => {
            hideMenu();
            menu = document.createElement('div');
            menu.className = 'timeline-menu';
            for (const entry of group.entries) {
              const presetItem = document.createElement('button');
              presetItem.type = 'button';
              presetItem.className = 'menu-item';
              presetItem.textContent = entry.name;
              presetItem.addEventListener('click', () => {
                hideMenu();
                const spec = SA.fillerLibrary.specOf(entry.id);
                if (spec) SA.store.commands.updateClip(clip.id, { spec });
              });
              menu.appendChild(presetItem);
            }
            el.body.appendChild(menu);
            const rect = el.body.getBoundingClientRect();
            const itemRect = item.getBoundingClientRect();
            menu.style.left = `${Math.max(0, itemRect.right - rect.left + 2)}px`;
            menu.style.top = `${Math.max(0, itemRect.top - rect.top)}px`;
          });
          menu.appendChild(item);
        }
        el.body.appendChild(menu);
        const rect = el.body.getBoundingClientRect();
        menu.style.left = `${Math.max(0, event.clientX - rect.left + 120)}px`;
        menu.style.top = `${Math.max(0, event.clientY - rect.top)}px`;
      });
      menu.appendChild(button);
    };
    if (hit.type === 'clip' || hit.type === 'clip-edge') {
      const clip = ((project().clips) || []).find((entry) => entry.id === hit.clipId);
      if (!clip) return;
      SA.store.setSelection([`clip:${clip.id}`], 'clip');
      const disabled = isClipDisabled(clip);
      add(disabled ? t('studio.timeline.enableClip') : t('studio.timeline.disableClip'), () => {
        const patch = { disabled: !disabled };
        if (clip.spec && clip.spec.params) {
          patch.spec = { ...clip.spec, params: { ...clip.spec.params, disabled: !disabled } };
        }
        SA.store.commands.updateClip(clip.id, patch);
      });
      if (hit.kind === 'background' || hit.kind === 'backdrop') addClipTypeMenu(clip, hit.kind);
      if (hit.kind === 'filler') {
        addFillerPresetMenu(clip);
        addClipTypeMenu(clip, 'filler');
      }
      add(t('studio.timeline.splitClip'), () => SA.store.commands.splitClip(clip.id, SA.store.state.playhead));
      add(t('studio.timeline.duplicateClip'), () => SA.store.commands.duplicateClip(clip.id));
      add(t('studio.inspector.reroll'), () => SA.store.commands.rerollClip(clip.id));
      add(t('studio.generate.rerollColors'), () =>
        SA.store.commands.rerollColors({ kinds: [hit.kind], clipIds: [clip.id], perClip: true })
      );
      if (hit.kind === 'filler') add(t('studio.timeline.regenerateFillers'), () => SA.store.commands.regenerateFillers());
      add(t('studio.inspector.delete'), () => SA.store.commands.deleteClip(clip.id));
      draw();
      el.body.appendChild(menu);
      positionMenu(event);
      return;
    }
    if (hit.type === 'track-header' || hit.type === 'track-twisty' || hit.type === 'track-check' || hit.type === 'track-graphics-check' || hit.type === 'track-bg' || hit.type === 'track-remove') {
      const track = trackList().find((entry) => entry.id === hit.trackId);
      if (!track) return;
      if (track.kind === 'subtitle') {
        add(t('studio.track.addSubtitle'), () => {
          const id = SA.store.commands.addTrack('subtitle');
          if (id) SA.store.setSelection([`track:${id}`], 'track');
        });
        add(track.textHidden ? t('studio.track.showText') : t('studio.track.hideText'), () => SA.store.commands.updateTrack(track.id, { textHidden: !track.textHidden }));
        add(track.bgHidden ? t('studio.track.showBackground') : t('studio.track.hideBackground'), () => SA.store.commands.updateTrack(track.id, { bgHidden: !track.bgHidden }));
        add(track.graphicsHidden ? t('studio.track.showGraphics') : t('studio.track.hideGraphics'), () => SA.store.commands.updateTrack(track.id, { graphicsHidden: !track.graphicsHidden }));
        add(t('studio.track.moveUp'), () => SA.store.commands.moveTrack(track.id, 'up'));
        add(t('studio.track.moveDown'), () => SA.store.commands.moveTrack(track.id, 'down'));
      } else if (track.kind === 'filler') {
        add(t('studio.timeline.regenerateFillers'), () => SA.store.commands.regenerateFillers());
      }
      // the clip tracks that draw behind the lyrics can opt out of the text
      // mask (the subtitle background is always knocked out)
      if (track.kind === 'backdrop' || track.kind === 'figure' || track.kind === 'filler') {
        add(track.textMask === false ? t('studio.track.maskText') : t('studio.track.unmaskText'), () =>
          SA.store.commands.updateTrack(track.id, { textMask: track.textMask === false })
        );
      }
      if (removableTrack(track)) add(t('studio.track.remove'), () => SA.store.commands.removeTrack(track.id));
      add(track.hidden ? t('layers.show') : t('layers.hide'), () => SA.store.commands.updateTrack(track.id, { hidden: !track.hidden }));
      draw();
      el.body.appendChild(menu);
      positionMenu(event);
      return;
    }
    if (hit.type === 'filler') {
      const clip = fillerClips().find((entry) => entry.key === hit.key);
      if (!clip) return;
      SA.store.setSelection([`filler:${clip.key}`], 'filler');
      if (clip.pinned) add(t('filler.unpin'), () => SA.store.commands.setFillerClip(clip.key, null));
      else add(t('filler.pin'), () => SA.store.commands.setFillerClip(clip.key, clip.spec));
      addTypeMenu(clip);
      add(t('filler.applyKind', { kind: t(`filler.kind.${clip.kind}`) }), () => {
        SA.store.commands.setFillers({ byKind: { [clip.kind]: clip.spec } });
      });
      draw();
      el.body.appendChild(menu);
      positionMenu(event);
      return;
    }
    if (hit.type === 'credit') {
      SA.store.setSelection([`credit:${hit.mode}`], 'credit');
      add(t('credits.edit'), () => SA.creditsDialog.open(hit.mode));
      draw();
      el.body.appendChild(menu);
      positionMenu(event);
      return;
    }
    const cueId = hit.cueId;
    if (!cueId) return;
    if (hit.type === 'beat') {
      const beat = (project().beats[cueId] || []).find((entry) => entry.id === hit.beatId);
      add(beat && beat.disabled ? t('studio.inspector.enabled') : t('studio.inspector.disabled'), () => SA.store.commands.setBeatDisabled(cueId, hit.beatId, !(beat && beat.disabled)));
      add(beat && beat.pinned ? t('studio.beat.unpin') : t('studio.beat.pin'), () => SA.store.commands.setBeatPinned(cueId, hit.beatId, !(beat && beat.pinned)));
      add(t('studio.beat.splitAtPlayhead'), () => SA.store.commands.splitBeat(cueId, hit.beatId, SA.store.state.playhead));
      add(t('studio.beat.mergeNext'), () => SA.store.commands.mergeBeats(cueId, hit.beatId));
      add(t('studio.inspector.rerollCue'), () => SA.store.commands.rerollCue(cueId));
      add(t('studio.beat.restructureCue'), () => SA.store.commands.restructureCue(cueId));
      add(t('studio.beat.randomChunk'), () => SA.store.commands.restructureCueRandom(cueId));
      addRecapItem(add, cueId);
      add(t('studio.motion.addHere'), () => {
        SA.store.setSelection([`cue:${cueId}/beat:${hit.beatId}`], 'beat');
        SA.motionDialog.open();
      });
      add(t('studio.timeline.pagePreset'), () => {
        SA.store.setSelection([`cue:${cueId}`], 'cue');
        if (SA.pageDialog && SA.pageDialog.open) SA.pageDialog.open();
      });
      if (hit.hasMotions) {
        add(t('studio.motion.clearHere'), () => SA.store.commands.setStyleProp({ cueId, beatId: hit.beatId }, 'motions', undefined));
      }
    } else {
      const cue = cueList().find((entry) => entry.id === cueId);
      add(cue && cue.disabled ? t('studio.inspector.enabled') : t('studio.inspector.disabled'), () => SA.store.commands.setCueDisabled(cueId, !(cue && cue.disabled)));
      add(t('studio.timeline.splitCue'), () => SA.store.commands.splitCue(cueId, SA.store.state.playhead));
      add(t('studio.timeline.mergeCue'), () => SA.store.commands.mergeCues(cueId));
      add(t('studio.inspector.rerollCue'), () => SA.store.commands.rerollCue(cueId));
      add(t('studio.beat.duplicateCue'), () => {
        const cue = cueList().find((entry) => entry.id === cueId);
        if (cue) copyCue(cue);
      });
      add(t('studio.beat.deleteCue'), () => SA.store.commands.deleteCue(cueId));
      add(t('studio.beat.restructureCue'), () => SA.store.commands.restructureCue(cueId));
      add(t('studio.beat.randomChunk'), () => SA.store.commands.restructureCueRandom(cueId));
      addRecapItem(add, cueId);
      add(t('studio.motion.addHere'), () => {
        SA.store.setSelection([`cue:${cueId}`], 'cue');
        SA.motionDialog.open();
      });
      add(t('studio.timeline.pagePreset'), () => {
        SA.store.setSelection([`cue:${cueId}`], 'cue');
        if (SA.pageDialog && SA.pageDialog.open) SA.pageDialog.open();
      });
    }
    el.body.appendChild(menu);
    positionMenu(event);
  }

  function positionMenu(event) {
    const bodyRect = el.body.getBoundingClientRect();
    menu.style.left = `${Math.max(0, event.clientX - bodyRect.left)}px`;
    menu.style.top = `${Math.max(0, event.clientY - bodyRect.top)}px`;
  }

  function recapEnabled(cueId) {
    const cue = cueList().find((entry) => entry.id === cueId);
    const mode = cue && cue.textFlow && cue.textFlow.recap ? cue.textFlow.recap.mode : null;
    if (mode && mode !== 'off') return true;
    // An automatic recap (smartness) has no saved mode: the recap beat itself
    // is the state, so the menu still offers "Remove recap" and writes the
    // explicit `off` that stops the automatic one.
    const doc = project();
    const beats = (doc && doc.beats && doc.beats[cueId]) || [];
    return beats.some((beat) => beat && beat.kind === 'recap');
  }

  // Adds / removes the full-text recap ("show the whole line again") for a cue.
  function addRecapItem(add, cueId) {
    const enabled = recapEnabled(cueId);
    add(t(enabled ? 'studio.beat.recapOff' : 'studio.beat.recapOn'), () => SA.store.commands.restructureCue(cueId, { recap: !enabled }));
  }

  function copyCue(cue) {
    const cues = cueList();
    const maxEnd = cues.reduce((max, entry) => Math.max(max, entry.end), 0);
    const shift = maxEnd + 0.3 - cue.start;
    const clone = JSON.parse(JSON.stringify(cue));
    clone.id = `${cue.id}_dup${Math.random().toString(16).slice(2, 6)}`;
    clone.start += shift;
    clone.end += shift;
    SA.store.commands.addCue(clone);
  }

  // --- keyframe clipboard ------------------------------------------------------

  function copyKeys() {
    clipboard = [];
    for (const id of selectedKeys) {
      const [path, propPath, indexText] = id.split('|');
      const track = (project().keyframes[path] || {})[propPath];
      const key = track && track[Number(indexText)];
      if (key) clipboard.push({ path, propPath, t: key.t, value: key.value, ease: key.ease, offset: 0 });
    }
    const first = clipboard.length ? Math.min(...clipboard.map((entry) => entry.t)) : 0;
    clipboard.forEach((entry) => {
      entry.offset = entry.t - first;
    });
    SA.studio.toast('studio.timeline.copied', { n: clipboard.length });
  }

  function pasteKeys() {
    if (!clipboard.length) return;
    const doc = project();
    const playhead = SA.store.state.playhead;
    for (const entry of clipboard) {
      const origin = originFor(entry.path, entry.path.split('/')[0].replace('cue:', ''));
      const local = Math.max(0, playhead - origin) + entry.offset;
      SA.store.commands.setKeyframe(entry.path, entry.propPath, snapFrame(local), entry.value, entry.ease || 'linear');
    }
    void doc;
    SA.studio.toast('studio.timeline.pasted', { n: clipboard.length });
  }

  function deleteSelectedKeys() {
    const entries = [...selectedKeys]
      .map((id) => {
        const [path, propPath, indexText] = id.split('|');
        return { path, propPath, index: Number(indexText) };
      })
      .sort((a, b) => (a.path === b.path && a.propPath === b.propPath ? b.index - a.index : 0));
    for (const entry of entries) {
      SA.store.commands.deleteKeyframe(entry.path, entry.propPath, entry.index);
    }
    selectedKeys.clear();
    draw();
  }

  // A clip on a creatable track (figure / text / filler). These clips run
  // alongside the lyric cues (and each other), so any span is allowed,
  // overlaps included.
  function addAnimationClip(trackId, kind, start, end) {
    const from = Math.max(0, snapFrame(start));
    const to = end == null ? from + 2 : Math.max(from + 0.1, end);
    const { spec, colors } = animationClipSpec(kind);
    const id = SA.store.commands.addClip({ start: from, end: to, spec, colors }, trackId);
    if (id) SA.store.setSelection([`clip:${id}`], 'clip');
    if (SA.preview) SA.preview.seek(from);
    return id;
  }

  // Defaults for a clip created by dragging on a creatable track. A figure
  // clip starts with a motif (edited in the inspector), a text clip with a
  // short line and fade in / out, a filler clip with a random filler content
  // spec from the project's axes.
  function animationClipSpec(kind) {
    if (kind === 'filler') {
      const doc = project();
      const mode = (doc && doc.styleMode) || {};
      const rolled =
        SA.moods && SA.moods.rerollClipSpec
          ? SA.moods.rerollClipSpec('filler', {
              axes: mode.axes || {},
              seed: Math.floor(Math.random() * 900000) + 1000,
              genre: mode.genre || null,
            })
          : null;
      if (rolled && rolled.spec) return { spec: rolled.spec, colors: rolled.colors || null };
      return { spec: { type: 'particles', params: { count: 32, flow: 'rise', size: 2.4 } }, colors: null };
    }
    if (kind === 'figure') {
      const spec = SA.figures && SA.figures.blank ? SA.figures.blank({ motif: 'orbit', sync: 'beat', density: 0.5 }) : { type: 'figure', params: { motif: 'orbit', sync: 'beat', density: 0.5, beats: [] } };
      return { spec, colors: null };
    }
    const doc = project();
    const textStyle = (doc && doc.style && doc.style.text) || {};
    return {
      spec: {
        type: 'textAnim',
        params: {
          text: t('studio.timeline.newText'),
          style: {
            text: { fontId: textStyle.fontId || 'NotoSans-Regular', size: Math.max(48, Math.round((textStyle.size || 96) * 1.1)), lineHeight: 1.2, maxWidth: 0.9, align: 'center' },
            location: { type: 'center', params: {} },
            enter: { type: 'fade', motion: { in: { duration: 0.5, delay: 0, ease: 'easeOutCubic' } } },
            hold: [],
            exit: { type: 'fade', motion: { out: { duration: 0.4, delay: 0, ease: 'easeInCubic' } } },
          },
        },
      },
      colors: null,
    };
  }

  // "Add text track": a plain click adds a subtitle track, so cues can be
  // added / typed on it (the expected behaviour). Shift+click keeps the
  // clip-based animated-text track.
  function addSubtitleTrack() {
    const id = SA.store.commands.addTrack('subtitle');
    if (!id) return;
    SA.store.setSelection([`track:${id}`], 'track');
    SA.studio.toast('studio.toast.subtitleTrack');
    draw();
  }

  function addAnimationTrack(kind) {
    const id = SA.store.commands.addTrack(kind);
    if (!id) return;
    SA.store.setSelection([`track:${id}`], 'track');
    const toasts = { figure: 'studio.toast.figureTrack', textAnim: 'studio.toast.textTrack', filler: 'studio.toast.fillerTrack' };
    SA.studio.toast(toasts[kind] || 'studio.toast.textTrack');
    draw();
  }

  // --- zoom / fit --------------------------------------------------------------

  function setZoom(value, anchorX) {
    const next = Math.max(minZoom(), Math.min(MAX_ZOOM, value));
    if (anchorX != null) {
      const time = timeAt(anchorX);
      pxPerSecond = next;
      scrollX = clampScrollX(LABEL_W + time * pxPerSecond - anchorX);
    } else {
      pxPerSecond = next;
    }
    scrollX = clampScrollX(scrollX);
    applyZoomView();
    draw();
  }

  function fit() {
    setZoom(fitZoom());
    scrollX = 0;
    draw();
  }

  // --- wiring ------------------------------------------------------------------

  function onKeyDown(event) {
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'c' && selectedKeys.size) {
      event.preventDefault();
      copyKeys();
    } else if (mod && event.key.toLowerCase() === 'v' && clipboard.length) {
      event.preventDefault();
      pasteKeys();
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedKeys.size) {
      event.preventDefault();
      deleteSelectedKeys();
    }
  }

  function onWheel(event) {
    hideLabelTip();
    if (event.ctrlKey) {
      event.preventDefault();
      setZoom(pxPerSecond * (event.deltaY < 0 ? 1.15 : 0.87), localPoint(event).x);
    } else if (event.shiftKey) {
      event.preventDefault();
      scrollX = clampScrollX(scrollX + event.deltaY);
      draw();
    } else if (event.currentTarget === el.rulerCanvas && el.scroll) {
      // the ruler sits outside the scroll container: forward plain wheel down
      el.scroll.scrollTop += event.deltaY;
    }
  }

  function bind() {
    const surfaces = [el.canvas, el.rulerCanvas].filter(Boolean);
    for (const surface of surfaces) {
      surface.addEventListener('pointerdown', onPointerDown);
      surface.addEventListener('pointermove', onPointerMove);
      surface.addEventListener('pointerup', onPointerUp);
      surface.addEventListener('pointercancel', onPointerCancel);
      surface.addEventListener('dblclick', onDoubleClick);
      surface.addEventListener('contextmenu', showMenu);
      surface.addEventListener('dragover', (event) => {
        const types = event.dataTransfer ? event.dataTransfer.types || [] : [];
        if (types.indexOf('text/x-sa-media') >= 0 || types.indexOf('text/plain') >= 0) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }
      });
      surface.addEventListener('drop', (event) => {
        const transfer = event.dataTransfer;
        if (!transfer) return;
        const id = transfer.getData('text/x-sa-media') || transfer.getData('text/plain');
        const doc = project();
        const entry = doc && doc.media && (doc.media.videos || []).find((video) => video.id === id);
        if (!entry) return;
        event.preventDefault();
        const point = localPoint(event);
        const firstCue = rows.find((row) => row.type === 'cue-track');
        const slot = firstCue && point.y < firstCue.y ? 'foreground' : 'background';
        const layer = SA.layersDialog.defaults(slot);
        layer.type = 'video';
        layer.src = entry.src;
        layer.fit = 'cover';
        SA.store.commands.addLayer(layer);
        SA.studio.toast('studio.media.layerAdded', { name: entry.name || '' });
      });
      surface.addEventListener('wheel', onWheel, { passive: false });
      surface.addEventListener('pointerleave', hideLabelTip);
    }
    // rows move under a resting pointer while the timeline scrolls
    if (el.scroll) el.scroll.addEventListener('scroll', hideLabelTip);
    document.addEventListener('keydown', onKeyDown);
    if (el.hscrollThumb) {
      let hDrag = null;
      el.hscrollThumb.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        const track = el.hscroll ? el.hscroll.clientWidth : 0;
        const thumbLength = el.hscrollThumb.offsetWidth;
        const travel = Math.max(1, track - thumbLength);
        hDrag = { startX: event.clientX, startScroll: scrollX, scale: maxScrollX() / travel };
        el.hscrollThumb.classList.add('is-dragging');
        try {
          el.hscrollThumb.setPointerCapture(event.pointerId);
        } catch {
          /* synthetic */
        }
      });
      el.hscrollThumb.addEventListener('pointermove', (event) => {
        if (!hDrag) return;
        scrollX = clampScrollX(hDrag.startScroll + (event.clientX - hDrag.startX) * hDrag.scale);
        draw();
      });
      const endHScroll = (event) => {
        if (!hDrag) return;
        hDrag = null;
        el.hscrollThumb.classList.remove('is-dragging');
        try {
          if (el.hscrollThumb.hasPointerCapture(event.pointerId)) el.hscrollThumb.releasePointerCapture(event.pointerId);
        } catch {
          /* synthetic */
        }
      };
      el.hscrollThumb.addEventListener('pointerup', endHScroll);
      el.hscrollThumb.addEventListener('pointercancel', endHScroll);
    }
    if (el.zoom) el.zoom.addEventListener('input', () => setZoom(Number(el.zoom.value)));
    if (el.fit) el.fit.addEventListener('click', fit);
    if (el.theme) el.theme.addEventListener('click', () => SA.themes.dialog());
    if (el.addTextTrack) {
      // the button adds a subtitle track cues can be typed on
      el.addTextTrack.title = t('studio.timeline.addTextTrackHint');
      el.addTextTrack.addEventListener('click', () => addSubtitleTrack());
    }
    if (el.addFigureTrack) {
      el.addFigureTrack.addEventListener('click', () => addAnimationTrack('figure'));
    }
    if (el.addFillerTrack) {
      el.addFillerTrack.addEventListener('click', () => addAnimationTrack('filler'));
    }
    document.addEventListener('click', (event) => {
      if (menu && !menu.contains(event.target)) hideMenu();
    });
  }

  function init() {
    el.body = document.querySelector('.timeline-body');
    el.scroll = document.getElementById('timeline-scroll');
    el.canvas = document.getElementById('timeline-canvas');
    el.rulerCanvas = document.getElementById('timeline-ruler');
    el.hscroll = document.getElementById('timeline-hscroll');
    el.hscrollThumb = document.getElementById('timeline-hscroll-thumb');
    if (el.hscroll) el.hscroll.style.marginLeft = `${LABEL_W}px`;
    el.zoom = document.getElementById('tl-zoom');
    el.zoomLabel = document.getElementById('tl-zoom-label');
    el.fit = document.getElementById('tl-fit');
    el.theme = document.getElementById('tl-theme');
    el.addTextTrack = document.getElementById('tl-add-text-track');
    el.addFigureTrack = document.getElementById('tl-add-figure-track');
    el.addFillerTrack = document.getElementById('tl-add-filler-track');
    // hover tooltip for row labels the fixed label column had to truncate
    el.tip = document.createElement('div');
    el.tip.className = 'timeline-tip';
    el.tip.hidden = true;
    if (el.body) el.body.appendChild(el.tip);
    if (!el.canvas) return;
    ctx = el.canvas.getContext('2d');
    if (el.rulerCanvas) rulerCtx = el.rulerCanvas.getContext('2d');
    try {
      const stored = Math.round(Number(localStorage.getItem(LS_ZOOM)));
      if (stored >= MIN_ZOOM && stored <= MAX_ZOOM) pxPerSecond = stored;
    } catch {
      /* ignore */
    }
    if (el.zoom) el.zoom.value = String(pxPerSecond);
    if (el.zoomLabel) el.zoomLabel.textContent = `${Math.round(pxPerSecond)} px/s`;
    lastVersion = { ...(SA.store.state.version || {}) };
    lastPlayhead = SA.store.state.playhead;
    bind();
    SA.store.subscribe('timeline', () => {
      if (versionChanged()) draw();
    });
    // a lyrics import shows the whole script at once
    if (SA.store.on) SA.store.on('script-imported', () => defer(fitToCues));
    window.addEventListener('resize', draw);
    draw();
  }

  return {
    init,
    draw,
    fit,
    fitToCues,
    setZoom,
    getZoom: () => pxPerSecond,
    getScrollX: () => scrollX,
    setScrollX: (value) => {
      scrollX = clampScrollX(value);
      draw();
    },
    toggleExpand: (cueId) => {
      if (expanded.has(cueId)) expanded.delete(cueId);
      else expanded.add(cueId);
      draw();
    },
    selectedKeys: () => [...selectedKeys],
    selectKey: (path, propPath, index) => {
      selectedKeys.add(`${path}|${propPath}|${index}`);
      draw();
    },
    copyKeys,
    pasteKeys,
    deleteKeys: deleteSelectedKeys,
    snapTime,
    snapFrame,
    originFor,
    reload: () => draw(),
  };
})();
