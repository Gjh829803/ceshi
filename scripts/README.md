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
| `lib/`, `assets/`, `fixtures/` | Shared helpers and assets; check direct consumers before removal |

Use the commands in the [branch guide](../docs/three-sdk-data-production.md),
[Creator README](three-creator/README.md) and [Episode README](three-episode/README.md).
Root package.json still contains earlier workflow aliases because code cleanup is
separate. An alias being present is not evidence that it belongs to the Three lane.

The earlier `agents/`, `cli/`, `scenes/`, `visual/` and capability-verification
workflows remain for their existing consumers. New Three scene work follows the
current Creator contract. Do not add executable or test files directly under `scripts/`.
