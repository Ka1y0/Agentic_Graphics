"""Vetted procedural Blender generator used by BlenderProceduralAdapter.

This script intentionally accepts a small structured shape vocabulary. It does
not execute Python from the GraphicsSpec and never invokes a shell.
"""

import json
import math
import sys
from pathlib import Path

import bpy


def arguments():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    result = {}
    index = 0
    while index < len(raw):
        if raw[index].startswith("--") and index + 1 < len(raw):
            result[raw[index][2:]] = raw[index + 1]
            index += 2
        else:
            index += 1
    for required in ("spec", "output", "report"):
        if required not in result:
            raise ValueError("missing --" + required)
    return result


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.materials:
        bpy.data.materials.remove(block)


def material(name, color, roughness=0.7, metallic=0.0):
    value = bpy.data.materials.new(name=name)
    value.use_nodes = True
    node = value.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = (*color, 1.0)
    node.inputs["Roughness"].default_value = roughness
    node.inputs["Metallic"].default_value = metallic
    return value


def box(name, dimensions, location, value, bevel):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(value)
    if bevel > 0:
        modifier = obj.modifiers.new(name="SafeBevel", type="BEVEL")
        modifier.width = min(bevel, min(dimensions) * 0.25)
        modifier.segments = 3
    return obj


def generate_cube(scale, bevel, wood, dark):
    box("ProceduralCube", (scale, scale, scale), (0, 0, scale / 2), wood, bevel)


def generate_crate(scale, bevel, wood, dark):
    thickness = 0.09 * scale
    half = 0.5 * scale
    inset = half - thickness / 2
    box("CrateCore", (0.82 * scale, 0.82 * scale, 0.82 * scale), (0, 0, half), wood, bevel)
    for axis, location, dimensions in (
        ("Front", (0, -inset, half), (scale, thickness, scale)),
        ("Back", (0, inset, half), (scale, thickness, scale)),
        ("Left", (-inset, 0, half), (thickness, scale, scale)),
        ("Right", (inset, 0, half), (thickness, scale, scale)),
        ("Bottom", (0, 0, thickness / 2), (scale, scale, thickness)),
        ("Top", (0, 0, scale - thickness / 2), (scale, scale, thickness)),
    ):
        box("Crate" + axis, dimensions, location, wood, bevel)
    rail = 0.11 * scale
    for y in (-half - 0.002 * scale, half + 0.002 * scale):
        for z in (rail / 2, scale - rail / 2):
            box("CrateRail", (scale, rail, rail), (0, y, z), dark, bevel * 0.5)
    for x in (-half - 0.002 * scale, half + 0.002 * scale):
        for z in (rail / 2, scale - rail / 2):
            box("CrateRail", (rail, scale, rail), (x, 0, z), dark, bevel * 0.5)


def generate_chair(scale, bevel, wood, dark):
    seat_height = 0.55 * scale
    seat = (0.72 * scale, 0.72 * scale, 0.12 * scale)
    box("ChairSeat", seat, (0, 0, seat_height), wood, bevel)
    leg = (0.10 * scale, 0.10 * scale, 0.55 * scale)
    for x in (-0.28 * scale, 0.28 * scale):
        for y in (-0.28 * scale, 0.28 * scale):
            box("ChairLeg", leg, (x, y, 0.275 * scale), dark, bevel * 0.65)
    box("ChairBack", (0.72 * scale, 0.12 * scale, 0.72 * scale), (0, 0.30 * scale, 0.93 * scale), wood, bevel)
    box("ChairBackRail", (0.62 * scale, 0.16 * scale, 0.10 * scale), (0, 0.30 * scale, 1.25 * scale), dark, bevel)


def generate_stylized_prop(scale, bevel, wood, dark):
    box("PropBase", (0.9 * scale, 0.7 * scale, 0.2 * scale), (0, 0, 0.1 * scale), dark, bevel)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.34 * scale, location=(0, 0, 0.52 * scale))
    sphere = bpy.context.active_object
    sphere.name = "StylizedPropBody"
    sphere.data.materials.append(wood)


def mesh_metrics():
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    triangles = 0
    vertices = 0
    materials = set()
    minimum = [float("inf")] * 3
    maximum = [float("-inf")] * 3
    for obj in objects:
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        vertices += len(mesh.vertices)
        evaluated.to_mesh_clear()
        materials.update(slot.material.name for slot in obj.material_slots if slot.material)
        for corner in obj.bound_box:
            world = obj.matrix_world @ mathutils_vector(corner)
            for axis in range(3):
                minimum[axis] = min(minimum[axis], world[axis])
                maximum[axis] = max(maximum[axis], world[axis])
    dimensions = [maximum[i] - minimum[i] for i in range(3)] if objects else [0, 0, 0]
    return {
        "mesh_objects": len(objects),
        "vertices": vertices,
        "triangles": triangles,
        "materials": sorted(materials),
        "bounds": {"min": minimum if objects else [0, 0, 0], "max": maximum if objects else [0, 0, 0], "dimensions": dimensions},
    }


def mathutils_vector(values):
    from mathutils import Vector

    return Vector(values)


def main():
    args = arguments()
    spec = json.loads(Path(args["spec"]).read_text(encoding="utf-8"))
    output = Path(args["output"])
    report = Path(args["report"])
    output.parent.mkdir(parents=True, exist_ok=True)
    report.parent.mkdir(parents=True, exist_ok=True)
    clear_scene()
    generation = spec.get("generation", {})
    params = generation.get("parameters", {})
    shape = params.get("shape", "cube")
    scale = float(spec.get("geometry", {}).get("scale_meters", 1.0))
    bevel = max(0.0, float(params.get("bevel", 0.025))) * scale
    wood = material("AGFX_Wood", (0.48, 0.20, 0.07), 0.72)
    dark = material("AGFX_DarkWood", (0.18, 0.055, 0.018), 0.8)
    generators = {
        "cube": generate_cube,
        "crate": generate_crate,
        "chair": generate_chair,
        "stylized_prop": generate_stylized_prop,
    }
    if shape not in generators:
        raise ValueError("unsupported procedural shape: " + str(shape))
    generators[shape](scale, bevel, wood, dark)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", use_selection=False, export_apply=True)
    metrics = mesh_metrics()
    payload = {
        "schema_version": "1",
        "status": "PASS" if metrics["mesh_objects"] > 0 and output.is_file() else "FAIL",
        "blender_version": bpy.app.version_string,
        "generator": "agentic-graphics-vetted-procedural",
        "shape": shape,
        "output": str(output),
        "metrics": metrics,
        "warnings": [],
        "errors": [],
    }
    report.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
