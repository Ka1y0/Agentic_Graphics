import * as THREE from 'three';
import { lightingUniforms, shadowUniforms } from '../rendering/ToonMaterial.js';

/**
 * ===========================================================================
 *  Style manager — one world, several ways of looking at it
 * ===========================================================================
 *
 * The project is split into two layers:
 *
 *   WORLD LAYER   terrain, sea, harbour, shrine, buildings, boats, character,
 *                 animation, camera, time and HUD *data*. Knows nothing about
 *                 how it will be drawn.
 *
 *   STYLE LAYER   a profile describing the rules for turning that world into
 *                 an image: palette, lighting model, outline treatment, tone
 *                 quantization, sky, render strategy, HUD skin.
 *
 * Switching styles applies a profile. It never rebuilds the scene, never moves
 * the camera and never resets animation — so the boat stays where it was, the
 * character keeps walking, and the clock keeps running. The world is simply
 * being read under a different set of rules.
 *
 * A profile is data plus two optional hooks (`enter` / `exit`) for anything a
 * style needs that is not expressible as parameters.
 */

/**
 * Reference framing. Styles may rasterize at different internal resolutions,
 * so `pixelsPerUnit` is derived rather than stored: keeping
 * `pixelScale * pixelsPerUnit` constant means every style shows exactly the
 * same slice of the world, which is what makes a switch feel like a change of
 * medium rather than a change of shot.
 */
export const REFERENCE = { pixelScale: 3, pixelsPerUnit: 6 };

export function pixelsPerUnitFor(pixelScale) {
  return (REFERENCE.pixelScale * REFERENCE.pixelsPerUnit) / pixelScale;
}

export class StyleManager {
  constructor({ pixelRenderer, stylizePass, cameraController, world, hud, state }) {
    this.pixelRenderer = pixelRenderer;
    this.stylizePass = stylizePass;
    this.cameraController = cameraController;
    this.world = world;
    this.hud = hud;
    this.state = state;

    this.profiles = new Map();
    this.order = [];
    this.current = null;
    this._transitionEl = null;
  }

  register(profile) {
    this.profiles.set(profile.id, profile);
    this.order.push(profile.id);
    return this;
  }

  get list() {
    return this.order.map((id) => this.profiles.get(id));
  }

  get available() {
    return this.list.filter((p) => !p.future);
  }

  /** Cycle to the next available style (used by the keyboard shortcut). */
  next(dir = 1) {
    const ids = this.available.map((p) => p.id);
    const i = ids.indexOf(this.current?.id);
    const nextId = ids[(i + dir + ids.length) % ids.length];
    this.apply(nextId);
    return nextId;
  }

  apply(id, { transition = true } = {}) {
    const profile = this.profiles.get(id);
    if (!profile || profile.future) return false;
    if (this.current?.id === id) return false;

    const previous = this.current;
    if (previous?.exit) previous.exit(this._context());

    if (transition) this._flash(profile);

    this.current = profile;
    this.state.style = id;

    this._applyRenderer(profile);
    this._applyLighting(profile);
    this._applyStylize(profile);
    this._applyWorld(profile);
    this._applyHud(profile);

    if (profile.enter) profile.enter(this._context());
    return true;
  }

  _context() {
    return {
      pixelRenderer: this.pixelRenderer,
      stylizePass: this.stylizePass,
      cameraController: this.cameraController,
      world: this.world,
      hud: this.hud,
      state: this.state,
      lightingUniforms,
      shadowUniforms,
      THREE,
    };
  }

  // ---- renderer: internal resolution and framing -------------------------
  _applyRenderer(profile) {
    const r = profile.renderer ?? {};
    const scale = r.pixelScale ?? REFERENCE.pixelScale;

    if (scale !== this.pixelRenderer.pixelScale) {
      this.pixelRenderer.setPixelScale(scale);
    }
    // Compensate so the visible slice of the world is identical across styles.
    this.cameraController.setPixelsPerUnit(pixelsPerUnitFor(scale));
    this.cameraController.resize(this.pixelRenderer.internalWidth, this.pixelRenderer.internalHeight);
    this.stylizePass.setResolution(this.pixelRenderer.internalWidth, this.pixelRenderer.internalHeight);

    this.pixelRenderer.setAsciiEnabled(!!r.ascii);
    if (r.ascii) this.pixelRenderer.asciiPass.configure(r.ascii);

    this.cameraController.snapEnabled = r.pixelSnap ?? true;
  }

  // ---- lighting / shading model ------------------------------------------
  _applyLighting(profile) {
    const l = profile.lighting ?? {};
    if (l.toneSteps !== undefined) lightingUniforms.uToneSteps.value = l.toneSteps;
    if (l.ambient !== undefined) lightingUniforms.uAmbient.value = l.ambient;
    if (l.shadowLevel !== undefined) lightingUniforms.uShadowLevel.value = l.shadowLevel;
    if (l.lightLevel !== undefined) lightingUniforms.uLightLevel.value = l.lightLevel;
    if (l.lightColor !== undefined) lightingUniforms.uLightColor.value.setHex(l.lightColor);
    if (l.skyColor !== undefined) lightingUniforms.uSkyColor.value.setHex(l.skyColor);
    if (l.groundColor !== undefined) lightingUniforms.uGroundColor.value.setHex(l.groundColor);
    if (l.shadowTint !== undefined) lightingUniforms.uShadowTint.value.setHex(l.shadowTint);

    if (l.shadowStrength !== undefined) shadowUniforms.uShadowStrength.value = l.shadowStrength;
    if (l.shadowDeepen !== undefined) shadowUniforms.uShadowDeepen.value = l.shadowDeepen;
    if (l.shadowTintStrength !== undefined) shadowUniforms.uShadowTintStrength.value = l.shadowTintStrength;
    if (l.shadowsEnabled !== undefined) shadowUniforms.uShadowEnabled.value = l.shadowsEnabled ? 1 : 0;
  }

