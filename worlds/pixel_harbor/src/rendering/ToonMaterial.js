import * as THREE from 'three';

import toonVert   from './shaders/toon.vert.glsl?raw';
import toonFrag   from './shaders/toon.frag.glsl?raw';
import normalVert from './shaders/normal.vert.glsl?raw';
import normalFrag from './shaders/normal.frag.glsl?raw';
import { createShadowMaterial } from './ShadowPass.js';

/**
 * Uniform objects shared *by reference* across every scene material.
 * Because ShaderMaterial stores the `{ value }` object itself, mutating
 * `lightingUniforms.uToneSteps.value` from the debug GUI instantly retunes
 * every object in the harbour without rebuilding a single material.
 */
export const lightingUniforms = {
  uLightDir:    { value: new THREE.Vector3(0.55, 0.72, 0.42).normalize() },
  uLightColor:  { value: new THREE.Color(1.0, 0.96, 0.86) },
  uSkyColor:    { value: new THREE.Color(0.52, 0.70, 0.94) },
  uGroundColor: { value: new THREE.Color(0.34, 0.29, 0.25) },
  uShadowTint:  { value: new THREE.Color(0.70, 0.76, 1.0) },
  uAmbient:     { value: 0.34 },
  uToneSteps:   { value: 4 },
  uShadowLevel: { value: 0.38 },
  uLightLevel:  { value: 1.05 },
};

/**
 * Cast-shadow uniforms, also shared by reference. `uShadowMap` and
 * `uShadowMatrix` are filled in by PixelRenderer once per frame.
 */
/**
 * Night lighting, shared by reference across every scene material.
 *
 * Lamp positions live here rather than in individual materials because a lamp
 * lights its neighbours, not itself — the array has to be visible to every
 * surface in the world.
 */
export const nightUniforms = {
  uLampPos:      { value: Array.from({ length: 8 }, () => new THREE.Vector3()) },
  uLampColor:    { value: Array.from({ length: 8 }, () => new THREE.Color()) },
  uLampRange:    { value: new Array(8).fill(1) },
  uLampCount:    { value: 0 },
  uLampStrength: { value: 0 },
  uMoonlight:    { value: 0 },
  uMoonColor:    { value: new THREE.Color(0x7f93c8) },
  uLampGate:     { value: 0 },
  uWindowGate:   { value: 0 },
};

export const shadowUniforms = {
  uShadowMap:          { value: null },
  uShadowMatrix:       { value: new THREE.Matrix4() },
  uShadowEnabled:      { value: 1 },
  uShadowStrength:     { value: 0.85 },
  uShadowDeepen:       { value: 0.12 },
  uShadowTintStrength: { value: 0.55 },
  uShadowBias:         { value: 0.0009 },
  uShadowNormalBias:   { value: 0.22 },
  uShadowTexel:        { value: 1 / 1024 },
  uShadowDebug:        { value: 0 },
};

/** Default normal-pass material used for any mesh that does not supply one. */
export function createNormalMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAlphaMap:    { value: opts.alphaMap ?? null },
      uUseAlphaMap: { value: opts.alphaMap ? 1 : 0 },
      uAlphaTest:   { value: opts.alphaTest ?? 0.5 },
      uFlatNormal:  { value: opts.flatNormal ? 1 : 0 },
      uFrame:       opts.frameUniform ?? { value: new THREE.Vector4(0, 0, 1, 1) },
      uFlip:        opts.flipUniform  ?? { value: 0 },
    },
    vertexShader: normalVert,
    fragmentShader: normalFrag,
    side: opts.side ?? THREE.FrontSide,
  });
}

/**
 * Quantized-tone scene material.
 *
 * @param {object} opts
 *   color     base albedo
 *   colorB    second albedo for height banding (water)
 *   bands     enable height banding
 *   bandLow / bandHigh   world-Y range the banding spans
 */
export function createToonMaterial(opts = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor:    { value: new THREE.Color(opts.color ?? 0xffffff) },
      uColorB:   { value: new THREE.Color(opts.colorB ?? opts.color ?? 0xffffff) },
      uUseBands: { value: opts.bands ? 1 : 0 },
      uBandLow:  { value: opts.bandLow ?? 0 },
      uBandHigh: { value: opts.bandHigh ?? 1 },
      uSnowMix:   { value: opts.snow ? 1 : 0 },
      uSnowColor: { value: new THREE.Color(opts.snowColor ?? 0xffffff) },
      uCraterColor: { value: new THREE.Color(opts.craterColor ?? 0x808080) },
      ...lightingUniforms,
      ...shadowUniforms,
      ...nightUniforms,
      // per-material: which self-lit channel this surface belongs to
      uEmissiveKind:  { value: opts.emissive === 'lamp' ? 1 : (opts.emissive === 'window' ? 2 : 0) },
      uEmissiveColor: { value: new THREE.Color(opts.emissiveColor ?? 0xffe6b0) },
    },
    vertexShader: toonVert,
    fragmentShader: toonFrag,
    side: opts.side ?? THREE.FrontSide,
  });

  // The normal and shadow passes look these up per mesh.
  material.userData.normalMaterial = createNormalMaterial({ side: opts.side });
  material.userData.shadowMaterial = createShadowMaterial({ side: opts.side });
  return material;
}
