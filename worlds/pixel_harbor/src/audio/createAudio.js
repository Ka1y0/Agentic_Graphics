/**
 * ===========================================================================
 *  Procedural score — original, generated in the browser
 * ===========================================================================
 *
 * Nothing is sampled or downloaded. Every sound is synthesised with Web Audio
 * oscillators and noise, which keeps the project asset-free and — more usefully
 * — lets the music answer to world state: register, density and colour all
 * follow the time of day and the season.
 *
 * WHAT CHANGED, AND WHY
 * ---------------------
 * The first version was room tone: a drone, filtered noise for the sea, and a
 * pluck fired at a random interval between 1.6 and 5.4 seconds. It had no
 * pulse, no phrase and no memory, so it never went anywhere — pleasant for
 * thirty seconds, restless underneath. Random is not the same as calm.
 *
 * This version has a transport. There is a slow 4/4 at 72 BPM, a 32-bar form
 * (about 107 seconds) built from four eight-bar sections, and written motifs
 * rather than dice. The form repeats, but what fills it does not: each pass
 * varies octave, ornament, omission and velocity, so there is no point where
 * the ear catches a seam and starts waiting for it. The pulse is deliberately
 * hard to hear — nothing lands on every beat — it is there so the phrases
 * breathe together, not so you can tap to it.
 *
 * The material is hirajoshi, the pentatonic most associated with koto music,
 * and the writing habit is Japanese too: long values, plain contour, and more
 * rest than note. Two of the eight-bar sections are mostly silence.
 *
 * VOICES
 *   koto        soft plucked triangle, gentle attack, long natural decay
 *   shakuhachi  breathy sustained lead — tone plus real filtered breath noise
 *   pad         three detuned triangles under a slow filter, harmony only
 *   drone       sub fifth, felt more than heard
 *   bell        temple bell with inharmonic partial, twice per form at most
 *   wood        muted wooden accent, day only, never a backbeat
 *
 * AMBIENCE
 *   sea         two decorrelated noise beds with independent slow swells
 *   wind        thin high noise, drifting
 *   birds       a few chirps, day only, rare enough to be an event
 *   night air   a barely-there high shimmer after dark
 *
 * Browsers refuse to start audio without a user gesture, so nothing is created
 * until `start()` is called from a click.
 */

/** Hirajoshi on the root, three octaves, as semitone offsets. */
const HIRAJOSHI = [0, 2, 3, 7, 8, 12, 14, 15, 19, 20, 24, 26];
const ROOT_HZ = 146.83;   // D3

const BPM = 72;
const BEAT = 60 / BPM;          // 0.8333 s
const BEATS_PER_BAR = 4;
const BAR = BEAT * BEATS_PER_BAR;
const FORM_BARS = 32;           // ~106.7 s before the form comes round again
const LOOKAHEAD = 0.6;          // seconds of events scheduled in advance

const SEASON_MOOD = {
  Spring: { rootShift: 0,  bright: 1.00, density: 1.00 },
  Summer: { rootShift: 2,  bright: 1.15, density: 1.05 },
  Autumn: { rootShift: -2, bright: 0.85, density: 0.92 },
  Winter: { rootShift: -4, bright: 0.70, density: 0.78 },
};

/**
 * Time-of-day voicing.
 *
 * These are targets, never applied directly — every one is approached with a
 * long `setTargetAtTime` constant so the music drifts between them over tens of
 * seconds. Crossing 18:00 should not be audible as an event.
 */
const TOD = {
  dawn:   { koto: 0.55, lead: 0.95, pad: 0.65, bell: 1.0, wood: 0.0, sea: 0.85, wind: 1.0, birds: 0.3, shimmer: 0.15, tilt: 1.10, octave: 1 },
  day:    { koto: 1.00, lead: 0.55, pad: 0.80, bell: 0.7, wood: 1.0, sea: 1.00, wind: 0.8, birds: 1.0, shimmer: 0.00, tilt: 1.00, octave: 0 },
  sunset: { koto: 0.85, lead: 1.00, pad: 1.00, bell: 1.0, wood: 0.3, sea: 0.95, wind: 0.9, birds: 0.2, shimmer: 0.10, tilt: 0.88, octave: 0 },
  night:  { koto: 0.45, lead: 0.35, pad: 0.90, bell: 1.0, wood: 0.0, sea: 0.70, wind: 0.6, birds: 0.0, shimmer: 1.00, tilt: 0.62, octave: -1 },
};
const TOD_KEYS = Object.keys(TOD);

