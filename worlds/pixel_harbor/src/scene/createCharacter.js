import * as THREE from 'three';
import { createNormalMaterial } from '../rendering/ToonMaterial.js';
import { createShadowMaterial } from '../rendering/ShadowPass.js';
import { createToonMaterial } from '../rendering/ToonMaterial.js';
import { PALETTE } from '../util/palette.js';
import { getWaveHeight, WATER_LEVEL } from './createWater.js';
import {
  buildCharacterAtlas, FRAME_W, FRAME_H, COLS, ROWS, DIRECTION_ROW, ANIMATIONS,
} from './spriteAtlas.js';

import spriteVert from '../rendering/shaders/sprite.vert.glsl?raw';
import spriteFrag from '../rendering/shaders/sprite.frag.glsl?raw';

/**
 * ===========================================================================
 *  2D sprite character inside a 3D world
 * ===========================================================================
 *
 *   Character
 *   ├── sprite atlas        procedural, 4 directions x 4 frames
 *   ├── animation state     idle | walk, fixed fps, frame-indexed
 *   ├── direction           north | south | east | west, from movement
 *   ├── position            real 3D world position on a waypoint path
 *   ├── depth / occlusion   alpha-tested Mesh, writes depth, gets outlined
 *   └── shadow              light-facing proxy casting into the shadow map
 *
 * Deliberately a plain Mesh rather than THREE.Sprite so it takes part in the
 * per-mesh material swaps the normal and shadow passes perform, and so it
 * writes real depth -- which is what makes it correctly occluded by the pier
 * rails, houses and trees, and what earns it a depth-derived outline like
 * everything else.
 */

const DECK_Y = 1.81;

