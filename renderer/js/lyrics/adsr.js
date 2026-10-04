(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./easing'));
  } else {
    root.SA = root.SA || {};
    root.SA.adsr = factory(root.SA.easing);
  }
})(typeof self !== 'undefined' ? self : this, function (easing) {
  'use strict';

  function clamp01(value) {
    if (Number.isNaN(value)) return 0;
    return value <= 0 ? 0 : value >= 1 ? 1 : value;
  }

  function num(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback == null ? 0 : fallback;
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function resolveDuration(value, duration) {
    if (typeof value === 'string' && value.trim().endsWith('%')) return (parseFloat(value) / 100) * duration;
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function def(raw, duration) {
    if (!isPlainObject(raw)) return null;
    const time = (value) => (value == null || value === '' ? null : Math.max(0.001, resolveDuration(value, duration)));
    const clamp = (value, fallback, max) => Math.max(0, Math.min(max, num(value, fallback)));
    const easeName = (value) => (typeof value === 'string' && value.trim() ? value : null);
    return {
      attack: time(raw.attack),
      decay: raw.decay == null ? 0 : Math.max(0, resolveDuration(raw.decay, duration)),
      release: time(raw.release),
      sustain: clamp(raw.sustain, 1, 2),
      peak: clamp(raw.peak, 1, 3),
      punch: clamp(raw.punch, 0, 2),
      attackEase: easeName(raw.attackEase),
      decayEase: easeName(raw.decayEase),
      releaseEase: easeName(raw.releaseEase),
    };
  }

  function level(adsr, local, enterStart, enterDur, exitStart, exitDur, enterEase, exitEase) {
    const ease = adsr.attackEase ? easing.get(adsr.attackEase) : enterEase || ((x) => x);
    const easeOut = adsr.releaseEase ? easing.get(adsr.releaseEase) : exitEase || ((x) => x);
    const decayEase = easing.get(adsr.decayEase || 'easeOutCubic');
    const attackEnd = enterStart + enterDur;
    const levelAt = (time) => {
      if (time <= enterStart) return 0;
      if (time < attackEnd) return adsr.peak * ease(clamp01((time - enterStart) / enterDur));
      if (adsr.decay > 0 && time < attackEnd + adsr.decay) {
        return adsr.peak + (adsr.sustain - adsr.peak) * decayEase(clamp01((time - attackEnd) / adsr.decay));
      }
      return adsr.sustain;
    };
    if (local < exitStart) return levelAt(local);
    const px = clamp01((local - exitStart) / Math.max(0.001, exitDur));
    return levelAt(exitStart) * (1 - easeOut(px));
  }

  function clipLevel(raw, t, start, end, fadeIn, fadeOut) {
    const a = def(raw, end - start);
    if (!a) return null;
    const attack = a.attack != null ? a.attack : Math.max(0.001, num(fadeIn, 0));
    const release = a.release != null ? a.release : Math.max(0.001, num(fadeOut, 0));
    return level(a, t - start, 0, attack, (end - start) - release, release, null, null);
  }

  const PRESETS = {
    pluck: { attack: 0.05, decay: 0.35, sustain: 0.3, release: 0.3, peak: 1.5, punch: 0.2, attackEase: 'easeOutQuad', decayEase: 'easeOutExpo', releaseEase: 'easeInQuad' },
    stab:  { attack: 0.08, decay: 0.2,  sustain: 0.8, release: 0.15, peak: 1.3, punch: 0.3, attackEase: 'backOut', decayEase: 'easeOutCubic', releaseEase: 'easeInCubic' },
    pad:   { attack: 0.8,  decay: 0,    sustain: 1,   release: 1.0, peak: 1,   punch: 0, attackEase: 'easeInOutSine', decayEase: 'linear', releaseEase: 'easeInOutSine' },
    swell: { attack: 1.2,  decay: 0.3,  sustain: 0.7, release: 0.6, peak: 1.2, punch: 0.1, attackEase: 'easeInCubic', decayEase: 'easeOutSine', releaseEase: 'easeOutSine' },
  };

  return {
    def,
    level,
    clipLevel,
    PRESETS,
  };
});
