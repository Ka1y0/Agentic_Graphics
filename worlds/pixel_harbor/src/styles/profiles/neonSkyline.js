/**
 * Style 06 — Neon Skyline
 *
 * Render strategy: the composite pass discards the shaded image and rebuilds
 * the frame under synthwave rules. The colour buffer collapses to a single
 * luminance ramp between two neon tones, so every material reads as the same
 * emissive substance; the sky becomes a hard banded vertical gradient; a
 * perspective grid whose spacing compresses toward the horizon is laid over the
 * ground plane; and the geometry edges come back as glowing linework instead of
 * darkened base colour.
 *
 * The world underneath is untouched — same harbour, same Fuji, same shrine gate,
 * same sun. That is the whole point: it is a viewing law, not a second scene.
 */
export const neonSkyline = {
  id: 'neon',
  name: 'Neon Skyline',
  category: 'synthwave',
  description: 'The same shrine harbour under synthwave law: luminance ramp, banded sky, receding grid, glowing edges.',
  strategy: 'geometry-buffer composite — luminance ramp + banded neon sky + perspective grid + emissive edges',
  styleMode: 4,
  hudSkin: 'neon',
  wipeColor: '#d8407f',

  renderer: { pixelScale: 3, pixelSnap: true, ascii: null },

  lighting: {
    toneSteps: 5,
    ambient: 0.45,
    shadowLevel: 0.30,
    lightLevel: 1.25,
    shadowsEnabled: true,
  },

  // edges carry the whole drawing here, so both detectors run hot
  outline: {
    depthThreshold: 0.0017,
    normalThreshold: 0.17,
    depthWeight: 1.0,
    normalWeight: 1.0,
    strength: 1.0,
    darkness: 0.5,
    saturation: 1.0,
    minLuma: 0.0,
  },

  post: { paletteEnabled: false },

  styleUniforms: {
    uNeonSkyHigh: 0x241249,
    uNeonSkyLow: 0xe0417f,
    uNeonBody: 0x2fd8e8,
    uNeonEdge: 0xff45bb,
    uNeonGrid: 0xff53d2,
    uNeonGridAmount: 0.85,
    uNeonGlow: 0.95,
    uNeonHorizon: 0.47,
  },

  world: {
    skyVisible: false,     // the banded gradient IS the sky here
    waterToneSteps: 6,
    crestFoam: 0.35,
    foamAmount: 0.12,
  },
};
