import * as THREE from 'three';
import { createToonMaterial } from '../rendering/ToonMaterial.js';
import { PALETTE } from '../util/palette.js';

/**
 * ===========================================================================
 *  Japanese coastal architecture
 * ===========================================================================
 *
 * All original geometry, assembled from primitives. Nothing here traces a real
 * building or a specific artwork — these are the generic forms (torii, a
 * two-tier gate, machiya townhouses, ishidoro lanterns) drawn to read at a
 * third resolution.
 *
 * The governing constraint is the same one the rest of the scene follows: at
 * 6 px per world unit, a 0.4-unit member is ~2.4 px and is the thinnest thing
 * worth building. Anything finer becomes shimmer, so these structures are
 * deliberately heavy-limbed — which also happens to match how the forms are
 * drawn in prints, where a torii is a few bold strokes.
 */

const cache = new Map();
function mat(color) {
  if (!cache.has(color)) cache.set(color, createToonMaterial({ color }));
  return cache.get(color);
}

function box(parent, { w, h, d, x = 0, y = 0, z = 0, color, rx = 0, ry = 0, rz = 0 }) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

function cyl(parent, { rt, rb, h, seg = 8, x = 0, y = 0, z = 0, color, rx = 0, ry = 0, rz = 0 }) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

/**
 * A kawara-tiled roof: a shallow four-sided pyramid with a heavy dark eave
 * board and a ridge beam. The eave board is what makes a roof read as Japanese
 * at low resolution — the deep dark lip under a pale slope.
 */
function tiledRoof(parent, { w, d, h, y, color, darkColor, eave = 1.0 }) {
  const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.5 + eave, h, 4), mat(color));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = y + h / 2;
  roof.scale.set(1, 1, (d * 0.5 + eave) / (w * 0.5 + eave));
  parent.add(roof);

  // the dark eave lip
  const lip = new THREE.Mesh(new THREE.ConeGeometry(w * 0.5 + eave + 0.25, 0.55, 4), mat(darkColor));
  lip.rotation.y = Math.PI / 4;
  lip.position.y = y + 0.1;
  lip.scale.set(1, 1, (d * 0.5 + eave + 0.25) / (w * 0.5 + eave + 0.25));
  parent.add(lip);

  return roof;
}

// ---------------------------------------------------------------------------
//  Torii
// ---------------------------------------------------------------------------
export function createTorii(parent, { x, z, y = 0, scale = 1, ry = 0 }) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.scale.setScalar(scale);

  const W = 6.4;      // span between posts
  const H = 7.2;      // post height

  // posts, slightly tapered and leaning inward the way a real torii does
  for (const s of [-1, 1]) {
    cyl(g, { rt: 0.42, rb: 0.52, h: H, seg: 8, x: s * W / 2, y: H / 2, color: PALETTE.vermilion, rz: -s * 0.022 });
    // stone footing
    cyl(g, { rt: 0.72, rb: 0.8, h: 0.7, seg: 8, x: s * W / 2, y: 0.35, color: PALETTE.stoneDark });
  }

  // nuki — the lower straight tie beam, passing through the posts
  box(g, { w: W + 1.6, h: 0.62, d: 0.62, y: H - 1.9, color: PALETTE.vermilion });
  // gakuzuka — the short strut between the two beams
  box(g, { w: 0.7, h: 1.1, d: 0.7, y: H - 1.15, color: PALETTE.vermilion });

  // shimaki / kasagi — the top lintel, built as two stacked beams with the
  // upper one overhanging, which is the silhouette the eye actually reads
  box(g, { w: W + 2.4, h: 0.5, d: 0.85, y: H - 0.45, color: PALETTE.vermilionDark });
  const kasagi = box(g, { w: W + 3.4, h: 0.7, d: 1.15, y: H + 0.15, color: PALETTE.vermilion });
  // upward sweep at the ends
  for (const s of [-1, 1]) {
    box(g, { w: 1.3, h: 0.62, d: 1.15, x: s * (W + 3.4) / 2, y: H + 0.34, rz: -s * 0.20, color: PALETTE.vermilion });
  }

  parent.add(g);
  return g;
}

