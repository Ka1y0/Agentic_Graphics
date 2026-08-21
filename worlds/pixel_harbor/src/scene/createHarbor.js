import * as THREE from 'three';
import { createToonMaterial } from '../rendering/ToonMaterial.js';
import { PALETTE } from '../util/palette.js';
import {
  createTorii, createGate, createStoneLantern, createMachiya, createSteps,
} from './createJapanese.js';
import { SOUTH_FACING_YAW } from './orientation.js';

/**
 * Everything here is authored in the harbour group's LOCAL frame, where
 *      +X = screen right
 *      -Z = screen "up"/away (out to sea)
 *      +Y = up
 * The group itself is rotated in createScene.js so that this local frame lines
 * up with the default orthographic camera. Authoring stays trivially readable.
 *
 * Land sits at +Z (near the camera, bottom of frame), the sea at -Z.
 */

const materialCache = new Map();

function mat(color, extra) {
  if (extra) return createToonMaterial({ color, ...extra });
  if (!materialCache.has(color)) materialCache.set(color, createToonMaterial({ color }));
  return materialCache.get(color);
}

function box(parent, { w, h, d, x = 0, y = 0, z = 0, color, ry = 0, rx = 0, rz = 0 }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, { rt, rb, h, seg = 8, x = 0, y = 0, z = 0, color, ry = 0, rx = 0, rz = 0 }) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

function cone(parent, { r, h, seg = 4, x = 0, y = 0, z = 0, color, ry = 0 }) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(color));
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  parent.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
//  Terrain: a grass plateau and a genuinely sloped beach running into the sea
//
//  The beach is built from many SHALLOW steps rather than a few tall ones. At a
//  34-degree camera elevation a 1.2-unit step hides ~1.8 units of everything
//  behind it, which is what previously buried the entire waterline (and the
//  foam with it). A 0.28-unit step hides ~0.4, so the tide line stays visible
//  while the terracing still reads as deliberate pixel-art banding.
// ---------------------------------------------------------------------------
function createTerrain(parent) {
  const group = new THREE.Group();
  group.name = 'terrain';
  // Tagged so createShoreMap can bake the foam line straight off the real
  // coastline geometry instead of a hand-copied list of rectangles.
  const land = (mesh) => { mesh.userData.isLand = true; return mesh; };

  // main grass plateau (top face at y = 0, where every prop is placed)
  land(box(group, { w: 74, h: 6, d: 40, x: 0, y: -3, z: 25, color: PALETTE.grass }));
  land(box(group, { w: 74, h: 5, d: 40, x: 0, y: -8, z: 25, color: PALETTE.dirt }));

  // a slightly lighter grass lip along the top of the beach, so the grass has
  // its own edge rather than dissolving straight into sand
  land(box(group, { w: 70, h: 0.5, d: 3.0, x: -1, y: -0.2, z: 5.6, color: PALETTE.grassLight }));

  // ---- the beach ---------------------------------------------------------
  const STEPS = 11;
  const STEP_DEPTH = 1.5;
  const STEP_DROP = 0.28;
  const zTop = 5.0;
  for (let i = 0; i < STEPS; i++) {
    const z = zTop - i * STEP_DEPTH;
    const top = -i * STEP_DROP;
    const t = i / (STEPS - 1);
    const width = 66 - t * 26;           // the beach narrows as it enters the water
    const xOffset = -1 - t * 7;
    // Dry sand above the waterline, wet sand below. Deliberately NOT
    // alternating light/dark per step: the step risers already shade darker
    // than the treads, so per-step colour banding on top of that just reads as
    // stripes rather than as a beach.
    let color = PALETTE.sand;
    if (top <= -1.35) color = PALETTE.sandWet;
    else if (top <= -0.7) color = PALETTE.sandDark;      // damp band at the tide mark
    land(box(group, {
      w: width, h: 4 + i * STEP_DROP, d: STEP_DEPTH + 0.02,
      x: xOffset, y: top - (4 + i * STEP_DROP) / 2, z, color,
    }));
  }

  // a few rocks bedded into the beach so the slope is not a clean ramp
  land(box(group, { w: 5, h: 1.2, d: 3, x: -24, y: -0.9, z: 1.5, color: PALETTE.stone }));
  land(box(group, { w: 4, h: 0.9, d: 2.4, x: 17, y: -1.2, z: 0.5, color: PALETTE.stone }));

  // rocky headland on the right, breaks up the straight shoreline
  land(box(group, { w: 14, h: 6, d: 10, x: 25, y: -1.0, z: 3, color: PALETTE.stone }));
  land(box(group, { w: 10, h: 3.4, d: 7, x: 28, y: 1.2, z: 0, color: PALETTE.stoneDark }));
  land(box(group, { w: 9, h: 2.2, d: 5, x: 23, y: 1.0, z: 5, color: PALETTE.grassShadow }));
  land(box(group, { w: 5, h: 1.6, d: 3.4, x: 20, y: -1.4, z: -3.5, color: PALETTE.stoneDark }));

  parent.add(group);
  return group;
}

