import * as THREE from 'three';
import { directionFromBearing, localDirectionToWorld } from './orientation.js';
import { lightingUniforms } from '../rendering/ToonMaterial.js';

/**
 * ===========================================================================
 *  The sun — a red disc that actually rises in the east
 * ===========================================================================
 *
 * Two things had to be reconciled here.
 *
 * 1. The sun is a *celestial* object, so its screen position should depend on
 *    its direction, not on a world position. Under an orthographic camera those
 *    are not the same thing: a disc placed along the sunrise direction sits at
 *    screen x = distance, so pushing it "far away" walks it straight out of
 *    frame. The disc is therefore drawn by the sky shader at a screen-space
 *    position derived from the sun's bearing and elevation — which is also how
 *    a 2D game does it, and how a print does it.
 *
 * 2. The same bearing and elevation drive `uLightDir` in world space, so the
 *    shading and the cast shadows agree with where the disc is. Previously the
 *    HUD showed a time and the light pointed wherever it was told; now they are
 *    the same number.
 *
 * The disc itself is deliberately flat: a hard-edged vermilion circle, no
 * bloom, no gradient, no corona. It is the sun as a stamped shape.
 */

export const SUN = {
  sunriseMinutes: 6 * 60,
  sunsetMinutes: 18 * 60,
  /** Bearing sweeps east (90) -> south (180) -> west (270) across the day. */
  riseBearing: 90,
  setBearing: 270,
  maxElevation: 58,

  /**
   * Screen-space arc, in NDC.
   *
   * `spanX` also fixes Fuji's screen column: FUJI.x is derived from it, so the
   * mountain stands on the sunrise bearing.
   */
  spanX: 0.40,

  /**
   * The arc is anchored to the REAL horizon now.
   *
   * Previously the disc's lowest position was a hand-picked height well above
   * the sea, so the sun never actually set — it just slid sideways and dimmed.
   * At elevation 0 it now sits exactly on the waterline, and past that the
   * value keeps going negative so the disc sinks beneath it.
   *
   * No visibility flag is needed for that: the sun is drawn by the sky pass,
   * which runs first with depth testing off, so the sea simply paints over it
   * as it descends. The same is true of Fuji — the sun genuinely rises out from
   * behind the mountain rather than being positioned on top of it.
   */
  horizonY: 0.472,
  peakY: 0.960,
  /**
   * Shapes the climb. Below 1 the disc leaves the horizon quickly and then
   * eases, which is what puts it against Fuji's upper slopes through the
   * morning instead of racing past them in a few minutes.
   */
  arcShape: 0.75,

  /** Symbolic scale, not an angular diameter: this is the sun as a painted mark. */
  radius: 0.115,
};

const DAWN_LIGHT = new THREE.Color(0xffc79a);
const NIGHT_LIGHT = new THREE.Color(0x6f86c4);
const NIGHT_SKY = new THREE.Color(0x2a3560);

/** In-game minutes elapsed per real second at time scale 1. */
export const MINUTES_PER_SECOND = 1;