// ---------------------------------------------------------------------------
//  Sanmon — a two-tier temple gate. The focal structure of the scene.
// ---------------------------------------------------------------------------
export function createGate(parent, { x, z, y = 0, scale = 1, ry = 0 }) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.scale.setScalar(scale);

  const W = 11;
  const D = 6;
  const PILLAR_H = 6.2;

  // ---- stone podium ------------------------------------------------------
  box(g, { w: W + 3.0, h: 0.9, d: D + 2.4, y: 0.45, color: PALETTE.stone });
  box(g, { w: W + 2.2, h: 0.5, d: D + 1.6, y: 1.15, color: PALETTE.stoneLight });

  // ---- pillars -----------------------------------------------------------
  const px = [-W / 2, -W / 6, W / 6, W / 2];
  for (const cx of px) {
    for (const cz of [-D / 2, D / 2]) {
      cyl(g, { rt: 0.5, rb: 0.58, h: PILLAR_H, seg: 8, x: cx, y: 1.4 + PILLAR_H / 2, z: cz, color: PALETTE.vermilion });
      cyl(g, { rt: 0.72, rb: 0.72, h: 0.34, seg: 8, x: cx, y: 1.55, z: cz, color: PALETTE.stoneDark });
    }
  }

  // ---- tie beams ---------------------------------------------------------
  const beamY = 1.4 + PILLAR_H - 0.7;
  for (const cz of [-D / 2, D / 2]) {
    box(g, { w: W + 1.6, h: 0.66, d: 0.7, y: beamY, z: cz, color: PALETTE.vermilionDark });
    box(g, { w: W + 1.2, h: 0.5, d: 0.6, y: beamY - 1.6, z: cz, color: PALETTE.vermilionDark });
  }
  for (const cx of [-W / 2, W / 2]) {
    box(g, { w: 0.7, h: 0.66, d: D + 1.2, x: cx, y: beamY, color: PALETTE.vermilionDark });
  }

  // ---- lower roof --------------------------------------------------------
  const lowerY = 1.4 + PILLAR_H;
  tiledRoof(g, { w: W + 1.5, d: D + 1.5, h: 2.4, y: lowerY, color: PALETTE.roofTile, darkColor: PALETTE.roofTileDark, eave: 1.5 });

  // ---- upper storey ------------------------------------------------------
  const upperBase = lowerY + 2.0;
  box(g, { w: W - 2.4, h: 2.4, d: D - 1.6, y: upperBase + 1.2, color: PALETTE.wallPlaster });
  // railing around the upper storey
  box(g, { w: W - 1.4, h: 0.4, d: D - 0.6, y: upperBase + 0.25, color: PALETTE.vermilion });
  for (let i = -3; i <= 3; i++) {
    box(g, { w: 0.22, h: 1.0, d: 0.22, x: i * 1.3, y: upperBase + 0.75, z: (D - 0.6) / 2, color: PALETTE.vermilion });
  }
  // upper-storey window openings, dark so the storey does not read solid
  for (const cx of [-2.4, 0, 2.4]) {
    box(g, { w: 1.2, h: 1.3, d: 0.3, x: cx, y: upperBase + 1.4, z: (D - 1.6) / 2 + 0.05, color: PALETTE.roofTileDark });
  }

  const upperY = upperBase + 2.4;
  tiledRoof(g, { w: W - 1.0, d: D - 0.4, h: 2.8, y: upperY, color: PALETTE.roofTile, darkColor: PALETTE.roofTileDark, eave: 1.7 });

  // ridge ornament
  box(g, { w: 0.5, h: 0.9, d: 0.5, y: upperY + 3.0, color: PALETTE.gold });

  // ---- the great hanging lantern ----------------------------------------
  // The single strongest read in the whole structure: a big pale cylinder
  // slung in the central bay, dark banded top and bottom.
  const lanternY = 1.4 + PILLAR_H - 3.4;
  const hanging = cyl(g, { rt: 1.15, rb: 1.15, h: 2.6, seg: 10, y: lanternY, color: PALETTE.lanternPaper });
  hanging.material = createToonMaterial({ color: PALETTE.lanternPaper, emissive: 'lamp', emissiveColor: 0xffd489 });
  hanging.userData.lamp = { color: 0xffc06a, range: 15 };
  cyl(g, { rt: 1.28, rb: 1.28, h: 0.5, seg: 10, y: lanternY + 1.4, color: PALETTE.vermilionDark });
  cyl(g, { rt: 1.05, rb: 1.05, h: 0.42, seg: 10, y: lanternY - 1.4, color: PALETTE.vermilionDark });
  box(g, { w: 1.5, h: 1.1, d: 0.12, y: lanternY, z: 1.16, color: PALETTE.ink });

  // ---- plaque over the central bay --------------------------------------
  box(g, { w: 3.0, h: 1.1, d: 0.3, y: beamY + 1.1, z: D / 2 + 0.2, color: PALETTE.woodDark });
  box(g, { w: 2.5, h: 0.7, d: 0.36, y: beamY + 1.1, z: D / 2 + 0.24, color: PALETTE.gold });

  parent.add(g);
  return g;
}

