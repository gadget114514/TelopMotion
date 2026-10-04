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
  const AUTO_DIRECT_GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'repeat', 'clones', 'text', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion', 'ornShape', 'ornFill', 'ornEdge', 'ornMotion'];
  // what a cue takes from its own drawn look when the weird axis gives it one:
  // the motion and the text treatment. Layout, location, colours and the font
  // stay with the song so the lyrics keep their place and palette (a very weird
  // song lets the cue look move layout and location too).
  const CUE_LOOK_GROUPS = ['animation', 'enter', 'exit', 'hold', 'fill', 'edge', 'post', 'repeat', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion', 'ornShape', 'ornFill', 'ornEdge', 'ornMotion'];
  const AUTO_DIRECT_BEAT_GROUPS = ['layout', 'location', 'edge', 'background', 'animation', 'enter', 'exit', 'hold', 'post', 'color', 'palette', 'paletteIndex', 'paletteInvert', 'colorScheme', 'text', 'transform', 'repeat', 'fill', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion', 'ornShape', 'ornFill', 'ornEdge', 'ornMotion'];
  const AUTO_DIRECT_LOCKS = ['layout', 'fill', 'background', 'edge', 'location', 'bg', 'orn'];
  // the tracks a run owns (only clips carrying `auto` are replaced)
  const AUTO_TRACK_KINDS = ['background', 'backdrop', 'filler', 'figure'];
  // The auto direction keeps the figure track clear of the lyrics: a candidate
  // may graze at most this share of the text box area. The measure ignores the
  // spec's opacity (a dimmed shape still sits over the text), so a figure that
  // cannot stay clear is dropped instead of dimmed over the subtitle.
  const AUTO_FIGURE_CLEAR = 0.05;
  // How far a chorus may out-shout the rest of the song: a share of the weird
  // axis on top of its own loudness (see planSections).
  const CHORUS_BOOST = 0.3;
  // The energy axis follows a section's boost at this share, so a loud block
  // also wants more motion (the size curve and the figure density read it).
  const SECTION_ENERGY = 0.35;

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(1, number));
  }

  function pick(random, list) {
    return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  }

  function trackIdFor(projectDoc, kind) {
    const track = (projectDoc.tracks || []).find((entry) => entry.kind === kind);
    return track ? track.id : null;
  }

  // The accent colours of a palette: the readable roles the beat colour draws
  // use. The background track must be visible for the accents to land on.
  function accentsOf(colors) {
    const palette = Array.isArray(colors) ? colors : [];
    const bgColor = SA.color.parse(palette[0] || '#000000');
    const accentIdx = [3, 5, 6, 2].filter((i) => palette[i] && SA.color.contrastRatio(SA.color.parse(palette[i]), bgColor) >= 3);
    return { accentIdx, accentHexes: accentIdx.map((i) => palette[i]) };
  }

  // The text / hero colours of a palette through the role table (legacy aware):
  // the backdrop planes must separate from both.
  function textColorsOf(colors) {
    const roles = SA.paletteRoles;
    if (roles && typeof roles.get === 'function') {
      return [roles.get(colors, roles.SLOT.TEXT_FILL), roles.get(colors, roles.SLOT.TEXT_FILL2)].filter(Boolean);
    }
    return [(colors || [])[2], (colors || [])[3]].filter(Boolean);
  }

  // The profile's figure colours: two steps of the backdrop planes, kept 1.5+
  // apart from the planes and at the backdrop floor from the text.
  function figureColors(planes, textColors, rawW) {
    const list = (Array.isArray(planes) ? planes : []).filter((hex) => typeof hex === 'string' && hex);
    if (!list.length) return null;
    const shiftV = (hex, delta) => {
      try {
        const hsv = SA.color.rgbToHsv(SA.color.parse(hex));
        return SA.color.toHex({ ...SA.color.hsvToRgb({ ...hsv, v: Math.max(0, Math.min(1, hsv.v + delta)), a: 1 }), a: 1 });
      } catch {
        return hex;
      }
    };
    const target = SA.weird && typeof SA.weird.backdropContrast === 'function' ? SA.weird.backdropContrast(rawW) : 3.5;
    const separate = (hex, others, floor) => (SA.moods && typeof SA.moods.separatePlane === 'function' ? SA.moods.separatePlane(hex, others, floor) : hex);
    const texts = (Array.isArray(textColors) ? textColors : []).filter(Boolean);
    return [
      separate(separate(shiftV(list[0], 0.12), list, 1.5), texts, target),
      separate(separate(shiftV(list[1 % list.length], -0.12), list, 1.5), texts, target),
    ];
  }

  // The fourth axis sets the letter spacing (em) around the theme's own value:
  // density 0.5 keeps the theme, 0 opens to +0.18em (airy), 1 closes to -0.03em
  // (packed). The theme value stays the midpoint so a neutral song is untouched.
  const SPACING_SPARSE = 0.18;
  const SPACING_DENSE = -0.03;
  function densitySpacing(themeSpacing, density) {
    const base = Number(themeSpacing) || 0;
    const d = Math.max(0, Math.min(1, density == null || !Number.isFinite(Number(density)) ? 0.5 : Number(density)));
    const value = d < 0.5 ? base + (SPACING_SPARSE - base) * ((0.5 - d) / 0.5) : base + (SPACING_DENSE - base) * ((d - 0.5) / 0.5);
    return Math.round(value * 1000) / 1000;
  }

  function nextClip(projectDoc, prefix, fields) {
    return { id: SA.project.nextClipId(projectDoc, prefix), auto: true, ...fields };
  }

  // How well a per-beat pulse fits the song. A clear tempo with regular onsets
  // reads right; a slow or beatless track only makes the metronome lame. No
  // analysis at all stays low, and smartness 0 ignores the fit entirely.
  const PULSE_TYPES = new Set(['pulse', 'opacityPulse', 'beatPulse', 'beatHighlight', 'trackBeat', 'beat']);
  function beatFitOf(analysis) {
    if (!analysis) return 0.25;
    const features = SA.audioAnalysis && SA.audioAnalysis.features ? SA.audioAnalysis.features(analysis) : analysis;
    if (!features) return 0.25;
    const bpm = Number(features.bpm) || 0;
    const onsets = Number(features.onsets) || 0;
    const energy = Number(features.energy) || 0;
    const tempo = bpm >= 70 ? Math.max(0, Math.min(1, (bpm - 70) / 60)) : 0;
    const onset = Math.max(0, Math.min(1, onsets / 4));
    return Math.max(0, Math.min(1, 0.2 + 0.5 * tempo + 0.4 * onset + 0.25 * energy));
  }

  // ---------------------------------------------------------------------------
  // Section awareness
  // ---------------------------------------------------------------------------
  //
  // The cue list is a flat run, so the run that draws it is flat too: one set of
  // axes for the whole song. `SA.sections.detect` names the blocks (a silence, or
  // a pseudo-split of a lyric wall) and every block may then carry its own
  // profile: the loud ones (and the chorus) lean on a stronger weird / energy,
  // every block draws its staging from its own stream and its boundary always
  // moves the palette.
  //
  // The boost is a share of the weird axis' own headroom (1 - raw), so it can
  // never push a song past the axis the user picked, and it is 0 when the axis
  // is 0: a plain run keeps the classic profile everywhere, and only the block
  // switches (palette / staging) remain.
  //
  // The block's boost: `rawW * (0.3 + 0.7 * energy)` of the axis' headroom,
  // plus a chorus bonus. No music means no energy and no chorus bonus, so a
  // section-aware run without audio still switches blocks but never boosts.
  // `strength` is the dialog's dial (0 = no boost at all, 1 = the formula).
  function boostOf(entry, rawW, strength) {
    const headroom = Math.max(0, 1 - rawW);
    const energy = entry.energy == null ? null : clamp01(entry.energy);
    let value = rawW * (0.3 + 0.7 * (energy == null ? 0.5 : energy));
    if (entry.chorus && energy != null) value += CHORUS_BOOST * rawW;
    return Math.round(headroom * Math.min(1, Math.max(0, value * strength)) * 1e4) / 1e4;
  }

  // The section entry a run hands to the cue / beat draws. A zero boost reuses
  // the song's own objects, so the classic path is untouched by identity, not
  // only by value. The ctx needs `axes`, `rawW`, `w`, `energy`, `params`,
  // `paramsSource` and `seed`.
  function sectionEntry(ctx, entry, boost) {
    const rawW = Number(ctx.rawW) || 0;
    const lifted = boost > 0;
    const axes = lifted ? { ...ctx.axes, weird: Math.min(1, rawW + boost), energy: clamp01(ctx.energy + SECTION_ENERGY * boost) } : ctx.axes;
    return {
      index: Number(entry.index) || 0,
      cueIds: Array.isArray(entry.cueIds) ? entry.cueIds : [],
      start: Number(entry.start) || 0,
      end: Number(entry.end) || 0,
      energy: entry.energy == null ? null : Number(entry.energy),
      chorus: !!entry.chorus,
      boost,
      axes,
      w: lifted ? SA.moods.textWeirdOf(axes) : ctx.w,
      rawW: lifted ? axes.weird : rawW,
      params: lifted ? SA.genParams.resolve({ axes, params: ctx.paramsSource || {} }) : ctx.params,
      // the staging salt: one draw per block, so a block of cues shares a
      // staging tendency and the next block moves on
      salt: Math.floor(SA.rng.rngFor(ctx.seed, 'section', entry.index)() * 1e6),
    };
  }

  function planSections(ctx, cues, options) {
    const opts = options || {};
    if (!SA.sections || typeof SA.sections.detect !== 'function') return null;
    const detected = SA.sections.detect(cues, { analysis: ctx.analysis, gap: opts.gap, maxCues: opts.maxCues });
    if (!detected.length) return null;
    return assembleSections(ctx, detected, opts.strength, opts);
  }

  // The blocks of a run, indexed by cue. `strength` scales the boost.
  function assembleSections(ctx, entries, strength, config) {
    const value = Number(strength);
    const scale = Number.isFinite(value) ? Math.max(0, value) : 1;
    const list = [];
    const sectionOf = {};
    for (const entry of entries) {
      const section = sectionEntry(ctx, entry, boostOf(entry, Number(ctx.rawW) || 0, scale));
      list.push(section);
      for (const cueId of section.cueIds) sectionOf[cueId] = section;
    }
    return {
      gap: config && config.gap != null ? config.gap : SA.sections.DEFAULT_GAP,
      maxCues: config && config.maxCues != null ? config.maxCues : SA.sections.DEFAULT_MAX_CUES,
      strength: scale,
      list,
      sectionOf,
    };
  }

  // The saved plan of a run, rebuilt for a re-roll: the run stored the blocks
  // with their boost and staging salt, so a re-rolled cue / beat keeps its own
  // block's profile without the music (and without measuring it again). Returns
  // null when the run had no sections.
  function restoreSections(ctx, saved) {
    const list = saved && Array.isArray(saved.list) ? saved.list : null;
    if (!list || !list.length) return null;
    const out = [];
    const sectionOf = {};
    for (const entry of list) {
      const boost = entry.boost == null ? boostOf(entry, Number(ctx.rawW) || 0, 1) : clamp01(Number(entry.boost));
      const section = sectionEntry(ctx, entry, boost);
      if (entry.salt != null) section.salt = Number(entry.salt) || 0;
      out.push(section);
      for (const cueId of section.cueIds) sectionOf[cueId] = section;
    }
    const strength = Number(saved.strength);
    return {
      gap: saved.gap == null ? SA.sections.DEFAULT_GAP : saved.gap,
      maxCues: saved.maxCues == null ? SA.sections.DEFAULT_MAX_CUES : saved.maxCues,
      strength: strength > 0 ? strength : 1,
      list: out,
      sectionOf,
    };
  }

  const TEXT_BG_GROUPS = ['bgShape', 'bgFill', 'bgEdge', 'bgMotion', 'ornShape', 'ornFill', 'ornEdge', 'ornMotion'];
  const SOFT_SHAPE_FEAR = 0.5;
  const SOFT_SHAPES = new Set(['heart', 'circle', 'ring']);

  // Drops a heart / circle ornament (with its fill / edge / motion) from a style bag.
  function stripSoftOrnament(style) {
    if (!style || !style.ornShape || !SOFT_SHAPES.has(style.ornShape.type)) return;
    for (const group of ['ornShape', 'ornFill', 'ornEdge', 'ornMotion']) delete style[group];
  }

  // The section a cue belongs to (null when the run does not follow sections).
  function sectionOf(ctx, cueId) {
    if (!ctx || !ctx.sectionOf) return null;
    return ctx.sectionOf[cueId] || null;
  }

  // The profile one cue draws with: its section's boosted copy, or the song's
  // own. A pinned value keeps its number (resolve is pure), and a run without
  // sections hands back `ctx.params` itself.
  function paramsFor(ctx, cueId) {
    const own = ctx ? ctx.params : null;
    const section = sectionOf(ctx, cueId);
    return (section && section.params) || own;
  }

  // The axes / weird channels one cue draws with (see paramsFor).
  function axesFor(ctx, cueId) {
    const section = sectionOf(ctx, cueId);
    return (section && section.axes) || (ctx && ctx.axes);
  }

  function rawWFor(ctx, cueId) {
    const section = sectionOf(ctx, cueId);
    return section && section.rawW != null ? section.rawW : (ctx && ctx.rawW) || 0;
  }

  function wFor(ctx, cueId) {
    const section = sectionOf(ctx, cueId);
    return section && section.w != null ? section.w : (ctx && ctx.w) || 0;
  }

  // A cue that opens a section always moves the palette, whatever the
  // paletteSwitchChance dice says.
  function opensSection(ctx, cueId) {
    const section = sectionOf(ctx, cueId);
    return !!(section && section.cueIds[0] === cueId);
  }

  // The staging seed of one draw: its classic value plus its block's salt, so a
  // block shares a staging tendency. Without sections the salt is 0 and every
  // seed stays the classic one.
  function stagingSeed(ctx, base, cueId) {
    const section = sectionOf(ctx, cueId);
    return section ? base + section.salt : base;
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
    let themeStyle = opts.themeStyle ? SA.project.mergeDeep({}, opts.themeStyle) : null;
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
      const spacing = densitySpacing(themeStyle.text.letterSpacing, axes.density);
      if (spacing !== (Number(themeStyle.text.letterSpacing) || 0)) themeStyle.text = { ...themeStyle.text, letterSpacing: spacing };
    }
    const beatFit = beatFitOf(analysis);
    // a smart run on a beatless / slow song does not draw the metronome: the
    // per-beat pulse (theme holds and beat holds) is dropped or demoted
    if (s > 0 && beatFit < 0.4) {
      const stripPulse = (style) => {
        if (!style || !Array.isArray(style.hold)) return;
        style.hold = style.hold.filter((instance) => !instance || !PULSE_TYPES.has(instance.type));
        if (!style.hold.length) delete style.hold;
      };
      stripPulse(themeStyle);
      for (const entry of Object.values(cueLooks)) if (entry && entry.style) stripPulse(entry.style);
    }
    const palette = (themeStyle && themeStyle.palette && themeStyle.palette.colors) || [];
    const { accentIdx, accentHexes } = accentsOf(palette);
    const energy = Math.max(0, Math.min(1, Number(axes.energy) || 0.5));
    // The tunable profile (theme dialog / saved themes): the axes derive every
    // parameter, `params` overrides the ones the user fixed. The manual keys
    // are kept apart (`pinned`), so a run writes only those back and a project
    // without them reproduces the classic generator exactly.
    const styleMode = (doc && doc.styleMode) || {};
    const paramsSource = opts.params !== undefined ? opts.params : styleMode.params || {};
    const genParams = SA.genParams;
    if (!genParams || typeof genParams.resolve !== 'function') throw new Error('SA.genParams is required by SA.direct');
    const params = genParams.resolve({ axes, params: paramsSource || {} });
    const pinned = {};
    for (const def of genParams.PARAMS) {
      if (genParams.isPinned({ params: paramsSource || {} }, def.key)) pinned[def.key] = params[def.key];
    }
    const typeWeights = opts.typeWeights !== undefined ? opts.typeWeights : styleMode.typeWeights || null;
    if (typeWeights && genParams && typeof genParams.dropWeightedTypes === 'function') {
      if (themeStyle) themeStyle = genParams.dropWeightedTypes(themeStyle, typeWeights);
      for (const entry of Object.values(cueLooks)) {
        if (entry && entry.style) entry.style = genParams.dropWeightedTypes(entry.style, typeWeights);
      }
    }
    if (pinned.sizeCenter != null && themeStyle && themeStyle.text) {
      themeStyle.text.size = Math.round(minSize + (maxSize - minSize) * pinned.sizeCenter);
    }
    const baseSize = Number((themeStyle && themeStyle.text && themeStyle.text.size) || (portrait ? 72 : 96));
    const usePalettes = opts.usePalettes !== undefined ? opts.usePalettes : Array.isArray(styleMode.usePalettes) ? styleMode.usePalettes : [];
    // The size curve / foreground / decoration draws only change the picture
    // once the curve is on: raw weird above 0 or at least one pinned parameter.
    // weird 0 without pinned values keeps every path on its classic branch.
    const curve = rawW > 0 || Object.keys(pinned).length > 0;
    // The smear posts (blur / displacement) are gated by postBlurChance while
    // the compose mode is on: the lyrics only sit under one on a successful
    // roll. weird 0 keeps the drawn look, and no extra random is drawn
    // otherwise.
    if (opts.compose && (rawW > 0 || pinned.postBlurChance != null) && themeStyle && SA.legibility && SA.legibility.SMEAR_POSTS && Array.isArray(themeStyle.post)) {
      const gate = params.postBlurChance;
      const roll = SA.rng.rngFor(opts.seed == null ? 1 : opts.seed, 'smear')();
      if (pinned.postBlurChance === 0 || roll >= gate) {
        themeStyle.post = themeStyle.post.filter((entry) => !entry || !SA.legibility.SMEAR_POSTS.has(entry.type));
        if (!themeStyle.post.length) delete themeStyle.post;
      }
    }
    // Gating for hold, pulse, repeat, clones, location and motion chances when pinned in the Theme dialogue
    if (themeStyle) {
      if (pinned.holdChance != null) {
        const holdRoll = genParams.roll(SA.rng.rngFor(opts.seed == null ? 1 : opts.seed, 'theme-hold'), params.holdChance);
        if (!holdRoll) {
          delete themeStyle.hold;
          for (const entry of Object.values(cueLooks)) if (entry && entry.style) delete entry.style.hold;
        }
      }
      if (pinned.pulseChance != null && (pinned.pulseChance === 0 || !genParams.roll(SA.rng.rngFor(opts.seed == null ? 1 : opts.seed, 'theme-pulse'), params.pulseChance))) {
        const stripPulse = (style) => {
          if (!style || !Array.isArray(style.hold)) return;
          style.hold = style.hold.filter((instance) => !instance || !PULSE_TYPES.has(instance.type));
          if (!style.hold.length) delete style.hold;
        };
        stripPulse(themeStyle);
        for (const entry of Object.values(cueLooks)) if (entry && entry.style) stripPulse(entry.style);
      }
      if (pinned.repeatChance != null && (pinned.repeatChance === 0 || !genParams.roll(SA.rng.rngFor(opts.seed == null ? 1 : opts.seed, 'theme-repeat'), params.repeatChance))) {
        delete themeStyle.repeat;
        for (const entry of Object.values(cueLooks)) if (entry && entry.style) delete entry.style.repeat;
      }
      if (pinned.clonesChance != null && (pinned.clonesChance === 0 || !genParams.roll(SA.rng.rngFor(opts.seed == null ? 1 : opts.seed, 'theme-clones'), params.clonesChance))) {
        delete themeStyle.clones;
        for (const entry of Object.values(cueLooks)) if (entry && entry.style) delete entry.style.clones;
      }
      if (pinned.locationChance != null && (pinned.locationChance === 0 || !genParams.roll(SA.rng.rngFor(opts.seed == null ? 1 : opts.seed, 'theme-location'), params.locationChance))) {
        delete themeStyle.location;
        for (const entry of Object.values(cueLooks)) if (entry && entry.style) delete entry.style.location;
      }
      if (pinned.motionChance != null && (pinned.motionChance === 0 || !genParams.roll(SA.rng.rngFor(opts.seed == null ? 1 : opts.seed, 'theme-motion'), params.motionChance))) {
        delete themeStyle.enter;
        delete themeStyle.exit;
        for (const entry of Object.values(cueLooks)) if (entry && entry.style) {
          delete entry.style.enter;
          delete entry.style.exit;
        }
      }
    }
    const hasPinnedDeco = genParams.DECO_KEYS.some((k) => pinned[k] != null);
    if (hasPinnedDeco && themeStyle) {
      const decoOnlyNone = pinned.decoNone >= 1 && !genParams.DECO_KEYS.filter((k) => k !== 'decoNone').some((k) => pinned[k] > 0);
      if (decoOnlyNone) {
        delete themeStyle.edge;
      }
    }
    const hasPinnedFg = genParams.FG_KEYS.some((k) => pinned[k] != null);
    if (hasPinnedFg && themeStyle) {
      const fgOnlySolid = pinned.fgSolid >= 1 && !genParams.FG_KEYS.filter((k) => k !== 'fgSolid').some((k) => pinned[k] > 0);
      if (fgOnlySolid) {
        delete themeStyle.fill;
        if (themeStyle.color && themeStyle.color.fill && themeStyle.color.fill.kind === 'gradient') {
          delete themeStyle.color;
        }
      }
    }
    // The text background of the drawn theme follows the same profile: a
    // pinned textBgChance gates the whole look's background / ornament groups
    // (0 strips them, so the dialog's 0 really means none), and a fearful run
    // never keeps the soft heart / circle ornaments.
    if (opts.compose && themeStyle) {
      if (pinned.textBgChance != null) {
        const bgRoll = genParams.roll(SA.rng.rngFor(opts.seed == null ? 1 : opts.seed, 'theme-text-bg'), params.textBgChance);
        if (!bgRoll) {
          for (const group of TEXT_BG_GROUPS) delete themeStyle[group];
          for (const entry of Object.values(cueLooks)) if (entry && entry.style) for (const group of TEXT_BG_GROUPS) delete entry.style[group];
        }
      }
      if (SA.moods.fearOf(axes) >= SOFT_SHAPE_FEAR) {
        stripSoftOrnament(themeStyle);
        for (const entry of Object.values(cueLooks)) if (entry && entry.style) stripSoftOrnament(entry.style);
      }
    }
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
    // Section awareness (next to the rhythm plan): the blocks of the cue list,
    // each with the profile its loudness asks for. Off unless the caller passes
    // `sections`, so an existing project keeps its output byte for byte.
    const sectionOpts = opts.sections ? (typeof opts.sections === 'object' && opts.sections ? opts.sections : {}) : null;
    const sectionPlan = sectionOpts && doc && doc.script && Array.isArray(doc.script.cues) && doc.script.cues.length
      ? planSections({ axes, rawW, w, params, paramsSource, energy, analysis, seed: opts.seed }, doc.script.cues, sectionOpts)
      : null;
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
      compose: !!opts.compose,
      composeHistory: [],
      composeZones: {},
      cuePaletteColors: null,
      bpm,
      beatFit,
      rhythm,
      // the manual profile the section boost re-resolves from (never the
      // already resolved `params`: that would pin every derived value)
      paramsSource,
      // the blocks of the run (null unless the caller asked for sections: the
      // re-roll path rebuilds them from styleMode.sections with restoreSections)
      sections: sectionPlan ? sectionPlan.list : null,
      sectionConfig: sectionPlan ? { gap: sectionPlan.gap, maxCues: sectionPlan.maxCues, strength: sectionPlan.strength } : null,
      sectionOf: sectionPlan ? sectionPlan.sectionOf : null,
      portrait,
      frameW,
      frameH,
      screen,
      baseSize,
      baseRatio: baseSize / Math.max(1, screen),
      accentIdx,
      accentHexes,
      energy,
      params,
      pinned,
      typeWeights,
      usePalettes,
      curve,
      hasPinnedDeco: !!hasPinnedDeco,
      hasPinnedFg: !!hasPinnedFg,
      cueForeground: {},
      cueBold: {},
      cueFont: {},
      cueShift: {},
      cueRepeat: {},
      backdropSpecs: null,
      backdropPlanes: {},
    };
  }

  // The clone stack of a weird cue: a small drift / hue family around the
  // lyrics. The composition path and the classic cue draw share it, so both
  // consume the same randoms for the same seed.
  function clonesFor(random, w) {
    const count = 1 + Math.floor(random() * 3);
    const s = (a) => Math.round((random() * 2 - 1) * a * 1000) / 1000;
    return Array.from({ length: count }, (_, i) => ({
      id: `wclone_${i}`,
      enabled: true,
      dx: s(0.06 * w),
      dy: s(0.06 * w),
      scale: Math.round((1 + s(0.3 * w)) * 100) / 100,
      rotate: Math.round(s(15 * w)),
      opacity: Math.round((0.35 + random() * 0.25) * 100) / 100,
      hue: Math.round(s(180 * w)),
      delay: Math.round((0.03 + random() * 0.09) * 100) / 100,
      motion: {
        type: pick(random, ['drift', 'float', 'pulse', 'orbit', 'spin']),
        amount: Math.round((0.02 + 0.04 * w) * 1000) / 1000,
        speed: Math.round((0.5 + random() * 1.5) * 100) / 100,
      },
    }));
  }

  // A cue's own drawn look and the weird-axis patches (palette, location, font,
  // repeat, clones) plus the fallback entrance/exit when the run has no drawn
  // look. Beat-level work is directBeat.
  function directCue(projectDoc, cue, cueIndex, ctx) {
    const { seed, genre, direction, themeStyle, cueLooks, look } = ctx;
    // the cue's own section view: a block of a section-aware run draws with the
    // block's profile, staging stream and weird channels
    const axes = axesFor(ctx, cue.id);
    const w = wFor(ctx, cue.id);
    if (!ctx.compose && cueLooks[cue.id]) {
      projectDoc.cueStyles[cue.id] = SA.project.mergeDeep(projectDoc.cueStyles[cue.id] || {}, JSON.parse(JSON.stringify(cueLooks[cue.id].style)));
    }
    // the cue palette lottery: a cue may draw a palette of its own. Inherited
    // literal colours follow through resolveStyle; the cue's own colours are
    // moved here, and the previous cue's palette joins the avoid list.
    const baseColors = (themeStyle && themeStyle.palette && themeStyle.palette.colors) || [];
    const drawnPalette = cueHasLegacyBeat(projectDoc, cue) ? cuePalette(projectDoc, cue, cueIndex, ctx, ctx.cuePaletteColors) : null;
    if (drawnPalette) {
      const ownColors = projectDoc.cueStyles[cue.id] || {};
      projectDoc.cueStyles[cue.id] = {
        ...(baseColors.length ? SA.moods.recolor(ownColors, baseColors, drawnPalette.colors) : ownColors),
        palette: { ...drawnPalette, auto: true },
      };
    }
    ctx.cuePaletteColors = drawnPalette ? drawnPalette.colors : baseColors;
    const cueContext = SA.moods.contextForCue(projectDoc, cue);
    if (w > 0 && !ctx.compose) {
      // E3: a weird song lets every cue draw its own colours, position,
      // font, repeat and clones. The draws are seeded per cue, so a seed
      // reproduces them and weird 0 consumes none of them. The thresholds are
      // the profile's chances (their derived values are the old literals).
      const p = paramsFor(ctx, cue.id);
      const cr = SA.rng.rngFor(seed + cueIndex * 131, cue.id, 'weird-cue');
      const own = () => projectDoc.cueStyles[cue.id] || (projectDoc.cueStyles[cue.id] = {});
      // location (G8): nudge the anchor and sometimes let it float
      if (cr() < p.locationChance) {
        const base = own().location || themeStyle.location || { type: 'center', params: {} };
        const type = w >= 0.6 && cr() < p.floatChance ? 'randomSafe' : base.type;
        own().location = {
          ...base,
          type,
          params: {
            ...(base.params || {}),
            offsetX: Math.round((cr() * 2 - 1) * p.locationRange * 100) / 100,
            offsetY: Math.round((cr() * 2 - 1) * p.locationRange * 100) / 100,
          },
          enabled: true,
        };
      }
      // font (I17)
      if (cr() < p.fontChance) {
        const fontId = SA.moods.weirdFont(cr, cueContext, themeStyle.text && themeStyle.text.fontId);
        if (fontId) own().text = { ...(own().text || {}), fontId };
      }
      // repeat (G2)
      const repeatRoll = cr();
      const isGuaranteedRepeat = ctx.songHasRepeat && ctx.guaranteedRepeatCueId === cue.id;
      const shouldRollRepeat = ctx.songHasRepeat && (isGuaranteedRepeat || repeatRoll < p.repeatChance);
      if (SA.random && SA.random.repeatPatch && shouldRollRepeat) {
        const merged = { ...themeStyle, ...own() };
        let repeat = SA.random.repeatPatch(cr, { ...cueContext, weird: w });
        if (isGuaranteedRepeat && (!repeat || SA.random.repeatConflicts({ ...merged, repeat }))) {
          const safeType = 'stackV';
          repeat = SA.fx && typeof SA.fx.withDefaults === 'function' ? SA.fx.withDefaults({ type: safeType }, 'repeat') : { type: safeType, params: { copies: 2 }, enabled: true };
        }
        if (repeat && (isGuaranteedRepeat || !SA.random.repeatConflicts({ ...merged, repeat }))) {
          own().repeat = repeat;
          if (ctx.cueRepeat) ctx.cueRepeat[cue.id] = repeat;
        }
      }
      // clones (G3)
      if (cr() < p.clonesChance) own().clones = clonesFor(cr, w);
    }
    if (ctx.compose) {
      // The compose profile draws once per cue: the foreground treatment, the
      // bold body and the cue-level text treatment / motion patches. All new
      // streams, so the classic draws keep their exact consumption. The extra
      // chances only roll once the curve is on (raw weird above 0 or a pinned
      // value), so weird 0 stays untouched.
      ctx.cueContext = cueContext;
      const colors = ctx.cuePaletteColors || baseColors;
      const cueParams = paramsFor(ctx, cue.id);
      const fr = SA.rng.rngFor(seed + cueIndex * 131, cue.id, 'foreground');
      const foreground = foregroundFor(fr, ctx, colors, cueParams, cue.id);
      if (foreground) {
        if (foreground.fill) {
          const own = projectDoc.cueStyles[cue.id] || (projectDoc.cueStyles[cue.id] = {});
          own.fill = foreground.fill;
        }
        if (foreground.color) ctx.cueForeground[cue.id] = foreground;
      }
      const params = cueParams || {};
      if (params.boldChance > 0) {
        const br = SA.rng.rngFor(seed + cueIndex * 131, cue.id, 'bold');
        if (br() < params.boldChance) ctx.cueBold[cue.id] = true;
      }
      if (ctx.curve) {
        const gp = SA.genParams;
        const pinned = ctx.pinned || {};
        const own = () => projectDoc.cueStyles[cue.id] || (projectDoc.cueStyles[cue.id] = {});
        // font (I17): the cue's own face, inherited by its beats
        const fontRandom = SA.rng.rngFor(seed + cueIndex * 131, cue.id, 'font');
        if (gp.roll(fontRandom, params.fontChance)) {
          const fontId = SA.moods.weirdFont(fontRandom, cueContext, themeStyle.text && themeStyle.text.fontId);
          if (fontId) {
            own().text = { ...(own().text || {}), fontId };
            ctx.cueFont[cue.id] = fontId;
          }
        }
        // location (G8): the cue nudges its anchor, sometimes floats
        const locationRandom = SA.rng.rngFor(seed + cueIndex * 131, cue.id, 'location');
        if (gp.roll(locationRandom, params.locationChance)) {
          ctx.cueShift[cue.id] = {
            dx: Math.round((locationRandom() * 2 - 1) * params.locationRange * 100) / 100,
            dy: Math.round((locationRandom() * 2 - 1) * params.locationRange * 100) / 100,
            float: gp.roll(locationRandom, params.floatChance),
          };
        }
        // repeat (G2)
        const isGuaranteedRepeat = ctx.songHasRepeat && ctx.guaranteedRepeatCueId === cue.id;
        const repeatRandom = SA.rng.rngFor(seed + cueIndex * 131, cue.id, 'repeat');
        const shouldRollRepeat = ctx.songHasRepeat && (isGuaranteedRepeat || gp.roll(repeatRandom, params.repeatChance));
        if (SA.random && SA.random.repeatPatch && shouldRollRepeat) {
          const merged = { ...themeStyle, ...own() };
          let repeat = SA.random.repeatPatch(repeatRandom, { ...cueContext, weird: w });
          if (isGuaranteedRepeat && (!repeat || SA.random.repeatConflicts({ ...merged, repeat }))) {
            const safeType = 'stackV';
            repeat = SA.fx && typeof SA.fx.withDefaults === 'function' ? SA.fx.withDefaults({ type: safeType }, 'repeat') : { type: safeType, params: { copies: 2 }, enabled: true };
          }
          if (repeat && (isGuaranteedRepeat || !SA.random.repeatConflicts({ ...merged, repeat }))) {
            own().repeat = repeat;
            ctx.cueRepeat[cue.id] = repeat;
          }
        }
        // clones (G3)
        const clonesRandom = SA.rng.rngFor(seed + cueIndex * 131, cue.id, 'clones');
        if (gp.roll(clonesRandom, params.clonesChance)) own().clones = clonesFor(clonesRandom, w);
        // text background: pinned profile values win, otherwise the genre's
        // own tables, otherwise the derived defaults. The draw happens inside
        // applyGenreBackground on this cue's own stream.
        const bgRandom = SA.rng.rngFor(seed + cueIndex * 131, cue.id, 'text-bg');
        const bgStyle = {};
        const bgOptions = {};
        if (pinned.textBgChance != null) bgOptions.chance = params.textBgChance;
        if (pinned.bgEnclose != null || pinned.bgAccent != null || pinned.bgUnderlay != null) {
          bgOptions.placement = { bgEnclose: params.bgEnclose, bgAccent: params.bgAccent, bgUnderlay: params.bgUnderlay };
        }
        if (pinned.bgVaryChance != null) bgOptions.varyChance = params.bgVaryChance;
        if (pinned.bgEdgeChance != null) bgOptions.edgeChance = params.bgEdgeChance;
        if (pinned.bgIndependentChance != null) bgOptions.independentChance = params.bgIndependentChance;
        if (pinned.bgOffsetScatter != null) bgOptions.offsetScatter = params.bgOffsetScatter;
        if (pinned.bgSizeScatter != null) bgOptions.sizeScatter = params.bgSizeScatter;
        if (pinned.bgColorScatter != null) bgOptions.colorScatter = params.bgColorScatter;
        if (pinned.textBgScale != null) bgOptions.scale = params.textBgScale;
        else if (pinned.bgScale != null) bgOptions.scale = params.bgScale;
        else if (params.textBgScale != null) bgOptions.scale = params.textBgScale;
        else if (params.bgScale != null) bgOptions.scale = params.bgScale;
        const genreDef = genre && SA.genres && typeof SA.genres.get === 'function' ? SA.genres.get(genre) : null;
        if (SA.moods.applyGenreBackground(bgStyle, genreDef, axes, bgRandom, colors, false, bgOptions)) {
          for (const group of ['bgShape', 'bgFill', 'bgEdge', 'bgMotion', 'ornShape', 'ornFill', 'ornEdge', 'ornMotion']) {
            if (bgStyle[group]) own()[group] = bgStyle[group];
          }
        }
      }
    }
    if (!look) {
      const generated = SA.moods.generate({
        axes,
        seed: stagingSeed(ctx, seed + cueIndex * 131 + 1, cue.id),
        direction,
        genre,
        context: cueContext,
        emphasis: SA.moods.isEmphasis ? SA.moods.isEmphasis(cue) : false,
        typeWeights: ctx.typeWeights,
        params: paramsFor(ctx, cue.id) || null,
      }).style;
      projectDoc.cueStyles[cue.id] = SA.project.mergeDeep(projectDoc.cueStyles[cue.id] || {}, {
        enter: generated.enter,
        exit: generated.exit,
      });
    }
  }

  // The hold a beat may carry: pulse (the legacy default) at smartness 0, a
  // smartness-weighted draw from the calm hold pool above it. The fear axis
  // prefers the nervous end (jitter / heartbeat / shiver).
  const BEAT_HOLD_TYPES = ['pulse', 'opacityPulse', 'heartbeat', 'breathing', 'floatBob', 'sway', 'drift', 'kenBurns'];

  function smartHold(random, s, amount, pulseBpm, axes, beatFit) {
    if (!(s > 0) && !(SA.moods.fearOf(axes) > 0)) return { type: 'pulse', params: { amount, bpm: pulseBpm }, enabled: true };
    // a beatless / slow song drops the metronome from the pool before the
    // weighted draw; heartbeat stays because it fits a slow song
    const fit = beatFit == null ? 1 : beatFit;
    const pool = s > 0 && fit < 0.4 ? BEAT_HOLD_TYPES.filter((type) => !PULSE_TYPES.has(type)) : BEAT_HOLD_TYPES;
    const type =
      SA.fxAxes.pickWeighted(random, 'hold', pool, axes, {
        smartness: s,
        rating: (item) => SA.moods.smartness.rate('hold', item),
      }) || 'pulse';
    if (type === 'pulse') return { type, params: { amount, bpm: pulseBpm }, enabled: true };
    if (type === 'heartbeat') return { type, params: { bpm: pulseBpm }, enabled: true };
    return { type, params: {}, enabled: true };
  }

  const COMPOSE_CJK_RE = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

  // The shape layers the Chinese-graphic chance borrows from the three
  // templates that carry one (leftHeadline / lowerBand / bracketCenter).
  const COMPOSE_GRAPHICS = [
    { shape: 'underline', drive: 'enter', stroke: 5, padding: 0.1, feather: 0.04, glow: 0.3 },
    { shape: 'box', drive: 'enter', stroke: 3.5, padding: 0.14, feather: 0.02, glow: 0.25 },
    { shape: 'brackets', drive: 'enter', stroke: 4, padding: 0.12, feather: 0.05, glow: 0.3 },
  ];

  const FRAME_SHAPES = new Set(['box', 'brackets', 'topBottom', 'sides', 'sidesSemicircle', 'sidesSemiellipse', 'capsule', 'plate']);

  function resolveGraphicParams(graphic, rng, graphicScale) {
    const params = { ...(graphic || {}) };
    if (FRAME_SHAPES.has(params.shape)) {
      const roll = typeof rng === 'function' ? rng : Math.random;
      params.padding = Math.round((0.06 + roll() * 0.18) * 100) / 100;
      params.stroke = Math.round((2.5 + roll() * 3.5) * 10) / 10;
      const baseScale = Number.isFinite(Number(graphicScale))
        ? Number(graphicScale)
        : Number.isFinite(Number(params.scale))
          ? Number(params.scale)
          : 1;
      params.scale = Math.max(0.1, Math.min(10, Math.round(baseScale * (0.9 + roll() * 0.25) * 100) / 100));
    }
    return params;
  }

  // Rough px box of the first beat's composed text (no font metrics are loaded
  // here): line widths from the span scales and a 1em / 0.58em per character
  // estimate. The figure layer uses it to keep clear of the lyrics.
  function estimateComposeZone(comp, analysis, patch, ctx) {
    const frameW = Number(ctx.frameW) || 1920;
    const frameH = Number(ctx.frameH) || 1080;
    const size = Number(patch.text.size) || 96;
    const lineHeight = patch.text.lineHeight == null ? 1.2 : Number(patch.text.lineHeight);
    const letterSpacing = Number(patch.text.letterSpacing) || 0;
    const compose = patch.text.compose || {};
    const breaks = new Set(Array.isArray(compose.breaks) ? compose.breaks : []);
    const spans = Array.isArray(compose.spans) ? compose.spans : [];
    const chars = Array.from(analysis.text || '');
    let lineWidth = 0;
    let lineMax = 0;
    let blockW = 0;
    let blockH = 0;
    const flush = () => {
      blockW = Math.max(blockW, lineWidth);
      blockH += (lineMax || size) * lineHeight;
      lineWidth = 0;
      lineMax = 0;
    };
    for (let i = 0; i < chars.length; i += 1) {
      if (breaks.has(i) && i > 0) flush();
      const character = chars[i];
      if (/^\s+$/.test(character)) continue;
      let scale = 1;
      for (const span of spans) {
        if (i >= span.from && i < span.to) scale = Math.max(scale, Number(span.scale) || 1);
      }
      lineWidth += size * scale * (COMPOSE_CJK_RE.test(character) ? 1 : 0.58) + size * letterSpacing;
      lineMax = Math.max(lineMax, size * scale);
    }
    flush();
    const maxWidth = (patch.text.maxWidth == null ? 0.9 : Number(patch.text.maxWidth)) * frameW;
    blockW = Math.min(blockW, maxWidth);
    const params = (patch.location && patch.location.params) || {};
    const x = ((params.x == null ? 0.5 : params.x) + (params.offsetX || 0)) * frameW;
    const y = ((params.y == null ? 0.5 : params.y) + (params.offsetY || 0)) * frameH;
    const edgeX = params.edgeX || 0;
    const edgeY = params.edgeY || 0;
    const cx = x - edgeX * (blockW / 2);
    const cy = y - edgeY * (blockH / 2);
    return { x0: cx - blockW / 2, y0: cy - blockH / 2, x1: cx + blockW / 2, y1: cy + blockH / 2 };
  }

  // ---------------------------------------------------------------------------
  // The size ladder (auto direct)
  // ---------------------------------------------------------------------------

  const SIZE_LEVELS = 10; // 10% steps from the legible floor to the full screen
  const SIZE_FLOOR_PX = 24; // the hard floor directBeat always had

  // The size range of one beat: the readable floor up to the size that fills
  // the frame with the beat's own lines. `spanScale` is the largest compose
  // span scale, so a hero word at 2x still fits. `minScale` is the smallest
  // span scale in play (a particle at 0.55): the body floor rises so even the
  // smallest on-screen glyph keeps the legibility minimum.
  //
  // `profile` is the section's resolved parameters while the profile is on
  // (raw weird above 0, or a pinned value). It carries the two ends of the
  // ladder: `sizeFloor` multiplies the readable floor (2x at weird 0.6, so a
  // weird song never whispers) and the top stops being the renderer's block
  // limit — it becomes the size at which the folded line spans the frame
  // (`textflow.widthFillSize`), so a long beat wraps instead of shrinking.
  // Without it the classic range stands and weird 0 stays byte-identical.
  function sizeRangeFor(beat, textStyle, ctx, spanScale, minScale, profile) {
    const ratio = (SA.legibility && SA.legibility.MIN_SIZE_RATIO) || 0.045;
    const floorScale = profile && Number(profile.sizeFloor) > 1 ? Number(profile.sizeFloor) : 1;
    const hardFloor = Math.max(SIZE_FLOOR_PX, Math.ceil(ratio * ctx.frameH * floorScale));
    const smallest = Math.max(0.7, Math.min(1, Number(minScale) == null || !Number.isFinite(Number(minScale)) ? 1 : Number(minScale)));
    const floor = Math.max(SIZE_FLOOR_PX, Math.ceil(hardFloor / smallest));
    const lines = beat.lines && beat.lines.length ? beat.lines : [beat.text || ''];
    const measure = { style: textStyle || {}, frame: { width: ctx.frameW, height: ctx.frameH }, aspect: ctx.portrait ? '9:16' : '16:9', lang: ctx.lang };
    const fill = profile
      ? SA.textflow && typeof SA.textflow.widthFillSize === 'function'
        ? SA.textflow.widthFillSize(lines, measure)
        : null
      : SA.textflow && typeof SA.textflow.maxSizeForLines === 'function'
        ? SA.textflow.maxSizeForLines(lines, measure)
        : null;
    const full = fill != null && Number.isFinite(fill) && fill > 0 ? fill : ctx.screen * 0.3;
    const max = Math.floor(full / Math.max(1, spanScale || 1));
    // a very long line cannot reach the floor: the whole ladder collapses onto max
    return { min: Math.min(floor, max), max: Math.max(1, max), floor, full };
  }

  // The profile the size ladder of one cue reads, or null while the profile is
  // off (weird 0 without a pinned value), which keeps the classic range.
  function sizeProfile(ctx, cueId) {
    if (!(ctx && ctx.curve)) return null;
    const params = paramsFor(ctx, cueId) || ctx.params;
    return params ? params : null;
  }

  function sizeLevels(range) {
    const out = [];
    for (let k = 0; k < SIZE_LEVELS; k += 1) out.push(Math.round(range.min + ((range.max - range.min) * k) / (SIZE_LEVELS - 1)));
    return out;
  }

  function nearestLevel(levels, px) {
    let best = 0;
    for (let k = 1; k < levels.length; k += 1) if (Math.abs(levels[k] - px) < Math.abs(levels[best] - px)) best = k;
    return best;
  }

  // Level weights for the ladder: the mean is 1, so the uniform case (no
  // weights, no curve) keeps the classic formula and its draws.
  function normalizeLevelWeights(list) {
    const total = list.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    if (!(total > 0)) return null;
    const mean = total / list.length;
    return list.map((value) => Math.max(0, Number(value) || 0) / mean);
  }

  // The auto-direct size ladder. `change` (sizeChange) is the chance the next
  // beat moves to another level; moving picks the level with the least
  // time/weight so far (ties at random), never the previous one. Without
  // weights / center the weights are all 1 and the pick is exactly the old
  // least-screen-time draw. change 0 returns baseSize and draws no random.
  // `choose` may pass its own `change`, which is how a section-aware run gives
  // every block its own size change rate.
  function createSizeLadder(options) {
    const change = Math.max(0, Math.min(1, Number(options.change) || 0));
    const baseSize = Number(options.baseSize) || 96;
    const random = options.random;
    const time = new Array(SIZE_LEVELS).fill(0);
    let spent = 0;
    let count = 0;
    const fixedWeights =
      Array.isArray(options.weights) && options.weights.length === SIZE_LEVELS ? normalizeLevelWeights(options.weights) : null;
    const center = Number.isFinite(Number(options.center)) ? Math.max(0, Math.min(1, Number(options.center))) : null;
    const spread = Number.isFinite(Number(options.spread)) ? Math.max(0, Number(options.spread)) : 0.28;
    const curved = !!(fixedWeights || center != null);
    function weightsFor(centerShift) {
      if (!curved) return null;
      if (fixedWeights) return fixedWeights;
      // A zero spread is a delta - one level, no shape - so the beat's loudness
      // has nothing to slide along the curve. Shifting the centre would only
      // teleport the delta onto a different level (centre 1 minus a quiet beat's
      // shift lands on the smallest one), which is the opposite of what pinning
      // the spread to 0 asks for.
      if (spread <= 0) return SA.weird.sizeWeights(SIZE_LEVELS, center, 0);
      const shift = Number(centerShift);
      const c = Math.max(0, Math.min(1, center + (Number.isFinite(shift) ? shift : 0)));
      return SA.weird.sizeWeights(SIZE_LEVELS, c, spread);
    }
    function record(level, duration) {
      if (level == null) return;
      const d = Math.max(0.05, Number(duration) || 0);
      time[level] += d;
      spent += d;
      count += 1;
    }
    function choose({ duration, range, prev, avoid, centerShift, change: ownChange }) {
      const rate = ownChange == null ? change : Math.max(0, Math.min(1, Number(ownChange) || 0));
      if (rate <= 0) return { px: baseSize, level: null };
      const levels = sizeLevels(range);
      const weights = weightsFor(centerShift);
      let level;
      let px;
      if (!prev) {
        // the song opens on the theme size; with a curve it opens on the
        // most likely level instead
        level = weights ? weights.indexOf(Math.max(...weights)) : nearestLevel(levels, baseSize);
        px = levels[level];
      } else if (random() >= rate) {
        if (weights && prev.level != null) {
          // keep the level, so a narrow curve (e.g. the largest size only) holds
          // on every beat even when the range differs
          level = prev.level;
          px = levels[level];
        } else {
          px = Math.max(levels[0], Math.min(levels[SIZE_LEVELS - 1], prev.px)); // keep the size
          level = prev.level == null ? nearestLevel(levels, px) : prev.level;
        }
      } else if (weights) {
        // the curve is a probability: a weighted draw over the levels that carry
        // a real share (the least-time balance would visit every level early,
        // whatever its weight). A move never lands on the previous level unless
        // it is the only one left.
        const peak = Math.max(...weights);
        const real = levels.map((_, k) => k).filter((k) => weights[k] >= 0.1 * peak);
        let candidates = real.filter((k) => k !== prev.level && k !== avoid);
        if (!candidates.length) candidates = real.filter((k) => k !== prev.level);
        if (!candidates.length) candidates = real;
        const total = candidates.reduce((sum, k) => sum + weights[k], 0);
        let pickAt = random() * total;
        level = candidates[candidates.length - 1];
        for (const k of candidates) {
          pickAt -= weights[k];
          if (pickAt < 0) {
            level = k;
            break;
          }
        }
        px = levels[level];
      } else {
        const banned = new Set([prev.level, avoid].filter((k) => k != null));
        let candidates = levels.map((_, k) => k).filter((k) => !banned.has(k));
        if (weights) candidates = candidates.filter((k) => weights[k] > 0);
        if (!candidates.length) candidates = levels.map((_, k) => k).filter((k) => !weights || weights[k] > 0);
        if (!candidates.length) candidates = levels.map((_, k) => k);
        const need = (k) => (weights ? time[k] / weights[k] : time[k]);
        const least = Math.min(...candidates.map(need));
        const slack = 0.5 * (count ? spent / count : Math.max(0.05, duration));
        const average = weights ? weights.reduce((sum, value) => sum + value, 0) / SIZE_LEVELS : 1;
        const tied = candidates.filter((k) => need(k) <= least + slack / Math.max(1e-6, average));
        level = tied[Math.min(tied.length - 1, Math.floor(random() * tied.length))];
        px = levels[level];
      }
      record(level, duration);
      return { px, level };
    }
    return { change, baseSize, record, choose, levelOf: (px, range) => nearestLevel(sizeLevels(range), px) };
  }

  // The ladder pick for one beat in song order: the caller's `ctx.sizePrev` is
  // the previous beat's pick. `centerShift` moves this beat's curve with the
  // music (the beat's energy against the song average). A section-aware run
  // passes its cue id, so the block's own size change rate applies.
  function ladderPx(ctx, beat, range, centerShift, cueId) {
    const own = cueId ? paramsFor(ctx, cueId) : null;
    const pick = ctx.sizeLadder.choose({
      duration: beat.end - beat.start,
      range,
      prev: ctx.sizePrev,
      centerShift,
      change: own ? own.sizeChange : undefined,
    });
    ctx.sizePrev = pick;
    return pick.px;
  }

  // The composed beat's last readability gate: the hero span shrinks until the
  // whole line fits above the floor, and every particle span rises until its
  // own glyph keeps the floor. `px` is the body size the ladder picked.
  function fitComposeSpans(text, range, px) {
    const compose = text && text.compose;
    if (!compose || !Array.isArray(compose.spans) || !compose.spans.length) return;
    const floor = Number(range && range.floor) || 0;
    const full = Number(range && range.full) || 0;
    if (floor > 0 && full > 0) {
      const cap = Math.max(1, Math.round((full / floor) * 100) / 100);
      for (const span of compose.spans) {
        if ((Number(span.scale) || 1) > cap) span.scale = cap;
      }
    }
    const body = Number(px) || 0;
    if (body > 0 && floor > 0) {
      for (const span of compose.spans) {
        const scale = Number(span.scale) || 1;
        if (scale < 1) span.scale = Math.min(1, Math.max(scale, floor / body));
      }
    }
  }

  // ---------------------------------------------------------------------------
  // The colour ladder (auto direct)
  // ---------------------------------------------------------------------------

  // How far two palettes are apart, same-index RGB difference summed (the same
  // measure the palette dialog uses to keep a re-roll visible). The body lives
  // in moods now (the palette-set generation shares it); the export stays.
  function paletteDistance(colors, avoid) {
    return SA.moods && typeof SA.moods.paletteDistance === 'function' ? SA.moods.paletteDistance(colors, avoid) : 0;
  }

  // The palette a run draws from when the profile lists use-palettes: the
  // listed palette furthest from the avoid lists (the base and the previous
  // cue), repaired so the text keeps its contrast. The colours are copied, so
  // a run never mutates the stored library entry.
  function pickUsePalette(random, usePalettes, avoidLists, rawW) {
    const list = (Array.isArray(usePalettes) ? usePalettes : []).filter(
      (entry) => entry && Array.isArray(entry.colors) && entry.colors.filter((hex) => typeof hex === 'string').length
    );
    if (!list.length) return null;
    const avoid = (avoidLists || []).filter((colors) => Array.isArray(colors) && colors.length);
    let best = null;
    let bestScore = -1;
    list.forEach((entry) => {
      const base = avoid.length ? Math.min(...avoid.map((colors) => paletteDistance(entry.colors, colors))) : 0;
      const score = base + (random ? random() : 0) * 1e-6;
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    });
    const colors = best.colors.slice();
    if (SA.moods && typeof SA.moods.repairContrast === 'function') {
      const contrast = SA.weird && typeof SA.weird.paletteContrast === 'function' ? SA.weird.paletteContrast(rawW) : 4.5;
      SA.moods.repairContrast(colors, contrast, { keepText: true });
    }
    return { id: best.id || 'use-palette', name: best.name || 'palette', colors };
  }

  // A cue draws from the cue palette lottery only when at least one of its
  // beats is set to the classic colour mode: the new method lives on the beat,
  // so a cue without a legacy beat never needs a palette of its own.
  function cueHasLegacyBeat(projectDoc, cue) {
    return ((projectDoc.beats && projectDoc.beats[cue.id]) || [])
      .some((beat) => projectDoc.beatStyles && projectDoc.beatStyles[beat.id] && projectDoc.beatStyles[beat.id].colorLegacy);
  }

  // The cue palette lottery: weird 0 keeps every cue on the base palette, weird
  // 1 re-rolls every cue (`paletteSwitchChance` = weird). The drawn palette
  // avoids the base and the previous cue's palette so the change is always
  // visible. Returns the drawn palette (without the `auto` marker) or null.
  // The keep roll stays `random() < 1 - switchChance`, the exact form the old
  // keep-the-base draw used, so a seed switches the same cues as before.
  //
  // A section-aware run adds one rule on top: a cue that opens a section always
  // moves, whatever the dice says (a block that starts on the old palette would
  // read as no change at all). The dice is not drawn on such a cue, so the rest
  // of the run keeps its stream, and the boundary switch works at weird 0 too -
  // that is the plainest way to follow the sections.
  function cuePalette(projectDoc, cue, cueIndex, ctx, prevColors) {
    const boundary = cue ? opensSection(ctx, cue.id) : false;
    const p = paramsFor(ctx, cue && cue.id);
    const switchChance = p ? p.paletteSwitchChance : 0;
    if ((!(switchChance > 0) && !boundary) || !cue || !SA.moods || !SA.rng) return null;
    const baseColors = (ctx.themeStyle && ctx.themeStyle.palette && ctx.themeStyle.palette.colors) || [];
    if (!baseColors.length || typeof SA.moods.generatePalette !== 'function') return null;
    const random = SA.rng.rngFor(ctx.seed + cueIndex * 131, cue.id, 'cue-palette');
    if (!boundary && random() < 1 - switchChance) return null;
    const avoid = [baseColors];
    if (Array.isArray(prevColors) && prevColors.length) avoid.push(prevColors);
    // the section view: a chorus draws a louder, more saturated palette and asks
    // for a higher text / background contrast
    const rawW = rawWFor(ctx, cue.id);
    const axes = axesFor(ctx, cue.id);
    // the profile's use-palettes replace the on-the-fly generation entirely
    const usePalettes = Array.isArray(ctx.usePalettes) ? ctx.usePalettes : [];
    if (usePalettes.length && typeof pickUsePalette === 'function') {
      const picked = pickUsePalette(random, usePalettes, avoid, rawW);
      if (picked) return picked;
    }
    const genre = ctx.genre && SA.genres && typeof SA.genres.get === 'function' ? SA.genres.get(ctx.genre) : null;
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < 3; i += 1) {
      const candidate = SA.moods.generatePalette(random, axes, null, genre && genre.palettes);
      if (!candidate || !Array.isArray(candidate.colors) || !candidate.colors.length) continue;
      const score = Math.min(...avoid.map((colors) => paletteDistance(candidate.colors, colors)));
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return best;
  }

  // The auto-direct colour ladder: `change` (weird.colorChange) is the chance
  // the next beat moves to another scheme of its cue's palette. A move picks
  // the scheme that has had the least screen time so far (ties at random),
  // never the previous one. change 0 returns null for every beat and draws no
  // random. `prev` is `{ id, start }`: id null = the base colours, start = when
  // the current choice began (beats closer than 0.5 s keep it to stop flicker).
  // `invert` (compose profile) is the chance of toggling the inverted scheme:
  // when it is passed, the invert id leaves the normal candidate pool and the
  // dedicated `invertRandom` stream owns entering / leaving it.
  const COLOR_LADDER_GAP = 0.5;
  function createColorLadder(options) {
    const change = Math.max(0, Math.min(1, Number(options && options.change) || 0));
    const random = options && options.random;
    const invert = options && options.invert != null ? Math.max(0, Math.min(1, Number(options.invert) || 0)) : null;
    const invertRandom = options && options.invertRandom;
    const invertId = SA.paletteRoles && SA.paletteRoles.SCHEME_INVERT ? SA.paletteRoles.SCHEME_INVERT : 'TMBD';
    const time = new Map();
    let spent = 0;
    let count = 0;
    const keyOf = (id) => (id == null ? '' : String(id));
    function record(id, duration) {
      const d = Math.max(0.05, Number(duration) || 0);
      const key = keyOf(id);
      time.set(key, (time.get(key) || 0) + d);
      spent += d;
      count += 1;
    }
    function choose({ start, duration, candidates, prev }) {
      if (change <= 0) return null;
      if (!prev) {
        record(null, duration);
        return null;
      }
      const hold = () => {
        record(prev.id, duration);
        return prev.id;
      };
      if (start - prev.start < COLOR_LADDER_GAP) return hold();
      if (invert != null && invertRandom) {
        const canInvert = (candidates || []).some((entry) => keyOf(entry && entry.id != null ? entry.id : entry) === invertId);
        if (canInvert && SA.genParams.roll(invertRandom, invert)) {
          const pick = keyOf(prev.id) === invertId ? null : invertId;
          record(pick, duration);
          return pick;
        }
      }
      if (random() >= change) return hold();
      const ids = [null].concat((candidates || []).map((entry) => (entry && entry.id != null ? entry.id : entry)));
      const pool = ids.filter((id) => keyOf(id) !== keyOf(prev.id));
      if (!pool.length) return hold();
      const least = Math.min(...pool.map((id) => time.get(keyOf(id)) || 0));
      const slack = 0.5 * (count ? spent / count : Math.max(0.05, duration));
      const tied = pool.filter((id) => (time.get(keyOf(id)) || 0) <= least + slack);
      const pick = tied[Math.min(tied.length - 1, Math.floor(random() * tied.length))];
      record(pick, duration);
      return pick;
    }
    return { change, record, choose };
  }

  // The palette ladder: `count` palettes of the theme's set, `change` the chance
  // the next beat moves (0 = never, 1 = always another palette). The move picks
  // any other palette uniformly. count < 2 or change 0 draws no random.
  function createPaletteLadder(options) {
    const count = Math.max(1, Math.floor(Number(options && options.count) || 1));
    const change = Math.max(0, Math.min(1, Number(options && options.change) || 0));
    const random = options && options.random;
    function choose(prev) {
      if (prev == null) return 0;              // the song opens on palette #1
      if (count < 2 || change <= 0) return prev;
      if (change < 1 && random() >= change) return prev;
      const pick = Math.floor(random() * (count - 1));
      return pick >= prev ? pick + 1 : pick;   // never the previous one
    }
    return { count, change, choose };
  }

  const DECO_TYPES = {
    decoNone: 'none',
    decoOutline: 'outline',
    decoShadow: 'dropShadow',
    decoExtrude: 'extrude',
    decoLongShadow: 'longShadow',
    decoDouble: 'multiLine',
    decoGlow: 'neonGlow',
  };

  function roleHex(colors, name, legacy) {
    const roles = SA.paletteRoles;
    if (roles && typeof roles.get === 'function' && roles.SLOT && roles.SLOT[name] != null) return roles.get(colors, roles.SLOT[name]);
    return (colors || [])[legacy];
  }

  // A live palette reference to a role: the fixed slot on a full 10-role
  // palette, the legacy index on a short one. A stored reference follows every
  // palette re-roll / dice at render time, so the decoration keeps the edge
  // role instead of the colour the palette happened to hold at generation.
  // `fallback` is used when the palette is too short to carry the role.
  function roleRef(colors, name, legacy, fallback) {
    const list = Array.isArray(colors) ? colors : [];
    const roles = SA.paletteRoles;
    const slot = roles && roles.SLOT ? roles.SLOT[name] : null;
    if (slot != null && roles.SIZE && list.length >= roles.SIZE) return { kind: 'palette', index: slot };
    if (list.length > legacy) return { kind: 'palette', index: legacy };
    return fallback;
  }

  // The surrounding decoration of one cue, drawn from the profile's weights.
  // Returns an edge stack for `cueStyles[id].edge` or null (keep the theme's
  // own edge). A cue whose backdrop paints two or more planes always gets a
  // separation outline when the draw picked `none` — unless the user pinned
  // the decoration keys themselves. `cueId` gives the draw its section profile.
  function decorationFor(random, ctx, colors, planeCount, cueId) {
    const genParams = SA.genParams;
    const params = paramsFor(ctx, cueId);
    if (!genParams || !params) return null;
    const profile = { typeWeights: ctx.typeWeights };
    const weights = {};
    for (const key of genParams.DECO_KEYS) {
      const type = DECO_TYPES[key];
      if (genParams.typeWeight(profile, 'edge', type) <= 0) continue;
      weights[key] = params[key];
    }
    // a bright background cannot hold a glow: only dark stages draw one
    const dark = (() => {
      const hex = (colors || [])[0];
      if (!hex) return true;
      try {
        return SA.color.rgbToHsv(SA.color.parse(hex)).v < 0.5;
      } catch {
        return true;
      }
    })();
    if (!dark) weights.decoGlow = 0;
    const keys = genParams.DECO_KEYS.filter((key) => weights[key] != null);
    const type = genParams.pickWeighted(random, weights, keys);
    const textBg = roleHex(colors, 'TEXT_BG', 7) || '#000000';
    const textEdge = roleHex(colors, 'TEXT_EDGE', 6) || textBg;
    const textFill2 = roleHex(colors, 'TEXT_FILL2', 5) || '#ffffff';
    // the outline wears the palette's edge role live, so a palette re-roll or
    // dice moves the rendered edge instead of leaving the frozen tone
    const edgeRef = roleRef(colors, 'TEXT_EDGE', 4, textEdge);
    if (!type || type === 'decoNone') {
      // the separation guarantee: two or more planes behind the text need an
      // outline, unless the profile pinned decoNone on purpose
      if (planeCount >= 2 && ctx.pinned.decoNone == null) {
        return [{ type: 'outline', params: { width: 2.5, color: edgeRef }, enabled: true }];
      }
      return null;
    }
    const instanceOf = (edgeType, params2) => ({ type: edgeType, params: { ...SA.fx.paramDefaults('edge', edgeType), ...params2 }, enabled: true });
    switch (type) {
      case 'decoOutline':
        return [instanceOf('outline', { width: Math.round((3 + random() * 3) * 10) / 10, color: edgeRef })];
      case 'decoShadow':
        return [
          instanceOf('outline', { width: 2, color: edgeRef }),
          instanceOf('dropShadow', { offset: { x: 5, y: 6 }, blur: 0, opacity: 0.9 }),
        ];
      case 'decoExtrude':
        return [instanceOf('extrude', { depth: Math.round(10 + random() * 12), angle: 135, colorNear: edgeRef, colorFar: textBg })];
      case 'decoLongShadow':
        return [instanceOf('longShadow', { length: Math.round(30 + random() * 30), angle: 135, fade: 0.6 })];
      case 'decoDouble':
        return [instanceOf('multiLine', { count: 2, width: 2.5, gap: 3, colorRule: 'alternate', colorA: edgeRef, colorB: textFill2 })];
      case 'decoGlow': {
        const stack = [instanceOf('outline', { width: 2, color: edgeRef }), instanceOf('neonGlow', {})];
        SA.moods.tameGlow({ edge: stack }, rawWFor(ctx, cueId));
        return stack;
      }
      default:
        return null;
    }
  }

  // The foreground (fill) treatment of one cue: drawn from the profile's
  // foreground weights. `solid` keeps the classic single-colour fill; `vivid`
  // swaps the body onto the accent role and the hero onto the text role;
  // `gradient` paints the body between the two; `effect` keeps the drawn fill
  // when the theme has one, otherwise it draws a fill effect of its own.
  // `params` / `cueId` are the caller's section view (the cue's own profile
  // copy), so a chorus draws its louder foreground.
  function foregroundFor(random, ctx, colors, params, cueId) {
    const genParams = SA.genParams;
    const own = params || ctx.params;
    if (!genParams || !own) return null;
    const type = genParams.pickWeighted(random, own, genParams.FG_KEYS);
    if (!type || type === 'fgSolid') return null;
    const list = Array.isArray(colors) ? colors : (colors && Array.isArray(colors.colors) ? colors.colors : []);
    if (!list.length) return null;
    const fill = SA.compositions && typeof SA.compositions.paletteRefIndex === 'function' ? SA.compositions.paletteRefIndex(list, 4) : 2;
    const fill2 = SA.compositions && typeof SA.compositions.paletteRefIndex === 'function' ? SA.compositions.paletteRefIndex(list, 5) : 3;
    const bg = SA.color.parse(list[0] || '#000000');
    const readable = (hex) => !!hex && SA.color.contrastRatio(SA.color.parse(hex), bg) >= 4.5;
    if (type === 'fgVivid') {
      if (!readable(list[fill2])) return null; // a low-contrast accent falls back to solid
      return { color: { fill: { kind: 'palette', index: fill2 }, fill2: { kind: 'palette', index: fill } } };
    }
    if (type === 'fgGradient') {
      if (!readable(list[fill]) || !readable(list[fill2])) return null;
      return {
        color: {
          fill: {
            kind: 'gradient',
            type: 'linear',
            angle: 90,
            stops: [
              { pos: 0, paletteIndex: fill },
              { pos: 1, paletteIndex: fill2 },
            ],
          },
        },
      };
    }
    if (type === 'fgEffect') {
      const fill = fillEffectFor(random, ctx, cueId);
      return fill ? { fill } : null;
    }
    if (type === 'fgPattern') {
      const fill = patternFillFor(random, ctx, colors);
      return fill ? { fill } : null;
    }
    return null;
  }

  // The pattern fills that keep a glyph readable: halftone and speckle break
  // the outline up, so the generator leaves them to hand editing.
  const READABLE_PATTERN_FILLS = ['stripes', 'checker', 'diamondGrid', 'hatch'];

  // A pattern fill painted between two readable text colours, drawn straight
  // from READABLE_PATTERN_FILLS. A drawn look that already carries a fill wins;
  // a palette without two readable colours yields nothing.
  function patternFillFor(random, ctx, colors) {
    const themeFill = ctx.themeStyle && ctx.themeStyle.fill;
    if (themeFill && themeFill.type && !(ctx && ctx.hasPinnedFg)) return null;
    const list = Array.isArray(colors) ? colors : (colors && Array.isArray(colors.colors) ? colors.colors : []);
    if (list.length < 2 || !SA.fx || typeof SA.fx.paramDefaults !== 'function') return null;
    const bg = SA.color.parse(list[0] || '#000000');
    // the text roles first (fill, fill2), then the accent colours a short palette
    // keeps at 5 / 6; every one has to clear the legibility floor on its own
    const long = list.length >= 10;
    const candidates = long ? [4, 5, 6] : [2, 3, 5, 6];
    const readable = candidates.filter((i) => list[i] && SA.color.contrastRatio(SA.color.parse(list[i]), bg) >= 4.5);
    if (readable.length < 2) return null;
    const first = readable[0];
    const others = readable.slice(1);
    const type = pick(random, READABLE_PATTERN_FILLS);
    return {
      type,
      params: {
        ...SA.fx.paramDefaults('fill', type),
        colorA: { kind: 'palette', index: first },
        colorB: { kind: 'palette', index: pick(random, others) },
        angle: Math.round((random() * 2 - 1) * 45),
        size: Math.round(12 + random() * 20),
        ratio: Math.round((0.5 + random() * 0.25) * 100) / 100,
      },
      enabled: true,
    };
  }

  // A fill effect of the profile's grammar: the drawn look's own fill wins, and
  // a missing registry / pool yields nothing. Shared by the cue-level
  // foreground (which wraps it in `{ fill }`) and the per-beat fill roll. The
  // pick is weighted by the axes, so the cue's section view (a loud block opens
  // the louder fill grammar) needs the cue id.
  function fillEffectFor(random, ctx, cueId) {
    const themeFill = ctx.themeStyle && ctx.themeStyle.fill;
    if (themeFill && themeFill.type && !(ctx && ctx.hasPinnedFg)) return null; // the drawn look already carries one
    if (!SA.moods || typeof SA.moods.pickEntry !== 'function') return null;
    const entry = SA.moods.pickEntry(random, 'fill', axesFor(ctx, cueId), ctx.cueContext || {}, ctx.direction, null, null, { typeWeights: ctx.typeWeights });
    if (!entry) return null;
    const fallback = SA.fx && typeof SA.fx.paramDefaults === 'function' ? SA.fx.paramDefaults('fill', entry) : {};
    return { type: entry, params: fallback, enabled: true };
  }

  // One beat as a composition: analyse the text, pick a template and write the
  // patch. The weird axis no longer jitters size / colour / tilt - it only
  // widens which compositions are allowed and how large the hero grows.
  function composeBeat(projectDoc, cue, beat, beatIndex, cueIndex, ctx) {
    if (!SA.compositions || typeof SA.compositions.build !== 'function') return;
    const styleMode = projectDoc.styleMode || {};
    const keywordWords = SA.keywords && typeof SA.keywords.listFor === 'function' ? SA.keywords.listFor(styleMode).words : [];
    const lang = (projectDoc.meta && projectDoc.meta.lang) || null;
    const analysis = SA.compositions.analyzeBeat(beat.text, lang, keywordWords);
    // the beat's own loudness wins; without audio the section's energy axis is
    // the loudness (a boosted block wants the livelier composition)
    const sectionAxes = axesFor(ctx, cue.id) || {};
    let energy = Number.isFinite(sectionAxes.energy) ? sectionAxes.energy : ctx.energy;
    if (ctx.analysis && SA.audioDriver && typeof SA.audioDriver.rangeEnergy === 'function') {
      const sampled = SA.audioDriver.rangeEnergy(ctx.analysis, beat.start, beat.end);
      if (sampled != null) energy = sampled;
    }
    const params = paramsFor(ctx, cue.id) || {};
    const rawW = rawWFor(ctx, cue.id);
    // the staging seeds: one salt per section, so a block of beats shares a
    // staging tendency and the next block draws its own
    const staging = stagingSeed(ctx, ctx.seed, cue.id);
    // the beat's own loudness moves its size curve: a loud beat grows, a quiet
    // one shrinks, always around the song's own average (0 without audio)
    let centerShift = 0;
    if (ctx.sizeLadder && ctx.sizeLadder.change > 0 && params.sizeFollow) {
      centerShift = Math.max(-1, Math.min(1, params.sizeFollow * ((Number(energy) || 0) - (Number(ctx.energy) || 0)) * 2));
    }
    const history = ctx.composeHistory || (ctx.composeHistory = []);
    const prev = [];
    for (let i = history.length - 1; i >= 0 && prev.length < 2; i -= 1) prev.push(history[i].id);
    const last = history.length ? history[history.length - 1] : null;
    const features = {
      chars: analysis.chars,
      words: analysis.words,
      duration: Math.max(0.05, (Number(beat.end) || 0) - (Number(beat.start) || 0)),
      cjk: analysis.cjk,
      portrait: !!ctx.portrait,
      energy,
      prev,
      prevScale: last ? last.scaleClass : null,
    };
    const comp = SA.compositions.pick(features, {
      seed: staging,
      beatId: beat.id,
      w: rawW,
      history,
      // the size centre bias only applies once the curve is on (raw weird > 0
      // or a pinned parameter), so weird 0 keeps the classic composition draw
      sizeCenter: ctx.curve ? params.sizeCenter : undefined,
    });
    const patch = SA.compositions.build(comp, analysis, {
      seed: staging,
      beatId: beat.id,
      w: rawW,
      screen: ctx.screen,
      themeStyle: ctx.themeStyle,
      palette: (ctx.themeStyle && ctx.themeStyle.palette) || (projectDoc.style && projectDoc.style.palette) || null,
      // the hero multiplier: the derived value equals the old (1 + 0.3w)
      heroScale: params.heroScale,
    });
    // the foreground profile: vivid swaps the body against the hero, gradient
    // paints the body. Only written when the template carries a colour.
    const foreground = ctx.cueForeground && ctx.cueForeground[cue.id];
    if (foreground && foreground.color && patch.color) {
      patch.color = { ...patch.color, ...foreground.color };
    }
    // boldChance: some cues set the body in 700 (400-weight templates only)
    if (ctx.cueBold && ctx.cueBold[cue.id] && patch.text && patch.text.weight === 400) patch.text.weight = 700;
    // POST shape layer handling: at most 1 shape layer across the song (probability <= 1 at weird 1)
    const gr = SA.rng.rngFor(ctx.seed + cueIndex * 131, beat.id, 'graphic');
    let isShapeBeat = false;
    if (ctx.shapeLayerBeatId !== undefined) {
      isShapeBeat = ctx.shapeLayerBeatId !== null && beat.id === ctx.shapeLayerBeatId;
    } else {
      // Standalone composeBeat call or re-roll without explicit ctx.shapeLayerBeatId:
      // Ensure at most 1 shape layer exists across projectDoc.beatStyles
      const otherHasShape = Object.entries(projectDoc.beatStyles || {}).some(([bId, bs]) => {
        return bId !== beat.id && bs && Array.isArray(bs.post) && bs.post.some((p) => p && p.type === 'shapeLayer');
      });
      if (!otherHasShape) {
        const graphicChance = ctx.curve && params.graphicChance != null ? Number(params.graphicChance) : 0;
        if (comp.graphic) {
          isShapeBeat = true;
        } else if (graphicChance > 0 && gr() < graphicChance) {
          isShapeBeat = true;
        }
      }
    }

    if (!isShapeBeat) {
      if (Array.isArray(patch.post)) {
        patch.post = patch.post.filter((entry) => !entry || entry.type !== 'shapeLayer');
      }
    } else {
      let shapeEntry = Array.isArray(patch.post) ? patch.post.find((entry) => entry && entry.type === 'shapeLayer') : null;
      const gScale = params.graphicScale;
      if (!shapeEntry) {
        const base = pick(gr, COMPOSE_GRAPHICS);
        shapeEntry = { type: 'shapeLayer', params: resolveGraphicParams(base, gr, gScale), enabled: true };
        patch.post = Array.isArray(patch.post) ? patch.post.concat([shapeEntry]) : [shapeEntry];
      } else if (shapeEntry.params) {
        shapeEntry.params = resolveGraphicParams(shapeEntry.params, gr, gScale);
      }
    }
    varyBeat(projectDoc, cue, beat, beatIndex, cueIndex, ctx, patch, analysis, comp, energy);
    projectDoc.beatStyles[beat.id] = SA.project.mergeDeep(projectDoc.beatStyles[beat.id] || {}, patch);
    // The ladder owns the size above the template. Above change 0 it picks a
    // level per beat; at raw weird 0 it pins the run's base size, so the font
    // size never changes with energy. A weird run with the change pinned to 0
    // instead keeps the composition's own size (the composition is the picture).
    if (ctx.sizeLadder && (ctx.sizeLadder.change > 0 || !(Number(ctx.rawW) > 0))) {
      const text = projectDoc.beatStyles[beat.id].text;
      if (ctx.sizeLadder.change > 0) {
        const spans = (text.compose && text.compose.spans) || [];
        const scales = spans.map((span) => Number(span.scale) || 1);
        const spanScale = scales.length ? Math.max(1, ...scales) : 1;
        const minScale = scales.length ? Math.min(...scales) : 1;
        const profile = sizeProfile(ctx, cue.id);
        let range = sizeRangeFor(beat, text, ctx, spanScale, minScale, profile);
        // a hero that cannot clear the floor even at its own scale shrinks until
        // the whole line fits, then the range is measured again
        if (range.full > 0 && range.max < range.floor) {
          const cap = Math.max(1, range.full / range.floor);
          for (const span of spans) if ((Number(span.scale) || 1) > cap) span.scale = Math.round(cap * 100) / 100;
          const next = spans.map((span) => Number(span.scale) || 1);
          range = sizeRangeFor(beat, text, ctx, next.length ? Math.max(1, ...next) : 1, next.length ? Math.min(...next) : 1, profile);
        }
        const px = ladderPx(ctx, beat, range, centerShift, cue.id);
        text.size = Math.max(8, Math.round(px / (beat.fontScale || 1)));
        // every particle span rises until its own glyph keeps the floor
        fitComposeSpans(text, range, px);
      } else {
        text.size = Math.max(8, Math.round(ctx.sizeLadder.baseSize / (beat.fontScale || 1)));
      }
    }
    history.push(comp);
    if (ctx.composeZones) {
      // the union of every beat's text box: the figure layer stays clear of the
      // whole cue, not just its first line
      const zone = estimateComposeZone(comp, analysis, { ...patch, text: projectDoc.beatStyles[beat.id].text }, ctx);
      const existing = ctx.composeZones[cue.id];
      ctx.composeZones[cue.id] = existing
        ? {
            x0: Math.min(existing.x0, zone.x0),
            y0: Math.min(existing.y0, zone.y0),
            x1: Math.max(existing.x1, zone.x1),
            y1: Math.max(existing.y1, zone.y1),
          }
        : zone;
    }
  }

  // The per-beat variation of one composed picture. Every element has its own
  // stream, so pinning one chance never shifts the others. Only the profile
  // path (curve on) draws: weird 0 without pinned values leaves the template
  // untouched.
  function varyBeat(projectDoc, cue, beat, beatIndex, cueIndex, ctx, patch, analysis, comp, energy) {
    if (!ctx.compose || !ctx.curve || !ctx.params || !patch || !patch.text || !SA.genParams) return;
    // the beat's section view: its own profile copy, weird channels and axes
    const p = paramsFor(ctx, cue.id);
    const w = wFor(ctx, cue.id);
    const axes = axesFor(ctx, cue.id);
    const gp = SA.genParams;
    const cueContext = SA.moods.contextForCue(projectDoc, cue);
    ctx.cueContext = cueContext;
    const stream = (name) => SA.rng.rngFor(ctx.seed + cueIndex * 131, beat.id, name);
    const duration = Math.max(0.05, (Number(beat.end) || 0) - (Number(beat.start) || 0));
    // font (I17): a beat may leave the cue's face
    const fontRandom = stream('beat-font');
    if (gp.roll(fontRandom, p.beatFontChance)) {
      const current = (ctx.cueFont && ctx.cueFont[cue.id]) || (ctx.themeStyle && ctx.themeStyle.text && ctx.themeStyle.text.fontId);
      const fontId = SA.moods.weirdFont(fontRandom, cueContext, current);
      if (fontId) patch.text.fontId = fontId;
    }
    // weight: only templates the cue did not already embolden
    const boldRandom = stream('beat-bold');
    if (!(ctx.cueBold && ctx.cueBold[cue.id]) && patch.text.weight === 400 && gp.roll(boldRandom, p.beatBoldChance)) {
      patch.text.weight = 700;
    }
    // tracking / leading: the classic band formula around the profile's range
    const spacingRandom = stream('spacing');
    if (gp.roll(spacingRandom, p.spacingChance)) {
      const r = p.spacingRange;
      patch.text.letterSpacing = Math.round((-0.04 * r + spacingRandom() * (0.1 + 0.25 * r)) * 100) / 100;
      patch.text.lineHeight = Math.round((1.2 + (spacingRandom() * 2 - 1) * 0.35 * r) * 100) / 100;
    }
    // alignment: a centred template may step off the middle
    const alignRandom = stream('align');
    if (patch.text.align === 'center' && gp.roll(alignRandom, p.alignChance)) {
      patch.text.align = pick(alignRandom, ['left', 'right']);
    }
    // line width: only tightens
    const widthRandom = stream('width');
    if (gp.roll(widthRandom, p.widthChance)) {
      const current = patch.text.maxWidth == null ? 0.9 : Number(patch.text.maxWidth);
      patch.text.maxWidth = Math.round(Math.min(current, 0.5 + widthRandom() * 0.4) * 100) / 100;
    }
    // text colour: a gradient of two accents first, then a single accent
    const colorRandom = stream('beat-color');
    if (Array.isArray(ctx.accentIdx) && ctx.accentIdx.length) {
      if (ctx.accentIdx.length >= 2 && gp.roll(colorRandom, p.gradientColorChance)) {
        const [a, b] = [ctx.accentIdx[Math.floor(colorRandom() * ctx.accentIdx.length)], ctx.accentIdx[Math.floor(colorRandom() * ctx.accentIdx.length)]];
        patch.color = {
          fill: {
            kind: 'gradient',
            type: 'linear',
            angle: Math.round(colorRandom() * 360),
            stops: [
              { pos: 0, paletteIndex: a },
              { pos: 1, paletteIndex: b },
            ],
            animate: { angleSpeed: Math.round((colorRandom() * 2 - 1) * 90 * w), shiftSpeed: 0 },
          },
        };
      } else if (gp.roll(colorRandom, p.accentColorChance)) {
        patch.color = { fill: { kind: 'palette', index: ctx.accentIdx[Math.floor(colorRandom() * ctx.accentIdx.length)] } };
      }
    }
    // fill effect
    const fillRandom = stream('beat-fill');
    if (gp.roll(fillRandom, p.fillEffectChance)) {
      const fill = fillEffectFor(fillRandom, ctx, cue.id);
      if (fill) patch.fill = fill;
    }
    // pattern fill: its own stream, so pinning one chance never shifts the other
    const patternRandom = stream('beat-pattern');
    if (gp.roll(patternRandom, p.patternFillChance)) {
      const colors = ctx.cuePaletteColors || (ctx.themeStyle && ctx.themeStyle.palette && ctx.themeStyle.palette.colors) || [];
      const fill = patternFillFor(patternRandom, ctx, colors);
      if (fill) patch.fill = fill;
    }
    // entrance mask: the wipe replaces the template's entrance, the motion
    // (when a later draw replaces the entrance) stays
    const maskRandom = stream('mask');
    let masked = false;
    if (gp.roll(maskRandom, p.maskChance)) {
      const base = patch.enter || {};
      patch.enter = {
        type: 'rangeReveal',
        params: { ...(SA.fx && typeof SA.fx.paramDefaults === 'function' ? SA.fx.paramDefaults('enter', 'rangeReveal') : {}), wipe: pick(maskRandom, ['left', 'right', 'up', 'down', 'iris', 'diagonal']) },
        enabled: true,
      };
      if (base.motion) patch.enter.motion = base.motion;
      masked = true;
    }
    // tilt
    const tiltRandom = stream('tilt');
    if (gp.roll(tiltRandom, p.tiltChance)) {
      const s = (a) => Math.round((tiltRandom() * 2 - 1) * a * p.tiltRange * 10) / 10;
      patch.transform = { rotate: s(25), tiltX: s(20), tiltY: s(20) };
    }
    // hold: a longer beat may carry one of the profile's holds
    const holdEmpty = !Array.isArray(patch.hold) || !patch.hold.length;
    if (holdEmpty && duration >= 0.6) {
      const holdRandom = stream('beat-hold');
      if (gp.roll(holdRandom, p.holdChance)) {
        const hold =
          w >= 0.5
            ? SA.moods.weirdBeatHold(holdRandom, axes, cueContext, ctx.accentHexes)
            : smartHold(holdRandom, ctx.s, Math.round((0.06 + 0.1 * w) * 1000) / 1000, Math.round(ctx.bpm * pick(holdRandom, [0.5, 1, 1, 2])), axes, ctx.beatFit);
        if (hold) patch.hold = [hold];
      }
    }
    // pulse: the fallback beat grammar on a longer, loud beat
    if ((!Array.isArray(patch.hold) || !patch.hold.length) && duration >= 1.2 && (Number(energy) || 0) > 0.45) {
      const pulseRandom = stream('pulse');
      if (gp.roll(pulseRandom, p.pulseChance)) {
        const pulseBpm = w > 0 ? Math.round(ctx.bpm * pick(pulseRandom, [0.5, 1, 1, 2])) : Math.round(ctx.bpm);
        patch.hold = [smartHold(pulseRandom, ctx.s, Math.round((0.02 + (Number(energy) || 0) * 0.08) * 1000) / 1000, pulseBpm, axes, ctx.beatFit)];
      }
    }
    // entrance / exit: a fresh grammar draw, the mask keeps its entrance
    const motionRandom = stream('beat-motion');
    if (gp.roll(motionRandom, p.motionChance)) {
      const generated = SA.moods.generate({
        axes,
        seed: stagingSeed(ctx, ctx.seed + cueIndex * 131 + beatIndex + 1, cue.id),
        direction: ctx.direction,
        genre: ctx.genre,
        context: cueContext,
        typeWeights: ctx.typeWeights,
        params: p,
      }).style;
      if (generated.exit) patch.exit = generated.exit;
      if (generated.enter) {
        if (masked && patch.enter) {
          if (generated.enter.motion) patch.enter.motion = generated.enter.motion;
        } else patch.enter = generated.enter;
      }
    }
    // the cue's location nudge: applied here so the ladder sees the final box
    const shift = ctx.cueShift && ctx.cueShift[cue.id];
    if (shift) {
      patch.location = patch.location || { type: 'grid', params: {} };
      const location = patch.location.params || (patch.location.params = {});
      location.offsetX = Math.round(((Number(location.offsetX) || 0) + shift.dx) * 100) / 100;
      location.offsetY = Math.round(((Number(location.offsetY) || 0) + shift.dy) * 100) / 100;
      if (shift.float) patch.location.type = 'randomSafe';
      // the estimated box must stay on screen: shrink this beat's nudge by the
      // part that would leave the frame
      const zone = estimateComposeZone(comp, analysis, patch, ctx);
      const frameW = ctx.frameW || 1920;
      const frameH = ctx.frameH || 1080;
      if (zone.x0 < 0) location.offsetX = Math.round((location.offsetX - zone.x0 / frameW) * 100) / 100;
      else if (zone.x1 > frameW) location.offsetX = Math.round((location.offsetX - (zone.x1 - frameW) / frameW) * 100) / 100;
      if (zone.y0 < 0) location.offsetY = Math.round((location.offsetY - zone.y0 / frameH) * 100) / 100;
      else if (zone.y1 > frameH) location.offsetY = Math.round((location.offsetY - (zone.y1 - frameH) / frameH) * 100) / 100;
    }
    // the cue's repeat must not fight this beat's own composition
    const repeat = ctx.cueRepeat && ctx.cueRepeat[cue.id];
    if (repeat && SA.random && typeof SA.random.repeatConflicts === 'function' && SA.random.repeatConflicts({ ...patch, repeat })) {
      if (!ctx.songHasRepeat || ctx.guaranteedRepeatCueId !== cue.id) {
        patch.repeat = { type: 'none', params: {}, enabled: false };
      }
    }
  }

  // One beat's treatment inside the cue's theme. The size the sixth axis picks
  // is a ratio of the frame's short side (3%..120%), not a magnification of the
  // theme size: a weird song jumps between a whisper and a screen-filling word.
  function directBeat(projectDoc, cue, beat, beatIndex, cueIndex, ctx) {
    if (ctx.compose) {
      composeBeat(projectDoc, cue, beat, beatIndex, cueIndex, ctx);
      return;
    }
    const { s, seed, genre, direction, themeStyle, baseSize, energy, bpm, accentIdx, accentHexes, beatFit } = ctx;
    // the beat's section view (a section-aware run gives each block its own
    // profile, weird channels and staging stream)
    const w = wFor(ctx, cue.id);
    const axes = axesFor(ctx, cue.id);
    const cueContext = SA.moods.contextForCue(projectDoc, cue);
    const beatSeed = seed + cueIndex * 131 + beatIndex + 1;
    const beatRng = SA.rng.rngFor(beatSeed, beat.id, 'beat');
    const jitter = beatRng(); // the old base-size draw: kept so the hold roll below stays on its stream
    const px = ctx.sizeLadder
      ? ladderPx(ctx, beat, sizeRangeFor(beat, SA.project.resolveStyle(projectDoc, `cue:${cue.id}/beat:${beat.id}`).text, ctx, 1, undefined, sizeProfile(ctx, cue.id)), undefined, cue.id)
      : baseSize * (0.9 + jitter * 0.25);
    const size = Math.round(px / (beat.fontScale || 1)); // scene.js multiplies fontScale back in
    const beatPatch = { text: { size } };
    const beatDuration = Math.max(0.2, beat.end - beat.start);
    const p = paramsFor(ctx, cue.id);
    if (beatDuration >= 1.2 && energy > 0.45 && SA.genParams.roll(beatRng, p.pulseChance)) {
      const pulseBpm = w > 0 ? Math.round(bpm * pick(beatRng, [0.5, 1, 1, 2])) : Math.round(bpm);
      beatPatch.hold = [smartHold(beatRng, s, Math.round((0.02 + energy * 0.08) * 1000) / 1000, pulseBpm, axes, beatFit)];
    }
    if (w > 0) {
      // E4 / I18 / H5: a weird song steps the beat treatment as well:
      // colour, tilt, font and hold all jump half a bar. The size is the
      // ladder's now, but the old weird-size draw is kept so colour, tilt,
      // hold and font stay on their streams. The thresholds are the profile's
      // chances (their derived values are the old literals).
      const wr = SA.rng.rngFor(beatSeed, beat.id, 'weird');
      wr();
      if (accentIdx.length && SA.genParams.roll(wr, p.accentColorChance)) {
        if (accentIdx.length >= 2 && SA.genParams.roll(wr, p.gradientColorChance)) {
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
      if (SA.genParams.roll(wr, p.tiltChance)) {
        const r = (a) => Math.round((wr() * 2 - 1) * a * p.tiltRange * 10) / 10;
        beatPatch.transform = { rotate: r(25), tiltX: r(20), tiltY: r(20) }; // degrees (the shader converts)
      }
      if (!beatPatch.hold && beatDuration >= 0.6 && SA.genParams.roll(wr, p.holdChance)) {
        const hold =
          w >= 0.5
            ? SA.moods.weirdBeatHold(wr, axes, cueContext, accentHexes)
            : smartHold(wr, s, Math.round((0.06 + 0.1 * w) * 1000) / 1000, Math.round(bpm * pick(wr, [0.5, 1, 1, 2])), axes, beatFit);
        if (hold) beatPatch.hold = [hold];
      }
      if (SA.genParams.roll(wr, p.motionChance)) {
        const g = SA.moods.generate({ axes, seed: stagingSeed(ctx, beatSeed * 7 + 3, cue.id), direction, genre, context: cueContext, typeWeights: ctx.typeWeights, params: p || null }).style;
        if (g.enter) beatPatch.enter = g.enter;
        if (g.exit) beatPatch.exit = g.exit;
      }
      if (w >= 0.6 && SA.genParams.roll(wr, p.beatFontChance)) {
        const fontId = SA.moods.weirdFont(wr, cueContext, themeStyle.text && themeStyle.text.fontId);
        if (fontId) beatPatch.text.fontId = fontId;
      }
    }
    projectDoc.beatStyles[beat.id] = SA.project.mergeDeep(projectDoc.beatStyles[beat.id] || {}, beatPatch);
  }

  // Re-picks the ladder size of `targetIds` inside the song: the other beats'
  // sizes seed the level times, and each target avoids both neighbours' levels.
  // `options.params` carries the resolved profile of the project (store re-rolls
  // pass it); without it the parameters are derived from the axes alone.
  function resizeBeats(projectDoc, axes, targetIds, seed, options) {
    const opts = options || {};
    const output = projectDoc.output || {};
    const portrait = (output.aspect || '16:9') === '9:16';
    const frameW = Number(output.width) || (portrait ? 1080 : 1920);
    const frameH = Number(output.height) || (portrait ? 1080 : 1080);
    const ctx = { frameW, frameH, portrait, screen: Math.min(frameW, frameH), lang: (projectDoc.meta && projectDoc.meta.lang) || null };
    const baseSize = Number((projectDoc.style && projectDoc.style.text && projectDoc.style.text.size) || (portrait ? 72 : 96));
    const resolved = opts.params && opts.params.sizeChange != null ? opts.params : SA.genParams.resolve({ axes });
    const change = resolved.sizeChange;
    const rawW = SA.weird && typeof SA.weird.raw === 'function' ? SA.weird.raw(axes && axes.weird) : Number((axes || {}).weird) || 0;
    const curve = opts.curve != null ? !!opts.curve : rawW > 0;
    // the same two ends the run itself used (see sizeRangeFor)
    const profile = curve && resolved ? resolved : null;
    const targets = new Set(targetIds);
    const rows = []; // song order: { cue, beat, range, px, target }
    for (const cue of projectDoc.script.cues || []) {
      for (const beat of (projectDoc.beats && projectDoc.beats[cue.id]) || []) {
        const text = SA.project.resolveStyle(projectDoc, `cue:${cue.id}/beat:${beat.id}`).text || {};
        const spans = (text.compose && text.compose.spans) || [];
        const scales = spans.map((s) => Number(s.scale) || 1);
        const range = sizeRangeFor(beat, text, ctx, scales.length ? Math.max(1, ...scales) : 1, scales.length ? Math.min(...scales) : 1, profile);
        rows.push({ cue, beat, range, px: (Number(text.size) || baseSize) * (beat.fontScale || 1), target: targets.has(beat.id) });
      }
    }
    const ladder = createSizeLadder({
      change,
      baseSize,
      random: change > 0 ? SA.rng.rngFor(seed, 'size-ladder-reroll') : null,
      center: curve && resolved ? resolved.sizeCenter : undefined,
      spread: curve && resolved ? resolved.sizeSpread : undefined,
    });
    for (const row of rows) if (!row.target) ladder.record(ladder.levelOf(row.px, row.range), row.beat.end - row.beat.start);
    let prev = null;
    rows.forEach((row, i) => {
      if (!row.target) {
        prev = { px: row.px, level: ladder.levelOf(row.px, row.range) };
        return;
      }
      const next = rows[i + 1] && !rows[i + 1].target ? rows[i + 1] : null;
      const pick = ladder.choose({ duration: row.beat.end - row.beat.start, range: row.range, prev, avoid: next ? ladder.levelOf(next.px, next.range) : null });
      const bag = projectDoc.beatStyles[row.beat.id] || (projectDoc.beatStyles[row.beat.id] = {});
      bag.text = { ...(bag.text || {}), size: Math.round(pick.px / (row.beat.fontScale || 1)) };
      prev = pick;
    });
  }

  // The filler presets a run may place: pattern / split / figures / combo /
  // particles (never text — a gap is not a caption), minus the genre's excludes
  // and minus the specs the seventh axis rates below its floor.
  const FRAME_LAYER_WEIRD = 0.8;
  function isFrameLayer(layer) {
    const params = (layer && layer.params) || {};
    return (layer.type === 'split' && params.layout === 'frame') || (layer.type === 'figures' && params.motif === 'frame');
  }

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
      // the fear axis drops the presets far below the target (a no-op at 0)
      if (ctx && ctx.axes && SA.moods.fearOf(ctx.axes) > 0 && !(SA.fxAxes.affinity(SA.fxAxes.ofFiller(preset.spec), ctx.axes) > 0)) return false;
      const layers = SA.fillerRender.layersOf(preset.spec);
      // the frame layer (corner-by-corner draw / frame split) is the heavy,
      // monotonous one: it only joins the pool on a weird run
      if (!(Number(ctx && ctx.rawW) >= FRAME_LAYER_WEIRD) && layers.some(isFrameLayer)) return false;
      return !layers.some((layer) => exclude.has(layer.type));
    });
  }

  function presetWeight(preset, s, axes) {
    const smart = SA.moods.smartness.weight(SA.moods.smartness.rateSpec(preset.spec), s);
    if (!(smart > 0)) return 0;
    if (!axes) return smart;
    return smart * SA.fxAxes.affinity(SA.fxAxes.ofFiller(preset.spec), axes);
  }

  // One deterministic preset spec for a gap kind (same seed -> same preset),
  // smartness- and fear-weighted so the calm library leads.
  function fillerPresetSpec(ctx, kind, groupSet) {
    const pool = fillerPresetPool(ctx, groupSet);
    if (!pool.length) return null;
    const random = SA.rng.rngFor(ctx.seed, 'filler-preset', kind);
    const s = ctx && ctx.s != null ? ctx.s : SA.moods.smartOf(ctx && ctx.axes);
    let preset = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
    if (s > 0 || (ctx && ctx.axes && SA.moods.fearOf(ctx.axes) > 0)) {
      const weights = pool.map((entry) => presetWeight(entry, s, ctx && ctx.axes));
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

  // Every gap carries a figure animation. A drawn preset may be a plain
  // pattern / split / particles field: it holds the frame but says nothing, so
  // the figures motif rides beside it in the same combo (the intro / outro
  // already pair it with the credits element). A preset that draws figures
  // itself keeps its own, so the gap never shows the same motif twice.
  function carriesFigures(spec) {
    if (!spec || typeof spec !== 'object') return false;
    if (spec.type === 'figures') return true;
    const list = spec.params && Array.isArray(spec.params.list) ? spec.params.list : null;
    return !!(list && list.some((part) => carriesFigures(part)));
  }

  // `base` with a figures layer beside it. `figuresSpec` may be null (the pool
  // had nothing to offer), which leaves the spec exactly as drawn.
  function withFigureLayer(base, figuresSpec) {
    const spec = base || { type: 'figures', params: {} };
    if (!figuresSpec || carriesFigures(spec)) return spec;
    const combo = { type: 'combo', params: { list: [spec, figuresSpec] } };
    // the pair keeps the drawn preset's identity (the preset id marks a drawn gap)
    if (spec.presetId) combo.presetId = spec.presetId;
    return combo;
  }

  // The filler kinds a run writes into the project settings. Item 8: gaps show
  // the built-in preset library (figures and the other moving primitives)
  // instead of the fixed shapes / spectrum / particles trio. The backdrop
  // channel scales the counts and speeds.
  function fillerSettings(projectDoc, ctx) {
    const w = ctx.wb;
    // The run always fills: a gap is dead air, and "automatic" has to mean it.
    // Nothing in the UI ever writes `enabled: false` (the escape hatch is the
    // filler track's own hide switch, which `engine.activeClips` reads), so a
    // stored false can only be the opt-in default that every project saved
    // between that commit and this one inherited - it must not keep the run
    // from drawing. `regenerate fillers` writes the same flag.
    const enabled = true;
    // the drawn gaps that need a figure animation of their own
    const figuresOnly = new Set(['figures']);
    const interlude = withFigureLayer(fillerPresetSpec(ctx, 'interlude'), fillerPresetSpec(ctx, 'interlude-figures', figuresOnly));
    const longGap = withFigureLayer(fillerPresetSpec(ctx, 'longGap'), fillerPresetSpec(ctx, 'longGap-figures', figuresOnly));
    const introFigures = fillerPresetSpec(ctx, 'intro-figures', figuresOnly);
    const outroFigures = fillerPresetSpec(ctx, 'outro-figures', figuresOnly);
    const kinds = {
      intro: { type: 'combo', params: { list: [{ type: 'credits', params: {} }, introFigures || { type: 'figures', params: {} }] } },
      interlude,
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
      enabled,
      minGap: 0.8,
      margin: 0.15,
      byKind: kinds,
      longGap: { threshold: 5, spec: longGap },
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
    // the flat types are the floor, not a roll: the auto direction always
    // lands on the noise gradient unless a drawn look brings its own backdrop
    const FLAT_BG = new Set(['plain', 'solid', 'gradient']);
    const spec = lookClip || (result && result.spec && !FLAT_BG.has(result.spec.type) ? result.spec : { type: 'gradient', params: { scale: 1.2, speed: 0.1 } });
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

  // The neighbouring-clip context the auto direction hands the next backdrop
  // spec: the previous clip's plane layout / motion and its clip-level mode /
  // transition. A stored or hand-made clip without a split / animate yields
  // nulls, so nothing is banned.
  function avoidFromClip(clip) {
    const spec = clip && clip.spec;
    if (!spec || typeof spec !== 'object') return null;
    const list = spec.params && Array.isArray(spec.params.list) ? spec.params.list : [];
    const plane = list.find((part) => part && part.type === 'split');
    const animate = (spec.params && spec.params.animate) || null;
    const accent = list.find((part) => part && part.type !== 'split');
    const avoid = {
      layout: plane && plane.params ? plane.params.layout : null,
      motion: plane && plane.params ? plane.params.motion : null,
      mode: animate ? animate.mode : null,
      transition: animate ? animate.transition : null,
      accent: accent ? accent.type : null,
    };
    if (!avoid.layout && !avoid.motion && !avoid.mode && !avoid.transition && !avoid.accent) return null;
    return avoid;
  }

  // The same context for a single-clip re-roll: the previous clip on the track
  // first, then the next one for the fields the previous lacks.
  function avoidForClip(projectDoc, clip) {
    if (!clip) return null;
    const siblings = ((projectDoc && projectDoc.clips) || [])
      .filter((entry) => entry && entry.trackId === clip.trackId && entry.id !== clip.id)
      .sort((a, b) => (Number(a.start) || 0) - (Number(b.start) || 0));
    const start = Number(clip.start) || 0;
    const before = [...siblings].reverse().find((entry) => (Number(entry.start) || 0) <= start);
    const after = siblings.find((entry) => (Number(entry.start) || 0) >= start);
    const a = avoidFromClip(before);
    const b = avoidFromClip(after);
    if (!a) return b;
    if (!b) return a;
    return {
      layout: a.layout || b.layout,
      motion: a.motion || b.motion,
      mode: a.mode || b.mode,
      transition: a.transition || b.transition,
      accent: a.accent || b.accent,
    };
  }

  // One backdrop (mid) clip per cue. Its `coverage` (how much of the frame the
  // painted planes take) is the backdrop channel of the weird axis; hand-made
  // clips on the track survive. With coverage >= 0.5 the clip spans to the next
  // cue (the first from 0, the last to the end of the song) so the backdrop
  // never blinks out in a filler gap.
  function backdropClipFor(projectDoc, cue, index, ctx, avoid) {
    const { seed, genre, wb: w, themeStyle } = ctx;
    const axes = axesFor(ctx, cue.id);
    const rawW = rawWFor(ctx, cue.id);
    const cueStyle = (projectDoc.cueStyles && projectDoc.cueStyles[cue.id]) || null;
    let palette = (cueStyle && cueStyle.palette) || (themeStyle && themeStyle.palette) || null;
    // the plane separation anchors on the cue's own (unjittered) text colours
    const sourceColors = (palette && palette.colors) || [];
    // The mid layer changes colour every four cues, so a long song never sits on
    // one palette (w=0 keeps the classic look alone). A section-aware run follows
    // the sections instead: the block number is the stream, so the planes move
    // where the song moves. The profile path keeps the jitter tight so the planes
    // stay on the drawn palette.
    if (w > 0 && palette && Array.isArray(palette.colors) && palette.colors.length) {
      const section = sectionOf(ctx, cue.id);
      const group = section ? section.index : Math.floor(index / 4);
      const random = SA.rng.rngFor(seed, 'mid-section', group);
      palette = SA.moods.jitterPalette(random, palette, axes, ctx.curve ? 1 + w : 1 + 3 * w);
    }
    const options = {
      axes,
      seed: seed + index * 977 + 3,
      genre,
      index: seed + index,
      palette,
      coverage: w,
      cuts: ctx.rhythm && ctx.rhythm[cue.id] ? ctx.rhythm[cue.id] : null,
    };
    // the profile hands the plane weights and the cue's own text colours down,
    // so the planes hold their distance from the lyrics
    if (ctx.curve && ctx.params) {
      options.planes = paramsFor(ctx, cue.id);
      options.rawW = rawW;
      options.textColors = textColorsOf(sourceColors);
    }
    // the neighbouring clip's layout / motion / mode / transition never repeat
    if (w > 0 && avoid) options.avoid = avoid;
    const result = SA.moods.rerollClipSpec('backdrop', options);
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
    let avoid = null;
    cues.forEach((cue, index) => {
      // run draws the specs before the readability pass (so the plane colours
      // are known); a direct call re-draws them here. The clip id is assigned
      // at push time: the pre-drawn clips all share the project state before
      // any of them lands in the timeline.
      const stored = ctx.backdropSpecs && ctx.backdropSpecs.get(cue.id);
      const clip = stored || backdropClipFor(projectDoc, cue, index, ctx, avoid);
      if (!clip) return;
      const nextAvoid = avoidFromClip(clip);
      if (nextAvoid) avoid = nextAvoid;
      clip.id = SA.project.nextClipId(projectDoc, 'clip_mid');
      if (ctx.wb >= 0.5) {
        clip.start = index === 0 ? 0 : Number(cue.start) || 0;
        const next = cues[index + 1];
        clip.end = next ? Number(next.start) || clip.end : total;
        if (clip.end <= clip.start + 0.05) clip.end = Math.max(Number(cue.end) || 0, clip.start + 0.05);
      }
      projectDoc.clips.push(clip);
    });
  }

  // The pattern presets are fixed tables (one grey, 24 elements, size 1), so
  // every gap showed the same grid. Each gap now rolls its own cheap variation
  // from the gap key: the element count, size, speed and opacity, a colour (or
  // two) from the palette, a knock-out (`hole`) and sometimes a flipped mode
  // among the grid-like ones. Deterministic per seed + gap, and only drawn
  // pattern layers change - a pinned gap keeps its spec as the user left it.
  const GRID_LIKE = ['grid', 'checks', 'dots', 'polka', 'diamonds', 'hexes', 'triangles', 'randomFill'];
  const HOLE_CHOICES = ['none', 'none', 'center', 'band', 'sides', 'corners', 'diagonal', 'thin', 'scatter'];

  function varyPatterns(spec, random, palette) {
    if (!spec || typeof spec !== 'object') return spec;
    if (spec.type === 'combo' && Array.isArray(spec.params && spec.params.list)) {
      spec.params.list.forEach((part) => varyPatterns(part, random, palette));
      return spec;
    }
    if (spec.type !== 'pattern' || !spec.params) return spec;
    const p = spec.params;
    const pick = (list) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
    if (GRID_LIKE.includes(p.mode) && random() < 0.4) p.mode = pick(GRID_LIKE);
    const base = Number(p.count) || 24;
    p.count = Math.max(6, Math.min(96, Math.round(base * pick([0.35, 0.6, 1, 1.6, 2.4]))));
    p.size = Math.round((Number(p.size) || 1) * pick([0.6, 0.85, 1, 1.3, 1.8]) * 100) / 100;
    p.speed = Math.round((Number(p.speed) || 0.4) * pick([0.5, 1, 1.5, 2.2]) * 100) / 100;
    p.opacity = Math.round(Math.max(0.2, Math.min(0.9, (Number(p.opacity) || 0.6) * pick([0.6, 0.85, 1, 1.2]))) * 100) / 100;
    const colors = (palette || []).filter((hex) => typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex));
    if (colors.length) {
      p.color = pick(colors);
      if (random() < 0.4) {
        const other = colors.filter((hex) => hex.toLowerCase() !== String(p.color).toLowerCase());
        if (other.length) {
          p.accent = pick(other);
          p.accentEvery = 2 + Math.floor(random() * 6);
        }
      }
    }
    const hole = pick(HOLE_CHOICES);
    if (hole !== 'none') {
      p.hole = hole;
      p.holeSize = Math.round((0.25 + random() * 0.45) * 100) / 100;
    }
    return spec;
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
        const fearOn = SA.moods.fearOf(ctx.axes) > 0;
        const weights = list.map((preset) => presetWeight(preset, s, ctx.axes));
        const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
        let preset = list[Math.min(list.length - 1, Math.floor(random() * list.length))];
        if ((s > 0 || fearOn) && weightTotal > 0) {
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
      if (!gap.pinned) {
        const accents = accentsOf(((ctx.themeStyle && ctx.themeStyle.palette && ctx.themeStyle.palette.colors) || [])).accentHexes;
        varyPatterns(spec, SA.rng.rngFor(ctx.seed, 'filler-vary', gap.key), accents);
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
            shapeRange: SA.figures.shapeRangeOf(ctx.params) || undefined,
            cuts: ctx.rhythm ? Object.values(ctx.rhythm).flat() : beatCuts,
            tempoGrid: true,
            beatSeconds: 60 / (Number(ctx.bpm) > 0 ? Number(ctx.bpm) : 120),
          });
          return { ...(entry || {}), type: 'figures', params: { ...params, ...generated.params } };
        };
        if (asFigures(spec)) {
          spec = regenerate(spec, 0, gap.key);
        } else if (spec.type === 'combo' && Array.isArray(spec.params && spec.params.list)) {
          spec.params.list = spec.params.list.map((part) => (asFigures(part) ? regenerate(part, 1, `${gap.key}:combo`) : part));
          // a combo the draw left without a figure animation gets one of its
          // own, generated for this gap (the credits element is left as it is)
          if (!carriesFigures(spec)) {
            const list = spec.params.list;
            spec = { type: 'combo', params: { list: [...list, regenerate(null, 2, `${gap.key}:figures`)] } };
          }
        } else {
          // a plain pattern / split / particles field rides the filler alone:
          // the figure animation is what makes the gap part of the song
          spec = withFigureLayer(spec, regenerate(null, 2, `${gap.key}:figures`));
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
  // backdrop channel is on, so the w=0 output stays exactly as before). The cue
  // section drives the density and the figure colours, so a chorus fills up.
  function figureClipFor(projectDoc, cue, index, ctx) {
    const track = trackIdFor(projectDoc, 'figure');
    if (!track || !SA.figures) return null;
    const { wb: w, seed } = ctx;
    const axes = axesFor(ctx, cue.id);
    const rawW = rawWFor(ctx, cue.id);
    const params = ctx.curve && ctx.params ? paramsFor(ctx, cue.id) : null;
    const energy = Number.isFinite(axes.energy) ? axes.energy : ctx.energy;
    const densityAxis = Number.isFinite(axes.density) ? axes.density : 0.5;
    const density = params ? Math.max(0.15, params.figureDensity) : Math.max(0.15, Math.min(1, 0.25 + 0.6 * densityAxis + 0.2 * w));
    if (density < 0.3 && w < 0.2 && index % 3 !== 0) return null;
    const beats = (projectDoc.beats && projectDoc.beats[cue.id]) || [];
    const cueStyle = (projectDoc.cueStyles && projectDoc.cueStyles[cue.id]) || {};
    let palette = (cueStyle.palette && cueStyle.palette.colors) || (ctx.themeStyle && ctx.themeStyle.palette && ctx.themeStyle.palette.colors) || [];
    // the profile derives the figure colours from the backdrop planes: 1.5+
    // from the planes and the backdrop floor from the text
    if (params) {
      const planes = ctx.backdropPlanes && ctx.backdropPlanes[cue.id];
      const derived = figureColors(planes, textColorsOf(palette), rawW);
      if (derived) palette = [...palette.slice(0, 3), derived[0], derived[1]].filter(Boolean);
    }
    const roll = SA.rng.rngFor(seed + index * 313, cue.id, 'figure')();
    const textWeight = w >= 0.6 ? 0.3 : 0.4;
    const sync = roll < textWeight ? 'text' : roll < textWeight + 0.4 ? 'beat' : 'free';
    // figureBoldChance: the profile may open with one of the bold motifs,
    // never the same one as the previous cue. The compose path also draws the
    // motif with the bold stroke (the classic output stays as drawn).
    let boldMotif = null;
    let boldHit = false;
    if (params) {
      const br = SA.rng.rngFor(seed + index * 313, cue.id, 'figure-bold');
      boldHit = SA.genParams.roll(br, params.figureBoldChance);
      if (boldHit) {
        const pool = SA.figures.BOLD_MOTIFS.filter((name) => name !== ctx.figurePrevMotif);
        if (pool.length) boldMotif = pool[Math.min(pool.length - 1, Math.floor(br() * pool.length))];
      }
    }
    const boldStroke = ctx.compose && boldHit;
    // the theme's figure count range: every clip draws its own element count
    const shapeRange = SA.figures.shapeRangeOf(paramsFor(ctx, cue.id)) || undefined;
    // the energy sets how far this figure stands from the previous cue's in
    // direction space (0 keeps it, 1 takes the farthest candidate)
    const prevSpec = ctx.figurePrevSpec || null;
    let spec = SA.figures.generate({
      span: { start: cue.start, end: cue.end },
      beats: beats.map((beat) => ({ start: beat.start, end: beat.end })),
      axes,
      seed: seed + index * 53,
      id: cue.id,
      palette,
      sync,
      density,
      previous: prevSpec,
      energy: Number.isFinite(energy) ? energy : undefined,
      motif: boldMotif || undefined,
      stroke: boldStroke ? 'bold' : undefined,
      shapeRange,
      cuts: ctx.rhythm && ctx.rhythm[cue.id] ? ctx.rhythm[cue.id] : null,
    });
    // the same motif never plays on two cues in a row (the procedural motif's
    // high draw chance would otherwise carry most of a song): redraw with the
    // next seeds until another motif comes up
    for (let attempt = 0; attempt < 6 && !prevSpec && spec && spec.params && spec.params.motif === ctx.figurePrevMotif && !boldMotif; attempt += 1) {
      spec = SA.figures.generate({
        span: { start: cue.start, end: cue.end },
        beats: beats.map((beat) => ({ start: beat.start, end: beat.end })),
        axes,
        seed: seed + index * 53 + 211 + attempt,
        id: cue.id,
        palette,
        sync,
        density,
        stroke: boldStroke ? 'bold' : undefined,
        shapeRange,
        cuts: ctx.rhythm && ctx.rhythm[cue.id] ? ctx.rhythm[cue.id] : null,
      });
    }
    // the figure must stay clear of the lyrics: the auto direction measures the
    // geometric overlap (a dimmed shape still sits over the text), swaps the
    // motif for one that lives around the text box when needed, and draws no
    // figure at all when nothing stays clear
    if (SA.legibility && SA.moods.legibilityActive(axes)) {
      const figureCtx = {
        frame: { width: ctx.frameW, height: ctx.frameH },
        palette,
        textColors: textColorsOf(palette),
        duration: Math.max(0.5, (Number(cue.end) || 0) - (Number(cue.start) || 0)),
        // a composed cue hands the figure layer the union of its beats' text
        // boxes, so the figure stays clear of every lyric line in the cue
        textBox: ctx.composeZones ? ctx.composeZones[cue.id] : undefined,
      };
      const overlapOf = (candidate) => SA.legibility.figureOverlap(candidate, { ...figureCtx, geometry: true });
      if (overlapOf(spec) > AUTO_FIGURE_CLEAR) {
        const candidateFor = (motif, attempt) => SA.figures.generate({
          span: { start: cue.start, end: cue.end },
          beats: beats.map((beat) => ({ start: beat.start, end: beat.end })),
          axes,
          seed: seed + index * 53 + 1 + attempt,
          id: cue.id,
          palette,
          sync,
          density,
          motif,
          stroke: boldStroke ? 'bold' : undefined,
          shapeRange,
          cuts: ctx.rhythm && ctx.rhythm[cue.id] ? ctx.rhythm[cue.id] : null,
        });
        let best = null;
        let bestOverlap = overlapOf(spec);
        const consider = (candidate) => {
          const overlap = overlapOf(candidate);
          if (overlap < bestOverlap) {
            bestOverlap = overlap;
            best = candidate;
          }
          return overlap;
        };
        // 1) a procedural figure that only just missed the clearance keeps its
        // family: another genome is grown before the fixed motifs take over, so
        // the figure track does not fall back to the same library every cue
        // (not when the previous cue already played it)
        for (let attempt = 0; attempt < 3 && ctx.figurePrevMotif !== 'proc'; attempt += 1) {
          if (consider(candidateFor('proc', attempt)) <= AUTO_FIGURE_CLEAR) break;
        }
        // 2) motifs that frame the text box first, then the bold cuts, then the
        // calmer centred ones
        if (!(best && bestOverlap <= AUTO_FIGURE_CLEAR)) {
          const pool = [...(rawW >= FRAME_LAYER_WEIRD ? ['frame'] : []), 'underlineSweep', 'bracketsPop', ...SA.figures.BOLD_MOTIFS, 'orbit', 'ribbon', 'rings', 'ticker', 'bars'];
          const sr = SA.rng.rngFor(seed + index * 53, cue.id, 'figure-safe');
          const shuffled = pool
            .filter((name, position) => pool.indexOf(name) === position && name !== spec.params.motif)
            .map((name) => ({ name, k: sr() }))
            .sort((a, b) => a.k - b.k)
            .map((entry) => entry.name);
          for (let attempt = 0; attempt < shuffled.length; attempt += 1) {
            if (consider(candidateFor(shuffled[attempt], attempt)) <= AUTO_FIGURE_CLEAR) break;
          }
        }
        if (best && bestOverlap <= AUTO_FIGURE_CLEAR) spec = best;
        else return null; // never lay a figure over the lyrics
      }
    }
    ctx.figurePrevMotif = spec && spec.params ? spec.params.motif : null;
    ctx.figurePrevSpec = spec || null;
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
    // 0) the tracks the run writes into. A document saved before the figure /
    // filler rows existed has nowhere to put those clips, so the run adds the
    // missing ones first (the same guarantee `project.migrate` gives).
    if (SA.project && typeof SA.project.ensureManagedTracks === 'function') SA.project.ensureManagedTracks(projectDoc);
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
    // the profile survives the run: only the fixed keys are stored (missing =
    // automatic), so reopening the theme dialog shows the pins the user made
    if (ctx.pinned && Object.keys(ctx.pinned).length) projectDoc.styleMode.params = { ...ctx.pinned };
    else delete projectDoc.styleMode.params;
    if (ctx.typeWeights && Object.keys(ctx.typeWeights).length) projectDoc.styleMode.typeWeights = ctx.typeWeights;
    else delete projectDoc.styleMode.typeWeights;
    if (Array.isArray(ctx.usePalettes) && ctx.usePalettes.length) projectDoc.styleMode.usePalettes = ctx.usePalettes;
    else delete projectDoc.styleMode.usePalettes;
    // the composition mode is part of the saved run: beat / cue re-rolls read it
    if (ctx.compose) projectDoc.styleMode.compose = true;
    else delete projectDoc.styleMode.compose;
    // the section plan is part of the saved run too: a beat / cue re-roll reads
    // its block's profile out of it (the boosts are stored, so a re-roll never
    // has to re-measure the music).
    if (Array.isArray(ctx.sections) && ctx.sections.length) {
      projectDoc.styleMode.sections = {
        ...(ctx.sectionConfig || {}),
        list: ctx.sections.map((section) => ({
          index: section.index,
          cueIds: section.cueIds.slice(),
          start: section.start,
          end: section.end,
          energy: section.energy,
          chorus: section.chorus,
          boost: section.boost,
          salt: section.salt,
        })),
      };
    } else delete projectDoc.styleMode.sections;
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
    // 1.1) the theme's palette set: the user's own palettes stay, the auto ones
    // are rebuilt from the base palette for the count the weird axis asks for.
    // A project without a set and nothing to add stays untouched (weird 0).
    const roles = SA.paletteRoles;
    if (roles && typeof roles.paletteSetOf === 'function') {
      const rawSet = projectDoc.style.paletteSet;
      const setInfo = roles.paletteSetOf(projectDoc.style);
      const kept = setInfo.extra.filter((entry) => entry && !entry.auto); // the user's palettes stay
      const want = SA.weird.paletteCount(ctx.axes, setInfo.max) - 1;
      const baseColors = (projectDoc.style.palette && projectDoc.style.palette.colors) || [];
      let extra = kept;
      if (want > kept.length && baseColors.length && SA.moods && typeof SA.moods.paletteSetFor === 'function') {
        const genre = ctx.genre && SA.genres && SA.genres.get ? SA.genres.get(ctx.genre) : null;
        extra = kept.concat(SA.moods.paletteSetFor(SA.rng.rngFor(seed, 'palette-set'), ctx.axes, baseColors, kept, want + 1, genre && genre.palettes));
      }
      if (rawSet || extra.length) projectDoc.style.paletteSet = { ...(rawSet || {}), max: setInfo.max, change: setInfo.change, invert: setInfo.invert, extra };
    }
    // Song-level repeat handling:
    // When weird is >= 0.6, song repeat probability is >= 1 (always appears).
    // Below 0.6, probability decreases linearly towards 0 (weird / 0.6).
    const rawW = Number(ctx.rawW) || 0;
    const songRepeatChance = ctx.pinned && ctx.pinned.repeatChance != null
      ? Math.min(1, Math.max(0, Number(ctx.params.repeatChance)))
      : (SA.weird && typeof SA.weird.repeatChance === 'function' ? SA.weird.repeatChance(ctx.axes) : Math.min(1, rawW / 0.6));
    const songRepeatRng = SA.rng.rngFor(seed, 'song-repeat');
    ctx.songHasRepeat = songRepeatChance > 0 && songRepeatRng() < songRepeatChance;
    ctx.guaranteedRepeatCueId = null;
    if (ctx.songHasRepeat && projectDoc.script.cues && projectDoc.script.cues.length > 0) {
      const chorusCues = projectDoc.script.cues.filter((cue) => {
        const s = (ctx.sections || []).find((sec) => sec.cueIds && sec.cueIds.includes(cue.id));
        return s && (s.chorus || (Number(s.energy) || 0) > 0.6);
      });
      const pool = chorusCues.length ? chorusCues : projectDoc.script.cues;
      const picked = pool[Math.floor(songRepeatRng() * pool.length)];
      ctx.guaranteedRepeatCueId = picked ? picked.id : null;
    }
    // 2) per-cue motion inside the same theme ...
    ctx.cuePaletteColors = null;
    projectDoc.script.cues.forEach((cue, cueIndex) => {
      directCue(projectDoc, cue, cueIndex, ctx);
    });
    // 2.1) the backdrop specs are drawn here while the clips are still
    // appended at step 3 in the classic order: the final readability pass
    // needs the plane colours and the decoration pass the plane count
    ctx.backdropSpecs = new Map();
    ctx.backdropPlanes = {};
    if (trackIdFor(projectDoc, 'backdrop') && (ctx.wb > 0 || ctx.axes.density > 0.45)) {
      let avoid = null;
      projectDoc.script.cues.forEach((cue, index) => {
        const clip = backdropClipFor(projectDoc, cue, index, ctx, avoid);
        if (!clip) return;
        const nextAvoid = avoidFromClip(clip);
        if (nextAvoid) avoid = nextAvoid;
        ctx.backdropSpecs.set(cue.id, clip);
        const list = clip.spec && clip.spec.params && Array.isArray(clip.spec.params.list) ? clip.spec.params.list : null;
        const plane = list && list.find((part) => part && part.type === 'split');
        if (plane && Array.isArray(plane.params.colors)) ctx.backdropPlanes[cue.id] = plane.params.colors.slice();
      });
    }
    // the size ladder walks every beat of the song in time order
    const change = ctx.params.sizeChange;
    ctx.lang = (projectDoc.meta && projectDoc.meta.lang) || null;
    ctx.sizeLadder = createSizeLadder({
      change,
      baseSize: ctx.baseSize,
      random: change > 0 ? SA.rng.rngFor(seed, 'size-ladder') : null,
      // the weighted curve only engages once the profile is on (raw weird > 0
      // or a pinned parameter); weird 0 keeps the classic uniform ladder
      center: ctx.curve && ctx.params ? ctx.params.sizeCenter : undefined,
      spread: ctx.curve && ctx.params ? ctx.params.sizeSpread : undefined,
    });
    ctx.sizePrev = null;
    ctx.shapeLayerBeatId = null;
    if (ctx.compose) {
      const allBeats = [];
      for (const cue of projectDoc.script.cues || []) {
        for (const beat of (projectDoc.beats && projectDoc.beats[cue.id]) || []) {
          allBeats.push({ cue, beat });
        }
      }
      if (allBeats.length > 0) {
        const graphicChance = ctx.curve && ctx.params && ctx.params.graphicChance != null
          ? Math.min(1, Math.max(0, Number(ctx.params.graphicChance)))
          : (ctx.curve ? Math.min(1, Math.max(0, Number(ctx.rawW) || 0)) : 0);
        const songRng = SA.rng.rngFor(seed, 'song-shape-layer');
        if (graphicChance > 0 && songRng() < graphicChance) {
          const chorusBeats = allBeats.filter(({ cue }) => {
            const s = (ctx.sections || []).find((sec) => sec.cueIds && sec.cueIds.includes(cue.id));
            return s && (s.chorus || (Number(s.energy) || 0) > 0.6);
          });
          const pool = chorusBeats.length ? chorusBeats : allBeats;
          const picked = pool[Math.floor(songRng() * pool.length)];
          ctx.shapeLayerBeatId = picked ? picked.beat.id : null;
        }
      }
    }
    projectDoc.script.cues.forEach((cue, cueIndex) => {
      const beats = (projectDoc.beats && projectDoc.beats[cue.id]) || [];
      beats.forEach((beat, beatIndex) => {
        directBeat(projectDoc, cue, beat, beatIndex, cueIndex, ctx);
      });
    });
    // Repeat occurrence guarantee:
    // When songHasRepeat is true, ensure repeat appears at least once across the song.
    // When songHasRepeat is false, ensure no repeat is active across the song.
    if (ctx.songHasRepeat && projectDoc.script.cues && projectDoc.script.cues.length > 0) {
      let hasSongRepeat = false;
      for (const cue of projectDoc.script.cues) {
        const cStyle = projectDoc.cueStyles && projectDoc.cueStyles[cue.id];
        if (cStyle && cStyle.repeat && cStyle.repeat.type && cStyle.repeat.type !== 'none' && cStyle.repeat.enabled !== false) {
          const beats = (projectDoc.beats && projectDoc.beats[cue.id]) || [];
          const allBeatsDisabled = beats.length > 0 && beats.every((b) => {
            const bs = projectDoc.beatStyles && projectDoc.beatStyles[b.id];
            return bs && bs.repeat && (bs.repeat.type === 'none' || bs.repeat.enabled === false);
          });
          if (!allBeatsDisabled) {
            hasSongRepeat = true;
            break;
          }
        }
        for (const b of (projectDoc.beats && projectDoc.beats[cue.id]) || []) {
          const bs = projectDoc.beatStyles && projectDoc.beatStyles[b.id];
          if (bs && bs.repeat && bs.repeat.type && bs.repeat.type !== 'none' && bs.repeat.enabled !== false) {
            hasSongRepeat = true;
            break;
          }
        }
        if (hasSongRepeat) break;
      }

      if (!hasSongRepeat) {
        const pickedCue = (ctx.guaranteedRepeatCueId && projectDoc.script.cues.find((c) => c.id === ctx.guaranteedRepeatCueId))
          || projectDoc.script.cues[0];
        if (pickedCue) {
          const cueContext = SA.moods && typeof SA.moods.contextForCue === 'function' ? SA.moods.contextForCue(projectDoc, pickedCue) : {};
          const own = projectDoc.cueStyles[pickedCue.id] || (projectDoc.cueStyles[pickedCue.id] = {});
          const merged = { ...(ctx.themeStyle || {}), ...own };
          let rep = SA.random && typeof SA.random.repeatPatch === 'function' ? SA.random.repeatPatch(songRepeatRng, { ...cueContext, weird: rawW }) : null;
          if (!rep || (SA.random && typeof SA.random.repeatConflicts === 'function' && SA.random.repeatConflicts({ ...merged, repeat: rep }))) {
            const safeType = 'stackV';
            rep = SA.fx && typeof SA.fx.withDefaults === 'function' ? SA.fx.withDefaults({ type: safeType }, 'repeat') : { type: safeType, params: { copies: 2 }, enabled: true };
          }
          own.repeat = rep;
          if (!ctx.cueRepeat) ctx.cueRepeat = {};
          ctx.cueRepeat[pickedCue.id] = rep;
          for (const b of (projectDoc.beats && projectDoc.beats[pickedCue.id]) || []) {
            const bs = projectDoc.beatStyles && projectDoc.beatStyles[b.id];
            if (bs && bs.repeat && (bs.repeat.type === 'none' || bs.repeat.enabled === false)) {
              delete bs.repeat;
            }
          }
        }
      }
    } else if (projectDoc.script.cues) {
      for (const cue of projectDoc.script.cues) {
        if (projectDoc.cueStyles && projectDoc.cueStyles[cue.id] && projectDoc.cueStyles[cue.id].repeat) {
          delete projectDoc.cueStyles[cue.id].repeat;
        }
        for (const b of (projectDoc.beats && projectDoc.beats[cue.id]) || []) {
          const bs = projectDoc.beatStyles && projectDoc.beatStyles[b.id];
          if (bs && bs.repeat) {
            delete bs.repeat;
          }
        }
      }
    }
    // 2.4) beat colour: each beat draws from the theme's palette set at the
    // set's change chance and/or inverts its roles at the set's invert chance.
    // A beat flagged `colorLegacy` keeps the classic path instead: the cue
    // palette lottery (step 2) plus a scheme ladder inside the cue's palette.
    if (roles) {
      const set = roles.paletteSetOf(projectDoc.style);
      const count = Math.min(1 + set.extra.length, SA.weird.paletteCount(ctx.axes, set.max));
      const paletteLadder = createPaletteLadder({
        count,
        change: set.change,
        random: SA.rng.rngFor(seed, 'palette-ladder'),
      });
      // weird 0 never inverts (and the ladder consumes no random either)
      const invertRandom = ctx.rawW > 0 && set.invert > 0 ? SA.rng.rngFor(seed, 'palette-invert') : null;
      const colorChange = ctx.params.colorChange;
      const backgroundTrack = (projectDoc.tracks || []).find((track) => track && track.kind === 'background');
      const schemeReady = colorChange > 0 && !!(backgroundTrack && !backgroundTrack.hidden) && typeof roles.schemes === 'function';
      // the classic ladder, prepared only when at least one legacy beat may use it
      let ladder = null;
      let candidatesByColors = null;
      let schemeInvert = null;
      if (schemeReady) {
        // the invert owns its own stream; it only joins the compose profile (the
        // classic path keeps drawing TMBD from the normal pool)
        schemeInvert = ctx.compose && ctx.curve ? ctx.params.paletteInvertChance : null;
        const ladderOptions = { change: colorChange, random: SA.rng.rngFor(seed, 'color-ladder') };
        if (schemeInvert != null) {
          ladderOptions.invert = schemeInvert;
          ladderOptions.invertRandom = SA.rng.rngFor(seed, 'color-invert');
        }
        ladder = createColorLadder(ladderOptions);
        candidatesByColors = new Map();
      }
      let prevIndex = null;
      let prevScheme = null;
      for (const cue of projectDoc.script.cues) {
        let cueColors = null;
        let candidates = null;
        for (const beat of (projectDoc.beats && projectDoc.beats[cue.id]) || []) {
          const bag = projectDoc.beatStyles[beat.id] || (projectDoc.beatStyles[beat.id] = {});
          if (bag.colorLegacy) {
            delete bag.paletteIndex;
            delete bag.paletteInvert;
            if (schemeReady) {
              if (!cueColors) {
                const cueStyle = SA.project.resolveStyle(projectDoc, `cue:${cue.id}`);
                cueColors = (cueStyle.palette && cueStyle.palette.colors) || [];
                // the candidates follow the cue's section (a chorus opens a
                // wider scheme range), so the cache key carries the block too
                const section = sectionOf(ctx, cue.id);
                const cueParams = paramsFor(ctx, cue.id);
                const cacheKey = `${cueColors.join('|')}#${section ? section.index : ''}`;
                candidates = candidatesByColors.get(cacheKey);
                if (!candidates) {
                  candidates = cueColors.length ? roles.schemes(cueColors, rawWFor(ctx, cue.id), cueParams ? cueParams.schemeRange : undefined) : [];
                  // the invert toggle owns TMBD when it is on
                  if (schemeInvert != null) {
                    const invertId = roles.SCHEME_INVERT || 'TMBD';
                    candidates = candidates.filter((entry) => entry.id !== invertId);
                  }
                  candidatesByColors.set(cacheKey, candidates);
                }
              }
              const duration = Math.max(0.05, (Number(beat.end) || 0) - (Number(beat.start) || 0));
              const pick = ladder.choose({ start: Number(beat.start) || 0, duration, candidates, prev: prevScheme });
              if (pick) bag.colorScheme = pick;
              else delete bag.colorScheme;
              if (pick) {
                // the readable contrast floor still applies to the swapped result
                const resolved = SA.project.resolveStyle(projectDoc, `cue:${cue.id}/beat:${beat.id}`);
                const report = SA.legibility && typeof SA.legibility.check === 'function'
                  ? SA.legibility.check(resolved, { palette: cueColors, motion: false })
                  : { ok: true, reasons: [] };
                if ((report.reasons || []).some((reason) => String(reason).startsWith('contrast:'))) delete bag.colorScheme;
              }
              if (!prevScheme || pick !== prevScheme.id) prevScheme = { id: pick, start: Number(beat.start) || 0 };
            } else {
              delete bag.colorScheme;
            }
            continue;
          }
          delete bag.colorScheme;
          let index = paletteLadder.choose(prevIndex);
          let invert = invertRandom ? invertRandom() < set.invert : false; // drawn every beat: the stream stays aligned
          const write = () => {
            if (index) bag.paletteIndex = index;
            else delete bag.paletteIndex;
            if (invert) bag.paletteInvert = true;
            else delete bag.paletteInvert;
          };
          const fails = () => {
            const resolved = SA.project.resolveStyle(projectDoc, `cue:${cue.id}/beat:${beat.id}`);
            const palette = (resolved.palette && resolved.palette.colors) || [];
            const report = SA.legibility && typeof SA.legibility.check === 'function'
              ? SA.legibility.check(resolved, { palette, motion: false })
              : { reasons: [] };
            return (report.reasons || []).some((reason) => String(reason).startsWith('contrast:'));
          };
          write();
          if ((index || invert) && fails()) {
            if (invert) {
              invert = false;
              write();
            }
            if ((index || invert) && fails() && index !== (prevIndex || 0)) {
              index = prevIndex || 0;
              write();
            }
            if (index && fails()) {
              index = 0;
              write();
            }
          }
          prevIndex = index;
          if (!Object.keys(bag).length) delete projectDoc.beatStyles[beat.id];
        }
      }
    }
    // 2.5) legibility: the drawn + generated arrangement must read while the
    // weird / fear axes are on. Only the groups the repair touches are written
    // into the cue, so the theme stays shared.
    if (SA.moods.legibilityActive && SA.moods.legibilityActive(ctx.axes)) {
      const writeRepair = (cueId, effective, context) => {
        const repaired = SA.moods.repairLegibility(effective, ctx.axes, context, effective.palette);
        if (!repaired || repaired === effective) return;
        const container = cueId ? projectDoc.cueStyles[cueId] || (projectDoc.cueStyles[cueId] = {}) : projectDoc.style;
        for (const key of Object.keys(repaired)) {
          if (JSON.stringify(repaired[key]) !== JSON.stringify(effective[key])) container[key] = JSON.parse(JSON.stringify(repaired[key]));
        }
      };
      for (const cue of projectDoc.script.cues) {
        writeRepair(cue.id, SA.project.resolveStyle(projectDoc, `cue:${cue.id}`), {
          ...SA.moods.contextForCue(projectDoc, cue),
          duration: Math.max(0.5, (Number(cue.end) || 0) - (Number(cue.start) || 0)),
        });
      }
      writeRepair(null, SA.project.resolveStyle(projectDoc, 'project'), { ...SA.moods.contextFor(projectDoc), duration: 3 });
    }
    // 2.55) surrounding decorations: one draw per cue from the profile's deco
    // weights, written into the cue's edge stack (the theme's own edge stays
    // when the draw is `none`). The final sweep below still sees the result.
    if (ctx.curve && SA.genParams) {
      projectDoc.script.cues.forEach((cue, index) => {
        const cueStyle = SA.project.resolveStyle(projectDoc, `cue:${cue.id}`);
        const colors = (cueStyle.palette && cueStyle.palette.colors) || [];
        const planes = ctx.backdropPlanes && ctx.backdropPlanes[cue.id];
        const random = SA.rng.rngFor(seed + index * 131, cue.id, 'decoration');
        const stack = decorationFor(random, ctx, colors, planes ? planes.length : 0, cue.id);
        if (stack) {
          const container = projectDoc.cueStyles[cue.id] || (projectDoc.cueStyles[cue.id] = {});
          container.edge = stack;
        } else if (ctx.hasPinnedDeco) {
          const container = projectDoc.cueStyles[cue.id] || (projectDoc.cueStyles[cue.id] = {});
          container.edge = [];
        }
        // the compose profile also lets individual beats draw their own
        // decoration, so one cue can change gear mid-phrase. A beat that moved
        // to another palette of the set (or inverted its roles) draws from the
        // resolved colours, so its own edge literals follow the switch too.
        if (ctx.compose) {
          const beats = (projectDoc.beats && projectDoc.beats[cue.id]) || [];
          beats.forEach((beat) => {
            const beatRandom = SA.rng.rngFor(seed + index * 131, beat.id, 'beat-deco');
            if (!SA.genParams.roll(beatRandom, paramsFor(ctx, cue.id).beatDecoChance)) return;
            const own = projectDoc.beatStyles[beat.id];
            let beatColors = colors;
            if (own && (own.paletteIndex || own.paletteInvert)) {
              const resolved = SA.project.resolveStyle(projectDoc, `cue:${cue.id}/beat:${beat.id}`);
              beatColors = (resolved.palette && resolved.palette.colors) || colors;
            }
            const beatStack = decorationFor(beatRandom, ctx, beatColors, planes ? planes.length : 0, cue.id);
            if (!beatStack) {
              if (ctx.hasPinnedDeco) {
                const bag = projectDoc.beatStyles[beat.id] || (projectDoc.beatStyles[beat.id] = {});
                bag.edge = [];
              }
              return;
            }
            const bag = projectDoc.beatStyles[beat.id] || (projectDoc.beatStyles[beat.id] = {});
            bag.edge = beatStack;
          });
        }
      });
    }
    // 2.6) the final readability sweep: the colour scheme, the foreground
    // patch and the plane colours must read together. Each failing beat is
    // repaired in three deterministic steps (scheme off -> the plain text
    // role -> a separation outline). The profile path only, so weird 0 keeps
    // its untouched output.
    if (ctx.curve && SA.legibility && typeof SA.legibility.check === 'function') {
      const backdropFloor = SA.weird && typeof SA.weird.backdropContrast === 'function' ? SA.weird.backdropContrast(ctx.rawW) : 3;
      const planeBad = (texts, planes) => {
        if (!Array.isArray(planes) || !planes.length || !texts.length) return false;
        return planes.some((plane) =>
          texts.some((text) => {
            try {
              return SA.color.contrastRatio(SA.color.parse(text), SA.color.parse(plane)) < backdropFloor - 1e-6;
            } catch {
              return false;
            }
          })
        );
      };
      for (const cue of projectDoc.script.cues || []) {
        const planes = ctx.backdropPlanes ? ctx.backdropPlanes[cue.id] : null;
        const cueStyle = SA.project.resolveStyle(projectDoc, `cue:${cue.id}`);
        const cueColors = (cueStyle.palette && cueStyle.palette.colors) || [];
        const roles = SA.paletteRoles;
        // the planes were separated from the cue's own body colour; a beat
        // colour scheme moves the text roles, so the scheme-free anchor is the
        // cue text while a scheme is in play
        const cueTexts = roles && typeof roles.get === 'function' ? [roles.get(cueColors, roles.SLOT.TEXT_FILL)].filter(Boolean) : [cueColors[2]].filter(Boolean);
        for (const beat of (projectDoc.beats && projectDoc.beats[cue.id]) || []) {
          const path = `cue:${cue.id}/beat:${beat.id}`;
          const bad = () => {
            const resolved = SA.project.resolveStyle(projectDoc, path);
            const report = SA.legibility.check(resolved, { palette: cueColors, motion: false });
            if (!report.ok) return true;
            const scheme = resolved.palette && resolved.palette.scheme;
            const texts = scheme ? cueTexts : typeof SA.legibility.textColors === 'function' ? SA.legibility.textColors(resolved, {}) : [];
            return planeBad(texts, planes);
          };
          if (!bad()) continue;
          const bag = projectDoc.beatStyles[beat.id] || (projectDoc.beatStyles[beat.id] = {});
          // (0) the general legibility repair (unreadable tags, motion, caps)
          // writes into the beat's own bag; the colour steps follow when it is
          // still failing
          const original = SA.project.resolveStyle(projectDoc, path);
          const repaired = SA.moods.repairLegibility(original, ctx.axes, {
            ...SA.moods.contextForCue(projectDoc, cue),
            duration: Math.max(0.5, (Number(cue.end) || 0) - (Number(cue.start) || 0)),
          }, original.palette);
          if (repaired && repaired !== original) {
            for (const key of Object.keys(repaired)) {
              if (JSON.stringify(repaired[key]) !== JSON.stringify(original[key])) bag[key] = JSON.parse(JSON.stringify(repaired[key]));
            }
            if (!bad()) continue;
          }
          // (0b) the size floor: extremely long lines cannot fit the frame at
          // the readable minimum; the beat still declares it and the renderer
          // wraps / shrinks the block to the frame
          const originalSize = Number(original.text && original.text.size) || 0;
          const minSize = Math.ceil(((SA.legibility && SA.legibility.MIN_SIZE_RATIO) || 0.045) * (ctx.frameH || 1080));
          if (originalSize > 0 && originalSize < minSize) {
            bag.text = { ...(bag.text || {}), size: minSize };
            if (!bad()) continue;
          }
          // (1) the beat colour scheme only goes when it is the cause: the
          // same beat without the scheme may still pass
          if (bag.colorScheme != null) {
            const scheme = bag.colorScheme;
            delete bag.colorScheme;
            if (!bad()) continue;
            if (bad()) bag.colorScheme = scheme;
          }
          // (2) the cue's foreground returns to the plain text role
          const cueBag = projectDoc.cueStyles[cue.id] || (projectDoc.cueStyles[cue.id] = {});
          const ref = (slot, legacy) => (SA.compositions && typeof SA.compositions.paletteRefIndex === 'function' ? SA.compositions.paletteRefIndex(cueColors, slot) : legacy);
          bag.color = { fill: { kind: 'palette', index: ref(4, 2) }, fill2: { kind: 'palette', index: ref(5, 3) } };
          delete cueBag.fill;
          if (!bad()) continue;
          // (3) a separation outline as the last resort, in the palette's edge
          // role (a live reference, so a later palette re-roll moves it too).
          // Honor Theme dialogue pinned settings: do not add outline if decoNone >= 1 or decoOutline === 0.
          if (ctx.hasPinnedDeco && (ctx.params.decoNone >= 1 || ctx.params.decoOutline === 0)) {
            continue;
          }
          const stack = Array.isArray(cueBag.edge) ? cueBag.edge.slice() : [];
          if (!stack.some((entry) => entry && entry.type === 'outline')) {
            const roleFallback = roles && typeof roles.get === 'function' ? roles.get(cueColors, roles.SLOT.TEXT_EDGE) || '#000000' : '#000000';
            const color = roleRef(cueColors, 'TEXT_EDGE', 4, roleFallback);
            stack.unshift({ type: 'outline', params: { width: 3.5, color }, enabled: true });
          }
          cueBag.edge = stack;
        }
      }
    }
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
    PULSE_TYPES,
    beatFitOf,
    densitySpacing,
    prepare,
    planSections,
    restoreSections,
    sectionOf,
    paramsFor,
    axesFor,
    rawWFor,
    wFor,
    opensSection,
    stagingSeed,
    directCue,
    directBeat,
    composeBeat,
    backgroundClip,
    backdropClipFor,
    backdropClips,
    avoidFromClip,
    avoidForClip,
    fillerSettings,
    fillerClips,
    carriesFigures,
    figureClipFor,
    figureClips,
    createSizeLadder,
    createColorLadder,
    createPaletteLadder,
    paletteDistance,
    cuePalette,
    pickUsePalette,
    accentsOf,
    foregroundFor,
    decorationFor,
    fitComposeSpans,
    sizeRangeFor,
    sizeProfile,
    resizeBeats,
    resolveGraphicParams,
    run,
  };
});
