(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.direct = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // The look a "Generate" run owns: the theme groups and the beat groups the
  // automatic direction rewrites. A re-run replaces exactly these, so hand-made
  // edits outside the list survive.
  const AUTO_DIRECT_GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'repeat', 'clones', 'text', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion'];
  // what a cue takes from its own drawn look when the weird axis gives it one:
  // the motion and the text treatment. Layout, location, colours and the font
  // stay with the song so the lyrics keep their place and palette (a very weird
  // song lets the cue look move layout and location too).
  const CUE_LOOK_GROUPS = ['animation', 'enter', 'exit', 'hold', 'fill', 'edge', 'post', 'repeat', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion'];
  const AUTO_DIRECT_BEAT_GROUPS = ['layout', 'location', 'edge', 'background', 'animation', 'enter', 'exit', 'hold', 'post', 'color', 'palette', 'text', 'transform', 'repeat', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion'];
  const AUTO_DIRECT_LOCKS = ['layout', 'fill', 'background', 'edge', 'location', 'bg'];
  // the tracks a run owns (only clips carrying `auto` are replaced)
  const AUTO_TRACK_KINDS = ['background', 'backdrop', 'filler', 'figure'];

  function pick(random, list) {
    return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  }

  function trackIdFor(projectDoc, kind) {
    const track = (projectDoc.tracks || []).find((entry) => entry.kind === kind);
    return track ? track.id : null;
  }

  function nextClip(projectDoc, prefix, fields) {
    return { id: SA.project.nextClipId(projectDoc, prefix), auto: true, ...fields };
  }

  // Common preparation: the axes, the size band, the palette and the accent
  // colours. Everything a run needs that does not depend on the document state
  // it rewrites.
  function prepare(doc, options) {
    const opts = options || {};
    const axes = { ...(opts.axes || {}) };
    // the saved axis stays raw; each consumer derives its own channel value
    const rawW = SA.moods.weirdOf(axes);
    axes.weird = rawW;
    const w = SA.moods.textWeirdOf(axes);
    const wb = SA.moods.bgWeirdOf(axes);
    const s = SA.moods.smartOf(axes);
    const analysis = opts.analysis || null;
    const features = analysis && SA.audioAnalysis ? SA.audioAnalysis.features(analysis) : null;
    const bpm = features && Number(features.bpm) > 0 ? Number(features.bpm) : 120;
    const output = (doc && doc.output) || {};
    const portrait = (output.aspect || '16:9') === '9:16';
    const frameW = Number(output.width) || (portrait ? 1080 : 1920);
    const frameH = Number(output.height) || (portrait ? 1920 : 1080);
    // the text size is a ratio of the frame's short side, so both aspects read
    // the same. The sixth axis moves the allowed band, never the base draw.
    const screen = Math.min(frameW, frameH);
    const minSize = (portrait ? 52 : 72) - 16 * w;
    const maxSize = (portrait ? 96 : 124) + (portrait ? 50 : 80) * w;
    const themeStyle = opts.themeStyle ? SA.project.mergeDeep({}, opts.themeStyle) : null;
    // the stored looks carry frozen glow params; tame them once for the text
    // channel (the generator tames the edges it draws itself)
    if (themeStyle) SA.moods.tameGlow(themeStyle, rawW);
    const cueLooks = opts.cueLooks || {};
    for (const entry of Object.values(cueLooks)) {
      if (entry && entry.style) SA.moods.tameGlow(entry.style, rawW);
    }
    if (themeStyle && themeStyle.text) {
      themeStyle.text = {
        ...themeStyle.text,
        size: Math.max(minSize, Math.min(maxSize, Number(themeStyle.text.size) || (portrait ? 72 : 96))),
      };
    }
    const palette = (themeStyle && themeStyle.palette && themeStyle.palette.colors) || [];
    const bgColor = SA.color.parse(palette[0] || '#000000');
    const accentIdx = [3, 5, 6, 2].filter((i) => palette[i] && SA.color.contrastRatio(SA.color.parse(palette[i]), bgColor) >= 3);
    const accentHexes = accentIdx.map((i) => palette[i]);
    const baseSize = Number((themeStyle && themeStyle.text && themeStyle.text.size) || (portrait ? 72 : 96));
    const energy = Math.max(0, Math.min(1, Number(axes.energy) || 0.5));
    // Phrase rhythm: a weird song lays a pattern library over the bars instead
    // of cutting every cue on the same grid (w=0 keeps the old output exactly).
    let rhythm = null;
    if (w > 0 && SA.rhythm && doc && doc.script) {
      rhythm = SA.rhythm.plan({
        bpm,
        axes: { ...axes, weird: w },
        seed: opts.seed,
        spans: doc.script.cues.map((cue) => ({
          id: cue.id,
          start: Number(cue.start) || 0,
          end: Number(cue.end) || (Number(cue.start) || 0) + 1,
          charCount: String(cue.text || '').replace(/\s/g, '').length,
        })),
      });
    }
    return {
      axes,
      w,
      wb,
      rawW,
      s,
      seed: opts.seed,
      genre: opts.genre || null,
      direction: opts.direction || 'horizontal',
      look: opts.look || null,
      lookClip: opts.lookClip || null,
      themeStyle,
      cueLooks: opts.cueLooks || {},
      analysis,
      bpm,
      rhythm,
      portrait,
      frameW,
      frameH,
      screen,
      baseSize,
      baseRatio: baseSize / Math.max(1, screen),
      accentIdx,
      accentHexes,
      energy,
    };
  }

  // A cue's own drawn look and the weird-axis patches (palette, location, font,
  // repeat, clones) plus the fallback entrance/exit when the run has no drawn
  // look. Beat-level work is directBeat.
  function directCue(projectDoc, cue, cueIndex, ctx) {
    const { w, axes, seed, genre, direction, themeStyle, cueLooks, look } = ctx;
    if (cueLooks[cue.id]) {
      projectDoc.cueStyles[cue.id] = SA.project.mergeDeep(projectDoc.cueStyles[cue.id] || {}, JSON.parse(JSON.stringify(cueLooks[cue.id].style)));
    }
    const cueContext = SA.moods.contextForCue(projectDoc, cue);
    if (w > 0) {
      // E3: a weird song lets every cue draw its own colours, position,
      // font, repeat and clones. The draws are seeded per cue, so a seed
      // reproduces them and weird 0 consumes none of them.
      const cr = SA.rng.rngFor(seed + cueIndex * 131, cue.id, 'weird-cue');
      const own = () => projectDoc.cueStyles[cue.id] || (projectDoc.cueStyles[cue.id] = {});
      // palette
      if (themeStyle.palette && cr() < 0.6 * w) {
        const palette = SA.moods.weirdPalette(cr, themeStyle.palette, w);
        if (palette) {
          // the per-cue palette keeps the legibility of the raw axis, not of
          // the tamed text channel
          SA.moods.repairContrast(palette.colors, SA.weird.paletteContrast(ctx.rawW));
          projectDoc.cueStyles[cue.id] = { ...SA.moods.recolor(own(), themeStyle.palette.colors, palette.colors), palette };
        }
      }
      // location (G8): nudge the anchor and sometimes let it float
      if (cr() < 0.5 * w) {
        const base = own().location || themeStyle.location || { type: 'center', params: {} };
        const type = w >= 0.6 && cr() < 0.3 * w ? 'randomSafe' : base.type;
        own().location = {
          ...base,
          type,
          params: {
            ...(base.params || {}),
            offsetX: Math.round((cr() * 2 - 1) * 0.25 * w * 100) / 100,
            offsetY: Math.round((cr() * 2 - 1) * 0.25 * w * 100) / 100,
          },
          enabled: true,
        };
      }
      // font (I17)
      if (cr() < 0.3 * w) {
        const fontId = SA.moods.weirdFont(cr, cueContext, themeStyle.text && themeStyle.text.fontId);
        if (fontId) own().text = { ...(own().text || {}), fontId };
      }
      // repeat (G2)
      if (SA.random && SA.random.repeatPatch && cr() < 0.35 * w) {
        const merged = { ...themeStyle, ...own() };
        const repeat = SA.random.repeatPatch(cr, { ...cueContext, weird: w });
        if (repeat && !SA.random.repeatConflicts({ ...merged, repeat })) own().repeat = repeat;
      }
      // clones (G3)
      if (cr() < 0.5 * w) {
        const count = 1 + Math.floor(cr() * 3);
        const s = (a) => Math.round((cr() * 2 - 1) * a * 1000) / 1000;
        own().clones = Array.from({ length: count }, (_, i) => ({
          id: `wclone_${i}`,
          enabled: true,
          dx: s(0.06 * w),
          dy: s(0.06 * w),
          scale: Math.round((1 + s(0.3 * w)) * 100) / 100,
          rotate: Math.round(s(15 * w)),
          opacity: Math.round((0.35 + cr() * 0.25) * 100) / 100,
          hue: Math.round(s(180 * w)),
          delay: Math.round((0.03 + cr() * 0.09) * 100) / 100,
          motion: {
            type: pick(cr, ['drift', 'float', 'pulse', 'orbit', 'spin']),
            amount: Math.round((0.02 + 0.04 * w) * 1000) / 1000,
            speed: Math.round((0.5 + cr() * 1.5) * 100) / 100,
          },
        }));
      }
    }
    if (!look) {
      const generated = SA.moods.generate({
        axes,
        seed: seed + cueIndex * 131 + 1,
        direction,
        genre,
        context: cueContext,
        emphasis: SA.moods.isEmphasis ? SA.moods.isEmphasis(cue) : false,
      }).style;
      projectDoc.cueStyles[cue.id] = SA.project.mergeDeep(projectDoc.cueStyles[cue.id] || {}, {
        enter: generated.enter,
        exit: generated.exit,
      });
    }
  }

  // The hold a beat may carry: pulse (the legacy default) at smartness 0, a
  // smartness-weighted draw from the calm hold pool above it.
  const BEAT_HOLD_TYPES = ['pulse', 'opacityPulse', 'heartbeat', 'breathing', 'floatBob', 'sway', 'drift', 'kenBurns'];

  function smartHold(random, s, amount, pulseBpm) {
    if (!(s > 0)) return { type: 'pulse', params: { amount, bpm: pulseBpm }, enabled: true };
    const type = SA.moods.smartness.pickWeighted(random, 'hold', BEAT_HOLD_TYPES, s) || 'pulse';
    if (type === 'pulse') return { type, params: { amount, bpm: pulseBpm }, enabled: true };
    if (type === 'heartbeat') return { type, params: { bpm: pulseBpm }, enabled: true };
    return { type, params: {}, enabled: true };
  }

  // One beat's treatment inside the cue's theme. The size the sixth axis picks
  // is a ratio of the frame's short side (3%..120%), not a magnification of the
  // theme size: a weird song jumps between a whisper and a screen-filling word.
  function directBeat(projectDoc, cue, beat, beatIndex, cueIndex, ctx) {
    const { w, s, axes, seed, genre, direction, themeStyle, baseSize, energy, bpm, accentIdx, accentHexes } = ctx;
    const cueContext = SA.moods.contextForCue(projectDoc, cue);
    const beatSeed = seed + cueIndex * 131 + beatIndex + 1;
    const beatRng = SA.rng.rngFor(beatSeed, beat.id, 'beat');
    const size = Math.round(baseSize * (0.9 + beatRng() * 0.25));
    const beatPatch = { text: { size } };
    const beatDuration = Math.max(0.2, beat.end - beat.start);
    if (beatDuration >= 1.2 && energy > 0.45 && beatRng() < 0.1) {
      const pulseBpm = w > 0 ? Math.round(bpm * pick(beatRng, [0.5, 1, 1, 2])) : Math.round(bpm);
      beatPatch.hold = [smartHold(beatRng, s, Math.round((0.02 + energy * 0.08) * 1000) / 1000, pulseBpm)];
    }
    if (w > 0) {
      // E4 / I18 / H5: a weird song steps the beat treatment as well:
      // size, colour, tilt, font and hold all jump half a bar
      const wr = SA.rng.rngFor(beatSeed, beat.id, 'weird');
      const lo = SA.moods.bend(0.9, 0.45, w);
      const hi = SA.moods.bend(1.15, 2.2, w);
      beatPatch.text.size = Math.round(Math.max(24, Math.min(ctx.portrait ? 220 : 320, baseSize * (lo + wr() * (hi - lo)))));
      if (accentIdx.length && wr() < 0.5 * w) {
        if (accentIdx.length >= 2 && wr() < 0.3 * w) {
          const [a, b] = [accentIdx[Math.floor(wr() * accentIdx.length)], accentIdx[Math.floor(wr() * accentIdx.length)]];
          beatPatch.color = {
            fill: {
              kind: 'gradient',
              type: 'linear',
              angle: Math.round(wr() * 360),
              stops: [
                { pos: 0, paletteIndex: a },
                { pos: 1, paletteIndex: b },
              ],
              animate: { angleSpeed: Math.round((wr() * 2 - 1) * 90 * w), shiftSpeed: 0 },
            },
          };
        } else beatPatch.color = { fill: { kind: 'palette', index: accentIdx[Math.floor(wr() * accentIdx.length)] } };
      }
      if (wr() < 0.4 * w) {
        const r = (a) => Math.round((wr() * 2 - 1) * a * w * 10) / 10;
        beatPatch.transform = { rotate: r(25), tiltX: r(20), tiltY: r(20) }; // degrees (the shader converts)
      }
      if (!beatPatch.hold && beatDuration >= 0.6 && wr() < 0.45 * w) {
        const hold =
          w >= 0.5
            ? SA.moods.weirdBeatHold(wr, axes, cueContext, accentHexes)
            : smartHold(wr, s, Math.round((0.06 + 0.1 * w) * 1000) / 1000, Math.round(bpm * pick(wr, [0.5, 1, 1, 2])));
        if (hold) beatPatch.hold = [hold];
      }
      if (wr() < 0.3 * w) {
        const g = SA.moods.generate({ axes, seed: beatSeed * 7 + 3, direction, genre, context: cueContext }).style;
        if (g.enter) beatPatch.enter = g.enter;
        if (g.exit) beatPatch.exit = g.exit;
      }
      if (w >= 0.6 && wr() < 0.25 * w) {
        const fontId = SA.moods.weirdFont(wr, cueContext, themeStyle.text && themeStyle.text.fontId);
        if (fontId) beatPatch.text.fontId = fontId;
      }
    }
    projectDoc.beatStyles[beat.id] = SA.project.mergeDeep(projectDoc.beatStyles[beat.id] || {}, beatPatch);
  }

  // The filler presets a run may place: pattern / split / figures / combo /
  // particles (never text — a gap is not a caption), minus the genre's excludes
  // and minus the specs the seventh axis rates below its floor.
  function fillerPresetPool(ctx, groupSet) {
    if (!SA.fillerPresets || typeof SA.fillerPresets.list !== 'function' || !SA.fillerRender) return [];
    const groups = groupSet || new Set(['pattern', 'split', 'figures', 'combo', 'particles']);
    const source = ctx && ctx.genre;
    const genre = typeof source === 'string' ? (SA.genres && SA.genres.get ? SA.genres.get(source) : null) : source;
    const exclude = new Set(genre && genre.clips && genre.clips.filler && Array.isArray(genre.clips.filler.exclude) ? genre.clips.filler.exclude : []);
    const s = ctx && ctx.s != null ? ctx.s : SA.moods.smartOf(ctx && ctx.axes);
    return SA.fillerPresets.list().filter((preset) => {
      if (!groups.has(preset.group)) return false;
      if (SA.moods.smartness.weight(SA.moods.smartness.rateSpec(preset.spec), s) <= 0) return false;
      return !SA.fillerRender.layersOf(preset.spec).some((layer) => exclude.has(layer.type));
    });
  }

  function presetWeight(preset, s) {
    return SA.moods.smartness.weight(SA.moods.smartness.rateSpec(preset.spec), s);
  }

  // One deterministic preset spec for a gap kind (same seed -> same preset),
  // smartness-weighted so the calm library leads.
  function fillerPresetSpec(ctx, kind, groupSet) {
    const pool = fillerPresetPool(ctx, groupSet);
    if (!pool.length) return null;
    const random = SA.rng.rngFor(ctx.seed, 'filler-preset', kind);
    const s = ctx && ctx.s != null ? ctx.s : SA.moods.smartOf(ctx && ctx.axes);
    let preset = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
    if (s > 0) {
      const weights = pool.map((entry) => presetWeight(entry, s));
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      if (total > 0) {
        let roll = random() * total;
        for (let i = 0; i < pool.length; i += 1) {
          roll -= weights[i];
          if (roll <= 0) {
            preset = pool[i];
            break;
          }
        }
      }
    }
    return SA.fillerPresets.specOf(preset.id);
  }

  // The filler kinds a run writes into the project settings. Item 8: gaps show
  // the built-in preset library (figures and the other moving primitives)
  // instead of the fixed shapes / spectrum / particles trio. The backdrop
  // channel scales the counts and speeds.
  function fillerSettings(projectDoc, ctx) {
    const w = ctx.wb;
    const interlude = fillerPresetSpec(ctx, 'interlude');
    const longGap = fillerPresetSpec(ctx, 'longGap');
    // intro / outro keep a figures motif next to the credits element
    const figuresOnly = new Set(['figures']);
    const introFigures = fillerPresetSpec(ctx, 'intro-figures', figuresOnly);
    const outroFigures = fillerPresetSpec(ctx, 'outro-figures', figuresOnly);
    const kinds = {
      intro: { type: 'combo', params: { list: [{ type: 'credits', params: {} }, introFigures || { type: 'figures', params: {} }] } },
      interlude: interlude || { type: 'figures', params: {} },
      outro: { type: 'combo', params: { list: [{ type: 'credits', params: {} }, outroFigures || { type: 'figures', params: {} }] } },
    };
    if (w > 0) {
      // a weird song bounces harder: the figure density follows the axis
      const bump = (spec) => {
        const params = spec && spec.params;
        if (!params) return;
        if (typeof params.density === 'number') params.density = Math.round(Math.min(1, params.density * (1 + w)) * 100) / 100;
        if (Array.isArray(params.list)) params.list.forEach(bump);
      };
      Object.values(kinds).forEach(bump);
      bump(longGap);
    }
    return {
      enabled: true,
      minGap: 0.8,
      margin: 0.15,
      byKind: kinds,
      longGap: { threshold: 5, spec: longGap || { type: 'figures', params: {} } },
    };
  }

  // One background clip for the whole song. User clips on the track (no `auto`)
  // are never touched; only when the track is empty does the run place its own.
  function backgroundClip(projectDoc, ctx, total) {
    if (!(total > 0)) return;
    const bgTrack = trackIdFor(projectDoc, 'background');
    if (!bgTrack) return;
    const userClip = (projectDoc.clips || []).some((clip) => clip.trackId === bgTrack && !clip.auto);
    if (userClip) return;
    const { axes, seed, genre, lookClip } = ctx;
    // the drawn look brings its own background clip; otherwise the axes roll a
    // calm noise gradient (flat gradients as the floor). The weird axis no
    // longer rewrites the background: it expands the mid (backdrop) layer.
    const result = SA.moods.rerollClipSpec('background', { axes, seed, genre });
    const spec = lookClip || (result && result.spec && result.spec.type !== 'solid' && result.spec.type !== 'gradient' ? result.spec : { type: 'gradient', params: { scale: 1.2, speed: 0.1 } });
    projectDoc.clips.push(nextClip(projectDoc, 'clip_bg', {
      trackId: bgTrack,
      start: 0,
      end: total,
      spec,
      opacity: 1,
      fadeIn: 0.6,
      fadeOut: 0.6,
      colors: result && result.colors ? result.colors : null,
    }));
  }

  // One backdrop (mid) clip per cue. Its `coverage` (how much of the frame the
  // painted planes take) is the backdrop channel of the weird axis; hand-made
  // clips on the track survive. With coverage >= 0.5 the clip spans to the next
  // cue (the first from 0, the last to the end of the song) so the backdrop
  // never blinks out in a filler gap.
  function backdropClipFor(projectDoc, cue, index, ctx) {
    const { axes, seed, genre, wb: w, themeStyle } = ctx;
    const cueStyle = (projectDoc.cueStyles && projectDoc.cueStyles[cue.id]) || null;
    let palette = (cueStyle && cueStyle.palette) || (themeStyle && themeStyle.palette) || null;
    // the mid layer changes colour every four cues, so a long song never sits
    // on one palette (w=0 keeps the classic look alone)
    if (w > 0 && palette && Array.isArray(palette.colors) && palette.colors.length) {
      const random = SA.rng.rngFor(seed, 'mid-section', Math.floor(index / 4));
      palette = SA.moods.jitterPalette(random, palette, axes, 1 + 3 * w);
    }
    const result = SA.moods.rerollClipSpec('backdrop', {
      axes,
      seed: seed + index * 977 + 3,
      genre,
      index: seed + index,
      palette,
      coverage: w,
      cuts: ctx.rhythm && ctx.rhythm[cue.id] ? ctx.rhythm[cue.id] : null,
    });
    if (!result) return null;
    const full = w >= 0.5;
    return nextClip(projectDoc, 'clip_mid', {
      trackId: trackIdFor(projectDoc, 'backdrop'),
      start: cue.start,
      end: cue.end,
      spec: result.spec,
      opacity: full ? 1 : 0.9,
      fadeIn: full ? 0 : 0.4,
      fadeOut: full ? 0 : 0.4,
      colors: result.colors,
    });
  }

  function backdropClips(projectDoc, ctx) {
    const midTrack = trackIdFor(projectDoc, 'backdrop');
    if (!midTrack) return;
    const cues = (projectDoc.script && projectDoc.script.cues) || [];
    // a weird song always gets its mid layer; the density axis still gates the
    // classic draw (w=0 unchanged)
    if (!(ctx.wb > 0 || ctx.axes.density > 0.45)) return;
    const total = cues.reduce((max, cue) => Math.max(max, Number(cue.end) || 0), 0);
    cues.forEach((cue, index) => {
      const clip = backdropClipFor(projectDoc, cue, index, ctx);
      if (!clip) return;
      if (ctx.wb >= 0.5) {
        clip.start = index === 0 ? 0 : Number(cue.start) || 0;
        const next = cues[index + 1];
        clip.end = next ? Number(next.start) || clip.end : total;
        if (clip.end <= clip.start + 0.05) clip.end = Math.max(Number(cue.end) || 0, clip.start + 0.05);
      }
      projectDoc.clips.push(clip);
    });
  }

  // Filler clips materialised from the gaps between the cues.
  function fillerClips(projectDoc, ctx, total) {
    const fillerTrack = trackIdFor(projectDoc, 'filler');
    if (!fillerTrack || !SA.fillers) return;
    const cues = (projectDoc.script && projectDoc.script.cues) || [];
    const gaps = SA.fillers.gaps(cues, total, SA.fillers.settingsFor(projectDoc));
    const s = ctx.s != null ? ctx.s : SA.moods.smartOf(ctx.axes);
    const pool = fillerPresetPool(ctx);
    // the previous gap's preset must not show up again in the next one
    let previousPresetId = null;
    gaps.forEach((gap, gapIndex) => {
      let spec = JSON.parse(JSON.stringify(gap.spec || { type: 'none', params: {} }));
      if (!gap.pinned && (gap.kind === 'interlude' || gap.long) && pool.length) {
        const candidates = pool.filter((preset) => preset.id !== previousPresetId);
        const list = candidates.length ? candidates : pool;
        const random = SA.rng.rngFor(ctx.seed, 'filler-gap', gap.key);
        const weights = list.map((preset) => presetWeight(preset, s));
        const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
        let preset = list[Math.min(list.length - 1, Math.floor(random() * list.length))];
        if (weightTotal > 0) {
          let roll = random() * weightTotal;
          for (let i = 0; i < list.length; i += 1) {
            roll -= weights[i];
            if (roll <= 0) {
              preset = list[i];
              break;
            }
          }
        }
        const presetSpec = SA.fillerPresets.specOf(preset.id);
        if (presetSpec) spec = presetSpec;
        previousPresetId = preset.id;
      } else if (gap.spec && gap.spec.presetId) {
        previousPresetId = gap.spec.presetId;
      }
      // figures in the gaps: generated per gap so every gap has its own motif.
      // A preset's own motif / sync / moves / placement survive the generation.
      if (SA.figures) {
        const asFigures = (entry) => entry && entry.type === 'figures';
        const beatCuts = cues.map((cue) => cue.start).filter((cut) => cut > gap.from && cut < gap.to);
        const palette = (ctx.themeStyle && ctx.themeStyle.palette && ctx.themeStyle.palette.colors) || [];
        const regenerate = (entry, extraSeed, id) => {
          const params = (entry && entry.params) || {};
          const generated = SA.figures.generate({
            span: { start: gap.from, end: gap.to },
            axes: ctx.axes,
            seed: ctx.seed + gapIndex * 53 + extraSeed,
            id,
            motif: params.motif,
            sync: params.sync,
            density: params.density,
            in: params.in,
            hold: params.hold,
            out: params.out,
            scale: params.scale,
            x: params.x,
            y: params.y,
            color: params.color,
            palette,
            cuts: ctx.rhythm ? Object.values(ctx.rhythm).flat() : beatCuts,
          });
          return { ...(entry || {}), type: 'figures', params: { ...params, ...generated.params } };
        };
        if (asFigures(spec)) {
          spec = regenerate(spec, 0, gap.key);
        } else if (spec.type === 'combo' && Array.isArray(spec.params && spec.params.list)) {
          spec.params.list = spec.params.list.map((part) => (asFigures(part) ? regenerate(part, 1, `${gap.key}:combo`) : part));
        }
      }
      projectDoc.clips.push(nextClip(projectDoc, 'clip_filler', {
        trackId: fillerTrack,
        start: gap.from,
        end: gap.to,
        spec,
        opacity: 1,
        fadeIn: 0.3,
        fadeOut: 0.3,
        colors: null,
      }));
    });
  }

  // One figure clip per cue: animated motifs on the figure track (only once the
  // backdrop channel is on, so the w=0 output stays exactly as before).
  function figureClipFor(projectDoc, cue, index, ctx) {
    const track = trackIdFor(projectDoc, 'figure');
    if (!track || !SA.figures) return null;
    const { wb: w, axes, seed } = ctx;
    const density = Math.max(0.15, Math.min(1, 0.25 + 0.6 * ctx.energy + 0.2 * w));
    if (density < 0.3 && w < 0.2 && index % 3 !== 0) return null;
    const beats = (projectDoc.beats && projectDoc.beats[cue.id]) || [];
    const cueStyle = (projectDoc.cueStyles && projectDoc.cueStyles[cue.id]) || {};
    const palette = (cueStyle.palette && cueStyle.palette.colors) || (ctx.themeStyle && ctx.themeStyle.palette && ctx.themeStyle.palette.colors) || [];
    const roll = SA.rng.rngFor(seed + index * 313, cue.id, 'figure')();
    const textWeight = w >= 0.6 ? 0.3 : 0.4;
    const sync = roll < textWeight ? 'text' : roll < textWeight + 0.4 ? 'beat' : 'free';
    const spec = SA.figures.generate({
      span: { start: cue.start, end: cue.end },
      beats: beats.map((beat) => ({ start: beat.start, end: beat.end })),
      axes,
      seed: seed + index * 53,
      id: cue.id,
      palette,
      sync,
      density,
      cuts: ctx.rhythm && ctx.rhythm[cue.id] ? ctx.rhythm[cue.id] : null,
    });
    return nextClip(projectDoc, 'clip_fig', {
      trackId: track,
      start: cue.start,
      end: cue.end,
      spec,
      opacity: 0.9,
      fadeIn: 0,
      fadeOut: 0,
      colors: null,
    });
  }

  function figureClips(projectDoc, ctx) {
    if (!(ctx.wb > 0)) return;
    if (!trackIdFor(projectDoc, 'figure')) return;
    const cues = (projectDoc.script && projectDoc.script.cues) || [];
    cues.forEach((cue, index) => {
      const clip = figureClipFor(projectDoc, cue, index, ctx);
      if (clip) projectDoc.clips.push(clip);
    });
  }

  // The whole run on one project document. Order matters: the text flow is
  // rebuilt first (the beats the run styles come from it), then the theme, the
  // cues and beats, the filler settings and finally the clips.
  function run(projectDoc, ctx) {
    const { w, seed, themeStyle, look, cueLooks } = ctx;
    // 0) one beat per musical bar: the bar length comes from the audio BPM
    // when a track is loaded (4/4 assumed), otherwise from a 120 BPM default
    const barDuration = Math.round((60 / ctx.bpm) * 4 * 1000) / 1000;
    // G1: a weird song cuts its phrases into shorter chunks
    const chunkDuration = Math.round(barDuration * (1 - 0.5 * w) * 1000) / 1000;
    projectDoc.textFlow = { ...(projectDoc.textFlow || {}), chunk: 'phrase', targetChunkDuration: chunkDuration };
    projectDoc.script.cues.forEach((cue, cueIndex) => {
      cue.textFlow = { ...(cue.textFlow || {}), chunk: 'phrase', targetChunkDuration: chunkDuration };
      const cuts = ctx.rhythm && ctx.rhythm[cue.id];
      if (cuts && cuts.length) cue.textFlow.chunkPlan = cuts.slice();
      else if (cue.textFlow.chunkPlan) delete cue.textFlow.chunkPlan;
      if (w > 0) {
        // a weird song varies how long a repeated page holds
        const lh = SA.rng.rngFor(seed + cueIndex * 131, cue.id, 'longhold');
        cue.textFlow.longHold = { ...(cue.textFlow.longHold || {}), interval: Math.round(4 * (0.75 + lh() * 0.5) * 100) / 100 };
      }
    });
    if (SA.textflow) SA.textflow.apply(projectDoc);
    // 1) rebuild the theme from scratch so re-rolls never keep stale groups
    for (const group of AUTO_DIRECT_GROUPS) delete projectDoc.style[group];
    projectDoc.style = SA.project.mergeDeep(projectDoc.style, themeStyle);
    // remember which theme was applied so the UI can show it, and so cue /
    // clip re-rolls can stay inside the same axes
    const themeName = (themeStyle && themeStyle.palette && (themeStyle.palette.name || themeStyle.palette.id)) || '';
    projectDoc.styleMode = {
      ...(projectDoc.styleMode || {}),
      seed,
      theme: themeName,
      axes: ctx.axes,
      direction: ctx.direction,
      genre: ctx.genre,
      look: look ? { n: look.n, name: look.name, group: look.group, type: look.type, motion: look.motion } : null,
      cueLooks: Object.fromEntries(Object.entries(cueLooks).map(([cueId, entry]) => [cueId, entry.n])),
    };
    for (const cue of projectDoc.script.cues) {
      const container = projectDoc.cueStyles[cue.id];
      if (!container) continue;
      for (const group of AUTO_DIRECT_GROUPS) delete container[group];
      delete container.palette; // a re-roll rebuilds the colours from scratch
      if (!Object.keys(container).length) delete projectDoc.cueStyles[cue.id];
    }
    projectDoc.beatStyles = projectDoc.beatStyles || {};
    for (const [beatId, existing] of Object.entries(projectDoc.beatStyles)) {
      for (const group of AUTO_DIRECT_BEAT_GROUPS) delete existing[group];
      if (!Object.keys(existing).length) delete projectDoc.beatStyles[beatId];
    }
    // 2) per-cue motion inside the same theme ...
    projectDoc.script.cues.forEach((cue, cueIndex) => {
      directCue(projectDoc, cue, cueIndex, ctx);
    });
    projectDoc.script.cues.forEach((cue, cueIndex) => {
      const beats = (projectDoc.beats && projectDoc.beats[cue.id]) || [];
      beats.forEach((beat, beatIndex) => {
        directBeat(projectDoc, cue, beat, beatIndex, cueIndex, ctx);
      });
    });
    // 3) the filler settings, then the clips: a re-run replaces the clips it
    // owns (auto) and leaves subtitle and hand-made clips alone.
    projectDoc.fillers = SA.project.mergeDeep(projectDoc.fillers || {}, fillerSettings(projectDoc, ctx));
    const cues = projectDoc.script.cues || [];
    const total = cues.reduce((max, cue) => Math.max(max, Number(cue.end) || 0), 0);
    const managed = new Set(
      (projectDoc.tracks || []).filter((track) => AUTO_TRACK_KINDS.includes(track.kind)).map((track) => track.id)
    );
    projectDoc.clips = (projectDoc.clips || []).filter((clip) => !(managed.has(clip.trackId) && clip.auto));
    backgroundClip(projectDoc, ctx, total);
    backdropClips(projectDoc, ctx);
    fillerClips(projectDoc, ctx, total);
    figureClips(projectDoc, ctx);
  }

  return {
    AUTO_DIRECT_GROUPS,
    AUTO_DIRECT_BEAT_GROUPS,
    AUTO_DIRECT_LOCKS,
    AUTO_TRACK_KINDS,
    CUE_LOOK_GROUPS,
    prepare,
    directCue,
    directBeat,
    backgroundClip,
    backdropClipFor,
    backdropClips,
    fillerSettings,
    fillerClips,
    figureClipFor,
    figureClips,
    run,
  };
});
