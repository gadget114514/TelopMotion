window.SA = window.SA || {};

// Generate -> AI Assistant (desktop app only). A chat dialog in which the model
// reads the project through a few tools, edits a *working copy* with validated
// patches, and may look at a rendered frame. Nothing touches the live project
// until the user presses Apply, which replays the patch as one undo step.
//
// The model loop itself is SA.aiAgent (shared with the evaluation runner). The
// API key and the HTTP call live in the main process (SA.platform.ai); the
// renderer never sees the key. The web build has no entry point at all.
SA.aiAssistant = (() => {
  'use strict';

  const DEFAULT_MODEL = 'claude-sonnet-5-5';
  const SHOT_WIDTH = 640;

  function t(key, vars) {
    return SA.i18n.t(key, vars);
  }

  function model() {
    try {
      return localStorage.getItem('ai.model') || DEFAULT_MODEL;
    } catch {
      return DEFAULT_MODEL;
    }
  }

  function setModel(value) {
    try {
      localStorage.setItem('ai.model', value);
    } catch {
      /* the default stays */
    }
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function newSession(doc) {
    return SA.aiTools.createSession(doc, { migrate: SA.project.migrate, fx: SA.fx, resolveStyle: SA.project.resolveStyle });
  }

  // A JPEG of the frame at `time`, scaled down so a few of them stay cheap.
  function captureFrame(time) {
    const preview = SA.preview;
    if (!preview || typeof preview.captureRGBA !== 'function') return null;
    const shot = preview.captureRGBA(Number(time));
    if (!shot) return null;
    const full = document.createElement('canvas');
    full.width = shot.width;
    full.height = shot.height;
    full.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(shot.data), shot.width, shot.height), 0, 0);
    const out = document.createElement('canvas');
    out.width = Math.min(SHOT_WIDTH, shot.width);
    out.height = Math.round((shot.height * out.width) / shot.width);
    out.getContext('2d').drawImage(full, 0, 0, out.width, out.height);
    return out.toDataURL('image/jpeg', 0.8).split(',')[1];
  }

  function errorText(error) {
    const code = error && error.code;
    if (code === 'no-key') return t('ai.err.noKey');
    if (code === 'http-401') return t('ai.err.badKey');
    if (code === 'http-429') return t('ai.err.rateLimit');
    return t('ai.err.generic', { message: (error && error.message) || String(error) });
  }

  function closeDialog() {
    const root = document.getElementById('dialog-root');
    if (!root) return;
    root.hidden = true;
    root.innerHTML = '';
  }

  async function openSettings(afterSave) {
    const root = document.getElementById('dialog-root');
    if (!root || !SA.platform.ai.available) return;
    const status = await SA.platform.ai.status().catch(() => ({ hasKey: false, canStore: false }));
    root.innerHTML = '';
    const dialog = el('div', 'dialog');
    dialog.appendChild(el('h3', null, t('ai.settings.title')));
    const body = el('div');
    const state = el('div', 'insp-inherit', status.hasKey ? t(status.source === 'env' ? 'ai.settings.setEnv' : 'ai.settings.setStored') : t('ai.settings.notSet'));
    body.appendChild(state);
    const keyRow = el('div', 'field');
    keyRow.appendChild(el('span', null, t('ai.settings.key')));
    const keyInput = el('input');
    keyInput.type = 'password';
    keyInput.autocomplete = 'off';
    keyInput.spellcheck = false;
    keyInput.placeholder = 'sk-ant-...';
    keyRow.appendChild(keyInput);
    body.appendChild(keyRow);
    const modelRow = el('div', 'field');
    modelRow.appendChild(el('span', null, t('ai.settings.model')));
    const modelInput = el('input');
    modelInput.type = 'text';
    modelInput.value = model();
    modelRow.appendChild(modelInput);
    body.appendChild(modelRow);
    body.appendChild(el('div', 'insp-inherit', t(status.canStore ? 'ai.settings.privacy' : 'ai.settings.noEncryption')));
    const message = el('div', 'insp-inherit');
    body.appendChild(message);
    dialog.appendChild(body);

    const actions = el('div', 'dialog-actions');
    const clear = el('button', 'btn', t('ai.settings.clear'));
    clear.type = 'button';
    clear.addEventListener('click', async () => {
      await SA.platform.ai.clearKey().catch(() => {});
      message.textContent = t('ai.settings.cleared');
      state.textContent = t('ai.settings.notSet');
    });
    const close = el('button', 'btn', t('layers.cancel'));
    close.type = 'button';
    close.addEventListener('click', closeDialog);
    const save = el('button', 'btn btn-primary', t('layers.apply'));
    save.type = 'button';
    save.addEventListener('click', async () => {
      const name = modelInput.value.trim();
      if (/^claude-[a-z0-9.-]{1,60}$/.test(name)) setModel(name);
      const key = keyInput.value.trim();
      if (key) {
        try {
          await SA.platform.ai.setKey(key);
        } catch (error) {
          message.textContent = error.code === 'invalid-key' ? t('ai.err.invalidKey') : errorText(error);
          return;
        } finally {
          keyInput.value = '';
        }
      }
      closeDialog();
      if (afterSave) afterSave();
    });
    actions.appendChild(clear);
    actions.appendChild(close);
    actions.appendChild(save);
    dialog.appendChild(actions);
    root.appendChild(dialog);
    root.hidden = false;
    keyInput.focus();
  }

  async function open() {
    const root = document.getElementById('dialog-root');
    const doc = SA.store.state.project;
    if (!root || !doc || !SA.platform.ai.available) return;
    const status = await SA.platform.ai.status().catch(() => ({ hasKey: false }));
    if (!status.hasKey) {
      openSettings(open);
      return;
    }

    let session = newSession(doc);
    const history = [];
    let busy = false;
    let cancelled = false;

    root.innerHTML = '';
    const dialog = el('div', 'dialog');
    dialog.style.width = 'min(720px, 92vw)';
    dialog.appendChild(el('h3', null, t('ai.title')));
    const log = el('div', 'ai-log');
    log.style.cssText = 'max-height:46vh;overflow:auto;display:flex;flex-direction:column;gap:6px;margin:8px 0;';
    dialog.appendChild(log);
    const input = el('textarea');
    input.rows = 3;
    input.placeholder = t('ai.placeholder');
    input.style.cssText = 'width:100%;box-sizing:border-box;';
    dialog.appendChild(input);
    const pending = el('div', 'insp-inherit');
    dialog.appendChild(pending);

    const actions = el('div', 'dialog-actions');
    const close = el('button', 'btn', t('ai.close'));
    close.type = 'button';
    const discard = el('button', 'btn', t('ai.discard'));
    discard.type = 'button';
    const apply = el('button', 'btn btn-primary', t('ai.apply'));
    apply.type = 'button';
    const send = el('button', 'btn btn-primary', t('ai.send'));
    send.type = 'button';
    for (const button of [close, discard, apply, send]) actions.appendChild(button);
    dialog.appendChild(actions);
    root.appendChild(dialog);
    root.hidden = false;
    input.focus();

    function say(role, text) {
      const row = el('div', null, text);
      row.style.cssText = 'white-space:pre-wrap;padding:6px 8px;border-radius:6px;';
      if (role === 'user') row.style.background = 'rgba(255,138,61,0.15)';
      else if (role === 'assistant') row.style.background = 'rgba(255,255,255,0.06)';
      else {
        row.style.fontSize = '12px';
        row.style.opacity = '0.7';
        row.textContent = role === 'tool' ? `⚙ ${text}` : `⚠ ${text}`;
      }
      log.appendChild(row);
      log.scrollTop = log.scrollHeight;
    }

    function sync() {
      const count = session.ops().length;
      apply.disabled = busy || !count;
      discard.disabled = busy || !count;
      send.disabled = busy;
      pending.textContent = count ? t('ai.pending', { count }) + (session.summaries().length ? `\n- ${session.summaries().join('\n- ')}` : '') : '';
      pending.style.whiteSpace = 'pre-wrap';
    }
    sync();

    async function submit() {
      const text = input.value.trim();
      if (!text || busy) return;
      input.value = '';
      say('user', text);
      session.setView({
        playhead: SA.store.state.playhead,
        selection: (SA.store.state.selection && SA.store.state.selection.paths) || [],
      });
      history.push({ role: 'user', content: `[view] ${JSON.stringify(session.focus())}\n\n${text}` });
      busy = true;
      cancelled = false;
      sync();
      try {
        const canShoot = !!(SA.preview && SA.preview.isWebGL2 && SA.preview.isWebGL2());
        const outcome = await SA.aiAgent.run({
          request: (payload) => SA.platform.ai.request(payload),
          model: model(),
          history,
          session,
          captureFrame: canShoot ? captureFrame : null,
          hooks: { say, cancelled: () => cancelled },
        });
        if (outcome.truncated) say('error', t('ai.err.tooManySteps'));
      } catch (error) {
        say('error', errorText(error));
        // a failed call can leave the history ending in an unanswered tool_use
        const last = history[history.length - 1];
        if (last && last.role === 'assistant') history.pop();
      } finally {
        busy = false;
        sync();
      }
    }

    send.addEventListener('click', submit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        submit();
      }
    });
    discard.addEventListener('click', () => {
      session = newSession(SA.store.state.project);
      say('tool', t('ai.discarded'));
      sync();
    });
    apply.addEventListener('click', () => {
      const ops = session.ops();
      if (!ops.length) return;
      try {
        // the live project may have moved on since the session began: validate
        // against its current state before anything is written
        const probe = SA.aiTools.applyOps(SA.store.clone(SA.store.state.project), ops);
        const verdict = SA.project.migrate(JSON.parse(JSON.stringify(probe)));
        if (!verdict.ok) throw new Error(verdict.error);
      } catch (error) {
        say('error', t('ai.err.applyFailed', { message: error.message }));
        return;
      }
      SA.store.dispatch({
        label: t('ai.undoLabel'),
        areas: ['project'],
        do(project) {
          SA.aiTools.applyOps(project, ops);
        },
      });
      session = newSession(SA.store.state.project);
      say('tool', t('ai.applied'));
      if (SA.menu && SA.menu.refresh) SA.menu.refresh();
      sync();
    });
    close.addEventListener('click', () => {
      cancelled = true;
      closeDialog();
    });
  }

  return { open, openSettings };
})();
