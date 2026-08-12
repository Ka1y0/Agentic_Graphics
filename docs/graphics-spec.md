# GraphicsSpec

GraphicsSpec v1 describes visual intent independently from a model provider or graphics tool. The JSON Schema is the source of truth at `schemas/graphics-spec.schema.json`.

Required top-level fields are `schema_version`, `project`, `intent`, `representation`, `generation`, and `workflow`. `representation.type` is one of `2d`, `2.5d`, `3d`, or `hybrid`. V0.1 generation adapters currently operate on `3d` or `hybrid` only.

`generation` identifies an implemented generator and may carry source, reference-image, model, license, and structured parameters. `processing.blender` contains only opt-in mutations. `output` names `local` or `unreal`; Unreal destinations must be traversal-free `/Game/...` paths.

Additional media-specific properties are permitted so the core schema can evolve without renaming the project. Future specifications may include layer, camera, depth, animation-frame, render-style, or compositor data. An allowed field is not a claim that its adapter exists.

Unknown provenance values must be omitted or explicitly written as `UNKNOWN`; do not infer licenses or model identities from filenames.
