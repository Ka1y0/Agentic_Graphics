"""Environment diagnostics for Agentic Graphics."""

from __future__ import annotations

import json
import os
from dataclasses import asdict
from typing import Any, Dict, List, Mapping

from .tool_discovery import ToolInfo, command_version, discover_tool, system_tool


def diagnose(config: Mapping[str, Any], include_versions: bool = True) -> Dict[str, Any]:
    tools: List[ToolInfo] = [system_tool("python"), system_tool("git")]
    for name in ("blender", "unreal", "modly"):
        info = discover_tool(name, config)
        version = "UNKNOWN"
        if include_versions and info.available:
            if name == "blender":
                version = command_version([str(info.path), "--version"])
            elif name == "unreal":
                # Unreal version startup is expensive; the installed UE_* path is a reliable discovery hint.
                parts = [part for part in info.path.parts if part.startswith("UE_")] if info.path else []
                version = parts[-1].replace("UE_", "") if parts else "UNKNOWN"
            elif name == "modly":
                version = _modly_bundle_version(info.path)
        tools.append(ToolInfo(info.name, info.path, info.source, version, info.required))
    environment = {
        name: bool(os.environ.get(name))
        for name in (
            "AGFX_BLENDER",
            "AGFX_UNREAL_EDITOR_CMD",
            "AGFX_MODLY",
            "AGFX_OPENAI_BASE_URL",
            "AGFX_OPENAI_API_KEY",
            "AGFX_OPENAI_MODEL",
        )
    }
    records = []
    for tool in tools:
        record = asdict(tool)
        record["path"] = str(tool.path) if tool.path else None
        record["status"] = tool.status
        records.append(record)
    required_pass = all(tool.available for tool in tools if tool.required)
    return {"status": "PASS" if required_pass else "FAIL", "tools": records, "environment": environment}


def format_diagnosis(report: Mapping[str, Any]) -> str:
    labels = {"python": "Python", "git": "Git", "blender": "Blender", "unreal": "Unreal Engine", "modly": "Modly"}
    rows = []
    for tool in report["tools"]:
        suffix = f"  {tool['version']}" if tool.get("version") not in (None, "UNKNOWN") else ""
        rows.append(f"{labels.get(tool['name'], tool['name']):15} {tool['status']}{suffix}")
    return "\n".join(rows)


def _modly_bundle_version(path: Any) -> str:
    if not path:
        return "UNKNOWN"
    candidate = path
    try:
        plist = candidate.parents[1] / "Info.plist"
        if not plist.is_file():
            return "UNKNOWN"
        import plistlib

        with plist.open("rb") as handle:
            data = plistlib.load(handle)
        return str(data.get("CFBundleShortVersionString", "UNKNOWN"))
    except (OSError, ValueError, IndexError):
        return "UNKNOWN"