// ---------------------------------------------------------------------------
//  Pier: planks + cross beams + posts. Deliberately built so that the top
//  surface, the side surface and the posts all meet at hard 90 degree creases
//  -- this is the primary test case for the normal-edge detector.
// ---------------------------------------------------------------------------
function createPier(parent) {
  const group = new THREE.Group();
  group.name = 'pier';

  const deckY = 1.6;
  const zStart = 4;
  const zEnd = -18;
  const width = 7;

  // individual planks, alternating tone
  const plankDepth = 1.5;
  const gap = 0.12;
  let i = 0;
  for (let z = zStart; z > zEnd; z -= plankDepth + gap, i++) {
    box(group, {
      w: width, h: 0.42, d: plankDepth, x: 0, y: deckY, z,
      color: i % 2 === 0 ? PALETTE.plank : PALETTE.plankAlt,
    });
  }

  // longitudinal beams under the deck (visible side surface)
  for (const x of [-width / 2 + 0.5, width / 2 - 0.5]) {
    box(group, {
      w: 0.9, h: 0.9, d: Math.abs(zEnd - zStart), x, y: deckY - 0.62,
      z: (zStart + zEnd) / 2, color: PALETTE.woodDark,
    });
  }

  // posts down into the water
  for (let z = zStart - 1; z > zEnd + 1; z -= 5.2) {
    for (const x of [-width / 2 + 0.6, width / 2 - 0.6]) {
      cylinder(group, {
        rt: 0.42, rb: 0.5, h: 6.5, seg: 6, x, y: deckY - 3.4, z, color: PALETTE.woodDark,
      });
    }
  }

  // a couple of mooring bollards
  for (const z of [-6, -20]) {
    cylinder(group, { rt: 0.34, rb: 0.4, h: 1.5, seg: 6, x: width / 2 - 0.8, y: deckY + 0.85, z, color: PALETTE.woodDark });
  }

  // small railing section at the far end
  for (const x of [-width / 2 + 0.6, width / 2 - 0.6]) {
    box(group, { w: 0.22, h: 1.5, d: 0.22, x, y: deckY + 0.9, z: zEnd + 1.2, color: PALETTE.woodDark });
  }
  box(group, { w: width - 1.0, h: 0.22, d: 0.22, x: 0, y: deckY + 1.5, z: zEnd + 1.2, color: PALETTE.woodDark });

  parent.add(group);
  return group;
}

