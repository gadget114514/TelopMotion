(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.credits = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    title: { source: 'song', songId: null, text: '' },
    artist: { source: 'profile', text: '', showHandle: true },
    extra: { text: '' },
    template: '{title}\n{artist}',
    modes: {
      element: { enabled: true, at: 'start', time: 0, duration: 4 },
      always: { enabled: false, position: 'topRight', x: 0.9, y: 0.1, scale: 0.45, opacity: 0.85, hideDuringCues: false, from: 0, to: null },
      end: { enabled: true, duration: 5, style: 'endCard', afterLastCue: true },
    },
    styles: {},
  };

  function settingsFor(project) {
    const credits = (project && project.credits) || {};
    return {
      ...DEFAULTS,
      ...credits,
      title: { ...DEFAULTS.title, ...(credits.title || {}) },
      artist: { ...DEFAULTS.artist, ...(credits.artist || {}) },
      extra: { ...DEFAULTS.extra, ...(credits.extra || {}) },
      modes: {
        element: { ...DEFAULTS.modes.element, ...((credits.modes && credits.modes.element) || {}) },
        always: { ...DEFAULTS.modes.always, ...((credits.modes && credits.modes.always) || {}) },
        end: { ...DEFAULTS.modes.end, ...((credits.modes && credits.modes.end) || {}) },
      },
      styles: credits.styles || {},
    };
  }

  function titleText(project, settings) {
    const config = settings.title;
    if (config.source === 'custom') return String(config.text || '');
    const songs = (project && project.dataset && project.dataset.songs) || [];
    const song = songs.find((entry) => entry.id === config.songId) || songs[0] || null;
    return song ? song.title || '' : '';
  }

  function artistText(project, settings) {
    const config = settings.artist;
    if (config.source === 'custom') return String(config.text || '');
    const profile = (project && project.dataset && project.dataset.profile) || {};
    const name = profile.displayName || profile.handle || '';
    if (config.showHandle && profile.handle) return `${name} @${profile.handle}`;
    return name;
  }

  function expandTemplate(project, settings, context) {
    const values = {
      title: titleText(project, settings),
      artist: artistText(project, settings),
      handle: ((project && project.dataset && project.dataset.profile) || {}).handle || '',
      extra: settings.extra.text || '',
      year: String(context && context.year ? context.year : new Date().getFullYear()),
    };
    return String(settings.template || '{title}\n{artist}')
      .replace(/\{title\}/g, values.title)
      .replace(/\{artist\}/g, values.artist)
      .replace(/\{handle\}/g, values.handle)
      .replace(/\{extra\}/g, values.extra)
      .replace(/\{year\}/g, values.year)
      .split('\n');
  }

  function elements(project, options) {
    const settings = settingsFor(project);
    const opts = options || {};
    const cues = (project && project.script && project.script.cues) || [];
    const lastCueEnd = cues.reduce((max, cue) => Math.max(max, cue.end || 0), 0);
    const result = [];
    const lines = expandTemplate(project, settings, opts);
    const text = lines.join('\n');
    const mode = settings.modes;
    if (mode.element.enabled && mode.element.at !== 'time') {
      result.push({
        id: 'credit:element',
        mode: 'element',
        kind: 'credit',
        start: 0,
        end: Math.max(0.5, mode.element.duration || 4),
        text,
        lines,
        style: settings.styles.element || null,
      });
    } else if (mode.element.enabled) {
      const start = Math.max(0, mode.element.time || 0);
      result.push({
        id: 'credit:element',
        mode: 'element',
        kind: 'credit',
        start,
        end: start + Math.max(0.5, mode.element.duration || 4),
        text,
        lines,
        style: settings.styles.element || null,
      });
    }
    if (mode.end.enabled) {
      const duration = Math.max(0.5, mode.end.duration || 5);
      const start = mode.end.afterLastCue === false && mode.end.at != null ? mode.end.at : lastCueEnd;
      result.push({
        id: 'credit:end',
        mode: 'end',
        kind: 'credit',
        start,
        end: start + duration,
        text,
        lines,
        card: mode.end.style || 'endCard',
        style: settings.styles.end || null,
      });
    }
    return result;
  }

  function extendsDuration(project) {
    const settings = settingsFor(project);
    const cues = (project && project.script && project.script.cues) || [];
    const lastCueEnd = cues.reduce((max, cue) => Math.max(max, cue.end || 0), 0);
    if (!settings.modes.end.enabled || settings.modes.end.afterLastCue === false) return 0;
    return lastCueEnd + Math.max(0.5, settings.modes.end.duration || 5);
  }

  function alwaysOn(project, time) {
    const settings = settingsFor(project);
    const mode = settings.modes.always;
    if (!mode.enabled) return null;
    const from = mode.from || 0;
    const to = mode.to == null ? Infinity : mode.to;
    if (time < from || time > to) return null;
    const lines = expandTemplate(project, settings, {});
    return {
      id: 'credit:always',
      mode: 'always',
      kind: 'credit',
      start: from,
      end: to,
      text: lines.join('\n'),
      lines,
      position: mode.position,
      x: mode.x,
      y: mode.y,
      scale: mode.scale,
      opacity: mode.opacity,
      hideDuringCues: !!mode.hideDuringCues,
      style: settings.styles.always || null,
    };
  }

  return { DEFAULTS, settingsFor, expandTemplate, titleText, artistText, elements, extendsDuration, alwaysOn };
});
