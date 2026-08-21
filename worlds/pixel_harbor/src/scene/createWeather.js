import * as THREE from 'three';

/**
 * ===========================================================================
 *  Seasonal particles — petals, leaves, snow
 * ===========================================================================
 *
 * One `THREE.Points` cloud, recycled: particles that fall out of the box wrap
 * back to the top, so the count is fixed and nothing is ever allocated per
 * frame.
 *
 * Points deliberately, not billboarded meshes. The normal and shadow passes
 * both iterate `object.isMesh`, so a Points cloud is skipped by each of them
 * automatically — the particles appear in the colour pass, take no part in edge
 * detection, and cast nothing. That is exactly right: a falling petal should
 * not acquire an outline or a shadow, and getting there needs no special-casing
 * anywhere in the pipeline.
 *
 * Point size is set in internal-resolution pixels, so a petal is a crisp 2x2
 * block on the pixel grid rather than a smoothly scaled sprite.
 */

const MAX_PARTICLES = 260;
const BOX = { x: 120, y: 46, z: 90, centreZ: 6 };

const vertexShader = `
uniform float uSize;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize;
}
`;

const fragmentShader = `
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  // square points: no round sprite, no soft edge — this is a pixel, not a dot
  gl_FragColor = vec4(uColor, uOpacity);
}
`;

export function createWeather(parent) {
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const speeds = new Float32Array(MAX_PARTICLES);
  const phases = new Float32Array(MAX_PARTICLES);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);

  const uniforms = {
    uSize: { value: 2 },
    uColor: { value: new THREE.Color(0xffffff) },
    uOpacity: { value: 1 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'weather';
  points.frustumCulled = false;
  points.userData.castShadow = false;
  parent.add(points);

  const reset = (i, top) => {
    positions[i * 3] = (Math.random() - 0.5) * BOX.x;
    positions[i * 3 + 1] = top ? BOX.y : Math.random() * BOX.y;
    positions[i * 3 + 2] = BOX.centreZ + (Math.random() - 0.5) * BOX.z;
    speeds[i] = 0.6 + Math.random() * 0.8;
    phases[i] = Math.random() * Math.PI * 2;
  };
  for (let i = 0; i < MAX_PARTICLES; i++) reset(i, false);

  const state = {
    points,
    uniforms,
    config: null,

    setSeason(season) {
      const w = season?.weather ?? null;
      state.config = w;
      if (!w) {
        geometry.setDrawRange(0, 0);
        points.visible = false;
        return;
      }
      points.visible = true;
      uniforms.uColor.value.setHex(w.color);
      uniforms.uSize.value = w.size;
      uniforms.uOpacity.value = w.kind === 'snow' ? 1 : 0.95;
      geometry.setDrawRange(0, Math.min(w.count, MAX_PARTICLES));
    },

    update(dt, time) {
      const w = state.config;
      if (!w) return;
      const count = Math.min(w.count, MAX_PARTICLES);
      for (let i = 0; i < count; i++) {
        positions[i * 3 + 1] -= w.fall * speeds[i] * dt * 6;
        // lateral drift: petals and leaves swing, snow barely does
        positions[i * 3] += Math.sin(time * 0.7 + phases[i]) * w.drift * dt;
        positions[i * 3 + 2] += Math.cos(time * 0.5 + phases[i]) * w.drift * 0.5 * dt;
        if (positions[i * 3 + 1] < -3) reset(i, true);
      }
      geometry.attributes.position.needsUpdate = true;
    },
  };

  return state;
}
