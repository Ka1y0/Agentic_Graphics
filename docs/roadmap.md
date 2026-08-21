# Roadmap

This roadmap separates what exists from experiments that have not been generalized and work that is only planned.

## Current

### Implemented

- `GraphicsSpec` v1 and JSON Schema validation;
- workflow DAG resolution, cycle detection, and sequential execution;
- manual, command, optional OpenAI-compatible, Blender, Unreal, and Modly handoff/integration adapters;
- Blender procedural fixtures, processing, validation, and GLB export;
- Unreal command-line Python import and structured reports;
- isolated run artifacts, SHA-256 manifests, events, validation results, and representation-neutral provenance;
- Pixel Harbor as a standalone Three.js reference world with six implemented render styles, four seasons, day/night simulation, procedural audio, NPC behavior, and reversible 2D/3D presentation.

### Experimental

- the NPR and low-resolution renderer proven inside Pixel Harbor;
- geometry-aware colored outlines built from color, depth, and view-space normals;
- reversible hybrid orthographic/perspective transitions;
- deterministic cinematic direction and offline capture techniques;
- style/world separation inside a complete realtime reference project.

These experiments are working inside Pixel Harbor, but they are not general-purpose Python Core adapters.

## Near-term

### Planned

- document a stable boundary between Core workflow records and standalone worlds;
- add small deterministic fixtures for reusable rendering concepts when they can be tested without importing a complete world;
- strengthen validation vocabulary for visual and realtime artifacts;
- improve contribution guidance for adapters, labs, and worlds;
- publish additional reproducibility evidence without committing production captures or private archives.

## Research

### Planned research

- reusable Three.js/WebGL NPR adapter boundaries;
- hybrid 2D/3D scene and camera representations;
- WebGPU rendering experiments;
- stylized lighting and simulation validation;
- agentic scene construction with measurable constraints;
- cross-representation provenance for realtime and cinematic output.

Research items may fail, change shape, or remain world-specific. They are not current capabilities.

## Future

### Possible directions

- additional complete reference worlds;
- reusable world-runtime conventions where multiple projects prove the abstraction;
- richer production integrations for DCC and realtime engines;
- policy-driven visual QA and reproducible capture orchestration;
- broader 2D, 2.5D, hybrid, and cinematic workflows.

There is no current claim of a generic world generator, universal 2.5D runtime, automatic Pixel Harbor generator, or general-purpose Three.js NPR adapter.
