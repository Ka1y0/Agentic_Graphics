import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * ===========================================================================
 *  Two cameras over one world
 * ===========================================================================
 *
 *  2D view  - OrthographicCamera at a fixed axonometric angle. Its frustum is
 *             derived from the INTERNAL pixel resolution via `pixelsPerUnit`,
 *             so one world unit is always the same number of pixels no matter
 *             how the window is resized. Its position is snapped to the pixel
 *             grid every frame (see `_snapToPixelGrid`) which is what stops the
 *             edges from crawling when the camera pans.
 *
 *  3D view  - PerspectiveCamera + OrbitControls, entered through a short eased
 *             transition that starts from a pose framing the same subject, so
 *             the flat pixel scene visibly unfolds into a 3D stage.
 */
export class CameraController {
  constructor(domElement, { focus = new THREE.Vector3(), pixelsPerUnit = 12 } = {}) {
    this.domElement = domElement;
    this.focus = focus.clone();
    this.pixelsPerUnit = pixelsPerUnit;

    this.azimuth = 225;      // degrees
    this.elevation = 30;     // degrees
    this.orthoDistance = 160;

    this.snapEnabled = true;
    this.mode = '2d';

    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 420);
    this.persp = new THREE.PerspectiveCamera(38, 1, 0.5, 900);

    this.controls = new OrbitControls(this.persp, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 320;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.target.copy(this.focus);
    this.controls.enabled = false;

    /**
     * The camera actually rendered during a transition.
     *
     * Matching the perspective POSE to the orthographic framing only makes the
     * two agree at the focus plane. Measured, they diverge by 47% at Fuji's
     * depth and 83% sixty units out — which is exactly why the foreground moved
     * smoothly while the sea, the ridges and the mountain snapped at handover.
     *
     * So this camera carries a projection matrix that is interpolated between
     * the two, element by element. Its pose is the interpolated pose. At
     * viewBlend 1 it is the perspective camera; at 0 it is the orthographic
     * one; in between it is a genuine intermediate projection, and nothing at
     * any depth has to jump.
     */
    this.blendCamera = new THREE.PerspectiveCamera(38, 1, 0.5, 900);
    this.blendCamera.userData.orthoFactor = 0;

    /** 0 = canonical 2D, 1 = canonical 3D. Everything view-dependent reads this. */
    this.viewBlend = 0;

    this.pan = new THREE.Vector2();       // WASD offset in the ortho screen plane
    this._transition = null;

    this.internalWidth = 1;
    this.internalHeight = 1;
    this.worldUnitsPerPixel = 1 / pixelsPerUnit;
  }

  /**
   * The camera actually being rendered.
   *
   * While a transition is running this stays on the PERSPECTIVE camera in both
   * directions. Returning to 2D used to hand straight back to the orthographic
   * camera, which is why that direction cut hard while the outbound one was
   * smooth: there was nothing left to animate. The perspective camera now flies
   * back to the pose that matches the 2D framing first, and only then does the
   * orthographic camera take over — at which point the two agree closely enough
   * that the swap is invisible.
   */
  get active() {
    if (this._transition) return this.blendCamera;
    return this.mode === '2d' ? this.ortho : this.persp;
  }

  /**
   * Perspective pose whose framing matches the orthographic camera: same
   * target, same apparent size at the focus plane. Both directions of the
   * transition start or end here, which is what makes them reversible.
   */
  _matchedPose() {
    this.ortho.updateMatrixWorld(true);
    const halfH = this.ortho.top;
    const distance = halfH / Math.tan(THREE.MathUtils.degToRad(this.persp.fov) / 2);
    const right = new THREE.Vector3().setFromMatrixColumn(this.ortho.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.ortho.matrixWorld, 1);
    const target = this.focus.clone()
      .addScaledVector(right, this.pan.x)
      .addScaledVector(up, this.pan.y);
    const position = target.clone().addScaledVector(this._offsetDirection(), distance);
    return { position, target };
  }

