/**
 * Style 03 — Blueprint
 *
 * Render strategy: the composite pass discards the shaded image almost
 * entirely and rebuilds the frame from the geometry buffers.
 *   depth edges   -> heavy outer linework (the extent of an object)
 *   normal edges  -> lighter interior construction lines (how it is built)
 *   colour buffer -> collapsed to a faint luminance wash so masses still read
 *   plus a screen-locked drafting grid and edge tick marks
 *
 * This is the one style that is also a development tool: it is the clearest
 * possible view of what the depth and normal passes are actually resolving,
 * and it stays valid under the perspective camera.
 */
export const blueprint = {
  id: 'blueprint',
  name: 'Blueprint',
  category: 'technical',
  description: 'The harbour as a live drafting sheet: depth edges as outer linework, normal edges as construction lines.',
  strategy: 'geometry-buffer composite — edges become linework, colour becomes a faint wash, plus grid + ticks',
  styleMode: 2,
  hudSkin: 'blueprint',
  wipeColor: '#0d2745',

  renderer: { pixelScale: 3, pixelSnap: true, ascii: null },

  lighting: {
    toneSteps: 3,
    ambient: 0.5,
    shadowLevel: 0.6,
    lightLevel: 1.0,
    shadowsEnabled: false,   // shadows would only muddy the luminance wash
  },

  // both detectors run hot: this style is *made* of edges
  outline: {
    depthThreshold: 0.0016,
    normalThreshold: 0.16,
    depthWeight: 1.0,
    normalWeight: 1.0,
    strength: 1.0,
    darkness: 0.55,
    saturation: 1.0,
    minLuma: 0.0,
  },

  post: { paletteEnabled: false },

  styleUniforms: {
    uBlueprintBg: 0x0d2745,
    uBlueprintInk: 0xd6e8ff,
    uBlueprintGrid: 0x2f5f96,
    uBlueprintFill: 0.55,
    uGridAmount: 0.55,
    uGridSize: 12,
    uLineDensity: 0.85,
    uAnnotation: 0.35,
  },

  world: {
    skyVisible: false,       // the sheet is the background
    waterToneSteps: 6,       // more bands -> more contour lines on the sea
    crestFoam: 0.30,
    foamAmount: 0.10,
  },
};
