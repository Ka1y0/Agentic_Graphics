# Workflows

`workflow` may use concise stage names:

```yaml
workflow: [plan, generate, blender_process, validate, unreal_import]
```

or explicit graph nodes:

```yaml
workflow:
  - {id: plan, stage: plan}
  - {id: shape, stage: generate, depends_on: [plan]}
  - {id: clean, stage: blender_process, depends_on: [shape]}
  - {id: gate, stage: validate, depends_on: [clean]}
  - {id: ingest, stage: unreal_import, depends_on: [gate]}
```

When dependencies are omitted, nodes depend on the preceding node. The resolver rejects duplicate IDs, unknown dependencies, and cycles. Execution is sequential in the resolved order in 0.1; the graph contract leaves room for future branching and scheduling.

## Stage behavior

| Stage | 0.1 adapter selection | Durable evidence |
| --- | --- | --- |
| `plan` | `agent.adapter`, default `manual` | resolved spec / optional provider output |
| `generate` | `generation.adapter` | source or generated mesh, generation report |
| `blender_process` | Blender | processed GLB, before/after report, logs |
| `validate` | Blender | mesh checks and JSON report |
| `unreal_import` | Unreal | import job, imported paths, JSON report, logs |

## Dry-run

Dry-run resolves the same nodes and calls each adapter's non-mutating preflight. It validates tool discovery, configuration, existing declared inputs, destinations, and expected output names. It does not create a run directory, call an AI service, launch Blender, or modify Unreal.
