import * as THREE from 'three';

import { NormalPass }  from './NormalPass.js';
import { ShadowPass }  from './ShadowPass.js';
import { StylizePass } from './StylizePass.js';
import { AsciiPass }   from './AsciiPass.js';
import { lightingUniforms, shadowUniforms } from './ToonMaterial.js';

import fullscreenVert from './shaders/fullscreen.vert.glsl?raw';
import upscaleFrag    from './shaders/upscale.frag.glsl?raw';

/**
 * ===========================================================================
 *  The low-resolution pipeline
 * ===========================================================================
 *
 *   scene ──▶ [0] shadow map    (light's view, static bounds, texel-snapped)
 *         ──▶ [1] colour target  (low-res, + DepthTexture; samples the shadow map)
 *         ──▶ [2] normal target  (low-res, view-space normals)
 *                     │
 *                     ▼
 *              [3] stylize pass  (low-res: depth+normal edges, tone composite)
 *                     │
 *                     ▼
 *              [4] nearest upscale ──▶ canvas
 *
 * Rasterization genuinely happens at `css / pixelScale`. Nothing is rendered at
 * full resolution and then mosaicked.
 *
 * Integer-scale policy: the canvas is sized to `internal * pixelScale` exactly
 * and letterboxed inside the window (at most `pixelScale - 1` px of slack per
 * axis). That guarantees whole-number scaling with no fractional pixel blocks.
 */
export class PixelRenderer {
  constructor(container, { pixelScale = 3 } = {}) {
    this.container = container;
    this.pixelScale = pixelScale;

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,           // antialiasing would fight the pixel grid
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    // Retina must not multiply the backing store -- the pixel grid is ours.
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = true;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    this.canvas = this.renderer.domElement;
    this.canvas.id = 'view';
    container.appendChild(this.canvas);

    this.normalPass = null;
    this.shadowPass = new ShadowPass({ mapSize: 1024 });
    this.stylizePass = new StylizePass();

    // Optional terminal pass. It replaces the plain nearest upscale rather
    // than adding to it, so the ASCII style is a different *final* stage on
    // an otherwise identical pipeline.
    this.asciiPass = new AsciiPass();
    this.asciiEnabled = false;

    // hand the shared material uniforms their shadow inputs
    shadowUniforms.uShadowMap.value = this.shadowPass.depthTexture;
    shadowUniforms.uShadowMatrix.value = this.shadowPass.shadowMatrix;
    shadowUniforms.uShadowTexel.value = 1 / this.shadowPass.mapSize;

    // Final blit quad (nearest upscale to the canvas).
    this.upscaleMaterial = new THREE.ShaderMaterial({
      uniforms: { tStylized: { value: null } },
      vertexShader: fullscreenVert,
      fragmentShader: upscaleFrag,
      depthTest: false,
      depthWrite: false,
    });
    this.upscaleScene = new THREE.Scene();
    this.upscaleCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.upscaleMaterial);
    quad.frustumCulled = false;
    this.upscaleScene.add(quad);

    this.internalWidth = 1;
    this.internalHeight = 1;
    this.outputWidth = 1;
    this.outputHeight = 1;

    this.resize();
  }

  setPixelScale(scale) {
    this.pixelScale = Math.max(1, Math.round(scale));
    this.resize();
  }

  /** Rebuilds every target at the new internal resolution. */
  resize() {
    const cssWidth  = Math.max(1, window.innerWidth);
    const cssHeight = Math.max(1, window.innerHeight);
    const scale = this.pixelScale;

    this.internalWidth  = Math.max(32, Math.floor(cssWidth  / scale));
    this.internalHeight = Math.max(32, Math.floor(cssHeight / scale));
    this.outputWidth  = this.internalWidth  * scale;
    this.outputHeight = this.internalHeight * scale;

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(this.outputWidth, this.outputHeight, true);

    // The stage wrapper is exactly canvas-sized so the HUD lines up with it.
    this.container.style.width  = `${this.outputWidth}px`;
    this.container.style.height = `${this.outputHeight}px`;

    this._buildTargets(this.internalWidth, this.internalHeight);

    if (this.normalPass) this.normalPass.setSize(this.internalWidth, this.internalHeight);
    else this.normalPass = new NormalPass(this.internalWidth, this.internalHeight);

    this.stylizePass.setResolution(this.internalWidth, this.internalHeight);
    this.stylizePass.setInputs({
      color: this.colorTarget.texture,
      depth: this.depthTexture,
      normal: this.normalPass.texture,
    });
    this.upscaleMaterial.uniforms.tStylized.value = this.stylizedTarget.texture;
  }

  _buildTargets(width, height) {
    this.colorTarget?.dispose();
    this.depthTexture?.dispose();
    this.stylizedTarget?.dispose();

    // Depth texture must live at the same low resolution as everything else.
    this.depthTexture = new THREE.DepthTexture(width, height);
    this.depthTexture.format = THREE.DepthFormat;
    this.depthTexture.type = THREE.UnsignedIntType;   // 24-bit depth on WebGL2
    this.depthTexture.minFilter = THREE.NearestFilter;
    this.depthTexture.magFilter = THREE.NearestFilter;

    this.colorTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
      depthTexture: this.depthTexture,
      colorSpace: THREE.NoColorSpace,
    });

    this.stylizedTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,   // <- the exact nearest upscale
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      colorSpace: THREE.NoColorSpace,
    });
  }

  setAsciiEnabled(enabled) {
    this.asciiEnabled = !!enabled;
  }

  /** Rebuild the shadow map at a new resolution and re-point the uniforms. */
  setShadowMapSize(mapSize) {
    this.shadowPass.setMapSize(mapSize);
    shadowUniforms.uShadowMap.value = this.shadowPass.depthTexture;
    shadowUniforms.uShadowTexel.value = 1 / this.shadowPass.mapSize;
  }

  render(scene, camera, focusDistance, time = 0) {
    const renderer = this.renderer;
    this._time = time;

    // [0] shadow map from the light's point of view
    if (this.shadowPass.enabled && shadowUniforms.uShadowEnabled.value > 0.5) {
      this.shadowPass.update(lightingUniforms.uLightDir.value);
      this.shadowPass.render(renderer, scene);
      shadowUniforms.uShadowMap.value = this.shadowPass.depthTexture;
    }

    // [1] colour + depth, at internal resolution
    renderer.setRenderTarget(this.colorTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    // [2] view-space normals, same internal resolution
    this.normalPass.render(renderer, scene, camera);

    // [3] stylize (depth edges + normal edges + coloured outline)
    this.stylizePass.setCamera(camera, focusDistance);
    this.stylizePass.setTime(time);
    this.stylizePass.render(renderer, this.stylizedTarget);

    // [4] final stage: either the plain nearest upscale, or the terminal pass
    if (this.asciiEnabled) {
      this.asciiPass.setSizes(this.internalWidth, this.internalHeight, this.outputWidth, this.outputHeight);
      this.asciiPass.render(renderer, this.stylizedTarget.texture, this._time ?? 0);
    } else {
      renderer.setRenderTarget(null);
      renderer.render(this.upscaleScene, this.upscaleCamera);
    }
  }

  get info() {
    return {
      internal: `${this.internalWidth}x${this.internalHeight}`,
      output: `${this.outputWidth}x${this.outputHeight}`,
      scale: this.pixelScale,
    };
  }
}
