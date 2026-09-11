# World SDK repository

Read [the architecture](docs/three-sdk-architecture.md), including its design
background and Harness feedback principles. Before changing a directory, read
all applicable nested `AGENTS.md` files along its path. Package instructions apply
to maintenance of that package; production Agent task instructions are loaded
explicitly by the corresponding Host.

## Workspace responsibilities

- [Three SDK](packages/three-world/README.md): one Three/Rapier runtime.
- [Creator Host](packages/creator-host/README.md): authoring tools and delivery.
- [Episode pipeline](packages/episode-pipeline/README.md): recording and data production.
- [SDK Playground](apps/sdk-playground/README.md): development and calibration.
- [Workspace guide](docs/workspace-packages.md): all packages and dependency boundaries.
- [Production workflow](docs/three-sdk-data-production.md): operational entry points.

Before adding or updating assets or capabilities for Agent use, read the
[integration maintenance rules](docs/asset-production-integration.md#接入维护约束)
and follow that document's cross-package integration workflow.

## Development

Start new work from the latest `origin/main`; `main` is the PR target. Preserve
user-owned changes and the identities in historical reviews and production runs.
Use public package exports and declare direct dependencies. Do not import sibling
package internals or create production dependency cycles. Root scripts coordinate
workspace checks and cross-package integration; production code belongs to its
own package. Keep tests with their owner unless they verify cross-package flows.

## Naming

Follow the [complete naming rules](docs/asset-production-integration.md#命名规范)
for all repository code, APIs, configuration, tools, documentation and production
artifacts. Do not mechanically rewrite historical identities or external service
contracts. Use `@worldkit/` for new workspace packages; the established SDK remains
`@worldkit/three` in `packages/three-world`.

## Architecture and verification

Let Agents author ordinary Three geometry, colliders and scene logic. SDK work
focuses on reusable capabilities that improve generation quality, success rate,
rework and elapsed time. Do not add wrappers or gates for framework completeness.
The SDK owns one clock, physics world, controller per actor, animation owner and
active camera writer. Hosts observe or submit intent to those owners. Observation
does not advance simulation. Auxiliary diagnostics degrade locally.

Verify affected public contracts and actual consumers, not only declarations.
Follow the [runtime checklist](docs/reviews/runtime-deep-review-checklist.md) for
runtime changes, including Creator and Episode consumers. Run relevant tests,
typecheck, test census and runtime prebuild for the final source. Documentation
changes require link, source-claim, diff and direct schema-consumer checks.
Keep cloud transport mocked in local tests. Maintenance regression requirements
are not additional steps in every production generation task.

## Production identities and authorization

Keep source/runtime/asset hashes, requests, recordings and review identity
consistent. Reconcile uncertain requests before retrying. Existing shared reviews
remain in their service; approval applies only to the exact reviewed content.
Do not start, restart or change external production jobs without task authorization.
Credentials, generated media, journals and review stores stay outside Git; private
runtime config belongs in ignored `.codex-tmp` or deployment Secrets.
For GPT-6 production routing use the user-confirmed
[account capability record](docs/evaluations/gpt6-three/account-performance/gpt6-capabilities-20260907.md),
match exact private identities and check live availability separately. Unknown
capability is not an approved fallback.
