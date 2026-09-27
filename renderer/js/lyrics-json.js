(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.lyricsJson = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ARRAY_KEYS = ['cues', 'segments', 'lines', 'lyrics', 'subtitles', 'captions', 'items', 'data', 'result', 'entries'];
  const START_KEYS = ['start', 'startTime', 'startSec', 'from', 'time', 't', 'begin'];
  const END_KEYS = ['end', 'endTime', 'endSec', 'to', 'until', 'stop'];
  const DURATION_KEYS = ['duration', 'durationSec', 'dur', 'length'];
  const TEXT_KEYS = ['text', 'lyric', 'lyrics', 'line', 'content', 'value', 'caption', 'words'];

  function isPlain(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function pick(object, keys) {
    for (const key of keys) {
      if (object[key] != null && object[key] !== '') return object[key];
    }
    return null;
  }

  function arrayOf(input) {
    if (Array.isArray(input)) return input;
    if (!isPlain(input)) return null;
    for (const key of ARRAY_KEYS) {
      if (Array.isArray(input[key])) return input[key];
    }
    return null;
  }

  function looksLikeMilliseconds(items, explicitUnit) {
    if (explicitUnit) return String(explicitUnit).toLowerCase() === 'ms';
    let max = -Infinity;
    for (const item of items) {
      if (!isPlain(item)) continue;
      const raw = pick(item, START_KEYS);
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return false;
      if (!Number.isInteger(raw)) return false;
      max = Math.max(max, raw);
    }
    return max >= 60000;
  }

  function timeValue(value, unit) {
    if (value == null || value === '') return null;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return null;
      return unit === 'ms' ? value / 1000 : value;
    }
    const text = String(value).trim();
    if (!text) return null;
    const match = text.match(/^(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?$/);
    if (match) {
      const hours = Number.parseInt(match[1] || '0', 10) || 0;
      const minutes = Number.parseInt(match[2], 10) || 0;
      const seconds = Number.parseInt(match[3], 10) || 0;
      const fraction = match[4] || '0';
      return hours * 3600 + minutes * 60 + seconds + Number.parseInt(fraction, 10) / Math.pow(10, fraction.length);
    }
    const numeric = Number(text);
    if (!Number.isFinite(numeric)) return null;
    return unit === 'ms' ? numeric / 1000 : numeric;
  }

  function textValue(value) {
    if (value == null) return '';
    if (Array.isArray(value)) {
      return value
        .map((entry) => (isPlain(entry) ? pick(entry, ['text', 'word', 'value']) : entry))
        .filter((entry) => entry != null && entry !== '')
        .join(' ');
    }
    return String(value);
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
    return `j_${Math.random().toString(16).slice(2, 10)}${idCounter.toString(16)}`;
  }

  function parse(input, options) {
    const opts = options || {};
    const cues = [];
    const warnings = [];
    let root = input;
    if (typeof input === 'string') {
      try {
        root = JSON.parse(input.replace(/^\uFEFF/, ''));
      } catch {
        warnings.push({ code: 'invalid-json', line: 1, message: 'The file is not valid JSON' });
        return { cues, warnings };
      }
    }
    const removedBy = (index) => String(index + 1);
    const items = arrayOf(root);
    if (!items) {
      warnings.push({ code: 'no-lyrics', line: 1, message: 'No cue array found in the JSON (cues/segments/lines)' });
      return { cues, warnings };
    }
    const unit = looksLikeMilliseconds(items, opts.unit || (isPlain(root) ? root.unit : null)) ? 'ms' : 's';
    const parsed = [];
    items.forEach((item, index) => {
      if (typeof item === 'string') {
        const text = normalizeEscapes(item).trim();
        if (text) parsed.push({ start: null, end: null, text, index });
        else warnings.push({ code: 'empty-cue', line: removedBy(index), message: `Entry ${removedBy(index)} has no text` });
        return;
      }
      if (!isPlain(item)) {
        warnings.push({ code: 'bad-entry', line: removedBy(index), message: `Entry ${removedBy(index)} is not an object` });
        return;
      }
      const text = normalizeEscapes(textValue(pick(item, TEXT_KEYS))).replace(/^\s+|\s+$/g, '');
      if (!text) {
        warnings.push({ code: 'empty-cue', line: removedBy(index), message: `Entry ${removedBy(index)} has no text` });
        return;
      }
      const start = timeValue(pick(item, START_KEYS), item.unit || unit);
      const rawEnd = timeValue(pick(item, END_KEYS), item.unit || unit);
      const rawDuration = timeValue(pick(item, DURATION_KEYS), item.unit || unit);
      const end = rawEnd != null ? rawEnd : start != null && rawDuration != null ? start + rawDuration : null;
      parsed.push({ start, end, text, index });
    });
    parsed.sort((a, b) => (a.start == null ? Infinity : a.start) - (b.start == null ? Infinity : b.start));
    for (let index = 0; index < parsed.length; index += 1) {
      const entry = parsed[index];
      let start = entry.start;
      if (start == null) {
        const previous = cues[cues.length - 1];
        start = previous ? previous.end : 0;
        warnings.push({ code: 'missing-time', line: removedBy(entry.index), message: `Entry ${removedBy(entry.index)} has no start time` });
      }
      start = Math.max(0, start);
      const next = parsed[index + 1];
      let end = entry.end;
      if (end == null) end = next && next.start != null ? next.start : start + estimateDuration(entry.text);
      end = Math.max(0, end);
      if (!(end > start)) {
        end = start + 1;
        warnings.push({ code: 'end-before-start', line: removedBy(entry.index), message: `Entry ${removedBy(entry.index)}: end <= start, fixed to start + 1` });
      }
      cues.push({ id: newId(), start, end, text: entry.text, meta: { kind: 'custom' } });
    }
    cues.sort((a, b) => a.start - b.start);
    return { cues, warnings };
  }

  function stringify(cues, options) {
    const opts = options || {};
    const round = (value) => Math.round((Number(value) || 0) * 1000) / 1000;
    const payload = {
      cues: (cues || []).map((cue) => ({ start: round(cue.start), end: round(cue.end), text: cue.text || '' })),
    };
    if (opts.title) payload.title = opts.title;
    if (opts.unit === 'ms') {
      for (const cue of payload.cues) {
        cue.start = Math.round(cue.start * 1000);
        cue.end = Math.round(cue.end * 1000);
      }
      payload.unit = 'ms';
    }
    return JSON.stringify(payload, null, 2);
  }

  return { parse, stringify, estimateDuration };
});
