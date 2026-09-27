window.SA = window.SA || {};

SA.config = {
  version: '1.0.0',
  songUrl: (id) => `https://suno.com/song/${encodeURIComponent(id)}`,
  profileUrl: (handle) => `https://suno.com/@${encodeURIComponent(handle)}`,
};