// ---------------------------------------------------------------------------
//  Houses
//
//  Detail rule for everything below: if a feature would shrink to isolated
//  single pixels at the internal resolution it is not worth adding. At
//  9 px/world-unit a 0.3-unit trim is ~3 px wide -- readable. A 0.1-unit one
//  is not, and only adds shimmer. So the detailing is chunky on purpose:
//  overhangs, thick frames, visible beams.
// ---------------------------------------------------------------------------
function createHouse(parent, { x, z, ry = 0, roofColor, roofDark, wallColor, scale = 1, porch = true }) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = ry;
  group.scale.setScalar(scale);

  const w = 8, h = 5.5, d = 7;

  // ---- walls -------------------------------------------------------------
  box(group, { w, h, d, y: h / 2, color: wallColor });
  // stone footing, grounds the building instead of it floating on the grass
  box(group, { w: w + 0.4, h: 0.7, d: d + 0.4, y: 0.35, color: PALETTE.wallStone });
  // gable band under the eaves
  box(group, { w: w + 0.3, h: 0.55, d: d + 0.3, y: h - 0.25, color: PALETTE.wallAlt });

  // ---- timber framing ----------------------------------------------------
  for (const cx of [-w / 2, w / 2]) {
    for (const cz of [-d / 2, d / 2]) {
      box(group, { w: 0.5, h, d: 0.5, x: cx, y: h / 2, z: cz, color: PALETTE.woodDark });
    }
  }
  // a horizontal beam across the front and back
  for (const bz of [-d / 2 - 0.03, d / 2 + 0.03]) {
    box(group, { w: w + 0.1, h: 0.4, d: 0.3, y: 3.4, z: bz, color: PALETTE.woodDark });
  }

  // ---- roof with a real overhang ----------------------------------------
  const roof = cone(group, { r: w * 0.95, h: 3.6, seg: 4, y: h + 1.75, color: roofColor, ry: Math.PI / 4 });
  roof.scale.set(1, 1, d / w);
  // eave board: the dark lip that makes the overhang read at low resolution
  const eave = cone(group, { r: w * 0.99, h: 0.5, seg: 4, y: h + 0.32, color: roofDark, ry: Math.PI / 4 });
  eave.scale.set(1, 1, d / w);

  // ---- chimney -----------------------------------------------------------
  box(group, { w: 1.2, h: 3.0, d: 1.2, x: w * 0.26, y: h + 2.0, z: -d * 0.18, color: PALETTE.wallStone });
  box(group, { w: 1.5, h: 0.4, d: 1.5, x: w * 0.26, y: h + 3.5, z: -d * 0.18, color: PALETTE.stoneDark });

  // ---- door with a frame -------------------------------------------------
  box(group, { w: 2.0, h: 3.1, d: 0.3, y: 1.55, z: d / 2 + 0.06, color: PALETTE.woodDark });
  box(group, { w: 1.5, h: 2.7, d: 0.36, y: 1.35, z: d / 2 + 0.1, color: PALETTE.door });
  box(group, { w: 0.25, h: 0.25, d: 0.2, x: 0.45, y: 1.4, z: d / 2 + 0.28, color: PALETTE.lanternGlow });

  // ---- windows with frames ----------------------------------------------
  const addWindow = (wx, wz, faceZ) => {
    const dd = faceZ ? 0.3 : 0.0;
    if (faceZ) {
      box(group, { w: 1.9, h: 1.9, d: 0.28, x: wx, y: 3.2, z: wz, color: PALETTE.windowFrame });
      box(group, { w: 1.4, h: 1.4, d: 0.34, x: wx, y: 3.2, z: wz, color: PALETTE.windowGlass });
      box(group, { w: 2.1, h: 0.3, d: 0.6, x: wx, y: 2.15, z: wz + 0.12, color: PALETTE.woodWarm });
    } else {
      box(group, { w: 0.28, h: 1.9, d: 1.9, x: wx, y: 3.2, z: wz, color: PALETTE.windowFrame });
      box(group, { w: 0.34, h: 1.4, d: 1.4, x: wx, y: 3.2, z: wz, color: PALETTE.windowGlass });
    }
  };
  addWindow(-2.5, d / 2 + 0.05, true);
  addWindow(2.5, d / 2 + 0.05, true);
  addWindow(w / 2 + 0.05, 0.8, false);

  // ---- flower box under a front window ----------------------------------
  box(group, { w: 1.8, h: 0.45, d: 0.55, x: -2.5, y: 2.3, z: d / 2 + 0.3, color: PALETTE.woodDark });
  box(group, { w: 1.5, h: 0.3, d: 0.35, x: -2.5, y: 2.6, z: d / 2 + 0.3, color: PALETTE.foliageDark });
  box(group, { w: 0.4, h: 0.25, d: 0.3, x: -3.0, y: 2.78, z: d / 2 + 0.3, color: PALETTE.flowerB });
  box(group, { w: 0.4, h: 0.25, d: 0.3, x: -2.1, y: 2.78, z: d / 2 + 0.3, color: PALETTE.flowerA });

  // ---- porch step --------------------------------------------------------
  if (porch) {
    box(group, { w: 3.0, h: 0.35, d: 1.4, y: 0.18, z: d / 2 + 0.9, color: PALETTE.plank });
    box(group, { w: 3.4, h: 0.22, d: 1.8, y: 0.05, z: d / 2 + 1.0, color: PALETTE.stoneDark });
  }

  parent.add(group);
  return group;
}

