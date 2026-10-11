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
  const BOARD_THUMB_LIMIT = 160;
  const BEAT_PATH = /cue:([^/]+)(?:\/beat:([^/]+))?/;
  // the axis groups the store rolls one at a time (kept in the same order)
  const AXES = ['color', 'font', 'effects', 'placement'];
  const AXIS_LABEL = { color: 'candAxesColor', font: 'candAxesFont', effects: 'candAxesEffects', placement: 'candAxesPlacement' };
  const AXIS_SOURCE = { color: 'candMixAxisColor', font: 'candMixAxisFont', effects: 'candMixAxisEffects', placement: 'candMixAxisPlacement' };

  const el = {};
  const thumbs = new Map(); // `${beatId}|${candidateId}|${kind}|len|signature}` -> data URL ('' = failed)
  const boardThumbs = new Map(); // same keys, for the whole-song board dialog
  let mode = 'mixed';
  let count = 6;
  let axes = { color: true, font: true, effects: true, placement: true };
  let mix = null; // { base, take } while the mix editor is open, null otherwise
  let board = null; // { body, root } while the board dialog is open
  let target = null; // { cueId, beatId }
  let hover = null; // { cueId, beatId, candidateId }
  let leaveTimer = null;
  let loopTimer = null;
  let hoverPlay = null; // { restoreHead } when the hover itself started playback
  let thumbBusy = false;
  let renderQueued = false;
  let boardQueued = false;
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

  function signature(cueId) {
    const doc = project();
    const own = (doc.cueStyles && doc.cueStyles[cueId]) || {};
    const output = doc.output || {};
    return `${JSON.stringify(doc.style || {}).length}:${JSON.stringify(own).length}:${output.aspect || ''}`;
  }

  function thumbKeyFor(beatId, item, sig) {
    return `${beatId}|${item.id}|${item.kind}|${JSON.stringify(item.look).length}|${sig}`;
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
    const beat = target && target.beat;
    const start = Number(beat && beat.start) || 0;
    const end = Number(beat && beat.end) || start + 1;
    return { start, end: Math.max(end, start + 0.2) };
  }

  function stopLoop() {
    if (loopTimer) clearInterval(loopTimer);
    loopTimer = null;
  }

  function startLoop() {
    stopLoop();
    loopTimer = setInterval(() => {
      if (!hover || !SA.preview) return;
      const { start, end } = beatRange();
      if (store().state.playhead > end + 0.4) SA.preview.seek(Math.max(0, start - PRE_ROLL));
    }, 80);
  }

  function beginHover(item) {
    if (!target || !project()) return;
    if (leaveTimer) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
    const entry = store().commands.candidatesOf(target.beatId);
    if (hover && hover.candidateId === item.id) return;
    rollbackHover(false);
    if (!entry || item.id === entry.activeId) {
      // the active look is already on the beat: only keep the loop going
      hover = { cueId: target.cueId, beatId: target.beatId, candidateId: item.id, real: false };
    } else {
      store().beginTransaction('preview candidate');
      store().commands.applyCandidate(target.cueId, target.beatId, item.id);
      hover = { cueId: target.cueId, beatId: target.beatId, candidateId: item.id, real: true };
    }
    const { start } = beatRange();
    const head = store().state.playhead;
    const { end } = beatRange();
    const inside = head >= start - 0.6 && head <= end + 0.4;
    if (!store().state.playing) {
      if (!hoverPlay) hoverPlay = { restoreHead: head };
      SA.preview.seek(Math.max(0, start - PRE_ROLL));
      SA.preview.play();
    } else if (!inside) {
      SA.preview.seek(Math.max(0, start - PRE_ROLL));
    }
    startLoop();
  }

  // Rolls the temporary look back. `stopPlay` also stops a playback the hover
  // started and puts the playhead where it was.
  function rollbackHover(stopPlay) {
    if (hover && hover.real) store().cancelTransaction();
    hover = null;
    if (!stopPlay) return;
    stopLoop();
    if (hoverPlay) {
      const restore = hoverPlay.restoreHead;
      hoverPlay = null;
      if (store().state.playing) SA.preview.pause();
      SA.preview.seek(restore);
    }
  }

  function endHover() {
    if (leaveTimer) clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      leaveTimer = null;
      rollbackHover(true);
      scheduleRender();
    }, HOVER_LEAVE_MS);
  }

  // --- actions ---------------------------------------------------------------

  function commit(item) {
    if (!target) return;
    if (leaveTimer) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
    const { cueId, beatId } = target;
    // the temporary look goes first, then the real (undoable) apply
    rollbackHover(false);
    store().commands.applyCandidate(cueId, beatId, item.id);
    const { start } = beatRange();
    if (hoverPlay) {
      hoverPlay = null; // keep playing: the chosen look is what the user is watching
    } else if (!store().state.playing) {
      SA.preview.seek(Math.max(0, start - PRE_ROLL));
      SA.preview.play();
    }
    startLoop();
  }

  function generate() {
    if (!target) return;
    rollbackHover(true);
    const made = store().commands.generateCandidates(target.cueId, target.beatId, { count, mode, axes });
    if (!made) toast('studio.media.candNone');
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
  async function runShots(jobs, cache, after) {
    if (!jobs.length) return;
    thumbBusy = true;
    store().beginTransaction('candidate thumbnails');
    try {
      for (const job of jobs) {
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
    if (thumbBusy || hover || !target || !isVisible() || !canShoot()) return;
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

  function fillBoardThumbs() {
    if (!board || thumbBusy || !canShoot()) return;
    const doc = project();
    const jobs = [];
    for (const cue of doc.script.cues || []) {
      for (const beat of beatsOf(doc, cue)) {
        const entry = store().commands.candidatesOf(beat.id);
        if (!entry) continue;
        const sig = signature(cue.id);
        const start = Number(beat.start) || 0;
        const end = Math.max(Number(beat.end) || start + 1, start + 0.2);
        const time = start + Math.min((end - start) * 0.6, 1.1);
        for (const item of entry.items) {
          const key = thumbKeyFor(beat.id, item, sig);
          if (boardThumbs.has(key)) continue;
          jobs.push({ cueId: cue.id, beatId: beat.id, candidateId: item.id, key, time });
          if (jobs.length >= BOARD_THUMB_LIMIT) break;
        }
        if (jobs.length >= BOARD_THUMB_LIMIT) break;
      }
      if (jobs.length >= BOARD_THUMB_LIMIT) break;
    }
    if (!jobs.length) return;
    runShots(jobs, boardThumbs, () => {
      if (board) scheduleBoard();
    });
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
    const boardBtn = node('button', 'btn btn-mini', t('studio.media.candBoard'));
    boardBtn.addEventListener('click', openBoard);
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
    updateBadge();
    fillThumbs();
  }

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(render);
  }

  // --- candidate board -------------------------------------------------------
  // The whole song at a glance: one column per beat in cue order, one row per
  // candidate index. The active candidate of a beat is highlighted; clicking a
  // cell applies it, and a beat without candidates shows a Generate button.

  function openBoard() {
    if (!project()) return;
    rollbackHover(true);
    const root = document.getElementById('dialog-root');
    if (!root) return;
    const dialog = node('div', 'dialog dialog-wide cand-board-dialog');
    const head = node('div', 'dialog-header');
    head.appendChild(node('h3', null, t('studio.media.candBoardTitle')));
    dialog.appendChild(head);
    const body = node('div', 'cand-board-body');
    dialog.appendChild(body);
    const actions = node('div', 'dialog-actions');
    const close = node('button', 'btn btn-mini', t('studio.media.candBoardClose'));
    close.addEventListener('click', () => {
      board = null;
      root.hidden = true;
      root.innerHTML = '';
    });
    actions.appendChild(close);
    dialog.appendChild(actions);
    root.innerHTML = '';
    root.appendChild(dialog);
    root.hidden = false;
    board = { body, root };
    renderBoard();
  }

  function scheduleBoard() {
    if (boardQueued) return;
    boardQueued = true;
    requestAnimationFrame(() => {
      boardQueued = false;
      renderBoard();
    });
  }

  function boardThumb(beatId, item, sig) {
    const key = thumbKeyFor(beatId, item, sig);
    const cell = node('div', 'cand-thumb');
    const url = boardThumbs.get(key);
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.draggable = false;
      cell.appendChild(img);
    } else {
      cell.appendChild(node('span', 'cand-thumb-wait', boardThumbs.has(key) ? '—' : '…'));
    }
    return cell;
  }

  function renderBoard() {
    if (!board) return;
    const doc = project();
    board.body.textContent = '';
    const columns = [];
    for (const cue of doc.script.cues || []) for (const beat of beatsOf(doc, cue)) columns.push({ cue, beat });
    if (!columns.length) {
      board.body.appendChild(node('div', 'panel-placeholder', t('studio.media.candNoBeat')));
      return;
    }
    const entries = columns.map((col) => store().commands.candidatesOf(col.beat.id));
    const sigCache = new Map();
    const sigOf = (cueId) => {
      if (!sigCache.has(cueId)) sigCache.set(cueId, signature(cueId));
      return sigCache.get(cueId);
    };
    const rows = entries.reduce((max, entry) => Math.max(max, entry ? entry.items.length : 0), 0);
    const grid = node('div', 'cand-board-grid');
    grid.style.gridTemplateColumns = `88px repeat(${columns.length}, minmax(72px, 1fr))`;
    grid.appendChild(node('div', 'cand-board-corner', ''));
    columns.forEach((col, index) => {
      const cell = node('div', 'cand-board-head');
      const label = String((col.beat && col.beat.text) || (col.cue && col.cue.text) || '').replace(/\s+/g, ' ').trim();
      cell.appendChild(node('div', 'cand-board-beat', label.length > 12 ? `${label.slice(0, 12)}…` : label));
      const entry = entries[index];
      if (entry) {
        cell.appendChild(node('div', 'cand-board-count', `×${entry.items.length}`));
      } else {
        const gen = node('button', 'btn btn-mini', t('studio.media.candBoardGenerate'));
        gen.addEventListener('click', () => {
          store().commands.generateCandidates(col.cue.id, col.beat.id, { count, mode, axes });
          scheduleBoard();
        });
        cell.appendChild(gen);
      }
      grid.appendChild(cell);
    });
    for (let row = 0; row < rows; row += 1) {
      grid.appendChild(node('div', 'cand-board-rowlabel', `${row + 1}`));
      columns.forEach((col, index) => {
        const entry = entries[index];
        const item = entry && entry.items[row];
        const cell = node('div', 'cand-board-cell');
        if (item) {
          if (item.id === entry.activeId) cell.classList.add('is-active');
          cell.appendChild(boardThumb(col.beat.id, item, sigOf(col.cue.id)));
          cell.appendChild(node('div', 'cand-board-name', labelOf(item)));
          cell.addEventListener('click', () => {
            store().commands.applyCandidate(col.cue.id, col.beat.id, item.id);
            scheduleBoard();
          });
        } else {
          cell.classList.add('is-empty');
        }
        grid.appendChild(cell);
      });
    }
    board.body.appendChild(grid);
    fillBoardThumbs();
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
    let lastKey = '';
    store().subscribe('candidates', (state) => {
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

  return { init, render: scheduleRender, resolveTarget };
})();
