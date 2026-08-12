import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from agentic_graphics.config import load_config
from agentic_graphics.doctor import diagnose, format_diagnosis
from agentic_graphics.tool_discovery import ToolInfo, _version_key, discover_tool, known_locations


class ToolDiscoveryTests(unittest.TestCase):
    def test_explicit_config_has_priority(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "blender"
            path.write_text("", encoding="utf-8")
            config = load_config(cwd=Path(temp))
            config["tools"]["blender"] = str(path)
            result = discover_tool("blender", config)
            self.assertEqual(result.source, "config")
            self.assertEqual(result.path, path.resolve())

    def test_env_has_priority_over_known_and_path(self):
        with tempfile.TemporaryDirectory() as temp, mock.patch.dict(os.environ, {}, clear=False):
            path = Path(temp) / "blender"
            path.write_text("", encoding="utf-8")
            os.environ["AGFX_BLENDER"] = str(path)
            result = discover_tool("blender", load_config(cwd=Path(temp)))
            self.assertEqual(result.source, "env:AGFX_BLENDER")

    def test_modly_absence_is_optional(self):
        info = ToolInfo("modly", None, "not-found", required=False)
        self.assertEqual(info.status, "OPTIONAL")

    def test_required_absence_fails(self):
        info = ToolInfo("blender", None, "not-found", required=True)
        self.assertEqual(info.status, "FAIL")

    def test_available_passes(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "tool"
            path.write_text("", encoding="utf-8")
            self.assertEqual(ToolInfo("tool", path, "fixture").status, "PASS")

    def test_windows_known_paths_are_path_objects(self):
        with mock.patch.dict(os.environ, {"ProgramFiles": r"C:\Program Files", "LOCALAPPDATA": r"C:\Users\x\AppData\Local"}, clear=False):
            self.assertTrue(all(isinstance(path, Path) for path in known_locations("modly", "Windows")))

    def test_linux_blender_known_path(self):
        self.assertIn(Path("/usr/bin/blender"), list(known_locations("blender", "Linux")))

    def test_doctor_redacts_environment_values(self):
        with tempfile.TemporaryDirectory() as temp, mock.patch.dict(os.environ, {"AGFX_OPENAI_API_KEY": "super-secret"}, clear=False):
            report = diagnose(load_config(cwd=Path(temp)), include_versions=False)
            serialized = str(report)
            self.assertNotIn("super-secret", serialized)
            self.assertTrue(report["environment"]["AGFX_OPENAI_API_KEY"])

    def test_doctor_format_labels_optional(self):
        report = {"tools": [{"name": "modly", "status": "OPTIONAL", "version": "UNKNOWN"}]}
        self.assertIn("Modly", format_diagnosis(report))
        self.assertIn("OPTIONAL", format_diagnosis(report))

    def test_unreal_versions_sort_numerically(self):
        values = ["/UE_5.9/UnrealEditor-Cmd", "/UE_5.10/UnrealEditor-Cmd"]
        self.assertEqual(sorted(values, key=_version_key, reverse=True)[0], values[1])


if __name__ == "__main__":
    unittest.main()
