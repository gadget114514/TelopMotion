window.SA = window.SA || {};

SA.debugConsole = (() => {
  'use strict';

  const MAX = 400;
  const entries = [];
  let panel = null;
  let listNode = null;
  let open = false;
  let original = null;

  function t(key) {
    return SA.i18n.t(key);
  }

  function stamp() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }

  function format(args) {
    return args
      .map((value) => {
        if (typeof value === 'string') return value;
        if (value instanceof Error) return value.stack || value.message;
        if (value && typeof value === 'object') {
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        }
        return String(value);
      })
      .join(' ');
  }

  function push(level, text) {
    const entry = { level, text: String(text), time: stamp() };
    entries.push(entry);
    if (entries.length > MAX) entries.length = MAX;
    render();
    try {
      if (SA.platform && typeof SA.platform.sendDebugLog === 'function') SA.platform.sendDebugLog(entry);
    } catch {
      /* forwarding must never break logging */
    }
  }

  function render() {
    if (!listNode || !open) return;
    listNode.innerHTML = '';
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'console-empty';
      empty.textContent = t('studio.console.empty');
      listNode.appendChild(empty);
      return;
    }
    for (const entry of entries.slice(-250)) {
      const row = document.createElement('div');
      row.className = `console-entry console-${entry.level}`;
      const time = document.createElement('span');
      time.className = 'console-time';
      time.textContent = entry.time;
      const text = document.createElement('span');
      text.className = 'console-text';
      text.textContent = entry.text;
      row.appendChild(time);
      row.appendChild(text);
      listNode.appendChild(row);
    }
    listNode.scrollTop = listNode.scrollHeight;
  }

  function buildPanel() {
    if (!panel) return;
    panel.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'console-head';
    const title = document.createElement('span');
    title.className = 'console-title';
    title.textContent = t('studio.console.title');
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'btn btn-mini';
    clearButton.textContent = t('studio.console.clear');
    clearButton.addEventListener('click', clear);
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'btn btn-mini';
    closeButton.textContent = '✕';
    closeButton.addEventListener('click', () => {
      if (SA.studio && SA.studio.toggleConsole) SA.studio.toggleConsole();
      else setOpen(false);
    });
    head.appendChild(title);
    head.appendChild(clearButton);
    head.appendChild(closeButton);
    listNode = document.createElement('div');
    listNode.className = 'console-list';
    panel.appendChild(head);
    panel.appendChild(listNode);
  }

  function setOpen(value) {
    open = !!value;
    if (panel) panel.hidden = !open;
    if (open) {
      buildPanel();
      render();
    }
    return open;
  }

  function toggle() {
    return setOpen(!open);
  }

  function isOpen() {
    return open;
  }

  function clear() {
    entries.length = 0;
    render();
    try {
      if (SA.platform && typeof SA.platform.notifyDebugClear === 'function') SA.platform.notifyDebugClear();
    } catch {
      /* ignore */
    }
  }

  function openWindow() {
    try {
      if (SA.platform && SA.platform.isElectron && typeof SA.platform.openDebugWindow === 'function') {
        SA.platform.openDebugWindow();
        return true;
      }
    } catch {
      /* fall through to the in-app panel */
    }
    return setOpen(true);
  }

  function init() {
    panel = document.getElementById('preview-console');
    if (!panel || original) return;
    original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
    for (const level of ['log', 'info', 'warn', 'error']) {
      console[level] = (...args) => {
        try {
          push(level, format(args));
        } catch {
          /* never break logging */
        }
        original[level].apply(console, args);
      };
    }
    window.addEventListener('error', (event) => push('error', `${event.message} (${event.filename || ''}:${event.lineno || 0})`));
    window.addEventListener('unhandledrejection', (event) => push('error', `Unhandled rejection: ${format([event.reason])}`));
    panel.innerHTML = '';
    render();
  }

  return { init, push, toggle, setOpen, isOpen, clear, entries, openWindow };
})();
