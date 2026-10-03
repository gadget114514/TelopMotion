'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
globalThis.window = globalThis;
globalThis.SA = globalThis.SA || {};

require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
globalThis.SA.duration = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'duration.js'));
globalThis.SA.project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
require(path.join(ROOT, 'renderer', 'js', 'studio', 'store.js'));
const store = globalThis.SA.store;
const preview = require(path.join(ROOT, 'renderer', 'js', 'studio', 'preview.js'));

function resetProject(options) {
  const doc = globalThis.SA.project.create({ lang: 'ja', aspect: '16:9' });
  if (options && options.disableCredits) {
    doc.credits.modes.end.enabled = false;
  }
  store.load(doc);
  return doc;
}

test('sceneDuration handles empty cues, audio duration, credits, and maxDuration', () => {
  // 1. Without end credits card, empty cues, no audio -> duration is 0
  resetProject({ disableCredits: true });
  preview.setAudioSource(null);
  assert.equal(preview.duration(), 0);

  // 2. Audio set to 45s, empty cues -> duration is 45s
  preview.setAudioDuration(45);
  assert.equal(preview.duration(), 45);

  // 3. Script with cues ending at 12s, audio 45s -> duration is 45s
  store.commands.generateScript([
    { id: 'c1', start: 0, end: 5, text: 'First' },
    { id: 'c2', start: 6, end: 12, text: 'Second' },
  ], {});
  assert.equal(preview.duration(), 45);

  // 4. Script with cues ending at 60s, audio 45s -> duration is 60s
  store.commands.generateScript([
    { id: 'c1', start: 0, end: 30, text: 'First' },
    { id: 'c2', start: 35, end: 60, text: 'Second' },
  ], {});
  assert.equal(preview.duration(), 60);

  // 5. Output maxDuration limits duration when set
  store.commands.setOutput({ maxDuration: 40 });
  assert.equal(preview.duration(), 40);

  // Reset maxDuration
  store.commands.setOutput({ maxDuration: null });
  assert.equal(preview.duration(), 60);

  // Clear audio duration
  preview.setAudioDuration(0);
  assert.equal(preview.duration(), 60);

  // 6. Default project with end card (5s) has at least 5s duration
  resetProject({ disableCredits: false });
  assert.equal(preview.duration(), 5);
  preview.setAudioDuration(120);
  assert.equal(preview.duration(), 120);
  preview.setAudioDuration(0);
});

test('preview audio lifecycle: setAudioSource, getAudioName, getAudioUrl, hasAudio', () => {
  resetProject({ disableCredits: true });
  assert.equal(preview.hasAudio(), false);
  assert.equal(preview.getAudioUrl(), null);
  assert.equal(preview.getAudioName(), null);

  // Set mock audio url
  preview.setAudioSource('blob:http://localhost/test-audio-id', 'song.mp3');
  assert.equal(preview.hasAudio(), true);
  assert.equal(preview.getAudioUrl(), 'blob:http://localhost/test-audio-id');
  assert.equal(preview.getAudioName(), 'song.mp3');

  // Clearing audio
  preview.setAudioSource(null);
  assert.equal(preview.hasAudio(), false);
  assert.equal(preview.getAudioUrl(), null);
  assert.equal(preview.getAudioName(), null);
  assert.equal(preview.getAudioDuration(), 0);
});

test('seeking clamps to sceneDuration range', () => {
  resetProject({ disableCredits: true });
  preview.setAudioDuration(100);

  preview.seek(50);
  assert.equal(store.state.playhead, 50);

  preview.seek(-10);
  assert.equal(store.state.playhead, 0);

  preview.seek(150);
  assert.equal(store.state.playhead, 100);

  preview.setAudioDuration(0);
});

test('store media audio commands: addMedia and removeMedia', () => {
  resetProject({ disableCredits: true });

  assert.equal(store.state.project.media.audio, null);

  store.commands.addMedia({
    id: 'audio',
    kind: 'audio',
    name: 'bgm.mp3',
    mime: 'audio/mpeg',
  });

  assert.ok(store.state.project.media.audio);
  assert.equal(store.state.project.media.audio.name, 'bgm.mp3');
  assert.equal(store.state.project.media.audio.kind, 'audio');

  store.commands.removeMedia('audio', 'audio');
  assert.equal(store.state.project.media.audio, null);
});

