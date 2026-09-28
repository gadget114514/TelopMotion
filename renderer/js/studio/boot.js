(typeof window !== 'undefined' ? window : globalThis).SA = (typeof window !== 'undefined' ? window : globalThis).SA || {};

// Startup overlay controller. `app.js` drives the progress bar while the Studio
// wires itself up (interface, project, fonts) and calls `finish()` to fade the
// overlay out and reveal the app. The markup sits at the top of studio.html so
// the browser paints it before the scripts are parsed.
SA.boot = (() => {
  'use strict';

  const MIN_VISIBLE = 400; // ms: keep the screen readable when startup is fast
  const FADE = 260; // ms: must match the .boot transition in studio.css

  let root = null;
  let status = null;
  let bar = null;
  let fill = null;
  let value = 0;
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
    started = now();
    return true;
  }

  function statusText(key) {
    if (status) {
      status.dataset.i18n = key;
      if (SA.i18n && SA.i18n.t) status.textContent = SA.i18n.t(key);
    }
  }

  // percent never goes backwards and is clamped to 0-100, so the bar can be
  // driven from independent startup steps without tracking order
  function set(percent, statusKey) {
    if (finished || !nodes()) return;
    const number = Number(percent);
    if (Number.isFinite(number)) value = Math.max(value, Math.max(0, Math.min(100, Math.round(number))));
    if (fill) fill.style.width = `${value}%`;
    if (bar) bar.setAttribute('aria-valuenow', String(value));
    if (statusKey) statusText(statusKey);
  }

  function finish() {
    if (finished) return;
    finished = true;
    if (!nodes()) return;
    root.classList.remove('is-busy');
    value = 100;
    if (fill) fill.style.width = '100%';
    if (bar) bar.setAttribute('aria-valuenow', '100');
    statusText('studio.boot.ready');
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

  return { set, finish, busy, progress: () => value };
})();
