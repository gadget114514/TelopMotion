window.SA = window.SA || {};

// Settings -> Song: what the piece is called, who made it, in which typeface
// each renders, and how fast it beats. The name is what the first filler (the
// intro gap) shows as its credits and what the credits element / end card fall
// back on; the tempo is the grid every cue is cut into beats on and every
// filler gap is divided bar by bar on.
SA.songDialog = (() => {
  'use strict';

  function t(key, vars) {
    return SA.i18n.t(key, vars);
  }

  function field(labelText, control) {
    const row = document.createElement('div');
    row.className = 'field';
    const label = document.createElement('span');
    label.textContent = labelText;
    row.appendChild(label);
    row.appendChild(control);
    return row;
  }

  function textInput(value) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value == null ? '' : String(value);
    return input;
  }

  function numberInput(value) {
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '400';
    input.step = '1';
    input.value = value > 0 ? String(value) : '';
    input.placeholder = '0';
    return input;
  }

  // The typeface picker for the title / author: the project font set first
  // (or only it in exclusive mode), then every bundled and loaded typeface.
  // '' renders in the main typeface.
  function fontChoices() {
    try {
      if (SA.controls && typeof SA.controls.fontChoices === 'function') return SA.controls.fontChoices();
    } catch {
      /* fall through to the builtins */
    }
    try {
      if (SA.lyricsFont && typeof SA.lyricsFont.choices === 'function') return SA.lyricsFont.choices();
    } catch {
      /* fall through to the builtins */
    }
    return (SA.lyricsFont && SA.lyricsFont.builtins ? SA.lyricsFont.builtins() : []).map((entry) => ({ value: entry.id, label: entry.family }));
  }

  function fontSelect(value) {
    const select = document.createElement('select');
    const current = value == null ? '' : String(value);
    const auto = document.createElement('option');
    auto.value = '';
    auto.textContent = t('song.fontAuto');
    select.appendChild(auto);
    const choices = fontChoices();
    for (const choice of choices) {
      const option = document.createElement('option');
      option.value = choice.value;
      option.textContent = choice.label;
      select.appendChild(option);
    }
    if (current && !choices.some((choice) => choice.value === current)) {
      const missing = document.createElement('option');
      missing.value = current;
      missing.textContent = current;
      select.appendChild(missing);
    }
    select.value = current;
    return select;
  }

  // The tempo measured from the loaded audio, shown as the placeholder of the
  // BPM field: it is what the app used before, so the user can adopt it.
  function detectedBpm() {
    try {
      const analysis = SA.preview && SA.preview.getAudioAnalysis ? SA.preview.getAudioAnalysis() : null;
      const features = analysis && SA.audioAnalysis ? SA.audioAnalysis.features(analysis) : null;
      const value = Number(features && features.bpm);
      return Number.isFinite(value) && value > 0 ? Math.round(value * 10) / 10 : 0;
    } catch {
      return 0;
    }
  }

  function open() {
    const doc = SA.store.state.project;
    const root = document.getElementById('dialog-root');
    if (!doc || !root) return;
    const song = SA.project.songOf(doc);
    const detected = detectedBpm();
    const bar = song.bpm > 0 ? (60 / song.bpm) * 4 : 0;

    root.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    const title = document.createElement('h3');
    title.textContent = t('song.title');
    const body = document.createElement('div');
    const titleInput = textInput(song.title);
    const authorInput = textInput(song.author);
    const bpmInput = numberInput(song.bpm);
    if (detected > 0) bpmInput.placeholder = String(detected);
    body.appendChild(field(t('song.name'), titleInput));
    body.appendChild(field(t('song.author'), authorInput));
    const titleFontSelect = fontSelect(song.titleFontId);
    const authorFontSelect = fontSelect(song.authorFontId);
    body.appendChild(field(t('song.titleFont'), titleFontSelect));
    body.appendChild(field(t('song.authorFont'), authorFontSelect));
    body.appendChild(field(t('song.bpm'), bpmInput));
    const lengthInput = numberInput(song.length);
    lengthInput.max = '36000';
    lengthInput.step = '0.1';
    body.appendChild(field(t('song.length'), lengthInput));
    const lengthHint = document.createElement('div');
    lengthHint.className = 'insp-inherit';
    lengthHint.textContent = t('song.lengthHint');
    body.appendChild(lengthHint);
    const hint = document.createElement('div');
    hint.className = 'insp-inherit';
    // with a tempo informed the hint can name the bar it cuts on; without one it
    // explains that the audio tempo is used instead
    const measured = detected > 0 ? detected : '—';
    hint.textContent = bar > 0 ? t('song.bpmHint', { bar: Math.round(bar * 100) / 100, detected: measured }) : t('song.bpmHintAuto', { detected: measured });
    body.appendChild(hint);
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    dialog.appendChild(title);
    dialog.appendChild(body);
    dialog.appendChild(actions);
    root.appendChild(dialog);
    root.hidden = false;

    const close = () => {
      root.hidden = true;
      root.innerHTML = '';
    };
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn';
    cancel.textContent = t('layers.cancel');
    cancel.addEventListener('click', close);
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'btn btn-primary';
    apply.textContent = t('layers.apply');
    apply.addEventListener('click', () => {
      SA.store.commands.setSong({ title: titleInput.value, author: authorInput.value, titleFontId: titleFontSelect.value || '', authorFontId: authorFontSelect.value || '', bpm: Number(bpmInput.value) || 0, length: Number(lengthInput.value) || 0 });
      close();
      if (SA.studio && SA.studio.toast) SA.studio.toast('song.applied');
    });
    actions.appendChild(cancel);
    actions.appendChild(apply);
    titleInput.focus();
    root.addEventListener('click', (event) => {
      if (event.target === root) close();
    });
  }

  return { open };
})();