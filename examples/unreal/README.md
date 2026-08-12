# Unreal fixture

Agentic Graphics intentionally does not ship an Unreal project or binary assets.
For local integration tests, create a disposable blank project, enable Epic's
Python Editor Script Plugin, and point `output.unreal_project` at its `.uproject`
file. The adapter imports only to the `/Game/...` destination declared in the
spec and writes its JSON report into the ignored run directory.
