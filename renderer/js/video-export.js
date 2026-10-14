const root = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
root.SA = root.SA || {};

root.SA.videoExport = (() => {
  'use strict';

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let value = i;
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      table[i] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeZipLocalHeader(nameBytes, dataLength, crc) {
    const local = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, dataLength, true);
    view.setUint32(22, dataLength, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    return local;
  }

  function makeZipCentralEntry(nameBytes, dataLength, crc, offset) {
    const central = new Uint8Array(46 + nameBytes.length);
    const view = new DataView(central.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint16(14, 0, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, dataLength, true);
    view.setUint32(24, dataLength, true);
    view.setUint16(28, nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    return central;
  }

  function makeZipEocd(entryCount, centralSize, centralOffset) {
    const eocd = new Uint8Array(22);
    const view = new DataView(eocd.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, entryCount, true);
    view.setUint16(10, entryCount, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, centralOffset, true);
    view.setUint16(20, 0, true);
    return eocd;
  }

  function buildZip(entries) {
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const entry of entries) {
      const name = new TextEncoder().encode(entry.name);
      const crc = crc32(entry.bytes);
      const local = makeZipLocalHeader(name, entry.bytes.length, crc);
      chunks.push(local, entry.bytes);
      const centralEntry = makeZipCentralEntry(name, entry.bytes.length, crc, offset);
      central.push(centralEntry);
      offset += local.length + entry.bytes.length;
    }
    const centralSize = central.reduce((sum, entry) => sum + entry.length, 0);
    const eocd = makeZipEocd(entries.length, centralSize, offset);
    const total = offset + centralSize + 22;
    const output = new Uint8Array(total);
    let cursor = 0;
    for (const chunk of chunks) {
      output.set(chunk, cursor);
      cursor += chunk.length;
    }
    for (const entry of central) {
      output.set(entry, cursor);
      cursor += entry.length;
    }
    output.set(eocd, cursor);
    return output;
  }

  function bitrateFor(width, height, fps) {
    const value = 0.12 * width * height * fps;
    return Math.round(Math.max(4e6, Math.min(4e7, value)));
  }

  function parseBitrate(value, width, height, fps) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.round(Math.max(500000, Math.min(100000000, value)));
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed || trimmed === 'auto') return bitrateFor(width, height, fps);
      const match = trimmed.match(/^([0-9]+(?:\.[0-9]+)?)\s*([kmg]?)(?:bps|b)?$/i);
      if (match) {
        const num = parseFloat(match[1]);
        const unit = (match[2] || '').toLowerCase();
        let mult = 1;
        if (unit === 'k') mult = 1e3;
        else if (unit === 'm') mult = 1e6;
        else if (unit === 'g') mult = 1e9;
        const parsed = Math.round(num * mult);
        return Math.max(500000, Math.min(100000000, parsed));
      }
    }
    return bitrateFor(width, height, fps);
  }

  function muxerAvailable(format) {
    if (format === 'webm') return typeof root.WebMMuxer === 'object';
    return typeof root.Mp4Muxer === 'object';
  }

  async function pickVideoCodec(width, height, fps, preferFormat, bitrateOverride) {
    if (typeof root.VideoEncoder !== 'function') return null;

    // Macroblocks calculation (16x16 pixels per macroblock)
    const mbTotal = Math.ceil(width / 16) * Math.ceil(height / 16);
    const mbPerSec = mbTotal * fps;

    // Level 4.0: max 8,192 MBs (up to 2048x1024@30 or 1080p@30)
    // Level 4.2: max 8,192 MBs (up to 1080p@60)
    // Level 5.0: max 22,080 MBs (up to 2560x1440@30)
    // Level 5.1: max 36,864 MBs (up to 4K@30 or 1440p@60)
    // Level 5.2: max 36,864 MBs (up to 4K@60)
    const mp4Codecs = [];
    if (mbTotal > 22080 || mbPerSec > 983040) {
      mp4Codecs.push('avc1.640034', 'avc1.640033', 'avc1.640032');
    } else if (mbTotal > 8192 || mbPerSec > 491520) {
      mp4Codecs.push(fps >= 60 ? 'avc1.640033' : 'avc1.640032', 'avc1.640034');
    } else {
      mp4Codecs.push(fps >= 60 ? 'avc1.64002A' : 'avc1.640028');
    }
    if (!mp4Codecs.includes('avc1.64002A')) mp4Codecs.push('avc1.64002A');
    if (!mp4Codecs.includes('avc1.640028')) mp4Codecs.push('avc1.640028');
    mp4Codecs.push('avc1.4D4028');

    const targetBitrate = parseBitrate(bitrateOverride, width, height, fps);
    const options = [];
    if (preferFormat !== 'webm') {
      for (const codec of mp4Codecs) {
        options.push({ format: 'mp4', codec, muxer: 'avc', accelerator: 'prefer-hardware' });
        options.push({ format: 'mp4', codec, muxer: 'avc', accelerator: 'no-preference' });
      }
    }
    if (preferFormat !== 'mp4') {
      options.push({ format: 'webm', codec: 'vp09.00.40.08', muxer: 'vp9', accelerator: 'prefer-hardware' });
      options.push({ format: 'webm', codec: 'vp09.00.40.08', muxer: 'vp9', accelerator: 'no-preference' });
      options.push({ format: 'webm', codec: 'vp8', muxer: 'vp8', accelerator: null });
    }
    for (const option of options) {
      if (!muxerAvailable(option.format)) continue;
      const config = {
        codec: option.codec,
        width,
        height,
        bitrate: targetBitrate,
        framerate: fps,
        latencyMode: 'quality',
      };
      if (option.accelerator) config.hardwareAcceleration = option.accelerator;
      if (option.format === 'mp4') config.avc = { format: 'avc' };
      try {
        const support = await Promise.race([
          root.VideoEncoder.isConfigSupported(config),
          new Promise((resolve) => setTimeout(() => resolve({ supported: false }), 1500)),
        ]);
        if (support && support.supported) return { ...option, config };
      } catch {
        /* try the next candidate */
      }
    }
    return null;
  }

  async function pickAudioCodec(format, sampleRate, channels) {
    if (typeof root.AudioEncoder !== 'function') return null;
    const candidates = format === 'webm' ? ['opus'] : ['mp4a.40.2', 'opus'];
    for (const codec of candidates) {
      try {
        const support = await root.AudioEncoder.isConfigSupported({ codec, sampleRate: sampleRate || 48000, numberOfChannels: channels || 2, bitrate: 192000 });
        if (support && support.supported) return codec;
      } catch {
        /* try the next candidate */
      }
    }
    return null;
  }

  async function decodeAudio(bytes) {
    const AudioCtx = root.AudioContext || root.webkitAudioContext;
    if (!AudioCtx) throw new Error('no-audio-context');
    const context = new AudioCtx({ sampleRate: 48000 });
    try {
      return await context.decodeAudioData(bytes.slice(0));
    } finally {
      if (context.close) context.close().catch(() => {});
    }
  }

  function once(target, event) {
    return new Promise((resolve) => {
      target.addEventListener(event, resolve, { once: true });
    });
  }

  function interleaveChunk(audioBuffer, startFrame, frameCount, dest) {
    const channels = audioBuffer.numberOfChannels;
    const data = dest && dest.length >= frameCount * channels ? dest : new Float32Array(frameCount * channels);
    for (let channel = 0; channel < channels; channel += 1) {
      const source = audioBuffer.getChannelData(channel);
      const channelOffset = channel * frameCount;
      const maxIdx = source.length - 1;
      for (let i = 0; i < frameCount; i += 1) {
        data[channelOffset + i] = source[Math.min(maxIdx, startFrame + i)] || 0;
      }
    }
    return data;
  }

  async function exportVideo(options) {
    const opts = options || {};
    const width = Math.max(16, Math.round(opts.width || 1920));
    const height = Math.max(16, Math.round(opts.height || 1080));
    const fps = opts.fps || 30;
    const range = opts.range || { from: 0, to: 1 };
    const total = Math.max(1, Math.round((range.to - range.from) * fps));
    const format = opts.format || 'auto';
    const transparent = !!opts.transparent;
    const onProgress = opts.onProgress || (() => {});
    const signal = opts.signal || { aborted: false };
    const baseName = (opts.name || 'telopmotion').replace(/\.[a-z0-9]+$/i, '');

    if (transparent) {
      return exportPngZip({ ...opts, width, height, fps, range, total, baseName, onProgress, signal });
    }
    if (typeof root.VideoEncoder !== 'function') {
      throw Object.assign(new Error('webcodecs-unavailable'), { code: 'webcodecs-unavailable' });
    }

    const codec = await pickVideoCodec(width, height, fps, format, opts.bitrate);
    if (!codec) throw Object.assign(new Error('no-video-codec'), { code: 'no-video-codec' });
    if (opts.debug) console.log(`vexport: codec ${codec.format} ${codec.codec}`);
    const audioSampleRate = opts.audioBuffer ? opts.audioBuffer.sampleRate : 48000;
    const audioChannels = opts.audioBuffer ? opts.audioBuffer.numberOfChannels : 2;
    const audioCodec = opts.audioBuffer ? await pickAudioCodec(codec.format, audioSampleRate, audioChannels) : null;

    let stream = null;
    let target = null;
    let writeChain = Promise.resolve();
    let streamError = null;
    const extension = codec.format === 'webm' ? '.webm' : '.mp4';
    if (opts.stream !== false && opts.save !== false && root.SA.platform && typeof root.SA.platform.openStream === 'function') {
      stream = await root.SA.platform.openStream({
        name: `${baseName}${extension}`,
        mime: codec.format === 'webm' ? 'video/webm' : 'video/mp4',
        extension,
      });
    }
    const MuxerLib = root[codec.format === 'webm' ? 'WebMMuxer' : 'Mp4Muxer'];
    if (!MuxerLib) throw Object.assign(new Error('muxer-unavailable'), { code: 'muxer-unavailable' });

    if (stream) {
      target = new MuxerLib.StreamTarget({
        onData: (data, position) => {
          writeChain = writeChain
            .then(() => stream.write(data, position))
            .catch((err) => {
              if (!streamError) streamError = err;
            });
        },
        chunked: true,
      });
    } else {
      target = new MuxerLib.ArrayBufferTarget();
    }

    const Muxer = MuxerLib.Muxer;
    const muxerConfig = {
      target,
      video: { codec: codec.muxer, width, height, frameRate: fps },
      fastStart: stream ? false : 'in-memory',
    };
    if (audioCodec) {
      muxerConfig.audio = { codec: audioCodec === 'opus' ? 'opus' : 'aac', numberOfChannels: audioChannels, sampleRate: audioSampleRate };
    }
    const muxer = new Muxer(muxerConfig);

    let encoderError = null;
    const videoEncoder = new root.VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (error) => {
        encoderError = error;
      },
    });
    videoEncoder.configure(codec.config);
    if (opts.debug) console.log('vexport: encoder configured');

    let audioEncoder = null;
    if (audioCodec) {
      audioEncoder = new root.AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (error) => {
          encoderError = error;
        },
      });
      audioEncoder.configure({ codec: audioCodec, sampleRate: audioSampleRate, numberOfChannels: audioChannels, bitrate: 192000 });
    }

    const started = performance.now();
    let lastYield = started;
    // per-stage wall time (ms), logged with opts.debug to find the slow stage
    const stageMs = { prepare: 0, render: 0, capture: 0, encodeWait: 0 };
    try {
      for (let i = 0; i < total; i += 1) {
        if (signal.aborted || streamError) break;
        const time = range.from + i / fps;
        let mark = performance.now();
        const lap = (key) => {
          const now = performance.now();
          stageMs[key] += now - mark;
          mark = now;
        };
        if (opts.prepareFrame) await opts.prepareFrame(time);
        lap('prepare');
        opts.renderFrame(time);
        lap('render');
        const source = typeof opts.captureBitmap === 'function'
          ? opts.captureBitmap()
          : (typeof opts.captureCanvas === 'function' ? opts.captureCanvas() : (typeof opts.captureFrame === 'function' ? opts.captureFrame() : null));
        const frame = new root.VideoFrame(source, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
        if (source && typeof source.close === 'function') source.close();
        lap('capture');
        videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
        frame.close();
        // Hysteresis queue management: throttle when queue hits high-water mark,
        // and drain down to low-water mark to allow pipelined batch execution
        if (videoEncoder.encodeQueueSize >= 16) {
          while (videoEncoder.encodeQueueSize > 6) {
            await once(videoEncoder, 'dequeue');
          }
        }
        lap('encodeWait');
        if (encoderError) throw encoderError;
        if (streamError) throw streamError;
        const nowMs = performance.now();
        if (nowMs - lastYield >= 50 || i === total - 1) {
          lastYield = nowMs;
          const elapsed = (nowMs - started) / 1000;
          const speed = elapsed > 0 ? (i + 1) / elapsed : 0;
          onProgress({ frame: i + 1, total, speed, eta: speed > 0 ? (total - i - 1) / speed : 0 });
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        if (opts.debug) console.log(`vexport: frame ${i + 1}/${total}`);
      }
      await videoEncoder.flush();
      const perFrame = Object.entries(stageMs).map(([key, ms]) => `${key} ${(ms / total).toFixed(1)}ms`).join(', ');
      const seconds = (performance.now() - started) / 1000;
      const stats = { sec: seconds.toFixed(1), fps: (total / Math.max(seconds, 1e-3)).toFixed(1) };
      for (const [key, ms] of Object.entries(stageMs)) stats[key] = (ms / total).toFixed(1);
      console.info(`vexport: ${total} frames in ${stats.sec}s; per frame: ${perFrame}`);
      videoEncoder.close();

      if (audioEncoder && opts.audioBuffer && !signal.aborted && !streamError) {
        const buffer = opts.audioBuffer;
        const chunkSize = 1024;
        const fromFrame = Math.round(range.from * buffer.sampleRate);
        const toFrame = Math.min(buffer.length, Math.round(range.to * buffer.sampleRate));
        const reusableBuffer = new Float32Array(chunkSize * buffer.numberOfChannels);
        for (let frame = fromFrame; frame < toFrame && !signal.aborted && !streamError; frame += chunkSize) {
          const count = Math.min(chunkSize, toFrame - frame);
          const data = count === chunkSize
            ? interleaveChunk(buffer, frame, count, reusableBuffer)
            : interleaveChunk(buffer, frame, count);
          const audioData = new root.AudioData({
            format: 'f32-planar',
            sampleRate: buffer.sampleRate,
            numberOfFrames: count,
            numberOfChannels: buffer.numberOfChannels,
            timestamp: Math.round((frame / buffer.sampleRate) * 1e6),
            data,
          });
          audioEncoder.encode(audioData);
          audioData.close();
          if (audioEncoder.encodeQueueSize >= 16) {
            while (audioEncoder.encodeQueueSize > 4) await once(audioEncoder, 'dequeue');
          }
        }
        await audioEncoder.flush();
        audioEncoder.close();
      }

      if (signal.aborted || streamError) {
        if (stream) await stream.abort().catch(() => {});
        if (streamError) throw streamError;
        return { ok: false, canceled: true };
      }
      muxer.finalize();
      await writeChain;
      if (streamError) throw streamError;

      if (stream) {
        await stream.close();
        return { ok: true, stats, format: codec.format, codec: codec.config.codec, audioCodec, filePath: stream.path, bytes: null };
      }
      const bytes = new Uint8Array(target.buffer);
      if (opts.save === false) {
        return { ok: true, stats, format: codec.format, codec: codec.config.codec, audioCodec, bytes: bytes.length, data: bytes };
      }
      const saved = await root.SA.platform.saveFile({ bytes, name: `${baseName}${extension}`, mime: codec.format === 'webm' ? 'video/webm' : 'video/mp4' });
      if (!saved || saved.canceled) return { ok: false, canceled: true };
      return { ok: true, stats, format: codec.format, codec: codec.config.codec, audioCodec, filePath: saved.filePath, bytes: bytes.length };
    } finally {
      try {
        if (videoEncoder.state !== 'closed') videoEncoder.close();
      } catch {
        /* ignore */
      }
      try {
        if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
      } catch {
        /* ignore */
      }
    }
  }

  async function exportPngZip(options) {
    const opts = options || {};
    const width = Math.max(16, Math.round(opts.width || 1920));
    const height = Math.max(16, Math.round(opts.height || 1080));
    const fps = opts.fps || 30;
    const range = opts.range || { from: 0, to: 1 };
    const total = opts.total || Math.max(1, Math.round((range.to - range.from) * fps));
    const baseName = (opts.baseName || opts.name || 'telopmotion').replace(/\.[a-z0-9]+$/i, '');
    const onProgress = opts.onProgress || (() => {});
    const signal = opts.signal || { aborted: false };
    let canvas = null;
    let ctx = null;
    if (typeof opts.capturePngBlob !== 'function') {
      canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : null;
      if (!canvas) throw Object.assign(new Error('no-offscreen'), { code: 'no-offscreen' });
      ctx = canvas.getContext('2d');
    }

    let stream = null;
    if (opts.stream !== false && opts.save !== false && root.SA.platform && typeof root.SA.platform.openStream === 'function') {
      stream = await root.SA.platform.openStream({
        name: `${baseName}-png.zip`,
        mime: 'application/zip',
        extension: '.zip',
      });
    }

    const entries = [];
    const centralEntries = [];
    let streamOffset = 0;
    let writeChain = Promise.resolve();
    let streamError = null;

    const started = performance.now();
    let lastYield = started;

    for (let i = 0; i < total; i += 1) {
      if (signal.aborted || streamError) {
        if (stream) await stream.abort().catch(() => {});
        return { ok: false, canceled: true };
      }
      const time = range.from + i / fps;
      if (opts.prepareFrame) await opts.prepareFrame(time);
      if (opts.renderFrame) opts.renderFrame(time);

      let blob = null;
      if (typeof opts.capturePngBlob === 'function') {
        blob = await opts.capturePngBlob();
      } else {
        const source = typeof opts.captureBitmap === 'function'
          ? opts.captureBitmap()
          : (typeof opts.captureCanvas === 'function' ? opts.captureCanvas() : (typeof opts.captureFrame === 'function' ? opts.captureFrame() : null));
        if (ctx) {
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(source, 0, 0);
        }
        if (source && typeof source.close === 'function') source.close();
        blob = await canvas.convertToBlob({ type: 'image/png' });
      }

      const entryName = `${baseName}_${String(i).padStart(5, '0')}.png`;
      const pngBytes = new Uint8Array(await blob.arrayBuffer());

      if (stream) {
        const nameBytes = new TextEncoder().encode(entryName);
        const crc = crc32(pngBytes);
        const localHeader = makeZipLocalHeader(nameBytes, pngBytes.length, crc);
        const centralEntry = makeZipCentralEntry(nameBytes, pngBytes.length, crc, streamOffset);
        centralEntries.push(centralEntry);
        streamOffset += localHeader.length + pngBytes.length;

        // Stream frame data incrementally to disk, keeping only lightweight metadata in RAM
        writeChain = writeChain
          .then(() => stream.write(localHeader))
          .then(() => stream.write(pngBytes))
          .catch((err) => {
            if (!streamError) streamError = err;
          });
      } else {
        entries.push({ name: entryName, bytes: pngBytes });
      }

      const nowMs = performance.now();
      if (nowMs - lastYield >= 50 || i === total - 1) {
        lastYield = nowMs;
        const elapsed = (nowMs - started) / 1000;
        const speed = elapsed > 0 ? (i + 1) / elapsed : 0;
        onProgress({ frame: i + 1, total, speed, eta: speed > 0 ? (total - i - 1) / speed : 0 });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    if (signal.aborted || streamError) {
      if (stream) await stream.abort().catch(() => {});
      if (streamError) throw streamError;
      return { ok: false, canceled: true };
    }

    if (stream) {
      await writeChain;
      if (streamError) {
        await stream.abort().catch(() => {});
        throw streamError;
      }
      const centralSize = centralEntries.reduce((sum, e) => sum + e.length, 0);
      const eocd = makeZipEocd(centralEntries.length, centralSize, streamOffset);
      const trailer = new Uint8Array(centralSize + eocd.length);
      let cursor = 0;
      for (const entry of centralEntries) {
        trailer.set(entry, cursor);
        cursor += entry.length;
      }
      trailer.set(eocd, cursor);
      await stream.write(trailer);
      await stream.close();
      const totalBytes = streamOffset + trailer.length;
      return { ok: true, format: 'png-zip', codec: 'png', frames: centralEntries.length, filePath: stream.path, bytes: totalBytes };
    }

    const zip = buildZip(entries);
    if (opts.save === false) {
      return { ok: true, format: 'png-zip', codec: 'png', frames: entries.length, bytes: zip.length, data: zip };
    }
    const saved = await root.SA.platform.saveFile({ bytes: zip, name: `${baseName}-png.zip`, mime: 'application/zip' });
    if (!saved || saved.canceled) return { ok: false, canceled: true };
    return { ok: true, format: 'png-zip', codec: 'png', frames: entries.length, filePath: saved.filePath, bytes: zip.length };
  }

  const api = {
    exportVideo,
    exportPngZip,
    pickVideoCodec,
    pickAudioCodec,
    bitrateFor,
    parseBitrate,
    buildZip,
    makeZipLocalHeader,
    makeZipCentralEntry,
    makeZipEocd,
    crc32,
    interleaveChunk,
  };

  return api;
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).SA.videoExport;
}

