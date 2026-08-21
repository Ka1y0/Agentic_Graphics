/**
 * ===========================================================================
 *  Pixel Harbor colour language — ukiyo-e inspired coastal Japan
 * ===========================================================================
 *
 * One place where every colour in the world is decided. Nothing else in the
 * project should contain a raw hex literal.
 *
 * Direction: a Japanese seaside monzen-machi (the town that grows up in front
 * of a shrine gate), read through woodblock-print colour logic rather than
 * through realism.
 *
 * What that means concretely:
 *   - the sea is built on Prussian blue, the pigment that defines the look of
 *     the prints, ramped through a small number of clearly separated steps
 *   - vermilion is reserved almost entirely for the sacred structures (gate,
 *     torii), so it reads as meaning rather than decoration
 *   - roofs are kawara slate-grey, which lets the vermilion stay the only
 *     strong warm accent in the built environment
 *   - washi paper and lantern light supply the off-whites; there is no pure
 *     white anywhere, and no pure black, so every dark still carries hue
 *   - vegetation is muted and slightly cool, so sakura pink reads as an event
 *
 * Because `THREE.ColorManagement` is disabled these values reach the
 * framebuffer unmodified — what is written here is what appears on screen.
 */

export const PALETTE = {
  // ---- sky and distance --------------------------------------------------
  skyHigh:        0x7fa8c4,
  skyMid:         0xa8c6d4,
  skyLow:         0xdcd2b8,   // warm haze at the horizon
  cloud:          0xf2ece0,
  cloudShade:     0xd6cdbb,
  mountain:       0xbccbdd,
  mountainLight:  0xccd8e6,
  mountainSnow:   0xf4f6f2,
  craterShadow:   0x6f7c8c,   // inside the caldera, still carrying hue
  craterRim:      0x9aa8ba,
  mountainFar:    0xd8e1ea,

  // ---- sea (Prussian blue ramp) -----------------------------------------
  waterDeep:      0x16385c,
  water:          0x24587f,
  waterMid:       0x3c7fa4,
  waterShallow:   0x63a8bf,
  waterCrest:     0x9ccfd8,
  waterFoam:      0xeef1e8,

  // ---- ground ------------------------------------------------------------
  sand:           0xd6c39a,
  sandDark:       0xb8a37c,
  sandWet:        0x8f8062,
  grass:          0x5c8a4e,
  grassLight:     0x74a25c,
  grassShadow:    0x3d6440,
  dirt:           0x8a7052,
  dirtDark:       0x6b563e,

  // ---- stone -------------------------------------------------------------
  stone:          0x9a978c,
  stoneLight:     0xb3b0a4,
  stoneDark:      0x6e6b63,
  stonePath:      0x8f8c82,

  // ---- wood --------------------------------------------------------------
  plank:          0xa07b4e,
  plankAlt:       0x8a683f,
  wood:           0x8a6141,
  woodDark:       0x5e3f28,
  woodWarm:       0xb08a5a,
  rope:           0xc4ab7e,

  // ---- sacred / vermilion ------------------------------------------------
  vermilion:      0xc8442e,
  vermilionDark:  0x9a2f20,
  vermilionLight: 0xdd6349,

  // ---- buildings ---------------------------------------------------------
  roofTile:       0x475462,   // kawara slate
  roofTileDark:   0x2e373f,
  roofTileLight:  0x68727e,
  roofThatch:     0x9c8355,
  roofThatchDark: 0x7a6540,
  wallPlaster:    0xe0d8c0,   // shikkui
  wallWood:       0x8a6141,
  paper:          0xe8e2cc,   // shoji
  paperLit:       0xf5efd8,
  noren:          0x2f4f6b,   // indigo shop curtain

  // ---- vegetation --------------------------------------------------------
  foliageGreen:   0x4a7a4a,
  foliageDark:    0x335c3a,
  foliageLight:   0x669e56,
  pine:           0x3d6b4a,
  pineDark:       0x2a4d38,
  sakura:         0xf0b9c8,
  sakuraDark:     0xd08fa4,
  sakuraLight:    0xf9dbe3,
  bamboo:         0x7d9a4a,
  reed:           0x8a9a58,
  seaweed:        0x39764f,
  moss:           0x5c7444,

  // ---- props -------------------------------------------------------------
  sunDisc:        0xd8412f,   // the flag red, kept off every other surface
  sunHalo:        0xe89a72,
  lantern:        0xf2d78a,
  lanternPaper:   0xefe4c4,
  barrel:         0x8f6b42,
  barrelBand:     0x4a4a52,
  crate:          0xa8834e,
  crateDark:      0x836140,
  sailCloth:      0xeee5d0,
  netTwine:       0xb9ae8c,
  ink:            0x322b38,   // signage lettering — dark, but never pure black
  gold:           0xd4a94a,

  // ---- compatibility aliases --------------------------------------------
  // Kept only until the last western-cottage geometry is replaced by machiya.
  wall:           0xe0d8c0,
  wallAlt:        0xd0c4a4,
  wallStone:      0x9a978c,
  windowGlass:    0xe8e2cc,
  windowFrame:    0x8a6141,
  door:           0x5e3f28,
  lanternGlow:    0xf2d78a,
  roofRed:        0x515c68,
  roofRedDark:    0x3a444e,
  roofBlue:       0x4a5560,
  roofBlueDark:   0x333c45,
  flowerA:        0xe4d055,
  flowerB:        0xd76a8a,
  foliage:        0x4a7a4a,
};

