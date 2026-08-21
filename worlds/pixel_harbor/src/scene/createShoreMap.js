import * as THREE from 'three';
import { WATER_LEVEL } from './createWater.js';

/**
 * ===========================================================================
 *  Shore distance field
 * ===========================================================================
 *
 * Bakes a "how far is this point from land" field once at startup, in the
 * harbour's local XZ frame. The water shader thresholds it against a moving
 * value to draw the foam line, which is what lets a tide edge advance and
 * retreat without any particle system or per-frame CPU work.
 *
 * The field is derived from the actual terrain meshes (anything tagged
 * `userData.isLand`), not from hand-copied rectangles, so moving a piece of
 * coastline in createHarbor.js automatically moves the foam.
 */

export const SHORE = {
  origin: new THREE.Vector2(-60, -40),   // local XZ of texel (0,0)
  scale: new THREE.Vector2(120, 100),    // world units covered
  resolution: 512,
  maxDistance: 12,                       // world units the 0..1 range spans
  // Only terrain that actually breaks the surface counts as coast. Tying this
  // to the real sea level (rather than a hand-picked constant) means the foam
  // line follows the waterline automatically if the water height is retuned.
  waterlineY: WATER_LEVEL,
};

export function createShoreMap(harborGroup) {
  const N = SHORE.resolution;
  const inside = new Uint8Array(N * N);

  // ---- 1. rasterize every land footprint into the grid -------------------
  const box = new THREE.Box3();
  const toLocal = new THREE.Matrix4();
  harborGroup.updateMatrixWorld(true);
  const worldToLocal = new THREE.Matrix4().copy(harborGroup.matrixWorld).invert();

  harborGroup.traverse((object) => {
    if (!object.isMesh || !object.userData.isLand) return;

    // The bounding box must be built in the harbour's LOCAL frame, which is the
    // frame the water shader and getWaveHeight both work in. Taking a world
    // AABB and rotating it back would inflate a 45-degree-rotated box by up to
    // sqrt(2) per axis and smear the coastline across the whole map.
    object.updateMatrixWorld(true);
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    box.copy(object.geometry.boundingBox);
    toLocal.multiplyMatrices(worldToLocal, object.matrixWorld);
    box.applyMatrix4(toLocal);

    if (box.max.y < SHORE.waterlineY) return;   // submerged shelf, not coast

    const x0 = Math.max(0, Math.floor(((box.min.x - SHORE.origin.x) / SHORE.scale.x) * N));
    const x1 = Math.min(N - 1, Math.ceil(((box.max.x - SHORE.origin.x) / SHORE.scale.x) * N));
    const z0 = Math.max(0, Math.floor(((box.min.z - SHORE.origin.y) / SHORE.scale.y) * N));
    const z1 = Math.min(N - 1, Math.ceil(((box.max.z - SHORE.origin.y) / SHORE.scale.y) * N));

    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) inside[z * N + x] = 1;
    }
  });

  // ---- 2. chamfer distance transform -------------------------------------
  // Two sweeps with a 3x3 chamfer kernel is plenty here: the field only needs
  // to be accurate within a couple of world units of the waterline.
  const INF = 1e9;
  const dist = new Float32Array(N * N);
  for (let i = 0; i < dist.length; i++) dist[i] = inside[i] ? 0 : INF;

  const D1 = 1.0;
  const D2 = Math.SQRT2;

  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = z * N + x;
      let d = dist[i];
      if (x > 0)            d = Math.min(d, dist[i - 1] + D1);
      if (z > 0)            d = Math.min(d, dist[i - N] + D1);
      if (x > 0 && z > 0)   d = Math.min(d, dist[i - N - 1] + D2);
      if (x < N - 1 && z > 0) d = Math.min(d, dist[i - N + 1] + D2);
      dist[i] = d;
    }
  }
  for (let z = N - 1; z >= 0; z--) {
    for (let x = N - 1; x >= 0; x--) {
      const i = z * N + x;
      let d = dist[i];
      if (x < N - 1)              d = Math.min(d, dist[i + 1] + D1);
      if (z < N - 1)              d = Math.min(d, dist[i + N] + D1);
      if (x < N - 1 && z < N - 1) d = Math.min(d, dist[i + N + 1] + D2);
      if (x > 0 && z < N - 1)     d = Math.min(d, dist[i + N - 1] + D2);
      dist[i] = d;
    }
  }

  // ---- 3. pack into a texture -------------------------------------------
  const worldPerTexel = SHORE.scale.x / N;
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    const world = Math.min(dist[i] * worldPerTexel, SHORE.maxDistance);
    const v = Math.round((world / SHORE.maxDistance) * 255);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }

  const texture = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.minFilter = THREE.LinearFilter;   // the field itself is smooth; the
  texture.magFilter = THREE.LinearFilter;   // foam is quantized afterwards
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;

  let landTexels = 0;
  for (let i = 0; i < inside.length; i++) landTexels += inside[i];

  return {
    texture,
    stats: {
      resolution: N,
      landTexels,
      landCoveragePct: +(100 * landTexels / (N * N)).toFixed(1),
      worldPerTexel: +worldPerTexel.toFixed(3),
      maxDistance: SHORE.maxDistance,
    },
  };
}
