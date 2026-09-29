(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    let tiny = null;
    try {
      tiny = require('../../vendor/tiny-segmenter.js');
    } catch {
      tiny = null;
    }
    module.exports = factory(tiny);
  } else {
    root.SA = root.SA || {};
    root.SA.textflow = factory(root.TinySegmenter || null);
  }
})(typeof self !== 'undefined' ? self : this, function (TinySegmenter) {
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
    chunk: 'page',
    maxChunkDuration: 1,
    minChunkDuration: 0.2,
    targetChunkDuration: 0,
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

  // fill sizing: instead of shrinking until the text fits, the font size is
  // back-solved from the share of the frame the text block should cover
  const FILL_DEFAULTS = {
    coverage: { '16:9': 0.14, '9:16': 0.2 },
    maxWidth: 0.94,
    maxHeight: 0.6,
    bleed: 0.04,
    minSize: 0.045,
    maxSize: 0.32,
  };
  const FILL_REF_SIZE = 100; // line widths scale with the size, so measure once at 100

  function fillOptions(style, frame, aspect) {
    const s = style || {};
    const num = (value, fallback) => (value == null || value === '' || !Number.isFinite(Number(value)) ? fallback : Number(value));
    const vertical = s.direction === 'vertical';
    const short = Math.min(frame.width, frame.height);
    return {
      coverage: clamp(num(s.fillCoverage, FILL_DEFAULTS.coverage[aspect] || FILL_DEFAULTS.coverage['16:9']), 0.01, 0.8),
      maxWidth: clamp(num(s.fillMaxWidth, FILL_DEFAULTS.maxWidth), 0.2, 1.2),
      maxHeight: clamp(num(s.fillMaxHeight, FILL_DEFAULTS.maxHeight), 0.1, 1),
      bleed: clamp(num(s.fillBleed, FILL_DEFAULTS.bleed), 0, 0.5),
      minSize: num(s.fillMinSize, FILL_DEFAULTS.minSize) * short,
      maxSize: num(s.fillMaxSize, FILL_DEFAULTS.maxSize) * short,
      lineHeight: s.lineHeight || 1.2,
      // vertical writing turns the line direction along the frame height
      frameW: vertical ? frame.height : frame.width,
      frameH: vertical ? frame.width : frame.height,
      area: frame.width * frame.height,
      short,
      consistency: s.fillConsistency === 'cue' ? 'cue' : 'page',
    };
  }

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
      const active = typeof SA.lyricsFont.getActive === 'function' ? SA.lyricsFont.getActive() : [];
      const style = (options && options.style) || {};
      const fonts = active && active.length && typeof SA.lyricsFont.orderFonts === 'function' ? SA.lyricsFont.orderFonts(active, style.fontId, style.weight) : active;
      if (fonts && fonts.length) {
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

  // TinySegmenter instance (Japanese). Falls back to Intl.Segmenter when the
  // vendored tokenizer is missing.
  let tinySegmenter = null;

  function segmentJa(text) {
    if (!TinySegmenter) return null;
    try {
      if (!tinySegmenter) tinySegmenter = new TinySegmenter();
      const segments = tinySegmenter.segment(String(text));
      if (Array.isArray(segments) && segments.length) return segments;
    } catch {
      /* fall through to Intl */
    }
    return null;
  }

  function segmentWords(text, lang) {
    if (lang === 'ja') {
      const tiny = segmentJa(text);
      if (tiny) return tiny;
    }
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

  function fitCheck(units, measurer, size, maxWidth, maxLines, minScale, limits) {
    // `limits` may carry the frame's height budget: the block must stay inside
    // `maxHeight` px even when every line fits the width (the old check only
    // looked at the line count and the width).
    const maxHeight = limits && limits.maxHeight > 0 ? limits.maxHeight : Infinity;
    const lineHeight = (limits && limits.lineHeight) || 1.2;
    for (let scale = 1; scale >= minScale - 1e-9; scale -= 0.02) {
      const attempt = greedyLines(units, measurer, size * scale, maxWidth, maxLines);
      if (attempt.overflow) continue;
      if (attempt.lines.length * lineHeight * size * scale > maxHeight + 1e-6) continue;
      return { scale: Math.max(minScale, scale), lines: attempt.lines };
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Fill sizing (frame coverage -> font size)
  // ---------------------------------------------------------------------------

  // lineEms holds the width of every line in em (width at FILL_REF_SIZE / REF).
  // The returned size is in px.
  function sizeForLines(lineEms, fo) {
    const widest = Math.max(1e-6, ...lineEms);
    const total = Math.max(1e-6, lineEms.reduce((sum, value) => sum + value, 0));
    const count = lineEms.length;
    // sum(line width * s) * line height * s = coverage * frame area
    const byArea = Math.sqrt((fo.coverage * fo.area) / (total * fo.lineHeight));
    const byWidth = (fo.maxWidth * fo.frameW) / widest;
    const byHeight = (fo.maxHeight * fo.frameH) / (count * fo.lineHeight);
    const raw = Math.min(byArea, byWidth, byHeight);
    const size = clamp(raw, fo.minSize, fo.maxSize);
    // when the minimum size had to be used, allow a little bleed past the frame
    const fits =
      size <= raw + 1e-6 ||
      (widest * size <= (1 + fo.bleed) * fo.frameW + 1e-6 && count * fo.lineHeight * size <= fo.frameH + 1e-6);
    const bleed = widest * size > fo.frameW + 1e-6;
    return { size, fits, bleed };
  }

  // The smallest max width at which greedy wrapping still uses at most `lines`
  // lines. Greedy is optimal for minimizing the widest line under a line cap.
  function narrowestWidth(units, measurer, size, lines) {
    const { widths, spaceWidth } = makeWidths(units, measurer, size);
    let lo = Math.max(...widths);
    let hi = widths.reduce((sum, value) => sum + value, 0) + spaceWidth * units.length + 1;
    if (greedyLines(units, measurer, size, hi, lines).overflow) return null; // hard breaks alone exceed `lines`
    for (let i = 0; i < 24 && hi - lo > 0.5; i += 1) {
      const mid = (lo + hi) / 2;
      if (greedyLines(units, measurer, size, mid, lines).overflow) lo = mid;
      else hi = mid;
    }
    return hi;
  }

  // Tries every line count up to maxLines and keeps the wrap whose resulting
  // font size reads best (large text wins; bad breaks, extra lines and bleed
  // are discounted).
  function fillFit(units, measurer, baseSize, fo, maxLines, balanceSettings) {
    const ref = FILL_REF_SIZE;
    const { widths, spaceWidth } = makeWidths(units, measurer, ref);
    const limit = Math.max(1, Math.min(maxLines, units.length));
    let best = null;
    for (let k = 1; k <= limit; k += 1) {
      const narrow = narrowestWidth(units, measurer, ref, k);
      if (narrow == null) continue;
      let lines = dpLines(units, measurer, ref, narrow * 1.03, { ...balanceSettings, balance: true });
      if (!lines.length || lines.length > k) lines = greedyLines(units, measurer, ref, narrow, k).lines;
      const ems = lines.map((line) => lineWidth(line, widths, spaceWidth) / ref);
      const fit = sizeForLines(ems, fo);
      let penalty = 0;
      for (let i = 1; i < lines.length; i += 1) {
        const head = lines[i][0];
        if (!head.hardBreak && Number.isFinite(head.penalty)) penalty += head.penalty;
      }
      const score = fit.size / fo.short - 0.004 * penalty - 0.012 * (lines.length - 1) - (fit.bleed ? 0.02 : 0);
      const candidate = { ...fit, lines, scale: fit.size / baseSize, score };
      if (!best || (candidate.fits && !best.fits) || (candidate.fits === best.fits && candidate.score > best.score)) best = candidate;
    }
    return best; // null only when hard breaks exceed maxLines
  }

  // Sizes already-decided lines (a beat the user edited by hand) without
  // re-wrapping them. Public so the Studio can resize a pinned beat.
  function fitLinesScale(lines, options) {
    const opts = options || {};
    const style = opts.style || {};
    const frame = { width: (opts.frame && opts.frame.width) || 1920, height: (opts.frame && opts.frame.height) || 1080 };
    const fo = fillOptions(style, frame, opts.aspect || '16:9');
    const measurer = makeMeasurer({ ...opts, style, lang: opts.lang || 'en' });
    const list = (lines || []).filter((line) => String(line).trim());
    if (!list.length) return { scale: 1, bleed: false };
    const fit = sizeForLines(list.map((line) => measurer(line, FILL_REF_SIZE) / FILL_REF_SIZE), fo);
    const size = style.size || 96;
    // never let more than the allowed block height through: the wrap stays as
    // the user (or the beat) wrote it, the size shrinks instead
    const rawMax = opts.maxHeight != null ? opts.maxHeight : style.maxHeight;
    const maxHeightRatio = rawMax == null || rawMax === '' || !Number.isFinite(Number(rawMax)) ? 0.8 : Number(rawMax);
    const maxHeightPx = Math.max(0.05, maxHeightRatio || 0.8) * (style.direction === 'vertical' ? frame.width : frame.height);
    const lineHeight = style.lineHeight || 1.2;
    const heightScale = maxHeightPx / Math.max(1e-6, list.length * lineHeight * size);
    return { scale: Math.min(fit.size / size, Math.max(0.05, heightScale)), bleed: fit.bleed };
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

  // ---------------------------------------------------------------------------
  // Telop chunks (one line, or one phrase, per beat)
  // ---------------------------------------------------------------------------

  // Splits a line into phrase-like groups. A boundary is used where breaking is
  // cheap for the language (after a sentence, a comma or a Japanese particle,
  // before a conjunction). Returns groups of units.
  function phraseGroups(units) {
    const groups = [];
    let current = [];
    for (let i = 0; i < units.length; i += 1) {
      current.push(units[i]);
      const next = units[i + 1];
      if (!next) break;
      if (next.hardBreak || next.hardPage) {
        groups.push(current);
        current = [];
        continue;
      }
      if (next.penalty !== Infinity && next.penalty <= 1.5) {
        groups.push(current);
        current = [];
      }
    }
    if (current.length) groups.push(current);
    return groups;
  }

  // Splits a line into word-like groups, keeping Japanese particles and
  // trailing punctuation with the word before them.
  function wordGroups(units, lang) {
    const groups = [];
    for (const unit of units) {
      const previous = groups[groups.length - 1];
      const particle = lang === 'ja' && (JA_PARTICLES.includes(unit.text) || /^[、。，．・：；！？）」』】〕〉》]/.test(unit.text));
      const punctuation = lang !== 'ja' && /^[.,;:!?…%)\]}"']/.test(unit.text);
      if (previous && (particle || punctuation)) previous.push(unit);
      else groups.push([unit]);
    }
    return groups;
  }

  function chunkFromUnits(level, group) {
    const text = lineText(group).trim();
    return text ? { level, text, lines: [text] } : null;
  }

  function chunkSourcesForLine(text, level, lang) {
    const source = String(text || '').trim();
    if (!source) return [];
    if (level === 'line') return [{ level: 'line', text: source, lines: [source] }];
    return phraseGroups(buildUnits([[source]], lang))
      .map((group) => chunkFromUnits('phrase', group))
      .filter(Boolean);
  }

  // Snap planned rhythm cuts onto the closest character / word boundary read
  // position, but only within half a beat (a cut that far from every boundary
  // stays where the plan put it).
  function snapChunkBoundaries(planned, units, start, budget, lang, settings, targetDuration) {
    if (!planned || !planned.length) return [];
    const speeds = settings.readingSpeed;
    const totalReading = units.reduce((sum, unit) => sum + readingTime(unit.text, lang, speeds), 0) || units.length;
    const times = [];
    let acc = 0;
    for (const unit of units) {
      acc += readingTime(unit.text, lang, speeds);
      times.push(start + (budget * acc) / totalReading);
    }
    const beat = Math.max(0.05, (Number(targetDuration) || 0) / 4);
    const half = beat * 0.5;
    const minGap = Math.max(0.05, settings.minChunkDuration || 0.2);
    const out = [];
    for (const cut of planned) {
      let best = cut;
      let bestDistance = half + 1e-9;
      for (const time of times) {
        if (time <= start + 1e-6 || time >= start + budget - 1e-6) continue;
        const distance = Math.abs(time - cut);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = time;
        }
      }
      if (best <= start + 1e-6 || best >= start + budget - 1e-6) continue;
      if (!out.length || best > out[out.length - 1] + minGap) out.push(best);
    }
    return out;
  }

  // Splits the cue text into beats that each show for about `target` seconds.
  // The beat count comes from the cue duration, the words are shared between
  // the beats by reading weight (TinySegmenter words for Japanese), and
  // explicit line/page breaks and sentence ends act as preferred boundaries.
  function targetChunkSources(units, target, lang, speeds, count) {
    if (!units.length) return [];
    const beats = Math.max(1, Math.round(count) || 1);
    const totalReading = units.reduce((sum, unit) => sum + readingTime(unit.text, lang, speeds), 0) || units.length;
    const perBeat = totalReading / beats;
    const chunks = [];
    let current = [];
    let reading = 0;
    const flush = () => {
      if (!current.length) return;
      const text = lineText(current).trim();
      if (text) chunks.push({ level: 'word', text, lines: [text] });
      current = [];
      reading = 0;
    };
    for (const unit of units) {
      if (unit.hardPage || (unit.hardBreak && current.length)) flush();
      current.push(unit);
      reading += readingTime(unit.text, lang, speeds);
      const sentenceEnd = SENTENCE_END.test(unit.text) || /[.!?…]["')\]]?$/.test(unit.text);
      if (reading >= perBeat || (sentenceEnd && reading >= perBeat * 0.6)) flush();
    }
    flush();
    // Merge an over-short tail into the previous beat so the last beat is not a
    // stray word (unless the text is genuinely one word long).
    if (chunks.length > 1) {
      const last = chunks[chunks.length - 1];
      if (readingTime(last.text, lang, speeds) < perBeat * 0.35) {
        const previous = chunks[chunks.length - 2];
        previous.text = `${previous.text} ${last.text}`.trim();
        previous.lines = [previous.text];
        chunks.pop();
      }
    }
    return chunks;
  }

  function subdivideChunk(chunk, lang) {
    if (chunk.level === 'line') {
      const groups = phraseGroups(buildUnits([[chunk.text]], lang));
      if (groups.length > 1) return groups.map((group) => chunkFromUnits('phrase', group)).filter(Boolean);
      return subdivideChunk({ ...chunk, level: 'phrase' }, lang);
    }
    if (chunk.level === 'phrase') {
      const groups = wordGroups(buildUnits([[chunk.text]], lang), lang);
      if (groups.length > 1) return groups.map((group) => chunkFromUnits('word', group)).filter(Boolean);
      return null;
    }
    return null;
  }

  // Distributes the cue window across chunks in proportion to their reading
  // time. A chunk never gets the whole maxChunkDuration: it is capped just
  // below it, and the excess is redistributed over the remaining chunks.
  function fitDurations(readings, window, maxDuration) {
    const count = readings.length;
    const durations = new Array(count).fill(0);
    if (!count) return durations;
    const weights = readings.map((value) => Math.max(1e-6, value));
    let budget = Math.max(0, window);
    let openReading = weights.reduce((sum, value) => sum + value, 0);
    let open = weights.map((_, index) => index);
    for (let guard = 0; guard < count + 1 && open.length; guard += 1) {
      let capped = false;
      for (const index of open) {
        const share = openReading > 0 ? (budget * weights[index]) / openReading : budget / open.length;
        if (share >= maxDuration - 1e-9) {
          durations[index] = Math.max(0, maxDuration - 0.01);
          budget = Math.max(0, budget - durations[index]);
          openReading = Math.max(0, openReading - weights[index]);
          capped = true;
        }
      }
      if (!capped) {
        for (const index of open) {
          durations[index] = openReading > 0 ? (budget * weights[index]) / openReading : budget / open.length;
        }
        break;
      }
      open = open.filter((index) => durations[index] === 0);
      if (budget <= 0 || openReading <= 0) {
        for (const index of open) durations[index] = 0;
        break;
      }
    }
    return durations;
  }

  function timeChunks(sources, start, end, settings, lang) {
    const window = Math.max(0.1, end - start);
    const maxDuration = Math.max(0.2, Number(settings.maxChunkDuration) || DEFAULTS.maxChunkDuration);
    const speeds = settings.readingSpeed || DEFAULTS.readingSpeed;
    const list = sources.map((source) => ({ ...source, reading: readingTime(source.text, lang, speeds) }));
    for (let guard = 0; guard < 400; guard += 1) {
      const index = list.findIndex((chunk) => !chunk.atomic && chunk.reading >= maxDuration - 1e-9);
      if (index < 0) break;
      const parts = subdivideChunk(list[index], lang);
      if (!parts) {
        list[index].atomic = true;
        continue;
      }
      list.splice(index, 1, ...parts.map((part) => ({ ...part, reading: readingTime(part.text, lang, speeds) })));
    }
    if (!list.length) return { items: [], warning: null };
    const durations = fitDurations(list.map((chunk) => chunk.reading), window, maxDuration);
    const total = durations.reduce((sum, value) => sum + value, 0);
    const leftover = Math.max(0, window - total);
    const gap = list.length > 1 ? leftover / (list.length - 1) : 0;
    const items = [];
    let cursor = start;
    for (let i = 0; i < list.length; i += 1) {
      const to = cursor + durations[i];
      items.push({ level: list[i].level, text: list[i].text, lines: list[i].lines, reading: list[i].reading, from: cursor, to });
      cursor = to + gap;
    }
    const minimum = Math.min(settings.minChunkDuration || DEFAULTS.minChunkDuration, window / list.length);
    const warning = durations.some((duration) => duration < minimum - 1e-9)
      ? { code: 'tooFast', message: 'The chunks are too fast to read' }
      : null;
    return { items, warning };
  }

  // Named split styles: the chunk level plus a short enter/exit motion that
  // keeps each chunk readable under the maxChunkDuration cap.
  const CHUNK_THEMES = [
    { id: 'pageFlow', chunk: 'page', style: null },
    {
      id: 'lineSlide',
      chunk: 'line',
      style: {
        enter: { type: 'slide', params: { dir: 'up', distance: 0.12 }, motion: { in: { duration: 0.22, ease: 'easeOutCubic' } } },
        exit: { type: 'fade', params: {}, motion: { out: { duration: 0.18, ease: 'easeInCubic' } } },
      },
    },
    {
      id: 'lineBlur',
      chunk: 'line',
      style: {
        enter: { type: 'blurIn', params: { radius: 10 }, motion: { in: { duration: 0.22, ease: 'easeOutCubic' } } },
        exit: { type: 'blurOut', params: { radius: 8 }, motion: { out: { duration: 0.16, ease: 'easeInCubic' } } },
      },
    },
    {
      id: 'phraseSlide',
      chunk: 'phrase',
      style: {
        enter: { type: 'slide', params: { dir: 'up', distance: 0.08 }, motion: { in: { duration: 0.18, ease: 'easeOutCubic' } } },
        exit: { type: 'fade', params: {}, motion: { out: { duration: 0.14, ease: 'easeInCubic' } } },
      },
    },
    {
      id: 'phrasePop',
      chunk: 'phrase',
      style: {
        enter: { type: 'zoomIn', params: { from: 0.7 }, motion: { in: { duration: 0.16, ease: 'easeOutBack' } } },
        exit: { type: 'zoomOut', params: { to: 0.85 }, motion: { out: { duration: 0.12, ease: 'easeInCubic' } } },
      },
    },
  ];

  function chunkThemes() {
    return CHUNK_THEMES.map((theme) => ({ ...theme, style: theme.style ? JSON.parse(JSON.stringify(theme.style)) : null }));
  }

  // Flattens the beats of a project into SRT-ready cues (one entry per beat).
  function beatCues(project) {
    const output = [];
    const cues = project && project.script ? project.script.cues || [] : [];
    for (const cue of cues) {
      const beats = project.beats && project.beats[cue.id];
      if (!beats || !beats.length) {
        if (cue.text) output.push({ start: cue.start, end: cue.end, text: cue.text });
        continue;
      }
      for (const beat of [...beats].sort((a, b) => a.start - b.start)) {
        const lines = Array.isArray(beat.lines) && beat.lines.length ? beat.lines : String(beat.text || '').split(/\r?\n/);
        const text = lines.join('\n').trim();
        if (!text) continue;
        output.push({ start: beat.start, end: beat.end, text });
      }
    }
    return output.sort((a, b) => a.start - b.start || a.end - b.end);
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
    const fill = style.fit === 'fill';
    const fillFrame = { width: (opts.frame && opts.frame.width) || 1920, height: (opts.frame && opts.frame.height) || 1080 };
    const fo = fill ? fillOptions(style, fillFrame, aspect) : null;
    // The block's vertical budget: 80% of the frame by default; a beat may open
    // it up to the frame height (a weird beat fills the screen on purpose).
    const rawMaxHeight = style.maxHeight == null || style.maxHeight === '' ? 0.8 : Number(style.maxHeight);
    const maxHeightRatio = Number.isFinite(rawMaxHeight) && rawMaxHeight > 0 ? rawMaxHeight : 0.8;
    const fitLimits = {
      maxHeight: maxHeightRatio * (style.direction === 'vertical' ? fillFrame.width : fillFrame.height),
      lineHeight: style.lineHeight || 1.2,
    };
    const fitUnits = (list, lines) => fillFit(list, measurer, size, fo, lines == null ? settings.maxLines : lines, settings);

    const blocks = parseEscapes(source);
    const units = buildUnits(blocks, lang);
    const textBlocks = splitBlocks(units);

    const pages = [];
    const fullText = blocks.map((lines) => lines.join(' ')).join(' ');

    function pushPage(kind, lines, scale, extra) {
      const text = lines.map((line) => lineText(line)).join('\n');
      pages.push({
        kind,
        lines: lines.map((line) => lineText(line)),
        text,
        fontScale: scale == null ? 1 : scale,
        reading: readingTime(text, lang, settings.readingSpeed),
        ...(extra || {}),
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
    if (fill) {
      const pushFill = (kind, fit) => {
        pushPage(kind, fit.lines, fit.scale, { fit: 'fill', bleed: fit.bleed });
        if (fit.bleed) warnings.push({ code: 'bleed', message: 'Text extends past the frame edge' });
      };
      if (settings.split === 'off' && !forcedPages) {
        const fit = fitUnits(units, Math.min(units.length, 12));
        if (fit) pushFill('single', fit);
        else {
          const scale = Math.max(0.05, settings.minFontScale);
          const attempt = greedyLines(units, measurer, size * scale, maxWidth, 0);
          pushPage('single', attempt.lines, scale, { fit: 'fill' });
          warnings.push({ code: 'overflow', message: 'Text overflows the safe area' });
        }
        if (fit && !fit.fits) warnings.push({ code: 'overflow', message: 'Text overflows the safe area' });
      } else {
        textBlocks.forEach((block, blockIndex) => {
          const whole = fitUnits(block);
          if (whole && whole.fits) {
            pushFill('page', whole);
            return;
          }
          // the block does not fit whole even at the minimum size: wrap there,
          // split into pages, then let every page grow again on its own
          const lines = dpLines(block, measurer, fo.minSize, fo.maxWidth * fo.frameW, settings);
          for (const group of dpPages(lines, settings.maxLines)) {
            const pageFit = fitUnits(group.flat());
            if (pageFit && pageFit.fits) pushFill('page', pageFit);
            else {
              pushPage('page', group, fo.minSize / size, { fit: 'fill', bleed: true });
              warnings.push({ code: 'overflow', message: 'A word is wider than the frame' });
            }
          }
          if (!lines.length) warnings.push({ code: 'empty-block', message: `Block ${blockIndex + 1} has no text` });
        });
        if (!forcedPages && pages.length === 1) pages[0].kind = 'single';
      }
      if (fo.consistency === 'cue' && pages.length > 1) {
        const scale = Math.min(...pages.map((page) => page.fontScale));
        pages.forEach((page) => { page.fontScale = scale; });
      }
    } else {
      if (!forcedPages) {
        single = fitCheck(units, measurer, size, maxWidth, settings.maxLines, settings.split === 'off' ? 0.05 : settings.minFontScale, fitLimits);
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
      let fullLines = dpLines(units, measurer, size * settings.minFontScale, maxWidth, settings);
      let recapText = fullLines.map((line) => lineText(line)).join('\n');
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
        let recapFit = null;
        if (recapSettings.fontScale === 'auto' || recapSettings.fontScale == null) {
          if (fill) {
            recapFit = fillFit(units, measurer, size, { ...fo, maxHeight: 0.8 }, recapSettings.maxLines || 6, settings);
            if (recapFit) {
              recapScale = recapFit.scale;
              fullLines = recapFit.lines;
              recapText = fullLines.map((line) => lineText(line)).join('\n');
            }
          }
          if (!recapFit) {
            const available = ((opts.frame && opts.frame.height) || 1080) * 0.8;
            const lineHeight = (style.lineHeight || 1.2) * size * settings.minFontScale;
            const needed = fullLines.length * lineHeight;
            recapScale = Math.max(0.45, Math.min(1, available / Math.max(needed, 1)));
          }
        } else {
          recapScale = Number(recapSettings.fontScale) || 1;
        }
        recap = {
          kind: 'recap',
          lines: fullLines.map((line) => lineText(line)),
          text: recapText,
          fontScale: recapScale,
          fit: fill ? 'fill' : undefined,
          bleed: recapFit ? recapFit.bleed : undefined,
          reading,
          from: start + cueDuration - recapDuration,
          to: end,
          transition: recapSettings.transition || 'gather',
          highlight: recapSettings.highlight || 'none',
        };
      }
    }

    // --- timing --------------------------------------------------------------
    const chunkMode = settings.chunk && settings.chunk !== 'page';
    const naturalHold = budget - naturalTotal;
    const useNatural = !chunkMode && holdMode !== 'hold' && naturalHold > (settings.longHold.threshold || 6);
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

    // --- telop chunks --------------------------------------------------------
    // Each timed page is split into line / phrase chunks. A chunk whose reading
    // estimate or share would reach maxChunkDuration is divided further (line
    // -> phrase -> word) so every chunk stays on screen for less than a second.
    if (chunkMode && basePages.length) {
      const expanded = [];
      const targetDuration = Number(settings.targetChunkDuration) || 0;
      if (targetDuration > 0) {
        // one beat per musical bar: beats are cut on the bar grid when the cue
        // crosses a bar line, with TinySegmenter words for Japanese. A planned
        // rhythm (SA.rhythm, weird / energetic songs) replaces the grid; the
        // cuts are snapped onto word boundaries within half a beat.
        let boundaries = snapChunkBoundaries(settings.chunkPlan, units, start, budget, lang, settings, targetDuration);
        if (!boundaries.length) {
          for (let at = Math.ceil((start + 1e-6) / targetDuration) * targetDuration; at < start + budget - 1e-6; at += targetDuration) {
            boundaries.push(at);
          }
        }
        if (boundaries.length + 1 > units.length) {
          // more cuts than words: subsample evenly instead of front-loading
          const keep = Math.max(1, units.length - 1);
          const step = boundaries.length / keep;
          const sampled = [];
          for (let i = 0; i < keep; i += 1) sampled.push(boundaries[Math.min(boundaries.length - 1, Math.floor(i * step))]);
          boundaries = sampled;
        }
        const count = Math.max(1, boundaries.length + 1);
        const sources = targetChunkSources(units, targetDuration, lang, settings.readingSpeed, count);
        for (const source of sources) {
          const chunkUnits = buildUnits([[source.text]], lang);
          if (fill) {
            const fit = fitUnits(chunkUnits);
            if (fit) {
              source.lines = fit.lines.map((line) => lineText(line));
              source.fontScale = fit.scale;
              source.fit = 'fill';
              source.bleed = fit.bleed;
              continue;
            }
          }
          const fit = fitCheck(chunkUnits, measurer, size, maxWidth, settings.maxLines, settings.minFontScale, fitLimits);
          if (fit) {
            source.lines = fit.lines.map((line) => lineText(line));
            source.fontScale = fit.scale;
          } else {
            const scaled = greedyLines(chunkUnits, measurer, size * settings.minFontScale, maxWidth, 0);
            source.lines = scaled.lines.map((line) => lineText(line));
            source.fontScale = settings.minFontScale;
          }
        }
        const edges = [start];
        if (sources.length === count) {
          for (const boundary of boundaries) edges.push(boundary);
        } else {
          for (let i = 1; i < sources.length; i += 1) edges.push(start + (budget * i) / Math.max(1, sources.length));
        }
        edges.push(start + budget);
        sources.forEach((source, index) => {
          const from = edges[index];
          const to = edges[index + 1] == null ? start + budget : edges[index + 1];
          expanded.push({
            kind: 'page',
            chunk: source.level,
            text: source.text,
            lines: source.lines || [source.text],
            fontScale: source.fontScale == null ? 1 : source.fontScale,
            fit: source.fit,
            bleed: source.bleed,
            reading: readingTime(source.text, lang, settings.readingSpeed),
            from,
            to,
          });
        });
        const tooFast = edges.some((edge, index) => index > 0 && edge - edges[index - 1] < settings.minChunkDuration - 1e-9);
        if (tooFast) warnings.push({ code: 'tooFast', message: 'The beats are too fast to read' });
      } else {
        for (const page of basePages) {
          const sources = [];
          for (const line of page.lines) sources.push(...chunkSourcesForLine(line, settings.chunk, lang));
          const timed = timeChunks(sources, page.from, page.to, settings, lang);
          if (timed.warning) warnings.push(timed.warning);
          for (const chunk of timed.items) {
            let lines = chunk.lines;
            let fontScale = page.fontScale;
            let extra = null;
            if (fill) {
              const fit = fitUnits(buildUnits([[chunk.text]], lang));
              if (fit) {
                lines = fit.lines.map((line) => lineText(line));
                fontScale = fit.scale;
                extra = { fit: 'fill', bleed: fit.bleed };
              }
            }
            expanded.push({
              kind: 'page',
              chunk: chunk.level,
              text: chunk.text,
              lines,
              fontScale,
              ...(extra || {}),
              reading: chunk.reading,
              from: chunk.from,
              to: chunk.to,
            });
          }
        }
      }
      if (expanded.length) {
        pages.splice(0, pages.length, ...expanded);
        basePages.length = 0;
        basePages.push(...expanded);
      }
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
            fit: page.fit,
            bleed: page.bleed,
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
          fit: page.fit || undefined,
          bleed: page.bleed || undefined,
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
        chunk: page.chunk || undefined,
        index,
        start: page.from,
        end: page.to,
        text: page.text,
        lines: page.lines,
        fontScale: page.fontScale,
        fit: page.fit || undefined,
        bleed: page.bleed || undefined,
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
    for (const beat of pinned) {
      const text = normalizeText(beat.text);
      // edited beats carry their own text; the cue only owns the timing, so a
      // pinned beat survives even when the cue text no longer contains it
      if (text) kept.push({ ...beat });
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
    FILL_DEFAULTS,
    FILL_REF_SIZE,
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
    fillOptions,
    sizeForLines,
    fillFit,
    fitLinesScale,
    flow,
    restructure,
    mergePinned,
    cueOptions,
    apply,
    kindForBeatId,
    gatherPlan,
    normalizeText,
    lineText,
    chunkThemes,
    beatCues,
    segmentWords,
  };
});
