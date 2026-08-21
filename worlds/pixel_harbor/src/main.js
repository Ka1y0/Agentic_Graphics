import * as THREE from 'three';
import './styles.css';

import { PixelRenderer }     from './rendering/PixelRenderer.js';
import { DEBUG_MODES }       from './rendering/StylizePass.js';
import { createScene, applyLightingPreset } from './scene/createScene.js';
import { applySeason, SEASONS, SEASON_ORDER } from './scene/seasons.js';
import { CameraController }  from './camera/CameraController.js';
import { createHud }         from './ui/hud.js';
import { createDebugPanel }  from './ui/debugPanel.js';
import { createSelfTest }    from './util/selftest.js';
import { createDemoDirector } from './demo/DemoDirector.js';
import { renderScoreOffline, analyseBuffer, bufferToWav, normalizeBuffer } from './demo/renderScoreOffline.js';
import { createAudio }       from './audio/createAudio.js';
import { StyleManager }      from './styles/StyleManager.js';
import { ukiyoePixel }       from './styles/profiles/ukiyoePixel.js';
import { celShadedShrine }   from './styles/profiles/celShadedShrine.js';
import { blueprint }         from './styles/profiles/blueprint.js';
import { pencilSketch }      from './styles/profiles/pencilSketch.js';
import { asciiCrt }          from './styles/profiles/asciiCrt.js';
import { neonSkyline }       from './styles/profiles/neonSkyline.js';
import { futureStyles }      from './styles/profiles/future.js';

// Colour management stays off on purpose. The whole look is built on a small
// set of hand-picked flat tones, and an automatic sRGB round-trip between the
// intermediate targets would both shift those tones and interfere with tone
// quantization. Working in one linear space end to end keeps "the colour I
// picked" and "the colour on screen" the same thing.
THREE.ColorManagement.enabled = false;

const pageParams = new URLSearchParams(window.location.search);
const publicDebugMode = pageParams.get('debug') === '1';
document.body.classList.toggle('debug', publicDebugMode);

const stage = document.getElementById('stage');

const state = {
  pixelScale: 3,
  pixelsPerUnit: 6,
  debugMode: DEBUG_MODES.Final,
  shadowMapSize: 1024,
  style: 'ukiyoe',
  season: 'Spring',
  lightingPreset: 'Day',
  lightAzimuth: 38,
  lightElevation: 46,
};

// --------------------------------------------------------------- pipeline
const pixelRenderer = new PixelRenderer(stage, { pixelScale: state.pixelScale });
const stylizePass = pixelRenderer.stylizePass;

// --------------------------------------------------------------- world
const world = createScene({ pixelsPerUnit: state.pixelsPerUnit });
applyLightingPreset(world.scene, state.lightingPreset);

// --------------------------------------------------------------- cameras
const cameraController = new CameraController(pixelRenderer.canvas, {
  focus: world.focus,
  pixelsPerUnit: state.pixelsPerUnit,
});
cameraController.resize(pixelRenderer.internalWidth, pixelRenderer.internalHeight);

// --------------------------------------------------------------- ui
const hud = createHud(stage, {
  onViewChange: (mode) => cameraController.setMode(mode),
});

// --------------------------------------------------------------- styles
// The world above knows nothing about how it will be drawn. Everything that
// decides that lives in a style profile, and switching one never touches the
// scene graph, the camera or the animation clock.
const styleManager = new StyleManager({
  pixelRenderer, stylizePass, cameraController, world, hud, state,
});
styleManager
  .register(ukiyoePixel)
  .register(celShadedShrine)
  .register(blueprint)
  .register(pencilSketch)
  .register(asciiCrt)
  .register(neonSkyline);
for (const future of futureStyles) styleManager.register(future);

// the default identity of the project
styleManager.rememberSkyBackground(0xa8c6d4);
styleManager.apply('ukiyoe', { transition: false });
hud.buildStyleSwitcher(styleManager);
const audio = createAudio();
hud.bindAudio(audio);

hud.buildSeasonPicker(SEASON_ORDER, state.season, (name) => {
  state.season = name;
  applySeason(world, name);
  hud.syncSeason(name);
});

const gui = createDebugPanel({
  pixelRenderer,
  stylizePass,
  cameraController,
  world,
  state,
  styleManager,
});
stage.appendChild(gui.domElement);
gui.domElement.style.display = publicDebugMode ? '' : 'none';

// --------------------------------------------------------------- demo
// Inert until started. `?demo=1` runs it on load; the debug panel has a button.
const demo = createDemoDirector({
  world, cameraController, styleManager, hud, audio, state, stage,
});
gui.bindDemo?.(demo);
if (pageParams.get('demo') === '1') {
  // the score has to be running before the first frame is recorded, and that
  // needs a gesture — so arm it on the first click or key instead of guessing
  const arm = () => {
    if (!audio.ready) audio.start();
    demo.start();
    window.removeEventListener('pointerdown', arm);
    window.removeEventListener('keydown', arm);
  };
  window.addEventListener('pointerdown', arm);
  window.addEventListener('keydown', arm);
}

