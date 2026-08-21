// ===========================================================================
//  Woodblock sky
// ===========================================================================
//
// A print does not render atmosphere; it lays down a few flat inked bands and
// stamps cloud shapes on top. So this is a quantized vertical ramp plus hard
// edged cloud bands — no smooth gradient anywhere, matching the way every other
// surface in the scene is shaded.

uniform vec3  uSkyHigh;
uniform vec3  uSkyMid;
uniform vec3  uSkyLow;
uniform vec3  uCloud;
uniform vec3  uCloudShade;
uniform float uBandSteps;
uniform float uCloudAmount;
uniform float uTime;
uniform float uParallax;   // pans the clouds when the camera orbits

// ---- the sun ------------------------------------------------------------
// Drawn here, in screen space, because an orthographic camera gives a celestial
// object no way to be "far away": a disc placed along the sunrise direction
// sits at screen x = distance and walks straight out of frame. Its position
// comes from the sun's bearing and elevation instead.
// Centre and radius are given in PIXELS, not NDC.
//
// The disc used to be measured in NDC with a separate aspect-correction factor
// taken from the active camera. During a view transition the active camera is
// the blend camera, whose `.aspect` property was never updated from its
// constructor default of 1 — so the correction silently used 1.0 against a true
// 1.6 and the sun went elliptical for the length of the transition.
//
// Working directly in pixels removes the failure mode rather than patching it:
// a circle defined on gl_FragCoord cannot be distorted by a projection, an
// aspect ratio, or anything else the camera is doing.
uniform vec2  uSunCenterPx;
uniform float uSunRadiusPx;
uniform float uSunVisible;
uniform vec3  uSunColor;
uniform vec3  uSunHalo;

uniform vec2 uResolution;

void main() {
  // Read straight from the fragment's own screen position: no interpolation,
  // so triangles crossing the camera plane cannot corrupt it.
  vec2 vScreen = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;

  // vScreen.y is -1 at the bottom of the frame, +1 at the top
  float h = clamp(vScreen.y * 0.5 + 0.5, 0.0, 0.999);

  float steps = max(uBandSteps, 2.0);
  float hq = floor(h * steps) / (steps - 1.0);

  vec3 sky = mix(uSkyLow, uSkyMid, clamp(hq * 2.0, 0.0, 1.0));
  sky = mix(sky, uSkyHigh, clamp(hq * 2.0 - 1.0, 0.0, 1.0));

  // ---- stamped cloud bands ----------------------------------------------
  // Long lenticular shapes rather than fluffy noise: layered sines thresholded
  // hard, which is how a carved cloud edge behaves.
  float x = vScreen.x * 2.4 + uParallax;
  float c = 0.0;
  c += sin(x * 1.7 + uTime * 0.05) * 0.5;
  c += sin(x * 3.1 - uTime * 0.07 + 1.7) * 0.3;
  c += sin(x * 5.3 + uTime * 0.04 + 4.1) * 0.2;

  // clouds occupy two altitude bands high in the frame
  float altA = 1.0 - smoothstep(0.015, 0.065, abs(h - 0.93));
  float altB = 1.0 - smoothstep(0.015, 0.07, abs(h - 0.97));
  float shape = c * (altA + altB * 0.75);

  // Three hard steps rather than two: a carved cloud has an outline, a body and
  // a lit edge, and reading it as three flat plates is what makes it a stamp
  // rather than a soft mass.
  float cloudMask  = step(0.40 - uCloudAmount * 0.35, shape);
  float cloudBody  = step(0.55 - uCloudAmount * 0.35, shape);
  float cloudInner = step(0.72 - uCloudAmount * 0.35, shape);

  vec3 color = mix(sky, uCloudShade, cloudMask);
  color = mix(color, mix(uCloudShade, uCloud, 0.55), cloudBody);
  color = mix(color, uCloud, cloudInner);

  // ---- red disc ---------------------------------------------------------
  // Hard edged and flat: no bloom, no gradient, no corona. A stamped shape,
  // the way a print puts the sun down. The single surrounding band is a
  // quantized step, not a falloff.
  float dist = length(gl_FragCoord.xy - uSunCenterPx);
  float disc = 1.0 - step(uSunRadiusPx, dist);
  float halo = (1.0 - step(uSunRadiusPx * 1.14, dist)) - disc;

  color = mix(color, uSunHalo, halo * uSunVisible * 0.5);
  color = mix(color, uSunColor, disc * uSunVisible);

  gl_FragColor = vec4(color, 1.0);
}
