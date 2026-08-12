import json
import tempfile
import unittest
from pathlib import Path

import yaml

from agentic_graphics.spec import SpecError, load_spec, resolve_spec, validate_spec

from helpers import base_spec


class SpecTests(unittest.TestCase):
    def test_valid_spec(self):
        validate_spec(base_spec())

    def test_schema_version_is_pinned(self):
        spec = base_spec()
        spec["schema_version"] = "2"
        with self.assertRaises(SpecError):
            validate_spec(spec)

    def test_representation_types_are_admitted(self):
        for value in ("2d", "2.5d", "3d", "hybrid"):
            spec = base_spec()
            spec["representation"]["type"] = value
            validate_spec(spec)

    def test_unknown_representation_rejected(self):
        spec = base_spec()
        spec["representation"]["type"] = "4d"
        with self.assertRaises(SpecError):
            validate_spec(spec)

    def test_blender_generation_rejects_2d(self):
        spec = base_spec()
        spec["representation"]["type"] = "2d"
        spec["generation"]["adapter"] = "blender_procedural"
        with self.assertRaisesRegex(SpecError, "requires 3d or hybrid"):
            validate_spec(spec)

    def test_unreal_destination_must_be_game_path(self):
        spec = base_spec()
        spec["output"] = {"adapter": "unreal", "destination": "Content/Thing", "unreal_project": "x.uproject"}
        with self.assertRaisesRegex(SpecError, "/Game"):
            validate_spec(spec)

    def test_duplicate_workflow_id_rejected(self):
        spec = base_spec()
        spec["workflow"] = ["plan", {"id": "plan", "stage": "generate"}]
        with self.assertRaisesRegex(SpecError, "Duplicate"):
            validate_spec(spec)

    def test_unknown_dependency_rejected(self):
        spec = base_spec()
        spec["workflow"] = [{"id": "a", "stage": "plan", "depends_on": ["missing"]}]
        with self.assertRaisesRegex(SpecError, "unknown ids"):
            validate_spec(spec)

    def test_load_yaml_and_resolve_source(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "fixture.glb"
            source.write_bytes(b"glTF")
            path = root / "spec.yaml"
            path.write_text(yaml.safe_dump(base_spec()), encoding="utf-8")
            loaded = load_spec(path)
            self.assertEqual(loaded["generation"]["source"], str(source.resolve()))

    def test_load_json(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "spec.json"
            path.write_text(json.dumps(base_spec()), encoding="utf-8")
            self.assertEqual(load_spec(path)["project"]["name"], "fixture")

    def test_non_object_root_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "spec.yaml"
            path.write_text("- not\n- object\n", encoding="utf-8")
            with self.assertRaisesRegex(SpecError, "root"):
                load_spec(path)

    def test_additional_future_fields_allowed(self):
        spec = base_spec()
        spec["render_style"] = {"type": "toon", "outline": {"width": 2}}
        spec["future_media_contract"] = {"layers": 4}
        validate_spec(spec)

    def test_spec_controlled_blender_cleanup_fields(self):
        spec = base_spec()
        spec["processing"] = {"blender": {"remove_degenerate": True, "decimate_ratio": 0.5}}
        validate_spec(spec)

    def test_unreal_material_import_cannot_be_silently_disabled(self):
        spec = base_spec()
        spec["output"] = {"adapter": "unreal", "destination": "/Game/Fixture", "unreal_project": "fixture.uproject", "import_materials": False}
        with self.assertRaises(SpecError):
            validate_spec(spec)

    def test_unreal_stage_requires_unreal_output(self):
        spec = base_spec()
        spec["workflow"].append("unreal_import")
        with self.assertRaisesRegex(SpecError, "output.adapter=unreal"):
            validate_spec(spec)


if __name__ == "__main__":
    unittest.main()
