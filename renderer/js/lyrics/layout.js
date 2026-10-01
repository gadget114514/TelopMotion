(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng'));
  else {
    root.SA = root.SA || {};
    root.SA.layout = factory(root.SA.rng);
  }
})(typeof self !== 'undefined' ? self : this, function (rng) {
  'use strict';

  const TAU = Math.PI * 2;
  const SAFE = 0.08;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function blockCenter(blockBBox) {
    if (!blockBBox) return { x: 0, y: 0 };
    return { x: (blockBBox.x1 + blockBBox.x2) / 2, y: (blockBBox.y1 + blockBBox.y2) / 2 };
  }

  function letterWidth(letter) {
    return (letter && letter.local && letter.local.w) || 0;
  }

  function letterHeight(letter) {
    return (letter && letter.local && letter.local.h) || 0;
  }

  function rowPositions(letters, blockBBox) {
    const center = blockCenter(blockBBox);
    return letters.map((letter) => ({
      x: letter.local.cx - center.x,
      y: letter.local.cy - center.y,
      rot: 0,
      scale: 1,
    }));
  }

  function cumulativeByWidth(letters) {
    const values = [];
    let total = 0;
    for (const letter of letters) {
      const width = Math.max(1, letterWidth(letter)) * (letter.advanceRatio || 1);
      values.push({ start: total, width });
      total += width;
    }
    return { values, total: Math.max(1, total) };
  }

  function formation(type, params, letters, blockBBox, frame, random) {
    const p = params || {};
    const list = letters || [];
    const N = list.length;
    const short = Math.min(frame.width, frame.height);
    const size = list.reduce((max, letter) => Math.max(max, letterHeight(letter)), 0) || short * 0.1;
    if (!N) return [];

    if (type === 'row' || !type) return rowPositions(list, blockBBox);

    if (type === 'vertical') {
      const gap = (p.columnGap == null ? 1.2 : p.columnGap) * size;
      const lineAdvance = size * 1.15;
      const safeHeight = frame.height * (1 - SAFE * 2);
      // An upright letter steps down the column by the em; a rotated one runs by
      // its own advance, which is the glyph width now turned along the column.
      const stepOf = (letter) => {
        if (!letter || !letter.vertRotate) return lineAdvance;
        const advance = Number(letter.advanceWithSpacing);
        const width = Number.isFinite(advance) && advance > 0 ? advance : Number(letter.advance);
        if (!Number.isFinite(width) || width <= 0) return lineAdvance;
        return Math.min(Math.max(width, size * 0.2), lineAdvance * 1.5);
      };
      const rows = [];
      let row = null;
      let used = 0;
      for (let i = 0; i < N; i += 1) {
        const step = stepOf(list[i]);
        if (!row || used + step > safeHeight) {
          row = { indices: [], used: 0 };
          rows.push(row);
          used = 0;
        }
        row.indices.push({ index: i, step, offset: used });
        used += step;
        row.used = used;
      }
      const columns = rows.length;
      const result = new Array(N);
      for (let c = 0; c < columns; c += 1) {
        const current = rows[c];
        for (const entry of current.indices) {
          // centre the column on the same point the block is anchored at
          const y = entry.offset + entry.step / 2 - current.used / 2;
          result[entry.index] = {
            x: ((columns - 1) / 2 - c) * gap,
            y,
            rot: list[entry.index].vertRotate ? 90 : 0,
            scale: 1,
          };
        }
      }
      return result;
    }

    if (type === 'circle' || type === 'arc') {
      const radius = (type === 'circle' ? (p.radius == null ? 0.28 : p.radius) : p.radius == null ? 0.6 : p.radius) * short;
      const start = ((p.startAngle == null ? -90 : p.startAngle) * Math.PI) / 180;
      const clockwise = p.clockwise !== false;
      const sweep = type === 'arc' ? ((p.sweep == null ? 120 : p.sweep) * Math.PI) / 180 : TAU;
      const { values, total } = cumulativeByWidth(list);
      const bulge = p.bulge === 'down' ? -1 : 1;
      return list.map((letter, index) => {
        const entry = values[index];
        const u = (entry.start + entry.width / 2) / total;
        const direction = clockwise ? 1 : -1;
        const theta = type === 'circle' ? start + direction * sweep * u : start - sweep / 2 + sweep * u;
        return {
          x: radius * Math.cos(theta),
          y: radius * Math.sin(theta) * (type === 'arc' ? bulge : 1),
          rot: p.faceOut === false ? 0 : (theta * 180) / Math.PI + 90,
          scale: 1,
        };
      });
    }

    if (type === 'spiral') {
      const r0 = (p.r0 == null ? 0.05 : p.r0) * short;
      const r1 = (p.r1 == null ? 0.35 : p.r1) * short;
      const turns = p.turns == null ? 2.5 : p.turns;
      return list.map((letter, index) => {
        const u = N === 1 ? 0 : index / (N - 1);
        const r = r0 + (r1 - r0) * u;
        const theta = u * turns * TAU - Math.PI / 2;
        return { x: r * Math.cos(theta), y: r * Math.sin(theta), rot: (theta * 180) / Math.PI + 90, scale: 1 };
      });
    }

    if (type === 'wave') {
      const base = rowPositions(list, blockBBox);
      const amp = (p.amp == null ? 0.06 : p.amp) * short;
      const wavelength = Math.max(1, (p.wavelength == null ? 0.5 : p.wavelength) * frame.width);
      const phase = ((p.phase || 0) * Math.PI) / 180;
      return base.map((point) => {
        const y = amp * Math.sin((TAU * point.x) / wavelength + phase);
        const dy = amp * Math.cos((TAU * point.x) / wavelength + phase) * (TAU / wavelength);
        return { x: point.x, y: point.y + y, rot: (Math.atan(dy) * 180) / Math.PI, scale: 1 };
      });
    }

    if (type === 'diagonal') {
      const angle = ((p.angle == null ? -20 : p.angle) * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return rowPositions(list, blockBBox).map((point) => ({
        x: point.x * cos - point.y * sin,
        y: point.x * sin + point.y * cos,
        rot: p.followAngle ? (angle * 180) / Math.PI : 0,
        scale: 1,
      }));
    }

    if (type === 'staircase') {
      const step = (p.step == null ? 0.35 : p.step) * size;
      return rowPositions(list, blockBBox).map((point, index) => ({ x: point.x, y: point.y - index * step, rot: 0, scale: 1 }));
    }

    if (type === 'grid') {
      const cols = p.cols > 0 ? p.cols : Math.max(1, Math.ceil(Math.sqrt(N * 1.6)));
      const rows = Math.ceil(N / cols);
      const safeW = frame.width * (1 - SAFE * 2);
      const safeH = frame.height * (1 - SAFE * 2);
      const gap = (p.gap == null ? 0.08 : p.gap) * size;
      const maxW = list.reduce((max, letter) => Math.max(max, letterWidth(letter)), 0) || size;
      const maxH = size;
      const cellScale = Math.min(1, (safeW / cols - gap) / Math.max(1, maxW), (safeH / rows - gap) / Math.max(1, maxH));
      const cellW = safeW / cols;
      const cellH = safeH / rows;
      return list.map((letter, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        return {
          x: (col + 0.5) * cellW - safeW / 2,
          y: (row + 0.5) * cellH - safeH / 2,
          rot: 0,
          scale: cellScale,
        };
      });
    }

    if (type === 'stackedWords') {
      const words = [];
      let current = null;
      for (const letter of list) {
        const key = letter.wordIdx;
        if (!current || current.key !== key) {
          current = { key, letters: [] };
          words.push(current);
        }
        current.letters.push(letter);
      }
      const fillWidth = (p.fillWidth == null ? 0.8 : p.fillWidth) * frame.width;
      const lineAdvance = size * 1.25;
      const result = [];
      words.forEach((word, wordIndex) => {
        let width = 0;
        let minX = Infinity;
        let maxX = -Infinity;
        for (const letter of word.letters) {
          width += Math.max(1, letterWidth(letter));
          minX = Math.min(minX, letter.local.cx - letter.local.w / 2);
          maxX = Math.max(maxX, letter.local.cx + letter.local.w / 2);
        }
        const actual = Math.max(1, maxX - minX);
        const scale = Math.min(2.5, fillWidth / actual);
        let cursor = -((actual * scale) / 2);
        const y = wordIndex * lineAdvance - ((words.length - 1) * lineAdvance) / 2;
        for (const letter of word.letters) {
          const letterWidthPx = Math.max(1, letterWidth(letter)) * scale;
          result.push({
            x: cursor + letterWidthPx / 2,
            y,
            rot: 0,
            scale,
          });
          cursor += letterWidthPx;
        }
      });
      return result;
    }

    if (type === 'scatter') {
      const safeW = frame.width * (1 - (p.safeArea == null ? SAFE : p.safeArea) * 2);
      const safeH = frame.height * (1 - (p.safeArea == null ? SAFE : p.safeArea) * 2);
      const spread = clamp(p.spread == null ? 0.35 : p.spread, 0.05, 1);
      const random2 = random || rng.mulberry32(1);
      const minDistance = size * 0.8;
      const placed = [];
      let guard = 0;
      while (placed.length < N && guard < N * 80) {
        guard += 1;
        const candidate = {
          x: (random2() * 2 - 1) * (safeW / 2) * spread,
          y: (random2() * 2 - 1) * (safeH / 2) * spread,
        };
        if (placed.every((point) => Math.hypot(point.x - candidate.x, point.y - candidate.y) >= minDistance)) {
          placed.push(candidate);
        }
      }
      while (placed.length < N) {
        placed.push({ x: (random2() * 2 - 1) * (safeW / 2), y: (random2() * 2 - 1) * (safeH / 2) });
      }
      return placed.map((point) => ({ x: point.x, y: point.y, rot: (random2() * 2 - 1) * 15, scale: 1 }));
    }

    if (type === 'path') {
      const points = Array.isArray(p.points) && p.points.length >= 2 ? p.points : [{ x: 0.1, y: 0.7 }, { x: 0.9, y: 0.3 }];
      const px = points.map((point) => ({ x: (point.x - 0.5) * frame.width, y: (point.y - 0.5) * frame.height }));
      const spline = p.smooth === false ? px : catmullRom(px, 12);
      const lengths = [0];
      for (let i = 1; i < spline.length; i += 1) {
        lengths.push(lengths[i - 1] + Math.hypot(spline[i].x - spline[i - 1].x, spline[i].y - spline[i - 1].y));
      }
      const total = Math.max(1, lengths[lengths.length - 1]);
      const { values } = cumulativeByWidth(list);
      return list.map((letter, index) => {
        const entry = values[index];
        const target = (((entry.start + entry.width / 2) / (values[values.length - 1] ? values[values.length - 1].start + values[values.length - 1].width : 1)) * total);
        const point = pointAt(spline, lengths, target);
        const ahead = pointAt(spline, lengths, Math.min(total, target + 4));
        const angle = (Math.atan2(ahead.y - point.y, ahead.x - point.x) * 180) / Math.PI;
        return { x: point.x, y: point.y, rot: angle, scale: 1 };
      });
    }

    return rowPositions(list, blockBBox);
  }

  function catmullRom(points, segments) {
    if (points.length < 3) return points.slice();
    const result = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      for (let step = 0; step < segments; step += 1) {
        const t = step / segments;
        const t2 = t * t;
        const t3 = t2 * t;
        result.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        });
      }
    }
    result.push(points[points.length - 1]);
    return result;
  }

  function pointAt(spline, lengths, distance) {
    if (!spline.length) return { x: 0, y: 0 };
    let index = 1;
    while (index < lengths.length - 1 && lengths[index] < distance) index += 1;
    const previous = lengths[index - 1];
    const segment = Math.max(1e-6, lengths[index] - previous);
    const t = clamp((distance - previous) / segment, 0, 1);
    return {
      x: spline[index - 1].x + (spline[index].x - spline[index - 1].x) * t,
      y: spline[index - 1].y + (spline[index].y - spline[index - 1].y) * t,
    };
  }

  function startFormation(type, params, targets, frame, random) {
    const p = params || {};
    const random2 = random || rng.mulberry32(1);
    const short = Math.min(frame.width, frame.height);
    const N = targets.length;
    if (type === 'formation') {
      return targets.map((point) => ({ ...point, scale: 1, rot: 0 }));
    }
    if (type === 'offscreenEdges') {
      return targets.map((point) => {
        const edge = Math.floor(random2() * 4) % 4;
        if (edge === 0) return { x: point.x + (random2() * 2 - 1) * frame.width * 0.2, y: -frame.height * 0.6, rot: 0, scale: 1 };
        if (edge === 1) return { x: frame.width * 0.6, y: point.y + (random2() * 2 - 1) * frame.height * 0.2, rot: 0, scale: 1 };
        if (edge === 2) return { x: point.x + (random2() * 2 - 1) * frame.width * 0.2, y: frame.height * 0.6, rot: 0, scale: 1 };
        return { x: -frame.width * 0.6, y: point.y + (random2() * 2 - 1) * frame.height * 0.2, rot: 0, scale: 1 };
      });
    }
    if (type === 'corners') {
      const corners = [
        { x: -frame.width * 0.5, y: -frame.height * 0.5 },
        { x: frame.width * 0.5, y: -frame.height * 0.5 },
        { x: frame.width * 0.5, y: frame.height * 0.5 },
        { x: -frame.width * 0.5, y: frame.height * 0.5 },
      ];
      return targets.map((point, index) => ({ ...corners[index % 4], rot: 0, scale: 1 }));
    }
    if (type === 'point') {
      const x = ((p.x == null ? 0.5 : p.x) - 0.5) * frame.width;
      const y = ((p.y == null ? 0.5 : p.y) - 0.5) * frame.height;
      const spread = (p.spread || 0) * short;
      return targets.map(() => ({ x: x + (random2() * 2 - 1) * spread, y: y + (random2() * 2 - 1) * spread, rot: 0, scale: 1 }));
    }
    if (type === 'ring') {
      const radius = (p.radius == null ? 0.7 : p.radius) * short;
      return targets.map((point) => {
        const angle = Math.atan2(point.y, point.x) + Math.PI;
        return { x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius, rot: 0, scale: 1 };
      });
    }
    if (type === 'depth') {
      return targets.map((point) => ({ x: point.x, y: point.y, rot: 0, scale: 0.12 }));
    }
    if (type === 'mirror') {
      return targets.map((point) => ({ x: -point.x, y: point.y, rot: 0, scale: 1 }));
    }
    if (type === 'none') {
      return targets.map((point) => ({ ...point, rot: point.rot || 0, scale: 1 }));
    }
    return targets.map((point) => ({ ...point, rot: point.rot || 0, scale: 1 }));
  }

  function curveSign(curveDir, index, random) {
    if (typeof curveDir === 'number') return curveDir;
    if (curveDir === 'left') return -1;
    if (curveDir === 'right') return 1;
    if (curveDir === 'alternate') return index % 2 === 0 ? -1 : 1;
    if (curveDir === 'random') return random && random() < 0.5 ? -1 : 1;
    return -1;
  }

  function bezierPoint(start, end, progress, curve, sign) {
    const p = clamp(progress, 0, 1);
    if (!curve) {
      return { x: start.x + (end.x - start.x) * p, y: start.y + (end.y - start.y) * p };
    }
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2;
    const nx = (-dy / length) * sign;
    const ny = (dx / length) * sign;
    const cx = mx + nx * curve * length;
    const cy = my + ny * curve * length;
    const inverse = 1 - p;
    return {
      x: inverse * inverse * start.x + 2 * inverse * p * cx + p * p * end.x,
      y: inverse * inverse * start.y + 2 * inverse * p * cy + p * p * end.y,
    };
  }

  function blendPoint(start, end, progress, curve, sign) {
    const point = bezierPoint(start, end, progress, curve, sign);
    return {
      x: point.x,
      y: point.y,
      rot: (start.rot || 0) + ((end.rot || 0) - (start.rot || 0)) * clamp(progress, 0, 1),
      scale: (start.scale == null ? 1 : start.scale) + ((end.scale == null ? 1 : end.scale) - (start.scale == null ? 1 : start.scale)) * clamp(progress, 0, 1),
    };
  }

  return {
    FORMATION_TYPES: ['row', 'vertical', 'circle', 'arc', 'spiral', 'wave', 'diagonal', 'staircase', 'grid', 'stackedWords', 'scatter', 'path'],
    START_TYPES: ['offscreenEdges', 'corners', 'point', 'ring', 'depth', 'mirror', 'formation', 'previousCue'],
    formation,
    startFormation,
    curveSign,
    bezierPoint,
    blendPoint,
    catmullRom,
  };
});
