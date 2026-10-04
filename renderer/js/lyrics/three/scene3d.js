(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.three3d = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // three.js background scenes. The module is split in two halves:
  //
  //   * `layout` / `scenePlan` are pure functions of (layer, time). They hold
  //     every value the renderer reads, so scrubbing and exporting agree and
  //     the tests can pin the result without a WebGL context.
  //   * `render` drives a private three renderer on its own canvas and returns
  //     that canvas; the main GL pipeline uploads it as a texture. The three
  //     clock is never read: every pose comes from `time`.
  //
  // three is loaded separately (window.SA.THREE via vendor/three-loader.js).
  // When it is missing or the renderer cannot start, `render` returns null and
  // the caller keeps the plain 2D path.

  const PRESETS = ['starfield', 'grid', 'floating'];
  const GEOMETRIES = ['icosa', 'octa', 'box', 'torus', 'tetra'];

  // Per-preset background colour, accent and fog. `background` is opaque so a
  // scene3d layer is a self-contained backdrop; the layer opacity / blend still
  // soften it at composite time.
  const PALETTE = {
    starfield: { background: '#05070f', accent: '#9fb8ff', fog: null },
    grid: { background: '#060a12', accent: '#39d0ff', fog: '#060a12' },
    floating: { background: '#090814', accent: '#c78bff', fog: null },
  };

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }

  function num(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function hashString(text) {
    let hash = 2166136261;
    const source = String(text == null ? '' : text);
    for (let i = 0; i < source.length; i += 1) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value + 0x6d2b79f5) | 0;
      let t = Math.imul(value ^ (value >>> 15), 1 | value);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function parseHex(value) {
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value == null ? '' : value).trim());
    if (!match) return null;
    let body = match[1];
    if (body.length === 3) body = body.split('').map((char) => char + char).join('');
    return [parseInt(body.slice(0, 2), 16) / 255, parseInt(body.slice(2, 4), 16) / 255, parseInt(body.slice(4, 6), 16) / 255];
  }

  function sceneOf(layer) {
    return (layer && layer.scene) || {};
  }

  function seedOf(layer) {
    const seed = sceneOf(layer).seed;
    if (seed != null && Number.isFinite(Number(seed))) return Number(seed) >>> 0;
    return hashString((layer && layer.id) || 'scene3d');
  }

  function presetOf(layer) {
    const preset = sceneOf(layer).preset;
    return PRESETS.indexOf(preset) >= 0 ? preset : PRESETS[0];
  }

  function speedOf(layer) {
    const speed = num(sceneOf(layer).speed, 1);
    return speed > 0 ? clamp(speed, 0.05, 8) : 1;
  }

  function densityOf(layer) {
    return clamp(num(sceneOf(layer).density, 1), 0.2, 3);
  }

  function accentOf(layer, preset) {
    return parseHex(sceneOf(layer).color) || parseHex(PALETTE[preset].accent);
  }

  // The new layer's scene block. `seed` is left out on purpose: it is derived
  // from the layer id, so two layers never share a random draw.
  function defaults() {
    return { preset: 'starfield', speed: 1, density: 1, color: '' };
  }

  // Static, deterministic description of a preset: the geometry and the random
  // placement. Rebuilt only when the preset / seed / density changes.
  function layout(layer) {
    const preset = presetOf(layer);
    const seed = seedOf(layer);
    const density = densityOf(layer);
    const accent = accentOf(layer, preset);

    if (preset === 'starfield') {
      const random = seededRandom(seed ^ 0x9e3779b9);
      const count = Math.max(80, Math.round(220 * density));
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i += 1) {
        const angle = random() * Math.PI * 2;
        const radius = 7 + random() * 26;
        positions[i * 3] = Math.cos(angle) * radius;
        positions[i * 3 + 1] = (random() - 0.5) * 20;
        positions[i * 3 + 2] = Math.sin(angle) * radius;
        const bright = 0.55 + random() * 0.45;
        const white = 0.25 * random();
        colors[i * 3] = clamp(accent[0] * (1 - white) + bright * white, 0, 1);
        colors[i * 3 + 1] = clamp(accent[1] * (1 - white) + bright * white, 0, 1);
        colors[i * 3 + 2] = clamp(accent[2] * (1 - white) + bright * white, 0, 1);
      }
      return { type: 'points', preset, count, positions, colors, size: 0.12 * density };
    }

    if (preset === 'grid') {
      return { type: 'grid', preset, size: 44, divisions: 44, cell: 2.2 };
    }

    const random = seededRandom(seed ^ 0x85ebca6b);
    const count = Math.max(3, Math.min(24, Math.round(9 * density)));
    const items = [];
    for (let i = 0; i < count; i += 1) {
      const geometry = GEOMETRIES[Math.floor(random() * GEOMETRIES.length)];
      const base = [(random() - 0.5) * 9, (random() - 0.5) * 5, (random() - 0.5) * 9 - 2];
      const scale = 0.35 + random() * 0.85;
      const spin = [0.2 + random() * 0.7, 0.2 + random() * 0.7, 0.1 + random() * 0.5];
      const drift = [0.2 + random() * 0.5, 0.15 + random() * 0.4, 0.2 + random() * 0.5];
      const phase = random() * Math.PI * 2;
      const mix = random();
      const color = [
        clamp(accent[0] * (0.55 + mix * 0.45) + 0.08, 0, 1),
        clamp(accent[1] * (0.55 + mix * 0.45) + 0.08, 0, 1),
        clamp(accent[2] * (0.55 + mix * 0.45) + 0.08, 0, 1),
      ];
      items.push({ geometry, base, scale, spin, drift, phase, color, wireframe: random() < 0.35 });
    }
    return { type: 'meshes', preset, items };
  }

  // The per-frame pose. Pure: same (layer, time, size) -> same plan.
  function scenePlan(layer, time, size) {
    const preset = presetOf(layer);
    const speed = speedOf(layer);
    const t = num(time, 0) * speed;
    const palette = PALETTE[preset];
    const plan = {
      preset,
      background: palette.background,
      accent: accentOf(layer, preset),
      fov: 55,
      camera: { position: [0, 0, 0], target: [0, 0, -1] },
      group: { position: [0, 0, 0], rotation: [0, 0, 0] },
      objects: [],
      fog: null,
      width: num(size && size.width, 1920),
      height: num(size && size.height, 1080),
    };

    if (preset === 'starfield') {
      plan.fov = 62;
      plan.camera.position = [0, 0, 0];
      plan.camera.target = [0, 0, -1];
      plan.group.rotation = [0.08 * Math.sin(t * 0.05), t * 0.05, 0];
      return plan;
    }

    if (preset === 'grid') {
      const cell = 2.2;
      const z = (((t * 3) % cell) + cell) % cell;
      plan.fov = 60;
      plan.camera.position = [0, 2.3 + 0.15 * Math.sin(t * 0.4), 0];
      plan.camera.target = [0, 0.4, -1];
      plan.group.position = [0, -2.1, z];
      plan.fog = { color: palette.fog || palette.background, near: 4, far: 42 };
      return plan;
    }

    const data = layout(layer);
    plan.fov = 52;
    plan.camera.position = [0, 0.4, 9];
    plan.camera.target = [0, 0, 0];
    data.items.forEach((item, index) => {
      const phase = item.phase + index * 0.7;
      plan.objects.push({
        index,
        position: [
          item.base[0] + Math.sin(t * item.drift[0] + phase) * 0.6,
          item.base[1] + Math.cos(t * item.drift[1] + phase * 1.3) * 0.5,
          item.base[2] + Math.sin(t * item.drift[2] + phase * 0.6) * 0.6,
        ],
        rotation: [t * item.spin[0] + phase, t * item.spin[1], t * item.spin[2] + phase],
        scale: item.scale * (1 + 0.06 * Math.sin(t * 0.7 + phase)),
      });
    });
    return plan;
  }

  // --- private three renderer ------------------------------------------------

  let shared = null;
  let failed = false;

  function isSupported() {
    return !failed && typeof document !== 'undefined' && typeof SA !== 'undefined' && !!SA.THREE;
  }

  function context() {
    if (failed) return null;
    if (shared) return shared;
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
    const THREE = typeof SA !== 'undefined' ? SA.THREE : null;
    if (!THREE) return null;
    try {
      const canvas = document.createElement('canvas');
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(1);
      if (THREE.SRGBColorSpace && renderer.outputColorSpace !== undefined) renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x000000, 0);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 200);
      const ambient = new THREE.AmbientLight(0xffffff, 0.7);
      const key = new THREE.DirectionalLight(0xffffff, 1.1);
      key.position.set(3, 6, 4);
      const rim = new THREE.PointLight(0x88aaff, 0.8, 0, 2);
      rim.position.set(-4, 2, 6);
      scene.add(ambient);
      scene.add(key);
      scene.add(rim);
      shared = { THREE, renderer, scene, camera, cache: new Map(), width: 0, height: 0 };
      return shared;
    } catch {
      failed = true;
      return null;
    }
  }

  function geometryFor(THREE, name) {
    if (name === 'box') return new THREE.BoxGeometry(1, 1, 1);
    if (name === 'octa') return new THREE.OctahedronGeometry(0.75);
    if (name === 'torus') return new THREE.TorusGeometry(0.6, 0.22, 12, 28);
    if (name === 'tetra') return new THREE.TetrahedronGeometry(0.85);
    return new THREE.IcosahedronGeometry(0.75);
  }

  // GridHelper's colours: the accent wire over the preset's dark background.
  function buildEntry(ctx, preset, data) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    if (data.type === 'points') {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
      const material = new THREE.PointsMaterial({
        size: data.size,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      });
      group.add(new THREE.Points(geometry, material));
    } else if (data.type === 'grid') {
      const colors = paletteColors(preset);
      const grid = new THREE.GridHelper(data.size, data.divisions, new THREE.Color(colors[0][0], colors[0][1], colors[0][2]), new THREE.Color(colors[1][0], colors[1][1], colors[1][2]));
      if (grid.material) {
        grid.material.transparent = true;
        grid.material.opacity = 0.7;
      }
      group.add(grid);
    } else {
      data.items.forEach((item) => {
        const color = new THREE.Color(item.color[0], item.color[1], item.color[2]);
        const material = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: item.wireframe ? 0.6 : 0.25,
          metalness: 0.35,
          roughness: 0.4,
          wireframe: item.wireframe,
        });
        group.add(new THREE.Mesh(geometryFor(THREE, item.geometry), material));
      });
    }
    return { group, preset, data };
  }

  function paletteColors(preset) {
    const palette = PALETTE[preset];
    return [parseHex(palette.accent), parseHex('#1b2b40')];
  }

  function applyEntry(entry, plan) {
    const group = entry.group;
    group.position.set(plan.group.position[0], plan.group.position[1], plan.group.position[2]);
    group.rotation.set(plan.group.rotation[0], plan.group.rotation[1], plan.group.rotation[2]);
    if (entry.preset !== 'floating') return;
    for (const object of plan.objects) {
      const mesh = group.children[object.index];
      if (!mesh) continue;
      mesh.position.set(object.position[0], object.position[1], object.position[2]);
      mesh.rotation.set(object.rotation[0], object.rotation[1], object.rotation[2]);
      mesh.scale.set(object.scale, object.scale, object.scale);
    }
  }

  function disposeEntry(ctx, entry) {
    entry.group.traverse((node) => {
      if (node.geometry) node.geometry.dispose();
      if (node.material) {
        if (Array.isArray(node.material)) node.material.forEach((material) => material.dispose());
        else node.material.dispose();
      }
    });
    ctx.scene.remove(entry.group);
  }

  // Renders one layer at `time` and returns the canvas to upload, or null when
  // three is unavailable / the renderer failed.
  function render(layer, options) {
    const ctx = context();
    if (!ctx) return null;
    const opts = options || {};
    const width = Math.max(1, Math.round(num(opts.width, 1920)));
    const height = Math.max(1, Math.round(num(opts.height, 1080)));
    if (ctx.width !== width || ctx.height !== height) {
      ctx.width = width;
      ctx.height = height;
      ctx.renderer.setSize(width, height, false);
      ctx.camera.aspect = width / height;
    }

    const time = num(opts.time, 0);
    const plan = scenePlan(layer, time, { width, height });
    const data = layout(layer);
    const key = `${plan.preset}|${seedOf(layer)}|${densityOf(layer)}`;
    let entry = ctx.cache.get(key);
    if (!entry) {
      entry = buildEntry(ctx, plan.preset, data);
      ctx.scene.add(entry.group);
      ctx.cache.set(key, entry);
      while (ctx.cache.size > 6) {
        const oldest = ctx.cache.keys().next().value;
        disposeEntry(ctx, ctx.cache.get(oldest));
        ctx.cache.delete(oldest);
      }
    }

    for (const candidate of ctx.cache.values()) candidate.group.visible = false;
    entry.group.visible = true;
    applyEntry(entry, plan);

    ctx.scene.background = new ctx.THREE.Color(plan.background);
    ctx.scene.fog = plan.fog ? new ctx.THREE.Fog(plan.fog.color, plan.fog.near, plan.fog.far) : null;
    ctx.camera.fov = plan.fov;
    ctx.camera.position.set(plan.camera.position[0], plan.camera.position[1], plan.camera.position[2]);
    ctx.camera.lookAt(plan.camera.target[0], plan.camera.target[1], plan.camera.target[2]);
    ctx.camera.updateProjectionMatrix();
    ctx.renderer.render(ctx.scene, ctx.camera);
    return ctx.renderer.domElement;
  }

  function dispose() {
    if (!shared) return;
    for (const entry of shared.cache.values()) disposeEntry(shared, entry);
    shared.cache.clear();
    shared.renderer.dispose();
    shared = null;
    failed = false;
  }

  function clearCache() {
    if (!shared) return;
    for (const entry of shared.cache.values()) disposeEntry(shared, entry);
    shared.cache.clear();
  }

  return {
    PRESETS,
    defaults,
    presetOf,
    speedOf,
    densityOf,
    seedOf,
    accentOf,
    layout,
    scenePlan,
    render,
    isSupported,
    clearCache,
    dispose,
  };
});
