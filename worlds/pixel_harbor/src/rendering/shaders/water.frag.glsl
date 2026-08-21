// ===========================================================================
//  Stylized sea surface
// ===========================================================================
//
// Shares the toon shader's whole lighting model -- same quantized diffuse, same
// hemisphere ambient, same cast-shadow-into-tone-band behaviour -- and adds the
// discrete colour banding the sea needs to read as painted water rather than a
// shaded plane.
//
// Three separate discrete signals decide a water pixel's albedo:
//   1. wave height      -> deep / mid / shallow / crest bands
//   2. surface facing   -> a crest catching the light gets pushed one band up
//   3. shore proximity  -> an animated foam line where water meets land
//
// Every one of them is quantized before it touches colour. There is no smooth
// gradient anywhere in here.

uniform vec3  uWaterDeep;
uniform vec3  uWaterMid;
uniform vec3  uWaterShallow;
uniform vec3  uWaterCrest;
uniform vec3  uFoamColor;

uniform float uWaterToneSteps;
uniform float uBandLow;
uniform float uBandHigh;

uniform float uFoamAmount;      // width of the shore foam band, world units
uniform float uFoamThreshold;   // how much shore proximity is needed
uniform float uFoamSpeed;
uniform float uCrestFoam;       // how readily wave crests grow foam claws
uniform float uWaveRhythm;      // strength of the woodblock band pattern
uniform float uWaveBands;       // how many bands across the swell
uniform float uTime;

uniform sampler2D uShoreMap;    // R = distance to land, baked once on the CPU
uniform vec2  uShoreOrigin;
uniform vec2  uShoreScale;

uniform vec3  uLightDir;
uniform vec3  uLightColor;
uniform vec3  uSkyColor;
uniform vec3  uGroundColor;
uniform vec3  uShadowTint;
uniform float uAmbient;
uniform float uToneSteps;
uniform float uShadowLevel;
uniform float uLightLevel;

uniform sampler2D uShadowMap;
uniform mat4  uShadowMatrix;
uniform float uShadowEnabled;
uniform float uShadowStrength;
uniform float uShadowDeepen;
uniform float uShadowTintStrength;
uniform float uShadowBias;
uniform float uShadowNormalBias;
uniform float uShadowDebug;
uniform float uMoonlight;
uniform vec3  uMoonColor;

varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vLocalPos;

