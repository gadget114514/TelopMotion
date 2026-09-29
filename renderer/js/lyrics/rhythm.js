(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng'));
  else {
    root.SA = root.SA || {};
    root.SA.rhythm = factory(root.SA.rng);
  }
})(typeof self !== 'undefined' ? self : this, function (rng) {
  'use strict';

  // Phrase rhythm: instead of cutting every cue on the same bar grid, the plan
  // lays a short pattern library over the musical bars. Every pattern is worth
  // one 4/4 bar (hold2 is worth two). The axis weights decide which family is
  // likely: loud songs build and stutter, calm songs hold, weird songs lean
  // into syncopation, triplets and doubled / halved speeds.
  const PATTERNS = {
    even: [4],
    halves: [2, 2],
    push: [3, 1],
    pull: [1, 3],
    build: [1, 1, 2],
    fall: [2, 1, 1],
    synco: [1.5, 1.5, 1],
    hold2: [8],
    triplet: [4 / 3, 4 / 3, 4 / 3],
    stutter: [0.5, 0.5, 1, 2],
  };

  const MIN_FRAGMENT = 0.35; // seconds: shorter pieces merge into a neighbour
  const SAMPLE = 'rhythm-plan';

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0.5;
    return Math.max(0, Math.min(1, number));
  }

  function round(value, digits) {
    const factor = Math.pow(10, digits == null ? 3 : digits);
    return Math.round(value * factor) / factor;
  }

  function weightsFor(axes, charCount) {
    const energy = clamp01(axes.energy);
    const w = clamp01(axes.weird);
    const weights = {
      even: 1 + 2 * (1 - energy),
      halves: 1 + 1.5 * energy,
      push: 1 + 0.5 * w,
      pull: 1 + 0.5 * w,
      build: 1 + 2.2 * energy,
      fall: 1 + 0.8 * energy,
      synco: 0.8 + 2.2 * w,
      hold2: 0.8 + 1.8 * (1 - energy),
      triplet: 0.7 + 2 * w,
      stutter: 0.4 + 2.2 * (0.5 * energy + 0.5 * w),
    };
    // long lines want more cuts, short lines want to breathe
    if (charCount >= 24) {
      for (const name of ['push', 'pull', 'synco', 'triplet', 'stutter', 'build']) weights[name] += 1.2;
    } else if (charCount > 0 && charCount <= 8) {
      weights.even += 2;
      weights.hold2 += 2;
      weights.halves += 0.6;
    }
    return weights;
  }

  function pickPattern(random, weights, recent) {
    const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      let roll = random() * total;
      let chosen = entries[entries.length - 1][0];
      for (const [name, weight] of entries) {
        roll -= weight;
        if (roll <= 0) {
          chosen = name;
          break;
        }
      }
      // never three of the same in a row
      if (recent.length >= 2 && recent[recent.length - 1] === chosen && recent[recent.length - 2] === chosen) continue;
      return chosen;
    }
    return recent[recent.length - 1] === 'even' ? 'halves' : 'even';
  }

  // Cuts for one span: pattern after pattern from the span start, with a
  // cadence every eight bars (hold2 / even) and short pieces absorbed.
  function planSpan(options, span, random, trace, recent) {
    const bpm = Number(options.bpm) > 0 ? Number(options.bpm) : 120;
    const beat = 60 / bpm;
    const bar = beat * 4;
    const start = Math.max(0, Number(span.start) || 0);
    const end = Math.max(start + 0.05, Number(span.end) || start + 0.05);
    const budget = end - start;
    const axes = options.axes || {};
    const weights = weightsFor(axes, Number(span.charCount) || 0);
    const cuts = [];
    let cursor = 0;
    let barIndex = 0;
    let guard = 0;
    while (cursor < budget - 1e-6 && guard < 128) {
      guard += 1;
      let name = pickPattern(random, weights, recent);
      // every eight bars the song takes a breath
      if (barIndex > 0 && barIndex % 8 === 0) name = random() < 0.5 && barIndex + 2 <= 64 ? 'hold2' : 'even';
      let beats = PATTERNS[name].slice();
      // double / half speed pressure grows with the weird axis
      if (name !== 'hold2' && clamp01(axes.weird) > 0 && random() < 0.3 * clamp01(axes.weird)) {
        const speed = random() < 0.5 ? 0.5 : 2;
        beats = beats.map((value) => value * speed);
      }
      const patternSeconds = beats.reduce((sum, value) => sum + value, 0) * beat;
      if (patternSeconds > budget - cursor + beat * 0.5 && cuts.length) break; // the tail keeps the last pattern
      let at = cursor;
      for (const value of beats) {
        at += value * beat;
        const time = start + at;
        if (time > start + 1e-6 && time < end - 1e-6) cuts.push(round(time, 4));
      }
      recent.push(name);
      if (trace) trace.push({ id: span.id, pattern: name, from: round(start + cursor, 4), to: round(start + Math.min(budget, at), 4) });
      cursor += patternSeconds;
      barIndex += Math.max(1, Math.round(patternSeconds / bar));
    }
    // absorb fragments shorter than MIN_FRAGMENT into a neighbour
    let previous = start;
    const absorbed = [];
    for (const cut of cuts) {
      if (cut - previous < MIN_FRAGMENT) {
        // drop this cut: the fragment merges into the previous chunk
        continue;
      }
      absorbed.push(cut);
      previous = cut;
    }
    while (absorbed.length && end - absorbed[absorbed.length - 1] < MIN_FRAGMENT) absorbed.pop();
    return absorbed;
  }

  // spans: [{ start, end, id, charCount }] -> { [id]: [cut, ...] }
  function plan(options) {
    const opts = options || {};
    const seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : 1;
    const spans = Array.isArray(opts.spans) ? opts.spans : [];
    const result = {};
    const trace = Array.isArray(opts.trace) ? opts.trace : null;
    const recent = [];
    for (const span of spans) {
      if (!span || span.id == null) continue;
      const random = rng.rngFor(seed, SAMPLE, span.id);
      result[span.id] = planSpan(opts, span, random, trace, recent);
    }
    return result;
  }

  return { PATTERNS, MIN_FRAGMENT, plan };
});