  // ---- composite pass -----------------------------------------------------
  _applyStylize(profile) {
    const u = this.stylizePass.uniforms;
    u.uStyleMode.value = profile.styleMode ?? 0;

    const o = profile.outline ?? {};
    if (o.depthThreshold !== undefined) u.uDepthThreshold.value = o.depthThreshold;
    if (o.normalThreshold !== undefined) u.uNormalThreshold.value = o.normalThreshold;
    if (o.depthWeight !== undefined) u.uDepthWeight.value = o.depthWeight;
    if (o.normalWeight !== undefined) u.uNormalWeight.value = o.normalWeight;
    if (o.strength !== undefined) u.uOutlineStrength.value = o.strength;
    if (o.darkness !== undefined) u.uOutlineDarkness.value = o.darkness;
    if (o.saturation !== undefined) u.uOutlineSaturation.value = o.saturation;
    if (o.minLuma !== undefined) u.uOutlineMinLuma.value = o.minLuma;

    const p = profile.post ?? {};
    if (p.paletteEnabled !== undefined) u.uPaletteEnabled.value = p.paletteEnabled ? 1 : 0;
    if (p.paletteStrength !== undefined) u.uPaletteStrength.value = p.paletteStrength;

    for (const [key, value] of Object.entries(profile.styleUniforms ?? {})) {
      const uniform = u[key];
      if (!uniform) continue;
      if (uniform.value?.isColor) uniform.value.setHex(value);
      else uniform.value = value;
    }
  }

  // ---- world-side accents (sky treatment, water tuning) ------------------
  _applyWorld(profile) {
    const w = profile.world ?? {};
    const sky = this.world.sky?.uniforms;
    if (sky) {
      if (w.skyBands !== undefined) sky.uBandSteps.value = w.skyBands;
      if (w.cloudAmount !== undefined) sky.uCloudAmount.value = w.cloudAmount;
      if (w.skyHigh !== undefined) sky.uSkyHigh.value.setHex(w.skyHigh);
      if (w.skyMid !== undefined) sky.uSkyMid.value.setHex(w.skyMid);
      if (w.skyLow !== undefined) sky.uSkyLow.value.setHex(w.skyLow);
      if (w.cloud !== undefined) sky.uCloud.value.setHex(w.cloud);
      if (w.cloudShade !== undefined) sky.uCloudShade.value.setHex(w.cloudShade);
    }
    if (this.world.sky?.mesh && w.skyVisible !== undefined) {
      this.world.sky.mesh.visible = w.skyVisible;
      // With the sky shell hidden the colour target clears to the scene
      // background, and a bright clear colour reads as geometry to any style
      // that keys off luminance — Neon painted its whole frame as solid body
      // because of it. Styles that draw their own background get a black clear.
      this.world.scene.background = w.skyVisible
        ? new THREE.Color(this._skyBackground ?? 0xa8c6d4)
        : new THREE.Color(0x000000);
    }
    const water = this.world.water?.uniforms;
    if (water) {
      if (w.waterToneSteps !== undefined) water.uWaterToneSteps.value = w.waterToneSteps;
      if (w.crestFoam !== undefined) water.uCrestFoam.value = w.crestFoam;
      if (w.foamAmount !== undefined) water.uFoamAmount.value = w.foamAmount;
    }
  }

  /** Remembers the lighting preset's sky colour for styles that show the sky. */
  rememberSkyBackground(hex) { this._skyBackground = hex; }

  // ---- HUD skin -----------------------------------------------------------
  _applyHud(profile) {
    const hudEl = document.getElementById('hud');
    if (!hudEl) return;
    for (const cls of [...hudEl.classList]) {
      if (cls.startsWith('skin-')) hudEl.classList.remove(cls);
    }
    hudEl.classList.add(`skin-${profile.hudSkin ?? 'washi'}`);
    this.hud?.setStyleName?.(profile.name);
    this.hud?.syncStyleSwitcher?.(this);
  }

  /**
   * A brief wash over the canvas. Deliberately short and low-contrast: the
   * point of the switch is that the world does not move, and a heavy
   * transition would hide exactly the continuity worth showing.
   */
  _flash(profile) {
    if (!this._transitionEl) {
      const el = document.createElement('div');
      el.id = 'style-wipe';
      document.getElementById('stage')?.appendChild(el);
      this._transitionEl = el;
    }
    const el = this._transitionEl;
    el.style.background = profile.wipeColor ?? '#e8e2cc';
    el.style.transition = 'none';
    el.style.opacity = '0.85';
    // force a reflow so the transition actually runs from the new value
    void el.offsetWidth;
    el.style.transition = 'opacity 260ms ease-out';
    el.style.opacity = '0';
  }
}
