import * as THREE from 'three';

/**
 * Yaw applied to the harbour group so its local frame lines up with the default
 * camera. This lives here rather than in createScene.js because it is the
 * definition of the world's orientation, and because importing it from there
 * created a cycle: createScene -> createHarbor -> orientation -> createScene.
 */
export const HARBOR_YAW = THREE.MathUtils.degToRad(-135);

/**
 * ===========================================================================
 *  World orientation — where north is, and why
 * ===========================================================================
 *
 * Everything in the harbour is authored in the group's LOCAL frame, which the
 * default orthographic camera maps to the screen like this:
 *
 *      local +X  ->  screen right
 *      local +Z  ->  screen down / toward the viewer
 *      local +Y  ->  screen up
 *
 * and the camera's own view direction in that frame is (0, -0.5, -0.866): it
 * looks along local -Z and downward. That single fact decides the compass,
 * because it means a wall whose normal is +Z faces the camera squarely, while
 * a wall whose normal is +X is seen exactly edge-on and has no visible area at
 * all.
 *
 * The buildings must sit north and face south. If south were +X their fronts
 * would be edge-on to the camera and every shoji panel, noren and porch would
 * vanish. So:
 *
 *      SOUTH = local +Z     buildings face this way, toward the viewer
 *      NORTH = local -Z     their backs, and the open sea beyond
 *      EAST  = local +X     screen right — the sun rises here
 *      WEST  = local -X     screen left  — the sun sets here
 *
 * This makes it a Sea-of-Japan coast: the water lies to the north, the village
 * sits on the southern shore with its dwellings opened to the southern sun,
 * and the sun tracks left-to-right across the frame... no: right to left,
 * rising at screen right and setting at screen left, passing through south
 * (toward the viewer, therefore high in frame) at noon.
 */

/** Compass directions as unit vectors in the harbour's LOCAL frame. */
export const LOCAL_COMPASS = {
  north: new THREE.Vector3(0, 0, -1),
  east: new THREE.Vector3(1, 0, 0),
  south: new THREE.Vector3(0, 0, 1),
  west: new THREE.Vector3(-1, 0, 0),
};

/** Bearing in degrees, clockwise from north, for a local XZ direction. */
export function bearingOf(localX, localZ) {
  // north is -Z, east is +X, so bearing = atan2(x, -z)
  const deg = THREE.MathUtils.radToDeg(Math.atan2(localX, -localZ));
  return (deg + 360) % 360;
}

/**
 * Local direction for a compass bearing (degrees clockwise from north) and an
 * elevation above the horizon (degrees).
 */
export function directionFromBearing(bearingDeg, elevationDeg, target = new THREE.Vector3()) {
  const b = THREE.MathUtils.degToRad(bearingDeg);
  const e = THREE.MathUtils.degToRad(elevationDeg);
  const horizontal = Math.cos(e);
  return target.set(
    Math.sin(b) * horizontal,     // east component
    Math.sin(e),
    -Math.cos(b) * horizontal,    // north component (north is -Z)
  );
}

const _yaw = new THREE.Matrix4().makeRotationY(HARBOR_YAW);

/**
 * Convert a harbour-local direction into world space.
 *
 * Lighting uniforms are world-space (the toon shader lights from world
 * normals), while the compass and the sun path are authored in local space,
 * so anything crossing that boundary has to go through here.
 */
export function localDirectionToWorld(localDir, target = new THREE.Vector3()) {
  return target.copy(localDir).applyMatrix4(_yaw);
}

/**
 * A building's yaw so that its +Z face (its front, where the shoji, noren and
 * porch are built) points along the given bearing. Dwellings use SOUTH.
 */
export function yawFacing(bearingDeg) {
  // local +Z is south (bearing 180), so a front on bearing B needs yaw B - 180
  return THREE.MathUtils.degToRad(bearingDeg - 180);
}

export const SOUTH_FACING_YAW = yawFacing(180);   // === 0
