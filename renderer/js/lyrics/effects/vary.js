(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../rng'), require('../../color'), require('./text-bg'));
  else {
    root.SA = root.SA || {};
    root.SA.vary = factory(root.SA.rng, root.SA.color, root.SA.textBg);
  }
})(typeof self !== 'undefined' ? self : this, function (rng, color, textBg) {
  'use strict';

  const CLIP_COLORS = ['#ffffff', '#f4f4f4', '#111111'];
  const HIRAGANA = /[\u3040-\u309f]/;
  const KATAKANA = /[\u30a0-\u30ff\u31f0-\u31ff]/;
  const KATAKANA_STRETCH = /[\u30fc]/;
  const HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
  const LATIN = /[A-Za-z\u00c0-\u024f]/;
  const DIGIT = /[0-9\uff10-\uff19]/;
  const SKIPPABLE = /[\s\u3000]|[\p{P}\p{S}]/u;

  function classIndex(char) {
    const value = String(char == null ? '' : char);
    if (!value) return 5;
    if (KATAKANA_STRETCH.test(value)) return 2;
    if (HIRAGANA.test(value)) return 1;
    if (KATAKANA.test(value)) return 2;
    if (HAN.test(value)) return 0;
    if (LATIN.test(value)) return 3;
    if (DIGIT.test(value)) return 4;
    return 5;
  }

  function isSkippable(char) {
    const value = String(char == null ? '' : char);
    if (!value) return true;
    return SKIPPABLE.test(value);
  }

  function relativeLuminance(rgb) {
    const channel = (value) => (value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
    return 0.2126 * channel(rgb[0] || 0) + 0.7152 * channel(rgb[1] || 0) + 0.0722 * channel(rgb[2] || 0);
  }

  function parseHex(hex, fallback) {
    const rgba = color.parse(hex == null || hex === '' ? fallback || '#ffffff' : hex);
    return [rgba.r, rgba.g, rgba.b, rgba.a == null ? 1 : rgba.a];
  }

  function normalizeColors(list, palette) {
    const source = Array.isArray(list) && list.length ? list : null;
    if (source) return source.map((hex) => parseHex(hex, '#ffffff'));
    if (Array.isArray(palette) && palette.length) {
      const picks = [palette[3], palette[5], palette[4], palette[2]].filter(Boolean);
      if (picks.length) return picks.map((hex) => parseHex(hex, '#ffffff'));
    }
    return [];
  }

  /**
   * Per-letter background variation. Returns one entry per letter:
   * { visible, color[4], shapeIndex, sizeMul[2], offsetAdd[2], rotAdd, fgColor }
   */
  function letterVariation(params, letters, palette, seedKey) {
    const opts = params || {};
    const list = Array.isArray(letters) ? letters : [];
    const mode = opts.vary || 'none';
    const colors = normalizeColors(opts.varyColors, palette);
    const shapes = Array.isArray(opts.varyShapes) && opts.varyShapes.length ? opts.varyShapes : ['square', 'circle'];
    const shapeIndexMap = (textBg && textBg.SHAPES) || {};
    const skipSpaces = opts.skipSpaces !== false;
    const skipRate = Math.max(0, Math.min(1, Number(opts.skipRate) || 0));
    const varySize = Math.max(0, Number(opts.varySize) || 0);
    const varyOffset = Math.max(0, Number(opts.varyOffset) || 0);
    const varyRotation = Math.max(0, Number(opts.varyRotation) || 0);
    const random = rng.rngFor(seedKey, 'vary');
    const entries = [];

    // pass 1: decide visibility and the running index used by the colour modes
    let running = 0;
    const lineFirst = new Map();
    const lineLast = new Map();
    const visibleFirst = new Map();
    const visibleLast = new Map();
    for (let index = 0; index < list.length; index += 1) {
      const letter = list[index] || {};
      const char = letter.char || '';
      const skipped = (skipSpaces && isSkippable(char)) || (skipRate > 0 && random() < skipRate);
      const lineIdx = Number(letter.lineIdx) || 0;
      if (!lineFirst.has(lineIdx)) lineFirst.set(lineIdx, index);
      lineLast.set(lineIdx, index);
      entries.push({ visible: !skipped, lineIdx, char, skipped, running: -1 });
      if (!skipped) {
        entries[index].running = running;
        running += 1;
        if (!visibleFirst.has(lineIdx)) visibleFirst.set(lineIdx, index);
        visibleLast.set(lineIdx, index);
      }
    }

    // a line may never lose all of its background
    for (const [lineIdx, first] of lineFirst) {
      let visible = false;
      for (let index = first; index < entries.length; index += 1) {
        if (entries[index].lineIdx !== lineIdx) break;
        if (entries[index].visible) {
          visible = true;
          break;
        }
      }
      if (!visible) {
        const target = entries[lineLast.get(lineIdx)];
        target.visible = true;
        target.running = running;
        running += 1;
      }
    }

    let previousKey = null;
    const wordCounts = new Map();
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const letter = list[index] || {};
      const count = entry.visible ? entry.running : -1;
      let key = 0;
      if (entry.visible) {
        if (mode === 'alternate') key = count % 2;
        else if (mode === 'cycle') key = colors.length ? count % colors.length : 0;
        else if (mode === 'random') {
          if (colors.length) {
            key = Math.floor(random() * colors.length);
            if (colors.length > 1 && key === previousKey) key = (key + 1) % colors.length;
          }
        } else if (mode === 'charClass') key = classIndex(entry.char);
        else if (mode === 'word') {
          const wordKey = `${entry.lineIdx}:${Number(letter.wordIdx) || 0}`;
          if (!wordCounts.has(wordKey)) wordCounts.set(wordKey, wordCounts.size);
          key = wordCounts.get(wordKey);
        } else if (mode === 'line') key = entry.lineIdx;
        else if (mode === 'first') key = index === visibleFirst.get(entry.lineIdx) ? 0 : 1;
        else if (mode === 'last') key = index === visibleLast.get(entry.lineIdx) ? 0 : 1;
      }
      if (mode === 'first' || mode === 'last') {
        // only the first / last letter of the line keeps its background
        entry.visible = entry.visible && key === 0;
      }
      previousKey = key;
      const colorIndex = colors.length && entry.visible ? ((key % colors.length) + colors.length) % colors.length : -1;
      const rgb = colorIndex >= 0 ? colors[colorIndex] : [1, 1, 1, 1];
      const sizeMul = varySize > 0 ? [1 + (random() * 2 - 1) * varySize, 1 + (random() * 2 - 1) * varySize] : [1, 1];
      const offsetAdd = varyOffset > 0 ? [(random() * 2 - 1) * varyOffset, (random() * 2 - 1) * varyOffset] : [0, 0];
      const rotAdd = varyRotation > 0 ? (random() * 2 - 1) * varyRotation : 0;
      const shapeName = opts.varyShape ? shapes[Math.floor(random() * shapes.length) % shapes.length] : null;
      const fgColor =
        opts.fgAutoContrast && entry.visible
          ? relativeLuminance(rgb) > 0.5
            ? [0.067, 0.067, 0.067, 1]
            : [0.957, 0.957, 0.957, 1]
          : null;
      entries[index] = {
        visible: entry.visible && entry.running >= 0,
        color: rgb,
        shapeIndex: shapeName != null && shapeIndexMap[shapeName] != null ? shapeIndexMap[shapeName] : null,
        sizeMul,
        offsetAdd,
        rotAdd,
        fgColor,
      };
    }
    return entries;
  }

  return {
    classIndex,
    isSkippable,
    letterVariation,
    CLIP_COLORS,
  };
});
