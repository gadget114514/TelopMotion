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
    [SLOT.MID_A, SLOT.MID_B, 'soft'],
    [SLOT.MID_C, SLOT.MID_D, 'soft'],
    [SLOT.TEXT_FILL, SLOT.TEXT_FILL2, 'soft'],
    [SLOT.TEXT_FILL, SLOT.TEXT_EDGE, 'soft'],
    [SLOT.TEXT_FILL, SLOT.TEXT_BG, 'text'],
    [SLOT.TEXT_EDGE, SLOT.TEXT_BG, 'soft'],
    [SLOT.FIG_A, SLOT.TEXT_FILL, 'backdrop'],
    [SLOT.FIG_B, SLOT.TEXT_FILL, 'backdrop'],
    [SLOT.FIG_A, SLOT.MID_A, 'soft'],
    [SLOT.FIG_B, SLOT.MID_A, 'soft'],
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
  // background and the other way round.
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

  // A colour of a slot: the stored colour, or a derived one for a short
  // legacy palette. A palette shorter than SIZE is upgraded first, so a
  // legacy index 4 (the old stroke) is never mistaken for TEXT_FILL.
  function get(colors, slot) {
    const list = Array.isArray(colors) ? colors : [];
    if (list.length >= SIZE) return list[slot] == null ? null : list[slot];
    const upgraded = upgradeColors(list);
    return upgraded[slot] == null ? null : upgraded[slot];
  }

  function slotOf(colors, slot) {
    return get(colors, slot);
  }

  // Rewrites the legacy palette references of a style tree (palette refs and
  // gradient stops only). Idempotent when the indices are already slots.
  function remapRefs(value) {
    const walk = (node) => {
      if (Array.isArray(node)) return node.map(walk);
      if (!node || typeof node !== 'object') return node;
      // a gradient stop carries paletteIndex, a palette reference its index
      if (node.kind === 'palette' && node.index != null) {
        const mapped = LEGACY_INDEX[node.index];
        return { ...node, index: mapped == null ? node.index : mapped };
      }
      const out = {};
      for (const [key, entry] of Object.entries(node)) {
        if (key === 'paletteIndex' && entry != null && LEGACY_INDEX[entry] != null) out[key] = LEGACY_INDEX[entry];
        else out[key] = walk(entry);
      }
      return out;
    };
    return walk(value);
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
  function repairPalette(colors, weirdRaw, repairContrast) {
    const list = Array.isArray(colors) ? colors : [];
    if (list.length < SIZE) {
      const upgraded = upgradeColors(list);
      list.length = 0;
      list.push(...upgraded);
    }
    if (typeof repairContrast === 'function') {
      repairContrast(list, ratioFor('text', weirdRaw));
    }
    for (const [left, right, kind] of CONTRAST) {
      const target = ratioFor(kind, weirdRaw);
      const a = list[left];
      const b = list[right];
      if (contrast(a, b) >= target - 1e-6) continue;
      // never move TEXT_FILL: the text side stays, the background / figure
      // side moves. A figure always moves before a mid plane so the mid pairs
      // keep the order they were repaired in.
      let moving = left;
      if (right !== SLOT.TEXT_FILL) {
        moving = right;
        if (MID_SLOTS.includes(right) && FIG_SLOTS.includes(left)) moving = left;
      }
      if (moving === SLOT.TEXT_FILL) continue;
      const fixed = list[moving === left ? right : left];
      let next = color.ensureContrast(list[moving], fixed, target);
      if (contrast(next, fixed) < target - 1e-6) next = color.separateFrom(next, [fixed], target) || next;
      list[moving] = next;
    }
    return list;
  }

  return {
    SLOT,
    MID_SLOTS,
    TEXT_SLOTS,
    FIG_SLOTS,
    SIZE,
    SCHEMES,
    SCHEME_IDS,
    CONTRAST,
    LEGACY_INDEX,
    ratioFor,
    contrast,
    get,
    slotOf,
    upgradeColors,
    upgradePalette,
    remapRefs,
    compatible,
    repairPalette,
    luminanceOpposite,
    shift,
  };
});
