import { PALETTE } from '../../util/palette.js';

/**
 * Style 01 — Ukiyo-e Pixel  (default, and the project's identity)
 *
 * Render strategy: the full low-resolution pipeline.
 *   shadow map -> colour+depth @ css/3 -> view-space normals @ css/3
 *   -> composite (depth edges + normal edges + base-colour outlines)
 *   -> nearest integer upscale
 *
 * This profile is the canonical settings of everything built in Phases 1-3;
 * it is the baseline the other styles are departures from, not an alternative
 * to them.
 */
export const ukiyoePixel = {
  id: 'ukiyoe',
  name: 'Ukiyo-e Pixel',
  category: 'pixel',
  description: 'True low-res rasterization, depth+normal geometry edges, base-colour outlines, quantized tone.',
  strategy: 'low-res pipeline + depth/normal edge composite + nearest upscale',
  styleMode: 0,
  hudSkin: 'washi',
  wipeColor: '#e8e2cc',

  renderer: { pixelScale: 3, pixelSnap: true, ascii: null },

  lighting: {
    toneSteps: 4,
    ambient: 0.36,
    shadowLevel: 0.40,
    lightLevel: 1.04,
    lightColor: 0xfff4dc,
    skyColor: 0x9fc0d8,
    groundColor: 0x53483c,
    shadowTint: 0xa8b8e0,
    shadowStrength: 0.85,
    shadowDeepen: 0.10,
    shadowTintStrength: 0.55,
    shadowsEnabled: true,
  },

  outline: {
    depthThreshold: 0.0022,
    normalThreshold: 0.22,
    depthWeight: 1.0,
    normalWeight: 0.85,
    strength: 1.0,
    darkness: 0.55,
    saturation: 1.25,
    minLuma: 0.075,
  },

  post: { paletteEnabled: false, paletteStrength: 0.55 },

  world: {
    skyVisible: true,
    skyBands: 5,
    cloudAmount: 0.24,
    skyHigh: PALETTE.skyHigh,
    skyMid: PALETTE.skyMid,
    skyLow: PALETTE.skyLow,
    cloud: PALETTE.cloud,
    cloudShade: PALETTE.cloudShade,
    waterToneSteps: 4,
    crestFoam: 0.55,
    foamAmount: 0.16,
  },
};
