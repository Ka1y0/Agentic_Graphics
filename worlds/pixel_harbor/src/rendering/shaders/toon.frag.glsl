// ===========================================================================
//  Quantized ("stepped") shading model, with cast shadows folded in
// ===========================================================================
//
// The important detail: we do NOT quantize the final RGB. We quantize the
// *lighting terms* (diffuse N.L and the hemisphere ambient factor) and then use
// those discrete values to modulate the base albedo. A surface therefore only
// ever shows a handful of tones -- highlight / light / mid / shadow -- exactly
// like a hand-authored pixel sprite, while keeping its own hue.
//
// Cast shadows follow the same rule. A shadow is NOT a dark layer composited on
// top of the finished colour; it attenuates the diffuse term *before*
// quantization, so a shadowed pixel simply lands one or more steps down the
// same tone ladder the rest of the scene is built from. An extra "deep shadow"
// tier and a hue-preserving tint separate cast shadow from mere back-facing.

uniform vec3  uColor;      // base albedo
uniform vec3  uColorB;     // secondary albedo (height banding, used by water)
uniform float uUseBands;
uniform float uBandLow;
uniform float uBandHigh;

uniform vec3  uLightDir;   // world space, surface -> light
uniform vec3  uLightColor;
uniform vec3  uSkyColor;
uniform vec3  uGroundColor;
uniform vec3  uShadowTint; // cool tint applied in the darkest band
uniform float uAmbient;
uniform float uToneSteps;
uniform float uShadowLevel;
uniform float uLightLevel;

// ---- cast shadows ----
uniform sampler2D uShadowMap;
uniform mat4  uShadowMatrix;
uniform float uShadowEnabled;
uniform float uShadowStrength;     // how far into shadow a lit surface falls
uniform float uShadowDeepen;       // extra darkening for genuinely occluded px
uniform float uShadowTintStrength; // how much hue-preserving tint to add
uniform float uShadowBias;
uniform float uShadowNormalBias;   // world units, pushes samples off the surface
uniform float uShadowTexel;
uniform float uShadowDebug;

// ---- night lighting -------------------------------------------------------
// The renderer has no light objects, so lamps are a small explicit array. Eight
// is plenty for a village and costs one loop of cheap distance maths, and it
// buys the thing that actually makes a night scene read: surfaces near a lamp
// getting warmer and brighter, rather than only the lamp itself being bright.
#define MAX_LAMPS 8
uniform vec3  uLampPos[MAX_LAMPS];
uniform vec3  uLampColor[MAX_LAMPS];
uniform float uLampRange[MAX_LAMPS];
uniform float uLampCount;
uniform float uLampStrength;      // 0 by day, ramps up as the sun sets

// Moonlight: a cool lift proportional to how up-facing a surface is, so snow,
// rooftops and Fuji's cap stay legible at night instead of sinking into the
// same dark as everything else.
uniform float uMoonlight;
uniform vec3  uMoonColor;

// Self-lit surfaces. Kind: 0 none, 1 lamp fitting, 2 window.
uniform float uEmissiveKind;
uniform vec3  uEmissiveColor;
uniform float uLampGate;          // lamps: on through the whole night
uniform float uWindowGate;        // houses: on in the evening, off after hours

// Snow as a REGION OF THE SURFACE, not a shell laid over it. The mask is
// constant across each triangle, so the boundary is a hard faceted edge rather
// than an interpolated blend — which is what the rest of the renderer expects
// and what keeps the snow line from turning to mush at a third resolution.
// Mask values: 0 = bare rock, 1 = snow, 2 = crater interior. Constant per
// triangle, so every boundary is a hard faceted edge.
uniform float uSnowMix;
uniform vec3  uSnowColor;
uniform vec3  uCraterColor;

varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying float vSnow;

// Returns 1.0 = fully lit, 0.0 = fully occluded.
// Deliberately a single hard sample: no PCF, no penumbra. Soft shadow edges
// would dissolve into grey mush at a third resolution; hard edges land on whole
// pixels and read as authored shadow shapes.
float sampleShadow(vec3 worldPos, vec3 N) {
  if (uShadowEnabled < 0.5) return 1.0;

  // Normal-offset bias: nudging the lookup along the surface normal removes
  // acne without the "peter-panning" a large constant depth bias causes.
  vec3 biased = worldPos + N * uShadowNormalBias;
  vec4 lightPos = uShadowMatrix * vec4(biased, 1.0);
  vec3 uvz = lightPos.xyz / lightPos.w;

  // outside the map -> treat as lit
  if (uvz.x < 0.0 || uvz.x > 1.0 || uvz.y < 0.0 || uvz.y > 1.0 || uvz.z > 1.0) return 1.0;

  float mapDepth = texture2D(uShadowMap, uvz.xy).x;
  return step(uvz.z - uShadowBias, mapDepth);
}

