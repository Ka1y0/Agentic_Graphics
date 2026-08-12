"""Conservative checks for generated Blender Python.

These checks reduce accidental unsafe behavior. They are deliberately not
described as an operating-system sandbox.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass
from typing import Iterable, List, Set


FORBIDDEN_MODULES: Set[str] = {
    "ctypes",
    "http",
    "multiprocessing",
    "os",
    "requests",
    "shutil",
    "socket",
    "subprocess",
    "urllib",
}
FORBIDDEN_CALLS: Set[str] = {"__import__", "compile", "eval", "exec", "open"}


@dataclass(frozen=True)
class ScriptSafetyResult:
    safe: bool
    violations: List[str]


def validate_generated_python(source: str, allowed_modules: Iterable[str] = ("bpy", "bmesh", "json", "math", "mathutils", "pathlib", "sys")) -> ScriptSafetyResult:
    violations: List[str] = []
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        return ScriptSafetyResult(False, [f"syntax error: {exc}"])

    allowed = set(allowed_modules)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root in FORBIDDEN_MODULES or root not in allowed:
                    violations.append(f"import not allowed: {alias.name}")
        elif isinstance(node, ast.ImportFrom):
            root = (node.module or "").split(".")[0]
            if root in FORBIDDEN_MODULES or root not in allowed:
                violations.append(f"import not allowed: {node.module}")
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in FORBIDDEN_CALLS:
            violations.append(f"call not allowed: {node.func.id}")
        elif isinstance(node, ast.Attribute) and node.attr in {
            "execv", "execve", "popen", "rename", "replace", "rmdir", "spawn", "system", "unlink"
        }:
            violations.append(f"attribute not allowed: {node.attr}")
    unique = sorted(set(violations))
    return ScriptSafetyResult(not unique, unique)
