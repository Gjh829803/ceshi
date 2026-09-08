# Repository scripts

Current Three production entry points:

| Directory | Responsibility |
| --- | --- |
| `three-creator/` | Authoring tools, browser compilation, real self-check and delivery |
| `cloud/three-eval*` | Creator cloud launch, admission, runtime identity and recovery |
| `three-episode/` | Source admission, route planning, capture, styles and pre-Seedance requests |
| `cloud/three-episode*` | Three Episode scheduling and infrastructure |
| `production/` | Explicit campaign operations; existing runs retain their own identities |
| `testing/` | Test census and repository boundaries |
| `lib/` | Shared helpers; check direct consumers before removal |

Use the commands in the [branch guide](../docs/three-sdk-data-production.md),
[Creator README](three-creator/README.md) and [Episode README](three-episode/README.md).
Root package.json exposes the retained Three and verification commands. `pnpm build`
prebuilds the Three runtime; `pnpm test` checks workspace retirement boundaries,
complete Vitest census and both resource lanes. `pnpm test:independent` covers all
remaining Node suites and their Python wrappers, including shared production tests.

Engine-neutral shared code lives in `lib/`: canonical hashing, GPU batch execution,
Vertex event generation, LWDP access, style contracts, encoding and test utilities.
The old Agent/CLI/scene/publication workflows were retired. Do not add executable
or test files directly under `scripts/`.
