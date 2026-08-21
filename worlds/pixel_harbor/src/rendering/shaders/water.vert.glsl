// Local position is passed through as well as world position: the wave-height
// bands and the shore-distance lookup are both authored in the harbour's local
// frame, which is where getWaveHeight() and the shore map live.
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vLocalPos;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos    = worldPos.xyz;
  vLocalPos    = position;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position  = projectionMatrix * viewMatrix * worldPos;
}
