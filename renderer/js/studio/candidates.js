(typeof window !== 'undefined' ? window : globalThis).SA = (typeof window !== 'undefined' ? window : globalThis).SA || {};

// Candidate tab of the left pane: several looks per beat, kept in the project.
//   - "Generate" rolls new looks for the selected beat (the beat is untouched)
//   - hovering a card previews that look on the beat while the preview plays
//     (a store transaction: no history entry, rolled back when the pointer leaves)
//   - clicking a card puts the look on the beat for real (one undo step)
//   - the original look is always candidate 0 and can never be removed
SA.candidates = (() => {
  'use strict';

  const THUMB_WIDTH = 224;
  const HOVER_LEAVE_MS = 90;
  // a hover only starts the preview after it has rested on the card this long
  const HOVER_START_MS = 200;
  const PRE_ROLL = 0.3;
  const THUMB_CACHE_MAX = 600;
  const BEAT_PATH = /cue:([^/]+)(?:\/beat:([^/]+))?/;
  // the axis groups the store rolls one at a time (kept in the same order)
  const AXES = ['color', 'font', 'effects', 'placement', 'clones'];
  const AXIS_LABEL = { color: 'candAxesColor', font: 'candAxesFont', effects: 'candAxesEffects', placement: 'candAxesPlacement', clones: 'candAxesClones' };
  const AXIS_SOURCE = { color: 'candMixAxisColor', font: 'candMixAxisFont', effects: 'candMixAxisEffects', placement: 'candMixAxisPlacement', clones: 'candMixAxisClones' };
  // the board's virtual grid: a column per beat, a row per candidate index
  const BOARD = { col: 80, row: 58, head: 42, label: 34 };
  // the numbered rows start under the header and the adopted-slot band
  BOARD.top = BOARD.head + BOARD.row;

  // One capped, LRU in-memory thumbnail cache shared by the tab and the board.
  // Thumbnails are never written to the project; the oldest entry is evicted
  // past the cap so a long session cannot grow without bound.
  function createThumbCache(limit) {
    const map = new Map();
    return {
      has(key) {
        return map.has(key);
      },
      get(key) {
        if (!map.has(key)) return undefined;
        const value = map.get(key);
        map.delete(key);
        map.set(key, value);
        return value;
      },
      clear() {
        map.clear();
      },
      delete(key) {
        map.delete(key);
      },
      set(key, value) {
        if (map.has(key)) map.delete(key);
        map.set(key, value);
        while (map.size > limit) map.delete(map.keys().next().value);
      },
    };
  }

  const el = {};
  const thumbs = createThumbCache(THUMB_CACHE_MAX); // `${beatId}|${candidateId}|${kind}|len|signature}` -> data URL ('' = failed)
  let mode = 'mixed';
  let count = 6;
  let axes = { color: true, font: true, effects: true, placement: true, clones: true };
  let mix = null; // { base, take } while the mix editor is open, null otherwise
  let target = null; // { cueId, beatId }
  let hover = null; // { cueId, beatId, candidateId }
  let hoverAt = null; // { cueId, beatId, start, end } when the hover came from the board (any beat)
  let leaveTimer = null;
  let startTimer = null; // the pending (delayed) start of a hover preview
  let tour = null; // { ids, index, timer } while the continuous playback runs
  let thumbBusy = false;
  let renderQueued = false;
  // --- board pane state ---
  let boardOpen = false;
  let boardQueued = false;
  let boardModel = null; // { cols, starts, maxRows } cached until the project moves
  let boardModelKey = null; // store version the model was built from
  let boardScroll = null; // the scrolling element
  let boardCanvas = null; // the absolutely-positioned inner element
  let boardMarker = null; // the playhead column marker
  const boardNodes = new Map(); // key -> { el, sig }: the reconciled grid
  let boardGen = 0; // bumped per visible-range change to cancel a stale thumb queue
  let follow = true; // follow the playhead until the user scrolls by hand
  let followCol = -1; // the last column highlighted as "now"
  let programmaticScroll = false;
  let wasPlaying = false;
  let boardHead = null; // the playhead the board last showed
  let toast = () => {};

  function beatsOf(doc, cue) {
    const stored = (doc.beats && doc.beats[cue.id]) || [];
    if (stored.length) return stored;
    const synthetic = SA.lyricsEngine && SA.lyricsEngine.beatForCue ? SA.lyricsEngine.beatForCue(cue) : null;
    return synthetic ? [synthetic] : [];
  }

  function store() {
    return SA.store;
  }

  function t(key, vars) {
    return SA.i18n.t(key, vars);
  }

  function project() {
    return store().state.project;
  }

  function isVisible() {
    return !!(el.pane && !el.pane.hidden);
  }

  // The beat the panel works on: the selected beat, else the first beat of the
  // selected cue, else the beat under the playhead.
  function resolveTarget() {
    const doc = project();
    if (!doc || !doc.script) return null;
    const cues = doc.script.cues || [];
    for (const path of store().state.selection.paths || []) {
      const match = BEAT_PATH.exec(path);
      if (!match) continue;
      const cue = cues.find((entry) => entry.id === match[1]);
      if (!cue) continue;
      const list = beatsOf(doc, cue);
      const beat = (match[2] && list.find((entry) => entry.id === match[2])) || list[0];
      if (beat) return { cueId: cue.id, beatId: beat.id, cue, beat };
    }
    const head = store().state.playhead;
    const cue = cues.find((entry) => head >= entry.start && head < entry.end);
    if (!cue) return null;
    const list = beatsOf(doc, cue);
    const beat = list.find((entry) => head >= entry.start && head < entry.end) || list[0];
    return beat ? { cueId: cue.id, beatId: beat.id, cue, beat } : null;
  }

  // A thumbnail is a cached still keyed by the candidate's own look and the
  // frame shape. Later changes of the project style never rewrite it; a card
  // whose picture should be redone is refreshed by hand (board right click).
  function signature() {
    const doc = project();
    const output = (doc && doc.output) || {};
    return `${output.aspect || ''}:${output.width || 0}x${output.height || 0}`;
  }

  // a content hash, not a length: two looks of the same size must not share a
  // thumbnail
  function hashOf(text) {
    let h = 5381;
    for (let index = 0; index < text.length; index += 1) h = ((h * 33) ^ text.charCodeAt(index)) >>> 0;
    return h.toString(36);
  }

  function thumbKeyFor(beatId, item, sig) {
    return `${beatId}|${item.id}|${item.kind}|${hashOf(JSON.stringify(item.look))}|${sig}`;
  }

  function thumbKey(item, sig) {
    return thumbKeyFor(target.beatId, item, sig);
  }

  function labelOf(item) {
    const n = String(item.id).replace(/\D/g, '');
    if (item.label) return item.label;
    if (item.kind === 'original') return t('studio.media.candPrevious', { n });
    if (item.kind === 'far') return t('studio.media.candFar', { n });
    if (item.kind === 'near') return t('studio.media.candNear', { n });
    if (item.kind === 'previous') return t('studio.media.candPrevious', { n });
    return t('studio.media.candSaved', { n });
  }

  // --- hover preview ---------------------------------------------------------

  function beatRange() {
    if (hoverAt) return { start: hoverAt.start, end: Math.max(hoverAt.end, hoverAt.start + 0.2) };
    const beat = target && target.beat;
    const start = Number(beat && beat.start) || 0;
    const end = Number(beat && beat.end) || start + 1;
    return { start, end: Math.max(end, start + 0.2) };
  }

  // The preview plays on the candidate player laid over the main preview: it
  // has its own canvas and clock and renders a scratch copy of the project, so
  // hovering never moves the main playhead, starts the main playback or opens
  // a transaction on the live project.
  function playCandidate(at, itemId, onEnd) {
    const doc = store().commands.candidatePreviewDoc(at.cueId, at.beatId, itemId);
    if (!doc || !SA.preview || typeof SA.preview.auxPlay !== 'function') return false;
    const { start, end } = beatRange();
    return SA.preview.auxPlay(doc, { start, end, preRoll: PRE_ROLL, onEnd, onStop: playerStopped });
  }

  // The main transport (play / pause / seek) took the screen back: forget the
  // hover and the tour so no stale state keeps the buttons "on".
  function playerStopped() {
    hover = null;
    hoverAt = null;
    stopHoverWatch();
    if (tour) {
      tour = null;
      markTourCard();
    }
  }

  // A hovered card can be rebuilt under the pointer (no mouseleave then):
  // the player must not outlive the hover.
  let hoverWatch = null;
  function stopHoverWatch() {
    if (hoverWatch) clearInterval(hoverWatch);
    hoverWatch = null;
  }

  function startHoverWatch() {
    stopHoverWatch();
    hoverWatch = setInterval(() => {
      if (!hover || tour) return;
      if (!document.querySelector('.cand-card:hover, .board-cell:hover')) endHover();
    }, 250);
  }

  function clearStartTimer() {
    if (startTimer) clearTimeout(startTimer);
    startTimer = null;
  }

  // `over` names another beat (a board cell); without it the hover is on the
  // selected beat of the Candidates tab. The preview itself starts only after
  // the pointer has rested on the card for HOVER_START_MS.
  function beginHover(item, over) {
    const at = over || target;
    if (!at || !project()) return;
    if (tour) cancelTour();
    if (leaveTimer) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
    if (hover && hover.candidateId === item.id && hover.beatId === at.beatId) return;
    // another card was playing: it stops now, the new one waits its turn
    clearStartTimer();
    if (SA.preview && typeof SA.preview.auxStop === 'function') SA.preview.auxStop();
    hoverAt = over ? { cueId: over.cueId, beatId: over.beatId, start: Number(over.start) || 0, end: Number(over.end) || 0 } : null;
    hover = { cueId: at.cueId, beatId: at.beatId, candidateId: item.id, real: false };
    const rev = SA.preview && typeof SA.preview.transportRev === 'function' ? SA.preview.transportRev() : 0;
    startTimer = setTimeout(() => {
      startTimer = null;
      if (!hover || hover.candidateId !== item.id || hover.beatId !== at.beatId) return;
      // the main transport was used meanwhile: that screen belongs to it
      if (SA.preview && typeof SA.preview.transportRev === 'function' && SA.preview.transportRev() !== rev) return;
      // the card was rebuilt or left without a mouseleave: nothing is hovered
      if (!document.querySelector('.cand-card:hover, .board-cell:hover')) {
        hover = null;
        hoverAt = null;
        return;
      }
      playCandidate(at, item.id);
      startHoverWatch();
    }, HOVER_START_MS);
  }

  // Ends the temporary preview: the candidate player is hidden, nothing else
  // was touched. (`stopPlay` is kept for the callers' sake.)
  function rollbackHover(stopPlay) {
    clearStartTimer();
    hover = null;
    if (!stopPlay) return;
    hoverAt = null;
    stopHoverWatch();
    cancelTour();
    if (SA.preview && typeof SA.preview.auxStop === 'function') SA.preview.auxStop();
  }

  function endHover() {
    if (leaveTimer) clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      leaveTimer = null;
      rollbackHover(true);
      scheduleRender();
      if (boardOpen) {
        boardModel = null;
        scheduleBoard();
      }
    }, HOVER_LEAVE_MS);
  }

  // --- continuous playback ---------------------------------------------------
  // The beat keeps looping; every time it ends the next candidate takes over
  // on the spot (no wait, no restart gap) and the beat plays again. One
  // transaction holds the whole tour, so nothing reaches the history; any
  // hand action (hover, click, generate, stop) ends it and rolls it back.

  function tourButtonLabel() {
    return tour ? t('studio.media.candTourStop') : t('studio.media.candTour');
  }

  function markTourCard() {
    if (!el.body) return;
    const current = tour ? tour.current : null;
    for (const cardEl of el.body.querySelectorAll('.cand-card')) {
      cardEl.classList.toggle('is-touring', !!current && cardEl.dataset.id === current);
    }
    const button = el.body.querySelector('.cand-tour-btn');
    if (button) {
      button.textContent = tourButtonLabel();
      button.classList.toggle('is-on', !!tour);
    }
  }

  // Ends the tour: the candidate player is hidden; the live project and the
  // main transport were never touched.
  function cancelTour() {
    if (!tour) return;
    tour = null;
    if (SA.preview && typeof SA.preview.auxStop === 'function') SA.preview.auxStop();
    markTourCard();
  }

  function tourNext() {
    if (!tour || !target) return;
    const entry = store().commands.candidatesOf(target.beatId);
    if (!entry || entry.items.length < 2) {
      stopTour();
      return;
    }
    const ids = entry.items.map((item) => item.id);
    // follow the live list: continue after the id shown last
    const at = ids.indexOf(tour.current);
    const nextId = ids[(at < 0 ? 0 : at + 1) % ids.length];
    tour.current = nextId;
    // the player calls back when the beat has played once: the next look takes over
    playCandidate(target, nextId, tourNext);
    markTourCard();
  }

  function startTour() {
    if (!target) return;
    const entry = store().commands.candidatesOf(target.beatId);
    if (!entry || entry.items.length < 2) {
      toast('studio.media.candTourNeed');
      return;
    }
    if (leaveTimer) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
    rollbackHover(true);
    tour = { current: null };
    // the first step shows the candidate that is on the beat now
    const ids = entry.items.map((item) => item.id);
    const activeAt = ids.indexOf(entry.activeId);
    tour.current = ids[(activeAt < 0 ? ids.length - 1 : activeAt - 1 + ids.length) % ids.length];
    tourNext();
  }

  function stopTour() {
    cancelTour();
    scheduleRender();
  }

  function toggleTour() {
    if (tour) stopTour();
    else startTour();
  }

  // --- actions ---------------------------------------------------------------

  function commit(item, over) {
    const at = over || target;
    if (!at) return;
    if (leaveTimer) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
    cancelTour();
    rollbackHover(true);
    // one real, undoable apply; the main transport is left as it is
    store().commands.applyCandidate(at.cueId, at.beatId, item.id);
  }

  function generate() {
    if (!target) return;
    rollbackHover(true);
    const here = { cueId: target.cueId, beatId: target.beatId };
    whenIdle(() => reportGenerated(store().commands.generateCandidates(here.cueId, here.beatId, { count, mode, axes }), count));
  }

  // Thumbnails are shot on a scratch copy now, so a command never has to wait
  // for the queue: it runs at once and the pictures follow.
  function whenIdle(task) {
    return Promise.resolve(task());
  }

  function reportGenerated(made, asked) {
    if (!made) toast('studio.media.candNone');
    else if (made < asked) toast('studio.media.candLimited', { n: made });
  }

  function keepCurrent() {
    if (!target) return;
    rollbackHover(true);
    store().commands.saveCandidate(target.cueId, target.beatId);
  }

  // --- thumbnails ------------------------------------------------------------

  function shotToDataUrl(shot) {
    const full = document.createElement('canvas');
    full.width = shot.width;
    full.height = shot.height;
    full.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(shot.data), shot.width, shot.height), 0, 0);
    const out = document.createElement('canvas');
    out.width = Math.min(THUMB_WIDTH, shot.width);
    out.height = Math.max(1, Math.round((shot.height * out.width) / shot.width));
    out.getContext('2d').drawImage(full, 0, 0, out.width, out.height);
    return out.toDataURL('image/jpeg', 0.75);
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }

  // Each missing thumbnail is a still: the candidate is worn on a scratch copy
  // of the project and shot by the offscreen capture engine, then cached by
  // its look. Nothing of the live project, the main canvas or the history is
  // touched, so nothing on screen redraws while pictures are made, and a
  // cached picture is never rewritten.
  async function runShots(jobs, cache, after, shouldStop) {
    if (!jobs.length) return;
    thumbBusy = true;
    try {
      const scratch = store().commands.scratchForShots();
      for (const job of jobs) {
        // the view scrolled away: drop the stale queue, the next render builds
        // a fresh one for the new visible range
        if (shouldStop && shouldStop()) break;
        // a failed shot is remembered as '' so it is not retried in a loop
        let url = '';
        try {
          if (scratch && store().commands.wearOnScratch(scratch, job.cueId, job.beatId, job.candidateId)) {
            const shot = SA.preview.captureDoc(scratch, job.time, { width: THUMB_WIDTH * 2 });
            if (shot) url = shotToDataUrl(shot);
          }
        } catch {
          url = '';
        }
        cache.set(job.key, url);
        // let the page breathe between pictures
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      thumbBusy = false;
      if (after) after();
    }
  }

  function canShoot() {
    return !!(SA.preview && SA.preview.isWebGL2 && SA.preview.isWebGL2() && typeof SA.preview.captureDoc === 'function');
  }

  async function fillThumbs() {
    if (thumbBusy || genAll || !target || !isVisible() || !canShoot()) return;
    const entry = store().commands.candidatesOf(target.beatId);
    if (!entry) return;
    const sig = signature(target.cueId);
    const pending = entry.items.filter((item) => !thumbs.has(thumbKey(item, sig)));
    if (!pending.length) return;
    const { cueId, beatId } = target;
    const { start, end } = beatRange();
    const time = start + Math.min((end - start) * 0.6, 1.1);
    const jobs = pending.map((item) => ({ cueId, beatId, candidateId: item.id, key: thumbKey(item, sig), time }));
    await runShots(jobs, thumbs, scheduleRender);
  }

  // Only the visible board cells (+1 margin) queue a thumbnail, visible first.
  // Never while playing or while a hover / tour transaction is open. The queue
  // is tagged with the render generation so a scroll drops it immediately.
  function fillBoardThumbs() {
    if (!boardOpen || thumbBusy || genAll || !boardModel || !canShoot()) return;
    const cols = boardModel.cols;
    if (!cols.length) return;
    const range = visibleRange();
    const jobs = [];
    const queued = new Set();
    const want = (column, item) => {
      const key = thumbKeyFor(column.beatId, item, column.sig);
      if (thumbs.has(key) || queued.has(key)) return;
      queued.add(key);
      const start = column.start;
      const end = Math.max(Number(column.beat.end) || start + 1, start + 0.2);
      const time = start + Math.min((end - start) * 0.6, 1.1);
      jobs.push({ cueId: column.cueId, beatId: column.beatId, candidateId: item.id, key, time });
    };
    // the adopted slot is always on screen: its pictures come first
    for (let col = range.colStart; col <= range.colEnd; col += 1) {
      const column = cols[col];
      const active = column.entry && column.entry.items.find((item) => item.id === column.entry.activeId);
      if (active) want(column, active);
    }
    for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
      for (let col = range.colStart; col <= range.colEnd; col += 1) {
        const column = cols[col];
        const item = column.rows && column.rows[row];
        if (item) want(column, item);
      }
    }
    if (!jobs.length) return;
    const token = boardGen;
    runShots(jobs, thumbs, () => {
      if (boardOpen) scheduleBoard();
    }, () => token !== boardGen || !boardOpen);
  }

  // --- rendering -------------------------------------------------------------

  function node(tag, className, text) {
    const out = document.createElement(tag);
    if (className) out.className = className;
    if (text != null) out.textContent = text;
    return out;
  }

  function select(options, value, onChange) {
    const out = node('select', 'cand-select');
    for (const [id, label] of options) {
      const option = document.createElement('option');
      option.value = String(id);
      option.textContent = label;
      if (String(id) === String(value)) option.selected = true;
      out.appendChild(option);
    }
    out.addEventListener('change', () => onChange(out.value));
    return out;
  }

  function card(item, entry, sig) {
    const out = node('div', 'cand-card');
    out.dataset.id = item.id;
    if (item.id === entry.activeId) out.classList.add('is-active');
    const thumb = node('div', 'cand-thumb');
    const url = thumbs.get(thumbKey(item, sig));
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.draggable = false;
      thumb.appendChild(img);
    } else {
      thumb.appendChild(node('span', 'cand-thumb-wait', url === '' && thumbs.has(thumbKey(item, sig)) ? '—' : '…'));
    }
    out.appendChild(thumb);
    const row = node('div', 'cand-row');
    row.appendChild(node('span', 'cand-name', labelOf(item)));
    if (item.id === entry.activeId) row.appendChild(node('span', 'cand-badge', '●'));
    if (item.id !== entry.activeId) {
      const pin = node('button', `cand-btn${item.pinned ? ' is-on' : ''}`, '★');
      pin.title = t('studio.media.candPin');
      pin.addEventListener('click', (event) => {
        event.stopPropagation();
        store().commands.toggleCandidatePin(target.beatId, item.id);
      });
      row.appendChild(pin);
      const del = node('button', 'cand-btn', '×');
      del.title = t('studio.media.candRemove');
      del.addEventListener('click', (event) => {
        event.stopPropagation();
        rollbackHover(true);
        store().commands.removeCandidate(target.beatId, item.id);
      });
      row.appendChild(del);
    }
    out.appendChild(row);
    out.addEventListener('mouseenter', () => beginHover(item));
    out.addEventListener('mouseleave', endHover);
    out.addEventListener('click', () => commit(item));
    return out;
  }

  function chip(text, on, onClick) {
    const out = node('button', `cand-chip${on ? ' is-on' : ''}`, text);
    out.type = 'button';
    out.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
    return out;
  }

  function candidateSelect(entry, value, onChange, allowKeep) {
    const options = [];
    if (allowKeep) options.push(['', t('studio.media.candMixKeep')]);
    for (const item of entry.items) options.push([item.id, labelOf(item)]);
    return select(options, value == null ? '' : value, onChange);
  }

  // Inline editor for the mix: one base candidate plus, per axis, the candidate
  // that axis is taken from (empty = keep the base's). Applying saves a new
  // 'saved' candidate and puts it on the beat.
  function renderMix(entry) {
    if (mix.base && !entry.items.some((item) => item.id === mix.base)) mix.base = null;
    const box = node('div', 'cand-mix');
    box.appendChild(node('div', 'cand-mix-title', t('studio.media.candMixTitle')));
    const baseRow = node('div', 'cand-mix-row');
    baseRow.appendChild(node('span', 'cand-mix-label', t('studio.media.candMixBase')));
    baseRow.appendChild(
      candidateSelect(entry, mix.base, (value) => {
        mix.base = value || null;
        scheduleRender();
      }),
    );
    box.appendChild(baseRow);
    for (const axis of AXES) {
      const row = node('div', 'cand-mix-row');
      row.appendChild(node('span', 'cand-mix-label', t(`studio.media.${AXIS_SOURCE[axis]}`)));
      row.appendChild(
        candidateSelect(
          entry,
          mix.take[axis],
          (value) => {
            mix.take = { ...mix.take, [axis]: value || null };
            scheduleRender();
          },
          true,
        ),
      );
      box.appendChild(row);
    }
    const apply = node('button', 'btn btn-mini btn-primary cand-mix-apply', t('studio.media.candMixApply'));
    apply.addEventListener('click', () => {
      const take = {};
      for (const axis of AXES) if (mix.take[axis]) take[axis] = mix.take[axis];
      store().commands.mixCandidate(target.cueId, target.beatId, { base: mix.base, take });
      mix = null;
      scheduleRender();
    });
    box.appendChild(apply);
    el.body.appendChild(box);
  }

  function render() {
    renderQueued = false;
    if (!el.body || !isVisible() || thumbBusy) return;
    // a hover is mid-preview: rebuilding the cards would drop the pointer
    if (hover && hover.real) return;
    target = resolveTarget();
    el.body.textContent = '';
    if (!target) {
      mix = null;
      el.body.appendChild(node('div', 'panel-placeholder', t('studio.media.candNoBeat')));
      return;
    }
    const doc = project();
    const cue = (doc.script.cues || []).find((entry) => entry.id === target.cueId);
    const entry = store().commands.candidatesOf(target.beatId);
    const head = node('div', 'cand-head');
    const text = String((target.beat && target.beat.text) || (cue && cue.text) || '').replace(/\s+/g, ' ').trim();
    head.appendChild(node('div', 'cand-target', text.length > 40 ? `${text.slice(0, 40)}…` : text));
    el.body.appendChild(head);

    const controls = node('div', 'cand-controls');
    const gen = node('button', 'btn btn-mini btn-primary', t('studio.media.candGenerate'));
    gen.addEventListener('click', generate);
    controls.appendChild(gen);
    controls.appendChild(
      select(
        [
          ['mixed', t('studio.media.candModeMixed')],
          ['near', t('studio.media.candModeNear')],
          ['far', t('studio.media.candModeFar')],
        ],
        mode,
        (value) => {
          mode = value;
        },
      ),
    );
    controls.appendChild(
      select(
        [2, 4, 6].map((n) => [n, `×${n}`]),
        count,
        (value) => {
          count = Number(value) || 6;
        },
      ),
    );
    const tourBtn = node('button', `btn btn-mini cand-tour-btn${tour ? ' is-on' : ''}`, tourButtonLabel());
    tourBtn.addEventListener('click', toggleTour);
    controls.appendChild(tourBtn);
    const keep = node('button', 'btn btn-mini', t('studio.media.candSave'));
    keep.addEventListener('click', keepCurrent);
    controls.appendChild(keep);
    const mixBtn = node('button', `btn btn-mini${mix ? ' is-on' : ''}`, t('studio.media.candMix'));
    mixBtn.addEventListener('click', () => {
      if (!entry) return;
      mix = mix ? null : { base: entry.activeId, take: {} };
      scheduleRender();
    });
    controls.appendChild(mixBtn);
    const boardBtn = node('button', `btn btn-mini${boardOpen ? ' is-on' : ''}`, t('studio.media.candBoard'));
    boardBtn.addEventListener('click', () => {
      if (SA.studio && typeof SA.studio.setBoard === 'function') SA.studio.setBoard(!boardOpen);
      else toggleBoard(!boardOpen);
    });
    controls.appendChild(boardBtn);
    el.body.appendChild(controls);

    // axis chips: a generated candidate may only change the chosen parts, the
    // rest of the look is copied from the beat's current look
    const axisRow = node('div', 'cand-axes');
    axisRow.appendChild(node('span', 'cand-axes-label', t('studio.media.candAxesLabel')));
    for (const axis of AXES) {
      axisRow.appendChild(
        chip(t(`studio.media.${AXIS_LABEL[axis]}`), axes[axis], () => {
          axes = { ...axes, [axis]: !axes[axis] };
          scheduleRender();
        }),
      );
    }
    el.body.appendChild(axisRow);
    el.body.appendChild(node('div', 'panel-placeholder cand-hint', t('studio.media.candHint')));

    if (!entry) {
      mix = null;
      el.body.appendChild(node('div', 'panel-placeholder', t('studio.media.candEmpty')));
      updateBadge();
      return;
    }
    if (mix) renderMix(entry);
    const grid = node('div', 'cand-grid');
    const sig = signature(target.cueId);
    for (const item of entry.items) grid.appendChild(card(item, entry, sig));
    el.body.appendChild(grid);
    markTourCard();
    updateBadge();
    fillThumbs();
  }

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(render);
  }

  // --- candidate board pane --------------------------------------------------
  // The whole song as a second timeline, below the main one: one column per beat
  // in cue order, one row per candidate index. The grid is virtualised (only the
  // cells inside the scroll viewport exist in the DOM) and the header / row
  // labels stay in view by re-positioning with the scroll offset. Clicking a
  // cell applies that candidate; the column under the playhead is highlighted
  // while the preview plays.

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // The beat under `time`: binary search over the precomputed column starts.
  function beatIndexAt(time) {
    const starts = boardModel ? boardModel.starts : null;
    if (!starts || !starts.length) return -1;
    let low = 0;
    let high = starts.length - 1;
    let found = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (starts[mid] <= time + 1e-4) {
        found = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return found;
  }

  function buildBoardModel() {
    const doc = project();
    const cols = [];
    const sigCache = new Map();
    for (const cue of (doc.script && doc.script.cues) || []) {
      let sig = sigCache.get(cue.id);
      if (sig === undefined) {
        sig = signature(cue.id);
        sigCache.set(cue.id, sig);
      }
      for (const beat of beatsOf(doc, cue)) {
        const entry = store().commands.candidatesOf(beat.id);
        const text = String((beat && beat.text) || (cue && cue.text) || '').replace(/\s+/g, ' ').trim();
        // the numbered rows: every card but the adopted one (it has its own slot)
        const rows = entry ? entry.items.filter((item) => item.id !== entry.activeId) : [];
        cols.push({ cueId: cue.id, beatId: beat.id, cue, beat, text, start: Number(beat.start) || 0, sig, entry, rows });
      }
    }
    const maxRows = cols.reduce((max, col) => Math.max(max, col.rows ? col.rows.length : 0), 0);
    boardModelKey = JSON.stringify(store().state.version);
    return { cols, starts: cols.map((col) => col.start), maxRows: Math.min(6, maxRows) };
  }

  // The first / last column and row inside the viewport (+1 cell margin).
  function visibleRange() {
    const cols = boardModel ? boardModel.cols : [];
    const maxRows = boardModel ? boardModel.maxRows : 0;
    const scroll = boardScroll;
    if (!scroll || !cols.length) return { colStart: 0, colEnd: -1, rowStart: 0, rowEnd: -1 };
    const viewLeft = scroll.scrollLeft;
    const viewTop = scroll.scrollTop;
    const viewW = scroll.clientWidth;
    const viewH = scroll.clientHeight;
    const lastCol = cols.length - 1;
    const lastRow = Math.max(0, maxRows - 1);
    return {
      colStart: clamp(Math.floor((viewLeft - BOARD.label) / BOARD.col) - 1, 0, lastCol),
      colEnd: clamp(Math.ceil((viewLeft + viewW - BOARD.label) / BOARD.col) + 1, 0, lastCol),
      rowStart: clamp(Math.floor((viewTop - BOARD.top) / BOARD.row) - 1, 0, lastRow),
      rowEnd: clamp(Math.ceil((viewTop + viewH - BOARD.top) / BOARD.row) + 1, 0, lastRow),
    };
  }

  function formatBoardTime(seconds) {
    const value = Math.max(0, seconds || 0);
    const minutes = Math.floor(value / 60);
    const rest = value - minutes * 60;
    return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
  }

  function boardHeadCell(col, index, top) {
    const cell = node('div', 'board-head');
    cell.dataset.col = String(index);
    cell.style.left = `${BOARD.label + index * BOARD.col}px`;
    cell.style.top = `${top}px`;
    cell.style.width = `${BOARD.col}px`;
    cell.style.height = `${BOARD.head}px`;
    const label = col.text.length > 14 ? `${col.text.slice(0, 14)}…` : col.text;
    cell.appendChild(node('div', 'board-beat', label || '—'));
    cell.appendChild(node('div', 'board-time', formatBoardTime(col.start)));
    // three icon buttons, the timeline's own icons per beat: generate (redraw
    // the numbered rows), variation, colour
    const tools = node('div', 'board-gen-row');
    const iconButton = (icon, tip, run) => {
      const button = node('button', 'btn btn-mini board-gen board-icon', icon);
      button.type = 'button';
      button.title = tip;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        rollbackHover(true);
        whenIdle(run);
      });
      return button;
    };
    tools.appendChild(iconButton('✨', t('studio.media.candBoardGenerateTip'), () => {
      reportGenerated(store().commands.generateCandidates(col.cueId, col.beatId, { count, mode, axes }), count);
    }));
    // the adopted card is never touched: each button fills numbered rows 1-6
    // with its own kind of change (everything / typeface+effects+placement+
    // clones / colour only)
    tools.appendChild(iconButton('🎲', t('studio.media.candBoardVariationTip'), () => {
      reportGenerated(store().commands.generateCandidates(col.cueId, col.beatId, {
        count: 6, mode: 'near', axes: { font: true, effects: true, placement: true, clones: true },
      }), 6);
    }));
    tools.appendChild(iconButton('◐', t('studio.media.candBoardColourTip'), () => {
      reportGenerated(store().commands.generateCandidates(col.cueId, col.beatId, {
        count: 6, mode: 'near', axes: { color: true },
      }), 6);
    }));
    cell.appendChild(tools);
    return cell;
  }

  function boardAdoptedLabel(left, top) {
    const cell = node('div', 'board-label board-adopt-label', t('studio.media.candWornName'));
    cell.style.left = `${left}px`;
    cell.style.top = `${top}px`;
    cell.style.width = `${BOARD.label}px`;
    cell.style.height = `${BOARD.row}px`;
    return cell;
  }

  function boardRowLabel(row, left) {
    const cell = node('div', 'board-label', `${row + 1}`);
    cell.style.left = `${left}px`;
    cell.style.top = `${BOARD.top + row * BOARD.row}px`;
    cell.style.width = `${BOARD.label}px`;
    cell.style.height = `${BOARD.row}px`;
    return cell;
  }

  function boardThumb(beatId, item, sig) {
    const cell = node('div', 'board-thumb');
    const key = thumbKeyFor(beatId, item, sig);
    const url = thumbs.get(key);
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.draggable = false;
      cell.appendChild(img);
    } else {
      cell.appendChild(node('span', 'board-thumb-wait', thumbs.has(key) ? '—' : '…'));
    }
    return cell;
  }

  // The adopted slot: a band above row 1 that stays in view. It shows the card
  // the beat wears now (initially the master); a beat on a hand-made look,
  // which no card holds, shows a dash. It reuses that card's thumbnail.
  function boardAdoptedCell(col, index, top) {
    const cell = node('div', 'board-cell board-adopted');
    cell.dataset.col = String(index);
    cell.style.left = `${BOARD.label + index * BOARD.col}px`;
    cell.style.top = `${top}px`;
    cell.style.width = `${BOARD.col}px`;
    cell.style.height = `${BOARD.row}px`;
    const active = col.entry && col.entry.items.find((item) => item.id === col.entry.activeId);
    if (!active) {
      cell.classList.add('is-empty');
      cell.appendChild(node('div', 'board-thumb', ''));
      cell.appendChild(node('div', 'board-name', t('studio.media.candAdoptedHand')));
      return cell;
    }
    cell.title = labelOf(active);
    cell.appendChild(boardThumb(col.beatId, active, col.sig));
    cell.appendChild(node('div', 'board-name', t('studio.media.candWornName')));
    // the adopted card previews like any other card on hover
    const over = { cueId: col.cueId, beatId: col.beatId, start: col.start, end: Number(col.beat && col.beat.end) || col.start + 1 };
    cell.addEventListener('mouseenter', () => beginHover(active, over));
    cell.addEventListener('mouseleave', endHover);
    return cell;
  }

  function boardCell(col, index, row) {
    const cell = node('div', 'board-cell');
    cell.dataset.col = String(index);
    cell.dataset.row = String(row);
    cell.style.left = `${BOARD.label + index * BOARD.col}px`;
    cell.style.top = `${BOARD.top + row * BOARD.row}px`;
    cell.style.width = `${BOARD.col}px`;
    cell.style.height = `${BOARD.row}px`;
    const item = col.rows && col.rows[row];
    if (!item) {
      cell.classList.add('is-empty');
      return cell;
    }
    cell.appendChild(boardThumb(col.beatId, item, col.sig));
    cell.appendChild(node('div', 'board-name', labelOf(item)));
    // hovering a board cell previews that beat the same way the tab does;
    // the click makes it real (one undo step)
    const over = { cueId: col.cueId, beatId: col.beatId, start: col.start, end: Number(col.beat && col.beat.end) || col.start + 1 };
    cell.addEventListener('mouseenter', () => beginHover(item, over));
    cell.addEventListener('mouseleave', endHover);
    cell.addEventListener('click', () => commit(item, over));
    return cell;
  }

  function renderBoard() {
    boardQueued = false;
    if (!boardOpen || !boardCanvas || !project()) return;
    updateBoardTools();
    // beats without a candidate entry get their original, in one command
    store().commands.ensureAllOriginals();
    if (!boardModel) boardModel = buildBoardModel();
    const { cols, maxRows } = boardModel;
    if (!cols.length) {
      boardCanvas.textContent = '';
      boardNodes.clear();
      boardMarker = null;
      boardCanvas.appendChild(node('div', 'panel-placeholder', t('studio.media.candNoBeat')));
      return;
    }
    // an empty-board placeholder from before is not one of the reconciled nodes
    for (const stray of [...boardCanvas.children]) {
      if (stray.classList && stray.classList.contains('panel-placeholder')) stray.remove();
    }
    boardCanvas.style.width = `${BOARD.label + cols.length * BOARD.col}px`;
    boardCanvas.style.height = `${BOARD.top + Math.max(1, maxRows) * BOARD.row}px`;
    const scroll = boardScroll;
    const viewLeft = scroll.scrollLeft;
    const viewTop = scroll.scrollTop;
    const range = visibleRange();
    // The grid is reconciled, not rebuilt: a node whose content signature is
    // unchanged is left alone (a rebuild of every cell on each thumbnail or
    // scroll tick is what made the pane flicker). Sticky parts only move.
    const seen = new Set();
    const place = (key, sig, build, reposition, base, patch) => {
      seen.add(key);
      const hit = boardNodes.get(key);
      if (hit && hit.sig === sig) {
        if (reposition) reposition(hit.el);
        return;
      }
      // same card, only its thumbnail moved on: swap the picture, not the cell
      if (hit && patch && base != null && hit.base === base && hit.el.parentNode) {
        patch(hit.el);
        hit.sig = sig;
        return;
      }
      const el = build();
      if (hit && hit.el.parentNode) hit.el.replaceWith(el);
      else boardCanvas.appendChild(el);
      boardNodes.set(key, { el, sig, base });
    };
    place('corner', 'corner', () => {
      const corner = node('div', 'board-corner');
      corner.style.width = `${BOARD.label}px`;
      corner.style.height = `${BOARD.head}px`;
      corner.style.left = `${viewLeft}px`;
      corner.style.top = `${viewTop}px`;
      return corner;
    }, (el) => {
      el.style.left = `${viewLeft}px`;
      el.style.top = `${viewTop}px`;
    });
    for (let index = range.colStart; index <= range.colEnd; index += 1) {
      const col = cols[index];
      place(`head:${index}`, `${col.beatId}|${col.cueId}|${col.start}|${col.text}|${count}|${mode}`, () => boardHeadCell(col, index, viewTop), (el) => {
        el.style.top = `${viewTop}px`;
      });
    }
    place('adopt-label', 'adopt-label', () => boardAdoptedLabel(viewLeft, viewTop + BOARD.head), (el) => {
      el.style.left = `${viewLeft}px`;
      el.style.top = `${viewTop + BOARD.head}px`;
    });
    for (let index = range.colStart; index <= range.colEnd; index += 1) {
      const col = cols[index];
      const active = col.entry && col.entry.items.find((item) => item.id === col.entry.activeId);
      let sig = 'hand';
      let base = null;
      if (active) {
        const thumbKey = thumbKeyFor(col.beatId, active, col.sig);
        const url = thumbs.get(thumbKey);
        const state = url ? `img:${hashOf(url)}` : thumbs.has(thumbKey) ? 'none' : 'wait';
        base = `adopt|${col.beatId}|${col.cueId}|${col.start}|${active.id}|${labelOf(active)}`;
        sig = `${base}|${state}`;
      }
      place(`adopt:${index}`, sig, () => boardAdoptedCell(col, index, viewTop + BOARD.head), (el) => {
        el.style.top = `${viewTop + BOARD.head}px`;
      }, base, active ? (el) => {
        const fresh = boardThumb(col.beatId, active, col.sig);
        const old = el.querySelector('.board-thumb');
        if (old) old.replaceWith(fresh);
        else el.prepend(fresh);
      } : null);
    }
    for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
      place(`label:${row}`, `label:${row}`, () => boardRowLabel(row, viewLeft), (el) => {
        el.style.left = `${viewLeft}px`;
      });
    }
    for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
      for (let index = range.colStart; index <= range.colEnd; index += 1) {
        const col = cols[index];
        const item = col.rows && col.rows[row];
        let sig;
        let base = null;
        if (!item) {
          sig = 'empty';
        } else {
          const thumbKey = thumbKeyFor(col.beatId, item, col.sig);
          const url = thumbs.get(thumbKey);
          const state = url ? `img:${hashOf(url)}` : thumbs.has(thumbKey) ? 'none' : 'wait';
          base = `${col.beatId}|${col.cueId}|${col.start}|${item.id}|${item.kind}|${labelOf(item)}`;
          sig = `${base}|${state}`;
        }
        place(`cell:${row}:${index}`, sig, () => boardCell(col, index, row), null, base, item ? (el) => {
          const fresh = boardThumb(col.beatId, item, col.sig);
          const old = el.querySelector('.board-thumb');
          if (old) old.replaceWith(fresh);
          else el.prepend(fresh);
        } : null);
      }
    }
    // whatever left the visible window goes
    for (const [key, node_] of boardNodes) {
      if (seen.has(key)) continue;
      node_.el.remove();
      boardNodes.delete(key);
    }
    if (!boardMarker || !boardMarker.parentNode) {
      boardMarker = node('div', 'board-marker');
      boardMarker.hidden = true;
      boardCanvas.appendChild(boardMarker);
    }
    boardMarker.style.top = `${viewTop}px`;
    boardMarker.style.height = `${Math.max(scroll.clientHeight, 1)}px`;
    followCol = -1;
    updateNow();
    boardGen += 1;
    fillBoardThumbs();
  }

  // Scrolls the "now" column into view only when it left the viewport / neared
  // the right edge. Smooth, and flagged so the scroll listener does not mistake
  // it for a hand scroll.
  function scrollToColumn(index) {
    const scroll = boardScroll;
    if (!scroll) return;
    const x = BOARD.label + index * BOARD.col;
    const left = scroll.scrollLeft;
    const right = left + scroll.clientWidth;
    if (x < left + BOARD.label || x + BOARD.col > right - BOARD.col) {
      const target = Math.max(0, x - scroll.clientWidth * 0.35);
      programmaticScroll = true;
      if (typeof scroll.scrollTo === 'function') scroll.scrollTo({ left: target, behavior: 'smooth' });
      else scroll.scrollLeft = target;
      setTimeout(() => {
        programmaticScroll = false;
      }, 400);
    }
  }

  // Highlights the column of the beat under the playhead. Cheap per frame: the
  // beat is found by binary search and the DOM is only touched when the column
  // changes.
  function updateNow() {
    if (!boardOpen || !boardCanvas || !boardModel) return;
    // the beat under the cursor, playing or not: moving the cursor shows which
    // column of the board it is. While paused a cursor in a gap shows none.
    const head = store().state.playhead;
    let index = beatIndexAt(head);
    if (index >= 0 && !store().state.playing) {
      const col = boardModel.cols[index];
      const end = Number(col && col.beat && col.beat.end);
      if (Number.isFinite(end) && head > end + 1e-4) index = -1;
    }
    if (index === followCol) return;
    followCol = index;
    for (const stale of boardCanvas.querySelectorAll('.is-now')) stale.classList.remove('is-now');
    if (index < 0 || !boardModel.cols[index]) {
      if (boardMarker) boardMarker.hidden = true;
      return;
    }
    for (const head of boardCanvas.querySelectorAll(`.board-head[data-col="${index}"]`)) head.classList.add('is-now');
    for (const cell of boardCanvas.querySelectorAll(`.board-cell[data-col="${index}"]`)) cell.classList.add('is-now');
    if (boardMarker) {
      boardMarker.hidden = false;
      boardMarker.style.left = `${BOARD.label + index * BOARD.col + Math.floor(BOARD.col / 2)}px`;
    }
    if (follow && !(hover && hoverAt)) scrollToColumn(index);
  }

  function scheduleBoard() {
    if (boardQueued || !boardOpen) return;
    boardQueued = true;
    requestAnimationFrame(renderBoard);
  }

  // Called by app.js when the Board pane opens / closes. Opening seeds the
  // original candidate for every beat and lays the grid out.
  function setOpen(open) {
    boardOpen = !!open;
    boardModel = null;
    boardModelKey = null;
    followCol = -1;
    if (!boardOpen) return;
    follow = true;
    wasPlaying = !!store().state.playing;
    if (project()) store().commands.ensureAllOriginals();
    scheduleBoard();
  }

  function toggleBoard(open) {
    if (SA.studio && typeof SA.studio.setBoard === 'function') SA.studio.setBoard(!!open);
    else setOpen(!!open);
  }

  // --- board pane toolbar: generate for the beat in use / for every beat ------

  let genAll = null; // { done, total, cancel } while the all-beats run goes
  let boardToolEls = null;

  function songBeatRefs() {
    const doc = project();
    const refs = [];
    for (const cue of (doc && doc.script && doc.script.cues) || []) {
      for (const beat of beatsOf(doc, cue)) refs.push({ cueId: cue.id, beatId: beat.id });
    }
    return refs;
  }

  function updateBoardTools() {
    if (!boardToolEls) return;
    boardToolEls.all.textContent = genAll ? t('studio.media.candGenAllStop', { done: genAll.done, total: genAll.total }) : t('studio.media.candGenAll');
    boardToolEls.all.classList.toggle('is-on', !!genAll);
    boardToolEls.one.disabled = !!genAll;
    boardToolEls.mode.value = mode;
    boardToolEls.count.value = String(count);
  }

  function generateSelected() {
    const here = resolveTarget();
    if (!here) {
      toast('studio.media.candNoBeat');
      return;
    }
    rollbackHover(true);
    whenIdle(() => reportGenerated(store().commands.generateCandidates(here.cueId, here.beatId, { count, mode, axes }), count));
  }

  // Draws every beat in turn, yielding between beats so the UI stays alive; the
  // same button stops it. Only the original, pinned and in-use candidates of a
  // beat survive (the store drops the rest), so it asks first.
  async function generateAll() {
    if (genAll) {
      genAll.cancel = true;
      return;
    }
    if (!project()) return;
    const refs = songBeatRefs();
    if (!refs.length) return;
    if (typeof window.confirm === 'function' && !window.confirm(t('studio.media.candAllConfirm', { n: refs.length }))) return;
    rollbackHover(true);
    genAll = { done: 0, total: refs.length, cancel: false };
    updateBoardTools();
    const each = Math.min(count, 6);
    try {
      for (const ref of refs) {
        if (genAll.cancel) break;
        await whenIdle(() => store().commands.generateCandidates(ref.cueId, ref.beatId, { count: each, mode, axes }));
        genAll.done += 1;
        updateBoardTools();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      const summary = { done: genAll.done, total: genAll.total };
      genAll = null;
      updateBoardTools();
      scheduleBoard();
      toast('studio.media.candAllDone', summary);
    }
  }

  function setupBoardTools() {
    const title = document.querySelector('#board-panel .board-title');
    const close = document.getElementById('board-close');
    if (!title) return;
    const wrap = node('div', 'board-tools');
    const one = node('button', 'btn btn-mini btn-primary', t('studio.media.candBoardGenSel'));
    one.addEventListener('click', generateSelected);
    const all = node('button', 'btn btn-mini', t('studio.media.candGenAll'));
    all.addEventListener('click', generateAll);
    const modeSelect = select(
      [
        ['mixed', t('studio.media.candModeMixed')],
        ['near', t('studio.media.candModeNear')],
        ['far', t('studio.media.candModeFar')],
      ],
      mode,
      (value) => {
        mode = value;
        scheduleRender();
      },
    );
    const countSelect = select(
      [2, 4, 6].map((n) => [n, `×${n}`]),
      count,
      (value) => {
        count = Number(value) || 6;
        scheduleRender();
      },
    );
    wrap.appendChild(one);
    wrap.appendChild(all);
    wrap.appendChild(modeSelect);
    wrap.appendChild(countSelect);
    title.insertBefore(wrap, close || null);
    boardToolEls = { one, all, mode: modeSelect, count: countSelect };
  }

  // Right click on a cell or a column head: move the cursor to that beat.
  let boardMenu = null;

  function hideBoardMenu() {
    if (boardMenu) boardMenu.remove();
    boardMenu = null;
    document.removeEventListener('pointerdown', onBoardMenuAway, true);
    document.removeEventListener('keydown', onBoardMenuKey, true);
    window.removeEventListener('blur', hideBoardMenu);
  }

  function onBoardMenuAway(event) {
    if (boardMenu && !boardMenu.contains(event.target)) hideBoardMenu();
  }

  function onBoardMenuKey(event) {
    if (event.key === 'Escape') hideBoardMenu();
  }

  function onBoardContextMenu(event) {
    const holder = event.target.closest ? event.target.closest('[data-col]') : null;
    if (!holder || !boardModel) return;
    const col = boardModel.cols[Number(holder.dataset.col)];
    if (!col) return;
    event.preventDefault();
    hideBoardMenu();
    const menu = node('div', 'timeline-menu board-menu');
    // a candidate cell can be adopted: it goes to the beat, into the adopted slot
    const row = holder.classList.contains('board-cell') ? holder.dataset.row : null;
    const picked = row != null && col.rows ? col.rows[Number(row)] : null;
    if (picked && picked.id !== col.entry.activeId) {
      const adopt = node('button', 'menu-item', t('studio.media.candAdopt'));
      adopt.type = 'button';
      adopt.addEventListener('click', () => {
        hideBoardMenu();
        rollbackHover(true);
        store().commands.applyCandidate(col.cueId, col.beatId, picked.id);
      });
      menu.appendChild(adopt);
    }
    if (picked) {
      const refresh = node('button', 'menu-item', t('studio.media.candRefreshThumb'));
      refresh.type = 'button';
      refresh.addEventListener('click', () => {
        hideBoardMenu();
        thumbs.delete(thumbKeyFor(col.beatId, picked, col.sig));
        boardGen += 1;
        scheduleBoard();
      });
      menu.appendChild(refresh);
    }
    const item = node('button', 'menu-item', t('studio.media.candBoardMoveCursor'));
    item.type = 'button';
    item.addEventListener('click', () => {
      hideBoardMenu();
      // the cursor goes to the beat's start; a candidate preview must not hold the screen
      rollbackHover(true);
      if (SA.preview && typeof SA.preview.seek === 'function') SA.preview.seek(col.start);
      follow = true;
    });
    menu.appendChild(item);
    menu.style.position = 'fixed';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    document.body.appendChild(menu);
    boardMenu = menu;
    // keep it inside the window
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${Math.max(0, window.innerWidth - rect.width - 4)}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${Math.max(0, window.innerHeight - rect.height - 4)}px`;
    document.addEventListener('pointerdown', onBoardMenuAway, true);
    document.addEventListener('keydown', onBoardMenuKey, true);
    window.addEventListener('blur', hideBoardMenu);
  }

  function setupBoardDom() {
    setupBoardTools();
    const body = document.getElementById('board-body');
    if (!body) return;
    boardScroll = node('div', 'board-scroll');
    boardCanvas = node('div', 'board-canvas');
    boardScroll.appendChild(boardCanvas);
    body.appendChild(boardScroll);
    boardCanvas.addEventListener('contextmenu', onBoardContextMenu);
    boardScroll.addEventListener('scroll', () => {
      if (!programmaticScroll) follow = false;
      scheduleBoard();
    });
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => scheduleBoard());
      observer.observe(boardScroll);
    } else {
      window.addEventListener('resize', scheduleBoard);
    }
  }

  function updateBadge() {
    if (!el.tab) return;
    const base = t('studio.media.tabCandidates');
    const entry = target ? store().commands.candidatesOf(target.beatId) : null;
    el.tab.textContent = entry ? `${base} (${entry.items.length})` : base;
    el.tab.classList.toggle('has-media', !!entry);
  }

  function init(options) {
    const opts = options || {};
    el.tab = opts.tab;
    el.pane = opts.pane;
    toast = opts.toast || toast;
    if (!el.pane) return;
    el.body = node('div', 'cand-body');
    el.pane.appendChild(el.body);
    setupBoardDom();
    let lastKey = '';
    let epoch = store().state.projectEpoch || 0;
    store().subscribe('candidates', (state) => {
      // another project was loaded (open, new, reload): nothing of the old
      // one may stay on screen — thumbnails, the board, a running preview
      if ((state.projectEpoch || 0) !== epoch) {
        epoch = state.projectEpoch || 0;
        thumbs.clear();
        boardModel = null;
        boardModelKey = null;
        mix = null;
        rollbackHover(true);
        boardGen += 1; // cancels a thumbnail queue of the old project
        lastKey = '';
        if (el.body) el.body.textContent = '';
        if (boardCanvas) boardCanvas.textContent = '';
        boardNodes.clear();
        boardMarker = null;
        if (boardOpen) scheduleBoard();
      }
      // board: rebuild the model only when the project / selection moved; while
      // playing the playhead only moves the "now" column
      if (boardOpen) {
        const versionKey = JSON.stringify(state.version);
        if (thumbBusy && store().transactionToken() !== 0) {
          // our own scratch transaction (a thumbnail shot) moves the version on
          // purpose and rolls it back: a rebuild per shot is what flickered
          if (state.playing) updateNow();
        } else if (hover && hover.real) {
          // a hover preview moves the project version on purpose: keep the
          // cells (and the pointer's target) as they are until it ends
          if (state.playing) updateNow();
        } else if (versionKey !== boardModelKey) {
          boardModel = null;
          scheduleBoard();
        } else if (state.playing && !wasPlaying) {
          follow = true; // a new play resumes following after a hand scroll
          scheduleBoard();
        } else if (state.playing) {
          updateNow();
        } else if (wasPlaying) {
          updateNow();
        } else if (state.playhead !== boardHead) {
          // the cursor was moved by hand: show its column, even after a hand scroll
          follow = true;
          updateNow();
        }
        wasPlaying = !!state.playing;
        boardHead = state.playhead;
      }
      // re-render on any change of the project, selection or active beat; the
      // playhead alone only matters for the "beat under the playhead" fallback
      const sel = (state.selection.paths || []).join('|');
      const key = `${JSON.stringify(state.version)}#${sel}#${state.selection.paths && state.selection.paths.length ? '' : Math.floor(state.playhead)}`;
      if (key === lastKey) return;
      lastKey = key;
      if (hover && hover.real) return;
      if (isVisible()) scheduleRender();
      else {
        target = resolveTarget();
        updateBadge();
      }
    });
  }

  return { init, render: scheduleRender, resolveTarget, setOpen };
})();
