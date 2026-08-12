import tempfile
import unittest
from pathlib import Path

from agentic_graphics.config import load_config
from agentic_graphics.workflow import AdapterRegistry, WorkflowError, WorkflowExecutor, WorkflowNode, WorkflowResolver

from helpers import base_spec


class WorkflowTests(unittest.TestCase):
    def test_string_stages_are_sequential(self):
        plan = WorkflowResolver().resolve(base_spec())
        self.assertEqual(plan.order, ["plan", "generate"])
        self.assertEqual(plan.node("generate").depends_on, ("plan",))

    def test_explicit_dag_topological_order(self):
        spec = base_spec()
        spec["workflow"] = [
            {"id": "root", "stage": "plan"},
            {"id": "generate", "stage": "generate", "depends_on": ["root"]},
            {"id": "validate", "stage": "validate", "depends_on": ["generate"]},
        ]
        self.assertEqual(WorkflowResolver().resolve(spec).order, ["root", "generate", "validate"])

    def test_cycle_rejected(self):
        nodes = [WorkflowNode("a", "plan", ("b",)), WorkflowNode("b", "generate", ("a",))]
        with self.assertRaisesRegex(WorkflowError, "cycle"):
            WorkflowResolver._topological_order(nodes)

    def test_unknown_dependency_rejected_by_resolver(self):
        nodes = [WorkflowNode("a", "plan", ("missing",))]
        with self.assertRaisesRegex(WorkflowError, "unknown"):
            WorkflowResolver._topological_order(nodes)

    def test_registry_lists_real_adapters(self):
        registry = AdapterRegistry()
        self.assertIn("manual", registry.names("llm"))
        self.assertIn("command", registry.names("llm"))
        self.assertIn("openai_compatible", registry.names("llm"))
        self.assertIn("blender_procedural", registry.names("generator"))
        self.assertIn("unreal", registry.names("engine"))

    def test_unknown_adapter_not_faked(self):
        with self.assertRaisesRegex(WorkflowError, "No implemented"):
            AdapterRegistry().get("engine", "godot")

    def test_manual_dry_run_passes_existing_input(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "fixture.glb"
            source.write_bytes(b"glTF")
            spec = base_spec()
            spec["generation"]["source"] = str(source)
            report = WorkflowExecutor().dry_run(spec, load_config(cwd=root))
            self.assertEqual(report["status"], "PASS")
            self.assertFalse(report["blender_executed"])

    def test_manual_dry_run_fails_missing_input(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            spec = base_spec()
            spec["generation"]["source"] = str(root / "missing.glb")
            self.assertEqual(WorkflowExecutor().dry_run(spec, load_config(cwd=root))["status"], "FAIL")

    def test_through_stage_limits_plan(self):
        with tempfile.TemporaryDirectory() as temp:
            report = WorkflowExecutor().dry_run(base_spec(), load_config(cwd=Path(temp)), through_stage="plan")
            self.assertEqual(report["plan"]["order"], ["plan"])


if __name__ == "__main__":
    unittest.main()