// ---------------------------------------------------------------------------
//  Trees: a single silhouette language shared by both species -- a readable
//  trunk, then a small number of chunky crown layers that step inward. Round
//  canopies are avoided; at this resolution they turn to mush.
// ---------------------------------------------------------------------------
function createTree(parent, { x, z, scale = 1, sway = 0 }) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  group.rotation.y = sway;

  cylinder(group, { rt: 0.38, rb: 0.62, h: 3.6, seg: 6, y: 1.8, color: PALETTE.woodDark });
  // a couple of stubs so the trunk is not a bare pole
  box(group, { w: 1.3, h: 0.32, d: 0.32, x: 0.6, y: 3.0, rz: 0.4, color: PALETTE.woodDark });

  box(group, { w: 5.0, h: 1.9, d: 5.0, y: 4.0, color: PALETTE.foliageDark });
  box(group, { w: 4.0, h: 1.7, d: 4.0, y: 5.5, color: PALETTE.foliage });
  box(group, { w: 2.6, h: 1.5, d: 2.6, y: 6.8, color: PALETTE.foliageLight });
  parent.add(group);
  return group;
}

function createPine(parent, { x, z, scale = 1 }) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);

  cylinder(group, { rt: 0.32, rb: 0.46, h: 2.8, seg: 6, y: 1.4, color: PALETTE.woodDark });
  cone(group, { r: 2.8, h: 3.2, seg: 6, y: 3.5, color: PALETTE.pineDark });
  cone(group, { r: 2.1, h: 2.7, seg: 6, y: 5.2, color: PALETTE.pine });
  cone(group, { r: 1.3, h: 2.1, seg: 6, y: 6.8, color: PALETTE.foliageLight });
  parent.add(group);
  return group;
}

/**
 * Sakura.
 *
 * Not a green tree recoloured pink. In a print a blossoming tree is a *pattern*
 * — a spread of clustered masses with gaps punched through it, carried on a
 * dark angular armature. So the crown here is a scatter of overlapping blocks
 * at three tones rather than one solid canopy, and the branches are left
 * visible between them.
 */
function createSakura(parent, { x, z, scale = 1, ry = 0 }) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  group.rotation.y = ry;

  // dark angular armature
  cylinder(group, { rt: 0.34, rb: 0.58, h: 3.0, seg: 6, y: 1.5, color: PALETTE.woodDark });
  for (const [bx, bz, tilt, len] of [[1.0, 0.2, 0.55, 2.4], [-0.9, 0.4, -0.5, 2.2], [0.2, -1.0, 0.35, 2.0]]) {
    const b = box(group, { w: 0.3, h: len, d: 0.3, x: bx * 0.6, y: 3.1, z: bz * 0.6, color: PALETTE.woodDark });
    b.rotation.set(bz * tilt, 0, -bx * tilt);
  }

  // blossom masses: three tones, overlapping, with deliberate gaps
  const CLUMPS = [
    [ 0.0,  4.6,  0.0, 3.6, PALETTE.sakura],
    [-1.9,  4.2,  0.6, 2.5, PALETTE.sakuraDark],
    [ 2.0,  4.4, -0.5, 2.4, PALETTE.sakuraDark],
    [ 0.4,  5.9, -0.3, 2.7, PALETTE.sakuraLight],
    [-1.5,  5.6, -1.2, 1.9, PALETTE.sakura],
    [ 1.7,  5.9,  1.1, 1.8, PALETTE.sakura],
    [ 0.0,  6.9,  0.2, 1.7, PALETTE.sakuraLight],
  ];
  for (const [cx, cy, cz, size, color] of CLUMPS) {
    box(group, { w: size, h: size * 0.62, d: size, x: cx, y: cy, z: cz, color });
  }

  parent.add(group);
  return group;
}

/** Small ground cover. Deliberately sparse -- the scene needs empty grass. */
function createTuft(parent, { x, z, s = 1, flower = null }) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(s);
  box(group, { w: 0.85, h: 0.5, d: 0.85, y: 0.25, color: PALETTE.foliageDark });
  box(group, { w: 0.5, h: 0.4, d: 0.5, x: 0.35, y: 0.2, color: PALETTE.foliage });
  if (flower) box(group, { w: 0.32, h: 0.32, d: 0.32, y: 0.66, color: flower });
  parent.add(group);
  return group;
}

