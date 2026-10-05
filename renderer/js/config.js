window.SA = window.SA || {};

SA.config = {
  version: '1.0.20261006',
  // weird >= 0.5 emphasises preset key words (lyrics/keywords.js); false turns it off app-wide
  keywordEmphasis: true,
  songUrl: (id) => `https://suno.com/song/${encodeURIComponent(id)}`,
  profileUrl: (handle) => `https://suno.com/@${encodeURIComponent(handle)}`,
};
