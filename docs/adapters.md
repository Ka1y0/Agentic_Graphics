# Adapters

Adapters implement one of five contracts: `LLMAdapter`, `GeneratorAdapter`, `ProcessingAdapter`, `RendererAdapter`, or `EngineAdapter`. Every concrete adapter exposes `dry_run(spec, config)` and `execute(context)`.

## Implemented

- LLM: `manual`, `command`, `openai_compatible` (optional environment-configured provider).
- Generation: `manual`, `modly`, `blender_procedural`.
- Processing: `blender`, `blender_validation`.
- Engine: `unreal`.

The `command` adapter executes an argv array or tokenized string as `<command> input.json output.json`, with `shell=False`, timeout, captured logs, and schema validation of the output.

The optional OpenAI-compatible adapter reads its base URL, API key, and model only from configured environment variables. It records the model and base URL while replacing the key with `REDACTED`.

## Extension checklist

A new adapter should provide:

1. a real public or locally documented tool boundary;
2. safe discovery and dry-run behavior;
3. bounded command or request construction;
4. explicit inputs and typed output artifacts;
5. structured success and failure reports;
6. provenance facts without guesses;
7. unit tests that work without the heavy tool;
8. optional local integration instructions.

Planned image generators, compositors, Unity, Godot, custom real-time engines, and renderers are not registered until implemented.
