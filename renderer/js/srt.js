(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.srt = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TIMING_RE = /^\s*(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})\s*-->\s*(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})\s*(.*)$/;
  const ANY_TIME_RE = /(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})/;
  const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)\/?>/g;
  const FX_RE = /^\s*\{fx:([^}]*)\}\s*/;

  function pad(value, size) {
    return String(value).padStart(size, '0');
  }

  function timeFromMatch(match, offset) {
    const hours = Number.parseInt(match[offset] || '0', 10) || 0;
    const minutes = Number.parseInt(match[offset + 1] || '0', 10) || 0;
    const seconds = Number.parseInt(match[offset + 2] || '0', 10) || 0;
    const fraction = match[offset + 3] || '0';
    return hours * 3600 + minutes * 60 + seconds + Number.parseInt(fraction, 10) / Math.pow(10, fraction.length);
  }

  function parseTime(value) {
    const match = String(value == null ? '' : value).match(ANY_TIME_RE);
    if (!match) return 0;
    return timeFromMatch(match, 1);
  }

  function formatTime(seconds) {
    const total = Math.max(0, Number(seconds) || 0);
    const totalMs = Math.round(total * 1000);
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)},${pad(ms, 3)}`;
  }

  function normalizeEscapes(text) {
    return String(text == null ? '' : text)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/\\N/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\h/g, '\u00a0');
  }

  function parseFontColor(attrs) {
    const match = String(attrs || '').match(/color\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i);
    if (!match) return null;
    return match[1].replace(/^["']|["']$/g, '');
  }

  function stripTags(text) {
    const source = String(text == null ? '' : text);
    let plain = '';
    const spans = [];
    let bold = 0;
    let italic = 0;
    let underline = 0;
    const colors = [];
    let runStart = 0;
    let run = { bold: false, italic: false, color: null };

    function state() {
      return {
        bold: bold > 0,
        italic: italic > 0,
        underline: underline > 0,
        color: colors.length ? colors[colors.length - 1] : null,
      };
    }

    function same(a, b) {
      return a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.color === b.color;
    }

    function closeRun() {
      if (plain.length > runStart && (run.bold || run.italic || run.underline || run.color)) {
        const span = { from: runStart, to: plain.length };
        if (run.bold) span.bold = true;
        if (run.italic) span.italic = true;
        if (run.underline) span.underline = true;
        if (run.color) span.color = run.color;
        spans.push(span);
      }
      runStart = plain.length;
    }

    function setState(next) {
      if (!same(run, next)) {
        closeRun();
        run = next;
      }
    }

    TAG_RE.lastIndex = 0;
    let cursor = 0;
    let match = TAG_RE.exec(source);
    while (match) {
      plain += source.slice(cursor, match.index);
      const closing = match[0].startsWith('</');
      const tag = match[1].toLowerCase();
      if (tag === 'b') {
        bold = closing ? Math.max(0, bold - 1) : bold + 1;
      } else if (tag === 'i') {
        italic = closing ? Math.max(0, italic - 1) : italic + 1;
      } else if (tag === 'u') {
        underline = closing ? Math.max(0, underline - 1) : underline + 1;
      } else if (tag === 'font') {
        if (closing) colors.pop();
        else {
          const color = parseFontColor(match[2]);
          if (color) colors.push(color);
        }
      }
      setState(state());
      cursor = TAG_RE.lastIndex;
      match = TAG_RE.exec(source);
    }
    plain += source.slice(cursor);
    closeRun();
    return { plain, spans };
  }

  function extractFx(text) {
    const match = String(text).match(FX_RE);
    if (!match) return { text, values: {} };
    const values = {};
    for (const pair of match[1].split(',')) {
      const [key, value] = pair.split('=');
      if (!key || !value) continue;
      const name = key.trim();
      if (!name) continue;
      values[name] = value.trim();
    }
    return { text: String(text).slice(match[0].length), values };
  }

  let idCounter = 0;

  function newId() {
    idCounter += 1;
    return `c_${Math.random().toString(16).slice(2, 10)}${idCounter.toString(16)}`;
  }

  function adjustSpans(spans, offset, maxLength) {
    if (!spans.length) return [];
    const result = [];
    for (const span of spans) {
      const from = Math.max(0, span.from - offset);
      const to = Math.min(maxLength, span.to - offset);
      if (to <= from) continue;
      const entry = { from, to };
      if (span.bold) entry.bold = true;
      if (span.italic) entry.italic = true;
      if (span.underline) entry.underline = true;
      if (span.color) entry.color = span.color;
      result.push(entry);
    }
    return result;
  }

  function parse(input) {
    const cues = [];
    const warnings = [];
    if (input == null) return { cues, warnings };
    const text = String(input)
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n');
    const blocks = text.split(/\n{2,}/);
    blocks.forEach((block, blockIndex) => {
      const lines = block.split('\n');
      while (lines.length && lines[0].trim() === '') lines.shift();
      while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
      if (!lines.length) return;
      let timingIndex = -1;
      let match = null;
      for (let i = 0; i < lines.length && i < 3; i += 1) {
        const found = lines[i].match(TIMING_RE);
        if (found) {
          timingIndex = i;
          match = found;
          break;
        }
      }
      if (!match) {
        warnings.push({ code: 'missing-time', line: blockIndex + 1, message: 'Cue has no time line' });
        return;
      }
      const start = timeFromMatch(match, 1);
      let end = timeFromMatch(match, 5);
      let raw = lines.slice(timingIndex + 1).join('\n');
      if (!raw.trim()) {
        warnings.push({ code: 'empty-cue', line: blockIndex + 1, message: 'Cue has no text' });
        return;
      }
      const fx = extractFx(raw);
      raw = normalizeEscapes(fx.text);
      const stripped = stripTags(raw);
      const leading = stripped.plain.match(/^\n+/);
      const offset = leading ? leading[0].length : 0;
      const plain = stripped.plain.replace(/^\n+|\n+$/g, '');
      if (!plain.trim()) {
        warnings.push({ code: 'empty-cue', line: blockIndex + 1, message: 'Cue has no text' });
        return;
      }
      if (!(end > start)) {
        end = start + 1;
        warnings.push({ code: 'end-before-start', line: blockIndex + 1, message: `Cue ${blockIndex + 1}: end <= start, fixed to start + 1` });
      }
      const cue = { id: newId(), start, end, text: plain, meta: { kind: 'custom' } };
      const spans = adjustSpans(stripped.spans, offset, plain.length);
      if (spans.length) cue.spans = spans;
      if (Object.keys(fx.values).length) cue.fx = fx.values;
      cues.push(cue);
    });
    cues.sort((a, b) => a.start - b.start);
    return { cues, warnings };
  }

  function applySpans(text, spans) {
    if (!spans || !spans.length) return text;
    const states = new Array(text.length);
    for (let i = 0; i < text.length; i += 1) states[i] = { bold: false, italic: false, underline: false, color: null };
    for (const span of spans) {
      const from = Math.max(0, Math.min(text.length, span.from));
      const to = Math.max(from, Math.min(text.length, span.to));
      for (let i = from; i < to; i += 1) {
        if (span.bold != null) states[i].bold = !!span.bold;
        if (span.italic != null) states[i].italic = !!span.italic;
        if (span.underline != null) states[i].underline = !!span.underline;
        if (span.color != null) states[i].color = span.color;
      }
    }
    const same = (a, b) => a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.color === b.color;
    let out = '';
    let i = 0;
    while (i < text.length) {
      const state = states[i];
      let j = i;
      while (j < text.length && same(states[j], state)) j += 1;
      let chunk = text.slice(i, j);
      if (state.color) chunk = `<font color="${state.color}">${chunk}</font>`;
      if (state.underline) chunk = `<u>${chunk}</u>`;
      if (state.italic) chunk = `<i>${chunk}</i>`;
      if (state.bold) chunk = `<b>${chunk}</b>`;
      out += chunk;
      i = j;
    }
    return out;
  }

  function stringify(cues, options) {
    const includeFx = !!(options && options.includeFx);
    const lines = [];
    for (let index = 0; index < (cues || []).length; index += 1) {
      const cue = cues[index];
      lines.push(String(index + 1));
      lines.push(`${formatTime(cue.start)} --> ${formatTime(cue.end)}`);
      let text = cue.text || '';
      if (includeFx && cue.fx && Object.keys(cue.fx).length) {
        const tag = Object.entries(cue.fx)
          .map(([key, value]) => `${key}=${value}`)
          .join(',');
        text = `{fx:${tag}} ${text}`;
      }
      lines.push(applySpans(text, cue.spans));
      lines.push('');
    }
    return lines.join('\r\n');
  }

  return { parse, stringify, formatTime, parseTime, stripTags, normalizeEscapes, extractFx };
});
