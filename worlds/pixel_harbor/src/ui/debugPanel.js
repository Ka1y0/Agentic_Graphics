import * as THREE from 'three';
import GUI from 'lil-gui';
import { PALETTE } from '../util/palette.js';
import { DEBUG_MODES } from '../rendering/StylizePass.js';
import { lightingUniforms, shadowUniforms } from '../rendering/ToonMaterial.js';
import { setLightAngles, applyLightingPreset } from '../scene/createScene.js';
import { LIGHTING_PRESETS } from '../util/palette.js';

/**
 * Visual debugging surface. Every knob that shapes the look is exposed here so
 * the pipeline can be inspected directly rather than guessed at: each buffer
 * can be viewed in isolation, and every threshold/weight is live.
 */
/**
 * Art-direction saturation control: rebuilds a colour family from the palette
 * and pulls it toward or past neutral. Materials are keyed by their original
 * hex so repeated adjustment never compounds.
 */
const GREY = new THREE.Color(0.55, 0.55, 0.55);
const BASE = PALETTE;

function tintGroup(world, keys, amount) {
  const wanted = new Set(keys.map((k) => PALETTE[k]));
  world.scene.traverse((o) => {
    if (!o.isMesh || !o.material?.uniforms?.uColor) return;
    const origin = o.material.userData.baseHex ??
      (o.material.userData.baseHex = o.material.uniforms.uColor.value.getHex());
    if (!wanted.has(origin)) return;
    const c = o.material.uniforms.uColor.value.setHex(origin);
    c.lerp(GREY, 1 - Math.min(amount, 1));
    if (amount > 1) c.multiplyScalar(1 + (amount - 1) * 0.4);
  });
}

