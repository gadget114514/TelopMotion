(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else {
    root.SA = root.SA || {};
    root.SA.pageLayout = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COMMON_DEFAULTS = {
    margin: 0.06,
    gutter: 0.03,
    columns: 2,
    ruleStyle: 'solid', // 'solid' | 'double' | 'dotted' | 'none'
    paper: 'auto',      // 'auto' | 'none' | 'accent'
    decor: true,        // boolean
    accent: 'accent',   // palette role
    seed: 12345,
    decorLead: 0.15,
  };

  // Simple deterministic mulberry32 PRNG
  function createRng(seed) {
    let s = (Math.imul(seed || 12345, 1) >>> 0) || 12345;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function parseLines(ctx) {
    const rawText = ctx.text != null ? String(ctx.text) : '';
    if (ctx.lines && Array.isArray(ctx.lines) && ctx.lines.length > 0) {
      let offset = 0;
      return ctx.lines.map((l, idx) => {
        const text = typeof l === 'string' ? l : (l && l.text != null ? String(l.text) : '');
        const srcStart = (l && typeof l.srcStart === 'number') ? l.srcStart : offset;
        offset += Array.from(text).length + 1; // approximate +1 for newline
        return { index: idx, text, srcStart };
      });
    }

    if (!rawText) return [{ index: 0, text: '', srcStart: 0 }];

    const rawSplits = rawText.split(/\r?\n/);
    const result = [];
    let cpOffset = 0;
    for (let i = 0; i < rawSplits.length; i++) {
      const lineStr = rawSplits[i];
      result.push({
        index: i,
        text: lineStr,
        srcStart: cpOffset,
      });
      cpOffset += Array.from(lineStr).length + 1; // +1 for the newline
    }
    return result;
  }

  function splitMenuLine(line) {
    const raw = String(line || '').trim();
    if (!raw) return { name: '', price: '' };

    // 1. Tab
    if (raw.includes('\t')) {
      const parts = raw.split('\t');
      return { name: parts[0].trim(), price: parts.slice(1).join('\t').trim() };
    }
    // 2. ' | '
    if (raw.includes(' | ')) {
      const idx = raw.lastIndexOf(' | ');
      return { name: raw.slice(0, idx).trim(), price: raw.slice(idx + 3).trim() };
    }
    // 3. ' / '
    if (raw.includes(' / ')) {
      const idx = raw.lastIndexOf(' / ');
      return { name: raw.slice(0, idx).trim(), price: raw.slice(idx + 3).trim() };
    }
    // 4. Two or more spaces
    const multiSpaceMatch = /\s{2,}/.exec(raw);
    if (multiSpaceMatch) {
      const idx = multiSpaceMatch.index;
      const len = multiSpaceMatch[0].length;
      return { name: raw.slice(0, idx).trim(), price: raw.slice(idx + len).trim() };
    }
    // 5. Ending with currency sign (¥, $, €, 円) and number
    const currencyMatch = /^(.*?)(?:[\s・\.\-]+)?([¥\$€]\s*[\d,]+|[\d,]+\s*円)$/.exec(raw);
    if (currencyMatch && currencyMatch[1].trim()) {
      return { name: currencyMatch[1].trim(), price: currencyMatch[2].trim() };
    }

    return { name: raw, price: '' };
  }

  function staffPitch(char, index) {
    const code = (char ? char.codePointAt(0) : 60) || 60;
    const diatonicScale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];
    const step = diatonicScale[(code + index * 3) % diatonicScale.length];
    return step;
  }

  function splitColumns(lines, numCols) {
    if (!lines || lines.length === 0) return [];
    if (numCols <= 1 || lines.length <= 1) {
      return [{
        lines,
        text: lines.map((l) => l.text).join('\n'),
        srcStart: lines[0] ? lines[0].srcStart : 0,
      }];
    }
    const totalChars = lines.reduce((sum, l) => sum + Array.from(l.text || '').length, 0);
    const targetPerCol = Math.max(1, Math.ceil(totalChars / numCols));
    const cols = [];
    let currentCol = [];
    let currentCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const len = Array.from(l.text || '').length;
      currentCol.push(l);
      currentCount += len;
      if (currentCount >= targetPerCol && cols.length < numCols - 1 && i < lines.length - 1) {
        cols.push({
          lines: currentCol,
          text: currentCol.map((x) => x.text).join('\n'),
          srcStart: currentCol[0].srcStart,
        });
        currentCol = [];
        currentCount = 0;
      }
    }
    if (currentCol.length > 0) {
      cols.push({
        lines: currentCol,
        text: currentCol.map((x) => x.text).join('\n'),
        srcStart: currentCol[0].srcStart,
      });
    }
    return cols;
  }

  const PRESETS = {
    none: {
      label: 'None',
      tags: ['plain'],
      params: {},
      build(ctx) {
        const W = ctx.frame.w;
        const H = ctx.frame.h;
        return {
          page: { w: W, h: H },
          regions: [
            {
              id: 'body',
              role: 'body',
              rect: { x: 0, y: 0, w: W, h: H },
              text: ctx.text || '',
              srcStart: 0,
              flow: 'flow',
              style: {},
            },
          ],
          decor: [],
        };
      },
    },

    flushLeft: {
      label: 'Flush Left',
      tags: ['clean', 'modern'],
      params: {
        margin: { type: 'number', default: 0.08, min: 0.02, max: 0.3, step: 0.01 },
      },
      build(ctx, params) {
        const W = ctx.frame.w;
        const H = ctx.frame.h;
        const p = Object.assign({}, COMMON_DEFAULTS, params);
        const m = p.margin * Math.min(W, H);
        const w = (W - 2 * m) * 0.85;
        const h = H - 2 * m;
        return {
          page: { w: W, h: H },
          regions: [
            {
              id: 'body',
              role: 'body',
              rect: { x: m, y: m, w, h },
              text: ctx.text || '',
              srcStart: 0,
              flow: 'flow',
              style: { align: 'left' },
            },
          ],
          decor: [],
        };
      },
    },

    center: {
      label: 'Center',
      tags: ['classic', 'clean'],
      params: {
        margin: { type: 'number', default: 0.08, min: 0.02, max: 0.3, step: 0.01 },
      },
      build(ctx, params) {
        const W = ctx.frame.w;
        const H = ctx.frame.h;
        const p = Object.assign({}, COMMON_DEFAULTS, params);
        const m = p.margin * Math.min(W, H);
        const w = W - 2 * m;
        const h = H - 2 * m;
        return {
          page: { w: W, h: H },
          regions: [
            {
              id: 'body',
              role: 'body',
              rect: { x: m, y: m, w, h },
              text: ctx.text || '',
              srcStart: 0,
              flow: 'flow',
              style: { align: 'center' },
            },
          ],
          decor: [],
        };
      },
    },

    flushRight: {
      label: 'Flush Right',
      tags: ['modern', 'accent'],
      params: {
        margin: { type: 'number', default: 0.08, min: 0.02, max: 0.3, step: 0.01 },
      },
      build(ctx, params) {
        const W = ctx.frame.w;
        const H = ctx.frame.h;
        const p = Object.assign({}, COMMON_DEFAULTS, params);
        const m = p.margin * Math.min(W, H);
        const w = (W - 2 * m) * 0.85;
        const h = H - 2 * m;
        return {
          page: { w: W, h: H },
          regions: [
            {
              id: 'body',
              role: 'body',
              rect: { x: W - m - w, y: m, w, h },
              text: ctx.text || '',
              srcStart: 0,
              flow: 'flow',
              style: { align: 'right' },
            },
          ],
          decor: [],
        };
      },
    },

    justify: {
      label: 'Justify',
      tags: ['editorial', 'newspaper'],
      params: {
        margin: { type: 'number', default: 0.08, min: 0.02, max: 0.3, step: 0.01 },
      },
      build(ctx, params) {
        const W = ctx.frame.w;
        const H = ctx.frame.h;
        const p = Object.assign({}, COMMON_DEFAULTS, params);
        const m = p.margin * Math.min(W, H);
        const w = W - 2 * m;
        const h = H - 2 * m;
        return {
          page: { w: W, h: H },
          regions: [
            {
              id: 'body',
              role: 'body',
              rect: { x: m, y: m, w, h },
              text: ctx.text || '',
              srcStart: 0,
              flow: 'flow',
              style: { justify: true, align: 'left' },
            },
          ],
          decor: [],
        };
      },
    },

    vertical: {
      label: 'Vertical',
      tags: ['japanese', 'traditional'],
      params: {
        margin: { type: 'number', default: 0.08, min: 0.02, max: 0.3, step: 0.01 },
        align: { type: 'select', default: 'top', options: ['top', 'center', 'bottom'] },
      },
      build(ctx, params) {
        const W = ctx.frame.w;
        const H = ctx.frame.h;
        const p = Object.assign({}, COMMON_DEFAULTS, params);
        const m = p.margin * Math.min(W, H);
        const w = W - 2 * m;
        const h = H - 2 * m;
        return {
          page: { w: W, h: H },
          regions: [
            {
              id: 'body',
              role: 'body',
              rect: { x: m, y: m, w, h },
              text: ctx.text || '',
              srcStart: 0,
              flow: 'flow',
              style: { direction: 'vertical', align: p.align || 'top' },
            },
          ],
          decor: [],
        };
      },
    },

    grid: {
      label: 'Grid',
      tags: ['mosaic', 'poster'],
      params: {
        cols: { type: 'int', default: 8, min: 2, max: 24 },
        gap: { type: 'number', default: 8, min: 0, max: 40 },
        margin: { type: 'number', default: 0.08, min: 0.02, max: 0.3, step: 0.01 },
      },
      build(ctx, params) {
        const W = ctx.frame.w;
        const H = ctx.frame.h;
        const p = Object.assign({}, COMMON_DEFAULTS, params);
        const m = p.margin * Math.min(W, H);
        const w = W - 2 * m;
        const h = H - 2 * m;
        const cols = Math.max(2, Math.min(24, Math.round(Number(p.cols) || 8)));
        const chars = Array.from(ctx.text || '').filter((c) => !/\s/.test(c));
        const totalChars = Math.max(1, chars.length);
        const rows = Math.max(1, Math.ceil(totalChars / cols));
        const cellW = (w - (cols - 1) * p.gap) / cols;
        const cellH = Math.max(12, Math.min(cellW, (h - (rows - 1) * p.gap) / rows));
        return {
          page: { w: W, h: H },
          regions: [
            {
              id: 'gridBody',
              role: 'body',
              rect: { x: m, y: m, w, h: Math.min(h, rows * cellH + (rows - 1) * p.gap) },
              text: ctx.text || '',
              srcStart: 0,
              flow: 'cells',
              cells: { cols, rows, pitchX: cellW + p.gap, pitchY: cellH + p.gap, cellW, cellH, vertical: false },
              style: { align: 'center' },
            },
          ],
          decor: [],
        };
      },
    },

    magazine: {
      label: 'Magazine',
      tags: ['editorial', 'magazine'],
      params: {
        margin: { type: 'number', default: 0.06, min: 0.02, max: 0.2, step: 0.01 },
        gutter: { type: 'number', default: 0.03, min: 0.01, max: 0.1, step: 0.005 },
        decor: { type: 'bool', default: true },
      },
      build(ctx, params) {
        const W = ctx.frame.w;
        const H = ctx.frame.h;
        const p = Object.assign({}, COMMON_DEFAULTS, params);
        const m = p.margin * Math.min(W, H);
        const g = p.gutter * Math.min(W, H);
        const contentW = W - 2 * m;
        const contentH = H - 2 * m;
        const lines = ctx.lines || [];

        if (lines.length <= 1) {
          return {
            page: { w: W, h: H },
            regions: [
              {
                id: 'hero',
                role: 'hero',
                rect: { x: m, y: m, w: contentW, h: contentH },
                text: lines[0] ? lines[0].text : ctx.text || '',
                srcStart: lines[0] ? lines[0].srcStart : 0,
                flow: 'flow',
                style: { sizeScale: 1.4, weight: 'bold', align: 'left' },
              },
            ],
            decor: p.decor ? [
              { kind: 'line', role: 'rule', x0: m, y0: m + contentH * 0.4, x1: m + contentW * 0.8, y1: m + contentH * 0.4, lineWidth: 3 },
            ] : [],
          };
        }

        const heroH = contentH * 0.32;
        const deckH = lines.length > 2 ? contentH * 0.18 : 0;
        const bylineW = contentW * 0.18;
        const mainW = contentW - bylineW - g;
        const bodyTop = m + heroH + g + (deckH > 0 ? deckH + g : 0);
        const bodyH = Math.max(20, (m + contentH) - bodyTop);

        const regions = [
          {
            id: 'hero',
            role: 'hero',
            rect: { x: m, y: m, w: mainW, h: heroH },
            text: lines[0].text,
            srcStart: lines[0].srcStart,
            flow: 'flow',
            style: { sizeScale: 1.5, weight: 'bold', align: 'left' },
          },
        ];

        let restLines = lines.slice(1);
        if (deckH > 0 && restLines.length > 0) {
          regions.push({
            id: 'deck',
            role: 'deck',
            rect: { x: m, y: m + heroH + g, w: mainW, h: deckH },
            text: restLines[0].text,
            srcStart: restLines[0].srcStart,
            flow: 'flow',
            style: { sizeScale: 1.05, lineHeight: 1.3, align: 'left' },
          });
          restLines = restLines.slice(1);
        }

        // Byline: last line if at least 2 body lines remain
        let bylineLine = null;
        if (restLines.length >= 3) {
          bylineLine = restLines.pop();
        }

        // Split remaining body into 1 or 2 columns
        const numCols = ctx.aspect > 1 ? 2 : 1;
        const colW = (mainW - (numCols - 1) * g) / numCols;
        const colChunks = splitColumns(restLines, numCols);

        colChunks.forEach((col, i) => {
          regions.push({
            id: `body_${i}`,
            role: 'body',
            rect: { x: m + i * (colW + g), y: bodyTop, w: colW, h: bodyH },
            text: col.text,
            srcStart: col.srcStart,
            flow: 'flow',
            style: { sizeScale: 0.85, justify: true, align: 'left' },
          });
        });

        if (bylineLine) {
          regions.push({
            id: 'byline',
            role: 'byline',
            rect: { x: W - m - bylineW, y: m, w: bylineW, h: contentH },
            text: bylineLine.text,
            srcStart: bylineLine.srcStart,
            flow: 'flow',
            style: { sizeScale: 0.65, color: 'muted', align: 'right' },
          });
        }

        const decor = [];
        if (p.decor) {
          // Thick rule below hero
          decor.push({ kind: 'line', role: 'rule', x0: m, y0: m + heroH + g * 0.5, x1: m + mainW, y1: m + heroH + g * 0.5, lineWidth: 3 });
          // Vertical rule between main and byline
          if (bylineLine) {
            decor.push({ kind: 'line', role: 'rule', x0: W - m - bylineW - g * 0.5, y0: m, x1: W - m - bylineW - g * 0.5, y1: H - m, lineWidth: 1 });
          }
          // Vertical rule between columns
          if (numCols > 1 && colChunks.length > 1) {
            decor.push({ kind: 'line', role: 'rule', x0: m + colW + g * 0.5, y0: bodyTop, x1: m + colW + g * 0.5, y1: H - m, lineWidth: 1 });
          }
          // Small accent rectangle (folio / page number style)
          decor.push({ kind: 'rect', role: 'accent', x: m, y: H - m + 4, w: 28, h: 5 });
        }

        return { page: { w: W, h: H }, regions, decor };
      },
    },

    fashion: {
      label: 'Fashion',
      tags: ['minimal', 'fashion', 'editorial'],
      params: {
        margin: { type: 'number', default: 0.1, min: 0.04, max: 0.25, step: 0.01 },
        decor: { type: 'bool', default: true },
      },
      build(ctx, params) {
        const W = ctx.frame.w;
        const H = ctx.frame.h;
        const p = Object.assign({}, COMMON_DEFAULTS, params);
        const m = p.margin * Math.min(W, H);
        const contentW = W - 2 * m;
        const contentH = H - 2 * m;
        const lines = ctx.lines || [];

        const headLine = lines[0] ? lines[0] : { text: ctx.text || '', srcStart: 0 };
        const bodyLines = lines.slice(1);
        const headH = contentH * 0.35;
        const bodyH = contentH * 0.55;

        const regions = [
          {
            id: 'headline',
            role: 'headline',
            rect: { x: m, y: m, w: contentW, h: headH },
            text: headLine.text,
            srcStart: headLine.srcStart,
            flow: 'flow',
            style: { sizeScale: 1.1, upper: true, letterSpacing: 8, align: 'center', weight: 'thin' },
          },
        ];

        if (bodyLines.length > 0) {
          const bodyW = contentW * 0.7;
          regions.push({
            id: 'body',
            role: 'body',
            rect: { x: m + (contentW - bodyW) / 2, y: m + headH + contentH * 0.1, w: bodyW, h: bodyH },
            text: bodyLines.map((l) => l.text).join('\n'),
            srcStart: bodyLines[0].srcStart,
            flow: 'flow',
            style: { sizeScale: 0.85, lineHeight: 2.0, align: 'center' },
          });
        }

        const decor = [];
        if (p.decor) {
          const cl = Math.min(W, H) * 0.04;
          const cornerPad = m * 0.6;
          // Four L-shaped corner rules
          // Top-left
          decor.push({ kind: 'line', role: 'rule', x0: cornerPad, y0: cornerPad, x1: cornerPad + cl, y1: cornerPad, lineWidth: 1 });
          decor.push({ kind: 'line', role: 'rule', x0: cornerPad, y0: cornerPad, x1: cornerPad, y1: cornerPad + cl, lineWidth: 1 });
          // Top-right
          decor.push({ kind: 'line', role: 'rule', x0: W - cornerPad, y0: cornerPad, x1: W - cornerPad - cl, y1: cornerPad, lineWidth: 1 });
          decor.push({ kind: 'line', role: 'rule', x0: W - cornerPad, y0: cornerPad, x1: W - cornerPad, y1: cornerPad + cl, lineWidth: 1 });
          // Bottom-left
          decor.push({ kind: 'line', role: 'rule', x0: cornerPad, y0: H - cornerPad, x1: cornerPad + cl, y1: H - cornerPad, lineWidth: 1 });
          decor.push({ kind: 'line', role: 'rule', x0: cornerPad, y0: H - cornerPad, x1: cornerPad, y1: H - cornerPad - cl, lineWidth: 1 });
          // Bottom-right
          decor.push({ kind: 'line', role: 'rule', x0: W - cornerPad, y0: H - cornerPad, x1: W - cornerPad - cl, y1: H - cornerPad, lineWidth: 1 });
          decor.push({ kind: 'line', role: 'rule', x0: W - cornerPad, y0: H - cornerPad, x1: W - cornerPad, y1: H - cornerPad - cl, lineWidth: 1 });
          // Center vertical accent line between headline and body
          const midY = m + headH + contentH * 0.05;
          decor.push({ kind: 'line', role: 'accent', x0: W / 2, y0: midY - 12, x1: W / 2, y1: midY + 12, lineWidth: 1 });
        }

        return { page: { w: W, h: H }, regions, decor };
      },
    },

    newspaper: {
      label: 'Newspaper',
      tags: ['editorial', 'newspaper'],
      params: {
        margin: { type: 'number', default: 0.06, min: 0.02, max: 0.2, step: 0.01 },
        gutter: { type: 'number', default: 0.025, min: 0.01, max: 0.08, step: 0.005 },
        columns: { type: 'int', default: 3, min: 1, max: 6 },
        dropCap: { type: 'bool', default: false },
        decor: { type: 'bool', default: true },
      },
      build(ctx, params) {
        const W = ctx.frame.w;
        const H = ctx.frame.h;
        const p = Object.assign({}, COMMON_DEFAULTS, params);
        const m = p.margin * Math.min(W, H);
        const g = p.gutter * Math.min(W, H);
        const contentW = W - 2 * m;
        const contentH = H - 2 * m;
        const lines = ctx.lines || [];

        if (lines.length <= 1) {
          return {
            page: { w: W, h: H },
            regions: [
              {
                id: 'headline',
                role: 'headline',
                rect: { x: m, y: m, w: contentW, h: contentH },
                text: lines[0] ? lines[0].text : ctx.text || '',
                srcStart: lines[0] ? lines[0].srcStart : 0,
                flow: 'flow',
                style: { sizeScale: 1.5, weight: 'bold', align: 'center' },
              },
            ],
            decor: p.decor ? [
              { kind: 'line', role: 'rule', x0: m, y0: m + contentH * 0.5, x1: W - m, y1: m + contentH * 0.5, lineWidth: 2 },
            ] : [],
          };
        }

        const headH = contentH * 0.28;
        const colTop = m + headH + g;
        const colH = Math.max(20, H - m - colTop);
        const rawCols = Math.max(1, Math.min(6, Math.round(Number(p.columns) || 3)));
        const numCols = ctx.aspect < 0.9 ? Math.min(rawCols, 2) : rawCols;
        const colW = (contentW - (numCols - 1) * g) / numCols;

        const regions = [
          {
            id: 'headline',
            role: 'headline',
            rect: { x: m, y: m, w: contentW, h: headH },
            text: lines[0].text,
            srcStart: lines[0].srcStart,
            flow: 'flow',
            style: { sizeScale: 1.6, weight: 'bold', align: 'center' },
          },
        ];

        const bodyLines = lines.slice(1);
        const colChunks = splitColumns(bodyLines, numCols);

        colChunks.forEach((col, i) => {
          regions.push({
            id: `col_${i}`,
            role: 'body',
            rect: { x: m + i * (colW + g), y: colTop, w: colW, h: colH },
            text: col.text,
            srcStart: col.srcStart,
            flow: 'flow',
            style: { sizeScale: 0.85, justify: true, align: 'left' },
          });
        });

        const decor = [];
        if (p.decor) {
          // Double horizontal rule below headline
          decor.push({ kind: 'line', role: 'rule', x0: m, y0: m + headH + 2, x1: W - m, y1: m + headH + 2, lineWidth: 2 });
          decor.push({ kind: 'line', role: 'rule', x0: m, y0: m + headH + 6, x1: W - m, y1: m + headH + 6, lineWidth: 1 });
          // Top horizontal rule above headline
          decor.push({ kind: 'line', role: 'rule', x0: m, y0: m - 4, x1: W - m, y1: m - 4, lineWidth: 1 });
          // Vertical rules between columns
          for (let i = 0; i < numCols - 1 && i < colChunks.length - 1; i++) {
            const rx = m + (i + 1) * colW + (i + 0.5) * g;
            decor.push({ kind: 'line', role: 'rule', x0: rx, y0: colTop, x1: rx, y1: colTop + colH, lineWidth: 1 });
          }
        }

        return { page: { w: W, h: H }, regions, decor };
      },
    },

    twoColumn: {
      label: 'Two Column',
      tags: ['editorial', 'columns'],
      params: {
        margin: { type: 'number', default: 0.08, min: 0.02, max: 0.25, step: 0.01 },
        gutter: { type: 'number', default: 0.04, min: 0.01, max: 0.1, step: 0.005 },
        decor: { type: 'bool', default: true },
      },
      build(ctx, params) {
        const W = ctx.frame.w;
        const H = ctx.frame.h;
        const p = Object.assign({}, COMMON_DEFAULTS, params);
        const m = p.margin * Math.min(W, H);
        const g = p.gutter * Math.min(W, H);
        const contentW = W - 2 * m;
        const contentH = H - 2 * m;
        const numCols = ctx.aspect < 0.8 ? 1 : 2;
        const colW = (contentW - (numCols - 1) * g) / numCols;
        const lines = ctx.lines || [];
        const colChunks = splitColumns(lines, numCols);

        const regions = colChunks.map((col, i) => ({
          id: `col_${i}`,
          role: 'body',
          rect: { x: m + i * (colW + g), y: m, w: colW, h: contentH },
          text: col.text,
          srcStart: col.srcStart,
          flow: 'flow',
          style: { justify: true, align: 'left' },
        }));

        const decor = [];
        if (p.decor && numCols > 1 && colChunks.length > 1) {
          decor.push({ kind: 'line', role: 'rule', x0: m + colW + g * 0.5, y0: m, x1: m + colW + g * 0.5, y1: H - m, lineWidth: 1 });
        }

        return { page: { w: W, h: H }, regions, decor };
      },
    },

    threeColumn: {
      label: 'Three Column',
      tags: ['editorial', 'columns'],
      params: {
        margin: { type: 'number', default: 0.06, min: 0.02, max: 0.2, step: 0.01 },
        gutter: { type: 'number', default: 0.03, min: 0.01, max: 0.1, step: 0.005 },
        decor: { type: 'bool', default: true },
      },
      build(ctx, params) {
        const W = ctx.frame.w;
        const H = ctx.frame.h;
        const p = Object.assign({}, COMMON_DEFAULTS, params);
        const m = p.margin * Math.min(W, H);
        const g = p.gutter * Math.min(W, H);
        const contentW = W - 2 * m;
        const contentH = H - 2 * m;
        const numCols = ctx.aspect < 0.8 ? 1 : (ctx.aspect < 1.2 ? 2 : 3);
        const colW = (contentW - (numCols - 1) * g) / numCols;
        const lines = ctx.lines || [];
        const colChunks = splitColumns(lines, numCols);

        const regions = colChunks.map((col, i) => ({
          id: `col_${i}`,
          role: 'body',
          rect: { x: m + i * (colW + g), y: m, w: colW, h: contentH },
          text: col.text,
          srcStart: col.srcStart,
          flow: 'flow',
          style: { justify: true, align: 'left' },
        }));

        const decor = [];
        if (p.decor && numCols > 1) {
          for (let i = 0; i < numCols - 1 && i < colChunks.length - 1; i++) {
            const rx = m + (i + 1) * colW + (i + 0.5) * g;
            decor.push({ kind: 'line', role: 'rule', x0: rx, y0: m, x1: rx, y1: H - m, lineWidth: 1 });
          }
        }

        return { page: { w: W, h: H }, regions, decor };
      },
    },

    manuscript: {
      label: 'Manuscript (原稿用紙)',
      tags: ['japanese', 'traditional', 'cells'],
      params: {
        cols: { type: 'int', default: 20, min: 5, max: 30 },
        rows: { type: 'int', default: 20, min: 5, max: 30 },
        vertical: { type: 'bool', default: true },
        margin: { type: 'number', default: 0.08, min: 0.02, max: 0.2, step: 0.01 },
        decor: { type: 'bool', default: true },
      },
      build(ctx, params) {
        const W = ctx.frame.w;
        const H = ctx.frame.h;
        const p = Object.assign({}, COMMON_DEFAULTS, params);
        const m = p.margin * Math.min(W, H);
        const gridW = W - 2 * m;
        const gridH = H - 2 * m;
        const vertical = p.vertical !== false;
        const cols = Math.max(5, Math.min(30, Math.round(Number(p.cols) || (ctx.aspect > 1 ? 20 : 12))));
        const rows = Math.max(5, Math.min(30, Math.round(Number(p.rows) || (ctx.aspect > 1 ? 20 : 16))));
        const cellW = gridW / cols;
        const cellH = gridH / rows;
        const minDim = Math.min(cellW, cellH);

        const regions = [
          {
            id: 'manuscriptGrid',
            role: 'body',
            rect: { x: m, y: m, w: gridW, h: gridH },
            text: ctx.text || '',
            srcStart: 0,
            flow: 'cells',
            cells: { cols, rows, pitchX: cellW, pitchY: cellH, cellW, cellH, vertical },
            style: {
              vertical,
              sizeScale: Math.max(0.3, Math.min(1.5, (minDim * 0.75) / (ctx.size || 48))),
              align: 'center',
            },
          },
        ];

        const decor = [];
        if (p.decor) {
          // Paper background
          decor.push({ kind: 'rect', role: 'paper', x: m, y: m, w: gridW, h: gridH, radius: 2 });
          // Outer border
          decor.push({ kind: 'rect', role: 'rule', x: m, y: m, w: gridW, h: gridH, stroke: 1.5 });
          // Grid cells with center fishTail ornament
          decor.push({
            kind: 'cells',
            role: 'rule',
            x: m,
            y: m,
            w: gridW,
            h: gridH,
            cols,
            rows,
            cellW,
            cellH,
            fishTail: true,
          });
        }

        return { page: { w: W, h: H }, regions, decor };
      },
    },

    xCard: {
      label: 'X Card',
      tags: ['ui', 'social', 'card'],
      params: {
        decor: { type: 'bool', default: true },
      },
      build(ctx, params) {
        const W = ctx.frame.w;
        const H = ctx.frame.h;
        const p = Object.assign({}, COMMON_DEFAULTS, params);
        const cardW = ctx.aspect > 1 ? Math.min(W * 0.55, 900) : Math.min(W * 0.88, 700);
        const cardH = Math.min(H * 0.72, 600);
        const cardX = (W - cardW) / 2;
        const cardY = (H - cardH) / 2;
        const lines = ctx.lines || [];

        const nameLine = lines[0] ? lines[0] : { text: 'User', srcStart: 0 };
        const bodyLines = lines.slice(1);
        let timeLine = null;
        if (bodyLines.length >= 2) {
          timeLine = bodyLines.pop();
        }

        const regions = [
          {
            id: 'name',
            role: 'name',
            rect: { x: cardX + 72, y: cardY + 22, w: cardW - 120, h: 32 },
            text: nameLine.text,
            srcStart: nameLine.srcStart,
            flow: 'flow',
            style: { sizeScale: 1.05, weight: 'bold', align: 'left' },
          },
        ];

        const bottomLineY = cardY + cardH - 52;
        const bodyH = Math.max(30, bottomLineY - (cardY + 68) - 10);
        if (bodyLines.length > 0) {
          regions.push({
            id: 'body',
            role: 'body',
            rect: { x: cardX + 28, y: cardY + 68, w: cardW - 56, h: bodyH },
            text: bodyLines.map((l) => l.text).join('\n'),
            srcStart: bodyLines[0].srcStart,
            flow: 'flow',
            style: { sizeScale: 1.25, lineHeight: 1.4, align: 'left' },
          });
        }

        if (timeLine) {
          regions.push({
            id: 'time',
            role: 'caption',
            rect: { x: cardX + 28, y: bottomLineY - 26, w: cardW - 56, h: 22 },
            text: timeLine.text,
            srcStart: timeLine.srcStart,
            flow: 'flow',
            style: { sizeScale: 0.75, color: 'muted', align: 'left' },
          });
        }

        const decor = [];
        if (p.decor) {
          // Card paper background
          decor.push({ kind: 'roundRect', role: 'paper', x: cardX, y: cardY, w: cardW, h: cardH, radius: 16 });
          // Card border
          decor.push({ kind: 'rect', role: 'rule', x: cardX, y: cardY, w: cardW, h: cardH, radius: 16, stroke: 1 });
          // Avatar circle
          decor.push({ kind: 'circle', role: 'avatar', x: cardX + 42, y: cardY + 38, r: 20 });
          // Top-right X mark (two lines)
          const rx = cardX + cardW - 32;
          const ry = cardY + 30;
          decor.push({ kind: 'line', role: 'rule', x0: rx - 6, y0: ry - 6, x1: rx + 6, y1: ry + 6, lineWidth: 1.5 });
          decor.push({ kind: 'line', role: 'rule', x0: rx + 6, y0: ry - 6, x1: rx - 6, y1: ry + 6, lineWidth: 1.5 });
          // Bottom separator rule
          decor.push({ kind: 'line', role: 'rule', x0: cardX + 24, y0: bottomLineY, x1: cardX + cardW - 24, y1: bottomLineY, lineWidth: 1 });
          // Action icons (rings)
          for (let i = 0; i < 4; i++) {
            const ix = cardX + cardW * (0.2 + i * 0.2);
            decor.push({ kind: 'ring', role: 'muted', x: ix, y: cardY + cardH - 26, r: 6, thickness: 1.5 });
          }
        }

        return { page: { w: W, h: H }, regions, decor };
      },
    },

    chatBubble: {
      label: 'Chat Bubble',
      tags: ['ui', 'chat', 'bubble'],
      params: {
        margin: { type: 'number', default: 0.08, min: 0.02, max: 0.2, step: 0.01 },
        typing: { type: 'bool', default: true },
        decor: { type: 'bool', default: true },
      },
      build(ctx, params) {
        const W = ctx.frame.w;
        const H = ctx.frame.h;
        const p = Object.assign({}, COMMON_DEFAULTS, params);
        const m = p.margin * Math.min(W, H);
        const contentW = W - 2 * m;
        const contentH = H - 2 * m;
        const lines = ctx.lines || [];
        const n = Math.max(1, lines.length);
        const maxBubbleW = contentW * 0.7;
        const rowH = Math.min(68, contentH / (n + (p.typing ? 0.8 : 0)));

        const regions = [];
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          const isLeft = (i % 2 === 0);
          const rx = isLeft ? m : W - m - maxBubbleW;
          const ry = m + i * rowH;
          regions.push({
            id: `bubble_${i}`,
            role: 'bubble',
            rect: { x: rx, y: ry, w: maxBubbleW, h: rowH },
            text: l.text,
            srcStart: l.srcStart,
            flow: 'bubble',
            style: { sizeScale: 0.95, align: isLeft ? 'left' : 'right' },
          });
        }

        const decor = [];
        if (p.decor && p.typing) {
          // Typing dots indicator below last bubble
          const lastLeft = (lines.length % 2 === 0);
          const dotBaseX = lastLeft ? m + 24 : W - m - 60;
          const dotBaseY = m + lines.length * rowH + 16;
          for (let d = 0; d < 3; d++) {
            decor.push({ kind: 'circle', role: 'accent', x: dotBaseX + d * 14, y: dotBaseY, r: 4 });
          }
        }

        return { page: { w: W, h: H }, regions, decor };
      },
    },

    cafeSign: {
      label: 'Cafe Sign (看板)',
      tags: ['shop', 'cafe', 'retro'],
      params: {
        decor: { type: 'bool', default: true },
      },
      build(ctx, params) {
        const W = ctx.frame.w;
        const H = ctx.frame.h;
        const p = Object.assign({}, COMMON_DEFAULTS, params);
        const boardW = Math.min(W * 0.78, 1000);
        const boardH = Math.min(H * 0.82, 750);
        const boardX = (W - boardW) / 2;
        const boardY = (H - boardH) / 2;
        const lines = ctx.lines || [];

        const headLine = lines[0] ? lines[0] : { text: ctx.text || '', srcStart: 0 };
        const subLines = lines.slice(1);
        const headH = boardH * 0.38;

        const regions = [
          {
            id: 'headline',
            role: 'headline',
            rect: { x: boardX + 36, y: boardY + 36, w: boardW - 72, h: headH },
            text: headLine.text,
            srcStart: headLine.srcStart,
            flow: 'flow',
            style: { sizeScale: 1.7, weight: 'bold', align: 'center' },
          },
        ];

        if (subLines.length > 0) {
          regions.push({
            id: 'sub',
            role: 'body',
            rect: { x: boardX + 36, y: boardY + headH + 48, w: boardW - 72, h: boardH - headH - 100 },
            text: subLines.map((l) => l.text).join('\n'),
            srcStart: subLines[0].srcStart,
            flow: 'flow',
            style: { sizeScale: 1.05, lineHeight: 1.6, align: 'center' },
          });
        }

        const decor = [];
        if (p.decor) {
          // Blackboard base
          decor.push({ kind: 'roundRect', role: 'paper', x: boardX, y: boardY, w: boardW, h: boardH, radius: 12 });
          // Outer chalk frame
          decor.push({ kind: 'rect', role: 'rule', x: boardX + 12, y: boardY + 12, w: boardW - 24, h: boardH - 24, radius: 8, stroke: 2 });
          // Inner chalk frame
          decor.push({ kind: 'rect', role: 'rule', x: boardX + 18, y: boardY + 18, w: boardW - 36, h: boardH - 36, radius: 4, stroke: 1 });
          // Divider dash line
          decor.push({ kind: 'line', role: 'rule', x0: boardX + boardW * 0.25, y0: boardY + headH + 40, x1: boardX + boardW * 0.75, y1: boardY + headH + 40, lineWidth: 2, dash: [8, 6, 0] });
          // Corner stars / ornament rings
          const cp = 28;
          decor.push({ kind: 'ring', role: 'accent', x: boardX + cp, y: boardY + cp, r: 4, thickness: 1 });
          decor.push({ kind: 'ring', role: 'accent', x: boardX + boardW - cp, y: boardY + cp, r: 4, thickness: 1 });
          decor.push({ kind: 'ring', role: 'accent', x: boardX + cp, y: boardY + boardH - cp, r: 4, thickness: 1 });
          decor.push({ kind: 'ring', role: 'accent', x: boardX + boardW - cp, y: boardY + boardH - cp, r: 4, thickness: 1 });
        }

        return { page: { w: W, h: H }, regions, decor };
      },
    },

    cafeMenu: {
      label: 'Cafe Menu (メニュー)',
      tags: ['shop', 'menu', 'cafe'],
      params: {
        decor: { type: 'bool', default: true },
      },
      build(ctx, params) {
        const W = ctx.frame.w;
        const H = ctx.frame.h;
        const p = Object.assign({}, COMMON_DEFAULTS, params);
        const menuW = Math.min(W * 0.75, 1000);
        const menuH = Math.min(H * 0.85, 800);
        const menuX = (W - menuW) / 2;
        const menuY = (H - menuH) / 2;
        const lines = ctx.lines || [];

        const titleLine = lines[0] ? lines[0] : { text: 'MENU', srcStart: 0 };
        const itemLines = lines.slice(1);

        const regions = [
          {
            id: 'title',
            role: 'headline',
            rect: { x: menuX + 36, y: menuY + 24, w: menuW - 72, h: 48 },
            text: titleLine.text,
            srcStart: titleLine.srcStart,
            flow: 'flow',
            style: { sizeScale: 1.4, weight: 'bold', align: 'center' },
          },
        ];

        const decor = [];
        if (p.decor) {
          // Outer border
          decor.push({ kind: 'rect', role: 'rule', x: menuX, y: menuY, w: menuW, h: menuH, stroke: 1.5 });
          // Title bottom divider
          decor.push({ kind: 'line', role: 'rule', x0: menuX + 36, y0: menuY + 76, x1: menuX + menuW - 36, y1: menuY + 76, lineWidth: 1.5 });
        }

        if (itemLines.length > 0) {
          const rowH = Math.min(46, (menuH - 120) / itemLines.length);
          for (let i = 0; i < itemLines.length; i++) {
            const lineObj = itemLines[i];
            const parsed = splitMenuLine(lineObj.text);
            const rowY = menuY + 92 + i * rowH;
            const nameW = (menuW - 72) * 0.65;
            const priceW = (menuW - 72) * 0.28;

            regions.push({
              id: `item_name_${i}`,
              role: 'name',
              rect: { x: menuX + 36, y: rowY, w: nameW, h: rowH },
              text: parsed.name,
              srcStart: lineObj.srcStart,
              flow: 'flow',
              style: { sizeScale: 0.95, align: 'left' },
            });

            if (parsed.price) {
              regions.push({
                id: `item_price_${i}`,
                role: 'price',
                rect: { x: menuX + menuW - 36 - priceW, y: rowY, w: priceW, h: rowH },
                text: parsed.price,
                srcStart: null, // converted text
                flow: 'flow',
                style: { sizeScale: 0.95, align: 'right' },
              });

              if (p.decor) {
                // Dot leader between name and price
                const lx0 = menuX + 36 + nameW * 0.6;
                const lx1 = menuX + menuW - 36 - priceW - 10;
                if (lx1 > lx0 + 20) {
                  decor.push({ kind: 'line', role: 'muted', x0: lx0, y0: rowY + rowH * 0.55, x1: lx1, y1: rowY + rowH * 0.55, lineWidth: 1, dash: [2, 5, 0] });
                }
              }
            }
          }
        }

        return { page: { w: W, h: H }, regions, decor };
      },
    },

    boutique: {
      label: 'Boutique',
      tags: ['shop', 'boutique', 'minimal'],
      params: {
        decor: { type: 'bool', default: true },
      },
      build(ctx, params) {
        const W = ctx.frame.w;
        const H = ctx.frame.h;
        const p = Object.assign({}, COMMON_DEFAULTS, params);
        const m = Math.min(W, H) * 0.12;
        const contentW = W - 2 * m;
        const contentH = H - 2 * m;
        const lines = ctx.lines || [];

        const titleLine = lines[0] ? lines[0] : { text: '', srcStart: 0 };
        const restLines = lines.slice(1);
        let signLine = null;
        if (restLines.length >= 2) {
          signLine = restLines.pop();
        }

        const regions = [
          {
            id: 'title',
            role: 'headline',
            rect: { x: m, y: m, w: contentW, h: 36 },
            text: titleLine.text,
            srcStart: titleLine.srcStart,
            flow: 'flow',
            style: { sizeScale: 0.85, letterSpacing: 6, upper: true, align: 'left' },
          },
        ];

        const bodyH = contentH - 120;
        if (restLines.length > 0) {
          regions.push({
            id: 'body',
            role: 'body',
            rect: { x: m, y: m + 60, w: contentW * 0.75, h: bodyH },
            text: restLines.map((l) => l.text).join('\n'),
            srcStart: restLines[0].srcStart,
            flow: 'flow',
            style: { sizeScale: 1.0, lineHeight: 2.2, weight: 'thin', align: 'left' },
          });
        }

        if (signLine) {
          regions.push({
            id: 'sign',
            role: 'byline',
            rect: { x: W - m - contentW * 0.45, y: H - m - 64, w: contentW * 0.45, h: 56 },
            text: signLine.text,
            srcStart: signLine.srcStart,
            flow: 'flow',
            style: { sizeScale: 1.25, rotate: -6, align: 'right' },
          });
        }

        const decor = [];
        if (p.decor) {
          // Thin accent line under title
          decor.push({ kind: 'line', role: 'rule', x0: m, y0: m + 44, x1: m + 100, y1: m + 44, lineWidth: 1 });
          // Minimal brand logo ring in upper right
          decor.push({ kind: 'ring', role: 'accent', x: W - m - 16, y: m + 16, r: 12, thickness: 1 });
          // Large thin subtle border
          decor.push({ kind: 'rect', role: 'rule', x: m * 0.6, y: m * 0.6, w: W - m * 1.2, h: H - m * 1.2, stroke: 0.5, opacity: 0.4 });
        }

        return { page: { w: W, h: H }, regions, decor };
      },
    },

    score: {
      label: 'Musical Score (楽譜)',
      tags: ['music', 'score', 'staves'],
      params: {
        margin: { type: 'number', default: 0.08, min: 0.02, max: 0.2, step: 0.01 },
        decor: { type: 'bool', default: true },
      },
      build(ctx, params) {
        const W = ctx.frame.w;
        const H = ctx.frame.h;
        const p = Object.assign({}, COMMON_DEFAULTS, params);
        const m = p.margin * Math.min(W, H);
        const contentW = W - 2 * m;
        const contentH = H - 2 * m;
        const lines = ctx.lines || [];
        const numStaves = Math.max(1, Math.min(6, lines.length));
        const staffGap = contentH / numStaves;
        const lineSpacing = 14; // gap between 5 staff lines

        const regions = [];
        const decor = [];

        for (let s = 0; s < numStaves; s++) {
          const lineObj = lines[s] || { text: '', srcStart: 0 };
          const staffTop = m + s * staffGap + staffGap * 0.2;
          const chars = Array.from(lineObj.text || '').filter((c) => !/\s/.test(c));
          const numChars = Math.max(1, chars.length);

          if (p.decor) {
            // Draw 5 staff lines
            for (let j = 0; j < 5; j++) {
              const ly = staffTop + j * lineSpacing;
              decor.push({ kind: 'line', role: 'rule', x0: m, y0: ly, x1: W - m, y1: ly, lineWidth: 1 });
            }
            // Clef double bar at start
            decor.push({ kind: 'line', role: 'rule', x0: m + 10, y0: staffTop, x1: m + 10, y1: staffTop + 4 * lineSpacing, lineWidth: 2 });
            decor.push({ kind: 'line', role: 'rule', x0: m + 16, y0: staffTop, x1: m + 16, y1: staffTop + 4 * lineSpacing, lineWidth: 1 });
            // End bar at finish
            decor.push({ kind: 'line', role: 'rule', x0: W - m - 10, y0: staffTop, x1: W - m - 10, y1: staffTop + 4 * lineSpacing, lineWidth: 2 });
          }

          const startX = m + 40;
          const endX = W - m - 40;
          const stepX = (endX - startX) / Math.max(1, numChars - 1);

          // Path mapping function for letters
          const pathFn = function (idx, total, char) {
            const pitch = staffPitch(char, idx);
            // pitch 8 is center line (line 2)
            const pitchY = (8 - pitch) * (lineSpacing * 0.5);
            const x = startX + idx * stepX;
            const y = staffTop + 2 * lineSpacing + pitchY;
            const nextPitch = staffPitch(char, idx + 1);
            const diff = nextPitch - pitch;
            const rot = Math.max(-0.25, Math.min(0.25, diff * 0.05));
            return { x, y, rot };
          };

          regions.push({
            id: `staff_${s}`,
            role: 'note',
            rect: { x: m, y: staffTop - 20, w: contentW, h: 4 * lineSpacing + 40 },
            text: lineObj.text,
            srcStart: lineObj.srcStart,
            flow: 'path',
            path: pathFn,
            style: { sizeScale: 0.9 },
          });

          if (p.decor) {
            // Note heads and bar lines
            for (let c = 0; c < numChars; c++) {
              const pt = pathFn(c, numChars, chars[c] || 'A');
              // Note head circle
              decor.push({ kind: 'circle', role: 'accent', x: pt.x, y: pt.y + 14, r: 5 });
              // Stem line going up
              decor.push({ kind: 'line', role: 'accent', x0: pt.x + 4, y0: pt.y + 14, x1: pt.x + 4, y1: pt.y - 14, lineWidth: 1.5 });

              // Bar line every 4 notes
              if (c > 0 && c % 4 === 0 && c < numChars - 1) {
                const barX = pt.x - stepX * 0.5;
                decor.push({ kind: 'line', role: 'rule', x0: barX, y0: staffTop, x1: barX, y1: staffTop + 4 * lineSpacing, lineWidth: 1 });
              }
            }
          }
        }

        return { page: { w: W, h: H }, regions, decor };
      },
    },

    poster: {
      label: 'Poster (ポスター・Pinterest風)',
      tags: ['poster', 'artistic', 'pinterest'],
      params: {
        overlap: { type: 'bool', default: true },
        margin: { type: 'number', default: 0.06, min: 0.02, max: 0.2, step: 0.01 },
        decor: { type: 'bool', default: true },
        seed: { type: 'int', default: 12345 },
      },
      build(ctx, params) {
        const W = ctx.frame.w;
        const H = ctx.frame.h;
        const p = Object.assign({}, COMMON_DEFAULTS, params);
        const rng = ctx.rng || createRng(p.seed);
        const m = p.margin * Math.min(W, H);
        const shortEdge = Math.min(W, H);
        const lines = ctx.lines || [];

        // Hero: first line or first long word
        const firstLineText = lines[0] ? lines[0].text : ctx.text || 'HERO';
        const words = firstLineText.trim().split(/\s+/);
        const heroText = words.length > 1 ? words.reduce((a, b) => (b.length > a.length ? b : a), words[0]) : firstLineText;

        const heroSizeScale = 0.5 + rng() * 0.2; // 50% - 70% of short edge
        const heroSizePx = shortEdge * heroSizeScale;
        const heroRot = (rng() - 0.5) * 12; // -6 to +6 degrees
        const heroVertical = rng() > 0.65;

        let heroX, heroY;
        if (heroVertical) {
          heroX = W * (0.5 + rng() * 0.25);
          heroY = H * (0.08 + rng() * 0.15);
        } else {
          heroX = W * (0.06 + rng() * 0.15);
          heroY = H * (0.12 + rng() * 0.25);
        }

        const regions = [
          {
            id: 'hero',
            role: 'hero',
            rect: { x: heroX, y: heroY, w: Math.min(W - heroX, heroSizePx * 1.5), h: Math.min(H - heroY, heroSizePx * 1.2) },
            text: heroText,
            srcStart: 0,
            flow: 'flow',
            style: {
              sizeScale: Math.max(1.8, heroSizePx / (ctx.size || 48)),
              weight: 'bold',
              rotate: heroRot,
              vertical: heroVertical,
              align: 'left',
            },
          },
        ];

        // Captions: remaining lines distributed in grid cells
        const restLines = lines.slice(1);
        const captionCount = Math.min(4, restLines.length);
        const gridCols = 4;
        const gridRows = 3;
        const cellW = (W - 2 * m) / gridCols;
        const cellH = (H - 2 * m) / gridRows;

        // Choose positions not colliding too heavily with hero
        const occupied = new Set();
        if (heroVertical) {
          occupied.add('2,0');
          occupied.add('3,0');
          occupied.add('2,1');
          occupied.add('3,1');
        } else {
          occupied.add('0,0');
          occupied.add('1,0');
          occupied.add('0,1');
          occupied.add('1,1');
        }

        for (let i = 0; i < captionCount; i++) {
          let col = Math.floor(rng() * gridCols);
          let row = Math.floor(rng() * gridRows);
          if (occupied.has(`${col},${row}`)) {
            col = (col + 2) % gridCols;
            row = (row + 1) % gridRows;
          }
          occupied.add(`${col},${row}`);

          const capLine = restLines[i];
          const capRot = rng() > 0.75 ? 90 : 0;
          regions.push({
            id: `caption_${i}`,
            role: 'caption',
            rect: { x: m + col * cellW + 10, y: m + row * cellH + 10, w: cellW - 20, h: cellH - 20 },
            text: capLine.text,
            srcStart: capLine.srcStart,
            flow: 'flow',
            style: {
              sizeScale: 0.75 + rng() * 0.2,
              letterSpacing: 4,
              rotate: capRot,
              color: rng() > 0.5 ? 'accent' : 'muted',
              align: 'left',
            },
          });
        }

        const decor = [];
        if (p.decor) {
          // Accent shape under/overlapping hero
          if (rng() > 0.4) {
            decor.push({
              kind: 'rect',
              role: 'accent',
              x: heroX - 16,
              y: heroY + 20,
              w: Math.min(W - heroX, heroSizePx * 1.1),
              h: Math.min(H - heroY, heroSizePx * 0.55),
              opacity: 0.75,
            });
          } else {
            decor.push({
              kind: 'circle',
              role: 'accent',
              x: heroX + heroSizePx * 0.5,
              y: heroY + heroSizePx * 0.4,
              r: heroSizePx * 0.4,
              opacity: 0.75,
            });
          }

          // Registration marks (crosshairs in corners)
          const markPad = 24;
          const markLen = 16;
          const corners = [
            { x: markPad, y: markPad },
            { x: W - markPad, y: markPad },
            { x: markPad, y: H - markPad },
            { x: W - markPad, y: H - markPad },
          ];
          for (const c of corners) {
            decor.push({ kind: 'line', role: 'rule', x0: c.x - markLen / 2, y0: c.y, x1: c.x + markLen / 2, y1: c.y, lineWidth: 1 });
            decor.push({ kind: 'line', role: 'rule', x0: c.x, y0: c.y - markLen / 2, x1: c.x, y1: c.y + markLen / 2, lineWidth: 1 });
          }

          // Thin editorial framing lines
          decor.push({ kind: 'line', role: 'rule', x0: m, y0: m + 40, x1: m, y1: H - m - 40, lineWidth: 1 });
          decor.push({ kind: 'line', role: 'rule', x0: m + 40, y0: H - m, x1: W - m - 40, y1: H - m, lineWidth: 1 });
        }

        return { page: { w: W, h: H }, regions, decor };
      },
    },
  };

  function compose(type, params, ctx) {
    const rawCtx = ctx || {};
    const frame = rawCtx.frame || { w: 1920, h: 1080 };
    const W = Math.max(10, Number(frame.w) || 1920);
    const H = Math.max(10, Number(frame.h) || 1080);
    const lines = parseLines(rawCtx);
    const text = rawCtx.text != null ? String(rawCtx.text) : lines.map((l) => l.text).join('\n');
    const rng = (params && params.seed != null) ? createRng(params.seed) : (rawCtx.rng || createRng(12345));

    const normalizedCtx = {
      lines,
      text,
      frame: { w: W, h: H },
      size: rawCtx.size || 48,
      direction: rawCtx.direction || 'horizontal',
      lang: rawCtx.lang || 'ja',
      rng,
      aspect: W / H,
      meta: rawCtx.meta || {},
    };

    const preset = PRESETS[type] || PRESETS.none;
    const result = preset.build(normalizedCtx, params || {});

    // Ensure all output coordinates are valid and bounded
    const pageW = result.page && result.page.w ? result.page.w : W;
    const pageH = result.page && result.page.h ? result.page.h : H;
    const regions = (result.regions || []).map((r, i) => {
      const rect = r.rect || { x: 0, y: 0, w: pageW, h: pageH };
      const rx = clamp(Number(rect.x) || 0, 0, pageW);
      const ry = clamp(Number(rect.y) || 0, 0, pageH);
      const rw = Math.max(0, clamp(Number(rect.w) || 0, 0, pageW - rx));
      const rh = Math.max(0, clamp(Number(rect.h) || 0, 0, pageH - ry));
      return Object.assign({}, r, {
        id: r.id || `region_${i}`,
        role: r.role || 'body',
        rect: { x: rx, y: ry, w: rw, h: rh },
        text: r.text != null ? String(r.text) : '',
        flow: r.flow || 'flow',
        style: r.style || {},
      });
    });

    const decor = (result.decor || []).map((d) => {
      return Object.assign({}, d, {
        role: d.role || 'rule',
        opacity: d.opacity == null ? 1 : clamp(Number(d.opacity) || 0, 0, 1),
      });
    });

    return {
      page: { w: pageW, h: pageH },
      regions,
      decor,
    };
  }

  return {
    PRESETS,
    COMMON_DEFAULTS,
    compose,
    parseLines,
    splitMenuLine,
    staffPitch,
    createRng,
  };
});
