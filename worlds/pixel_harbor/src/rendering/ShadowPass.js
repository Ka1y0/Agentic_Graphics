import * as THREE from 'three';

import shadowVert from './shaders/shadow.vert.glsl?raw';
import shadowFrag from './shaders/shadow.frag.glsl?raw';

/**
 * ===========================================================================
 *  Directional shadow map
 * ===========================================================================
 *
 * Renders scene depth from the light's point of view. The result is consumed by
 * `toon.frag.glsl`, which does NOT composite a dark overlay: it uses the shadow
 * term to demote a surface down the existing quantized tone ladder, so a cast
 * shadow is simply "this pixel is in a lower tone band" and keeps the object's
 * own hue.
 *
 * Stability design
 * ----------------
 * The light camera is deliberately **static** -- fixed bounds covering the whole
 * harbour, rather than fitted to the view frustum each frame. The harbour is
 * only ~150 units across, so one fixed map covers it comfortably, and a shadow
 * map that never moves cannot crawl when the main camera pans: a given world
 * position always samples the same texel. On top of that the light camera's
 * position is snapped to its own texel grid, which keeps things stable if the
 * light angle is changed at runtime.
 *
 * Texel size is chosen to sit close to one screen pixel so shadow edges read as
 * deliberate pixel-art steps rather than sub-pixel noise.
 */

const SCENE_RADIUS = 82;      // world units the shadow map must cover
const DEPTH_RANGE = 420;

export class ShadowPass {
  constructor({ mapSize = 1024 } = {}) {
    this.mapSize = mapSize;
    this.center = new THREE.Vector3(0, 0, 0);
    this.radius = SCENE_RADIUS;
    this.enabled = true;

    this.camera = new THREE.OrthographicCamera(
      -this.radius, this.radius, this.radius, -this.radius, 1, DEPTH_RANGE,
    );

    this.shadowMatrix = new THREE.Matrix4();
    this._biasMatrix = new THREE.Matrix4().set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0,
    );

    this.material = createShadowMaterial();
    this._saved = [];

    this._buildTarget(mapSize);
  }

  _buildTarget(mapSize) {
    this.target?.dispose();
    this.depthTexture?.dispose();

    this.depthTexture = new THREE.DepthTexture(mapSize, mapSize);
    this.depthTexture.format = THREE.DepthFormat;
    this.depthTexture.type = THREE.UnsignedIntType;
    this.depthTexture.minFilter = THREE.NearestFilter;   // hard pixel edges, never PCF blur
    this.depthTexture.magFilter = THREE.NearestFilter;

    this.target = new THREE.WebGLRenderTarget(mapSize, mapSize, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
      depthTexture: this.depthTexture,
      colorSpace: THREE.NoColorSpace,
    });
  }

  setMapSize(mapSize) {
    if (mapSize === this.mapSize) return;
    this.mapSize = mapSize;
    this._buildTarget(mapSize);
  }

  /** World units covered by one shadow-map texel. */
  get texelWorldSize() {
    return (this.radius * 2) / this.mapSize;
  }

  /**
   * Position the light camera along `lightDir` and snap it onto its own texel
   * grid, so the shadow map samples the same world points frame after frame.
   */
  update(lightDir) {
    const dir = lightDir.clone().normalize();
    const distance = DEPTH_RANGE * 0.5;

    this.camera.position.copy(this.center).addScaledVector(dir, distance);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.center);
    this.camera.updateMatrixWorld(true);

    // --- texel snapping, same decomposition trick the main camera uses ---
    const texel = this.texelWorldSize;
    const m = this.camera.matrixWorld;
    const right = new THREE.Vector3().setFromMatrixColumn(m, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(m, 1);
    const fwd = new THREE.Vector3().setFromMatrixColumn(m, 2);

    const p = this.camera.position;
    const r = Math.round(p.dot(right) / texel) * texel;
    const u = Math.round(p.dot(up) / texel) * texel;
    const f = p.dot(fwd);
    p.set(0, 0, 0).addScaledVector(right, r).addScaledVector(up, u).addScaledVector(fwd, f);

    this.camera.updateMatrixWorld(true);
    this.camera.updateProjectionMatrix();

    this.shadowMatrix
      .copy(this._biasMatrix)
      .multiply(this.camera.projectionMatrix)
      .multiply(this.camera.matrixWorldInverse);
  }

  render(renderer, scene) {
    const saved = this._saved;
    saved.length = 0;

    scene.traverse((object) => {
      if (!object.isMesh) return;
      const wasVisible = object.visible;
      saved.push(object, object.material, wasVisible);

      if (object.userData.castShadow === false) {
        // the sea must not cast onto itself
        object.visible = false;
      } else if (object.userData.shadowOnly) {
        // proxies that exist only to punch a silhouette into the shadow map
        object.visible = true;
      }
      object.material = object.userData.shadowMaterial ?? object.material?.userData?.shadowMaterial ?? this.material;
    });

    const prevBackground = scene.background;
    scene.background = null;

    renderer.setRenderTarget(this.target);
    renderer.clear(true, true, false);
    renderer.render(scene, this.camera);
    renderer.setRenderTarget(null);

    scene.background = prevBackground;

    for (let i = 0; i < saved.length; i += 3) {
      saved[i].material = saved[i + 1];
      saved[i].visible = saved[i + 2];
    }
    saved.length = 0;
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
  }
}

export function createShadowMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAlphaMap: { value: opts.alphaMap ?? null },
      uUseAlphaMap: { value: opts.alphaMap ? 1 : 0 },
      uAlphaTest: { value: opts.alphaTest ?? 0.5 },
      uFrame: opts.frameUniform ?? { value: new THREE.Vector4(0, 0, 1, 1) },
      uFlip: opts.flipUniform ?? { value: 0 },
    },
    vertexShader: shadowVert,
    fragmentShader: shadowFrag,
    side: opts.side ?? THREE.FrontSide,
  });
}