/**
 * The written material.
 *
 * Beats are floats within the bar, so notes can sit off the pulse. `d` indexes
 * HIRAJOSHI. Bars that are absent are rests, and there are a lot of them.
 */
const KOTO_A = {
  0: [[0, 0, 1.0], [2.5, 2, 0.7]],
  1: [[1.0, 3, 0.8]],
  2: [[0, 4, 0.9], [3.0, 2, 0.6]],
  4: [[0.5, 5, 0.85], [2.0, 3, 0.7]],
  5: [[2.5, 2, 0.6]],
  6: [[0, 1, 0.8], [1.5, 0, 0.65]],
};
const KOTO_C = {   // the sparse closing section: three notes in eight bars
  1: [[2.0, 4, 0.6]],
  4: [[0, 2, 0.7]],
  6: [[1.5, 0, 0.55]],
};
const LEAD_B = [
  { bar: 0, beat: 1.0, d: 5, dur: 3.0 },
  { bar: 2, beat: 0.0, d: 4, dur: 2.5 },
  { bar: 3, beat: 2.0, d: 3, dur: 2.0 },
  { bar: 5, beat: 1.0, d: 7, dur: 3.5 },
  { bar: 7, beat: 0.0, d: 5, dur: 4.0 },
];
const LEAD_D = [   // answer phrase, a fourth lower and even plainer
  { bar: 1, beat: 2.0, d: 3, dur: 3.0 },
  { bar: 4, beat: 0.5, d: 2, dur: 4.0 },
  { bar: 6, beat: 2.0, d: 0, dur: 4.0 },
];

/** Pad harmony per section: semitone offsets from the root. */
const PAD_CHORDS = [
  [0, 7, 14],    // A   open fifth with a ninth on top
  [-4, 3, 10],   // B   relative shift, still no third of its own
  [0, 7, 15],    // A'  the ninth leans up a semitone
  [-5, 2, 9],    // C   settles lower for the close
];

const hz = (root, semitones) => root * Math.pow(2, semitones / 12);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * `context` and `clock` exist so the identical score can be rendered offline.
 *
 * An OfflineAudioContext's `currentTime` does not advance until rendering
 * starts, so the scheduler cannot read it while laying events down. Given a
 * driven clock instead, the same `update()` calls that run live can be stepped
 * at a fixed 1/60 to schedule an entire piece ahead of time — which is how the
 * showcase soundtrack is produced, and why it lines up with the picture
 * sample for sample rather than being recorded alongside it.
 */
