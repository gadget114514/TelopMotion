(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../rng'), require('./registry'));
  else {
    root.SA = root.SA || {};
    root.SA.repeat = factory(root.SA.rng, root.SA.fx);
  }
})(typeof self !== 'undefined' ? self : this, function (rng, fx) {
  'use strict';

  // Arrangement types. `none` is not registered: it is the group default that
  // draws a single string.
  const TYPES = ['stackV', 'rowH', 'diagonal', 'grid', 'radial', 'fan', 'tunnel', 'scatter', 'brick', 'fill'];
  const STRAIGHT_TYPES = ['stackV', 'rowH', 'diagonal', 'fan', 'tunnel', 'scatter'];
  const SEQUENCES = ['static', 'cascade', 'counterSlide', 'counterScroll', 'wave'];
  const GAP_EM = { tight: 1.0, normal: 1.5, wide: 2.5 };
  // total on-screen copies (main included) for `copies: 'many'`
  const MANY_TOTAL = { stackV: 6, rowH: 6, diagonal: 6, grid: 9, radial: 8, fan: 7, tunnel: 7, scatter: 10 };
  const MAX_COPIES = 40;
  const DIR_OPTIONS = {
    stackV: ['down', 'up', 'both'],
    rowH: ['right', 'left', 'both'],
    diagonal: ['downRight', 'upRight'],
    grid: [],
    radial: ['upright', 'tangent'],
    fan: ['narrow', 'wide'],
    tunnel: ['center', 'up', 'down'],
    scatter: [],
    brick: [],
    fill: [],
  };
  const PRESET_IDS = ['custom', 'perspectiveFade', 'popAlternate', 'ransomNote', 'heroOutline', 'rainbowStep', 'loudQuiet'];
  const VARIATION_ATTRS = ['none', 'size', 'color', 'font', 'decor'];
  const VARIATION_RULES = ['progress', 'alternate', 'random', 'oddOne'];
  const FADE_IN = 0.25;
  const FADE_OUT = 0.25;
  const WAVE_AMPLITUDE = 0.25;

  function num(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback == null ? 0 : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function pick(list, random) {
    return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  }

  // --- params ------------------------------------------------------------------

  function toCopies(value) {
    if (value === 'many') return 'many';
    const number = Math.round(Number(value));
    if (!Number.isFinite(number)) return 1;
    return clamp(number, 1, 3);
  }

  function sequenceValid(type, sequence, copies) {
    if (sequence === 'static' || sequence === 'cascade') return true;
    if (sequence === 'counterSlide') return (type === 'stackV' || type === 'grid') && copies !== 'many';
    if (sequence === 'counterScroll') return ['stackV', 'rowH', 'grid', 'brick', 'fill'].includes(type) && copies === 'many';
    if (sequence === 'wave') return copies !== 1;
    return false;
  }

  /**
   * Clamps a params object to the combinations the design allows. Every key is
   * filled in, so `normalize` is also the schema default application point.
   * Pure and idempotent.
   */
  function normalizeParams(type, input) {
    const source = input || {};
    const params = { ...source };
    let copies = toCopies(params.copies == null ? 1 : params.copies);
    if (type === 'brick' || type === 'fill') copies = 'many';
    else if ((type === 'grid' || type === 'radial' || type === 'fan' || type === 'tunnel' || type === 'scatter') && copies === 1) copies = 2;
    params.copies = copies;

    for (const slot of ['var1', 'var2']) {
      const attr = VARIATION_ATTRS.includes(params[`${slot}Attr`]) ? params[`${slot}Attr`] : 'none';
      let rule = VARIATION_RULES.includes(params[`${slot}Rule`]) ? params[`${slot}Rule`] : 'progress';
      const level = params[`${slot}Level`] === 'strong' ? 'strong' : 'normal';
      let target = params[`${slot}Target`] === 'last' ? 'last' : 'main';
      if (attr !== 'none') {
        if (copies === 1 && (rule === 'progress' || rule === 'alternate' || rule === 'random')) rule = 'oddOne';
        if (copies === 2 && rule === 'alternate') rule = 'oddOne';
        if (copies === 'many' && rule === 'oddOne' && target === 'last') target = 'main';
      }
      params[`${slot}Attr`] = attr;
      params[`${slot}Rule`] = rule;
      params[`${slot}Level`] = level;
      params[`${slot}Target`] = target;
      params[`${slot}ColorMode`] = params[`${slot}ColorMode`] === 'light' ? 'light' : 'hue';
    }
    if (params.var1Attr !== 'none' && params.var2Attr === params.var1Attr) params.var2Attr = 'none';

    let sequence = SEQUENCES.includes(params.sequence) ? params.sequence : 'cascade';
    if (sequence === 'wave' && copies === 1) sequence = 'static';
    if (sequence === 'counterSlide' && copies === 'many') sequence = 'counterScroll';
    if (sequence === 'counterScroll' && copies !== 'many') sequence = 'counterSlide';
    if (!sequenceValid(type, sequence, copies)) sequence = 'cascade';
    params.sequence = sequence;

    const dirOptions = DIR_OPTIONS[type] || [];
    if (dirOptions.length) params.dir = dirOptions.includes(params.dir) ? params.dir : dirOptions[0];
    else delete params.dir;
    params.mainIndex = params.mainIndex === 'center' ? 'center' : 'end';
    const centerOk = params.dir === 'both' || type === 'radial' || type === 'brick' || type === 'fill';
    if (params.mainIndex === 'center' && !centerOk) params.mainIndex = 'end';
    params.gap = GAP_EM[params.gap] ? params.gap : 'normal';
    params.fit = params.fit === 'overflow' ? 'overflow' : 'shrink';
    if ((type === 'brick' || type === 'fill') || params.sequence === 'counterScroll') params.fit = 'overflow';
    params.seqSpeed = params.seqSpeed === 'slow' ? 'slow' : 'fast';
    params.seqOrder = params.seqOrder === 'toMain' ? 'toMain' : 'fromMain';
    params.copyOpacity = params.copyOpacity === 'fade' ? 'fade' : 'flat';
    params.variationPreset = PRESET_IDS.includes(params.variationPreset) ? params.variationPreset : 'custom';
    params.seedShift = clamp(Math.round(num(params.seedShift, 0)), 0, 999);
    return params;
  }

  /** `normalize(instance)` or `normalize(type, params)`. */
  function normalize(typeOrInstance, maybeParams) {
    if (typeOrInstance && typeof typeOrInstance === 'object') {
      return normalizeParams(typeOrInstance.type, maybeParams || typeOrInstance.params);
    }
    return normalizeParams(typeOrInstance, maybeParams);
  }

  function countBin(type, params) {
    const normalized = normalizeParams(type, params);
    if (normalized.copies === 'many') return 'many';
    const total = normalized.copies + 1;
    if (total === 2) return 'pair';
    if (type === 'grid' || type === 'radial') return total === 3 ? 'tri' : 'quad';
    return 'few';
  }

  /** Total number of on-screen strings (main included). */
  function expectedTotal(type, params) {
    const copies = normalizeParams(type, params).copies;
    if (copies === 'many') return MANY_TOTAL[type] || 6;
    return copies + 1;
  }

  // --- geometry helpers ---------------------------------------------------------

  function boxOf(dims) {
    const dims_ = dims || {};
    const width = Math.max(1, num(dims_.width, 1920));
    const height = Math.max(1, num(dims_.height, 1080));
    const box = dims_.box || {};
    return {
      w: Math.max(1, num(box.w, width * 0.6)),
      h: Math.max(1, num(box.h, height * 0.15)),
      cx: num(box.cx, width / 2),
      cy: num(box.cy, height / 2),
      width,
      height,
      safeArea: dims_.safeArea || { left: width * 0.02, top: height * 0.02, right: width * 0.02, bottom: height * 0.02 },
    };
  }

  // axis-aligned bounds of a rotated, scaled copy centred on (dx, dy)
  function halfExtents(copy, w, h) {
    const scale = num(copy.scale, 1);
    const rad = (num(copy.rotate, 0) * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    return { x: (cos * w * scale + sin * h * scale) / 2, y: (sin * w * scale + cos * h * scale) / 2 };
  }

  function copiesOverlap(a, b, w, h) {
    const ea = halfExtents(a, w, h);
    const eb = halfExtents(b, w, h);
    // a 0.5px tolerance keeps touching edges from counting as an overlap
    return Math.abs(a.dx - b.dx) < ea.x + eb.x - 0.5 && Math.abs(a.dy - b.dy) < ea.y + eb.y - 0.5;
  }

  function listOverlaps(list, w, h) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        if (copiesOverlap(list[i], list[j], w, h)) return true;
      }
    }
    return false;
  }

  function hasOverlap(main, children, w, h) {
    return listOverlaps([main, ...children], w, h);
  }

  function alternateSide(k) {
    const magnitude = Math.floor((k + 1) / 2);
    return k % 2 === 1 ? magnitude : -magnitude;
  }

  // --- arrangements --------------------------------------------------------------

  function normalChildren(type, params, box, gMul, sMul, random) {
    const g = GAP_EM[params.gap] * gMul;
    const w = box.w;
    const h = box.h;
    const em = h;
    const cellX = w + g * em;
    const cellY = h * (1 + g);
    const copies = params.copies;
    const total = (copies === 'many' ? MANY_TOTAL[type] || 6 : copies + 1);
    const children = [];
    const dir = params.dir;
    const push = (k, dx, dy, scale, rotate) =>
      children.push({ k, dx: dx * sMul, dy: dy * sMul, scale: (scale == null ? 1 : scale) * sMul, rotate: rotate || 0 });

    if (type === 'stackV') {
      for (let k = 1; k < total; k += 1) {
        const side = dir === 'both' ? alternateSide(k) : dir === 'up' ? -k : k;
        push(k, 0, side * h * (1 + g));
      }
    } else if (type === 'rowH') {
      for (let k = 1; k < total; k += 1) {
        const side = dir === 'both' ? alternateSide(k) : dir === 'left' ? -k : k;
        push(k, side * cellX, 0);
      }
    } else if (type === 'diagonal') {
      for (let k = 1; k < total; k += 1) {
        const sign = dir === 'upRight' ? -1 : 1;
        push(k, k * (0.5 * w + g * em), sign * k * h * (1 + g));
      }
    } else if (type === 'grid') {
      if (copies === 'many') {
        const cells = [];
        for (let row = -1; row <= 1; row += 1) {
          for (let col = -1; col <= 1; col += 1) {
            if (col === 0 && row === 0) continue;
            cells.push({ col, row, dist: Math.hypot(col * cellX, row * cellY) });
          }
        }
        cells.sort((a, b) => a.dist - b.dist);
        cells.forEach((cell, index) => {
          push(index + 1, cell.col * cellX, cell.row * cellY);
          children[children.length - 1].checker = Math.abs((cell.col + cell.row) % 2);
        });
      } else {
        const cells = [[1, 0], [0, 1], [1, 1]];
        for (let k = 0; k < copies; k += 1) {
          push(k + 1, cells[k][0] * cellX, cells[k][1] * cellY);
          children[children.length - 1].checker = Math.abs((cells[k][0] + cells[k][1]) % 2);
        }
      }
    } else if (type === 'radial') {
      const radius = w / 2 + g * em;
      for (let k = 1; k < total; k += 1) {
        const angle = (Math.PI * 2 * k) / total;
        const rotate = dir === 'tangent' ? (angle * 180) / Math.PI : 0;
        push(k, Math.sin(angle) * radius, -Math.cos(angle) * radius, 1, rotate);
      }
    } else if (type === 'fan') {
      const spread = (dir === 'wide' ? 110 : 40) * (Math.PI / 180);
      const count = Math.max(1, total - 1);
      const angleStep = spread / count;
      // radius that keeps neighbouring cards from overlapping, so the fan can
      // honour the "copies never overlap" rule without a shrink step
      const radius =
        count <= 1 ? h / 2 : Math.max(h / 2, (w + g * em) / Math.max(0.001, 2 * Math.sin(angleStep / 2)));
      for (let k = 1; k < total; k += 1) {
        const angle = angleStep * k;
        push(k, Math.sin(angle) * radius, h / 2 - Math.cos(angle) * radius, 1, (angle * 180) / Math.PI);
      }
    } else if (type === 'tunnel') {
      const r = copies === 'many' ? 0.65 : 0.8;
      for (let k = 1; k < total; k += 1) {
        const scale = Math.pow(r, k);
        const lift = 1 - scale;
        const dy = dir === 'up' ? -lift * h * 0.5 : dir === 'down' ? lift * h * 0.5 : 0;
        push(k, 0, dy, scale);
      }
    } else if (type === 'scatter') {
      const count = total - 1;
      const placed = [{ dx: 0, dy: 0, scale: 1, rotate: 0 }];
      const minDx = w / 2 - box.cx;
      const maxDx = box.width - w / 2 - box.cx;
      const minDy = h / 2 - box.cy;
      const maxDy = box.height - h / 2 - box.cy;
      const minDistance = h;
      for (let k = 0; k < count; k += 1) {
        let spot = null;
        for (let attempt = 0; attempt < 80 && !spot; attempt += 1) {
          const dx = minDx + random() * Math.max(1, maxDx - minDx);
          const dy = minDy + random() * Math.max(1, maxDy - minDy);
          const rotate = pick([0, -15, 15], random);
          const candidate = { dx, dy, scale: 1, rotate };
          if (Math.hypot(candidate.dx, candidate.dy) < minDistance) continue;
          let blocked = false;
          for (const other of placed) {
            if (copiesOverlap(other, candidate, w, h)) {
              blocked = true;
              break;
            }
          }
          if (blocked) continue;
          spot = candidate;
        }
        if (!spot) {
          // deterministic fallback: evenly spaced ring inside the frame
          const angle = (Math.PI * 2 * k) / Math.max(1, count);
          const radius = Math.max(w, h) * (0.75 + 0.25 * (k % 2));
          spot = {
            dx: clamp(Math.cos(angle) * radius, minDx, maxDx),
            dy: clamp(Math.sin(angle) * radius, minDy, maxDy),
            scale: 0.9,
            rotate: 0,
          };
        }
        placed.push(spot);
      }
      placed.slice(1).forEach((spot, index) => push(index + 1, spot.dx, spot.dy, spot.scale, spot.rotate));
    }
    return children;
  }

  function tiledChildren(type, params, box, gMul, sMul, random) {
    const g = GAP_EM[params.gap] * gMul;
    const w = box.w;
    const h = box.h;
    const cellX = w + g * h;
    const cellY = h * (1 + g);
    const frameW = box.width;
    const frameH = box.height;
    const cols = Math.ceil(frameW / cellX) + 1;
    const rows = Math.ceil(frameH / cellY) + 1;
    const cells = [];
    for (let row = -rows; row <= rows; row += 1) {
      for (let col = -cols; col <= cols; col += 1) {
        if (col === 0 && row === 0) continue;
        let dx = col * cellX;
        const dy = row * cellY;
        if (type === 'brick' && Math.abs(row % 2) === 1) dx += w / 2;
        const cx = box.cx + dx;
        const cy = box.cy + dy;
        if (cx + (w / 2) * sMul <= 0 || cx - (w / 2) * sMul >= frameW) continue;
        if (cy + (h / 2) * sMul <= 0 || cy - (h / 2) * sMul >= frameH) continue;
        cells.push({ dx, dy, dist: Math.hypot(dx, dy), checker: Math.abs((col + row) % 2) });
      }
    }
    cells.sort((a, b) => a.dist - b.dist);
    return cells.slice(0, MAX_COPIES - 1).map((cell, index) => ({
      k: index + 1,
      dx: cell.dx * sMul,
      dy: cell.dy * sMul,
      scale: sMul,
      rotate: 0,
      checker: cell.checker,
    }));
  }

  // Scales a layout down until every copy fits inside the frame (fit: shrink).
  function fitToFrame(children, box) {
    const safe = box.safeArea;
    const minX = -box.cx + safe.left;
    const maxX = box.width - box.cx - safe.right;
    const minY = -box.cy + safe.top;
    const maxY = box.height - box.cy - safe.bottom;
    let factor = 1;
    for (const child of children) {
      const extent = halfExtents(child, box.w, box.h);
      const lowX = child.dx - extent.x;
      const highX = child.dx + extent.x;
      const lowY = child.dy - extent.y;
      const highY = child.dy + extent.y;
      if (lowX < minX && lowX < 0) factor = Math.min(factor, minX / lowX);
      if (highX > maxX && highX > 0) factor = Math.min(factor, maxX / highX);
      if (lowY < minY && lowY < 0) factor = Math.min(factor, minY / lowY);
      if (highY > maxY && highY > 0) factor = Math.min(factor, maxY / highY);
    }
    factor = clamp(factor, 0.1, 1);
    if (factor >= 1) return children;
    return children.map((child) => ({ ...child, dx: child.dx * factor, dy: child.dy * factor, scale: child.scale * factor }));
  }

  const SEPARATION_TRIES = [
    { g: 1, s: 1 },
    { g: 1.5, s: 1 },
    { g: 2, s: 1 },
    { g: 1, s: 0.85 },
    { g: 1.5, s: 0.85 },
    { g: 1, s: 0.7 },
    { g: 2, s: 0.7 },
    { g: 2.5, s: 0.55 },
    { g: 3, s: 0.55 },
    { g: 3, s: 0.4 },
    { g: 4, s: 0.3 },
  ];

  function layoutChildren(type, params, box, random) {
    const main = { dx: 0, dy: 0, scale: 1, rotate: 0 };
    if (type === 'tunnel') return normalChildren(type, params, box, 1, 1, random);
    if (type === 'brick' || type === 'fill') return tiledChildren(type, params, box, 1, 1, random);
    const shrink = params.fit === 'shrink';
    let fallback = null;
    for (const attempt of SEPARATION_TRIES) {
      let children = normalChildren(type, params, box, attempt.g, attempt.s, random);
      if (shrink) children = fitToFrame(children, box);
      if (!hasOverlap(main, children, box.w, box.h)) return children;
      // when fit: shrink pulls the copies in, overlapping the main string from
      // behind is acceptable; copies must still never overlap each other
      if (!fallback && !listOverlaps(children, box.w, box.h)) fallback = children;
    }
    return fallback || [];
  }

  // --- sequences ------------------------------------------------------------------

  function beatBounds(beat) {
    const start = num(beat && beat.start, 0);
    const end = Math.max(start + 0.001, num(beat && beat.end, start + 1));
    return { start, end };
  }

  function beatRamp(t, start, end) {
    const appear = clamp01((t - start) / FADE_IN);
    const vanish = clamp01((end - t) / FADE_OUT);
    return Math.min(appear, vanish);
  }

  function sequenceState(params, type, index, count, t, beat, box, dims) {
    const { start, end } = beatBounds(beat);
    const many = params.copies === 'many';
    const rank = params.seqOrder === 'toMain' ? count - 1 - index : index;
    const state = { envelope: beatRamp(t, start, end), dx: 0, dy: 0, scale: 1, rotate: 0 };
    const sequence = params.sequence;
    if (sequence === 'cascade') {
      const step = many ? (params.seqSpeed === 'slow' ? 0.1 : 0.04) : params.seqSpeed === 'slow' ? 0.2 : 0.08;
      const appear = clamp01((t - (start + rank * step)) / FADE_IN);
      const outRank = count - 1 - rank;
      const vanish = clamp01((end - outRank * step - t) / FADE_OUT);
      state.envelope = Math.min(appear, vanish);
      const eased = 1 - Math.pow(1 - appear, 3);
      state.scale = 0.9 + 0.1 * eased;
    } else if (sequence === 'counterSlide' || sequence === 'counterScroll') {
      const speed = params.seqSpeed === 'slow' ? 0.04 : 0.12;
      if (sequence === 'counterSlide') {
        const sign = index % 2 === 0 ? 1 : -1;
        state.dx = sign * speed * dims.width * (t - start);
      } else {
        const sign = index % 2 === 0 ? 1 : -1;
        const span = dims.width + box.w;
        const raw = speed * dims.width * (t - start);
        const shifted = ((raw % span) + span) % span;
        state.dx = sign * (shifted - span / 2);
      }
    } else if (sequence === 'wave') {
      if (count >= 3) {
        const period = params.seqSpeed === 'slow' ? 2.5 : 1.2;
        const amplitude = WAVE_AMPLITUDE * box.h;
        state.dy = amplitude * Math.sin((Math.PI * 2 * (t / period - index / count)));
      }
    }
    return state;
  }

  // --- variation -------------------------------------------------------------------

  // Presets are curated attr/rule combinations; `variationPreset !== 'custom'`
  // overrides the var1/var2 fields until the user edits them again.
  const PRESET_SLOTS = {
    perspectiveFade: [
      { attr: 'size', rule: 'progress', level: 'normal', target: 'main' },
      { attr: 'color', rule: 'progress', level: 'normal', target: 'main', colorMode: 'light' },
    ],
    popAlternate: [
      { attr: 'color', rule: 'alternate', level: 'normal', target: 'main' },
      { attr: 'decor', rule: 'alternate', level: 'normal', target: 'main' },
    ],
    ransomNote: [
      { attr: 'size', rule: 'random', level: 'normal', target: 'main' },
      { attr: 'font', rule: 'random', level: 'normal', target: 'main' },
    ],
    heroOutline: [
      { attr: 'decor', rule: 'oddOne', level: 'normal', target: 'main' },
      { attr: 'color', rule: 'progress', level: 'normal', target: 'main' },
    ],
    rainbowStep: [{ attr: 'color', rule: 'progress', level: 'strong', target: 'main', colorMode: 'hue' }],
    loudQuiet: [
      { attr: 'size', rule: 'alternate', level: 'normal', target: 'main' },
      { attr: 'font', rule: 'alternate', level: 'normal', target: 'main' },
    ],
  };
  const DECOR_PROGRESS = ['solid', 'shadow', 'glow', 'hollow'];
  const SIZE_RANDOM = [0.5, 0.75, 1, 1.4];
  const COLOR_RANDOM = [0, 1, 2, 3];
  const RANDOM_POOLS = { size: SIZE_RANDOM, color: COLOR_RANDOM, decor: DECOR_PROGRESS, font: [] };
  const FONT_CLASS_RANK = { serif: 1, sans: 2, round: 3, hand: 3, sansBold: 4, pop: 5, display: 6 };
  const MAX_VARIANT_CLASSES = 3;

  // Classes ordered by perceptual distance from the main font: the nearest
  // strength first. At most three extra typefaces per beat (§5.3).
  function fontClassOrder(mainClass, classes) {
    const list = [...new Set((classes || []).filter((entry) => typeof entry === 'string' && entry))];
    const rank = (value) => (FONT_CLASS_RANK[value] == null ? 9 : FONT_CLASS_RANK[value]);
    const main = mainClass && list.includes(mainClass) ? mainClass : null;
    return list
      .filter((entry) => entry !== main)
      .sort((a, b) => Math.abs(rank(a) - rank(main)) - Math.abs(rank(b) - rank(main)) || rank(a) - rank(b))
      .slice(0, MAX_VARIANT_CLASSES);
  }

  function effectiveRule(copies, rule) {
    if (copies === 1 && (rule === 'progress' || rule === 'alternate' || rule === 'random')) return 'oddOne';
    if (copies === 2 && rule === 'alternate') return 'oddOne';
    return rule;
  }

  function resolveSlots(params, fontOrder) {
    const preset = params.variationPreset !== 'custom' ? PRESET_SLOTS[params.variationPreset] : null;
    const raw = preset || [
      { attr: params.var1Attr, rule: params.var1Rule, level: params.var1Level, target: params.var1Target, colorMode: params.var1ColorMode },
      { attr: params.var2Attr, rule: params.var2Rule, level: params.var2Level, target: params.var2Target, colorMode: params.var2ColorMode },
    ];
    return raw
      .filter((slot) => slot && slot.attr && slot.attr !== 'none')
      .map((slot) => ({
        attr: slot.attr,
        rule: effectiveRule(params.copies, slot.rule),
        level: slot.level === 'strong' ? 'strong' : 'normal',
        target: slot.target === 'last' ? 'last' : 'main',
        colorMode: slot.colorMode === 'light' ? 'light' : 'hue',
        fontOrder,
      }));
  }

  function makePicker(random, candidates) {
    let last = null;
    return () => {
      if (!candidates.length) return null;
      let value = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
      if (candidates.length > 1 && value === last) value = candidates[(candidates.indexOf(value) + 1) % candidates.length];
      last = value;
      return value;
    };
  }

  function applySlot(copy, slot, index, count, pick) {
    const u = count <= 1 ? 0 : index / (count - 1);
    const isOdd = index === (slot.target === 'last' ? count - 1 : 0);
    if (slot.rule === 'progress') {
      if (slot.attr === 'size') {
        const r = slot.level === 'strong' ? 0.65 : 0.8;
        const scale = Math.pow(r, index);
        // many copies settle at a readable floor instead of vanishing
        copy.scaleMul *= count >= 6 ? Math.max(0.3, scale) : scale;
      } else if (slot.attr === 'color') {
        if (slot.colorMode === 'light') copy.lightAmount = Math.min(1, copy.lightAmount + u * (slot.level === 'strong' ? 0.8 : 0.5));
        else {
          const step = count >= 6 ? (slot.level === 'strong' ? 360 : 120) / Math.max(1, count - 1) : slot.level === 'strong' ? 60 : 30;
          copy.hueShift += step * index;
        }
      } else if (slot.attr === 'decor') {
        copy.decor = DECOR_PROGRESS[Math.min(DECOR_PROGRESS.length - 1, Math.floor(u * DECOR_PROGRESS.length))];
      } else if (slot.attr === 'font') {
        const order = slot.fontOrder || [];
        copy.fontClass = index > 0 && order.length ? order[(index - 1) % order.length] : null;
      }
    } else if (slot.rule === 'alternate') {
      if (slot.attr === 'size') copy.scaleMul *= copy.alternateKey ? 0.6 : 1;
      else if (slot.attr === 'color') {
        copy.colorIndex = copy.alternateKey;
        copy.gradientInvert = !!copy.alternateKey;
      } else if (slot.attr === 'decor') copy.decor = copy.alternateKey ? 'hollow' : 'solid';
      else if (slot.attr === 'font') {
        const order = slot.fontOrder || [];
        copy.fontClass = copy.alternateKey && order.length ? order[0] : null;
      }
    } else if (slot.rule === 'random') {
      const value = pick ? pick() : null;
      if (slot.attr === 'size') copy.scaleMul *= value == null ? 1 : value;
      else if (slot.attr === 'color') {
        copy.colorIndex = value == null ? -1 : value;
        copy.gradientInvert = value === 1 || value === 3;
      } else if (slot.attr === 'decor') copy.decor = value || 'solid';
      else if (slot.attr === 'font') copy.fontClass = typeof value === 'string' ? value : null;
    } else if (slot.rule === 'oddOne') {
      const order = slot.fontOrder || [];
      if (slot.attr === 'size') copy.scaleMul *= isOdd ? 1.6 : 1;
      else if (slot.attr === 'color') {
        if (isOdd) copy.accentColor = true;
        else copy.colorIndex = 0;
      } else if (slot.attr === 'decor') copy.decor = isOdd ? 'solid' : 'hollow';
      else if (slot.attr === 'font') copy.fontClass = isOdd && order.length ? order[0] : null;
    }
    return copy;
  }


  function emptyCopy(index, isMain) {
    return {
      index,
      isMain: !!isMain,
      dx: 0,
      dy: 0,
      scale: 1,
      rotate: 0,
      opacity: 1,
      // variation
      scaleMul: 1,
      color: null,
      colorIndex: -1,
      accentColor: false,
      hueShift: 0,
      lightAmount: 0,
      gradientInvert: false,
      fontClass: null,
      decor: 'solid',
      alternateKey: 0,
      envelope: 1,
    };
  }

  /**
   * Returns the copy list for one frame. Pure and deterministic for a given
   * (instance, t, dims, rng state). The main copy is always index 0; engine
   * code draws only `!isMain` and keeps the real main text on top.
   */
  function plan(instance, beat, t, dims, random) {
    if (!instance || !instance.type || instance.type === 'none' || instance.enabled === false) return [];
    const type = instance.type;
    if (!TYPES.includes(type)) return [];
    const params = normalizeParams(type, instance.params);
    const box = boxOf(dims);
    const rngFn = typeof random === 'function' ? random : rng.mulberry32(1);
    // one draw feeds the variation RNG, so variation is stable even though the
    // layout (scatter) consumes a variable number of draws
    const variationSeed = Math.floor(rngFn() * 0xffffffff) >>> 0;
    let children = layoutChildren(type, params, box, rngFn);
    const count = children.length + 1;
    const fade = params.copyOpacity === 'fade' || (params.var1Attr === 'none' && params.var2Attr === 'none');
    const base = params.copies === 'many' ? 0.45 : 0.7;
    const deep = params.copies === 'many' ? 0.1 : 0.3;
    const varRandom = rng.mulberry32(variationSeed);
    const mainFontClass = dims && dims.mainFontClass ? String(dims.mainFontClass) : null;
    const fontOrder = fontClassOrder(mainFontClass, dims && dims.fontClasses);
    const slots = resolveSlots(params, fontOrder);
    const pickers = slots.map((slot) => makePicker(varRandom, slot.attr === 'font' ? slot.fontOrder : RANDOM_POOLS[slot.attr] || []));
    const copies = [];
    for (let index = 0; index < count; index += 1) {
      const child = index === 0 ? null : children[index - 1];
      const copy = emptyCopy(index, index === 0);
      if (child) {
        const sequence = sequenceState(params, type, index, count, t, beat, box, box);
        copy.dx = child.dx + sequence.dx;
        copy.dy = child.dy + sequence.dy;
        copy.scale = child.scale * sequence.scale;
        copy.rotate = child.rotate + sequence.rotate;
        copy.envelope = sequence.envelope;
        copy.opacity = fade ? base + (deep - base) * (index / Math.max(1, count - 1)) : base;
      }
      copy.alternateKey = child && child.checker != null ? child.checker : index % 2;
      slots.forEach((slot, slotIndex) => applySlot(copy, slot, index, count, pickers[slotIndex]));
      copy.scale *= copy.scaleMul;
      if (child && (type === 'brick' || type === 'fill') && Math.hypot(copy.dx, copy.dy) < Math.max(box.w, box.h)) {
        // autoContrast: the copies around the main string fade back
        copy.opacity *= 0.35;
      }
      copies.push(copy);
    }
    // nearest last so the closest copies sit just behind the main text
    copies.sort((a, b) => {
      if (a.isMain) return -1;
      if (b.isMain) return 1;
      return Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy);
    });
    copies.forEach((copy, index) => {
      copy.index = index;
      copy.isMain = index === 0;
    });
    return copies;
  }

  /** Stable key for the perceptually distinct combination of this instance. */
  function signature(instance) {
    if (!instance || !instance.type || instance.type === 'none') return 'none';
    const type = instance.type;
    const p = normalizeParams(type, instance.params);
    return [
      type,
      p.copies,
      p.dir,
      p.mainIndex,
      p.gap,
      p.sequence,
      p.seqSpeed,
      p.seqOrder,
      p.var1Attr,
      p.var1Rule,
      p.var1Level,
      p.var1Target,
      p.var2Attr,
      p.var2Rule,
      p.var2Level,
      p.var2Target,
      p.variationPreset,
    ].join('|');
  }

  function costOf(params, instance) {
    const type = instance && instance.type ? instance.type : 'stackV';
    const p = normalizeParams(type, params);
    const many = p.copies === 'many';
    const total = type === 'brick' || type === 'fill' ? 16 : many ? MANY_TOTAL[type] || 6 : p.copies + 1;
    let cost = 1 + Math.ceil(total / 4);
    if (p.var1Attr === 'decor' || p.var2Attr === 'decor') cost += 1;
    if (p.var1Attr === 'font' || p.var2Attr === 'font') cost += 2;
    return cost;
  }

  // --- registry ---------------------------------------------------------------------

  function paramsFor(type) {
    const dirs = DIR_OPTIONS[type] || [];
    const list = [
      { key: 'copies', kind: 'select', options: [1, 2, 3, 'many'], default: type === 'brick' || type === 'fill' ? 'many' : 2 },
      { key: 'mainIndex', kind: 'select', options: ['end', 'center'], default: 'end' },
      { key: 'gap', kind: 'select', options: ['tight', 'normal', 'wide'], default: 'normal' },
      { key: 'fit', kind: 'select', options: ['shrink', 'overflow'], default: type === 'brick' || type === 'fill' ? 'overflow' : 'shrink' },
      { key: 'sequence', kind: 'select', options: SEQUENCES, default: 'cascade' },
      { key: 'seqSpeed', kind: 'select', options: ['fast', 'slow'], default: 'fast' },
      { key: 'seqOrder', kind: 'select', options: ['fromMain', 'toMain'], default: 'fromMain' },
      { key: 'copyOpacity', kind: 'select', options: ['flat', 'fade'], default: 'flat' },
      { key: 'var1Attr', kind: 'select', options: VARIATION_ATTRS, default: 'none' },
      { key: 'var1Rule', kind: 'select', options: VARIATION_RULES, default: 'progress' },
      { key: 'var1Level', kind: 'select', options: ['normal', 'strong'], default: 'normal' },
      { key: 'var1ColorMode', kind: 'select', options: ['hue', 'light'], default: 'hue' },
      { key: 'var1Target', kind: 'select', options: ['main', 'last'], default: 'main' },
      { key: 'var2Attr', kind: 'select', options: VARIATION_ATTRS, default: 'none' },
      { key: 'var2Rule', kind: 'select', options: VARIATION_RULES, default: 'progress' },
      { key: 'var2Level', kind: 'select', options: ['normal', 'strong'], default: 'normal' },
      { key: 'var2ColorMode', kind: 'select', options: ['hue', 'light'], default: 'hue' },
      { key: 'var2Target', kind: 'select', options: ['main', 'last'], default: 'main' },
      { key: 'variationPreset', kind: 'select', options: PRESET_IDS, default: 'custom' },
      { key: 'seedShift', kind: 'int', min: 0, max: 999, step: 1, default: 0 },
    ];
    if (dirs.length) list.splice(1, 0, { key: 'dir', kind: 'select', options: dirs, default: dirs[0] });
    return list;
  }

  for (const type of TYPES) {
    fx.register({
      group: 'repeat',
      type,
      tags: ['repeat'],
      cost: 2,
      params: paramsFor(type),
      defaults: { params: {} },
      normalize: (params) => normalize(type, params),
      costOf: (params) => costOf(params, { type }),
    });
  }

  return {
    TYPES,
    SEQUENCES,
    GAP_EM,
    MANY_TOTAL,
    MAX_COPIES,
    normalize,
    countBin,
    expectedTotal,
    plan,
    signature,
    costOf,
  };
});
