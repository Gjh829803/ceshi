# Repository scripts

Stable developer commands are exposed by the root `package.json`. Implementations are
grouped by responsibility:

- `agents/`: Planner, Builder, Codex backend, and hosted workflow orchestration.
- `assets/`: subject-source and runtime-asset preparation.
- `cli/`: the `worldkit` CLI and process protocol adapters.
- `examples/`: checked-in example generation.
- `scenes/`: catalog plan and hosted-scene finalization.
- `testing/`: repository-wide test census, isolation, and layout gates.
- `verification/`: capability verifiers and benchmarks.
- `visual/`: visual prompt, image, video, and composition tooling.
- `lib/`: shared trusted-host implementation modules.
- `fixtures/`: script-owned development fixtures.

Do not add executable or test files directly under `scripts/`.
