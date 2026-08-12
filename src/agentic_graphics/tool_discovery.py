"""Portable external-tool discovery with explicit precedence."""

from __future__ import annotations

import glob
import os
import platform
import shutil
import subprocess
import sys
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence


@dataclass(frozen=True)
class ToolInfo:
    name: str
    path: Optional[Path]
    source: str
    version: str = "UNKNOWN"
    required: bool = True

    @property
    def available(self) -> bool:
        return bool(self.path and self.path.exists())

    @property
    def status(self) -> str:
        if self.available:
            return "PASS"
        return "FAIL" if self.required else "OPTIONAL"


TOOL_RULES: Dict[str, Dict[str, Any]] = {
    "blender": {
        "config": "blender",
        "env": ["AGFX_BLENDER", "BLENDER_PATH"],
        "path_names": ["blender"],
        "required": True,
    },
    "unreal": {
        "config": "unreal_editor_cmd",
        "env": ["AGFX_UNREAL_EDITOR_CMD", "UNREAL_EDITOR_CMD"],
        "path_names": ["UnrealEditor-Cmd", "UnrealEditor-Cmd.exe"],
        "required": True,
    },
    "modly": {
        "config": "modly",
        "env": ["AGFX_MODLY", "MODLY_PATH"],
        "path_names": ["modly", "Modly"],
        "required": False,
    },
}


def known_locations(name: str, system: Optional[str] = None) -> Iterable[Path]:
    selected = system or platform.system()
    if selected == "Darwin":
        if name == "blender":
            yield Path("/Applications/Blender.app/Contents/MacOS/Blender")
            yield Path.home() / "Applications/Blender.app/Contents/MacOS/Blender"
        elif name == "unreal":
            for value in sorted(glob.glob("/Users/Shared/Epic Games/UE_*/Engine/Binaries/Mac/UnrealEditor-Cmd"), key=_version_key, reverse=True):
                yield Path(value)
        elif name == "modly":
            yield Path("/Applications/Modly.app/Contents/MacOS/Modly")
            yield Path.home() / "Applications/Modly.app/Contents/MacOS/Modly"
    elif selected == "Windows":
        program_files = Path(os.environ.get("ProgramFiles", r"C:\Program Files"))
        if name == "blender":
            for value in sorted(program_files.glob("Blender Foundation/Blender */blender.exe"), reverse=True):
                yield value
        elif name == "unreal":
            for value in sorted(program_files.glob("Epic Games/UE_*/Engine/Binaries/Win64/UnrealEditor-Cmd.exe"), key=lambda item: _version_key(str(item)), reverse=True):
                yield value
        elif name == "modly":
            yield Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "Programs/Modly/Modly.exe"
    else:
        if name == "blender":
            yield Path("/usr/bin/blender")
            yield Path("/usr/local/bin/blender")
        elif name == "unreal":
            for root in (Path("/opt"), Path.home() / "UnrealEngine"):
                for value in sorted(root.glob("UE_*/Engine/Binaries/Linux/UnrealEditor-Cmd"), key=lambda item: _version_key(str(item)), reverse=True):
                    yield value
        elif name == "modly":
            yield Path("/opt/Modly/modly")


def discover_tool(name: str, config: Mapping[str, Any]) -> ToolInfo:
    if name not in TOOL_RULES:
        raise KeyError(f"Unknown tool: {name}")
    rule = TOOL_RULES[name]
    configured = str(config.get("tools", {}).get(rule["config"], "auto"))
    if configured.lower() != "auto":
        candidate = Path(configured).expanduser()
        return ToolInfo(name, candidate.resolve() if candidate.exists() else candidate, "config", required=rule["required"])
    for env_name in rule["env"]:
        value = os.environ.get(env_name)
        if value:
            candidate = Path(value).expanduser()
            return ToolInfo(name, candidate.resolve() if candidate.exists() else candidate, f"env:{env_name}", required=rule["required"])
    for candidate in known_locations(name):
        if candidate.is_file():
            return ToolInfo(name, candidate.resolve(), "known-location", required=rule["required"])
    for executable in rule["path_names"]:
        value = shutil.which(executable)
        if value:
            return ToolInfo(name, Path(value).resolve(), "PATH", required=rule["required"])
    return ToolInfo(name, None, "not-found", required=rule["required"])


def _version_key(value: str) -> tuple:
    match = re.search(r"UE_(\d+(?:\.\d+)*)", value)
    return tuple(int(part) for part in match.group(1).split(".")) if match else (0,)


def command_version(argv: Sequence[str], timeout: int = 15) -> str:
    try:
        completed = subprocess.run(list(argv), capture_output=True, text=True, timeout=timeout, check=False)
        text = (completed.stdout or completed.stderr).strip()
        return text.splitlines()[0] if text else "UNKNOWN"
    except (OSError, subprocess.TimeoutExpired):
        return "UNKNOWN"


def system_tool(name: str) -> ToolInfo:
    if name == "python":
        return ToolInfo("python", Path(sys.executable).resolve(), "runtime", platform.python_version(), True)
    path = shutil.which(name)
    version = command_version([path, "--version"]) if path else "UNKNOWN"
    return ToolInfo(name, Path(path).resolve() if path else None, "PATH" if path else "not-found", version, True)
