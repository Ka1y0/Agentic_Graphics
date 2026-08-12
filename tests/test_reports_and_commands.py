import json
import os
import tempfile
import unittest
from pathlib import Path

from agentic_graphics.adapters.base import AdapterError
from agentic_graphics.adapters.blender import parse_blender_report
from agentic_graphics.adapters.openai_compatible import OpenAICompatibleLLMAdapter
from agentic_graphics.adapters.unreal import build_unreal_command, parse_unreal_report, validate_game_path


class ReportsAndCommandsTests(unittest.TestCase):
    def test_parse_blender_report(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "report.json"
            path.write_text(json.dumps({"status": "PASS", "metrics": {"triangles": 12}}), encoding="utf-8")
            self.assertEqual(parse_blender_report(path)["metrics"]["triangles"], 12)

    def test_blender_report_requires_status(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "report.json"
            path.write_text("{}", encoding="utf-8")
            with self.assertRaises(AdapterError):
                parse_blender_report(path)

    def test_invalid_blender_json_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "report.json"
            path.write_text("not json", encoding="utf-8")
            with self.assertRaises(AdapterError):
                parse_blender_report(path)

    def test_game_path_validation(self):
        self.assertEqual(validate_game_path("/Game/Generated/Crate"), "/Game/Generated/Crate")

    def test_game_path_traversal_rejected(self):
        with self.assertRaises(AdapterError):
            validate_game_path("/Game/../Secret")

    def test_windows_separator_rejected(self):
        with self.assertRaises(AdapterError):
            validate_game_path(r"/Game/Generated\Crate")

    def test_unreal_command_has_no_shell_and_uses_env(self):
        command = build_unreal_command(Path("UnrealEditor-Cmd"), Path("Fixture.uproject"), Path("import.py"), Path("job.json"), Path("report.json"), 42)
        self.assertIn("-unattended", command.argv)
        self.assertIn("-NullRHI", command.argv)
        self.assertEqual(command.timeout_seconds, 42)
        self.assertEqual(command.env["AGFX_UNREAL_JOB"], "job.json")

    def test_parse_unreal_report(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "report.json"
            path.write_text(json.dumps({"status": "PASS", "imported_asset_paths": ["/Game/X"]}), encoding="utf-8")
            self.assertEqual(parse_unreal_report(path)["status"], "PASS")

    def test_unknown_unreal_status_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "report.json"
            path.write_text(json.dumps({"status": "READY"}), encoding="utf-8")
            with self.assertRaises(AdapterError):
                parse_unreal_report(path)

    def test_openai_compatible_payload_is_provider_neutral(self):
        payload = OpenAICompatibleLLMAdapter.build_payload("fixture-model", {"description": "crate"})
        self.assertEqual(payload["model"], "fixture-model")
        self.assertEqual(payload["response_format"]["type"], "json_object")
        self.assertNotIn("api_key", payload)


if __name__ == "__main__":
    unittest.main()
