'use strict';

const API_BASE = 'https://studio-api.prod.suno.com';
const MAX_PAGES = 200;
const MAX_RETRIES = 4;
const PAGE_DELAY_MS = 350;
const HANDLE_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const CLIP_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

const REQUEST_HEADERS = {
  accept: 'application/json',
  'user-agent': 'TelopMotion/1.0',
  referer: 'https://suno.com/',
  origin: 'https://suno.com',
};

function codedError(code, message, status) {
  const error = new Error(message || code);
  error.code = code;
  if (status) error.status = status;
  return error;
}

function httpError(status) {
  if (status === 429) return codedError('rate-limit', 'Rate limited by Suno', status);
  if (status === 404) return codedError('not-found', 'Profile not found', status);
  return codedError(`http-${status}`, `Suno API error ${status}`, status);
}

function normalizeHandle(input) {
  if (typeof input !== 'string') return null;
  let value = input.trim();
  if (!value) return null;
  const url = value.match(/^(?:https?:\/\/)?(?:www\.)?suno\.com\/@?([^/?#\s]+)/i);
  if (url) value = url[1];
  value = value.replace(/^@+/, '').replace(/[/?#].*$/, '');
  return HANDLE_RE.test(value) ? value : null;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function profileUrl(handle, page) {
  return `${API_BASE}/api/profiles/${encodeURIComponent(handle)}?playlists_sort_by=created_at&clips_sort_by=created_at&page=${page}`;
}

async function request(url, fetchImpl) {
  let attempt = 0;
  for (;;) {
    let response;
    try {
      response = await fetchImpl(url, { headers: REQUEST_HEADERS });
    } catch (cause) {
      throw codedError('network', `Network error: ${cause && cause.message ? cause.message : 'request failed'}`);
    }
    if (response.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const wait = retryAfter > 0 ? retryAfter * 1000 : 1500 * 2 ** attempt;
      attempt += 1;
      await sleep(wait);
      continue;
    }
    if (!response.ok) throw httpError(response.status);
    return response.json();
  }
}

function normalizeTags(displayTags, rawTags) {
  let tags = [];
  if (Array.isArray(displayTags)) tags = displayTags;
  else if (typeof displayTags === 'string') tags = displayTags.split(',');
  else if (typeof rawTags === 'string') tags = rawTags.split(',');
  const cleaned = tags
    .map((tag) => String(tag).trim())
    .filter((tag) => tag && tag.length <= 40);
  return [...new Set(cleaned)].slice(0, 6);
}

function normalizeClip(clip) {
  if (!clip || clip.status !== 'complete') return null;
  if (clip.is_trashed || clip.is_public === false) return null;
  const meta = clip.metadata || {};
  const media = Array.isArray(clip.media_urls) ? clip.media_urls.find((m) => m && m.url) : null;
  const duration = Number(meta.duration);
  return {
    id: String(clip.id || ''),
    title: clip.title || 'Untitled',
    image: clip.image_url || clip.image_large_url || null,
    imageLarge: clip.image_large_url || clip.image_url || null,
    audio: media ? media.url : null,
    video: clip.video_url || null,
    createdAt: clip.created_at || null,
    plays: toNumber(clip.play_count),
    likes: toNumber(clip.upvote_count),
    comments: toNumber(clip.comment_count),
    duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
    tags: normalizeTags(clip.display_tags, meta.tags),
    model: clip.major_model_version || clip.model_name || '',
    caption: clip.caption || '',
    isContest: !!clip.is_contest_clip,
    isPinned: !!clip.is_pinned,
  };
}

function normalizeProfile(raw, fallbackHandle) {
  const source = raw || {};
  const stats = source.stats || {};
  const handle = source.handle || fallbackHandle;
  return {
    handle,
    displayName: source.display_name || source.displayName || handle,
    description: source.profile_description || '',
    avatar: source.avatar_image_url || null,
    isVerified: !!source.is_verified,
    followers: toNumber(stats.followers_count),
    following: toNumber(stats.following_count),
    totalClips: toNumber(source.num_total_clips),
  };
}

async function fetchAll(handle, options) {
  const opts = options || {};
  const normalized = normalizeHandle(handle);
  if (!normalized) throw codedError('invalid-handle', 'Invalid handle');
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
  const maxPages = Number.isFinite(opts.maxPages) ? opts.maxPages : MAX_PAGES;
  const fetchImpl = opts.fetchImpl || fetch;

  const songs = [];
  const seen = new Set();
  let profile = null;
  let page = 1;

  while (page <= maxPages) {
    const data = await request(profileUrl(normalized, page), fetchImpl);
    if (!profile) {
      const identified = !!(data && (data.handle || data.user_id || (Array.isArray(data.clips) && data.clips.length)));
      if (!identified) throw codedError('not-found', 'Profile not found');
      profile = normalizeProfile(data, normalized);
    }
    const clips = data && Array.isArray(data.clips) ? data.clips : [];
    let added = 0;
    for (const clip of clips) {
      const song = normalizeClip(clip);
      if (song && song.id && !seen.has(song.id)) {
        seen.add(song.id);
        songs.push(song);
        added += 1;
      }
    }
    if (onProgress) {
      onProgress({ page, songs: songs.length, total: toNumber(data && data.num_total_clips) || null });
    }
    if (!clips.length || added === 0) break;
    page += 1;
    await sleep(PAGE_DELAY_MS);
  }

  if (!profile) throw codedError('not-found', 'Profile not found');
  if (!profile.totalClips) profile.totalClips = songs.length;

  return {
    profile,
    songs,
    fetchedAt: new Date().toISOString(),
    source: API_BASE,
  };
}

async function fetchClip(id, options) {
  const opts = options || {};
  const fetchImpl = opts.fetchImpl || fetch;
  const value = String(id || '');
  if (!CLIP_ID_RE.test(value)) throw codedError('invalid-id', 'Invalid clip id');
  const data = await request(`${API_BASE}/api/clip/${encodeURIComponent(value)}`, fetchImpl);
  const song = normalizeClip(data);
  if (!song) throw codedError('not-found', 'Clip not found');
  return song;
}

module.exports = {
  API_BASE,
  normalizeHandle,
  normalizeClip,
  normalizeProfile,
  fetchAll,
  fetchClip,
  profileUrl,
};
