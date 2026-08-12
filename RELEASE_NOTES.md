# Agentic Graphics v0.1.0-alpha.1

The first open-source release establishes a provider-neutral substrate for agent-driven graphics workflows.

## Implemented

- GraphicsSpec v1 for 2D, 2.5D, 3D, and hybrid representation intent;
- composable workflow graph resolution with dependency and cycle validation;
- manual, external-command, and optional OpenAI-compatible LLM adapters;
- manual mesh intake, real Modly loopback API automation with file-handoff fallback, and vetted Blender procedural generation;
- Blender background processing, spec-controlled cleanup/decimation, validation, GLB output, and JSON reports;
- Unreal Engine command-line Python ingestion to bounded `/Game/...` destinations;
- isolated run directories, events, SHA-256 manifests, provenance, doctor, and dry-run;
- generated-code review controls and honest OS-sandbox limitations;
- architecture documents for future 2D, 2.5D, hybrid, NPR, and 3D-to-2D-looking workflows.

## Validation

- 86 unit and contract tests pass on the release workstation;
- a procedural crate completed real Blender 5.2 LTS generation, processing, export, and validation;
- the crate completed real Unreal Engine 5.8.1 import into a disposable fixture;
- Modly 0.4.1 completed automated image-to-3D generation through its installed loopback API; its output then passed explicit Blender cleanup/budget validation and Unreal ingestion;
- the built wheel was installed into a fresh temporary virtual environment and completed `agfx init` plus schema-based planning.

## Alpha limitations

Hosted CI does not install or claim Blender, Unreal, or Modly integration. 2D, 2.5D, and NPR adapters are documented extension paths, not implemented features. Generated Python controls are not an operating-system sandbox. The Modly-generated technical fixture retained non-manifold/boundary-edge warnings and is not presented as production-quality art.
