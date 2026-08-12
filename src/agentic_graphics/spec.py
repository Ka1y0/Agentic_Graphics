"""GraphicsSpec loading, validation, and normalization."""

from __future__ import annotations

import json
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, Iterable, Mapping, Optional

import yaml
from jsonschema import Draft202012Validator


class SpecError(ValueError):
    """Raised when a GraphicsSpec is missing, malformed, or invalid."""


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def schema_path() -> Path:
    repository_path = project_root() / "schemas" / "graphics-spec.schema.json"
    if repository_path.is_file():
        return repository_path
    installed_path = Path(sys.prefix) / "share" / "agentic-graphics" / "schemas" / "graphics-spec.schema.json"
    if installed_path.is_file():
        return installed_path
    raise SpecError("Installed GraphicsSpec schema could not be located")


def load_schema(path: Optional[Path] = None) -> Dict[str, Any]:
    selected = Path(path) if path else schema_path()
    with selected.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_spec(path: Path, schema: Optional[Mapping[str, Any]] = None) -> Dict[str, Any]:
    selected = Path(path).expanduser().resolve()
    if not selected.is_file():
        raise SpecError(f"GraphicsSpec not found: {selected}")
    try:
        text = selected.read_text(encoding="utf-8")
        if selected.suffix.lower() == ".json":
            value = json.loads(text)
        else:
            value = yaml.safe_load(text)
    except (OSError, json.JSONDecodeError, yaml.YAMLError) as exc:
        raise SpecError(f"Could not parse GraphicsSpec {selected}: {exc}") from exc
    if not isinstance(value, dict):
        raise SpecError("GraphicsSpec root must be an object")
    validate_spec(value, schema=schema)
    return resolve_spec(value, selected.parent)


def validate_spec(spec: Mapping[str, Any], schema: Optional[Mapping[str, Any]] = None) -> None:
    validator = Draft202012Validator(schema or load_schema())
    errors = sorted(validator.iter_errors(spec), key=lambda error: list(error.absolute_path))
    if errors:
        messages = []
        for error in errors:
            location = ".".join(str(part) for part in error.absolute_path) or "<root>"
            messages.append(f"{location}: {error.message}")
        raise SpecError("GraphicsSpec validation failed:\n- " + "\n- ".join(messages))
    _validate_semantics(spec)


def _validate_semantics(spec: Mapping[str, Any]) -> None:
    generation = spec.get("generation", {})
    adapter = generation.get("adapter")
    representation = spec.get("representation", {}).get("type")
    if adapter in {"modly", "blender_procedural"} and representation not in {"3d", "hybrid"}:
        raise SpecError(f"generation.adapter={adapter} currently requires 3d or hybrid representation")

    output = spec.get("output", {})
    if output.get("adapter") == "unreal":
        destination = output.get("destination", "")
        if not destination.startswith("/Game/") or ".." in destination:
            raise SpecError("Unreal destination must be a traversal-free /Game/... path")

    ids = set()
    for index, entry in enumerate(spec.get("workflow", [])):
        stage_id = entry if isinstance(entry, str) else entry.get("id", entry.get("stage"))
        if stage_id in ids:
            raise SpecError(f"Duplicate workflow stage id: {stage_id} (index {index})")
        ids.add(stage_id)
    for entry in spec.get("workflow", []):
        if isinstance(entry, dict):
            missing = set(entry.get("depends_on", [])) - ids
            if missing:
                raise SpecError(f"Workflow stage {entry.get('id', entry['stage'])} depends on unknown ids: {sorted(missing)}")
    stages = {entry if isinstance(entry, str) else entry.get("stage") for entry in spec.get("workflow", [])}
    if "unreal_import" in stages and spec.get("output", {}).get("adapter") != "unreal":
        raise SpecError("workflow stage unreal_import requires output.adapter=unreal")


def resolve_spec(spec: Mapping[str, Any], base_dir: Path) -> Dict[str, Any]:
    """Return a copy with local input/project paths made absolute."""

    result = deepcopy(dict(spec))
    for section, key in (
        ("generation", "source"),
        ("generation", "reference_image"),
        ("output", "unreal_project"),
    ):
        value = result.get(section, {}).get(key)
        if value:
            candidate = Path(value).expanduser()
            if not candidate.is_absolute():
                candidate = base_dir / candidate
            result[section][key] = str(candidate.resolve())
    return result


def expected_inputs(spec: Mapping[str, Any]) -> Iterable[Path]:
    generation = spec.get("generation", {})
    for key in ("source", "reference_image"):
        if generation.get(key):
            yield Path(generation[key])
    if spec.get("output", {}).get("adapter") == "unreal" and spec.get("output", {}).get("unreal_project"):
        yield Path(spec["output"]["unreal_project"])
