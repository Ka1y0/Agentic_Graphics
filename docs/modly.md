# Modly

Modly is an optional, replaceable 3D generator. Agentic Graphics does not ship it, install it, copy its model weights, or depend on its branding.

The locally inspected Modly 0.4.1 application bundles a documented loopback FastAPI backend and an MCP server for external agents. The 0.1 adapter uses the HTTP boundary only when `/health` is reachable. With `generation.reference_image`, it submits `/generate/from-image`, polls `/generate/status/{job_id}`, and downloads the returned workspace file. This interface is treated as optional and local, not as a network service guarantee.

When automation is unavailable, the handoff path writes a `generation-request.json` containing intent, representation, accepted formats, export directory, and state. Supplying the exported GLB/OBJ/STL/PLY as `generation.source` continues the same workflow.

No generation runs during dry-run. A missing Modly installation never makes `agfx doctor` fail.
