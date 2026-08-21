/**
 * Style 05 — ASCII / CRT
 *
 * Render strategy: the full ukiyo-e pipeline runs unchanged, then a dedicated
 * pass rebuilds the frame out of glyphs. Each character cell samples the
 * stylized buffer, maps luminance to a glyph from a procedurally generated
 * ramp atlas (" .:-=+*#%@"), and stamps it in phosphor green, with scanlines,
 * bloom, barrel-ish vignetting and a faint flicker over the top.
 *
 * Because the glyph is chosen from LUMINANCE and boosted by EDGE strength, the
 * harbour's silhouettes survive the translation — the torii, the gate and the
 * pier all stay readable rather than dissolving into noise.
 */
export const asciiCrt = {
  id: 'ascii',
  name: 'ASCII / CRT',
  category: 'terminal',
  description: 'The harbour on an old monitor: luminance-to-glyph mapping with scanlines, phosphor glow and vignette.',
  strategy: 'ukiyo-e pipeline -> glyph-cell pass (luminance ramp + edge boost) -> CRT post',
  styleMode: 0,
  hudSkin: 'terminal',
  wipeColor: '#0a1a0e',

  renderer: {
    pixelScale: 3,
    pixelSnap: true,
    ascii: {
      cellSize: 5,          // INTERNAL pixels; scaled by the pixel scale
      charsetDensity: 1.0,
      // Silhouette over shading. Weighting flat tone as heavily as edges made
      // the frame an even field of mid-ramp characters at any legible cell
      // size; letting edges dominate is what puts Fuji's cone, the gate and
      // the pier back on screen as recognisable shapes.
      toneWeight: 0.55,
      edgeBoost: 0.72,
      crtIntensity: 0.75,
      glow: 0.55,
      scanline: 0.45,
      contrast: 1.15,
      tint: 0x66ff88,
    },
  },

  lighting: {
    toneSteps: 5,          // more tone steps -> more glyph variety
    // Lifted, but not flattened: the previous values pushed the whole frame
    // into the top of the glyph ramp, leaving no range for the silhouette.
    ambient: 0.40,
    shadowLevel: 0.40,
    lightLevel: 1.14,
    shadowStrength: 0.7,
    shadowsEnabled: true,
  },

  outline: {
    depthThreshold: 0.0020,
    normalThreshold: 0.20,
    depthWeight: 1.0,
    normalWeight: 0.9,
    strength: 1.0,
    darkness: 0.45,
    saturation: 1.0,
    minLuma: 0.0,
  },

  post: { paletteEnabled: false },

  world: {
    skyVisible: true,
    skyBands: 4,
    cloudAmount: 0.4,
    waterToneSteps: 5,
    crestFoam: 0.6,
    foamAmount: 0.18,
  },
};
