/**
 * ===========================================================================
 *  Procedural pixel sprite atlas
 * ===========================================================================
 *
 * Generates an original 4-direction walk/idle sheet into a canvas at exactly
 * one canvas pixel per sprite pixel. Nothing here is traced or derived from
 * existing game art -- it is drawn from rectangles at runtime.
 *
 * Layout (columns = frames, rows = directions):
 *
 *        col 0     col 1     col 2     col 3
 *   row0 south:  idle      walkA     idle      walkB
 *   row1 north:  idle      walkA     idle      walkB
 *   row2 east:   idle      walkA     idle      walkB
 *   row3 west:   (mirrored from east at draw time)
 *
 * Row 3 is drawn explicitly rather than mirrored in the shader so the atlas is
 * self-describing and a hand-authored sheet can replace it without touching
 * any code -- the frame lookup is pure uv arithmetic.
 */

export const FRAME_W = 16;
export const FRAME_H = 24;
export const COLS = 4;
export const ROWS = 4;

export const DIRECTION_ROW = { south: 0, north: 1, east: 2, west: 3 };

/** Frame sequences, as column indices. */
export const ANIMATIONS = {
  idle: { frames: [0], fps: 1 },
  walk: { frames: [1, 0, 3, 0], fps: 8 },
};

// A coastal villager, dressed to belong to this world: a woven straw hat, an
// indigo happi coat over a pale under-layer, a sash, and short work trousers.
// Indigo and straw are the two colours ordinary people actually wear across
// these prints, and both sit far enough from the vermilion of the sacred
// structures that the character never competes with them.
const C = {
  hatBand:  '#8a6a34',
  hat:      '#d9bd76',    // woven straw
  hatDark:  '#a8894a',
  skin:     '#eab98a',
  skinDark: '#c3906a',
  hair:     '#2f2620',
  shirt:    '#2f4f6b',    // indigo happi
  shirtDk:  '#22394f',
  shirtHi:  '#3f6a8a',
  under:    '#ddd2b4',    // pale under-layer at the collar and sleeves
  pants:    '#4a4438',
  pantsDk:  '#35301f',
  boot:     '#6b5a3f',    // straw sandals
  bootDk:   '#4a3d29',
  eye:      '#241f24',
  belt:     '#9c3f32',    // sash, the one warm accent
  buckle:   '#c8442e',
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} ox,oy   top-left of this cell in the atlas
 * @param {string} dir     south | north | east | west
 * @param {number} step    -1 | 0 | +1 -- which foot is forward
 * @param {number} bob     vertical body offset in whole pixels
 */
