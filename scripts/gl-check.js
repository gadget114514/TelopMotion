// Compiles every figure field and every simulation shader in a real WebGL2
// context and reports what came out, so a GLSL mistake is caught here instead of
// as a blank figure in the Studio.
//
//   node_modules/electron/dist/electron.exe scripts/gl-check.js --no-sandbox
//
// The renderer is loaded script by script into a blank page - the Studio's own
// startup is not needed and would keep the page busy - then the shaders are
// compiled through the same helpers the pipeline uses and each simulation is
// actually run for two seconds and read back, so a shader that builds but goes
// NaN is caught too. The result is written to GL_CHECK_OUT as JSON.

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = process.env.GL_CHECK_OUT || path.join(__dirname, '..', '.gl-check.json');
const ORIGIN = process.env.GL_CHECK_ORIGIN || 'http://127.0.0.1:8731';
const WATCHDOG_MS = 120000;

const watchdog = setTimeout(() => {
  fs.writeFileSync(OUT, JSON.stringify({ summary: { ok: false, reason: `watchdog after ${WATCHDOG_MS}ms` } }, null, 2));
  process.exit(3);
}, WATCHDOG_MS);

app.disableHardwareAcceleration = false;

// The order the renderer loads them in: rng, then scene3d (sim and fields both
// take their genome drawer from it), then the sim, then the fields.
const MODULES = [
  'renderer/js/lyrics/rng.js',
  'renderer/js/lyrics/scene3d.js',
  'renderer/js/lyrics/gl/sim.js',
  'renderer/js/lyrics/gl/fields.js',
  'renderer/js/lyrics/gl/shaders.js',
  'renderer/js/lyrics/gl/context.js',
];

app.whenReady().then(async () => {
  let out;
  try {
    const win = new BrowserWindow({ width: 512, height: 512, show: false, webPreferences: { offscreen: true } });
    const messages = [];
    win.webContents.on('console-message', (_e, level, message) => messages.push(`[${level}] ${message}`));
    // a same-origin document, so the modules below can be fetched (about:blank is
    // an opaque origin and every fetch would fail)
    await win.loadURL(`${ORIGIN}/renderer/js/lyrics/rng.js`);
    const loaded = await win.webContents.executeJavaScript(`(${loadModules.toString()})(${JSON.stringify(MODULES)}, ${JSON.stringify(ORIGIN)})`, true);
    if (!loaded.ok) {
      out = { summary: { ok: false, reason: 'modules did not load', loaded } };
    } else {
      // Every half has to be defined in the page: each is injected as source. The call
      // is wrapped so a throw comes back as a stack rather than as a bare refusal.
      const defs = [fieldProgramsFor, readTarget, specFor, gpuChecks, sweepCount, bisectPasses].map((fn) => fn.toString()).join('\n');
      const call = `JSON.stringify((() => { try { return (${probe.toString()})(); } catch (e) { return { summary: { ok: false, reason: 'threw: ' + (e && e.stack ? e.stack : String(e)) } }; } })())`;
      const json = await win.webContents.executeJavaScript(`${defs}\n${call}`, true);
      out = typeof json === 'string' ? JSON.parse(json) : json;
    }
    out.console = messages.filter((m) => !m.includes('Autofill') && !m.includes('Electron Security'));
  } catch (error) {
    out = { summary: { ok: false, reason: String((error && error.message) || error) } };
  }
  clearTimeout(watchdog);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  process.exit(out.summary && out.summary.ok ? 0 : 1);
});

// Runs in the page: fetch each classic script and run it, so the modules hang
// off `SA` exactly as they do in the Studio.
async function loadModules(modules, origin) {
  const results = [];
  globalThis.window = globalThis;
  globalThis.SA = globalThis.SA || {};
  for (const rel of modules) {
    const res = await fetch(`${origin}/${rel}`);
    if (!res.ok) return { ok: false, failed: rel, status: res.status };
    const source = await res.text();
    // eslint-disable-next-line no-new-func
    new Function(source)();
    results.push(rel);
  }
  return { ok: true, results, hasSim: !!globalThis.SA.glSim, hasFields: !!globalThis.SA.glFields, hasShaders: !!globalThis.SA.glShaders, hasGl: !!globalThis.SA.gl };
}

