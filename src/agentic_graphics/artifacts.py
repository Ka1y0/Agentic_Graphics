"""Run directories, artifacts, events, and content-addressed manifests."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional


RUN_SUBDIRECTORIES = ("inputs", "generated", "processed", "outputs", "reports", "logs")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def make_run_id(project_name: str, now: Optional[datetime] = None) -> str:
    timestamp = (now or datetime.now(timezone.utc)).strftime("%Y%m%dT%H%M%SZ")
    digest = hashlib.sha256(f"{project_name}:{timestamp}".encode()).hexdigest()[:8]
    return f"{timestamp}-{project_name}-{digest}"


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        while True:
            chunk = handle.read(chunk_size)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


@dataclass(frozen=True)
class Artifact:
    path: Path
    role: str
    media_type: str = "application/octet-stream"
    source: str = "UNKNOWN"

    def record(self, run_root: Path) -> Dict[str, Any]:
        resolved = self.path.resolve()
        try:
            relative = resolved.relative_to(run_root.resolve()).as_posix()
        except ValueError:
            relative = str(resolved)
        return {
            "path": relative,
            "role": self.role,
            "media_type": self.media_type,
            "source": self.source,
            "size_bytes": resolved.stat().st_size,
            "sha256": sha256_file(resolved),
        }


@dataclass
class RunContext:
    run_id: str
    root: Path
    spec: Dict[str, Any]
    config: Dict[str, Any]
    artifacts: List[Artifact] = field(default_factory=list)
    state: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def create(
        cls,
        spec: Mapping[str, Any],
        config: Mapping[str, Any],
        request_path: Optional[Path] = None,
        run_id: Optional[str] = None,
    ) -> "RunContext":
        selected_id = run_id or make_run_id(spec["project"]["name"])
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", selected_id):
            raise ValueError("run_id must contain only letters, numbers, dot, underscore, and hyphen")
        root = Path(config["defaults"]["workspace"]) / selected_id
        root.mkdir(parents=True, exist_ok=False)
        for name in RUN_SUBDIRECTORIES:
            (root / name).mkdir()
        request_destination = None
        if request_path:
            suffix = Path(request_path).suffix.lower() or ".yaml"
            request_destination = root / f"request{suffix}"
            shutil.copy2(request_path, request_destination)
        resolved_path = root / "resolved-spec.json"
        resolved_path.write_text(json.dumps(spec, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        context = cls(selected_id, root, dict(spec), dict(config))
        if request_destination:
            context.add_artifact(Artifact(request_destination, "request", "application/yaml" if suffix != ".json" else "application/json", "user"))
        context.add_artifact(Artifact(resolved_path, "resolved_spec", "application/json", "agentic-graphics"))
        context.event("run.created", {"project": spec["project"]["name"]})
        return context

    def add_artifact(self, artifact: Artifact) -> None:
        if not artifact.path.is_file():
            raise FileNotFoundError(f"Artifact does not exist: {artifact.path}")
        self.artifacts.append(artifact)

    def event(self, event_type: str, payload: Optional[Mapping[str, Any]] = None) -> None:
        record = {
            "timestamp": utc_now(),
            "run_id": self.run_id,
            "type": event_type,
            "payload": dict(payload or {}),
        }
        with (self.root / "events.jsonl").open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, sort_keys=True) + "\n")

    def write_manifest(self, status: str) -> Path:
        records = [artifact.record(self.root) for artifact in self.artifacts]
        events = self.root / "events.jsonl"
        if events.is_file():
            records.append(Artifact(events, "events", "application/x-ndjson", "agentic-graphics").record(self.root))
        payload = {
            "schema_version": "1",
            "run_id": self.run_id,
            "status": status,
            "created_at": utc_now(),
            "artifacts": sorted(records, key=lambda item: (item["role"], item["path"])),
        }
        path = self.root / "manifest.json"
        path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        return path


def build_manifest(paths: Iterable[Path], base: Path) -> Dict[str, Any]:
    records = [Artifact(Path(path), "fixture").record(base) for path in paths]
    return {"schema_version": "1", "artifacts": sorted(records, key=lambda item: item["path"])}
