(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../color'));
  else {
    root.SA = root.SA || {};
    root.SA.paletteRoles = factory(root.SA.color);
  }
})(typeof self !== 'undefined' ? self : this, function (color) {
  'use strict';

  // The 10 fixed palette slots. Every consumer reads its colour through a slot
  // name, never through a bare number, so which layer gets which colour (and
  // which colours must contrast) is defined in one place.
  //
  //   mid layer   0..3   planes / clip colours
  //   text layer  4..7   fill, gradient end, edge, text background
  //   figures     8..9   two contrasting figure colours
  const SLOT = {
    MID_A: 0,
    MID_B: 1,
    MID_C: 2,
    MID_D: 3,
    TEXT_FILL: 4,
    TEXT_FILL2: 5,
    TEXT_EDGE: 6,
    TEXT_BG: 7,
    FIG_A: 8,
    FIG_B: 9,
  };
  const MID_SLOTS = [SLOT.MID_A, SLOT.MID_B, SLOT.MID_C, SLOT.MID_D];
  const TEXT_SLOTS = [SLOT.TEXT_FILL, SLOT.TEXT_FILL2, SLOT.TEXT_EDGE, SLOT.TEXT_BG];
  const FIG_SLOTS = [SLOT.FIG_A, SLOT.FIG_B];
  const SIZE = 10;

  // --- the theme's palette set ------------------------------------------------
  // `style.palette` is #1; `style.paletteSet.extra` holds #2..#max. `max` is the
  // palette count at weird 1, `change` the chance the next beat moves to
  // another palette and `invert` the chance the beat's roles are inverted.
  // Every palette stores exactly SIZE colours, one per slot. There are no
  // derived colours: a short palette is invalid and reads as missing.
  const PALETTE_SET_DEFAULTS = Object.freeze({ max: 5, change: 0.5, invert: 0.2 });

  // The theme's palette set with its defaults; `extra` is returned unfiltered
  // so a stored paletteIndex keeps pointing at the same entry.
  function paletteSetOf(style) {
    const set = (style && style.paletteSet) || {};
    const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);
    return {
      max: Math.max(1, Math.min(8, Math.round(num(set.max, PALETTE_SET_DEFAULTS.max)))),
      change: clamp01(num(set.change, PALETTE_SET_DEFAULTS.change)),
      invert: clamp01(num(set.invert, PALETTE_SET_DEFAULTS.invert)),
      extra: Array.isArray(set.extra) ? set.extra : [],
    };
  }

  // Colours of palette #index (0 = style.palette); null when missing or not a
  // full 10-colour palette. A copy is returned so a caller can never mutate
  // the stored palette.
  function setColors(style, index) {
    const palette = style && style.palette;
    if (index == null || !Number.isFinite(Number(index))) return null;
    const k = Math.max(0, Math.floor(Number(index)));
    if (k === 0) return palette && Array.isArray(palette.colors) && palette.colors.length >= SIZE ? palette.colors.slice(0, SIZE) : null;
    const set = (style && style.paletteSet) || {};
    const entry = Array.isArray(set.extra) ? set.extra[k - 1] : null;
    if (!entry || !Array.isArray(entry.colors) || entry.colors.length < SIZE) return null;
    return entry.colors.slice(0, SIZE);
  }

  // The colour schemes the mid C/D planes are built from. `angles` rotate the
  // background hue: [C, D] are the plane pair, the rest document the family.
  const SCHEMES = {
    tonal: [0, 0],
    analogous: [30, -30],
    complementary: [180, 150],
    triad: [120, 240],
    splitComplementary: [150, 210],
    neutralAccent: [0, 180],
  };
  const SCHEME_IDS = Object.keys(SCHEMES);

  // [slotA, slotB, kind]: slotB must stay apart from slotA by the ratio of
  // `kind` ('text' = text over background, 'backdrop' = mid plane behind text,
  // 'soft' = a light separation between neighbours).
  const CONTRAST = [
    [SLOT.MID_A, SLOT.TEXT_FILL, 'text'],
    [SLOT.MID_B, SLOT.TEXT_FILL, 'text'],
    [SLOT.MID_C, SLOT.TEXT_FILL, 'backdrop'],
    [SLOT.MID_D, SLOT.TEXT_FILL, 'backdrop'],
    [SLOT.MID_A, SLOT.MID_B, 'neighbour'],
    [SLOT.MID_C, SLOT.MID_D, 'neighbour'],
    [SLOT.TEXT_FILL, SLOT.TEXT_FILL2, 'soft'],
    [SLOT.TEXT_FILL, SLOT.TEXT_EDGE, 'soft'],
    [SLOT.TEXT_FILL, SLOT.TEXT_BG, 'text'],
    [SLOT.TEXT_EDGE, SLOT.TEXT_BG, 'soft'],
    [SLOT.FIG_A, SLOT.TEXT_FILL, 'backdrop'],
    [SLOT.FIG_B, SLOT.TEXT_FILL, 'backdrop'],
    [SLOT.FIG_A, SLOT.MID_A, 'neighbour'],
    [SLOT.FIG_B, SLOT.MID_A, 'neighbour'],
  ];

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(1, number));
  }

  function ratioFor(kind, weirdRaw) {
    const w = clamp01(weirdRaw);
    if (kind === 'text') return 4.5 + 2.5 * w;
    if (kind === 'backdrop') return 3 + 2.5 * w;
    // two planes of the same layer only need a readable step: a stronger
    // demand fights the text contrast when both planes must stay dark (or
    // light) under a saturated text colour
    if (kind === 'neighbour') return 1.15;
    return 1.5;
  }

  function contrast(a, b) {
    if (!a || !b) return Infinity;
    try {
      return color.contrastRatio(color.parse(a), color.parse(b));
    } catch {
      return Infinity;
    }
  }

  // --- nearest-palette snap (no computed colours) ---------------------------
  // Policy: basically never synthesise a new hex; adopt the palette entry
  // closest to the computed ideal. Distance is perceptual (Oklab); alpha is
  // ignored for the distance and the computed target's alpha is kept.
  const HEX_ANY = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

  function alphaOfHex(hex) {
    try {
      const parsed = color.parse(hex);
      return parsed.a == null ? 1 : parsed.a;
    } catch {
      return 1;
    }
  }

  function withAlphaHex(hex, alpha) {
    if (alpha == null || !(alpha < 1)) return hex;
    try {
      return color.toHex({ ...color.parse(hex), a: alpha });
    } catch {
      return hex;
    }
  }

  function oklabDistance(aHex, bHex) {
    try {
      const a = color.rgbToOklab(color.parse(aHex));
      const b = color.rgbToOklab(color.parse(bHex));
      const dL = a.L - b.L;
      const da = a.a - b.a;
      const db = a.b - b.b;
      return dL * dL + da * da + db * db;
    } catch {
      return Infinity;
    }
  }

  // Index of the palette entry closest to `targetHex`, or -1 when the pool
  // holds no hex string.
  function nearestIndex(targetHex, paletteColors, exclude) {
    const list = Array.isArray(paletteColors) ? paletteColors : [];
    let best = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < list.length; i += 1) {
      const hex = list[i];
      if (typeof hex !== 'string' || !HEX_ANY.test(hex)) continue;
      if (exclude && exclude.has(i)) continue;
      const distance = oklabDistance(targetHex, hex);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    return best;
  }

  // The palette entry closest to the computed `targetHex` (alpha preserved
  // from the target), or null when the pool is empty.
  function snapToPalette(targetHex, paletteColors, exclude) {
    const index = nearestIndex(targetHex, paletteColors, exclude);
    if (index < 0) return null;
    return withAlphaHex(paletteColors[index], alphaOfHex(targetHex));
  }

  // Closest palette entry to `targetHex` that clears `ratio` against
  // `fixedHex`, or null when no entry clears it.
  function nearestMeeting(targetHex, paletteColors, fixedHex, ratio, exclude) {
    const list = Array.isArray(paletteColors) ? paletteColors : [];
    let best = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < list.length; i += 1) {
      const hex = list[i];
      if (typeof hex !== 'string' || !HEX_ANY.test(hex)) continue;
      if (exclude && exclude.has(i)) continue;
      if (contrast(hex, fixedHex) < ratio - 1e-6) continue;
      const distance = oklabDistance(targetHex, hex);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    if (best < 0) return null;
    return withAlphaHex(list[best], alphaOfHex(targetHex));
  }

  function shift(hex, hueShift, satScale, valueDelta) {
    try {
      const hsv = color.rgbToHsv(color.parse(hex));
      const next = {
        h: hsv.h + hueShift,
        s: clamp01(hsv.s * (satScale == null ? 1 : satScale)),
        v: clamp01(hsv.v + (valueDelta || 0)),
        a: 1,
      };
      return color.toHex({ ...color.hsvToRgb(next), a: 1 });
    } catch {
      return hex;
    }
  }

  // The luminance counterpart of a text colour: a light text gets a dark
  // background and the other way round. Used only when generating a fresh
  // 10-colour palette; stored palettes are never derived at read time.
  function luminanceOpposite(hex, level) {
    try {
      const hsv = color.rgbToHsv(color.parse(hex));
      const dark = hsv.v <= 0.5;
      const v = level == null ? (dark ? 0.9 : 0.12) : level;
      return color.toHex({ ...color.hsvToRgb({ h: hsv.h, s: clamp01(hsv.s * 0.7), v, a: 1 }), a: 1 });
    } catch {
      return hex;
    }
  }

  // Old 6/7-colour palettes (bg, bg2, text, accent, stroke, accent2[, extra])
  // map onto the slots. The derived mid planes / background stay on the
  // background side so the text keeps its contrast.
  const LEGACY_INDEX = { 0: SLOT.MID_A, 1: SLOT.MID_B, 2: SLOT.TEXT_FILL, 3: SLOT.TEXT_FILL2, 4: SLOT.TEXT_EDGE, 5: SLOT.TEXT_FILL2, 6: SLOT.FIG_B };

  function upgradeColors(colors) {
    const list = Array.isArray(colors) ? colors.slice() : [];
    if (list.length >= SIZE) return list.slice(0, SIZE);
    const a = list[0] || '#101018';
    const b = list[1] || a;
    const edge = list[4] || a;
    const accent2 = list[5] || list[3] || b;
    const out = [
      a,
      b,
      deriveC(a, b),
      deriveD(b),
      list[2] || '#eef2ff',
      list[3] || '#ff8a3d',
      edge,
      luminanceOpposite(list[2] || '#eef2ff'),
      accent2,
      shift(accent2, 180, 0.9, 0),
    ];
    return out;
  }

  function deriveC(a, b) {
    return shift(a, 24, 0.9, 0.14);
  }

  function deriveD(b) {
    return shift(b, -20, 0.85, -0.08);
  }

  function upgradePalette(palette) {
    if (!palette || palette.roles === 2) return palette;
    return { ...palette, colors: upgradeColors(palette.colors), roles: 2 };
  }

  // A colour of a slot: the stored colour, or null when the palette is not a
  // full 10-colour palette. Short palettes are invalid and never derived.
  function get(colors, slot) {
    const list = Array.isArray(colors) ? colors : [];
    if (list.length < SIZE) return null;
    return list[slot] == null ? null : list[slot];
  }

  // --- beat colour schemes -----------------------------------------------------
  // A beat carries a 4-letter scheme id instead of a palette of its own. Each
  // letter says which source role the target role takes; targets run in the
  // B, M, T, D order (background, backdrop, text, decoration):
  //
  //   'BMTD' = the identity (never stored)
  //   'TMBD' = text <-> background
  //   'BTMD' = text <-> backdrop
  //
  // The colours themselves are stored per slot, so a theme
  // edit or a palette re-roll still reaches every beat. The hero text colour H
  // keeps its own slot (TEXT_FILL2) and is only moved when the contrast
  // contract demands it.
  const SCHEME_BASE = 'BMTD';
  const SCHEME_INVERT = 'TMBD';
  const SCHEME_ROLES = ['B', 'M', 'T', 'D'];
  const SCHEME_TARGETS = ['B', 'M', 'T', 'D'];

  // The four schemes swap these roles; every other role keeps the slot table.
  // [source B, source M, source T, source D]
  // Every palette is a full 10-colour palette, so the mapping is fixed.
  function roleSlots() {
    return {
      B: SLOT.MID_A,
      B2: SLOT.MID_B,
      M: SLOT.MID_C,
      M2: SLOT.MID_D,
      T: SLOT.TEXT_FILL,
      D: SLOT.TEXT_EDGE,
      H: SLOT.TEXT_FILL2,
    };
  }

  function permutations(chars) {
    if (chars.length <= 1) return [chars];
    const out = [];
    for (let i = 0; i < chars.length; i += 1) {
      const rest = chars.slice(0, i).concat(chars.slice(i + 1));
      for (const tail of permutations(rest)) out.push(chars[i] + tail);
    }
    return out;
  }

  // 24 ids in the deterministic generation order, the identity 'BMTD' first.
  const BEAT_SCHEME_IDS = Object.freeze(permutations(SCHEME_ROLES));

  // A secondary colour (bg2 / mid2) keeps its HSV distance from its main role:
  // the hue step, the saturation ratio and the lightness gap are measured on
  // the source pair and applied to the new main colour. This defines palette
  // slots, so the computed carry stays (consumers snap to the palette).
  function carry(mainFrom, secondaryFrom, mainTo) {
    if (mainFrom == null || mainTo == null) return secondaryFrom;
    if (secondaryFrom == null) return mainTo;
    try {
      const a = color.rgbToHsv(color.parse(mainFrom));
      const b = color.rgbToHsv(color.parse(secondaryFrom));
      let hue = b.h - a.h;
      if (hue > 180) hue -= 360;
      else if (hue < -180) hue += 360;
      const satScale = a.s > 0.02 ? b.s / a.s : 1;
      return shift(mainTo, hue, satScale, b.v - a.v);
    } catch {
      return secondaryFrom;
    }
  }

  // The repaired palette must hold the pairs the renderer relies on. `move` is
  // the role the repair is allowed to nudge; the text (T) is never moved.
  function schemePairs(weirdRaw) {
    return [
      { a: 'T', b: 'B', ratio: ratioFor('text', weirdRaw), move: 'B' },
      { a: 'T', b: 'M', ratio: ratioFor('backdrop', weirdRaw), move: 'M' },
      { a: 'H', b: 'B', ratio: 3, move: 'H' },
      { a: 'D', b: 'T', ratio: ratioFor('soft', weirdRaw), move: 'D' },
      { a: 'M', b: 'B', ratio: ratioFor('neighbour', weirdRaw), move: 'M' },
    ];
  }

  function applyScheme(colors, id, weirdRaw) {
    if (!Array.isArray(colors) || colors.length < SIZE) return null;
    if (typeof id !== 'string' || id.length !== 4) return null;
    const slots = roleSlots();
    for (const role of id.split('')) if (!SCHEME_ROLES.includes(role)) return null;
    // the role slots index the stored array directly
    const at = (index) => (index == null || index < 0 || index >= colors.length ? null : colors[index]);
    const next = colors.slice(0, SIZE);
    for (let i = 0; i < SCHEME_TARGETS.length; i += 1) {
      const target = SCHEME_TARGETS[i];
      const value = at(slots[id[i]]);
      if (value == null) return null;
      next[slots[target]] = value;
    }
    next[slots.B2] = carry(at(slots.B), at(slots.B2), next[slots.B]);
    next[slots.M2] = carry(at(slots.M), at(slots.M2), next[slots.M]);
    // TEXT_BG follows the text through the same HSV carry as the other second
    // roles, so no colour is ever synthesised from thin air.
    next[SLOT.TEXT_BG] = carry(at(slots.T), at(SLOT.TEXT_BG), next[slots.T]);
    // contrast contract: at most two repair rounds, then the pairs must hold.
    // A repair that moves a colour's lightness by more than 0.35 loses the
    // character of the original permutation, so the draw is rejected instead.
    // This defines palette slots, so the computed repair stays (consumers
    // snap to the palette instead of synthesising their own hex).
    const pairs = schemePairs(weirdRaw);
    const holds = () => pairs.every(({ a, b, ratio }) => contrast(next[slots[a]], next[slots[b]]) >= ratio - 1e-6);
    const before = new Map();
    const moved = new Set();
    const moveSlot = (role, fixedRole, target) => {
      const index = slots[role];
      if (!moved.has(index)) {
        try {
          before.set(index, color.rgbToHsv(color.parse(next[index])).v);
        } catch {
          before.set(index, null);
        }
        moved.add(index);
      }
      const fixed = next[slots[fixedRole]];
      let value = color.ensureContrast(next[index], fixed, target);
      if (contrast(value, fixed) < target - 1e-6) value = color.separateFrom(value, [fixed], target) || value;
      next[index] = value;
    };
    for (let round = 0; round < 2; round += 1) {
      for (const pair of pairs) {
        if (contrast(next[slots[pair.a]], next[slots[pair.b]]) >= pair.ratio - 1e-6) continue;
        moveSlot(pair.move, pair.move === pair.a ? pair.b : pair.a, pair.ratio);
      }
      if (holds()) break;
    }
    if (!holds()) return null;
    for (const index of moved) {
      const start = before.get(index);
      if (start == null) return null;
      try {
        if (Math.abs(color.rgbToHsv(color.parse(next[index])).v - start) > 0.35) return null;
      } catch {
        return null;
      }
    }
    return next;
  }

  // The B / M / T channels of two palettes; a scheme that only reorders nearly
  // identical colours is no scheme at all.
  function schemeDistance(base, next, slots) {
    let total = 0;
    for (const role of ['B', 'M', 'T']) {
      const a = color.parse(base[slots[role]]);
      const b = color.parse(next[slots[role]]);
      total += Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
    }
    return total;
  }

  // Every viable scheme of a palette: the 23 non-identity permutations that
  // pass the contrast contract, minus the visually identical results. The order
  // is the deterministic permutation order. A `range` below 0.5 restricts the
  // candidates to the three readable role swaps (text <-> background,
  // background <-> backdrop, both), so a calm profile never draws a wild
  // permutation; the parameter is optional and omitting it keeps the 23.
  const SCHEME_CALM = ['TMBD', 'MBTD', 'TBMD'];

  function schemes(colors, weirdRaw, range) {
    if (!Array.isArray(colors) || colors.length < SIZE) return [];
    const slots = roleSlots();
    const out = [];
    const seen = new Set();
    const calm = range != null && Number.isFinite(Number(range)) && Number(range) < 0.5;
    const ids = calm ? SCHEME_CALM : BEAT_SCHEME_IDS;
    for (const id of ids) {
      if (id === SCHEME_BASE) continue;
      const next = applyScheme(colors, id, weirdRaw);
      if (!next) continue;
      if (schemeDistance(colors, next, slots) < 0.15) continue;
      const key = next.join('|').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id, colors: next });
    }
    return out;
  }

  function slotOf(colors, slot) {
    return get(colors, slot);
  }

  // Every stored palette already carries slot indices, so references pass
  // through unchanged. Old projects are migrated to slots on load.
  function remapRefs(value) {
    return value;
  }

  // True when every TEXT slot of `candidate` clears the contrast contract
  // against every MID slot of `base` — the cue-level palette switch uses this
  // so a beat palette never drops below the readability floor.
  function compatible(base, candidate, weirdRaw) {
    const a = Array.isArray(base) ? base : [];
    const b = Array.isArray(candidate) ? candidate : [];
    if (!a.length || !b.length) return false;
    for (const [left, right, kind] of CONTRAST) {
      const leftIsText = TEXT_SLOTS.includes(left);
      const rightIsText = TEXT_SLOTS.includes(right);
      if (!leftIsText && !rightIsText) continue;
      const leftIsMid = MID_SLOTS.includes(left);
      const rightIsMid = MID_SLOTS.includes(right);
      if (!leftIsMid && !rightIsMid) continue;
      const text = leftIsText ? get(b, left) : get(b, right);
      const mid = leftIsMid ? get(a, left) : get(a, right);
      if (contrast(text, mid) < ratioFor(kind, weirdRaw) - 1e-6) return false;
    }
    return true;
  }

  // Moves the non-text members of the failing pairs until the contract holds.
  // `repairContrast(colors, weirdRaw)` (moods.repairContrast) is used for the
  // text-fill pair when provided; the rest only move the mid / figure colours.
  // The palette must already hold SIZE colours; short palettes are left alone.
  // This defines palette slots, so the computed repair stays (consumers snap
  // to the palette instead of synthesising their own hex).
  function repairPalette(colors, weirdRaw, repairContrast) {
    const list = Array.isArray(colors) ? colors : [];
    if (list.length < SIZE) return list;
    if (typeof repairContrast === 'function') repairContrast(list, ratioFor('text', weirdRaw));
    const move = (index, fixed, target) => {
      let next = color.ensureContrast(list[index], fixed, target);
      if (contrast(next, fixed) < target - 1e-6) next = color.separateFrom(next, [fixed], target) || next;
      list[index] = next;
    };
    // four passes: the background / figure side moves first, then the mid
    // pair, and the text fill itself as the last resort (a mid-grey text
    // cannot clear ratio 7 against any background)
    for (let pass = 0; pass < 4; pass += 1) {
      let moved = false;
      for (const [left, right, kind] of CONTRAST) {
        const target = ratioFor(kind, weirdRaw);
        if (contrast(list[left], list[right]) >= target - 1e-6) continue;
        if (pass < 2) {
          let moving = left;
          if (right !== SLOT.TEXT_FILL) {
            moving = right;
            if (MID_SLOTS.includes(right) && FIG_SLOTS.includes(left)) moving = left;
          }
          if (moving === SLOT.TEXT_FILL) continue;
          move(moving, list[moving === left ? right : left], target);
        } else if (pass === 2) {
          const moving = right === SLOT.TEXT_FILL ? left : right;
          if (moving === SLOT.TEXT_FILL) continue;
          move(moving, list[moving === left ? right : left], target);
        } else {
          const moving = left === SLOT.TEXT_FILL ? left : right === SLOT.TEXT_FILL ? right : right;
          move(moving, list[moving === left ? right : left], target);
        }
        moved = true;
      }
      if (!moved) break;
    }
    return list;
  }

  // --- colour-only re-roll ---------------------------------------------------
  // Effects keep literal hex colours in their params (edge colours, fill tints,
  // clip colours...), so swapping the palette alone would leave them behind.
  // Each hex is tied to its nearest colour of the old palette and moved onto
  // the same role of the new one: it takes the new hue and keeps its relative
  // saturation and lightness (a darker shadow of the accent stays a darker
  // shadow of the new accent). Alpha is preserved.
  const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

  // HSV distance: a saturated colour matches on hue first (a dark red is a
  // shade of the red accent, not of the near-black background)
  function hsvDistance(a, b) {
    const hue = Math.abs(a.h - b.h) % 360;
    const hueDiff = (Math.min(hue, 360 - hue) / 180) * Math.min(a.s, b.s);
    return (a.v - b.v) ** 2 + (a.s - b.s) ** 2 + 2 * hueDiff ** 2;
  }

  function remapColor(hex, from, to) {
    const rgba = color.parse(hex);
    const own = color.rgbToHsv(rgba);
    const count = Math.min(from.length, to.length);
    let best = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < count; i += 1) {
      const distance = hsvDistance(own, color.rgbToHsv(color.parse(from[i])));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    if (best < 0) return hex;
    // an untouched role leaves its colours alone (editing one swatch must not
    // move the colours tied to the others)
    if (String(from[best]).toLowerCase() === String(to[best]).toLowerCase()) return hex;
    const alpha = rgba.a == null ? 1 : rgba.a;
    const target = color.parse(to[best]);
    if (bestDistance < 1e-6) return color.toHex({ ...target, a: alpha });
    const ref = color.rgbToHsv(color.parse(from[best]));
    const next = color.rgbToHsv(target);
    // a colour takes the hue of its new role (so off-palette colours from the
    // drawn looks join the palette too); a grey carries no hue and keeps its own
    const hue = own.s > 0.08 && next.s > 0.08 ? next.h : own.h;
    const rgb = color.hsvToRgb({
      h: hue,
      s: clamp01(ref.s > 0.05 ? next.s * (own.s / ref.s) : own.s),
      v: clamp01(ref.v > 0.05 ? next.v * (own.v / ref.v) : own.v + (next.v - ref.v)),
    });
    const ideal = color.toHex({ ...rgb, a: alpha });
    // no computed colours: adopt the palette entry closest to the ideal.
    const snapped = snapToPalette(ideal, to);
    return snapped || ideal;
  }

  // returns a copy of `value` with every hex colour moved from one palette to
  // another; anything that is not a hex string is copied unchanged
  function recolor(value, fromColors, toColors) {
    const from = (Array.isArray(fromColors) ? fromColors : []).filter((hex) => typeof hex === 'string' && HEX.test(hex));
    const to = Array.isArray(toColors) ? toColors : [];
    if (!from.length || !to.length) return value == null ? value : JSON.parse(JSON.stringify(value));
    const cache = new Map();
    const walk = (node) => {
      if (typeof node === 'string') {
        if (!HEX.test(node)) return node;
        const key = node.toLowerCase();
        if (!cache.has(key)) cache.set(key, remapColor(node, from, to));
        return cache.get(key);
      }
      if (Array.isArray(node)) return node.map(walk);
      if (node && typeof node === 'object') {
        const out = {};
        for (const [key, entry] of Object.entries(node)) out[key] = walk(entry);
        return out;
      }
      return node;
    };
    return walk(value);
  }

  return {
    SLOT,
    MID_SLOTS,
    TEXT_SLOTS,
    FIG_SLOTS,
    SIZE,
    PALETTE_SET_DEFAULTS,
    paletteSetOf,
    setColors,
    SCHEMES,
    SCHEME_IDS,
    CONTRAST,
    ratioFor,
    contrast,
    get,
    slotOf,
    remapRefs,
    compatible,
    repairPalette,
    luminanceOpposite,
    shift,
    SCHEME_BASE,
    SCHEME_INVERT,
    SCHEME_ROLES,
    BEAT_SCHEME_IDS,
    roleSlots,
    carry,
    applyScheme,
    schemes,
    HEX,
    hsvDistance,
    remapColor,
    recolor,
    nearestIndex,
    snapToPalette,
    nearestMeeting,
    oklabDistance,
    upgradeColors,
    upgradePalette,
  };
});
