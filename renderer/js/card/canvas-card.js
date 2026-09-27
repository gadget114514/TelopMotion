window.SA = window.SA || {};

SA.card = (() => {
  'use strict';

  const i18n = SA.i18n;
  const fmt = SA.format;
  const palette = SA.cardPalette;

  const ASPECTS = {
    '16:9': { width: 1920, height: 1080 },
    '9:16': { width: 1080, height: 1920 },
  };

  const ICONS = {
    music: { d: ['M9 18V5l12-2v13'], circles: [[6, 18, 3], [18, 16, 3]] },
    play: { d: ['M10 8L16 12L10 16Z'], circles: [[12, 12, 10]] },
    heart: { d: ['M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z'], circles: [] },
    award: { d: ['M15.5 13.5 17 22l-5-3-5 3 1.5-8.5'], circles: [[12, 8, 6]] },
    star: { d: ['M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26Z'], circles: [] },
    clock: { d: ['M12 6L12 12L16 14'], circles: [[12, 12, 10]] },
    shuffle: { d: ['M16 3H21V8', 'M4 20L21 3', 'M21 16V21H16', 'M15 15L21 21', 'M4 4L9 9'], circles: [] },
    users: { d: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'], circles: [[9, 7, 4]] },
    gem: { d: ['M6 3H18L22 9L12 21L2 9Z', 'M2 9H22', 'M12 21L8 9', 'M12 21L16 9'], circles: [] },
    comment: { d: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'], circles: [] },
    verified: { d: ['M12 2 14.5 4.5 18 4l1 3.5 3 2-1.5 3.5L21 17l-3.5 1-2 3-3.5-1.5L8.5 21l-2-3L3 17l.5-4L2 9.5l3-2L6 4l3.5.5z', 'M9 12L11 14L15 9'], circles: [] },
  };

  const pathCache = new Map();
  const segmenterCache = new Map();

  function iconPath(name) {
    if (pathCache.has(name)) return pathCache.get(name);
    const def = ICONS[name] || ICONS.star;
    const path = new Path2D();
    for (const d of def.d) {
      try {
        path.addPath(new Path2D(d));
      } catch {
        /* keep the rest of the icon */
      }
    }
    for (const [cx, cy, r] of def.circles) {
      path.moveTo(cx + r, cy);
      path.arc(cx, cy, r, 0, Math.PI * 2);
    }
    pathCache.set(name, path);
    return path;
  }

  function segmenter(locale, granularity) {
    const key = `${locale}:${granularity}`;
    if (!segmenterCache.has(key)) segmenterCache.set(key, new Intl.Segmenter(locale, { granularity }));
    return segmenterCache.get(key);
  }

  function font(weight, size, family) {
    return `${weight} ${size}px ${family || palette.fontFamily}`;
  }

  function measure(ctx, text) {
    return ctx.measureText(text).width;
  }

  function withAlpha(color, alpha) {
    if (typeof color !== 'string') return color;
    const hex = color.trim();
    const short = hex.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
    if (short) {
      const [, r, g, b] = short;
      return `rgba(${parseInt(r + r, 16)}, ${parseInt(g + g, 16)}, ${parseInt(b + b, 16)}, ${alpha})`;
    }
    const long = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (long) {
      const [, r, g, b] = long;
      return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${alpha})`;
    }
    return color;
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.arcTo(x + w, y, x + w, y + radius, radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
    ctx.lineTo(x + radius, y + h);
    ctx.arcTo(x, y + h, x, y + h - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  }

  function ellipsize(ctx, text, maxWidth) {
    const value = String(text == null ? '' : text);
    if (!value || measure(ctx, value) <= maxWidth) return value;
    const chars = Array.from(value);
    let low = 0;
    let high = chars.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (measure(ctx, `${chars.slice(0, mid).join('')}…`) <= maxWidth) low = mid;
      else high = mid - 1;
    }
    return `${chars.slice(0, low).join('').replace(/\s+$/, '')}…`;
  }

  function breakToken(ctx, token, maxWidth, locale) {
    const pieces = [];
    let current = '';
    for (const grapheme of segmenter(locale, 'grapheme')) {
      const next = current + grapheme.segment;
      if (current && measure(ctx, next) > maxWidth) {
        pieces.push(current);
        current = grapheme.segment;
      } else {
        current = next;
      }
    }
    if (current) pieces.push(current);
    return pieces;
  }

  function wrapLines(ctx, text, maxWidth, maxLines, locale) {
    const value = String(text == null ? '' : text);
    if (!value) return [];
    const chunks = value.split(/(\s+)/).filter((chunk) => chunk.length);
    const lines = [];
    let line = '';
    for (const chunk of chunks) {
      const candidate = line + chunk;
      if (!line || measure(ctx, candidate.trimEnd()) <= maxWidth) {
        line = candidate;
        continue;
      }
      lines.push(line.trimEnd());
      if (lines.length >= maxLines && maxLines > 0) {
        const rest = chunks.slice(chunks.indexOf(chunk)).join('');
        lines[maxLines - 1] = ellipsize(ctx, `${lines[maxLines - 1]} ${rest.trim()}`, maxWidth);
        return lines.slice(0, maxLines);
      }
      if (/^\s+$/.test(chunk)) line = '';
      else if (measure(ctx, chunk) > maxWidth) {
        const pieces = breakToken(ctx, chunk, maxWidth, locale);
        for (let i = 0; i < pieces.length - 1; i += 1) {
          lines.push(pieces[i]);
          if (lines.length >= maxLines && maxLines > 0) return lines.slice(0, maxLines);
        }
        line = pieces[pieces.length - 1] || '';
      } else {
        line = chunk;
      }
    }
    if (line.trim() && (maxLines <= 0 || lines.length < maxLines)) lines.push(line.trimEnd());
    return lines;
  }

  function drawLines(ctx, lines, x, y, lineHeight) {
    lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
    return y + lines.length * lineHeight;
  }

  function drawIcon(ctx, name, x, y, size, color, lineWidth) {
    const path = iconPath(name);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 24, size / 24);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(path);
    ctx.restore();
  }

  function drawAvatar(ctx, image, x, y, size, radius, th) {
    ctx.save();
    roundRect(ctx, x, y, size, size, radius);
    ctx.clip();
    ctx.fillStyle = th.base.card2;
    ctx.fillRect(x, y, size, size);
    if (image) {
      const iw = image.width || size;
      const ih = image.height || size;
      const scale = Math.max(size / iw, size / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      try {
        ctx.drawImage(image, x + (size - dw) / 2, y + (size - dh) / 2, dw, dh);
      } catch {
        /* placeholder below */
      }
    } else {
      const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
      gradient.addColorStop(0, th.base.accent);
      gradient.addColorStop(1, th.base.accent2);
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, size, size);
    }
    ctx.restore();
    ctx.save();
    roundRect(ctx, x + 0.5, y + 0.5, size - 1, size - 1, radius);
    ctx.lineWidth = 1;
    ctx.strokeStyle = th.base.line;
    ctx.stroke();
    ctx.restore();
  }

  function drawRing(ctx, x, y, size, progress, percent, th) {
    const cx = x + size / 2;
    const cy = y + size / 2;
    const outer = size / 2;
    const inner = outer * (78 / 98);
    ctx.save();
    if (typeof ctx.createConicGradient === 'function') {
      const gradient = ctx.createConicGradient(-Math.PI / 2, cx, cy);
      const clamped = Math.max(0.0001, Math.min(1, progress));
      gradient.addColorStop(0, th.base.accent);
      gradient.addColorStop(clamped, th.base.accent);
      gradient.addColorStop(Math.min(1, clamped + 0.0001), th.base.ringTrack);
      gradient.addColorStop(1, th.base.ringTrack);
      ctx.beginPath();
      ctx.arc(cx, cy, outer, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, outer, 0, Math.PI * 2);
      ctx.fillStyle = th.base.ringTrack;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, outer, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, progress)));
      ctx.strokeStyle = th.base.accent;
      ctx.lineWidth = outer - inner;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fillStyle = th.base.ringInner;
    ctx.fill();
    ctx.fillStyle = th.base.text;
    ctx.font = font(700, Math.round(size * 0.2), th.base.fontFamily);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${percent}%`, cx, cy + 1);
    ctx.restore();
  }

  function setLetterSpacing(ctx, value) {
    try {
      ctx.letterSpacing = value;
    } catch {
      /* not supported */
    }
  }

  function globalGlows(ctx, width, height, th) {
    const pink = ctx.createRadialGradient(width * 0.15, -height * 0.1, 0, width * 0.15, -height * 0.1, Math.max(width, height) * 0.62);
    pink.addColorStop(0, th.base.glowPink);
    pink.addColorStop(0.6, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = pink;
    ctx.fillRect(0, 0, width, height);
    const violet = ctx.createRadialGradient(width * 0.9, 0, 0, width * 0.9, 0, Math.max(width, height) * 0.52);
    violet.addColorStop(0, th.base.glowViolet);
    violet.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = violet;
    ctx.fillRect(0, 0, width, height);
  }

  function baseLayout(aspect) {
    if (aspect === '9:16') {
      const width = 1080;
      const height = 1920;
      const padX = 40;
      const padTop = 40;
      const padBottom = 30;
      const gap = 16;
      const headerH = 580;
      const footerH = 20;
      const gridY = padTop + headerH + gap;
      const gridBottom = height - padBottom - footerH - gap;
      const cols = 4;
      const rows = 8;
      const gapX = 12;
      const gapY = 12;
      const gridW = width - padX * 2;
      const gridH = gridBottom - gridY;
      const cellW = (gridW - gapX * (cols - 1)) / cols;
      const cellH = (gridH - gapY * (rows - 1)) / rows;
      const cells = [];
      for (let i = 0; i < cols * rows; i += 1) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        cells.push({ x: padX + col * (cellW + gapX), y: gridY + row * (cellH + gapY), w: cellW, h: cellH });
      }
      return {
        aspect,
        width,
        height,
        padX,
        padBottom,
        headerRect: { x: padX, y: padTop, w: width - padX * 2, h: headerH },
        ringRect: { x: width / 2 - 54, y: padTop + 400, w: 108, h: 108 },
        footerY: height - padBottom,
        cells,
        cell: { padX: 14, padTop: 12, stripe: 5, icon: 34, name: 15, desc: 12, detail: 11.5, bar: 7, radius: 12 },
      };
    }
    const width = 1920;
    const height = 1080;
    const padX = 40;
    const padTop = 28;
    const padBottom = 22;
    const gap = 15;
    const headerH = 98;
    const footerH = 20;
    const gridY = padTop + headerH + gap;
    const gridBottom = height - padBottom - footerH - gap;
    const cols = 8;
    const rows = 4;
    const gapX = 9;
    const gapY = 9;
    const gridW = width - padX * 2;
    const gridH = gridBottom - gridY;
    const cellW = (gridW - gapX * (cols - 1)) / cols;
    const cellH = (gridH - gapY * (rows - 1)) / rows;
    const cells = [];
    for (let i = 0; i < cols * rows; i += 1) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      cells.push({ x: padX + col * (cellW + gapX), y: gridY + row * (cellH + gapY), w: cellW, h: cellH });
    }
    const completionW = 300;
    const completionX = width - padX - completionW;
    const statsX = completionX - 26 - (6 * 72 + 5 * 22);
    return {
      aspect,
      width,
      height,
      padX,
      padBottom,
      headerRect: { x: padX, y: padTop, w: width - padX * 2, h: headerH },
      profile: { x: padX + 86 + 16, y: padTop + 10, nameMax: Math.max(220, statsX - padX - 86 - 16 - 40) },
      stats: { x: statsX },
      completion: { x: completionX },
      ringRect: { x: completionX + 24, y: padTop, w: 98, h: 98 },
      footerY: height - padBottom,
      cells,
      cell: { padX: 19, padTop: 13, stripe: 6, icon: 44, name: 17, desc: 14, detail: 13.5, bar: 8, radius: 12 },
    };
  }

  function layout(aspect, badges) {
    const base = baseLayout(aspect);
    const badgeRects = {};
    if (Array.isArray(badges)) {
      badges.forEach((badge, index) => {
        const rect = base.cells[index];
        if (rect) badgeRects[badge.id || String(index)] = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
      });
    }
    return {
      badgeRects,
      cells: base.cells,
      headerRect: base.headerRect,
      ringRect: base.ringRect,
      width: base.width,
      height: base.height,
      footerY: base.footerY,
    };
  }

  function drawBadge(ctx, badge, rect, metrics, th, locale) {
    const category = th.categories[badge.category] || { tint: th.base.accent, tint2: th.base.accent2 };
    const tierColor = th.tiers[badge.tier] || th.base.lockedLevel;
    const radius = metrics.radius;
    ctx.save();
    if (!badge.unlocked) ctx.globalAlpha = th.base.lockedOpacity;

    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, radius);
    ctx.fillStyle = th.base.card2;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = badge.unlocked ? withAlpha(category.tint, 0.45) : th.base.lineSoft;
    ctx.stroke();

    ctx.save();
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, radius);
    ctx.clip();
    ctx.fillStyle = badge.unlocked ? tierColor : th.base.lockedLevel;
    ctx.fillRect(rect.x, rect.y, metrics.stripe, rect.h);
    ctx.restore();

    const iconX = rect.x + metrics.padX;
    const iconY = rect.y + metrics.padTop;
    const iconSize = metrics.icon;
    const iconRadius = Math.round(iconSize * 12 / 44);
    roundRect(ctx, iconX, iconY, iconSize, iconSize, iconRadius);
    if (badge.unlocked) {
      const gradient = ctx.createLinearGradient(iconX, iconY, iconX + iconSize, iconY + iconSize);
      gradient.addColorStop(0, category.tint);
      gradient.addColorStop(1, category.tint2);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = 'transparent';
    } else {
      ctx.fillStyle = th.base.card;
      ctx.fill();
      ctx.strokeStyle = th.base.line;
    }
    ctx.lineWidth = 1;
    ctx.stroke();
    drawIcon(ctx, badge.icon, iconX + iconSize * 0.25, iconY + iconSize * 0.25, iconSize * 0.5, badge.unlocked ? '#ffffff' : category.tint, 2);

    const nameX = iconX + iconSize + Math.round(metrics.icon * 0.25);
    const nameMax = rect.x + rect.w - metrics.padX - nameX;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = font(700, metrics.name, th.base.fontFamily);
    ctx.fillStyle = th.base.text;
    const nameLines = wrapLines(ctx, i18n.t(`badges.${badge.id}.name`), nameMax, 2, locale);
    const nameLineHeight = metrics.name * 1.25;
    const iconCenter = iconY + iconSize / 2;
    const nameY = iconCenter - (nameLines.length * nameLineHeight) / 2;
    let cursorY = drawLines(ctx, nameLines, nameX, nameY, nameLineHeight);

    const descY = iconY + iconSize + Math.round(metrics.icon * 0.16) + 2;
    cursorY = Math.max(cursorY, descY);
    ctx.font = font(400, metrics.desc, th.base.fontFamily);
    ctx.fillStyle = th.base.muted;
    const descLineHeight = metrics.desc * 1.35;
    const contentW = rect.x + rect.w - metrics.padX - iconX;
    cursorY = drawLines(ctx, wrapLines(ctx, i18n.t(`badges.${badge.id}.desc`), contentW, 2, locale), iconX, cursorY, descLineHeight);

    const detail = fmt.detailText(badge);
    const barY = rect.y + rect.h - metrics.padTop - metrics.bar;
    if (detail) {
      ctx.font = font(400, metrics.detail, th.base.fontFamily);
      ctx.fillStyle = th.base.desc;
      const detailY = Math.min(cursorY + 2, barY - metrics.detail - 4);
      if (detailY > cursorY - metrics.detail) {
        ctx.fillText(ellipsize(ctx, detail, rect.x + rect.w - metrics.padX - iconX), iconX, detailY);
      }
    }

    const progressText = badge.kind === 'metric' || badge.kind === 'best' ? `${fmt.fmtNum(badge.current)} / ${fmt.fmtNum(badge.target)}` : '';
    ctx.font = font(400, metrics.detail, th.base.fontFamily);
    const progressTextWidth = progressText ? measure(ctx, progressText) : 0;
    const barW = rect.x + rect.w - metrics.padX - 6 - iconX - (progressText ? progressTextWidth + 9 : 0);
    const barH = metrics.bar;
    roundRect(ctx, iconX, barY, Math.max(8, barW), barH, barH / 2);
    ctx.fillStyle = th.base.barTrack;
    ctx.fill();
    const fillW = Math.max(0, Math.min(1, badge.progress || 0)) * Math.max(8, barW);
    if (fillW > 0) {
      ctx.save();
      roundRect(ctx, iconX, barY, Math.max(8, barW), barH, barH / 2);
      ctx.clip();
      const gradient = ctx.createLinearGradient(iconX, 0, iconX + Math.max(8, barW), 0);
      gradient.addColorStop(0, category.tint);
      gradient.addColorStop(1, category.tint2);
      ctx.fillStyle = gradient;
      ctx.fillRect(iconX, barY, fillW, barH);
      ctx.restore();
    }
    if (progressText) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = th.base.muted;
      ctx.fillText(progressText, rect.x + rect.w - metrics.padX, barY + barH / 2);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  function drawHeaderWide(ctx, options, l, th, locale) {
    const profile = options.dataset.profile;
    drawAvatar(ctx, options.images && options.images.avatar, l.padX, l.headerRect.y + (l.headerRect.h - 86) / 2, 86, 20, th);

    const profileX = l.profile.x;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const nameY = l.profile.y + 4;
    ctx.font = font(700, 34, th.base.fontFamily);
    ctx.fillStyle = th.base.text;
    const handleText = `@${profile.handle || ''}`;
    ctx.font = font(400, 18, th.base.fontFamily);
    const handleW = measure(ctx, handleText);
    const verifiedSize = profile.isVerified ? 26 : 0;
    const nameMax = l.profile.nameMax - (verifiedSize ? verifiedSize + 12 : 0) - (handleW ? handleW + 12 : 0);
    ctx.font = font(700, 34, th.base.fontFamily);
    const name = ellipsize(ctx, profile.displayName || profile.handle || '', Math.max(60, nameMax));
    ctx.fillText(name, profileX, nameY);
    let cursorX = profileX + measure(ctx, name) + 12;
    if (profile.isVerified) {
      drawIcon(ctx, 'verified', cursorX, nameY + (42 - 26) / 2, 26, th.base.accent, 2);
      cursorX += verifiedSize + 12;
    }
    ctx.font = font(400, 18, th.base.fontFamily);
    ctx.fillStyle = th.base.muted;
    ctx.fillText(ellipsize(ctx, handleText, Math.max(40, l.profile.nameMax - (cursorX - profileX))), cursorX, nameY + 14);

    ctx.font = font(400, 16, th.base.fontFamily);
    ctx.fillStyle = th.base.desc;
    if (profile.description) ctx.fillText(ellipsize(ctx, profile.description, Math.min(720, l.profile.nameMax)), profileX, nameY + 42 + 5);

    const stats = [
      [i18n.t('stats.songs'), fmt.fmtInt(options.evaluation.agg.songCount)],
      [i18n.t('stats.plays'), fmt.fmtNum(options.evaluation.agg.totalPlays)],
      [i18n.t('stats.likes'), fmt.fmtNum(options.evaluation.agg.totalLikes)],
      [i18n.t('stats.comments'), fmt.fmtNum(options.evaluation.agg.totalComments)],
      [i18n.t('stats.runtime'), fmt.fmtDuration(options.evaluation.agg.totalDuration)],
      [i18n.t('stats.followers'), fmt.fmtNum(options.evaluation.agg.followers)],
    ];
    const tileW = 72;
    const tileGap = 22;
    const valueFont = font(700, 30, th.base.fontFamily);
    const labelFont = font(400, 13, th.base.fontFamily);
    ctx.font = valueFont;
    const valueWidths = stats.map(([, value]) => measure(ctx, value));
    ctx.font = labelFont;
    setLetterSpacing(ctx, '0.6px');
    const labelWidths = stats.map(([label]) => measure(ctx, label.toUpperCase()));
    setLetterSpacing(ctx, '0px');
    const widths = stats.map((_, index) => Math.max(tileW, valueWidths[index], labelWidths[index]));
    const totalWidth = widths.reduce((sum, width) => sum + width, 0) + tileGap * (stats.length - 1);
    let x = Math.max(l.profile.x + 120, l.completion.x - 26 - totalWidth);
    const statsY = l.headerRect.y + (l.headerRect.h - (30 * 1.25 + 1 + 13 * 1.4)) / 2;
    stats.forEach(([label, value], index) => {
      ctx.font = valueFont;
      ctx.fillStyle = th.base.text;
      ctx.fillText(value, x, statsY);
      ctx.font = labelFont;
      ctx.fillStyle = th.base.muted;
      setLetterSpacing(ctx, '0.6px');
      ctx.fillText(label.toUpperCase(), x, statsY + 30 * 1.25 + 1);
      setLetterSpacing(ctx, '0px');
      x += widths[index] + tileGap;
    });

    ctx.strokeStyle = th.base.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(l.completion.x + 0.5, l.headerRect.y + (l.headerRect.h - 98) / 2);
    ctx.lineTo(l.completion.x + 0.5, l.headerRect.y + (l.headerRect.h + 98) / 2);
    ctx.stroke();

    const percent = Math.round((options.evaluation.completion || 0) * 100);
    drawRing(ctx, l.ringRect.x, l.ringRect.y, 98, options.evaluation.completion || 0, percent, th);

    const textX = l.ringRect.x + 98 + 16;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = font(400, 17, th.base.fontFamily);
    ctx.fillStyle = th.base.text;
    ctx.fillText(i18n.t('achievements.summary', { unlocked: options.evaluation.unlockedCount, total: options.evaluation.total }), textX, l.headerRect.y + 22);
    ctx.font = font(400, 12, th.base.fontFamily);
    ctx.fillStyle = th.base.muted;
    setLetterSpacing(ctx, '1.3px');
    ctx.fillText('SUNO ACHIEVEMENT', textX, l.headerRect.y + 22 + 28);
    setLetterSpacing(ctx, '0px');
  }

  function drawHeaderTall(ctx, options, l, th, locale) {
    const profile = options.dataset.profile;
    const width = l.width;
    const centerX = width / 2;
    const avatarSize = 112;
    drawAvatar(ctx, options.images && options.images.avatar, centerX - avatarSize / 2, l.headerRect.y, avatarSize, 26, th);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const name = profile.displayName || profile.handle || '';
    const handleText = `@${profile.handle || ''}`;
    const nameFont = font(700, 40, th.base.fontFamily);
    const handleFont = font(400, 20, th.base.fontFamily);
    const verifiedSize = profile.isVerified ? 30 : 0;
    ctx.font = nameFont;
    let nameW = Math.min(measure(ctx, name), 700);
    ctx.font = handleFont;
    const handleW = measure(ctx, handleText);
    const rowW = nameW + (verifiedSize ? 12 + verifiedSize : 0) + 12 + handleW;
    let x = centerX - rowW / 2;
    const nameY = l.headerRect.y + avatarSize + 20;
    ctx.font = nameFont;
    ctx.fillStyle = th.base.text;
    const clippedName = ellipsize(ctx, name, 700);
    nameW = measure(ctx, clippedName);
    ctx.fillText(clippedName, x, nameY);
    let cursorX = x + nameW + 12;
    if (profile.isVerified) {
      drawIcon(ctx, 'verified', cursorX, nameY + (50 - 30) / 2, verifiedSize, th.base.accent, 2);
      cursorX += verifiedSize + 12;
    }
    ctx.font = handleFont;
    ctx.fillStyle = th.base.muted;
    ctx.fillText(handleText, cursorX, nameY + 16);

    ctx.font = font(400, 18, th.base.fontFamily);
    ctx.fillStyle = th.base.desc;
    ctx.textAlign = 'center';
    if (profile.description) ctx.fillText(ellipsize(ctx, profile.description, 900), centerX, nameY + 58);

    const stats = [
      [i18n.t('stats.songs'), fmt.fmtInt(options.evaluation.agg.songCount)],
      [i18n.t('stats.plays'), fmt.fmtNum(options.evaluation.agg.totalPlays)],
      [i18n.t('stats.likes'), fmt.fmtNum(options.evaluation.agg.totalLikes)],
      [i18n.t('stats.comments'), fmt.fmtNum(options.evaluation.agg.totalComments)],
      [i18n.t('stats.runtime'), fmt.fmtDuration(options.evaluation.agg.totalDuration)],
      [i18n.t('stats.followers'), fmt.fmtNum(options.evaluation.agg.followers)],
    ];
    const statsX = 40;
    const statsW = width - 80;
    const colGap = 24;
    const colW = (statsW - colGap * 2) / 3;
    const statsY = nameY + 58 + 18 + 32;
    ctx.textAlign = 'left';
    stats.forEach(([label, value], index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const tileX = statsX + col * (colW + colGap);
      const tileY = statsY + row * 76;
      ctx.font = font(700, 34, th.base.fontFamily);
      ctx.fillStyle = th.base.text;
      ctx.fillText(value, tileX, tileY);
      ctx.font = font(400, 14, th.base.fontFamily);
      ctx.fillStyle = th.base.muted;
      setLetterSpacing(ctx, '0.6px');
      ctx.fillText(label.toUpperCase(), tileX, tileY + 44);
      setLetterSpacing(ctx, '0px');
    });

    const ringSize = 108;
    const ringX = centerX - ringSize / 2;
    const ringY = l.ringRect.y;
    const percent = Math.round((options.evaluation.completion || 0) * 100);
    drawRing(ctx, ringX, ringY, ringSize, options.evaluation.completion || 0, percent, th);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = font(400, 18, th.base.fontFamily);
    ctx.fillStyle = th.base.text;
    ctx.fillText(i18n.t('achievements.summary', { unlocked: options.evaluation.unlockedCount, total: options.evaluation.total }), centerX, ringY + ringSize + 12);
    ctx.font = font(400, 12, th.base.fontFamily);
    ctx.fillStyle = th.base.muted;
    setLetterSpacing(ctx, '1.3px');
    ctx.fillText('SUNO ACHIEVEMENT', centerX, ringY + ringSize + 40);
    setLetterSpacing(ctx, '0px');
  }

  function drawFooterWide(ctx, l, th, generatedAt) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(400, 13.5, th.base.fontFamily);
    ctx.fillStyle = th.base.muted;
    ctx.fillText(i18n.t('snapshot.generated', { date: fmt.fmtDate(generatedAt) }), l.padX, l.footerY);
    ctx.textAlign = 'right';
    ctx.fillText(i18n.t('snapshot.unofficial'), l.width - l.padX, l.footerY);
  }

  function draw(ctx, options) {
    if (!ctx || !options || !options.dataset) return;
    const aspect = ASPECTS[options.aspect] ? options.aspect : '16:9';
    const size = ASPECTS[aspect];
    const th = options.theme || palette.theme(options.project);
    const locale = options.lang || i18n.lang();
    const previous = i18n.lang();
    if (options.lang && options.lang !== previous) i18n.set(options.lang);
    try {
      ctx.save();
      ctx.clearRect(0, 0, size.width, size.height);
      ctx.fillStyle = th.base.bg;
      ctx.fillRect(0, 0, size.width, size.height);
      globalGlows(ctx, size.width, size.height, th);

      const l = baseLayout(aspect);
      const evaluation = options.evaluation || SA.achievements.evaluate(options.dataset);
      const resolved = { ...options, evaluation };

      if (aspect === '9:16') drawHeaderTall(ctx, resolved, l, th, locale);
      else drawHeaderWide(ctx, resolved, l, th, locale);

      evaluation.badges.forEach((badge, index) => {
        const rect = l.cells[index];
        if (rect) drawBadge(ctx, badge, rect, l.cell, th, locale);
      });

      drawFooterWide(ctx, l, th, options.generatedAt || new Date().toISOString());
      ctx.restore();
    } finally {
      if (options.lang && options.lang !== previous) i18n.set(previous);
    }
  }

  function renderToBlob(options) {
    const aspect = ASPECTS[options.aspect] ? options.aspect : '16:9';
    const size = ASPECTS[aspect];
    const canvas = new OffscreenCanvas(size.width, size.height);
    const ctx = canvas.getContext('2d');
    draw(ctx, { ...options, aspect });
    return canvas.convertToBlob({ type: options.type || 'image/jpeg', quality: options.quality == null ? 0.92 : options.quality });
  }

  return { aspects: ASPECTS, theme: palette.theme, layout, draw, renderToBlob };
})();