export function createAudio({ context = null, clock = null } = {}) {
  let ctx = null;
  let master = null;       // music + ambience bus
  let fader = null;        // demo fades, independent of the user's volume
  let limiter = null;
  let analyser = null;
  let analyserBuf = null;
  let captureDest = null;

  // voice buses, so time of day can move whole families at once
  const bus = {};
  let padOscs = [];
  let seaLfos = [];
  let shimmerGain = null;

  // transport
  let nextBeatTime = 0;
  let barCount = 0;
  let beatInBar = 0;
  let formPass = 0;
  let birdTimer = 14;

  const todWeight = { dawn: 0, day: 1, sunset: 0, night: 0 };

  /** The one clock. Live it is the audio context; offline it is driven. */
  const now = () => (clock ? clock() : ctx.currentTime);

  const state = {
    ready: false,
    enabled: false,
    volume: 0.5,
    season: 'Spring',
    nightFactor: 0,
    /** Highest sample magnitude seen since the last reset — for mix checks. */
    peak: 0,

    // ------------------------------------------------------------ lifecycle
    /** Must be called from a user gesture. */
    start() {
      if (state.ready) { state.resume(); return; }
      if (context) {
        ctx = context;
      } else {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC({ sampleRate: 48000, latencyHint: 'playback' });
      }

      // ---- master chain ---------------------------------------------------
      // A limiter sits at the end purely as a seatbelt. Everything below is
      // gain-staged to peak around -10 dBFS, so it should never engage; if it
      // does, the ratio is gentle and the release long enough not to breathe.
      limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 8;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.006;
      limiter.release.value = 0.30;

      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyserBuf = new Float32Array(analyser.fftSize);

      fader = ctx.createGain();
      fader.gain.value = 1;

      master = ctx.createGain();
      master.gain.value = state.volume;

      master.connect(fader).connect(limiter).connect(analyser).connect(ctx.destination);

      // ---- voice buses ----------------------------------------------------
      for (const name of ['koto', 'lead', 'pad', 'drone', 'bell', 'wood', 'sea', 'wind', 'birds', 'shimmer']) {
        const g = ctx.createGain();
        g.gain.value = name === 'sea' ? 0.0001 : 1;
        g.connect(master);
        bus[name] = g;
      }

      state._buildPad();
      state._buildDrone();
      state._buildSea();
      state._buildWind();
      state._buildShimmer();

      // Everything comes up from silence over the first few seconds rather
      // than snapping on at full level.
      const t = now();
      bus.pad.gain.setValueAtTime(0.0001, t);
      bus.pad.gain.linearRampToValueAtTime(1, t + 5);
      bus.sea.gain.linearRampToValueAtTime(1, t + 6);

      nextBeatTime = now() + 0.4;
      barCount = 0;
      beatInBar = 0;
      formPass = 0;

      state.ready = true;
      state.enabled = true;
    },

    resume() {
      if (ctx?.state === 'suspended') ctx.resume();
      state.enabled = true;
      if (master) master.gain.value = state.volume;
    },

    setEnabled(on) {
      state.enabled = on;
      if (master) master.gain.value = on ? state.volume : 0;
    },

    setVolume(v) {
      state.volume = v;
      if (master && state.enabled) master.gain.value = v;
    },

    /**
     * Fade the whole mix without touching the user's volume setting, so the
     * demo director can open and close on silence and hand control back
     * unchanged.
     */
    fadeTo(value, seconds) {
      if (!fader) return;
      const t = now();
      fader.gain.cancelScheduledValues(t);
      fader.gain.setValueAtTime(Math.max(fader.gain.value, 0.0001), t);
      fader.gain.linearRampToValueAtTime(Math.max(value, 0.0001), t + Math.max(seconds, 0.01));
    },

    /**
     * Fade from an explicit starting value.
     *
     * `fadeTo` reads `fader.gain.value` to decide where its ramp begins. That is
     * correct in isolation and wrong when two fades are issued back to back: the
     * second call runs before the first ramp has executed, still sees the old
     * value, and schedules a ramp from it.
     *
     * Shot 01 of the cinematic demo did exactly that —
     * `fadeTo(0.0001, 0.01)` followed by `fadeTo(1.0, 3.4)` ramped 1.0 -> 1.0,
     * so the film opened at full level on the temple bell instead of fading in.
     * Measured: the whole piece's peak sat at 0.48 s.
     *
     * Naming the start value removes the race. Starting at 0.0001 rather than 0
     * keeps the ramp inside the exponential-safe range and avoids a click.
     */
    fadeFrom(from, to, seconds) {
      if (!fader) return;
      const t = now();
      fader.gain.cancelScheduledValues(t);
      fader.gain.setValueAtTime(Math.max(from, 0.0001), t);
      fader.gain.linearRampToValueAtTime(Math.max(to, 0.0001), t + Math.max(seconds, 0.01));
    },

    /** Tap the finished mix for recording. Returns a MediaStream. */
    captureStream() {
      if (!ctx) return null;
      if (!captureDest) {
        captureDest = ctx.createMediaStreamDestination();
        analyser.connect(captureDest);
      }
      return captureDest.stream;
    },

    get context() { return ctx; },
    get transport() { return { bar: barCount, beat: beatInBar, formPass, bpm: BPM, formBars: FORM_BARS }; },

    // ------------------------------------------------------- sustained beds
    _buildPad() {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      filter.Q.value = 0.4;
      filter.connect(bus.pad);

      // Three voices, spread across the stereo field and slightly detuned so
      // the chord shimmers instead of sitting still.
      padOscs = PAD_CHORDS[0].map((semi, i) => {
        const pan = ctx.createStereoPanner();
        pan.pan.value = [-0.45, 0.1, 0.45][i];
        const g = ctx.createGain();
        g.gain.value = [0.030, 0.024, 0.017][i];
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = hz(ROOT_HZ, semi);
        osc.detune.value = [-6, 4, 9][i];
        osc.connect(g).connect(pan).connect(filter);
        osc.start();

        // very slow tremolo, different rate per voice, so nothing phases
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.045 + i * 0.017;
        const depth = ctx.createGain();
        depth.gain.value = g.gain.value * 0.30;
        lfo.connect(depth).connect(g.gain);
        lfo.start();

        return { osc, filter };
      });
      bus.pad._filter = filter;
    },

    _buildDrone() {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      filter.connect(bus.drone);
      for (const [mult, detune, gain] of [[0.5, -4, 0.045], [0.75, 5, 0.022]]) {
        const g = ctx.createGain();
        g.gain.value = gain;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = ROOT_HZ * mult;
        osc.detune.value = detune;
        osc.connect(g).connect(filter);
        osc.start();
      }
    },

    /**
     * The sea.
     *
     * Two independent beds, hard-ish left and right, each with its own slow
     * swell at an incommensurate rate — so the two sides never crest together
     * and the water never sounds like a loop. The buffer is eight seconds of
     * noise rather than two, which puts any residual periodicity well below
     * the swell rate where the ear cannot find it.
     */
    _buildSea() {
      seaLfos = [];
      for (const [pan, rate, phase] of [[-0.6, 0.082, 0], [0.6, 0.061, 2.1]]) {
        const len = ctx.sampleRate * 8;
        const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        // brownish noise: integrated white, which is closer to surf than white
        let last = 0;
        for (let i = 0; i < len; i++) {
          const w = Math.random() * 2 - 1;
          last = (last + 0.035 * w) / 1.035;
          data[i] = last * 3.2;
        }
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 820;
        lp.Q.value = 0.5;

        const swell = ctx.createGain();
        swell.gain.value = 0.022;

        const lfo = ctx.createOscillator();
        lfo.frequency.value = rate;
        const depth = ctx.createGain();
        depth.gain.value = 0.013;
        lfo.connect(depth).connect(swell.gain);

        // the crest also opens the filter a little, as real surf does
        const fdepth = ctx.createGain();
        fdepth.gain.value = 260;
        lfo.connect(fdepth).connect(lp.frequency);

        const panner = ctx.createStereoPanner();
        panner.pan.value = pan;

        src.connect(lp).connect(swell).connect(panner).connect(bus.sea);
        src.start(now() + phase * 0.1);
        lfo.start(now() + phase);
        seaLfos.push({ lfo, swell, lp });
      }
    },

    _buildWind() {
      const len = ctx.sampleRate * 6;
      const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buffer.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 900;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;

      const g = ctx.createGain();
      g.gain.value = 0.0075;

      // slow drift, so it is never a steady hiss
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.037;
      const depth = ctx.createGain();
      depth.gain.value = 0.0045;
      lfo.connect(depth).connect(g.gain);
      lfo.start();

      src.connect(hp).connect(lp).connect(g).connect(bus.wind);
      src.start();
    },

    /** Night air: a very quiet high band that only exists after dark. */
    _buildShimmer() {
      const len = ctx.sampleRate * 4;
      const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buffer.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer; src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 5200;
      bp.Q.value = 1.6;
      shimmerGain = ctx.createGain();
      shimmerGain.gain.value = 0.004;
      src.connect(bp).connect(shimmerGain).connect(bus.shimmer);
      src.start();
      bus.shimmer.gain.value = 0.0001;
    },

    // -------------------------------------------------------------- voices
    /**
     * Koto-like pluck.
     *
     * The attack is 30 ms rather than 12: still a pluck, but the leading edge
     * no longer clicks, which matters a great deal when the room is this quiet.
     * A second partial an octave up gives the string some body without
     * brightening the whole note.
     */
    _pluck(when, freq, gain, bright, pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      p.connect(bus.koto);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(freq * 5.5 * bright, when);
      filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.15, 80), when + 2.0);
      filter.connect(p);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, when);
      env.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), when + 0.030);
      env.gain.exponentialRampToValueAtTime(0.0001, when + 3.2);
      env.connect(filter);

      for (const [mult, g, type] of [[1, 1, 'triangle'], [2, 0.16, 'sine']]) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq * mult;
        osc.detune.value = (Math.random() - 0.5) * 6;
        if (g === 1) { osc.connect(env); }
        else {
          const sub = ctx.createGain();
          sub.gain.value = g;
          osc.connect(sub).connect(env);
        }
        osc.start(when);
        osc.stop(when + 3.3);
      }
    },

    /**
     * Shakuhachi-inspired lead.
     *
     * Breath is not a filter setting — it is a separate noise voice enveloped
     * with the note and rolled off below the tone, plus a little extra at the
     * attack where a player's air arrives before the pitch does. The vibrato
     * is delayed, because it is expressive, not mechanical.
     */
    _breath(when, freq, gain, dur, bright, pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      p.connect(bus.lead);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, when);
      env.gain.linearRampToValueAtTime(gain, when + 0.42);          // slow air
      env.gain.setValueAtTime(gain, when + Math.max(dur - 0.9, 0.5));
      env.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.7);
      env.connect(p);

      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.setValueAtTime(freq * 2.2 * bright, when);
      tone.frequency.linearRampToValueAtTime(freq * 3.6 * bright, when + 0.6);
      tone.connect(env);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const osc2 = ctx.createOscillator();     // a whisper of the octave
      osc2.type = 'triangle';
      osc2.frequency.value = freq * 2;
      const g2 = ctx.createGain();
      g2.gain.value = 0.10;

      // delayed vibrato
      const vib = ctx.createOscillator();
      vib.frequency.value = 4.6 + Math.random() * 0.5;
      const vibDepth = ctx.createGain();
      vibDepth.gain.setValueAtTime(0, when);
      vibDepth.gain.linearRampToValueAtTime(freq * 0.006, when + 0.9);
      vib.connect(vibDepth);
      vibDepth.connect(osc.frequency);
      vib.start(when); vib.stop(when + dur + 0.8);

      osc.connect(tone);
      osc2.connect(g2).connect(tone);
      osc.start(when); osc.stop(when + dur + 0.8);
      osc2.start(when); osc2.stop(when + dur + 0.8);

      // the air itself
      const len = Math.ceil(ctx.sampleRate * (dur + 0.8));
      const nb = ctx.createBuffer(1, len, ctx.sampleRate);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = nb;
      const nbp = ctx.createBiquadFilter();
      nbp.type = 'bandpass';
      nbp.frequency.value = freq * 3.2;
      nbp.Q.value = 0.8;
      const nenv = ctx.createGain();
      nenv.gain.setValueAtTime(0.0001, when);
      nenv.gain.linearRampToValueAtTime(gain * 0.55, when + 0.16);   // air first
      nenv.gain.linearRampToValueAtTime(gain * 0.16, when + 0.75);
      nenv.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.5);
      noise.connect(nbp).connect(nenv).connect(p);
      noise.start(when); noise.stop(when + dur + 0.8);
    },

    /** Temple bell: fundamental plus an inharmonic partial, very long tail. */
    _bell(when, freq, gain) {
      const p = ctx.createStereoPanner();
      p.pan.value = (Math.random() - 0.5) * 0.4;
      p.connect(bus.bell);
      for (const [mult, g, tail] of [[1, gain, 9.0], [2.76, gain * 0.30, 6.0], [5.4, gain * 0.10, 3.0]]) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq * mult;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, when);
        env.gain.exponentialRampToValueAtTime(Math.max(g, 0.0002), when + 0.025);
        env.gain.exponentialRampToValueAtTime(0.0001, when + tail);
        osc.connect(env).connect(p);
        osc.start(when);
        osc.stop(when + tail + 0.2);
      }
    },

    /** A muted wooden accent. Never on a strong beat two bars running. */
    _wood(when, gain) {
      const p = ctx.createStereoPanner();
      p.pan.value = -0.2 + Math.random() * 0.4;
      p.connect(bus.wood);
      const len = Math.ceil(ctx.sampleRate * 0.12);
      const nb = ctx.createBuffer(1, len, ctx.sampleRate);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < len; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = nb;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 760;
      bp.Q.value = 2.4;
      const env = ctx.createGain();
      env.gain.setValueAtTime(gain, when);
      env.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
      src.connect(bp).connect(env).connect(p);
      src.start(when); src.stop(when + 0.2);
    },

    /** A short chirp. Two or three of these, then nothing for half a minute. */
    _bird(when) {
      const p = ctx.createStereoPanner();
      p.pan.value = (Math.random() - 0.5) * 1.4;
      p.connect(bus.birds);
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        const t = when + i * (0.11 + Math.random() * 0.09);
        const f0 = 2400 + Math.random() * 1400;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f0, t);
        osc.frequency.exponentialRampToValueAtTime(f0 * (1.25 + Math.random() * 0.3), t + 0.045);
        osc.frequency.exponentialRampToValueAtTime(f0 * 0.85, t + 0.09);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(0.010, t + 0.012);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);
        osc.connect(env).connect(p);
        osc.start(t); osc.stop(t + 0.12);
      }
    },

    // ----------------------------------------------------------- transport
    /**
     * Schedule one beat's worth of events.
     *
     * `section` is 0..3 across the 32-bar form; `local` is the bar within the
     * section. Variation is applied per form pass, so the second time through
     * is recognisably the same music without being the same performance.
     */
    _scheduleBeat(when, bar, beat) {
      const mood = SEASON_MOOD[state.season] ?? SEASON_MOOD.Spring;
      const w = todWeight;
      const bright = mood.bright * (w.dawn * TOD.dawn.tilt + w.day * TOD.day.tilt
        + w.sunset * TOD.sunset.tilt + w.night * TOD.night.tilt);
      const octaveBias = Math.round(w.dawn * TOD.dawn.octave + w.day * TOD.day.octave
        + w.sunset * TOD.sunset.octave + w.night * TOD.night.octave);
      const root = hz(ROOT_HZ, mood.rootShift);
      const density = mood.density;

      const local = bar % 8;
      const section = Math.floor((bar % FORM_BARS) / 8);
      const pass = Math.floor(bar / FORM_BARS);

      // ---- pad harmony moves on the section boundary ----------------------
      if (local === 0 && beat === 0) {
        const chord = PAD_CHORDS[section];
        padOscs.forEach((v, i) => {
          // glide, never a step
          v.osc.frequency.setTargetAtTime(hz(root, chord[i]), when, 2.4);
        });
      }

      // ---- koto -----------------------------------------------------------
      const kotoTable = (section === 3) ? KOTO_C : KOTO_A;
      const notes = kotoTable[local];
      if (notes) {
        for (const [b, d, g] of notes) {
          if (Math.floor(b) !== beat) continue;
          // each pass drops a note or two, and not the same ones
          if (Math.random() > density * (section === 2 ? 0.86 : 0.94)) continue;
          const frac = b - Math.floor(b);
          const t = when + frac * BEAT;
          // A' lifts the motif an octave; every pass nudges it further
          const lift = (section === 2 ? 12 : 0) + (pass % 2 === 1 && section === 0 ? 12 : 0);
          const deg = HIRAJOSHI[Math.min(d, HIRAJOSHI.length - 1)] + lift + octaveBias * 12;
          const vel = g * (0.85 + Math.random() * 0.3);
          state._pluck(t, hz(root, deg), 0.115 * vel, bright, (Math.random() - 0.5) * 0.5);
        }
      }

      // ---- shakuhachi lead ------------------------------------------------
      const leadTable = (section === 1) ? LEAD_B : (section === 3 ? LEAD_D : null);
      if (leadTable) {
        for (const n of leadTable) {
          if (n.bar !== local || Math.floor(n.beat) !== beat) continue;
          if (Math.random() > 0.90) continue;         // occasionally sit one out
          const t = when + (n.beat - Math.floor(n.beat)) * BEAT;
          const deg = HIRAJOSHI[n.d] + octaveBias * 12;
          state._breath(t, hz(root, deg), 0.052, n.dur * BEAT, bright, (Math.random() - 0.5) * 0.35);
        }
      }

      // ---- bell: twice per form at most, on a section head -----------------
      if (beat === 0 && local === 0 && (section === 0 || section === 2)) {
        if (section === 0 || Math.random() < 0.6) {
          state._bell(when, hz(root, -12), 0.075);
        }
      }

      // ---- wood: day only, never two bars running, never on beat 1 --------
      if (w.day > 0.45 && beat === 2 && (local === 2 || local === 6) && section !== 3) {
        if (Math.random() < 0.55) state._wood(when, 0.030);
      }
    },

    // -------------------------------------------------------------- update
    update(dt, world) {
      if (!state.ready || !state.enabled) return;
      state.season = world.season;
      state.nightFactor = world.sun.nightFactor;

      // ---- time-of-day weights -------------------------------------------
      // Derived from the world clock, shaped so the four states overlap. These
      // are only ever approached, never assigned, so 18:00 is not an event.
      const m = world.sun.minutes;
      const bump = (centre, width) => {
        let d = Math.abs(m - centre);
        if (d > 720) d = 1440 - d;              // wrap at midnight
        return clamp01(1 - d / width);
      };
      const raw = {
        dawn:   bump(6 * 60 + 30, 180),
        day:    bump(12 * 60, 330),
        sunset: bump(17 * 60 + 45, 165),
        night:  Math.max(bump(0, 400), bump(24 * 60, 400)),
      };
      const sum = raw.dawn + raw.day + raw.sunset + raw.night || 1;
      for (const k of TOD_KEYS) todWeight[k] = raw[k] / sum;

      const t = now();
      const blend = (field) => TOD_KEYS.reduce((acc, k) => acc + todWeight[k] * TOD[k][field], 0);
      // 6-second time constant: the mix drifts, it never switches
      const ease = (node, value) => node.gain.setTargetAtTime(Math.max(value, 0.0001), t, 6);
      ease(bus.koto,    blend('koto'));
      ease(bus.lead,    blend('lead'));
      ease(bus.pad,     blend('pad'));
      ease(bus.bell,    blend('bell'));
      ease(bus.wood,    blend('wood'));
      ease(bus.sea,     blend('sea'));
      ease(bus.wind,    blend('wind'));
      ease(bus.birds,   blend('birds'));
      ease(bus.shimmer, blend('shimmer'));
      if (bus.pad._filter) {
        bus.pad._filter.frequency.setTargetAtTime(520 + blend('tilt') * 620, t, 6);
      }

      // ---- birds: rare, day only ------------------------------------------
      if (todWeight.day > 0.5) {
        birdTimer -= dt;
        if (birdTimer <= 0) {
          birdTimer = 18 + Math.random() * 26;
          state._bird(t + 0.1);
        }
      } else {
        birdTimer = 12 + Math.random() * 10;
      }

      // ---- transport ------------------------------------------------------
      while (nextBeatTime < now() + LOOKAHEAD) {
        state._scheduleBeat(nextBeatTime, barCount, beatInBar);
        nextBeatTime += BEAT;
        beatInBar += 1;
        if (beatInBar >= BEATS_PER_BAR) {
          beatInBar = 0;
          barCount += 1;
          if (barCount % FORM_BARS === 0) formPass += 1;
        }
      }

      // ---- peak meter ------------------------------------------------------
      // Live only: offline, nothing has been rendered yet, so the peak is
      // measured from the finished buffer instead.
      if (analyser && !clock) {
        analyser.getFloatTimeDomainData(analyserBuf);
        let p = 0;
        for (let i = 0; i < analyserBuf.length; i++) {
          const a = Math.abs(analyserBuf[i]);
          if (a > p) p = a;
        }
        if (p > state.peak) state.peak = p;
      }
    },

    resetPeak() { state.peak = 0; },
  };

  return state;
}
