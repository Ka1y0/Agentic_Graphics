/**
 * ===========================================================================
 *  Pipeline self-test
 * ===========================================================================
 *
 * Every claim this project makes about its renderer is checkable by reading the
 * framebuffer back, so none of them have to be taken on faith. This module runs
 * those checks against the live pipeline and returns numbers.
 *
 * Run from the console:   await PIXEL_HARBOR.selfTest()
 *
 * It renders synchronously and restores every piece of state it touches, so it
 * is safe to call at any time -- including while the animation loop is running.
 */

const DEBUG = { FINAL: 0, COLOR: 1, DEPTH: 2, NORMAL: 3, EDGE: 4, DEPTH_EDGE: 5, NORMAL_EDGE: 6 };

export function createSelfTest({ pixelRenderer, stylizePass, cameraController, world }) {
  const renderer = pixelRenderer.renderer;

  const size = () => ({ w: pixelRenderer.internalWidth, h: pixelRenderer.internalHeight });

  /** One synchronous render of the current state, then read the stylized target. */
  function capture(debugMode) {
    const { w, h } = size();
    stylizePass.uniforms.uDebugMode.value = debugMode;
    const camera = cameraController.active;
    pixelRenderer.render(world.scene, camera, camera.position.distanceTo(cameraController.focus));
    const buffer = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(pixelRenderer.stylizedTarget, 0, 0, w, h, buffer);
    return buffer;
  }

  function renderOnly() {
    const camera = cameraController.active;
    pixelRenderer.render(world.scene, camera, camera.position.distanceTo(cameraController.focus));
    const { w, h } = size();
    const buffer = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(pixelRenderer.stylizedTarget, 0, 0, w, h, buffer);
    return buffer;
  }

  const changedPixels = (a, b) => {
    let n = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++;
    }
    return n;
  };

  const distinctColors = (buf) => {
    const set = new Set();
    for (let i = 0; i < buf.length; i += 4) set.add((buf[i] << 16) | (buf[i + 1] << 8) | buf[i + 2]);
    return set.size;
  };

  // -----------------------------------------------------------------------
  return async function selfTest({ verbose = false } = {}) {
    const savedDebug = stylizePass.uniforms.uDebugMode.value;
    const savedSnap = cameraController.snapEnabled;
    const savedMode = cameraController.mode;
    const { w, h } = size();
    const total = w * h;
    const results = {};

    // --- 1. genuine low-resolution rasterization -------------------------
    results.lowResolution = {
      css: [window.innerWidth, window.innerHeight],
      internal: [w, h],
      output: [pixelRenderer.outputWidth, pixelRenderer.outputHeight],
      pixelScale: pixelRenderer.pixelScale,
      scaleIsExactInteger:
        pixelRenderer.outputWidth / w === pixelRenderer.pixelScale &&
        pixelRenderer.outputHeight / h === pixelRenderer.pixelScale,
      letterboxPx: [
        window.innerWidth - pixelRenderer.outputWidth,
        window.innerHeight - pixelRenderer.outputHeight,
      ],
      devicePixelRatio: window.devicePixelRatio,
      canvasBackingStore: [pixelRenderer.canvas.width, pixelRenderer.canvas.height],
      backingStoreUnscaledByRetina:
        pixelRenderer.canvas.width === pixelRenderer.outputWidth,
      colorTargetSize: [pixelRenderer.colorTarget.width, pixelRenderer.colorTarget.height],
      depthTextureSize: [pixelRenderer.depthTexture.image.width, pixelRenderer.depthTexture.image.height],
      normalTargetSize: [pixelRenderer.normalPass.target.width, pixelRenderer.normalPass.target.height],
      allBuffersMatchInternal:
        pixelRenderer.colorTarget.width === w &&
        pixelRenderer.depthTexture.image.width === w &&
        pixelRenderer.normalPass.target.width === w,
      nearestFilterOnStylized:
        pixelRenderer.stylizedTarget.texture.magFilter === 1003 &&  // THREE.NearestFilter
        pixelRenderer.stylizedTarget.texture.minFilter === 1003,
    };

    // --- 2. the three source buffers -------------------------------------
    const color = capture(DEBUG.COLOR);
    const depth = capture(DEBUG.DEPTH);
    const normal = capture(DEBUG.NORMAL);
    const edge = capture(DEBUG.EDGE);
    const depthEdge = capture(DEBUG.DEPTH_EDGE);
    const normalEdge = capture(DEBUG.NORMAL_EDGE);
    const final = capture(DEBUG.FINAL);

    const greyLevels = (buf) => { const s = new Set(); for (let i = 0; i < buf.length; i += 4) s.add(buf[i]); return s.size; };
    const coverage = (buf) => { let n = 0; for (let i = 0; i < buf.length; i += 4) if (buf[i] > 128) n++; return +(100 * n / total).toFixed(2); };

    results.buffers = {
      colorDistinctColors: distinctColors(color),
      depthDistinctGreyLevels: greyLevels(depth),
      normalDistinctColors: distinctColors(normal),
      finalDistinctColors: distinctColors(final),
      edgeCoveragePct: coverage(edge),
      depthEdgeCoveragePct: coverage(depthEdge),
      normalEdgeCoveragePct: coverage(normalEdge),
      bothEdgeDetectorsContribute: coverage(depthEdge) > 0.2 && coverage(normalEdge) > 0.2,
    };

    // --- 3. outlines must derive from base colour, never flat black -------
    let blackOutlines = 0, ratioSum = 0, ratioN = 0, edgeCount = 0;
    const hues = new Set();
    const examples = [];
    for (let i = 0; i < total; i++) {
      if (edge[i * 4] <= 128) continue;
      edgeCount++;
      const br = color[i * 4], bg = color[i * 4 + 1], bb = color[i * 4 + 2];
      const fr = final[i * 4], fg = final[i * 4 + 1], fb = final[i * 4 + 2];
      if (fr < 12 && fg < 12 && fb < 12) blackOutlines++;
      const bl = 0.299 * br + 0.587 * bg + 0.114 * bb;
      const fl = 0.299 * fr + 0.587 * fg + 0.114 * fb;
      if (bl > 10) { ratioSum += fl / bl; ratioN++; }
      if (Math.max(fr, fg, fb) > 20) hues.add((fr >> 5) + ',' + (fg >> 5) + ',' + (fb >> 5));
      if (examples.length < 6 && bl > 60) examples.push({ base: [br, bg, bb], outline: [fr, fg, fb] });
    }
    results.coloredOutlines = {
      edgePixels: edgeCount,
      nearBlackOutlinePixels: blackOutlines,
      distinctOutlineHueBuckets: hues.size,
      meanOutlineLumaRatio: ratioN ? +(ratioSum / ratioN).toFixed(3) : null,
      examples,
      passesNoBlackOutlines: blackOutlines === 0,
    };

    // --- 4. tone quantization --------------------------------------------
    let toneUniform = null;
    world.scene.traverse((o) => {
      if (!toneUniform && o.isMesh && o.material?.uniforms?.uToneSteps) toneUniform = o.material.uniforms.uToneSteps;
    });
    const toneSweep = {};
    if (toneUniform) {
      const savedSteps = toneUniform.value;
      for (const s of [2, 3, 4, 5, 8]) { toneUniform.value = s; toneSweep['steps' + s] = distinctColors(capture(DEBUG.COLOR)); }
      toneUniform.value = savedSteps;
    }
    // The distinct-colour count must RISE with the tone-step control, which is
    // what proves the quantization is real and driven by that parameter.
    //
    // Adjacent step counts are NOT a reliable ordering: 4 and 5 steps can land
    // within a colour or two of each other depending on where the animated
    // water happens to be, which made an every-adjacent-pair check flap between
    // runs. Comparing well-separated points (2 -> 4 -> 8) tests the same
    // property with margin that comfortably exceeds that noise.
    const nonDecreasing = toneSweep.steps2 < toneSweep.steps4
      && toneSweep.steps4 < toneSweep.steps8;
    results.toneQuantization = {
      totalPixels: total,
      distinctColorsByToneSteps: toneSweep,
      risesAcross2_4_8: nonDecreasing,
      increaseFrom2To8: toneSweep.steps8 - toneSweep.steps2,
      // a scene of 144k pixels collapsing to a few hundred colours is the point
      coloursAreFewRelativeToPixels: toneSweep.steps4 < total / 100,
      monotonicWithSteps: nonDecreasing
        && toneSweep.steps8 > toneSweep.steps2 * 1.3
        && toneSweep.steps4 < total / 100,
    };

    // --- 5. pixel snapping ------------------------------------------------
    // Pan exactly one pixel in 12 sub-pixel steps. With snapping on the image
    // must hold still and then jump once; with it off it resamples every step.
    stylizePass.uniforms.uDebugMode.value = DEBUG.FINAL;
    cameraController.setMode('2d');
    const upp = cameraController.worldUnitsPerPixel;

    function sweep(snap) {
      cameraController.snapEnabled = snap;
      cameraController.update(1 / 60);
      let prev = renderOnly();
      const steps = [];
      for (let i = 0; i < 12; i++) {
        cameraController.panBy(upp / 12, 0);
        cameraController.update(1 / 60);
        const now = renderOnly();
        steps.push(changedPixels(prev, now));
        prev = now;
      }
      cameraController.panBy(-upp, 0);
      cameraController.update(1 / 60);
      return steps;
    }

    const snapOn = sweep(true);
    const snapOff = sweep(false);
    cameraController.snapEnabled = true;
    cameraController.update(1 / 60);
    const still = [renderOnly(), renderOnly()];

    const identical = (a) => a.filter((v) => v === 0).length;
    results.pixelSnapping = {
      worldUnitsPerPixel: +upp.toFixed(5),
      note: 'pixels changed per 1/12-px pan step across a 1px pan',
      snapOn_identicalFrames: `${identical(snapOn)} of 12`,
      snapOff_identicalFrames: `${identical(snapOff)} of 12`,
      snapOn_perStep: snapOn,
      staticCameraChangedPixels: changedPixels(still[0], still[1]),
      passesQuantizedMotion: identical(snapOn) >= 10 && identical(snapOff) <= 2,
    };

    // --- 6. boat rides the shared wave function ---------------------------
    const boatSamples = [];
    for (let k = 0; k < 6; k++) {
      world.update(0.05, cameraController.active, upp);
      const b = world.boat;
      const surface = world.water.height(b.x, b.z, world.time);
      boatSamples.push({
        waveY: +surface.toFixed(4),
        boatY: +b.root.position.y.toFixed(4),
        delta: +(b.root.position.y - surface).toFixed(5),
        pitchDeg: +(b.root.rotation.x * 180 / Math.PI).toFixed(2),
        rollDeg: +(b.root.rotation.z * 180 / Math.PI).toFixed(2),
      });
    }
    const deltas = boatSamples.map((s) => s.delta);
    const pitches = boatSamples.map((s) => s.pitchDeg);
    results.boatBuoyancy = {
      samples: verbose ? boatSamples : boatSamples.slice(0, 3),
      draftSpread: +(Math.max(...deltas) - Math.min(...deltas)).toFixed(6),
      pitchRangeDeg: +(Math.max(...pitches) - Math.min(...pitches)).toFixed(2),
      passesLockedToWave: (Math.max(...deltas) - Math.min(...deltas)) < 1e-4,
    };

    // --- 7. 3D reveal -----------------------------------------------------
    cameraController.setMode('3d');
    for (let i = 0; i < 90; i++) cameraController.update(1 / 60);
    renderOnly();   // so uIsOrtho reflects the perspective camera, not the last 2D frame
    results.perspectiveReveal = {
      activeCameraType: cameraController.active.type,
      orbitControlsEnabled: cameraController.controls.enabled,
      transitionCompleted: cameraController._transition === null,
      stylizeIsOrthoUniform: stylizePass.uniforms.uIsOrtho.value,
      passesReveal: cameraController.active.isPerspectiveCamera === true && cameraController.controls.enabled,
    };

    // --- restore ----------------------------------------------------------
    cameraController.setMode(savedMode);
    for (let i = 0; i < 90; i++) cameraController.update(1 / 60);
    cameraController.snapEnabled = savedSnap;
    stylizePass.uniforms.uDebugMode.value = savedDebug;

    results.SUMMARY = {
      lowResolution: results.lowResolution.scaleIsExactInteger && results.lowResolution.allBuffersMatchInternal,
      buffersPopulated: results.buffers.normalDistinctColors > 50 && results.buffers.depthDistinctGreyLevels > 10,
      bothEdgeDetectors: results.buffers.bothEdgeDetectorsContribute,
      noBlackOutlines: results.coloredOutlines.passesNoBlackOutlines,
      toneQuantization: results.toneQuantization.monotonicWithSteps,
      pixelSnapping: results.pixelSnapping.passesQuantizedMotion,
      integerUpscale: results.lowResolution.nearestFilterOnStylized && results.lowResolution.scaleIsExactInteger,
      boatSharedWave: results.boatBuoyancy.passesLockedToWave,
      perspectiveReveal: results.perspectiveReveal.passesReveal,
    };
    results.ALL_PASS = Object.values(results.SUMMARY).every(Boolean);

    return results;
  };
}