// ---------------------------------------------------------------------------
//  Ishidoro — stone lantern
// ---------------------------------------------------------------------------
export function createStoneLantern(parent, { x, z, y = 0, scale = 1 }) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.scale.setScalar(scale);

  cyl(g, { rt: 0.5, rb: 0.62, h: 0.45, seg: 6, y: 0.22, color: PALETTE.stoneDark });
  cyl(g, { rt: 0.26, rb: 0.3, h: 1.5, seg: 6, y: 1.0, color: PALETTE.stone });
  cyl(g, { rt: 0.6, rb: 0.45, h: 0.35, seg: 6, y: 1.9, color: PALETTE.stoneLight });
  // fire box, with a lit face
  box(g, { w: 0.9, h: 0.85, d: 0.9, y: 2.5, color: PALETTE.stone });
  const fire = box(g, { w: 0.5, h: 0.5, d: 0.95, y: 2.5, color: PALETTE.lantern });
  fire.material = createToonMaterial({ color: PALETTE.lantern, emissive: 'lamp', emissiveColor: 0xffdc9a });
  // registered so the night pass can light the ground around it
  fire.userData.lamp = { color: 0xffc474, range: 7.5 };
  // cap and finial
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.7, 6), mat(PALETTE.stoneDark));
  cap.position.y = 3.25;
  g.add(cap);
  box(g, { w: 0.24, h: 0.34, d: 0.24, y: 3.72, color: PALETTE.stoneDark });

  parent.add(g);
  return g;
}

