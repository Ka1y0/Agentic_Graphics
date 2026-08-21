"""Optional OpenAI-compatible chat-completions adapter.

The adapter is disabled unless its base URL, API key, and model are supplied by
environment variables. Agentic_Graphics has no provider account dependency.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Mapping

from ..artifacts import Artifact, RunContext
from ..config import env_value
from ..spec import SpecError, resolve_spec, validate_spec
from .base import AdapterError, AdapterResult, LLMAdapter


class OpenAICompatibleLLMAdapter(LLMAdapter):
    name = "openai_compatible"

    @staticmethod
    def build_payload(model: str, intent: Mapping[str, Any]) -> Dict[str, Any]:
        return {
            "model": model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": "Return only a GraphicsSpec JSON object conforming to schema_version 1.",
                },
                {"role": "user", "content": json.dumps(dict(intent), sort_keys=True)},
            ],
        }

    def dry_run(self, spec: Mapping[str, Any], config: Mapping[str, Any]) -> AdapterResult:
        configured = {
            "base_url": bool(env_value(config, "openai_compatible", "base_url_env")),
            "api_key": bool(env_value(config, "openai_compatible", "api_key_env")),
            "model": bool(env_value(config, "openai_compatible", "model_env")),
        }
        return AdapterResult("READY" if all(configured.values()) else "FAIL", details={"configured": configured})

    def execute(self, context: RunContext, **kwargs: Any) -> AdapterResult:
        config = context.config
        base_url = env_value(config, "openai_compatible", "base_url_env")
        api_key = env_value(config, "openai_compatible", "api_key_env")
        model = env_value(config, "openai_compatible", "model_env")
        if not all((base_url, api_key, model)):
            raise AdapterError("OpenAI-compatible provider environment is incomplete")
        payload = self.build_payload(str(model), context.spec)
        request = urllib.request.Request(
            str(base_url).rstrip("/") + "/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                response_payload = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, json.JSONDecodeError) as exc:
            raise AdapterError(f"OpenAI-compatible request failed: {type(exc).__name__}") from exc
        output = context.root / "generated" / "provider-graphics-spec.json"
        try:
            content = response_payload["choices"][0]["message"]["content"]
            generated = json.loads(content)
            validate_spec(generated)
            generated = resolve_spec(generated, output.parent)
        except (KeyError, IndexError, TypeError, json.JSONDecodeError, SpecError) as exc:
            raise AdapterError("Provider response did not contain a valid GraphicsSpec JSON object") from exc
        if generated.get("workflow") != context.spec.get("workflow"):
            raise AdapterError("Provider output may not change the already-resolved workflow graph")
        context.spec = generated
        (context.root / "resolved-spec.json").write_text(json.dumps(generated, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        output.write_text(json.dumps(generated, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        artifact = Artifact(output, "llm_output", "application/json", "openai-compatible")
        context.add_artifact(artifact)
        return AdapterResult("PASS", [artifact], {"model": model, "base_url": base_url, "api_key": "REDACTED"})
