window.SA = window.SA || {};

SA.mediaNotice = (() => {
  'use strict';

  // Video and audio live on temporary references (blob URLs / session audio),
  // so they are gone after the project is saved, closed and reopened. Warn
  // once per session when the first file of each kind is specified.
  const shown = { video: false, audio: false };

  function t(key) {
    return SA.i18n.t(key);
  }

  // True when the warning was (or should be) shown: first call per kind with
  // a usable DOM. Pure apart from the flag, so the call sites stay trivial.
  function warn(kind) {
    if (kind !== 'video' && kind !== 'audio') return false;
    if (shown[kind]) return false;
    shown[kind] = true;
    if (typeof document === 'undefined' || !document.getElementById) return false;
    const root = document.getElementById('dialog-root');
    if (!root) return false;
    root.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    const title = document.createElement('h3');
    title.textContent = t('studio.media.ephemeralTitle');
    const message = document.createElement('p');
    message.className = 'dialog-hint';
    message.textContent = t(kind === 'video' ? 'studio.media.ephemeralVideo' : 'studio.media.ephemeralAudio');
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn btn-primary btn-mini';
    ok.textContent = t('studio.media.ephemeralOk');
    ok.addEventListener('click', () => {
      root.hidden = true;
    });
    actions.appendChild(ok);
    dialog.appendChild(title);
    dialog.appendChild(message);
    dialog.appendChild(actions);
    root.appendChild(dialog);
    root.hidden = false;
    return true;
  }

  function reset() {
    shown.video = false;
    shown.audio = false;
  }

  return { warn, reset };
})();