  /** Unit vector from the focus point toward the orthographic camera. */
  _offsetDirection(target = new THREE.Vector3()) {
    const az = THREE.MathUtils.degToRad(this.azimuth);
    const el = THREE.MathUtils.degToRad(this.elevation);
    return target.set(
      Math.sin(az) * Math.cos(el),
      Math.sin(el),
      Math.cos(az) * Math.cos(el),
    ).normalize();
  }

  resize(internalWidth, internalHeight) {
    this.internalWidth = internalWidth;
    this.internalHeight = internalHeight;

    // The frustum follows the pixel grid, not the other way round: a larger
    // window shows MORE world at the same pixel density, exactly like a 2D game.
    this.worldUnitsPerPixel = 1 / this.pixelsPerUnit;
    const halfW = (internalWidth * this.worldUnitsPerPixel) / 2;
    const halfH = (internalHeight * this.worldUnitsPerPixel) / 2;

    this.ortho.left = -halfW;
    this.ortho.right = halfW;
    this.ortho.top = halfH;
    this.ortho.bottom = -halfH;
    this.ortho.updateProjectionMatrix();

    this.persp.aspect = internalWidth / internalHeight;
    this.persp.updateProjectionMatrix();

    // The blend camera's projection matrix is overwritten every frame by the
    // ortho/perspective lerp, so its own `.aspect` never feeds its projection
    // and was left at the constructor default of 1. That made it a trap for
    // anything that reads `camera.aspect` off the active camera — the sun disc
    // did, and went elliptical for exactly the length of each transition.
    // Kept truthful so the next reader is not lied to.
    this.blendCamera.aspect = this.persp.aspect;
  }

  setPixelsPerUnit(value) {
    this.pixelsPerUnit = value;
    this.resize(this.internalWidth, this.internalHeight);
  }

  setFocus(focus) {
    this.focus.copy(focus);
    this.controls.target.copy(focus);
  }

