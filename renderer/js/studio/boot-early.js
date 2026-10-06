// Boot-early ticker: the first script in studio.html (no dependencies).
// The ~130 classic scripts after this one block the parser while they load,
// so SA.boot (boot.js) cannot report progress yet and the overlay sits at the
// hardcoded 0% in the markup. This tiny script creeps the bar/percent/elapsed
// forward on its own (about +1% every 2 s, capped at 30%) so the loading
// screen visibly moves from the first second. SA.boot adopts the value on its
// first set() and clears this timer to take over (never jumps backwards).
(function () {
  'use strict';
  try {
    var fill = document.getElementById('boot-fill');
    var percent = document.getElementById('boot-percent');
    var elapsed = document.getElementById('boot-elapsed');
    var bar = document.getElementById('boot-bar');
    if (!fill && !percent && !elapsed) return;
    var start = Date.now();
    var value = 0;
    var lastSecond = -1;
    if (typeof window !== 'undefined') window.__saBootEarlyValue = 0;
    function paint() {
      try {
        var nowMs = Date.now();
        var t = (nowMs - start) / 1000;
        var target = Math.min(30, Math.floor(t / 2));
        if (target > value) {
          value = target;
          if (typeof window !== 'undefined') window.__saBootEarlyValue = value;
          if (fill) fill.style.transform = 'scaleX(' + value / 100 + ')';
          if (percent) percent.textContent = value + '%';
          if (bar) bar.setAttribute('aria-valuenow', String(value));
        }
        var second = Math.floor(t);
        if (second !== lastSecond) {
          lastSecond = second;
          if (elapsed) elapsed.textContent = second + 's';
        }
      } catch (error) {
        /* best-effort: never break startup */
      }
    }
    paint();
    if (typeof window !== 'undefined') {
      window.__saBootEarlyTimer = setInterval(function () {
        try {
          if (window.SA && window.SA.boot && typeof window.SA.boot.progress === 'function' && window.SA.boot.progress() > 0) {
            clearInterval(window.__saBootEarlyTimer);
            window.__saBootEarlyTimer = null;
            return;
          }
        } catch (error) {
          /* fall through to paint */
        }
        paint();
      }, 250);
    }
  } catch (error) {
    /* best-effort: never break startup */
  }
})();
