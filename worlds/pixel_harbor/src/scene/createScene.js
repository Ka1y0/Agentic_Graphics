import * as THREE from 'three';

import { createHarbor }    from './createHarbor.js';
import { createWater }     from './createWater.js';
import { createShoreMap, SHORE } from './createShoreMap.js';
import { createSky }       from './createSky.js';
import { createMountains } from './createMountains.js';
import { createSun }       from './createSun.js';
import { HARBOR_YAW }      from './orientation.js';
import { createWeather }   from './createWeather.js';
import { createNightLighting } from './nightLighting.js';
import { applySeason, SEASONS } from './seasons.js';
import { createBoat }      from './createBoat.js';
import { createCharacter } from './createCharacter.js';
import { lightingUniforms, shadowUniforms } from '../rendering/ToonMaterial.js';
import { LIGHTING_PRESETS } from '../util/palette.js';

/**
 * The harbour lives inside a group rotated about Y so that its local +X axis
 * maps exactly to screen-right under the default orthographic camera
 * (azimuth 225 degrees). That means every asset can be authored in a plain
 * "map" frame -- +X right, -Z away, +Y up -- and still land on a clean
 * isometric composition.
 */
export { HARBOR_YAW } from './orientation.js';

const _charWorld = new THREE.Vector3();

export function createScene({ pixelsPerUnit }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b8d8);

  const harborRoot = new THREE.Group();
  harborRoot.name = 'harborRoot';
  harborRoot.rotation.y = HARBOR_YAW;
  scene.add(harborRoot);

  const sky = createSky(scene);
  // The sun owns the world clock: time is world data, not HUD state, and the
  // sun's bearing has to be derived from the same number the panel displays.
  const sun = createSun();
  createMountains(harborRoot);

  // Harbour geometry first: the shore distance field is baked from the real
  // coastline meshes, so the land has to exist before the water is built.
  createHarbor(harborRoot);

  const shore = createShoreMap(harborRoot);
  const water = createWater({
    shoreTexture: shore.texture,
    shoreOrigin: SHORE.origin,
    shoreScale: SHORE.scale,
  });
  harborRoot.add(water.mesh);

  const boat = createBoat(harborRoot, { x: 8.0, z: -8.0, yaw: -0.28 });
  const boat2 = createBoat(harborRoot, { x: -9.5, z: -12.5, yaw: 2.6 });
  boat2.root.scale.setScalar(0.75);

  const character = createCharacter(harborRoot, { pixelsPerUnit, water });
  const weather = createWeather(harborRoot);
  // after everything is built, so the lamp sweep finds all of them
  const nightLighting = createNightLighting(harborRoot);

  // Focus point of the default composition, in world space.
  const focus = harborRoot.localToWorld(new THREE.Vector3(0, 1.5, 0.5));

  const state = {
    scene,
    harborRoot,
    water,
    shore,
    sky,
    sun,
    weather,
    nightLighting,
    season: 'Spring',

    /**
     * World clock controls.
     *
     * These pause and scale WORLD TIME only — the sun, the lighting, the lamps,
     * the house windows and the villager's schedule all derive from
     * `sun.minutes` and therefore stop together. The render loop keeps running:
     * waves, particles, the camera, style switching, view transitions, the HUD
     * and the audio are all driven by real elapsed time and are unaffected.
     */
    timePaused: false,
    timeScale: 1,
    boat,
    boat2,
    character,
    focus,
    time: 0,

    update(dt, camera, worldUnitsPerPixel, renderSize = { x: 1, y: 1 }) {
      // Animation clock: always advances, so the world stays alive while its
      // clock is held.
      state.time += dt;
      // World clock: the single source every time-dependent system reads.
      sun.tick(dt * (state.timePaused ? 0 : state.timeScale));
      sky.setResolution(renderSize.x, renderSize.y);
      sky.update(state.time, camera, sun);
      water.update(state.time);

      const sample = (x, z) => water.height(x, z, state.time);
      boat.update(sample);
      boat2.update(sample);

      nightLighting.update(sun, character.mesh.getWorldPosition(_charWorld));
      character.setTint(nightLighting.characterTint);
      // The villager is a world entity, so its movement and schedule run on
      // WORLD time and stop with it. Its float, however, rides the sea — which
      // is on the animation clock — so that is passed separately and keeps
      // bobbing in step with the water even while the world is held.
      const worldDt = state.timePaused ? 0 : dt * state.timeScale;
      character.update(worldDt, camera, worldUnitsPerPixel,
        lightingUniforms.uLightDir.value, sun, state.time);
      weather.update(dt, state.time);
    },
  };

  applySeason(state, 'Spring');

  return state;
}

/** Repoint the shared directional light from spherical angles (degrees). */
export function setLightAngles(azimuthDeg, elevationDeg) {
  const az = THREE.MathUtils.degToRad(azimuthDeg);
  const el = THREE.MathUtils.degToRad(elevationDeg);
  lightingUniforms.uLightDir.value
    .set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
    .normalize();
}

/**
 * Apply a named lighting preset from palette.js.
 *
 * Everything that makes a time of day -- light angle and colour, ambient,
 * tone levels, shadow character, sky -- is set from one object, so adding
 * morning / sunset / night later means adding a preset, not editing shaders.
 */
export function applyLightingPreset(scene, name) {
  const preset = LIGHTING_PRESETS[name] ?? LIGHTING_PRESETS.Day;

  setLightAngles(preset.azimuth, preset.elevation);
  lightingUniforms.uLightColor.value.setHex(preset.lightColor);
  lightingUniforms.uSkyColor.value.setHex(preset.skyColor);
  lightingUniforms.uGroundColor.value.setHex(preset.groundColor);
  lightingUniforms.uShadowTint.value.setHex(preset.shadowTint);
  lightingUniforms.uAmbient.value = preset.ambient;
  lightingUniforms.uShadowLevel.value = preset.shadowLevel;
  lightingUniforms.uLightLevel.value = preset.lightLevel;

  shadowUniforms.uShadowStrength.value = preset.shadowStrength;
  shadowUniforms.uShadowDeepen.value = preset.shadowDeepen;
  shadowUniforms.uShadowTintStrength.value = preset.shadowTintStrength;

  if (scene) scene.background = new THREE.Color(preset.background);
  return preset;
}
