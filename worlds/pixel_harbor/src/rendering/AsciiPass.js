import * as THREE from 'three';

import fullscreenVert from './shaders/fullscreen.vert.glsl?raw';
import asciiFrag from './shaders/ascii.frag.glsl?raw';

/**
 * Glyph ramp, ordered light -> dense. Drawn into an atlas at runtime rather
 * than shipped as an image, so the whole project stays asset-free.
 */
const RAMP = ' .:-=+*#%@';
const GLYPH_W = 8;
const GLYPH_H = 8;

function buildGlyphAtlas(chars) {
  const canvas = document.createElement('canvas');
  canvas.width = GLYPH_W * chars.length;
  canvas.height = GLYPH_H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = `${GLYPH_H}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], i * GLYPH_W + GLYPH_W / 2, GLYPH_H / 2 + 0.5);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return { texture, canvas, count: chars.length };
}

/**
 * Terminal pass. Runs after the normal composite, so it inherits everything
 * the pipeline already resolved (edges, tone bands, shadows) and only changes
 * how that image is displayed.
 */
export class AsciiPass {
  constructor() {
    const atlas = buildGlyphAtlas(RAMP);
    this.atlas = atlas;

    this.uniforms = {
      tStylized: { value: null },
      tGlyphs: { value: atlas.texture },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uOutputSize: { value: new THREE.Vector2(1, 1) },
      uCellSize: { value: 8 },
      uToneWeight: { value: 0.82 },
      uEdgeBoost: { value: 0.42 },
      uGlyphCount: { value: atlas.count },
      uCharsetDensity: { value: 1.0 },
      uCrtIntensity: { value: 0.75 },
      uGlow: { value: 0.55 },
      uScanline: { value: 0.45 },
      uContrast: { value: 1.35 },
      uTint: { value: new THREE.Color(0x66ff88) },
      uTime: { value: 0 },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: fullscreenVert,
      fragmentShader: asciiFrag,
      depthTest: false,
      depthWrite: false,
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  configure(options = {}) {
    const u = this.uniforms;
    // Held in INTERNAL pixels and scaled up in `setSizes`.
    //
    // The uniform is in output pixels, so a fixed value meant the character
    // grid got finer as the window got larger: at 1920x1080 a cell of 8 gave
    // 240x135 cells and the harbour dissolved into noise — Fuji, the torii and
    // the pier were no longer identifiable, which is the one thing this style
    // has to preserve. Tying the cell to the pixel grid instead keeps glyphs
    // the same size on screen at any resolution, and a wider window simply
    // shows more of them, the way a terminal does.
    if (options.cellSize !== undefined) this._cellInternal = options.cellSize;
    if (options.charsetDensity !== undefined) u.uCharsetDensity.value = options.charsetDensity;
    if (options.toneWeight !== undefined) u.uToneWeight.value = options.toneWeight;
    if (options.edgeBoost !== undefined) u.uEdgeBoost.value = options.edgeBoost;
    if (options.crtIntensity !== undefined) u.uCrtIntensity.value = options.crtIntensity;
    if (options.glow !== undefined) u.uGlow.value = options.glow;
    if (options.scanline !== undefined) u.uScanline.value = options.scanline;
    if (options.contrast !== undefined) u.uContrast.value = options.contrast;
    if (options.tint !== undefined) u.uTint.value.setHex(options.tint);
  }

  setSizes(internalWidth, internalHeight, outputWidth, outputHeight) {
    this.uniforms.uResolution.value.set(internalWidth, internalHeight);
    this.uniforms.uOutputSize.value.set(outputWidth, outputHeight);
    const scale = internalWidth > 0 ? outputWidth / internalWidth : 1;
    this.uniforms.uCellSize.value = (this._cellInternal ?? 8) * scale;
  }

  render(renderer, sourceTexture, time) {
    this.uniforms.tStylized.value = sourceTexture;
    this.uniforms.uTime.value = time;
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }
}
