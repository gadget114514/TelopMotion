window.SA = window.SA || {};

SA.motionDialog = (() => {
  'use strict';

  function t(key, vars) {
    return SA.i18n.t(key, vars);
  }

  function open() {
    const root = document.getElementById('dialog-root');
    const doc = SA.store.state.project;
    const selection = SA.store.state.selection || {};
    if (!root || !doc) return;
    if (!selection.cueId && !(selection.paths || []).length) {
      SA.studio.toast('studio.timeline.selectFirst');
      return;
    }
    const presets = SA.motion && SA.motion.motionPresets ? SA.motion.motionPresets() : [];
    root.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog dialog-wide';
    dialog.innerHTML = `<h3>${t('studio.motion.title')}</h3>`;
    const hint = document.createElement('div');
    hint.className = 'insp-inherit';
    hint.textContent = t('studio.motion.hint');
    dialog.appendChild(hint);
    for (const group of ['entrance', 'emphasis', 'exit']) {
      const heading = document.createElement('div');
      heading.className = 'insp-inherit';
      heading.textContent = t(`studio.motion.group.${group}`);
      dialog.appendChild(heading);
      const grid = document.createElement('div');
      grid.className = 'motion-grid';
      for (const preset of presets.filter((entry) => entry.group === group)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-mini';
        button.textContent = SA.controls.typeLabel(preset.phase === 'hold' ? 'hold' : preset.phase, preset.type);
        button.addEventListener('click', () => {
          SA.inspector.addMotion(preset);
          button.classList.add('is-active');
        });
        grid.appendChild(button);
      }
      dialog.appendChild(grid);
    }
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-mini';
    close.textContent = t('studio.motion.close');
    close.addEventListener('click', () => {
      root.hidden = true;
      root.innerHTML = '';
    });
    actions.appendChild(close);
    dialog.appendChild(actions);
    root.appendChild(dialog);
    root.hidden = false;
  }

  return { open };
})();
