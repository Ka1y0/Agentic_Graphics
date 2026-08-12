"""Provider-neutral command adapter for external agents."""

from __future__ import annotations

import json
import shlex
import subprocess
from pathlib import Path
from typing import Any, List, Mapping, Sequence

from ..artifacts import Artifact, RunContext
from ..spec import SpecError, load_spec
from .base import AdapterError, AdapterResult, CommandSpec, LLMAdapter


class CommandLLMAdapter(LLMAdapter):
    """Run ``<command> input.json output.json`` without invoking a shell."""

    name = "command"

    @staticmethod
    def normalize_command(value: Any) -> List[str]:
        if isinstance(value, str):
            result = shlex.split(value)
        elif isinstance(value, Sequence) and not isinstance(value, (bytes, bytearray)):
            result = [str(part) for part in value]
        else:
            raise AdapterError("LLM command must be a string or array")
        if not result:
            raise AdapterError("LLM command may not be empty")
        return result

    @classmethod
    def build_command(cls, command: Any, input_path: Path, output_path: Path, timeout: int) -> CommandSpec:
        argv = cls.normalize_command(command)
        return CommandSpec([*argv, str(input_path), str(output_path)], cwd=output_path.parent, timeout_seconds=timeout)

    def dry_run(self, spec: Mapping[str, Any], config: Mapping[str, Any]) -> AdapterResult:
        command = spec.get("agent", {}).get("command")
        if not command:
            return AdapterResult("FAIL", details={"error": "agent.command is required"})
        try:
            argv = self.normalize_command(command)
        except AdapterError as exc:
            return AdapterResult("FAIL", details={"error": str(exc)})
        return AdapterResult("READY", details={"argv": argv, "shell": False})

    def execute(self, context: RunContext, **kwargs: Any) -> AdapterResult:
        input_path = context.root / "generated" / "agent-input.json"
        output_path = context.root / "generated" / "agent-output.json"
        input_payload = context.spec
        input_path.write_text(json.dumps(input_payload, indent=2) + "\n", encoding="utf-8")
        timeout = int(context.config["defaults"]["command_timeout_seconds"])
        command = self.build_command(context.spec.get("agent", {}).get("command"), input_path, output_path, timeout)
        stdout_path = context.root / "logs" / "command-llm.stdout.log"
        stderr_path = context.root / "logs" / "command-llm.stderr.log"
        try:
            completed = subprocess.run(
                list(command.argv),
                cwd=command.cwd,
                shell=False,
                capture_output=True,
                text=True,
                timeout=command.timeout_seconds,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise AdapterError(f"LLM command timed out after {timeout}s") from exc
        stdout_path.write_text(completed.stdout, encoding="utf-8")
        stderr_path.write_text(completed.stderr, encoding="utf-8")
        artifacts = [
            Artifact(input_path, "llm_input", "application/json", "command"),
            Artifact(stdout_path, "stdout_log", "text/plain", "command"),
            Artifact(stderr_path, "stderr_log", "text/plain", "command"),
        ]
        for artifact in artifacts:
            context.add_artifact(artifact)
        if completed.returncode != 0:
            raise AdapterError(f"LLM command failed with exit code {completed.returncode}; see {stderr_path}")
        if not output_path.is_file():
            raise AdapterError("LLM command did not create its output JSON")
        # The external agent's output must itself pass the canonical schema.
        try:
            generated = load_spec(output_path)
        except SpecError as exc:
            raise AdapterError(f"LLM command output is not a valid GraphicsSpec: {exc}") from exc
        if generated.get("workflow") != context.spec.get("workflow"):
            raise AdapterError("LLM command output may not change the already-resolved workflow graph")
        context.spec = generated
        (context.root / "resolved-spec.json").write_text(json.dumps(generated, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        output_artifact = Artifact(output_path, "llm_output", "application/json", "command")
        context.add_artifact(output_artifact)
        artifacts.append(output_artifact)
        return AdapterResult("PASS", artifacts, {"argv": command.redacted(), "returncode": completed.returncode})
