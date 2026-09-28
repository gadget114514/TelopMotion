(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.geometry = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_TOLERANCE = 0.35;
  const MAX_DEPTH = 12;
  const EPSILON = 1e-9;

  // --- earcut ------------------------------------------------------------------

  let earcutImpl = null;

  function earcut() {
    if (earcutImpl) return earcutImpl;
    let mod = null;
    if (typeof require === 'function') {
      try {
        mod = require('earcut');
      } catch {
        mod = null;
      }
    }
    if (!mod && typeof self !== 'undefined') mod = self.earcut;
    earcutImpl = mod && typeof mod.default === 'function' ? mod.default : mod;
    if (typeof earcutImpl !== 'function') {
      throw Object.assign(new Error('earcut is not available'), { code: 'missing-earcut' });
    }
    return earcutImpl;
  }

  // --- small vector helpers ----------------------------------------------------

  function pointLineDistance(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq < EPSILON) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function shoelaceArea(points) {
    let area = 0;
    const count = points.length / 2;
    for (let i = 0; i < count; i += 1) {
      const j = (i + 1) % count;
      area += points[i * 2] * points[j * 2 + 1] - points[j * 2] * points[i * 2 + 1];
    }
    return area / 2;
  }

  function polylineLength(points, closed) {
    let length = 0;
    const count = points.length / 2;
    const last = closed ? count : count - 1;
    for (let i = 0; i < last; i += 1) {
      const j = (i + 1) % count;
      length += Math.hypot(points[j * 2] - points[i * 2], points[j * 2 + 1] - points[i * 2 + 1]);
    }
    return length;
  }

  function pointInPolygon(x, y, points) {
    let inside = false;
    const count = points.length / 2;
    for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
      const xi = points[i * 2];
      const yi = points[i * 2 + 1];
      const xj = points[j * 2];
      const yj = points[j * 2 + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // --- contour flattening ------------------------------------------------------

  function flattenQuad(x0, y0, x1, y1, x2, y2, tolerance, depth, out) {
    if (depth >= MAX_DEPTH || pointLineDistance(x1, y1, x0, y0, x2, y2) <= tolerance) {
      out.push(x2, y2);
      return;
    }
    const x01 = (x0 + x1) / 2;
    const y01 = (y0 + y1) / 2;
    const x12 = (x1 + x2) / 2;
    const y12 = (y1 + y2) / 2;
    const xm = (x01 + x12) / 2;
    const ym = (y01 + y12) / 2;
    flattenQuad(x0, y0, x01, y01, xm, ym, tolerance, depth + 1, out);
    flattenQuad(xm, ym, x12, y12, x2, y2, tolerance, depth + 1, out);
  }

  function flattenCubic(x0, y0, x1, y1, x2, y2, x3, y3, tolerance, depth, out) {
    if (depth >= MAX_DEPTH) {
      out.push(x3, y3);
      return;
    }
    const flatness = Math.max(
      pointLineDistance(x1, y1, x0, y0, x3, y3),
      pointLineDistance(x2, y2, x0, y0, x3, y3)
    );
    if (flatness <= tolerance) {
      out.push(x3, y3);
      return;
    }
    const x01 = (x0 + x1) / 2;
    const y01 = (y0 + y1) / 2;
    const x12 = (x1 + x2) / 2;
    const y12 = (y1 + y2) / 2;
    const x23 = (x2 + x3) / 2;
    const y23 = (y2 + y3) / 2;
    const x012 = (x01 + x12) / 2;
    const y012 = (y01 + y12) / 2;
    const x123 = (x12 + x23) / 2;
    const y123 = (y12 + y23) / 2;
    const xm = (x012 + x123) / 2;
    const ym = (y012 + y123) / 2;
    flattenCubic(x0, y0, x01, y01, x012, y012, xm, ym, tolerance, depth + 1, out);
    flattenCubic(xm, ym, x123, y123, x23, y23, x3, y3, tolerance, depth + 1, out);
  }

  function makeContour(values) {
    const points = [];
    for (let i = 0; i < values.length; i += 2) {
      const x = values[i];
      const y = values[i + 1];
      const count = points.length;
      if (count >= 2 && Math.abs(points[count - 2] - x) < EPSILON && Math.abs(points[count - 1] - y) < EPSILON) continue;
      points.push(x, y);
    }
    while (points.length >= 4) {
      const count = points.length;
      if (Math.abs(points[0] - points[count - 2]) < EPSILON && Math.abs(points[1] - points[count - 1]) < EPSILON) {
        points.length -= 2;
      } else {
        break;
      }
    }
    const array = Float32Array.from(points);
    return {
      points: array,
      closed: true,
      area: Math.abs(shoelaceArea(array)),
      length: polylineLength(array, true),
    };
  }

  function glyphContours(path, tolerance) {
    const commands = (path && path.commands) || [];
    const tol = tolerance == null ? DEFAULT_TOLERANCE : Math.max(1e-4, tolerance);
    const contours = [];
    let current = null;

    function finish() {
      if (current && current.length >= 6) contours.push(makeContour(current));
      current = null;
    }

    for (const command of commands) {
      switch (command.type) {
        case 'M':
          finish();
          current = [command.x, command.y];
          break;
        case 'L':
          if (current) current.push(command.x, command.y);
          break;
        case 'Q':
          if (current) {
            const from = current.length >= 2 ? [current[current.length - 2], current[current.length - 1]] : [command.x1, command.y1];
            flattenQuad(from[0], from[1], command.x1, command.y1, command.x, command.y, tol, 0, current);
          }
          break;
        case 'C':
          if (current) {
            const from = current.length >= 2 ? [current[current.length - 2], current[current.length - 1]] : [command.x1, command.y1];
            flattenCubic(from[0], from[1], command.x1, command.y1, command.x2, command.y2, command.x, command.y, tol, 0, current);
          }
          break;
        case 'Z':
        case 'z':
          finish();
          break;
        default:
          break;
      }
    }
    finish();
    return contours;
  }

  // --- outer / hole grouping ---------------------------------------------------

  function groupContours(contours) {
    const list = (contours || []).filter((contour) => contour && contour.points && contour.points.length >= 6);
    const groups = [];
    const depths = list.map((contour, index) => {
      const x = contour.points[0];
      const y = contour.points[1];
      let depth = 0;
      for (let other = 0; other < list.length; other += 1) {
        if (other !== index && pointInPolygon(x, y, list[other].points)) depth += 1;
      }
      return depth;
    });
    for (let i = 0; i < list.length; i += 1) {
      if (depths[i] % 2 === 0) groups.push({ outer: list[i], holes: [] });
    }
    for (let i = 0; i < list.length; i += 1) {
      if (depths[i] % 2 === 0) continue;
      const x = list[i].points[0];
      const y = list[i].points[1];
      let target = null;
      for (const group of groups) {
        if (!pointInPolygon(x, y, group.outer.points)) continue;
        if (!target || group.outer.area < target.outer.area) target = group;
      }
      if (target) target.holes.push(list[i]);
      else groups.push({ outer: list[i], holes: [] });
    }
    return groups;
  }

  // --- triangulation -----------------------------------------------------------

  function triangulate(groups) {
    const positions = [];
    const indices = [];
    let needsStencil = false;
    const ear = earcut();
    for (const group of groups || []) {
      if (!group || !group.outer || group.outer.points.length < 6) continue;
      const coords = [];
      const holes = [];
      for (let i = 0; i < group.outer.points.length; i += 1) coords.push(group.outer.points[i]);
      for (const hole of group.holes || []) {
        if (hole.points.length < 6) continue;
        holes.push(coords.length / 2);
        for (let i = 0; i < hole.points.length; i += 1) coords.push(hole.points[i]);
      }
      let local = null;
      try {
        local = ear(coords, holes, 2);
      } catch {
        local = null;
      }
      if (!local || !local.length) {
        if (group.outer.area > 1e-6) needsStencil = true;
        continue;
      }
      const base = positions.length / 2;
      for (let i = 0; i < coords.length; i += 1) positions.push(coords[i]);
      for (let i = 0; i < local.length; i += 1) indices.push(base + local[i]);
    }
    return {
      positions: Float32Array.from(positions),
      indices: Uint32Array.from(indices),
      needsStencil,
    };
  }

  function triangleAreaSum(tris) {
    const positions = tris.positions;
    const indices = tris.indices;
    let area = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 2;
      const b = indices[i + 1] * 2;
      const c = indices[i + 2] * 2;
      area +=
        Math.abs(
          (positions[b] - positions[a]) * (positions[c + 1] - positions[a + 1]) -
            (positions[c] - positions[a]) * (positions[b + 1] - positions[a + 1])
        ) / 2;
    }
    return area;
  }

  // --- stroke ribbon -----------------------------------------------------------

  function strokeRibbon(contours, width) {
    const half = Math.max(0.01, (width || 1) / 2);
    const list = (contours || []).filter((contour) => contour && contour.points.length >= 6);
    const total = list.reduce((sum, contour) => sum + (contour.length || polylineLength(contour.points, true)), 0) || 1;
    const positions = [];
    const indices = [];
    const miterLimit = 4;
    let running = 0;

    function distanceAlong(points, target) {
      let length = 0;
      const count = points.length / 2;
      for (let i = 0; i < target; i += 1) {
        const j = (i + 1) % count;
        length += Math.hypot(points[j * 2] - points[i * 2], points[j * 2 + 1] - points[i * 2 + 1]);
      }
      return length;
    }

    for (const contour of list) {
      const points = contour.points;
      const count = points.length / 2;
      const offsetX = new Float32Array(count);
      const offsetY = new Float32Array(count);
      for (let i = 0; i < count; i += 1) {
        const prev = (i - 1 + count) % count;
        const next = (i + 1) % count;
        const inX = points[i * 2] - points[prev * 2];
        const inY = points[i * 2 + 1] - points[prev * 2 + 1];
        const outX = points[next * 2] - points[i * 2];
        const outY = points[next * 2 + 1] - points[i * 2 + 1];
        const inLength = Math.hypot(inX, inY) || 1;
        const outLength = Math.hypot(outX, outY) || 1;
        const n1x = inY / inLength;
        const n1y = -inX / inLength;
        const n2x = outY / outLength;
        const n2y = -outX / outLength;
        let nx = n1x + n2x;
        let ny = n1y + n2y;
        const normalLength = Math.hypot(nx, ny);
        if (normalLength < EPSILON) {
          nx = n1x;
          ny = n1y;
        } else {
          nx /= normalLength;
          ny /= normalLength;
        }
        const dot = nx * n1x + ny * n1y;
        const miter = Math.min(miterLimit, 1 / Math.max(dot, 1 / miterLimit));
        offsetX[i] = nx * half * miter;
        offsetY[i] = ny * half * miter;
      }
      const contourStart = positions.length / 4;
      for (let i = 0; i <= count; i += 1) {
        const index = i % count;
        const x = points[index * 2];
        const y = points[index * 2 + 1];
        const s = (running + distanceAlong(points, i)) / total;
        positions.push(x + offsetX[index], y + offsetY[index], s, 1);
        positions.push(x - offsetX[index], y - offsetY[index], s, -1);
      }
      for (let i = 0; i < count; i += 1) {
        const a = contourStart + i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      running += contour.length || polylineLength(points, true);
    }

    return {
      positions: Float32Array.from(positions),
      indices: Uint32Array.from(indices),
    };
  }

  // --- sampling ----------------------------------------------------------------

  function triangleTable(tris) {
    const positions = tris.positions;
    const indices = tris.indices;
    const table = [];
    let total = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 2;
      const b = indices[i + 1] * 2;
      const c = indices[i + 2] * 2;
      const area =
        Math.abs(
          (positions[b] - positions[a]) * (positions[c + 1] - positions[a + 1]) -
            (positions[c] - positions[a]) * (positions[b + 1] - positions[a + 1])
        ) / 2;
      if (area <= 0) continue;
      total += area;
      table.push({ area, total, a, b, c });
    }
    return { table, total };
  }

  function sampleInterior(tris, count, rng) {
    const random = typeof rng === 'function' ? rng : Math.random;
    const result = new Float32Array(Math.max(0, count | 0) * 2);
    const { table, total } = triangleTable(tris);
    if (!table.length) return result;
    for (let i = 0; i < count; i += 1) {
      const target = random() * total;
      let entry = table[table.length - 1];
      for (const candidate of table) {
        if (target <= candidate.total) {
          entry = candidate;
          break;
        }
      }
      const u = Math.sqrt(random());
      const v = random();
      const positions = tris.positions;
      const x0 = positions[entry.a];
      const y0 = positions[entry.a + 1];
      const x1 = positions[entry.b];
      const y1 = positions[entry.b + 1];
      const x2 = positions[entry.c];
      const y2 = positions[entry.c + 1];
      result[i * 2] = x0 * (1 - u) + x1 * (u * (1 - v)) + x2 * (u * v);
      result[i * 2 + 1] = y0 * (1 - u) + y1 * (u * (1 - v)) + y2 * (u * v);
    }
    return result;
  }

  function sampleOutline(contours, count) {
    const list = (contours || []).filter((contour) => contour && contour.points.length >= 6);
    const result = new Float32Array(Math.max(0, count | 0) * 2);
    if (!list.length || count <= 0) return result;
    const lengths = list.map((contour) => contour.length || polylineLength(contour.points, true));
    const total = lengths.reduce((sum, value) => sum + value, 0) || 1;
    let contourIndex = 0;
    let distance = 0;
    for (let i = 0; i < count; i += 1) {
      const target = (i / count) * total;
      while (contourIndex < list.length - 1 && distance + lengths[contourIndex] < target) {
        distance += lengths[contourIndex];
        contourIndex += 1;
      }
      const contour = list[contourIndex];
      const points = contour.points;
      const pointCount = points.length / 2;
      let local = target - distance;
      let placed = false;
      for (let j = 0; j < pointCount; j += 1) {
        const k = (j + 1) % pointCount;
        const x1 = points[j * 2];
        const y1 = points[j * 2 + 1];
        const x2 = points[k * 2];
        const y2 = points[k * 2 + 1];
        const segment = Math.hypot(x2 - x1, y2 - y1);
        if (local <= segment || j === pointCount - 1) {
          const t = segment > EPSILON ? Math.max(0, Math.min(1, local / segment)) : 0;
          result[i * 2] = x1 + (x2 - x1) * t;
          result[i * 2 + 1] = y1 + (y2 - y1) * t;
          placed = true;
          break;
        }
        local -= segment;
      }
      if (!placed) {
        result[i * 2] = points[0];
        result[i * 2 + 1] = points[1];
      }
    }
    return result;
  }

  function pieces(tris) {
    const positions = tris.positions;
    const indices = tris.indices;
    const count = indices.length;
    const outPositions = new Float32Array(count * 2);
    const centroids = new Float32Array(count * 2);
    const triIds = new Uint32Array(count);
    const areas = new Float32Array(count);
    const outIndices = new Uint32Array(count);
    for (let i = 0; i < count; i += 3) {
      const a = indices[i] * 2;
      const b = indices[i + 1] * 2;
      const c = indices[i + 2] * 2;
      const cx = (positions[a] + positions[b] + positions[c]) / 3;
      const cy = (positions[a + 1] + positions[b + 1] + positions[c + 1]) / 3;
      const area =
        Math.abs(
          (positions[b] - positions[a]) * (positions[c + 1] - positions[a + 1]) -
            (positions[c] - positions[a]) * (positions[b + 1] - positions[a + 1])
        ) / 2;
      const triangleId = i / 3;
      const vertexIndices = [a, b, c];
      for (let v = 0; v < 3; v += 1) {
        const target = i + v;
        outPositions[target * 2] = positions[vertexIndices[v]];
        outPositions[target * 2 + 1] = positions[vertexIndices[v] + 1];
        centroids[target * 2] = cx;
        centroids[target * 2 + 1] = cy;
        triIds[target] = triangleId;
        areas[target] = area;
        outIndices[target] = target;
      }
    }
    return { positions: outPositions, indices: outIndices, centroids, triIds, areas };
  }

  // --- subdivision ---------------------------------------------------------------
  // Splits triangles until no edge exceeds `maxEdge`, sharing edge midpoints so
  // no cracks open between neighbours. Split triangles stay coplanar, so the
  // total area is unchanged. `maxTris` caps the output (per glyph) so a huge
  // subdivision request cannot blow up the vertex buffer.
  function subdivide(tris, maxEdge, maxTris) {
    if (!tris || !tris.indices || !tris.indices.length) return tris;
    const limit = Number(maxEdge);
    if (!(limit > 0)) return tris;
    const cap = Number.isFinite(Number(maxTris)) && Number(maxTris) > 0 ? Math.floor(Number(maxTris)) : Infinity;
    const positions = Array.from(tris.positions);
    const midpoints = new Map();
    const output = [];
    const queue = [];
    for (let i = 0; i < tris.indices.length; i += 3) queue.push([tris.indices[i], tris.indices[i + 1], tris.indices[i + 2]]);
    let count = queue.length;
    const threshold = limit * (1 + 1e-6);

    function midpoint(a, b) {
      const key = a < b ? a * 4294967296 + b : b * 4294967296 + a;
      const cached = midpoints.get(key);
      if (cached != null) return cached;
      const index = positions.length / 2;
      positions.push((positions[a * 2] + positions[b * 2]) / 2, (positions[a * 2 + 1] + positions[b * 2 + 1]) / 2);
      midpoints.set(key, index);
      return index;
    }

    function edgeLength(a, b) {
      return Math.hypot(positions[b * 2] - positions[a * 2], positions[b * 2 + 1] - positions[a * 2 + 1]);
    }

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const [a, b, c] = queue[cursor];
      const ab = edgeLength(a, b);
      const bc = edgeLength(b, c);
      const ca = edgeLength(c, a);
      const longest = Math.max(ab, bc, ca);
      if (longest <= threshold || count + 1 > cap) {
        output.push(a, b, c);
        continue;
      }
      count += 1;
      // split the longest edge; the new vertex sits on it, so both children
      // cover exactly the same area as their parent
      if (ab >= bc && ab >= ca) {
        const m = midpoint(a, b);
        queue.push([a, m, c], [m, b, c]);
      } else if (bc >= ca) {
        const m = midpoint(b, c);
        queue.push([b, m, a], [m, c, a]);
      } else {
        const m = midpoint(c, a);
        queue.push([c, m, b], [m, a, b]);
      }
    }
    return {
      positions: Float32Array.from(positions),
      indices: Uint32Array.from(output),
      needsStencil: !!tris.needsStencil,
    };
  }

  // --- measurement -------------------------------------------------------------

  function bounds(points) {
    if (!points || !points.length) return { x0: 0, y0: 0, x1: 0, y1: 0, width: 0, height: 0 };
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < points.length; i += 2) {
      const x = points[i];
      const y = points[i + 1];
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    return { x0, y0, x1, y1, width: x1 - x0, height: y1 - y0 };
  }

  function centroid(points) {
    const count = points ? points.length / 2 : 0;
    if (count < 3) return { x: 0, y: 0, area: 0 };
    let twiceArea = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < count; i += 1) {
      const j = (i + 1) % count;
      const cross = points[i * 2] * points[j * 2 + 1] - points[j * 2] * points[i * 2 + 1];
      twiceArea += cross;
      cx += (points[i * 2] + points[j * 2]) * cross;
      cy += (points[i * 2 + 1] + points[j * 2 + 1]) * cross;
    }
    if (Math.abs(twiceArea) < EPSILON) return { x: points[0], y: points[1], area: 0 };
    return { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea), area: Math.abs(twiceArea) / 2 };
  }

  // --- cache -------------------------------------------------------------------

  const cache = new Map();
  const MAX_CACHE_ENTRIES = 4096;

  function bucket(size) {
    return Math.round(Math.log2(Math.max(2, size)) * 4);
  }

  function cacheKey(fontId, glyphIndex, size) {
    return `${fontId}|${glyphIndex}|${bucket(size)}`;
  }

  function cached(key, build) {
    if (cache.has(key)) return cache.get(key);
    const value = build();
    if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
    cache.set(key, value);
    return value;
  }

  function clearCache() {
    cache.clear();
  }

  return {
    DEFAULT_TOLERANCE,
    glyphContours,
    groupContours,
    triangulate,
    triangleAreaSum,
    strokeRibbon,
    sampleInterior,
    sampleOutline,
    pieces,
    subdivide,
    bounds,
    centroid,
    pointInPolygon,
    shoelaceArea,
    polylineLength,
    bucket,
    cacheKey,
    cached,
    clearCache,
  };
});
