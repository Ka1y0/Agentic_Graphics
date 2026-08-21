import * as THREE from 'three';
import { nightUniforms, lightingUniforms } from '../rendering/ToonMaterial.js';

/**
 * ===========================================================================
 *  Night lighting
 * ===========================================================================
 *
 * The night scene previously read as "daytime, dimmed": everything got darker
 * together, so nothing was *lit* and there was no anchor for the eye. Three
 * things were missing, and all three are handled here.
 *
 * 1. **Nothing emitted.** Lanterns were ordinary coloured boxes, so they
 *    darkened along with the rest of the world. Fittings now switch to a
 *    self-lit channel after dusk and their positions feed a small lamp array
 *    that warms the surfaces around them.
 *
 * 2. **The character ignored light entirely.** Its shader multiplied the sprite
 *    by a constant white tint, so it rendered at full daylight brightness at
 *    midnight. It now takes a tint derived from the same world lighting state,
 *    plus a lift from any lamp it is standing near.
 *
 * 3. **Nothing carried moonlight.** A cool lift proportional to how up-facing a
 *    surface is keeps snow, rooftops and Fuji's cap legible, so a winter night
 *    gains structure from its snow rather than losing it to the dark.
 */

const MAX_LAMPS = 8;

/** Windows are lit in the evening and dark once the town has gone to bed. */
const EVENING_START = 18 * 60 + 30;
const EVENING_END = 22 * 60 + 30;

export function createNightLighting(harborRoot) {
  const lamps = [];
  const worldPos = new THREE.Vector3();

  // Collect anything tagged as a lamp. Positions are resolved in world space
  // because the toon shader lights from world coordinates.
  harborRoot.updateMatrixWorld(true);
  harborRoot.traverse((object) => {
    if (!object.isMesh || !object.userData.lamp || lamps.length >= MAX_LAMPS) return;
    object.getWorldPosition(worldPos);
    lamps.push({
      position: worldPos.clone(),
      color: new THREE.Color(object.userData.lamp.color),
      range: object.userData.lamp.range,
    });
  });

  for (let i = 0; i < lamps.length; i++) {
    nightUniforms.uLampPos.value[i].copy(lamps[i].position);
    nightUniforms.uLampColor.value[i].copy(lamps[i].color);
    nightUniforms.uLampRange.value[i] = lamps[i].range;
  }
  nightUniforms.uLampCount.value = lamps.length;

  const state = {
    lamps,
    lampCount: lamps.length,
    /** Sprite tint, read by the character each frame. */
    characterTint: new THREE.Color(1, 1, 1),

    update(sun, characterWorldPos) {
      const night = sun.nightFactor;

      // Lamps come up as the sun goes down and stay on until it returns.
      const lampGate = THREE.MathUtils.clamp(night * 1.35, 0, 1);
      nightUniforms.uLampStrength.value = lampGate;
      nightUniforms.uLampGate.value = lampGate;
      nightUniforms.uMoonlight.value = night * 0.30;

      // Windows follow the town's habits rather than the sun: a short evening
      // window, then dark. Deep night has lamps but almost no house lights.
      const m = sun.minutes;
      let windowGate = 0;
      if (m >= EVENING_START && m <= EVENING_END) {
        const fadeIn = THREE.MathUtils.clamp((m - EVENING_START) / 25, 0, 1);
        const fadeOut = THREE.MathUtils.clamp((EVENING_END - m) / 45, 0, 1);
        windowGate = Math.min(fadeIn, fadeOut) * 0.9;
      }
      nightUniforms.uWindowGate.value = windowGate * lampGate;

      // ---- character ------------------------------------------------------
      // Driven straight from the night factor rather than inferred from
      // ambient and light level. Those two only fall to about 70% of their
      // daytime values, so a tint derived from them left the villager far too
      // bright — measured at 71% of daylight when the scene needs 45-65% to
      // read as night at all.
      const DAY_TINT = 0.74;
      const NIGHT_TINT = 0.38;      // 51% of daylight
      let tint = THREE.MathUtils.lerp(DAY_TINT, NIGHT_TINT, night);

      // Standing under a lantern lifts the villager, but only enough to be
      // noticed: a large lift here simply undoes the night.
      let warm = 0;
      if (characterWorldPos && lampGate > 0.01) {
        for (const lamp of lamps) {
          const d = characterWorldPos.distanceTo(lamp.position);
          const a = THREE.MathUtils.clamp(1 - d / lamp.range, 0, 1);
          warm = Math.max(warm, a * a);
        }
      }
      tint = Math.min(1, tint + warm * lampGate * 0.16);

      state.characterTint.setRGB(
        tint * (1 + warm * lampGate * 0.20),
        tint * (1 + warm * lampGate * 0.06),
        tint * (1 - night * 0.06),
      );
    },
  };

  return state;
}
