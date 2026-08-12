# Provenance

Provenance is a first-class, representation-neutral artifact. Each completed, failed, or handoff-paused run records:

```json
{
  "run_id": "...",
  "representation": "3d",
  "source": "...",
  "generator": "blender_procedural",
  "model": "UNKNOWN",
  "license": "CC0-1.0",
  "input_sha256": "UNKNOWN",
  "output_sha256": "...",
  "blender_version": "5.x",
  "engine": "local",
  "engine_version": "UNKNOWN",
  "workflow_version": "0.1.0-alpha.1",
  "timestamp": "..."
}
```

Hashes are computed from actual files. Missing facts become `UNKNOWN`; the library never derives a license, model, or engine version from intent text. The same record shape is designed to cover images, layered scenes, sprites, meshes, renders, and real-time engine assets.

The manifest separately records every durable artifact's relative path, media type, role, source, byte size, and SHA-256.