function createReeds(parent, { x, z, s = 1, ry = 0 }) {
  const group = new THREE.Group();
  group.position.set(x, -0.6, z);
  group.rotation.y = ry;
  group.scale.setScalar(s);
  box(group, { w: 0.24, h: 2.4, d: 0.24, x: -0.35, y: 1.2, rz: 0.16, color: PALETTE.reed });
  box(group, { w: 0.24, h: 3.0, d: 0.24, x: 0.1, y: 1.5, rz: -0.1, color: PALETTE.reed });
  box(group, { w: 0.24, h: 2.0, d: 0.24, x: 0.5, y: 1.0, rz: 0.22, color: PALETTE.foliageDark });
  parent.add(group);
  return group;
}

// ---------------------------------------------------------------------------
//  Clutter: barrels, crates, rocks, seaweed
// ---------------------------------------------------------------------------
function createBarrel(parent, { x, y = 0, z, ry = 0 }) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = ry;
  cylinder(group, { rt: 0.62, rb: 0.62, h: 1.7, seg: 8, y: 0.85, color: PALETTE.barrel });
  cylinder(group, { rt: 0.68, rb: 0.68, h: 0.22, seg: 8, y: 0.42, color: PALETTE.barrelBand });
  cylinder(group, { rt: 0.68, rb: 0.68, h: 0.22, seg: 8, y: 1.28, color: PALETTE.barrelBand });
  parent.add(group);
  return group;
}

function createCrate(parent, { x, y = 0, z, s = 1, ry = 0 }) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = ry;
  group.scale.setScalar(s);
  box(group, { w: 1.6, h: 1.6, d: 1.6, y: 0.8, color: PALETTE.crate });
  box(group, { w: 1.7, h: 0.2, d: 1.7, y: 0.8, color: PALETTE.woodWarm });
  parent.add(group);
  return group;
}

function createRock(parent, { x, y = 0, z, s = 1, ry = 0 }) {
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  const mesh = new THREE.Mesh(geometry, mat(PALETTE.stone));
  mesh.position.set(x, y + s * 0.55, z);
  mesh.rotation.set(0.3, ry, 0.2);
  mesh.scale.set(s * 1.2, s * 0.8, s);
  parent.add(mesh);
  return mesh;
}

function createSeaweed(parent, { x, z, s = 1, ry = 0 }) {
  const group = new THREE.Group();
  group.position.set(x, -1.2, z);
  group.rotation.y = ry;
  group.scale.setScalar(s);
  box(group, { w: 0.22, h: 2.2, d: 0.22, x: -0.3, y: 1.1, rz: 0.18, color: PALETTE.seaweed });
  box(group, { w: 0.22, h: 2.8, d: 0.22, x: 0.15, y: 1.4, rz: -0.12, color: PALETTE.seaweed });
  box(group, { w: 0.22, h: 1.8, d: 0.22, x: 0.5, y: 0.9, rz: 0.24, color: PALETTE.seaweed });
  parent.add(group);
  return group;
}

// ---------------------------------------------------------------------------
//  A worn dirt path from the village down to the pier head.
//
//  Beyond being scenery this is doing compositional work: it breaks up the
//  large flat field of foreground grass and gives the eye a line that leads
//  from the houses to the pier, which is the subject of the shot.
// ---------------------------------------------------------------------------
function createPath(parent) {
  const group = new THREE.Group();
  group.name = 'path';

  // Laid as overlapping slabs a hair above the grass rather than one long box,
  // so the path can bend and its width can vary without any UV work.
  const NODES = [
    { x: -13.0, z: 11.0, w: 3.4 },
    { x: -10.0, z: 9.6,  w: 3.2 },
    { x: -6.5,  z: 8.6,  w: 3.0 },
    { x: -3.0,  z: 8.0,  w: 3.2 },
    { x: -0.6,  z: 7.2,  w: 3.6 },
    { x: -0.2,  z: 5.4,  w: 3.4 },
    { x: 4.5,   z: 8.4,  w: 2.8 },
    { x: 8.5,   z: 10.4, w: 2.6 },
    { x: 11.5,  z: 13.0, w: 2.4 },
  ];

  for (let i = 0; i < NODES.length - 1; i++) {
    const a = NODES[i];
    const b = NODES[i + 1];
    // skip the jump between the two branches of the fork
    if (i === 5) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) + 1.2;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(a.w, 0.22, len), mat(PALETTE.dirt));
    slab.position.set((a.x + b.x) / 2, 0.06, (a.z + b.z) / 2);
    slab.rotation.y = Math.atan2(dx, dz);
    slab.userData.isLand = true;
    group.add(slab);
  }

  // a few scuffed lighter patches so the path is not one flat tone
  for (const [x, z, w] of [[-11.5, 10.2, 1.6], [-4.5, 8.2, 1.4], [1.6, 6.6, 1.8], [6.5, 9.4, 1.2]]) {
    const patch = new THREE.Mesh(new THREE.BoxGeometry(w, 0.24, w * 0.8), mat(PALETTE.dirtDark));
    patch.position.set(x, 0.07, z);
    patch.rotation.y = x * 0.7;
    patch.userData.isLand = true;
    group.add(patch);
  }

  parent.add(group);
  return group;
}

