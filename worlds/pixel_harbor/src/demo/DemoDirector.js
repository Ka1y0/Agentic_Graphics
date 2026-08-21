import * as THREE from 'three';
import { applySeason } from '../scene/seasons.js';

/**
 * ===========================================================================
 *  Demo director — a director, not a second world
 * ===========================================================================
 *
 * This module owns no simulation. It sets the world clock, chooses a season,
 * picks a style, asks for a view transition and moves the camera — all through
 * the same public entry points the HUD and the debug panel use. There is no
 * season logic here, no lighting logic, no style logic and no character logic;
 * if the demo shows something, the app really does it.
 *
 * That constraint is the point. A showcase that reimplemented any of the above
 * would eventually drift from the app and start advertising behaviour that no
 * longer exists.
 *
 * DETERMINISM
 * -----------
 * `tick(dt)` is the only clock. Nothing reads `performance.now()`, so stepping
 * the director at a fixed 1/60 offline produces exactly the same take as
 * running it live — which is what makes the recorded video reproducible, and
 * what lets the audio be rendered separately against the same timeline and
 * still line up sample for sample.
 *
 * The director never changes the app's default behaviour: it does nothing at
 * all until `start()` is called, and `stop()` restores what it touched.
 */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
/** Smooth at both ends, linear-ish through the middle: for long slow moves. */
const easeLong = (x) => x * x * (3 - 2 * x);

