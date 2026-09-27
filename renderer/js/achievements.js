window.SA = window.SA || {};

SA.achievements = (() => {
  'use strict';

  const DAY_MS = 86400000;

  function sumBy(list, pick) {
    let total = 0;
    for (const item of list) total += pick(item) || 0;
    return total;
  }

  function localHour(iso) {
    return new Date(iso).getHours();
  }

  function bestStreak(songs) {
    const days = [...new Set(songs.filter((song) => song.createdAt).map((song) => new Date(song.createdAt).toISOString().slice(0, 10)))].sort();
    let best = 0;
    let current = 0;
    let previous = null;
    for (const day of days) {
      const time = Date.parse(day);
      if (previous !== null && time - previous === DAY_MS) current += 1;
      else current = 1;
      if (current > best) best = current;
      previous = time;
    }
    return best;
  }

  function bestMonth(songs) {
    const counts = new Map();
    for (const song of songs) {
      if (!song.createdAt) continue;
      const key = new Date(song.createdAt).toISOString().slice(0, 7);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    let best = 0;
    for (const value of counts.values()) if (value > best) best = value;
    return best;
  }

  function aggregate(data) {
    const songs = (data && data.songs) || [];
    const profile = (data && data.profile) || {};
    const byPlays = [...songs].sort((a, b) => b.plays - a.plays);
    const byLikes = [...songs].sort((a, b) => b.likes - a.likes || b.plays - a.plays);
    const byComments = [...songs].sort((a, b) => b.comments - a.comments || b.plays - a.plays);

    const tags = new Set();
    for (const song of songs) for (const tag of song.tags || []) tags.add(tag.toLowerCase());
    const models = new Set(songs.map((song) => song.model).filter(Boolean));

    let hiddenGem = null;
    for (const song of songs) {
      if (song.plays < 50) continue;
      const ratio = song.likes / song.plays;
      if (ratio < 0.05) continue;
      if (!hiddenGem || ratio > hiddenGem.likes / hiddenGem.plays) hiddenGem = song;
    }

    return {
      songs,
      songCount: songs.length,
      totalPlays: sumBy(songs, (song) => song.plays),
      totalLikes: sumBy(songs, (song) => song.likes),
      totalComments: sumBy(songs, (song) => song.comments),
      totalDuration: sumBy(songs, (song) => song.duration),
      followers: profile.followers || 0,
      distinctTags: tags.size,
      distinctModels: models.size,
      contestCount: songs.filter((song) => song.isContest).length,
      marathon: bestMonth(songs),
      streak: bestStreak(songs),
      earlyBird: songs.some((song) => song.createdAt && localHour(song.createdAt) >= 5 && localHour(song.createdAt) < 8),
      nightOwl: songs.some((song) => song.createdAt && (localHour(song.createdAt) >= 23 || localHour(song.createdAt) < 5)),
      firstDate: songs.reduce((min, song) => (song.createdAt && (!min || song.createdAt < min) ? song.createdAt : min), null),
      topPlayed: byPlays[0] || null,
      topLiked: byLikes[0] || null,
      topCommented: byComments[0] || null,
      hiddenGem,
    };
  }

  const CATEGORIES = ['catalog', 'plays', 'likes', 'tiers', 'superlatives', 'time', 'diversity', 'community', 'gem'];

  const BADGES = [
    { id: 'catalog_first', tier: 'white', category: 'catalog', icon: 'music', target: 1, value: (a) => a.songCount },
    { id: 'catalog_10', tier: 'bronze', category: 'catalog', icon: 'music', target: 10, value: (a) => a.songCount },
    { id: 'catalog_50', tier: 'silver', category: 'catalog', icon: 'music', target: 50, value: (a) => a.songCount },
    { id: 'catalog_100', tier: 'gold', category: 'catalog', icon: 'music', target: 100, value: (a) => a.songCount },
    { id: 'catalog_500', tier: 'gold', category: 'catalog', icon: 'music', target: 500, value: (a) => a.songCount },

    { id: 'plays_1k', tier: 'white', category: 'plays', icon: 'play', target: 1000, value: (a) => a.totalPlays },
    { id: 'plays_10k', tier: 'bronze', category: 'plays', icon: 'play', target: 10000, value: (a) => a.totalPlays },
    { id: 'plays_100k', tier: 'silver', category: 'plays', icon: 'play', target: 100000, value: (a) => a.totalPlays },
    { id: 'plays_1m', tier: 'gold', category: 'plays', icon: 'play', target: 1000000, value: (a) => a.totalPlays },

    { id: 'likes_1', tier: 'white', category: 'likes', icon: 'heart', target: 1, value: (a) => a.totalLikes },
    { id: 'likes_100', tier: 'bronze', category: 'likes', icon: 'heart', target: 100, value: (a) => a.totalLikes },
    { id: 'likes_1k', tier: 'silver', category: 'likes', icon: 'heart', target: 1000, value: (a) => a.totalLikes },
    { id: 'likes_10k', tier: 'gold', category: 'likes', icon: 'heart', target: 10000, value: (a) => a.totalLikes },

    { id: 'tier_hit', tier: 'white', category: 'tiers', icon: 'award', kind: 'best', target: 1000, value: (a) => (a.topPlayed ? a.topPlayed.plays : 0), count: (a) => a.songs.filter((song) => song.plays >= 1000).length },
    { id: 'tier_chart', tier: 'bronze', category: 'tiers', icon: 'award', kind: 'best', target: 10000, value: (a) => (a.topPlayed ? a.topPlayed.plays : 0), count: (a) => a.songs.filter((song) => song.plays >= 10000).length },
    { id: 'tier_viral', tier: 'silver', category: 'tiers', icon: 'award', kind: 'best', target: 100000, value: (a) => (a.topPlayed ? a.topPlayed.plays : 0), count: (a) => a.songs.filter((song) => song.plays >= 100000).length },
    { id: 'tier_anthem', tier: 'gold', category: 'tiers', icon: 'award', kind: 'best', target: 1000000, value: (a) => (a.topPlayed ? a.topPlayed.plays : 0), count: (a) => a.songs.filter((song) => song.plays >= 1000000).length },

    { id: 'top_played', tier: 'white', category: 'superlatives', icon: 'star', kind: 'binary', value: (a) => (a.topPlayed ? 1 : 0), detail: (a) => (a.topPlayed ? { type: 'song', song: a.topPlayed, stat: 'plays' } : null) },
    { id: 'top_liked', tier: 'bronze', category: 'superlatives', icon: 'heart', kind: 'binary', value: (a) => (a.topLiked ? 1 : 0), detail: (a) => (a.topLiked ? { type: 'song', song: a.topLiked, stat: 'likes' } : null) },
    { id: 'top_commented', tier: 'silver', category: 'superlatives', icon: 'comment', kind: 'binary', value: (a) => (a.topCommented ? 1 : 0), detail: (a) => (a.topCommented ? { type: 'song', song: a.topCommented, stat: 'comments' } : null) },

    { id: 'time_anniversary', tier: 'silver', category: 'time', icon: 'clock', kind: 'binary', value: (a) => (a.firstDate && Date.now() - Date.parse(a.firstDate) >= 365 * DAY_MS ? 1 : 0), detail: (a) => (a.firstDate ? { type: 'date', value: a.firstDate } : null) },
    { id: 'time_marathon', tier: 'gold', category: 'time', icon: 'clock', target: 30, value: (a) => a.marathon },
    { id: 'time_streak', tier: 'bronze', category: 'time', icon: 'clock', target: 7, value: (a) => a.streak },
    { id: 'time_early', tier: 'white', category: 'time', icon: 'clock', kind: 'binary', value: (a) => (a.earlyBird ? 1 : 0) },
    { id: 'time_night', tier: 'white', category: 'time', icon: 'clock', kind: 'binary', value: (a) => (a.nightOwl ? 1 : 0) },

    { id: 'diversity_genre', tier: 'white', category: 'diversity', icon: 'shuffle', target: 8, value: (a) => a.distinctTags },
    { id: 'diversity_models', tier: 'bronze', category: 'diversity', icon: 'shuffle', target: 5, value: (a) => a.distinctModels },
    { id: 'diversity_contest', tier: 'silver', category: 'diversity', icon: 'shuffle', kind: 'binary', value: (a) => (a.contestCount > 0 ? 1 : 0), detail: (a) => (a.contestCount ? { type: 'count', n: a.contestCount } : null) },

    { id: 'social_100', tier: 'white', category: 'community', icon: 'users', target: 100, value: (a) => a.followers },
    { id: 'social_1k', tier: 'bronze', category: 'community', icon: 'users', target: 1000, value: (a) => a.followers },
    { id: 'social_10k', tier: 'gold', category: 'community', icon: 'users', target: 10000, value: (a) => a.followers },

    { id: 'gem_hidden', tier: 'gold', category: 'gem', icon: 'gem', kind: 'binary', value: (a) => (a.hiddenGem ? 1 : 0), detail: (a) => (a.hiddenGem ? { type: 'song', song: a.hiddenGem, stat: 'likes' } : null) },
  ];

  function evaluate(data) {
    const agg = aggregate(data);
    const badges = BADGES.map((def) => {
      const current = Math.max(0, Number(def.value(agg)) || 0);
      const target = def.target || 1;
      let detail = def.detail ? def.detail(agg) : null;
      if (!detail && def.count) {
        const n = def.count(agg);
        if (n > 0) detail = { type: 'count', n };
      }
      return {
        id: def.id,
        category: def.category,
        tier: def.tier || 'white',
        icon: def.icon,
        kind: def.kind || 'metric',
        current,
        target,
        unlocked: current >= target,
        progress: target > 0 ? Math.min(1, current / target) : 0,
        detail,
      };
    });
    const unlockedCount = badges.filter((badge) => badge.unlocked).length;
    return {
      agg,
      badges,
      unlockedCount,
      total: badges.length,
      completion: badges.length ? unlockedCount / badges.length : 0,
    };
  }

  return { aggregate, evaluate, categories: CATEGORIES };
})();
