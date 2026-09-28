window.SA = window.SA || {};

SA.lyricsFont = (() => {
  'use strict';

  // `fontClass` groups typefaces by perceptual style (§5.3 of the repeat
  // design): variation swaps a copy's class, not a concrete font. `rank` is
  // the strength order used by progress/oddOne. `variation` marks the extra
  // typefaces that exist for the repeat group.
  const BUILTINS = [
    { id: 'NotoSans-Regular', family: 'Noto Sans', weight: 400, path: 'fonts/NotoSans-Regular.ttf', cjk: false, fontClass: 'sans', rank: 2 },
    { id: 'NotoSans-Bold', family: 'Noto Sans', weight: 700, path: 'fonts/NotoSans-Bold.ttf', cjk: false, fontClass: 'sansBold', rank: 4 },
    { id: 'NotoSerif-Regular', family: 'Noto Serif', weight: 400, path: 'fonts/NotoSerif-Regular.ttf', cjk: false, fontClass: 'serif', rank: 1 },
    { id: 'NotoSansJP-Regular', family: 'Noto Sans JP', weight: 400, path: 'fonts/NotoSansJP-Regular.otf', cjk: true, fontClass: 'sans', rank: 2 },
    { id: 'NotoSansJP-Bold', family: 'Noto Sans JP', weight: 700, path: 'fonts/NotoSansJP-Bold.otf', cjk: true, fontClass: 'sansBold', rank: 4 },
    { id: 'DelaGothicOne-Regular', family: 'Dela Gothic One', weight: 400, path: 'fonts/DelaGothicOne-Regular.ttf', cjk: true, fontClass: 'display', rank: 6 },
    { id: 'BebasNeue-Regular', family: 'Bebas Neue', weight: 400, path: 'fonts/BebasNeue-Regular.ttf', cjk: false, fontClass: 'display', rank: 6 },
    { id: 'NotoSerifJP-Regular', family: 'Noto Serif JP', weight: 400, path: 'fonts/NotoSerifJP-Regular.otf', cjk: true, fontClass: 'serif', rank: 1, variation: true },
    { id: 'ZenMaruGothic-Regular', family: 'Zen Maru Gothic', weight: 400, path: 'fonts/ZenMaruGothic-Regular.ttf', cjk: true, fontClass: 'round', rank: 3, variation: true },
    { id: 'KleeOne-Regular', family: 'Klee One', weight: 400, path: 'fonts/KleeOne-Regular.ttf', cjk: true, fontClass: 'hand', rank: 3, variation: true },
    { id: 'RocknRollOne-Regular', family: 'RocknRoll One', weight: 400, path: 'fonts/RocknRollOne-Regular.ttf', cjk: true, fontClass: 'pop', rank: 5, variation: true },
  ];

  const CJK_RE = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;
  const NO_LINE_START = '、。，．・：；！？ー―〜…‥）」』】〕〉》ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ々ゝゞ';
  const NO_LINE_END = '「『（【〔〈《';
  const VERTICAL_MAP = { '「': '﹁', '」': '﹂', '『': '﹃', '』': '﹄', '（': '︵', '）': '︶', '【': '︻', '】': '︼' };
  const VERTICAL_ROTATE = 'ー―〜…‥—';

  const parsed = new Map();
  const pending = new Map();
  const userFonts = new Map();
  const rasterCache = new Map();
  let activeFonts = [];

  function opentypeLib() {
    if (typeof window !== 'undefined' && window.opentype) return window.opentype;
    if (typeof self !== 'undefined' && self.opentype) return self.opentype;
    return null;
  }

  function fail(code, message) {
    return Object.assign(new Error(message || code), { code });
  }

  function hasCjk(text) {
    return CJK_RE.test(String(text || ''));
  }

  function builtins() {
    return BUILTINS.map((entry) => ({ ...entry }));
  }

  function findBuiltin(fontId) {
    return BUILTINS.find((entry) => entry.id === fontId) || null;
  }

  function parseFont(id, family, weight, bytes) {
    const lib = opentypeLib();
    if (!lib || typeof lib.parse !== 'function') throw fail('missing-opentype', 'opentype.js is not loaded');
    const buffer = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const font = lib.parse(buffer);
    return { id, family, weight: weight || 400, font, unitsPerEm: font.unitsPerEm || 1000 };
  }

  function load(fontId) {
    const id = String(fontId || '');
    if (parsed.has(id)) return Promise.resolve(parsed.get(id));
    if (pending.has(id)) return pending.get(id);

    const request = (async () => {
      const user = userFonts.get(id);
      if (user) {
        const entry = parseFont(id, user.family, user.weight, user.bytes);
        parsed.set(id, entry);
        return entry;
      }
      const builtin = findBuiltin(id);
      if (!builtin) throw fail('font-not-found', `Unknown font: ${id}`);
      if (typeof SA.platform === 'undefined' || typeof SA.platform.readAsset !== 'function') {
        throw fail('unsupported', 'readAsset is not available');
      }
      const bytes = await SA.platform.readAsset(builtin.path);
      const entry = parseFont(builtin.id, builtin.family, builtin.weight, bytes);
      entry.path = builtin.path;
      entry.cjk = builtin.cjk;
      entry.fontClass = builtin.fontClass || null;
      entry.rank = builtin.rank == null ? null : builtin.rank;
      parsed.set(id, entry);
      return entry;
    })();

    pending.set(id, request);
    return request.catch((error) => {
      pending.delete(id);
      throw error;
    });
  }

  function registerUserFont(id, family, bytes, weight) {
    userFonts.set(id, { id, family: family || id, weight: weight || 400, bytes });
    return load(id);
  }

  function unregisterUserFont(id) {
    userFonts.delete(id);
    parsed.delete(id);
  }

  function boldSibling(entry) {
    if (!entry || (entry.weight || 400) >= 600) return entry;
    if (entry.id.endsWith('-Regular')) {
      const siblingId = entry.id.replace(/-Regular$/, '-Bold');
      if (parsed.has(siblingId)) return parsed.get(siblingId);
    }
    return entry;
  }

  async function ensure(text, fontId, options) {
    const opts = options || {};
    const entries = [];
    const push = (entry) => {
      if (entry && entry.font && !entries.some((existing) => existing.id === entry.id)) entries.push(entry);
    };
    if (fontId) push(await load(fontId).catch(() => null));
    if (opts.weight >= 600 && entries.length) {
      const bold = boldSibling(entries[0]);
      if (bold && bold !== entries[0]) entries.unshift(bold);
    }
    for (const id of ['NotoSans-Regular', 'NotoSansJP-Regular']) {
      if (entries.some((entry) => entry.id === id)) continue;
      if (id === 'NotoSansJP-Regular' && !hasCjk(text) && !opts.alwaysCjk) continue;
      push(await load(id).catch(() => null));
    }
    return entries;
  }

  function normalizeFonts(fonts) {
    if (!fonts) return { list: [], get: () => null };
    if (Array.isArray(fonts)) {
      const map = new Map(fonts.map((entry) => [entry.id, entry]));
      return { list: fonts, get: (id) => map.get(id) || fonts[0] || null };
    }
    if (typeof fonts.get === 'function') return { list: fonts.list || [], get: fonts.get };
    if (fonts.id) return { list: [fonts], get: () => fonts };
    return { list: [], get: () => null };
  }

  function pickFont(list, char) {
    for (const entry of list) {
      if (!entry || !entry.font) continue;
      if (entry.font.charToGlyphIndex(char) !== 0) return entry;
    }
    return null;
  }

  function graphemes(text, lang) {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const segmenter = new Intl.Segmenter(lang || 'en', { granularity: 'grapheme' });
      return [...segmenter.segment(text)].map((entry) => entry.segment);
    }
    return Array.from(text);
  }

  function words(text, lang) {
    if (!text) return [];
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const segmenter = new Intl.Segmenter(lang || 'en', { granularity: 'word' });
      return [...segmenter.segment(text)].map((entry) => ({ text: entry.segment, wordLike: !!entry.isWordLike }));
    }
    return text.split(/(\s+)/).filter(Boolean).map((segment) => ({ text: segment, wordLike: !/^\s+$/.test(segment) }));
  }

  function codePointLength(character) {
    return Array.from(character).length;
  }

  function glyphScale(entry, size) {
    return size / (entry.unitsPerEm || 1000);
  }

  function glyphBBox(entry, glyph, size) {
    const scale = glyphScale(entry, size);
    if (typeof glyph.getBoundingBox !== 'function') return { x1: 0, y1: 0, x2: 0, y2: 0 };
    const box = glyph.getBoundingBox();
    return {
      x1: box.x1 * scale,
      y1: -box.y2 * scale,
      x2: box.x2 * scale,
      y2: -box.y1 * scale,
    };
  }

  // --- raster letters (only for characters no loaded font can show) ------------

  function traceMask(mask, width, height) {
    const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] !== 0;
    const edges = new Map();
    const key = (x, y) => `${x},${y}`;
    const addEdge = (x1, y1, x2, y2) => {
      const start = key(x1, y1);
      if (!edges.has(start)) edges.set(start, []);
      edges.get(start).push([x2, y2]);
    };
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!inside(x, y)) continue;
        if (!inside(x, y - 1)) addEdge(x, y, x + 1, y);
        if (!inside(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
        if (!inside(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
        if (!inside(x - 1, y)) addEdge(x, y + 1, x, y);
      }
    }
    const loops = [];
    for (const [startKey, targets] of edges) {
      while (targets.length) {
        const loop = [];
        let [x, y] = startKey.split(',').map(Number);
        let guard = 0;
        while (guard < 1e6) {
          guard += 1;
          loop.push(x, y);
          const list = edges.get(key(x, y));
          if (!list || !list.length) break;
          const next = list.shift();
          x = next[0];
          y = next[1];
          if (x === Number(startKey.split(',')[0]) && y === Number(startKey.split(',')[1])) break;
        }
        if (loop.length >= 6) loops.push(loop);
      }
    }
    return loops;
  }

  function simplifyClosed(points, tolerance) {
    const count = points.length / 2;
    if (count < 4) return points;
    let far = 0;
    let farDistance = -1;
    for (let i = 1; i < count; i += 1) {
      const distance = (points[i * 2] - points[0]) ** 2 + (points[i * 2 + 1] - points[1]) ** 2;
      if (distance > farDistance) {
        farDistance = distance;
        far = i;
      }
    }
    function simplify(start, end, output) {
      const ax = points[start * 2];
      const ay = points[start * 2 + 1];
      const bx = points[end * 2];
      const by = points[end * 2 + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSq = dx * dx + dy * dy;
      let maxDistance = -1;
      let maxIndex = -1;
      for (let i = start + 1; i < end; i += 1) {
        let t = lengthSq > 0 ? ((points[i * 2] - ax) * dx + (points[i * 2 + 1] - ay) * dy) / lengthSq : 0;
        t = Math.max(0, Math.min(1, t));
        const distance = Math.hypot(points[i * 2] - (ax + t * dx), points[i * 2 + 1] - (ay + t * dy));
        if (distance > maxDistance) {
          maxDistance = distance;
          maxIndex = i;
        }
      }
      if (maxDistance > tolerance && maxIndex > start + 0) {
        simplify(start, maxIndex, output);
        output.push(maxIndex);
        simplify(maxIndex, end, output);
      }
    }
    const output = [0];
    simplify(0, far, output);
    output.push(far);
    simplify(far, count, output);
    const result = [];
    for (const index of output) {
      if (index >= count) continue;
      result.push(points[index * 2], points[index * 2 + 1]);
    }
    return result;
  }

  function rasterLetter(character, size) {
    const cacheKey = `${character}|${Math.round(size)}`;
    if (rasterCache.has(cacheKey)) return rasterCache.get(cacheKey);
    const canvasSize = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const drawSize = Math.round(canvasSize * 0.72);
    ctx.clearRect(0, 0, canvasSize, canvasSize);
    ctx.font = `${drawSize}px "Segoe UI", "Yu Gothic UI", "Hiragino Sans", Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const baselineY = Math.round(canvasSize * 0.78);
    ctx.fillStyle = '#fff';
    ctx.fillText(character, 8, baselineY);
    const advancePx = Math.max(1, ctx.measureText(character).width);
    const image = ctx.getImageData(0, 0, canvasSize, canvasSize);
    const mask = new Uint8Array(canvasSize * canvasSize);
    for (let i = 0; i < mask.length; i += 1) mask[i] = image.data[i * 4 + 3] >= 128 ? 1 : 0;
    const loops = traceMask(mask, canvasSize, canvasSize);
    const scale = size / drawSize;
    const contours = [];
    for (const loop of loops) {
      const simplified = simplifyClosed(loop, 0.75);
      if (simplified.length < 6) continue;
      const points = new Float32Array(simplified.length);
      for (let i = 0; i < simplified.length; i += 2) {
        points[i] = (simplified[i] - 8) * scale;
        points[i + 1] = (simplified[i + 1] - baselineY) * scale;
      }
      const geometry = SA.geometry;
      contours.push({
        points,
        closed: true,
        area: geometry ? Math.abs(geometry.shoelaceArea(points)) : 0,
        length: geometry ? geometry.polylineLength(points, true) : 0,
      });
    }
    const result = { contours, advance: advancePx * scale, drawSize, baselineY };
    rasterCache.set(cacheKey, result);
    return result;
  }

  // --- layout ------------------------------------------------------------------

  function verticalSubstitute(character, entry) {
    if (VERTICAL_MAP[character]) {
      const mapped = VERTICAL_MAP[character];
      if (entry && entry.font.charToGlyphIndex(mapped) !== 0) return { char: mapped, rotated: false };
      return { char: character, rotated: true };
    }
    if (VERTICAL_ROTATE.includes(character)) return { char: character, rotated: true };
    if (character === '、' || character === '。') return { char: character, rotated: false, quadrant: true };
    return { char: character, rotated: false };
  }

  function buildLetter(character, style, fontSet, size, lang, options) {
    const opts = options || {};
    const vertical = opts.direction === 'vertical';
    let rendered = character;
    let rotated = false;
    let quadrant = false;
    const list = fontSet.list || [];
    if (vertical && list.length) {
      const substituted = verticalSubstitute(character, list[0]);
      rendered = substituted.char;
      rotated = substituted.rotated;
      quadrant = !!substituted.quadrant;
    }
    const entry = pickFont(list, rendered);
    const letter = {
      char: character,
      renderedChar: rendered,
      fontId: entry ? entry.id : null,
      glyph: null,
      size,
      advance: size * 0.6,
      bbox: { x1: 0, y1: 0, x2: size * 0.6, y2: 0 },
      vertRotate: false,
      quadrant,
      raster: null,
      src: 'raster',
    };
    if (entry) {
      const glyph = entry.font.charToGlyph(rendered);
      const scale = glyphScale(entry, size);
      letter.glyph = glyph;
      letter.src = 'font';
      letter.advance = (glyph.advanceWidth || 0) * scale;
      letter.bbox = glyphBBox(entry, glyph, size);
      letter.vertRotate = vertical && rotated;
    } else {
      const raster = rasterLetter(character, size);
      letter.raster = raster;
      letter.advance = raster.advance;
      let x1 = Infinity;
      let y1 = Infinity;
      let x2 = -Infinity;
      let y2 = -Infinity;
      for (const contour of raster.contours) {
        for (let i = 0; i < contour.points.length; i += 2) {
          x1 = Math.min(x1, contour.points[i]);
          y1 = Math.min(y1, contour.points[i + 1]);
          x2 = Math.max(x2, contour.points[i]);
          y2 = Math.max(y2, contour.points[i + 1]);
        }
      }
      if (Number.isFinite(x1)) letter.bbox = { x1, y1, x2, y2 };
    }
    if (vertical && !rotated && !quadrant) letter.vertRotate = false;
    if (quadrant) {
      letter.offsetX = size * 0.25;
      letter.offsetY = -size * 0.25;
    }
    return { letter, entry };
  }

  function isCjkChar(character) {
    return CJK_RE.test(character);
  }

  function shouldBreakBetween(previous, next) {
    if (!previous || !next) return false;
    if (previous === ' ') return true;
    if (next === ' ') return false;
    if (/[\u3000-\u9fff\uff00-\uffef]/.test(previous) || /[\u3000-\u9fff\uff00-\uffef]/.test(next)) {
      if (NO_LINE_START.includes(next)) return false;
      if (NO_LINE_END.includes(previous)) return false;
      return true;
    }
    return false;
  }

  function buildItems(paragraph, style, fontSet, size, lang, opts) {
    const items = [];
    let previous = null;
    for (const token of words(paragraph, lang)) {
      const chars = graphemes(token.text, lang);
      for (let i = 0; i < chars.length; i += 1) {
        const character = chars[i];
        const { letter } = buildLetter(character, style, fontSet, size, lang, opts);
        let breakBefore = false;
        if (previous != null && !/^\s+$/.test(character)) {
          if (/\s+$/.test(previous)) breakBefore = true;
          else if (i > 0) breakBefore = shouldBreakBetween(previous, character);
        }
        items.push({ letter, breakBefore });
        previous = character;
      }
    }
    return items;
  }

  function breakItems(items, maxWidth, letterSpacing) {
    if (!items.length) return [[]];
    const lines = [];
    let start = 0;
    let width = 0;
    let lastBreak = -1;
    let index = 0;
    while (index < items.length) {
      const item = items[index];
      if (item.breakBefore) lastBreak = index;
      const advance = item.letter.advance + letterSpacing;
      if (index > start && maxWidth !== Infinity && width + advance > maxWidth) {
        const breakAt = lastBreak > start ? lastBreak : index;
        lines.push(items.slice(start, breakAt));
        start = breakAt;
        width = 0;
        lastBreak = -1;
        for (let i = start; i < index; i += 1) {
          width += items[i].letter.advance + letterSpacing;
          if (items[i].breakBefore) lastBreak = i;
        }
        continue;
      }
      width += advance;
      index += 1;
    }
    lines.push(items.slice(start));
    return lines;
  }

  function layoutText(text, style, fonts, options) {
    const opts = options || {};
    const source = String(text == null ? '' : text);
    const fontSet = normalizeFonts(fonts);
    const size = opts.size || style.size || 96;
    const lineHeight = (style.lineHeight || 1.2) * size;
    const letterSpacing = (style.letterSpacing || 0) * size;
    const align = style.align || 'center';
    const lang = opts.lang || (typeof document !== 'undefined' && document.documentElement.lang) || 'en';
    const direction = opts.direction || style.direction || 'horizontal';
    const vertical = direction === 'vertical';
    let maxWidth = opts.maxWidth;
    if (maxWidth == null) {
      if (style.maxWidth > 0 && style.maxWidth <= 1 && opts.frameWidth) maxWidth = style.maxWidth * opts.frameWidth;
      else maxWidth = Infinity;
    }

    const paragraphs = source.split(/\r\n|\r|\n/);
    const lines = [];
    for (const paragraph of paragraphs) {
      const items = buildItems(paragraph, style, fontSet, size, lang, opts);
      for (const rawLine of breakItems(items, maxWidth, letterSpacing)) lines.push(rawLine);
    }

    let maxLineWidth = 0;
    for (const line of lines) maxLineWidth = Math.max(maxLineWidth, plainWidth(line, letterSpacing));

    const block = { lines: [], width: 0, height: 0 };
    const primary = fontSet.list[0] || null;
    const ascent = primary ? (primary.font.ascender || primary.unitsPerEm) * glyphScale(primary, size) : size;
    const descent = primary ? Math.abs(primary.font.descender || 0) * glyphScale(primary, size) : size * 0.3;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
      const items = lines[lineIdx];
      if (vertical) {
        const result = layoutVerticalLine(items, block, lineIdx, size, lineHeight, letterSpacing);
        block.width = Math.max(block.width, result.width);
        block.height = Math.max(block.height, result.height);
        continue;
      }
      const baseline = ascent + lineIdx * lineHeight;
      const width = plainWidth(items, letterSpacing);
      let pen = 0;
      if (align === 'center') pen = (maxLineWidth - width) / 2;
      else if (align === 'right') pen = maxLineWidth - width;
      const outWords = [];
      let word = null;
      for (const item of items) {
        const letter = item.letter;
        const isSpace = /^\s+$/.test(letter.char);
        if (!word || (isSpace && !word.isSpace) || (!isSpace && word.isSpace)) {
          if (word) outWords.push(word);
          word = { letters: [], width: 0, isSpace };
        }
        letter.x = pen;
        letter.y = baseline;
        letter.advanceWithSpacing = letter.advance + letterSpacing;
        pen += letter.advanceWithSpacing;
        word.letters.push(letter);
        word.width += letter.advanceWithSpacing;
      }
      if (word) outWords.push(word);
      block.lines.push({ words: outWords, width, height: lineHeight, baseline, y: baseline - ascent });
      block.width = Math.max(block.width, width);
      block.height = (lineIdx + 1) * lineHeight;
    }

    let bbox = null;
    for (const line of block.lines) {
      for (const word of line.words) {
        for (const letter of word.letters) {
          const box = {
            x1: letter.x + letter.bbox.x1,
            y1: letter.y + letter.bbox.y1,
            x2: letter.x + letter.bbox.x2,
            y2: letter.y + letter.bbox.y2,
          };
          if (!bbox) bbox = { ...box };
          else {
            bbox.x1 = Math.min(bbox.x1, box.x1);
            bbox.y1 = Math.min(bbox.y1, box.y1);
            bbox.x2 = Math.max(bbox.x2, box.x2);
            bbox.y2 = Math.max(bbox.y2, box.y2);
          }
        }
      }
    }
    if (!bbox) bbox = { x1: 0, y1: 0, x2: 0, y2: 0 };

    return {
      lines: block.lines,
      bbox,
      width: block.width,
      height: block.height,
      ascent,
      descent,
      size,
      lineHeight,
      direction,
    };
  }

  function plainWidth(items, letterSpacing) {
    let sum = 0;
    for (const item of items) {
      const letter = item && item.letter ? item.letter : item;
      sum += (letter.advance || 0) + letterSpacing;
    }
    return sum;
  }

  function layoutVerticalLine(items, block, lineIdx, size, lineHeight, letterSpacing) {
    const columnX = -lineIdx * lineHeight;
    const outWords = [];
    let word = null;
    let pen = 0;
    for (const item of items) {
      const letter = item.letter;
      const isSpace = /^\s+$/.test(letter.char);
      if (!word || (isSpace && !word.isSpace) || (!isSpace && word.isSpace)) {
        if (word) outWords.push(word);
        word = { letters: [], width: 0, isSpace };
      }
      const previous = word.letters.length ? word.letters[word.letters.length - 1] : null;
      let advance = letter.advance + letterSpacing;
      let x = columnX;
      if (!letter.vertRotate && previous && /^[0-9]$/.test(previous.char) && /^[0-9]$/.test(letter.char)) {
        previous.x = columnX - size * 0.25;
        x = columnX + size * 0.25;
        advance = 0;
      }
      letter.x = x;
      letter.y = pen;
      letter.advanceWithSpacing = advance;
      pen += advance;
      word.letters.push(letter);
      word.width += advance;
    }
    if (word) outWords.push(word);
    block.lines.push({ words: outWords, width: size, height: pen, baseline: pen, y: 0, vertical: true });
    return { width: size, height: pen };
  }

  function measureText(text, style, fonts, options) {
    const layout = layoutText(text, style, fonts, options);
    return {
      width: layout.bbox.x2 - layout.bbox.x1,
      height: layout.bbox.y2 - layout.bbox.y1,
      bbox: layout.bbox,
      layout,
    };
  }

  function measureLine(text, style, fonts, options) {
    const opts = options || {};
    const fontSet = normalizeFonts(fonts);
    const size = opts.size || style.size || 96;
    const letterSpacing = (style.letterSpacing || 0) * size;
    const items = buildItems(String(text == null ? '' : text), style, fontSet, size, opts.lang || 'en', {});
    return plainWidth(items, letterSpacing);
  }

  function setActive(list) {
    activeFonts = Array.isArray(list) ? [...list] : [];
    return activeFonts;
  }

  function getActive() {
    return activeFonts;
  }

  function clearCache() {
    parsed.clear();
    pending.clear();
    rasterCache.clear();
  }

  return {
    BUILTINS,
    CJK_RE,
    builtins,
    findBuiltin,
    load,
    ensure,
    registerUserFont,
    unregisterUserFont,
    hasCjk,
    layoutText,
    measureText,
    measureLine,
    setActive,
    getActive,
    rasterLetter,
    clearCache,
  };
})();
