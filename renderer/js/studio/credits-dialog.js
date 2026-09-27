window.SA = window.SA || {};

SA.creditsDialog = (() => {
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

  function numberInput(value, onChange, options) {
    const opts = options || {};
    const input = document.createElement('input');
    input.type = 'number';
    input.step = String(opts.step == null ? 0.5 : opts.step);
    if (opts.min != null) input.min = String(opts.min);
    if (opts.max != null) input.max = String(opts.max);
    input.value = value == null || value === '' ? '' : String(value);
    input.placeholder = opts.placeholder || '';
    input.addEventListener('change', () => {
      if (input.value.trim() === '' && opts.nullable) {
        onChange(null);
        return;
      }
      const next = Number(input.value);
      onChange(Number.isFinite(next) ? next : opts.fallback == null ? 0 : opts.fallback);
    });
    return input;
  }

  function textInput(value, onChange, options) {
    const opts = options || {};
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value == null ? '' : String(value);
    input.placeholder = opts.placeholder || '';
    input.addEventListener('change', () => onChange(input.value));
    return input;
  }

  function textArea(value, onChange) {
    const area = document.createElement('textarea');
    area.rows = 3;
    area.className = 'credits-template';
    area.value = value == null ? '' : String(value);
    area.addEventListener('change', () => onChange(area.value));
    return area;
  }

  function selectInput(value, options, onChange) {
    const select = document.createElement('select');
    for (const option of options) {
      const item = document.createElement('option');
      item.value = option.value;
      item.textContent = option.label;
      select.appendChild(item);
    }
    select.value = value;
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  function checkbox(checked, labelText, onChange) {
    const row = document.createElement('label');
    row.className = 'ctrl-bool-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!checked;
    box.addEventListener('change', () => onChange(box.checked));
    const label = document.createElement('span');
    label.textContent = labelText;
    row.appendChild(box);
    row.appendChild(label);
    return row;
  }

  function modeSection(titleKey) {
    const wrap = document.createElement('div');
    wrap.className = 'credits-mode';
    const head = document.createElement('h4');
    head.textContent = t(titleKey);
    wrap.appendChild(head);
    return wrap;
  }

  function open() {
    const doc = SA.store.state.project;
    const root = document.getElementById('dialog-root');
    if (!doc || !root || !SA.credits) return;
    let draft = JSON.parse(JSON.stringify(SA.credits.settingsFor(doc)));
    const songs = ((doc.dataset && doc.dataset.songs) || []).slice().sort((a, b) => (b.plays || 0) - (a.plays || 0));

    root.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog dialog-wide';
    const title = document.createElement('h3');
    title.textContent = t('credits.title');
    const body = document.createElement('div');
    body.className = 'credits-body';
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    dialog.appendChild(title);
    dialog.appendChild(body);
    dialog.appendChild(actions);
    root.appendChild(dialog);
    root.hidden = false;

    function render() {
      body.innerHTML = '';
      const texts = modeSection('credits.source');
      const titleOptions = [
        { value: 'song', label: t('credits.sourceSong') },
        { value: 'custom', label: t('credits.sourceCustom') },
      ];
      texts.appendChild(
        field(
          t('credits.titleSource'),
          selectInput(draft.title.source, titleOptions, (value) => {
            draft.title.source = value;
            render();
          })
        )
      );
      if (draft.title.source === 'song') {
        const options = songs.map((song) => ({ value: song.id, label: song.title || song.id }));
        if (!options.some((option) => option.value === draft.title.songId)) options.unshift({ value: draft.title.songId || '', label: t('credits.sourceSong') });
        texts.appendChild(field(t('credits.songTitle'), selectInput(draft.title.songId || '', options, (value) => {
          draft.title.songId = value;
          render();
        })));
      } else {
        texts.appendChild(field(t('credits.titleText'), textInput(draft.title.text, (value) => {
          draft.title.text = value;
          render();
        })));
      }
      const artistOptions = [
        { value: 'profile', label: t('credits.sourceProfile') },
        { value: 'custom', label: t('credits.sourceCustom') },
      ];
      texts.appendChild(
        field(
          t('credits.artistSource'),
          selectInput(draft.artist.source, artistOptions, (value) => {
            draft.artist.source = value;
            render();
          })
        )
      );
      if (draft.artist.source === 'profile') {
        texts.appendChild(checkbox(draft.artist.showHandle, t('credits.showHandle'), (value) => {
          draft.artist.showHandle = value;
          render();
        }));
      } else {
        texts.appendChild(field(t('credits.artistText'), textInput(draft.artist.text, (value) => {
          draft.artist.text = value;
          render();
        })));
      }
      texts.appendChild(field(t('credits.extra'), textInput(draft.extra.text, (value) => {
        draft.extra.text = value;
        render();
      })));
      texts.appendChild(field(t('credits.template'), textArea(draft.template, (value) => {
        draft.template = value;
        render();
      })));
      const hint = document.createElement('div');
      hint.className = 'insp-inherit';
      hint.textContent = t('credits.templateHint');
      texts.appendChild(hint);
      const preview = document.createElement('div');
      preview.className = 'insp-inherit credits-preview';
      preview.textContent = SA.credits.expandTemplate({ ...doc, credits: draft }, draft, {}).join(' / ');
      texts.appendChild(preview);
      body.appendChild(texts);

      // element mode
      const element = modeSection('credits.modeElement');
      element.appendChild(checkbox(draft.modes.element.enabled, t('credits.enabled'), (value) => {
        draft.modes.element.enabled = value;
        render();
      }));
      element.appendChild(
        field(
          t('credits.at'),
          selectInput(
            draft.modes.element.at,
            [
              { value: 'start', label: t('credits.atStart') },
              { value: 'time', label: t('credits.atTime') },
            ],
            (value) => {
              draft.modes.element.at = value;
              render();
            }
          )
        )
      );
      element.appendChild(field(t('credits.time'), numberInput(draft.modes.element.time, (value) => {
        draft.modes.element.time = value;
      }, { min: 0, step: 0.5, fallback: 0 })));
      element.appendChild(field(t('credits.duration'), numberInput(draft.modes.element.duration, (value) => {
        draft.modes.element.duration = value;
      }, { min: 0.5, step: 0.5, fallback: 4 })));
      body.appendChild(element);

      // always mode
      const always = modeSection('credits.modeAlways');
      always.appendChild(checkbox(draft.modes.always.enabled, t('credits.enabled'), (value) => {
        draft.modes.always.enabled = value;
        render();
      }));
      const positions = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight', 'lowerThird', 'custom'];
      always.appendChild(
        field(
          t('credits.position'),
          selectInput(
            draft.modes.always.position,
            positions.map((value) => ({ value, label: t(`credits.position${value.charAt(0).toUpperCase()}${value.slice(1)}`) })),
            (value) => {
              draft.modes.always.position = value;
              render();
            }
          )
        )
      );
      always.appendChild(field(t('credits.opacity'), numberInput(draft.modes.always.opacity, (value) => {
        draft.modes.always.opacity = value;
      }, { min: 0, max: 1, step: 0.05, fallback: 0.85 })));
      always.appendChild(field(t('credits.scale'), numberInput(draft.modes.always.scale, (value) => {
        draft.modes.always.scale = value;
      }, { min: 0.05, max: 2, step: 0.05, fallback: 0.45 })));
      always.appendChild(checkbox(draft.modes.always.hideDuringCues, t('credits.hideDuringCues'), (value) => {
        draft.modes.always.hideDuringCues = value;
        render();
      }));
      always.appendChild(field(t('credits.from'), numberInput(draft.modes.always.from, (value) => {
        draft.modes.always.from = value;
      }, { min: 0, step: 0.5, fallback: 0 })));
      always.appendChild(field(t('credits.to'), numberInput(draft.modes.always.to, (value) => {
        draft.modes.always.to = value;
      }, { min: 0, step: 0.5, nullable: true })));
      body.appendChild(always);

      // end mode
      const end = modeSection('credits.modeEnd');
      end.appendChild(checkbox(draft.modes.end.enabled, t('credits.enabled'), (value) => {
        draft.modes.end.enabled = value;
        render();
      }));
      end.appendChild(field(t('credits.duration'), numberInput(draft.modes.end.duration, (value) => {
        draft.modes.end.duration = value;
      }, { min: 0.5, step: 0.5, fallback: 5 })));
      end.appendChild(
        field(
          t('credits.endStyle'),
          selectInput(
            draft.modes.end.style,
            [
              { value: 'endCard', label: t('credits.endCard') },
              { value: 'rollCredits', label: t('credits.rollCredits') },
            ],
            (value) => {
              draft.modes.end.style = value;
              render();
            }
          )
        )
      );
      end.appendChild(checkbox(draft.modes.end.afterLastCue, t('credits.afterLastCue'), (value) => {
        draft.modes.end.afterLastCue = value;
        render();
      }));
      body.appendChild(end);

      actions.innerHTML = '';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn';
      cancel.textContent = t('layers.cancel');
      cancel.addEventListener('click', () => {
        root.hidden = true;
        root.innerHTML = '';
      });
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'btn btn-primary';
      apply.textContent = t('layers.apply');
      apply.addEventListener('click', () => {
        SA.store.commands.setCredits({
          title: draft.title,
          artist: draft.artist,
          extra: draft.extra,
          template: draft.template,
          modes: draft.modes,
        });
        root.hidden = true;
        root.innerHTML = '';
        if (SA.studio && SA.studio.toast) SA.studio.toast('credits.applied');
      });
      actions.appendChild(cancel);
      actions.appendChild(apply);
    }

    render();
    root.addEventListener('click', (event) => {
      if (event.target === root) {
        root.hidden = true;
        root.innerHTML = '';
      }
    });
  }

  return { open };
})();
