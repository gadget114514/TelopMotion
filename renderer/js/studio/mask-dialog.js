((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.maskDialog = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';

  function t(key, vars) {
    if (typeof SA !== 'undefined' && SA.i18n && typeof SA.i18n.t === 'function') return SA.i18n.t(key, vars);
    return key;
  }

  function doc() {
    return (typeof SA !== 'undefined' && SA.store && SA.store.state && SA.store.state.project) || null;
  }

  function masksOf() {
    const project = doc();
    return (project && Array.isArray(project.masks)) ? project.masks : [];
  }

  function toast(key, vars) {
    if (typeof SA !== 'undefined' && SA.studio && typeof SA.studio.toast === 'function') {
      SA.studio.toast(key, vars);
    }
  }

  function open() {
    if (typeof document === 'undefined') return;
    const project = doc();
    const root = document.getElementById('dialog-root');
    if (!project || !root) return;

    root.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog dialog-wide mask-dialog';

    const title = document.createElement('h3');
    title.textContent = t('studio.masks.title') || 'マスク画像編集 (Mask Editor)';

    const hint = document.createElement('div');
    hint.className = 'dialog-hint insp-inherit';
    hint.textContent = t('studio.masks.subtitle') || '64x64, 128x128のマスクを生成してテキストfg, テキストbg, backdrop, backgroundに割り当てます (最大10枚)';

    const body = document.createElement('div');
    body.className = 'mask-dialog-body';
    body.style.marginTop = '12px';
    body.style.maxHeight = '65vh';
    body.style.overflowY = 'auto';

    const topBar = document.createElement('div');
    topBar.className = 'layer-order';
    topBar.style.marginBottom = '12px';
    topBar.style.display = 'flex';
    topBar.style.gap = '8px';
    topBar.style.alignItems = 'center';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-mini';
    addBtn.textContent = `＋ ${t('studio.masks.addMask') || 'マスク追加'}`;
    addBtn.addEventListener('click', () => {
      const current = masksOf();
      if (current.length >= 10) {
        toast('studio.masks.maxReached');
        return;
      }
      const generator = SA.maskGenerator;
      if (!generator) return;
      const algo = generator.ALGORITHMS[current.length % generator.ALGORITHMS.length];
      const newMask = generator.generate(algo.id, {
        width: 128,
        height: 128,
        seed: Math.floor(Math.random() * 1000000),
        targets: { textFg: true, textBg: false, backdrop: false, background: false },
      });
      SA.store.commands.addMask(newMask);
      renderList();
    });

    const gen10Btn = document.createElement('button');
    gen10Btn.type = 'button';
    gen10Btn.className = 'btn btn-mini';
    gen10Btn.textContent = `🎲 ${t('studio.masks.generate10') || '10枚再生成'}`;
    gen10Btn.addEventListener('click', () => {
      const generator = SA.maskGenerator;
      if (!generator) return;
      const batch = generator.generateRandomBatch(10);
      SA.store.commands.setMasks(batch);
      renderList();
    });

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'btn btn-mini';
    clearBtn.textContent = `🗑 ${t('studio.masks.clearAll') || '全削除'}`;
    clearBtn.addEventListener('click', () => {
      SA.store.commands.clearMasks();
      renderList();
    });

    topBar.appendChild(addBtn);
    topBar.appendChild(gen10Btn);
    topBar.appendChild(clearBtn);

    const maskList = document.createElement('div');
    maskList.className = 'mask-list';

    function renderList() {
      maskList.innerHTML = '';
      const list = masksOf();

      if (!list.length) {
        const empty = document.createElement('div');
        empty.className = 'dialog-hint';
        empty.style.padding = '20px 0';
        empty.textContent = t('studio.masks.empty') || 'プロジェクト内にマスク画像がありません。「マスク追加」または「10枚再生成」を押してください。';
        maskList.appendChild(empty);
        return;
      }

      list.forEach((mask, index) => {
        const row = document.createElement('div');
        row.className = 'mask-item-row';
        row.style.display = 'flex';
        row.style.gap = '12px';
        row.style.alignItems = 'center';
        row.style.padding = '10px';
        row.style.border = '1px solid var(--border, rgba(255,255,255,0.1))';
        row.style.borderRadius = '6px';
        row.style.marginBottom = '8px';
        row.style.background = 'rgba(255,255,255,0.03)';

        // Thumbnail
        const img = document.createElement('img');
        img.src = mask.data || '';
        img.alt = mask.name || 'Mask';
        img.style.width = '64px';
        img.style.height = '64px';
        img.style.objectFit = 'contain';
        img.style.border = '1px solid #444';
        img.style.borderRadius = '4px';
        img.style.background = '#000';
        row.appendChild(img);

        // Details Container
        const details = document.createElement('div');
        details.style.flex = '1';

        // Title Row
        const titleRow = document.createElement('div');
        titleRow.style.display = 'flex';
        titleRow.style.gap = '8px';
        titleRow.style.alignItems = 'center';
        titleRow.style.marginBottom = '6px';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'input input-mini';
        nameInput.value = mask.name || `Mask #${index + 1}`;
        nameInput.style.flex = '1';
        nameInput.addEventListener('change', () => {
          SA.store.commands.updateMask(mask.id, { name: nameInput.value });
        });

        const resSelect = document.createElement('select');
        resSelect.className = 'select select-mini';
        [64, 128].forEach((res) => {
          const opt = document.createElement('option');
          opt.value = String(res);
          opt.textContent = `${res}x${res}`;
          if (mask.width === res) opt.selected = true;
          resSelect.appendChild(opt);
        });
        resSelect.addEventListener('change', () => {
          const res = Number(resSelect.value);
          const generator = SA.maskGenerator;
          if (generator) {
            const updated = generator.generate(mask.algorithm || 'perlin', {
              width: res,
              height: res,
              seed: mask.seed,
              targets: mask.targets,
              name: mask.name,
            });
            SA.store.commands.updateMask(mask.id, { width: res, height: res, data: updated.data, pixels: updated.pixels });
            renderList();
          }
        });

        const algoSelect = document.createElement('select');
        algoSelect.className = 'select select-mini';
        const generator = SA.maskGenerator;
        if (generator) {
          generator.ALGORITHMS.forEach((algo) => {
            const opt = document.createElement('option');
            opt.value = algo.id;
            opt.textContent = algo.nameJa;
            if (mask.algorithm === algo.id) opt.selected = true;
            algoSelect.appendChild(opt);
          });
        }
        algoSelect.addEventListener('change', () => {
          const algoId = algoSelect.value;
          if (generator) {
            const updated = generator.generate(algoId, {
              width: mask.width || 64,
              height: mask.height || 64,
              seed: mask.seed,
              targets: mask.targets,
              name: mask.name,
            });
            SA.store.commands.updateMask(mask.id, { algorithm: algoId, data: updated.data, pixels: updated.pixels });
            renderList();
          }
        });

        titleRow.appendChild(nameInput);
        titleRow.appendChild(resSelect);
        titleRow.appendChild(algoSelect);
        details.appendChild(titleRow);

        // Target Checkboxes Row
        const targetsRow = document.createElement('div');
        targetsRow.style.display = 'flex';
        targetsRow.style.gap = '12px';
        targetsRow.style.fontSize = '12px';
        targetsRow.style.color = '#ccc';

        const targets = mask.targets || {};
        const targetDefs = [
          { key: 'textFg', label: t('studio.masks.textFg') || 'テキストfg' },
          { key: 'textBg', label: t('studio.masks.textBg') || 'テキストbg' },
          { key: 'backdrop', label: t('studio.masks.backdrop') || 'backdrop' },
          { key: 'background', label: t('studio.masks.background') || 'background (grid等)' },
        ];

        targetDefs.forEach((def) => {
          const lbl = document.createElement('label');
          lbl.style.display = 'flex';
          lbl.style.alignItems = 'center';
          lbl.style.gap = '4px';
          lbl.style.cursor = 'pointer';

          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.checked = !!targets[def.key];
          chk.addEventListener('change', () => {
            const nextTargets = { ...targets, [def.key]: chk.checked };
            SA.store.commands.updateMask(mask.id, { targets: nextTargets });
          });

          lbl.appendChild(chk);
          lbl.appendChild(document.createTextNode(def.label));
          targetsRow.appendChild(lbl);
        });

        details.appendChild(targetsRow);
        row.appendChild(details);

        // Actions Container
        const actionsCol = document.createElement('div');
        actionsCol.style.display = 'flex';
        actionsCol.style.flexDirection = 'column';
        actionsCol.style.gap = '4px';

        const regenBtn = document.createElement('button');
        regenBtn.type = 'button';
        regenBtn.className = 'btn btn-mini';
        regenBtn.textContent = `🔄 ${t('studio.masks.regenerate') || '再生成'}`;
        regenBtn.addEventListener('click', () => {
          if (generator) {
            const newSeed = Math.floor(Math.random() * 1000000);
            const updated = generator.generate(mask.algorithm || 'perlin', {
              width: mask.width || 64,
              height: mask.height || 64,
              seed: newSeed,
              targets: mask.targets,
              name: mask.name,
            });
            SA.store.commands.updateMask(mask.id, { seed: newSeed, data: updated.data, pixels: updated.pixels });
            renderList();
          }
        });

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-mini';
        delBtn.textContent = `🗑 ${t('studio.masks.delete') || '削除'}`;
        delBtn.addEventListener('click', () => {
          SA.store.commands.removeMask(mask.id);
          renderList();
        });

        actionsCol.appendChild(regenBtn);
        actionsCol.appendChild(delBtn);
        row.appendChild(actionsCol);

        maskList.appendChild(row);
      });
    }

    renderList();

    body.appendChild(topBar);
    body.appendChild(maskList);

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-primary btn-mini';
    closeBtn.textContent = t('studio.masks.close') || '閉じる';
    closeBtn.addEventListener('click', () => {
      root.hidden = true;
    });

    actions.appendChild(closeBtn);

    dialog.appendChild(title);
    dialog.appendChild(hint);
    dialog.appendChild(body);
    dialog.appendChild(actions);

    root.appendChild(dialog);
    root.hidden = false;

    root.addEventListener('click', (event) => {
      if (event.target === root) root.hidden = true;
    }, { once: true });
  }

  return { open };
});
