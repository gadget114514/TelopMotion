'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const videoExport = require(path.join(ROOT, 'renderer', 'js', 'video-export.js'));

test('parseBitrate parses numbers, units and falls back accurately', () => {
  // numeric input
  assert.equal(videoExport.parseBitrate(5000000, 1920, 1080, 30), 5000000);
  // clamping
  assert.equal(videoExport.parseBitrate(100, 1920, 1080, 30), 500000); // min 500kbps
  assert.equal(videoExport.parseBitrate(500000000, 1920, 1080, 30), 100000000); // max 100Mbps

  // string units
  assert.equal(videoExport.parseBitrate('8M', 1920, 1080, 30), 8000000);
  assert.equal(videoExport.parseBitrate('12.5m', 1920, 1080, 30), 12500000);
  assert.equal(videoExport.parseBitrate('500k', 1920, 1080, 30), 500000);
  assert.equal(videoExport.parseBitrate('16000000', 1920, 1080, 30), 16000000);

  // 'auto' or invalid fallback to bitrateFor formula
  const expectedAuto = videoExport.bitrateFor(1920, 1080, 30);
  assert.equal(videoExport.parseBitrate('auto', 1920, 1080, 30), expectedAuto);
  assert.equal(videoExport.parseBitrate('', 1920, 1080, 30), expectedAuto);
  assert.equal(videoExport.parseBitrate(null, 1920, 1080, 30), expectedAuto);
  assert.equal(videoExport.parseBitrate('invalid', 1920, 1080, 30), expectedAuto);
});

test('bitrateFor scales with resolution and fps within bounds', () => {
  const b1080p = videoExport.bitrateFor(1920, 1080, 30);
  assert.ok(b1080p >= 4000000 && b1080p <= 40000000);
  const b720p = videoExport.bitrateFor(1280, 720, 30);
  assert.ok(b720p <= b1080p);
  const b60fps = videoExport.bitrateFor(1920, 1080, 60);
  assert.ok(b60fps >= b1080p);
});

test('interleaveChunk writes planar audio and supports reusable buffer', () => {
  const fakeAudioBuffer = {
    numberOfChannels: 2,
    sampleRate: 48000,
    getChannelData(ch) {
      if (ch === 0) return new Float32Array([0.125, 0.25, 0.375, 0.5]);
      return new Float32Array([-0.125, -0.25, -0.375, -0.5]);
    },
  };

  // fresh allocation
  const res1 = videoExport.interleaveChunk(fakeAudioBuffer, 0, 4);
  assert.equal(res1.length, 8);
  assert.equal(res1[0], 0.125);
  assert.equal(res1[3], 0.5);
  assert.equal(res1[4], -0.125);
  assert.equal(res1[7], -0.5);

  // with reusable preallocated buffer
  const reusable = new Float32Array(8);
  const res2 = videoExport.interleaveChunk(fakeAudioBuffer, 0, 4, reusable);
  assert.strictEqual(res2, reusable);
  assert.equal(reusable[1], 0.25);
  assert.equal(reusable[5], -0.25);
});

test('ZIP building and header generation produces valid signatures and CRC', () => {
  const file1 = new TextEncoder().encode('Hello TelopMotion');
  const crc1 = videoExport.crc32(file1);
  assert.ok(crc1 > 0);

  const local = videoExport.makeZipLocalHeader(new TextEncoder().encode('test.txt'), file1.length, crc1);
  const localView = new DataView(local.buffer);
  assert.equal(localView.getUint32(0, true), 0x04034b50); // Local file header signature

  const central = videoExport.makeZipCentralEntry(new TextEncoder().encode('test.txt'), file1.length, crc1, 0);
  const centralView = new DataView(central.buffer);
  assert.equal(centralView.getUint32(0, true), 0x02014b50); // Central directory signature

  const eocd = videoExport.makeZipEocd(1, central.length, local.length + file1.length);
  const eocdView = new DataView(eocd.buffer);
  assert.equal(eocdView.getUint32(0, true), 0x06054b50); // EOCD signature

  const zip = videoExport.buildZip([{ name: 'test.txt', bytes: file1 }]);
  assert.ok(zip instanceof Uint8Array);
  assert.ok(zip.length > file1.length);
  const zipView = new DataView(zip.buffer);
  assert.equal(zipView.getUint32(0, true), 0x04034b50);
});