// Runs in the page, with SA.rng / SA.scene3d / SA.glSim / SA.glFields /
// SA.glShaders / SA.gl loaded.
function probe() {
  const out = { fields: {}, sims: {}, compileErrors: [], summary: {} };
  if (typeof SA === 'undefined' || !SA.glFields || !SA.glSim || !SA.glShaders) {
    out.summary.ok = false;
    out.summary.reason = 'modules missing';
    return out;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) {
    out.summary.ok = false;
    out.summary.reason = 'no webgl2';
    return out;
  }
  const floatTargets = !!gl.getExtension('EXT_color_buffer_float');
  out.summary.floatTargets = floatTargets;
  if (!floatTargets) out.summary.warn = 'EXT_color_buffer_float missing: the simulations stay off';

  function compile(type, source, tag) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, source);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      out.compileErrors.push({ tag, log: String(gl.getShaderInfoLog(sh)).slice(0, 1200) });
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }
  function link(frag, tag) {
    const v = compile(gl.VERTEX_SHADER, SA.glShaders.QUAD_VERT, `${tag}:vert`);
    if (!v) return null;
    const f = compile(gl.FRAGMENT_SHADER, frag, `${tag}:frag`);
    if (!f) { gl.deleteShader(v); return null; }
    const p = gl.createProgram();
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      out.compileErrors.push({ tag, log: String(gl.getProgramInfoLog(p)).slice(0, 1200) });
      gl.deleteProgram(p);
      return null;
    }
    const uniforms = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i += 1) {
      const info = gl.getActiveUniform(p, i);
      uniforms[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
    }
    return { program: p, uniforms };
  }

  // every field, closed form and simulated
  for (const id of SA.glFields.IDS) {
    const entry = link(SA.glFields.fragment(id), id);
    out.fields[id] = entry ? 'ok' : 'FAILED';
    if (entry) gl.deleteProgram(entry.program);
  }

  const runner = SA.glSim.createRunner(gl, { floatTargets });

  // The multi-pass simulations are the ones that can go wrong quietly, so the
  // number of pressure sweeps is varied: if only some counts fail, the ping-pong
  // is aliasing; if they all fail, the sweep itself is wrong.
  out.sweepCount = sweepCount(gl, SA);
  out.bisect = bisectPasses(gl, SA);
  out.gpu = gpuChecks(gl, SA, fieldProgramsFor(gl, SA));

  for (const id of SA.glSim.SIMS) {
    const p = SA.glSim.genome(id, 12345, 1);
    const beats = [0.5, 1.5, 2.5, 3.5];
    const spec = { id, p, seed: 12345, time: 0, opacity: 1, colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'], textBox: null, sim: { key: `probe:${id}`, beats } };
    const trace = [];
    // step forward a few times, watching for an error at each call, so a bad pass
    // shows up on its own rather than as one error at the end
    for (const at of [0, 1 / 30, 2 / 30, 0.5, 1, 2]) {
      while (gl.getError() !== gl.NO_ERROR) { /* drain */ }
      spec.time = at;
      const tex = runner.textureFor(spec);
      const err = gl.getError();
      trace.push({ time: at, texture: !!tex, error: err || 0 });
      if (!tex) break;
    }
    const last = trace[trace.length - 1];
    if (!last.texture) { out.sims[id] = 'no texture'; continue; }
    const tex2 = runner.textureFor(Object.assign({}, spec, { time: 2 }));

    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex2.texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    let nonFinite = 0;
    let energy = 0;
    if (status === gl.FRAMEBUFFER_COMPLETE) {
      const px = new Float32Array(4 * 96 * 96);
      gl.readPixels(80, 80, 96, 96, gl.RGBA, gl.FLOAT, px);
      for (let i = 0; i < px.length; i += 1) {
        if (!Number.isFinite(px[i])) nonFinite += 1;
        else energy += Math.abs(px[i]);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    out.sims[id] = {
      framebuffer: status === gl.FRAMEBUFFER_COMPLETE ? 'complete' : `incomplete(${status})`,
      nonFinite,
      energy: Number(energy.toFixed(2)),
      errors: trace.filter((t) => t.error).map((t) => `${t.time}s:${t.error}`),
    };
  }
  out.summary.stats = runner.stats;
  out.summary.keyBytes = runner.keyBytes();
  out.summary.liveBytes = runner.liveBytes();
  runner.dispose();

  const fieldFails = Object.entries(out.fields).filter(([, v]) => v !== 'ok').map(([k]) => k);
  const simFails = Object.entries(out.sims)
    .filter(([, v]) => typeof v !== 'string' && (v.nonFinite > 0 || v.errors.length > 0 || v.framebuffer !== 'complete' || v.energy === 0))
    .map(([k]) => k);
  // the GPU claims are the ones a node test cannot make: a step is a pure
  // function of (state, step), a scrub lands on the same state as a play, and the
  // field shader draws what it is handed
  const gpuFails = [];
  for (const [id, r] of Object.entries(out.gpu.determinism)) if (!r.identical || r.nonFinite) gpuFails.push(`determinism:${id}`);
  for (const [id, r] of Object.entries(out.gpu.seek)) if (!r.identical || r.nonFinite) gpuFails.push(`seek:${id}`);
  for (const [id, r] of Object.entries(out.gpu.draw)) {
    if (r.error) gpuFails.push(`draw-error:${id}`);
    // every seed has to put a real amount of the frame on screen
    const dead = r.coverage.filter((c) => c < 0.05);
    if (dead.length) gpuFails.push(`draw-blank:${id} on ${dead.length} of ${r.coverage.length} seeds (${r.coverage.join(',')})`);
  }
  out.summary.gpuFails = gpuFails;
  out.summary.fieldsTotal = Object.keys(out.fields).length;
  out.summary.fieldFails = fieldFails;
  out.summary.simFails = simFails;
  out.summary.ok = out.compileErrors.length === 0 && fieldFails.length === 0 && simFails.length === 0 && gpuFails.length === 0;
  return out;
}

// Runs in the page: the field programs, compiled the way drawField does, so the
// gpu checks can render one without the whole pipeline.
function fieldProgramsFor(gl, SA) {
  const programs = {};
  for (const id of SA.glFields.IDS) {
    const entry = SA.gl.createProgramSafe(gl, SA.glShaders.QUAD_VERT, SA.glFields.fragment(id));
    if (entry) programs[id] = entry;
  }
  return programs;
}

// Runs in the page: read a float target back as bytes.
function readTarget(gl, target) {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  let bytes = null;
  let nonFinite = 0;
  if (status === gl.FRAMEBUFFER_COMPLETE) {
    const px = new Float32Array(4 * target.width * target.height);
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.FLOAT, px);
    bytes = new Uint8Array(px.buffer);
    for (let i = 0; i < px.length; i += 1) if (!Number.isFinite(px[i])) nonFinite += 1;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fb);
  return { status, bytes, nonFinite };
}

function specFor(SA, id, key, seed, time) {
  const p = SA.glSim.genome(id, seed, 1);
  return { id, p, seed, time, opacity: 1, colors: ['#ff4d6d', '#ffd166', '#06d6a0', '#118ab2', '#c77dff'], textBox: null, sim: { key, beats: [0.5, 1.5, 2.5] } };
}

// Runs in the page: the three claims that only a GPU can answer - that a step is a
// pure function, that a scrub lands on the same state as a play, and that the
// field shader draws the state texture it is handed.
function gpuChecks(gl, SA, programs) {
  const out = { determinism: {}, seek: {}, draw: {}, state: {}, timing: {} };

  // 1. the same question twice gives the same bytes
  for (const id of SA.glSim.SIMS) {
    const a = SA.glSim.createRunner(gl, { floatTargets: true });
    const b = SA.glSim.createRunner(gl, { floatTargets: true });
    const sa = specFor(SA, id, 'det:a', 2468, 3);
    const sb = specFor(SA, id, 'det:b', 2468, 3);
    for (const t of [0, 0.5, 1, 2, 3]) {
      sa.time = t;
      sb.time = t;
      a.textureFor(sa);
      b.textureFor(sb);
    }
    const ta = a.textureFor(sa);
    const tb = b.textureFor(sb);
    const ra = readTarget(gl, ta);
    const rb = readTarget(gl, tb);
    let same = ra.bytes && rb.bytes && ra.bytes.length === rb.bytes.length;
    if (same) for (let i = 0; i < ra.bytes.length; i += 1) if (ra.bytes[i] !== rb.bytes[i]) { same = false; break; }
    out.determinism[id] = { identical: !!same, nonFinite: ra.nonFinite + rb.nonFinite };
    a.dispose();
    b.dispose();
  }

  // 2. played through step by step, then asked for cold and forwards: same state
  for (const id of SA.glSim.SIMS) {
    const played = SA.glSim.createRunner(gl, { floatTargets: true });
    const spec = specFor(SA, id, 'seek', 1357, 0);
    for (let at = 0; at <= 300; at += 1) {
      spec.time = at / 30;
      played.textureFor(spec);
    }
    const a = readTarget(gl, played.textureFor(spec));
    played.dispose();

    const scrubbed = SA.glSim.createRunner(gl, { floatTargets: true });
    const spec2 = specFor(SA, id, 'seek', 1357, 0);
    let guard = 0;
    // jump cold to the far end, then come back, then forward again
    spec2.time = 10;
    while (scrubbed.textureFor(spec2).step < 300) guard += 1;
    spec2.time = 1;
    scrubbed.textureFor(spec2);
    spec2.time = 10;
    while (scrubbed.textureFor(spec2).step < 300) guard += 1;
    const b = readTarget(gl, scrubbed.textureFor(spec2));
    scrubbed.dispose();

    let same = a.bytes && b.bytes && a.bytes.length === b.bytes.length;
    if (same) for (let i = 0; i < a.bytes.length; i += 1) if (a.bytes[i] !== b.bytes[i]) { same = false; break; }
    out.seek[id] = { identical: !!same, coldCalls: guard, nonFinite: (a.nonFinite || 0) + (b.nonFinite || 0) };
  }

  // 3. the field shader samples the state texture: draw it the way drawField does,
  //    over several seeds, because a simulation that goes flat on some seeds would
  //    otherwise pass on the one that happened to work
  const W = 320;
  const H = 180;
  const layer = SA.gl.createTarget(gl, W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
  for (const id of SA.glSim.SIMS) {
    const lit = [];
    let worst = 0;
    for (const seed of [3, 17, 8642, 40505]) {
      const runner = SA.glSim.createRunner(gl, { floatTargets: true });
      const spec = specFor(SA, id, `draw:${id}:${seed}`, seed, 0);
      spec.opacity = 0.5;
      spec.textBox = { x0: 0, y0: 0, x1: 0, y1: 0 };
      // Gray-Scott needs a few hundred steps to nucleate, so the figure is judged
      // at ten seconds rather than the moment it is seeded; the catch-up is bounded,
      // so it takes a few calls to get there
      let state = null;
      let guard = 0;
      while (guard < 40) {
        state = runner.textureFor(spec);
        guard += 1;
        if (state && state.step >= 300) break;
      }
      spec.time = 10;
      const program = programs[id];
      while (gl.getError() !== gl.NO_ERROR) { /* drain */ }
      gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program.program);
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, state.texture);
      if (program.uniforms.u_sim) gl.uniform1i(program.uniforms.u_sim, 5);
      const u = SA.glFields.uniformsOf(spec, { width: W, height: H }, (hex) => {
        const n = parseInt(hex.slice(1), 16);
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
      });
      for (const [name, value] of Object.entries(u)) {
        const loc = program.uniforms[name];
        if (loc == null || value == null) continue;
        if (typeof value === 'number') gl.uniform1f(loc, value);
        else if (value.length === 2) gl.uniform2f(loc, value[0], value[1]);
        else if (value.length === 3) gl.uniform3f(loc, value[0], value[1], value[2]);
        else if (value.length === 4) gl.uniform4f(loc, value[0], value[1], value[2], value[3]);
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const err = gl.getError();
      // read the layer back: the field must put something on it
      const px = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let on = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 4) on += 1;
      let dump = null;
      {
        // what the grid actually holds, per channel: a flat state and a display
        // that draws nothing look the same from the coverage number alone
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, state.texture, 0);
        const px = new Float32Array(4 * SA.glSim.RES * SA.glSim.RES);
        gl.readPixels(0, 0, SA.glSim.RES, SA.glSim.RES, gl.RGBA, gl.FLOAT, px);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(fb);
        const stats = [];
        for (let c = 0; c < 4; c += 1) {
          let min = Infinity;
          let max = -Infinity;
          let sum = 0;
          for (let i = c; i < px.length; i += 4) {
            const v = px[i];
            if (v < min) min = v;
            if (v > max) max = v;
            sum += v;
          }
          stats.push([Number(min.toFixed(3)), Number(max.toFixed(3)), Number((sum / (px.length / 4)).toFixed(3))]);
        }
        dump = { kind: spec.p[8], p: spec.p.slice(0, 12).map((v) => Number(v.toFixed(3))), channels: stats };
      }
      lit.push(Number((on / (W * H)).toFixed(3)));
      out.state[id] = out.state[id] || [];
      out.state[id].push({ seed, lit: Number((on / (W * H)).toFixed(3)), ...dump });
      if (err) worst = err;
      gl.disable(gl.BLEND);
      runner.dispose();
    }
    out.draw[id] = { error: worst, coverage: lit };
  }
  SA.gl.deleteTarget(gl, layer);

  // 4. how long a step takes, and how long a full-frame field costs
  const bench = SA.glSim.createRunner(gl, { floatTargets: true });
  const spec = specFor(SA, 'reactionDiffusion', 'bench', 11, 0);
  bench.textureFor(spec);
  for (const id of SA.glSim.SIMS) {
    const sp = specFor(SA, id, `bench:${id}`, 11, 0);
    bench.textureFor(sp);
    const t0 = performance.now();
    const steps = 60;
    for (let i = 1; i <= steps; i += 1) {
      sp.time = i / 30;
      bench.textureFor(sp);
    }
    const ms = (performance.now() - t0) / steps;
    out.timing[id] = Number(ms.toFixed(3));
  }
  bench.dispose();

  const big = SA.gl.createTarget(gl, 1920, 1080, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
  const wide = SA.glSim.createRunner(gl, { floatTargets: true });
  for (const id of SA.glSim.SIMS) {
    const sp = specFor(SA, id, `hd:${id}`, 21, 2);
    const state = wide.textureFor(sp);
    const program = programs[id];
    gl.bindFramebuffer(gl.FRAMEBUFFER, big.framebuffer);
    gl.viewport(0, 0, 1920, 1080);
    gl.useProgram(program.program);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, state.texture);
    if (program.uniforms.u_sim) gl.uniform1i(program.uniforms.u_sim, 5);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
    const t0 = performance.now();
    const frames = 20;
    for (let i = 0; i < frames; i += 1) gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
    out.timing[`${id}-1080p`] = Number(((performance.now() - t0) / frames).toFixed(3));
    gl.disable(gl.BLEND);
  }
  SA.gl.deleteTarget(gl, big);
  wide.dispose();
  return out;
}

