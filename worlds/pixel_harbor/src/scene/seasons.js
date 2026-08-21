import * as THREE from 'three';
import { PALETTE } from '../util/palette.js';

/**
 * ===========================================================================
 *  Seasons — real world state, not a colour filter
 * ===========================================================================
 *
 * A season is applied by remapping specific palette entries wherever they
 * appear in the scene. Every toon material remembers the hex it was built with
 * (`material.userData.baseHex`), so a season can be applied, changed and
 * re-applied any number of times without compounding — each pass starts from
 * the original colour, never from the last season's result.
 *
 * A deliberate rule for winter: **the vegetation does not die.** Trees keep
 * their crowns and simply carry snow, because this is a coastal shrine town
 * with pines and evergreen scrub, and a village of bare sticks would read as
 * abandonment rather than as winter. Ground, roofs and the pier gain snow by
 * remapping toward pale tones rather than by adding geometry, which keeps the
 * silhouettes — and the whole edge-detection pipeline — untouched.
 *
 * Fuji's snow is deliberately absent from every remap: its cap is permanent,
 * as it is on the real mountain.
 */

export const SEASON_ORDER = ['Spring', 'Summer', 'Autumn', 'Winter'];

export const SEASONS = {
  Spring: {
    name: 'Spring',
    label: 'Spring',
    dayLabel: 'Spring 12',
    // soft, bright, blossom-forward
    remap: {
      [PALETTE.foliageGreen]: 0x57975a,
      [PALETTE.foliageDark]: 0x3a6b46,
      [PALETTE.foliageLight]: 0x76b364,
      [PALETTE.grass]: 0x66965a,
      [PALETTE.grassLight]: 0x7cae66,
      [PALETTE.grassShadow]: 0x466b46,
    },
    water: { deep: PALETTE.waterDeep, mid: PALETTE.water, shallow: PALETTE.waterShallow, crest: PALETTE.waterCrest },
    weather: { kind: 'petal', count: 150, color: 0xf6c9d6, size: 2, fall: 0.9, drift: 1.5 },
    ambientBias: 0.0,
  },

  Summer: {
    name: 'Summer',
    label: 'Summer',
    dayLabel: 'Summer 12',
    // deepest greens, clearest water
    remap: {
      [PALETTE.foliageGreen]: 0x3d7a3d,
      [PALETTE.foliageDark]: 0x27552f,
      [PALETTE.foliageLight]: 0x59a049,
      [PALETTE.grass]: 0x4a8340,
      [PALETTE.grassLight]: 0x5f9a4c,
      [PALETTE.grassShadow]: 0x2f5c34,
      [PALETTE.sakura]: 0x6fa858,        // blossom is gone; the tree is in leaf
      [PALETTE.sakuraDark]: 0x4e8442,
      [PALETTE.sakuraLight]: 0x86bd68,
    },
    water: { deep: 0x134a70, mid: 0x1f6b95, shallow: 0x4fa8c4, crest: 0x8fd6dc },
    weather: null,
    ambientBias: 0.02,
  },

  Autumn: {
    name: 'Autumn',
    label: 'Autumn',
    dayLabel: 'Autumn 12',
    // warm turn; pines stay green so the hillside keeps structure
    remap: {
      [PALETTE.foliageGreen]: 0xc07c33,
      [PALETTE.foliageDark]: 0x8f5324,
      [PALETTE.foliageLight]: 0xdda44a,
      [PALETTE.grass]: 0x8a8a45,
      [PALETTE.grassLight]: 0xa3a052,
      [PALETTE.grassShadow]: 0x5f6335,
      [PALETTE.sakura]: 0xd98b4a,
      [PALETTE.sakuraDark]: 0xb06730,
      [PALETTE.sakuraLight]: 0xeeb066,
      [PALETTE.reed]: 0xb59a4e,
    },
    water: { deep: 0x1a4560, mid: 0x2b6b86, shallow: 0x5f9fae, crest: 0x9ac9c9 },
    weather: { kind: 'leaf', count: 110, color: 0xd08a3c, size: 2, fall: 1.25, drift: 2.2 },
    ambientBias: 0.0,
  },

  Winter: {
    name: 'Winter',
    label: 'Winter',
    dayLabel: 'Winter 12',
    // Snow arrives as a remap toward pale tones, not as new geometry, so no
    // silhouette changes and nothing for the edge pass to re-resolve.
    remap: {
      // vegetation survives; it just carries snow
      [PALETTE.foliageGreen]: 0x8fa89a,
      [PALETTE.foliageDark]: 0x5f7a70,
      [PALETTE.foliageLight]: 0xb9cbc0,
      [PALETTE.pine]: 0x476b56,
      [PALETTE.pineDark]: 0x335744,
      [PALETTE.sakura]: 0xd8dee4,
      [PALETTE.sakuraDark]: 0xb2bcc6,
      [PALETTE.sakuraLight]: 0xeef2f5,
      // ground and structures under snow
      [PALETTE.grass]: 0xd6dee4,
      [PALETTE.grassLight]: 0xe8eef2,
      [PALETTE.grassShadow]: 0xaab6c0,
      [PALETTE.sand]: 0xd9dbd8,
      [PALETTE.sandDark]: 0xbcc2c4,
      [PALETTE.dirt]: 0xa9a9a4,
      [PALETTE.dirtDark]: 0x8b8b88,
      [PALETTE.roofTile]: 0xc6d0d8,
      [PALETTE.roofTileLight]: 0xdde5ea,
      [PALETTE.plank]: 0xa89578,
      [PALETTE.stonePath]: 0xc4c8ca,
      [PALETTE.reed]: 0x9aa08a,
    },
    water: { deep: 0x18354d, mid: 0x2b5f79, shallow: 0x5b93a2, crest: 0xbcd8da },
    weather: { kind: 'snow', count: 220, color: 0xf2f6f8, size: 2, fall: 1.5, drift: 1.0 },
    ambientBias: 0.03,
  },
};

/**
 * Apply a season to everything already in the scene.
 *
 * Returns how many materials were touched, which is what the self-check uses to
 * confirm a season is real world state rather than a tint on the camera.
 */
export function applySeason(world, name) {
  const season = SEASONS[name] ?? SEASONS.Spring;
  const remap = season.remap ?? {};
  let changed = 0;

  world.scene.traverse((object) => {
    if (!object.isMesh) return;
    const uniforms = object.material?.uniforms;
    if (!uniforms?.uColor) return;

    const base = object.material.userData.baseHex
      ?? (object.material.userData.baseHex = uniforms.uColor.value.getHex());

    // Always start from the original colour so repeated changes never compound.
    const target = remap[base];
    uniforms.uColor.value.setHex(target ?? base);
    if (target !== undefined) changed++;
  });

  // sea tone
  const w = world.water?.uniforms;
  if (w && season.water) {
    w.uWaterDeep.value.setHex(season.water.deep);
    w.uWaterMid.value.setHex(season.water.mid);
    w.uWaterShallow.value.setHex(season.water.shallow);
    w.uWaterCrest.value.setHex(season.water.crest);
  }

  world.weather?.setSeason(season);
  world.season = season.name;
  return { season: season.name, materialsRetinted: changed };
}
