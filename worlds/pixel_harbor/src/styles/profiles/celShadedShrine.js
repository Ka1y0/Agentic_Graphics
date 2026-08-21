/**
 * Style 02 — Cel-Shaded Shrine
 *
 * Render strategy: the same pipeline, rasterized at css/2 instead of css/3,
 * with the framing compensated so the composition is identical. More tone
 * bands, thinner and darker outlines, a cleaner sky.
 *
 * The point is a change of *medium*, not of subject: this is the same shrine
 * harbour drawn as an animation cel rather than as a woodblock print. Higher
 * internal resolution buys smoother silhouettes and finer line work; the tone
 * quantization stays, because flat banded shading is what cel shading IS —
 * it is the pixel grid that is relaxed, not the flatness.
 */
export const celShadedShrine = {
  id: 'cel',
  name: 'Cel-Shaded',
  category: 'toon',
  description: 'Animation-cel reading of the same shrine harbour: finer raster, more tone bands, crisp ink lines.',
  strategy: 'same pipeline @ css/2, higher tone-step count, thin dark outlines',
  styleMode: 1,
  hudSkin: 'cel',
  wipeColor: '#ffffff',

  renderer: { pixelScale: 2, pixelSnap: true, ascii: null },

  lighting: {
    toneSteps: 5,
    ambient: 0.42,
    shadowLevel: 0.52,
    lightLevel: 1.12,
    lightColor: 0xfff8e8,
    skyColor: 0xbcd8ee,
    groundColor: 0x6a5c4c,
    shadowTint: 0xb9c6ea,
    shadowStrength: 0.75,
    shadowDeepen: 0.06,
    shadowTintStrength: 0.45,
    shadowsEnabled: true,
  },

  // thinner, darker, more "inked" than the woodblock outlines
  outline: {
    depthThreshold: 0.0016,
    normalThreshold: 0.26,
    depthWeight: 1.0,
    normalWeight: 0.75,
    strength: 1.0,
    darkness: 0.42,
    saturation: 1.05,
    minLuma: 0.06,
  },

  post: { paletteEnabled: false },

  world: {
    skyVisible: true,
    skyBands: 7,
    cloudAmount: 0.30,
    skyHigh: 0x6fb7e8,
    skyMid: 0xa8d8f0,
    skyLow: 0xe4f0f4,
    cloud: 0xffffff,
    cloudShade: 0xdcecf6,
    waterToneSteps: 5,
    crestFoam: 0.42,
    foamAmount: 0.14,
  },
};