// ---------------------------------------------------------------------------
//  Pier dressing
// ---------------------------------------------------------------------------
function createRopePost(parent, { x, z, h = 1.6 }) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  cylinder(group, { rt: 0.34, rb: 0.4, h, seg: 6, y: h / 2, color: PALETTE.woodDark });
  cylinder(group, { rt: 0.44, rb: 0.44, h: 0.28, seg: 6, y: h - 0.1, color: PALETTE.rope });
  parent.add(group);
  return group;
}

/** A slack rope between two posts, faked with a few short segments. */
function createRopeSpan(parent, { x1, z1, x2, z2, y, sag = 0.45 }) {
  const group = new THREE.Group();
  const SEGS = 5;
  for (let i = 0; i < SEGS; i++) {
    const t0 = i / SEGS;
    const t1 = (i + 1) / SEGS;
    const tm = (t0 + t1) / 2;
    const px0 = x1 + (x2 - x1) * t0, pz0 = z1 + (z2 - z1) * t0;
    const px1 = x1 + (x2 - x1) * t1, pz1 = z1 + (z2 - z1) * t1;
    const dipM = Math.sin(tm * Math.PI) * sag;
    const dip0 = Math.sin(t0 * Math.PI) * sag;
    const dip1 = Math.sin(t1 * Math.PI) * sag;
    const len = Math.hypot(px1 - px0, pz1 - pz0, dip1 - dip0);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, len), mat(PALETTE.rope));
    seg.position.set((px0 + px1) / 2, y - dipM, (pz0 + pz1) / 2);
    seg.lookAt(px1, y - dip1, pz1);
    group.add(seg);
  }
  parent.add(group);
  return group;
}

function createRopeCoil(parent, { x, y, z }) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const outer = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.16, 4, 10), mat(PALETTE.rope));
  outer.rotation.x = -Math.PI / 2;
  group.add(outer);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.14, 4, 8), mat(PALETTE.rope));
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.14;
  group.add(inner);
  parent.add(group);
  return group;
}

function createLantern(parent, { x, y, z }) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  cylinder(group, { rt: 0.16, rb: 0.2, h: 3.0, seg: 6, y: 1.5, color: PALETTE.woodDark });
  box(group, { w: 0.7, h: 0.2, d: 0.7, y: 3.05, color: PALETTE.woodDark });
  const glow = box(group, { w: 0.62, h: 0.75, d: 0.62, y: 2.65, color: PALETTE.lanternGlow });
  glow.material = createToonMaterial({ color: PALETTE.lanternGlow, emissive: 'lamp', emissiveColor: 0xffd489 });
  glow.userData.lamp = { color: 0xffbe6a, range: 9 };
  box(group, { w: 0.72, h: 0.18, d: 0.72, y: 2.25, color: PALETTE.woodDark });
  parent.add(group);
  return group;
}

/** Drying net: a slack panel hung between two poles. */
function createDryingNet(parent, { x, z, ry = 0 }) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = ry;
  for (const px of [-1.8, 1.8]) {
    cylinder(group, { rt: 0.14, rb: 0.18, h: 3.2, seg: 5, x: px, y: 1.6, color: PALETTE.woodDark });
  }
  box(group, { w: 3.9, h: 0.16, d: 0.16, y: 3.1, color: PALETTE.woodDark });
  // the net itself: a few horizontal strands rather than a solid sheet
  for (let i = 0; i < 4; i++) {
    box(group, { w: 3.4 - i * 0.15, h: 0.14, d: 0.12, y: 2.75 - i * 0.42, color: PALETTE.netTwine });
  }
  box(group, { w: 0.14, h: 1.9, d: 0.12, x: -1.1, y: 2.1, color: PALETTE.netTwine });
  box(group, { w: 0.14, h: 1.9, d: 0.12, x: 0.4, y: 2.1, color: PALETTE.netTwine });
  parent.add(group);
  return group;
}

