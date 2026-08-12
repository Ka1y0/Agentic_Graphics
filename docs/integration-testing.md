# Local integration evidence

The 0.1.0-alpha.1 release was validated on macOS with locally installed tools. Generated payloads and disposable engine fixtures remain under ignored `runs/` directories and are not distributed by this repository.

## Blender 5.2.0 LTS

`examples/crate.yaml` ran through background procedural generation, GLB export, re-import, processing, and validation. The processed fixture contained 15 mesh objects, 2,820 triangles, two primitive materials, and zero zero-area faces. Reports, stdout/stderr, events, manifest hashes, and provenance were all created.

## Unreal Engine 5.8.1

A disposable blank project with Epic's Python Editor Script Plugin imported the validated crate through `UnrealEditor-Cmd`. Unreal returned 17 asset paths: 15 Static Mesh assets and two Material assets, all below the declared `/Game/Generated/AgenticGraphicsFixture/Crate` destination.

The same fixture later imported one processed Static Mesh from a real Modly-generated GLB below `/Game/Generated/AgenticGraphicsFixture/ModlyRoundedCube`. The fixture and `.uasset` files are ignored and not included in the repository.

## Modly 0.4.1

The installed application exposed its documented loopback FastAPI interface. Health and model listing passed. A copyright-safe 512×512 reference image rendered locally from a rounded Blender cube was submitted to the downloaded `hunyuan3d-mini/generate` model with its declared Fast profile: 10 inference steps, octree resolution 256, deterministic seed 42, textures disabled, and no remesh.

The API completed and delivered an 11.8 MB GLB. Initial Blender inspection found 657,158 triangles and one zero-area face, so validation correctly failed. A separate continuation run used explicit spec-controlled `remove_degenerate: true` and `decimate_ratio: 0.15`; the result had 98,570 triangles and zero zero-area faces, passed the declared 120,000-triangle budget, and imported into Unreal. The source and output SHA-256 values were preserved in provenance. The generated mesh reported many non-manifold/boundary edges as a warning, so this evidence demonstrates technical ingestion, not production asset quality.

Two earlier parameter investigations timed out or were stopped without output and were not counted as PASS. They led to forwarding Modly's declared model-specific parameters and adding remote-job cancellation on adapter timeout.

## CI boundary

GitHub Actions runs schema, configuration, workflow, adapter, dry-run, report, provenance, hashing, safety, and cross-platform path tests. It does not claim Blender, Unreal, or Modly integration on hosted runners where those tools are absent. Heavy integrations remain explicit local tests.
