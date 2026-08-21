// ===========================================================================
//  Stylize / composite pass
// ---------------------------------------------------------------------------
//  Runs at the INTERNAL (low) resolution and consumes three low-res buffers:
//      tColor   - quantized-tone scene colour
//      tDepth   - depth texture attached to the colour target
//      tNormal  - view-space normals from the dedicated normal pass
//
//  It produces geometric outlines from depth + normal discontinuities and
//  tints those outlines with the *object's own* colour. There is deliberately
//  no Sobel filter on RGB anywhere in here.
// ===========================================================================

uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tNormal;

uniform vec2  uResolution;      // internal render resolution, in texels
uniform float uCameraNear;
uniform float uCameraFar;
uniform float uIsOrtho;         // 1.0 orthographic, 0.0 perspective

uniform float uDepthThreshold;
uniform float uNormalThreshold;
uniform float uDepthWeight;
uniform float uNormalWeight;
uniform float uOutlineStrength;
uniform float uOutlineDarkness;   // outline = base * this
uniform float uOutlineSaturation; // >1 keeps outlines colourful, not muddy
uniform float uOutlineMinLuma;    // hard floor so an outline can never go black
uniform vec3  uNormalBias;        // picks which side of a crease gets the line

uniform int   uDebugMode;         // 0 final | 1 color | 2 depth | 3 normal
                                  // 4 edge  | 5 depth edge | 6 normal edge

// Window of view-space distance the depth debug view maps across. The camera
// sits ~160 units back in the default ortho setup, so normalising against the
// full near..far range would compress the whole scene into a couple of codes.
uniform float uDepthViewNear;
uniform float uDepthViewFar;

// ---- optional palette-guided output --------------------------------------
// Nudges the finished pixel toward the nearest colour the world is actually
// built from. Deliberately a *guide*, not a hard LUT: at strength 1 it is a
// strict palette lock, but any value below that keeps material separation
// while tightening the overall colour language. Default off -- it is an
// experiment, and the quantized lighting already does most of this work.
#define PALETTE_SIZE 26
uniform vec3  uPalette[PALETTE_SIZE];
uniform float uPaletteEnabled;
uniform float uPaletteStrength;

// ---- style modes ---------------------------------------------------------
// 0 ukiyo-e pixel (default) | 1 cel-shaded | 2 blueprint | 3 pencil sketch
//
// These are genuinely different composites of the SAME colour/depth/normal
// buffers, not tints of one another. The world, camera and animation are
// untouched by the mode; only the rules for turning those buffers into an
// image change.
uniform int   uStyleMode;

// blueprint
uniform vec3  uBlueprintBg;
uniform vec3  uBlueprintInk;
uniform vec3  uBlueprintGrid;
uniform float uBlueprintFill;
uniform float uGridAmount;
uniform float uGridSize;
uniform float uLineDensity;
uniform float uAnnotation;

// neon skyline
uniform vec3  uNeonSkyHigh;
uniform vec3  uNeonSkyLow;
uniform vec3  uNeonBody;
uniform vec3  uNeonEdge;
uniform vec3  uNeonGrid;
uniform float uNeonGridAmount;
uniform float uNeonGlow;
uniform float uNeonHorizon;
uniform float uTimeless;   // slow scroll for the neon grid

// pencil
uniform vec3  uPaperColor;
uniform vec3  uGraphite;
uniform float uHatchDensity;
uniform float uPaperStrength;
uniform float uLineDarkness;
uniform float uHatchStart;      // how dark a surface must be before it is hatched
uniform float uHatchWidth;      // maximum stroke width, as a fraction of spacing
uniform float uWashStrength;    // flat tonal greys that replace most hatching
uniform float uContourWeight;

varying vec2 vUv;