export function createDemoDirector({
  world, cameraController, styleManager, hud, audio, state, stage,
}) {
  // ---------------------------------------------------------------- overlay
  const overlay = document.createElement('div');
  overlay.id = 'demo-overlay';
  overlay.innerHTML = `
    <div class="demo-black"></div>
    <div class="demo-title"><span></span></div>
    <div class="demo-caption"><span></span></div>
  `;
  const black = overlay.querySelector('.demo-black');
  const titleEl = overlay.querySelector('.demo-title');
  const titleTx = titleEl.querySelector('span');
  const capEl = overlay.querySelector('.demo-caption');
  const capTx = capEl.querySelector('span');

  let running = false;
  let clock = 0;
  let shotIndex = -1;
  let captionUntil = -1;
  const restore = {};

  // ------------------------------------------------------------- utilities
  const setBlack = (v) => { black.style.opacity = String(clamp01(v)); };
  const setTitle = (v) => { titleEl.style.opacity = String(clamp01(v)); };

  const caption = (text, at, dur = 1.3) => {
    // shown once, when the clock first passes `at`
    if (clock >= at && captionUntil < at) {
      capTx.textContent = text;
      captionUntil = at + dur;
    }
  };

  const time = (minutes) => world.sun.setMinutes(minutes);
  const pause = (on) => { world.timePaused = on; };
  const scale = (v) => { world.timeScale = v; };

  const season = (name) => {
    if (state.season === name) return;
    state.season = name;
    applySeason(world, name);
    hud.syncSeason(name);
  };

  const style = (id) => {
    if (styleManager.current?.id === id) return;
    styleManager.apply(id, { transition: false });
    hud.syncStyleSwitcher?.(styleManager);
  };

  const view = (mode) => {
    if (cameraController.mode !== mode) hud.setView(mode);
  };

  /**
   * Cinematic 3D pose.
   *
   * Driven directly rather than through OrbitControls, so the move is an eased
   * curve with a known start and end instead of whatever inertia the controls
   * happen to carry. Controls are disabled while this is in force and handed
   * back on stop.
   */
  const orbit = (azimuthDeg, elevationDeg, distance) => {
    const cc = cameraController;
    cc.controls.enabled = false;
    const a = THREE.MathUtils.degToRad(azimuthDeg);
    const e = THREE.MathUtils.degToRad(elevationDeg);
    const cam = cc.persp;
    cam.position.set(
      cc.focus.x + Math.sin(a) * Math.cos(e) * distance,
      cc.focus.y + Math.sin(e) * distance,
      cc.focus.z + Math.cos(a) * Math.cos(e) * distance,
    );
    cam.up.set(0, 1, 0);
    cam.lookAt(cc.focus);
    cam.updateMatrixWorld(true);
    cc.controls.target.copy(cc.focus);
  };

  /** Orthographic pan, in world units, applied to the canonical 2D framing. */
  const pan = (x, y) => { cameraController.pan.set(x, y); };

  /**
   * Orbit legs start from wherever the camera actually is, never from a
   * hard-coded pose.
   *
   * The app's own 2D->3D transition settles at a close, inside-the-village
   * pose it derives from the orthographic framing. An orbit that began at a
   * guessed distance snapped the moment it took over. Reading the real pose on
   * the first frame of each leg makes the hand-off invisible, and keeps working
   * if the transition's framing is ever retuned.
   */
  let orbitFrom = null;
  const orbitReset = () => { orbitFrom = null; };
  const orbitTo = (to, u) => {
    const cc = cameraController;
    if (!orbitFrom) {
      const p = cc.persp.position.clone().sub(cc.focus);
      const dist = p.length();
      orbitFrom = {
        az: (Math.atan2(p.x, p.z) * 180 / Math.PI + 360) % 360,
        el: Math.asin(p.y / dist) * 180 / Math.PI,
        dist,
      };
    }
    const e = easeLong(clamp01(u));
    orbit(orbitFrom.az + (to.az - orbitFrom.az) * e,
          orbitFrom.el + (to.el - orbitFrom.el) * e,
          orbitFrom.dist + (to.dist - orbitFrom.dist) * e);
  };

  // ------------------------------------------------------------- the script
  /**
   * Each shot declares its length and gets `enter()` once and `update(t, u)`
   * every frame, where `t` is seconds into the shot and `u` is 0..1 through it.
   */
  const SHOTS = [
    {
      name: 'BLACK / DAWN', dur: 4.0,
      enter() {
        pause(true);
        season('Spring'); style('ukiyoe'); pan(0, 0);
        view('2d');
        time(5 * 60 + 20);           // before the sun clears anything
        // One call, not two. Two back-to-back fadeTo()s race: the second reads
        // fader.gain.value before the first ramp has run, so it ramped 1.0 ->
        // 1.0 and the demo opened at full level on the temple bell.
        audio.fadeFrom(0.0001, 1.0, 3.4);   // music arrives before the picture
        setBlack(1); setTitle(0);
      },
      update(t) {
        // ocean and music alone for a beat, then the picture arrives
        setBlack(t < 1.6 ? 1 : 1 - clamp01((t - 1.6) / 1.6));
        // the title breathes in over the fade and is gone before the sunrise
        setTitle(t < 1.2 ? 0 : (t < 2.6 ? (t - 1.2) / 1.4 : 1 - clamp01((t - 3.0) / 0.9)));
        titleTx.textContent = 'PIXEL HARBOR';
      },
    },
    {
      name: 'FUJI SUNRISE', dur: 8.5,
      enter() {
        setBlack(0); setTitle(0);
        time(6 * 60 + 35);
        pause(false); scale(13);      // ~110 in-game minutes across the shot
        // absolutely still: this is the first real picture in the film
        pan(0, 0);
      },
      update() {},
    },
    {
      name: 'MORNING LIFE', dur: 6.5,
      enter() { time(9 * 60 + 40); scale(2.2); },   // inside the fishing window
      update(t, u) {
        // A drift of barely a world unit and a half, out and back.
        // It has to *return* to zero: the next shot opens on the canonical 2D
        // framing, and ending the pan off-centre snapped the whole picture by
        // 0.037 NDC — about twenty pixels — on the cut.
        pan(Math.sin(u * Math.PI) * 1.5, 0);
      },
    },
    {
      name: 'THE PAINTING OPENS', dur: 9.5,
      enter() { scale(1); pan(0, 0); orbitReset(); },
      update(t) {
        // hold the canonical 2D frame, let the app open it, then take over
        if (t > 1.4 && cameraController.mode !== '3d') view('3d');
        // the transition owns the camera until roughly t = 2.6
        if (t > 3.0) orbitTo({ az: 256, el: 22, dist: 74 }, (t - 3.0) / 6.5);
      },
    },
    {
      name: '3D WORLD', dur: 6.0,
      enter() { scale(1); orbitReset(); },
      // pulls back and lifts until the whole island — and Fuji behind it —
      // is in frame, which is the shot that proves this is not a backdrop
      update(t, u) { orbitTo({ az: 266, el: 26, dist: 92 }, u); },
    },
    {
      name: 'RETURN TO THE PAINTING', dur: 6.0,
      enter() { orbitReset(); },
      update(t) {
        if (t < 1.3) orbitTo({ az: 269, el: 27, dist: 95 }, t / 1.3);
        else if (cameraController.mode !== '2d') view('2d');
      },
    },
    {
      name: 'FOUR SEASONS', dur: 12.5,
      enter() {
        pan(0, 0); pause(true); time(10 * 60 + 30); style('ukiyoe');
      },
      update(t, u, at0) {
        const step = 12.5 / 4;
        const names = ['Spring', 'Summer', 'Autumn', 'Winter'];
        const i = Math.min(3, Math.floor(t / step));
        season(names[i]);
        caption(names[i].toUpperCase(), at0 + i * step + 0.05, 1.3);
      },
    },
    {
      name: 'MANY WAYS OF SEEING', dur: 15.5,
      enter() {
        season('Autumn'); time(10 * 60 + 40); pause(true); pan(0, 0);
        style('ukiyoe');
      },
      update(t, u, at0) {
        // held camera, held world; only the way of looking changes
        const plan = [
          [0.0,  'ukiyoe',    'UKIYO-E PIXEL'],
          [2.0,  'cel',       'CEL-SHADED'],
          [4.7,  'blueprint', 'BLUEPRINT'],
          [7.9,  'pencil',    'PENCIL SKETCH'],
          [10.5, 'ascii',     'ASCII / CRT'],
          [13.1, 'neon',      'NEON / VAPORWAVE'],
        ];
        for (const [at, id] of plan) {
          if (t >= at) style(id);
        }
        for (const [at, , label] of plan) caption(label, at0 + at + 0.05, 1.35);
      },
    },
    {
      name: 'RETURN HOME', dur: 3.0,
      enter() { style('ukiyoe'); season('Autumn'); },
      update() {},
    },
    {
      name: 'GIANT RED SUNSET', dur: 9.5,
      enter() {
        season('Autumn'); style('ukiyoe'); pan(0, 0);
        time(17 * 60 + 12);
        pause(false); scale(8.4);     // ~80 in-game minutes: full disc to gone
      },
      update() {},
    },
    {
      name: 'LANTERN HOUR', dur: 6.5,
      enter() { scale(10); },          // on into the evening, lamps come up
      update() {},
    },
    {
      name: 'WINTER MIDNIGHT', dur: 7.0,
      enter() {
        season('Winter'); style('ukiyoe');
        time(0); pause(true); scale(1);
        pan(0, 0);
      },
      update(t, u, at0) { caption('WINTER \u00b7 MIDNIGHT', at0 + 0.4, 1.5); },
    },
    {
      name: 'END', dur: 3.5,
      enter() { audio.fadeTo(0.0001, 3.0); },
      update(t) {
        setBlack(clamp01((t - 0.4) / 2.0));
        setTitle(t < 1.0 ? 0 : (t < 2.0 ? (t - 1.0) : 1) * (1 - clamp01((t - 2.8) / 0.7)));
        titleTx.textContent = 'PIXEL HARBOR';
      },
    },
  ];

  // absolute start times
  let acc = 0;
  for (const s of SHOTS) { s.at = acc; acc += s.dur; }
  const DURATION = acc;

  // ---------------------------------------------------------------- control
  const director = {
    get running() { return running; },
    get duration() { return DURATION; },
    get elapsed() { return clock; },
    get shot() { return SHOTS[shotIndex] ?? null; },
    get timeline() {
      return SHOTS.map((s, i) => ({ i, name: s.name, at: +s.at.toFixed(2), dur: s.dur }));
    },

    start() {
      if (running) return;
      if (!overlay.isConnected) (stage ?? document.body).appendChild(overlay);
      document.body.classList.add('cinematic');

      restore.season = state.season;
      restore.style = styleManager.current?.id;
      restore.minutes = world.sun.minutes;
      restore.paused = world.timePaused;
      restore.scale = world.timeScale;
      restore.mode = cameraController.mode;
      restore.controls = cameraController.controls.enabled;
      restore.pan = cameraController.pan.clone();

      running = true;
      clock = 0;
      shotIndex = -1;
      captionUntil = -1;
      // the first frame must already be black, before anything is rendered
      setBlack(1); setTitle(0);
    },

    stop() {
      if (!running) return;
      running = false;
      document.body.classList.remove('cinematic');
      overlay.remove();
      setBlack(0); setTitle(0); capTx.textContent = '';

      season(restore.season);
      if (restore.style) style(restore.style);
      world.sun.setMinutes(restore.minutes);
      world.timePaused = restore.paused;
      world.timeScale = restore.scale;
      cameraController.pan.copy(restore.pan);
      cameraController.controls.enabled = restore.controls;
      if (cameraController.mode !== restore.mode) hud.setView(restore.mode);
      audio.fadeTo(1, 0.5);
    },

    /**
     * Advance the film by `dt` seconds. Call once per rendered frame, before
     * the camera controller updates, so the pose set here is the pose drawn.
     */
    tick(dt) {
      if (!running) return;
      // Checked before the clock advances, never after: stopping at the end of
      // a tick tears the overlay down before that same frame is drawn, so the
      // film ended on one un-faded frame of the restored world.
      if (clock >= DURATION) { director.stop(); return; }
      clock += dt;

      let i = SHOTS.length - 1;
      for (let k = 0; k < SHOTS.length; k++) {
        if (clock < SHOTS[k].at + SHOTS[k].dur) { i = k; break; }
      }
      if (i !== shotIndex) {
        shotIndex = i;
        SHOTS[i].enter();
      }
      const s = SHOTS[i];
      const t = clock - s.at;
      s.update(t, clamp01(t / s.dur), s.at);

      // caption life
      const visible = clock < captionUntil;
      const age = captionUntil - clock;
      capEl.style.opacity = String(visible ? clamp01(Math.min(age, 0.35) / 0.35) : 0);
    },
  };

  return director;
}
