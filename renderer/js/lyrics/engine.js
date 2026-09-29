window.SA = window.SA || {};

SA.lyricsEngine = (() => {
  'use strict';

  const CLEAR_COLOR = [0.043, 0.051, 0.070];
  // minimum contrast ratio between backdrop shapes and the lyrics (WCAG large
  // text); below it the two read as the same colour
  const BACKDROP_CONTRAST = 3;

  function beatForCue(cue) {
    if (!cue) return null;
    if (cue.beat) return cue.beat;
    return {
      id: `${cue.id}:single0`,
      cueId: cue.id,
      kind: 'single',
      start: cue.start,
      end: cue.end,
      text: cue.text || '',
      meta: cue.meta || null,
      pinned: false,
    };
  }

  function activeBeats(project, t) {
    const cues = project && project.script ? project.script.cues || [] : [];
    const beats = [];
    for (const cue of cues) {
      if (t < cue.start - 1e-4 || t > cue.end + 1e-4) continue;
      const list = project.beats && project.beats[cue.id];
      if (list && list.length) {
        for (const beat of list) {
          if (t >= beat.start - 1e-4 && t <= beat.end + 1e-4) beats.push(beat);
        }
      } else {
        const beat = beatForCue(cue);
        if (beat) beats.push(beat);
      }
    }
    beats.sort((a, b) => a.start - b.start || a.end - b.end);
    return beats;
  }

  function beatOpacity(beat, t) {
    const duration = Math.max(1e-3, beat.end - beat.start);
    const ramp = Math.min(0.25, duration / 3);
    if (t < beat.start - 1e-4 || t > beat.end + 1e-4) return 0;
    if (ramp <= 0) return 1;
    if (t < beat.start + ramp) return Math.max(0, (t - beat.start) / ramp);
    if (t > beat.end - ramp) return Math.max(0, (beat.end - t) / ramp);
    return 1;
  }

  function createEngine(options) {
    const opts = options || {};
    const canvas = opts.canvas;
    if (!canvas) return null;

    let context;
    try {
      context = SA.gl.createContext(canvas, {
        alpha: opts.alpha !== false,
        antialias: false,
        preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
      });
    } catch {
      return null;
    }
    const gl = context.gl;
    let textPass = null;
    SA.glPasses.clearBatches();
    let pipeline = SA.glPasses.createPipeline(gl, {
      floatTargets: !!context.floatTargets,
      width: opts.width || canvas.width || 1920,
      height: opts.height || canvas.height || 1080,
    });
    if (!pipeline) textPass = SA.glPasses.createTextPass(gl);
    let layerPass = SA.glLayers ? SA.glLayers.create(gl) : null;
    let shapesPass = SA.glShapes ? SA.glShapes.create(gl) : null;

    const state = {
      canvas,
      gl,
      context,
      width: opts.width || canvas.width || 1920,
      height: opts.height || canvas.height || 1080,
      project: null,
      assets: { fonts: [] },
      textTarget: null,
      lost: false,
      disposed: false,
      lastFrame: { cues: [] },
      quality: opts.quality || 'preview',
      evaluationCache: null,
      cardCache: null,
      analysis: null,
      morphSources: null,
      textBoxCache: null,
    };
    canvas.width = state.width;
    canvas.height = state.height;

    function createTargets() {
      if (state.textTarget) SA.gl.deleteTarget(gl, state.textTarget);
      state.textTarget = SA.gl.createTarget(gl, state.width, state.height, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    }

    function resize(width, height) {
      const nextWidth = Math.max(1, Math.round(width));
      const nextHeight = Math.max(1, Math.round(height));
      if (nextWidth === state.width && nextHeight === state.height && canvas.width === nextWidth && canvas.height === nextHeight) return;
      state.width = nextWidth;
      state.height = nextHeight;
      if (canvas.width !== nextWidth) canvas.width = nextWidth;
      if (canvas.height !== nextHeight) canvas.height = nextHeight;
      if (pipeline) pipeline.resize(nextWidth, nextHeight);
      else createTargets();
    }

    function setProject(project) {
      state.project = project || null;
    }

    function setAssets(assets) {
      state.assets = assets || { fonts: [] };
    }

    function activeBeatsLocal(project, t) {
      return activeBeats(project, t);
    }

    function quadForLetter(letter, state) {
      const scaleX = state.scaleX == null ? 1 : state.scaleX;
      const scaleY = state.scaleY == null ? 1 : state.scaleY;
      const x0 = (-letter.local.w / 2) * scaleX;
      const y0 = (-letter.local.h / 2) * scaleY;
      const x1 = (letter.local.w / 2) * scaleX;
      const y1 = (letter.local.h / 2) * scaleY;
      const angle = ((state.rot || 0) * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const corners = [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ];
      const quad = [];
      for (const [x, y] of corners) {
        quad.push(state.x + x * cos - y * sin, state.y + x * sin + y * cos);
      }
      return quad;
    }

    function sceneDirection(project, beat) {
      if (typeof SA.project === 'undefined' || typeof SA.project.resolveStyle !== 'function') return undefined;
      const style = SA.project.resolveStyle(project, `cue:${beat.cueId}/beat:${beat.id}`);
      const layoutType = style && style.layout && style.layout.type;
      return layoutType === 'vertical' ? 'vertical' : undefined;
    }

    function buildBeatScene(project, beat, fonts) {
      // The scene is built in the pixels of the frame being rendered. The
      // preview may run below output resolution (quality: half / quarter), so
      // the scene scale keeps text, motion, overlay and GL coordinates aligned.
      const output = project && project.output ? project.output : null;
      const outputWidth = output && output.width ? output.width : 0;
      const scale = outputWidth > 0 ? state.width / outputWidth : 1;
      return SA.lyricsScene.buildScene(project, beat, fonts, { direction: sceneDirection(project, beat), scale });
    }

    function allBeats(project) {
      const cues = project && project.script ? project.script.cues || [] : [];
      const beats = [];
      for (const cue of cues) {
        const list = project.beats && project.beats[cue.id];
        if (list && list.length) {
          for (const beat of list) beats.push(beat);
        } else {
          const beat = beatForCue(cue);
          if (beat) beats.push(beat);
        }
      }
      beats.sort((a, b) => a.start - b.start);
      return beats;
    }

    function previousBeatOf(project, beat) {
      const beats = allBeats(project);
      let previous = null;
      for (const candidate of beats) {
        if (candidate.id === beat.id) continue;
        if (candidate.start < beat.start - 1e-4 && (!previous || candidate.start > previous.start)) previous = candidate;
      }
      return previous;
    }

    // `animation: echo` shows the same string several times with a fading
    // scale/offset trail (drawn behind the main text).
    function echoPlan(animation, beat, time, width, height) {
      if (!animation || animation.type !== 'echo' || animation.enabled === false) return [];
      const params = animation.params || {};
      const count = Math.max(2, Math.min(6, Math.round(Number(params.count) || 3)));
      const offset = Number(params.offset == null ? 0.06 : params.offset);
      const scale = Number(params.scale == null ? 0.94 : params.scale);
      const baseOpacity = params.opacity == null ? 0.35 : Number(params.opacity);
      const delay = Number(params.delay == null ? 0.1 : params.delay);
      const shortSide = Math.min(width, height);
      const duration = Math.max(0.001, beat.end - beat.start);
      const progress = Math.min(1, Math.max(0, (time - beat.start) / duration));
      const copies = [];
      for (let i = 1; i < count; i += 1) {
        const appear = Math.min(1, Math.max(0, (progress - delay * i * 0.5) / 0.25));
        if (appear <= 0) continue;
        copies.push({
          dx: (offset * i * shortSide * 0.7) / Math.max(1, width),
          dy: (-offset * i * shortSide * 0.7) / Math.max(1, height),
          scale: Math.pow(scale, i),
          opacity: baseOpacity * appear * (1 - (i - 1) / count),
        });
      }
      return copies;
    }

    // --- text clones (style.clones) -----------------------------------------
    // Each clone redraws the text mask with its own offset / scale / rotation,
    // color, opacity and motion, behind the main text.
    function cloneEnvelope(clone, t, beat) {
      const delay = Number(clone.delay) || 0;
      return Math.min(1, Math.max(0, (t - (beat.start + delay)) / 0.25));
    }

    function cloneMotionState(clone, t) {
      const motion = clone.motion || {};
      const type = motion.type || 'none';
      const amount = Number(motion.amount) || 0;
      const speed = Number(motion.speed) || 0.5;
      if (!amount || type === 'none') return { dx: 0, dy: 0, scale: 1, rotate: 0 };
      if (type === 'drift') return { dx: amount * Math.sin(t * speed), dy: amount * 0.6 * Math.cos(t * speed * 0.8), scale: 1, rotate: 0 };
      if (type === 'float') return { dx: 0, dy: amount * Math.sin(t * speed), scale: 1, rotate: 0 };
      if (type === 'pulse') return { dx: 0, dy: 0, scale: 1 + amount * Math.sin(t * speed * 2), rotate: 0 };
      if (type === 'orbit') return { dx: amount * Math.cos(t * speed), dy: amount * Math.sin(t * speed), scale: 1, rotate: 0 };
      if (type === 'spin') return { dx: 0, dy: 0, scale: 1, rotate: amount * 90 * Math.sin(t * speed) };
      return { dx: 0, dy: 0, scale: 1, rotate: 0 };
    }

    function cloneTransform(clone, t, width, height) {
      const motion = cloneMotionState(clone, t);
      const shortSide = Math.min(width, height);
      return {
        dx: ((Number(clone.dx) || 0) + motion.dx) * (shortSide / Math.max(1, width)),
        dy: ((Number(clone.dy) || 0) + motion.dy) * (shortSide / Math.max(1, height)),
        scale: (Number(clone.scale) || 1) * motion.scale,
        rotate: (Number(clone.rotate) || 0) + motion.rotate,
      };
    }

    function cloneColors(colors, clone, style, project) {
      const source = colors || { fill: [1, 1, 1, 1], fill2: [1, 1, 1, 1], stroke: [1, 1, 1, 1] };
      if (clone.color) {
        const resolved = SA.color.resolve(clone.color, {
          palette: (style && style.palette) || null,
          palettes: (project && project.palettes) || [],
        });
        const rgba = resolved && resolved.rgba;
        if (rgba) {
          const array = [rgba.r, rgba.g, rgba.b, rgba.a == null ? 1 : rgba.a];
          return { fill: array, fill2: array, stroke: array, glow: array };
        }
      }
      const hue = Number(clone.hue) || 0;
      if (!hue) return source;
      const shift = (rgba) => {
        if (!rgba) return rgba;
        const hsv = SA.color.rgbToHsv({ r: rgba[0], g: rgba[1], b: rgba[2] });
        const rgb = SA.color.hsvToRgb({ h: hsv.h + hue, s: hsv.s, v: hsv.v });
        return [rgb.r, rgb.g, rgb.b, rgba[3] == null ? 1 : rgba[3]];
      };
      return {
        fill: shift(source.fill),
        fill2: shift(source.fill2),
        stroke: shift(source.stroke),
        glow: shift(source.glow || source.fill),
      };
    }

    // --- repeat group (style.repeat) -------------------------------------------
    // Bounding box of the current letter states in pixels; the repeat layout is
    // expressed relative to its centre.
    function repeatBox(scene, result) {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let i = 0; i < scene.letters.length; i += 1) {
        const letter = scene.letters[i];
        const letterState = result.letters[i];
        if (!letter || !letterState || !letter.local) continue;
        const w = Math.abs(letter.local.w || 0) * Math.abs(letterState.scaleX == null ? 1 : letterState.scaleX);
        const h = Math.abs(letter.local.h || 0) * Math.abs(letterState.scaleY == null ? 1 : letterState.scaleY);
        if (w <= 0 || h <= 0) continue;
        const x = Number(letterState.x) || 0;
        const y = Number(letterState.y) || 0;
        x0 = Math.min(x0, x - w / 2);
        y0 = Math.min(y0, y - h / 2);
        x1 = Math.max(x1, x + w / 2);
        y1 = Math.max(y1, y + h / 2);
      }
      if (!Number.isFinite(x0)) {
        return { w: Math.max(1, state.width * 0.5), h: Math.max(1, state.height * 0.15), cx: state.width / 2, cy: state.height / 2 };
      }
      return { w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    }

    // Converts a repeat copy (offset/scale/rotate about its own centre) into the
    // copy-pass transform, which works around the frame centre.
    function repeatTransform(copy, box, width, height) {
      const centreX = width / 2;
      const centreY = height / 2;
      const scale = copy.scale == null ? 1 : copy.scale;
      const angle = ((copy.rotate || 0) * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const targetX = box.cx + (copy.dx || 0) - centreX;
      const targetY = box.cy + (copy.dy || 0) - centreY;
      const rx = (cos * targetX + sin * targetY) / scale;
      const ry = (-sin * targetX + cos * targetY) / scale;
      return {
        dx: (box.cx - centreX - rx) / width,
        dy: (box.cy - centreY - ry) / height,
        scale,
        rotate: copy.rotate || 0,
      };
    }

    // Per-copy colour: palette slot, hue shift, light amount and gradient
    // inversion, resolved through the same colour helpers the clones use.
    function shiftHue(rgba, hue) {
      if (!rgba) return rgba;
      const hsv = SA.color.rgbToHsv({ r: rgba[0], g: rgba[1], b: rgba[2] });
      const rgb = SA.color.hsvToRgb({ h: hsv.h + hue, s: hsv.s, v: hsv.v });
      return [rgb.r, rgb.g, rgb.b, rgba[3] == null ? 1 : rgba[3]];
    }

    function darken(rgba, amount) {
      if (!rgba || !amount) return rgba;
      const hsv = SA.color.rgbToHsv({ r: rgba[0], g: rgba[1], b: rgba[2] });
      const rgb = SA.color.hsvToRgb({ h: hsv.h, s: Math.min(1, hsv.s + amount * 0.2), v: hsv.v * (1 - amount * 0.85) });
      return [rgb.r, rgb.g, rgb.b, rgba[3] == null ? 1 : rgba[3]];
    }

    function repeatCopyColors(colors, copy, style, project) {
      const palette =
        (style.palette && style.palette.colors) ||
        (project.palettes && project.palettes[0] && project.palettes[0].colors) ||
        null;
      let next = colors;
      if (copy.colorIndex != null && copy.colorIndex >= 0 && Array.isArray(palette) && palette.length) {
        const a = SA.color.parse(palette[copy.colorIndex % palette.length]);
        const b = SA.color.parse(palette[(copy.colorIndex + 1) % palette.length]);
        const arrayA = [a.r, a.g, a.b, a.a == null ? 1 : a.a];
        const arrayB = [b.r, b.g, b.b, b.a == null ? 1 : b.a];
        next = { fill: arrayA, fill2: arrayB, stroke: arrayA, glow: arrayA };
      }
      const hue = (copy.hueShift || 0) + (copy.accentColor ? 180 : 0);
      const light = copy.lightAmount || 0;
      if (hue || light) {
        const map = (rgba) => darken(shiftHue(rgba, hue), light);
        next = { fill: map(next.fill), fill2: map(next.fill2), stroke: map(next.stroke), glow: map(next.glow || next.fill) };
      }
      if (copy.gradientInvert) next = { ...next, fill: next.fill2, fill2: next.fill };
      return next;
    }

    function hollowColors(colors) {
      const clear = (rgba) => (rgba ? [rgba[0], rgba[1], rgba[2], 0] : rgba);
      return { ...colors, fill: clear(colors.fill), fill2: clear(colors.fill2) };
    }

    const DECOR_EDGE = { hollow: 'outline', glow: 'neonGlow', shadow: 'dropShadow' };

    function drawDecor(colors, decor, t, sdfTarget, style) {
      const type = DECOR_EDGE[decor];
      if (!type) return;
      const activeStyle = style || (state.project && state.project.style) || {};
      const uniforms = SA.fx.edgeUniforms(
        { type, params: {} },
        {
          colorSet: colors,
          maxDistance: Math.max(state.width, state.height) * 0.1,
          width: state.width,
          height: state.height,
          time: t,
          palette: activeStyle.palette || null,
          palettes: state.project ? state.project.palettes || [] : [],
          sdfTexture: sdfTarget ? sdfTarget.texture : null,
        }
      );
      pipeline.edge(uniforms);
    }

    // with a font set active only the set's typefaces take part in variation
    function fontClassOf(entry) {
      if (!entry) return null;
      if (SA.lyricsFont && typeof SA.lyricsFont.fontClassOf === 'function') return SA.lyricsFont.fontClassOf(entry);
      return entry.fontClass || null;
    }

    function variantFontFor(cls, text, fonts) {
      const cjk = /[\u3000-\u9fff\uff00-\uffef]/.test(text || '');
      const candidates = (fonts || []).filter((entry) => entry && entry.font && fontClassOf(entry) === cls);
      // Japanese text never falls back to latin-only typefaces
      const pool = cjk ? candidates.filter((entry) => entry.cjk !== false) : candidates;
      return pool[0] || candidates[0] || null;
    }

    function drawRepeatCopies(active, t, project, colorSet, fillInstance, category, progress, beats, variant, colorOverride) {
      if (!SA.repeat || !pipeline) return;
      const { beat, scene, result, style } = active;
      const instance = SA.fx.withDefaults(style.repeat, 'repeat');
      if (!instance || !instance.type || instance.type === 'none' || instance.enabled === false) return;
      const fonts = state.assets.fonts || [];
      const box = repeatBox(scene, result);
      const mainFontId = scene.letters.length ? scene.letters[0].fontId : (style.text && style.text.fontId) || null;
      const mainFont = mainFontId ? fonts.find((entry) => entry.id === mainFontId) : null;
      const fontClasses = [...new Set(fonts.map((entry) => fontClassOf(entry)).filter(Boolean))];
      const dims = {
        width: state.width,
        height: state.height,
        aspect: state.width / Math.max(1, state.height),
        box,
        safeArea: { left: state.width * 0.02, top: state.height * 0.02, right: state.width * 0.02, bottom: state.height * 0.02 },
        mainFontClass: fontClassOf(mainFont),
        fontClasses,
      };
      const seed = (project && project.styleMode && project.styleMode.seed) || 12345;
      const random = SA.rng.rngFor(seed, beat.id, 'repeat', instance.params.seedShift || 0);
      let copies = SA.repeat.plan(instance, beat, t, dims, random);
      // preview cost budget: degrade preview only, never the export
      const budget = 24;
      const cost = SA.fx.costOf(style);
      const preview = state.quality === 'preview' && cost > budget;
      const degrade = !preview ? 0 : cost > budget * 1.7 ? 3 : cost > budget * 1.3 ? 2 : 1;
      if (degrade >= 1 && instance.params.copies === 'many') {
        copies = copies.filter((copy, index) => copy.isMain || index % 2 === 0);
      }
      if (degrade >= 2) for (const copy of copies) copy.fontClass = null;
      if (degrade >= 3) for (const copy of copies) copy.decor = 'solid';

      const drawCopy = (copy, sdf) => {
        if (copy.isMain || copy.envelope <= 0.001 || copy.opacity <= 0.001) return;
        const transform = repeatTransform(copy, box, state.width, state.height);
        const decor = copy.decor || 'solid';
        const copyColors = repeatCopyColors(colorSet.arrays, copy, style, project);
        pipeline.beginLayer();
        pipeline.fill(
          SA.fx.fillUniforms(fillInstance, {
            colors: decor === 'hollow' ? hollowColors(copyColors) : copyColors,
            category,
            time: t,
            palette: style.palette || null,
            palettes: project.palettes || [],
            categoryColors: project.categoryColors || {},
            progress,
            sdfTexture: sdf ? sdf.texture : null,
          })
        );
        if (decor !== 'solid') drawDecor(copyColors, decor, t, sdf, style);
        pipeline.commitLayer(copy.opacity * copy.envelope, transform);
      };

      const byFont = new Map();
      const plain = [];
      for (const copy of copies) {
        if (copy.isMain) continue;
        if (copy.fontClass) {
          if (!byFont.has(copy.fontClass)) byFont.set(copy.fontClass, []);
          byFont.get(copy.fontClass).push(copy);
        } else {
          plain.push(copy);
        }
      }
      let mainSdf = null;
      // variant typefaces first: each renders its own mask (and sdf), then the
      // main mask is restored for the remaining copies
      for (const [cls, list] of byFont) {
        const entry = variantFontFor(cls, scene.text, fonts);
        const variantScene = entry ? buildBeatScene(project, beat, [entry]) : null;
        const variantResult = variantScene && variantScene.letters.length ? evaluateBeatState(project, beat, variantScene, t, beats) : null;
        if (!variantResult || !variantResult.letters.length) {
          plain.push(...list);
          continue;
        }
        pipeline.text(variantScene, variantResult.letters, variant);
        pipeline.letterBlur(variantScene, variantResult.letters);
        const variantSdf = pipeline.sdf();
        for (const copy of list) drawCopy(copy, variantSdf);
      }
      if (byFont.size) {
        pipeline.text(scene, result.letters, variant, colorOverride);
        pipeline.letterBlur(scene, result.letters);
        mainSdf = pipeline.sdf();
      }
      for (let index = plain.length - 1; index >= 0; index -= 1) {
        const copy = plain[index];
        if (copy.decor && copy.decor !== 'solid' && !mainSdf) mainSdf = pipeline.sdf();
        drawCopy(copy, mainSdf);
      }
    }

    function needsPrevious(scene) {
      const style = (scene && scene.style) || {};
      const from = style.layout && style.layout.params && style.layout.params.from;
      const enterType = style.enter && style.enter.type;
      return from === 'previousCue' || enterType === 'morphFromPrevious';
    }

    function badgeRectFor(project, beat, aspect) {
      const badgeId = beat.meta && beat.meta.badgeId;
      if (!badgeId || !project.dataset) return null;
      try {
        const cache = state.evaluationCache;
        if (!cache || cache.dataset !== project.dataset || cache.aspect !== aspect) {
          const evaluation = SA.achievements.evaluate(project.dataset);
          state.evaluationCache = { dataset: project.dataset, aspect, layout: SA.card.layout(aspect, evaluation.badges) };
        }
        return state.evaluationCache.layout.badgeRects[badgeId] || null;
      } catch {
        return null;
      }
    }

    // The strongest camera in the resolved post stack, in the frame guard's
    // vocabulary: { zoom, ox, oy }. Progress-independent worst case.
    function cameraWorstCase(style) {
      const list = (style && style.post) || [];
      if (!SA.camera || typeof SA.camera.maxExtent !== 'function') return null;
      let worst = null;
      for (const instance of list) {
        if (!instance || instance.enabled === false || instance.type !== 'camera') continue;
        const extent = SA.camera.maxExtent(instance.params || {});
        if (!extent) continue;
        if (!worst) worst = { zoom: extent.zoom, ox: Math.abs(extent.ox), oy: Math.abs(extent.oy) };
        else {
          worst.zoom = Math.max(worst.zoom, extent.zoom);
          worst.ox = Math.max(worst.ox, Math.abs(extent.ox));
          worst.oy = Math.max(worst.oy, Math.abs(extent.oy));
        }
      }
      return worst;
    }

    function evaluateBeatState(project, beat, scene, t, activeList) {
      const seed = (project.styleMode && project.styleMode.seed) || 12345;
      const frameSize = { width: state.width, height: state.height };
      const later = activeList.filter((entry) => entry.start > beat.start + 1e-4 && t <= entry.end + 1e-4).length;
      const stackOffset = later * (scene.size * ((scene.style.text && scene.style.text.lineHeight) || 1.2));
      const ctx = {
        project,
        beat,
        frame: frameSize,
        seed,
        stackOffset,
        badgeRect: badgeRectFor(project, beat, project.output ? project.output.aspect : '16:9'),
        previousPositions: null,
        analysis: state.analysis,
        audioFeatures: state.analysis && SA.audioAnalysis ? SA.audioAnalysis.features(state.analysis) : null,
      };
      // A camera post changes what part of the frame is visible: the CPU side
      // uses its worst case so the frame guard can keep the lyrics on screen.
      const camera = cameraWorstCase(scene.style);
      if (camera) ctx.camera = camera;
      if (needsPrevious(scene)) {
        const previous = previousBeatOf(project, beat);
        if (previous) {
          const previousScene = buildBeatScene(project, previous, state.assets.fonts || []);
          if (previousScene && previousScene.letters.length) {
            const previousResult = SA.motion.evaluateBeat(previousScene, previous.end - 1e-4, {
              ...ctx,
              beat: previous,
              previousPositions: null,
              stackOffset: 0,
            });
            ctx.previousPositions = previousResult.letters.map((entry) => ({ x: entry.x, y: entry.y, rot: entry.rot, scale: entry.scaleX }));
          }
        }
      }
      return SA.motion.evaluateBeat(scene, t, ctx);
    }

    function evaluationFor(project) {
      if (!project || !project.dataset || typeof SA.achievements === 'undefined') return null;
      if (state.evaluationCache && state.evaluationCache.dataset === project.dataset && state.evaluationCache.evaluation) {
        return state.evaluationCache.evaluation;
      }
      const evaluation = SA.achievements.evaluate(project.dataset);
      state.evaluationCache = { ...(state.evaluationCache || {}), dataset: project.dataset, evaluation };
      return evaluation;
    }

    function cardTargetFor(project) {
      if (!pipeline || !project.dataset || typeof OffscreenCanvas === 'undefined' || typeof SA.card === 'undefined' || !SA.card.draw) return null;
      const aspect = project.output ? project.output.aspect : '16:9';
      const lang = project.meta ? project.meta.lang : 'en';
      const key = `${aspect}|${lang}|${project.meta ? project.meta.updatedAt : ''}`;
      if (state.cardCache && state.cardCache.key === key) return state.cardCache.target;
      try {
        const width = aspect === '9:16' ? 1080 : 1920;
        const height = aspect === '9:16' ? 1920 : 1080;
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        SA.card.draw(ctx, {
          dataset: project.dataset,
          evaluation: evaluationFor(project),
          aspect,
          theme: SA.card.theme(project),
          images: {},
          lang,
          generatedAt: new Date().toISOString(),
        });
        const target = pipeline.uploadCard(canvas);
        state.cardCache = { key, target };
        return target;
      } catch {
        return null;
      }
    }

    function morphVariantFor(project, beat, scene) {
      const style = scene.style || {};
      const enterType = style.enter && style.enter.type;
      if (enterType !== 'morphFromPrevious') return null;
      const previous = previousBeatOf(project, beat);
      if (!previous) return null;
      const key = `morph:${previous.id}`;
      if (state.morphSources && state.morphSources.key === key) return { key, sources: state.morphSources.sources };
      const previousScene = buildBeatScene(project, previous, state.assets.fonts || []);
      if (!previousScene) return null;
      const sources = scene.letters.map((letter, index) => {
        const sourceLetter = previousScene.letters[index % Math.max(1, previousScene.letters.length)];
        if (!sourceLetter) return null;
        return SA.lyricsScene.samplesOf(sourceLetter, 48).interior;
      });
      state.morphSources = { key, sources };
      return { key, sources };
    }

    function setAudio(analysis) {
      state.analysis = analysis || null;
    }

    // --- fillers and credits ---------------------------------------------------

    function naturalDuration() {
      if (SA.duration && SA.duration.computeDuration) return SA.duration.computeDuration(state.project);
      const cues = (state.project && state.project.script && state.project.script.cues) || [];
      let max = 0;
      for (const cue of cues) max = Math.max(max, cue.end);
      return max;
    }

    function activeCredit(t) {
      if (!SA.credits || !state.project) return null;
      const elements = SA.credits.elements(state.project);
      for (const element of elements) {
        if (t >= element.start - 1e-6 && t <= element.end + 1e-6) return element;
      }
      return null;
    }

    function creditStyleFor(mode, fallbackSize) {
      const settings = SA.credits ? SA.credits.settingsFor(state.project) : {};
      const style = (settings.styles && settings.styles[mode]) || {};
      const size = (style.text && style.text.size) || state.height * fallbackSize;
      let color = '#eef2ff';
      const fill = style.color && style.color.fill;
      if (typeof fill === 'string') color = fill;
      else if (fill && typeof fill === 'object') color = fill.value || (fill.colors && fill.colors[0]) || color;
      return { size, color };
    }

    function centeredTexts(lines, options) {
      const opts = options || {};
      const size = opts.size || state.height * 0.06;
      const lineHeight = size * (opts.lineHeight || 1.3);
      const texts = [];
      const total = lines.length;
      for (let i = 0; i < total; i += 1) {
        if (!lines[i]) continue;
        texts.push({
          text: lines[i],
          x: opts.x == null ? state.width / 2 : opts.x,
          y: opts.y == null ? state.height / 2 : opts.y + (i - (total - 1) / 2) * lineHeight,
          size,
          color: opts.color || '#eef2ff',
          opacity: opts.opacity == null ? 1 : opts.opacity,
        });
      }
      return texts;
    }

    function creditElementTexts(element) {
      const style = creditStyleFor(element.mode, element.mode === 'end' ? 0.075 : 0.06);
      const lines = element.lines && element.lines.length ? element.lines : String(element.text || '').split(/\r?\n/);
      return centeredTexts(lines, { size: style.size, color: style.color, y: state.height * (element.mode === 'end' ? 0.5 : 0.42) });
    }

    function alwaysOnTexts(entry) {
      const position = entry.position || 'topRight';
      const style = creditStyleFor('always', 0.035);
      const size = style.size;
      const x = position === 'topLeft' || position === 'bottomLeft' || position === 'lowerThird' ? state.width * 0.08 : state.width * (entry.x != null && position === 'custom' ? entry.x : 0.92);
      const y = position === 'bottomLeft' || position === 'bottomRight' ? state.height * 0.94 : position === 'lowerThird' ? state.height * 0.8 : state.height * (entry.y != null && position === 'custom' ? entry.y : 0.07);
      const align = position === 'topLeft' || position === 'bottomLeft' || position === 'lowerThird' ? 'left' : 'right';
      const lines = entry.lines && entry.lines.length ? entry.lines : String(entry.text || '').split(/\r?\n/);
      const texts = [];
      const lineHeight = size * 1.25;
      for (let i = 0; i < lines.length; i += 1) {
        if (!lines[i]) continue;
        texts.push({
          text: lines[i],
          x,
          y: y + i * lineHeight,
          size,
          color: style.color,
          opacity: entry.opacity == null ? 0.85 : entry.opacity,
          align,
        });
      }
      return texts;
    }

    function drawPrimitives(shapes) {
      if (!shapesPass || !shapes || !shapes.length) return;
      shapesPass.begin(state.width, state.height);
      for (const shape of shapes) {
        if (!shape) continue;
        if (shape.kind === 'rect') shapesPass.rect(shape);
        else if (shape.kind === 'circle') {
          // shape-ops expands a ring into a circle with a ring thickness
          if ((shape.ring || 0) > 0) shapesPass.ring({ ...shape, r: shape.radius, thickness: shape.ring });
          else shapesPass.circle(shape);
        } else if (shape.kind === 'ring') shapesPass.ring(shape);
        else if (shape.kind === 'capsule') shapesPass.capsule(shape);
        else if (shape.kind === 'polygon') shapesPass.polygon(shape);
        else if (shape.kind === 'convex' && shapesPass.convex) shapesPass.convex(shape);
      }
    }

    function drawTexts(texts) {
      if (!shapesPass || !texts || !texts.length) return;
      shapesPass.begin(state.width, state.height);
      for (const text of texts) {
        if (!text || !text.text) continue;
        shapesPass.text(text);
      }
    }

    // Resolves the text color of the current beat so the background shapes can
    // pick a contrasting color.
    function textColorHex(style) {
      const value = style && style.color ? style.color.fill || style.color.stroke : null;
      if (!value) return null;
      const resolved = SA.color.resolve(value, {
        palette: (style && style.palette) || null,
        palettes: (state.project && state.project.palettes) || [],
        categoryColors: (state.project && state.project.categoryColors) || {},
      });
      const rgba = resolved && resolved.rgba;
      return rgba ? SA.color.toHex({ r: rgba.r, g: rgba.g, b: rgba.b, a: 1 }) : null;
    }

    function projectPalette() {
      if (!state.project) return null;
      const style = SA.project.resolveStyle(state.project, '');
      return style && style.palette ? style.palette : null;
    }

    // Animated shapes for backdrop / filler clips. Returns the whole colour
    // list the clip may cycle through (the first entry is the primary one).
    function clipShapeColor(spec, colors, style) {
      const params = (spec && spec.params) || {};
      const list = Array.isArray(colors) && colors.length ? colors : [];
      const palette = style && style.palette && Array.isArray(style.palette.colors) ? style.palette.colors : list;
      let fills = list.length ? list.slice() : [];
      if (params.color) {
        const rgba = SA.color.toRgba(params.color, null, {
          palette: style ? style.palette : null,
          palettes: (state.project && state.project.palettes) || [],
        });
        if (rgba) fills = [SA.color.toHex({ r: rgba[0], g: rgba[1], b: rgba[2], a: 1 })];
      } else if (!fills.length) {
        // derive the shape colour from the text colour: complementary hue and
        // much lower brightness, so background shapes never match the lyrics
        let fill = palette[3] || palette[2] || '#eef2ff';
        const textHex = textColorHex(style);
        if (textHex) {
          const hsv = SA.color.rgbToHsv(SA.color.parse(textHex));
          const contrast = {
            h: hsv.h + 150,
            s: Math.max(0.2, Math.min(0.7, hsv.s * 0.85)),
            v: Math.max(0.16, Math.min(0.5, hsv.v * 0.5)),
            a: 1,
          };
          fill = SA.color.toHex({ ...SA.color.hsvToRgb(contrast), a: 1 });
        }
        fills = [fill];
      }
      // guarantee a minimum contrast between the shapes and every colour the
      // lyrics are drawn in (all gradient stops, not only the first: the usual
      // text gradient ends on the accent, which is the backdrop's own colour)
      const textColors = textColorList(style);
      if (textColors.length) fills = fills.map((fill) => SA.color.separateFrom(fill, textColors, BACKDROP_CONTRAST));
      return fills.length ? fills : ['#eef2ff'];
    }

    function textColorList(style) {
      const set = (style && style.color) || {};
      const context = {
        palette: (style && style.palette) || null,
        palettes: (state.project && state.project.palettes) || [],
        categoryColors: (state.project && state.project.categoryColors) || {},
      };
      const out = [];
      for (const value of [set.fill || set.stroke, set.fill2]) {
        if (!value) continue;
        const resolved = SA.color.resolve(value, context);
        if (resolved && resolved.kind === 'gradient' && Array.isArray(resolved.stops)) {
          for (const stop of resolved.stops) if (stop && stop.rgba) out.push(stop.rgba);
        } else if (resolved && resolved.rgba) {
          out.push(resolved.rgba);
        }
      }
      // a fill effect can paint the letters in colours of its own
      const fillParams = (style && style.fill && style.fill.enabled !== false && style.fill.params) || {};
      for (const key of ['colorA', 'colorB', 'tint', 'colorBefore', 'colorAfter']) {
        if (typeof fillParams[key] === 'string' && fillParams[key].startsWith('#')) out.push(SA.color.parse(fillParams[key]));
      }
      return out;
    }

    function clipEnvelope(t, clip) {
      if (!clip || t < clip.start - 1e-4 || t > clip.end + 1e-4) return 0;
      const fadeIn = Math.max(0, Number(clip.fadeIn) || 0);
      const fadeOut = Math.max(0, Number(clip.fadeOut) || 0);
      return Math.max(0, Math.min(1, fadeIn > 1e-4 ? (t - clip.start) / fadeIn : 1, fadeOut > 1e-4 ? (clip.end - t) / fadeOut : 1));
    }

    function activeClips(project, kind) {
      const ids = new Set(
        ((project.tracks || [])).filter((track) => track && track.kind === kind && !track.hidden).map((track) => track.id)
      );
      if (!ids.size) return [];
      return ((project.clips || [])).filter((clip) => clip && ids.has(clip.trackId)).sort((a, b) => a.start - b.start);
    }

    function drawShapeClip(clip, t, duration) {
      if (!pipeline) return;
      const spec = clip.spec || { type: 'none', params: {} };
      const envelope = clipEnvelope(t, clip);
      if (envelope <= 0) return;
      // the lyrics on screen decide the palette and the text colours the shapes
      // must stand apart from (a cue or beat can carry a palette of its own)
      const onScreen = activeBeats(state.project, t)[0];
      const style = SA.project.resolveStyle(state.project, onScreen ? `cue:${onScreen.cueId}/beat:${onScreen.id}` : '');
      const fills = clipShapeColor(spec, clip.colors, style);
      const fill = fills[0];
      const clipDuration = Math.max(0.001, clip.end - clip.start);
      const progress = Math.min(1, Math.max(0, (t - clip.start) / clipDuration));
      // the shape group's own opacity folds into the layer opacity so the two
      // sliders never multiply the same value twice
      const { opacity: innerOpacity, ...restParams } = spec.params || {};
      const layerOpacity = Math.max(0, Math.min(1, (clip.opacity == null ? 1 : clip.opacity) * (innerOpacity == null ? 1 : innerOpacity) * envelope));
      // a user-placed shape layer (shape-ops): expanded against the current
      // text box and drawn with the shape pass behind / over the lyrics
      if (spec.type === 'shapeLayer') {
        if (!SA.shapeOps || !shapesPass || !SA.fx) return;
        const resolved = SA.fx.withDefaults({ type: 'shapeLayer', params: restParams }, 'background');
        if (!resolved || !SA.shapeOps.SHAPES.includes(resolved.params.shape)) return;
        const params = { ...resolved.params, color: fill };
        const boxes = params.followText === 'line' || params.followText === 'block' ? textBoxesForClip(t) : null;
        // the drive follows the text on screen (each cue draws its own shape);
        // without a beat it falls back to the clip's own progress
        const beatSpan = onScreen ? Math.max(0.001, onScreen.end - onScreen.start) : 0;
        const driveProgress = onScreen ? Math.min(1, Math.max(0, (t - onScreen.start) / beatSpan)) : progress;
        const features = state.analysis && SA.audioAnalysis ? SA.audioAnalysis.features(state.analysis) : null;
        const primitives = SA.shapeOps.expand(params, {
          box: boxes ? boxes.box : null,
          boxes: boxes ? boxes.lines : null,
          frame: { width: state.width, height: state.height },
          progress: driveProgress,
          time: t,
          bpm: features && Number(features.bpm) > 0 ? Number(features.bpm) : 0,
        });
        if (!primitives.length) return;
        pipeline.beginLayer();
        drawPrimitives(primitives);
        pipeline.commitLayer(layerOpacity);
        return;
      }
      if (!shapesPass || !SA.fillerRender) return;
      const features = state.analysis && SA.audioAnalysis ? SA.audioAnalysis.features(state.analysis) : null;
      // multi-colour clips carry their palette; nested parts of a combo without
      // a colour of their own inherit the primary one
      const params = { ...restParams, color: fill, colors: fills };
      if (spec.type === 'combo' && Array.isArray(params.list)) {
        params.list = params.list.map((part) => (part && part.params && part.params.color ? part : { ...part, params: { ...(part && part.params), color: fill } }));
      }
      const list = SA.fillerRender.drawList({ type: spec.type, params }, {
        time: t,
        frame: { width: state.width, height: state.height },
        clip: { key: clip.id, from: clip.start, to: clip.end, spec },
        duration,
        nextStart: null,
        nextText: '',
        prevText: '',
        analysis: state.analysis,
        progress,
        bpm: features && Number(features.bpm) > 0 ? Number(features.bpm) : 0,
        seed: (state.project && state.project.styleMode && state.project.styleMode.seed) || 12345,
        color: fill,
        colors: fills,
      });
      if (!list || (!(list.shapes && list.shapes.length) && !(list.texts && list.texts.length))) return;
      // beat pulse, drift and the enter / exit transition (wipe / scale /
      // rotate / iris) ride on top of the clip's own animation
      if (params.animate) {
        SA.fillerRender.animate(list, {
          motion: params.animate,
          t,
          clip: { start: clip.start, end: clip.end },
          bpm: features && Number(features.bpm) > 0 ? Number(features.bpm) : 0,
          frame: { width: state.width, height: state.height },
        });
      }
      pipeline.beginLayer();
      drawPrimitives(list.shapes || []);
      drawTexts(list.texts || []);
      pipeline.commitLayer(layerOpacity);
    }

    // A figure clip: animated motifs built from the shape primitives, drawn on
    // the figure track between the mid layer and the subtitles.
    function drawFigureClip(clip, t, duration) {
      if (!shapesPass || !SA.figures) return;
      const spec = clip.spec || {};
      if (spec.type !== 'figure') return;
      const envelope = clipEnvelope(t, clip);
      if (envelope <= 0) return;
      const params = spec.params || {};
      const features = state.analysis && SA.audioAnalysis ? SA.audioAnalysis.features(state.analysis) : null;
      const onScreen = activeBeats(state.project, t);
      const style = SA.project.resolveStyle(state.project, onScreen.length ? `cue:${onScreen[0].cueId}/beat:${onScreen[0].id}` : '');
      const boxes = textBoxesForClip(t);
      const list = SA.figures.drawList({ type: 'figure', params }, {
        time: t,
        frame: { width: state.width, height: state.height },
        clip: { key: clip.id, start: clip.start, end: clip.end, spec },
        beats: activeBeats(state.project, t).map((beat) => ({ start: beat.start, end: beat.end })),
        cuts: Array.isArray(params.cuts) ? params.cuts : null,
        seed: (state.project && state.project.styleMode && state.project.styleMode.seed) || 12345,
        textBox: boxes ? boxes.box : null,
        colors: clipShapeColor(spec, clip.colors, style),
        color: '#c86bff',
        bpm: features && Number(features.bpm) > 0 ? Number(features.bpm) : 0,
      });
      if (!list || !(list.shapes || []).length) return;
      pipeline.beginLayer();
      drawPrimitives(list.shapes);
      if ((list.texts || []).length) drawTexts(list.texts);
      pipeline.commitLayer(Math.max(0, Math.min(1, (clip.opacity == null ? 1 : clip.opacity) * envelope)));
    }

    // A text-animation clip: its own text on its own track, evaluated like a
    // lyric beat (entrance / hold / exit from the clip's style).
    function drawTextClip(clip, t) {
      if (!pipeline || !SA.lyricsScene || !SA.motion) return;
      const spec = clip.spec || {};
      if (spec.type !== 'textAnim') return;
      const envelope = clipEnvelope(t, clip);
      if (envelope <= 0) return;
      const params = spec.params || {};
      const text = String(params.text || '');
      if (!text.trim()) return;
      const beat = {
        id: `clip_${clip.id}:single0`,
        cueId: `clip_${clip.id}`,
        kind: 'single',
        start: clip.start,
        end: clip.end,
        text,
        lines: text.split(/\r?\n/).filter((line) => line.length),
      };
      const clipProject = {
        ...state.project,
        style: SA.project.mergeDeep(state.project.style || {}, params.style || {}),
        cueStyles: {},
        beatStyles: {},
        beatKindStyle: {},
        overrides: {},
      };
      const scene = buildBeatScene(clipProject, beat, state.assets.fonts || []);
      if (!scene || !scene.letters.length) return;
      const features = state.analysis && SA.audioAnalysis ? SA.audioAnalysis.features(state.analysis) : null;
      const result = SA.motion.evaluateBeat(scene, t, {
        project: clipProject,
        beat,
        frame: { width: state.width, height: state.height },
        seed: (state.project && state.project.styleMode && state.project.styleMode.seed) || 12345,
        analysis: state.analysis,
        audioFeatures: features,
        camera: cameraWorstCase(scene.style),
        stackOffset: 0,
      });
      if (!result || !result.active || !result.letters.length) return;
      pipeline.beginLayer();
      pipeline.text(scene, result.letters, null, null);
      const colorSet = SA.fx.resolveColorSet
        ? SA.fx.resolveColorSet(scene.style.color, {
            palettes: state.project.palettes || [],
            palette: scene.style.palette || null,
            categoryColors: state.project.categoryColors || {},
            time: t,
            defaultFill: '#eef2ff',
          })
        : { arrays: { fill: [0.93, 0.95, 1, 1], fill2: [0.93, 0.95, 1, 1], stroke: [1, 1, 1, 1] } };
      const fillInstance = SA.fx.withDefaults(scene.style.fill, 'fill');
      pipeline.fill(
        SA.fx.fillUniforms(fillInstance, {
          colors: colorSet.arrays,
          time: t,
          progress: Math.min(1, Math.max(0, (t - clip.start) / Math.max(0.001, clip.end - clip.start))),
          palettes: state.project.palettes || [],
          palette: scene.style.palette || null,
          categoryColors: state.project.categoryColors || {},
        })
      );
      pipeline.commitLayer(Math.max(0, Math.min(1, (clip.opacity == null ? 1 : clip.opacity) * envelope)));
    }

    function drawBackgroundClip(clip, t, card) {
      if (!pipeline) return;
      const spec = clip.spec || {};
      if (!spec.type || spec.type === 'none') return;
      const style = SA.project.resolveStyle(state.project, '');
      const palette = style && style.palette ? style.palette : projectPalette();
      const colors = Array.isArray(clip.colors) && clip.colors.length ? clip.colors : null;
      if (spec.type === 'shapes' || spec.type === 'pattern' || spec.type === 'shapeLayer') {
        drawShapeClip(clip, t, naturalDuration());
        return;
      }
      const envelope = clipEnvelope(t, clip);
      if (envelope <= 0) return;
      const theme = SA.card && SA.card.theme ? SA.card.theme(state.project) : null;
      const params = { ...(spec.params || {}) };
      if (spec.type === 'solid' && colors && !params.color) params.color = colors[0];
      pipeline.drawBackground(
        SA.fx.backgroundUniforms({ type: spec.type, params }, {
          theme,
          cardTheme: theme,
          focusX: 0,
          focusY: 0,
          palette: colors ? { colors } : palette,
          time: t,
        }),
        card,
        Math.max(0, Math.min(1, (clip.opacity == null ? 1 : clip.opacity) * envelope))
      );
    }

    function fillerClipContext(t, clip, duration) {
      const project = state.project;
      const clipDuration = Math.max(1e-3, clip.end - clip.start);
      const cues = (project.script && project.script.cues) || [];
      const next = cues.find((entry) => entry.start >= clip.end - 1e-4);
      const previous = [...cues].reverse().find((entry) => entry.end <= clip.start + 1e-4);
      return {
        time: t,
        frame: { width: state.width, height: state.height },
        clip: { key: clip.id, from: clip.start, to: clip.end, spec: clip.spec },
        duration,
        nextStart: next ? next.start : null,
        nextText: next ? next.text : '',
        prevText: previous ? previous.text : '',
        analysis: state.analysis,
        progress: Math.min(1, Math.max(0, (t - clip.start) / clipDuration)),
        seed: (project.styleMode && project.styleMode.seed) || 12345,
        color: '#eef2ff',
      };
    }

    // Filler clips live on their own track and are drawn whenever they are
    // active, whether or not a lyric beat is on screen.
    function renderFillerClips(t, duration) {
      const project = state.project;
      for (const clip of activeClips(project, 'filler')) {
        const envelope = clipEnvelope(t, clip);
        if (envelope <= 0) continue;
        const spec = clip.spec || { type: 'none', params: {} };
        if (spec.type === 'credits') {
          if (!activeCredit(t) && SA.credits) {
            const settings = SA.credits.settingsFor(project);
            const lines = SA.credits.expandTemplate(project, settings, {});
            const style = creditStyleFor('element', 0.06);
            pipeline.beginLayer();
            drawTexts(centeredTexts(lines, { size: style.size, color: style.color, opacity: envelope }));
            pipeline.commitLayer(1);
          }
          continue;
        }
        if (!SA.fillerRender) continue;
        const list = SA.fillerRender.drawList(spec, fillerClipContext(t, clip, duration));
        if (!list || (!(list.shapes || []).length && !(list.texts || []).length)) continue;
        pipeline.beginLayer();
        drawPrimitives(list.shapes || []);
        drawTexts(list.texts || []);
        pipeline.commitLayer(Math.max(0, Math.min(1, (clip.opacity == null ? 1 : clip.opacity) * envelope)));
      }
      const credit = activeCredit(t);
      if (credit) {
        const texts = creditElementTexts(credit);
        pipeline.beginLayer();
        drawTexts(texts);
        pipeline.commitLayer(1);
      }
    }

    function renderAlwaysCredits(t, beats, drawForeground) {
      if (!SA.credits) return;
      const always = SA.credits.alwaysOn(state.project, t);
      if (always && !(always.hideDuringCues && beats.length)) {
        if (drawForeground) drawForeground();
        const texts = alwaysOnTexts(always);
        drawTexts(texts);
      }
    }

    // --- text background -------------------------------------------------------

    // Bounds of the visible letters in uv space (y up), for the shape layer.
    function textBoxOf(scene, states) {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let i = 0; i < scene.letters.length; i += 1) {
        const letter = scene.letters[i];
        const letterState = states[i];
        if (!letter || !letterState) continue;
        if ((letterState.opacity == null ? 1 : letterState.opacity) <= 0.01) continue;
        const scaleX = Math.abs(letterState.scaleX == null ? 1 : letterState.scaleX);
        const scaleY = Math.abs(letterState.scaleY == null ? 1 : letterState.scaleY);
        const halfW = Math.max(6, (letter.local.w * scaleX) / 2 + 6);
        const halfH = Math.max(6, (letter.size * scaleY) / 2 + 4);
        const x = letterState.x || 0;
        const y = letterState.y || 0;
        x0 = Math.min(x0, x - halfW);
        x1 = Math.max(x1, x + halfW);
        y0 = Math.min(y0, y - halfH);
        y1 = Math.max(y1, y + halfH);
      }
      if (!Number.isFinite(x0)) return null;
      const width = Math.max(1, state.width);
      const height = Math.max(1, state.height);
      return {
        // world y grows downwards, the post uv grows upwards
        x0: x0 / width,
        y0: 1 - y1 / height,
        x1: x1 / width,
        y1: 1 - y0 / height,
      };
    }

    // The same bounds in frame pixels (y down), split per line. Backdrop shape
    // clips (background.shapeLayer + followText) are laid out against these.
    function textBoxesPx(scene, states) {
      const lines = new Map();
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let i = 0; i < scene.letters.length; i += 1) {
        const letter = scene.letters[i];
        const letterState = states[i];
        if (!letter || !letterState) continue;
        if ((letterState.opacity == null ? 1 : letterState.opacity) <= 0.01) continue;
        const scaleX = Math.abs(letterState.scaleX == null ? 1 : letterState.scaleX);
        const scaleY = Math.abs(letterState.scaleY == null ? 1 : letterState.scaleY);
        const halfW = Math.max(6, (letter.local.w * scaleX) / 2 + 6);
        const halfH = Math.max(6, (letter.size * scaleY) / 2 + 4);
        const x = letterState.x || 0;
        const y = letterState.y || 0;
        x0 = Math.min(x0, x - halfW);
        x1 = Math.max(x1, x + halfW);
        y0 = Math.min(y0, y - halfH);
        y1 = Math.max(y1, y + halfH);
        const key = letter.lineIdx == null ? 0 : letter.lineIdx;
        const line = lines.get(key) || { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
        line.x0 = Math.min(line.x0, x - halfW);
        line.y0 = Math.min(line.y0, y - halfH);
        line.x1 = Math.max(line.x1, x + halfW);
        line.y1 = Math.max(line.y1, y + halfH);
        lines.set(key, line);
      }
      if (!Number.isFinite(x0)) return null;
      return {
        box: { x0, y0, x1, y1 },
        lines: [...lines.values()].sort((a, b) => a.y0 - b.y0),
      };
    }

    // Text bounds of the beat on screen, for clips that follow the text. The
    // scene is cached by buildBeatScene and the result is memoised for the
    // frame, so several clips and the text pass share one evaluation.
    function textBoxesForClip(t) {
      const active = activeBeats(state.project, t);
      if (!active.length) return null;
      const beat = active[0];
      const key = `${beat.id}|${t}`;
      if (state.textBoxCache && state.textBoxCache.key === key) return state.textBoxCache.value;
      let value = null;
      const scene = buildBeatScene(state.project, beat, state.assets.fonts || []);
      if (scene && scene.letters.length) {
        const result = evaluateBeatState(state.project, beat, scene, t, active);
        if (result && result.active) value = textBoxesPx(scene, result.letters);
      }
      state.textBoxCache = { key, value };
      return value;
    }

    // The shape layer paints in the palette's accent colour unless the post
    // carries a colour of its own.
    function shapeLayerColor(style) {
      const resolved = SA.fx.resolveColorSet
        ? SA.fx.resolveColorSet({ fill: { kind: 'palette', index: 3 } }, {
            palettes: (state.project && state.project.palettes) || [],
            palette: (style && style.palette) || null,
            time: 0,
            defaultFill: '#ffd166',
          })
        : null;
      const rgba = resolved && resolved.arrays && resolved.arrays.fill;
      return rgba && rgba.length >= 4 ? [rgba[0], rgba[1], rgba[2], rgba[3] == null ? 1 : rgba[3]] : [1, 0.82, 0.42, 1];
    }

    function bgVariationFor(scene, shape, style, beat) {
      const project = state.project;
      const seed = (project && project.styleMode && project.styleMode.seed) || 12345;
      const key = `${seed}|${beat.id}|${JSON.stringify(shape.params)}`;
      if (scene.__bgVary && scene.__bgVary.key === key) return scene.__bgVary.value;
      const palette = (style.palette && style.palette.colors) || [];
      const letters = scene.letters.map((letter) => ({
        char: letter.char,
        lineIdx: letter.lineIdx,
        wordIdx: letter.wordIdx,
        path: letter.path,
      }));
      const value = SA.vary.letterVariation(shape.params, letters, palette, [seed, beat.id]);
      scene.__bgVary = { key, value };
      return value;
    }

    function bgColorOverrideFor(scene, variation) {
      let any = false;
      const data = new Uint8Array(scene.letters.length * 4);
      for (let i = 0; i < scene.letters.length; i += 1) {
        const base = scene.letters[i].color || { r: 1, g: 1, b: 1, a: 1 };
        data[i * 4] = Math.round(Math.max(0, Math.min(1, base.r)) * 255);
        data[i * 4 + 1] = Math.round(Math.max(0, Math.min(1, base.g)) * 255);
        data[i * 4 + 2] = Math.round(Math.max(0, Math.min(1, base.b)) * 255);
        data[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, base.a == null ? 1 : base.a)) * 255);
        const vary = variation && variation[i];
        if (vary && vary.fgColor) {
          any = true;
          data[i * 4] = Math.round(vary.fgColor[0] * 255);
          data[i * 4 + 1] = Math.round(vary.fgColor[1] * 255);
          data[i * 4 + 2] = Math.round(vary.fgColor[2] * 255);
          data[i * 4 + 3] = Math.round((vary.fgColor[3] == null ? 1 : vary.fgColor[3]) * 255);
        }
      }
      return any ? data : null;
    }

    const BG_AMOUNT_KEY = { splatter: 'spikes', scratch: 'count', paper: 'jag', blob: 'wobble', star: 'points' };

    function drawBackgroundPass(active, t, project) {
      if (!SA.textBg || !SA.vary || !pipeline) return null;
      const { beat, scene, result, style } = active;
      const shape = SA.fx.withDefaults(style.bgShape, 'bgShape');
      if (!shape || !shape.type || shape.type === 'none') return null;
      const variation = bgVariationFor(scene, shape, style, beat);
      const entries = scene.letters.map((letter, index) => ({ letter, state: result.letters[index] }));
      const local = Math.max(0, t - beat.start);
      const analysis = state.analysis;
      const features = analysis && SA.audioAnalysis ? SA.audioAnalysis.features(analysis) : null;
      const bpm = features && Number(features.bpm) > 0 ? Number(features.bpm) : 0;
      const motion = SA.fx.withDefaults(style.bgMotion, 'bgMotion');
      const bg = SA.textBg.evaluateBg(shape, motion, entries, variation, null, local, {
        seed: (project.styleMode && project.styleMode.seed) || 12345,
        bpm,
        beatEnv: () => 0.5,
      });
      if (!bg || !bg.states.length) return null;
      const amountKey = BG_AMOUNT_KEY[shape.type];
      const params = shape.params || {};
      for (const entry of bg.states) {
        entry.amount = amountKey ? Number(params[amountKey] == null ? 5 : params[amountKey]) : 5;
        entry.roughness = Number(params.roughness == null ? 0.5 : params.roughness);
      }
      pipeline.textBackground(scene, result.letters, bg.states, { unit: bg.unit });
      const bgSdf = pipeline.sdf();
      const bgEdges = (style.bgEdge || []).filter((instance) => instance && instance.enabled !== false);
      const bgFill = SA.fx.withDefaults(style.bgFill, 'bgFill');
      const bgColorSet = {
        fill: { kind: 'palette', index: 3 },
        fill2: { kind: 'palette', index: 5 },
        stroke: { kind: 'palette', index: 4 },
        glow: { kind: 'palette', index: 3 },
      };
      const colorSet = SA.fx.resolveColorSet
        ? SA.fx.resolveColorSet(bgColorSet, {
            palettes: project.palettes || [],
            palette: style.palette || null,
            time: t,
            defaultFill: '#ff8a3d',
          })
        : { arrays: { fill: [1, 0.54, 0.24, 1], fill2: [1, 0.54, 0.24, 1], stroke: [1, 1, 1, 1] } };
      const hasVaryColor = variation.some((entry) => entry && entry.color && (entry.color[0] !== 1 || entry.color[1] !== 1 || entry.color[2] !== 1));
      const edgeUniformsFor = (instance) =>
        SA.fx.edgeUniforms(instance, {
          colorSet: colorSet.arrays,
          maxDistance: Math.max(state.width, state.height) * 0.1,
          width: state.width,
          height: state.height,
          time: t,
          palette: style.palette || null,
          palettes: project.palettes || [],
          sdfTexture: bgSdf ? bgSdf.texture : null,
        });
      for (const instance of bgEdges) {
        const uniforms = edgeUniformsFor(instance);
        if (!uniforms.top) pipeline.edge(uniforms);
      }
      if (bgFill && bgFill.type && bgFill.type !== 'none') {
        pipeline.fill(
          SA.fx.fillUniforms(bgFill, {
            colors: colorSet.arrays,
            time: t,
            palette: style.palette || null,
            palettes: project.palettes || [],
            progress: Math.min(1, Math.max(0, local / Math.max(0.001, beat.end - beat.start))),
            sdfTexture: bgSdf ? bgSdf.texture : null,
            role: 'bg',
            maskTint: hasVaryColor,
          })
        );
      }
      for (const instance of bgEdges) {
        const uniforms = edgeUniformsFor(instance);
        if (uniforms.top) pipeline.edge(uniforms);
      }
      return variation;
    }

    // Typewriter caret: drawn at the end of the last fully visible letter's cell.
    function drawTypewriterCursor(scene, result, params, t) {
      if (!shapesPass || !SA.textBg || !params || !params.cursor) return;
      let index = -1;
      for (let i = 0; i < result.letters.length; i += 1) {
        const state = result.letters[i];
        if ((state.visibleFrac == null ? 1 : state.visibleFrac) >= 0.999) index = i;
      }
      if (index < 0) return;
      const letter = scene.letters[index];
      const letterState = result.letters[index];
      if (!letter || !letterState || letterState.opacity <= 0.01) return;
      const entering = result.letters.some((entry) => (entry.visibleFrac == null ? 1 : entry.visibleFrac) < 0.999);
      const after = params.cursorAfter || 'blink';
      if (!entering && after === 'hide') return;
      const blink = Number(params.blink) || 0;
      if (!entering && after === 'blink' && blink > 0 && Math.floor(t / blink) % 2 === 1) return;
      const cell = SA.textBg.cellMetrics(letter);
      const shapeName = params.cursorShape || 'bar';
      const cursorW = shapeName === 'bar' ? 0.08 * cell.w : 0.6 * cell.w;
      const cursorH = shapeName === 'underscore' ? 0.08 * cell.h : cell.h;
      const localX = cell.inkToCell[0] + cell.w / 2 - cursorW / 2;
      const localY = cell.inkToCell[1] + (shapeName === 'underscore' ? 0.45 * cell.h : 0);
      const scaleX = letterState.scaleX == null ? 1 : letterState.scaleX;
      const scaleY = letterState.scaleY == null ? 1 : letterState.scaleY;
      const px = localX * scaleX;
      const py = localY * scaleY;
      const angle = letterState.rot || 0;
      const rad = (angle * Math.PI) / 180;
      const cx = (letterState.x || 0) + px * Math.cos(rad) - py * Math.sin(rad);
      const cy = (letterState.y || 0) + px * Math.sin(rad) + py * Math.cos(rad);
      const width = Math.max(1, cursorW * scaleX);
      const height = Math.max(1, cursorH * scaleY);
      let color = '#eef2ff';
      const style = scene.style || {};
      const palette = (style.palette && style.palette.colors) || [];
      if (params.cursorColor) {
        const rgba = SA.color.toRgba(params.cursorColor, null, { palette: style.palette || null });
        if (rgba) color = SA.color.toHex({ r: rgba[0], g: rgba[1], b: rgba[2], a: 1 });
      } else if (palette[2]) {
        color = palette[2];
      }
      drawPrimitives([
        { kind: 'rect', x: cx - width / 2, y: cy - height / 2, w: width, h: height, radius: 0, color, opacity: letterState.opacity, angle },
      ]);
    }

    function renderFrameExtended(t, frame, beats) {
      pipeline.resize(state.width, state.height);
      const project = state.project;
      const card = cardTargetFor(project);
      const fonts = state.assets.fonts || [];
      const framePosts = new Map();
      let bloomNeeded = false;
      const layers = (project.layers || []).filter((layer) => layer && layer.enabled !== false);
      const backgroundLayers = layers.filter((layer) => (layer.slot || 'background') === 'background');
      const foregroundLayers = layers.filter((layer) => layer.slot === 'foreground');
      let layersDrawn = false;
      let foregroundDrawn = false;
      const drawBackgroundLayers = () => {
        if (!layerPass || layersDrawn || !backgroundLayers.length) return;
        layerPass.draw(backgroundLayers, { width: state.width, height: state.height }, t);
        layersDrawn = true;
      };
      const drawForegroundLayers = () => {
        if (!layerPass || foregroundDrawn || !foregroundLayers.length) return;
        layerPass.draw(foregroundLayers, { width: state.width, height: state.height }, t);
        foregroundDrawn = true;
      };
      pipeline.beginScene(CLEAR_COLOR);
      const duration = naturalDuration();
      // back to front: background clips + background layers -> backdrop clips ->
      // filler clips -> subtitle tracks (bottom to top) -> foreground layers
      for (const clip of activeClips(project, 'background')) drawBackgroundClip(clip, t, card);
      drawBackgroundLayers();
      for (const clip of activeClips(project, 'backdrop')) drawShapeClip(clip, t, duration);
      renderFillerClips(t, duration);
      // the figure and text-animation tracks sit between the mid layer and the
      // subtitles, so both draw before the lyric beats are evaluated
      for (const clip of activeClips(project, 'figure')) drawFigureClip(clip, t, duration);
      for (const clip of activeClips(project, 'textAnim')) drawTextClip(clip, t);
      // Evaluate every active beat first: overlapping cues must all render, so
      // every track's text is grouped and drawn track by track.
      const activeBeats = [];
      for (const beat of beats) {
        const scene = buildBeatScene(project, beat, fonts);
        if (!scene.letters.length) continue;
        const result = evaluateBeatState(project, beat, scene, t, beats);
        if (!result.active || !result.letters.length) continue;
        const baseStyle = scene.style || {};
        const style = state.analysis && SA.audioDriver ? SA.audioDriver.resolveStyle(baseStyle, state.analysis, t) : baseStyle;
        activeBeats.push({ beat, scene, result, style });
      }
      const subtitleTracks = (project.tracks || []).filter((track) => track && track.kind === 'subtitle');
      const hiddenTracks = new Set(subtitleTracks.filter((track) => track.hidden).map((track) => track.id));
      const cueTrackId = (beat) => {
        const cue = (project.script.cues || []).find((entry) => entry.id === beat.cueId);
        return (cue && cue.trackId) || 'sub1';
      };
      const trackOrder = subtitleTracks.map((track) => track.id);
      const beatsByTrack = new Map();
      for (const active of activeBeats) {
        const trackId = cueTrackId(active.beat);
        if (hiddenTracks.has(trackId)) continue;
        if (!beatsByTrack.has(trackId)) beatsByTrack.set(trackId, []);
        beatsByTrack.get(trackId).push(active);
      }
      const drawOrder = [];
      for (const trackId of beatsByTrack.keys()) if (!trackOrder.includes(trackId)) drawOrder.push(trackId);
      for (const trackId of [...trackOrder].reverse()) drawOrder.push(trackId);
      for (const active of drawOrder.flatMap((trackId) => beatsByTrack.get(trackId) || [])) {
        const { beat, scene, result, style } = active;
        const bgShape = SA.fx.withDefaults(style.bgShape, 'bgShape');
        const bgActive = !!(bgShape && bgShape.type && bgShape.type !== 'none');
        const bgBehind = bgActive && (bgShape.params.layer || 'behind') !== 'front';
        pipeline.beginLayer();
        const variation = bgBehind ? drawBackgroundPass(active, t, project) : null;
        const variant = morphVariantFor(project, beat, scene);
        const colorOverride = variation ? bgColorOverrideFor(scene, variation) : null;
        pipeline.text(scene, result.letters, variant, colorOverride);
        // per-letter blur (blurIn / blurOut / focus / depth of field) runs on
        // the text mask before the sdf so the edges follow the blurred shape
        pipeline.letterBlur(scene, result.letters);
        const colorSet = SA.fx.resolveColorSet
          ? SA.fx.resolveColorSet(style.color, {
              palettes: project.palettes || [],
              palette: style.palette || null,
              categoryColors: project.categoryColors || {},
              category: beat.meta && beat.meta.category,
              time: t,
              defaultFill: '#eef2ff',
            })
          : { arrays: { fill: [0.93, 0.95, 1, 1], fill2: [0.93, 0.95, 1, 1], stroke: [1, 1, 1, 1] } };
        const maxDistance = Math.max(state.width, state.height) * 0.1;
        const progress = Math.min(1, Math.max(0, (t - beat.start) / Math.max(0.001, beat.end - beat.start)));
        const fillInstance = SA.fx.withDefaults(style.fill, 'fill');
        const category =
          beat.meta && beat.meta.category
            ? SA.project.mergeDeep(SA.project.DEFAULT_CATEGORY_COLORS, project.categoryColors || {})[beat.meta.category]
            : null;
        // repeat: arranged copies of the string behind the main text. Variant
        // typefaces re-render the mask, so the sdf is created afterwards.
        drawRepeatCopies(active, t, project, colorSet, fillInstance, category, progress, beats, variant, colorOverride);
        const sdfTarget = pipeline.sdf();
        if (variation && bgShape.params.knockout) pipeline.knockout();
        // clones: the same string drawn several times behind the main text with
        // per-copy offset / scale / rotation / color / opacity / motion
        const clones = Array.isArray(style.clones) ? style.clones : [];
        for (const clone of clones) {
          if (!clone || clone.enabled === false) continue;
          const env = cloneEnvelope(clone, t, beat);
          if (env <= 0) continue;
          const transform = cloneTransform(clone, t, state.width, state.height);
          pipeline.beginLayer();
          pipeline.fill(
            SA.fx.fillUniforms(fillInstance, {
              colors: cloneColors(colorSet.arrays, clone, style, project),
              category,
              time: t,
              palette: style.palette || null,
              palettes: project.palettes || [],
              categoryColors: project.categoryColors || {},
              progress,
              sdfTexture: sdfTarget ? sdfTarget.texture : null,
            })
          );
          pipeline.commitLayer((clone.opacity == null ? 0.5 : Number(clone.opacity)) * env, transform);
        }
        pipeline.representation(scene, result.letters, 'stroke', variant, colorSet.arrays.stroke);
        pipeline.representation(scene, result.letters, 'pieces', variant);
        pipeline.representation(scene, result.letters, 'particles', variant);
        const edges = (style.edge || [])
          .filter((instance) => instance && instance.enabled !== false)
          .map((instance) =>
            SA.fx.edgeUniforms(instance, {
              colorSet: colorSet.arrays,
              maxDistance,
              width: state.width,
              height: state.height,
              time: t,
              palette: style.palette || null,
              palettes: project.palettes || [],
              categoryColors: project.categoryColors || {},
              category: beat.meta && beat.meta.category,
              sdfTexture: sdfTarget ? sdfTarget.texture : null,
            })
          );
        if (sdfTarget) {
          for (const edge of edges) if (!edge.top) pipeline.edge(edge);
        }
        pipeline.fill(
          SA.fx.fillUniforms(fillInstance, {
            colors: colorSet.arrays,
            category,
            time: t,
            palette: style.palette || null,
            palettes: project.palettes || [],
            categoryColors: project.categoryColors || {},
            progress,
            sdfTexture: sdfTarget ? sdfTarget.texture : null,
          })
        );
        if (sdfTarget) {
          for (const edge of edges) if (edge.top) pipeline.edge(edge);
        }
        for (const instance of style.edge || []) {
          if (instance && instance.type === 'neonGlow' && (!instance.params || instance.params.bloom !== false)) bloomNeeded = true;
        }
        const audioFeatures = state.analysis && SA.audioAnalysis ? SA.audioAnalysis.features(state.analysis) : null;
        for (const instance of style.post || []) {
          if (!instance || instance.enabled === false) continue;
          const uniforms = SA.fx.postUniforms(instance, {
            envelope: instance.envelope == null ? 1 : instance.envelope,
            progress,
            time: t,
            palette: style.palette || null,
            palettes: project.palettes || [],
            categoryColors: project.categoryColors || {},
            category: beat.meta && beat.meta.category,
            sdfTexture: sdfTarget ? sdfTarget.texture : null,
            audioFeatures,
            shapeColor: shapeLayerColor(style),
            textBox: textBoxOf(scene, result.letters),
          });
          if (uniforms.bloom) bloomNeeded = true;
          if (uniforms.target === 'frame') {
            const existing = framePosts.get(instance.type);
            if (!existing || uniforms.u_params[3] > existing.u_params[3]) framePosts.set(instance.type, uniforms);
          } else {
            pipeline.post(uniforms);
          }
        }
        const enterInstance = SA.fx.withDefaults(style.enter, 'enter');
        if (enterInstance && enterInstance.type === 'typewriter') drawTypewriterCursor(scene, result, enterInstance.params, t);
        if (bgActive && !bgBehind) drawBackgroundPass(active, t, project);
        for (const copy of echoPlan(style.animation, beat, t, state.width, state.height)) pipeline.commitLayer(copy.opacity, copy);
        pipeline.commitLayer(1);
        const entry = { cueId: beat.cueId, beatId: beat.id, letters: [] };
        for (let i = 0; i < scene.letters.length; i += 1) {
          const letter = scene.letters[i];
          const letterState = result.letters[i];
          entry.letters.push({
            path: letter.path,
            char: letter.char,
            quad: quadForLetter(letter, letterState),
            bbox: { x: letterState.x - letter.local.w / 2, y: letterState.y - letter.local.h / 2, w: letter.local.w, h: letter.local.h },
            center: { x: letterState.x, y: letterState.y },
            opacity: letterState.opacity,
          });
        }
        frame.cues.push(entry);
      }
      drawBackgroundLayers();
      drawForegroundLayers();
      renderAlwaysCredits(t, beats, drawForegroundLayers);
      for (const uniforms of framePosts.values()) pipeline.postFrame(uniforms);
      if (bloomNeeded) pipeline.bloom(0.6, 0.8);
      pipeline.finish();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, state.width, state.height);
    }

    function renderFrame(t) {
      if (state.disposed || state.lost) return { cues: [] };
      resize(state.width, state.height);
      const project = state.project;
      const frame = { cues: [], time: t };
      if (!project) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, state.width, state.height);
        gl.clearColor(CLEAR_COLOR[0], CLEAR_COLOR[1], CLEAR_COLOR[2], 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        state.lastFrame = frame;
        return frame;
      }

      const beats = activeBeatsLocal(project, t);
      if (pipeline) {
        renderFrameExtended(t, frame, beats);
        state.lastFrame = frame;
        return frame;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, state.textTarget.framebuffer);
      gl.viewport(0, 0, state.width, state.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      const fonts = state.assets.fonts || [];
      for (const beat of beats) {
        const scene = buildBeatScene(project, beat, fonts);
        if (!scene.letters.length) continue;
        let result;
        if (typeof SA.motion !== 'undefined' && SA.motion) {
          result = evaluateBeatState(project, beat, scene, t, beats);
        } else {
          result = {
            active: true,
            letters: scene.letters.map((letter) => ({
              x: letter.local.cx,
              y: letter.local.cy,
              rot: 0,
              scaleX: 1,
              scaleY: 1,
              opacity: 1,
              visibleFrac: 1,
            })),
          };
        }
        if (!result.active || !result.letters.length) continue;
        textPass.draw(gl, scene, result.letters, { width: state.width, height: state.height });
        const entry = { cueId: beat.cueId, beatId: beat.id, letters: [] };
        for (let i = 0; i < scene.letters.length; i += 1) {
          const letter = scene.letters[i];
          const letterState = result.letters[i];
          entry.letters.push({
            path: letter.path,
            char: letter.char,
            quad: quadForLetter(letter, letterState),
            bbox: { x: letterState.x - letter.local.w / 2, y: letterState.y - letter.local.h / 2, w: letter.local.w, h: letter.local.h },
            center: { x: letterState.x, y: letterState.y },
            opacity: letterState.opacity,
          });
        }
        frame.cues.push(entry);
      }

      if (state.textTarget) textPass.drawComposite(gl, state.textTarget, CLEAR_COLOR);
      state.lastFrame = frame;
      return frame;
    }

    function captureRGBA() {
      const width = state.width;
      const height = state.height;
      const data = new Uint8Array(width * height * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
      const flipped = new Uint8Array(data.length);
      const rowLength = width * 4;
      for (let y = 0; y < height; y += 1) {
        flipped.set(data.subarray(y * rowLength, (y + 1) * rowLength), (height - 1 - y) * rowLength);
      }
      return { width, height, data: flipped, frame: state.lastFrame };
    }

    function debugError() {
      return gl.getError();
    }

    async function preloadLayers() {
      if (!layerPass || !state.project) return 0;
      return layerPass.preload(state.project.layers || []);
    }

    async function prepareLayers(t, options) {
      if (!layerPass || !state.project) return 0;
      return layerPass.prepare(state.project.layers || [], t, options);
    }

    function dispose() {
      if (state.disposed) return;
      state.disposed = true;
      if (shapesPass) shapesPass.dispose();
      if (layerPass) layerPass.dispose();
      if (pipeline) pipeline.dispose();
      else if (textPass) textPass.dispose(gl);
      if (state.textTarget) SA.gl.deleteTarget(gl, state.textTarget);
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }

    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      state.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      state.lost = false;
      SA.glPasses.clearBatches();
      layerPass = SA.glLayers ? SA.glLayers.create(gl) : null;
      shapesPass = SA.glShapes ? SA.glShapes.create(gl) : null;
      if (pipeline) {
        pipeline = SA.glPasses.createPipeline(gl, {
          floatTargets: !!context.floatTargets,
          width: state.width,
          height: state.height,
        });
        if (!pipeline) {
          textPass = SA.glPasses.createTextPass(gl);
          createTargets();
        }
      } else {
        textPass = SA.glPasses.createTextPass(gl);
        createTargets();
      }
    });

    if (!pipeline) createTargets();
    return {
      canvas,
      gl,
      context,
      state,
      resize,
      setProject,
      setAssets,
      setAudio,
      renderFrame,
      captureRGBA,
      preloadLayers,
      prepareLayers,
      debugError,
      dispose,
      clearColor: CLEAR_COLOR,
      isLost: () => state.lost,
      isWebGL2: true,
    };
  }

  return { createEngine, supportsWebGL2: (canvas) => SA.gl.supportsWebGL2(canvas), beatForCue, activeBeats, beatOpacity };
})();
