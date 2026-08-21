// ===========================================================================
//  ASCII / CRT pass
// ===========================================================================
//
// Rebuilds the finished frame out of glyphs. Each character cell samples the
// stylized buffer once at its centre, maps that luminance to a glyph on a
// density ramp, and stamps it. Because the glyph index comes from LUMINANCE and
// is pushed up by EDGE strength, silhouettes survive the translation -- the
// torii, the gate and the pier stay readable instead of dissolving into noise.

uniform sampler2D tStylized;
uniform sampler2D tGlyphs;
uniform vec2  uResolution;      // internal resolution of tStylized
uniform vec2  uOutputSize;      // pixels of the pass output
uniform float uCellSize;        // output pixels per character cell
uniform float uToneWeight;      // how much flat tone drives the glyph choice
uniform float uEdgeBoost;       // how much a silhouette densifies its cell
uniform float uGlyphCount;
uniform float uCharsetDensity;
uniform float uCrtIntensity;
uniform float uGlow;
uniform float uScanline;
uniform float uContrast;
uniform vec3  uTint;
uniform float uTime;

varying vec2 vUv;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec2 outPx = vUv * uOutputSize;

  // ---- which character cell are we in, and where inside it? -------------
  vec2 cell = floor(outPx / uCellSize);
  vec2 inCell = fract(outPx / uCellSize);
  vec2 cellCentreUv = (cell + 0.5) * uCellSize / uOutputSize;

  // ---- sample the source once per cell ----------------------------------
  vec3 src = texture2D(tStylized, cellCentreUv).rgb;
  float L = luma(src);

  // local contrast against the cell's neighbours stands in for edge strength:
  // a cell sitting on a silhouette gets pushed to a denser glyph so outlines
  // survive as heavier characters
  vec2 step1 = uCellSize / uOutputSize;
  float lLeft  = luma(texture2D(tStylized, cellCentreUv - vec2(step1.x, 0.0)).rgb);
  float lRight = luma(texture2D(tStylized, cellCentreUv + vec2(step1.x, 0.0)).rgb);
  float lUp    = luma(texture2D(tStylized, cellCentreUv + vec2(0.0, step1.y)).rgb);
  float lDown  = luma(texture2D(tStylized, cellCentreUv - vec2(0.0, step1.y)).rgb);
  float contrast = max(max(abs(L - lLeft), abs(L - lRight)),
                       max(abs(L - lUp), abs(L - lDown)));

  // Stretch the source's tonal range before it is quantized to glyphs. The
  // harbour's mid-tones cluster tightly, so without this most cells land on the
  // same two or three characters and the silhouette dissolves.
  //
  // Tone has to stay the main driver. The edge term used to be `contrast * 1.8`,
  // which is more than the entire glyph ramp: any cell with the faintest local
  // difference jumped straight to the densest character, so at a legible cell
  // size the whole frame filled in solid and Fuji, the torii and the pier all
  // vanished. Edges now accent a tonal image instead of replacing it.
  // Window chosen from the measured histogram of the stylized buffer, not by
  // eye: the sea clusters at luma 0.47 and the sky at 0.62, so a wide window
  // put both on neighbouring glyphs and the coastline disappeared. Mapping
  // 0.32..0.82 across the ramp puts the land in the empty cells, the sea low
  // and the sky mid, which is what makes the island read as a shape.
  float stretched = clamp((L - 0.32) / 0.50, 0.0, 1.0);
  stretched = pow(stretched, 1.0 / max(uContrast, 0.05));
  float edge = smoothstep(0.04, 0.24, contrast);
  float density = clamp(stretched * uCharsetDensity * uToneWeight + edge * uEdgeBoost, 0.0, 0.999);

  // ---- pick and sample the glyph ----------------------------------------
  float index = floor(density * uGlyphCount);
  vec2 glyphUv = vec2((index + inCell.x) / uGlyphCount, inCell.y);
  float glyph = texture2D(tGlyphs, glyphUv).r;

  // ---- phosphor ----------------------------------------------------------
  // brightness follows the source, so the picture keeps its tonal structure
  // a floor on the brightness term keeps dark cells as faint glyphs rather than
  // dropping them to black, which is what preserves the harbour's silhouette
  vec3 color = uTint * glyph * (0.52 + 0.72 * L);

  // bloom: bleed a little of the neighbouring cells' light
  float bleed = (lLeft + lRight + lUp + lDown) * 0.25;
  color += uTint * bleed * uGlow * 0.28;

  // ---- CRT ---------------------------------------------------------------
  float scan = 1.0 - uScanline * 0.5 * (0.5 + 0.5 * sin(outPx.y * 3.14159));
  color *= mix(1.0, scan, uCrtIntensity);

  // vignette
  vec2 v = vUv * 2.0 - 1.0;
  float vig = 1.0 - dot(v, v) * 0.28 * uCrtIntensity;
  color *= clamp(vig, 0.0, 1.0);

  // slow mains flicker, deliberately subtle
  color *= 1.0 + sin(uTime * 7.3) * 0.012 * uCrtIntensity;

  gl_FragColor = vec4(color, 1.0);
}
