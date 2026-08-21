import * as THREE from 'three';
import { createToonMaterial } from '../rendering/ToonMaterial.js';
import { PALETTE } from '../util/palette.js';
import { SUN } from './createSun.js';

/**
 * ===========================================================================
 *  Fuji — the monument the whole world sits in front of
 * ===========================================================================
 *
 * Scale has to be bought in both directions at once, and the reason is a
 * property of this projection that has no equivalent under perspective.
 *
 * At a 30-degree camera elevation a point at (x, y, z) lands at
 * screen-up = cos(30)*y - sin(30)*z. For a cone that means the highest point of
 * the SILHOUETTE is not necessarily the peak — it competes with the far edge of
 * the base, which is a whole radius further away. The peak only wins when
 *
 *      cos(30) * height  >  sin(30) * (radius - rimRadius)
 *
 * Below that threshold a wide shallow cone reads as an ellipse with a dimple on
 * top, not as a mountain. The true proportion of this mountain (roughly 1:10)
 * falls a long way below it: at radius 32 and height 8.6 the far foot projects
 * 0.27 NDC ABOVE the summit, which is exactly what the first attempt looked
 * like. So the mountain is deliberately steeper than life — radius 24 against
 * height 20 — which clears the threshold with 0.27 NDC of pointed rise while
 * still spanning 120% of the frame width.
 *
 * It is then sunk deep (baseY -16) so the sea cuts its near skirt, and clipped
 * at the frame edges: too big to fit is the point.
 *
 * Its foot is sunk below the waterline so the sea cuts it off. Under an
 * orthographic camera a base at z = -34 has to sit at y <= -4.79 for the
 * horizon to eat it; above that the mountain visibly floats, with a band of
 * sky between the water's edge and its slopes.
 *
 * The other ridges get the same treatment much harder: sunk until only their
 * upper contours break the horizon, flattened to one pale tone, and kept low
 * enough that nothing competes.
 */

const FRAME_HALF_WIDTH = 40;      // world units at the reference zoom (480 px / 6 ppu / 2)

export const FUJI = {
  x: SUN.spanX * FRAME_HALF_WIDTH,   // the sunrise column — see createSun.js
  z: -34,
  baseY: -16,                         // deep enough that the sea cuts the near skirt
  height: 18.5,
  radius: 24,                         // 120% of the frame width

  // ---- summit -----------------------------------------------------------
  /** Crater mouth, as a fraction of the base radius. Wide on purpose. */
  rimFraction: 0.20,
  /** Shallow: the mouth is ~5.6x wider than the crater is deep. */
  craterDepth: 1.7,
  /**
   * How much of the outer slope's radius change happens LINEARLY.
   *
   * This single number is what removes the chimney. The previous profile was
   * `rim + (1-rim)·(1-t)^1.42`, whose derivative goes to ZERO at the summit —
   * so the radius stopped changing and the wall stood up vertically. Measured,
   * the wall angle ran 41.6 degrees at mid-height to 80.7 degrees just below
   * the top: a cone with a cylinder on it.
   *
   * A linear term guarantees a finite slope at the crest instead. At 0.55 the
   * wall meets the rim at about 60 degrees and eases to about 33 degrees out in
   * the skirt, which is concave like the real mountain but never vertical.
   */
  summitLinearity: 0.55,

  // ---- snow -------------------------------------------------------------
  snowLine: 0.70,
  snowColorMix: 1,
};

const SEGMENTS = 12;
const SLOPE_RINGS = 22;
const CRATER_RINGS = 6;

/**
 * Outer slope radius at height fraction t (0 = foot, 1 = crater rim).
 *
 * Quadratic in the depth below the summit, with a deliberate linear term. The
 * linear part fixes the slope at the crest; the quadratic part opens the skirt
 * out below it. No exponent below 1, so no vertical wall anywhere.
 */
function slopeRadius(t) {
  const u = 1 - t;                                   // depth below the crest
  const a = FUJI.summitLinearity;
  const rim = FUJI.rimFraction * FUJI.radius;
  return rim + (FUJI.radius - rim) * (a * u + (1 - a) * u * u);
}

/**
 * The summit is ONE CONTINUOUS SURFACE that rises, turns over the rim and
 * descends into the bowl — not a cone with a bowl parked on top.
 *
 * Because the polyline simply keeps going past the crest, the crater is part of
 * the mountain by construction: there is no seam to hide, no separate mesh to
 * align, and the surface normals carry round the lip on their own, so the inner
 * wall lights as a depression without any special casing.
 *
 * Returns points from the foot up over the rim and down to the crater floor.
 */
function buildProfile() {
  const pts = [];
  const summitY = FUJI.baseY + FUJI.height;

  // outer slope, sampled more densely near the crest where curvature is highest
  for (let i = 0; i <= SLOPE_RINGS; i++) {
    const k = i / SLOPE_RINGS;
    const t = Math.pow(k, 0.82);
    pts.push({ r: slopeRadius(t), y: FUJI.baseY + t * FUJI.height, crater: false, t });
  }

  // crater: mouth to floor. Drops away quickly under the lip then flattens, so
  // it reads as a shallow caldera floor rather than a funnel running to a point.
  const rim = FUJI.rimFraction * FUJI.radius;
  for (let i = 1; i <= CRATER_RINGS; i++) {
    const v = i / CRATER_RINGS;
    pts.push({
      r: rim * (1 - v),
      y: summitY - FUJI.craterDepth * (1 - Math.pow(1 - v, 1.7)),
      crater: true,
      t: 1,
    });
  }
  return pts;
}