  /**
   * Quantize the camera position onto the internal pixel grid.
   *
   * The camera basis is orthonormal, so decomposing the position onto
   * right / up / forward, rounding the two screen-aligned components to whole
   * `worldUnitsPerPixel` steps and recomposing gives an exact snap: static
   * geometry lands on identical texels frame after frame, and panning advances
   * in whole pixels instead of shimmering.
   */
  _snapToPixelGrid() {
    const upp = this.worldUnitsPerPixel;
    if (upp <= 0) return;

    const m = this.ortho.matrixWorld;
    const right = new THREE.Vector3().setFromMatrixColumn(m, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(m, 1);
    const fwd = new THREE.Vector3().setFromMatrixColumn(m, 2);

    const p = this.ortho.position;
    const r = Math.round(p.dot(right) / upp) * upp;
    const u = Math.round(p.dot(up) / upp) * upp;
    const f = p.dot(fwd);

    p.set(0, 0, 0)
      .addScaledVector(right, r)
      .addScaledVector(up, u)
      .addScaledVector(fwd, f);

    this.ortho.updateMatrixWorld(true);
  }

  /** WASD / arrow keys pan the 2D camera in its own screen plane. */
  panBy(dx, dy) {
    this.pan.x += dx;
    this.pan.y += dy;
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.controls.enabled = false;

    const matched = this._matchedPose();
    // If a transition is already running, start the new one from wherever the
    // blend camera currently is, so a mid-flight reversal turns around in place
    // rather than snapping back to the far end and replaying.
    const running = this._transition;
    const fromPos = running ? this.blendCamera.position.clone() : null;
    const fromTgt = running ? this.controls.target.clone() : null;
    const carried = running ? 1 - running.t : 1;
    const blendFrom = running ? this.viewBlend : (mode === '3d' ? 0 : 1);

    if (mode === '3d') {
      // Start from the pose that frames the same subject at the same apparent
      // size, then ease outward — the reveal reads as one continuous move.
      const revealAz = THREE.MathUtils.degToRad(this.azimuth + 26);
      const revealEl = THREE.MathUtils.degToRad(this.elevation - 12);
      const revealDist = matched.position.distanceTo(matched.target) * 0.62;
      const to = matched.target.clone().add(new THREE.Vector3(
        Math.sin(revealAz) * Math.cos(revealEl),
        Math.sin(revealEl),
        Math.cos(revealAz) * Math.cos(revealEl),
      ).multiplyScalar(revealDist));

      this.persp.position.copy(fromPos ?? matched.position);
      this.persp.lookAt(matched.target);
      this.controls.target.copy(matched.target);
      this._transition = {
        from: (fromPos ?? matched.position).clone(),
        to,
        fromTarget: (fromTgt ?? matched.target).clone(),
        toTarget: matched.target.clone(),
        t: 0,
        blendFrom,
        duration: 1.15 * Math.max(carried, 0.35),
        settle: '3d',
      };
    } else {
      // The exact inverse: fly whatever pose the user left the orbit camera in
      // back to the matched pose, then hand over to the orthographic camera.
      this._transition = {
        from: (fromPos ?? this.persp.position).clone(),
        to: matched.position,
        fromTarget: (fromTgt ?? this.controls.target).clone(),
        toTarget: matched.target,
        t: 0,
        blendFrom,
        duration: 1.0 * Math.max(carried, 0.35),
        settle: '2d',
      };
    }
  }

  update(dt) {
    // A transition owns the camera in both directions until it settles.
    if (this._transition) {
      const tr = this._transition;
      tr.t = Math.min(1, tr.t + dt / tr.duration);
      const e = easeInOutCubic(tr.t);

      // 1 = fully perspective, 0 = fully orthographic. Interpolated FROM
      // wherever the blend already was, so an interrupted transition turns
      // around in place instead of snapping to the far end and replaying.
      this.viewBlend = THREE.MathUtils.lerp(tr.blendFrom, tr.settle === '2d' ? 0 : 1, e);

      // the orthographic pose has to be current before its projection is used
      this._updateOrtho();

      const target = tr.fromTarget.clone().lerp(tr.toTarget, e);
      const camera = this.blendCamera;
      camera.position.lerpVectors(tr.from, tr.to, e);
      camera.up.set(0, 1, 0);
      camera.lookAt(target);
      camera.near = THREE.MathUtils.lerp(this.ortho.near, this.persp.near, this.viewBlend);
      camera.far = THREE.MathUtils.lerp(this.ortho.far, this.persp.far, this.viewBlend);
      camera.updateMatrixWorld(true);

      // Element-wise projection blend. Both matrices are affine in clip space,
      // so a straight lerp is a valid intermediate projection — this is what
      // keeps distant geometry continuous instead of snapping at handover.
      const o = this.ortho.projectionMatrix.elements;
      const p = this.persp.projectionMatrix.elements;
      const b = camera.projectionMatrix.elements;
      for (let i = 0; i < 16; i++) b[i] = o[i] + (p[i] - o[i]) * this.viewBlend;
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.userData.orthoFactor = 1 - this.viewBlend;

      if (tr.t >= 1) {
        this.controls.target.copy(target);
        this.persp.position.copy(camera.position);
        this.persp.quaternion.copy(camera.quaternion);
        this.persp.updateMatrixWorld(true);
        this._transition = null;
        this.viewBlend = tr.settle === '3d' ? 1 : 0;
        // Only the outbound direction hands control back to the user.
        this.controls.enabled = tr.settle === '3d';
        if (tr.settle === '3d') this.controls.update();
      }
      return;
    }

    if (this.mode === '2d') {
      this.viewBlend = 0;
      this._updateOrtho();
      return;
    }
    this.viewBlend = 1;

    this.controls.update();
  }

  /** Places the orthographic camera at its canonical pose (pan + snap included). */
  _updateOrtho() {
    const dir = this._offsetDirection();
    this.ortho.position.copy(this.focus).addScaledVector(dir, this.orthoDistance);
    this.ortho.up.set(0, 1, 0);
    this.ortho.lookAt(this.focus);
    this.ortho.updateMatrixWorld(true);
    if (this.pan.x !== 0 || this.pan.y !== 0) {
      const right = new THREE.Vector3().setFromMatrixColumn(this.ortho.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(this.ortho.matrixWorld, 1);
      this.ortho.position.addScaledVector(right, this.pan.x).addScaledVector(up, this.pan.y);
      this.ortho.updateMatrixWorld(true);
    }
    if (this.snapEnabled) this._snapToPixelGrid();
  }
}

function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
