import json
import sys
import tempfile
import unittest
from pathlib import Path

from agentic_graphics.adapters.base import AdapterError
from agentic_graphics.adapters.command import CommandLLMAdapter
from agentic_graphics.artifacts import RunContext
from agentic_graphics.config import load_config
from agentic_graphics.security import validate_generated_python

from helpers import base_spec


class CommandSecurityTests(unittest.TestCase):
    def test_command_string_is_tokenized(self):
        self.assertEqual(CommandLLMAdapter.normalize_command('agent --mode "safe value"'), ["agent", "--mode", "safe value"])

    def test_command_array_preserved(self):
        self.assertEqual(CommandLLMAdapter.normalize_command(["agent", "--safe"]), ["agent", "--safe"])

    def test_empty_command_rejected(self):
        with self.assertRaises(AdapterError):
            CommandLLMAdapter.normalize_command([])

    def test_command_appends_input_and_output(self):
        command = CommandLLMAdapter.build_command(["agent"], Path("in.json"), Path("out.json"), 7)
        self.assertEqual(list(command.argv), ["agent", "in.json", "out.json"])
        self.assertEqual(command.timeout_seconds, 7)

    def test_safe_blender_script(self):
        result = validate_generated_python("import bpy\nbpy.ops.mesh.primitive_cube_add()\n")
        self.assertTrue(result.safe)

    def test_subprocess_import_rejected(self):
        result = validate_generated_python("import subprocess\nsubprocess.run(['x'])\n")
        self.assertFalse(result.safe)
        self.assertIn("import not allowed: subprocess", result.violations)

    def test_dynamic_exec_rejected(self):
        self.assertFalse(validate_generated_python("exec('print(1)')").safe)

    def test_open_rejected(self):
        self.assertFalse(validate_generated_python("open('/tmp/x', 'w')").safe)

    def test_destructive_path_call_rejected(self):
        source = "from pathlib import Path\nPath('/tmp/x').unlink()\n"
        self.assertFalse(validate_generated_python(source).safe)

    def test_syntax_error_rejected(self):
        self.assertFalse(validate_generated_python("if").safe)

    def test_command_output_becomes_resolved_spec(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            script = root / "agent.py"
            script.write_text(
                "import json,sys\n"
                "value=json.load(open(sys.argv[1]))\n"
                "value['intent']['description']='Resolved by command adapter'\n"
                "json.dump(value,open(sys.argv[2],'w'))\n",
                encoding="utf-8",
            )
            spec = base_spec()
            spec["agent"] = {"adapter": "command", "command": [sys.executable, str(script)]}
            context = RunContext.create(spec, load_config(cwd=root), run_id="command-output")
            result = CommandLLMAdapter().execute(context)
            self.assertEqual(result.status, "PASS")
            self.assertEqual(context.spec["intent"]["description"], "Resolved by command adapter")
            self.assertEqual(json.loads((context.root / "resolved-spec.json").read_text())["intent"]["description"], "Resolved by command adapter")


if __name__ == "__main__":
    unittest.main()
