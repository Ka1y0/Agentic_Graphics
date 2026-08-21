/**
 * Style 04 — Pencil Sketch
 *
 * Render strategy: composite pass replaces shading with ruled hatching whose
 * ANGLE comes from the view-space normal, so every surface is stroked along
 * its own orientation — the sea, a roof plane, a torii post and a tree crown
 * each end up with a different stroke direction, the way a hand would draw
 * them. Tone selects how many hatch layers stack; the geometry edges become
 * the heavier contour line on top.
 *
 * That normal-driven angle is the difference between this and an edge filter
 * with a paper texture behind it: the interior of every object still describes
 * its own form.
 */
export const pencilSketch = {
  id: 'pencil',
  name: 'Pencil Sketch',
  category: 'drawn',
  description: 'Living concept sketch: normal-driven hatching, layered by tone, with geometry edges as contour.',
  strategy: 'composite pass — contour-led: flat tonal wash, hatching restricted to the darks, sea reduced to band lines, sky left blank',
  styleMode: 3,
  hudSkin: 'paper',
  wipeColor: '#e8e0cd',

  renderer: { pixelScale: 3, pixelSnap: true, ascii: null },

  lighting: {
    toneSteps: 6,          // more tonal steps -> finer hatch layering
    ambient: 0.45,
    shadowLevel: 0.40,
    lightLevel: 1.10,
    shadowStrength: 0.9,
    shadowDeepen: 0.14,
    shadowsEnabled: true,  // cast shadows become dense hatch areas
  },

  outline: {
    depthThreshold: 0.0018,
    normalThreshold: 0.18,
    depthWeight: 1.0,
    normalWeight: 0.9,
    strength: 1.0,
    darkness: 0.5,
    saturation: 1.0,
    minLuma: 0.0,
  },

  post: { paletteEnabled: false },

  styleUniforms: {
    uPaperColor: 0xe8e0cd,
    uGraphite: 0x35302e,
    uHatchDensity: 9.0,
    uPaperStrength: 0.55,
    uLineDarkness: 0.80,
    uHatchStart: 0.62,      // paper stays paper until a surface is genuinely dark
    uHatchWidth: 0.30,
    uWashStrength: 0.55,    // flat greys carry the tone that hatching used to
    uContourWeight: 1.0,
  },

  world: {
    skyVisible: true,
    skyBands: 4,
    cloudAmount: 0.5,
    waterToneSteps: 5,
    crestFoam: 0.5,
    foamAmount: 0.16,
  },
};
