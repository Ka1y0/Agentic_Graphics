import { createAudio } from '../audio/createAudio.js';

/**
 * ===========================================================================
 *  Offline score rendering
 * ===========================================================================
 *
 * The showcase video is rendered frame by frame rather than screen-captured,
 * so there is no realtime audio to record alongside it. Instead the same score
 * module is instantiated against an OfflineAudioContext and stepped with the
 * same fixed timestep the picture used, replaying the world state the director
 * actually produced on each frame.
 *
 * The result is not a recording of the music — it *is* the music, computed
 * against the same timeline. Picture and sound therefore agree by construction:
 * there is no drift to correct and no sync offset to guess at.
 *
 * `worldTrack[i]` is the world state at frame `i` in the shape `update()`
 * expects — `{ season, sun: { minutes, nightFactor } }` — and `fadeTrack` is
 * the list of fades the director asked for, with the frame each happened on.
 */
export async function renderScoreOffline({
  worldTrack, fadeTrack = [], fps = 60, sampleRate = 48000,
}) {
  const frameCount = worldTrack.length;
  const dt = 1 / fps;
  // a tail so the last bell and the closing fade are not cut off mid-decay
  const tailSec = 2.0;
  const samples = Math.ceil((frameCount * dt + tailSec) * sampleRate);

  const ctx = new OfflineAudioContext(2, samples, sampleRate);

  let t = 0;
  const audio = createAudio({ context: ctx, clock: () => t });
  audio.start();

  const fades = [...fadeTrack].sort((a, b) => a.frame - b.frame);
  let fadeAt = 0;

  for (let i = 0; i < frameCount; i++) {
    t = i * dt;
    while (fadeAt < fades.length && fades[fadeAt].frame <= i) {
      const f = fades[fadeAt];
      // `from` is present when the director used fadeFrom(); replaying it as a
      // plain fadeTo would reintroduce the very race fadeFrom exists to avoid.
      if (f.from !== undefined) audio.fadeFrom(f.from, f.value, f.seconds);
      else audio.fadeTo(f.value, f.seconds);
      fadeAt += 1;
    }
    audio.update(dt, worldTrack[i]);
  }
  // let the scheduler lay down the tail as well
  for (let i = 0; i < Math.ceil(tailSec * fps); i++) {
    t = frameCount * dt + i * dt;
    audio.update(dt, worldTrack[frameCount - 1]);
  }

  const buffer = await ctx.startRendering();
  return buffer;
}

/** Peak, RMS and clipped-sample count, per channel and overall. */
export function analyseBuffer(buffer) {
  const perChannel = [];
  let peak = 0;
  let clipped = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    let p = 0;
    let sum = 0;
    let clip = 0;
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > p) p = a;
      if (a >= 0.999) clip += 1;
      sum += d[i] * d[i];
    }
    const rms = Math.sqrt(sum / d.length);
    perChannel.push({
      peak: +p.toFixed(5),
      peakDbFS: +(20 * Math.log10(Math.max(p, 1e-7))).toFixed(2),
      rmsDbFS: +(20 * Math.log10(Math.max(rms, 1e-7))).toFixed(2),
      clippedSamples: clip,
    });
    if (p > peak) peak = p;
    clipped += clip;
  }
  return {
    channels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
    durationSec: +(buffer.length / buffer.sampleRate).toFixed(3),
    peak: +peak.toFixed(5),
    peakDbFS: +(20 * Math.log10(Math.max(peak, 1e-7))).toFixed(2),
    clippedSamples: clipped,
    perChannel,
  };
}

/**
 * Scale the whole buffer so its peak lands on `targetDbFS`.
 *
 * A single constant gain applied after rendering — not compression, and not a
 * limiter. The score is mixed to sit around -20 dBFS so the limiter in the live
 * chain never engages and nothing pumps, which is right for the music and far
 * too quiet for a delivered video. Scaling afterwards keeps every relative
 * level, every fade and the entire dynamic range exactly as rendered, and simply
 * moves the result up to a sensible delivery level with headroom to spare.
 *
 * This is only safe because the limiter never engaged at the original level: the
 * dynamics are untouched, so raising the gain cannot expose pumping. Stereo is
 * preserved because both channels are scaled by the same factor — the measured
 * L/R difference (-6.00 vs -6.29 dBFS on the showcase film) survives intact.
 *
 * Returns the gain applied, so a capture log can record it.
 */
export function normalizeBuffer(buffer, targetDbFS = -6) {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
    }
  }
  if (peak <= 0) return { gain: 1, fromDbFS: -Infinity, toDbFS: targetDbFS };

  const target = Math.pow(10, targetDbFS / 20);
  const gain = target / peak;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= gain;
  }
  return {
    gain: +gain.toFixed(4),
    gainDb: +(20 * Math.log10(gain)).toFixed(2),
    fromDbFS: +(20 * Math.log10(peak)).toFixed(2),
    toDbFS: targetDbFS,
  };
}

/** Interleaved 24-bit PCM WAV. Keeps headroom detail through the quiet fades. */
export function bufferToWav(buffer) {
  const channels = buffer.numberOfChannels;
  const rate = buffer.sampleRate;
  const frames = buffer.length;
  const bytesPerSample = 3;
  const blockAlign = channels * bytesPerSample;
  const dataBytes = frames * blockAlign;

  const out = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(out);
  const ascii = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);              // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);

  const data = buffer.numberOfChannels === 1
    ? [buffer.getChannelData(0)]
    : Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));

  let off = 44;
  const MAX = 8388607;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      let v = data[c][i];
      v = v > 1 ? 1 : v < -1 ? -1 : v;
      const s = Math.round(v * MAX);
      view.setUint8(off, s & 0xff);
      view.setUint8(off + 1, (s >> 8) & 0xff);
      view.setUint8(off + 2, (s >> 16) & 0xff);
      off += 3;
    }
  }
  return out;
}
