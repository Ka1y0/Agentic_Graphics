import tempfile
import unittest
from pathlib import Path
from unittest import mock

import yaml

from agentic_graphics.cli import main

from helpers import base_spec


class CliTests(unittest.TestCase):
    def test_version(self):
        with self.assertRaises(SystemExit) as raised:
            main(["--version"])
        self.assertEqual(raised.exception.code, 0)

    def test_plan_valid_spec(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = root / "spec.yaml"
            path.write_text(yaml.safe_dump(base_spec()), encoding="utf-8")
            self.assertEqual(main(["plan", str(path)]), 0)

    def test_dry_run_missing_input_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = root / "spec.yaml"
            path.write_text(yaml.safe_dump(base_spec()), encoding="utf-8")
            self.assertEqual(main(["run", str(path), "--dry-run"]), 1)

    def test_init_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.assertEqual(main(["init", str(root)]), 0)
            self.assertEqual(main(["init", str(root)]), 2)


if __name__ == "__main__":
    unittest.main()