export function createSun() {
  const localDir = new THREE.Vector3();
  const worldDir = new THREE.Vector3();

  const state = {
    // Default view: the disc is clear of Fuji's crater but the light is still
    // low and warm. True sunrise now leaves the sun behind the mountain, which
    // is correct but not the shot.
    minutes: 8 * 60 + 20,
    bearing: SUN.riseBearing,
    elevation: 0,
    aboveHorizon: true,
    nightFactor: 0,
    dayFraction: 0,
    screen: new THREE.Vector2(SUN.spanX, SUN.horizonY),

    // Screen-space geometry of the arc, published so the sky shader can decide
    // when the *disc* — not its centre — has finished sinking. `aboveHorizon`
    // is a lighting concept (elevation > 0) and flips while half the disc is
    // still drawn above the waterline; using it to gate the sprite popped
    // ~48% of the disc off in a single frame at 18:00.
    horizonY: SUN.horizonY,
    discRadiusY: SUN.radius,

    /**
     * Advance the world clock.
     *
     * The base rate is one in-game minute per real second, so a full day takes
     * 24 real minutes. It previously ran at 60 minutes per second — a whole day
     * in 24 seconds — which is far too fast to sit and watch a sunrise. The old
     * pace is still reachable at the 60x time scale.
     */
    tick(dt) {
      state.minutes = (state.minutes + dt * MINUTES_PER_SECOND) % (24 * 60);
      state.recompute();
    },

    setMinutes(minutes) {
      state.minutes = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
      state.recompute();
    },

    get hours() { return Math.floor(state.minutes / 60); },
    get minutesOfHour() { return Math.floor(state.minutes % 60); },
    get clockText() {
      return `${String(state.hours).padStart(2, '0')}:${String(state.minutesOfHour).padStart(2, '0')}`;
    },

    recompute() {
      const dayLength = SUN.sunsetMinutes - SUN.sunriseMinutes;
      const raw = (state.minutes - SUN.sunriseMinutes) / dayLength;
      const t = THREE.MathUtils.clamp(raw, 0, 1);

      state.bearing = SUN.riseBearing + t * (SUN.setBearing - SUN.riseBearing);

      // A sine over the full period, NOT clamped to the day: outside 06:00-18:00
      // it goes negative, which is what carries the disc below the waterline
      // and keeps it there through the night.
      state.elevation = Math.sin(raw * Math.PI) * SUN.maxElevation;
      state.aboveHorizon = state.elevation > 0;
      state.dayFraction = t;

      // ---- screen position of the disc ---------------------------------
      const b = THREE.MathUtils.degToRad(state.bearing);
      const norm = Math.sin(THREE.MathUtils.degToRad(state.elevation))
        / Math.sin(THREE.MathUtils.degToRad(SUN.maxElevation));
      const shaped = Math.sign(norm) * Math.pow(Math.abs(norm), SUN.arcShape);
      state.screen.set(
        Math.sin(b) * SUN.spanX,
        SUN.horizonY + (SUN.peakY - SUN.horizonY) * shaped,
      );

      // ---- the light the world is actually shaded by --------------------
      // Held above the true horizon: at a real elevation of 0 every surface
      // falls into the lowest tone band at once and the scene reads as an
      // unlit silhouette. At night the light comes from a shallow angle and
      // the scene is dimmed by ambient instead.
      const lightElevation = Math.max(state.elevation, 24);
      directionFromBearing(state.bearing, lightElevation, localDir);
      localDirectionToWorld(localDir, worldDir);
      lightingUniforms.uLightDir.value.copy(worldDir).normalize();

      // Warm the light as the sun sits low, so dawn and dusk read as times of
      // day rather than as the same noon light pointing sideways.
      const warmth = 1 - THREE.MathUtils.clamp(Math.max(state.elevation, 0) / 34, 0, 1);
      // How far into night we are: 0 at and above the horizon, 1 once the sun
      // is well down.
      const night = THREE.MathUtils.clamp(-state.elevation / 16, 0, 1);
      state.nightFactor = night;

      // A low sun leaves most surfaces facing away from it, so without a lift
      // the whole village drops into the bottom tone band and dawn reads as
      // night. Ambient carries the scene while the sun is low; at night it
      // falls again and the whole world cools.
      lightingUniforms.uAmbient.value = (0.36 + warmth * 0.16) * (1 - night * 0.42);
      lightingUniforms.uLightLevel.value = 1.04 - night * 0.42;
      lightingUniforms.uLightColor.value
        .setHex(0xfff4dc)
        .lerp(DAWN_LIGHT, warmth * (1 - night))
        .lerp(NIGHT_LIGHT, night);
      lightingUniforms.uSkyColor.value.setHex(0x9fc0d8).lerp(NIGHT_SKY, night);
      lightingUniforms.uShadowTint.value.setHex(0xa8b8e0).lerp(NIGHT_SKY, night * 0.7);
    },
  };

  state.recompute();
  return state;
}
