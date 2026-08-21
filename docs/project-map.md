# Project Map

Agentic_Graphics is organized by the scale and maturity of the work, not by a promise that every visual workflow already shares one runtime.

## Core

The Python package in `src/agentic_graphics/` contains the implemented substrate:

- `GraphicsSpec` and its JSON Schema;
- workflow graph resolution and orchestration;
- agent and tool adapter boundaries;
- validation and structured reports;
- artifacts, manifests, and provenance;
- implemented Blender, Unreal, command, manual, OpenAI-compatible, and Modly handoff/integration paths.

The Python import remains `agentic_graphics`, the distribution remains `agentic-graphics`, and the CLI remains `agfx`.

## Worlds

`worlds/` contains complete interactive reference projects. A world may own a runtime, renderer, tools, simulation, audio, and publication pipeline.

The first featured world is [Pixel Harbor](../worlds/pixel_harbor/), a standalone Three.js world developed through an agentic graphics workflow. It is evidence that these workflows can grow beyond fixtures into complete interactive visual systems; it is not an automatic output of the Python Core.

## Rendering Research

Research directions include NPR, low-resolution rendering, toon/cel systems, outline reconstruction, stylized lighting, hybrid 2D/3D, shaders, and WebGL/WebGPU experiments. Mature experiments may live inside a world before a reusable abstraction exists.

`labs/` is the explicit home for future research artifacts. A research entry is not a Core capability claim.

## Production

Production covers asset workflows, Blender processing, AI-assisted 3D handoffs, Unreal ingestion, cinematic rendering and capture, QA, and reproducibility. It connects creative work to durable artifacts and records rather than treating a successful preview as the end of the pipeline.

## Examples

`examples/` remains intentionally small: deterministic, testable demonstrations of one capability or integration boundary. Complete worlds do not belong there.

## Documentation

The documentation describes implemented interfaces, evidence, limitations, research directions, and complete case studies. Start with the [vision](vision.md), [roadmap](roadmap.md), [Core architecture](architecture.md), or [Pixel Harbor case study](showcases/pixel-harbor.md).
