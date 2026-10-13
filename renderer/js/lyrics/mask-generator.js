((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.maskGenerator = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';

  function clamp255(v) {
    return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
  }

  function createPRNG(seed) {
    let s = (Number(seed) || 12345) >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Convert Uint8Array or Array (length W*H, values 0..255) to Data URL.
  // In browser, uses HTMLCanvasElement. In Node/fallback, creates a standard BMP Data URL.
  function pixelsToDataURL(pixels, width, height) {
    if (typeof document !== 'undefined' && document.createElement) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(width, height);
        for (let i = 0; i < pixels.length; i += 1) {
          const val = pixels[i];
          const idx = i * 4;
          imgData.data[idx] = val;
          imgData.data[idx + 1] = val;
          imgData.data[idx + 2] = val;
          imgData.data[idx + 3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
        return canvas.toDataURL('image/png');
      } catch {
        /* fallback to BMP */
      }
    }
    return pixelsToBmpDataURL(pixels, width, height);
  }

  function pixelsToBmpDataURL(pixels, width, height) {
    const rowSize = Math.floor((24 * width + 31) / 32) * 4;
    const pixelArraySize = rowSize * height;
    const fileSize = 54 + pixelArraySize;
    const buffer = new Uint8Array(fileSize);

    // BMP Header
    buffer[0] = 0x42; // 'B'
    buffer[1] = 0x4d; // 'M'
    buffer[2] = fileSize & 0xff;
    buffer[3] = (fileSize >> 8) & 0xff;
    buffer[4] = (fileSize >> 16) & 0xff;
    buffer[5] = (fileSize >> 24) & 0xff;
    buffer[10] = 54; // Pixel data offset

    // DIB Header
    buffer[14] = 40; // Header size
    buffer[18] = width & 0xff;
    buffer[19] = (width >> 8) & 0xff;
    buffer[20] = (width >> 16) & 0xff;
    buffer[21] = (width >> 24) & 0xff;
    buffer[22] = height & 0xff;
    buffer[23] = (height >> 8) & 0xff;
    buffer[24] = (height >> 16) & 0xff;
    buffer[25] = (height >> 24) & 0xff;
    buffer[26] = 1; // Color planes
    buffer[28] = 24; // Bits per pixel

    for (let y = 0; y < height; y += 1) {
      const srcRow = height - 1 - y; // BMP is bottom-up
      const rowOffset = 54 + y * rowSize;
      for (let x = 0; x < width; x += 1) {
        const val = pixels[srcRow * width + x];
        const pixelOffset = rowOffset + x * 3;
        buffer[pixelOffset] = val;     // B
        buffer[pixelOffset + 1] = val; // G
        buffer[pixelOffset + 2] = val; // R
      }
    }

    let binary = '';
    for (let i = 0; i < buffer.length; i += 1) {
      binary += String.fromCharCode(buffer[i]);
    }
    const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(buffer).toString('base64');
    return `data:image/bmp;base64,${base64}`;
  }

  // --- Algorithm 1: Perlin Noise ---
  function generatePerlin(width, height, seed) {
    const rng = createPRNG(seed);
    const p = new Uint8Array(512);
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) perm[i] = i;
    for (let i = 255; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = perm[i];
      perm[i] = perm[j];
      perm[j] = tmp;
    }
    for (let i = 0; i < 512; i += 1) p[i] = perm[i & 255];

    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function lerp(t, a, b) { return a + t * (b - a); }
    function grad(hash, x, y) {
      const h = hash & 7;
      const u = h < 4 ? x : y;
      const v = h < 4 ? y : x;
      return ((h & 1) ? -u : u) + ((h & 2) ? -2.0 * v : 2.0 * v);
    }

    function noise(x, y) {
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      const xf = x - Math.floor(x);
      const yf = y - Math.floor(y);
      const u = fade(xf);
      const v = fade(yf);

      const A = p[X] + Y;
      const B = p[X + 1] + Y;

      return lerp(v,
        lerp(u, grad(p[A], xf, yf), grad(p[B], xf - 1, yf)),
        lerp(u, grad(p[A + 1], xf, yf - 1), grad(p[B + 1], xf - 1, yf - 1))
      );
    }

    const pixels = new Uint8Array(width * height);
    const scale = 0.05 * (64 / width);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let n = noise(x * scale, y * scale) * 0.6;
        n += noise(x * scale * 2, y * scale * 2) * 0.3;
        n += noise(x * scale * 4, y * scale * 4) * 0.1;
        const normalized = (n + 1) * 0.5;
        pixels[y * width + x] = clamp255(normalized * 255);
      }
    }
    return pixels;
  }

  // --- Algorithm 2: Value Noise ---
  function generateValueNoise(width, height, seed) {
    const rng = createPRNG(seed);
    const gridSize = 8;
    const gw = Math.ceil(width / gridSize) + 1;
    const gh = Math.ceil(height / gridSize) + 1;
    const grid = new Float32Array(gw * gh);
    for (let i = 0; i < grid.length; i += 1) grid[i] = rng();

    function smoothstep(t) { return t * t * (3 - 2 * t); }

    const pixels = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      const gy = y / gridSize;
      const iy = Math.floor(gy);
      const fy = smoothstep(gy - iy);
      for (let x = 0; x < width; x += 1) {
        const gx = x / gridSize;
        const ix = Math.floor(gx);
        const fx = smoothstep(gx - ix);

        const v00 = grid[iy * gw + ix];
        const v10 = grid[iy * gw + (ix + 1)];
        const v01 = grid[(iy + 1) * gw + ix];
        const v11 = grid[(iy + 1) * gw + (ix + 1)];

        const top = v00 + fx * (v10 - v00);
        const bot = v01 + fx * (v11 - v01);
        const val = top + fy * (bot - top);

        pixels[y * width + x] = clamp255(val * 255);
      }
    }
    return pixels;
  }

  // --- Algorithm 3: Voronoi / Worley Noise ---
  function generateVoronoi(width, height, seed) {
    const rng = createPRNG(seed);
    const numPoints = 12;
    const points = [];
    for (let i = 0; i < numPoints; i += 1) {
      points.push({ x: rng() * width, y: rng() * height });
    }

    const pixels = new Uint8Array(width * height);
    const maxDist = Math.hypot(width, height) * 0.35;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let d1 = Infinity;
        let d2 = Infinity;
        for (let i = 0; i < points.length; i += 1) {
          const pt = points[i];
          const d = Math.hypot(x - pt.x, y - pt.y);
          if (d < d1) {
            d2 = d1;
            d1 = d;
          } else if (d < d2) {
            d2 = d;
          }
        }
        // Cell wall / edge contrast pattern (Worley F2 - F1)
        const val = Math.min(1, (d2 - d1) / (maxDist * 0.25));
        pixels[y * width + x] = clamp255(val * 255);
      }
    }
    return pixels;
  }

  // --- Algorithm 4: Poisson Disk Sampling ---
  function generatePoissonDisk(width, height, seed) {
    const rng = createPRNG(seed);
    const r = Math.max(6, Math.min(16, Math.round(width / 10)));
    const k = 30;
    const cellSize = r / Math.SQRT2;
    const gridW = Math.ceil(width / cellSize);
    const gridH = Math.ceil(height / cellSize);
    const grid = new Array(gridW * gridH).fill(null);
    const active = [];
    const samples = [];

    const first = { x: rng() * width, y: rng() * height };
    samples.push(first);
    active.push(first);
    const gx = Math.floor(first.x / cellSize);
    const gy = Math.floor(first.y / cellSize);
    grid[gy * gridW + gx] = first;

    while (active.length > 0) {
      const idx = Math.floor(rng() * active.length);
      const point = active[idx];
      let found = false;

      for (let i = 0; i < k; i += 1) {
        const angle = rng() * Math.PI * 2;
        const radius = r + rng() * r;
        const candidate = { x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius };

        if (candidate.x >= 0 && candidate.x < width && candidate.y >= 0 && candidate.y < height) {
          const cgx = Math.floor(candidate.x / cellSize);
          const cgy = Math.floor(candidate.y / cellSize);
          let ok = true;

          for (let dy = -2; dy <= 2 && ok; dy += 1) {
            for (let dx = -2; dx <= 2 && ok; dx += 1) {
              const nx = cgx + dx;
              const ny = cgy + dy;
              if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
                const neighbor = grid[ny * gridW + nx];
                if (neighbor && Math.hypot(candidate.x - neighbor.x, candidate.y - neighbor.y) < r) {
                  ok = false;
                }
              }
            }
          }

          if (ok) {
            samples.push(candidate);
            active.push(candidate);
            grid[cgy * gridW + cgx] = candidate;
            found = true;
            break;
          }
        }
      }

      if (!found) active.splice(idx, 1);
    }

    const pixels = new Uint8Array(width * height);
    const dotRadius = r * 0.35;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let minDist = Infinity;
        for (let i = 0; i < samples.length; i += 1) {
          const d = Math.hypot(x - samples[i].x, y - samples[i].y);
          if (d < minDist) minDist = d;
        }
        const alpha = minDist <= dotRadius ? 1 : Math.max(0, 1 - (minDist - dotRadius) / (dotRadius * 0.8));
        pixels[y * width + x] = clamp255(alpha * 255);
      }
    }
    return pixels;
  }

  // --- Algorithm 5: Random Walk ---
  function generateRandomWalk(width, height, seed) {
    const rng = createPRNG(seed);
    const pixels = new Uint8Array(width * height);
    const numWalkers = 6;
    const steps = width * height * 2;

    const dirs = [
      { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
      { x: 1, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 },
    ];

    for (let w = 0; w < numWalkers; w += 1) {
      let cx = Math.floor(rng() * width);
      let cy = Math.floor(rng() * height);
      let dirIdx = Math.floor(rng() * dirs.length);

      for (let s = 0; s < steps; s += 1) {
        pixels[cy * width + cx] = Math.min(255, pixels[cy * width + cx] + 80);
        if (rng() < 0.25) dirIdx = Math.floor(rng() * dirs.length);
        const dir = dirs[dirIdx];
        cx = (cx + dir.x + width) % width;
        cy = (cy + dir.y + height) % height;
      }
    }

    return pixels;
  }

  // --- Algorithm 6: Cellular Automaton ---
  function generateCellularAutomaton(width, height, seed) {
    const rng = createPRNG(seed);
    let grid = new Uint8Array(width * height);
    for (let i = 0; i < grid.length; i += 1) {
      grid[i] = rng() < 0.45 ? 1 : 0;
    }

    const iterations = 5;
    for (let it = 0; it < iterations; it += 1) {
      const next = new Uint8Array(width * height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          let neighbors = 0;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (dx === 0 && dy === 0) continue;
              const nx = (x + dx + width) % width;
              const ny = (y + dy + height) % height;
              if (grid[ny * width + nx]) neighbors += 1;
            }
          }
          if (grid[y * width + x]) {
            next[y * width + x] = neighbors >= 4 ? 1 : 0;
          } else {
            next[y * width + x] = neighbors >= 5 ? 1 : 0;
          }
        }
      }
      grid = next;
    }

    const pixels = new Uint8Array(width * height);
    for (let i = 0; i < grid.length; i += 1) {
      pixels[i] = grid[i] ? 255 : 0;
    }
    return pixels;
  }

  const ALGORITHMS = [
    { id: 'perlin', nameKey: 'masks.algoPerlin', nameJa: 'パーリンノイズ (Perlin)', generator: generatePerlin },
    { id: 'valueNoise', nameKey: 'masks.algoValueNoise', nameJa: 'バリューノイズ (Value Noise)', generator: generateValueNoise },
    { id: 'voronoi', nameKey: 'masks.algoVoronoi', nameJa: 'ボロノイ図 (Voronoi)', generator: generateVoronoi },
    { id: 'poissonDisk', nameKey: 'masks.algoPoissonDisk', nameJa: 'ポアソンディスク (Poisson Disk)', generator: generatePoissonDisk },
    { id: 'randomWalk', nameKey: 'masks.algoRandomWalk', nameJa: 'ランダムウォーク (Random Walk)', generator: generateRandomWalk },
    { id: 'cellularAutomaton', nameKey: 'masks.algoCellularAutomaton', nameJa: 'セル・オートマトン (Cellular Automaton)', generator: generateCellularAutomaton },
  ];

  function generate(algorithmId, options) {
    const opts = options || {};
    const width = Number(opts.width) === 128 ? 128 : 64;
    const height = Number(opts.height) === 128 ? 128 : 64;
    const seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 1000000);
    const algo = ALGORITHMS.find((entry) => entry.id === algorithmId) || ALGORITHMS[0];
    const pixels = algo.generator(width, height, seed);
    const dataUrl = pixelsToDataURL(pixels, width, height);

    return {
      id: `mask_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000).toString(36)}`,
      name: opts.name || `${algo.nameJa} ${width}x${height}`,
      algorithm: algo.id,
      width,
      height,
      seed,
      data: dataUrl,
      pixels,
      targets: {
        textFg: !!(opts.targets && opts.targets.textFg),
        textBg: !!(opts.targets && opts.targets.textBg),
        backdrop: !!(opts.targets && opts.targets.backdrop),
        background: !!(opts.targets && opts.targets.background),
      },
    };
  }

  function generateRandomBatch(count, options) {
    const targetCount = Math.max(1, Math.min(10, count || 10));
    const results = [];
    const targetKeys = ['textFg', 'textBg', 'backdrop', 'background'];
    for (let i = 0; i < targetCount; i += 1) {
      const algo = ALGORITHMS[i % ALGORITHMS.length];
      const res = (i % 2 === 0) ? 64 : 128;
      const seed = Math.floor(Math.random() * 1000000) + i * 997;
      const targetKey = targetKeys[i % targetKeys.length];
      const targets = { textFg: false, textBg: false, backdrop: false, background: false };
      targets[targetKey] = true;
      results.push(generate(algo.id, { width: res, height: res, seed, targets, name: `${algo.nameJa} #${i + 1}` }));
    }
    return results;
  }

  return { ALGORITHMS, generate, generateRandomBatch, pixelsToDataURL };
});