export function createDebugPanel({ pixelRenderer, stylizePass, cameraController, world, state, styleManager }) {
  const gui = new GUI({ title: 'Pixel Harbor — Debug', autoPlace: false });
  // collapsed by default: a compact entry point, not a second HUD panel
  gui.close();
  const u = stylizePass.uniforms;

  // ------------------------------------------------------------- world / sun
  const sun = gui.addFolder('World & Sun');

  // ---- time ------------------------------------------------------------
  // Pausing holds WORLD time only: the sun, lighting, lamps, house windows and
  // the villager's schedule all stop together because they all read the same
  // clock. Rendering, waves, particles, the camera and audio keep running.
  sun.add(world, 'timePaused').name('pause world time').listen();
  sun
    .add(world, 'timeScale', { '0.25x': 0.25, '0.5x': 0.5, '1x': 1, '2x': 2, '5x': 5, '10x': 10, '60x': 60 })
    .name('time scale')
    .listen();
  sun
    .add(world.sun, 'minutes', 0, 24 * 60 - 1, 1)
    .name('time of day (min)')
    .onChange((v) => world.sun.setMinutes(v))
    .listen();

  const jump = (minutes) => () => {
    world.sun.setMinutes(minutes);
    // Everything time-dependent recomputes from sun.minutes, so a jump lands
    // the sun, the light, the night state, the lamps, the windows and the
    // villager's activity on the same instant.
    world.nightLighting.update(world.sun, world.character.mesh.getWorldPosition(new THREE.Vector3()));
  };
  sun.add({ dawn: jump(6 * 60 + 30) }, 'dawn').name('jump to sunrise');
  sun.add({ noon: jump(12 * 60) }, 'noon').name('jump to noon');
  sun.add({ dusk: jump(17 * 60 + 30) }, 'dusk').name('jump to sunset');
  sun.add({ midnight: jump(0) }, 'midnight').name('jump to midnight');
  sun.add(world.sky.uniforms.uSunRadius, 'value', 0.01, 0.30, 0.002).name('sun disc size');
  sun.add({ compass: false }, 'compass')
    .name('compass overlay')
    .onChange((on) => { document.getElementById('hud')?.classList.toggle('show-compass', on); });
  sun.close();

  // ------------------------------------------------------------- style
  const styles = gui.addFolder('Style');
  const styleOptions = {};
  for (const profile of styleManager.list) {
    styleOptions[profile.future ? `${profile.name} (future)` : profile.name] = profile.id;
  }
  styles
    .add(state, 'style', styleOptions)
    .name('viewing style')
    .onChange((id) => {
      const applied = styleManager.apply(id);
      if (!applied) {
        // a future style: bounce the control back and say why
        const profile = styleManager.profiles.get(id);
        if (profile?.future) console.info(`[style] ${profile.name} not implemented: ${profile.reason}`);
        state.style = styleManager.current.id;
      }
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
    })
    .listen();
  styles.add({ strategy: () => console.info(
    styleManager.list.map((p) => `${p.future ? '[future] ' : ''}${p.name}: ${p.strategy ?? p.reason}`).join('\n'),
  ) }, 'strategy').name('log render strategies');

  // ---- blueprint ----
  const bp = styles.addFolder('Blueprint');
  bp.add(u.uLineDensity, 'value', 0, 2, 0.01).name('line density');
  bp.add(u.uGridAmount, 'value', 0, 1, 0.01).name('grid amount');
  bp.add(u.uGridSize, 'value', 4, 40, 1).name('grid size');
  bp.add(u.uAnnotation, 'value', 0, 1, 0.01).name('annotation amount');
  bp.add(u.uBlueprintFill, 'value', 0, 2, 0.01).name('fill opacity');
  bp.close();

  // ---- pencil ----
  const pc = styles.addFolder('Pencil');
  pc.add(u.uHatchDensity, 'value', 2, 16, 0.1).name('hatch spacing (px)');
  pc.add(u.uPaperStrength, 'value', 0, 2, 0.01).name('paper strength');
  pc.add(u.uLineDarkness, 'value', 0, 1.5, 0.01).name('line darkness');
  pc.add(u.uHatchStart, 'value', 0, 1, 0.01).name('hatch threshold');
  pc.add(u.uHatchWidth, 'value', 0, 0.6, 0.01).name('hatch width');
  pc.add(u.uWashStrength, 'value', 0, 1, 0.01).name('tonal wash');
  pc.add(u.uContourWeight, 'value', 0, 1.5, 0.01).name('contour weight');
  pc.close();

  // ---- ascii / crt ----
  const asc = styles.addFolder('ASCII / CRT');
  const au = pixelRenderer.asciiPass.uniforms;
  asc.add(au.uCellSize, 'value', 4, 24, 1).name('cell size');
  asc.add(au.uCharsetDensity, 'value', 0.2, 2, 0.01).name('charset density');
  asc.add(au.uCrtIntensity, 'value', 0, 1, 0.01).name('CRT intensity');
  asc.add(au.uGlow, 'value', 0, 2, 0.01).name('glow');
  asc.add(au.uScanline, 'value', 0, 1, 0.01).name('scanline amount');
  asc.close();

  styles.close();

  // ------------------------------------------------------------- buffers
  const buffers = gui.addFolder('Buffer view');
  buffers
    .add(state, 'debugMode', DEBUG_MODES)
    .name('display')
    .onChange((value) => { u.uDebugMode.value = value; });
  buffers.close();

  // ------------------------------------------------------------- pixels
  const pixels = gui.addFolder('Pixel grid');
  pixels
    .add(state, 'pixelScale', 1, 8, 1)
    .name('pixel scale')
    .onChange((value) => {
      pixelRenderer.setPixelScale(value);
      cameraController.resize(pixelRenderer.internalWidth, pixelRenderer.internalHeight);
      stylizePass.setResolution(pixelRenderer.internalWidth, pixelRenderer.internalHeight);
    });
  pixels
    .add(state, 'pixelsPerUnit', 4, 32, 1)
    .name('pixels / world unit')
    .onChange((value) => {
      cameraController.setPixelsPerUnit(value);
      world.character.setPixelsPerUnit(value);
    });
  pixels.add(cameraController, 'snapEnabled').name('camera pixel snap');
  pixels.add(world.character, 'snapToPixelGrid').name('sprite pixel snap');
  pixels.close();

  // ------------------------------------------------------------- outlines
  const edges = gui.addFolder('Edge detection');
  edges.add(u.uDepthThreshold, 'value', 0, 0.02, 0.0001).name('depth threshold');
  edges.add(u.uNormalThreshold, 'value', 0, 1.2, 0.01).name('normal threshold');
  edges.add(u.uDepthWeight, 'value', 0, 1, 0.01).name('depth weight');
  edges.add(u.uNormalWeight, 'value', 0, 1, 0.01).name('normal weight');
  edges.add(u.uOutlineStrength, 'value', 0, 1, 0.01).name('outline strength');
  edges.add(u.uOutlineDarkness, 'value', 0.2, 1.0, 0.01).name('outline darkness');
  edges.add(u.uOutlineSaturation, 'value', 0, 2, 0.01).name('outline saturation');
  edges.add(u.uOutlineMinLuma, 'value', 0, 0.25, 0.005).name('outline min luma');
  edges.close();

  // ------------------------------------------------------------- shadows
  const shadows = gui.addFolder('Shadows');
  shadows.add(shadowUniforms.uShadowEnabled, 'value', { off: 0, on: 1 }).name('cast shadows');
  shadows.add(shadowUniforms.uShadowStrength, 'value', 0, 1, 0.01).name('shadow strength');
  shadows.add(shadowUniforms.uShadowDeepen, 'value', 0, 0.6, 0.01).name('deep shadow');
  shadows.add(shadowUniforms.uShadowTintStrength, 'value', 0, 1, 0.01).name('shadow tint');
  shadows.add(shadowUniforms.uShadowBias, 'value', 0, 0.005, 0.0001).name('depth bias');
  shadows.add(shadowUniforms.uShadowNormalBias, 'value', 0, 1.5, 0.01).name('normal bias');
  shadows.add(shadowUniforms.uShadowDebug, 'value', { off: 0, on: 1 }).name('shadow map debug');
  shadows
    .add(state, 'shadowMapSize', { '512': 512, '1024': 1024, '2048': 2048 })
    .name('shadow map size')
    .onChange((v) => pixelRenderer.setShadowMapSize(Number(v)));
  shadows.close();

  // ------------------------------------------------------------- shading
  const shading = gui.addFolder('Tone shading');
  shading.add(lightingUniforms.uToneSteps, 'value', 2, 10, 1).name('tone steps');
  shading.add(lightingUniforms.uAmbient, 'value', 0, 1, 0.01).name('ambient');
  shading.add(lightingUniforms.uShadowLevel, 'value', 0, 1, 0.01).name('shadow level');
  shading.add(lightingUniforms.uLightLevel, 'value', 0.5, 1.6, 0.01).name('light level');
  shading
    .add(state, 'lightAzimuth', 0, 360, 1)
    .name('light azimuth')
    .onChange(() => setLightAngles(state.lightAzimuth, state.lightElevation));
  shading
    .add(state, 'lightElevation', 5, 89, 1)
    .name('light elevation')
    .onChange(() => setLightAngles(state.lightAzimuth, state.lightElevation));
  shading.close();

  // ------------------------------------------------------------- palette
  const palette = gui.addFolder('Palette');
  palette.add(u.uPaletteEnabled, 'value', { off: 0, on: 1 }).name('palette mapping');
  palette.add(u.uPaletteStrength, 'value', 0, 1, 0.01).name('palette strength');
  palette
    .add(state, 'lightingPreset', Object.keys(LIGHTING_PRESETS))
    .name('lighting preset')
    .onChange((name) => {
      const preset = applyLightingPreset(world.scene, name);
      state.lightAzimuth = preset.azimuth;
      state.lightElevation = preset.elevation;
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
    });
  palette.add(world.sky.uniforms.uBandSteps, 'value', 2, 8, 1).name('sky bands');
  palette.add(world.sky.uniforms.uCloudAmount, 'value', 0, 1, 0.01).name('cloud amount');
  palette
    .add({ sakura: 1 }, 'sakura', 0, 2, 0.01)
    .name('sakura saturation')
    .onChange((v) => tintGroup(world, ['sakura', 'sakuraDark', 'sakuraLight'], v));
  palette
    .add({ vermilion: 1 }, 'vermilion', 0, 2, 0.01)
    .name('vermilion strength')
    .onChange((v) => tintGroup(world, ['vermilion', 'vermilionDark', 'vermilionLight'], v));
  palette
    .add({ water: 1 }, 'water', 0, 2, 0.01)
    .name('water palette intensity')
    .onChange((v) => {
      const u = world.water.uniforms;
      for (const [key, name] of [['uWaterDeep','waterDeep'],['uWaterMid','water'],
                                 ['uWaterShallow','waterShallow'],['uWaterCrest','waterCrest']]) {
        u[key].value.setHex(BASE[name]).multiplyScalar(1).lerp(GREY, 1 - Math.min(v, 1));
        if (v > 1) u[key].value.multiplyScalar(1 + (v - 1) * 0.35);
      }
    });
  palette.close();

  // ------------------------------------------------------------- character
  const character = gui.addFolder('Character');
  character.add(world.character, 'animationSpeed', 0, 3, 0.05).name('animation speed');
  character
    .add(world.character, 'forcedDirection', { auto: null, north: 'north', south: 'south', east: 'east', west: 'west' })
    .name('direction');
  character.add(world.character, 'snapToPixelGrid').name('sprite pixel snap');
  character.add({ showAtlas: () => {
    const w = window.open('', '_blank');
    if (w) w.document.write('<body style="background:#222;margin:0"><img style="image-rendering:pixelated;width:512px" src="' + world.character.atlasCanvas.toDataURL() + '">');
  } }, 'showAtlas').name('open sprite atlas');
  character.close();

  // ------------------------------------------------------------- water
  const water = gui.addFolder('Water');
  water.add(world.water, 'amplitude', 0, 3, 0.01).name('wave amplitude');
  water.add(world.water, 'speed', 0, 3, 0.01).name('wave speed');
  water.add(world.water.uniforms.uWaterToneSteps, 'value', 2, 8, 1).name('water tone steps');
  water.add(world.water.uniforms.uFoamAmount, 'value', 0, 0.5, 0.005).name('foam amount');
  water.add(world.water.uniforms.uFoamThreshold, 'value', 0, 2, 0.01).name('foam threshold');
  water.add(world.water.uniforms.uFoamSpeed, 'value', 0, 3, 0.05).name('foam speed');
  water.add(world.water.uniforms.uCrestFoam, 'value', 0, 1, 0.01).name('crest foam');
  water.close();

  // ------------------------------------------------------------- camera
  const camera = gui.addFolder('Camera');
  camera
    .add(cameraController, 'azimuth', 0, 360, 1)
    .name('ortho azimuth')
    .listen();
  camera
    .add(cameraController, 'elevation', 10, 80, 1)
    .name('ortho elevation')
    .listen();
  camera.close();

  // ------------------------------------------------------------- showcase
  // The demo is wired in later (main.js owns the director), so the folder is
  // built here and filled by `bindDemo`.
  const showcase = gui.addFolder('Showcase');
  showcase.close();
  gui.bindDemo = (demo) => {
    const actions = {
      run: () => demo.start(),
      stop: () => demo.stop(),
    };
    showcase.add(actions, 'run').name('Run Cinematic Showcase');
    showcase.add(actions, 'stop').name('Stop');
  };

  return gui;
}
