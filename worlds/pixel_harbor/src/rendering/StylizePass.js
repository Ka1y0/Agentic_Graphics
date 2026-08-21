import * as THREE from 'three';

import fullscreenVert from './shaders/fullscreen.vert.glsl?raw';
import stylizeFrag    from './shaders/stylize.frag.glsl?raw';
import { OUTPUT_RAMP } from '../util/palette.js';

export const DEBUG_MODES = {
  Final: 0,
  Color: 1,
  Depth: 2,
  Normal: 3,
  'Edge mask': 4,
  'Depth edge': 5,
  'Normal edge': 6,
};

/**
 * Fullscreen pass that reads colour + depth + normals and produces the
 * stylized low-resolution image (coloured geometric outlines).
 * Runs at the internal resolution -- the upscale happens afterwards.
 */
export class StylizePass {
  constructor() {
    this.uniforms = {
      tColor:  { value: null },
      tDepth:  { value: null },
      tNormal: { value: null },

      uResolution: { value: new THREE.Vector2(1, 1) },
      uCameraNear: { value: 0.1 },
      uCameraFar:  { value: 1000 },
      uIsOrtho:    { value: 1 },

      uDepthThreshold:    { value: 0.0022 },
      uNormalThreshold:   { value: 0.22 },
      uDepthWeight:       { value: 1.0 },
      uNormalWeight:      { value: 0.85 },
      uOutlineStrength:   { value: 1.0 },
      uOutlineDarkness:   { value: 0.55 },
      uOutlineSaturation: { value: 1.25 },
      uOutlineMinLuma:    { value: 0.075 },
      uNormalBias:        { value: new THREE.Vector3(1, 1, 1).normalize() },

      uDebugMode: { value: 0 },
      uDepthViewNear: { value: 90 },
      uDepthViewFar:  { value: 230 },

      uPalette:         { value: OUTPUT_RAMP.map((hex) => new THREE.Color(hex)) },
      uPaletteEnabled:  { value: 0 },      // experiment, off by default
      uPaletteStrength: { value: 0.55 },

      // ---- style mode -------------------------------------------------
      uStyleMode: { value: 0 },

      uBlueprintBg:   { value: new THREE.Color(0x0d2745) },
      uBlueprintInk:  { value: new THREE.Color(0xd6e8ff) },
      uBlueprintGrid: { value: new THREE.Color(0x2f5f96) },
      uBlueprintFill: { value: 0.55 },
      uGridAmount:    { value: 0.55 },
      uGridSize:      { value: 12 },
      uLineDensity:   { value: 0.85 },
      uAnnotation:    { value: 0.35 },

      uNeonSkyHigh:    { value: new THREE.Color(0x2a1b52) },
      uNeonSkyLow:     { value: new THREE.Color(0xd8407f) },
      uNeonBody:       { value: new THREE.Color(0x39e6f0) },
      uNeonEdge:       { value: new THREE.Color(0xff3fb4) },
      uNeonGrid:       { value: new THREE.Color(0xff4fd0) },
      uNeonGridAmount: { value: 0.85 },
      uNeonGlow:       { value: 0.9 },
      uNeonHorizon:    { value: 0.47 },
      uTimeless:       { value: 0 },

      uPaperColor:    { value: new THREE.Color(0xe8e0cd) },
      uGraphite:      { value: new THREE.Color(0x35302e) },
      uHatchDensity:  { value: 9.0 },
      uPaperStrength: { value: 0.55 },
      uLineDarkness:  { value: 0.80 },
      uHatchStart:    { value: 0.62 },
      uHatchWidth:    { value: 0.30 },
      uWashStrength:  { value: 0.55 },
      uContourWeight: { value: 1.0 },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: fullscreenVert,
      fragmentShader: stylizeFrag,
      depthTest: false,
      depthWrite: false,
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  setInputs({ color, depth, normal }) {
    this.uniforms.tColor.value = color;
    this.uniforms.tDepth.value = depth;
    this.uniforms.tNormal.value = normal;
  }

  /** Slow scroll for the neon grid. */
  setTime(time) { this.uniforms.uTimeless.value = time * 0.06; }

  setResolution(width, height) {
    this.uniforms.uResolution.value.set(width, height);
  }

  setCamera(camera, focusDistance = 160) {
    this.uniforms.uCameraNear.value = camera.near;
    this.uniforms.uCameraFar.value = camera.far;
    // During a transition this is a fractional value carried on the blend
    // camera, so the depth linearisation follows the projection continuously
    // instead of flipping at handover.
    this.uniforms.uIsOrtho.value = camera.userData.orthoFactor !== undefined
      ? camera.userData.orthoFactor
      : (camera.isOrthographicCamera ? 1 : 0);

    // Keep the depth debug view readable by centring it on whatever distance
    // the camera is actually working at.
    const spread = Math.max(20, focusDistance * 0.30);
    this.uniforms.uDepthViewNear.value = Math.max(camera.near, focusDistance - spread);
    this.uniforms.uDepthViewFar.value = focusDistance + spread;
  }

  render(renderer, target) {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
  }

  dispose() {
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}
