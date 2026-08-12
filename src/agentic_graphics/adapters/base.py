"""Adapter contracts shared by generators, processors, renderers, and engines."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence

from ..artifacts import Artifact, RunContext


class AdapterError(RuntimeError):
    """Raised by a tool adapter when its bounded operation fails."""


@dataclass(frozen=True)
class CommandSpec:
    argv: Sequence[str]
    cwd: Optional[Path] = None
    env: Optional[Mapping[str, str]] = None
    timeout_seconds: int = 300

    def redacted(self) -> List[str]:
        return [str(item) for item in self.argv]


@dataclass
class ValidationResult:
    status: str
    checks: List[Dict[str, Any]] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return self.status == "PASS"


@dataclass
class AdapterResult:
    status: str
    artifacts: List[Artifact] = field(default_factory=list)
    details: Dict[str, Any] = field(default_factory=dict)
    validation: Optional[ValidationResult] = None

    @property
    def successful(self) -> bool:
        return self.status in {"PASS", "READY", "HANDOFF_REQUIRED"}


class Adapter(ABC):
    name = "base"
    kind = "adapter"

    @abstractmethod
    def dry_run(self, spec: Mapping[str, Any], config: Mapping[str, Any]) -> AdapterResult:
        """Check configuration and expected inputs without side effects."""

    @abstractmethod
    def execute(self, context: RunContext, **kwargs: Any) -> AdapterResult:
        """Execute the adapter inside a dedicated run context."""


class LLMAdapter(Adapter):
    kind = "llm"


class GeneratorAdapter(Adapter):
    kind = "generator"


class ProcessingAdapter(Adapter):
    kind = "processing"


class EngineAdapter(Adapter):
    kind = "engine"


class RendererAdapter(Adapter):
    kind = "renderer"
