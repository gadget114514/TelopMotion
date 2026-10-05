(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng'), require('./scene3d'));
  else {
    root.SA = root.SA || {};
    root.SA.figureGeo = factory(root.SA.rng, root.SA.scene3d);
  }
})(typeof self !== 'undefined' ? self : this, function (rng, scene3d) {
  'use strict';

  // Geometry and data-structure figures: a k-d tree splitting moving points,
  // Voronoi and Delaunay tilings, proximity graphs, L-systems, space-filling
  // curves, circle packing, treemaps, space colonisation and string art. They are
  // computed on the CPU and end up as the plain shapes the shape pass draws.
  // Like the scenes they are pure functions of (seed, randomness level, clip
  // time); anything built by a growth or packing process is built once, cached by
  // key, and revealed by time.

  const TAU = Math.PI * 2;
  const GEOS = ['kdTree', 'voronoi', 'delaunay', 'proximity', 'lsystem', 'spaceFilling', 'circlePack', 'treemap', 'colonization', 'stringArt'];
  const SHAPE_CAP = 440;
  const tools = scene3d.tools;
  // density scaling lives next to tools in scene3d, so both modules share it
  const dens = scene3d.dens;

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function ease(t) {
    const x = clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
  }

  const cache = new Map();
  function cached(key, build) {
    if (cache.has(key)) {
      const hit = cache.get(key);
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const value = build();
    cache.set(key, value);
    while (cache.size > 24) cache.delete(cache.keys().next().value);
    return value;
  }

  function hash01(i, salt) {
    const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453123;
    return x - Math.floor(x);
  }

  // the output list with the shape budget and the common alpha
  function sink(args) {
    const out = [];
    const alpha = (a) => Math.max(0.04, Math.min(1, (a == null ? 1 : a) * (args.opacity == null ? 1 : args.opacity)));
    return {
      out,
      full() {
        return out.length >= SHAPE_CAP;
      },
      rect(x0, y0, x1, y1, ci, a, o) {
        if (out.length >= SHAPE_CAP) return;
        const w = x1 - x0;
        const h = y1 - y0;
        if (w < 1 || h < 1) return;
        const opts = o || {};
        const shape = { kind: 'rect', x: x0, y: y0, w, h, radius: opts.radius || 0, color: opts.outline ? null : args.color(ci), opacity: alpha(a) };
        if (opts.outline || opts.stroke) {
          shape.stroke = Math.max(1, opts.stroke || 2);
          shape.strokeColor = args.color(opts.strokeCi == null ? ci : opts.strokeCi);
        }
        out.push(shape);
      },
      line(x0, y0, x1, y1, width, ci, a) {
        if (out.length >= SHAPE_CAP) return;
        out.push({ kind: 'capsule', x0, y0, x1, y1, width: Math.max(1, width), color: args.color(ci), opacity: alpha(a) });
      },
      dot(x, y, r, ci, a, ring, thick) {
        if (out.length >= SHAPE_CAP || r < 0.5) return;
        if (ring) out.push({ kind: 'ring', x, y, r, thickness: Math.max(1, thick || 2), color: args.color(ci), opacity: alpha(a) });
        else out.push({ kind: 'circle', x, y, r, color: args.color(ci), opacity: alpha(a) });
      },
      poly(points, ci, a, o) {
        if (out.length >= SHAPE_CAP || points.length < 3) return;
        const pts = points.length > 8 ? simplify(points, 8) : points;
        const shape = { kind: 'convex', points: pts.map((p) => ({ x: p.x, y: p.y })), color: args.color(ci), opacity: alpha(a) };
        if (o && o.stroke) {
          shape.stroke = o.stroke;
          shape.strokeColor = args.color(o.strokeCi == null ? ci : o.strokeCi);
        }
        out.push(shape);
      },
    };
  }

  // drop the vertices that change the outline least until `max` remain
  function simplify(points, max) {
    const pts = points.slice();
    while (pts.length > max) {
      let best = 0;
      let bestArea = Infinity;
      for (let i = 0; i < pts.length; i += 1) {
        const a = pts[(i + pts.length - 1) % pts.length];
        const b = pts[i];
        const c = pts[(i + 1) % pts.length];
        const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y));
        if (area < bestArea) {
          bestArea = area;
          best = i;
        }
      }
      pts.splice(best, 1);
    }
    return pts;
  }

  function shrink(points, cx, cy, k) {
    return points.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
  }

  // n points drifting on their own Lissajous paths inside the area
  function movingPoints(T, n, t, area, speed, drift) {
    const pts = [];
    for (let i = 0; i < n; i += 1) {
      const bx = area.x0 + T.draw() * (area.x1 - area.x0);
      const by = area.y0 + T.draw() * (area.y1 - area.y0);
      const w1 = (0.3 + T.draw() * 0.9) * speed;
      const w2 = (0.3 + T.draw() * 0.9) * speed;
      const p1 = T.draw() * TAU;
      const p2 = T.draw() * TAU;
      const ax = drift * (area.x1 - area.x0) * (0.4 + T.draw() * 0.6);
      const ay = drift * (area.y1 - area.y0) * (0.4 + T.draw() * 0.6);
      pts.push({
        x: clamp(bx + ax * Math.sin(w1 * t + p1), area.x0, area.x1),
        y: clamp(by + ay * Math.sin(w2 * t + p2), area.y0, area.y1),
        i,
      });
    }
    return pts;
  }

  function areaOf(frame, margin) {
    const m = margin * frame.short;
    return { x0: m, y0: m, x1: frame.width - m, y1: frame.height - m };
  }

  // ---------------------------------------------------------------------------
  // k-d tree

  function kdBuild(points, rect, depth, opts, leaves, splits, salt) {
    const stop = points.length <= opts.leaf || depth >= opts.maxDepth || rect.x1 - rect.x0 < opts.minSide || rect.y1 - rect.y0 < opts.minSide;
    if (stop) {
      leaves.push({ rect, depth, count: points.length });
      return;
    }
    let axis;
    if (opts.rule === 'alternate') axis = depth % 2;
    else if (opts.rule === 'long') axis = rect.x1 - rect.x0 >= rect.y1 - rect.y0 ? 0 : 1;
    else {
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      axis = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 0 : 1;
    }
    const key = axis === 0 ? 'x' : 'y';
    const lo = axis === 0 ? rect.x0 : rect.y0;
    const hi = axis === 0 ? rect.x1 : rect.y1;
    let cut;
    if (opts.split === 'mid') cut = (lo + hi) / 2;
    else if (opts.split === 'rand') cut = lo + (hi - lo) * (0.3 + 0.4 * hash01(depth * 17 + points.length, salt));
    else {
      const sorted = points.map((p) => p[key]).sort((a, b) => a - b);
      cut = (sorted[Math.floor(sorted.length / 2) - 1] + sorted[Math.floor(sorted.length / 2)]) / 2;
    }
    cut = clamp(cut, lo + (hi - lo) * 0.08, hi - (hi - lo) * 0.08);
    const left = points.filter((p) => p[key] < cut);
    const right = points.filter((p) => p[key] >= cut);
    if (axis === 0) {
      splits.push({ x0: cut, y0: rect.y0, x1: cut, y1: rect.y1, depth });
      kdBuild(left, { x0: rect.x0, y0: rect.y0, x1: cut, y1: rect.y1 }, depth + 1, opts, leaves, splits, salt);
      kdBuild(right, { x0: cut, y0: rect.y0, x1: rect.x1, y1: rect.y1 }, depth + 1, opts, leaves, splits, salt);
    } else {
      splits.push({ x0: rect.x0, y0: cut, x1: rect.x1, y1: cut, depth });
      kdBuild(left, { x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: cut }, depth + 1, opts, leaves, splits, salt);
      kdBuild(right, { x0: rect.x0, y0: cut, x1: rect.x1, y1: rect.y1 }, depth + 1, opts, leaves, splits, salt);
    }
  }

  function kdTree(T, args, sk, t, frame) {
    const n = dens(args, T.int(24, 10, 72), 10, 72);
    const area = areaOf(frame, T.range(0.02, 0.02, 0.1));
    const speed = T.range(0.5, 0.25, 1.1);
    const drift = T.range(0.08, 0.04, 0.2);
    const gap = T.range(0.004, 0, 0.012) * frame.short;
    const rule = T.pick('alternate', ['alternate', 'long', 'spread']);
    const split = T.pick('median', ['median', 'mid', 'rand']);
    const style = T.pick('fill', ['fill', 'outline', 'mixed']);
    const colorBy = T.pick('depth', ['depth', 'index', 'area', 'position']);
    const showPoints = T.chance(true, 0.6);
    const lines = T.chance(false, 0.55);
    const round = T.range(0, 0, 0.35);
    const leaf = T.int(1, 1, 3);
    const maxDepth = T.int(7, 4, 9);
    const points = movingPoints(tools(args.seed, 'kd-points', 1), n, t, area, speed, drift);
    const leaves = [];
    const splits = [];
    kdBuild(points, { x0: area.x0, y0: area.y0, x1: area.x1, y1: area.y1 }, 0, { rule, split, leaf, maxDepth, minSide: frame.short * 0.03 }, leaves, splits, args.seed % 997);
    const areaMax = Math.max(...leaves.map((l) => (l.rect.x1 - l.rect.x0) * (l.rect.y1 - l.rect.y0)), 1);
    leaves.forEach((l, i) => {
      const r = l.rect;
      const rectArea = (r.x1 - r.x0) * (r.y1 - r.y0);
      let ci = l.depth;
      if (colorBy === 'index') ci = i;
      else if (colorBy === 'area') ci = Math.floor((rectArea / areaMax) * 4.99);
      else if (colorBy === 'position') ci = Math.floor(((r.x0 + r.x1) / 2 / frame.width) * 5);
      const minSide = Math.min(r.x1 - r.x0, r.y1 - r.y0);
      const opts = { radius: minSide * round };
      const outline = style === 'outline' || (style === 'mixed' && i % 2 === 0);
      if (outline) {
        opts.outline = true;
        opts.stroke = Math.max(1.5, frame.short * 0.003);
      }
      sk.rect(r.x0 + gap, r.y0 + gap, r.x1 - gap, r.y1 - gap, ci, outline ? 0.9 : 0.78, opts);
    });
    if (lines) for (const s of splits) sk.line(s.x0, s.y0, s.x1, s.y1, frame.short * 0.002, 0, 0.7);
    if (showPoints) for (const p of points) sk.dot(p.x, p.y, frame.short * 0.007, 4, 0.95);
  }

  // ---------------------------------------------------------------------------
  // Voronoi / Delaunay

  function clipHalfPlane(poly, a, b, c) {
    // keep the points with a*x + b*y <= c
    const out = [];
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const dp = a * p.x + b * p.y - c;
      const dq = a * q.x + b * q.y - c;
      if (dp <= 0) out.push(p);
      if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
        const u = dp / (dp - dq);
        out.push({ x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u });
      }
    }
    return out;
  }

  function voronoiCells(points, area) {
    const frameRect = [{ x: area.x0, y: area.y0 }, { x: area.x1, y: area.y0 }, { x: area.x1, y: area.y1 }, { x: area.x0, y: area.y1 }];
    return points.map((p, i) => {
      let poly = frameRect;
      for (let j = 0; j < points.length && poly.length; j += 1) {
        if (j === i) continue;
        const q = points[j];
        // closer to p than to q: (q-p).x <= |q|^2-|p|^2 over 2
        const a = q.x - p.x;
        const b = q.y - p.y;
        const c = (q.x * q.x + q.y * q.y - p.x * p.x - p.y * p.y) / 2;
        poly = clipHalfPlane(poly, a, b, c);
      }
      return poly;
    });
  }

  function centroidOf(poly) {
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const cross = p.x * q.y - q.x * p.y;
      a += cross;
      cx += (p.x + q.x) * cross;
      cy += (p.y + q.y) * cross;
    }
    if (Math.abs(a) < 1e-6) return null;
    return { x: cx / (3 * a), y: cy / (3 * a) };
  }

  function voronoi(T, args, sk, t, frame) {
    const n = dens(args, T.int(18, 8, 40), 8, 40);
    const area = areaOf(frame, T.range(0.02, 0.02, 0.1));
    const speed = T.range(0.5, 0.2, 1);
    const drift = T.range(0.07, 0.04, 0.16);
    const relax = T.int(0, 0, 3);
    const style = T.pick('cells', ['cells', 'edges', 'both']);
    const inset = T.range(0.06, 0.02, 0.22);
    const colorBy = T.pick('index', ['index', 'position', 'area', 'distance']);
    const dots = T.chance(true, 0.65);
    let points = movingPoints(tools(args.seed, 'vor-points', 1), n, t, area, speed, drift);
    let cells = voronoiCells(points, area);
    for (let k = 0; k < relax; k += 1) {
      points = points.map((p, i) => centroidOf(cells[i]) || p);
      cells = voronoiCells(points, area);
    }
    const sizes = cells.map((c) => Math.abs(c.reduce((s, p, i) => s + (p.x * c[(i + 1) % c.length].y - c[(i + 1) % c.length].x * p.y), 0)) / 2);
    const maxSize = Math.max(...sizes, 1);
    cells.forEach((poly, i) => {
      if (poly.length < 3) return;
      const p = points[i];
      let ci = i;
      if (colorBy === 'position') ci = Math.floor((p.x / frame.width) * 5);
      else if (colorBy === 'area') ci = Math.floor((sizes[i] / maxSize) * 4.99);
      else if (colorBy === 'distance') ci = Math.floor((Math.hypot(p.x - frame.cx, p.y - frame.cy) / (frame.short * 0.7)) * 5);
      if (style !== 'edges') sk.poly(shrink(poly, p.x, p.y, 1 - inset), ci, 0.8);
      if (style !== 'cells') {
        for (let e = 0; e < poly.length; e += 1) {
          const a = poly[e];
          const b = poly[(e + 1) % poly.length];
          sk.line(a.x, a.y, b.x, b.y, frame.short * 0.0028, 0, 0.75);
        }
      }
    });
    if (dots) for (const p of points) sk.dot(p.x, p.y, frame.short * 0.0065, 4, 1);
  }

  function delaunayTriangles(points) {
    // Bowyer-Watson with a large super triangle
    const big = 1e5;
    const pts = points.concat([{ x: -big, y: -big }, { x: big, y: -big }, { x: 0, y: big }]);
    const n = points.length;
    let tris = [[n, n + 1, n + 2]];
    const circum = (tri) => {
      const [a, b, c] = tri.map((k) => pts[k]);
      const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
      if (Math.abs(d) < 1e-9) return null;
      const ux = ((a.x * a.x + a.y * a.y) * (b.y - c.y) + (b.x * b.x + b.y * b.y) * (c.y - a.y) + (c.x * c.x + c.y * c.y) * (a.y - b.y)) / d;
      const uy = ((a.x * a.x + a.y * a.y) * (c.x - b.x) + (b.x * b.x + b.y * b.y) * (a.x - c.x) + (c.x * c.x + c.y * c.y) * (b.x - a.x)) / d;
      return { x: ux, y: uy, r2: (a.x - ux) ** 2 + (a.y - uy) ** 2 };
    };
    for (let i = 0; i < n; i += 1) {
      const p = pts[i];
      const bad = [];
      const keep = [];
      for (const tri of tris) {
        const cc = circum(tri);
        if (cc && (p.x - cc.x) ** 2 + (p.y - cc.y) ** 2 < cc.r2) bad.push(tri);
        else keep.push(tri);
      }
      const edges = [];
      for (const tri of bad) {
        for (let e = 0; e < 3; e += 1) {
          const edge = [tri[e], tri[(e + 1) % 3]];
          const dup = edges.findIndex((o) => (o[0] === edge[1] && o[1] === edge[0]) || (o[0] === edge[0] && o[1] === edge[1]));
          if (dup >= 0) edges.splice(dup, 1);
          else edges.push(edge);
        }
      }
      tris = keep.concat(edges.map((e) => [e[0], e[1], i]));
    }
    return tris.filter((tri) => tri.every((k) => k < n));
  }

  function delaunay(T, args, sk, t, frame) {
    const n = dens(args, T.int(18, 8, 42), 8, 42);
    const area = areaOf(frame, T.range(0.0, 0, 0.08));
    const speed = T.range(0.45, 0.2, 0.9);
    const drift = T.range(0.07, 0.04, 0.15);
    const style = T.pick('fill', ['fill', 'wire', 'both']);
    const colorBy = T.pick('position', ['position', 'index', 'size']);
    const gap = T.range(0.04, 0, 0.18);
    const shade = T.chance(false, 0.5);
    // the frame corners keep the mesh closed to the edge
    const pts = movingPoints(tools(args.seed, 'del-points', 1), n, t, area, speed, drift);
    const corners = [{ x: area.x0, y: area.y0 }, { x: area.x1, y: area.y0 }, { x: area.x1, y: area.y1 }, { x: area.x0, y: area.y1 }].map((p, i) => ({ ...p, i: n + i }));
    const all = pts.concat(corners);
    const tris = delaunayTriangles(all);
    tris.forEach((tri, k) => {
      const [a, b, c] = tri.map((i) => all[i]);
      const cx = (a.x + b.x + c.x) / 3;
      const cy = (a.y + b.y + c.y) / 3;
      let ci = k;
      if (colorBy === 'position') ci = Math.floor((cx / frame.width) * 4 + (cy / frame.height) * 2);
      else if (colorBy === 'size') ci = Math.floor((Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / (frame.short * frame.short * 0.02)) * 3);
      const alpha = shade ? 0.45 + 0.5 * hash01(k, args.seed % 91) : 0.8;
      if (style !== 'wire') sk.poly(shrink([a, b, c], cx, cy, 1 - gap), ci, alpha);
      if (style !== 'fill') {
        sk.line(a.x, a.y, b.x, b.y, frame.short * 0.0025, 0, 0.7);
        sk.line(b.x, b.y, c.x, c.y, frame.short * 0.0025, 0, 0.7);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // proximity graphs

  function proximity(T, args, sk, t, frame) {
    const n = dens(args, T.int(26, 12, 56), 12, 56);
    const area = areaOf(frame, T.range(0.04, 0.02, 0.12));
    const speed = T.range(0.4, 0.2, 0.9);
    const drift = T.range(0.08, 0.04, 0.18);
    const mode = T.pick('mst', ['mst', 'gabriel', 'knn', 'radius']);
    const k = T.int(2, 1, 4);
    const radius = T.range(0.2, 0.12, 0.3) * frame.short * 1.6;
    const nodeSize = T.range(0.007, 0.004, 0.014) * frame.short;
    const weighted = T.chance(false, 0.55);
    const rings = T.chance(false, 0.4);
    const pts = movingPoints(tools(args.seed, 'prox-points', 1), n, t, area, speed, drift);
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const edges = [];
    if (mode === 'mst') {
      const inTree = new Array(n).fill(false);
      const best = new Array(n).fill(Infinity);
      const from = new Array(n).fill(-1);
      best[0] = 0;
      for (let step = 0; step < n; step += 1) {
        let u = -1;
        for (let i = 0; i < n; i += 1) if (!inTree[i] && (u < 0 || best[i] < best[u])) u = i;
        inTree[u] = true;
        if (from[u] >= 0) edges.push([from[u], u]);
        for (let v = 0; v < n; v += 1) {
          const d = dist(pts[u], pts[v]);
          if (!inTree[v] && d < best[v]) {
            best[v] = d;
            from[v] = u;
          }
        }
      }
    } else if (mode === 'gabriel') {
      for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) {
        const mx = (pts[i].x + pts[j].x) / 2;
        const my = (pts[i].y + pts[j].y) / 2;
        const r = dist(pts[i], pts[j]) / 2;
        let ok = true;
        for (let m = 0; m < n && ok; m += 1) if (m !== i && m !== j && Math.hypot(pts[m].x - mx, pts[m].y - my) < r) ok = false;
        if (ok) edges.push([i, j]);
      }
    } else if (mode === 'knn') {
      const seen = new Set();
      for (let i = 0; i < n; i += 1) {
        const order = pts.map((p, j) => ({ j, d: dist(pts[i], p) })).filter((o) => o.j !== i).sort((a, b) => a.d - b.d).slice(0, k);
        for (const o of order) {
          const key = i < o.j ? `${i}-${o.j}` : `${o.j}-${i}`;
          if (!seen.has(key)) {
            seen.add(key);
            edges.push([i, o.j]);
          }
        }
      }
    } else {
      for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) if (dist(pts[i], pts[j]) < radius) edges.push([i, j]);
    }
    const degree = new Array(n).fill(0);
    for (const [i, j] of edges.slice(0, 380)) {
      const d = dist(pts[i], pts[j]);
      degree[i] += 1;
      degree[j] += 1;
      const w = weighted ? frame.short * 0.006 * (1 - clamp(d / (frame.short * 0.6), 0, 0.85)) : frame.short * 0.0028;
      sk.line(pts[i].x, pts[i].y, pts[j].x, pts[j].y, w, weighted ? Math.floor(d / (frame.short * 0.15)) : 0, 0.7);
    }
    pts.forEach((p, i) => {
      sk.dot(p.x, p.y, nodeSize * (1 + 0.35 * Math.min(4, degree[i])), 1 + (i % 4), 1);
      if (rings) sk.dot(p.x, p.y, nodeSize * 2.2, 1 + (i % 4), 0.5, true, 1.5);
    });
  }

  // ---------------------------------------------------------------------------
  // L-systems

  const LSYSTEMS = {
    plant: { axiom: 'X', rules: { X: 'F-[[X]+X]+F[+FX]-X', F: 'FF' }, angle: 22.5, maxIter: 4, start: 90 },
    dragon: { axiom: 'FX', rules: { X: 'X+YF+', Y: '-FX-Y' }, angle: 90, maxIter: 9, start: 0 },
    koch: { axiom: 'F--F--F', rules: { F: 'F+F--F+F' }, angle: 60, maxIter: 3, start: 0 },
    sierpinski: { axiom: 'F', rules: { F: 'G-F-G', G: 'F+G+F' }, angle: 60, maxIter: 5, start: 0 },
    hilbert: { axiom: 'A', rules: { A: '-BF+AFA+FB-', B: '+AF-BFB-FA+' }, angle: 90, maxIter: 4, start: 0 },
    gosper: { axiom: 'A', rules: { A: 'A-B--B+A++AA+B-', B: '+A-BB--B-A++A+B' }, angle: 60, maxIter: 3, start: 0 },
    tree: { axiom: 'F', rules: { F: 'FF+[+F-F-F]-[-F+F+F]' }, angle: 22.5, maxIter: 3, start: 90 },
    weed: { axiom: 'X', rules: { X: 'F[+X]F[-X]+X', F: 'FF' }, angle: 20, maxIter: 5, start: 90 },
  };

  function lsystemSegments(name, iter) {
    return cached(`ls|${name}|${iter}`, () => {
      const sys = LSYSTEMS[name];
      let s = sys.axiom;
      for (let i = 0; i < iter; i += 1) {
        let next = '';
        for (const ch of s) next += sys.rules[ch] || ch;
        s = next;
        if (s.length > 60000) break;
      }
      const segs = [];
      let x = 0;
      let y = 0;
      let a = (sys.start * Math.PI) / 180;
      const stack = [];
      let depth = 0;
      const turn = (sys.angle * Math.PI) / 180;
      for (const ch of s) {
        if (ch === 'F' || ch === 'G') {
          const nx = x + Math.cos(a);
          const ny = y - Math.sin(a);
          segs.push({ x0: x, y0: y, x1: nx, y1: ny, depth });
          x = nx;
          y = ny;
        } else if (ch === '+') a += turn;
        else if (ch === '-') a -= turn;
        else if (ch === '[') {
          stack.push([x, y, a, depth]);
          depth += 1;
        } else if (ch === ']') {
          const top = stack.pop();
          if (top) [x, y, a, depth] = top;
        }
      }
      // normalise into a unit box centred on the origin
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const g of segs) {
        x0 = Math.min(x0, g.x0, g.x1);
        x1 = Math.max(x1, g.x0, g.x1);
        y0 = Math.min(y0, g.y0, g.y1);
        y1 = Math.max(y1, g.y0, g.y1);
      }
      const k = 1 / Math.max(x1 - x0, y1 - y0, 1e-6);
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const maxDepth = Math.max(1, ...segs.map((g) => g.depth));
      return segs.map((g) => ({ x0: (g.x0 - cx) * k, y0: (g.y0 - cy) * k, x1: (g.x1 - cx) * k, y1: (g.y1 - cy) * k, depth: g.depth, maxDepth }));
    });
  }

  function lsystem(T, args, sk, t, frame) {
    const name = T.pick('plant', Object.keys(LSYSTEMS));
    const sys = LSYSTEMS[name];
    const iterDrawn = T.int(sys.maxIter, Math.max(2, sys.maxIter - 2), sys.maxIter);
    // thin air draws one iteration less (density 0.5 keeps the drawn one)
    const iterWanted = args.density != null && args.density < 0.3 ? iterDrawn - 1 : iterDrawn;
    const speed = T.range(0.12, 0.06, 0.25);
    const size = T.range(0.78, 0.55, 0.95) * frame.short;
    const spin = T.range(0, -0.12, 0.12);
    const colorBy = T.pick('index', ['index', 'depth']);
    const widthBase = T.range(0.004, 0.002, 0.009) * frame.short;
    const taper = T.chance(true, 0.6);
    const loops = T.chance(true, 0.7);
    const ox = T.range(0, -0.2, 0.2) * frame.width;
    let iter = iterWanted;
    let segs = lsystemSegments(name, iter);
    while (segs.length > 380 && iter > 1) {
      iter -= 1;
      segs = lsystemSegments(name, iter);
    }
    const cycle = loops ? (t * speed) % 1.6 : Math.min(1.6, t * speed);
    const reveal = ease(Math.min(1, cycle / 1.0));
    const fade = loops && cycle > 1.25 ? 1 - ease((cycle - 1.25) / 0.35) : 1;
    const count = Math.max(1, Math.floor(segs.length * reveal));
    const ca = Math.cos(spin * t);
    const sa = Math.sin(spin * t);
    const mapPoint = (x, y) => ({ x: frame.cx + ox + (x * ca - y * sa) * size, y: frame.cy + (x * sa + y * ca) * size });
    for (let i = 0; i < count; i += 1) {
      const g = segs[i];
      const a = mapPoint(g.x0, g.y0);
      const b = mapPoint(g.x1, g.y1);
      const w = widthBase * (taper ? 0.45 + 0.9 * (1 - g.depth / (g.maxDepth + 1)) : 1);
      sk.line(a.x, a.y, b.x, b.y, w, colorBy === 'depth' ? g.depth : Math.floor((i / segs.length) * 5), 0.9 * fade);
    }
  }

  // ---------------------------------------------------------------------------
  // space-filling curves

  function hilbertPoint(order, d) {
    let x = 0;
    let y = 0;
    let s = 1;
    let t = d;
    for (let i = 0; i < order; i += 1) {
      const rx = 1 & (t / 2);
      const ry = 1 & (t ^ rx);
      if (ry === 0) {
        if (rx === 1) {
          x = s - 1 - x;
          y = s - 1 - y;
        }
        const tmp = x;
        x = y;
        y = tmp;
      }
      x += s * rx;
      y += s * ry;
      t = Math.floor(t / 4);
      s *= 2;
    }
    return [x, y];
  }

  function curvePoints(kind, order) {
    return cached(`curve|${kind}|${order}`, () => {
      const pts = [];
      let side;
      if (kind === 'hilbert') {
        side = 1 << order;
        for (let d = 0; d < side * side; d += 1) pts.push(hilbertPoint(order, d));
      } else if (kind === 'zorder') {
        side = 1 << order;
        for (let d = 0; d < side * side; d += 1) {
          let x = 0;
          let y = 0;
          for (let b = 0; b < order; b += 1) {
            x |= ((d >> (2 * b)) & 1) << b;
            y |= ((d >> (2 * b + 1)) & 1) << b;
          }
          pts.push([x, y]);
        }
      } else if (kind === 'snake') {
        side = 1 << order;
        for (let y = 0; y < side; y += 1) for (let x = 0; x < side; x += 1) pts.push([y % 2 ? side - 1 - x : x, y]);
      } else {
        // square spiral
        side = 1 << order;
        let x = Math.floor(side / 2);
        let y = Math.floor(side / 2);
        let dx = 1;
        let dy = 0;
        let run = 1;
        let ran = 0;
        let turns = 0;
        for (let i = 0; i < side * side; i += 1) {
          pts.push([x, y]);
          x += dx;
          y += dy;
          ran += 1;
          if (ran === run) {
            ran = 0;
            [dx, dy] = [-dy, dx];
            turns += 1;
            if (turns % 2 === 0) run += 1;
          }
        }
      }
      return { pts, side };
    });
  }

  function spaceFilling(T, args, sk, t, frame) {
    const kind = T.pick('hilbert', ['hilbert', 'zorder', 'snake', 'spiral']);
    const orderDrawn = T.int(3, 2, 4);
    // thin air steps one order down, dense air one up (density 0.5 keeps it)
    let order = orderDrawn;
    if (args.density != null) {
      if (args.density < 0.3) order -= 1;
      else if (args.density > 0.85) order = Math.min(5, order + 1);
    }
    const worm = T.range(0.35, 0.08, 1);
    const speed = T.range(0.5, 0.2, 1.2);
    const size = T.range(0.78, 0.55, 0.95) * frame.short;
    const width = T.range(0.006, 0.003, 0.014) * frame.short;
    const ghost = T.chance(true, 0.6);
    const dots = T.chance(false, 0.4);
    const { pts, side } = curvePoints(kind, order);
    const total = pts.length;
    const map = (p) => ({ x: frame.cx + ((p[0] + 0.5) / side - 0.5) * size, y: frame.cy + ((p[1] + 0.5) / side - 0.5) * size });
    const head = (((t * speed * 0.18) % 1) + 1) % 1 * total;
    const len = Math.max(4, worm * total);
    for (let i = 1; i < total; i += 1) {
      const behind = (((head - i) % total) + total) % total;
      const inWorm = behind < len;
      if (!inWorm && !ghost) continue;
      const a = map(pts[i - 1]);
      const b = map(pts[i]);
      const strength = inWorm ? 1 - behind / len : 0.12;
      sk.line(a.x, a.y, b.x, b.y, width * (inWorm ? 0.6 + 0.8 * strength : 0.5), Math.floor((i / total) * 5), inWorm ? 0.3 + 0.7 * strength : 0.2);
    }
    if (dots) {
      const h = map(pts[Math.floor(head) % total]);
      sk.dot(h.x, h.y, width * 1.8, 2, 1);
    }
  }

  // ---------------------------------------------------------------------------
  // circle packing

  function packCircles(seed, count, minR, maxR, frame, margin) {
    return cached(`pack|${seed}|${count}|${Math.round(minR)}|${Math.round(maxR)}|${frame.width}x${frame.height}`, () => {
      const random = rng.rngFor(seed, 'pack');
      const circles = [];
      const gap = frame.short * 0.004;
      for (let i = 0; i < count; i += 1) {
        const u = i / Math.max(1, count - 1);
        const r = maxR * Math.pow(minR / maxR, Math.pow(u, 0.7));
        let placed = false;
        for (let attempt = 0; attempt < 60 && !placed; attempt += 1) {
          const x = margin + r + random() * (frame.width - 2 * (margin + r));
          const y = margin + r + random() * (frame.height - 2 * (margin + r));
          if (circles.every((c) => Math.hypot(c.x - x, c.y - y) > c.r + r + gap)) {
            circles.push({ x, y, r });
            placed = true;
          }
        }
      }
      return circles;
    });
  }

  function circlePack(T, args, sk, t, frame) {
    const count = dens(args, T.int(60, 24, 150), 24, 150);
    const maxR = T.range(0.12, 0.07, 0.2) * frame.short;
    const minR = T.range(0.014, 0.008, 0.03) * frame.short;
    const margin = T.range(0.03, 0, 0.1) * frame.short;
    const style = T.pick('fill', ['fill', 'ring', 'mixed']);
    const breathe = T.range(0.08, 0.02, 0.2);
    const speed = T.range(0.8, 0.4, 1.6);
    const colorBy = T.pick('size', ['size', 'index', 'position']);
    const circles = packCircles(args.seed, count, minR, maxR, frame, margin);
    circles.forEach((c, i) => {
      const r = c.r * (1 - breathe + breathe * Math.sin(speed * t + i * 0.7));
      let ci = Math.floor((1 - (c.r - minR) / Math.max(1, maxR - minR)) * 4.99);
      if (colorBy === 'index') ci = i;
      else if (colorBy === 'position') ci = Math.floor((c.x / frame.width) * 5);
      const ring = style === 'ring' || (style === 'mixed' && i % 3 === 0);
      sk.dot(c.x, c.y, Math.max(1, r), ci, 0.85, ring, Math.max(1.5, c.r * 0.12));
    });
  }

  // ---------------------------------------------------------------------------
  // treemap

  function squarify(values, rect) {
    // values sorted descending, scaled to the rect's area
    const total = values.reduce((s, v) => s + v.v, 0);
    const scale = ((rect.x1 - rect.x0) * (rect.y1 - rect.y0)) / total;
    const items = values.map((v) => ({ ...v, a: v.v * scale }));
    const out = [];
    let r = { ...rect };
    let row = [];
    const worst = (rowItems, side) => {
      const sum = rowItems.reduce((s, it) => s + it.a, 0);
      const max = Math.max(...rowItems.map((it) => it.a));
      const min = Math.min(...rowItems.map((it) => it.a));
      return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
    };
    const layoutRow = (rowItems) => {
      const sum = rowItems.reduce((s, it) => s + it.a, 0);
      const w = r.x1 - r.x0;
      const h = r.y1 - r.y0;
      if (w >= h) {
        const colW = sum / h;
        let y = r.y0;
        for (const it of rowItems) {
          const ih = it.a / colW;
          out.push({ ...it, x0: r.x0, y0: y, x1: r.x0 + colW, y1: y + ih });
          y += ih;
        }
        r = { x0: r.x0 + colW, y0: r.y0, x1: r.x1, y1: r.y1 };
      } else {
        const rowH = sum / w;
        let x = r.x0;
        for (const it of rowItems) {
          const iw = it.a / rowH;
          out.push({ ...it, x0: x, y0: r.y0, x1: x + iw, y1: r.y0 + rowH });
          x += iw;
        }
        r = { x0: r.x0, y0: r.y0 + rowH, x1: r.x1, y1: r.y1 };
      }
    };
    for (const it of items) {
      const side = Math.min(r.x1 - r.x0, r.y1 - r.y0);
      if (!row.length || worst([...row, it], side) <= worst(row, side)) row.push(it);
      else {
        layoutRow(row);
        row = [it];
      }
    }
    if (row.length) layoutRow(row);
    return out;
  }

  function treemap(T, args, sk, t, frame) {
    const n = dens(args, T.int(18, 8, 44), 8, 44);
    const margin = T.range(0.03, 0, 0.1) * frame.short;
    const gap = T.range(0.006, 0, 0.02) * frame.short;
    const speed = T.range(0.5, 0.2, 1.2);
    const swing = T.range(0.3, 0.1, 0.7);
    const style = T.pick('fill', ['fill', 'outline', 'mixed']);
    const round = T.range(0, 0, 0.3);
    const colorBy = T.pick('index', ['index', 'size', 'position']);
    const random = rng.rngFor(args.seed, 'treemap');
    const base = [];
    for (let i = 0; i < n; i += 1) base.push({ i, v: 0.3 + Math.pow(random(), 2.2) * 3, ph: random() * TAU });
    const values = base.map((b) => ({ i: b.i, v: Math.max(0.05, b.v * (1 + swing * Math.sin(speed * t + b.ph))) })).sort((a, b) => b.v - a.v);
    const cells = squarify(values, { x0: margin, y0: margin, x1: frame.width - margin, y1: frame.height - margin });
    cells.forEach((c, k) => {
      let ci = c.i;
      if (colorBy === 'size') ci = Math.floor((k / cells.length) * 5);
      else if (colorBy === 'position') ci = Math.floor((((c.x0 + c.x1) / 2) / frame.width) * 5);
      const outline = style === 'outline' || (style === 'mixed' && k % 2);
      const side = Math.min(c.x1 - c.x0, c.y1 - c.y0);
      sk.rect(c.x0 + gap, c.y0 + gap, c.x1 - gap, c.y1 - gap, ci, outline ? 0.9 : 0.8, { radius: side * round, outline, stroke: Math.max(1.5, frame.short * 0.003) });
    });
  }

  // ---------------------------------------------------------------------------
  // space colonisation (veins / roots)

  function colonize(seed, shape, frame) {
    return cached(`colony|${seed}|${shape}|${frame.width}x${frame.height}`, () => {
      const random = rng.rngFor(seed, 'colony');
      const nodes = [{ x: frame.cx, y: frame.cy + frame.short * 0.4, parent: -1, born: 0 }];
      if (shape === 'radial') nodes[0] = { x: frame.cx, y: frame.cy, parent: -1, born: 0 };
      const attractors = [];
      const reach = frame.short * 0.42;
      for (let i = 0; i < 260; i += 1) {
        let x;
        let y;
        if (shape === 'radial') {
          const a = random() * TAU;
          const r = Math.sqrt(random()) * reach;
          x = frame.cx + Math.cos(a) * r * 1.5;
          y = frame.cy + Math.sin(a) * r;
        } else if (shape === 'canopy') {
          const a = random() * Math.PI;
          const r = Math.sqrt(random()) * reach * 1.1;
          x = frame.cx - Math.cos(a) * r * 1.5;
          y = frame.cy + frame.short * 0.1 - Math.sin(a) * r * 1.2;
        } else {
          x = frame.cx + (random() * 2 - 1) * reach * 1.6;
          y = frame.cy + (random() * 2 - 1) * reach;
        }
        attractors.push({ x, y, live: true });
      }
      const step = frame.short * 0.018;
      const influence = frame.short * 0.7;
      const kill = frame.short * 0.03;
      for (let it = 1; it <= 420 && nodes.length < 340; it += 1) {
        const pull = new Map();
        for (const a of attractors) {
          if (!a.live) continue;
          let best = -1;
          let bestD = influence;
          for (let k = 0; k < nodes.length; k += 1) {
            const d = Math.hypot(nodes[k].x - a.x, nodes[k].y - a.y);
            if (d < bestD) {
              bestD = d;
              best = k;
            }
          }
          if (best >= 0) {
            const e = pull.get(best) || { x: 0, y: 0, n: 0 };
            e.x += (a.x - nodes[best].x) / bestD;
            e.y += (a.y - nodes[best].y) / bestD;
            e.n += 1;
            pull.set(best, e);
          }
        }
        if (!pull.size) break;
        for (const [k, e] of pull) {
          const len = Math.hypot(e.x, e.y) || 1;
          nodes.push({ x: nodes[k].x + (e.x / len) * step, y: nodes[k].y + (e.y / len) * step, parent: k, born: it });
        }
        for (const a of attractors) if (a.live && nodes.some((nd) => Math.hypot(nd.x - a.x, nd.y - a.y) < kill)) a.live = false;
      }
      // branch weight from the number of descendants
      const weight = new Array(nodes.length).fill(1);
      for (let k = nodes.length - 1; k > 0; k -= 1) if (nodes[k].parent >= 0) weight[nodes[k].parent] += weight[k];
      const maxBorn = Math.max(1, ...nodes.map((nd) => nd.born));
      return { nodes, weight, maxBorn };
    });
  }

  function colonization(T, args, sk, t, frame) {
    const shape = T.pick('canopy', ['canopy', 'radial', 'field']);
    const speed = T.range(0.1, 0.05, 0.22);
    const width = T.range(0.0035, 0.002, 0.008) * frame.short;
    const loops = T.chance(true, 0.7);
    const colorBy = T.pick('born', ['born', 'weight']);
    const tip = T.chance(true, 0.6);
    const colony = colonize(args.seed, shape, frame);
    const cycle = loops ? (t * speed) % 1.5 : Math.min(1.5, t * speed);
    const reveal = ease(Math.min(1, cycle));
    const fade = loops && cycle > 1.2 ? 1 - ease((cycle - 1.2) / 0.3) : 1;
    const limit = reveal * colony.maxBorn;
    const maxWeight = Math.max(...colony.weight, 1);
    let drawn = 0;
    colony.nodes.forEach((nd, k) => {
      if (nd.parent < 0 || nd.born > limit) return;
      const p = colony.nodes[nd.parent];
      const w = width * (0.35 + 1.6 * Math.sqrt(colony.weight[nd.parent] / maxWeight));
      const ci = colorBy === 'weight' ? Math.floor((1 - colony.weight[k] / maxWeight) * 4.99) : Math.floor((nd.born / colony.maxBorn) * 5);
      sk.line(p.x, p.y, nd.x, nd.y, w, ci, 0.9 * fade);
      drawn += 1;
      if (tip && nd.born > limit - 6 && reveal < 1) sk.dot(nd.x, nd.y, width * 1.4, 2, 0.9 * fade);
    });
    void drawn;
  }

  // ---------------------------------------------------------------------------
  // string art

  function stringArt(T, args, sk, t, frame) {
    const n = dens(args, T.int(90, 40, 150), 40, 150);
    const shape = T.pick('circle', ['circle', 'ellipse', 'rounded', 'star']);
    const base = T.range(2, 2, 6);
    const swing = T.range(0.6, 0.2, 1.4);
    const speed = T.range(0.12, 0.05, 0.3);
    const size = T.range(0.4, 0.28, 0.46) * frame.short;
    const width = T.range(0.0018, 0.001, 0.004) * frame.short;
    const dots = T.chance(false, 0.4);
    const spin = T.range(0, -0.15, 0.15);
    const aspect = shape === 'ellipse' ? T.range(1.5, 1.2, 2) : 1;
    const point = (i) => {
      const a = (i / n) * TAU + spin * t;
      let rx = size * aspect;
      let ry = size;
      if (shape === 'star') {
        const k = 1 + 0.35 * Math.cos(5 * a);
        rx *= k;
        ry *= k;
      } else if (shape === 'rounded') {
        const c = Math.cos(a);
        const s = Math.sin(a);
        const p = 4;
        const k = 1 / Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), 1 / p);
        rx *= k;
        ry *= k;
      }
      return { x: frame.cx + Math.cos(a) * rx, y: frame.cy + Math.sin(a) * ry };
    };
    const m = base + swing * Math.sin(t * speed * TAU);
    for (let i = 0; i < n; i += 1) {
      const j = (((i * m) % n) + n) % n;
      const a = point(i);
      const b = point(j);
      sk.line(a.x, a.y, b.x, b.y, width, Math.floor((i / n) * 5), 0.55);
      if (dots) sk.dot(a.x, a.y, width * 1.6, 3, 0.9);
    }
  }

  const RENDER = { kdTree, voronoi, delaunay, proximity, lsystem, spaceFilling, circlePack, treemap, colonization, stringArt };

  // Render one geometry figure.
  //   args: { seed, rand, t, frame {width,height,cx,cy,short}, opacity, color(i) }
  function render(name, args) {
    const fn = RENDER[name];
    if (!fn) return [];
    const T = tools(args.seed, name, args.rand);
    const sk = sink(args);
    fn(T, args, sk, args.t, args.frame);
    return sk.out.slice(0, SHAPE_CAP);
  }

  return { GEOS, LSYSTEMS, SHAPE_CAP, render, voronoiCells, delaunayTriangles, squarify, kdBuild, lsystemSegments, packCircles, colonize, curvePoints, clearCache: () => cache.clear() };
});
