import * as THREE from 'three';
import { createToonMaterial } from '../rendering/ToonMaterial.js';
import { PALETTE } from '../util/palette.js';
import { WATER_LEVEL } from './createWater.js';

/**
 * A small wooden boat that floats on the *same* wave field the water mesh is
 * built from.
 *
 * Buoyancy is not a physics simulation and does not need to be: we sample the
 * shared height function at the hull's centre, bow/stern and port/starboard,
 * and derive pitch and roll from those height differences. Because the sample
 * points are the actual surface being drawn, the hull never separates from the
 * water no matter how the wave parameters are retuned in the GUI.
 */

function box(parent, { w, h, d, x = 0, y = 0, z = 0, color, ry = 0, rx = 0, rz = 0 }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), createToonMaterial({ color }));
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

export function createBoat(parent, { x = 0, z = 0, yaw = 0 } = {}) {
  const root = new THREE.Group();
  root.name = 'boat';
  root.rotation.order = 'YXZ';

  // ---- hull (built around local origin, +Z is the bow) -------------------
  const hull = new THREE.Group();

  box(hull, { w: 3.0, h: 1.1, d: 8.0, y: 0.0, color: PALETTE.plank });
  // Waterline: a darker wet band around the hull at the height the sea sits,
  // plus the submerged strake below it. Cheap, but it is what stops the boat
  // reading as a prop resting on top of a blue plane.
  box(hull, { w: 3.06, h: 0.30, d: 8.06, y: -0.30, color: PALETTE.woodDark });
  box(hull, { w: 3.02, h: 0.42, d: 8.02, y: -0.62, color: PALETTE.waterDeep });
  box(hull, { w: 3.4, h: 0.45, d: 8.2, y: 0.62, color: PALETTE.woodWarm });   // gunwale
  box(hull, { w: 2.4, h: 0.9,  d: 1.0, y: -0.1, z: 4.2, color: PALETTE.plank });
  // bow wedge
  const prow = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.4, 4), createToonMaterial({ color: PALETTE.plankAlt }));
  prow.rotation.set(Math.PI / 2, 0, Math.PI / 4);
  prow.position.set(0, 0.05, 5.3);
  prow.scale.set(1.0, 1.0, 0.72);
  hull.add(prow);
  // stern block
  box(hull, { w: 2.9, h: 1.2, d: 0.6, y: 0.05, z: -4.0, color: PALETTE.plankAlt });

  // interior floor + thwarts (benches) -- gives interior creases to outline
  box(hull, { w: 2.4, h: 0.2, d: 7.0, y: 0.35, color: PALETTE.plankAlt });
  box(hull, { w: 2.6, h: 0.28, d: 0.7, y: 0.62, z: 1.6, color: PALETTE.woodWarm });
  box(hull, { w: 2.6, h: 0.28, d: 0.7, y: 0.62, z: -1.4, color: PALETTE.woodWarm });

  // ---- mast + furled sail ------------------------------------------------
  // The boat is moored, so the sail is bundled along the yard rather than set.
  // A flat hanging sail would also read as one big unlit slab at this angle --
  // the furled bundle keeps the silhouette light and gives the normal pass a
  // run of small facets to outline.
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 5.0, 6), createToonMaterial({ color: PALETTE.woodDark }));
  mast.position.set(0, 3.0, 0.8);
  hull.add(mast);

  box(hull, { w: 0.16, h: 0.16, d: 3.6, y: 4.35, z: 0.8, color: PALETTE.woodDark });   // yard
  const sail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.38, 3.1, 6),
    createToonMaterial({ color: PALETTE.sailCloth }),
  );
  sail.rotation.x = Math.PI / 2;
  sail.position.set(0, 4.05, 0.8);
  hull.add(sail);

  // rigging: two stays running fore and aft from the masthead
  for (const [z, tilt] of [[3.4, -0.55], [-3.4, 0.55]]) {
    const stay = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 5.4, 4),
      createToonMaterial({ color: PALETTE.woodDark }),
    );
    stay.position.set(0, 2.9, (0.8 + z) / 2);
    stay.rotation.x = tilt;
    hull.add(stay);
  }

  // a lantern on the stern
  box(hull, { w: 0.5, h: 0.6, d: 0.5, y: 1.1, z: -3.6, color: PALETTE.windowGlass });

  // cargo
  box(hull, { w: 1.0, h: 1.0, d: 1.0, y: 0.95, z: -2.4, color: PALETTE.crate, ry: 0.4 });

  // ---- foam collar ------------------------------------------------------
  // A thin ring sitting at the waterline, reading as disturbed water around the
  // hull. Flat and untinted so it stays bright against the sea's tone bands.
  const foam = new THREE.Mesh(
    new THREE.RingGeometry(2.1, 3.0, 14, 1),
    createToonMaterial({ color: PALETTE.waterFoam }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.scale.set(0.62, 1, 1.5);
  foam.position.y = -0.42;
  foam.userData.castShadow = false;
  hull.add(foam);

  root.add(hull);
  root.position.set(x, 0, z);
  root.rotation.y = yaw;
  parent.add(root);

  // sample offsets, in hull-local units
  const HALF_LENGTH = 3.6;
  const HALF_WIDTH = 1.5;
  const FLOAT_OFFSET = 0.28;    // how deep the hull sits in the water

  const state = {
    root,
    x,
    z,
    yaw,
    /**
     * @param {(x:number,z:number)=>number} sampleHeight
     *        the water's height function, already bound to the current time
     */
    update(sampleHeight) {
      const fx = Math.sin(state.yaw);
      const fz = Math.cos(state.yaw);
      const rx = Math.cos(state.yaw);
      const rz = -Math.sin(state.yaw);

      const hC = sampleHeight(state.x, state.z);
      const hBow   = sampleHeight(state.x + fx * HALF_LENGTH, state.z + fz * HALF_LENGTH);
      const hStern = sampleHeight(state.x - fx * HALF_LENGTH, state.z - fz * HALF_LENGTH);
      const hStbd  = sampleHeight(state.x + rx * HALF_WIDTH,  state.z + rz * HALF_WIDTH);
      const hPort  = sampleHeight(state.x - rx * HALF_WIDTH,  state.z - rz * HALF_WIDTH);

      root.position.set(state.x, WATER_LEVEL + hC + FLOAT_OFFSET, state.z);

      // rotation order is YXZ: yaw, then pitch about local X, then roll about local Z
      root.rotation.y = state.yaw;
      root.rotation.x = -Math.atan2(hBow - hStern, HALF_LENGTH * 2);
      root.rotation.z = Math.atan2(hStbd - hPort, HALF_WIDTH * 2);
    },
  };

  return state;
}