function createFishingRod(parent, { x, y, z, ry = 0 }) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.set(0, ry, -0.55);
  cylinder(group, { rt: 0.06, rb: 0.12, h: 4.2, seg: 4, y: 2.1, color: PALETTE.woodWarm });
  box(group, { w: 0.3, h: 0.3, d: 0.3, y: 0.7, color: PALETTE.barrelBand });
  parent.add(group);
  return group;
}

// ---------------------------------------------------------------------------
export function createHarbor(parent) {
  const group = new THREE.Group();
  group.name = 'harbor';

  createTerrain(group);
  createPath(group);
  createPier(group);

  // ---- buildings ---------------------------------------------------------
  // Pushed further apart and off-axis from the pier so the default ortho view
  // reads as three separate masses (left house / pier / right house) instead
  // of one crowded band across the bottom of the frame.
  // ---- the monzen-machi -------------------------------------------------
  // Dwellings sit north and face south: their fronts -- shoji, noren, porch --
  // all point along +Z, which is south in this world and also happens to be
  // squarely toward the default camera. Only a couple of degrees of variation
  // is allowed, enough to look built by hand rather than stamped, but not
  // enough to break the rule visually.
  const S = SOUTH_FACING_YAW;
  createMachiya(group, { x: -16, z: 12.5, ry: S + 0.035, scale: 0.92, shop: true });
  createMachiya(group, { x: -5, z: 18.5, ry: S - 0.02, scale: 0.80, noren: false });
  createMachiya(group, { x: 12, z: 15.5, ry: S + 0.05, scale: 0.86 });

  // ---- focal structure: the gate, up on the headland --------------------
  // Placed on the rock rather than inland because of how this projection
  // works: local +Z runs DOWN the screen, so anything set "behind" the village
  // drops toward the bottom edge. The headland is the only ground that puts a
  // tall structure high in the frame, silhouetted against sea and sky, which
  // is where a focal point has to sit.
  // The gate is the one deliberate exception to the south-facing rule: a
  // sanmon addresses its approach, and this one is turned to look back down
  // the steps and out over the harbour mouth.
  createGate(group, { x: 20.5, z: 1.0, y: 2.2, ry: -0.40, scale: 0.82 });
  createSteps(group, { x: 19.5, z: 10.5, count: 7, width: 4.6, rise: 0.42, run: 1.15, ry: -0.14 });

  // ---- torii ------------------------------------------------------------
  // The big one stands in the shallows, read against open water; the small one
  // marks the foot of the steps. Together they bracket the composition.
  createTorii(group, { x: -17, z: -6.5, y: -2.6, scale: 1.0, ry: 0.10 });
  createTorii(group, { x: 18.5, z: 12.0, y: 0, scale: 0.52, ry: -0.14 });

  // ---- stone lanterns along the approach --------------------------------
  createStoneLantern(group, { x: 16.6, z: 8.6, scale: 0.95 });
  createStoneLantern(group, { x: 22.6, z: 9.2, scale: 0.95 });
  createStoneLantern(group, { x: -11.5, z: 8.2, scale: 0.85 });
  createStoneLantern(group, { x: 2.5, z: 7.4, scale: 0.85 });

  // ---- trees: grouped, with clear gaps between clumps --------------------
  createSakura(group, { x: -26, z: 10.5, scale: 1.0, ry: 0.4 });
  createSakura(group, { x: -21.5, z: 16.5, scale: 0.8, ry: 1.3 });
  createPine(group, { x: -18, z: 21, scale: 1.0 });
  createSakura(group, { x: -10.5, z: 23.5, scale: 0.7, ry: 1.8 });
  createPine(group, { x: -5, z: 24, scale: 0.9 });
  createSakura(group, { x: 4, z: 24, scale: 0.9, ry: 2.2 });
  createPine(group, { x: 22, z: 21, scale: 0.95 });
  createSakura(group, { x: 27, z: 13.5, scale: 0.75, ry: 0.9 });

  // ---- pier dressing -----------------------------------------------------
  createRopePost(group, { x: 4.2, z: 0.5 });
  createRopePost(group, { x: 4.2, z: -6.0 });
  createRopeSpan(group, { x1: 4.2, z1: 0.5, x2: 4.2, z2: -6.0, y: 3.2, sag: 0.5 });
  createRopeCoil(group, { x: -2.6, y: 1.82, z: -4.0 });
  createRopeCoil(group, { x: 2.4, y: 1.82, z: -13.5 });
  createLantern(group, { x: -3.0, y: 1.81, z: -12.0 });
  createLantern(group, { x: 3.0, y: 1.81, z: -15.5 });
  createFishingRod(group, { x: 2.9, y: 1.81, z: -16.5, ry: 1.2 });
  createDryingNet(group, { x: -9, z: 4.5, ry: 0.25 });

  // ---- dock clutter (deck top sits at y = 1.81) --------------------------
  createBarrel(group, { x: -2.0, y: 1.81, z: 1.2, ry: 0.3 });
  createBarrel(group, { x: -2.2, y: 1.81, z: -0.4, ry: 1.1 });
  createCrate(group,  { x: 2.2,  y: 1.81, z: 0.6, ry: 0.4 });
  createCrate(group,  { x: 2.3,  y: 1.81, z: -1.0, s: 0.8, ry: -0.3 });
  createCrate(group,  { x: 2.2,  y: 3.09, z: 0.6, s: 0.7, ry: 0.9 });
  createBarrel(group, { x: 2.0,  y: 1.81, z: -11.0, ry: 0.8 });
  createCrate(group,  { x: -2.4, y: 1.81, z: -14.5, s: 0.9, ry: 0.2 });

  // ---- shore clutter -----------------------------------------------------
  createCrate(group, { x: -7, y: 0.05, z: 3.4, s: 0.9, ry: 0.7 });
  createBarrel(group, { x: -10.5, y: 0.05, z: 2.4, ry: 0.2 });
  createRock(group, { x: -20, y: -0.4, z: 0.2, s: 1.5, ry: 0.5 });
  createRock(group, { x: -14, y: -1.6, z: -3.4, s: 1.0, ry: 1.4 });
  createRock(group, { x: 9, y: -1.9, z: -4.0, s: 1.7, ry: 2.1 });
  createRock(group, { x: 16, y: -2.2, z: -7.5, s: 1.1, ry: 0.8 });
  createRock(group, { x: -24, y: -2.1, z: -6.0, s: 1.3, ry: 2.6 });
  createRock(group, { x: 19, y: -0.8, z: -1.5, s: 1.2, ry: 1.1 });

  // ---- vegetation: sparse, clustered, plenty of bare grass left ----------
  createTuft(group, { x: -18, z: 8.5, s: 1.1, flower: PALETTE.flowerA });
  createTuft(group, { x: -16.5, z: 9.5, s: 0.85 });
  createTuft(group, { x: -9, z: 10.5, s: 1.0 });
  createTuft(group, { x: 6, z: 9.0, s: 1.15, flower: PALETTE.flowerB });
  createTuft(group, { x: 7.4, z: 10.2, s: 0.8 });
  createTuft(group, { x: 18, z: 12.0, s: 1.0, flower: PALETTE.flowerA });
  createTuft(group, { x: -2, z: 22.0, s: 0.9 });
  createTuft(group, { x: 16, z: 28.0, s: 1.05 });

  createReeds(group, { x: -12, z: -2.0, s: 1.0, ry: 0.4 });
  createReeds(group, { x: -13.6, z: -3.0, s: 0.8, ry: 1.2 });
  createReeds(group, { x: 13, z: -2.6, s: 1.1, ry: 0.9 });
  createReeds(group, { x: 14.5, z: -1.4, s: 0.85, ry: 2.2 });
  createSeaweed(group, { x: -6, z: -7.5, s: 1.0, ry: 0.4 });
  createSeaweed(group, { x: 7, z: -6.5, s: 1.2, ry: 1.2 });
  createSeaweed(group, { x: 12, z: -11.0, s: 1.1, ry: 0.9 });

  parent.add(group);
  return group;
}