test('audio playback controls sync with mock Audio element', () => {
  resetProject({ disableCredits: true });

  // Create a mock Audio class
  let lastAudio = null;
  class MockAudio {
    constructor() {
      this.src = '';
      this.currentTime = 0;
      this.playbackRate = 1;
      this.duration = 60;
      this.paused = true;
      this.played = false;
      this._listeners = {};
      lastAudio = this;
    }
    addEventListener(event, fn) {
      this._listeners[event] = this._listeners[event] || [];
      this._listeners[event].push(fn);
    }
    removeEventListener(event, fn) {
      if (this._listeners[event]) {
        this._listeners[event] = this._listeners[event].filter((f) => f !== fn);
      }
    }
    play() {
      this.paused = false;
      this.played = true;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
  }

  globalThis.Audio = MockAudio;

  try {
    preview.setAudioSource('blob:test', 'track.wav');
    assert.ok(lastAudio);
    assert.equal(lastAudio.src, 'blob:test');
    assert.equal(preview.getAudioDuration(), 60);
    assert.equal(preview.duration(), 60);

    // Seek to 15s
    preview.seek(15);
    assert.equal(lastAudio.currentTime, 15);
    assert.equal(store.state.playhead, 15);

    // Speed setting
    preview.setSpeed(1.5);
    assert.equal(lastAudio.playbackRate, 1.5);

    // Start playback
    preview.play();
    assert.equal(preview.isPlaying(), true);
    assert.equal(store.state.playing, true);
    assert.equal(lastAudio.played, true);
    assert.equal(lastAudio.paused, false);

    // Pause
    preview.pause();
    assert.equal(preview.isPlaying(), false);
    assert.equal(store.state.playing, false);
    assert.equal(lastAudio.paused, true);

    // Clean up
    preview.setAudioSource(null);
  } finally {
    delete globalThis.Audio;
  }
});

test('sceneDuration accounts for video layers, media videos, and audio duration', () => {
  resetProject({ disableCredits: true });
  assert.equal(preview.duration(), 0);
  assert.equal(preview.hasVideo(), false);

  // 1. Add video layer
  store.commands.addLayer({
    id: 'l_vid',
    type: 'video',
    src: 'test.mp4',
    start: 0,
    end: 75,
  });
  assert.equal(preview.hasVideo(), true);
  assert.equal(preview.duration(), 75);

  // 2. Both video layer (75s) and audio (45s) -> duration is 75s
  preview.setAudioDuration(45);
  assert.equal(preview.hasAudio(), true);
  assert.equal(preview.duration(), 75);

  // 3. Audio (90s) exceeds video layer (75s) -> duration is 90s
  preview.setAudioDuration(90);
  assert.equal(preview.duration(), 90);

  // 4. Remove layer, add video to media.videos (120s)
  store.commands.removeLayer('l_vid');
  assert.equal(preview.duration(), 90);
  assert.equal(preview.hasVideo(), false);

  store.commands.addMedia({
    id: 'vid1',
    kind: 'videos',
    name: 'bg.mp4',
    duration: 120,
  });
  assert.equal(preview.hasVideo(), true);
  assert.equal(preview.duration(), 120);

  // Clean up
  preview.setAudioDuration(0);
  store.commands.removeMedia('videos', 'vid1');
  assert.equal(preview.hasVideo(), false);
  assert.equal(preview.hasAudio(), false);
});

test('store media videos commands: addMedia and removeMedia', () => {
  resetProject({ disableCredits: true });
  assert.deepEqual(store.state.project.media.videos, []);

  store.commands.addMedia({
    id: 'v_test',
    kind: 'videos',
    name: 'movie.mp4',
    mime: 'video/mp4',
    src: 'blob:video-1',
    duration: 55,
  });

  assert.equal(store.state.project.media.videos.length, 1);
  assert.equal(store.state.project.media.videos[0].id, 'v_test');
  assert.equal(store.state.project.media.videos[0].name, 'movie.mp4');

  store.commands.removeMedia('videos', 'v_test');
  assert.equal(store.state.project.media.videos.length, 0);
});

test('simultaneous audio and video playback synchronization and prepareLayers', async () => {
  resetProject({ disableCredits: true });

  class MockVideo {
    constructor() {
      this.src = '';
      this.currentTime = 0;
      this.playbackRate = 1;
      this.duration = 80;
      this.paused = true;
      this.muted = false;
      this.loop = true;
      this._listeners = {};
    }
    addEventListener(event, fn) {
      this._listeners[event] = this._listeners[event] || [];
      this._listeners[event].push(fn);
    }
    removeEventListener(event, fn) {
      if (this._listeners[event]) {
        this._listeners[event] = this._listeners[event].filter((f) => f !== fn);
      }
    }
    load() {}
    play() {
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
  }

  let createdVideo = null;
  globalThis.document = {
    createElement(tag) {
      if (tag === 'video') {
        createdVideo = new MockVideo();
        return createdVideo;
      }
      return {};
    },
  };

  try {
    const glLayers = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'layers.js'));
    const pass = glLayers.create(null);

    const layers = [
      {
        id: 'l_bg_video',
        type: 'video',
        src: 'bg_loop.mp4',
        enabled: true,
        video: { speed: 1, offset: 0, play: true, loop: true },
      },
    ];

    // 1. Playback running with both audio and video: video should play, mute if audio is present, and match speed
    await pass.prepare(layers, 10, { playback: 'preview', playing: true, speed: 1.25, hasAudio: true });
    assert.ok(createdVideo);
    assert.equal(createdVideo.paused, false);
    assert.equal(createdVideo.muted, true, 'video muted because audio track exists');
    assert.equal(createdVideo.playbackRate, 1.25, 'video playbackRate matches preview speed');

    // 2. Playback running without separate audio track: video audio is unmuted
    await pass.prepare(layers, 10, { playback: 'preview', playing: true, speed: 1.0, hasAudio: false });
    assert.equal(createdVideo.muted, false, 'video unmuted when no separate audio');
    assert.equal(createdVideo.playbackRate, 1.0);

    // 3. Transport paused: video should pause and align currentTime
    await pass.prepare(layers, 25, { playback: 'preview', playing: false, speed: 1.0, hasAudio: false });
    assert.equal(createdVideo.paused, true);
    assert.equal(createdVideo.currentTime, 25);

    // 4. pass.pauseVideos() explicitly pauses all videos
    createdVideo.paused = false;
    pass.pauseVideos();
    assert.equal(createdVideo.paused, true);

    pass.dispose();
  } finally {
    delete globalThis.document;
  }
});

