import json
import tempfile
import unittest
from pathlib import Path

from agentic_graphics.adapters.modly import ModlyAdapter, ModlyHandoffAdapter, _is_loopback, _model_parameters, _multipart
from agentic_graphics.artifacts import RunContext
from agentic_graphics.config import load_config

from helpers import base_spec


class ModlyTests(unittest.TestCase):
    def test_loopback_urls(self):
        self.assertTrue(_is_loopback("http://127.0.0.1:8765"))
        self.assertTrue(_is_loopback("http://localhost:8765"))
        self.assertFalse(_is_loopback("http://example.com"))

    def test_health_failure_is_false(self):
        ready, payload = ModlyAdapter("http://127.0.0.1:1").health(timeout=0.01)
        self.assertFalse(ready)
        self.assertIsNone(payload)

    def test_handoff_dry_run_ready_without_source(self):
        with tempfile.TemporaryDirectory() as temp:
            result = ModlyHandoffAdapter().dry_run(base_spec(), load_config(cwd=Path(temp)))
            self.assertEqual(result.status, "READY")

    def test_handoff_writes_request(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            spec = base_spec()
            spec["generation"] = {"adapter": "modly"}
            context = RunContext.create(spec, load_config(cwd=root), run_id="handoff")
            result = ModlyHandoffAdapter().execute(context)
            self.assertEqual(result.status, "HANDOFF_REQUIRED")
            request = context.root / "generated" / "modly-handoff" / "generation-request.json"
            self.assertEqual(json.loads(request.read_text())["state"], "WAITING_FOR_EXPORT")

    def test_handoff_intakes_supported_asset(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "mesh.glb"
            source.write_bytes(b"glTF")
            spec = base_spec()
            spec["generation"] = {"adapter": "modly", "source": str(source)}
            context = RunContext.create(spec, load_config(cwd=root), run_id="intake")
            result = ModlyHandoffAdapter().execute(context)
            self.assertEqual(result.status, "PASS")
            self.assertTrue(context.state["mesh_input"].is_file())

    def test_multipart_contains_fields_and_file(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "image.png"
            path.write_bytes(b"PNGDATA")
            body, content_type = _multipart(path, {"model_id": "fixture"})
            self.assertIn(b"PNGDATA", body)
            self.assertIn(b"fixture", body)
            self.assertTrue(content_type.startswith("multipart/form-data; boundary="))

    def test_remote_endpoint_rejected_in_dry_run(self):
        with tempfile.TemporaryDirectory() as temp:
            result = ModlyAdapter("http://example.com").dry_run(base_spec(), load_config(cwd=Path(temp)))
            self.assertEqual(result.status, "FAIL")

    def test_model_specific_parameters_are_forwarded(self):
        values = _model_parameters({"remesh": "none", "enable_texture": False, "num_inference_steps": 10, "octree_resolution": 256})
        self.assertEqual(values, {"num_inference_steps": 10, "octree_resolution": 256})


if __name__ == "__main__":
    unittest.main()
