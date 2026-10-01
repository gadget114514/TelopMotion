(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./audio-driver.js'));
  else {
    root.SA = root.SA || {};
    root.SA.sections = factory(root.SA.audioDriver);
  }
})(typeof self !== 'undefined' ? self : this, function (audioDriver) {
  'use strict';

  // Section awareness: the flat cue list is grouped into the blocks a listener
  // hears ("the verse, then the chorus"), so the automatic direction can switch
  // its colours / staging per block and lean harder on the loud ones.
  //
  // A boundary is a silence: `next.start - previous.end >= gap` seconds (2 s by
  // default). That is all a plain cue list can offer, so the detector works
  // without any audio at all - and it is *not* the filler interlude: a filler
  // fills the gap, this only names the blocks around it.
  //
  // A block longer than `maxCues` (4 by default) is pseudo-split into even
  // chunks, for the song that never takes a breath (a wall of lyrics).
  //
  // Each block then gets its own loudness (`energy`, the mean RMS of its span
  // against the song's p90 - null without analysis) and a `chorus` mark. Three
  // signals, in this order:
  //   1. `cue.meta.section === 'chorus'` - an explicit label beats every guess.
  //   2. the loudness: half a standard deviation above the mean, or inside the
  //      loudest third (both marks apply, so two blocks that tie are both one).
  //   3. without analysis, a repeated line: a chorus sings its words twice.
  //
  // Everything here is a pure function of its arguments: the same cues and the
  // same analysis always give the same blocks, whatever the seed.

  const DEFAULT_GAP = 2;
  const DEFAULT_MAX_CUES = 4;
  const ENERGY_DIGITS = 4;
  const CHORUS_META = 'chorus';

  function round(value, digits) {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
  }

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(1, number));
  }

  function byId(a, b) {
    const x = String(a);
    const y = String(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }

  // The cues in play order. A cue without an id is unusable (the whole run keys
  // on it), a cue without an end lasts until the next one starts.
  function inOrder(cues) {
    return (Array.isArray(cues) ? cues : [])
      .filter((cue) => cue && cue.id != null)
      .map((cue) => {
        const start = Number(cue.start) || 0;
        return {
          id: cue.id,
          text: String(cue.text == null ? '' : cue.text),
          meta: cue.meta || null,
          start,
          end: Number.isFinite(Number(cue.end)) && Number(cue.end) > start ? Number(cue.end) : start + 1,
        };
      })
      .sort((a, b) => a.start - b.start || byId(a.id, b.id));
  }

  // One block per silence, `gap` seconds or more.
  function blocksOf(cues, gap) {
    const blocks = [];
    let current = null;
    for (const cue of cues) {
      if (current && cue.start - current.end < gap) {
        current.cues.push(cue);
        current.end = Math.max(current.end, cue.end);
        continue;
      }
      current = { cues: [cue], start: cue.start, end: cue.end };
      blocks.push(current);
    }
    return blocks;
  }

  // A block longer than `maxCues` is cut into `ceil(n / maxCues)` chunks of
  // near-equal size (the remainder goes to the first chunks, so no chunk is
  // empty). Every chunk keeps at least one cue.
  function chunksOf(cues, maxCues) {
    const count = cues.length;
    if (count <= maxCues) return [cues];
    const parts = Math.ceil(count / maxCues);
    const base = Math.floor(count / parts);
    const extra = count % parts;
    const out = [];
    let at = 0;
    for (let i = 0; i < parts; i += 1) {
      const size = base + (i < extra ? 1 : 0);
      out.push(cues.slice(at, at + size));
      at += size;
    }
    return out;
  }

  // The loud blocks of the song. Needs at least two measured blocks: one block
  // is the whole song, so there is nothing to set it against.
  function chorusFromEnergy(sections) {
    const flags = new Array(sections.length).fill(false);
    const known = [];
    sections.forEach((section, index) => {
      if (Number.isFinite(section.energy)) known.push({ index, value: section.energy });
    });
    if (known.length < 2) return flags;
    const mean = known.reduce((sum, entry) => sum + entry.value, 0) / known.length;
    const sigma = Math.sqrt(known.reduce((sum, entry) => sum + (entry.value - mean) ** 2, 0) / known.length);
    const threshold = mean + 0.5 * sigma;
    const ranked = known.slice().sort((a, b) => b.value - a.value);
    const cut = ranked[Math.max(1, Math.ceil(ranked.length / 3)) - 1].value;
    for (const entry of known) {
      if (entry.value >= threshold - 1e-9 || entry.value >= cut - 1e-9) flags[entry.index] = true;
    }
    return flags;
  }

  // The loudness of one block: the mean RMS of its span against the song's own
  // p90. The p90 sorts every frame, so it is computed once for the whole
  // detection and handed to every range. No analysis (or no frames) -> null.
  function energiesOf(sections, analysis) {
    const driver = audioDriver || (typeof SA !== 'undefined' ? SA.audioDriver : null);
    const ref = driver && typeof driver.energyRef === 'function' ? driver.energyRef(analysis) : null;
    const has = !!ref;
    for (const section of sections) {
      if (!has) break;
      const value = driver.rangeEnergy(analysis, section.start, section.end, ref);
      section.energy = value == null ? null : round(clamp01(value), ENERGY_DIGITS);
    }
    return sections;
  }

  // Without music, a repeated line is the only chorus signal there is: the words
  // that come back are the ones the song wants you to remember.
  function chorusFromLyrics(sections) {
    const counts = new Map();
    for (const section of sections) {
      for (const cue of section.cues) {
        const text = cue.text.replace(/\s+/g, ' ').trim();
        if (!text) continue;
        counts.set(text, (counts.get(text) || 0) + 1);
      }
    }
    return sections.map((section) => {
      if (section.cues.some((cue) => cue.meta && cue.meta.section === CHORUS_META)) return true;
      return section.cues.some((cue) => {
        const text = cue.text.replace(/\s+/g, ' ').trim();
        return !!text && (counts.get(text) || 0) > 1;
      });
    });
  }

  // cues -> [{ index, cueIds, start, end, energy, chorus }]
  function detect(cues, options) {
    const opts = options || {};
    const gapValue = Number(opts.gap);
    const gap = Number.isFinite(gapValue) ? Math.max(0, gapValue) : DEFAULT_GAP;
    const maxValue = Number(opts.maxCues);
    const maxCues = Math.max(1, Number.isFinite(maxValue) ? Math.round(maxValue) : DEFAULT_MAX_CUES);
    const ordered = inOrder(cues);
    if (!ordered.length) return [];
    const sections = [];
    for (const block of blocksOf(ordered, gap)) {
      for (const chunk of chunksOf(block.cues, maxCues)) {
        sections.push({
          index: sections.length,
          cueIds: chunk.map((cue) => cue.id),
          start: chunk[0].start,
          end: chunk[chunk.length - 1].end,
          energy: null,
          chorus: false,
          cues: chunk,
        });
      }
    }
    energiesOf(sections, opts.analysis || null);
    const measured = sections.some((section) => Number.isFinite(section.energy));
    const flags = measured ? chorusFromEnergy(sections) : chorusFromLyrics(sections);
    return sections.map((section, index) => {
      const { cues: _cues, ...rest } = section;
      return { ...rest, chorus: !!flags[index] };
    });
  }

  return { DEFAULT_GAP, DEFAULT_MAX_CUES, CHORUS_META, detect };
});
