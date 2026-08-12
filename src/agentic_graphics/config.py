"""Configuration loading and cross-platform path handling."""

from __future__ import annotations

import os
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, Mapping, Optional

try:  # pragma: no cover - selected by interpreter version
    import tomllib
except ModuleNotFoundError:  # Python 3.9/3.10
    import tomli as tomllib  # type: ignore[no-redef]


DEFAULT_CONFIG: Dict[str, Any] = {
    "tools": {
        "blender": "auto",
        "unreal_editor_cmd": "auto",
        "modly": "auto",
    },
    "defaults": {
        "workspace": "./runs",
        "generator": "manual",
        "engine": "unreal",
        "command_timeout_seconds": 300,
        "generated_code_timeout_seconds": 300,
        "unreal_timeout_seconds": 900,
    },
    "security": {
        "require_generated_code_approval": True,
        "allow_remote_modly": False,
    },
    "providers": {
        "openai_compatible": {
            "base_url_env": "AGFX_OPENAI_BASE_URL",
            "api_key_env": "AGFX_OPENAI_API_KEY",
            "model_env": "AGFX_OPENAI_MODEL",
        }
    },
}


class ConfigError(ValueError):
    """Raised when configuration is invalid."""


def _merge(base: Dict[str, Any], override: Mapping[str, Any]) -> Dict[str, Any]:
    result = deepcopy(base)
    for key, value in override.items():
        if isinstance(value, Mapping) and isinstance(result.get(key), dict):
            result[key] = _merge(result[key], value)
        else:
            result[key] = value
    return result


def load_config(path: Optional[Path] = None, cwd: Optional[Path] = None) -> Dict[str, Any]:
    """Load a TOML config, resolving the workspace relative to the config file."""

    base_dir = (cwd or Path.cwd()).resolve()
    selected = path
    if selected is None:
        candidate = base_dir / "agentic-graphics.toml"
        if candidate.exists():
            selected = candidate

    payload: Mapping[str, Any] = {}
    if selected is not None:
        selected = Path(selected).expanduser().resolve()
        if not selected.is_file():
            raise ConfigError(f"Configuration file not found: {selected}")
        with selected.open("rb") as handle:
            payload = tomllib.load(handle)
        base_dir = selected.parent

    config = _merge(DEFAULT_CONFIG, payload)
    for key in ("blender", "unreal_editor_cmd", "modly"):
        value = str(config["tools"][key])
        if value.lower() != "auto":
            tool_path = Path(value).expanduser()
            if not tool_path.is_absolute():
                tool_path = base_dir / tool_path
            config["tools"][key] = str(tool_path.resolve())
    workspace = Path(str(config["defaults"]["workspace"])).expanduser()
    if not workspace.is_absolute():
        workspace = base_dir / workspace
    config["defaults"]["workspace"] = str(workspace.resolve())
    config["_meta"] = {"path": str(selected) if selected else None, "base_dir": str(base_dir)}
    _validate(config)
    return config


def _validate(config: Mapping[str, Any]) -> None:
    for key in ("command_timeout_seconds", "generated_code_timeout_seconds", "unreal_timeout_seconds"):
        value = config["defaults"].get(key)
        if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
            raise ConfigError(f"defaults.{key} must be a positive integer")
    for key in ("blender", "unreal_editor_cmd", "modly"):
        value = config["tools"].get(key)
        if not isinstance(value, str) or not value:
            raise ConfigError(f"tools.{key} must be a non-empty string")


def env_value(config: Mapping[str, Any], provider: str, field: str) -> Optional[str]:
    """Read a provider value from its configured environment-variable name."""

    env_name = config.get("providers", {}).get(provider, {}).get(field)
    return os.environ.get(env_name) if env_name else None
