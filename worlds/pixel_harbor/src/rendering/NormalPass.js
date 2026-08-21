import * as THREE from 'three';
import { createNormalMaterial } from './ToonMaterial.js';

/**
 * Second geometry pass: re-renders the scene writing VIEW-SPACE normals into
 * its own low-resolution render target.
 *
 * Materials are swapped per-mesh (rather than via `scene.overrideMaterial`) so
 * that cut-out geometry such as the character billboard can supply its own
 * alpha-tested normal material and contribute a correct silhouette.
 */
export class NormalPass {
  constructor(width, height) {
    this.target = createNormalTarget(width, height);
    this.fallback = createNormalMaterial();
    // Background normal = (0,0,1) encoded, i.e. "facing the camera".
    this.background = new THREE.Color(0.5, 0.5, 1.0);
    this._saved = [];
  }

  setSize(width, height) {
    this.target.dispose();
    this.target = createNormalTarget(width, height);
  }

  get texture() {
    return this.target.texture;
  }

  render(renderer, scene, camera) {
    const saved = this._saved;
    saved.length = 0;

    scene.traverse((object) => {
      if (!object.isMesh) return;
      saved.push(object, object.material);
      object.material =
        object.material?.userData?.normalMaterial ?? this.fallback;
    });

    const prevBackground = scene.background;
    scene.background = this.background;

    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    scene.background = prevBackground;

    for (let i = 0; i < saved.length; i += 2) {
      saved[i].material = saved[i + 1];
    }
    saved.length = 0;
  }

  dispose() {
    this.target.dispose();
    this.fallback.dispose();
  }
}

function createNormalTarget(width, height) {
  return new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
    colorSpace: THREE.NoColorSpace,
  });
}