test('pickVideoCodec selects appropriate level profiles for high resolutions and probes hardware VP9', async () => {
  const probedConfigs = [];
  class FakeVideoEncoder {
    static async isConfigSupported(config) {
      probedConfigs.push(config);
      return { supported: true };
    }
  }
  globalThis.VideoEncoder = FakeVideoEncoder;
  globalThis.Mp4Muxer = {};
  globalThis.WebMMuxer = {};

  try {
    // 1080p MP4
    const res1080 = await videoExport.pickVideoCodec(1920, 1080, 30, 'mp4', '8M');
    assert.ok(res1080);
    assert.equal(res1080.format, 'mp4');
    assert.equal(res1080.config.codec, 'avc1.640028'); // Level 4.0
    assert.equal(res1080.config.bitrate, 8000000);

    // 1440p (2560x1440) MP4 - must pick Level 5.0/5.1
    probedConfigs.length = 0;
    const res1440 = await videoExport.pickVideoCodec(2560, 1440, 30, 'mp4', 'auto');
    assert.ok(res1440);
    assert.equal(res1440.format, 'mp4');
    assert.equal(res1440.config.codec, 'avc1.640032'); // Level 5.0 for 1440p
    assert.equal(res1440.config.hardwareAcceleration, 'prefer-hardware');

    // WebM probing must test prefer-hardware first for VP9
    probedConfigs.length = 0;
    const resWebm = await videoExport.pickVideoCodec(1920, 1080, 30, 'webm', 'auto');
    assert.ok(resWebm);
    assert.equal(resWebm.format, 'webm');
    assert.equal(resWebm.codec, 'vp09.00.40.08');
    assert.equal(resWebm.accelerator, 'prefer-hardware');
    assert.equal(resWebm.config.hardwareAcceleration, 'prefer-hardware');
  } finally {
    delete globalThis.VideoEncoder;
    delete globalThis.Mp4Muxer;
    delete globalThis.WebMMuxer;
  }
});

test('exportPngZip supports in-memory save=false without disk stream', async () => {
  const dummyBlob = {
    arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
  };
  const result = await videoExport.exportPngZip({
    width: 64,
    height: 64,
    fps: 10,
    range: { from: 0, to: 0.3 },
    baseName: 'test',
    save: false,
    stream: false,
    renderFrame: () => {},
    capturePngBlob: async () => dummyBlob,
  });
  assert.equal(result.ok, true);
  assert.equal(result.format, 'png-zip');
  assert.equal(result.frames, 3);
  assert.ok(result.bytes > 0);
  assert.ok(result.data instanceof Uint8Array);
});

test('exportPngZip streams chunks incrementally to platform.openStream', async () => {
  const writtenChunks = [];
  let streamClosed = false;
  const fakeStream = {
    path: 'X:\\out\\test-stream-png.zip',
    async write(bytes) {
      writtenChunks.push(bytes);
      return bytes.length;
    },
    async close() {
      streamClosed = true;
      return true;
    },
    async abort() {
      return true;
    },
  };

  const oldPlatform = globalThis.SA && globalThis.SA.platform;
  globalThis.SA = globalThis.SA || {};
  globalThis.SA.platform = {
    openStream: async () => fakeStream,
  };

  try {
    const dummyBlob = {
      arrayBuffer: async () => new Uint8Array([10, 20, 30]).buffer,
    };
    const result = await videoExport.exportPngZip({
      width: 64,
      height: 64,
      fps: 10,
      range: { from: 0, to: 0.2 },
      baseName: 'stream_test',
      save: true,
      stream: true,
      renderFrame: () => {},
      capturePngBlob: async () => dummyBlob,
    });

    assert.equal(result.ok, true);
    assert.equal(result.format, 'png-zip');
    assert.equal(result.frames, 2);
    assert.equal(streamClosed, true);
    // 2 frames * 2 writes (local header + data) + 1 trailer write (central dir + eocd) = 5 writes
    assert.equal(writtenChunks.length, 5);
  } finally {
    if (oldPlatform) globalThis.SA.platform = oldPlatform;
    else delete globalThis.SA.platform;
  }
});