/**
 * Lighting presets.
 *
 * Everything that defines "what time of day it is" lives in one object, so
 * adding morning / sunset / night later is a matter of adding entries here
 * rather than touching shaders or scene code.
 */
export const LIGHTING_PRESETS = {
  Day: {
    label: 'Day',
    azimuth: 38,
    elevation: 46,
    lightColor: 0xfff4dc,
    skyColor: 0x9fc0d8,
    groundColor: 0x53483c,
    shadowTint: 0xa8b8e0,
    background: 0xa8c6d4,
    ambient: 0.36,
    shadowLevel: 0.40,
    lightLevel: 1.04,
    shadowStrength: 0.85,
    shadowDeepen: 0.10,
    shadowTintStrength: 0.55,
  },
  'Golden Hour': {
    label: 'Golden Hour',
    azimuth: 108,
    elevation: 19,
    lightColor: 0xffd39a,
    skyColor: 0xf0b98a,
    groundColor: 0x5e4030,
    shadowTint: 0x9a92d8,
    background: 0xe8b184,
    ambient: 0.40,
    shadowLevel: 0.40,
    lightLevel: 1.22,
    shadowStrength: 0.92,
    shadowDeepen: 0.18,
    shadowTintStrength: 0.70,
  },
};

/**
 * A small ramp the optional palette-guided output pass snaps toward: the hues
 * the world is actually built from, so nudging final pixels toward the nearest
 * entry tightens the image without inventing colours that were never present.
 */
export const OUTPUT_RAMP = [
  0x101f33, 0x16385c, 0x24587f, 0x3c7fa4, 0x63a8bf, 0x9ccfd8, 0xeef1e8,
  0x3d6440, 0x5c8a4e, 0x74a25c, 0x2a4d38, 0x3d6b4a,
  0x5e3f28, 0x8a6141, 0xa07b4e, 0xb08a5a, 0xd6c39a, 0xe8e2cc,
  0x9a2f20, 0xc8442e, 0xdd6349,
  0x3a444e, 0x515c68, 0x68727e,
  0x6e6b63, 0x9a978c, 0xb3b0a4,
  0xd08fa4, 0xf0b9c8, 0xf9dbe3,
  0x6d7f96, 0x8798ab, 0xe8e8e2,
  0x241f24, 0xf2d78a,
];