/**
 * Snow line per radial sector.
 *
 * Not a level ring. Five tongues reach further down at fixed, unevenly spaced
 * sectors, and the sectors between them keep a high line so rock drives dark
 * wedges up into the snow. Deterministic, so the shape has rhythm rather than
 * noise.
 */
const SNOW_TONGUES = new Map([[1, 0.15], [3, 0.06], [5, 0.19], [6, 0.09], [9, 0.16], [10, 0.05]]);

function snowLineForSector(j) {
  const jitter = ((j * 37) % 11) / 11 * 0.035;      // ±small, deterministic
  return FUJI.snowLine - (SNOW_TONGUES.get(j) ?? 0) + jitter;
}

/**
 * Revolve the profile by hand so every triangle can carry its own snow flag.
 *
 * Non-indexed on purpose: the three vertices of a face share one mask value, so
 * the snow boundary is a hard faceted edge instead of an interpolated gradient.
 */
function buildFujiSurface() {
  const profile = buildProfile();
  const positions = [];
  const snow = [];

  const ringPoint = (i, j) => {
    const p = profile[i];
    const theta = (j % SEGMENTS) / SEGMENTS * Math.PI * 2;
    return [Math.cos(theta) * p.r, p.y, Math.sin(theta) * p.r];
  };

  const faceIsSnow = (i, j) => {
    const a = profile[i], b = profile[i + 1];
    if (a.crater && b.crater) {
      // Inside the bowl gets its own dark rock tone, not the pale distance
      // grey the outer slopes use. A caldera that shades close to its own snow
      // reads as a white dish rather than as a hole in the mountain.
      return 2;
    }
    if (a.crater || b.crater) {
      // the lip itself: snow only where a tongue sector reaches the top
      return snowLineForSector(j % SEGMENTS) < FUJI.snowLine ? 1 : 0;
    }
    const t = (a.t + b.t) * 0.5;
    return t >= snowLineForSector(j % SEGMENTS) ? 1 : 0;
  };

  for (let i = 0; i < profile.length - 1; i++) {
    for (let j = 0; j < SEGMENTS; j++) {
      const p00 = ringPoint(i, j), p10 = ringPoint(i, j + 1);
      const p01 = ringPoint(i + 1, j), p11 = ringPoint(i + 1, j + 1);
      const flag = faceIsSnow(i, j);
      // winding chosen so normals point outward on the slope and, past the
      // crest, up-and-inward on the bowl wall — the lathe carries itself round
      for (const tri of [[p00, p01, p10], [p10, p01, p11]]) {
        for (const v of tri) { positions.push(v[0], v[1], v[2]); snow.push(flag); }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSnow', new THREE.Float32BufferAttribute(snow, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function buildFuji(group) {
  const mesh = new THREE.Mesh(
    buildFujiSurface(),
    createToonMaterial({
      color: PALETTE.mountain,
      snow: true,
      snowColor: PALETTE.mountainSnow,
      craterColor: PALETTE.craterShadow,
    }),
  );
  mesh.position.set(FUJI.x, 0, FUJI.z);
  mesh.rotation.y = 0.30;
  mesh.userData.castShadow = false;
  mesh.name = 'fuji';
  group.add(mesh);

  // A darker floor disc so the bowl bottom does not shade the same as the rim
  // and the depression reads at a distance.
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(FUJI.rimFraction * FUJI.radius * 0.30, SEGMENTS),
    createToonMaterial({ color: PALETTE.craterShadow }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(FUJI.x, FUJI.baseY + FUJI.height - FUJI.craterDepth + 0.02, FUJI.z);
  floor.userData.castShadow = false;
  group.add(floor);
}

export function createMountains(parent) {
  const group = new THREE.Group();
  group.name = 'mountains';

  buildFuji(group);

  // ---- supporting ridges: cut down to contours -------------------------
  // Sunk far enough that only their upper edges break the horizon, and held to
  // a single pale backdrop tone. They exist to give the eye one more distance
  // plane, nothing else — anything more and they start arguing with Fuji.
  const ridge = (x, z, radius, topY, color) => {
    const baseY = -14;
    const height = topY - baseY;
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 5), createToonMaterial({ color }));
    mesh.position.set(x, baseY + height / 2, z);
    mesh.rotation.y = x * 0.13;
    mesh.userData.castShadow = false;
    group.add(mesh);
  };
  ridge(-34, -36, 20, -1.6, PALETTE.mountainFar);
  ridge(-62, -35, 17, -2.4, PALETTE.mountainFar);
  ridge(-88, -34, 15, -3.0, PALETTE.mountainFar);

  parent.add(group);
  return group;
}
