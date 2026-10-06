'use strict';

(function () {
  const MAX = 400;
  let listNode = null;
  let countNode = null;
  let total = 0;

  function nearBottom() {
    if (!listNode) return true;
    return listNode.scrollHeight - listNode.scrollTop - listNode.clientHeight < 80;
  }

  function updateCount() {
    if (countNode) countNode.textContent = total ? `${Math.min(total, MAX)}+` : '';
  }

  function append(entry) {
    if (!listNode || !entry) return;
    total += 1;
    const row = document.createElement('div');
    row.className = `console-entry console-${entry.level || 'log'}`;
    const time = document.createElement('span');
    time.className = 'console-time';
    time.textContent = entry.time || '';
    const text = document.createElement('span');
    text.className = 'console-text';
    text.textContent = entry.text || '';
    row.appendChild(time);
    row.appendChild(text);
    const stick = nearBottom();
    listNode.appendChild(row);
    while (listNode.children.length > MAX) listNode.removeChild(listNode.firstChild);
    if (stick) listNode.scrollTop = listNode.scrollHeight;
    updateCount();
  }

  function clear() {
    if (listNode) listNode.innerHTML = '';
    updateCount();
  }

  function init() {
    listNode = document.getElementById('debug-list');
    countNode = document.getElementById('debug-count');
    const clearButton = document.getElementById('debug-clear');
    if (clearButton) {
      clearButton.addEventListener('click', () => {
        clear();
        try {
          if (window.sunoApi && typeof window.sunoApi.debugClear === 'function') window.sunoApi.debugClear();
        } catch {
          /* ignore */
        }
      });
    }
    try {
      const bridge = window.sunoApi;
      if (!bridge) return;
      if (typeof bridge.debugHistory === 'function') {
        bridge.debugHistory().then(
          (response) => {
            const items = response && response.ok ? response.data : null;
            if (Array.isArray(items)) {
              for (const entry of items) append(entry);
            }
          },
          () => {}
        );
      }
      if (typeof bridge.onDebugLog === 'function') bridge.onDebugLog((entry) => append(entry));
      if (typeof bridge.onDebugClear === 'function') bridge.onDebugClear(() => clear());
    } catch {
      /* never break the window */
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
