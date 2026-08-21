// The sky gradient is driven by SCREEN position, not by geometry.
//
// An orthographic frustum is a slab, so only a narrow band of the surrounding
// shell is ever inside it — a gradient keyed to the shell's own local Y
// collapses to a single flat colour. Screen space also happens to be how a
// printed backdrop behaves: the bands belong to the picture, not the world.
//
// The screen position is read from gl_FragCoord in the fragment shader rather
// than interpolated from clip space here. On the surrounding cylinder some
// triangles straddle the camera plane, where clip.w changes sign and the
// interpolated value diverges — which showed up as pale vertical bands tearing
// across the sky under the perspective camera.
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
