(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.duration = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MIN_CUE = 1.2;

  function naturalLength(project) {
    const cues = (project && project.script && project.script.cues) || [];
    const cueEnd = cues.reduce((max, cue) => Math.max(max, cue.end || 0), 0);
    const credits = project && project.credits;
    let creditsExtra = 0;
    if (credits && credits.modes) {
      const element = credits.modes.element || {};
      if (element.enabled && element.at === 'time') creditsExtra = Math.max(creditsExtra, (element.time || 0) + (element.duration || 0));
      const end = credits.modes.end || {};
      if (end.enabled && end.afterLastCue !== false) creditsExtra = Math.max(creditsExtra, cueEnd + (end.duration || 0));
    }
    const songLength = Number(project && project.song && project.song.length);
    return Math.max(cueEnd, creditsExtra, Number.isFinite(songLength) && songLength > 0 ? songLength : 0);
  }

  function computeDuration(project) {
    const natural = naturalLength(project);
    const max = project && project.output ? project.output.maxDuration : null;
    if (!max || max <= 0) return natural;
    return Math.min(max, natural);
  }

  function scaleTimes(project, factor, reserveEnd) {
    const cues = (project && project.script && project.script.cues) || [];
    for (const cue of cues) {
      cue.start *= factor;
      cue.end *= factor;
    }
    for (const list of Object.values(project.keyframes || {})) {
      for (const track of Object.values(list)) {
        for (const key of track) key.t *= factor;
      }
    }
    for (const marker of project.markers || []) marker.t *= factor;
    void reserveEnd;
  }

  function compress(project, max) {
    const cues = (project && project.script && project.script.cues) || [];
    if (!cues.length) return { ok: true };
    const last = cues.reduce((value, cue) => Math.max(value, cue.end || 0), 0);
    const gaps = cues.reduce((sum, cue, index) => (index === 0 ? 0 : sum + Math.max(0, cue.start - cues[index - 1].end)), 0);
    const contentTime = last - gaps;
    const available = max - gaps;
    if (contentTime <= MIN_CUE * cues.length) {
      return { ok: false, reason: 'too-short' };
    }
    const factor = Math.max(MIN_CUE / Math.max(0.001, contentTime / cues.length), available / contentTime);
    scaleTimes(project, factor);
    return { ok: true, factor };
  }

  function cuePriority(cue) {
    const meta = cue.meta || {};
    if (meta.kind === 'completion') return 0;
    if (meta.kind === 'badge') {
      if (meta.tier === 'gold') return 1;
      if (meta.tier === 'silver') return 2;
      if (meta.tier === 'bronze') return 3;
      return 4;
    }
    if (meta.kind === 'song') return 5;
    if (meta.kind === 'stat') return 6;
    return 7;
  }

  function drop(project, max) {
    const cues = (project && project.script && project.script.cues) || [];
    const manual = cues.filter((cue) => cue.manual || cue.imported || (cue.meta && cue.meta.kind === 'custom'));
    const automatic = cues.filter((cue) => !manual.includes(cue));
    automatic.sort((a, b) => cuePriority(b) - cuePriority(a) || (b.end - b.start) - (a.end - a.start));
    const removed = [];
    while (automatic.length) {
      const total = [...manual, ...automatic].reduce((maxEnd, cue) => Math.max(maxEnd, cue.end), 0);
      if (total <= max) break;
      removed.push(automatic.shift());
    }
    const remaining = [...manual, ...automatic];
    const trimmed = remaining.filter((cue) => cue.start < max);
    const total = trimmed.reduce((maxEnd, cue) => Math.max(maxEnd, cue.end), 0);
    if (total > max && !manual.length) return { ok: false, reason: 'manual-only', removed, cues: trimmed };
    project.script.cues = trimmed.sort((a, b) => a.start - b.start);
    return { ok: true, removed, cues: project.script.cues };
  }

  function cut(project, max) {
    const cues = (project && project.script && project.script.cues) || [];
    project.script.cues = cues.filter((cue) => cue.start < max);
    for (const cue of project.script.cues) cue.end = Math.min(cue.end, max);
    return { ok: true };
  }

  function fit(project, options) {
    const opts = options || {};
    const max = opts.max != null ? opts.max : project && project.output ? project.output.maxDuration : null;
    if (!max || max <= 0) return { ok: true, mode: 'none' };
    const natural = naturalLength(project);
    if (natural <= max + 1e-6) return { ok: true, mode: 'none' };
    const mode = (project && project.output && project.output.overflow) || 'compress';
    if (mode === 'compress') {
      const result = compress(project, max);
      return { ...result, mode: 'compress' };
    }
    if (mode === 'drop') {
      const result = drop(project, max);
      if (result.ok) return { ...result, mode: 'drop' };
      const fallback = cut(project, max);
      return { ...fallback, mode: 'cut', fallback: true };
    }
    const result = cut(project, max);
    return { ...result, mode: 'cut' };
  }

  return { MIN_CUE, naturalLength, computeDuration, fit, compress, drop, cut, cuePriority };
});