// --------------------------------------------------------------------------
// Depth -> linear distance along the view axis, in world units.
// Written out explicitly rather than pulled from <packing> so the pass does not
// depend on three.js chunk naming, and so both projections share one code path.
// --------------------------------------------------------------------------
float linearDepth(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  // Orthographic window depth is already linear in view z; perspective is not.
  // Mixed rather than branched, because uIsOrtho is fractional while the view
  // transition blends the projection — a hard branch would pop mid-flight.
  float orthoZ = uCameraNear + d * (uCameraFar - uCameraNear);
  float z = d * 2.0 - 1.0;
  float perspZ = (2.0 * uCameraNear * uCameraFar) /
                 (uCameraFar + uCameraNear - z * (uCameraFar - uCameraNear));
  return mix(perspZ, orthoZ, clamp(uIsOrtho, 0.0, 1.0));
}

vec3 readNormal(vec2 uv) {
  return normalize(texture2D(tNormal, uv).xyz * 2.0 - 1.0);
}

// One neighbour's contribution to the normal-crease term.
//   diff  : 1 - dot(nA, nB), the actual surface-orientation discontinuity
//   side  : bias vector picks one consistent side so creases stay 1px wide
//   dGate : suppresses the term on pixels that sit *behind* their neighbour,
//           so an object's silhouette does not paint normal edges onto the
//           background it occludes
float normalNeighbour(vec2 uvN, float dN, vec3 nC, vec3 bias, float dC) {
  vec3  nN    = readNormal(uvN);
  float diff  = 1.0 - dot(nC, nN);
  float side  = step(0.0, dot(nC - nN, bias));
  float dGate = step(dC - dN, 0.02 * dC);
  return diff * side * dGate;
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

/** One family of parallel ruled lines, in internal-pixel space. */
float hatch(vec2 px, float angle, float spacing, float width) {
  float c = cos(angle), sn = sin(angle);
  float v = px.x * c + px.y * sn;
  return step(fract(v / spacing), width);
}

/** Cheap hash for paper grain and annotation placement. */
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 texel = 1.0 / uResolution;

  vec2 uvL = vUv + vec2(-texel.x, 0.0);
  vec2 uvR = vUv + vec2( texel.x, 0.0);
  vec2 uvU = vUv + vec2(0.0,  texel.y);
  vec2 uvD = vUv + vec2(0.0, -texel.y);

  vec3 base = texture2D(tColor, vUv).rgb;

  // ======================================================================
  // A. DEPTH EDGES
  // ----------------------------------------------------------------------
  // A plain |neighbour - centre| difference also fires on every steeply
  // slanted surface (the sea, roof planes, the beach) because depth changes
  // fast there. Using the second derivative instead cancels any constant
  // slope, so only genuine depth *discontinuities* survive: silhouettes,
  // occlusion boundaries, hull against water, pier against sea.
  //
  // The result is then gated to the nearer side of the discontinuity, so the
  // outline is painted onto the closer object -- which is what makes a
  // base-colour-derived outline read as part of that object.
  // ======================================================================
  float dC = linearDepth(vUv);
  float dL = linearDepth(uvL);
  float dR = linearDepth(uvR);
  float dU = linearDepth(uvU);
  float dD = linearDepth(uvD);

  float curvature = max(abs(dL + dR - 2.0 * dC),
                        abs(dU + dD - 2.0 * dC));
  float depthRel  = curvature / max(dC, 1.0);

  float avgNeighbour = (dL + dR + dU + dD) * 0.25;
  float nearSide     = step(dC, avgNeighbour);   // 1 when centre is the closer surface

  float depthEdge = step(uDepthThreshold, depthRel) * nearSide;

  // ======================================================================
  // B. NORMAL EDGES
  // ----------------------------------------------------------------------
  // 1 - dot(nA, nB) over view-space normals. This is what catches creases
  // that have no depth discontinuity at all: roof against wall, the three
  // visible faces of a crate, rock facets, the boat's hull panels.
  //
  // Two gates keep the line one pixel wide and on the right surface:
  //   * uNormalBias picks a consistent side of the crease
  //   * the depth gate stops a foreground silhouette from bleeding its
  //     normal difference onto the background pixels behind it
  // ======================================================================
  vec3 nC   = readNormal(vUv);
  vec3 bias = normalize(uNormalBias);

  float normalEdge = 0.0;
  normalEdge = max(normalEdge, normalNeighbour(uvL, dL, nC, bias, dC));
  normalEdge = max(normalEdge, normalNeighbour(uvR, dR, nC, bias, dC));
  normalEdge = max(normalEdge, normalNeighbour(uvU, dU, nC, bias, dC));
  normalEdge = max(normalEdge, normalNeighbour(uvD, dD, nC, bias, dC));

  float normalEdgeMask = step(uNormalThreshold, normalEdge);

  // ======================================================================
  // C. COMBINE
  // ======================================================================
  float edge = clamp(depthEdge * uDepthWeight + normalEdgeMask * uNormalWeight,
                     0.0, 1.0) * uOutlineStrength;

  // ======================================================================
  // D. COLOURED OUTLINE  (never a flat black line)
  // ----------------------------------------------------------------------
  // The outline is the pixel's own base colour, darkened and slightly
  // saturated, so wood darkens to brown, foliage to green, sea to deep blue
  // and the red roof to dark red.
  // ======================================================================
  vec3 outline = base * uOutlineDarkness;
  float lum = dot(outline, vec3(0.299, 0.587, 0.114));
  outline = clamp(mix(vec3(lum), outline, uOutlineSaturation), 0.0, 1.0);

  // Guarantee the "never a flat black line" rule for EVERY material, not just
  // the ones that happen to be light enough. A very dark albedo sitting in cast
  // shadow can darken far enough that 55% of it rounds to black; scaling the
  // outline back up along its own hue vector keeps the edge coloured without
  // touching anything that was already above the floor.
  float ol = dot(outline, vec3(0.299, 0.587, 0.114));
  if (ol < uOutlineMinLuma) {
    vec3 hueSource = ol > 0.002 ? outline : base;
    float hl = dot(hueSource, vec3(0.299, 0.587, 0.114));
    // if even the base is black, fall back to a cool ink rather than pure black
    if (hl < 0.002) { hueSource = vec3(0.32, 0.28, 0.42); hl = dot(hueSource, vec3(0.299, 0.587, 0.114)); }
    outline = hueSource * (uOutlineMinLuma / hl);
  }

  vec3 finalColor = mix(base, outline, edge);

  // =====================================================================
  //  STYLE COMPOSITES
  // =====================================================================
  vec2 px = vUv * uResolution;

  if (uStyleMode == 2) {
    // -------------------------------------------------------------------
    //  BLUEPRINT — the world as a live drafting sheet
    // -------------------------------------------------------------------
    // Structure lines dominate and surfaces are pushed almost flat. The two
    // edge detectors are used at different weights on purpose: depth edges
    // become the heavy outer linework (the object's extent), normal edges the
    // lighter interior construction lines (how it is put together), which is
    // exactly the distinction a real drawing makes.
    float outer = depthEdge;
    float inner = normalEdgeMask;
    float line = clamp(outer * 1.0 + inner * uLineDensity, 0.0, 1.0);

    // faint tonal fill so masses still read, but never enough to beat a line
    float fill = luma(base);
    vec3 sheet = uBlueprintBg + (fill - 0.35) * uBlueprintFill * vec3(0.35, 0.55, 0.9);

    // drafting grid, locked to internal pixels so it never crawls
    vec2 g = abs(fract(px / uGridSize) - 0.5);
    float gridLine = 1.0 - step(0.5 / uGridSize * 2.0, min(g.x, g.y));
    vec2 gMajor = abs(fract(px / (uGridSize * 5.0)) - 0.5);
    float gridMajor = 1.0 - step(0.5 / (uGridSize * 5.0) * 2.0, min(gMajor.x, gMajor.y));
    sheet = mix(sheet, uBlueprintGrid, gridLine * uGridAmount * 0.35);
    sheet = mix(sheet, uBlueprintGrid, gridMajor * uGridAmount * 0.7);

    // tick marks along strong edges, reading as dimension witness lines
    float tick = step(0.86, hash21(floor(px / 6.0))) * outer * uAnnotation;

    finalColor = mix(sheet, uBlueprintInk, clamp(line + tick, 0.0, 1.0));

  } else if (uStyleMode == 4) {
    // -------------------------------------------------------------------
    //  NEON SKYLINE — the same world under synthwave law
    // -------------------------------------------------------------------
    // Not a purple tint over the finished frame. The image is rebuilt: the
    // colour buffer is collapsed to a single luminance ramp between two neon
    // tones, the sky becomes a hard vertical gradient, a perspective grid is
    // laid below the horizon line, and the geometry edges come back as emissive
    // linework instead of darkened base colour.
    float lum = luma(base);
    float sky = step(uNeonHorizon, vUv.y);

    // background: vertical neon gradient, banded so it stays in the family
    float g = clamp((vUv.y - uNeonHorizon) / max(1.0 - uNeonHorizon, 1e-3), 0.0, 1.0);
    vec3 background = mix(uNeonSkyLow, uNeonSkyHigh, floor(g * 6.0) / 5.0);

    // solid geometry: one ramp, so every material reads as the same material
    vec3 body = mix(uNeonBody * 0.25, uNeonBody, pow(lum, 0.8));

    // ground grid: spacing compresses toward the horizon, which is what makes
    // a flat screen-space grid read as a receding plane
    float below = 1.0 - sky;
    float depth = max(uNeonHorizon - vUv.y, 1e-3);
    float rows = fract(0.12 / depth - uTimeless);
    float cols = fract(((vUv.x - 0.5) / depth) * 1.6);
    float grid = max(step(0.92, rows), step(0.94, cols));
    background = mix(background, uNeonGrid, below * grid * uNeonGridAmount);

    finalColor = mix(background, body, step(0.001, lum) * (1.0 - sky * step(lum, 0.02)));
    // edges glow rather than darken
    finalColor += uNeonEdge * edge * uNeonGlow;
    finalColor = clamp(finalColor, 0.0, 1.0);

  } else if (uStyleMode == 3) {
    // -------------------------------------------------------------------
    //  PENCIL SKETCH — hatching that follows the surface
    // -------------------------------------------------------------------
    // The hatch angle is derived from the VIEW-SPACE NORMAL, so each surface
    // is shaded along its own orientation: the sea, a roof plane, a torii post
    // and a tree crown all end up with a different stroke direction, the way a
    // hand would draw them. That is what stops this being an edge filter with
    // a paper texture behind it.
    // -------------------------------------------------------------------
    //  A drawing, not a rendering
    // -------------------------------------------------------------------
    // The previous version hatched everywhere: line width scaled with darkness
    // from a very low threshold, so mid-tones — which is most of the frame, and
    // all of the sea — picked up strokes and the whole sheet filled in. It read
    // as an overworked exercise rather than a concept sketch.
    //
    // Three changes fix that, and they are all about restraint:
    //
    //   1. TONE IS A WASH, NOT STROKES. Broad areas get two flat grey levels
    //      quantized off luminance. Volume reads without a single line.
    //   2. HATCHING ONLY IN THE DARKS. Strokes start well down the tonal range
    //      instead of at the first hint of shade, so paper stays paper.
    //   3. THE SKY AND THE SEA ARE EXEMPT. Sky is left blank. The sea gets a
    //      few horizontal band lines where its tone steps, which is how a
    //      sketch indicates water — not a field of diagonals.
    //
    // The contour carries the drawing; everything else supports it.
    float tone = pow(clamp(luma(base), 0.0, 1.0), 0.55);
    float darkness = clamp(1.0 - tone, 0.0, 1.0);
    float ang = atan(nC.y, nC.x + 0.0001);
    float sp = max(uHatchDensity, 2.0);

    // background: anything at the far plane is sky and is left alone
    float isSky = step(uCameraFar * 0.985, dC);
    // near-horizontal surfaces are water and ground; they get band lines only
    // (`flat` itself is a reserved GLSL interpolation qualifier)
    float flatness = smoothstep(0.72, 0.94, abs(nC.z));

    // ---- 1. tonal wash ------------------------------------------------
    float wash = floor(clamp(darkness * 1.15, 0.0, 0.999) * 3.0) / 3.0;
    wash *= (1.0 - isSky) * uWashStrength;

    // ---- 2. hatching, darks only --------------------------------------
    float width = smoothstep(uHatchStart, 1.0, darkness) * uHatchWidth;
    width *= (1.0 - isSky) * (1.0 - flatness * 0.8);
    float ink = width > 0.001 ? hatch(px, ang + 0.55, sp, width) : 0.0;

    // a single crossing reserved for the very deepest areas
    float cross = smoothstep(0.88, 1.0, darkness) * uHatchWidth * 0.7;
    if (cross > 0.001) ink = max(ink, hatch(px, ang - 0.85, sp * 0.95, cross));

    // ---- 3. water: horizontal band lines where the tone steps ---------
    float bandLine = 0.0;
    if (flatness > 0.3 && isSky < 0.5) {

      float edgeOfBand = abs(fract(darkness * 7.0) - 0.5);
      bandLine = (1.0 - step(0.42, edgeOfBand)) * flatness * 0.55;
      bandLine *= step(fract(px.y * 0.5), 0.5);      // broken, not solid
    }
    ink = max(ink, bandLine);

    // ---- 4. contour: the line that actually carries the drawing --------
    ink = max(ink, edge * uContourWeight);

    // paper: a warm ground with a little tooth
    float grain = hash21(floor(px)) * 0.10;
    vec3 paper = uPaperColor * (1.0 - grain * uPaperStrength);

    // wash first, so strokes sit on top of tone rather than replacing it
    vec3 sheet = mix(paper, mix(paper, uGraphite, 0.45), wash);
    finalColor = mix(sheet, uGraphite, clamp(ink * uLineDarkness, 0.0, 1.0));
  }
  // uStyleMode 0 (ukiyo-e pixel) and 1 (cel) both use the composite above:
  // cel differs by running at a higher internal resolution with different
  // tone/outline parameters rather than by a different formula.

  // ---- palette guidance -------------------------------------------------
  if (uPaletteEnabled > 0.5 && uDebugMode == 0) {
    vec3 nearest = finalColor;
    float bestDist = 1e9;
    for (int i = 0; i < PALETTE_SIZE; i++) {
      vec3 entry = uPalette[i];
      // luma-weighted distance: hue is snapped harder than brightness, which
      // stops the ramp from crushing lit/shadow separation on one material
      vec3 d = (finalColor - entry) * vec3(1.0, 1.15, 0.9);
      float dist = dot(d, d);
      if (dist < bestDist) { bestDist = dist; nearest = entry; }
    }
    finalColor = mix(finalColor, nearest, clamp(uPaletteStrength, 0.0, 1.0));
  }

  // ======================================================================
  // E. DEBUG VIEWS
  // ======================================================================
  if (uDebugMode == 1) {
    finalColor = base;
  } else if (uDebugMode == 2) {
    float v = clamp((dC - uDepthViewNear) / max(uDepthViewFar - uDepthViewNear, 1e-4), 0.0, 1.0);
    finalColor = vec3(1.0 - v);   // near = white, far = black
  } else if (uDebugMode == 3) {
    finalColor = nC * 0.5 + 0.5;
  } else if (uDebugMode == 4) {
    finalColor = vec3(edge);
  } else if (uDebugMode == 5) {
    finalColor = vec3(depthEdge);
  } else if (uDebugMode == 6) {
    finalColor = vec3(normalEdgeMask);
  }

  gl_FragColor = vec4(finalColor, 1.0);
}
