/**
 * Styles that are deliberately NOT implemented yet.
 *
 * Each of these needs work at the asset level, not the shader level, and a
 * half-built version would be worse than an honest placeholder — it would
 * misrepresent what the style system can currently do. They are registered so
 * the architecture has a real slot for them and the switcher can show where
 * the system is going.
 */
export const futureStyles = [
  {
    id: 'lowpoly',
    name: 'Low-Poly',
    category: 'geometric',
    future: true,
    description: 'Flat-shaded faceted look with a rebalanced material language.',
    reason:
      'The world is currently authored for a pixel grid: geometry is chunky because it has to survive a third '
      + 'resolution, and the palette is tuned for quantized bands. A convincing low-poly pass needs the silhouettes '
      + 'rebalanced and per-face colour variation authored in, which is asset work rather than a render mode.',
  },
  {
    id: 'voxel',
    name: 'Voxel',
    category: 'geometric',
    future: true,
    description: 'The harbour rebuilt on a voxel lattice.',
    reason:
      'Voxels are a content representation, not a shading choice. Every asset would need to be re-authored on a '
      + 'lattice, or voxelized at build time, and the wave surface and sprite character would both need voxel-aware '
      + 'equivalents. There is no honest way to fake it from the existing meshes.',
  },
  {
    id: 'photoreal',
    name: 'Photoreal / PBR',
    category: 'realistic',
    future: true,
    description: 'Physically based materials, IBL and post-processing.',
    reason:
      'Needs albedo/roughness/metalness/normal maps per material, an environment probe, and real antialiasing — all '
      + 'of which the project deliberately does without. It also fights the two rules the renderer is built on '
      + '(no smooth gradients, no sub-pixel detail), so it is a separate pipeline rather than a profile.',
  },
];
