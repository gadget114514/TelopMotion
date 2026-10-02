window.SA = window.SA || {};

SA.lyricsEngine = (() => {
  'use strict';

  // The canvas base is the background track's own colour, the stage behind
  // the clips and the layers. It is unset (transparent) by default: the chroma
  // key green is a preset of that colour, never an implicit default. Transparent
  // moments (a clip fading at a cue edge, a shape background that only paints
  // its shapes) simply show the stage through.
  const TRANSPARENT = [0, 0, 0, 0];
  // Backdrop shapes stand apart from the lyrics by at least this contrast ratio
  // (WCAG large text); below it the two read as the same colour. The ratio
  // climbs with the raw weird axis (3 -> 5.5), so a weirder backdrop separates
  // itself more, and it is 3 at weird 0, exactly as before.
  function backdropContrast(project) {
    const axes = project && project.styleMode ? project.styleMode.axes : null;
    return SA.weird ? SA.weird.backdropContrast(axes && axes.weird) : 3;
  }

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
      if (cue.disabled) continue;
      if (t < cue.start - 1e-4 || t > cue.end + 1e-4) continue;
      const list = project.beats && project.beats[cue.id];
      if (list && list.length) {
        for (const beat of list) {
          if (beat.disabled) continue;
          if (t >= beat.start - 1e-4 && t <= beat.end + 1e-4) beats.push(beat);
        }
      } else {
        const beat = beatForCue(cue);
        if (beat && !beat.disabled) beats.push(beat);
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

  // The text background is drawn unless the track hides it (`bgHidden`, saved
  // in the project) or the display-only view switched every subtitle
  // background off. The shapes themselves are never deleted.
  function subtitleBackgroundOn(track, view) {
    if (view && view.subtitleBackgrounds === false) return false;
    return !(track && track.bgHidden);
  }

  // the frame-wide graphics a subtitle style carries (light leaks, vignette,
  // camera moves, shape layers ...) sit on the track's own graphics row:
  // hidden with it, and dropped by the subtitle-only view
  function subtitleGraphicsOn(track, view) {
    if (view && view.subtitleOnly === true) return false;
    return !(track && track.graphicsHidden);
  }

  // Subtitle text (glyphs, fill, edge, repeats, clones, text posts) can be
  // disabled per track (`track.textHidden`, saved in the project), per view
  // (`view.subtitleText === false`), or per style (`style.text.enabled === false`).
  function subtitleTextOn(track, view, style) {
    if (view && view.subtitleText === false) return false;
    if (track && track.textHidden) return false;
    if (style && style.text && style.text.enabled === false) return false;
    return true;
  }

  // The track's text-mask switch: absent = on (the engine default). A figure /
  // backdrop / filler layer is knocked out under the glyphs unless the track
  // opted out; the subtitle background is always knocked out (it is the same
  // glyph shape), so only the clip tracks read this.
  function trackTextMaskOn(track) {
    return !(track && track.textMask === false);
  }

  // Is any visible beat carrying an enabled frame-wide graphic (a post on the
  // track's graphics row)? Those posts composite with the text mask, so the
  // subtitle stays readable under them. Pure, so the tests can pin it.
  function graphicsPostsActive(visibleBeats, graphicsHidden) {
    if (!SA.fx || typeof SA.fx.isGraphicsPost !== 'function') return false;
    for (const active of visibleBeats || []) {
      if (!active || !active.style) continue;
      if (graphicsHidden && graphicsHidden.has(active.trackId)) continue;
      for (const instance of active.style.post || []) {
        if (instance && instance.enabled !== false && SA.fx.isGraphicsPost(instance)) return true;
      }
    }
    return false;
  }

  function trackById(project, trackId) {
    return ((project && project.tracks) || []).find((track) => track && track.id === trackId) || null;
  }

  // The padding radius of the text mask: a share of the biggest beat size,
  // clamped to the frame height. Pure so the tests can pin the band.
  function maskRadius(size, height) {
    const h = Math.max(1, Number(height) || 1);
    const grown = 0.16 * Math.max(0, Number(size) || 0);
    return Math.max(0.008 * h, Math.min(0.03 * h, grown));
  }

  // Splits a shape list into the split planes (`plane: true`) and the accent
  // shapes above them. `ordered` is true when every plane comes before every
  // accent: only then may the backdrop draw two layers (planes whole, accents
  // knocked out). A planes-only list and a hand-made combo with a mixed order
  // stay on the single-layer path.
  function partitionPlanes(shapes) {
    const list = Array.isArray(shapes) ? shapes : [];
    const planes = [];
    const accents = [];
    let lastPlane = -1;
    let firstAccent = Infinity;
    for (let i = 0; i < list.length; i += 1) {
      if (list[i] && list[i].plane) {
        planes.push(list[i]);
        lastPlane = i;
      } else {
        accents.push(list[i]);
        if (i < firstAccent) firstAccent = i;
      }
    }
    return { planes, accents, ordered: planes.length > 0 && accents.length > 0 && lastPlane < firstAccent };
  }

  function isClipDisabled(clip) {
    if (!clip) return false;
    if (clip.disabled || clip.enabled === false) return true;
    const params = clip.spec && clip.spec.params;
    if (params && (params.disabled || params.enabled === false)) return true;
    return false;
  }

  // Clips of one track kind, hidden tracks excluded, in start order.
  function activeClips(project, kind) {
    const ids = new Set(
      ((project && project.tracks) || []).filter((track) => track && track.kind === kind && !track.hidden).map((track) => track.id)
    );
    if (!ids.size) return [];
    return ((project.clips || [])).filter((clip) => clip && ids.has(clip.trackId) && !isClipDisabled(clip)).sort((a, b) => a.start - b.start);
  }

  // The layer tracks (foreground / background) own the layers of their slot:
  // hiding the track hides its layers (the timeline header shows the same).
  function layerSlotHidden(project, slot) {
    return ((project && project.tracks) || []).some((track) => track && track.hidden && track.kind === slot);
  }

  // The frame base: the background track's own colour (a track-governed
  // object, toggled with the track's checkbox). Unset or hidden = transparent.
  function backgroundTrackOf(project) {
    return ((project && project.tracks) || []).find((track) => track && track.kind === 'background') || null;
  }

  // Accepts a hex string or a ColorValue and returns the premultiplied
  // [r, g, b, a] the scene target is cleared with, or null for no colour.
  function resolveBaseColor(value) {
    if (!value || !SA.color) return null;
    let rgba = null;
    if (typeof value === 'string') {
      if (SA.color.parse) rgba = SA.color.parse(value);
    } else if (SA.color.resolve) {
      const resolved = SA.color.resolve(value, {});
      if (resolved && resolved.rgba) rgba = resolved.rgba;
      else if (resolved && resolved.stops && resolved.stops[0]) rgba = resolved.stops[0].rgba;
    }
    if (!rgba || typeof rgba.r !== 'number') return null;
    const alpha = Math.max(0, Math.min(1, rgba.a == null ? 1 : rgba.a));
    if (alpha <= 0) return null;
    return [rgba.r * alpha, rgba.g * alpha, rgba.b * alpha, alpha];
  }

  function backgroundBaseColor(project) {
    const track = backgroundTrackOf(project);
    if (!track || track.hidden) return TRANSPARENT;
    return resolveBaseColor(track.color) || TRANSPARENT;
  }

  // The raw weird axis the stage separation ratios climb with. Unset = 0, the
  // classic behaviour.
  function rawWeirdOf(project) {
    const axes = project && project.styleMode && project.styleMode.axes;
    const value = Number(axes && axes.weird);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return value > 1 ? 1 : value;
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
      // display-only view options: `subtitleOnly` hides every track but the
      // subtitles and `subtitleBackgrounds` toggles the per-track background
      // shapes (the saved `track.bgHidden` data flag always applies)
      view: { subtitleOnly: false, subtitleBackgrounds: true },
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

    // display-only options (never saved, never used by the export): a view
    // patch merges into the current view
    function setView(patch) {
      state.view = { ...state.view, ...(patch || {}) };
      return { ...state.view };
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
      const pageType = style && style.page && style.page.type;
      if (layoutType === 'vertical' || pageType === 'vertical' || (pageType === 'manuscript' && (!style.page.params || style.page.params.vertical !== false))) return 'vertical';
      return undefined;
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
        if (cue.disabled) continue;
        const list = project.beats && project.beats[cue.id];
        if (list && list.length) {
          for (const beat of list) {
            if (!beat.disabled) beats.push(beat);
          }
        } else {
          const beat = beatForCue(cue);
          if (beat && !beat.disabled) beats.push(beat);
        }
      }
      beats.sort((a, b) => a.start - b.start);
      return beats;
    }

    // Kick times for a shape clip: every beat whose window overlaps it plus the
    // rhythm cuts its split part carries. Memoised per clip (and per project
    // object) so it is not rebuilt every frame.
    let kickCache = { project: null, map: new Map() };

    function kickTimesForClip(clip, spec) {
      if (kickCache.project !== state.project) kickCache = { project: state.project, map: new Map() };
      const key = `${clip.id}:${clip.start}:${clip.end}`;
      const cached = kickCache.map.get(key);
      if (cached) return cached;
      const start = Number(clip.start) || 0;
      const end = Number(clip.end) || start;
      const kicks = [];
      for (const beat of allBeats(state.project)) {
        if (beat.end > start && beat.start < end) kicks.push(Number(beat.start) || 0);
      }
      const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'split' && node.params && Array.isArray(node.params.cuts)) {
          for (const cut of node.params.cuts) {
            const at = Number(cut);
            if (Number.isFinite(at) && at > start && at < end) kicks.push(at);
          }
        }
        if (Array.isArray(node.params && node.params.list)) node.params.list.forEach(walk);
      };
      walk(spec);
      kicks.sort((a, b) => a - b);
      const unique = [];
      for (const at of kicks) {
        if (!unique.length || at - unique[unique.length - 1] > 1e-6) unique.push(at);
      }
      kickCache.map.set(key, unique);
      return unique;
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

    // Partial decorations: `style.scoped` entries with a fill / edge draw their
    // own mask (letters outside the scope get opacity 0), then the scoped fill
    // is painted over and the scoped edges added. The full mask is restored
    // afterwards so the post passes and the next beat see every letter.
    function drawScopedDecor(active, t, colorSet, category, progress, variant, colorOverride) {
      const { scene, result, style } = active;
      const scoped = Array.isArray(style.scoped) ? style.scoped : [];
      const entries = scoped.filter((entry) => entry && entry.enabled !== false && (entry.group === 'fill' || entry.group === 'edge') && entry.type);
      if (!entries.length || !SA.scope || typeof SA.scope.scopeMask !== 'function') return;
      const groups = new Map();
      for (const entry of entries) {
        const key = SA.scope.scopeKey(entry.scope || null);
        if (!groups.has(key)) groups.set(key, { scope: entry.scope || null, list: [] });
        groups.get(key).list.push(entry);
      }
      let drew = false;
      const maxDistance = Math.max(state.width, state.height) * 0.1;
      for (const group of groups.values()) {
        const mask = SA.scope.scopeMask(scene, group.scope);
        if (!mask || !mask.length) continue;
        const masked = result.letters.map((letterState, index) => (mask[index] ? letterState : { ...letterState, opacity: 0 }));
        pipeline.text(scene, masked, variant, colorOverride);
        pipeline.letterBlur(scene, masked);
        const sdf = pipeline.sdf();
        if (!sdf) continue;
        for (const entry of group.list) {
          const instance = SA.fx.withDefaults({ type: entry.type, params: entry.params, motion: entry.motion, enabled: true }, entry.group);
          if (!instance) continue;
          const shared = {
            colorSet: colorSet.arrays,
            category,
            time: t,
            palette: style.palette || (state.project && state.project.style && state.project.style.palette) || null,
            palettes: state.project ? state.project.palettes || [] : [],
            categoryColors: state.project ? state.project.categoryColors || {} : {},
            progress,
            sdfTexture: sdf.texture,
          };
          if (entry.group === 'fill') {
            pipeline.fill(SA.fx.fillUniforms(instance, shared));
          } else {
            const uniforms = SA.fx.edgeUniformsAll
              ? SA.fx.edgeUniformsAll(instance, { ...shared, maxDistance, width: state.width, height: state.height, localTime: t - (active.beat ? active.beat.start : 0) })
              : [SA.fx.edgeUniforms(instance, { ...shared, maxDistance, width: state.width, height: state.height })].filter(Boolean);
            for (const edge of uniforms) pipeline.edge(edge);
          }
          drew = true;
        }
      }
      if (drew) {
        // restore the full mask for the post passes and the layer commit
        pipeline.text(scene, result.letters, variant, colorOverride);
        pipeline.letterBlur(scene, result.letters);
        pipeline.sdf();
      }
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
        if (!instance || instance.enabled === false || (instance.params && instance.params.enabled === false) || instance.type !== 'camera') continue;
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
      if (textColors.length) fills = fills.map((fill) => SA.color.separateFrom(fill, textColors, backdropContrast(state.project)));
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

    // Is any active clip on a mask-capable track (backdrop / figure / filler)
    // and still opted in? Hidden tracks are already dropped by activeClips.
    function maskTargetsActive(project, t) {
      for (const kind of ['backdrop', 'figure', 'filler']) {
        for (const clip of activeClips(project, kind)) {
          if (t < clip.start - 1e-4 || t > clip.end + 1e-4) continue;
          if (clipEnvelope(t, clip) <= 0) continue;
          if (!trackTextMaskOn(trackById(project, clip.trackId))) continue;
          return true;
        }
      }
      return false;
    }

    // Bakes the frame's text mask from every visible beat: the radius follows
    // the biggest beat size and the strength the strongest visible letter, so
    // the mask fades with the subtitle's own entrance / exit. Returns whether
    // the mask target now holds glyphs.
    function buildFrameTextMask(visibleBeats, project) {
      let maxSize = 0;
      let strength = 0;
      for (const active of visibleBeats) {
        const size = Number(active.scene && active.scene.size) || 0;
        if (size > maxSize) maxSize = size;
        for (const letter of active.result.letters) {
          const opacity = letter && letter.opacity != null ? Number(letter.opacity) : 1;
          if (Number.isFinite(opacity) && opacity > strength) strength = opacity;
        }
      }
      if (!(strength > 0.001)) return false;
      const radius = maskRadius(maxSize, state.height);
      const entries = visibleBeats.map((active) => ({
        scene: active.scene,
        letters: active.result.letters,
        variant: morphVariantFor(project, active.beat, active.scene),
      }));
      return pipeline.buildTextMask(entries, { radius, feather: radius * 0.5, strength: Math.min(1, strength) }) === true;
    }

    function drawShapeClip(clip, t, duration, stage, stageWeird, mask) {
      if (!pipeline) return;
      const recolored = stage && SA.stagePalette ? SA.stagePalette.recolorClip(clip, stage.cue, stage, stageWeird) : null;
      const spec = (recolored ? recolored.spec : clip.spec) || { type: 'none', params: {} };
      const envelope = clipEnvelope(t, clip);
      if (envelope <= 0) return;
      // the lyrics on screen decide the palette and the text colours the shapes
      // must stand apart from (a cue or beat can carry a palette of its own)
      const onScreen = activeBeats(state.project, t)[0];
      const style = SA.project.resolveStyle(state.project, onScreen ? `cue:${onScreen.cueId}/beat:${onScreen.id}` : '');
      const fills = clipShapeColor(spec, recolored ? recolored.colors : clip.colors, style);
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
        const followMode = params.followText || 'block';
        const boxes = followMode !== 'none' ? textBoxesForClip(t) : null;
        // the drive follows the text on screen (each cue draws its own shape);
        // without a beat it falls back to the clip's own progress
        const beatSpan = onScreen ? Math.max(0.001, onScreen.end - onScreen.start) : 0;
        const driveProgress = onScreen ? Math.min(1, Math.max(0, (t - onScreen.start) / beatSpan)) : progress;
        const features = state.analysis && SA.audioAnalysis ? SA.audioAnalysis.features(state.analysis) : null;
        const primitives = SA.shapeOps.expand(params, {
          box: boxes ? boxes.box : null,
          boxes: boxes ? boxes.lines : null,
          lines: boxes ? boxes.lines : null,
          words: boxes ? boxes.words : null,
          chars: boxes ? boxes.chars : null,
          text: boxes ? boxes.text : '',
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
          kicks: kickTimesForClip(clip, spec),
        });
      }
      const shapes = list.shapes || [];
      const texts = list.texts || [];
      // the text mask knocks the layer out under the glyphs. A combo of split
      // planes (drawn first) and an accent texture draws as two layers: the
      // planes stay whole (their colours hold the text contrast), the accents
      // are masked. Planes only, and hand-made combos with a mixed order, keep
      // the classic single-layer path.
      if (mask) {
        const parts = partitionPlanes(shapes);
        if (parts.ordered) {
          pipeline.beginLayer();
          drawPrimitives(parts.planes);
          pipeline.commitLayer(layerOpacity);
          pipeline.beginLayer();
          drawPrimitives(parts.accents);
          drawTexts(texts);
          pipeline.maskLayer();
          pipeline.commitLayer(layerOpacity);
          return;
        }
        if (parts.planes.length) {
          pipeline.beginLayer();
          drawPrimitives(shapes);
          drawTexts(texts);
          pipeline.commitLayer(layerOpacity);
          return;
        }
      }
      pipeline.beginLayer();
      drawPrimitives(shapes);
      drawTexts(texts);
      if (mask) pipeline.maskLayer();
      pipeline.commitLayer(layerOpacity);
    }

    // A figure clip: animated motifs built from the shape primitives, drawn on
    // the figure track between the mid layer and the subtitles.
    function drawFigureClip(clip, t, duration, stage, stageWeird, mask) {
      if (!shapesPass || !SA.figures || isClipDisabled(clip)) return;
      const recolored = stage && SA.stagePalette ? SA.stagePalette.recolorClip(clip, stage.cue, stage, stageWeird) : null;
      const spec = (recolored ? recolored.spec : clip.spec) || {};
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
        colors: clipShapeColor(spec, recolored ? recolored.colors : clip.colors, style),
        color: '#c86bff',
        bpm: features && Number(features.bpm) > 0 ? Number(features.bpm) : 0,
      });
      if (!list || !(list.shapes || []).length) return;
      pipeline.beginLayer();
      drawPrimitives(list.shapes);
      if ((list.texts || []).length) drawTexts(list.texts);
      if (mask) pipeline.maskLayer();
      pipeline.commitLayer(Math.max(0, Math.min(1, (clip.opacity == null ? 1 : clip.opacity) * envelope)));
    }

    // The style one textAnim layer renders with: the chosen theme (when the
    // studio is loaded), then the explicit enter / hold / exit, the text size
    // (a ratio of the frame height) and the fill colour.
    function textAnimStyle(params) {
      const p = params || {};
      const theme = p.theme && SA.themes && typeof SA.themes.get === 'function' ? SA.themes.get(p.theme) : null;
      const base = theme && theme.style ? theme.style : {};
      const overrides = { text: { size: Math.max(2, (Number(p.size) || 0.08) * state.height) } };
      for (const group of ['enter', 'hold', 'exit']) {
        if (p[group] && p[group] !== 'auto') overrides[group] = { type: p[group] };
      }
      const y = p.y == null ? 0.5 : Math.max(0, Math.min(1, Number(p.y)));
      overrides.location = { type: 'custom', params: { x: 0.5, y: Number.isFinite(y) ? y : 0.5 } };
      if (p.color) overrides.color = { fill: { kind: 'solid', value: String(p.color), alpha: 1 } };
      return SA.project.mergeDeep(base, overrides);
    }

    // Animated text rendered like a lyric beat: the entrance / hold / exit of
    // the style are evaluated for the given span. Shared by the text-animation
    // track and the textAnim layers inside fillers.
    function drawTextAnim(text, style, start, end, t, opacity, id) {
      if (!pipeline || !SA.lyricsScene || !SA.motion) return;
      if (!String(text || '').trim()) return;
      if (!(opacity > 0)) return;
      const beat = {
        id: `clip_${id}:single0`,
        cueId: `clip_${id}`,
        kind: 'single',
        start,
        end,
        text,
        lines: String(text).split(/\r?\n/).filter((line) => line.length),
      };
      const clipProject = {
        ...state.project,
        style: SA.project.mergeDeep(state.project.style || {}, style || {}),
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
          progress: Math.min(1, Math.max(0, (t - start) / Math.max(0.001, end - start))),
          palettes: state.project.palettes || [],
          palette: scene.style.palette || null,
          categoryColors: state.project.categoryColors || {},
        })
      );
      pipeline.commitLayer(opacity);
    }

    // A text-animation clip: its own text on its own track, evaluated like a
    // lyric beat (entrance / hold / exit from the clip's style).
    function drawTextClip(clip, t) {
      const spec = clip.spec || {};
      if (spec.type !== 'textAnim') return;
      const envelope = clipEnvelope(t, clip);
      if (envelope <= 0) return;
      const params = spec.params || {};
      drawTextAnim(String(params.text || ''), params.style || {}, clip.start, clip.end, t, Math.max(0, Math.min(1, (clip.opacity == null ? 1 : clip.opacity) * envelope)), clip.id);
    }

    function drawBackgroundClip(clip, t, card, stage, stageWeird) {
      if (!pipeline) return;
      // the background track was painted with the project palette: with a live
      // stage it follows the cue palette and the beat scheme
      const recolored = stage && SA.stagePalette ? SA.stagePalette.recolorClip(clip, stage.base, stage, stageWeird) : null;
      const spec = (recolored ? recolored.spec : clip.spec) || {};
      if (!spec.type || spec.type === 'none') return;
      const style = SA.project.resolveStyle(state.project, '');
      const palette = style && style.palette ? style.palette : projectPalette();
      const colors = recolored
        ? Array.isArray(recolored.colors) && recolored.colors.length ? recolored.colors : null
        : Array.isArray(clip.colors) && clip.colors.length ? clip.colors : null;
      if (spec.type === 'shapes' || spec.type === 'pattern' || spec.type === 'shapeLayer') {
        // the shape half owns its own colour pass; hand it the final clip so it
        // does not map the base palette a second time
        drawShapeClip(recolored ? { ...clip, spec, colors } : clip, t, naturalDuration(), null, stageWeird);
        return;
      }
      const envelope = clipEnvelope(t, clip);
      if (envelope <= 0) return;
      const theme = SA.card && SA.card.theme ? SA.card.theme(state.project) : null;
      const params = { ...(spec.params || {}) };
      if ((spec.type === 'solid' || spec.type === 'plain') && colors && !params.color) params.color = colors[0];
      const stagePalette = stage && Array.isArray(stage.to) && stage.to.length ? { colors: stage.to } : palette;
      pipeline.drawBackground(
        SA.fx.backgroundUniforms({ type: spec.type, params }, {
          theme,
          cardTheme: theme,
          focusX: 0,
          focusY: 0,
          palette: colors ? { colors } : stagePalette,
          time: t,
        }),
        card,
        Math.max(0, Math.min(1, (clip.opacity == null ? 1 : clip.opacity) * envelope))
      );
    }

    function fillerClipContext(t, clip, duration) {
      const project = state.project;
      const clipDuration = Math.max(1e-3, clip.end - clip.start);
      const cues = ((project.script && project.script.cues) || []).filter((entry) => !entry.disabled);
      const next = cues.find((entry) => entry.start >= clip.end - 1e-4);
      const previous = [...cues].reverse().find((entry) => entry.end <= clip.start + 1e-4);
      const features = state.analysis && SA.audioAnalysis ? SA.audioAnalysis.features(state.analysis) : null;
      const boxes = textBoxesForClip(t);
      const settings = SA.credits && SA.credits.settingsFor ? SA.credits.settingsFor(project) : null;
      return {
        time: t,
        frame: { width: state.width, height: state.height },
        clip: { key: clip.id, from: clip.start, to: clip.end, start: clip.start, end: clip.end, spec: clip.spec },
        duration,
        nextStart: next ? next.start : null,
        nextText: next ? next.text : '',
        prevText: previous ? previous.text : '',
        analysis: state.analysis,
        progress: Math.min(1, Math.max(0, (t - clip.start) / clipDuration)),
        seed: (project.styleMode && project.styleMode.seed) || 12345,
        color: '#eef2ff',
        bpm: features && Number(features.bpm) > 0 ? Number(features.bpm) : 0,
        beats: activeBeats(project, t).map((beat) => ({ start: beat.start, end: beat.end })),
        textBox: boxes ? boxes.box : null,
        colors: Array.isArray(clip.colors) && clip.colors.length ? clip.colors : null,
        meta: {
          title: settings && SA.credits.titleText ? SA.credits.titleText(project, settings) : '',
          artist: settings && SA.credits.artistText ? SA.credits.artistText(project, settings) : '',
        },
      };
    }

    // Filler clips live on their own track and are drawn whenever they are
    // active, whether or not a lyric beat is on screen.
    function renderFillerClips(t, duration, stage, stageWeird, maskFor) {
      const project = state.project;
      for (const clip of activeClips(project, 'filler')) {
        const envelope = clipEnvelope(t, clip);
        if (envelope <= 0) continue;
        const recolored = stage && SA.stagePalette ? SA.stagePalette.recolorClip(clip, stage.cue, stage, stageWeird) : null;
        const spec = (recolored ? recolored.spec : clip.spec) || { type: 'none', params: {} };
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
        const context = fillerClipContext(t, recolored ? { ...clip, spec, colors: recolored.colors } : clip, duration);
        const list = SA.fillerRender.drawList(spec, context);
        const shapes = (list && list.shapes) || [];
        const texts = (list && list.texts) || [];
        const anims = (list && list.textAnims) || [];
        if (!shapes.length && !texts.length && !anims.length) continue;
        const clipOpacity = Math.max(0, Math.min(1, (clip.opacity == null ? 1 : clip.opacity) * envelope));
        const mask = typeof maskFor === 'function' ? maskFor(clip) : !!maskFor;
        if (shapes.length || texts.length) {
          pipeline.beginLayer();
          drawPrimitives(shapes);
          drawTexts(texts);
          if (mask) pipeline.maskLayer();
          pipeline.commitLayer(clipOpacity);
        }
        // animated text layers draw on top of the shapes
        for (let i = 0; i < anims.length; i += 1) {
          const params = (anims[i] && anims[i].params) || {};
          drawTextAnim(
            SA.fillerRender.expandTokens(params.text, context),
            textAnimStyle(params),
            clip.start,
            clip.end,
            t,
            clipOpacity,
            `${clip.id}:${i}`
          );
        }
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

    // The same bounds in frame pixels (y down), split per line, word, and character.
    // Backdrop shape clips (background.shapeLayer + followText) are laid out against these.
    function textBoxesPx(scene, states) {
      const lines = new Map();
      const words = new Map();
      const chars = [];
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
        const cx0 = x - halfW;
        const cx1 = x + halfW;
        const cy0 = y - halfH;
        const cy1 = y + halfH;
        x0 = Math.min(x0, cx0);
        x1 = Math.max(x1, cx1);
        y0 = Math.min(y0, cy0);
        y1 = Math.max(y1, cy1);

        const lineKey = letter.lineIdx == null ? 0 : letter.lineIdx;
        const line = lines.get(lineKey) || { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, lineIdx: lineKey };
        line.x0 = Math.min(line.x0, cx0);
        line.y0 = Math.min(line.y0, cy0);
        line.x1 = Math.max(line.x1, cx1);
        line.y1 = Math.max(line.y1, cy1);
        lines.set(lineKey, line);

        const wordKey = `${lineKey}:${letter.wordIdx == null ? 0 : letter.wordIdx}`;
        const word = words.get(wordKey) || { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, lineIdx: lineKey, wordIdx: letter.wordIdx };
        word.x0 = Math.min(word.x0, cx0);
        word.y0 = Math.min(word.y0, cy0);
        word.x1 = Math.max(word.x1, cx1);
        word.y1 = Math.max(word.y1, cy1);
        words.set(wordKey, word);

        chars.push({
          x0: cx0,
          y0: cy0,
          x1: cx1,
          y1: cy1,
          char: letter.char,
          index: i,
          lineIdx: lineKey,
          wordIdx: letter.wordIdx,
        });
      }
      if (!Number.isFinite(x0)) return null;
      const fullText = chars.map((c) => c.char || '').join('');
      return {
        box: { x0, y0, x1, y1, text: fullText },
        lines: [...lines.values()].sort((a, b) => a.y0 - b.y0),
        words: [...words.values()].sort((a, b) => (a.y0 === b.y0 ? a.x0 - b.x0 : a.y0 - b.y0)),
        chars,
        text: fullText,
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

    function bgVariationFor(scene, shape, style, beat, group) {
      const project = state.project;
      const seed = (project && project.styleMode && project.styleMode.seed) || 12345;
      const scoped = scopedBgEntries(style);
      // the scoped entries are part of the result, so they are part of the key
      const scopedKey = scoped.length ? JSON.stringify(scoped.map((entry) => [entry.group, entry.type, entry.params || {}, entry.scope || null])) : '';
      const key = `${seed}|${beat.id}|${group || 'bgShape'}|${JSON.stringify(shape.params)}|${scopedKey}`;
      if (scene.__bgVary && scene.__bgVary.key === key) return scene.__bgVary.value;
      const palette = (style.palette && style.palette.colors) || [];
      const letters = scene.letters.map((letter) => ({
        char: letter.char,
        lineIdx: letter.lineIdx,
        wordIdx: letter.wordIdx,
        path: letter.path,
      }));
      const value = applyScopedBg(SA.vary.letterVariation(shape.params, letters, palette, [seed, beat.id]), scene, style);
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
    // The background reads its colours through the fixed roles (TEXT_BG /
    // TEXT_EDGE) so the beat colour schemes keep text-on-background contrast;
    // the ornaments keep the legacy raw indices.
    const ORN_COLOR_SET = {
      fill: { kind: 'palette', index: 3 },
      fill2: { kind: 'palette', index: 5 },
      stroke: { kind: 'palette', index: 4 },
      glow: { kind: 'palette', index: 3 },
    };

    function roleRef(slot, legacy, colors) {
      const index = SA.compositions && typeof SA.compositions.paletteRefIndex === 'function' ? SA.compositions.paletteRefIndex(colors, slot) : legacy;
      return { kind: 'palette', index };
    }

    function pageColors(style) {
      const ink = textColorHex(style) || '#ffffff';
      let paper = '#14141c';
      if (ink) {
        const rgb = SA.color && SA.color.parse ? SA.color.parse(ink) : null;
        if (rgb) {
          const lum = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
          paper = lum > 128 ? '#14141c' : '#f5f5f7';
        }
      }
      const palette = projectPalette();
      const accent = (palette && (palette.accent || palette.primary)) || '#e0245e';
      return {
        ink,
        paper,
        accent,
        rule: ink,
        muted: ink,
        avatar: accent,
      };
    }

    function drawPageDecor(active, t) {
      if (!shapesPass || !SA.shapeOps || !active) return;
      const { scene, result, style } = active;
      if (!scene || !scene.decor || !scene.decor.length) return;

      const anchor = (result && result.meta && result.meta.anchor) || { x: state.width / 2, y: state.height / 2 };
      const offset = {
        x: anchor.x - (scene.width || state.width) / 2,
        y: anchor.y - (scene.height || state.height) / 2,
      };

      const firstLetter = result.letters && result.letters[0];
      const pe = firstLetter ? (firstLetter.pe != null ? firstLetter.pe : 1) : 1;
      const px = firstLetter ? (firstLetter.px != null ? firstLetter.px : 0) : 0;
      const lead = (style.page && style.page.params && style.page.params.decorLead != null) ? Number(style.page.params.decorLead) : 0.15;
      const fadeIn = Math.min(1, pe + lead * 2);
      const fadeOut = Math.max(0, 1 - (px - lead * 2));
      const opacity = Math.max(0, Math.min(1, fadeIn * fadeOut));
      if (opacity <= 0.001) return;

      const colors = pageColors(style);
      const prims = SA.shapeOps.decorPrimitives(scene.decor, { colors, offset, opacity });
      drawPrimitives(prims);
    }

    // Draws one of the two text-shape passes. `family` 'bg' is the definition
    // background (per-letter cell squares); 'orn' is the text ornament group.
    // Both draw behind the glyphs into the same layer; the caller knocks the
    // glyphs out of whatever was painted.
    function drawBackgroundPass(active, t, project, family) {
      if (!SA.textBg || !SA.vary || !pipeline) return null;
      const isBg = family === 'bg';
      const shapeKey = isBg ? 'bgShape' : 'ornShape';
      const motionKey = isBg ? 'bgMotion' : 'ornMotion';
      const fillKey = isBg ? 'bgFill' : 'ornFill';
      const edgeKey = isBg ? 'bgEdge' : 'ornEdge';
      const { beat, scene, result, style } = active;
      const shape = SA.fx.withDefaults(style[shapeKey], shapeKey);
      if (!shape || !shape.type || shape.type === 'none') return null;
      const variation = bgVariationFor(scene, shape, style, beat, shapeKey);
      const entries = scene.letters.map((letter, index) => ({ letter, state: result.letters[index] }));
      const local = Math.max(0, t - beat.start);
      const analysis = state.analysis;
      const features = analysis && SA.audioAnalysis ? SA.audioAnalysis.features(analysis) : null;
      const bpm = features && Number(features.bpm) > 0 ? Number(features.bpm) : 0;
      const motion = SA.fx.withDefaults(style[motionKey], motionKey);
      const bg = SA.textBg.evaluateBg(shape, motion, entries, variation, null, local, {
        seed: (project.styleMode && project.styleMode.seed) || 12345,
        bpm,
        beatEnv: () => 0.5,
        group: shapeKey,
      });
      if (!bg || !bg.states.length) return null;
      const seed = (project.styleMode && project.styleMode.seed) || 12345;
      const styleParams = (project.styleMode && project.styleMode.params) || {};
      const themeScale = Number(styleParams.textBgScale != null ? styleParams.textBgScale : styleParams.bgScale);
      const rawBase = Number.isFinite(themeScale) && themeScale > 0
        ? themeScale
        : Number(shape.params && (shape.params.scale != null ? shape.params.scale : shape.params.maxScale));
      const baseScale = Number.isFinite(rawBase) && rawBase > 0 ? rawBase : 1;
      if (SA.textBg.backgroundScale && (isBg || (shape.params && shape.params.unit === 'cell' && shape.params.layer === 'behind'))) {
        const scale = SA.textBg.backgroundScale(shape.params, seed, beat.id, baseScale);
        for (const entry of bg.states) {
          if (isBg) {
            entry.sizeX = scale;
            entry.sizeY = scale;
          } else {
            entry.sizeX *= (scale / baseScale);
            entry.sizeY *= (scale / baseScale);
          }
        }
      }
      // the engine-side safety cap: a stored project cannot paint a slab that
      // swallows the text (background cell up to 10+, ornaments held at 2.4 letter boxes).
      if (SA.textBg.capBackground) {
        const boxes = textBoxesPx(scene, result.letters);
        const box = boxes && boxes.box ? { w: boxes.box.x1 - boxes.box.x0, h: boxes.box.y1 - boxes.box.y0 } : null;
        const cellCap = Math.max(10, baseScale * 2.5);
        SA.textBg.capBackground(bg.states, bg.unit, box, isBg ? { cell: cellCap, emExtra: 0.6, emPx: scene.size } : { cell: 2.4, emExtra: 0.6, emPx: scene.size });
      }
      const amountKey = BG_AMOUNT_KEY[shape.type];
      const params = shape.params || {};
      for (const entry of bg.states) {
        entry.amount = amountKey ? Number(params[amountKey] == null ? 5 : params[amountKey]) : 5;
        entry.roughness = Number(params.roughness == null ? 0.5 : params.roughness);
      }
      pipeline.textBackground(scene, result.letters, bg.states, { unit: bg.unit });
      const bgSdf = pipeline.sdf();
      const bgEdges = (style[edgeKey] || []).filter((instance) => instance && instance.enabled !== false);
      const bgFill = SA.fx.withDefaults(style[fillKey], fillKey);
      const paletteColors = (style.palette && style.palette.colors) || [];
      const bgColorSet = isBg
        ? {
            fill: roleRef(7, 3, paletteColors), // TEXT_BG
            fill2: roleRef(7, 3, paletteColors),
            stroke: roleRef(6, 4, paletteColors), // TEXT_EDGE
            glow: roleRef(7, 3, paletteColors),
          }
        : ORN_COLOR_SET;
      const colorSet = SA.fx.resolveColorSet
        ? SA.fx.resolveColorSet(bgColorSet, {
            palettes: project.palettes || [],
            palette: style.palette || null,
            time: t,
            defaultFill: isBg ? '#101018' : '#ff8a3d',
          })
        : { arrays: { fill: [1, 0.54, 0.24, 1], fill2: [1, 0.54, 0.24, 1], stroke: [1, 1, 1, 1] } };
      // the per-letter colour gate for the fill pass: the vary colours, or a scoped
      // solid colour on any letter (a white scoped colour is a colour too)
      const hasVaryColor =
        scopedBgEntries(style).some((entry) => entry.group === 'bgFill' && entry.type === 'solid' && entry.params && entry.params.color) ||
        variation.some((entry) => entry && entry.color && (entry.color[0] !== 1 || entry.color[1] !== 1 || entry.color[2] !== 1));
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
      const cell = SA.textBg.cellMetricsFor(letter);
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
      const view = state.view || {};
      const layers = (project.layers || []).filter((layer) => layer && layer.enabled !== false);
      const backgroundLayers = layerSlotHidden(project, 'background') ? [] : layers.filter((layer) => (layer.slot || 'background') === 'background');
      const foregroundLayers = layerSlotHidden(project, 'foreground') ? [] : layers.filter((layer) => layer.slot === 'foreground');
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
      pipeline.beginScene(backgroundBaseColor(project));
      const duration = naturalDuration();
      const subtitleOnly = view.subtitleOnly === true;
      // the beat colour schemes: the background and the clip tracks follow the
      // live beat's palette. Null keeps the classic path exactly.
      const stage = !subtitleOnly && SA.stagePalette ? SA.stagePalette.stageAt(project, t, SA.project.resolveStyle) : null;
      const stageWeird = rawWeirdOf(project);
      // Evaluate every active beat first (CPU only): overlapping cues must all
      // render, so every track's text is grouped and drawn track by track. The
      // text mask is baked from the same states before any clip draws, so the
      // clip layers can be knocked out under the glyphs.
      const subtitleTracks = (project.tracks || []).filter((track) => track && track.kind === 'subtitle');
      const cueTrackId = (beat) => {
        const cue = (project.script.cues || []).find((entry) => entry.id === beat.cueId);
        return (cue && cue.trackId) || 'sub1';
      };
      const activeBeats = [];
      for (const beat of beats) {
        const scene = buildBeatScene(project, beat, fonts);
        if (!scene.letters.length) continue;
        const result = evaluateBeatState(project, beat, scene, t, beats);
        if (!result.active || !result.letters.length) continue;
        const baseStyle = scene.style || {};
        const style = state.analysis && SA.audioDriver ? SA.audioDriver.resolveStyle(baseStyle, state.analysis, t) : baseStyle;
        activeBeats.push({ beat, scene, result, style, trackId: cueTrackId(beat) });
      }
      const hiddenTracks = new Set(subtitleTracks.filter((track) => track.hidden).map((track) => track.id));
      const visibleBeats = activeBeats.filter((active) => !hiddenTracks.has(active.trackId));
      // the track's graphics row: frame-wide posts (light leaks, vignette,
      // camera moves, shape layers ...) are hidden with it, the style data is
      // never touched
      const graphicsHiddenTracks = new Set(subtitleTracks.filter((track) => track.graphicsHidden).map((track) => track.id));
      const textHiddenTracks = new Set(subtitleTracks.filter((track) => track.textHidden).map((track) => track.id));
      const textActiveBeats = visibleBeats.filter((active) =>
        subtitleTextOn({ textHidden: textHiddenTracks.has(active.trackId) }, view, active.style)
      );
      // the text mask: baked once per frame when a visible lyric meets a clip
      // that still opted in (the figure / backdrop / filler tracks) or a
      // frame-wide graphic about to draw; the glyphs composite back over the
      // graphics, so they can never paint over the subtitle
      const maskWanted = maskTargetsActive(project, t) || graphicsPostsActive(visibleBeats, graphicsHiddenTracks);
      let maskOn = false;
      if (!subtitleOnly && textActiveBeats.length && pipeline && typeof pipeline.buildTextMask === 'function' && maskWanted) {
        maskOn = buildFrameTextMask(textActiveBeats, project);
      }
      // back to front: background clips + background layers -> backdrop clips ->
      // filler clips -> subtitle tracks (bottom to top) -> foreground layers
      if (!subtitleOnly) {
        const maskFor = (clip) => maskOn && trackTextMaskOn(trackById(project, clip.trackId));
        for (const clip of activeClips(project, 'background')) drawBackgroundClip(clip, t, card, stage, stageWeird);
        drawBackgroundLayers();
        for (const clip of activeClips(project, 'backdrop')) drawShapeClip(clip, t, duration, stage, stageWeird, maskFor(clip));
        renderFillerClips(t, duration, stage, stageWeird, maskFor);
        // the figure and text-animation tracks sit between the mid layer and the
        // subtitles, so both draw before the lyric layers
        for (const clip of activeClips(project, 'figure')) drawFigureClip(clip, t, duration, stage, stageWeird, maskFor(clip));
        for (const clip of activeClips(project, 'textAnim')) drawTextClip(clip, t);
      }
      // subtitle tracks whose text background was switched off keep their data
      // (bgShape is untouched) and simply skip the background pass
      const bgHiddenTracks = new Set(subtitleTracks.filter((track) => track.bgHidden).map((track) => track.id));
      const trackOrder = subtitleTracks.map((track) => track.id);
      const beatsByTrack = new Map();
      for (const active of visibleBeats) {
        if (!beatsByTrack.has(active.trackId)) beatsByTrack.set(active.trackId, []);
        beatsByTrack.get(active.trackId).push(active);
      }
      const drawOrder = [];
      for (const trackId of beatsByTrack.keys()) if (!trackOrder.includes(trackId)) drawOrder.push(trackId);
      for (const trackId of [...trackOrder].reverse()) drawOrder.push(trackId);
      for (const active of drawOrder.flatMap((trackId) => beatsByTrack.get(trackId) || [])) {
        const { beat, scene, result, style } = active;
        const graphicsOn = subtitleGraphicsOn({ graphicsHidden: graphicsHiddenTracks.has(active.trackId) }, view);
        const textOn = subtitleTextOn({ textHidden: textHiddenTracks.has(active.trackId) }, view, style);
        const bgShape = SA.fx.withDefaults(style.bgShape, 'bgShape');
        const ornShape = SA.fx.withDefaults(style.ornShape, 'ornShape');
        // the subtitle background switch only silences the definition
        // background (the per-letter cell squares); the ornaments stay
        const bgOff = !subtitleBackgroundOn({ bgHidden: bgHiddenTracks.has(active.trackId) }, view);
        const bgActive = !bgOff && !!(bgShape && bgShape.type && bgShape.type !== 'none');
        const ornActive = !!(ornShape && ornShape.type && ornShape.type !== 'none');
        pipeline.beginLayer();
        drawPageDecor(active, t);
        // both shape passes draw behind the glyphs and commit as a layer of
        // their own (see doc/text-layer-design.md): the foreground mask knocks
        // the glyphs out of it and the layer reaches the scene before the
        // glyph body, so the background / ornaments stay under the text while
        // a text-target post no longer grades them. Ornaments sit under the
        // background.
        const variations = [];
        if (ornActive) {
          const ornVariation = drawBackgroundPass(active, t, project, 'orn');
          if (ornVariation) variations.push(ornVariation);
        }
        if (bgActive) {
          const bgVariation = drawBackgroundPass(active, t, project, 'bg');
          if (bgVariation) variations.push(bgVariation);
        }
        // the per-letter foreground override (fgAutoContrast) is per letter:
        // the shape drawn closest to the text (the background) wins
        let variation = null;
        if (variations.length) {
          variation = variations[variations.length - 1];
          if (variations.length > 1) {
            variation = scene.letters.map((letter, index) => {
              let merged = null;
              for (const list of variations) if (list && list[index]) merged = { ...(merged || {}), ...list[index] };
              return merged;
            });
          }
        }
        const variant = morphVariantFor(project, beat, scene);
        const colorOverride = variation ? bgColorOverrideFor(scene, variation) : null;
        if (textOn) {
          pipeline.text(scene, result.letters, variant, colorOverride);
        }
        // A per-letter text colour is carried by the text mask the text pass
        // just drew, so the glyph body takes it instead of the uniform fill
        // colour. A `paletteIndex` span is left alone: the motion pass already
        // mixes it toward colorB (state.colorMix), which keeps the fill effect.
        const hasLetterColor = !!colorOverride || scene.letters.some((letter) => letter.span && letter.span.color);
        // per-letter blur (blurIn / blurOut / focus / depth of field) runs on
        // the text mask before the sdf so the edges follow the blurred shape
        if (textOn) {
          pipeline.letterBlur(scene, result.letters);
        }
        // A: the definition background (and the ornaments) is a layer of its
        // own. The glyphs are knocked out of it and it commits before the
        // glyph body draws into a fresh layer, so a text-target post (radial
        // wipes, glitch, blur...) can only touch the glyphs. The mask stays
        // in targets.text for the fill / edge passes below.
        if (variation) {
          if (textOn) pipeline.knockout();
          pipeline.commitLayer(1);
          pipeline.beginLayer();
        }
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
        if (textOn) {
          // repeat: arranged copies of the string behind the main text. Variant
          // typefaces re-render the mask, so the sdf is created afterwards.
          drawRepeatCopies(active, t, project, colorSet, fillInstance, category, progress, beats, variant, colorOverride);
        }
        const sdfTarget = textOn ? pipeline.sdf() : null;
        // clones: the same string drawn several times behind the main text with
        // per-copy offset / scale / rotation / color / opacity / motion
        if (textOn) {
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
        }
        const edgeContext = {
          colorSet: colorSet.arrays,
          maxDistance,
          width: state.width,
          height: state.height,
          time: t,
          localTime: t - beat.start,
          palette: style.palette || null,
          palettes: project.palettes || [],
          categoryColors: project.categoryColors || {},
          category: beat.meta && beat.meta.category,
          sdfTexture: sdfTarget ? sdfTarget.texture : null,
        };
        const edges = (style.edge || [])
          .filter((instance) => instance && instance.enabled !== false)
          .flatMap((instance) =>
            SA.fx.edgeUniformsAll
              ? SA.fx.edgeUniformsAll(instance, edgeContext)
              : [SA.fx.edgeUniforms(instance, edgeContext)].filter(Boolean)
          );
        if (textOn && sdfTarget) {
          for (const edge of edges) if (!edge.top) pipeline.edge(edge);
        }
        // A per-letter text colour (a scoped `text` span or a variation
        // fgColor) is carried by the text mask the text pass just drew, so the
        // glyph body takes it instead of the uniform fill colour.
        if (textOn) {
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
              letterTint: hasLetterColor,
            })
          );
          if (sdfTarget) {
            for (const edge of edges) if (edge.top) pipeline.edge(edge);
          }
          drawScopedDecor(active, t, colorSet, category, progress, variant, colorOverride);
        }
        for (const instance of style.edge || []) {
          if (instance && instance.type === 'neonGlow' && (!instance.params || instance.params.bloom !== false)) bloomNeeded = true;
        }
        const audioFeatures = state.analysis && SA.audioAnalysis ? SA.audioAnalysis.features(state.analysis) : null;
        for (const instance of style.post || []) {
          if (!instance || instance.enabled === false || (instance.params && instance.params.enabled === false)) continue;
          if (!graphicsOn && SA.fx.isGraphicsPost && SA.fx.isGraphicsPost(instance)) continue;
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
          } else if (textOn) {
            pipeline.post(uniforms);
          }
        }
        const enterInstance = SA.fx.withDefaults(style.enter, 'enter');
        if (textOn && enterInstance && enterInstance.type === 'typewriter') drawTypewriterCursor(scene, result, enterInstance.params, t);
        if (textOn) {
          for (const copy of echoPlan(style.animation, beat, t, state.width, state.height)) pipeline.commitLayer(copy.opacity, copy);
        }
        pipeline.commitLayer(1);
        const entry = { cueId: beat.cueId, beatId: beat.id, letters: [] };
        if (textOn) {
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
        }
        frame.cues.push(entry);
      }
      if (!subtitleOnly) {
        drawBackgroundLayers();
        drawForegroundLayers();
        renderAlwaysCredits(t, beats, drawForegroundLayers);
      }
      // the frame-wide graphics never paint over the subtitle: the baked text
      // mask restores the glyphs from the pre-post source
      for (const uniforms of framePosts.values()) pipeline.postFrame(uniforms, { mask: maskOn });
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
        gl.clearColor(TRANSPARENT[0], TRANSPARENT[1], TRANSPARENT[2], TRANSPARENT[3]);
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

      const subtitleTracks = (project.tracks || []).filter((track) => track && track.kind === 'subtitle');
      const textHiddenTracks = new Set(subtitleTracks.filter((track) => track.textHidden).map((track) => track.id));
      const cueTrackId = (beat) => {
        const cue = (project.script.cues || []).find((entry) => entry.id === beat.cueId);
        return (cue && cue.trackId) || 'sub1';
      };

      const fonts = state.assets.fonts || [];
      for (const beat of beats) {
        const textTrackId = cueTrackId(beat);
        const baseStyle = SA.project && SA.project.resolveStyle ? SA.project.resolveStyle(project, `cue:${beat.cueId}/beat:${beat.id}`) : {};
        const textOn = subtitleTextOn({ textHidden: textHiddenTracks.has(textTrackId) }, view, baseStyle);
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
        if (textOn) textPass.draw(gl, scene, result.letters, { width: state.width, height: state.height });
        const entry = { cueId: beat.cueId, beatId: beat.id, letters: [] };
        if (textOn) {
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
        }
        frame.cues.push(entry);
      }

      if (state.textTarget) textPass.drawComposite(gl, state.textTarget, backgroundBaseColor(project));
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
      setView,
      setAssets,
      setAudio,
      renderFrame,
      captureRGBA,
      preloadLayers,
      prepareLayers,
      debugError,
      dispose,
      clearColor: TRANSPARENT,
      backgroundBaseColor,
      isLost: () => state.lost,
      isWebGL2: true,
    };
  }

  // Scoped background attributes (`style.scoped`). The colour, the visibility
  // and the opacity of the letters a scope covers ride the same variation entry
  // the vary key already writes, so no new draw path is needed: the background
  // fill pass tints each letter by `entry.color` (maskTint) and the shape quad
  // reads `entry.visible` / `entry.opacity`. Later entries win.
  const SCOPED_BG = ['bgFill', 'bgShape'];
  function scopedBgEntries(style) {
    const list = Array.isArray(style && style.scoped) ? style.scoped : [];
    const out = [];
    if (!SA.fx || typeof SA.fx.expandPreset !== 'function') return out;
    for (const entry of list) {
      if (!entry || entry.enabled === false || !SCOPED_BG.includes(entry.group) || !entry.type) continue;
      // a letter-wise preset carries its parameters as defaults, so the entry is
      // resolved (and a preset expanded to its primitive) before it is read
      const resolved = SA.fx.expandPreset({ type: entry.type, params: entry.params, enabled: true }, entry.group);
      if (!resolved || !resolved.type) continue;
      out.push({ group: entry.group, type: resolved.type, params: resolved.params || {}, scope: entry.scope || null });
    }
    return out;
  }
  function applyScopedBg(value, scene, style) {
    const entries = scopedBgEntries(style);
    if (!entries.length || !SA.scope || typeof SA.scope.scopeMask !== 'function') return value;
    for (const entry of entries) {
      const mask = SA.scope.scopeMask(scene, entry.scope || null);
      if (!mask) continue;
      const params = entry.params || {};
      for (let i = 0; i < value.length && i < mask.length; i += 1) {
        if (!mask[i]) continue;
        const slot = value[i];
        if (!slot) continue;
        if (entry.group === 'bgShape') {
          // `none` hides the letter's square, any other type shows it again
          if (entry.type === 'none') slot.visible = false;
          else if (slot.visible === false) slot.visible = true;
          if (params.opacity != null) slot.opacity = Math.max(0, Math.min(1, Number(params.opacity) || 0));
        } else if (entry.type === 'solid') {
          const rgba = params.color && SA.color && typeof SA.color.parse === 'function' ? SA.color.parse(params.color) : null;
          if (rgba) slot.color = [rgba.r, rgba.g, rgba.b, rgba.a == null ? 1 : rgba.a];
        }
      }
    }
    return value;
  }

  return { createEngine, supportsWebGL2: (canvas) => SA.gl.supportsWebGL2(canvas), beatForCue, activeBeats, beatOpacity, subtitleBackgroundOn, subtitleGraphicsOn, subtitleTextOn, trackTextMaskOn, maskRadius, partitionPlanes, graphicsPostsActive, backgroundBaseColor, scopedBgEntries, applyScopedBg, isClipDisabled, activeClips };
})();
