(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../color'), require('./palette-roles'));
  else {
    root.SA = root.SA || {};
    root.SA.stagePalette = factory(root.SA.color, root.SA.paletteRoles);
  }
})(typeof self !== 'undefined' ? self : this, function (color, roles) {
  'use strict';

  // The stage follow for the beat colour schemes and the theme palette set. The
  // lyrics' own style is resolved per beat (project.js applies the cue palette,
  // the beat palette and the beat scheme), so the text, the edges and the text
  // background already move. This module answers, for the current frame, which
  // palette the timeline clips should be painted with: the background track was
  // drawn with the project palette (`stage.base`), the backdrop / figure /
  // filler clips with their cue's palette (`stage.cue`), and both follow the
  // live beat's resolved palette (`stage.to`).

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return number > 1 ? 1 : number;
  }

  // The beat the stage answers to: the active beat that started last; between
  // the beats of a cue the last one that ended keeps the colours alive, and
  // outside every cue (or before the cue's first beat) the stage is plain.
  function stageBeat(project, t) {
    if (!project) return null;
    const cues = (project.script && project.script.cues) || [];
    let active = null;
    let containing = null;
    for (const cue of cues) {
      const start = Number(cue.start) || 0;
      const end = Number(cue.end) || start;
      if (t < start - 1e-4 || t > end + 1e-4) continue;
      containing = cue;
      for (const beat of (project.beats && project.beats[cue.id]) || []) {
        if (t >= beat.start - 1e-4 && t <= beat.end + 1e-4 && (!active || beat.start > active.start)) active = beat;
      }
    }
    if (active) return active;
    if (!containing) return null;
    let last = null;
    for (const beat of (project.beats && project.beats[containing.id]) || []) {
      if (beat.end <= t + 1e-4 && (!last || beat.end > last.end)) last = beat;
    }
    return last;
  }

  function paletteOf(style) {
    return style && style.palette && Array.isArray(style.palette.colors) && style.palette.colors.length ? style.palette.colors : [];
  }

  // The live stage palette: `{ base, cue, to, text, key }` or null when the
  // project paints the classic way (no auto cue palette, no beat palette set,
  // no beat scheme).
  function stageAt(project, t, resolveStyle) {
    if (!project || typeof resolveStyle !== 'function') return null;
    const beat = stageBeat(project, t);
    if (!beat) return null;
    const beatStyle = resolveStyle(project, `cue:${beat.cueId}/beat:${beat.id}`);
    const scheme = beatStyle && beatStyle.palette && beatStyle.palette.scheme;
    const set = beatStyle && beatStyle.palette && beatStyle.palette.set;
    const to = paletteOf(beatStyle);
    if (!to.length) return null;
    const cue = project.cueStyles && project.cueStyles[beat.cueId];
    const cueAuto = !!(cue && cue.palette && cue.palette.auto);
    if (!scheme && !set && !cueAuto) return null;
    const cueColors = paletteOf(resolveStyle(project, `cue:${beat.cueId}`));
    const base = paletteOf(resolveStyle(project, ''));
    const slots = roles.roleSlots(to);
    const text = [to[slots.T], to[slots.H]].filter((hex) => typeof hex === 'string' && hex);
    return {
      beatId: beat.id,
      base,
      // the palette the clips were drawn with: the pre-beat palette when a beat
      // palette or a scheme is live, the cue's own palette otherwise. A beat
      // palette sits on the cue palette, so its `from` comes first.
      cue: set && Array.isArray(set.from) && set.from.length ? set.from.slice()
        : scheme && Array.isArray(scheme.from) && scheme.from.length ? scheme.from.slice()
        : cueColors,
      to: to.slice(),
      text,
      key: to.join('|'),
    };
  }

  // The split planes of a clip need a readable step from the live text colour:
  // they are drawn behind the lyrics and the swap can put the old text colour
  // on them (the same separation the theme shapes get, filler-render has none).
  // No computed colours: the separated ideal is snapped to the closest entry
  // of `pool` (the live palette) that clears the target; only when no entry
  // clears it does the computed hex survive.
  function separateSplits(value, text, target, pool) {
    if (!value || typeof value !== 'object' || !Array.isArray(text) || !text.length) return value;
    const snapOne = (hex) => {
      if (typeof hex !== 'string') return hex;
      const ideal = color.separateFrom(hex, text, target);
      if (!ideal || !Array.isArray(pool) || !pool.length) return ideal;
      if (roles && typeof roles.nearestMeeting === 'function') {
        // nearestMeeting takes a single fixed colour; try each text colour and
        // keep the first that clears its own target, else the closest overall.
        for (const fixed of text) {
          const snapped = roles.nearestMeeting(ideal, pool, fixed, target);
          if (snapped) return snapped;
        }
      }
      if (roles && typeof roles.snapToPalette === 'function') {
        const snapped = roles.snapToPalette(ideal, pool);
        if (snapped) return snapped;
      }
      return ideal;
    };
    const walk = (node) => {
      if (Array.isArray(node)) return node.map(walk);
      if (!node || typeof node !== 'object') return node;
      const out = {};
      for (const [key, entry] of Object.entries(node)) out[key] = walk(entry);
      if (node.type === 'split' && node.params && Array.isArray(node.params.colors) && node.params.colors.length) {
        out.params = {
          ...out.params,
          colors: out.params.colors.map(snapOne),
        };
      }
      return out;
    };
    return walk(value);
  }

  const cache = new WeakMap();

  // roles.recolor that leaves alone what the user recoloured by hand (a combo
  // layer or a figure sub-beat marked `colorLock`): those keep their colours
  // while the stage follows the beat palette.
  function recolorUnlocked(value, from, to) {
    let locked = false;
    const scan = (node) => {
      if (locked || !node || typeof node !== 'object') return;
      if (node.colorLock === true) locked = true;
      else Object.values(node).forEach(scan);
    };
    scan(value);
    if (!locked) return roles.recolor(value, from, to);
    const walk = (node) => {
      if (Array.isArray(node)) return node.map(walk);
      if (!node || typeof node !== 'object') return typeof node === 'string' ? roles.recolor(node, from, to) : node;
      if (node.colorLock === true) return node;
      const out = {};
      for (const [key, entry] of Object.entries(node)) out[key] = walk(entry);
      return out;
    };
    return walk(value);
  }

  function sameColors(a, b) {
    if (a === b) return true;
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (String(a[i]).toLowerCase() !== String(b[i]).toLowerCase()) return false;
    return true;
  }

  // `from` is the palette the clip was painted with (stage.base for the
  // background track, stage.cue for the rest). Returns `{ spec, colors }` in
  // the live palette; clips already on it come back untouched. The result is
  // cached per clip object so the per-frame walk is paid only on a change.
  function recolorClip(clip, from, stage, weirdRaw) {
    if (!clip || !stage) return null;
    const source = Array.isArray(from) && from.length ? from : stage.cue;
    const to = stage.to;
    if (!Array.isArray(source) || !source.length || !Array.isArray(to) || !to.length) return null;
    if (sameColors(source, to)) return { spec: clip.spec, colors: clip.colors };
    const rawW = clamp01(weirdRaw);
    const key = `${stage.key}|${source.join(',').toLowerCase()}|${rawW}`;
    const cached = cache.get(clip);
    if (cached && cached.key === key) return cached.result;
    const colors = Array.isArray(clip.colors) ? roles.recolor(clip.colors, source, to) : clip.colors;
    const recolored = clip.spec ? recolorUnlocked(clip.spec, source, to) : clip.spec;
    const separateOff = recolored && recolored.params && recolored.params.separate === false;
    const spec = clip.spec ? (separateOff ? recolored : separateSplits(recolored, stage.text, roles.ratioFor('backdrop', rawW), to)) : clip.spec;
    const result = { spec, colors };
    cache.set(clip, { key, result });
    return result;
  }

  return { stageBeat, stageAt, recolorClip, separateSplits };
});
