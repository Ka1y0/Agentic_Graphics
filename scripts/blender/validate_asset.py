"""Non-destructive-in-source Blender mesh inspection and validation."""

import argparse
import json
import sys
from pathlib import Path

import bmesh
import bpy


def parse_args():
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--report", required=True)
    return parser.parse_args(values)


def import_asset(path):
    suffix = path.suffix.lower()
    if suffix in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif suffix == ".obj":
        (bpy.ops.wm.obj_import if hasattr(bpy.ops.wm, "obj_import") else bpy.ops.import_scene.obj)(filepath=str(path))
    elif suffix == ".stl":
        (bpy.ops.wm.stl_import if hasattr(bpy.ops.wm, "stl_import") else bpy.ops.import_mesh.stl)(filepath=str(path))
    elif suffix == ".ply":
        (bpy.ops.wm.ply_import if hasattr(bpy.ops.wm, "ply_import") else bpy.ops.import_mesh.ply)(filepath=str(path))
    else:
        raise ValueError("unsupported mesh format: " + suffix)


def main():
    args = parse_args()
    spec = json.loads(Path(args.spec).read_text(encoding="utf-8"))
    source = Path(args.input).resolve()
    report = Path(args.report).resolve()
    report.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    checks = []
    errors = []
    warnings = []
    metrics = {"mesh_objects": 0, "vertices": 0, "triangles": 0, "materials": [], "textures": [], "non_manifold_edges": 0, "zero_area_faces": 0}
    try:
        import_asset(source)
        meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
        metrics["mesh_objects"] = len(meshes)
        materials = set()
        textures = set()
        for obj in meshes:
            obj.data.calc_loop_triangles()
            metrics["vertices"] += len(obj.data.vertices)
            metrics["triangles"] += len(obj.data.loop_triangles)
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            metrics["non_manifold_edges"] += sum(1 for edge in bm.edges if not edge.is_manifold)
            metrics["zero_area_faces"] += sum(1 for face in bm.faces if face.calc_area() <= 1e-12)
            bm.free()
            for slot in obj.material_slots:
                if slot.material:
                    materials.add(slot.material.name)
                    if slot.material.use_nodes:
                        for node in slot.material.node_tree.nodes:
                            if node.type == "TEX_IMAGE" and node.image:
                                textures.add(node.image.filepath or node.image.name)
        metrics["materials"] = sorted(materials)
        metrics["textures"] = sorted(textures)
        checks.append({"name": "mesh_present", "status": "PASS" if meshes else "FAIL", "actual": len(meshes)})
        checks.append({"name": "triangles_present", "status": "PASS" if metrics["triangles"] > 0 else "FAIL", "actual": metrics["triangles"]})
        target = spec.get("geometry", {}).get("target_triangles")
        if target:
            budget_status = "PASS" if metrics["triangles"] <= int(target) else "FAIL"
            checks.append({"name": "triangle_budget", "status": budget_status, "actual": metrics["triangles"], "maximum": int(target)})
        checks.append({"name": "zero_area_faces", "status": "PASS" if metrics["zero_area_faces"] == 0 else "FAIL", "actual": metrics["zero_area_faces"]})
        if metrics["non_manifold_edges"]:
            warnings.append(f"{metrics['non_manifold_edges']} non-manifold/boundary edges detected")
        errors.extend(check["name"] for check in checks if check["status"] == "FAIL")
    except Exception as exc:
        errors.append(f"{type(exc).__name__}: {exc}")
    status = "PASS" if not errors else "FAIL"
    payload = {
        "schema_version": "1",
        "status": status,
        "blender_version": bpy.app.version_string,
        "input": str(source),
        "metrics": metrics,
        "checks": checks,
        "warnings": warnings,
        "errors": errors,
    }
    report.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if status != "PASS":
        raise RuntimeError("validation failed; see JSON report")


if __name__ == "__main__":
    main()
