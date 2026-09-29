(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng'));
  else {
    root.SA = root.SA || {};
    root.SA.split = factory(root.SA.rng);
  }
})(typeof self !== 'undefined' ? self : this, function (rng) {
  'use strict';

  // Convex colour planes for the backdrop (mid) layer. Every layout starts from
  // the frame rectangle and cuts it with straight lines; a cut of a convex
  // polygon is always convex, so every region can be drawn with the convex
  // shape primitive. `regions` decides which planes get painted (the coverage
  // share) so the backdrop takes over the screen as the weird axis rises.

  const LAYOUTS = ['halves', 'diagonal', 'thirds', 'bands', 'quads', 'grid', 'chevron', 'radial', 'mondrian', 'frame', 'shards'];
  const TAU = Math.PI * 2;
  const EPS = 1e-6;

  function num(value, fallback) {
    if (value == null || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(1, number));
  }

  function framePoly(frame) {
    const width = Math.max(1, num(frame && frame.width, 1920));
    const height = Math.max(1, num(frame && frame.height, 1080));
    return {
      width,
      height,
      points: [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
      ],
    };
  }

  function area(points) {
    let sum = 0;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      sum += a.x * b.y - b.x * a.y;
    }
    return Math.abs(sum) / 2;
  }

  function bbox(points) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const point of points) {
      x0 = Math.min(x0, point.x);
      y0 = Math.min(y0, point.y);
      x1 = Math.max(x1, point.x);
      y1 = Math.max(y1, point.y);
    }
    return { x0, y0, x1, y1, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
  }

  function centroid(points) {
    let x = 0;
    let y = 0;
    for (const point of points) {
      x += point.x;
      y += point.y;
    }
    return { x: x / Math.max(1, points.length), y: y / Math.max(1, points.length) };
  }

  // line: a*x + b*y + c = 0 with a unit normal. `keep` selects a*x+b*y+c >= 0.
  function lineThrough(angleDeg, px, py) {
    const angle = (Number(angleDeg) || 0) * (Math.PI / 180);
    const a = Math.cos(angle);
    const b = Math.sin(angle);
    return { a, b, c: -(a * px + b * py) };
  }

  function signed(line, point) {
    return line.a * point.x + line.b * point.y + line.c;
  }

  // Sutherland–Hodgman half-plane clip; the result stays convex.
  function clipHalf(points, line, keepPositive) {
    const out = [];
    const n = points.length;
    for (let i = 0; i < n; i += 1) {
      const current = points[i];
      const next = points[(i + 1) % n];
      const dc = signed(line, current);
      const dn = signed(line, next);
      const insideCurrent = keepPositive ? dc >= -1e-9 : dc <= 1e-9;
      const insideNext = keepPositive ? dn >= -1e-9 : dn <= 1e-9;
      if (insideCurrent) out.push({ x: current.x, y: current.y });
      if (insideCurrent !== insideNext) {
        const t = dc / (dc - dn);
        out.push({ x: current.x + (next.x - current.x) * t, y: current.y + (next.y - current.y) * t });
      }
    }
    return out.length >= 3 ? out : [];
  }

  function splitPoly(points, line) {
    return [clipHalf(points, line, true), clipHalf(points, line, false)].filter((poly) => poly.length >= 3);
  }

  function pointInPoly(points, x, y) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const a = points[i];
      const b = points[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y || EPS) + a.x) inside = !inside;
    }
    return inside;
  }

  // --- cutting helpers ---------------------------------------------------------

  function normalExtent(frame, angleDeg) {
    const angle = (angleDeg * Math.PI) / 180;
    return Math.abs(frame.width * Math.cos(angle)) + Math.abs(frame.height * Math.sin(angle));
  }

  // the slab { n·(p - c) <= t } ∩ frame
  function belowSlab(frame, angleDeg, t) {
    const center = { x: frame.width / 2, y: frame.height / 2 };
    const line = lineThrough(angleDeg, center.x, center.y);
    return clipHalf(frame.points, { a: line.a, b: line.b, c: line.c - t }, false);
  }

  function belowArea(frame, angleDeg, t) {
    return area(belowSlab(frame, angleDeg, t));
  }

  // t so that the slab below the line covers exactly `target` px²
  function solveBelow(frame, angleDeg, target) {
    const limit = normalExtent(frame, angleDeg) / 2 + Math.max(frame.width, frame.height);
    let lo = -limit;
    let hi = limit;
    for (let i = 0; i < 30; i += 1) {
      const mid = (lo + hi) / 2;
      if (belowArea(frame, angleDeg, mid) < target) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // splits the frame into the slab below `t` and the slab above it
  function slabPieces(frame, angleDeg, t) {
    const center = { x: frame.width / 2, y: frame.height / 2 };
    const line = lineThrough(angleDeg, center.x, center.y);
    const cut = { a: line.a, b: line.b, c: line.c - t };
    return { below: clipHalf(frame.points, cut, false), above: clipHalf(frame.points, cut, true), line: cut };
  }

  // Bands: `parts` stripes perpendicular to `angle`. The first `k` stripes
  // together cover exactly the target, so the painted share is exact.
  function buildBands(frame, options) {
    const angle = num(options.angle, options.layout === 'diagonal' ? 30 : 0);
    const parts = Math.max(2, Math.round(num(options.parts, 3)));
    const total = frame.width * frame.height;
    const coverage = clamp01(options.coverage);
    const target = coverage * total;
    const k = Math.max(1, Math.min(parts - 1, Math.round(coverage * parts)));
    const cuts = [];
    for (let j = 1; j <= k; j += 1) cuts.push(solveBelow(frame, angle, (target * j) / k));
    // the unpainted remainder is divided evenly past the target line
    const limit = normalExtent(frame, angle) / 2;
    const last = cuts[cuts.length - 1];
    const rest = parts - 1 - k;
    for (let j = 1; j <= rest; j += 1) cuts.push(last + ((limit - last) * j) / (rest + 1));
    // motion slides the whole band set along its normal
    const shift = num(options.offset, 0) * limit;
    if (shift) for (let i = 0; i < cuts.length; i += 1) cuts[i] += shift;
    cuts.sort((a, b) => a - b);
    const edges = [-Infinity, ...cuts, Infinity];
    const center = { x: frame.width / 2, y: frame.height / 2 };
    const base = lineThrough(angle, center.x, center.y);
    const lineAt = (t) => ({ a: base.a, b: base.b, c: base.c - t });
    const regions = [];
    const lines = [];
    for (let i = 0; i < edges.length - 1; i += 1) {
      let poly = frame.points;
      if (Number.isFinite(edges[i])) poly = clipHalf(poly, lineAt(edges[i]), true);
      if (poly.length >= 3 && Number.isFinite(edges[i + 1])) poly = clipHalf(poly, lineAt(edges[i + 1]), false);
      if (poly.length >= 3) regions.push({ points: poly, painted: coverage >= 0.999 ? true : i < k, group: null });
      if (Number.isFinite(edges[i + 1]) && lines.length < 2) lines.push(lineAt(edges[i + 1]));
    }
    return { regions, lines };
  }

  // Grids: equal cells painted in row-major order; the last cell is cut so the
  // painted share is exact.
  function buildGrid(frame, options, cols, rows) {
    const target = clamp01(options.coverage) * frame.width * frame.height;
    const cells = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x0 = (frame.width * col) / cols;
        const y0 = (frame.height * row) / rows;
        cells.push([
          { x: x0, y: y0 },
          { x: x0 + frame.width / cols, y: y0 },
          { x: x0 + frame.width / cols, y: y0 + frame.height / rows },
          { x: x0, y: y0 + frame.height / rows },
        ]);
      }
    }
    const regions = [];
    let painted = 0;
    for (const cell of cells) {
      const cellArea = area(cell);
      if (painted + cellArea <= target + 0.5) {
        regions.push({ points: cell, painted: true, group: null });
        painted += cellArea;
        continue;
      }
      if (painted < target - 0.5) {
        const need = target - painted;
        const box = bbox(cell);
        const cutY = box.y0 + need / Math.max(1, box.width);
        const line = lineThrough(90, 0, cutY);
        const top = clipHalf(cell, line, false);
        const bottom = clipHalf(cell, line, true);
        if (top.length >= 3) {
          regions.push({ points: top, painted: true, group: null });
          painted += area(top);
        }
        if (bottom.length >= 3) regions.push({ points: bottom, painted: false, group: null });
      } else {
        regions.push({ points: cell, painted: false, group: null });
      }
    }
    return { regions, lines: [] };
  }

  function buildChevron(frame, options) {
    const apexX = num(options.centerX, 0.5) * frame.width;
    const apexY = num(options.centerY, 0.5) * frame.height;
    const spread = Math.max(10, num(options.spread, 35));
    const first = lineThrough(90 - spread, apexX, apexY);
    const second = lineThrough(90 + spread, apexX, apexY);
    const regions = [];
    const [a, b] = splitPoly(frame.points, first);
    if (a.length >= 3) regions.push({ points: a, group: null });
    if (b.length >= 3) regions.push({ points: b, group: null });
    const apexPoint = { x: apexX, y: apexY };
    const inside = regions.find((region) => pointInPoly(region.points, apexPoint.x + 1, apexPoint.y + 1) || pointInPoly(region.points, apexPoint.x - 1, apexPoint.y - 1));
    if (inside) {
      const index = regions.indexOf(inside);
      regions.splice(index, 1);
      const [c, d] = splitPoly(inside.points, second);
      if (c.length >= 3) regions.push({ points: c, group: null });
      if (d.length >= 3) regions.push({ points: d, group: null });
    }
    return { regions, lines: [{ a: first.a, b: first.b, c: first.c }, { a: second.a, b: second.b, c: second.c }] };
  }

  function buildRadial(frame, options) {
    const center = { x: num(options.centerX, 0.5) * frame.width, y: num(options.centerY, 0.5) * frame.height };
    const parts = Math.max(2, Math.round(num(options.parts, 5)));
    const start = num(options.angle, -90) * (Math.PI / 180);
    const regions = [];
    const lines = [];
    for (let i = 0; i < parts; i += 1) {
      const a0 = start + (TAU * i) / parts;
      const a1 = start + (TAU * (i + 1)) / parts;
      const n0 = { a: -Math.sin(a0), b: Math.cos(a0), c: Math.sin(a0) * center.x - Math.cos(a0) * center.y };
      const n1 = { a: Math.sin(a1), b: -Math.cos(a1), c: -Math.sin(a1) * center.x + Math.cos(a1) * center.y };
      let poly = clipHalf(frame.points, n0, true);
      if (poly.length >= 3) poly = clipHalf(poly, n1, true);
      if (poly.length >= 3) regions.push({ points: poly, group: null });
      if (lines.length < 2) lines.push({ a: n0.a, b: n0.b, c: n0.c });
    }
    return { regions, lines };
  }

  function buildMondrian(frame, options, random) {
    const parts = Math.max(2, Math.round(num(options.parts, 5)));
    let pieces = [{ x: 0, y: 0, w: frame.width, h: frame.height }];
    let guard = 0;
    while (pieces.length < parts && guard < 64) {
      guard += 1;
      pieces.sort((a, b) => b.w * b.h - a.w * a.h);
      const target = pieces.shift();
      const ratio = 0.3 + random() * 0.4;
      if (target.w >= target.h) {
        const w1 = target.w * ratio;
        pieces.push({ x: target.x, y: target.y, w: w1, h: target.h }, { x: target.x + w1, y: target.y, w: target.w - w1, h: target.h });
      } else {
        const h1 = target.h * ratio;
        pieces.push({ x: target.x, y: target.y, w: target.w, h: h1 }, { x: target.x, y: target.y + h1, w: target.w, h: target.h - h1 });
      }
    }
    const regions = pieces.map((piece) => ({
      points: [
        { x: piece.x, y: piece.y },
        { x: piece.x + piece.w, y: piece.y },
        { x: piece.x + piece.w, y: piece.y + piece.h },
        { x: piece.x, y: piece.y + piece.h },
      ],
      group: null,
    }));
    return { regions, lines: [] };
  }

  function buildFrame(frame, options) {
    const coverage = Math.max(0.02, clamp01(options.coverage));
    // solve (1-2s)^2 = 1 - coverage: the ring is exactly the coverage share
    const s = (1 - Math.sqrt(Math.max(0, 1 - coverage))) / 2;
    const ix = Math.max(1, s * frame.width);
    const iy = Math.max(1, s * frame.height);
    const regions = [];
    const inner = { x: ix, y: iy, w: Math.max(1, frame.width - ix * 2), h: Math.max(1, frame.height - iy * 2) };
    regions.push({
      points: [
        { x: inner.x, y: inner.y },
        { x: inner.x + inner.w, y: inner.y },
        { x: inner.x + inner.w, y: inner.y + inner.h },
        { x: inner.x, y: inner.y + inner.h },
      ],
      group: 'inner',
      preferred: false,
    });
    regions.push({ points: [{ x: 0, y: 0 }, { x: frame.width, y: 0 }, { x: inner.x + inner.w, y: inner.y }, { x: inner.x, y: inner.y }], group: 'ring', preferred: true });
    regions.push({ points: [{ x: inner.x + inner.w, y: inner.y }, { x: frame.width, y: 0 }, { x: frame.width, y: frame.height }, { x: inner.x + inner.w, y: inner.y + inner.h }], group: 'ring', preferred: true });
    regions.push({ points: [{ x: inner.x, y: inner.y + inner.h }, { x: inner.x + inner.w, y: inner.y + inner.h }, { x: frame.width, y: frame.height }, { x: 0, y: frame.height }], group: 'ring', preferred: true });
    regions.push({ points: [{ x: 0, y: 0 }, { x: inner.x, y: inner.y }, { x: inner.x, y: inner.y + inner.h }, { x: 0, y: frame.height }], group: 'ring', preferred: true });
    return { regions, lines: [] };
  }

  function buildShards(frame, options, random) {
    const parts = Math.max(2, Math.min(10, Math.round(num(options.parts, 5))));
    let pieces = [frame.points.slice()];
    let guard = 0;
    while (pieces.length < parts && guard < 32) {
      guard += 1;
      pieces.sort((a, b) => area(b) - area(a));
      const target = pieces.shift();
      const box = bbox(target);
      const cx = box.x0 + box.width * (0.25 + random() * 0.5);
      const cy = box.y0 + box.height * (0.25 + random() * 0.5);
      const line = lineThrough(random() * 180, cx, cy);
      const [positive, negative] = splitPoly(target, line);
      if (positive.length >= 3 && negative.length >= 3) pieces.push(positive, negative);
      else pieces.push(target);
    }
    return { regions: pieces.map((points) => ({ points, group: null })), lines: [] };
  }

  // Paints the biggest regions until the target is reached; the region that
  // would overshoot is cut so the painted share is exact.
  function paintByArea(regions, target) {
    const out = [];
    const sorted = [...regions].sort((a, b) => area(b.points) - area(a.points));
    let painted = 0;
    for (const region of sorted) {
      const regionArea = area(region.points);
      if (painted + regionArea <= target + 0.5) {
        out.push({ ...region, painted: true });
        painted += regionArea;
        continue;
      }
      if (painted < target - 0.5) {
        const need = target - painted;
        const box = bbox(region.points);
        let kept = null;
        let rest = null;
        if (box.width >= box.height) {
          const cutX = box.x0 + need / Math.max(1, box.height);
          const line = lineThrough(0, cutX, 0);
          kept = clipHalf(region.points, line, false);
          rest = clipHalf(region.points, line, true);
        } else {
          const cutY = box.y0 + need / Math.max(1, box.width);
          const line = lineThrough(90, 0, cutY);
          kept = clipHalf(region.points, line, false);
          rest = clipHalf(region.points, line, true);
        }
        if (kept && kept.length >= 3) {
          out.push({ ...region, points: kept, painted: true });
          painted += area(kept);
        }
        if (rest && rest.length >= 3) out.push({ ...region, points: rest, painted: false });
      } else {
        out.push({ ...region, painted: false });
      }
    }
    return out;
  }

  function assignColors(regions, colors, coverage, frame) {
    const list = Array.isArray(colors) && colors.length ? colors.slice() : ['#8d96ab'];
    const target = clamp01(coverage) * frame.width * frame.height;
    let resolved = regions;
    const preferred = regions.filter((region) => region.preferred);
    if (preferred.length) {
      // explicit layouts (the frame ring) decide their own painted planes
      let sum = 0;
      for (const region of preferred) {
        region.painted = true;
        sum += area(region.points);
      }
      for (const region of regions) if (!region.preferred) region.painted = false;
      if (sum > target * 1.08) {
        // coverage far below the ring: paint the inner plane instead
        for (const region of regions) region.painted = !region.preferred;
      }
    } else if (regions.every((region) => region.painted == null)) {
      resolved = paintByArea(regions, target);
    }
    const painted = resolved.filter((region) => region.painted).sort((a, b) => area(b.points) - area(a.points));
    painted.forEach((region, index) => {
      region.color = list[Math.min(list.length - 1, index)];
    });
    for (const region of resolved) {
      if (!region.painted) region.color = list[list.length - 1];
      region.area = area(region.points);
    }
    resolved.forEach((region, index) => {
      region.index = index;
    });
    return resolved;
  }

  function applyMotion(base, ctx) {
    const motion = base.motion || 'none';
    if (motion === 'none' || motion == null) return { ...base };
    const time = num(ctx.time, 0);
    const amp = Math.max(0, num(base.amp, 0.05));
    const speed = Math.max(0.01, num(base.speed, 0.4));
    const out = { ...base };
    if (motion === 'slide') out.offset = num(base.offset, 0) + amp * Math.sin(TAU * speed * time);
    else if (motion === 'rotate') out.angle = num(base.angle, 0) + speed * time * 20;
    else if (motion === 'breathe') out.offset = num(base.offset, 0) + amp * Math.sin(TAU * num(ctx.beatPhase, 0));
    else if (motion === 'drift') {
      out.centerX = num(base.centerX, 0.5) + amp * 0.5 * Math.sin(TAU * speed * 0.37 * time);
      out.centerY = num(base.centerY, 0.5) + amp * 0.5 * Math.sin(TAU * speed * 0.53 * time + 1.7);
    } else if (motion === 'push') {
      out.inset = num(base.inset, 0) + amp * Math.sin(TAU * speed * time);
    }
    return out;
  }

  function buildRaw(layout, frame, options, random) {
    switch (layout) {
      case 'halves':
        return buildBands(frame, { ...options, layout: 'halves', parts: 2, angle: num(options.angle, 0) });
      case 'diagonal':
        return buildBands(frame, { ...options, layout: 'diagonal', parts: 2, angle: num(options.angle, 30) });
      case 'thirds':
        return buildBands(frame, { ...options, layout: 'thirds', parts: 3 });
      case 'bands':
        return buildBands(frame, options);
      case 'quads':
        return buildGrid(frame, options, 2, 2);
      case 'grid':
        return buildGrid(frame, options, Math.max(2, Math.round(num(options.parts, 3))), Math.max(2, Math.round(num(options.parts, 3))));
      case 'chevron':
        return buildChevron(frame, options);
      case 'radial':
        return buildRadial(frame, options);
      case 'mondrian':
        return buildMondrian(frame, options, random);
      case 'frame':
        return buildFrame(frame, options);
      case 'shards':
        return buildShards(frame, options, random);
      default:
        return buildBands(frame, { ...options, layout: 'halves', parts: 2, angle: 0 });
    }
  }

  function geometry(params, ctx) {
    const options = params || {};
    const context = ctx || {};
    const frame = framePoly(context.frame);
    const layout = LAYOUTS.includes(options.layout) ? options.layout : 'halves';
    const seed = Number.isFinite(Number(context.seed)) ? Number(context.seed) : 1;
    const clipKey = context.clipKey == null ? '' : String(context.clipKey);
    const random = rng.rngFor(seed, 'split', layout, clipKey);
    const moved = applyMotion(options, context);
    const built = buildRaw(layout, frame, moved, random);
    let regions = built.regions.map((region) => ({ ...region, painted: null, area: area(region.points) }));
    const coverage = clamp01(options.coverage == null ? 1 : options.coverage);
    // swap: rotate the colour assignment on the rhythm cuts
    let colors = Array.isArray(options.colors) ? options.colors : [];
    if (moved.motion === 'swap' && colors.length > 1) {
      const cuts = Array.isArray(moved.cuts) ? moved.cuts : [];
      let step = 0;
      for (const cut of cuts) if (cut <= num(context.time, 0)) step += 1;
      const shift = step % colors.length;
      colors = colors.slice(shift).concat(colors.slice(0, shift));
    }
    regions = assignColors(regions, colors, coverage, frame);
    return { layout, frame, regions, lines: built.lines || [] };
  }

  function regions(params, ctx) {
    return geometry(params, ctx).regions;
  }

  function lines(params, ctx) {
    return geometry(params, ctx).lines.slice(0, 2);
  }

  function regionAt(list, x, y) {
    const entries = Array.isArray(list) ? list : [];
    for (let i = 0; i < entries.length; i += 1) {
      if (entries[i] && Array.isArray(entries[i].points) && pointInPoly(entries[i].points, x, y)) return i;
    }
    return -1;
  }

  return {
    LAYOUTS,
    regions,
    lines,
    regionAt,
    area,
    bbox,
    centroid,
    clipHalf,
    splitPoly,
    pointInPoly,
    lineThrough,
    framePoly,
    solveBelow,
    belowArea,
  };
});
