"""The ``agfx`` command-line interface."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Any, Dict, Optional, Sequence

from . import __version__
from .config import ConfigError, load_config
from .doctor import diagnose, format_diagnosis
from .spec import SpecError, load_spec
from .workflow import WorkflowError, WorkflowExecutor


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="agfx", description="Agent-driven graphics workflow infrastructure")
    parser.add_argument("--version", action="version", version=f"agfx {__version__}")
    parser.add_argument("--config", type=Path, help="Path to agentic-graphics.toml")
    sub = parser.add_subparsers(dest="command", required=True)

    doctor = sub.add_parser("doctor", help="Discover required and optional tools")
    doctor.add_argument("--json", action="store_true", dest="as_json")

    init = sub.add_parser("init", help="Initialize local configuration and an example spec")
    init.add_argument("directory", nargs="?", type=Path, default=Path.cwd())

    for name, help_text in (
        ("plan", "Resolve and validate a workflow graph"),
        ("generate", "Run through the generation stage"),
        ("process", "Run through Blender processing"),
        ("validate", "Run through validation"),
        ("export", "Run through the configured output adapter"),
        ("run", "Run the complete workflow"),
    ):
        command = sub.add_parser(name, help=help_text)
        _add_run_arguments(command)

    blender = sub.add_parser("blender", help="Run a Blender-focused workflow stage")
    _add_run_arguments(blender)
    blender.add_argument("--operation", choices=["generate", "process", "validate"], default="validate")

    unreal = sub.add_parser("unreal", help="Run or dry-run Unreal import")
    _add_run_arguments(unreal)
    return parser


def _add_run_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("spec", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--approve-generated-code", action="store_true")
    parser.add_argument("--run-id")
    parser.add_argument("--json", action="store_true", dest="as_json")


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        config = load_config(args.config)
        if args.command == "doctor":
            report = diagnose(config)
            print(json.dumps(report, indent=2) if args.as_json else format_diagnosis(report))
            return 0 if report["status"] == "PASS" else 1
        if args.command == "init":
            return _init(args.directory)
        spec = load_spec(args.spec)
        through = _through_stage(args, spec)
        executor = WorkflowExecutor()
        if args.dry_run or args.command == "plan":
            report = executor.dry_run(spec, config, through_stage=through)
            print(json.dumps(report, indent=2, sort_keys=True))
            return 0 if report["status"] == "PASS" else 1
        context = executor.execute(
            spec,
            config,
            request_path=args.spec,
            through_stage=through,
            run_id=args.run_id,
            approve_generated_code=args.approve_generated_code,
        )
        manifest = json.loads((context.root / "manifest.json").read_text(encoding="utf-8"))
        result = {"status": manifest["status"], "run_id": context.run_id, "run_directory": str(context.root), "manifest": str(context.root / "manifest.json")}
        print(json.dumps(result, indent=2) if args.as_json else f"{result['status']}  {result['run_directory']}")
        return 0 if manifest["status"] in {"PASS", "HANDOFF_REQUIRED"} else 1
    except (ConfigError, SpecError, WorkflowError, OSError, ValueError) as exc:
        print(f"agfx: {exc}", file=sys.stderr)
        return 2


def _through_stage(args: argparse.Namespace, spec: Dict[str, Any]) -> Optional[str]:
    if args.command == "plan":
        return "plan"
    if args.command == "generate":
        return "generate"
    if args.command == "process":
        return "blender_process"
    if args.command == "validate":
        return "validate"
    if args.command == "export":
        return "unreal_import" if spec.get("output", {}).get("adapter") == "unreal" else None
    if args.command == "unreal":
        return "unreal_import"
    if args.command == "blender":
        return {"generate": "generate", "process": "blender_process", "validate": "validate"}[args.operation]
    return None


def _init(directory: Path) -> int:
    selected = directory.expanduser().resolve()
    selected.mkdir(parents=True, exist_ok=True)
    root = Path(__file__).resolve().parents[2]
    installed = Path(sys.prefix) / "share" / "agentic-graphics"
    source_root = root if (root / "agentic-graphics.example.toml").is_file() else installed
    targets = (
        (source_root / "agentic-graphics.example.toml", selected / "agentic-graphics.toml"),
        (source_root / "examples" / "crate.yaml", selected / "crate.yaml"),
    )
    created = []
    for source, target in targets:
        if target.exists():
            raise FileExistsError(f"Refusing to overwrite existing file: {target}")
        shutil.copy2(source, target)
        created.append(str(target))
    print(json.dumps({"status": "PASS", "created": created}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
