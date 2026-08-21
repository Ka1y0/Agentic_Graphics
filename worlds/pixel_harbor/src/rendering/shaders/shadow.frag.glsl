// Nothing is written to colour -- only the depth attachment matters. The alpha
// test is still required so cut-out casters (the character's shadow proxy)
// punch a correct silhouette into the shadow map instead of a solid quad.
uniform sampler2D uAlphaMap;
uniform float uUseAlphaMap;
uniform float uAlphaTest;
uniform vec4  uFrame;
uniform float uFlip;

varying vec2 vUv;

void main() {
  if (uUseAlphaMap > 0.5) {
    vec2 uv = vUv;
    if (uFlip > 0.5) uv.x = 1.0 - uv.x;
    uv = uFrame.xy + uv * uFrame.zw;
    if (texture2D(uAlphaMap, uv).a < uAlphaTest) discard;
  }
  gl_FragColor = vec4(1.0);
}
