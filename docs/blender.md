# Blender

Blender is the first core processing environment. Discovery follows explicit config, `AGFX_BLENDER`/`BLENDER_PATH`, known platform locations, and then `PATH`.

The procedural adapter supports `cube`, `crate`, `chair`, and `stylized_prop` using only primitives and simple materials. It exports GLB and records object, vertex, triangle, material, bounds, and version data.

The processing script imports GLB/glTF, OBJ, STL, or PLY. It applies transforms, merge-by-distance, degenerate-geometry cleanup, or decimation only when those fields are set in `processing.blender`. It always writes a new `processed.glb`; source files are not changed.

Validation checks mesh presence, triangle presence, optional triangle budget, zero-area faces, and reports non-manifold/boundary edges as a warning. Material and image-texture references are inventoried.

Local integration command:

```bash
agfx run examples/crate.yaml --approve-generated-code --json
```
