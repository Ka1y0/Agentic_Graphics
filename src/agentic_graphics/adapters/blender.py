"""Blender procedural generation, processing, and validation adapters."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional

from ..artifacts import Artifact, RunContext
from ..security import validate_generated_python
from ..tool_discovery import discover_tool
from .base import AdapterError, AdapterResult, CommandSpec, GeneratorAdapter, ProcessingAdapter, ValidationResult


def scripts_root() -> Path:
    repository_path = Path(__file__).resolve().parents[3] / "scripts" / "blender"
    if repository_path.is_dir():
        return repository_path
    installed_path = Path(sys.prefix) / "share" / "agentic-graphics" / "scripts" / "blender"
    if installed_path.is_dir():
        return installed_path
    raise AdapterError("Installed Blender automation scripts could not be located")


def _command(blender: Path, script: Path, args: List[str], timeout: int, cwd: Path) -> CommandSpec:
    return CommandSpec(
        [str(blender), "--background", "--factory-startup", "--python", str(script), "--", *args],
        cwd=cwd,
        timeout_seconds=timeout,
    )


def _run_blender(command: CommandSpec, stdout_path: Path, stderr_path: Path) -> None:
    try:
        completed = subprocess.run(
            list(command.argv),
            cwd=command.cwd,
            env=dict(command.env) if command.env else None,
            capture_output=True,
            text=True,
            timeout=command.timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        stdout_path.write_text(exc.stdout or "", encoding="utf-8")
        stderr_path.write_text((exc.stderr or "") + f"\nTIMEOUT after {command.timeout_seconds}s\n", encoding="utf-8")
        raise AdapterError(f"Blender timed out after {command.timeout_seconds}s") from exc
    stdout_path.write_text(completed.stdout, encoding="utf-8")
    stderr_path.write_text(completed.stderr, encoding="utf-8")
    if completed.returncode != 0:
        raise AdapterError(f"Blender failed with exit code {completed.returncode}; see {stderr_path}")


class BlenderProceduralAdapter(GeneratorAdapter):
    name = "blender_procedural"

    def dry_run(self, spec: Mapping[str, Any], config: Mapping[str, Any]) -> AdapterResult:
        tool = discover_tool("blender", config)
        shape = spec.get("generation", {}).get("parameters", {}).get("shape", "cube")
        known_shape = shape in {"cube", "crate", "chair", "stylized_prop"}
        return AdapterResult(
            "READY" if tool.available and known_shape else "FAIL",
            details={
                "tool": str(tool.path) if tool.path else None,
                "tool_source": tool.source,
                "shape": shape,
                "known_shape": known_shape,
                "requires_execution_approval": bool(config.get("security", {}).get("require_generated_code_approval", True)),
                "expected_outputs": ["generated/generated.glb", "reports/blender-generation-report.json"],
            },
        )

    def execute(self, context: RunContext, **kwargs: Any) -> AdapterResult:
        approval = bool(kwargs.get("approve_generated_code", False))
        require_approval = bool(context.config.get("security", {}).get("require_generated_code_approval", True))
        if require_approval and not approval:
            raise AdapterError("Generated Blender code requires --approve-generated-code")
        tool = discover_tool("blender", context.config)
        if not tool.available or not tool.path:
            raise AdapterError("Blender executable was not found")
        source_script = scripts_root() / "generate_asset.py"
        generated_script = context.root / "generated" / "generated_blender_script.py"
        shutil.copy2(source_script, generated_script)
        safety = validate_generated_python(generated_script.read_text(encoding="utf-8"))
        if not safety.safe:
            raise AdapterError("Generated Blender script failed safety checks: " + "; ".join(safety.violations))
        script_artifact = Artifact(generated_script, "generated_blender_script", "text/x-python", "agentic-graphics")
        context.add_artifact(script_artifact)
        spec_path = context.root / "resolved-spec.json"
        output_path = context.root / "generated" / "generated.glb"
        report_path = context.root / "reports" / "blender-generation-report.json"
        stdout_path = context.root / "logs" / "blender-generate.stdout.log"
        stderr_path = context.root / "logs" / "blender-generate.stderr.log"
        timeout = int(context.config["defaults"]["generated_code_timeout_seconds"])
        command = _command(tool.path, generated_script, ["--spec", str(spec_path), "--output", str(output_path), "--report", str(report_path)], timeout, context.root)
        try:
            _run_blender(command, stdout_path, stderr_path)
        except AdapterError:
            _record_existing(context, ((report_path, "blender_generation_report", "application/json"), (stdout_path, "stdout_log", "text/plain"), (stderr_path, "stderr_log", "text/plain")), "blender")
            raise
        if not output_path.is_file() or not report_path.is_file():
            raise AdapterError("Blender did not create the procedural mesh and report")
        report = parse_blender_report(report_path)
        if report.get("status") != "PASS":
            raise AdapterError(f"Blender generation report status: {report.get('status', 'UNKNOWN')}")
        artifacts = [
            script_artifact,
            Artifact(output_path, "generated_mesh", "model/gltf-binary", "blender"),
            Artifact(report_path, "blender_generation_report", "application/json", "blender"),
            Artifact(stdout_path, "stdout_log", "text/plain", "blender"),
            Artifact(stderr_path, "stderr_log", "text/plain", "blender"),
        ]
        for artifact in artifacts[1:]:
            context.add_artifact(artifact)
        context.state.update({"mesh_input": output_path, "blender_version": report.get("blender_version", "UNKNOWN")})
        return AdapterResult("PASS", artifacts, {"command": command.redacted(), "report": report})


class BlenderProcessingAdapter(ProcessingAdapter):
    name = "blender"

    def dry_run(self, spec: Mapping[str, Any], config: Mapping[str, Any]) -> AdapterResult:
        tool = discover_tool("blender", config)
        operations = dict(spec.get("processing", {}).get("blender", {}))
        return AdapterResult(
            "READY" if tool.available else "FAIL",
            details={
                "tool": str(tool.path) if tool.path else None,
                "operations": operations,
                "destructive_optimizations_enabled": bool(operations.get("decimate_ratio") or operations.get("merge_by_distance")),
                "expected_outputs": ["processed/processed.glb", "reports/blender-processing-report.json"],
            },
        )

    def execute(self, context: RunContext, **kwargs: Any) -> AdapterResult:
        tool = discover_tool("blender", context.config)
        if not tool.available or not tool.path:
            raise AdapterError("Blender executable was not found")
        input_path = Path(kwargs.get("input_path") or context.state.get("mesh_input", ""))
        if not input_path.is_file():
            raise AdapterError(f"Blender processing input not found: {input_path}")
        output_path = context.root / "processed" / "processed.glb"
        report_path = context.root / "reports" / "blender-processing-report.json"
        stdout_path = context.root / "logs" / "blender-process.stdout.log"
        stderr_path = context.root / "logs" / "blender-process.stderr.log"
        script = scripts_root() / "process_asset.py"
        timeout = int(context.config["defaults"]["command_timeout_seconds"])
        command = _command(
            tool.path,
            script,
            ["--spec", str(context.root / "resolved-spec.json"), "--input", str(input_path), "--output", str(output_path), "--report", str(report_path)],
            timeout,
            context.root,
        )
        try:
            _run_blender(command, stdout_path, stderr_path)
        except AdapterError:
            _record_existing(context, ((report_path, "blender_processing_report", "application/json"), (stdout_path, "stdout_log", "text/plain"), (stderr_path, "stderr_log", "text/plain")), "blender")
            raise
        report = parse_blender_report(report_path)
        if report.get("status") != "PASS" or not output_path.is_file():
            raise AdapterError(f"Blender processing failed: {report.get('errors', report.get('status', 'UNKNOWN'))}")
        artifacts = [
            Artifact(output_path, "processed_mesh", "model/gltf-binary", "blender"),
            Artifact(report_path, "blender_processing_report", "application/json", "blender"),
            Artifact(stdout_path, "stdout_log", "text/plain", "blender"),
            Artifact(stderr_path, "stderr_log", "text/plain", "blender"),
        ]
        for artifact in artifacts:
            context.add_artifact(artifact)
        context.state.update({"processed_mesh": output_path, "mesh_input": output_path, "blender_version": report.get("blender_version", "UNKNOWN")})
        return AdapterResult("PASS", artifacts, {"command": command.redacted(), "report": report})


class BlenderValidationAdapter(ProcessingAdapter):
    name = "blender_validation"

    def dry_run(self, spec: Mapping[str, Any], config: Mapping[str, Any]) -> AdapterResult:
        tool = discover_tool("blender", config)
        return AdapterResult("READY" if tool.available else "FAIL", details={"tool": str(tool.path) if tool.path else None})

    def execute(self, context: RunContext, **kwargs: Any) -> AdapterResult:
        tool = discover_tool("blender", context.config)
        if not tool.available or not tool.path:
            raise AdapterError("Blender executable was not found")
        input_path = Path(kwargs.get("input_path") or context.state.get("processed_mesh") or context.state.get("mesh_input", ""))
        if not input_path.is_file():
            raise AdapterError(f"Blender validation input not found: {input_path}")
        report_path = context.root / "reports" / "blender-validation-report.json"
        stdout_path = context.root / "logs" / "blender-validate.stdout.log"
        stderr_path = context.root / "logs" / "blender-validate.stderr.log"
        script = scripts_root() / "validate_asset.py"
        timeout = int(context.config["defaults"]["command_timeout_seconds"])
        command = _command(tool.path, script, ["--spec", str(context.root / "resolved-spec.json"), "--input", str(input_path), "--report", str(report_path)], timeout, context.root)
        run_error: Optional[AdapterError] = None
        try:
            _run_blender(command, stdout_path, stderr_path)
        except AdapterError as exc:
            run_error = exc
        if not report_path.is_file():
            _record_existing(context, ((stdout_path, "stdout_log", "text/plain"), (stderr_path, "stderr_log", "text/plain")), "blender")
            if run_error:
                raise run_error
            raise AdapterError("Blender validation report was not created")
        report = parse_blender_report(report_path)
        validation = ValidationResult(report.get("status", "UNKNOWN"), report.get("checks", []), report.get("errors", []), report.get("warnings", []))
        artifacts = [
            Artifact(report_path, "blender_validation_report", "application/json", "blender"),
            Artifact(stdout_path, "stdout_log", "text/plain", "blender"),
            Artifact(stderr_path, "stderr_log", "text/plain", "blender"),
        ]
        for artifact in artifacts:
            context.add_artifact(artifact)
        if not validation.passed:
            raise AdapterError("Blender validation did not pass: " + "; ".join(validation.errors or [validation.status]))
        if run_error:
            raise run_error
        context.state["validated_mesh"] = input_path
        return AdapterResult("PASS", artifacts, {"command": command.redacted(), "report": report}, validation)


def parse_blender_report(path: Path) -> Dict[str, Any]:
    if not Path(path).is_file():
        raise AdapterError(f"Blender report not found: {path}")
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise AdapterError(f"Invalid Blender report: {path}") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("status"), str):
        raise AdapterError("Blender report must contain a string status")
    return payload


def _record_existing(context: RunContext, entries: Any, source: str) -> None:
    for path, role, media_type in entries:
        if Path(path).is_file():
            context.add_artifact(Artifact(Path(path), role, media_type, source))
