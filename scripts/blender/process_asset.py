"""Import, optionally normalize/optimize, and export a mesh with a JSON report."""

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
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    return parser.parse_args(values)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def import_asset(path):
    suffix = path.suffix.lower()
    if suffix in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif suffix == ".obj":
        if hasattr(bpy.ops.wm, "obj_import"):
            bpy.ops.wm.obj_import(filepath=str(path))
        else:
            bpy.ops.import_scene.obj(filepath=str(path))
    elif suffix == ".stl":
        if hasattr(bpy.ops.wm, "stl_import"):
            bpy.ops.wm.stl_import(filepath=str(path))
        else:
            bpy.ops.import_mesh.stl(filepath=str(path))
    elif suffix == ".ply":
        if hasattr(bpy.ops.wm, "ply_import"):
            bpy.ops.wm.ply_import(filepath=str(path))
        else:
            bpy.ops.import_mesh.ply(filepath=str(path))
    else:
        raise ValueError("unsupported mesh format: " + suffix)


def metrics():
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    triangles = 0
    vertices = 0
    materials = set()
    textures = set()
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        vertices += len(obj.data.vertices)
        for slot in obj.material_slots:
            if slot.material:
                materials.add(slot.material.name)
                if slot.material.use_nodes:
                    for node in slot.material.node_tree.nodes:
                        if node.type == "TEX_IMAGE" and node.image:
                            textures.add(node.image.filepath or node.image.name)
    return {
        "mesh_objects": len(meshes),
        "vertices": vertices,
        "triangles": triangles,
        "materials": sorted(materials),
        "textures": sorted(textures),
    }


def main():
    args = parse_args()
    spec = json.loads(Path(args.spec).read_text(encoding="utf-8"))
    source = Path(args.input).resolve()
    output = Path(args.output).resolve()
    report = Path(args.report).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    report.parent.mkdir(parents=True, exist_ok=True)
    operations = spec.get("processing", {}).get("blender", {})
    applied = []
    warnings = []
    errors = []
    try:
        clear_scene()
        import_asset(source)
        before = metrics()
        meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
        if operations.get("apply_transforms", False):
            for obj in meshes:
                bpy.context.view_layer.objects.active = obj
                obj.select_set(True)
                bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
                obj.select_set(False)
            applied.append("apply_transforms")
        if operations.get("merge_by_distance", False):
            for obj in meshes:
                bpy.context.view_layer.objects.active = obj
                obj.select_set(True)
                bpy.ops.object.mode_set(mode="EDIT")
                bpy.ops.mesh.select_all(action="SELECT")
                bpy.ops.mesh.remove_doubles(threshold=0.00001)
                bpy.ops.object.mode_set(mode="OBJECT")
                obj.select_set(False)
            applied.append("merge_by_distance")
        if operations.get("remove_degenerate", False):
            for obj in meshes:
                bm = bmesh.new()
                bm.from_mesh(obj.data)
                bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=list(bm.edges))
                bm.to_mesh(obj.data)
                bm.free()
                obj.data.update()
            applied.append("remove_degenerate")
        ratio = operations.get("decimate_ratio")
        if ratio is not None and float(ratio) < 1.0:
            for obj in meshes:
                modifier = obj.modifiers.new(name="AGFX_SpecControlledDecimate", type="DECIMATE")
                modifier.ratio = float(ratio)
                bpy.context.view_layer.objects.active = obj
                bpy.ops.object.modifier_apply(modifier=modifier.name)
            applied.append("decimate")
        after = metrics()
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", use_selection=False, export_apply=True)
        status = "PASS" if after["mesh_objects"] > 0 and output.is_file() else "FAIL"
        if status == "FAIL":
            errors.append("No exportable mesh was produced")
    except Exception as exc:
        before = locals().get("before", {})
        after = locals().get("after", {})
        status = "FAIL"
        errors.append(f"{type(exc).__name__}: {exc}")
    payload = {
        "schema_version": "1",
        "status": status,
        "blender_version": bpy.app.version_string,
        "input": str(source),
        "output": str(output),
        "operations_requested": operations,
        "operations_applied": applied,
        "before": before,
        "after": after,
        "warnings": warnings,
        "errors": errors,
    }
    report.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if status != "PASS":
        raise RuntimeError("processing failed; see JSON report")


if __name__ == "__main__":
    main()
