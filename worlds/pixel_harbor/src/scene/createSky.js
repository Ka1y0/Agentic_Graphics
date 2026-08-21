import * as THREE from 'three';
import { createNormalMaterial } from '../rendering/ToonMaterial.js';
import { PALETTE } from '../util/palette.js';

import skyVert from '../rendering/shaders/sky.vert.glsl?raw';
import skyFrag from '../rendering/shaders/sky.frag.glsl?raw';

/**
 * Woodblock sky, carried on a tall cylindrical shell around the harbour.
 *
 * A sphere or a dome does not work here. An orthographic frustum is a *slab*,
 * not a pyramid, so anything at a large radius simply falls outside it and is
 * never rasterized -- which is why the first attempt rendered no sky at all. A
 * tall open cylinder works because its wall spans a huge vertical range at
 * every angle, so some part of it is always inside the slab, from any camera.
 *
 * Drawn first with depth writing disabled, so it never occludes anything and
 * leaves the depth buffer at the far plane. That matters: the stylize pass
 * treats far depth as background, which is exactly how the silhouettes of the
 * gate, the torii and the mountains get their outlines against the sky.
 */
const _ndc = new THREE.Vector2();

export function createSky(scene) {
  const uniforms = {
    uSkyHigh:     { value: new THREE.Color(PALETTE.skyHigh) },
    uSkyMid:      { value: new THREE.Color(PALETTE.skyMid) },
    uSkyLow:      { value: new THREE.Color(PALETTE.skyLow) },
    uCloud:       { value: new THREE.Color(PALETTE.cloud) },
    uCloudShade:  { value: new THREE.Color(PALETTE.cloudShade) },
    uBandSteps:   { value: 5 },
    uCloudAmount: { value: 0.42 },
    uTime:        { value: 0 },
    uResolution:  { value: new THREE.Vector2(1, 1) },
    uParallax:    { value: 0 },
    uSunCenterPx: { value: new THREE.Vector2(0, 0) },
    uSunRadiusPx: { value: 20 },
    // Artistic scale, still expressed as a fraction of frame height so it is
    // resolution independent; converted to pixels each frame.
    uSunRadius:   { value: 0.115 },
    uSunVisible:  { value: 1 },
    uSunColor:    { value: new THREE.Color(PALETTE.sunDisc) },
    uSunHalo:     { value: new THREE.Color(PALETTE.sunHalo) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });

  // The normal pass swaps materials per mesh; give the dome one that keeps the
  // same draw settings so it fills the normal buffer's background cleanly.
  const normalMaterial = createNormalMaterial({ flatNormal: true, side: THREE.BackSide });
  normalMaterial.depthWrite = false;
  normalMaterial.depthTest = false;
  material.userData.normalMaterial = normalMaterial;

  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(150, 150, 420, 32, 1, true), material);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.userData.castShadow = false;
  scene.add(mesh);

  return {
    mesh,
    uniforms,
    setResolution(width, height) { uniforms.uResolution.value.set(width, height); },
    update(time, camera, sun) {
      uniforms.uTime.value = time;
      if (sun) {
        const res = uniforms.uResolution.value;

        // ---- centre -----------------------------------------------------
        // The sun stays a screen-space graphic in both modes, on the arc
        // derived from its bearing and elevation. That arc is already
        // projection-independent, so it carries across a view transition
        // continuously with nothing to blend.
        //
        // Projecting a world-space sun direction for the 3D half was tried and
        // rejected: an orthographic camera cannot represent a celestial object
        // at all (a point placed at any useful distance leaves the frustum),
        // so the two halves cannot be reconciled, and in practice the projected
        // centre left the frame entirely. Screen-space in both modes is the
        // honest representation here.
        _ndc.copy(sun.screen);

        uniforms.uSunCenterPx.value.set(
          (_ndc.x * 0.5 + 0.5) * res.x,
          (_ndc.y * 0.5 + 0.5) * res.y,
        );

        // ---- radius -----------------------------------------------------
        // Half the frame height times the artistic fraction. One number for
        // both axes, so width always equals height by construction.
        uniforms.uSunRadiusPx.value = uniforms.uSunRadius.value * res.y * 0.5;

        // Keep drawing the disc until it has sunk a full diameter below the
        // horizon line, so the sea genuinely eats it from the bottom up
        // instead of the whole sprite blinking out the instant the sun's
        // *elevation* crosses zero — which cut ~445 visible pixels in one
        // frame at 18:00. No fade is involved: the disappearance is entirely
        // geometric occlusion by the sea, which is drawn after the sky pass.
        //
        // The threshold is measured, not guessed. Forcing the disc on and
        // sweeping the evening shows the sea has painted over every one of its
        // pixels by screen y 0.32 in the 2D framing and 0.27 in the 3D one;
        // the perspective horizon sits lower on screen, so 2D alone is not a
        // safe bound. One diameter below (0.242) clears both with margin, and
        // the flag still guarantees the disc can never show at night or climb
        // back into frame from underneath.
        const r = sun.discRadiusY ?? 0;
        uniforms.uSunVisible.value = _ndc.y > sun.horizonY - 2.0 * r ? 1 : 0;
      }
      // pan the cloud field with the camera's heading so the backdrop does not
      // feel pinned to the screen during the 3D reveal
      if (camera) {
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        uniforms.uParallax.value = Math.atan2(dir.x, dir.z) * 1.6;
      }
    },
  };
}
