"""Composable workflow graph resolution and bounded stage execution."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

from .adapters.base import Adapter, AdapterError, AdapterResult
from .adapters.blender import BlenderProceduralAdapter, BlenderProcessingAdapter, BlenderValidationAdapter
from .adapters.command import CommandLLMAdapter
from .adapters.manual import ManualFileAdapter, ManualLLMAdapter
from .adapters.modly import ModlyAdapter
from .adapters.openai_compatible import OpenAICompatibleLLMAdapter
from .adapters.unreal import UnrealAdapter
from .artifacts import Artifact, RunContext
from .provenance import build_provenance, write_provenance
from .spec import validate_spec


class WorkflowError(ValueError):
    """Raised for an invalid graph, unknown adapter, or failed stage."""


@dataclass(frozen=True)
class WorkflowNode:
    id: str
    stage: str
    depends_on: Tuple[str, ...] = ()


@dataclass
class WorkflowPlan:
    nodes: List[WorkflowNode]
    order: List[str]
    checks: List[Dict[str, Any]] = field(default_factory=list)

    def node(self, node_id: str) -> WorkflowNode:
        return next(node for node in self.nodes if node.id == node_id)

    def as_dict(self) -> Dict[str, Any]:
        return {
            "nodes": [{"id": node.id, "stage": node.stage, "depends_on": list(node.depends_on)} for node in self.nodes],
            "order": list(self.order),
            "checks": self.checks,
        }


class WorkflowResolver:
    """Resolve string or object stages into a validated directed acyclic graph."""

    def resolve(self, spec: Mapping[str, Any]) -> WorkflowPlan:
        nodes: List[WorkflowNode] = []
        previous: Optional[str] = None
        for entry in spec.get("workflow", []):
            if isinstance(entry, str):
                node = WorkflowNode(entry, entry, (previous,) if previous else ())
            else:
                node_id = entry.get("id", entry["stage"])
                explicit = entry.get("depends_on")
                dependencies = tuple(explicit) if explicit is not None else ((previous,) if previous else ())
                node = WorkflowNode(node_id, entry["stage"], dependencies)
            nodes.append(node)
            previous = node.id
        return WorkflowPlan(nodes, self._topological_order(nodes))

    @staticmethod
    def _topological_order(nodes: Sequence[WorkflowNode]) -> List[str]:
        by_id = {node.id: node for node in nodes}
        if len(by_id) != len(nodes):
            raise WorkflowError("Workflow node ids must be unique")
        for node in nodes:
            unknown = set(node.depends_on) - set(by_id)
            if unknown:
                raise WorkflowError(f"Workflow node {node.id} has unknown dependencies: {sorted(unknown)}")
        pending = {node.id: set(node.depends_on) for node in nodes}
        order: List[str] = []
        while pending:
            ready = [node.id for node in nodes if node.id in pending and not pending[node.id]]
            if not ready:
                raise WorkflowError("Workflow graph contains a dependency cycle")
            for node_id in ready:
                order.append(node_id)
                pending.pop(node_id)
                for dependencies in pending.values():
                    dependencies.discard(node_id)
        return order


class AdapterRegistry:
    """Typed adapter registry; future tools can be registered without core branching."""

    def __init__(self) -> None:
        self._adapters: Dict[Tuple[str, str], Adapter] = {}
        for adapter in (
            ManualLLMAdapter(),
            CommandLLMAdapter(),
            OpenAICompatibleLLMAdapter(),
            ManualFileAdapter(),
            ModlyAdapter(),
            BlenderProceduralAdapter(),
            BlenderProcessingAdapter(),
            BlenderValidationAdapter(),
            UnrealAdapter(),
        ):
            self.register(adapter)

    def register(self, adapter: Adapter) -> None:
        self._adapters[(adapter.kind, adapter.name)] = adapter

    def get(self, kind: str, name: str) -> Adapter:
        try:
            return self._adapters[(kind, name)]
        except KeyError as exc:
            raise WorkflowError(f"No implemented {kind} adapter named {name!r}") from exc

    def names(self, kind: Optional[str] = None) -> List[str]:
        return sorted(name for (adapter_kind, name) in self._adapters if kind is None or kind == adapter_kind)


class WorkflowExecutor:
    def __init__(self, registry: Optional[AdapterRegistry] = None, resolver: Optional[WorkflowResolver] = None) -> None:
        self.registry = registry or AdapterRegistry()
        self.resolver = resolver or WorkflowResolver()

    def dry_run(self, spec: Mapping[str, Any], config: Mapping[str, Any], through_stage: Optional[str] = None) -> Dict[str, Any]:
        validate_spec(spec)
        plan = self.resolver.resolve(spec)
        selected = self._selected_nodes(plan, through_stage)
        checks = []
        for node in selected:
            adapter = self._adapter_for_stage(node.stage, spec)
            result = adapter.dry_run(spec, config)
            checks.append({
                "node": node.id,
                "stage": node.stage,
                "adapter": f"{adapter.kind}:{adapter.name}",
                "status": result.status,
                "details": result.details,
            })
        status = "PASS" if all(check["status"] in {"PASS", "READY"} for check in checks) else "FAIL"
        return {
            "status": status,
            "dry_run": True,
            "paid_services_called": False,
            "blender_executed": False,
            "unreal_modified": False,
            "plan": {**plan.as_dict(), "order": [node.id for node in selected]},
            "checks": checks,
        }

    def execute(
        self,
        spec: Mapping[str, Any],
        config: Mapping[str, Any],
        request_path: Optional[Path] = None,
        through_stage: Optional[str] = None,
        run_id: Optional[str] = None,
        approve_generated_code: bool = False,
    ) -> RunContext:
        validate_spec(spec)
        plan = self.resolver.resolve(spec)
        selected = self._selected_nodes(plan, through_stage)
        context = RunContext.create(spec, config, request_path=request_path, run_id=run_id)
        final_status = "PASS"
        try:
            for node in selected:
                adapter = self._adapter_for_stage(node.stage, context.spec)
                context.event("stage.started", {"node": node.id, "stage": node.stage, "adapter": f"{adapter.kind}:{adapter.name}"})
                result = adapter.execute(context, approve_generated_code=approve_generated_code)
                context.event("stage.completed", {"node": node.id, "stage": node.stage, "status": result.status})
                if result.status == "HANDOFF_REQUIRED":
                    final_status = "HANDOFF_REQUIRED"
                    break
                if not result.successful:
                    raise WorkflowError(f"Stage {node.id} failed with status {result.status}")
        except (AdapterError, WorkflowError, OSError) as exc:
            final_status = "FAIL"
            error_path = context.root / "reports" / "error-report.json"
            error_path.write_text(
                json.dumps({"schema_version": "1", "status": "FAIL", "error_type": type(exc).__name__, "message": str(exc)}, indent=2) + "\n",
                encoding="utf-8",
            )
            context.add_artifact(Artifact(error_path, "error_report", "application/json", "agentic-graphics"))
            context.event("run.failed", {"error_type": type(exc).__name__, "message": str(exc)})
            self._finalize(context, final_status)
            raise WorkflowError(f"Run {context.run_id} failed: {exc}") from exc
        self._finalize(context, final_status)
        return context

    def _finalize(self, context: RunContext, status: str) -> None:
        source_value = context.spec.get("generation", {}).get("source")
        source = Path(source_value) if source_value and Path(source_value).is_file() else None
        output = context.state.get("validated_mesh") or context.state.get("processed_mesh") or context.state.get("mesh_input")
        output_path = Path(output) if output and Path(output).is_file() else None
        provenance = build_provenance(
            context.run_id,
            context.spec,
            input_path=source,
            output_path=output_path,
            blender_version=context.state.get("blender_version"),
            engine_version=context.state.get("engine_version"),
        )
        provenance_path = write_provenance(context.root / "provenance.json", provenance)
        context.add_artifact(Artifact(provenance_path, "provenance", "application/json", "agentic-graphics"))
        context.event("run.completed", {"status": status})
        context.write_manifest(status)

    def _adapter_for_stage(self, stage: str, spec: Mapping[str, Any]) -> Adapter:
        if stage == "plan":
            return self.registry.get("llm", spec.get("agent", {}).get("adapter", "manual"))
        if stage == "generate":
            return self.registry.get("generator", spec["generation"]["adapter"])
        if stage == "blender_process":
            return self.registry.get("processing", "blender")
        if stage == "validate":
            return self.registry.get("processing", "blender_validation")
        if stage == "unreal_import":
            return self.registry.get("engine", "unreal")
        raise WorkflowError(f"Unknown workflow stage: {stage}")

    @staticmethod
    def _selected_nodes(plan: WorkflowPlan, through_stage: Optional[str]) -> List[WorkflowNode]:
        ordered = [plan.node(node_id) for node_id in plan.order]
        if not through_stage:
            return ordered
        for index, node in enumerate(ordered):
            if node.stage == through_stage or node.id == through_stage:
                return ordered[: index + 1]
        raise WorkflowError(f"Workflow does not contain stage: {through_stage}")
