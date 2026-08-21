# Pixel Harbor: Technical Case Study

Pixel Harbor is a standalone Three.js reference world developed through an agentic graphics workflow. It demonstrates NPR, low-resolution rasterization, a hybrid 2D/3D presentation, world simulation, procedural audio, and deterministic capture inside one coherent project. These are implemented in the world; they are not yet general-purpose Agentic_Graphics Python Core capabilities.

## Origin

The project began as a 2.5D pixel-art harbor experiment: an orthographic Japanese coastal world that could reveal the same scene in perspective without becoming a different level. It grew through iterative human-agent creative direction, implementation, quantitative probes, browser measurement, and visual QA. The process was collaborative and directed, not fully autonomous generation.

## Low-resolution pipeline

The central rule is to rasterize first at low resolution:

```text
low-resolution rasterization
→ color + depth
→ view-space normals
→ geometry-aware edge reconstruction
→ hue-preserving colored outlines
→ quantized lighting
→ exact nearest-neighbor upscale
```

This differs from rendering a smooth full-resolution scene and placing a mosaic or pixelation filter on top. At 1440×900, the default Ukiyo-e Pixel profile measures 480×300 internally, with color, depth, and normal buffers all at that size and an exact 3× output scale.

## Color, depth, and normals

The color target preserves the chosen palette and quantized lighting. Depth detects silhouette and separation changes. View-space normals recover creases and orientation changes that depth alone cannot see. A verified default run measured 5.06% depth-edge coverage and 4.38% normal-edge coverage; both detectors contribute.

## Geometry-aware colored outlines

Flat black outlines flattened the palette and made dark areas lose their internal structure. Pixel Harbor derives outline color from the local base color, darkens it, preserves its hue, and applies a luminance floor. The verified 1440×900 regression run found zero near-black outline pixels across 35 outline hues.

## Pixel snapping

The orthographic camera snaps in the same pixel space as the low-resolution renderer. In the quantitative pan test, 11 of 12 sub-pixel steps were byte-identical with snapping enabled; with snapping disabled, none were identical. A static camera produced zero changed pixels.

## Fuji

Fuji is a composition problem as much as a mesh. The orthographic camera can turn a plausible cone into a narrow spike or chimney-like summit, so the mountain is authored against the final projection. The crater is integrated into the body rather than placed on top. Snow logic is permanent and excluded from seasonal recoloring so the landmark keeps its identity.

The public 2D camera is the canonical hero framing: Fuji, the red sun, harbor, shrine, houses, boats, and NPC remain dense and readable. Public presentation does not pull the camera back simply to increase map coverage.

## Sun

The sun is a symbolic red disc driven by the same world clock as lighting. It travels east to west, touches the real waterline at sunrise and sunset, and can pass behind Fuji because it is drawn in the sky pass rather than overlaid as UI.

Its circle is computed in pixel coordinates with one radius for both axes. Transition acceptance measured a 35×35 pixel bounding box with zero width/height difference, including interrupted blends.

## Multi-style system

`WORLD != STYLE` is an architectural boundary. Geometry, water, Fuji, boats, NPC behavior, time, and seasons belong to the world. Palettes, shading, outlines, post-process strategy, and HUD skin belong to a style profile.

Six styles are implemented: Ukiyo-e Pixel, Cel-Shaded, Blueprint, Minimal Pencil, ASCII / CRT, and Neon / Vaporwave. Style switches hold the camera, boat, character, focus, and clock constant. Unimplemented Low-Poly, Voxel, and Photoreal/PBR entries remain explicitly disabled because they require different content or material representations rather than a cosmetic filter.

## Seasons

Spring, Summer, Autumn, and Winter remap palette entries from remembered source colors, so repeated changes do not compound. Seasonal particles use one recycled `THREE.Points` cloud and are absent from mesh-only normal and shadow passes. Winter preserves coastal evergreens and adds snow without changing the world's silhouette.

## Night lighting

Night is not a global dimmer. Character tint, quantized lamp influence, house-window schedules, and a cool up-facing lift work separately. The measured night character brightness is 61% of daytime, including nearby lantern lift. Windows remain active in the evening and turn off during deep night while exterior lamps stay on.

## NPC fishing

The NPC schedule is data-driven. Between 09:00 and 15:00, the villager walks to the pier, faces open water, and fishes. Rod, line, float, and ripple are a world group that appears only for that activity. The float and boats sample the same water-wave function; the quantitative draft-spread check measured `0`.

## Reversible 2D / 3D transition

A single `viewBlend` value runs from canonical orthographic 2D to canonical perspective 3D and can reverse mid-flight. Matching only the focus-plane pose left distant geometry discontinuous, so Pixel Harbor interpolates a dedicated projection matrix and blends the two depth linearizations.

Measured transition continuity at Fuji was 0.0000 NDC at the forward handover and 0.0023 NDC at the reverse handover. Ordinary eased motion peaked around 0.02–0.025 NDC per frame; the handover itself no longer contributes a visible snap.

## Deterministic cinematic capture

`DemoDirector` owns no simulation. It invokes the same public world, style, time, camera, and audio entry points as the HUD. Its only clock is `tick(dt)`, so a fixed 1/60 step yields a deterministic shot sequence suitable for offline frame production.

The open-source publication includes the clean director and audio implementation, but deliberately excludes the 334 MiB showcase video, raw capture scratch, private cold-reproduction archive, tarball, and Git bundle. Public presentation uses optimized screenshots and the live GitHub Pages demo.

## Reproducibility boundary

The canonical local archive contains deeper environment records and production recovery material. Only broadly useful knowledge is distilled here. The public source remains independently installable with `npm ci`, buildable with `npm run build`, and inspectable through `?debug=1` and `await PIXEL_HARBOR.selfTest()`.
