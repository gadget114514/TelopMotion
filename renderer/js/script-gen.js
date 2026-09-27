(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.scriptGen = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TIER_RANK = { white: 0, bronze: 1, silver: 2, gold: 3 };
  const CATEGORY_ORDER = ['catalog', 'plays', 'likes', 'tiers', 'superlatives', 'time', 'diversity', 'community', 'gem'];

  const DEFAULT_OPTIONS = {
    intro: true,
    reveal: { enabled: true, which: 'unlocked', order: 'grid' },
    stats: { enabled: true, items: ['songs', 'plays', 'likes', 'comments', 'runtime', 'followers'] },
    topSongs: { enabled: true, n: 3, by: ['plays', 'likes'] },
    completion: true,
    outro: true,
    timing: { perCue: 2.8, gap: 0.3, introLen: 3.5, outroLen: 3 },
    fitToAudio: false,
    audioDuration: null,
  };

  function mergeOptions(options) {
    const source = options || {};
    return {
      ...DEFAULT_OPTIONS,
      ...source,
      reveal: { ...DEFAULT_OPTIONS.reveal, ...(source.reveal || {}) },
      stats: { ...DEFAULT_OPTIONS.stats, ...(source.stats || {}) },
      topSongs: { ...DEFAULT_OPTIONS.topSongs, ...(source.topSongs || {}) },
      timing: { ...DEFAULT_OPTIONS.timing, ...(source.timing || {}) },
    };
  }

  function newId() {
    return `c_${Math.random().toString(16).slice(2, 10)}`;
  }

  function round3(value) {
    return Math.round(value * 1000) / 1000;
  }

  function badgeDetail(badge, format) {
    if (badge.detail) return format && format.detailText ? format.detailText(badge) : '';
    if (badge.kind === 'metric' || badge.kind === 'best') {
      return `${format.fmtNum(badge.current)} / ${format.fmtNum(badge.target)}`;
    }
    return '';
  }

  function orderBadges(badges, order) {
    const list = [...badges];
    if (order === 'tier') {
      return list.sort((a, b) => (TIER_RANK[a.tier] || 0) - (TIER_RANK[b.tier] || 0));
    }
    if (order === 'category') {
      return list.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
    }
    if (order === 'date') {
      const time = (badge) => {
        if (badge.detail && badge.detail.type === 'date' && badge.detail.value) return Date.parse(badge.detail.value);
        return Number.POSITIVE_INFINITY;
      };
      return list.sort((a, b) => time(a) - time(b));
    }
    return list;
  }

  function statValue(item, agg, format) {
    if (item === 'songs') return format.fmtInt(agg.songCount);
    if (item === 'plays') return format.fmtNum(agg.totalPlays);
    if (item === 'likes') return format.fmtNum(agg.totalLikes);
    if (item === 'comments') return format.fmtNum(agg.totalComments);
    if (item === 'runtime') return format.fmtDuration(agg.totalDuration);
    if (item === 'followers') return format.fmtNum(agg.followers);
    return '';
  }

  function build(evaluation, dataset, options, t, format) {
    const opts = mergeOptions(options);
    const translate = typeof t === 'function' ? t : (key) => key;
    const cues = [];
    const gap = opts.timing.gap;
    let cursor = 0;

    function push(text, duration, meta) {
      const cue = { id: newId(), start: round3(cursor), end: round3(cursor + duration), text, meta };
      cues.push(cue);
      cursor = cue.end + gap;
      return cue;
    }

    const profile = (dataset && dataset.profile) || {};
    const agg = evaluation.agg;

    if (opts.intro) {
      const name = profile.displayName || profile.handle || '';
      const handle = profile.handle ? `@${profile.handle}` : '';
      push(`${name}\n${handle}`.trim(), opts.timing.introLen, { kind: 'intro' });
    }

    if (opts.reveal.enabled) {
      const badges = evaluation.badges.filter((badge) => opts.reveal.which === 'all' || badge.unlocked);
      for (const badge of orderBadges(badges, opts.reveal.order)) {
        const name = translate(`badges.${badge.id}.name`);
        let detail = badgeDetail(badge, format);
        if (!badge.unlocked) {
          const locked = translate('studio.script.locked');
          detail = detail ? `${detail} · ${locked}` : locked;
        }
        push(detail ? `${name}\n${detail}` : name, opts.timing.perCue, {
          kind: 'badge',
          badgeId: badge.id,
          category: badge.category,
          tier: badge.tier,
        });
      }
    }

    if (opts.stats.enabled) {
      for (const item of opts.stats.items) {
        const value = statValue(item, agg, format);
        if (!value) continue;
        push(translate(`studio.script.stat.${item}`, { value }), opts.timing.perCue, { kind: 'stat', stat: item });
      }
    }

    if (opts.topSongs.enabled) {
      const songs = (dataset && dataset.songs) || agg.songs || [];
      for (const metric of opts.topSongs.by) {
        const sorted = [...songs].sort((a, b) => (b[metric] || 0) - (a[metric] || 0));
        sorted.slice(0, Math.max(0, opts.topSongs.n)).forEach((song, index) => {
          push(
            translate('studio.script.topSong', {
              rank: index + 1,
              title: song.title,
              value: format.fmtNum(song[metric]),
              statLabel: translate(`stats.${metric}`),
            }),
            opts.timing.perCue,
            { kind: 'song', songId: song.id, stat: metric }
          );
        });
      }
    }

    if (opts.completion) {
      const percent = Math.round((evaluation.completion || 0) * 100);
      push(translate('studio.script.completion', { unlocked: evaluation.unlockedCount, total: evaluation.total, percent }), opts.timing.perCue, {
        kind: 'completion',
      });
    }

    if (opts.outro) {
      push(translate('studio.script.outro'), opts.timing.outroLen, { kind: 'outro' });
    }

    if (opts.fitToAudio && opts.audioDuration) {
      return fitToDuration(cues, opts.audioDuration);
    }
    return cues;
  }

  function fitToDuration(cues, duration) {
    const list = cues || [];
    if (!list.length || !(duration > 0)) return list.map((cue) => ({ ...cue }));
    const natural = list.reduce((max, cue) => Math.max(max, cue.end), 0);
    if (!(natural > 0)) return list.map((cue) => ({ ...cue }));
    const scale = duration / natural;
    return list.map((cue) => ({ ...cue, start: round3(cue.start * scale), end: round3(cue.end * scale) }));
  }

  return { build, fitToDuration, defaults: () => JSON.parse(JSON.stringify(DEFAULT_OPTIONS)) };
});
