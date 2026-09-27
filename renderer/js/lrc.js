(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.lrc = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // [mm:ss], [mm:ss.xx], [mm:ss.xxx], [m:ss:xx], [h:mm:ss], [h:mm:ss.xx]
  const TIME_RE = /^\s*\[(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?(?:[.:](\d{1,3}))?\]/;
  const META_RE = /^\s*\[([a-zA-Z]+):([^\]]*)\]\s*/;
  const WORD_RE = /<(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?(?:[.:](\d{1,3}))?>/g;

  function pad(value, size) {
    return String(value).padStart(size, '0');
  }

  function timeFromMatch(match) {
    const hasHours = match[3] != null;
    const hours = hasHours ? Number.parseInt(match[1], 10) || 0 : 0;
    const minutes = hasHours ? Number.parseInt(match[2], 10) || 0 : Number.parseInt(match[1], 10) || 0;
    const seconds = hasHours ? Number.parseInt(match[3], 10) || 0 : Number.parseInt(match[2], 10) || 0;
    const fraction = match[4] || '0';
    return hours * 3600 + minutes * 60 + seconds + Number.parseInt(fraction, 10) / Math.pow(10, fraction.length);
  }

  function parseTime(value) {
    const text = String(value == null ? '' : value).trim();
    const bracketed = text.match(/^\[?(\d{1,3}:\d{1,2}(?::\d{1,2})?(?:[.:]\d{1,3})?)\]?$/);
    if (bracketed) {
      const match = bracketed[1].match(/^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?(?:[.:](\d{1,3}))?$/);
      if (match) return timeFromMatch(match);
    }
    const numeric = Number(text);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
  }

  function formatTime(seconds) {
    const total = Math.max(0, Number(seconds) || 0);
    const centis = Math.round(total * 100);
    const minutes = Math.floor(centis / 6000);
    const secs = Math.floor((centis % 6000) / 100);
    const fraction = centis % 100;
    return `${pad(minutes, 2)}:${pad(secs, 2)}.${pad(fraction, 2)}`;
  }

  function normalizeEscapes(text) {
    return String(text == null ? '' : text)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/\\N/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\h/g, '\u00a0');
  }

  function estimateDuration(text) {
    const length = String(text || '').replace(/\s+/g, '').length;
    return Math.max(2.5, Math.min(12, length * 0.18));
  }

  let idCounter = 0;

  function newId() {
    idCounter += 1;
    return `l_${Math.random().toString(16).slice(2, 10)}${idCounter.toString(16)}`;
  }

  function stripWordTags(text) {
    if (!/<(\d{1,3}:\d{1,2})/.test(text)) return { plain: text, words: [] };
    const words = [];
    let plain = '';
    let cursor = 0;
    let pending = null;
    let match;
    WORD_RE.lastIndex = 0;
    while ((match = WORD_RE.exec(text))) {
      const chunk = text.slice(cursor, match.index);
      if (chunk) {
        plain += chunk;
        if (pending != null) words.push({ t: pending, text: chunk });
      }
      pending = timeFromMatch(match);
      cursor = WORD_RE.lastIndex;
    }
    const tail = text.slice(cursor);
    if (tail) {
      plain += tail;
      if (pending != null) words.push({ t: pending, text: tail });
    }
    return { plain, words };
  }

  function parse(input, options) {
    const cues = [];
    const warnings = [];
    const meta = {};
    if (input == null) return { cues, warnings, meta };
    const text = String(input)
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n');
    const entries = [];
    const lines = text.split('\n');
    let offsetMs = 0;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      if (!line.trim()) continue;
      let cursor = 0;
      const times = [];
      let metaOnly = false;
      while (cursor < line.length) {
        const slice = line.slice(cursor);
        const timeMatch = slice.match(TIME_RE);
        if (timeMatch) {
          times.push(timeFromMatch(timeMatch));
          cursor += timeMatch[0].length;
          continue;
        }
        const metaMatch = slice.match(META_RE);
        if (metaMatch) {
          const key = metaMatch[1].toLowerCase();
          meta[key] = metaMatch[2].trim();
          if (key === 'offset') offsetMs = Number(meta[key]) || 0;
          cursor += metaMatch[0].length;
          metaOnly = true;
          continue;
        }
        break;
      }
      if (metaOnly && !times.length) continue;
      const rest = line.slice(cursor);
      if (!times.length && rest.trim()) {
        warnings.push({ code: 'no-time', line: lineIndex + 1, message: `Line ${lineIndex + 1} has no time tag` });
        continue;
      }
      const stripped = stripWordTags(rest);
      const plain = normalizeEscapes(stripped.plain).replace(/^\s+|\s+$/g, '');
      entries.push({ times, text: plain, words: stripped.words });
    }
    // Times from word tags are already absolute; keep them in sync with the offset below.
    const offsetSeconds = offsetMs / 1000;
    const tags = [];
    for (const entry of entries) {
      for (const time of entry.times) tags.push({ time, text: entry.text, words: entry.words });
    }
    tags.sort((a, b) => a.time - b.time);
    for (let index = 0; index < tags.length; index += 1) {
      const tag = tags[index];
      if (!tag.text) continue; // instrumental marker: closes the previous cue only
      const start = Math.max(0, tag.time - offsetSeconds);
      const next = tags[index + 1];
      let end = next ? Math.max(0, next.time - offsetSeconds) : start + estimateDuration(tag.text);
      if (!(end > start)) {
        end = start + 1;
        warnings.push({ code: 'end-before-start', line: index + 1, message: `Cue ${index + 1}: end <= start, fixed to start + 1` });
      }
      const cue = { id: newId(), start, end, text: tag.text, meta: { kind: 'custom' } };
      if (tag.words && tag.words.length) {
        cue.words = tag.words.map((word) => ({ t: Math.max(0, word.t - offsetSeconds), text: word.text }));
      }
      cues.push(cue);
    }
    cues.sort((a, b) => a.start - b.start);
    if (options && options.sort === false) {
      /* keep insertion order (already sorted) */
    }
    return { cues, warnings, meta };
  }

  function stringify(cues, options) {
    const opts = options || {};
    const meta = opts.meta || {};
    const lines = [];
    for (const key of ['ti', 'ar', 'al', 'by', 'offset']) {
      if (meta[key] != null && meta[key] !== '') lines.push(`[${key}:${meta[key]}]`);
    }
    if (lines.length && cues && cues.length) lines.push('');
    for (const cue of cues || []) {
      const text = String(cue.text == null ? '' : cue.text).replace(/\r?\n/g, ' / ');
      lines.push(`[${formatTime(cue.start)}]${text}`);
    }
    return lines.join('\r\n');
  }

  return { parse, stringify, parseTime, formatTime, normalizeEscapes, estimateDuration };
});
