(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else {
    root.SA = root.SA || {};
    root.SA.pageScene = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function applyJustify(line, targetWidth) {
    if (!line || !line.words || !targetWidth) return;
    const allLetters = [];
    for (const w of line.words) {
      if (w.isSpace) continue;
      for (const l of w.letters) allLetters.push(l);
    }
    if (allLetters.length <= 1) return;

    const firstLetter = allLetters[0];
    const lastLetter = allLetters[allLetters.length - 1];
    const currentWidth = (lastLetter.x + (lastLetter.advance || 0)) - firstLetter.x;
    const extraSpace = targetWidth - currentWidth;
    if (extraSpace <= 0 || extraSpace > targetWidth * 0.5) return; // avoid ridiculous spacing

    const step = extraSpace / (allLetters.length - 1);
    for (let i = 1; i < allLetters.length; i++) {
      allLetters[i].x += i * step;
    }
  }

  function applyCells(line, cells, regionRect, cellIndexRef) {
    if (!line || !cells) return;
    const cols = cells.cols || 8;
    const rows = cells.rows || 1;
    const pitchX = cells.pitchX || cells.cellW || 40;
    const pitchY = cells.pitchY || cells.cellH || 40;
    const cellW = cells.cellW || pitchX;
    const cellH = cells.cellH || pitchY;
    const vertical = !!cells.vertical;

    for (const w of line.words) {
      for (const l of w.letters) {
        if (/^\s+$/.test(l.char)) continue;
        const idx = cellIndexRef.current++;
        let col, row;
        if (vertical) {
          // Top to bottom, right to left
          row = idx % rows;
          col = Math.floor(idx / rows);
          if (col >= cols) col = cols - 1;
          const actualCol = cols - 1 - col;
          const targetCx = actualCol * pitchX + cellW / 2;
          const targetCy = row * pitchY + cellH / 2;
          const bw = (l.bbox.x2 - l.bbox.x1) || (cellW * 0.7);
          const bh = (l.bbox.y2 - l.bbox.y1) || (cellH * 0.7);
          l.x = targetCx - bw / 2 - l.bbox.x1;
          l.y = targetCy - bh / 2 - l.bbox.y1;
        } else {
          // Left to right, top to bottom
          col = idx % cols;
          row = Math.floor(idx / cols);
          if (row >= rows) row = rows - 1;
          const targetCx = col * pitchX + cellW / 2;
          const targetCy = row * pitchY + cellH / 2;
          const bw = (l.bbox.x2 - l.bbox.x1) || (cellW * 0.7);
          const bh = (l.bbox.y2 - l.bbox.y1) || (cellH * 0.7);
          l.x = targetCx - bw / 2 - l.bbox.x1;
          l.y = targetCy - bh / 2 - l.bbox.y1;
        }
      }
    }
  }

  function applyPath(line, pathFn, pathIndexRef, totalLetters) {
    if (!line || typeof pathFn !== 'function') return;
    for (const w of line.words) {
      for (const l of w.letters) {
        const idx = pathIndexRef.current++;
        const pt = pathFn(idx, totalLetters, l.char);
        if (pt) {
          l.x = pt.x || 0;
          l.y = pt.y || 0;
          if (pt.rot != null) l.baseRot = (l.baseRot || 0) + pt.rot;
        }
      }
    }
  }

  function build(options) {
    const opts = options || {};
    const composeFn = opts.compose;
    const layoutText = opts.layoutText;
    const fonts = opts.fonts;
    const textStyle = opts.textStyle || {};
    const source = opts.source || '';
    const composeLayout = opts.composeLayout;
    const size = opts.size || 48;
    const lang = opts.lang || 'ja';
    const frame = opts.frame || { w: 1920, h: 1080 };
    const style = opts.style || {};
    const rng = opts.rng;

    const pageInst = (style && style.page) || {};
    const type = pageInst.type || 'none';
    const params = pageInst.params || {};

    const comp = composeFn(type, params, {
      text: source,
      frame,
      size,
      lang,
      direction: textStyle.direction || 'horizontal',
      rng,
    });

    const pageW = comp.page.w;
    const pageH = comp.page.h;
    const mergedLines = [];
    let primaryAscent = size;
    let primaryDescent = size * 0.3;

    for (let rIdx = 0; rIdx < comp.regions.length; rIdx++) {
      const region = comp.regions[rIdx];
      let rText = region.text != null ? String(region.text) : '';
      if (region.style && region.style.upper) {
        rText = rText.toUpperCase();
      }

      if (!rText) continue;

      let rSize = (region.style && region.style.sizeScale ? region.style.sizeScale : 1) * size;
      const rDir = (region.style && region.style.direction) || (region.style && region.style.vertical ? 'vertical' : (textStyle.direction || 'horizontal'));
      const rStyle = Object.assign({}, textStyle, region.style || {}, { size: rSize });
      const rMaxWidth = (region.flow === 'cells' || region.flow === 'path') ? Infinity : (region.rect.w > 0 ? region.rect.w : undefined);

      let rLayout = layoutText(rText, rStyle, fonts, {
        size: rSize,
        lang,
        direction: rDir,
        maxWidth: rMaxWidth,
      });

      primaryAscent = rLayout.ascent || primaryAscent;
      primaryDescent = rLayout.descent || primaryDescent;

      // Fit check for flow
      if (region.flow === 'flow' && rLayout.bbox && region.rect.w > 0 && region.rect.h > 0) {
        const boxW = Math.max(0, rLayout.bbox.x2 - rLayout.bbox.x1);
        const boxH = Math.max(0, rLayout.bbox.y2 - rLayout.bbox.y1);
        if (boxW > region.rect.w + 1 || boxH > region.rect.h + 1) {
          const kW = region.rect.w / Math.max(1e-6, boxW);
          const kH = region.rect.h / Math.max(1e-6, boxH);
          const k = Math.min(1, kW, kH);
          if (k < 0.99 && k >= 0.5) {
            rSize = rSize * k;
            rLayout = layoutText(rText, Object.assign({}, rStyle, { size: rSize }), fonts, {
              size: rSize,
              lang,
              direction: rDir,
              maxWidth: region.rect.w,
            });
          }
        }
      }

      const cellIndexRef = { current: 0 };
      const pathIndexRef = { current: 0 };
      const totalLettersInRegion = Array.from(rText).filter((c) => !/\s/.test(c)).length;

      // Post-processing per line
      for (let lIdx = 0; lIdx < rLayout.lines.length; lIdx++) {
        const line = rLayout.lines[lIdx];
        const isLastLine = lIdx === rLayout.lines.length - 1;

        if (region.style && region.style.justify && !isLastLine) {
          applyJustify(line, region.rect.w);
        } else if (region.flow === 'cells' && region.cells) {
          applyCells(line, region.cells, region.rect, cellIndexRef);
        } else if (region.flow === 'path' && region.path) {
          applyPath(line, region.path, pathIndexRef, totalLettersInRegion);
        } else if (region.flow === 'bubble') {
          // Dynamic bubble decor
          const pad = 16;
          const bubbleW = Math.min(region.rect.w, (line.width || 100) + pad * 2);
          const bubbleH = (line.height || 40) + pad * 2;
          const isLeft = (region.rect.x < pageW * 0.4);
          comp.decor.push({
            kind: 'bubble',
            role: isLeft ? 'paper' : 'accent',
            x: region.rect.x,
            y: region.rect.y + (line.y || 0),
            w: bubbleW,
            h: bubbleH,
            radius: 14,
            tailSide: isLeft ? 'left' : 'right',
          });
        }

        // Translate letters to page coordinate space and attach metadata
        for (const w of line.words) {
          for (const l of w.letters) {
            l.x += region.rect.x;
            l.y += region.rect.y;
            l.regionId = region.id;
            l.role = region.role;

            if (region.style && region.style.rotate) {
              const rotDeg = region.style.rotate;
              const rotRad = (rotDeg * Math.PI) / 180;
              const cx = region.rect.x + region.rect.w / 2;
              const cy = region.rect.y + region.rect.h / 2;
              const dx = l.x - cx;
              const dy = l.y - cy;
              const cos = Math.cos(rotRad);
              const sin = Math.sin(rotRad);
              l.x = cx + dx * cos - dy * sin;
              l.y = cy + dx * sin + dy * cos;
              l.baseRot = (l.baseRot || 0) + rotRad;
            }

            if (region.style && region.style.color) {
              l.span = Object.assign({}, l.span, { color: region.style.color });
            }
          }
        }

        mergedLines.push(line);
      }
    }

    return {
      lines: mergedLines,
      bbox: { x1: 0, y1: 0, x2: pageW, y2: pageH },
      width: pageW,
      height: pageH,
      ascent: primaryAscent,
      descent: primaryDescent,
      size,
      lineHeight: textStyle.lineHeight || 1.2,
      direction: textStyle.direction || 'horizontal',
      regions: comp.regions,
      decor: comp.decor,
      page: comp.page,
    };
  }

  return {
    build,
  };
});