export function createCharacter(parent, { pixelsPerUnit = 9, water } = {}) {
  // the float rides the shared wave field, so the character needs the same
  // amplitude and speed the sea is currently using
  const waterRef = water ?? { amplitude: 0.9, speed: 1 };
  const canvas = buildCharacterAtlas();
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace;

  // One frame's uv rect. Exact 1/COLS and 1/ROWS with no padding inset: under
  // NearestFilter a texel is either inside the cell or not, so there is nothing
  // to bleed. A half-texel inset would actually *cause* sampling error here.
  const frameUniform = { value: new THREE.Vector4(0, 0, 1 / COLS, 1 / ROWS) };
  const flipUniform = { value: 0 };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uFrame: frameUniform,
      uFlip: flipUniform,
      uTint: { value: new THREE.Color(1, 1, 1) },
    },
    vertexShader: spriteVert,
    fragmentShader: spriteFrag,
    side: THREE.DoubleSide,
  });

  const sharedCutout = { alphaMap: texture, alphaTest: 0.5, frameUniform, flipUniform, side: THREE.DoubleSide };
  material.userData.normalMaterial = createNormalMaterial({ ...sharedCutout, flatNormal: true });

  // one world unit maps to `pixelsPerUnit` screen pixels, so sizing the quad
  // this way puts one sprite texel on exactly one screen pixel at default zoom
  const width = FRAME_W / pixelsPerUnit;
  const height = FRAME_H / pixelsPerUnit;

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.name = 'character';
  // The camera-facing quad would cast a meaningless sliver, so the visible mesh
  // never enters the shadow map; the proxy below does the casting instead.
  mesh.userData.castShadow = false;
  parent.add(mesh);

  // ---- shadow proxy ------------------------------------------------------
  // Same silhouette, but turned to face the LIGHT rather than the camera, so it
  // punches a proper human-shaped hole into the shadow map. Invisible in the
  // colour and normal passes; ShadowPass switches it on for its render only.
  const shadowProxy = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    createShadowMaterial(sharedCutout),
  );
  shadowProxy.name = 'characterShadowProxy';
  shadowProxy.visible = false;
  shadowProxy.userData.shadowOnly = true;
  shadowProxy.userData.shadowMaterial = shadowProxy.material;
  parent.add(shadowProxy);

  // ---- contact shadow ----------------------------------------------------
  // A small flat disc sitting just above the deck. It also lives only in the
  // shadow map, so the ground darkens through the ordinary shadow lookup and
  // therefore keeps the deck's own hue instead of being a grey decal.
  const contact = new THREE.Mesh(
    new THREE.CircleGeometry(width * 0.34, 10),
    createShadowMaterial(),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.visible = false;
  contact.userData.shadowOnly = true;
  contact.userData.shadowMaterial = contact.material;
  parent.add(contact);

  // ---- fishing tackle ----------------------------------------------------
  // Kept as a small group that is simply hidden when the villager is not
  // fishing, so the event needs no geometry churn to start or stop.
  const tackle = new THREE.Group();
  tackle.name = 'tackle';
  tackle.visible = false;
  parent.add(tackle);

  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.09, 3.2, 4),
    createToonMaterial({ color: PALETTE.woodWarm }),
  );
  rod.userData.castShadow = false;
  tackle.add(rod);

  const line = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 1, 0.05),
    createToonMaterial({ color: PALETTE.netTwine }),
  );
  line.userData.castShadow = false;
  tackle.add(line);

  const bobber = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.28, 0.28),
    createToonMaterial({ color: PALETTE.vermilion }),
  );
  bobber.userData.castShadow = false;
  tackle.add(bobber);

  // a small ring of disturbed water around the float
  const ripple = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.56, 8),
    createToonMaterial({ color: PALETTE.waterFoam }),
  );
  ripple.rotation.x = -Math.PI / 2;
  ripple.userData.castShadow = false;
  tackle.add(ripple);

  // ---- path --------------------------------------------------------------
  // A short patrol along the pier and back onto the shore, which exercises all
  // four facing directions.
  const WAYPOINTS = [
    new THREE.Vector3(-1.6, DECK_Y, 2.0),
    new THREE.Vector3(-1.6, DECK_Y, -15.0),
    new THREE.Vector3(1.8, DECK_Y, -15.0),
    new THREE.Vector3(1.8, DECK_Y, 1.0),
  ];
  const SPEED = 3.0;
  const PAUSE = 1.1;      // idle beat at each waypoint, so 'idle' is actually seen

  /** Where the villager stands to fish, and where the float lands. */
  const FISHING_SPOT = new THREE.Vector3(2.1, DECK_Y, -9.5);
  const FLOAT_SPOT = new THREE.Vector3(5.6, 0, -11.4);

  /**
   * A day's schedule, in minutes. Deliberately data rather than branches: new
   * activities are new rows, and the villager's behaviour becomes something the
   * world can be asked about ("what is happening at 14:00?") instead of
   * something buried in an update function.
   */
  const SCHEDULE = [
    { from: 0,        to: 6 * 60,  activity: 'idle' },
    { from: 6 * 60,   to: 9 * 60,  activity: 'patrol' },
    { from: 9 * 60,   to: 15 * 60, activity: 'fish' },
    { from: 15 * 60,  to: 18 * 60, activity: 'patrol' },
    { from: 18 * 60,  to: 24 * 60, activity: 'idle' },
  ];

  function activityAt(minutes) {
    for (const slot of SCHEDULE) {
      if (minutes >= slot.from && minutes < slot.to) return slot.activity;
    }
    return 'patrol';
  }

  const state = {
    mesh,
    material,
    texture,
    atlasCanvas: canvas,
    frameUniform,
    pixelsPerUnit,
    snapToPixelGrid: true,
    animationSpeed: 1,
    forcedDirection: null,     // debug override
    spriteDebug: false,

    direction: 'south',
    animation: 'idle',
    frameIndex: 0,

    activity: 'patrol',
    _target: 1,
    _pos: WAYPOINTS[0].clone(),
    _animTime: 0,
    _time: 0,
    _atSpot: false,
    _pauseLeft: 0,
    _bobPhase: 0,

    setTint(color) { material.uniforms.uTint.value.copy(color); },

    setPixelsPerUnit(value) {
      state.pixelsPerUnit = value;
      const w = FRAME_W / value;
      const h = FRAME_H / value;
      mesh.geometry.dispose();
      mesh.geometry = new THREE.PlaneGeometry(w, h);
      shadowProxy.geometry.dispose();
      shadowProxy.geometry = new THREE.PlaneGeometry(w, h);
      contact.geometry.dispose();
      contact.geometry = new THREE.CircleGeometry(w * 0.34, 10);
    },

    /** Direction is derived from actual movement, in the harbour's local frame. */
    _updateDirection(dx, dz) {
      if (state.forcedDirection) { state.direction = state.forcedDirection; return; }
      if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4) return;
      if (Math.abs(dx) > Math.abs(dz)) state.direction = dx > 0 ? 'east' : 'west';
      else state.direction = dz > 0 ? 'south' : 'north';
    },

    update(dt, camera, worldUnitsPerPixel, lightDir, sun, animTime = 0) {
      // ---- what is the villager doing right now? -------------------------
      state.activity = sun ? activityAt(sun.minutes) : 'patrol';
      const fishing = state.activity === 'fish';

      // ---- walk the path -------------------------------------------------
      let dx = 0;
      let dz = 0;

      if (fishing) {
        // walk to the spot, then settle and cast
        const toX = FISHING_SPOT.x - state._pos.x;
        const toZ = FISHING_SPOT.z - state._pos.z;
        const dist = Math.hypot(toX, toZ);
        if (dist > 0.08) {
          const stepLen = Math.min(SPEED * dt, dist);
          dx = (toX / dist) * stepLen;
          dz = (toZ / dist) * stepLen;
          state._pos.x += dx;
          state._pos.z += dz;
          state.animation = 'walk';
        } else {
          state.animation = 'idle';
          state.direction = 'east';        // facing the open water
        }
        state._atSpot = dist <= 0.08;
      } else if (state._pauseLeft > 0) {
        state._pauseLeft -= dt;
        state.animation = 'idle';
      } else {
        const target = WAYPOINTS[state._target];
        const toX = target.x - state._pos.x;
        const toZ = target.z - state._pos.z;
        const dist = Math.hypot(toX, toZ);

        if (dist < 0.05) {
          state._target = (state._target + 1) % WAYPOINTS.length;
          state._pauseLeft = PAUSE;
          state.animation = 'idle';
        } else {
          const stepLen = Math.min(SPEED * dt, dist);
          dx = (toX / dist) * stepLen;
          dz = (toZ / dist) * stepLen;
          state._pos.x += dx;
          state._pos.z += dz;
          state.animation = 'walk';
        }
      }
      if (!fishing || !state._atSpot) state._updateDirection(dx, dz);

      // ---- animation -----------------------------------------------------
      const anim = ANIMATIONS[state.animation];
      state._time += dt;
      state._animTime += dt * state.animationSpeed;
      const frameCount = anim.frames.length;
      const idx = frameCount > 1
        ? Math.floor(state._animTime * anim.fps) % frameCount
        : 0;
      state.frameIndex = anim.frames[idx];

      const row = DIRECTION_ROW[state.direction];
      frameUniform.value.x = state.frameIndex / COLS;
      // atlas row 0 is the TOP of the canvas, uv v is measured from the bottom
      frameUniform.value.y = (ROWS - 1 - row) / ROWS;

      // ---- a very slight walking bob, in whole pixels only ----------------
      // The sprite sheet already carries a 1px bob in its walk frames; this
      // adds one more quantized step so the motion does not look mechanical,
      // without ever producing smooth sub-pixel float.
      let bobPixels = 0;
      if (state.animation === 'walk') {
        state._bobPhase += dt * anim.fps * state.animationSpeed;
        bobPixels = Math.floor(state._bobPhase) % 2 === 0 ? 0 : 1;
      }
      const bobWorld = bobPixels / state.pixelsPerUnit;

      // ---- place: feet on the deck, sprite standing on top of it ----------
      const footY = state._pos.y;
      const centreY = footY + height / 2 + bobWorld;
      mesh.position.set(state._pos.x, centreY, state._pos.z);
      shadowProxy.position.copy(mesh.position);
      contact.position.set(state._pos.x, footY + 0.06, state._pos.z);

      // ---- fishing tackle -------------------------------------------------
      tackle.visible = fishing && state._atSpot;
      if (tackle.visible) {
        const handX = state._pos.x + 0.55;
        const handY = state._pos.y + 1.15;
        rod.position.set(handX + 0.9, handY + 0.75, state._pos.z - 0.45);
        rod.rotation.set(0.55, 0, -0.75);

        // The float rides the SAME wave field as the sea and the boats, so it
        // bobs with the water rather than to its own private rhythm.
        const waveY = getWaveHeight(FLOAT_SPOT.x, FLOAT_SPOT.z, animTime,
          waterRef.amplitude, waterRef.speed);
        const floatY = WATER_LEVEL + waveY + 0.1;
        bobber.position.set(FLOAT_SPOT.x, floatY, FLOAT_SPOT.z);
        ripple.position.set(FLOAT_SPOT.x, floatY - 0.06, FLOAT_SPOT.z);
        ripple.scale.setScalar(1 + Math.sin(animTime * 2.2) * 0.12);

        // line from rod tip down to the float
        const tipX = handX + 1.75, tipY = handY + 1.7, tipZ = state._pos.z - 0.9;
        const len = Math.hypot(FLOAT_SPOT.x - tipX, floatY - tipY, FLOAT_SPOT.z - tipZ);
        line.position.set((tipX + FLOAT_SPOT.x) / 2, (tipY + floatY) / 2, (tipZ + FLOAT_SPOT.z) / 2);
        line.scale.set(1, len, 1);
        line.lookAt(FLOAT_SPOT.x, floatY, FLOAT_SPOT.z);
        line.rotateX(Math.PI / 2);
      }

      // ---- billboard toward the camera, yaw only (stays upright) ----------
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      const parentYaw = mesh.parent ? mesh.parent.rotation.y : 0;
      mesh.rotation.set(0, Math.atan2(-camDir.x, -camDir.z) - parentYaw, 0);

      // ---- shadow proxy faces the LIGHT ----------------------------------
      if (lightDir) {
        shadowProxy.rotation.set(0, Math.atan2(lightDir.x, lightDir.z) - parentYaw, 0);
      }

      // ---- snap onto the same pixel grid the camera uses ------------------
      if (state.snapToPixelGrid && worldUnitsPerPixel > 0) {
        const world = mesh.getWorldPosition(new THREE.Vector3());
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        const fwd = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2);

        const r = Math.round(world.dot(right) / worldUnitsPerPixel) * worldUnitsPerPixel;
        const u = Math.round(world.dot(up) / worldUnitsPerPixel) * worldUnitsPerPixel;
        const f = world.dot(fwd);

        const snapped = new THREE.Vector3()
          .addScaledVector(right, r)
          .addScaledVector(up, u)
          .addScaledVector(fwd, f);
        mesh.parent.worldToLocal(snapped);
        mesh.position.copy(snapped);
      }
    },

    /** Normalised progress along the pier, for the mini map. */
    get pathT() {
      return THREE.MathUtils.clamp((2.0 - state._pos.z) / 28.0, 0, 1);
    },
    get mapX() {
      return THREE.MathUtils.clamp((state._pos.x + 4) / 8, 0, 1);
    },
  };

  return state;
}
