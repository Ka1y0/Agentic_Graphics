"""Representation-neutral provenance records."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Mapping, Optional

from .artifacts import sha256_file, utc_now


UNKNOWN = "UNKNOWN"


def known(value: Any) -> Any:
    return value if value not in (None, "") else UNKNOWN


def build_provenance(
    run_id: str,
    spec: Mapping[str, Any],
    input_path: Optional[Path] = None,
    output_path: Optional[Path] = None,
    blender_version: Optional[str] = None,
    engine_version: Optional[str] = None,
    workflow_version: str = "0.1.0-alpha.1",
) -> Dict[str, Any]:
    generation = spec.get("generation", {})
    output = spec.get("output", {})
    return {
        "schema_version": "1",
        "run_id": run_id,
        "representation": known(spec.get("representation", {}).get("type")),
        "source": known(str(input_path) if input_path else generation.get("source")),
        "generator": known(generation.get("upstream_generator") or generation.get("adapter")),
        "model": known(generation.get("model")),
        "license": known(generation.get("license")),
        "input_sha256": sha256_file(input_path) if input_path and input_path.is_file() else UNKNOWN,
        "output_sha256": sha256_file(output_path) if output_path and output_path.is_file() else UNKNOWN,
        "blender_version": known(blender_version),
        "engine": known(output.get("adapter")),
        "engine_version": known(engine_version),
        "workflow_version": known(workflow_version),
        "timestamp": utc_now(),
    }


def write_provenance(path: Path, record: Mapping[str, Any]) -> Path:
    Path(path).write_text(json.dumps(dict(record), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return Path(path)
