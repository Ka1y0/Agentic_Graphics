"""Bounded Unreal Editor Python job for importing one validated mesh.

The Agentic Graphics adapter passes only the job and report locations through
environment variables. This script never runs arbitrary Python from the job.
"""

import json
import os
import traceback

import unreal


def main():
    job_path = os.environ.get("AGFX_UNREAL_JOB")
    report_path = os.environ.get("AGFX_UNREAL_REPORT")
    if not job_path or not report_path:
        raise RuntimeError("AGFX_UNREAL_JOB and AGFX_UNREAL_REPORT are required")
    errors = []
    warnings = []
    checks = []
    imported = []
    engine_version = "UNKNOWN"
    try:
        engine_version = str(unreal.SystemLibrary.get_engine_version())
        with open(job_path, "r", encoding="utf-8") as handle:
            job = json.load(handle)
        source = job["source"]
        destination = job["destination"]
        if not destination.startswith("/Game/") or ".." in destination or "\\" in destination:
            raise ValueError("invalid /Game destination")
        task = unreal.AssetImportTask()
        task.set_editor_property("filename", source)
        task.set_editor_property("destination_path", destination)
        task.set_editor_property("automated", True)
        task.set_editor_property("save", True)
        task.set_editor_property("replace_existing", bool(job.get("replace_existing", False)))
        task.set_editor_property("replace_existing_settings", False)
        unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
        imported = [str(path) for path in task.get_editor_property("imported_object_paths")]
        checks.append({"name": "objects_imported", "status": "PASS" if imported else "FAIL", "actual": len(imported)})
        for asset_path in imported:
            if not asset_path.startswith(destination):
                errors.append("import escaped declared destination: " + asset_path)
            if not unreal.EditorAssetLibrary.does_asset_exist(asset_path):
                errors.append("reported asset does not exist: " + asset_path)
            else:
                unreal.EditorAssetLibrary.save_asset(asset_path, only_if_is_dirty=False)
        if not imported:
            errors.append("Unreal import task returned no object paths")
    except Exception as exc:
        errors.append(f"{type(exc).__name__}: {exc}")
        warnings.append(traceback.format_exc())
    payload = {
        "schema_version": "1",
        "status": "PASS" if not errors else "FAIL",
        "engine": "unreal",
        "engine_version": engine_version,
        "imported_asset_paths": imported,
        "checks": checks,
        "warnings": warnings,
        "errors": errors,
    }
    with open(report_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")
    if errors:
        raise RuntimeError("Agentic Graphics import failed; see JSON report")


if __name__ == "__main__":
    main()
