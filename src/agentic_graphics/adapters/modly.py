"""Optional Modly API automation with an explicit file handoff fallback."""

from __future__ import annotations

import json
import mimetypes
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Dict, Mapping, Optional, Tuple

from ..artifacts import Artifact, RunContext
from .base import AdapterError, AdapterResult, GeneratorAdapter
from .manual import SUPPORTED_MESH_INPUTS, _media_type


DEFAULT_API_BASE = "http://127.0.0.1:8765"


def _is_loopback(url: str) -> bool:
    host = urllib.parse.urlparse(url).hostname
    return host in {"127.0.0.1", "localhost", "::1"}


class ModlyAdapter(GeneratorAdapter):
    """Use Modly's bundled local FastAPI interface when it is reachable."""

    name = "modly"

    def __init__(self, api_base: str = DEFAULT_API_BASE):
        self.api_base = api_base.rstrip("/")

    def health(self, timeout: float = 2.0) -> Tuple[bool, Optional[Dict[str, Any]]]:
        try:
            with urllib.request.urlopen(self.api_base + "/health", timeout=timeout) as response:
                payload = json.loads(response.read().decode("utf-8"))
            return True, payload if isinstance(payload, dict) else {"response": payload}
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
            return False, None

    def dry_run(self, spec: Mapping[str, Any], config: Mapping[str, Any]) -> AdapterResult:
        allow_remote = bool(config.get("security", {}).get("allow_remote_modly", False))
        if not _is_loopback(self.api_base) and not allow_remote:
            return AdapterResult("FAIL", details={"error": "remote Modly endpoints are disabled"})
        reference = spec.get("generation", {}).get("reference_image")
        reachable, health = self.health()
        if reachable and reference and Path(reference).is_file():
            return AdapterResult("READY", details={"mode": "AUTOMATED", "health": health, "reference_image": reference})
        source = spec.get("generation", {}).get("source")
        source_ready = bool(source and Path(source).is_file())
        return AdapterResult(
            "READY",
            details={
                "mode": "HANDOFF" if not reachable else "AUTOMATED",
                "api_reachable": reachable,
                "reference_image_exists": bool(reference and Path(reference).is_file()),
                "handoff_source_ready": source_ready,
            },
        )

    def execute(self, context: RunContext, **kwargs: Any) -> AdapterResult:
        allow_remote = bool(context.config.get("security", {}).get("allow_remote_modly", False))
        if not _is_loopback(self.api_base) and not allow_remote:
            raise AdapterError("Refusing non-loopback Modly API without security.allow_remote_modly")
        reference = context.spec.get("generation", {}).get("reference_image")
        reachable, _ = self.health()
        if reachable and reference:
            return self._execute_api(context, Path(reference))
        return ModlyHandoffAdapter().execute(context)

    def _execute_api(self, context: RunContext, reference: Path) -> AdapterResult:
        if not reference.is_file():
            raise AdapterError(f"Modly reference image not found: {reference}")
        generation = context.spec.get("generation", {})
        parameters = generation.get("parameters", {})
        fields = {
            "model_id": str(generation.get("model", "sf3d")),
            "collection": f"agentic-graphics-{context.run_id}",
            "remesh": str(parameters.get("remesh", "quad")),
            "enable_texture": str(bool(parameters.get("enable_texture", False))).lower(),
            "params": json.dumps(_model_parameters(parameters), sort_keys=True),
        }
        body, content_type = _multipart(reference, fields)
        request = urllib.request.Request(
            self.api_base + "/generate/from-image",
            data=body,
            headers={"Content-Type": content_type},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                job = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, json.JSONDecodeError) as exc:
            raise AdapterError(f"Modly generation request failed: {type(exc).__name__}") from exc
        job_id = job.get("job_id")
        if not job_id:
            raise AdapterError("Modly did not return a job_id")
        deadline = time.monotonic() + int(context.config["defaults"]["command_timeout_seconds"])
        status: Dict[str, Any] = {}
        while time.monotonic() < deadline:
            with urllib.request.urlopen(f"{self.api_base}/generate/status/{job_id}", timeout=10) as response:
                status = json.loads(response.read().decode("utf-8"))
            if status.get("status") in {"done", "error", "cancelled"}:
                break
            time.sleep(1)
        if status.get("status") != "done" or not status.get("output_url"):
            if status.get("status") not in {"error", "cancelled"}:
                self._cancel_job(str(job_id))
            self._write_report(context, str(job_id), status, "FAIL")
            raise AdapterError(f"Modly job ended without output: {status.get('status', 'timeout')}")
        output_url = urllib.parse.urljoin(self.api_base + "/", status["output_url"].lstrip("/"))
        destination = context.root / "generated" / "modly-output.glb"
        with urllib.request.urlopen(output_url, timeout=60) as response, destination.open("wb") as handle:
            shutil.copyfileobj(response, handle)
        report_path = self._write_report(context, str(job_id), status, "PASS")
        artifacts = [
            Artifact(destination, "generated_mesh", "model/gltf-binary", "modly"),
        ]
        for artifact in artifacts:
            context.add_artifact(artifact)
        artifacts.append(Artifact(report_path, "modly_report", "application/json", "modly"))
        context.state["mesh_input"] = destination
        return AdapterResult("PASS", artifacts, {"mode": "AUTOMATED", "job_id": job_id})

    def _cancel_job(self, job_id: str) -> None:
        request = urllib.request.Request(f"{self.api_base}/generate/cancel/{urllib.parse.quote(job_id)}", data=b"", method="POST")
        try:
            with urllib.request.urlopen(request, timeout=5):
                pass
        except (urllib.error.URLError, TimeoutError, OSError):
            pass

    @staticmethod
    def _write_report(context: RunContext, job_id: str, job: Mapping[str, Any], status: str) -> Path:
        report_path = context.root / "reports" / "modly-report.json"
        report_path.write_text(
            json.dumps({"schema_version": "1", "status": status, "mode": "AUTOMATED", "job_id": job_id, "job": dict(job)}, indent=2) + "\n",
            encoding="utf-8",
        )
        context.add_artifact(Artifact(report_path, "modly_report", "application/json", "modly"))
        return report_path


