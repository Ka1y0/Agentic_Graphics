// Trivial nearest-neighbour blit from the low-res stylized buffer to the canvas.
// tStylized uses THREE.NearestFilter and the canvas is an exact integer multiple
// of the internal resolution, so one internal texel == one N x N pixel block.
uniform sampler2D tStylized;
varying vec2 vUv;

void main() {
  gl_FragColor = vec4(texture2D(tStylized, vUv).rgb, 1.0);
}
