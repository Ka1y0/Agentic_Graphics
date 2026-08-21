// Writes view-space normals encoded as n * 0.5 + 0.5.
// Supports the cut-out sprite (alpha map + sprite-sheet frame) so the character
// contributes a correct silhouette instead of a full quad.
uniform sampler2D uAlphaMap;
uniform float uUseAlphaMap;
uniform float uAlphaTest;
uniform float uFlatNormal;   // 1.0 -> force (0,0,1), used by billboards
uniform vec4  uFrame;        // sprite-sheet frame: offset.xy, scale.zw
uniform float uFlip;

varying vec3 vViewNormal;
varying vec2 vUv;

void main() {
  if (uUseAlphaMap > 0.5) {
    vec2 uv = vUv;
    if (uFlip > 0.5) uv.x = 1.0 - uv.x;
    uv = uFrame.xy + uv * uFrame.zw;
    if (texture2D(uAlphaMap, uv).a < uAlphaTest) discard;
  }

  vec3 n = normalize(vViewNormal);
  if (uFlatNormal > 0.5) n = vec3(0.0, 0.0, 1.0);

  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
}
