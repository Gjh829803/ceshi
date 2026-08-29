# BNA-1 Runtime Scene Source Identity Clean-Break Review

## 1. Review metadata

- Date: 2026-08-29.
- Mode: B change review; dimensions D2-D6 plus the complete Runtime deep-review checklist.
- Branch: `explore/scene-reconstruction-api`.
- Baseline: `origin/main@febba985255b77a180b54b3b88be7f36601ff9c5`.
- Implementation observation point: `a3e2ae4`.
- Installed engine: Babylon.js `9.23.0`; engine-sensitive traversal claims are covered by real Havok contact regressions rather than remembered API behavior.
- Scope: BNA-1 only. Formal Babylon Native RuntimeHost admission remains rejected before adapter invocation or Candidate allocation. BNA-3/BNA-4 and later production gates are not claimed.
- Disposition: **integration GO with an explicit verification handoff**. The implementation and reviewed authority boundaries have no open P0/P1/P2 finding. The user directed that the remaining long-running local aggregate stop and be rerun from the exact pushed `main` commit in Cursor Cloud. This record therefore does not claim that the final root `pnpm test` aggregate passed locally.

## 2. Authority map and old-conclusion replay

| State / artifact | Sole current owner | Review result |
| --- | --- | --- |
| World build identity | `@whitebox-world/world-identity`, using the sole Protocol SHA-256 type | Closed; generic transports use `worldBuildIdentityHash` |
| Canonical scene geometry and placement | `CanonicalSceneExecutionPlanV1` | Closed; Plan identity remains only in Canonical Route/Edit/Reload consumers |
| Subject, physics, control, camera startup | `WorldRuntimeBootstrapV1` | Closed; no shadow Plan reconstruction in the Native experiment |
| Runtime ground support | Havok character support/contact query | Closed; zero, missing, ambiguous, multi-surface and contact-height cases fail closed |
| Scene-source selection | closed `RuntimeSceneSourceV1` discriminator | Closed; exactly one Canonical or Babylon Native member |
| Formal Native admission | RuntimeHost pre-allocation gate | Closed for BNA-1; returns `WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED` before allocation |
| Browser readiness | private initialization facade followed by the public readiness barrier | Closed; public API does not publish ready before initialization completes |

The prior independent review's Runtime-contact, Browser-readiness and Native-verifier P0/P1 findings were replayed against the current implementation and are closed. Its remaining D3/D6 finding was the absence of this completion record and the mismatch between the in-progress ledger and active completion documentation; this review plus the ledger update closes that documentation defect while preserving the incomplete local aggregate as an explicit verification handoff.

## 3. Findings

No open P0, P1 or P2 finding remains in the reviewed BNA-1 diff.

The following is a verification exception, not a hidden pass:

- The contract lane completed with 274/274 files and 2,990 passed / 3 skipped tests.
- Focused Runtime completed with 131/131 tests, including the 120-second grounded simulation, jump/landing, support loss, step traversal, wall collision, reset and camera behavior.
- Focused Browser API completed with 39/39 tests.
- Planner self-check completed with 9/9 tests; bundled Planner/Builder replay completed with 2/2 tests.
- Real Route runner completed with 12/12 tests and the Browser V5 Route Host transport completed with 1/1 test.
- The second resource-heavy aggregate was stopped at the user's request after those files passed. Before it was stopped, the catalog loader reported one timeout only: `grassland` completed in about 95 seconds against a 90-second test budget; all other assertions in that 14-test file passed. The exact test budget was raised to 120 seconds and was not rerun locally.
- Earlier exact-input BNA-1 gates recorded in the implementation ledger passed typecheck, both production builds, clean-break/capability verifiers and the Native browser verifier. The final timeout-only test edits do not change shipped source, but Cursor Cloud must run the final pushed tree before a release-quality full-matrix claim is made.

## 4. Evidence layers

| Layer | Evidence | Result / limitation |
| --- | --- | --- |
| `static-read` | source-neutral identity census, Plan-specific allowlist, forbidden Native Plan/compiler scan, authority-map review | Passed; no compatibility alias or shadow Plan found |
| `automated-contract` | contract 274 files; focused Runtime, Browser, Planner/Builder and Route gates listed above | Passed for listed commands; final root aggregate intentionally not claimed |
| `rendered-visual` | `/tmp/bna1-native-final.png`, SHA-256 `cb1f969ba9557033a9b160f3e3018f986c8ada83eccd6f90e43636da50ec8e7f` | Inspected Cloud Ridge frame with HUD, T-gate and exactly registered collision proxy overlay |
| `manual-interaction` | earlier Native playground movement, jump/landing, orbit/recenter, reset and overlay interaction evidence | Applicable to the unchanged product source; no new manual session was run after timeout-only test edits |

## 5. Dimension coverage

| Dimension | Status | Evidence |
| --- | --- | --- |
| D1 | Not required by Mode B; boundary rechecked | One world selects one source; one shared Gameplay Kernel; no BNA-4 production claim |
| D2 | Checked | closed discriminated unions, role-qualified refs, unit-bearing fields and current-only names |
| D3 | Checked | README, architecture, backlog, specification and runtime behavior agree on BNA-1 completion and Native production rejection |
| D4 | Checked | identity, Plan, Runtime Bootstrap, ground support, camera readiness and lifecycle each have one owner |
| D5 | Checked | deterministic hashing/sorting, direct dependencies, adversarial regressions, fail-closed diagnostics and cleanup coverage |
| D6 | Checked with recorded handoff | evidence layers separated; incomplete local aggregate is delegated to Cursor Cloud and is not described as passing |

## 6. Integration decision

Merge is approved for the unreleased repository under the user's explicit decision to stop further local testing. BNA-1's implementation boundary is complete: Canonical execution and shared Runtime startup are separated, generic identity is source-neutral, the Native experiment has no shadow Plan, and formal Native production admission remains closed. Cursor Cloud owns the next exact-commit full verification; any failure must be handled as a follow-up against the pushed `main` SHA rather than rewritten as prior success.
