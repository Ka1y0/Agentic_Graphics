# Security design

Agentic_Graphics executes powerful local tools, so its default posture is explicit and inspectable.

## Generated Blender Python

- each run has a dedicated ignored directory;
- dry-run never launches Blender;
- generated-script execution requires `--approve-generated-code` by default;
- the exact script is preserved;
- the built-in generator emits only a small primitive vocabulary;
- a conservative AST check rejects unapproved imports, dynamic code, common shell/network modules, and destructive path calls;
- Blender receives bounded arguments without a shell;
- execution has a timeout and captured stdout/stderr;
- failures create a structured error report and manifest.

These are application controls, **not an operating-system sandbox**. Python running inside Blender keeps the current user's filesystem and process privileges. Use OS isolation for untrusted free-form code.

## External agents and providers

The command adapter uses `shell=False`. Provider credentials are environment-only and never written to config, specs, manifests, or logs. The OpenAI-compatible adapter records `REDACTED` instead of the key.

## Modly

Automation defaults to `127.0.0.1`; non-loopback endpoints are rejected unless explicitly enabled. The installed local service may not have authentication. Never expose it to a LAN or public interface. Model weights and Modly binaries are not distributed.

## Unreal

The adapter validates `/Game/...` before launch, and the Unreal-side script repeats the boundary check. It imports one declared source, refuses traversal, and verifies returned object paths remain below the destination. Use disposable fixtures for integration tests and source control for real projects.