// --------------------------------------------------------------- input
const keys = new Set();
window.addEventListener('keydown', (event) => {
  keys.add(event.code);
  if (publicDebugMode && event.code === 'KeyH') {
    const showDeveloperSurface = gui.domElement.style.display === 'none';
    gui.domElement.style.display = showDeveloperSurface ? '' : 'none';
    document.body.classList.toggle('debug', showDeveloperSurface);
  }
  if (event.code === 'Digit1') hud.setView('2d');
  if (event.code === 'Digit2') hud.setView('3d');
  // Tab / Shift-Tab cycles the viewing style without touching world state
  if (event.code === 'Tab') {
    event.preventDefault();
    styleManager.next(event.shiftKey ? -1 : 1);
    hud.syncStyleSwitcher(styleManager);
  }
});
window.addEventListener('keyup', (event) => keys.delete(event.code));

function readPan(dt) {
  // Slow, continuous panning is the honest test for pixel-grid stability.
  const speed = 14 * dt;
  let dx = 0;
  let dy = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft'))  dx -= speed;
  if (keys.has('KeyD') || keys.has('ArrowRight')) dx += speed;
  if (keys.has('KeyS') || keys.has('ArrowDown'))  dy -= speed;
  if (keys.has('KeyW') || keys.has('ArrowUp'))    dy += speed;
  if (dx || dy) cameraController.panBy(dx, dy);
}

// --------------------------------------------------------------- resize
// Debounced with a timer rather than requestAnimationFrame on purpose: rAF is
// throttled (or fully paused) while the tab is hidden, so an rAF-deferred
// resize can be dropped entirely and leave the pipeline stuck at the old
// resolution until the next resize event.
let resizeTimer = 0;
function applyResize() {
  pixelRenderer.resize();
  cameraController.resize(pixelRenderer.internalWidth, pixelRenderer.internalHeight);
  stylizePass.setResolution(pixelRenderer.internalWidth, pixelRenderer.internalHeight);
}
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(applyResize, 80);
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) applyResize();
});

// --------------------------------------------------------------- loop
let lastTime = performance.now();
let fpsAccum = 0;
let fpsFrames = 0;
let fps = 0;

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  fpsAccum += dt;
  fpsFrames += 1;
  if (fpsAccum >= 0.5) {
    fps = Math.round(fpsFrames / fpsAccum);
    fpsAccum = 0;
    fpsFrames = 0;
  }

  demo.tick(dt);
  if (!demo.running) readPan(dt);
  cameraController.update(dt);

  const camera = cameraController.active;
  world.update(dt, camera, cameraController.worldUnitsPerPixel,
    { x: pixelRenderer.internalWidth, y: pixelRenderer.internalHeight });

  audio.update(dt, world);
  pixelRenderer.render(world.scene, camera, camera.position.distanceTo(cameraController.focus), world.time);

  hud.update(dt, {
    ...pixelRenderer.info,
    view: cameraController.mode,
    debug: nameOfDebugMode(state.debugMode),
    style: styleManager.current?.name ?? '-',
    clock: world.sun.clockText,
    seasonLabel: SEASONS[world.season]?.dayLabel ?? world.season,
    weather: world.sun.nightFactor > 0.5 ? 'Clear night'
      : (world.season === 'Winter' ? 'Snow' : (world.season === 'Autumn' ? 'Breezy' : 'Sunny')),
    weatherIcon: world.sun.nightFactor > 0.5 ? '\u263D'
      : (world.season === 'Winter' ? '\u2744' : '\u2600'),
    fps,
    characterT: world.character.pathT,
    characterX: world.character.mapX,
  });
}

function nameOfDebugMode(value) {
  return Object.keys(DEBUG_MODES).find((key) => DEBUG_MODES[key] === value) ?? 'Final';
}

animate();

// handy for poking at the pipeline from the console
window.PIXEL_HARBOR = {
  pixelRenderer, cameraController, world, state, stylizePass, hud, gui, styleManager, audio, demo,
  // offline score rendering, used to produce the showcase soundtrack
  renderScoreOffline, analyseBuffer, bufferToWav, normalizeBuffer,
  // console handle: season changes go through the same path the HUD uses
  setSeason: (name) => { state.season = name; applySeason(world, name); hud.syncSeason(name); },
  // await PIXEL_HARBOR.selfTest()  -> quantitative pipeline regression check
  selfTest: createSelfTest({ pixelRenderer, stylizePass, cameraController, world }),
};
