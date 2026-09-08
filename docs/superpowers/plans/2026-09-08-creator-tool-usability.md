# Creator Tool Usability Implementation Plan

> Execute sequentially with superpowers:executing-plans. Root owns interfaces and integration; independent final review follows the focused checks.

**Goal:** Reduce the information needed to discover and use Creator tools while retaining trustworthy guidance, frozen permissions and current delivery semantics.

**Approved scope:** User selected the first workstream: concise asset search, on-demand detail/contracts, actionable errors and internal organization directly supporting these behaviors. Camera unification is explicitly deferred.

**Architecture:** A discovery module owns asset search, source-backed schema selection and examples. ThreeCreatorTools retains browser/session/evidence authority and delegates discovery. One error adapter adds recovery guidance at MCP/CLI boundaries and asynchronous operation results; original error messages remain available. Existing policy validators remain the shared authority, with no directory-only migration or new package.

Integration base: `5293b791`; branch `codex/three-creator-tool-usability-20260908`.

## Constraints

- No SDK, camera, physics, recording semantics or admission-gate changes.
- Preserve same-session/current-world/current-input complete real recording contract.
- Search and guidance use the frozen allowed catalog; do not expose private paths or recommend denied dependencies.
- Search summaries explicitly link to assets_describe. Complete definitions remain available there.
- Public schema remains extracted from actual SDK contracts/README; no second handwritten API language.
- Preserve direct service schema/assets consumers; MCP/CLI intentionally adopt progressive disclosure and document it.
- Recovery hints never bypass a validator, widen permissions or advise blindly retrying an unknown operation.
- No cloud generation, deployment or new package.

## Task 1 — Discovery

Files: new creator-discovery.ts and tool-usability.test.ts; tools.ts, mcp.ts, character/mount guidance tests and test census.

- [x] Add failing real-tool tests: compact asset search, name/ID relevance, bounded pagination, Chinese skill discovery, exact resource details, denied dependencies, summary schema and explicitly requested source contracts.
- [x] Extract schema/examples/assets into CreatorDiscovery, parameterized by the existing ThreeCompiler.
- [x] MCP assets_search returns bounded summaries; assets_describe returns full permitted details and reports unavailable IDs clearly. Direct service assets retains its full response contract.
- [x] MCP schema defaults to guide; optional sections expose contracts/project/episode/observation/commands/training/all. Direct schema defaults retain full data.
- [x] Update tool descriptions and exact consumers; measure representative serialized JSON sizes before/after.

## Task 2 — Actionable errors

Files: new tool-errors.ts; mcp.ts, cli.ts, tools.ts, tool-usability.test.ts.

- [x] Test invalid input, missing assets/dependencies, unknown operation and source-changed playtest rejection; retain conservative fallback guidance for other failures.
- [x] Keep existing thrown/error string compatibility, add structured code/message/details/nextSteps at MCP and CLI boundaries.
- [x] Persist errorDetails with failed Creator operations while preserving error and operation identity. Preserve cancellation/queue semantics.
- [x] Exercise actual JSON-lines CLI success/error recovery and correlation; no browser/provider calls needed for these errors.

## Task 3 — Verification and handoff

- [x] Run affected Creator suites, typecheck, census, relevant mocked cloud bridge/policy contracts and documentation links/diff checks.
- [x] Independent code review of final diff; address concrete findings and only rerun affected checks.
- [x] Update Creator README and this plan with behavior/metrics/evidence. Commit reviewable changes; integrate into user-designated working main using the existing authorized workflow, preserving other worktrees and user edits.

Verification uses existing delivery tests, including browser consumers where already covered by tools.test.ts; no new full production replay for this Host-only change.

## Integration and verification

The working main advanced to `5293b791` during implementation. Discovery preserves
its `createHumanoidWorld` entry, actual factory contracts, capability/input metadata,
runtime source export and coverage-based recording contract. No minimum recording
duration is reintroduced. The discovery change does not alter SDK runtime code.

Independent review found vehicle maneuver hints missing from the compact search
index. A real MCP-dispatch test reproduced the missing `漂移` results for rover
and racer; the index now includes public vehicle mode/hint/binding semantics.
Private paths and resource hashes remain excluded.

Final local evidence (2026-09-08):

- Creator suites: 17 files / 212 tests exercised on the integrated source. Initially 211 passed and the new vehicle test exposed a mistaken test ID (`training.racecar` instead of `training.racer`). Corrected the ID and the reviewed binding field lookup, then reran all affected discovery/guidance suites: 21/21 passed. The other 191 tests were unaffected by those corrections.
- `node --test scripts/cloud/three-eval-asset-policy.test.mjs scripts/cloud/three-eval.test.mjs scripts/cloud/three-host-reliability.test.mjs`: 43/43 passed with mocked provider transport.
- Final `pnpm typecheck`, `pnpm test:census` (60 files: 22 contract / 38 resource-heavy), workspace boundary, local README link and diff checks passed.
- SDK runtime prebuild passed: `e5e39373b0350556d7b62315b20df9c1f5d51be51c33fbdffe98540279f46b7a`. This patch changes no SDK runtime source. No production run or deployment was performed.
- Independent review completed on the rebased diff. Vehicle maneuver search, actual catalog ID and binding field findings were corrected and covered by the final real MCP-dispatch test.

Serialized JSON bytes with the same integrated SDK profile and frozen default catalog:

| Response | Full service response | Progressive MCP/CLI response |
| --- | ---: | ---: |
| Asset search `walk` | 41,624 | 1,952 |
| Asset search `horse` | 5,686 | 1,302 |
| Asset search `漂移` | 2,527 | 719 |
| Schema `getting-started` | 29,560 | 4,529 |
| Schema `mounted-interaction` | 51,043 | 5,029 |

These are payload bytes, not token counts or a generation-quality claim. Asset
details and source contracts remain available through explicit tool requests.
