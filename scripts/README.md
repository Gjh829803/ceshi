# Repository development scripts

- `testing/` and `lib/`: workspace boundaries, test census and shared test orchestration.
- `integration/`: cross-package Creator/Episode regression and runtime baselines.
- `assets/`: content production and registration that connects the content library and Creator catalog.

Production implementations live in [workspace packages and applications](../docs/workspace-packages.md).
Root package commands retain their existing behavior and root-relative paths.
See [production operations](../docs/three-sdk-data-production.md) for execution.
Do not add standalone executable or test files directly under `scripts/`.
