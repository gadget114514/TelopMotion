window.SA = window.SA || {};

SA.lyricsScene = (() => {
  'use strict';

  const MAX_SCENES = 48;
  const cache = new Map();

  function hash(keyParts) {
    return SA.rng.hash32(...keyParts);
  }

  function letterPath(cueId, beatId, lineIdx, wordIdx, letterIdx) {
    return `cue:${cueId}/beat:${beatId}/line:${lineIdx}/word:${wordIdx}/letter:${letterIdx}`;
  }

  function sampleCount(area, size) {
    const byArea = Math.round(Math.max(64, Math.min(512, area / 24)));
    const rounded = Math.max(64, Math.round(byArea / 16) * 16);
    return Math.min(512, Math.max(64, rounded));
  }

  // The text attributes a scoped `text` entry sets per letter (size / weight /
  // colour) become synthetic composition spans, so the layout itself carries
  // them. Returns null when the style declares no `text` entry, which keeps the
  // plain layout byte-identical. `compose` is the style's own composition and
  // is null for every other style.
  function scopedTextEntries(style) {
    const list = Array.isArray(style && style.scoped) ? style.scoped : [];
    const out = [];
    if (!SA.fx || typeof SA.fx.withDefaults !== 'function') return out;
    for (const entry of list) {
      if (!entry || entry.group !== 'text' || entry.enabled === false || !entry.type) continue;
      // a letter-wise preset carries its parameters as defaults, so the entry is
      // resolved before its scale / weight / colour are read
      const resolved = SA.fx.withDefaults({ type: entry.type, params: entry.params, scope: entry.scope, enabled: true }, 'text');
      if (resolved) out.push(resolved);
    }
    return out;
  }

  // The attribute set of one code point, overlaid in entry order on top of the
  // composition's own spans. `masks` holds one mask per scoped entry, resolved
  // once by the caller. `null` means "the beat default" (no span needed).
  function attributesOf(compose, charIndex, entries, masks) {
    const attrs = {};
    let touched = false;
    const apply = (source, spanIndex) => {
      if (!source) return;
      if (spanIndex != null && attrs.spanIndex == null) attrs.spanIndex = spanIndex;
      const scale = Number(source.scale);
      if (Number.isFinite(scale) && scale > 0 && Math.abs(scale - 1) > 1e-9) {
        attrs.scale = (attrs.scale || 1) * scale;
        touched = true;
      }
      const weight = Number(source.weight);
      if (Number.isFinite(weight) && weight > 0) {
        attrs.weight = weight;
        touched = true;
      }
      const paletteIndex = Number(source.paletteIndex);
      if (Number.isFinite(paletteIndex) && paletteIndex >= 0) {
        attrs.paletteIndex = Math.floor(paletteIndex);
        touched = true;
      }
      const color = typeof source.color === 'string' && source.color ? source.color : null;
      if (color) {
        attrs.color = color;
        touched = true;
      }
    };
    if (compose && Array.isArray(compose.spans)) {
      // the composition's own span number rides along, so a `span` scope still
      // addresses the composition and not the re-encoded run
      compose.spans.forEach((span, index) => {
        if (span && charIndex >= span.from && charIndex < span.to) apply(span, index);
      });
    }
    for (let i = 0; i < entries.length; i += 1) {
      const mask = masks[i];
      if (mask && mask[charIndex]) apply(entries[i].params || {});
    }
    return touched ? attrs : null;
  }

  // Run-length encodes the per-code-point attributes into `{ from, to, ... }`
  // spans. A run that carries nothing the beat does not already have never
  // becomes a span, so a style with only colour set does not resize anything.
  function encodeTextSpans(style, compose, text) {
    const entries = scopedTextEntries(style);
    if (!entries.length) return null;
    // the same index space font.js counts in (code points, no line separators)
    const chars = SA.scope.codePointsOf(text);
    if (!chars.length) return null;
    const spans = [];
    // the composition's spans keep their own numbers; the synthetic runs are
    // numbered after them
    const base = compose && Array.isArray(compose.spans) ? compose.spans.length : 0;
    const masks = entries.map((entry) => SA.scope.maskForText(text, entry.scope || null, compose));
    let synthetic = 0;
    let cursor = 0;
    let current = null;
    const flush = () => {
      // `key` is only the run identity, never a span attribute
      if (current) {
        const { key, ...attrs } = current;
        spans.push({ ...attrs, to: cursor });
      }
      current = null;
    };
    for (let i = 0; i < chars.length; i += 1) {
      const attrs = attributesOf(compose, i, entries, masks);
      const key = attrs ? JSON.stringify(attrs) : '';
      if (!current || current.key !== key) {
        flush();
        // a run that carries no composition span gets its own number, past the
        // composition's, so a `span` scope addressing span #n of the
        // composition never picks up a synthetic run
        if (attrs) {
          current = { key, from: i, ...attrs, spanIndex: attrs.spanIndex == null ? base + synthetic : attrs.spanIndex };
          synthetic += 1;
        }
      }
      cursor = i + 1;
    }
    flush();
    return spans.length ? spans : null;
  }

  function resolveFillColor(project, style, beat) {
    const colorSet = style.color || {};
    const category = (beat.meta && beat.meta.category) || null;
    const categoryColors = SA.project.mergeDeep(SA.project.DEFAULT_CATEGORY_COLORS, project.categoryColors || {});
    let value = colorSet.fill;
    if (colorSet.useCategory && category) value = { kind: 'category', which: 'tint' };
    if (!value || !value.kind) {
      value = { kind: 'solid', value: typeof value === 'string' ? value : '#eef2ff', alpha: 1 };
    }
    // the palette references resolve against the scoped style palette first
    // (the same rule the GL fill pass uses), then the project palette list
    const resolved = SA.color.resolve(value, { palettes: project.palettes || [], localPalette: style.palette || null, categoryColors, category, t: 0 });
    if (resolved.kind === 'gradient') {
      const stop = resolved.stops && resolved.stops.length ? resolved.stops[0].rgba : { r: 1, g: 1, b: 1, a: 1 };
      return { r: stop.r, g: stop.g, b: stop.b, a: stop.a == null ? 1 : stop.a };
    }
    return { r: resolved.rgba.r, g: resolved.rgba.g, b: resolved.rgba.b, a: resolved.rgba.a == null ? 1 : resolved.rgba.a };
  }

  function buildLetterMesh(letter) {
    if (letter.mesh) return letter.mesh;
    const geometry = SA.geometry;
    let contours = [];
    let scale = 1;
    let bucketSize = letter.size;
    if (letter.src === 'font' && letter.glyph && letter.fontId != null) {
      const bucket = geometry.bucket(letter.size);
      bucketSize = Math.pow(2, bucket / 4);
      scale = letter.size / bucketSize;
      const cacheKey = geometry.cacheKey(letter.fontId, letter.glyph.index, letter.size);
      contours = geometry.cached(cacheKey, () => {
        const path = letter.glyph.getPath(0, 0, bucketSize);
        return geometry.glyphContours(path, geometry.DEFAULT_TOLERANCE / scale);
      });
    } else if (letter.raster) {
      contours = letter.raster.contours;
    }
    const groups = geometry.groupContours(contours);
    const fill = geometry.triangulate(groups);
    // a fine copy of the fill mesh for the text pass: non-linear deformation
    // (bend, bulge, ripple...) needs more than earcut's long slivers
    const fillFine = geometry.subdivide(fill, Math.max(2, letter.size * 0.08), 6000);
    const stroke = geometry.strokeRibbon(contours, Math.max(1, letter.size * 0.025));
    const pieces = geometry.pieces(fill);
    let meshBBox = null;
    for (const contour of contours) {
      const box = geometry.bounds(contour.points);
      if (!meshBBox) meshBBox = { ...box };
      else {
        meshBBox.x0 = Math.min(meshBBox.x0, box.x0);
        meshBBox.y0 = Math.min(meshBBox.y0, box.y0);
        meshBBox.x1 = Math.max(meshBBox.x1, box.x1);
        meshBBox.y1 = Math.max(meshBBox.y1, box.y1);
        meshBBox.width = meshBBox.x1 - meshBBox.x0;
        meshBBox.height = meshBBox.y1 - meshBBox.y0;
      }
    }
    letter.mesh = {
      contours,
      groups,
      fill,
      fillFine,
      stroke,
      pieces,
      needsStencil: fill.needsStencil,
      scale,
      bucketSize,
      bbox: meshBBox || { x0: 0, y0: 0, x1: 0, y1: 0, width: 0, height: 0 },
    };
    return letter.mesh;
  }

  function buildLetterSamples(letter) {
    if (!letter.samples) letter.samples = { interior: null, outline: null };
    return letter.samples;
  }

  function buildScene(project, beat, fonts, options) {
    if (!project || !beat) throw Object.assign(new Error('missing project or beat'), { code: 'scene-input' });
    const opts = options || {};
    const output = project.output || { width: 1920, height: 1080, aspect: '16:9' };
    // The scene is laid out in the pixels of the frame the renderer draws into.
    // Preview qualities below 100% render into a smaller frame, so the whole
    // scene is built at that scale: the motion evaluator, the GL passes and the
    // overlay then all share one coordinate space (see `renderScale`).
    const scale = Number.isFinite(opts.scale) && opts.scale > 0 ? opts.scale : 1;
    const cueId = beat.cueId;
    const beatId = beat.id;
    const beatPath = `cue:${cueId}/beat:${beatId}`;
    const style = SA.project.resolveStyle(project, beatPath);
    const textStyle = style.text || {};
    // A composition owns its own line breaking and per-word sizes: its
    // `compose` block only applies while it still describes the beat text,
    // so editing the text drops back to the plain layout.
    const compose = textStyle.compose && textStyle.compose.text === (beat.text || '') ? textStyle.compose : null;
    const direction = opts.direction || textStyle.direction || beat.direction || 'horizontal';
    const loaded = Array.isArray(fonts) ? fonts : fonts ? [fonts] : [];
    // the style's typeface (mapped through the project's font set) leads;
    // the rest only cover glyphs it lacks
    const fontList = SA.lyricsFont && typeof SA.lyricsFont.orderFonts === 'function' ? SA.lyricsFont.orderFonts(loaded, textStyle.fontId, textStyle.weight) : loaded;
    const fontIds = fontList.map((entry) => entry.id).join(',');
    const beatLines = compose ? null : Array.isArray(beat.lines) && beat.lines.length ? beat.lines : null;
    const fillBeat = !compose && beat.fit === 'fill' && !!beatLines;
    const layoutTextSource = compose ? beat.text || '' : beatLines ? beatLines.join('\n') : beat.text || '';
    // The scoped text attributes are addressed in the layout's own index space,
    // which for a fill beat is the joined flow lines and for a composition its
    // beat text. `encodeTextSpans` returns null without a scoped `text` entry,
    // so a plain style and a plain composition keep their exact span list.
    const mergedSpans = encodeTextSpans(style, compose, compose ? beat.text || '' : layoutTextSource);
    let composeLayout = null;
    if (compose || (mergedSpans && mergedSpans.length)) {
      // the composition keeps its own breaks; the synthetic spans from the
      // scoped `text` entries have none, so the layout wraps as it always did
      const spans = mergedSpans || (Array.isArray(compose.spans) ? compose.spans : []);
      const setsByWeight = new Map();
      composeLayout = {
        breaks: new Set(compose && Array.isArray(compose.breaks) ? compose.breaks : []),
        spans: spans.map((span, index) => {
          if (!span) return span;
          const weight = span.weight == null ? textStyle.weight : span.weight;
          let set = setsByWeight.get(weight);
          if (!set) {
            set = SA.lyricsFont && typeof SA.lyricsFont.orderFonts === 'function' ? SA.lyricsFont.orderFonts(loaded, textStyle.fontId, weight) : loaded;
            setsByWeight.set(weight, set);
          }
          // the layout copies every span (it adds the weight's font set), so the
          // letters cannot be matched back by identity; the index is what the
          // `span` scope asks for. For a composition it is the composition's own
          // index, so a scoped span keeps addressing the user's spans even when
          // the scoped text attributes added synthetic ones around them.
          return { ...span, spanIndex: span.spanIndex == null ? index : span.spanIndex, fontSet: span.fontSet || set };
        }),
      };
    }
    const key = hash([
      cueId,
      beatId,
      beat.text || '',
      beatLines ? JSON.stringify(beatLines) : '',
      beat.fit || '',
      beat.fontScale || 1,
      direction,
      fontIds,
      JSON.stringify(style),
      output.aspect,
      output.width,
      output.height,
      scale,
    ]);
    const cached = cache.get(key);
    if (cached) return cached;

    const size = (textStyle.size || 96) * (beat.fontScale || 1) * scale;
    const fillColor = resolveFillColor(project, style, beat);
    const frameW = output.width * scale;
    const frameH = output.height * scale;
    const pageInst = SA.fx && SA.fx.withDefaults ? SA.fx.withDefaults(style.page, 'page') : style.page;
    const usePage = pageInst && pageInst.type && pageInst.type !== 'none' && pageInst.enabled !== false && SA.pageScene;

    let layout = usePage
      ? SA.pageScene.build({
          compose: SA.pageLayout ? SA.pageLayout.compose : null,
          layoutText: SA.lyricsFont.layoutText,
          fonts: fontList,
          textStyle,
          source: layoutTextSource,
          composeLayout,
          size,
          lang: (project.meta && project.meta.lang) || 'en',
          frame: { w: frameW, h: frameH },
          style,
          rng: SA.rng && SA.rng.rngFor ? SA.rng.rngFor(0x5eed, cueId, beatId) : null,
          fillColor,
          project,
          beat,
        })
      : SA.lyricsFont.layoutText(layoutTextSource, textStyle, fontList, {
          size,
          lang: (project.meta && project.meta.lang) || 'en',
          direction,
          compose: composeLayout || undefined,
          // a fill beat carries the exact lines the flow picked, so it must not be
          // re-wrapped even when the enlarged / bleeding lines exceed maxWidth. A
          // composition may ask for a wider than frame ratio on purpose (bleed).
          maxWidth: fillBeat ? Infinity : textStyle.maxWidth > 0 ? textStyle.maxWidth * output.width * scale : undefined,
        });

    if (!usePage) {
      // Fit the laid-out block into the frame. The width stays inside maxWidth;
      // the height budget is 80% of the frame by default and opens with the weird
      // axis up to 120%, so a weird beat may deliberately fill the screen (the
      // frame guard keeps at least half of it visible). One re-layout only, and
      // with maxWidth Infinity so the chosen wrap survives.
      const weird = SA.weird.text(project.styleMode && project.styleMode.axes ? project.styleMode.axes.weird : 0);
      const maxHeightBase = textStyle.maxHeight > 0 ? Number(textStyle.maxHeight) : 0.8;
      const limitHRatio = maxHeightBase + (Math.max(maxHeightBase, 1.2) - maxHeightBase) * weird;
      const limitW = fillBeat ? Infinity : (textStyle.maxWidth > 0 ? textStyle.maxWidth : 0.94) * frameW;
      const limitH = limitHRatio * frameH;
      const bbox = layout.bbox;
      if (bbox && size > 1) {
        const boxW = Math.max(0, bbox.x2 - bbox.x1);
        const boxH = Math.max(0, bbox.y2 - bbox.y1);
        if (boxW > limitW + 0.5 || boxH > limitH + 0.5) {
          const k = Math.min(1, limitW / Math.max(1e-6, boxW), limitH / Math.max(1e-6, boxH));
          if (k < 0.999) {
            layout = SA.lyricsFont.layoutText(layoutTextSource, textStyle, fontList, {
              size: size * k,
              lang: (project.meta && project.meta.lang) || 'en',
              direction,
              compose: composeLayout || undefined,
              maxWidth: Infinity,
            });
          }
        }
      }
    }

    const scene = {
      key,
      cueId,
      beatId,
      kind: beat.kind || 'single',
      start: beat.start,
      end: beat.end,
      text: beat.text || '',
      style,
      lines: [],
      words: [],
      letters: [],
      blockBBox: layout.bbox,
      layout,
      size,
      scale,
      direction,
      fillColor,
      regions: layout.regions || null,
      decor: layout.decor || null,
    };

    for (let lineIdx = 0; lineIdx < layout.lines.length; lineIdx += 1) {
      const layoutLine = layout.lines[lineIdx];
      const line = { index: lineIdx, words: [], width: layoutLine.width, height: layoutLine.height, baseline: layoutLine.baseline, y: layoutLine.y, vertical: !!layoutLine.vertical };
      for (let wordIdx = 0; wordIdx < layoutLine.words.length; wordIdx += 1) {
        const layoutWord = layoutLine.words[wordIdx];
        if (layoutWord.isSpace) continue;
        const word = { index: wordIdx, lineIndex: lineIdx, letters: [], width: layoutWord.width };
        for (let letterIdx = 0; letterIdx < layoutWord.letters.length; letterIdx += 1) {
          const source = layoutWord.letters[letterIdx];
          const box = {
            x: source.x + source.bbox.x1 + (source.offsetX || 0),
            y: source.y + source.bbox.y1 + (source.offsetY || 0),
            w: Math.max(0, source.bbox.x2 - source.bbox.x1),
            h: Math.max(0, source.bbox.y2 - source.bbox.y1),
          };
          box.cx = box.x + box.w / 2;
          box.cy = box.y + box.h / 2;
          const path = letterPath(cueId, beatId, lineIdx, wordIdx, letterIdx);
          const letterColor = source.span && source.span.color
            ? resolveFillColor(project, { color: { fill: source.span.color }, palette: style.palette || null }, beat)
            : source.span && source.span.paletteIndex != null
              ? resolveFillColor(project, { color: { fill: { kind: 'palette', index: source.span.paletteIndex } }, palette: style.palette || null }, beat)
              : fillColor;
          const letter = {
            path,
            cueId,
            beatId,
            lineIdx,
            wordIdx,
            letterIdx,
            globalIdx: scene.letters.length,
            char: source.char,
            renderedChar: source.renderedChar,
            glyph: source.glyph,
            fontId: source.fontId,
            src: source.src,
            raster: source.raster,
            size: source.size == null ? size : source.size,
            // the beat text's code-point offset, which the `range` scope addresses
            textOffset: source.textOffset,
            advance: source.advance,
            advanceWithSpacing: source.advanceWithSpacing,
            vertRotate: !!source.vertRotate,
            quadrant: !!source.quadrant,
            offsetX: source.offsetX || 0,
            offsetY: source.offsetY || 0,
            baseRot: source.baseRot || 0,
            regionId: source.regionId ?? null,
            role: source.role || null,
            local: {
              x: box.x,
              y: box.y,
              w: box.w,
              h: box.h,
              cx: box.cx,
              cy: box.cy,
              penX: source.x,
              penY: source.y,
            },
            bbox: { x1: source.bbox.x1, y1: source.bbox.y1, x2: source.bbox.x2, y2: source.bbox.y2 },
            color: letterColor,
            span: source.span || null,
            spanIndex: source.spanIndex == null ? null : source.spanIndex,
            style,
            mesh: null,
            samples: null,
          };
          word.letters.push(letter);
          scene.letters.push(letter);
        }
        line.words.push(word);
        scene.words.push(word);
      }
      scene.lines.push(line);
    }

    if (cache.size >= MAX_SCENES) cache.clear();
    cache.set(key, scene);
    return scene;
  }

  function meshOf(letter) {
    return buildLetterMesh(letter);
  }

  function samplesOf(letter, count) {
    const samples = buildLetterSamples(letter);
    const mesh = buildLetterMesh(letter);
    const wanted = count || sampleCount(mesh.bbox ? mesh.bbox.width * mesh.bbox.height : 0, letter.size);
    if (!samples.interior || samples.interior.length < wanted * 2) {
      const random = SA.rng.rngFor(0x5eed, letter.path, 'samples');
      const positions = mesh.fill.positions;
      const scaled = { positions: new Float32Array(positions.length), indices: mesh.fill.indices };
      for (let i = 0; i < positions.length; i += 1) scaled.positions[i] = positions[i] * mesh.scale;
      samples.interior = SA.geometry.sampleInterior(scaled, wanted, random);
      samples.outline = SA.geometry.sampleOutline(mesh.contours, Math.max(32, Math.round(wanted / 2)));
      if (mesh.scale !== 1) {
        for (let i = 0; i < samples.outline.length; i += 1) samples.outline[i] *= mesh.scale;
      }
    }
    return samples;
  }

  function clearCache() {
    cache.clear();
  }

  return { buildScene, meshOf, samplesOf, letterPath, clearCache, hash };
})();
