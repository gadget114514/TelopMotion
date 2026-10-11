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
  const PRE_ROLL = 0.3;
  const THUMB_CACHE_MAX = 600;
  const BEAT_PATH = /cue:([^/]+)(?:\/beat:([^/]+))?/;
  // the axis groups the store rolls one at a time (kept in the same order)
  const AXES = ['color', 'font', 'effects', 'placement', 'clones'];
  const AXIS_LABEL = { color: 'candAxesColor', font: 'candAxesFont', effects: 'candAxesEffects', placement: 'candAxesPlacement', clones: 'candAxesClones' };
  const AXIS_SOURCE = { color: 'candMixAxisColor', font: 'candMixAxisFont', effects: 'candMixAxisEffects', placement: 'candMixAxisPlacement', clones: 'candMixAxisClones' };
  // the board's virtual grid: a column per beat, a row per candidate index
  const BOARD = { col: 92, row: 74, head: 46, label: 42 };

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

  // What a thumbnail of this cue's beats depends on besides the beat's own
  // look: the project style, the cue style, the output frame and the clips
  // (backdrop / filler / figure) under the cue. A content hash, not a length:
  // a recolour or a re-drawn param usually keeps the text the same size.
  function signature(cueId) {
    const doc = project();
    const own = (doc.cueStyles && doc.cueStyles[cueId]) || {};
    const output = doc.output || {};
    const cue = ((doc.script && doc.script.cues) || []).find((entry) => entry.id === cueId);
    const from = cue ? Number(cue.start) || 0 : 0;
    const to = cue ? Number(cue.end) || from : Infinity;
    const clips = (doc.clips || []).filter((clip) => (Number(clip.start) || 0) < to && (Number(clip.end) || 0) > from);
    return hashOf(JSON.stringify([doc.style || {}, own, output.aspect || '', output.width || 0, output.height || 0, clips]));
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
    if (item.kind === 'original') return t('studio.media.candOriginal');
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

  // `over` names another beat (a board cell); without it the hover is on the
  // selected beat of the Candidates tab.
  function beginHover(item, over) {
    const at = over || target;
    if (!at || !project()) return;
    if (tour) cancelTour();
    if (leaveTimer) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
    if (hover && hover.candidateId === item.id && hover.beatId === at.beatId) return;
    hoverAt = over ? { cueId: over.cueId, beatId: over.beatId, start: Number(over.start) || 0, end: Number(over.end) || 0 } : null;
    hover = { cueId: at.cueId, beatId: at.beatId, candidateId: item.id, real: false };
    playCandidate(at, item.id);
    startHoverWatch();
  }

  // Ends the temporary preview: the candidate player is hidden, nothing else
  // was touched. (`stopPlay` is kept for the callers' sake.)
  function rollbackHover(stopPlay) {
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

  // A draw reads the beat's committed look, so it must not run while a
  // thumbnail transaction has other candidates applied for a moment: wait for
  // the shots in flight to roll back first.
  function whenIdle(task) {
    if (!thumbBusy) return Promise.resolve(task());
    return new Promise((resolve) => {
      const wait = () => {
        if (thumbBusy) setTimeout(wait, 25);
        else resolve(task());
      };
      wait();
    });
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

  // Each missing thumbnail is rendered by applying the look inside one
  // transaction, shooting one frame in the middle of the beat, and rolling the
  // whole transaction back. Nothing reaches the history or the document. The
  // tab and the board share this, only their caches and jobs differ.
  async function runShots(jobs, cache, after, shouldStop) {
    if (!jobs.length) return;
    thumbBusy = true;
    store().beginTransaction('candidate thumbnails');
    try {
      for (const job of jobs) {
        // the view scrolled away: drop the stale queue, the next render builds
        // a fresh one for the new visible range
        if (shouldStop && shouldStop()) break;
        // a failed shot is remembered as '' so it is not retried in a loop
        let url = '';
        try {
          store().commands.applyCandidate(job.cueId, job.beatId, job.candidateId);
          await nextFrame();
          const shot = SA.preview.captureRGBA(job.time);
          if (shot) url = shotToDataUrl(shot);
        } catch {
          url = '';
        }
        cache.set(job.key, url);
      }
    } finally {
      store().cancelTransaction();
      thumbBusy = false;
      if (after) after();
    }
  }

  function canShoot() {
    return !!(SA.preview && SA.preview.isWebGL2 && SA.preview.isWebGL2()) && !store().state.playing;
  }

  async function fillThumbs() {
    if (thumbBusy || genAll || hover || tour || !target || !isVisible() || !canShoot()) return;
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
    if (!boardOpen || thumbBusy || genAll || hover || tour || !boardModel || !canShoot()) return;
    const cols = boardModel.cols;
    if (!cols.length) return;
    const range = visibleRange();
    const jobs = [];
    for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
      for (let col = range.colStart; col <= range.colEnd; col += 1) {
        const column = cols[col];
        const item = column.entry && column.entry.items[row];
        if (!item) continue;
        const key = thumbKeyFor(column.beatId, item, column.sig);
        if (thumbs.has(key)) continue;
        const start = column.start;
        const end = Math.max(Number(column.beat.end) || start + 1, start + 0.2);
        const time = start + Math.min((end - start) * 0.6, 1.1);
        jobs.push({ cueId: column.cueId, beatId: column.beatId, candidateId: item.id, key, time });
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
    if (item.kind === 'original') out.classList.add('is-original');
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
    if (item.kind !== 'original') {
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
        [4, 6, 9, 12].map((n) => [n, `×${n}`]),
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
        cols.push({ cueId: cue.id, beatId: beat.id, cue, beat, text, start: Number(beat.start) || 0, sig, entry });
      }
    }
    const maxRows = cols.reduce((max, col) => Math.max(max, col.entry ? col.entry.items.length : 0), 0);
    boardModelKey = JSON.stringify(store().state.version);
    return { cols, starts: cols.map((col) => col.start), maxRows: Math.min(15, maxRows) };
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
      rowStart: clamp(Math.floor((viewTop - BOARD.head) / BOARD.row) - 1, 0, lastRow),
      rowEnd: clamp(Math.ceil((viewTop + viewH - BOARD.head) / BOARD.row) + 1, 0, lastRow),
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
    const gen = node('button', 'btn btn-mini board-gen', t('studio.media.candBoardGenerate'));
    gen.addEventListener('click', (event) => {
      event.stopPropagation();
      rollbackHover(true);
      whenIdle(() => reportGenerated(store().commands.generateCandidates(col.cueId, col.beatId, { count, mode, axes }), count));
    });
    cell.appendChild(gen);
    return cell;
  }

  function boardRowLabel(row, left) {
    const cell = node('div', 'board-label', `${row + 1}`);
    cell.style.left = `${left}px`;
    cell.style.top = `${BOARD.head + row * BOARD.row}px`;
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

  function boardCell(col, index, row) {
    const cell = node('div', 'board-cell');
    cell.dataset.col = String(index);
    cell.style.left = `${BOARD.label + index * BOARD.col}px`;
    cell.style.top = `${BOARD.head + row * BOARD.row}px`;
    cell.style.width = `${BOARD.col}px`;
    cell.style.height = `${BOARD.row}px`;
    const item = col.entry && col.entry.items[row];
    if (!item) {
      cell.classList.add('is-empty');
      return cell;
    }
    if (item.id === col.entry.activeId) cell.classList.add('is-active');
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
    boardCanvas.textContent = '';
    boardMarker = null;
    if (!cols.length) {
      boardCanvas.appendChild(node('div', 'panel-placeholder', t('studio.media.candNoBeat')));
      return;
    }
    boardCanvas.style.width = `${BOARD.label + cols.length * BOARD.col}px`;
    boardCanvas.style.height = `${BOARD.head + Math.max(1, maxRows) * BOARD.row}px`;
    const scroll = boardScroll;
    const viewLeft = scroll.scrollLeft;
    const viewTop = scroll.scrollTop;
    const range = visibleRange();
    // corner + the sticky header row / label column, re-positioned to the scroll
    const corner = node('div', 'board-corner');
    corner.style.left = `${viewLeft}px`;
    corner.style.top = `${viewTop}px`;
    corner.style.width = `${BOARD.label}px`;
    corner.style.height = `${BOARD.head}px`;
    boardCanvas.appendChild(corner);
    for (let index = range.colStart; index <= range.colEnd; index += 1) {
      boardCanvas.appendChild(boardHeadCell(cols[index], index, viewTop));
    }
    for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
      boardCanvas.appendChild(boardRowLabel(row, viewLeft));
    }
    for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
      for (let index = range.colStart; index <= range.colEnd; index += 1) {
        boardCanvas.appendChild(boardCell(cols[index], index, row));
      }
    }
    boardMarker = node('div', 'board-marker');
    boardMarker.style.top = `${viewTop}px`;
    boardMarker.style.height = `${Math.max(scroll.clientHeight, 1)}px`;
    boardMarker.hidden = true;
    boardCanvas.appendChild(boardMarker);
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
      [4, 6, 9, 12].map((n) => [n, `×${n}`]),
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
        if (boardOpen) scheduleBoard();
      }
      // board: rebuild the model only when the project / selection moved; while
      // playing the playhead only moves the "now" column
      if (boardOpen) {
        const versionKey = JSON.stringify(state.version);
        if (hover && hover.real) {
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
