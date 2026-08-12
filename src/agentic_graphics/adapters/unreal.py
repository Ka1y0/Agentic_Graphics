"""Unreal Engine command-line Python import adapter."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path, PurePosixPath
from typing import Any, Dict, Mapping, Optional

from ..artifacts import Artifact, RunContext
from ..tool_discovery import discover_tool
from .base import AdapterError, AdapterResult, CommandSpec, EngineAdapter, ValidationResult


def unreal_script_path() -> Path:
    repository_path = Path(__file__).resolve().parents[3] / "scripts" / "unreal" / "import_asset.py"
    if repository_path.is_file():
        return repository_path
    installed_path = Path(sys.prefix) / "share" / "agentic-graphics" / "scripts" / "unreal" / "import_asset.py"
    if installed_path.is_file():
        return installed_path
    raise AdapterError("Installed Unreal automation script could not be located")


def validate_game_path(value: str) -> str:
    if not value.startswith("/Game/"):
        raise AdapterError("Unreal destination must start with /Game/")
    path = PurePosixPath(value)
    if ".." in path.parts or any(not part for part in path.parts[2:]):
        raise AdapterError("Invalid Unreal destination path")
    if any(character in value for character in ("\\", ":", "*", "?", '"', "<", ">", "|")):
        raise AdapterError("Unreal destination contains forbidden characters")
    return value.rstrip("/")


def build_unreal_command(
    executable: Path,
    project: Path,
    script: Path,
    job: Path,
    report: Path,
    timeout_seconds: int = 900,
) -> CommandSpec:
    env = {
        **os.environ,
        "AGFX_UNREAL_JOB": str(job),
        "AGFX_UNREAL_REPORT": str(report),
    }
    argv = [
        str(executable),
        str(project),
        "-unattended",
        "-nop4",
        "-nosplash",
        "-NoSound",
        "-NullRHI",
        "-stdout",
        "-FullStdOutLogOutput",
        f"-ExecutePythonScript={script}",
    ]
    return CommandSpec(argv, cwd=job.parent, env=env, timeout_seconds=timeout_seconds)


class UnrealAdapter(EngineAdapter):
    name = "unreal"

    def dry_run(self, spec: Mapping[str, Any], config: Mapping[str, Any]) -> AdapterResult:
        tool = discover_tool("unreal", config)
        output = spec.get("output", {})
        project_value = output.get("unreal_project")
        destination = output.get("destination", "")
        errors = []
        try:
            validate_game_path(destination)
        except AdapterError as exc:
            errors.append(str(exc))
        project_exists = bool(project_value and Path(project_value).is_file() and Path(project_value).suffix.lower() == ".uproject")
        if not project_exists:
            errors.append("output.unreal_project must reference an existing .uproject")
        if not tool.available:
            errors.append("UnrealEditor-Cmd was not found")
        return AdapterResult(
            "READY" if not errors else "FAIL",
            details={
                "tool": str(tool.path) if tool.path else None,
                "tool_source": tool.source,
                "project": project_value,
                "project_exists": project_exists,
                "destination": destination,
                "errors": errors,
                "expected_outputs": ["reports/unreal-import-report.json"],
            },
        )

    def execute(self, context: RunContext, **kwargs: Any) -> AdapterResult:
        tool = discover_tool("unreal", context.config)
        if not tool.available or not tool.path:
            raise AdapterError("UnrealEditor-Cmd executable was not found")
        output = context.spec.get("output", {})
        project = Path(output.get("unreal_project", ""))
        if not project.is_file() or project.suffix.lower() != ".uproject":
            raise AdapterError(f"Unreal project not found: {project}")
        source = Path(kwargs.get("input_path") or context.state.get("validated_mesh") or context.state.get("processed_mesh", ""))
        if not source.is_file():
            raise AdapterError(f"Validated Unreal import source not found: {source}")
        destination = validate_game_path(output.get("destination", ""))
        job_path = context.root / "generated" / "unreal-import-job.json"
        report_path = context.root / "reports" / "unreal-import-report.json"
        stdout_path = context.root / "logs" / "unreal-import.stdout.log"
        stderr_path = context.root / "logs" / "unreal-import.stderr.log"
        job = {
            "schema_version": "1",
            "run_id": context.run_id,
            "source": str(source.resolve()),
            "destination": destination,
            "import_materials": bool(output.get("import_materials", True)),
            "replace_existing": bool(output.get("replace_existing", False)),
        }
        job_path.write_text(json.dumps(job, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        timeout = int(context.config["defaults"]["unreal_timeout_seconds"])
        command = build_unreal_command(tool.path, project.resolve(), unreal_script_path(), job_path, report_path, timeout)
        try:
            completed = subprocess.run(
                list(command.argv),
                cwd=command.cwd,
                env=dict(command.env or {}),
                capture_output=True,
                text=True,
                timeout=command.timeout_seconds,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            stdout_path.write_text(exc.stdout or "", encoding="utf-8")
            stderr_path.write_text((exc.stderr or "") + f"\nTIMEOUT after {timeout}s\n", encoding="utf-8")
            raise AdapterError(f"Unreal import timed out after {timeout}s") from exc
        stdout_path.write_text(completed.stdout, encoding="utf-8")
        stderr_path.write_text(completed.stderr, encoding="utf-8")
        if not report_path.is_file():
            raise AdapterError(f"Unreal did not create an import report (exit {completed.returncode}); see {stdout_path}")
        report = parse_unreal_report(report_path)
        validation = ValidationResult(report.get("status", "UNKNOWN"), report.get("checks", []), report.get("errors", []), report.get("warnings", []))
        artifacts = [
            Artifact(job_path, "unreal_import_job", "application/json", "agentic-graphics"),
            Artifact(report_path, "unreal_import_report", "application/json", "unreal"),
            Artifact(stdout_path, "stdout_log", "text/plain", "unreal"),
            Artifact(stderr_path, "stderr_log", "text/plain", "unreal"),
        ]
        for artifact in artifacts:
            context.add_artifact(artifact)
        if completed.returncode != 0 or not validation.passed:
            raise AdapterError(f"Unreal import failed (exit {completed.returncode}): {report.get('errors', [])}")
        context.state.update({"unreal_report": report_path, "engine_version": report.get("engine_version", "UNKNOWN")})
        return AdapterResult("PASS", artifacts, {"command": command.redacted(), "report": report}, validation)


def parse_unreal_report(path: Path) -> Dict[str, Any]:
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise AdapterError(f"Invalid Unreal report: {path}") from exc
    if not isinstance(payload, dict) or payload.get("status") not in {"PASS", "FAIL", "UNKNOWN_PARTIAL"}:
        raise AdapterError("Unreal report has an invalid status")
    return payload