function drawCharacter(ctx, ox, oy, dir, step, bob) {
  const px = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(ox + x, oy + y, w, h);
  };

  const side = dir === 'east' || dir === 'west';
  const back = dir === 'north';
  const flip = dir === 'west' ? -1 : 1;
  // for the west row everything is drawn from the right edge inward
  const X = (x, w) => (flip === 1 ? x : FRAME_W - x - w);

  const b = bob;

  // ---- hat ---------------------------------------------------------------
  px(X(5, 6), 1 + b, 6, 1, C.hatDark);
  px(X(4, 8), 2 + b, 8, 2, C.hat);
  px(X(4, 8), 3 + b, 8, 1, C.hatBand);
  px(X(3, 10), 4 + b, 10, 1, C.hatDark);          // brim

  // ---- head --------------------------------------------------------------
  px(X(5, 6), 5 + b, 6, 4, C.skin);
  px(X(5, 6), 8 + b, 6, 1, C.skinDark);

  if (back) {
    // back of the head: all hair, no face
    px(X(5, 6), 5 + b, 6, 4, C.hair);
  } else if (side) {
    // profile: one eye, hair at the back of the skull
    px(X(9, 1), 6 + b, 1, 1, C.eye);
    px(X(4, 1), 5 + b, 1, 4, C.hair);
    px(X(10, 1), 8 + b, 1, 1, C.skinDark);        // chin/nose hint
  } else {
    px(X(6, 1), 6 + b, 1, 1, C.eye);
    px(X(9, 1), 6 + b, 1, 1, C.eye);
    px(X(4, 1), 7 + b, 1, 2, C.hair);
    px(X(11, 1), 7 + b, 1, 2, C.hair);
  }

  // ---- torso -------------------------------------------------------------
  if (side) {
    px(X(5, 6), 9 + b, 6, 6, C.shirt);
    px(X(5, 2), 9 + b, 2, 6, C.shirtDk);          // shaded back
    px(X(9, 2), 9 + b, 2, 4, C.shirtHi);          // lit chest
    if (!back) px(X(9, 2), 9 + b, 2, 1, C.under); // collar
  } else {
    px(X(4, 8), 9 + b, 8, 6, C.shirt);
    px(X(4, 8), 13 + b, 8, 2, C.shirtDk);
    // the happi hangs open over a pale under-layer
    px(X(7, 2), 9 + b, 2, 6, back ? C.shirtDk : C.under);
    if (!back) {
      px(X(6, 1), 9 + b, 1, 2, C.under);
      px(X(9, 1), 9 + b, 1, 2, C.under);
    }
  }

  // ---- arms --------------------------------------------------------------
  if (side) {
    // one visible arm, swinging opposite the leading foot
    const armY = 9 + b + (step > 0 ? 1 : 0);
    px(X(7, 2), armY, 2, 5, C.shirtDk);
    px(X(7, 2), armY + 5, 2, 2, C.skin);
  } else {
    const swingL = step > 0 ? 1 : 0;
    const swingR = step < 0 ? 1 : 0;
    px(X(3, 1), 9 + b + swingL, 1, 5, C.shirt);
    px(X(12, 1), 9 + b + swingR, 1, 5, C.shirt);
    px(X(3, 1), 14 + b + swingL, 1, 2, C.skin);
    px(X(12, 1), 14 + b + swingR, 1, 2, C.skin);
  }

  // ---- belt --------------------------------------------------------------
  const beltW = side ? 6 : 8;
  const beltX = side ? 5 : 4;
  px(X(beltX, beltW), 15 + b, beltW, 1, C.belt);
  if (!back) px(X(side ? 7 : 7, 2), 15 + b, 2, 1, C.buckle);

  // ---- legs + boots ------------------------------------------------------
  if (side) {
    // front leg / back leg separated along the walking axis
    const front = step;             // -1, 0, +1
    px(X(6 + front, 3), 16 + b, 3, 5, C.pants);
    px(X(7 - front, 3), 16 + b, 3, 5, C.pantsDk);
    px(X(5 + front, 4), 21 + b, 4, 2, C.boot);
    px(X(7 - front, 4), 21 + b, 4, 2, C.bootDk);
  } else {
    const lDx = step > 0 ? 1 : step < 0 ? -1 : 0;
    const rDx = -lDx;
    px(X(5 + lDx, 3), 16 + b, 3, 5, C.pants);
    px(X(8 + rDx, 3), 16 + b, 3, 5, C.pantsDk);
    px(X(4 + lDx, 4), 21 + b, 4, 2, C.boot);
    px(X(8 + rDx, 4), 21 + b, 4, 2, C.bootDk);
  }
}

/**
 * Builds the atlas canvas. Cells are drawn edge-to-edge with no padding, and
 * the frame uv rect is computed from exact texel arithmetic, so there is no
 * bleeding between neighbouring frames under NearestFilter.
 */
export function buildCharacterAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W * COLS;
  canvas.height = FRAME_H * ROWS;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // column -> [step, bob]; col 0 and 2 are the two contact poses
  const POSES = [
    [0, 0],    // 0 idle / contact
    [1, -1],   // 1 walk A (left foot forward, body lifts a pixel)
    [0, 0],    // 2 contact
    [-1, -1],  // 3 walk B (right foot forward)
  ];

  for (const [dir, row] of Object.entries(DIRECTION_ROW)) {
    for (let col = 0; col < COLS; col++) {
      const [step, bob] = POSES[col];
      drawCharacter(ctx, col * FRAME_W, row * FRAME_H, dir, step, bob);
    }
  }

  return canvas;
}
