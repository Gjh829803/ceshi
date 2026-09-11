# Workspace package responsibilities

The repository has a development workflow and a production workflow. Both use the
same SDK. Package boundaries follow executable responsibilities; there are no
`development` and `production` umbrella libraries.

| Workspace | Responsibility |
| --- | --- |
| `packages/three-world` / `@worldkit/three` | Public world SDK and its single Three/Rapier runtime |
| `packages/camera-collision` / `@worldkit/camera-collision` | Camera collision calculations |
| `packages/creator-host` / `@worldkit/creator-host` | Authoring tools, compilation, browser bridge, self-check and delivery; production Agent guides |
| `packages/episode-pipeline` / `@worldkit/episode-pipeline` | Source admission, action planning, recording, styles, video requests and recovery |
| `packages/preset-content` / `@worldkit/preset-content` | Reusable models, handling presets, calibration scenes and profiles |
| `packages/browser-capture` / `@worldkit/browser-capture` | Shared browser launch and video encoding |
| `packages/cloud-generation-client` / `@worldkit/cloud-generation-client` | Shared generation-service client and its request recovery |
| `apps/sdk-playground` / `@worldkit/sdk-playground` | Interactive SDK development and calibration |
| `apps/creator-cloud` / `@worldkit/creator-cloud` | Creator cloud admission, launch, recovery and evaluation publication commands |
| `apps/creator-evaluation-site` / `@worldkit/creator-evaluation-site` | Existing delivered-world evaluation and shared-review UI |

Cross-package code uses explicit package exports and direct dependencies. Episode
may consume Creator's source/build contracts; Creator production modules must not
import Episode. Cross-workflow smoke scripts belong to repository integration
checks. Shared test tooling stays in `scripts/testing`/`scripts/lib`; production
helpers move to their actual owner. Do not create a generic common package.

Root AGENTS.md contains common maintenance and ownership rules. Package AGENTS.md
files govern maintenance of their directory. Creator task policy stays under its
`agent/` directory and is explicitly loaded by the cloud runner and discovery
API. Root production documentation links all stages. Package moves update all
active loaders, schemas, examples, manifests, deployment source packaging and
checks. Historical run IDs, external service addresses, artifact kinds, asset IDs
and named public Three types keep their existing semantics.

The refactor does not change physics, gameplay, production quality requirements or
start any external production. Verification covers dependency boundaries, test
census, typecheck, lint, contract/resource tests, independent Node/Python suites,
Playground build, runtime prebuild and local capsule staging.
