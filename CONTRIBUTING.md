# Contributing

Thank you for helping build open agent-driven graphics infrastructure.

1. Open an issue describing the real external interface or workflow gap.
2. Keep adapters provider-neutral and scoped to one tool responsibility.
3. Add dry-run behavior, structured error reporting, provenance, and unit tests.
4. Use primitives or clearly licensed fixtures only. Do not add production assets, marketplace files, model weights, DCC/engine binaries, or generated media with unclear rights.
5. Run `python -m unittest discover -s tests -v` and `agfx run examples/crate.yaml --dry-run`.
6. Document limits as limits; never label a mocked or unavailable heavy-tool path as a real integration PASS.

By contributing, you agree that your contribution is licensed under the repository's MIT License and that you have the right to submit it.
