(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./rng'), require('./keywords'), require('./textflow'));
  } else {
    root.SA = root.SA || {};
    root.SA.compositions = factory(root.SA.rng, root.SA.keywords, root.SA.textflow);
  }
})(typeof self !== 'undefined' ? self : this, function (rng, keywords, textflow) {
  'use strict';

  // Step 3 of the auto-direct rework: one picture per beat, chosen from a
  // library of composition templates instead of jittering size and position.
  // A composition owns where the block sits, which word is the hero, how big
  // each word is, where the forced breaks fall and how the beat enters and
  // leaves. The song's look still owns the palette, texture, background and
  // finishing post effects; the composition only rewrites the text layout.
  //
  // A composition is pure data (no functions) so `build` can return it inside
  // a project document unchanged.

  const CJK_RE = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;
  const KANJI_KATA_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u30a0-\u30ff]/;
  const LATIN_STEM_RE = /(?:ing|ed|es|s|d|in')$/;

  // Japanese particles that carry no picture. Only a short all-hiragana token
  // can be one, so content words that merely start with a particle kana stay
  // content.
  const PARTICLES_JA = new Set([
    'は', 'が', 'を', 'に', 'へ', 'と', 'で', 'も', 'の', 'や', 'か', 'ね', 'よ', 'な',
    'から', 'まで', 'より', 'って', 'けど', 'し', 'ば', 'だ', 'です', 'ます',
  ]);
  const STOPWORDS_EN = new Set([
    'the', 'a', 'an', 'to', 'of', 'and', 'in', 'on', 'at', 'is', 'it', 'i', 'you',
    'my', 'your', 'me', 'we', 'for', 'with', 'will', 'be', 'am', 'are', 'that', 'this',
  ]);

  const LIST = [
    {
      id: 'heroCenter',
      scaleClass: 'large',
      size: 0.15,
      hierarchy: { hero: 2.1, particle: 0.55, weight: 400, heroWeight: 700, accentHero: true },
      breaks: 'heroAlone',
      text: { align: 'center', direction: 'horizontal', maxWidth: 0.92, letterSpacing: 0.01, lineHeight: 1.12 },
      location: { type: 'grid', params: { x: 0.5, y: 0.5, edgeX: 0, edgeY: 0 } },
      layout: null,
      graphic: null,
      enter: ['revealSweep', 'rangeReveal', 'zoomIn'],
      exit: ['wipe', 'fade', 'zoomOut'],
    },
    {
      id: 'leftHeadline',
      scaleClass: 'medium',
      size: 0.105,
      hierarchy: { hero: 1.8, particle: 0.6, weight: 400, heroWeight: 700, accentHero: true },
      breaks: 'heroAlone',
      text: { align: 'left', direction: 'horizontal', maxWidth: 0.62, letterSpacing: 0, lineHeight: 1.18 },
      location: { type: 'grid', params: { x: 0.1, y: 0.5, edgeX: -1, edgeY: 0 } },
      layout: null,
      graphic: { type: 'shapeLayer', params: { shape: 'underline', drive: 'enter', stroke: 5, padding: 0.1, feather: 0.04, glow: 0.3 } },
      enter: ['revealSweep', 'riseIn'],
      exit: ['wipe', 'fade'],
    },
    {
      id: 'lowerBand',
      scaleClass: 'small',
      size: 0.075,
      hierarchy: { hero: 1.6, particle: 0.6, weight: 700, heroWeight: 700, accentHero: true },
      breaks: 'heroAlone',
      text: { align: 'center', direction: 'horizontal', maxWidth: 0.88, letterSpacing: 0.01, lineHeight: 1.1 },
      location: { type: 'grid', params: { x: 0.5, y: 0.8, edgeX: 0, edgeY: 0.5 } },
      layout: null,
      graphic: { type: 'shapeLayer', params: { shape: 'box', drive: 'enter', stroke: 3.5, padding: 0.14, feather: 0.02, glow: 0.25 } },
      enter: ['rangeReveal', 'revealSweep'],
      exit: ['dissolve', 'fade'],
    },
    {
      id: 'bracketCenter',
      scaleClass: 'medium',
      size: 0.115,
      hierarchy: { hero: 1.7, particle: 0.55, weight: 400, heroWeight: 700, accentHero: true },
      breaks: 'heroAlone',
      text: { align: 'center', direction: 'horizontal', maxWidth: 0.82, letterSpacing: 0.01, lineHeight: 1.16 },
      location: { type: 'grid', params: { x: 0.5, y: 0.5, edgeX: 0, edgeY: 0 } },
      layout: null,
      graphic: { type: 'shapeLayer', params: { shape: 'brackets', drive: 'enter', stroke: 4, padding: 0.12, feather: 0.05, glow: 0.3 } },
      enter: ['revealSoft', 'fade'],
      exit: ['fade', 'wipe'],
    },
    {
      id: 'posterStack',
      scaleClass: 'large',
      size: 0.13,
      hierarchy: { hero: 1.35, particle: 0.7, weight: 700, heroWeight: 700, accentHero: true },
      breaks: 'natural',
      text: { align: 'center', direction: 'horizontal', maxWidth: 0.8, letterSpacing: 0.02, lineHeight: 1.06 },
      location: { type: 'grid', params: { x: 0.5, y: 0.5, edgeX: 0, edgeY: 0 } },
      layout: { type: 'stackedWords', params: { fillWidth: 0.9 } },
      graphic: null,
      fits: { minWords: 2, maxWords: 4 },
      enter: ['revealSweep', 'zoomIn'],
      exit: ['wipe', 'zoomOut'],
    },
    {
      id: 'cornerQuiet',
      scaleClass: 'small',
      size: 0.062,
      hierarchy: { hero: 1.6, particle: 0.7, weight: 400, heroWeight: 700, accentHero: true },
      breaks: 'heroAlone',
      text: { align: 'left', direction: 'horizontal', maxWidth: 0.46, letterSpacing: 0.02, lineHeight: 1.22 },
      location: { type: 'grid', params: { x: 0.08, y: 0.14, edgeX: -1, edgeY: -1 } },
      layout: null,
      graphic: null,
      fits: { maxChars: 14 },
      enter: ['fade', 'typewriter'],
      exit: ['fade', 'dissolve'],
    },
    {
      id: 'verticalRight',
      scaleClass: 'medium',
      size: 0.105,
      cjkOnly: true,
      hierarchy: { hero: 1.5, particle: 0.6, weight: 400, heroWeight: 700, accentHero: true },
      breaks: 'heroAlone',
      text: { align: 'center', direction: 'vertical', maxWidth: 0.5, letterSpacing: 0.01, lineHeight: 1.08 },
      location: { type: 'grid', params: { x: 0.84, y: 0.5, edgeX: 1, edgeY: 0 } },
      layout: { type: 'vertical', params: {} },
      graphic: null,
      enter: ['revealSweep', 'typewriter'],
      exit: ['wipe', 'fade'],
    },
    {
      id: 'diagonalJump',
      scaleClass: 'large',
      size: 0.15,
      minWeird: 0.5,
      hierarchy: { hero: 2.2, particle: 0.55, weight: 700, heroWeight: 700, accentHero: true },
      breaks: 'perWord',
      text: { align: 'center', direction: 'horizontal', maxWidth: 0.9, letterSpacing: 0, lineHeight: 1.14 },
      location: { type: 'grid', params: { x: 0.5, y: 0.5, edgeX: 0, edgeY: 0 } },
      layout: { type: 'diagonal', params: { angle: -12 } },
      graphic: null,
      enter: ['zoomIn', 'revealSweep'],
      exit: ['zoomOut', 'wipe'],
    },
    {
      id: 'bleedHero',
      scaleClass: 'large',
      size: 0.3,
      minWeird: 0.7,
      hierarchy: { hero: 2.3, particle: 0.6, weight: 700, heroWeight: 700, accentHero: true },
      breaks: 'heroAlone',
      text: { align: 'center', direction: 'horizontal', maxWidth: 1.35, maxHeight: 1.2, letterSpacing: -0.01, lineHeight: 1.02 },
      location: { type: 'grid', params: { x: 0.5, y: 0.5, edgeX: 0, edgeY: 0 } },
      layout: null,
      graphic: null,
      enter: ['revealSweep', 'zoomIn', 'megaZoomIn'],
      exit: ['wipe', 'zoomOut'],
    },
    {
      id: 'whisper',
      scaleClass: 'small',
      size: 0.048,
      hierarchy: { hero: 1.3, particle: 0.75, weight: 400, heroWeight: 700, accentHero: true },
      breaks: 'natural',
      text: { align: 'center', direction: 'horizontal', maxWidth: 0.7, letterSpacing: 0.2, lineHeight: 1.35 },
      location: { type: 'grid', params: { x: 0.5, y: 0.5, edgeX: 0, edgeY: 0 } },
      layout: null,
      graphic: null,
      fits: { maxEnergy: 0.5 },
      enter: ['fade', 'revealSoft', 'typewriter'],
      exit: ['fade', 'dissolve'],
    },
  ];

  const BY_ID = new Map(LIST.map((comp) => [comp.id, comp]));

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return number < 0 ? 0 : number > 1 ? 1 : number;
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  // Every palette holds the 12 fixed slots, so a slot index is stored as is.
  function paletteRefIndex(colors, slot) {
    return slot;
  }

  function paletteColorsOf(options) {
    if (Array.isArray(options.palette)) return options.palette;
    if (options.palette && Array.isArray(options.palette.colors)) return options.palette.colors;
    const theme = options.themeStyle && options.themeStyle.palette;
    return theme && Array.isArray(theme.colors) ? theme.colors : [];
  }

  function get(id) {
    return BY_ID.get(id) || null;
  }

  function codePoints(text) {
    return Array.from(String(text == null ? '' : text));
  }

  function textOf(analysis) {
    return (analysis && analysis.text) || '';
  }

  // --- analysis ------------------------------------------------------------------

  let cachedLang = null;
  let cachedLangSource = null;

  function detectLang(text) {
    const source = String(text || '');
    if (source === cachedLangSource) return cachedLang;
    cachedLangSource = source;
    cachedLang = CJK_RE.test(source) ? 'ja' : 'en';
    return cachedLang;
  }

  // wordLike: a token with a letter, digit or CJK character (punctuation only
  // segments are not words). Particles are words for counting, not for heroes.
  function isWordLike(token) {
    return CJK_RE.test(token) || /[A-Za-z0-9]/.test(token);
  }

  function isParticle(token, lang) {
    if (lang === 'ja') return token.length <= 2 && /^[\u3040-\u309f\u30fc]+$/.test(token) && PARTICLES_JA.has(token);
    return STOPWORDS_EN.has(String(token).toLowerCase());
  }

  function roleOf(token, lang) {
    if (!isWordLike(token)) return 'other';
    return isParticle(token, lang) ? 'particle' : 'content';
  }

  // The code-point ranges of the keyword words inside the raw text (the same
  // substring rule keywords.mark uses for CJK).
  function keywordRanges(text, words) {
    const lower = text.toLowerCase();
    const ranges = [];
    for (const word of words || []) {
      const needle = String(word || '').toLowerCase();
      if (!needle) continue;
      const at = lower.indexOf(needle);
      if (at < 0) continue;
      const from = codePoints(lower.slice(0, at)).length;
      ranges.push({ from, to: from + codePoints(needle).length });
    }
    ranges.sort((a, b) => a.from - b.from);
    return ranges;
  }

  // One beat's picture grammar: the tokens with their roles, the hero range and
  // the counts `pick` needs. `chars` counts visible characters (the fits use
  // it); `length` is the code-point length of the whole text.
  function analyzeBeat(text, lang, keywordWords) {
    const source = String(text == null ? '' : text);
    const chars = codePoints(source);
    const resolvedLang = lang || detectLang(source);
    const words = Array.isArray(keywordWords)
      ? keywordWords
      : keywords && typeof keywords.listFor === 'function'
        ? keywords.listFor(null).words
        : [];
    const segments = textflow && typeof textflow.segmentWords === 'function' ? textflow.segmentWords(source, resolvedLang) : [source];
    const tokens = [];
    let cursor = 0;
    for (const segment of segments) {
      const length = codePoints(segment).length;
      if (length && !/^\s+$/.test(segment)) {
        tokens.push({
          from: cursor,
          to: cursor + length,
          text: segment,
          role: roleOf(segment, resolvedLang),
        });
      }
      cursor += length;
    }
    const visible = chars.filter((character) => !/\s/.test(character)).length;
    const wordCount = tokens.filter((token) => token.role !== 'other').length;
    const content = tokens.filter((token) => token.role === 'content');
    let hero = null;
    if (visible <= 4 && chars.length) {
      // a very short line is one picture: the whole text is the hero
      hero = { from: 0, to: chars.length };
    } else {
      const ranges = keywordRanges(source, words);
      for (const range of ranges) {
        const hit = content.find((token) => token.from < range.to && token.to > range.from);
        if (hit) {
          hero = { from: hit.from, to: hit.to };
          break;
        }
      }
      if (!hero && content.length) {
        const scripted = content.filter((token) => KANJI_KATA_RE.test(token.text));
        const pool = scripted.length ? scripted : content;
        let best = pool[0];
        for (const token of pool) {
          if (codePoints(token.text).length > codePoints(best.text).length) best = token;
        }
        hero = { from: best.from, to: best.to };
      }
      if (!hero && content.length) {
        const last = content[content.length - 1];
        hero = { from: last.from, to: last.to };
      }
    }
    return {
      text: source,
      length: chars.length,
      chars: visible,
      cjk: resolvedLang === 'ja' || CJK_RE.test(source),
      lang: resolvedLang,
      tokens,
      words: wordCount,
      hero,
    };
  }

  // --- picking ------------------------------------------------------------------

  // features: { chars, words, duration, cjk, portrait, energy, prev: [id, id], prevScale }
  // ctx:      { seed, beatId, w, history }
  function pick(features, ctx) {
    const f = features || {};
    const options = ctx || {};
    const random = rng.rngFor(options.seed, options.beatId, 'compose');
    const w = clamp01(options.w == null ? 0 : options.w);
    const energy = clamp01(f.energy == null ? 0.5 : f.energy);
    const cjk = !!f.cjk;
    const history = Array.isArray(options.history) ? options.history : [];
    let prev = Array.isArray(f.prev) ? f.prev : [];
    let prevScale = f.prevScale || null;
    if (!prev.length && history.length) {
      prev = [];
      for (let i = history.length - 1; i >= 0 && prev.length < 2; i -= 1) prev.push(history[i] && history[i].id);
      if (!prevScale && history[history.length - 1]) prevScale = history[history.length - 1].scaleClass || null;
    }

    const weights = LIST.map((comp) => {
      const fits = comp.fits || {};
      if (f.chars != null && fits.minChars != null && f.chars < fits.minChars) return 0;
      if (f.chars != null && fits.maxChars != null && f.chars > fits.maxChars) return 0;
      if (f.words != null && fits.minWords != null && f.words < fits.minWords) return 0;
      if (f.words != null && fits.maxWords != null && f.words > fits.maxWords) return 0;
      if (f.duration != null && fits.minDuration != null && f.duration < fits.minDuration) return 0;
      if (f.duration != null && fits.maxDuration != null && f.duration > fits.maxDuration) return 0;
      if (fits.maxEnergy != null && energy > fits.maxEnergy) return 0;
      if (comp.cjkOnly && !cjk) return 0;
      if ((comp.minWeird || 0) > w) return 0;
      let weight = 1;
      if (prev[0] === comp.id) weight = 0;
      else if (prev[1] === comp.id) weight *= 0.4;
      // scale contrast: a large picture follows a small one and the other way
      if (prevScale === 'large' && comp.scaleClass !== 'large') weight *= 1.6;
      else if (prevScale === 'small' && comp.scaleClass === 'large') weight *= 1.6;
      if (comp.scaleClass === 'large') weight *= 0.6 + energy;
      else if (comp.scaleClass === 'small') weight *= 1.4 - energy;
      // the size centre bias (theme profile): a large centre prefers the big
      // templates, a small one the quiet corners
      if (options.sizeCenter != null && Number.isFinite(Number(options.sizeCenter))) {
        const center = clamp01(options.sizeCenter);
        if (comp.scaleClass === 'small') weight *= Math.max(0.25, Math.min(1, 1.5 - 1.6 * center));
        else if (comp.scaleClass === 'large') weight *= 0.6 + 0.8 * center;
      }
      return weight;
    });

    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (!(total > 0)) {
      // every draw was gated out (a very short beat, one composition left):
      // fall back to anything the language and the weird gate allow
      const viable = LIST.filter((comp) => {
        if (comp.cjkOnly && !cjk) return false;
        if ((comp.minWeird || 0) > w) return false;
        if (comp.fits && comp.fits.maxEnergy != null && energy > comp.fits.maxEnergy) return false;
        return true;
      });
      if (!viable.length) return LIST[0];
      const fresh = viable.filter((comp) => !prev.length || comp.id !== prev[0]);
      return (fresh.length ? fresh : viable)[0];
    }
    let roll = random() * total;
    for (let i = 0; i < LIST.length; i += 1) {
      roll -= weights[i];
      if (roll <= 0) return LIST[i];
    }
    return LIST[LIST.length - 1];
  }

  // --- building ------------------------------------------------------------------

  function breaksFor(mode, analysis) {
    const breaks = [];
    const hero = analysis.hero;
    if (mode === 'perWord') {
      for (const token of analysis.tokens) {
        if (token.role === 'content' && token.from > 0) breaks.push(token.from);
      }
    } else if (mode === 'heroAlone' && hero) {
      if (hero.from > 0) breaks.push(hero.from);
      if (hero.to < analysis.length) breaks.push(hero.to);
    }
    return [...new Set(breaks)].sort((a, b) => a - b);
  }

  function pickOne(random, list) {
    if (!Array.isArray(list) || !list.length) return null;
    return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  }

  function instanceOf(type, group, duration, ease) {
    if (!type) return null;
    const motion = group === 'enter'
      ? { in: { duration: Math.round(duration * 100) / 100, ease, delay: 0 } }
      : { out: { duration: Math.round(duration * 100) / 100, ease, delay: 0 } };
    const base = typeof type === 'object' ? clone(type) : { type };
    return { ...base, enabled: true, motion };
  }

  // build(comp, analysis, ctx) -> the beat-style patch. `ctx` carries the run's
  // seed / beat id, the raw weird axis `w`, the frame short side `screen` and
  // the song's theme style (its post stack minus the previous shape layer).
  function build(comp, analysis, ctx) {
    if (!comp || !analysis) return {};
    const options = ctx || {};
    const random = rng.rngFor(options.seed, options.beatId, 'compose-build');
    const w = clamp01(options.w == null ? 0 : options.w);
    const screen = Number(options.screen) > 0 ? Number(options.screen) : 1080;
    // the profile's hero multiplier replaces the old (1 + 0.3w); the derived
    // value is the same factor, so a profile-less run keeps its output
    const sizeScale = options.heroScale == null || !Number.isFinite(Number(options.heroScale)) ? 1 + 0.3 * w : Number(options.heroScale);
    const size = Math.max(8, Math.round(comp.size * sizeScale * screen));
    const hierarchy = comp.hierarchy || {};
    const heroScale = (hierarchy.hero == null ? 2 : hierarchy.hero) * sizeScale;
    const particleScale = hierarchy.particle == null ? 0.55 : hierarchy.particle;
    const heroWeight = hierarchy.heroWeight == null ? 700 : hierarchy.heroWeight;
    const accentHero = hierarchy.accentHero !== false;

    const breaks = breaksFor(comp.breaks, analysis);
    const paletteColors = paletteColorsOf(options);
    const fillIndex = paletteRefIndex(paletteColors, 4); // TEXT_FILL
    const fill2Index = paletteRefIndex(paletteColors, 5); // TEXT_FILL2
    const spans = [];
    if (analysis.hero && analysis.hero.to > analysis.hero.from) {
      const span = { from: analysis.hero.from, to: analysis.hero.to, scale: Math.round(heroScale * 100) / 100, weight: heroWeight };
      if (accentHero) span.paletteIndex = fill2Index;
      spans.push(span);
    }
    for (const token of analysis.tokens) {
      if (token.role !== 'particle' || token.to <= token.from) continue;
      spans.push({ from: token.from, to: token.to, scale: particleScale });
    }

    const enterType = pickOne(random, comp.enter);
    const exitType = pickOne(random, comp.exit);
    const enterDuration = 0.22 + random() * 0.12;
    const exitDuration = 0.16 + random() * 0.08;
    const enter = instanceOf(enterType, 'enter', enterDuration, random() < 0.5 ? 'expoOut' : 'cubicOut');
    const exit = instanceOf(exitType, 'exit', exitDuration, random() < 0.5 ? 'expoIn' : 'cubicIn');

    const textStyle = comp.text || {};
    const text = {
      size,
      weight: hierarchy.weight == null ? 400 : hierarchy.weight,
      align: textStyle.align || 'center',
      direction: textStyle.direction || 'horizontal',
      maxWidth: textStyle.maxWidth == null ? 0.9 : textStyle.maxWidth,
      letterSpacing: textStyle.letterSpacing == null ? 0 : textStyle.letterSpacing,
      lineHeight: textStyle.lineHeight == null ? 1.2 : textStyle.lineHeight,
      // `id` lets a later re-roll read the neighbouring beats' compositions
      // back out of the project (`beatStyles[id].text.compose.id`)
      compose: { id: comp.id, text: analysis.text, breaks, spans },
    };
    if (textStyle.maxHeight != null) text.maxHeight = textStyle.maxHeight;

    // the song's post stack stays (texture, grain, vignette); its old shape
    // layer and this composition's own graphic replace each other
    const themePost = options.themeStyle && Array.isArray(options.themeStyle.post) ? options.themeStyle.post : [];
    const post = themePost.filter((entry) => !entry || entry.type !== 'shapeLayer').map(clone);
    if (comp.graphic) post.push({ type: 'shapeLayer', params: clone(comp.graphic.params || {}), enabled: true });

    const patch = {
      text,
      location: clone(comp.location || { type: 'grid', params: { x: 0.5, y: 0.5, edgeX: 0, edgeY: 0 } }),
      layout: comp.layout ? clone(comp.layout) : { type: 'row', params: {} },
      enter,
      exit,
      hold: [],
      post,
      transform: { rotate: 0, tiltX: 0, tiltY: 0 },
    };
    if (accentHero) {
      // colorA is the base text colour, colorB is what the hero mixes to (the
      // fill shader's per-letter colorMix reads colorB; the 2D fallback reads
      // the hero span's own letter colour)
      patch.color = {
        fill: { kind: 'palette', index: fillIndex },
        fill2: { kind: 'palette', index: fill2Index },
      };
    }
    return patch;
  }

  return {
    LIST,
    get,
    analyzeBeat,
    pick,
    build,
    // exported for the tests and for direct.js' figure-zone estimate
    textOf,
    breaksFor,
  };
});
