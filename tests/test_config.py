import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from agentic_graphics.config import ConfigError, env_value, load_config


class ConfigTests(unittest.TestCase):
    def test_defaults(self):
        with tempfile.TemporaryDirectory() as temp:
            config = load_config(cwd=Path(temp))
            self.assertEqual(config["tools"]["blender"], "auto")
            self.assertEqual(config["defaults"]["workspace"], str((Path(temp) / "runs").resolve()))

    def test_relative_workspace_is_config_relative(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = root / "settings" / "agentic-graphics.toml"
            path.parent.mkdir()
            path.write_text('[defaults]\nworkspace = "artifacts"\n', encoding="utf-8")
            config = load_config(path)
            self.assertEqual(config["defaults"]["workspace"], str((path.parent / "artifacts").resolve()))

    def test_nested_merge_preserves_other_defaults(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "config.toml"
            path.write_text('[defaults]\ncommand_timeout_seconds = 5\n', encoding="utf-8")
            config = load_config(path)
            self.assertEqual(config["defaults"]["command_timeout_seconds"], 5)
            self.assertEqual(config["defaults"]["generated_code_timeout_seconds"], 300)

    def test_missing_config_rejected(self):
        with self.assertRaises(ConfigError):
            load_config(Path("/definitely/missing/agfx.toml"))

    def test_nonpositive_timeout_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "config.toml"
            path.write_text('[defaults]\ncommand_timeout_seconds = 0\n', encoding="utf-8")
            with self.assertRaises(ConfigError):
                load_config(path)

    def test_boolean_timeout_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "config.toml"
            path.write_text('[defaults]\ncommand_timeout_seconds = true\n', encoding="utf-8")
            with self.assertRaises(ConfigError):
                load_config(path)

    def test_provider_env_is_indirect(self):
        with tempfile.TemporaryDirectory() as temp, mock.patch.dict(os.environ, {"AGFX_OPENAI_MODEL": "fixture-model"}, clear=False):
            config = load_config(cwd=Path(temp))
            self.assertEqual(env_value(config, "openai_compatible", "model_env"), "fixture-model")

    def test_relative_tool_path_is_config_relative(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = root / "settings.toml"
            path.write_text('[tools]\nblender = "tools/blender"\n', encoding="utf-8")
            self.assertEqual(load_config(path)["tools"]["blender"], str((root / "tools" / "blender").resolve()))


if __name__ == "__main__":
    unittest.main()
