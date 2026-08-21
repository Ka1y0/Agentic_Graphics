# Unreal Engine

Unreal is the first real-time engine adapter. Discovery follows explicit config, `AGFX_UNREAL_EDITOR_CMD`/`UNREAL_EDITOR_CMD`, known Epic installation locations, then `PATH`.

The adapter accepts only an existing `.uproject`, a validated mesh, and a traversal-free destination below `/Game/`. It creates a bounded import job and invokes `UnrealEditor-Cmd` with Epic's `-ExecutePythonScript` path, unattended flags, no source-control integration, and `NullRHI` for headless import.

Inside Unreal, one `AssetImportTask` imports the file, saves the returned asset paths, verifies they remain below the declared destination, and writes a JSON report. Material import uses engine defaults where reliable; Agentic_Graphics does not translate proprietary shader graphs.

Heavy tests should use a temporary blank project with the Python Editor Script Plugin enabled. CI does not pretend to run Unreal when the engine is absent.