class ModlyHandoffAdapter(GeneratorAdapter):
    """Generate a request and intake a user/agent-exported Modly mesh."""

    name = "modly_handoff"

    def dry_run(self, spec: Mapping[str, Any], config: Mapping[str, Any]) -> AdapterResult:
        source = spec.get("generation", {}).get("source")
        return AdapterResult("READY", details={"mode": "HANDOFF", "source_ready": bool(source and Path(source).is_file())})

    def execute(self, context: RunContext, **kwargs: Any) -> AdapterResult:
        handoff_dir = context.root / "generated" / "modly-handoff"
        handoff_dir.mkdir(exist_ok=True)
        source_value = context.spec.get("generation", {}).get("source")
        request = {
            "schema_version": "1",
            "run_id": context.run_id,
            "intent": context.spec.get("intent", {}),
            "representation": context.spec.get("representation", {}),
            "accepted_formats": sorted(SUPPORTED_MESH_INPUTS),
            "export_directory": str(handoff_dir),
            "state": "READY_FOR_INTAKE" if source_value and Path(source_value).is_file() else "WAITING_FOR_EXPORT",
        }
        request_path = handoff_dir / "generation-request.json"
        request_path.write_text(json.dumps(request, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        request_artifact = Artifact(request_path, "modly_handoff_request", "application/json", "agentic-graphics")
        context.add_artifact(request_artifact)
        if not source_value:
            return AdapterResult("HANDOFF_REQUIRED", [request_artifact], {"mode": "HANDOFF", "directory": str(handoff_dir)})
        source = Path(source_value)
        if not source.is_file():
            return AdapterResult("HANDOFF_REQUIRED", [request_artifact], {"mode": "HANDOFF", "expected_source": str(source)})
        if source.suffix.lower() not in SUPPORTED_MESH_INPUTS:
            raise AdapterError(f"Unsupported Modly handoff format: {source.suffix}")
        destination = context.root / "inputs" / f"modly-source{source.suffix.lower()}"
        shutil.copy2(source, destination)
        asset = Artifact(destination, "generated_mesh", _media_type(destination), "modly-handoff")
        context.add_artifact(asset)
        context.state["mesh_input"] = destination
        return AdapterResult("PASS", [request_artifact, asset], {"mode": "HANDOFF"})


def _multipart(path: Path, fields: Mapping[str, str]) -> Tuple[bytes, str]:
    boundary = "agfx-" + uuid.uuid4().hex
    chunks = []
    for name, value in fields.items():
        chunks.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode())
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    header = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{path.name}\"\r\n"
        f"Content-Type: {mime}\r\n\r\n"
    ).encode()
    chunks.extend([header, path.read_bytes(), b"\r\n", f"--{boundary}--\r\n".encode()])
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def _model_parameters(parameters: Mapping[str, Any]) -> Dict[str, Any]:
    """Forward model-specific values while keeping common API fields separate."""

    return {key: value for key, value in parameters.items() if key not in {"remesh", "enable_texture", "texture_resolution"}}
