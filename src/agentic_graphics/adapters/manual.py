"""Manual spec and file-input adapters."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any, Mapping

from ..artifacts import Artifact, RunContext
from .base import AdapterError, AdapterResult, GeneratorAdapter, LLMAdapter


SUPPORTED_MESH_INPUTS = {".glb", ".gltf", ".obj", ".stl", ".ply"}


class ManualLLMAdapter(LLMAdapter):
    """Accept a GraphicsSpec already authored by a human or external agent."""

    name = "manual"

    def dry_run(self, spec: Mapping[str, Any], config: Mapping[str, Any]) -> AdapterResult:
        return AdapterResult("READY", details={"input": "validated GraphicsSpec"})

    def execute(self, context: RunContext, **kwargs: Any) -> AdapterResult:
        return AdapterResult("PASS", details={"spec": str(context.root / "resolved-spec.json")})


class ManualFileAdapter(GeneratorAdapter):
    """Copy an explicitly supplied mesh into the immutable run input area."""

    name = "manual"

    def dry_run(self, spec: Mapping[str, Any], config: Mapping[str, Any]) -> AdapterResult:
        source = spec.get("generation", {}).get("source")
        if not source:
            return AdapterResult("FAIL", details={"error": "generation.source is required"})
        path = Path(source)
        if path.suffix.lower() not in SUPPORTED_MESH_INPUTS:
            return AdapterResult("FAIL", details={"error": f"unsupported input extension: {path.suffix}"})
        return AdapterResult("READY" if path.is_file() else "FAIL", details={"source": str(path), "exists": path.is_file()})

    def execute(self, context: RunContext, **kwargs: Any) -> AdapterResult:
        source = Path(context.spec["generation"]["source"])
        if not source.is_file():
            raise AdapterError(f"Manual input does not exist: {source}")
        if source.suffix.lower() not in SUPPORTED_MESH_INPUTS:
            raise AdapterError(f"Unsupported manual input format: {source.suffix}")
        destination = context.root / "inputs" / f"source{source.suffix.lower()}"
        shutil.copy2(source, destination)
        artifact = Artifact(destination, "source_mesh", _media_type(destination), "manual")
        context.add_artifact(artifact)
        context.state["mesh_input"] = destination
        return AdapterResult("PASS", [artifact], {"source": str(source)})


def _media_type(path: Path) -> str:
    return {
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
        ".obj": "model/obj",
        ".stl": "model/stl",
        ".ply": "application/octet-stream",
    }.get(path.suffix.lower(), "application/octet-stream")