float sampleShadow(vec3 worldPos, vec3 N) {
  if (uShadowEnabled < 0.5) return 1.0;
  vec3 biased = worldPos + N * uShadowNormalBias;
  vec4 lightPos = uShadowMatrix * vec4(biased, 1.0);
  vec3 uvz = lightPos.xyz / lightPos.w;
  if (uvz.x < 0.0 || uvz.x > 1.0 || uvz.y < 0.0 || uvz.y > 1.0 || uvz.z > 1.0) return 1.0;
  return step(uvz.z - uShadowBias, texture2D(uShadowMap, uvz.xy).x);
}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uLightDir);

  float steps = max(uToneSteps, 2.0);
  float denom = steps - 1.0;

  // ---- 1. height bands ---------------------------------------------------
  float bands = max(uWaterToneSteps, 2.0);
  float h = clamp((vLocalPos.y - uBandLow) / max(uBandHigh - uBandLow, 1e-4), 0.0, 0.999);
  float hq = floor(h * bands) / (bands - 1.0);

  vec3 albedo = uWaterDeep;
  albedo = mix(albedo, uWaterMid,      step(0.20, hq));
  albedo = mix(albedo, uWaterShallow,  step(0.55, hq));
  albedo = mix(albedo, uWaterCrest,    step(0.85, hq));

  // ---- 2. crests facing the light get pushed one band brighter -----------
  float facing = clamp(dot(N, L), 0.0, 1.0);
  float glint = step(0.86, facing) * step(0.5, hq);
  albedo = mix(albedo, uWaterCrest, glint);

  // ---- 2a. woodblock band rhythm -----------------------------------------
  // A print does not shade a wave; it repeats a carved band. Sampling a rotated
  // coordinate and quantizing it hard gives that repeat, and keying it to the
  // wave height means the bands ride the swell instead of lying over it like
  // wallpaper.
  if (uWaveRhythm > 0.001) {
    float axis = vLocalPos.x * 0.62 - vLocalPos.z * 0.78;
    float ridge = axis * 0.09 + h * 1.35 + uTime * 0.14;
    float band = floor(fract(ridge) * uWaveBands) / max(uWaveBands - 1.0, 1.0);
    // only the upper half of the swell carries banding, so troughs stay calm
    float gate = smoothstep(0.34, 0.80, h);
    albedo = mix(albedo, uWaterCrest, band * gate * uWaveRhythm * 0.55);
    albedo = mix(albedo, uWaterDeep, (1.0 - band) * (1.0 - gate) * uWaveRhythm * 0.30);
  }

  // ---- 2b. clawed foam caps on the wave tops -----------------------------
  // In a woodblock print a breaking wave is not a gradient of white; it is a
  // flat cap of paper-white with a ragged, finger-like edge reaching off the
  // crest. Two things are needed for that: a HEIGHT gate so foam only exists
  // on the tops, and a high-frequency angular ripple on the threshold so the
  // boundary tears into fingers instead of following a smooth contour.
  // Only the very top of a wave breaks: gating on the top ~quarter of the
  // height range keeps foam to occasional caps instead of speckling the whole
  // sea. Both gates are hard steps, so the result stays on whole pixels.
  float crestGate = smoothstep(0.74, 0.99, h);
  float claw = sin(vLocalPos.x * 1.35 + uTime * 1.1)
             * sin(vLocalPos.z * 1.15 - uTime * 0.85)
             + 0.55 * sin((vLocalPos.x + vLocalPos.z) * 2.3 + uTime * 1.6);
  float clawN = clamp(claw * 0.5 + 0.5, 0.0, 1.0);
  // the ripple is applied to the THRESHOLD, not to the colour, so the foam
  // edge tears into fingers while staying perfectly hard
  float crestFoam = step(1.0 - uCrestFoam * 0.6, clawN) * step(0.72, crestGate);
  albedo = mix(albedo, uFoamColor, crestFoam);

  // ---- 3. shore foam -----------------------------------------------------
  // uShoreMap holds distance-to-land baked once at startup. A moving threshold
  // over that field gives a foam line that advances and retreats like a tide
  // line without any particle system.
  vec2 shoreUv = (vLocalPos.xz - uShoreOrigin) / uShoreScale;
  float foamMask = 0.0;
  if (shoreUv.x > 0.0 && shoreUv.x < 1.0 && shoreUv.y > 0.0 && shoreUv.y < 1.0) {
    float shoreDist = texture2D(uShoreMap, shoreUv).r;      // 0 inside land

    // wobble the tide line along the shore so it is not a clean offset curve
    float wobble = sin(vLocalPos.x * 0.42 + uTime * uFoamSpeed) * 0.5
                 + sin(vLocalPos.z * 0.31 - uTime * uFoamSpeed * 0.7) * 0.5;
    float tide = uFoamThreshold + wobble * 0.38;

    // A BAND, not a disc: foam only exists seaward of the coastline, between
    // the shore edge and the reach of the tide. Thresholding "closer than X"
    // instead would flood every water texel that sits under the land.
    float outer = tide * uFoamAmount;
    float inner = outer * 0.05;
    float band = step(inner, shoreDist) * step(shoreDist, outer);

    // a second thinner line just seaward of the first reads as the wave edge
    float crestLine = step(outer, shoreDist) * step(shoreDist, outer * 1.35)
                    * step(0.15, hq);

    foamMask = max(band, crestLine * 0.8);
  }
  foamMask = step(0.3, foamMask);
  albedo = mix(albedo, uFoamColor, foamMask);

  // ---- lighting: identical model to every other surface ------------------
  float shadow = sampleShadow(vWorldPos, N);
  shadow = mix(1.0, shadow, step(0.0, dot(N, L)));
  float occluded = 1.0 - shadow;

  float ndl = clamp(dot(N, L), 0.0, 0.999);
  ndl *= mix(1.0 - uShadowStrength, 1.0, shadow);
  float qd = clamp(floor(ndl * steps) / denom, 0.0, 1.0);

  float hemi = clamp(0.5 + 0.5 * N.y, 0.0, 0.999);
  float qh   = clamp(floor(hemi * steps) / denom, 0.0, 1.0);

  float shade = mix(uShadowLevel, uLightLevel, qd);
  shade *= (1.0 - occluded * uShadowDeepen);

  vec3 ambCol = mix(uGroundColor, uSkyColor, qh);
  vec3 tint   = mix(uShadowTint, vec3(1.0), qd);
  tint = mix(tint, tint * uShadowTint, occluded * uShadowTintStrength);

  // foam stays bright and mostly unshaded -- it is spray, not a lit surface
  float allFoam = max(foamMask, crestFoam);
  vec3 lit = albedo * tint * (shade * uLightColor * (1.0 - uAmbient) + ambCol * uAmbient);
  vec3 color = mix(lit, albedo * mix(0.92, 1.0, qd), allFoam);

  color += uMoonColor * uMoonlight * albedo * (0.3 + 0.7 * qh);

  if (uShadowDebug > 0.5) color = vec3(shadow);

  gl_FragColor = vec4(color, 1.0);
}
