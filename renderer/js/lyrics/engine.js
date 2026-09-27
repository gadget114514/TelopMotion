window.SA = window.SA || {};

SA.lyricsEngine = (() => {
  'use strict';

  const CLEAR_COLOR = [0.043, 0.051, 0.070];

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
      return SA.lyricsScene.buildScene(project, beat, fonts, { direction: sceneDirection(project, beat) });
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
      };
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

    function activeFiller(t, duration) {
      if (!SA.fillers || !state.project) return null;
      const cues = (state.project.script && state.project.script.cues) || [];
      if (!cues.length) return null;
      const clips = SA.fillers.clips(cues, duration, SA.fillers.settingsFor(state.project));
      for (const clip of clips) {
        if (t >= clip.from - 1e-6 && t <= clip.to + 1e-6) return clip;
      }
      return null;
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
        else if (shape.kind === 'circle') shapesPass.circle(shape);
        else if (shape.kind === 'ring') shapesPass.ring(shape);
        else if (shape.kind === 'capsule') shapesPass.capsule(shape);
        else if (shape.kind === 'polygon') shapesPass.polygon(shape);
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

    function relativeLuminance(rgba) {
      const channel = (value) => (value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
      return 0.2126 * channel(rgba[0] || 0) + 0.7152 * channel(rgba[1] || 0) + 0.0722 * channel(rgba[2] || 0);
    }

    function contrastRatio(a, b) {
      const first = relativeLuminance(a);
      const second = relativeLuminance(b);
      const high = Math.max(first, second);
      const low = Math.min(first, second);
      return (high + 0.05) / (low + 0.05);
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

    // Animated shapes for the `background: shapes` treatment: the filler shape
    // list is drawn into a layer and composited behind the lyrics.
    function drawBackgroundShapes(background, style, beat, t) {
      if (!shapesPass || !pipeline || !SA.fillerRender) return;
      const params = (background && background.params) || {};
      const kind = background && background.type === 'pattern' ? 'pattern' : params.kind || 'shapes';
      const palette = style && style.palette && Array.isArray(style.palette.colors) ? style.palette.colors : [];
      const fallback = palette[3] || palette[2] || '#eef2ff';
      let fill = fallback;
      if (params.color) {
        const rgba = SA.color.toRgba(params.color, null, {
          palette: style ? style.palette : null,
          palettes: (state.project && state.project.palettes) || [],
        });
        if (rgba) fill = SA.color.toHex({ r: rgba[0], g: rgba[1], b: rgba[2], a: 1 });
      } else {
        // derive the shape color from the text color: complementary hue and much
        // lower brightness, so background shapes never match the lyrics
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
      }
      // guarantee a minimum contrast between the shapes and the lyrics
      const textRgba = SA.color.toRgba(style && style.color ? style.color.fill || style.color.stroke : null, null, {
        palette: (style && style.palette) || null,
        palettes: (state.project && state.project.palettes) || [],
        categoryColors: (state.project && state.project.categoryColors) || {},
      });
      if (textRgba) {
        const parsed = SA.color.parse(fill);
        if (contrastRatio([parsed.r, parsed.g, parsed.b], textRgba) < 3) {
          const hsv = SA.color.rgbToHsv({ r: parsed.r, g: parsed.g, b: parsed.b });
          hsv.v = relativeLuminance(textRgba) > 0.45 ? 0.3 : 0.75;
          const next = SA.color.hsvToRgb(hsv);
          fill = SA.color.toHex({ r: next.r, g: next.g, b: next.b, a: 1 });
        }
      }
      const duration = Math.max(0.001, beat.end - beat.start);
      const progress = Math.min(1, Math.max(0, (t - beat.start) / duration));
      const spec = { type: kind, params: { ...params, color: fill } };
      const list = SA.fillerRender.drawList(spec, {
        time: t,
        frame: { width: state.width, height: state.height },
        clip: { key: `bg:${beat.id}`, from: beat.start, to: beat.end, spec },
        duration,
        nextStart: null,
        nextText: '',
        prevText: '',
        analysis: state.analysis,
        progress,
        seed: (state.project && state.project.styleMode && state.project.styleMode.seed) || 12345,
        color: fill,
      });
      if (!list || (!(list.shapes && list.shapes.length) && !(list.texts && list.texts.length))) return;
      pipeline.beginLayer();
      drawPrimitives(list.shapes || []);
      drawTexts(list.texts || []);
      pipeline.commitLayer(params.opacity == null ? 0.45 : params.opacity);
    }

    function fillerContext(t, clip, duration) {
      const project = state.project;
      const cues = (project.script && project.script.cues) || [];
      const next = clip.nextCueId ? cues.find((entry) => entry.id === clip.nextCueId) : null;
      const previous = clip.prevCueId ? cues.find((entry) => entry.id === clip.prevCueId) : null;
      return {
        time: t,
        frame: { width: state.width, height: state.height },
        clip,
        duration,
        nextStart: next ? next.start : null,
        nextText: next ? next.text : '',
        prevText: previous ? previous.text : '',
        analysis: state.analysis,
        progress: duration > 0 ? t / duration : 0,
        seed: (project.styleMode && project.styleMode.seed) || 12345,
        color: '#eef2ff',
      };
    }

    function fillerEdgeOpacity(t, clip) {
      const fade = 0.35;
      return Math.max(0, Math.min(1, (t - clip.from) / fade, (clip.to - t) / fade));
    }

    function renderFillerAndCredits(t, beats, duration, drawForeground) {
      if (!beats.length) {
        let primitives = null;
        let texts = null;
        const credit = activeCredit(t);
        const clip = activeFiller(t, duration);
        if (clip && clip.spec) {
          if (clip.spec.type === 'credits') {
            if (!credit) {
              const settings = SA.credits ? SA.credits.settingsFor(state.project) : {};
              const lines = SA.credits ? SA.credits.expandTemplate(state.project, settings, {}) : [];
              const style = creditStyleFor('element', 0.06);
              texts = centeredTexts(lines, { size: style.size, color: style.color, opacity: fillerEdgeOpacity(t, clip) });
            }
          } else {
            const list = SA.fillerRender ? SA.fillerRender.drawList(clip.spec, fillerContext(t, clip, duration)) : null;
            if (list) {
              primitives = list.shapes;
              texts = list.texts;
            }
          }
        }
        if (credit) {
          const creditTexts = creditElementTexts(credit);
          texts = (texts || []).concat(creditTexts);
        }
        if ((primitives && primitives.length) || (texts && texts.length)) {
          pipeline.beginLayer();
          drawPrimitives(primitives || []);
          drawTexts(texts || []);
          pipeline.commitLayer(1);
        }
      }
      if (SA.credits) {
        const always = SA.credits.alwaysOn(state.project, t);
        if (always && !(always.hideDuringCues && beats.length)) {
          if (drawForeground) drawForeground();
          const texts = alwaysOnTexts(always);
          drawTexts(texts);
        }
      }
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
      // Evaluate every active beat first: overlapping cues must all render, so
      // every background goes down first and each cue's text follows on top.
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
      // stack, back to front: background layers -> cue background (shape
      // animation) -> lyrics -> foreground layers
      for (const active of activeBeats) {
        const { beat, style } = active;
        drawBackgroundLayers();
        const background = SA.fx.withDefaults(style.background, 'background');
        if (background && background.type && background.type !== 'none') {
          if (background.type === 'shapes' || background.type === 'pattern') {
            drawBackgroundShapes(background, style, beat, t);
          } else {
            const badgeRect = badgeRectFor(project, beat, project.output ? project.output.aspect : '16:9');
            const zoom = Math.max(0.05, (background.params && background.params.zoom) || 1.6);
            const focusX = badgeRect ? (badgeRect.x + badgeRect.w / 2) / state.width - 0.5 : 0;
            const focusY = badgeRect ? (badgeRect.y + badgeRect.h / 2) / state.height - 0.5 : 0;
            const theme = SA.card && SA.card.theme ? SA.card.theme(project) : null;
            pipeline.drawBackground(
              SA.fx.backgroundUniforms(background, {
                theme,
                cardTheme: theme,
                focusX: focusX / zoom,
                focusY: focusY / zoom,
                palette: style.palette || null,
                time: t,
              }),
              card
            );
          }
        }
      }
      for (const active of activeBeats) {
        const { beat, scene, result, style } = active;
        pipeline.beginLayer();
        const variant = morphVariantFor(project, beat, scene);
        pipeline.text(scene, result.letters, variant);
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
        const sdfTarget = pipeline.sdf();
        const maxDistance = Math.max(state.width, state.height) * 0.1;
        const progress = Math.min(1, Math.max(0, (t - beat.start) / Math.max(0.001, beat.end - beat.start)));
        const fillInstance = SA.fx.withDefaults(style.fill, 'fill');
        const category =
          beat.meta && beat.meta.category
            ? SA.project.mergeDeep(SA.project.DEFAULT_CATEGORY_COLORS, project.categoryColors || {})[beat.meta.category]
            : null;
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
          });
          if (uniforms.bloom) bloomNeeded = true;
          if (uniforms.target === 'frame') {
            const existing = framePosts.get(instance.type);
            if (!existing || uniforms.u_params[3] > existing.u_params[3]) framePosts.set(instance.type, uniforms);
          } else {
            pipeline.post(uniforms);
          }
        }
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
      renderFillerAndCredits(t, beats, naturalDuration(), drawForegroundLayers);
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
