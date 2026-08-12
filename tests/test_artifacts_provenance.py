import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from agentic_graphics.artifacts import Artifact, RunContext, build_manifest, make_run_id, sha256_file
from agentic_graphics.config import load_config
from agentic_graphics.provenance import UNKNOWN, build_provenance, known, write_provenance

from helpers import base_spec


class ArtifactProvenanceTests(unittest.TestCase):
    def test_sha256_known_value(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "x"
            path.write_bytes(b"abc")
            self.assertEqual(sha256_file(path), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")

    def test_run_id_is_stable_for_time(self):
        value = make_run_id("fixture", datetime(2026, 1, 1, tzinfo=timezone.utc))
        self.assertTrue(value.startswith("20260101T000000Z-fixture-"))

    def test_manifest_contains_hash_and_size(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = root / "asset.glb"
            path.write_bytes(b"data")
            manifest = build_manifest([path], root)
            self.assertEqual(manifest["artifacts"][0]["size_bytes"], 4)
            self.assertEqual(len(manifest["artifacts"][0]["sha256"]), 64)

    def test_artifact_external_path_remains_absolute(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            path = Path(a) / "x"
            path.write_text("x", encoding="utf-8")
            self.assertTrue(Path(Artifact(path, "x").record(Path(b))["path"]).is_absolute())

    def test_unknown_never_guessed(self):
        self.assertEqual(known(None), UNKNOWN)
        self.assertEqual(known(""), UNKNOWN)
        self.assertEqual(known("model"), "model")

    def test_provenance_hashes_actual_files(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "in.glb"
            output = Path(temp) / "out.glb"
            source.write_bytes(b"in")
            output.write_bytes(b"out")
            record = build_provenance("run", base_spec(), source, output)
            self.assertEqual(record["input_sha256"], sha256_file(source))
            self.assertEqual(record["output_sha256"], sha256_file(output))
            self.assertEqual(record["model"], UNKNOWN)

    def test_upstream_generator_is_preserved(self):
        spec = base_spec()
        spec["generation"]["upstream_generator"] = "modly"
        self.assertEqual(build_provenance("run", spec)["generator"], "modly")

    def test_write_provenance(self):
        with tempfile.TemporaryDirectory() as temp:
            path = write_provenance(Path(temp) / "provenance.json", {"run_id": "x"})
            self.assertEqual(json.loads(path.read_text())["run_id"], "x")

    def test_run_context_layout_and_manifest(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            config = load_config(cwd=root)
            context = RunContext.create(base_spec(), config, run_id="fixture-run")
            self.assertTrue((context.root / "generated").is_dir())
            manifest_path = context.write_manifest("PASS")
            self.assertEqual(json.loads(manifest_path.read_text())["status"], "PASS")

    def test_context_refuses_missing_artifact(self):
        with tempfile.TemporaryDirectory() as temp:
            config = load_config(cwd=Path(temp))
            context = RunContext.create(base_spec(), config, run_id="missing-artifact")
            with self.assertRaises(FileNotFoundError):
                context.add_artifact(Artifact(context.root / "missing", "missing"))

    def test_run_id_traversal_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):
                RunContext.create(base_spec(), load_config(cwd=Path(temp)), run_id="../escape")


if __name__ == "__main__":
    unittest.main()
