import * as THREE from 'three';
import { createNormalMaterial, lightingUniforms, shadowUniforms, nightUniforms } from '../rendering/ToonMaterial.js';
import { PALETTE } from '../util/palette.js';

import waterVert from '../rendering/shaders/water.vert.glsl?raw';
import waterFrag from '../rendering/shaders/water.frag.glsl?raw';

/**
 * The single source of truth for the sea surface.
 *
 * Both the water mesh and the boat sample this exact function, so the hull is
 * always sitting on the surface that is actually being drawn -- no independent
 * `boat.y = sin(t)` drift. If this is ever moved to a vertex shader, the JS
 * form must stay in lockstep so buoyancy still queries the same field.
 *
 * Coordinates are in the harbour group's LOCAL space.
 */
export function getWaveHeight(x, z, time, amplitude = 1, speed = 1) {
  const t = time * speed;
  let h = 0;
  h += Math.sin(x * 0.16 + t * 1.00) * 0.55;
  h += Math.sin(z * 0.21 - t * 0.80) * 0.42;
  h += Math.sin((x + z) * 0.11 + t * 1.40) * 0.30;
  h += Math.sin((x - z * 0.6) * 0.33 - t * 1.90) * 0.16;
  return h * amplitude;
}

// The sea needs a visible FAR EDGE. Under an orthographic camera there is no
// horizon for free: a plane centred on the origin simply runs off the top of
// the frame and the sky is never seen. So the water is a finite rectangle whose
// far edge sits inside the frame and becomes the horizon line, with the sky
// shell and the mountains showing above it.
const SIZE_X = 320;
const SIZE_Z = 140;
const FAR_EDGE_Z = -28;          // local z of the horizon
const SEG_X = 56;
const SEG_Z = 34;

/**
 * Height of the calm sea surface in the harbour's local frame.
 *
 * The land was originally authored with its top face at y = 0, which put the
 * coast exactly at sea level: every wave crest washed over the grass and the
 * shoreline had nothing to sit on. Dropping the sea instead of raising the land
 * keeps every prop's placement untouched and exposes the first submerged sand
 * shelf as a real beach.
 *
 * Anything that needs to sit on the water (the boats) must add this offset.
 */
export const WATER_LEVEL = -1.4;

export function createWater({ shoreTexture, shoreOrigin, shoreScale }) {
  // An indexed plane gives us the compact grid we evaluate the wave on...
  const source = new THREE.PlaneGeometry(SIZE_X, SIZE_Z, SEG_X, SEG_Z);
  source.rotateX(-Math.PI / 2);
  // Translate the GEOMETRY rather than the mesh, so local vertex coordinates
  // stay equal to harbour-local coordinates -- the wave function and the shore
  // map lookup both depend on that.
  source.translate(0, 0, FAR_EDGE_Z + SIZE_Z / 2);

  const gridPositions = source.attributes.position.array;
  const gridCount = source.attributes.position.count;

  // ...and the non-indexed copy gives every triangle its own vertices, so
  // computeVertexNormals() yields true FLAT face normals. Faceted water reads
  // far better at a third resolution than a smoothly interpolated surface, and
  // it gives the banding crisp facets to sit on.
  const geometry = source.toNonIndexed();
  const vertexToGrid = Array.from(source.index.array);

  const uniforms = {
    uWaterDeep:     { value: new THREE.Color(PALETTE.waterDeep) },
    uWaterMid:      { value: new THREE.Color(PALETTE.water) },
    uWaterShallow:  { value: new THREE.Color(PALETTE.waterShallow) },
    uWaterCrest:    { value: new THREE.Color(PALETTE.waterCrest) },
    uFoamColor:     { value: new THREE.Color(PALETTE.waterFoam) },

    uWaterToneSteps: { value: 4 },
    uBandLow:        { value: -1.15 },
    uBandHigh:       { value: 1.15 },

    uFoamAmount:    { value: 0.16 },
    uFoamThreshold: { value: 0.62 },
    uFoamSpeed:     { value: 0.55 },
    uCrestFoam:     { value: 0.55 },
    uWaveRhythm:    { value: 0.85 },
    uWaveBands:     { value: 4 },
    uTime:          { value: 0 },

    uShoreMap:    { value: shoreTexture },
    uShoreOrigin: { value: shoreOrigin.clone() },
    uShoreScale:  { value: shoreScale.clone() },

    ...lightingUniforms,
    ...shadowUniforms,
    uMoonlight: nightUniforms.uMoonlight,
    uMoonColor: nightUniforms.uMoonColor,
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: waterVert,
    fragmentShader: waterFrag,
  });
  material.userData.normalMaterial = createNormalMaterial();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'water';
  mesh.position.y = WATER_LEVEL;
  mesh.frustumCulled = false;
  // The sea receives shadows (pier, hulls) but must never cast onto itself --
  // a displaced surface self-shadowing at grazing light angles is pure acne.
  mesh.userData.castShadow = false;

  const heights = new Float32Array(gridCount);
  const positions = geometry.attributes.position;

  const state = {
    mesh,
    material,
    uniforms,
    amplitude: 0.9,
    speed: 1.0,
    height(x, z, time) {
      return getWaveHeight(x, z, time, state.amplitude, state.speed);
    },
    update(time) {
      uniforms.uTime.value = time;
      // 1. evaluate the wave once per grid vertex (cheap)
      for (let i = 0; i < gridCount; i++) {
        const x = gridPositions[i * 3];
        const z = gridPositions[i * 3 + 2];
        heights[i] = getWaveHeight(x, z, time, state.amplitude, state.speed);
      }
      // 2. scatter to the expanded (non-indexed) vertices
      const array = positions.array;
      for (let i = 0; i < vertexToGrid.length; i++) {
        array[i * 3 + 1] = heights[vertexToGrid[i]];
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals();   // flat, because the geometry is non-indexed
    },
  };

  state.update(0);
  return state;
}
