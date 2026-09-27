(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./srt'), require('./lrc'), require('./lyrics-json'));
  } else {
    root.SA = root.SA || {};
    root.SA.lyricsFile = factory(root.SA.srt, root.SA.lrc, root.SA.lyricsJson);
  }
})(typeof self !== 'undefined' ? self : this, function (srt, lrc, lyricsJson) {
  'use strict';

  const FORMATS = ['srt', 'lrc', 'json'];

  function extensionOf(name) {
    const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
  }

  function tryJson(text) {
    try {
      return JSON.parse(text.replace(/^\uFEFF/, ''));
    } catch {
      return null;
    }
  }

  function detect(text, name) {
    const source = String(text == null ? '' : text).replace(/^\uFEFF/, '');
    const head = source.trimStart().slice(0, 400);
    const ext = extensionOf(name);
    if (FORMATS.includes(ext)) {
      if (ext === 'json' && !tryJson(source)) {
        // Wrong extension: sniff the content instead.
      } else {
        return ext;
      }
    }
    if (head.startsWith('{') || head.startsWith('[')) {
      const parsed = tryJson(source);
      if (parsed != null) return 'json';
      if (head.startsWith('{')) return 'json';
      if (/^\[\d{1,3}:\d{1,2}/.test(head) || /^\[[a-zA-Z]+:/.test(head)) return 'lrc';
    }
    if (/-->/.test(head)) return 'srt';
    if (/^\[[a-zA-Z]+:/.test(head) || /^\[\d{1,3}:\d{1,2}/.test(head)) return 'lrc';
    if (head.startsWith('{')) return 'json';
    return 'srt';
  }

  function parse(text, name) {
    const format = detect(text, name);
    const source = String(text == null ? '' : text);
    if (format === 'json') {
      const raw = tryJson(source);
      if (raw == null) return { format, cues: [], warnings: [{ code: 'invalid-json', line: 1, message: 'The file is not valid JSON' }] };
      if (raw.format === 'telopmotion') return { format, cues: [], warnings: [], project: true };
      const result = lyricsJson.parse(raw);
      return { format, cues: result.cues, warnings: result.warnings };
    }
    if (format === 'lrc') {
      const result = lrc.parse(source);
      return { format, cues: result.cues, warnings: result.warnings, meta: result.meta };
    }
    const result = srt.parse(source);
    return { format, cues: result.cues, warnings: result.warnings };
  }

  function stringify(cues, format, options) {
    const kind = FORMATS.includes(format) ? format : 'srt';
    if (kind === 'lrc') return lrc.stringify(cues, options);
    if (kind === 'json') return lyricsJson.stringify(cues, options);
    return srt.stringify(cues, options);
  }

  function extension(format) {
    return FORMATS.includes(format) ? format : 'srt';
  }

  return { parse, stringify, detect, extension, formats: FORMATS.slice() };
});
