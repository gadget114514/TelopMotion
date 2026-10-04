window.SA = window.SA || {};

SA.videoExport = (() => {
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

  function buildZip(entries) {
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const entry of entries) {
      const name = new TextEncoder().encode(entry.name);
      const crc = crc32(entry.bytes);
      const local = new Uint8Array(30 + name.length);
      const view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, 0, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, entry.bytes.length, true);
      view.setUint32(22, entry.bytes.length, true);
      view.setUint16(26, name.length, true);
      view.setUint16(28, 0, true);
      local.set(name, 30);
      chunks.push(local, entry.bytes);
      const centralEntry = new Uint8Array(46 + name.length);
      const centralView = new DataView(centralEntry.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, 0, true);
      centralView.setUint16(14, 0, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, entry.bytes.length, true);
      centralView.setUint32(24, entry.bytes.length, true);
      centralView.setUint16(28, name.length, true);
      centralView.setUint16(30, 0, true);
      centralView.setUint16(32, 0, true);
      centralView.setUint16(34, 0, true);
      centralView.setUint16(36, 0, true);
      centralView.setUint32(38, 0, true);
      centralView.setUint32(42, offset, true);
      centralEntry.set(name, 46);
      central.push(centralEntry);
      offset += local.length + entry.bytes.length;
    }
    const centralSize = central.reduce((sum, entry) => sum + entry.length, 0);
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true);
    eocdView.setUint16(8, entries.length, true);
    eocdView.setUint16(10, entries.length, true);
    eocdView.setUint32(12, centralSize, true);
    eocdView.setUint32(16, offset, true);
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

  function muxerAvailable(format) {
    if (format === 'webm') return typeof window.WebMMuxer === 'object';
    return typeof window.Mp4Muxer === 'object';
  }

  async function pickVideoCodec(width, height, fps, preferFormat, bitrateOverride) {
    if (typeof window.VideoEncoder !== 'function') return null;
    const mp4Codecs = [fps >= 60 ? 'avc1.64002A' : 'avc1.640028', 'avc1.4D4028'];
    const options = [];
    if (preferFormat !== 'webm') {
      for (const codec of mp4Codecs) {
        options.push({ format: 'mp4', codec, muxer: 'avc', accelerator: 'prefer-hardware' });
        options.push({ format: 'mp4', codec, muxer: 'avc', accelerator: 'no-preference' });
      }
    }
    if (preferFormat !== 'mp4') {
      options.push({ format: 'webm', codec: 'vp09.00.40.08', muxer: 'vp9', accelerator: null });
      options.push({ format: 'webm', codec: 'vp8', muxer: 'vp8', accelerator: null });
    }
    for (const option of options) {
      if (!muxerAvailable(option.format)) continue;
      const config = {
        codec: option.codec,
        width,
        height,
        bitrate: bitrateOverride || bitrateFor(width, height, fps),
        framerate: fps,
        latencyMode: 'quality',
      };
      if (option.accelerator) config.hardwareAcceleration = option.accelerator;
      if (option.format === 'mp4') config.avc = { format: 'avc' };
      try {
        const support = await Promise.race([
          VideoEncoder.isConfigSupported(config),
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
    const candidates = format === 'webm' ? ['opus'] : ['mp4a.40.2', 'opus'];
    for (const codec of candidates) {
      try {
        const support = await AudioEncoder.isConfigSupported({ codec, sampleRate: sampleRate || 48000, numberOfChannels: channels || 2, bitrate: 192000 });
        if (support && support.supported) return codec;
      } catch {
        /* try the next candidate */
      }
    }
    return null;
  }

  async function decodeAudio(bytes) {
    const context = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
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

  function interleaveChunk(audioBuffer, startFrame, frameCount) {
    const channels = audioBuffer.numberOfChannels;
    const data = new Float32Array(frameCount * channels);
    for (let channel = 0; channel < channels; channel += 1) {
      const source = audioBuffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i += 1) {
        data[channel * frameCount + i] = source[Math.min(source.length - 1, startFrame + i)] || 0;
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
    if (typeof window.VideoEncoder !== 'function') {
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
    const extension = codec.format === 'webm' ? '.webm' : '.mp4';
    if (opts.stream !== false && opts.save !== false) {
      stream = await SA.platform.openStream({
        name: `${baseName}${extension}`,
        mime: codec.format === 'webm' ? 'video/webm' : 'video/mp4',
        extension,
      });
    }
    if (stream) {
      target = new window[codec.format === 'webm' ? 'WebMMuxer' : 'Mp4Muxer'].StreamTarget({
        onData: async (data, position) => {
          await stream.write(data, position);
        },
        chunked: true,
      });
    } else {
      target = new window[codec.format === 'webm' ? 'WebMMuxer' : 'Mp4Muxer'].ArrayBufferTarget();
    }

    const Muxer = window[codec.format === 'webm' ? 'WebMMuxer' : 'Mp4Muxer'].Muxer;
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
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (error) => {
        encoderError = error;
      },
    });
    videoEncoder.configure(codec.config);
    if (opts.debug) console.log('vexport: encoder configured');

    let audioEncoder = null;
    if (audioCodec) {
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (error) => {
          encoderError = error;
        },
      });
      audioEncoder.configure({ codec: audioCodec, sampleRate: audioSampleRate, numberOfChannels: audioChannels, bitrate: 192000 });
    }

    const started = performance.now();
    // per-stage wall time (ms), logged with opts.debug to find the slow stage
    const stageMs = { prepare: 0, render: 0, capture: 0, encodeWait: 0 };
    try {
      for (let i = 0; i < total; i += 1) {
        if (signal.aborted) break;
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
        const bitmap = opts.captureBitmap();
        const frame = new VideoFrame(bitmap, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
        bitmap.close();
        lap('capture');
        videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
        frame.close();
        while (videoEncoder.encodeQueueSize > 6) await once(videoEncoder, 'dequeue');
        lap('encodeWait');
        if (encoderError) throw encoderError;
        if (i % 5 === 0 || i === total - 1) {
          const elapsed = (performance.now() - started) / 1000;
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

      if (audioEncoder && opts.audioBuffer && !signal.aborted) {
        const buffer = opts.audioBuffer;
        const chunkSize = 1024;
        const fromFrame = Math.round(range.from * buffer.sampleRate);
        const toFrame = Math.min(buffer.length, Math.round(range.to * buffer.sampleRate));
        for (let frame = fromFrame; frame < toFrame && !signal.aborted; frame += chunkSize) {
          const count = Math.min(chunkSize, toFrame - frame);
          const data = interleaveChunk(buffer, frame, count);
          const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate: buffer.sampleRate,
            numberOfFrames: count,
            numberOfChannels: buffer.numberOfChannels,
            timestamp: Math.round((frame / buffer.sampleRate) * 1e6),
            data,
          });
          audioEncoder.encode(audioData);
          audioData.close();
          while (audioEncoder.encodeQueueSize > 8) await once(audioEncoder, 'dequeue');
        }
        await audioEncoder.flush();
        audioEncoder.close();
      }

      if (signal.aborted) {
        if (stream) await stream.abort();
        return { ok: false, canceled: true };
      }
      muxer.finalize();

      if (stream) {
        await stream.close();
        return { ok: true, stats, format: codec.format, codec: codec.config.codec, audioCodec, filePath: stream.path, bytes: null };
      }
      const bytes = new Uint8Array(target.buffer);
      if (opts.save === false) {
        return { ok: true, stats, format: codec.format, codec: codec.config.codec, audioCodec, bytes: bytes.length, data: bytes };
      }
      const saved = await SA.platform.saveFile({ bytes, name: `${baseName}${extension}`, mime: codec.format === 'webm' ? 'video/webm' : 'video/mp4' });
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
    const { width, height, fps, range, total, baseName, onProgress, signal } = options;
    const entries = [];
    for (let i = 0; i < total; i += 1) {
      if (signal.aborted) return { ok: false, canceled: true };
      const time = range.from + i / fps;
      if (options.prepareFrame) await options.prepareFrame(time);
      options.renderFrame(time);
      let blob = null;
      if (typeof options.capturePngBlob === 'function') {
        blob = await options.capturePngBlob();
      } else {
        const bitmap = options.captureBitmap();
        const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : null;
        if (!canvas) throw Object.assign(new Error('no-offscreen'), { code: 'no-offscreen' });
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        blob = await canvas.convertToBlob({ type: 'image/png' });
      }
      entries.push({ name: `${baseName}_${String(i).padStart(5, '0')}.png`, bytes: new Uint8Array(await blob.arrayBuffer()) });
      onProgress({ frame: i + 1, total, speed: 0, eta: 0 });
      if (i % 5 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (signal.aborted) return { ok: false, canceled: true };
    const zip = buildZip(entries);
    if (options.save === false) {
      return { ok: true, format: 'png-zip', codec: 'png', frames: entries.length, bytes: zip.length, data: zip };
    }
    const saved = await SA.platform.saveFile({ bytes: zip, name: `${baseName}-png.zip`, mime: 'application/zip' });
    if (!saved || saved.canceled) return { ok: false, canceled: true };
    return { ok: true, format: 'png-zip', codec: 'png', frames: entries.length, filePath: saved.filePath, bytes: zip.length };
  }

  return {
    exportVideo,
    exportPngZip,
    pickVideoCodec,
    bitrateFor,
    buildZip,
    crc32,
  };
})();
