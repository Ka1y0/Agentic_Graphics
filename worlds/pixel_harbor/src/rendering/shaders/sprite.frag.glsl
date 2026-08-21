// Cut-out pixel sprite. Alpha-tested (not blended) so it writes correct depth
// and therefore gets a proper depth-edge outline like every other object.
uniform sampler2D uMap;
uniform vec4  uFrame;   // offset.xy, scale.zw
uniform float uFlip;
uniform vec3  uTint;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  if (uFlip > 0.5) uv.x = 1.0 - uv.x;
  uv = uFrame.xy + uv * uFrame.zw;

  vec4 c = texture2D(uMap, uv);
  if (c.a < 0.5) discard;

  gl_FragColor = vec4(c.rgb * uTint, 1.0);
}
