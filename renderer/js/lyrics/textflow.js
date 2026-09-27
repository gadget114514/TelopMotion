(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.textflow = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  const DEFAULTS = {
    split: 'auto',
    maxLines: { '16:9': 2, '9:16': 3 },
    minFontScale: 0.8,
    balance: true,
    readingSpeed: { ja: 8, en: 3.2, es: 3, fr: 3, ru: 2.8 },
    minPageDuration: 1.2,
    pageTransition: 'full',
    longHold: { mode: 'hold', threshold: 6, interval: 4, repeatEffect: 'same' },
    recap: {
      mode: 'off',
      minPages: 2,
      duration: 'auto',
      interval: 8,
      maxLines: 6,
      fontScale: 'auto',
      layout: 'inherit',
      transition: 'gather',
      highlight: 'none',
      style: null,
    },
  };

  const CJK_RE = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;
  const CJK_ANY_RE = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/g;
  const JA_NO_START = '、。，．・：；！？ー―〜…‥）」』】〕〉》ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ々ゝゞ';
  const JA_NO_END = '「『（【〔〈《';
  const JA_PARTICLES = ['は', 'が', 'を', 'に', 'で', 'と', 'も', 'へ', 'の', 'から', 'まで', 'より', 'けど', 'ので', 'のに', 'ても', 'たら', 'ば', 'て'];
  const JA_COUNTERS = /^(曲|分|秒|回|人|件|位|個|枚|冊|本|匹|台|歳|年|月|日|週|時間|万|千|百|億|%|％|km|kg|cm|mm|m|円|ドル|pt|px)$/;
  const EN_ARTICLES = new Set(['a', 'an', 'the', 'this', 'that', 'my', 'your', 'his', 'her', 'its', 'our', 'their']);
  const EN_CONJUNCTIONS = new Set(['and', 'but', 'or', 'so', 'because', 'although', 'while', 'when', 'where', 'which', 'that', 'who', 'if', 'than']);
  const EN_PREPOSITIONS = new Set(['to', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'about', 'into', 'over', 'after', 'before']);
  const EN_UNITS = /^(km|kg|mm|cm|m|s|min|h|hr|%|k|m|b|am|pm|mph|fps|gb|mb|kb)$/i;
  const SENTENCE_END = /[。！？!?.…]["')\]]?$/;
  const CLAUSE_END = /[、，,;；:：—–)]$/;
  const CLOSER = /[」』】〕〉》)\]}"']$/;

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function mergeDeep(base, ...patches) {
    let result = Array.isArray(base) ? [...base] : { ...base };
    for (const patch of patches) {
      if (!isPlainObject(patch)) continue;
      for (const [key, value] of Object.entries(patch)) {
        if (isPlainObject(value) && isPlainObject(result[key])) result[key] = mergeDeep(result[key], value);
        else result[key] = value;
      }
    }
    return result;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function graphemes(text, lang) {
    const segmenter = segmenterFor(lang || 'en', 'grapheme');
    if (segmenter) return [...segmenter.segment(String(text))].map((entry) => entry.segment);
    return Array.from(String(text));
  }

  const segmenterCache = new Map();

  function segmenterFor(lang, granularity) {
    if (typeof Intl === 'undefined' || !Intl.Segmenter) return null;
    const key = `${lang}|${granularity}`;
    if (!segmenterCache.has(key)) segmenterCache.set(key, new Intl.Segmenter(lang, { granularity }));
    return segmenterCache.get(key);
  }

  function graphemeCount(text) {
    return graphemes(text, 'en').length;
  }

  function detectLang(text, fallback) {
    const stripped = String(text || '').replace(/\s/g, '');
    if (!stripped) return fallback || 'en';
    const cjk = (stripped.match(CJK_ANY_RE) || []).length;
    if (cjk / stripped.length >= 0.2) return 'ja';
    if (fallback === 'ja') return 'ja';
    if (['es', 'fr', 'ru'].includes(fallback)) return fallback;
    if (/[\u0400-\u04ff]/.test(stripped)) return 'ru';
    return fallback || 'en';
  }

  function normalizeText(text) {
    return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  }

  function parseEscapes(text) {
    const blocks = [[[]]];
    const pushLine = () => {
      blocks[blocks.length - 1].push([]);
    };
    const currentLines = () => blocks[blocks.length - 1];
    const currentLine = () => currentLines()[currentLines().length - 1];
    const source = String(text == null ? '' : text);
    for (let i = 0; i < source.length; i += 1) {
      const char = source[i];
      if (char === '\r') continue;
      if (char === '\n') {
        pushLine();
        continue;
      }
      if (char === '\\' && source[i + 1] === 'P') {
        pushLine();
        blocks.push([]);
        pushLine();
        i += 1;
        continue;
      }
      if (char === '\\' && source[i + 1] === 'N') {
        pushLine();
        i += 1;
        continue;
      }
      if (char === '\\' && source[i + 1] === 'h') {
        currentLine().push('\u00a0');
        i += 1;
        continue;
      }
      currentLine().push(char);
    }
    const normalized = blocks
      .map((lines) => lines.map((parts) => parts.join('')).filter((line) => line.trim().length > 0))
      .filter((lines) => lines.length > 0);
    return normalized.length ? normalized : [['']];
  }

  function readingTime(text, lang, speeds) {
    const speed = (speeds || DEFAULTS.readingSpeed)[lang] || DEFAULTS.readingSpeed.en;
    if (lang === 'ja') return graphemeCount(text) / speed;
    const words = String(text || '').split(/\s+/).filter(Boolean).length;
    return words / speed;
  }

  // ---------------------------------------------------------------------------
  // Measurement
  // ---------------------------------------------------------------------------

  function estimateWidth(text, size) {
    let width = 0;
    for (const character of Array.from(String(text))) {
      width += (CJK_RE.test(character) ? 1 : 0.55) * size;
    }
    return width;
  }

  function makeMeasurer(options) {
    let raw = null;
    if (options && typeof options.measure === 'function') raw = options.measure;
    else if (typeof SA !== 'undefined' && SA.lyricsFont && typeof SA.lyricsFont.measureLine === 'function') {
      const fonts = typeof SA.lyricsFont.getActive === 'function' ? SA.lyricsFont.getActive() : [];
      if (fonts && fonts.length) {
        const style = (options && options.style) || {};
        const lang = (options && options.lang) || 'en';
        raw = (text, size) => SA.lyricsFont.measureLine(text, style, fonts, { size, lang });
      }
    }
    if (!raw) raw = estimateWidth;
    const memo = new Map();
    return (text, size) => {
      const key = `${Math.round(size * 100)}|${text}`;
      if (memo.has(key)) return memo.get(key);
      const value = raw(text, size);
      if (memo.size < 20000) memo.set(key, value);
      return value;
    };
  }

  // ---------------------------------------------------------------------------
  // Tokenization and break penalties
  // ---------------------------------------------------------------------------

  function segmentWords(text, lang) {
    const segmenter = segmenterFor(lang || 'en', 'word');
    if (segmenter) return [...segmenter.segment(String(text))].map((entry) => entry.segment);
    return String(text).split(/(\s+)/).filter(Boolean);
  }

  function charClass(character) {
    if (/[ぁ-んー]/.test(character)) return 'kana';
    if (/[ァ-ヶー]/.test(character)) return 'katakana';
    if (CJK_RE.test(character)) return 'cjk';
    if (/[A-Za-z]/.test(character)) return 'latin';
    if (/[0-9]/.test(character)) return 'digit';
    return 'other';
  }

  function jaPenalty(previous, next) {
    if (!previous || !next) return 4;
    const last = previous[previous.length - 1];
    const first = next[0];
    if (JA_NO_START.includes(first)) return Infinity;
    if (JA_NO_END.includes(last)) return Infinity;
    if (/\d$/.test(previous) && JA_COUNTERS.test(next)) return Infinity;
    if (SENTENCE_END.test(last)) return 0.1;
    if (/[、，,]$/.test(last)) return 0.4;
    if (/[」』】〕〉》)]$/.test(last)) return 0.8;
    if (JA_PARTICLES.some((particle) => previous.endsWith(particle))) return 1.5;
    if (charClass(last) !== charClass(first)) return 2.5;
    return 4;
  }

  function enPenalty(previous, next) {
    if (!previous || !next) return 4;
    if (/^[.,;:!?…%)\]}"']/.test(next)) return Infinity;
    const lastWord = previous.toLowerCase().replace(/[^a-z0-9'']+$/g, '');
    const nextWord = next.toLowerCase().replace(/^[^a-z0-9'']+/g, '');
    if (EN_ARTICLES.has(lastWord)) return Infinity;
    if (/\d$/.test(previous) && EN_UNITS.test(next)) return Infinity;
    if (/-$/.test(previous) || /^-/.test(next)) return Infinity;
    if (/[.!?…]["')\]]?$/.test(previous)) return 0.1;
    if (/[,;:—–]["')\]]?$/.test(previous)) return 0.6;
    if (EN_CONJUNCTIONS.has(nextWord)) return 1.5;
    if (EN_PREPOSITIONS.has(nextWord)) return 2.5;
    if (/[)\]"']$/.test(previous)) return 0.8;
    return 4;
  }

  function buildUnits(blocks, lang) {
    const units = [];
    blocks.forEach((lines, blockIndex) => {
      lines.forEach((line, lineIndex) => {
        const segments = segmentWords(line, lang);
        let first = true;
        let pendingSpace = false;
        let previousText = null;
        for (const segment of segments) {
          if (!segment) continue;
          if (/^\s+$/.test(segment)) {
            pendingSpace = true;
            continue;
          }
          const previous = units.length ? units[units.length - 1] : null;
          const spaceBefore = !first && pendingSpace;
          const penalty = previous ? (lang === 'ja' ? jaPenalty(previous.text, segment) : enPenalty(previous.text, segment)) : 0;
          units.push({
            text: segment,
            spaceBefore,
            hardBreak: first && lineIndex > 0,
            hardPage: first && lineIndex === 0 && blockIndex > 0,
            penalty: previous ? penalty : 0,
          });
          first = false;
          pendingSpace = false;
        }
      });
    });
    return units;
  }

  function makeWidths(units, measurer, size) {
    const widths = units.map((unit) => measurer(unit.text, size));
    const spaceWidth = measurer(' ', size);
    return { widths, spaceWidth };
  }

  function lineText(lineUnits) {
    let text = '';
    for (let i = 0; i < lineUnits.length; i += 1) {
      const unit = lineUnits[i];
      if (i > 0 && unit.spaceBefore) text += ' ';
      text += unit.text;
    }
    return text;
  }

  function lineWidth(lineUnits, widths, spaceWidth) {
    let width = 0;
    for (let i = 0; i < lineUnits.length; i += 1) {
      const index = lineUnits[i].index;
      width += widths[index];
      if (i > 0 && lineUnits[i].spaceBefore) width += spaceWidth;
    }
    return width;
  }

  // ---------------------------------------------------------------------------
  // Line and page breaking
  // ---------------------------------------------------------------------------

  function greedyLines(units, measurer, size, maxWidth, maxLines) {
    const { widths, spaceWidth } = makeWidths(units, measurer, size);
    const lines = [];
    let line = [];
    let width = 0;
    let overflow = false;
    for (let i = 0; i < units.length; i += 1) {
      const unit = units[i];
      const added = widths[i] + (line.length && unit.spaceBefore ? spaceWidth : 0);
      if (line.length && width + added > maxWidth) {
        const cannotBreak = unit.penalty === Infinity && !unit.hardBreak && !unit.hardPage;
        if (!cannotBreak) {
          if (width > maxWidth + 1e-6) overflow = true;
          lines.push(line);
          if (maxLines && lines.length > maxLines) return { lines, overflow: true, widths, spaceWidth };
          line = [];
          width = 0;
        }
      }
      line.push({ ...unit, index: i });
      width += widths[i] + (line.length > 1 && unit.spaceBefore ? spaceWidth : 0);
    }
    if (line.length) {
      if (width > maxWidth + 1e-6) overflow = true;
      lines.push(line);
    }
    if (maxLines && lines.length > maxLines) overflow = true;
    return { lines, overflow, widths, spaceWidth };
  }

  function dpLines(units, measurer, size, maxWidth, options) {
    const { widths, spaceWidth } = makeWidths(units, measurer, size);
    const count = units.length;
    if (!count) return [];
    const balance = options.balance !== false;
    const best = new Array(count + 1).fill(Infinity);
    const previous = new Array(count + 1).fill(-1);
    best[0] = 0;
    for (let start = 0; start < count; start += 1) {
      if (best[start] === Infinity) continue;
      if (start > 0 && units[start].penalty === Infinity && !units[start].hardBreak && !units[start].hardPage) continue;
      let width = 0;
      for (let end = start; end < count; end += 1) {
        const unit = units[end];
        if (end > start) {
          if (unit.hardBreak || unit.hardPage) break;
          width += unit.spaceBefore ? spaceWidth : 0;
        }
        width += widths[end];
        if (width > maxWidth && end > start) break;
        const next = end + 1;
        if (next < count && units[next].penalty === Infinity && !units[next].hardBreak && !units[next].hardPage) continue;
        let cost = best[start];
        const slack = Math.max(0, maxWidth - width);
        if (balance) cost += (slack / maxWidth) * (slack / maxWidth) * 60;
        if (start > 0) cost += units[start].penalty;
        if (end === start) cost += 8;
        if (SENTENCE_END.test(unit.text) || /[.!?…]["')\]]?$/.test(unit.text)) cost -= 25;
        cost -= (end - start) * 0.001;
        if (cost < best[next]) {
          best[next] = cost;
          previous[next] = start;
        }
      }
    }
    if (best[count] === Infinity) {
      // No feasible break (a single unit wider than maxWidth): one line per unit.
      return units.map((unit, index) => [{ ...unit, index }]);
    }
    const lines = [];
    let cursor = count;
    while (cursor > 0) {
      const start = previous[cursor];
      if (start < 0) break;
      const line = [];
      for (let i = start; i < cursor; i += 1) line.push({ ...units[i], index: i });
      lines.unshift(line);
      cursor = start;
    }
    return lines;
  }

  function splitBlocks(units) {
    const blocks = [];
    let block = [];
    for (const unit of units) {
      if (unit.hardPage && block.length) {
        blocks.push(block);
        block = [];
      }
      block.push(unit);
    }
    if (block.length) blocks.push(block);
    return blocks;
  }

  function pageBreakCost(lineUnits) {
    const text = lineText(lineUnits);
    if (SENTENCE_END.test(text)) return 0.3;
    if (CLAUSE_END.test(text)) return 1.5;
    return 4;
  }

  function dpPages(lines, maxLines) {
    const count = lines.length;
    const best = new Array(count + 1).fill(Infinity);
    const previous = new Array(count + 1).fill(-1);
    best[0] = 0;
    for (let start = 0; start < count; start += 1) {
      if (best[start] === Infinity) continue;
      for (let end = start + 1; end <= Math.min(count, start + maxLines); end += 1) {
        let cost = best[start];
        if (start > 0) cost += pageBreakCost(lines[start - 1]);
        cost += (maxLines - (end - start)) * 0.05;
        if (cost < best[end]) {
          best[end] = cost;
          previous[end] = start;
        }
      }
    }
    if (best[count] === Infinity) return [lines];
    const pages = [];
    let cursor = count;
    while (cursor > 0) {
      const start = previous[cursor];
      if (start < 0) break;
      pages.unshift(lines.slice(start, cursor));
      cursor = start;
    }
    return pages;
  }

  function fitCheck(units, measurer, size, maxWidth, maxLines, minScale) {
    for (let scale = 1; scale >= minScale - 1e-9; scale -= 0.02) {
      const attempt = greedyLines(units, measurer, size * scale, maxWidth, maxLines);
      if (!attempt.overflow) return { scale: Math.max(minScale, scale), lines: attempt.lines };
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Flow
  // ---------------------------------------------------------------------------

  function resolveSettings(settings, aspect) {
    const merged = mergeDeep(DEFAULTS, settings || {});
    const maxLines = merged.maxLines && merged.maxLines[aspect] != null ? merged.maxLines[aspect] : merged.maxLines && merged.maxLines['16:9'];
    return { ...merged, maxLines: Math.max(1, maxLines || 2) };
  }

  function timePages(entries, budget, minDuration) {
    const weights = entries.map((entry) => entry.reading + 0.3);
    const total = weights.reduce((sum, value) => sum + value, 0) || 1;
    let durations = weights.map((weight) => (budget * weight) / total);
    durations = durations.map((duration) => Math.max(minDuration, duration));
    let sum = durations.reduce((acc, value) => acc + value, 0);
    let compressed = false;
    if (sum > budget + 1e-6) {
      const factor = budget / sum;
      durations = durations.map((duration) => duration * factor);
      compressed = durations.some((duration) => duration < minDuration - 1e-6);
    }
    return { durations, compressed };
  }

  function flow(input, options) {
    const source = String((input && input.text) || '');
    const start = Number((input && input.start) || 0);
    const end = Number((input && input.end) || start + 1);
    const cueDuration = Math.max(0.2, end - start);
    const opts = options || {};
    const aspect = (input && input.aspect) || '16:9';
    const settings = resolveSettings(opts.settings, aspect);
    const lang = detectLang(source, (input && input.lang) || opts.lang || 'en');
    const style = opts.style || {};
    const size = style.size || 96;
    const maxWidth = opts.maxWidth != null ? opts.maxWidth : Math.max(1, (style.maxWidth > 0 && style.maxWidth <= 1 ? style.maxWidth : 0.9) * ((opts.frame && opts.frame.width) || 1920));
    const measurer = makeMeasurer({ ...opts, style, lang });
    const warnings = [];

    const blocks = parseEscapes(source);
    const units = buildUnits(blocks, lang);
    const textBlocks = splitBlocks(units);

    const pages = [];
    const fullText = blocks.map((lines) => lines.join(' ')).join(' ');

    function pushPage(kind, lines, scale) {
      const text = lines.map((line) => lineText(line)).join('\n');
      pages.push({
        kind,
        lines: lines.map((line) => lineText(line)),
        text,
        fontScale: scale == null ? 1 : scale,
        reading: readingTime(text, lang, settings.readingSpeed),
      });
    }

    if (!units.length) {
      return {
        lang,
        fontScale: 1,
        pages: [],
        repeats: [],
        recap: null,
        warnings: [{ code: 'empty', message: 'No text to flow' }],
        lines: [],
      };
    }

    const forcedPages = textBlocks.length > 1;
    let single = null;
    if (!forcedPages) {
      single = fitCheck(units, measurer, size, maxWidth, settings.maxLines, settings.split === 'off' ? 0.05 : settings.minFontScale);
    }

    if (!forcedPages && single && settings.split !== 'off') {
      const balanced = dpLines(units, measurer, size * single.scale, maxWidth, settings);
      if (balanced.length && balanced.length <= settings.maxLines) single.lines = balanced;
      pushPage('single', single.lines, single.scale);
    } else if (settings.split === 'off' && !forcedPages) {
      const scale = Math.max(0.05, settings.minFontScale);
      const attempt = greedyLines(units, measurer, size * scale, maxWidth, 0);
      pushPage('single', attempt.lines, scale);
      warnings.push({ code: 'overflow', message: 'Text overflows the safe area' });
    } else {
      let scale = settings.minFontScale;
      const widest = units.reduce((max, unit) => Math.max(max, measurer(unit.text, size)), 0);
      if (widest * scale > maxWidth) {
        scale = Math.max(0.3, maxWidth / widest);
        warnings.push({ code: 'overflow', message: 'A word is wider than the safe area' });
      }
      textBlocks.forEach((block, blockIndex) => {
        const lines = dpLines(block, measurer, size * scale, maxWidth, settings);
        const groups = dpPages(lines, settings.maxLines);
        groups.forEach((group) => pushPage('page', group, scale));
        if (!lines.length) warnings.push({ code: 'empty-block', message: `Block ${blockIndex + 1} has no text` });
      });
      if (!forcedPages && pages.length === 1) pages[0].kind = 'single';
    }

    // --- long hold -----------------------------------------------------------
    const recapSettings = settings.recap;
    const basePages = pages.filter((page) => ["single", "page"].includes(page.kind));
    const repeats = [];
    let recap = null;
    let budget = cueDuration;
    let recapDuration = 0;
    const naturalTotal = basePages.reduce((sum, page) => sum + page.reading + 0.3, 0);
    const holdMode = settings.longHold.mode || 'hold';

    if (recapSettings.mode && recapSettings.mode !== 'off' && basePages.length >= (recapSettings.minPages || 2)) {
      const fullLines = dpLines(units, measurer, size * settings.minFontScale, maxWidth, settings);
      const recapText = fullLines.map((line) => lineText(line)).join('\n');
      const reading = readingTime(recapText, lang, settings.readingSpeed);
      recapDuration = recapSettings.duration === 'auto' || recapSettings.duration == null ? Math.max(1.5, reading * 0.5) : Number(recapSettings.duration);
      budget = cueDuration - recapDuration;
      const minBudget = basePages.length * settings.minPageDuration;
      if (budget < minBudget) {
        recapDuration = 1;
        budget = cueDuration - recapDuration;
        if (budget < minBudget) {
          recapDuration = 0;
          budget = cueDuration;
          warnings.push({ code: 'recap-skipped', message: 'The cue is too short for a recap' });
        } else {
          warnings.push({ code: 'recap-shortened', message: 'The recap was shortened to fit the cue' });
        }
      }
      if (recapDuration > 0) {
        let recapScale = 1;
        if (recapSettings.fontScale === 'auto' || recapSettings.fontScale == null) {
          const available = ((opts.frame && opts.frame.height) || 1080) * 0.8;
          const lineHeight = (style.lineHeight || 1.2) * size * settings.minFontScale;
          const needed = fullLines.length * lineHeight;
          recapScale = Math.max(0.45, Math.min(1, available / Math.max(needed, 1)));
        } else {
          recapScale = Number(recapSettings.fontScale) || 1;
        }
        recap = {
          kind: 'recap',
          lines: fullLines.map((line) => lineText(line)),
          text: recapText,
          fontScale: recapScale,
          reading,
          from: start + cueDuration - recapDuration,
          to: end,
          transition: recapSettings.transition || 'gather',
          highlight: recapSettings.highlight || 'none',
        };
      }
    }

    // --- timing --------------------------------------------------------------
    const naturalHold = budget - naturalTotal;
    const useNatural = holdMode !== 'hold' && naturalHold > (settings.longHold.threshold || 6);
    let cursor = start;
    if (useNatural) {
      basePages.forEach((page) => {
        const duration = Math.max(settings.minPageDuration, page.reading + 0.3);
        page.from = cursor;
        page.to = cursor + duration;
        cursor = page.to;
      });
      if (cursor > start + budget) {
        // Compress the natural timing into the budget.
        const factor = budget / (cursor - start);
        let tick = start;
        basePages.forEach((page) => {
          const duration = (page.to - page.from) * factor;
          page.from = tick;
          page.to = tick + duration;
          tick = page.to;
        });
        cursor = tick;
      }
    } else {
      const timing = timePages(basePages, budget, settings.minPageDuration);
      if (timing.compressed) warnings.push({ code: 'tooFast', message: 'The cue is too fast to read' });
      basePages.forEach((page, index) => {
        page.from = cursor;
        page.to = cursor + timing.durations[index];
        cursor = page.to;
      });
    }

    // --- repeats -------------------------------------------------------------
    const holdStart = cursor;
    const holdEnd = start + budget;
    if (holdMode === 'repeat' && holdEnd - holdStart > (settings.longHold.threshold || 6)) {
      const interval = Math.max(1, settings.longHold.interval || 4);
      let cycleStart = holdStart + interval;
      let index = 0;
      while (cycleStart + 0.2 < holdEnd) {
        const cycleEnd = Math.min(holdEnd, cycleStart + interval);
        const natural = basePages.reduce((sum, page) => sum + page.reading + 0.3, 0) || 1;
        const factor = (cycleEnd - cycleStart) / natural;
        let tick = cycleStart;
        for (const page of basePages) {
          const duration = Math.max(0.2, (page.reading + 0.3) * factor);
          pages.push({
            kind: 'repeat',
            lines: [...page.lines],
            text: page.text,
            fontScale: page.fontScale,
            reading: page.reading,
            from: tick,
            to: Math.min(cycleEnd, tick + duration),
            cycle: index,
          });
          tick += duration;
        }
        repeats.push({ t: cycleStart, kind: 'repeat', cycle: index });
        index += 1;
        cycleStart += interval;
        if (index > 500) break;
      }
    } else if (holdMode === 'pulse' && holdEnd - holdStart > (settings.longHold.threshold || 6)) {
      const interval = Math.max(1, settings.longHold.interval || 4);
      for (let t = holdStart + interval * 0.5; t + 0.6 <= holdEnd; t += interval) {
        pages.push({ kind: 'emphasis', lines: [], text: '', fontScale: 1, reading: 0, from: t, to: Math.min(holdEnd, t + 0.6), cycle: repeats.length });
        repeats.push({ t, kind: 'pulse', cycle: repeats.length });
      }
    }

    if (recap) {
      recap.from = Math.max(holdStart, start + budget);
      recap.to = end;
      pages.push(recap);
    }

    pages.sort((a, b) => a.from - b.from);
    pages.forEach((page, index) => {
      page.index = index;
      page.from = clamp(page.from, start, end);
      page.to = clamp(page.to, page.from + 0.05, end);
    });

    const textPage = pages.find((page) => page.lines && page.lines.length);
    const scale = textPage ? textPage.fontScale : 1;
    return {
      lang,
      fontScale: single ? single.scale : scale,
      pages,
      repeats,
      recap,
      warnings,
      lines: textPage ? [...textPage.lines] : [],
    };
  }

  // ---------------------------------------------------------------------------
  // Restructure (flow -> beats, with pinned beats kept)
  // ---------------------------------------------------------------------------

  function beatId(cueId, kind, index) {
    return `${cueId}:${kind}${index}`;
  }

  function restructure(cue, options) {
    const result = flow(
      {
        text: cue.text || '',
        start: Number(cue.start) || 0,
        end: Number(cue.end) || 0,
        lang: options && options.lang,
        aspect: options && options.aspect,
      },
      options
    );
    const counters = { single: 0, page: 0, repeat: 0, emphasis: 0, recap: 0 };
    const beats = [];
    for (const page of result.pages) {
      if (page.kind === 'recap') {
        beats.push({
          id: beatId(cue.id, 'recap', 0),
          cueId: cue.id,
          kind: 'recap',
          index: 0,
          start: page.from,
          end: page.to,
          text: page.text,
          lines: page.lines,
          fontScale: page.fontScale,
          transition: page.transition || 'gather',
          highlight: page.highlight || 'none',
          pinned: false,
        });
        continue;
      }
      const kind = page.kind;
      const index = kind === 'page' ? (counters.page += 1) : counters[kind]++;
      beats.push({
        id: beatId(cue.id, kind, index),
        cueId: cue.id,
        kind,
        index,
        start: page.from,
        end: page.to,
        text: page.text,
        lines: page.lines,
        fontScale: page.fontScale,
        cycle: page.cycle == null ? undefined : page.cycle,
        pinned: false,
      });
    }
    return { beats, flow: result, warnings: result.warnings };
  }

  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd - 1e-4 && aEnd > bStart + 1e-4;
  }

  function mergePinned(previous, fresh, cue) {
    const pinned = (previous || []).filter((beat) => beat && beat.pinned);
    const kept = [];
    const orphans = [];
    const cueText = normalizeText(cue.text);
    for (const beat of pinned) {
      const text = normalizeText(beat.text);
      if (text && cueText.includes(text)) kept.push({ ...beat });
      else orphans.push({ ...beat });
    }
    let remaining = fresh.filter((beat) => {
      if (beat.kind === 'emphasis' || beat.kind === 'repeat') return true;
      return !kept.some((pinnedBeat) => normalizeText(pinnedBeat.text) === normalizeText(beat.text));
    });
    remaining = remaining.filter((beat) => !kept.some((pinnedBeat) => overlaps(beat.start, beat.end, pinnedBeat.start, pinnedBeat.end)));
    for (const beat of kept) {
      beat.start = clamp(beat.start, cue.start, cue.end);
      beat.end = clamp(beat.end, beat.start + 0.2, cue.end);
    }
    return {
      beats: [...kept, ...remaining].sort((a, b) => a.start - b.start || a.end - b.end),
      orphans,
    };
  }

  function cueOptions(project, cue, extra) {
    const opts = extra || {};
    let textStyle = opts.style;
    if (!textStyle && typeof SA !== 'undefined' && SA.project && typeof SA.project.resolveStyle === 'function') {
      const resolved = SA.project.resolveStyle(project, `cue:${cue.id}`);
      textStyle = resolved && resolved.text;
    }
    const settings = mergeDeep(DEFAULTS, project.textFlow || {}, cue.textFlow || {});
    return {
      style: textStyle || { size: 96, lineHeight: 1.2, maxWidth: 0.9 },
      frame: { width: (project.output && project.output.width) || 1920, height: (project.output && project.output.height) || 1080 },
      aspect: (project.output && project.output.aspect) || '16:9',
      lang: (project.meta && project.meta.lang) || opts.lang || 'en',
      settings,
      measure: opts.measure,
    };
  }

  function apply(project, options) {
    if (!project || !project.script) return null;
    const opts = options || {};
    project.beats = project.beats || {};
    project.beatWarnings = {};
    project.orphanBeats = project.orphanBeats || {};
    const warnings = {};
    for (const cue of project.script.cues || []) {
      const resolved = cueOptions(project, cue, opts);
      const result = restructure(cue, resolved);
      const merged = mergePinned(project.beats[cue.id], result.beats, cue);
      project.beats[cue.id] = merged.beats;
      if (merged.orphans.length) project.orphanBeats[cue.id] = merged.orphans;
      if (result.warnings.length) warnings[cue.id] = result.warnings;
    }
    project.beatWarnings = warnings;
    return true;
  }

  const OVERRIDE_KINDS = ['single', 'page', 'repeat', 'emphasis', 'recap'];

  function kindForBeatId(id) {
    const suffix = String(id || '').split(':').pop() || '';
    for (const kind of OVERRIDE_KINDS) {
      if (suffix.startsWith(kind)) return kind;
    }
    return 'single';
  }

  // Mapping used by the recap "gather" transition: each grapheme of the full
  // text is matched, in order, to a grapheme of the previous text, or to null
  // ("comes in") when there is no match left.
  function gatherPlan(fullText, previousText) {
    const full = graphemes(fullText, 'en');
    const previous = graphemes(previousText || '', 'en');
    const used = new Array(previous.length).fill(false);
    const sources = [];
    let cursor = 0;
    for (const character of full) {
      let match = null;
      for (let i = cursor; i < previous.length; i += 1) {
        if (!used[i] && previous[i] === character) {
          match = i;
          used[i] = true;
          cursor = i + 1;
          break;
        }
      }
      sources.push(match);
    }
    return { sources, previousCount: previous.length };
  }

  return {
    DEFAULTS,
    detectLang,
    parseEscapes,
    readingTime,
    resolveSettings,
    estimateWidth,
    makeMeasurer,
    buildUnits,
    greedyLines,
    dpLines,
    dpPages,
    flow,
    restructure,
    mergePinned,
    cueOptions,
    apply,
    kindForBeatId,
    gatherPlan,
    normalizeText,
    lineText,
  };
});
