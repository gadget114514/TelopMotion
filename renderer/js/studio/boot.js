(typeof window !== 'undefined' ? window : globalThis).SA = (typeof window !== 'undefined' ? window : globalThis).SA || {};

// Startup overlay controller. `app.js` drives the progress bar while the Studio
// wires itself up (interface, project, fonts) and calls `finish()` to fade the
// overlay out and reveal the app. The markup sits at the top of studio.html so
// the browser paints it before the scripts are parsed.
SA.boot = (() => {
  'use strict';

  const MIN_VISIBLE = 400; // ms: keep the screen readable when startup is fast
  const FADE = 260; // ms: must match the .boot transition in studio.css
  const JUMP = 220; // ms: glide to a newly reported step
  const CREEP = 8000; // ms: default time to creep toward the next step
  const CREEP_SHARE = 0.9; // the creep never quite reaches the next step

  let root = null;
  let status = null;
  let bar = null;
  let fill = null;
  let detailEl = null;
  let percentEl = null;
  let value = 0;
  let shown = 0; // what the bar draws once the current jump lands
  let creep = null;
  let started = 0;
  let finished = false;

  function now() {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  }

  function nodes() {
    if (root) return true;
    root = document.getElementById('boot');
    if (!root) return false;
    status = document.getElementById('boot-status');
    bar = document.getElementById('boot-bar');
    fill = document.getElementById('boot-fill');
    // detail / percent are optional: older markup and unit tests only have
    // the status + bar, so every use below guards for a missing node
    detailEl = document.getElementById('boot-detail');
    percentEl = document.getElementById('boot-percent');
    started = now();
    renderPercent();
    return true;
  }

  function renderPercent() {
    if (percentEl) percentEl.textContent = `${value}%`;
  }

  // one-line technical detail under the status (file name, "2/7", ...).
  // Raw text on purpose: it names files and components, so it needs no
  // translation. Cleared by detail('') / finish(). Ignored after finish().
  function detail(text) {
    if (finished || !nodes()) return;
    if (!detailEl) return;
    const line = text == null ? '' : String(text);
    detailEl.textContent = line;
    detailEl.hidden = !line;
  }

  function statusText(key, vars) {
    if (status) {
      status.dataset.i18n = key;
      if (SA.i18n && SA.i18n.t) status.textContent = SA.i18n.t(key, vars);
    }
  }

  // the bar is a scaleX transform animated with the Web Animations API: a
  // transform animation runs on the compositor, so the bar keeps moving while
  // the main thread is blocked (font parsing), where a width transition froze
  function currentShown() {
    if (!creep || !fill || typeof getComputedStyle !== 'function') return shown;
    const match = /matrix\(([^,]+)/.exec(getComputedStyle(fill).transform || '');
    const scale = match ? Number(match[1]) : NaN;
    return Number.isFinite(scale) ? Math.max(0, Math.min(100, scale * 100)) : shown;
  }

  function draw(target, toward, over) {
    if (!fill) return;
    const from = currentShown();
    const to = Math.max(from, target);
    const end = toward > to ? to + (toward - to) * CREEP_SHARE : to;
    shown = to;
    if (creep) creep.cancel();
    creep = null;
    fill.style.transform = `scaleX(${end / 100})`;
    if (typeof fill.animate !== 'function') return;
    const duration = end > to ? Math.max(JUMP * 2, over) : JUMP;
    const keyframes = [{ transform: `scaleX(${from / 100})`, offset: 0, easing: 'ease-out' }];
    if (end > to) keyframes.push({ transform: `scaleX(${to / 100})`, offset: JUMP / duration, easing: 'cubic-bezier(0.2, 0.6, 0.35, 1)' });
    keyframes.push({ transform: `scaleX(${end / 100})`, offset: 1 });
    creep = fill.animate(keyframes, { duration, fill: 'forwards' });
  }

  // percent never goes backwards and is clamped to 0-100, so the bar can be
  // driven from independent startup steps without tracking order. `toward`
  // (the next step's percent) makes the bar creep on over `over` ms while the
  // step runs, so a long step never looks frozen. `vars` interpolates the
  // status message (SA.i18n.t(key, vars)).
  function set(percent, statusKey, toward, over, vars) {
    if (finished || !nodes()) return;
    const number = Number(percent);
    if (Number.isFinite(number)) value = Math.max(value, Math.max(0, Math.min(100, Math.round(number))));
    const next = Number(toward);
    draw(value, Number.isFinite(next) ? Math.min(100, next) : value, Number(over) > 0 ? Number(over) : CREEP);
    if (bar) bar.setAttribute('aria-valuenow', String(value));
    renderPercent();
    if (statusKey) statusText(statusKey, vars);
  }

  function finish() {
    if (finished) return;
    finished = true;
    if (!nodes()) return;
    root.classList.remove('is-busy');
    value = 100;
    draw(100, 100, 0);
    if (bar) bar.setAttribute('aria-valuenow', '100');
    renderPercent();
    statusText('studio.boot.ready');
    detail('');
    const wait = Math.max(0, MIN_VISIBLE - (now() - started));
    setTimeout(() => {
      if (!root) return;
      root.classList.add('is-done');
      setTimeout(() => {
        if (root) root.hidden = true;
      }, FADE);
    }, wait);
  }

  // indeterminate state for a long step (font parsing): the fill keeps its
  // width but shimmers, so a stuck-looking bar still reads as "working"
  function busy(on) {
    if (finished || !nodes()) return;
    root.classList.toggle('is-busy', !!on);
  }

  return { set, finish, busy, detail, progress: () => value };
})();
