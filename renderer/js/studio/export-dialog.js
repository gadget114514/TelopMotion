window.SA = window.SA || {};

SA.exportDialog = (() => {
  'use strict';

  let lastSettings = { format: 'auto', resolution: '1080p', fps: 30, audio: true, quality: 'final', transparent: false, bitrate: 'auto' };
  let abortFlag = null;

  function t(key, vars) {
    return SA.i18n.t(key, vars);
  }

  function resolutionScale(resolution) {
    if (resolution === '720p') return 720 / 1080;
    if (resolution === '1440p') return 1440 / 1080;
    return 1;
  }

  // the exported frame size: the project's output size scaled, rounded to even
  // pixels (the encoders need even dimensions)
  function exportSize(output, resolution) {
    const scale = resolutionScale(resolution);
    return {
      width: Math.max(16, Math.round((output.width * scale) / 2) * 2),
      height: Math.max(16, Math.round((output.height * scale) / 2) * 2),
    };
  }

  // each choice is shown as the width x height it actually produces, so a
  // vertical project reads 1080x1920 rather than an ambiguous "1080p"
  function resolutionOptions(output) {
    return ['1080p', '720p', '1440p']
      .map((value) => {
        const size = exportSize(output, value);
        return `<option value="${value}">${size.width} × ${size.height}</option>`;
      })
      .join('');
  }

  function open() {
    const doc = SA.store.state.project;
    if (!doc) return;
    const root = document.getElementById('dialog-root');
    if (!root) return;
    root.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    const total = SA.preview.duration();
    dialog.innerHTML = `
      <h3>${t('export.title')}</h3>
      <div class="field"><span>${t('export.format')}</span>
        <select data-field="format">
          <option value="auto">${t('export.formatAuto')}</option>
          <option value="mp4">MP4 (H.264)</option>
          <option value="webm">WebM (VP9)</option>
        </select>
      </div>
      <div class="field"><span>${t('export.resolution')}</span>
        <select data-field="resolution">
          ${resolutionOptions(doc.output)}
        </select>
      </div>
      <div class="field"><span>${t('export.fps')}</span>
        <select data-field="fps"><option value="30">30</option><option value="60">60</option></select>
      </div>
      <div class="field"><span>${t('export.bitrate')}</span>
        <input type="text" data-field="bitrate" value="${lastSettings.bitrate}" />
      </div>
      <label class="ctrl-bool-row"><input type="checkbox" data-field="audio" ${lastSettings.audio ? 'checked' : ''} />${t('export.audio')}</label>
      <label class="ctrl-bool-row"><input type="checkbox" data-field="transparent" ${lastSettings.transparent ? 'checked' : ''} />${t('export.transparent')}</label>
      <div class="field"><span>${t('export.quality')}</span>
        <select data-field="quality">
          <option value="final">${t('export.qualityFinal')}</option>
          <option value="draft">${t('export.qualityDraft')}</option>
        </select>
      </div>
      <div class="field"><span>${t('export.range')}</span><span>${t('export.rangeAll')} · ${SA.preview.formatClock(total)}</span></div>
      <progress data-field="progress" max="100" value="0"></progress>
      <div class="field"><span data-field="status">${t('export.ready')}</span></div>
      <div class="dialog-actions">
        <button type="button" class="btn" data-action="cancel">${t('export.cancel')}</button>
        <button type="button" class="btn btn-primary" data-action="export">${t('export.start')}</button>
      </div>`;
    root.appendChild(dialog);
    root.hidden = false;
    const field = (name) => dialog.querySelector(`[data-field="${name}"]`);
    field('format').value = lastSettings.format;
    field('resolution').value = lastSettings.resolution;
    field('fps').value = String(lastSettings.fps);
    field('quality').value = lastSettings.quality;
    dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      if (abortFlag) {
        abortFlag.aborted = true;
        return;
      }
      root.hidden = true;
    });
    dialog.querySelector('[data-action="export"]').addEventListener('click', async () => {
      lastSettings = {
        format: field('format').value,
        resolution: field('resolution').value,
        fps: Number(field('fps').value) || 30,
        audio: field('audio').checked,
        transparent: field('transparent').checked,
        quality: field('quality').value,
        bitrate: field('bitrate').value,
      };
      const button = dialog.querySelector('[data-action="export"]');
      button.disabled = true;
      abortFlag = { aborted: false };
      try {
        const result = await run(lastSettings, {
          progress: field('progress'),
          status: field('status'),
        }, abortFlag);
        if (result.canceled) field('status').textContent = t('export.canceled');
        else {
          field('status').textContent = t('export.done', { path: result.filePath || '' });
          if (result.stats) showStats(dialog, t('export.stats', result.stats));
        }
      } catch (error) {
        const code = (error && error.code) || 'error';
        field('status').textContent = t(`export.error.${code}`) === `export.error.${code}` ? t('export.errorGeneric') : t(`export.error.${code}`);
      } finally {
        abortFlag = null;
        button.disabled = false;
      }
    });
  }

  // the finished dialog keeps its stats on screen so the stage timings can be read
  function showStats(dialog, text) {
    let box = dialog.querySelector('[data-field="stats"]');
    if (!box) {
      box = document.createElement('div');
      box.className = 'field';
      box.dataset.field = 'stats';
      box.style.userSelect = 'text';
      dialog.querySelector('.dialog-actions').before(box);
    }
    box.textContent = text;
  }

  async function run(settings, ui, signal) {
    const doc = SA.store.state.project;
    const { width, height } = exportSize(doc.output, settings.resolution);
    const natural = SA.duration ? SA.duration.computeDuration(doc) : SA.preview.duration();
    const audioLength = SA.preview.getAudioDuration();
    const duration = doc.output && doc.output.maxDuration ? natural : Math.max(natural, audioLength || 0);
    const range = { from: 0, to: duration };
    const canvas = new OffscreenCanvas(width, height);
    const engine = SA.lyricsEngine.createEngine({ canvas, width, height, quality: 'export', preserveDrawingBuffer: true });
    if (!engine) throw Object.assign(new Error('webgl2-unavailable'), { code: 'webgl-unavailable' });
    try {
      engine.setProject(doc);
      engine.setAssets({ fonts: SA.lyricsFont.getActive() });
      if (typeof engine.preloadLayers === 'function') await engine.preloadLayers();
      const analysis = SA.preview.getAudioAnalysis ? SA.preview.getAudioAnalysis() : null;
      if (analysis && typeof engine.setAudio === 'function') engine.setAudio(analysis);
      const audioBuffer = settings.audio && !settings.transparent ? await SA.preview.getAudioBuffer() : null;
      if (ui && ui.progress) ui.progress.value = 0;
      const result = await SA.videoExport.exportVideo({
        width,
        height,
        fps: settings.fps,
        range,
        format: settings.format,
        transparent: settings.transparent,
        audioBuffer,
        name: SA.io.fileName(doc).replace(/\.telopmotion\.json$/, ''),
        signal,
        prepareFrame: (time) => (typeof engine.prepareLayers === 'function' ? engine.prepareLayers(time, { playback: 'export' }) : Promise.resolve(0)),
        renderFrame: (time) => {
          engine.renderFrame(time);
        },
        captureBitmap: () => canvas.transferToImageBitmap(),
        onProgress: (info) => {
          if (!ui) return;
          if (ui.progress) ui.progress.value = Math.round((info.frame / info.total) * 100);
          if (ui.status) ui.status.textContent = t('export.progress', { percent: Math.round((info.frame / info.total) * 100), eta: Math.round(info.eta) });
        },
      });
      if (result.ok) {
        // exporting a video is not saving the project: the dirty flag (and with
        // it autosave) must keep tracking unsaved edits
        SA.platform.recent.add({ name: doc.meta.title || 'Project', path: result.filePath, updatedAt: new Date().toISOString() }).catch(() => {});
      }
      return result;
    } finally {
      engine.dispose();
    }
  }

  return { open, run };
})();
