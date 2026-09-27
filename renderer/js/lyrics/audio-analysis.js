(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.audioAnalysis = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FFT_SIZE = 2048;
  const BANDS = 128;
  const WAVE = 512;

  function hannWindow(size) {
    const window = new Float32Array(size);
    for (let i = 0; i < size; i += 1) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
    return window;
  }

  const WINDOW = hannWindow(FFT_SIZE);

  function fftReal(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i += 1) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const angle = (-2 * Math.PI) / len;
      const wRe = Math.cos(angle);
      const wIm = Math.sin(angle);
      for (let i = 0; i < n; i += len) {
        let curRe = 1;
        let curIm = 0;
        for (let j = 0; j < len / 2; j += 1) {
          const uRe = re[i + j];
          const uIm = im[i + j];
          const vRe = re[i + j + len / 2] * curRe - im[i + j + len / 2] * curIm;
          const vIm = re[i + j + len / 2] * curIm + im[i + j + len / 2] * curRe;
          re[i + j] = uRe + vRe;
          im[i + j] = uIm + vIm;
          re[i + j + len / 2] = uRe - vRe;
          im[i + j + len / 2] = uIm - vIm;
          const nextRe = curRe * wRe - curIm * wIm;
          curIm = curRe * wIm + curIm * wRe;
          curRe = nextRe;
        }
      }
    }
  }

  function bandEdges(sampleRate, bands, fftSize) {
    const nyquist = sampleRate / 2;
    const min = 30;
    const max = Math.min(18000, nyquist);
    const edges = [];
    for (let i = 0; i <= bands; i += 1) {
      const t = i / bands;
      edges.push(min * Math.pow(max / min, t));
    }
    return edges.map((frequency) => Math.min(fftSize / 2 - 1, Math.max(0, Math.round((frequency / nyquist) * (fftSize / 2)))));
  }

  function analyzeChannel(data, sampleRate, fps, options) {
    const opts = options || {};
    const frameCount = Math.max(1, Math.ceil(data.length / sampleRate) * fps);
    const frames = [];
    const edges = bandEdges(sampleRate, BANDS, FFT_SIZE);
    const hop = sampleRate / fps;
    const re = new Float32Array(FFT_SIZE);
    const im = new Float32Array(FFT_SIZE);
    let attack = opts.attack == null ? 0.6 : opts.attack;
    let release = opts.release == null ? 0.12 : opts.release;
    const smoothed = new Float32Array(BANDS);
    for (let frame = 0; frame < frameCount; frame += 1) {
      const center = Math.round(frame * hop);
      let energy = 0;
      for (let i = 0; i < FFT_SIZE; i += 1) {
        const index = center + i - FFT_SIZE / 2;
        const sample = index >= 0 && index < data.length ? data[index] : 0;
        re[i] = sample * WINDOW[i];
        im[i] = 0;
        energy += sample * sample;
      }
      fftReal(re, im);
      const bands = new Float32Array(BANDS);
      for (let band = 0; band < BANDS; band += 1) {
        let sum = 0;
        const from = edges[band];
        const to = Math.max(edges[band + 1], from + 1);
        for (let bin = from; bin < to; bin += 1) sum += Math.sqrt(re[bin] * re[bin] + im[bin] * im[bin]);
        const value = sum / Math.max(1, to - from) / (FFT_SIZE / 4);
        smoothed[band] = value > smoothed[band] ? smoothed[band] + (value - smoothed[band]) * attack : smoothed[band] + (value - smoothed[band]) * release;
        bands[band] = smoothed[band];
      }
      const wave = new Float32Array(WAVE);
      const step = Math.max(1, Math.floor(data.length / Math.max(1, frameCount)));
      for (let i = 0; i < WAVE; i += 1) {
        const index = frame * step + Math.floor((i / WAVE) * step);
        wave[i] = index < data.length ? data[index] : 0;
      }
      frames.push({ rms: Math.sqrt(energy / FFT_SIZE), bands, wave });
    }
    return frames;
  }

  function analyze(channels, sampleRate, fps, options) {
    const opts = options || {};
    const targetFps = opts.fps || fps || 30;
    const list = Array.isArray(channels) ? channels : [channels];
    const frames = list.map((data) => analyzeChannel(data, sampleRate, targetFps, opts));
    const count = frames[0] ? frames[0].length : 0;
    const result = [];
    for (let frame = 0; frame < count; frame += 1) {
      const rms = frames.reduce((sum, list2) => sum + (list2[frame] ? list2[frame].rms : 0), 0) / Math.max(1, frames.length);
      const bands = new Float32Array(BANDS);
      const wave = new Float32Array(WAVE);
      for (let band = 0; band < BANDS; band += 1) {
        let sum = 0;
        for (const list2 of frames) if (list2[frame]) sum += list2[frame].bands[band];
        bands[band] = sum / Math.max(1, frames.length);
      }
      for (let i = 0; i < WAVE; i += 1) {
        let sum = 0;
        for (const list2 of frames) if (list2[frame]) sum += list2[frame].wave[i];
        wave[i] = sum / Math.max(1, frames.length);
      }
      result.push({ rms, bands, wave });
    }
    return { fps: targetFps, frameCount: result.length, frames: result };
  }

  function bandPeak(frames, index) {
    let peak = 0;
    let peakFrame = 0;
    frames.forEach((frame, frameIndex) => {
      if (frame.bands[index] > peak) {
        peak = frame.bands[index];
        peakFrame = frameIndex;
      }
    });
    return { peak, frame: peakFrame };
  }

  function dominantBandForFrequency(frequency, sampleRate) {
    const edges = bandEdges(sampleRate, BANDS, FFT_SIZE);
    const nyquist = sampleRate / 2;
    const bin = (frequency / nyquist) * (FFT_SIZE / 2);
    for (let band = 0; band < BANDS; band += 1) {
      if (bin >= edges[band] && bin < edges[band + 1]) return band;
    }
    return BANDS - 1;
  }

  function features(analysis) {
    const frames = (analysis && analysis.frames) || [];
    const fps = (analysis && analysis.fps) || 30;
    if (!frames.length) return { rms: 0, energy: 0.5, dynamics: 0.4, brightness: 0.5, onsets: 0, bpm: 0 };
    const rmsList = frames.map((frame) => frame.rms || 0);
    const mean = rmsList.reduce((sum, value) => sum + value, 0) / rmsList.length;
    const sorted = [...rmsList].sort((a, b) => a - b);
    const quantile = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
    const dynamics = clamp01((quantile(0.9) - quantile(0.2)) * 3);
    let low = 0;
    let high = 0;
    for (const frame of frames) {
      for (let band = 0; band < BANDS; band += 1) {
        const value = (frame.bands && frame.bands[band]) || 0;
        if (band < BANDS / 4) low += value;
        else if (band > (BANDS * 3) / 4) high += value;
      }
    }
    const brightness = clamp01(high / Math.max(1e-6, high + low));
    const flux = new Float32Array(frames.length);
    for (let i = 1; i < frames.length; i += 1) {
      let sum = 0;
      const bands = frames[i].bands || [];
      const previous = frames[i - 1].bands || [];
      for (let band = 0; band < BANDS; band += 1) {
        const delta = (bands[band] || 0) - (previous[band] || 0);
        if (delta > 0) sum += delta;
      }
      flux[i] = sum;
    }
    let bestLag = 0;
    let bestScore = 0;
    const minLag = Math.max(2, Math.round((60 / 200) * fps));
    const maxLag = Math.max(minLag + 1, Math.round((60 / 60) * fps));
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let score = 0;
      for (let i = lag; i < flux.length; i += 1) score += flux[i] * flux[i - lag];
      score /= Math.max(1, flux.length - lag);
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }
    let onsets = 0;
    for (let i = 1; i < rmsList.length; i += 1) if (rmsList[i] - rmsList[i - 1] > mean * 0.25) onsets += 1;
    onsets /= Math.max(1, rmsList.length / fps);
    return {
      rms: mean,
      energy: clamp01(mean * 3.5),
      dynamics,
      brightness,
      onsets,
      bpm: bestLag ? Math.round(((60 * fps) / bestLag) * 10) / 10 : 0,
    };
  }

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(1, number));
  }

  return { FFT_SIZE, BANDS, WAVE, fftReal, bandEdges, analyze, features, bandPeak, dominantBandForFrequency, hannWindow };
});