// ---------------------------------------------------------------------------
//  Machiya — a wooden coastal townhouse
// ---------------------------------------------------------------------------
export function createMachiya(parent, { x, z, ry = 0, scale = 1, noren = true, shop = false }) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  g.scale.setScalar(scale);

  const W = 9, H = 4.6, D = 6.5;

  // ---- body --------------------------------------------------------------
  box(g, { w: W, h: 0.6, d: D, y: 0.3, color: PALETTE.stoneDark });          // footing
  box(g, { w: W, h: H, d: D, y: 0.6 + H / 2, color: PALETTE.wallWood });
  // pale plaster upper band, the classic two-tone machiya facade
  box(g, { w: W + 0.12, h: 1.5, d: D + 0.12, y: 0.6 + H - 0.75, color: PALETTE.wallPlaster });

  // ---- corner posts and a mid post ---------------------------------------
  for (const cx of [-W / 2, -W / 6, W / 6, W / 2]) {
    for (const cz of [-D / 2, D / 2]) {
      box(g, { w: 0.42, h: H, d: 0.42, x: cx, y: 0.6 + H / 2, z: cz, color: PALETTE.woodDark });
    }
  }

  // ---- shoji: pale paper panels in a dark lattice ------------------------
  const faceZ = D / 2 + 0.05;
  for (const cx of [-2.6, 0, 2.6]) {
    box(g, { w: 2.2, h: 2.3, d: 0.22, x: cx, y: 2.3, z: faceZ, color: PALETTE.woodDark });
    const pane = box(g, { w: 1.85, h: 1.95, d: 0.28, x: cx, y: 2.3, z: faceZ, color: PALETTE.paper });
    // Only the centre bay lights up: a whole facade of glowing shoji reads as a
    // shopfront, not as a house where someone is still awake.
    if (cx === 0) {
      pane.material = createToonMaterial({ color: PALETTE.paper, emissive: 'window', emissiveColor: 0xffcf83 });
    }
    // one horizontal lattice rail — the minimum that still reads as shoji
    box(g, { w: 1.85, h: 0.16, d: 0.32, x: cx, y: 2.3, z: faceZ, color: PALETTE.woodDark });
  }

  // ---- roof --------------------------------------------------------------
  tiledRoof(g, {
    w: W, d: D, h: 2.5, y: 0.6 + H,
    color: PALETTE.roofTile, darkColor: PALETTE.roofTileDark, eave: 1.15,
  });

  // ---- noren, the split shop curtain over the doorway --------------------
  if (noren) {
    box(g, { w: 3.4, h: 0.22, d: 0.2, y: 3.35, z: faceZ + 0.35, color: PALETTE.woodDark });
    box(g, { w: 1.5, h: 1.5, d: 0.14, x: -0.9, y: 2.55, z: faceZ + 0.35, color: PALETTE.noren });
    box(g, { w: 1.5, h: 1.5, d: 0.14, x: 0.9, y: 2.55, z: faceZ + 0.35, color: PALETTE.noren });
  }

  // ---- shop front: a low counter and crates ------------------------------
  if (shop) {
    box(g, { w: 4.2, h: 0.9, d: 1.2, y: 0.9, z: faceZ + 0.9, color: PALETTE.wood });
    box(g, { w: 4.4, h: 0.22, d: 1.4, y: 1.4, z: faceZ + 0.9, color: PALETTE.woodWarm });
    box(g, { w: 0.9, h: 0.9, d: 0.9, x: -2.6, y: 0.45, z: faceZ + 1.0, color: PALETTE.crate });
  }

  // ---- entrance step -----------------------------------------------------
  box(g, { w: 3.2, h: 0.32, d: 1.2, y: 0.16, z: D / 2 + 0.8, color: PALETTE.stone });

  // ---- signage board on the gable end ------------------------------------
  box(g, { w: 0.24, h: 1.6, d: 2.6, x: W / 2 + 0.14, y: 3.3, color: PALETTE.woodDark });
  box(g, { w: 0.3, h: 1.15, d: 2.1, x: W / 2 + 0.2, y: 3.3, color: PALETTE.paperLit });

  parent.add(g);
  return g;
}

// ---------------------------------------------------------------------------
//  Stone steps
// ---------------------------------------------------------------------------
export function createSteps(parent, { x, z, count = 6, width = 5, rise = 0.4, run = 1.1, ry = 0 }) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;

  for (let i = 0; i < count; i++) {
    const m = box(g, {
      w: width, h: rise + 0.1, d: run,
      y: i * rise + rise / 2, z: -i * run,
      color: i % 2 === 0 ? PALETTE.stone : PALETTE.stoneLight,
    });
    m.userData.isLand = true;
  }
  // flanking kerbs
  for (const s of [-1, 1]) {
    const kerb = box(g, {
      w: 0.5, h: 0.5, d: run * count,
      x: s * (width / 2 + 0.2), y: (count * rise) / 2, z: -(count - 1) * run / 2,
      rx: -Math.atan2(count * rise, count * run),
      color: PALETTE.stoneDark,
    });
    kerb.userData.isLand = true;
  }

  parent.add(g);
  return g;
}