// Runs in the page: run the fluid step with a different number of pressure sweeps
// each time, to tell an aliased ping-pong from a sweep that is simply wrong.
function sweepCount(gl, SA) {
  const def = SA.glSim.SIM_DEFS.fluid;
  const original = def.passes;
  const results = {};
  for (const iters of [0, 1, 2, 3, 4, 8]) {
    def.passes = () => original({ u_p1: [0, iters, 0, 0] }, 1).map((p) => ({ ...p }));
    while (gl.getError() !== gl.NO_ERROR) { /* drain */ }
    const runner = SA.glSim.createRunner(gl, { floatTargets: true });
    const p = SA.glSim.genome('fluid', 777, 1);
    const spec = { id: 'fluid', p, seed: 777, time: 0, opacity: 1, colors: ['#fff', '#888', '#444', '#ccc', '#222'], textBox: null, sim: { key: `count:${iters}`, beats: [0.5] } };
    let err = 0;
    for (const at of [0, 1 / 30, 2 / 30, 3 / 30, 10 / 30]) {
      spec.time = at;
      while (gl.getError() !== gl.NO_ERROR) { /* drain */ }
      runner.textureFor(spec);
      const e = gl.getError();
      if (e) { err = e; break; }
    }
    results[iters] = err;
    runner.dispose();
  }
  def.passes = original;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return { errors: results, renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
}

// Runs in the page: run the multi-pass simulations with their pass list cut down
// in stages, so the pass that leaves a GL error behind is named.
function bisectPasses(gl, SA) {
  const results = {};
  const originals = {};
  for (const id of SA.glSim.SIMS) {
    if (!SA.glSim.SIM_DEFS[id].passes) continue;
    originals[id] = SA.glSim.SIM_DEFS[id].passes;
    const full = originals[id]({ u_p1: [0, 8, 0, 0] }, 1);
    // the sweeps sit between the first and the last pass
    const stages = {
      'first-and-last': [full[0], full[full.length - 1]],
      'first-sweep-and-last': [full[0], full[1], full[full.length - 1]],
      full,
    };
    results[id] = {};
    for (const [name, passes] of Object.entries(stages)) {
      SA.glSim.SIM_DEFS[id].passes = () => passes.map((p) => ({ ...p }));
      while (gl.getError() !== gl.NO_ERROR) { /* drain */ }
      const probe = SA.glSim.createRunner(gl, { floatTargets: true });
      const p = SA.glSim.genome(id, 4242, 1);
      const spec = { id, p, seed: 4242, time: 0, opacity: 1, colors: ['#ffffff', '#888888', '#444444', '#cccccc', '#222222'], textBox: null, sim: { key: `bisect:${id}:${name}`, beats: [0.5] } };
      spec.time = 0;
      probe.textureFor(spec);
      spec.time = 1 / 30;
      probe.textureFor(spec);
      spec.time = 2 / 30;
      probe.textureFor(spec);
      const err = gl.getError();
      probe.dispose();
      results[id][name] = err || 0;
    }
    SA.glSim.SIM_DEFS[id].passes = originals[id];
  }
  return results;
}