void main() {
  vec3 N = normalize(vWorldNormal);
  // Inward-facing surfaces (the crater bowl) are seen from their back side, so
  // the interpolated normal points away from the viewer and the surface lights
  // as though it were facing the other way. Flipping on gl_FrontFacing is the
  // general fix and costs nothing on the closed geometry that dominates the
  // scene.
  if (!gl_FrontFacing) N = -N;
  vec3 L = normalize(uLightDir);

  float steps = max(uToneSteps, 2.0);
  float denom = steps - 1.0;

  // ---- albedo (optionally banded by world height, gives water its layers) ---
  vec3 albedo = uColor;
  if (uUseBands > 0.5) {
    float h  = clamp((vWorldPos.y - uBandLow) / max(uBandHigh - uBandLow, 1e-4), 0.0, 0.999);
    float hq = floor(h * 3.0) / 2.0;               // -> 0.0, 0.5, 1.0
    albedo   = mix(uColor, uColorB, clamp(hq, 0.0, 1.0));
  }

  albedo = mix(albedo, uSnowColor,   clamp(vSnow, 0.0, 1.0) * uSnowMix);
  albedo = mix(albedo, uCraterColor, clamp(vSnow - 1.0, 0.0, 1.0) * uSnowMix);

  // ---- cast shadow ------------------------------------------------------
  float shadow = sampleShadow(vWorldPos, N);
  // A surface already facing away from the light cannot also be "cast into"
  // shadow -- gating on N.L stops shadow acne on back faces entirely.
  float facing = step(0.0, dot(N, L));
  shadow = mix(1.0, shadow, facing);
  float occluded = 1.0 - shadow;

  // ---- quantized diffuse, with the shadow applied BEFORE quantization ----
  float ndl = clamp(dot(N, L), 0.0, 0.999);
  ndl *= mix(1.0 - uShadowStrength, 1.0, shadow);
  float qd = clamp(floor(ndl * steps) / denom, 0.0, 1.0);

  // ---- quantized hemisphere ambient -------------------------------------
  float hemi = clamp(0.5 + 0.5 * N.y, 0.0, 0.999);
  float qh   = clamp(floor(hemi * steps) / denom, 0.0, 1.0);

  float shade  = mix(uShadowLevel, uLightLevel, qd);
  shade *= (1.0 - occluded * uShadowDeepen);      // the "deep shadow" tier

  vec3 ambCol = mix(uGroundColor, uSkyColor, qh);
  vec3 tint   = mix(uShadowTint, vec3(1.0), qd);
  tint = mix(tint, tint * uShadowTint, occluded * uShadowTintStrength);

  vec3 color = albedo * tint *
               (shade * uLightColor * (1.0 - uAmbient) + ambCol * uAmbient);

  // ---- moonlight ---------------------------------------------------------
  color += uMoonColor * uMoonlight * albedo * (0.35 + 0.65 * qh);

  // ---- lamps -------------------------------------------------------------
  if (uLampStrength > 0.001) {
    vec3 lampSum = vec3(0.0);
    for (int i = 0; i < MAX_LAMPS; i++) {
      if (float(i) >= uLampCount) break;
      float d = distance(vWorldPos, uLampPos[i]);
      float atten = clamp(1.0 - d / max(uLampRange[i], 0.001), 0.0, 1.0);
      atten *= atten;
      // quantized like everything else, so lamplight lands in bands rather
      // than as a smooth falloff that would break the tone language
      float q = floor(atten * steps) / denom;
      lampSum += uLampColor[i] * q;
    }
    color += lampSum * uLampStrength * albedo * 1.35;
  }

  // ---- self-lit surfaces --------------------------------------------------
  float gate = uEmissiveKind < 0.5 ? 0.0
             : (uEmissiveKind < 1.5 ? uLampGate : uWindowGate);
  color = mix(color, uEmissiveColor, clamp(gate, 0.0, 1.0));

  if (uShadowDebug > 0.5) color = vec3(shadow);

  gl_FragColor = vec4(color, 1.0);
}