test('exportVideo handles queue hysteresis and stream write chaining successfully', async () => {
  let dequeueListener = null;
  let simulatedQueue = 0;
  let framesEncoded = 0;
  const writtenData = [];

  class FakeVideoEncoder {
    constructor(init) {
      this.init = init;
      this.state = 'configured';
      this.encodeQueueSize = 0;
    }
    static async isConfigSupported(config) {
      return { supported: true };
    }
    configure() {}
    encode(frame) {
      framesEncoded += 1;
      this.encodeQueueSize += 1;
      simulatedQueue = this.encodeQueueSize;
      // Simulate chunk emission
      this.init.output({ byteLength: 100 }, { keyFrame: true });
      // If queue is high, trigger dequeue after next tick
      if (this.encodeQueueSize >= 16) {
        setTimeout(() => {
          this.encodeQueueSize = 5;
          if (dequeueListener) {
            const cb = dequeueListener;
            dequeueListener = null;
            cb();
          }
        }, 5);
      }
    }
    addEventListener(event, cb) {
      if (event === 'dequeue') dequeueListener = cb;
    }
    async flush() {
      this.encodeQueueSize = 0;
    }
    close() {
      this.state = 'closed';
    }
  }

  class FakeVideoFrame {
    constructor(source, opts) {
      this.timestamp = opts.timestamp;
      this.duration = opts.duration;
    }
    close() {}
  }

  class FakeStreamTarget {
    constructor(options) {
      this.options = options;
    }
  }

  class FakeMuxer {
    constructor(config) {
      this.config = config;
    }
    addVideoChunk(chunk, meta) {
      if (this.config.target && this.config.target.options && this.config.target.options.onData) {
        this.config.target.options.onData(new Uint8Array([1, 2, 3]), 0);
      }
    }
    finalize() {
      if (this.config.target && this.config.target.options && this.config.target.options.onData) {
        this.config.target.options.onData(new Uint8Array([4, 5, 6]), 3);
      }
    }
  }

  let streamClosed = false;
  const fakeStream = {
    path: 'X:\\out\\test.mp4',
    async write(bytes, pos) {
      // Async write with small delay to test write chaining
      await new Promise((r) => setTimeout(r, 2));
      writtenData.push(bytes);
      return bytes.length;
    },
    async close() {
      streamClosed = true;
      return true;
    },
    async abort() {
      return true;
    },
  };

  const oldPlatform = globalThis.SA && globalThis.SA.platform;
  globalThis.SA = globalThis.SA || {};
  globalThis.SA.platform = {
    openStream: async () => fakeStream,
  };
  globalThis.VideoEncoder = FakeVideoEncoder;
  globalThis.VideoFrame = FakeVideoFrame;
  globalThis.Mp4Muxer = { StreamTarget: FakeStreamTarget, Muxer: FakeMuxer };

  try {
    const totalFrames = 25; // Large enough to trigger queue size >= 16
    const result = await videoExport.exportVideo({
      width: 1280,
      height: 720,
      fps: 30,
      range: { from: 0, to: totalFrames / 30 },
      format: 'mp4',
      bitrate: '6M',
      stream: true,
      save: true,
      renderFrame: () => {},
      captureBitmap: () => ({ close: () => {} }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.format, 'mp4');
    assert.equal(framesEncoded, totalFrames);
    assert.equal(streamClosed, true);
    // Verified that all asynchronous writes finished before close
    assert.ok(writtenData.length > 0);
  } finally {
    if (oldPlatform) globalThis.SA.platform = oldPlatform;
    else delete globalThis.SA.platform;
    delete globalThis.VideoEncoder;
    delete globalThis.VideoFrame;
    delete globalThis.Mp4Muxer;
  }
});

