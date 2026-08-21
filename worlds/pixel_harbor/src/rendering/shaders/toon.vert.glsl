// World-space normals are used for lighting (so shading does not swim when the
// camera orbits); view-space normals are produced separately by the normal pass.
varying vec3 vWorldNormal;
varying vec3 vWorldPos;

// Per-face snow mask. Geometry that does not supply it reads the default
// generic attribute value of 0, so every other material is unaffected.
attribute float aSnow;
varying float vSnow;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos    = worldPos.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vSnow = aSnow;
  gl_Position  = projectionMatrix * viewMatrix * worldPos;
}
