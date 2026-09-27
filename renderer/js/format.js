window.SA = window.SA || {};

SA.format = (() => {
  'use strict';

  const i18n = SA.i18n;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function fmtInt(n) {
    return new Intl.NumberFormat(i18n.locale()).format(Math.round(n || 0));
  }

  function fmtNum(n) {
    const value = n || 0;
    if (value >= 10000) {
      return new Intl.NumberFormat(i18n.locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(value);
    }
    return fmtInt(value);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat(i18n.locale(), { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(iso));
    } catch {
      return '';
    }
  }

  function fmtDuration(seconds) {
    if (!seconds) return '—';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  function fmtClock(seconds) {
    if (!seconds) return '';
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    return `${minutes}:${String(rest).padStart(2, '0')}`;
  }

  function detailText(badge) {
    const detail = badge.detail;
    if (!detail) return '';
    if (detail.type === 'song' && detail.song) {
      const statKey = detail.stat || 'plays';
      return `${detail.song.title} · ${fmtNum(detail.song[statKey] || 0)} ${i18n.t(`stats.${statKey}`)}`;
    }
    if (detail.type === 'count') return i18n.tPlural('achievements.songsCount', detail.n);
    if (detail.type === 'date') return fmtDate(detail.value);
    return '';
  }

  return { esc, fmtInt, fmtNum, fmtDate, fmtDuration, fmtClock, detailText };
})();
