# Large Heightfield and Route Window V1 implementation plan

> **Execution rule:** implement with focused RED -> GREEN tests. Do not merge to `main`; finish as
> the second commit on `codex/terrain-generation` after terrain commit `d1d7f8b`.

**Design:** `docs/superpowers/specs/2026-08-26-large-heightfield-route-window-design.md`

## Dependency-aware work graph

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership | Input -> output contract | Verification evidence | Mode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LW1 | Freeze scale and route-window design | — | LW2–LW6 | design/spec and this plan | current schema/profile/runtime evidence -> approved V1 boundary | link/diff review | main-agent-only |
| LW2 | Add provider-neutral route-window estimator | LW1 | LW4 | `packages/traversal/src/build-budget.*`, traversal exports | closed route/grid/profile input -> admitted expanded bounds + tile estimate or structured budget error | focused Vitest RED/GREEN | sequential |
| LW3 | Add large-raster base quantization | LW1 | LW5 | `scripts/terrain-height-intent/quantize-*`, compiler/report tests | constrained metric field + protected mask -> deterministic `0.1m` unlocked samples with exact protected samples | focused Vitest plus serialized-byte assertion | parallel-safe after LW1 |
| LW4 | Add Builder scale/window evidence and fail-fast diagnostic | LW2 | LW5 | `scripts/agents/agent-builder-self-check.ts` and focused tests | Authoring routes + compiled terrain + built-in profile -> ordered evidence/diagnostics | host self-check tests | sequential |
| LW5 | Synchronize Builder skill, generated checker, and launcher | LW3, LW4 | LW6 | Builder Skill/reference/template, launcher, generated `self-check.mjs`, skill tests | approved V1 rules -> executable Agent guidance with source-equivalent checker | builder skill tests and bundle parity | sequential |
| LWR | Close the terrain adversarial-review blockers discovered after `d1d7f8b` | LW3 | LW6 | terrain constraint solver, compiler call, focused regressions, remediation review | adversarial probes -> final-raster Route revalidation, conservative protected rasterization, height-range fail-closed | focused RED/GREEN, real-case replay, Authoring/Layout validation | main-agent-only |
| LW6 | Prove large-world capacity and finish second functional commit | LW5, LWR | — | integration fixture/evidence, review doc, Git commit | final tree -> 2km contract evidence, 1km Babylon topology/capture evidence, commit | scoped gates, typecheck, build if inputs require, visual inspection, diff check | main-agent-only |

Architecture, public-boundary decisions, adversarial-review remediation, generated checker promotion, final integration, review, and
Git commit remain main-agent owned. No subagent is needed because LW2–LW5 touch one coupled contract
chain and the coordination cost would exceed the saved time.

## LW2 — route-window estimator

- [x] Add failing tests for a short route, a `2km` straight narrow route, a `2km` diagonal failure,
  asymmetric terrain cells, input mutation, negative zero, non-finite points, and deterministic replay.
- [x] Run `pnpm exec vitest run packages/traversal/src/build-budget.test.ts` and record RED.
- [x] Implement `estimateRouteBuildWindowTileCountV1()` by expanding the polyline AABB by route
  half-width plus one terrain cell, then delegating to `assertTraversalGraphBuildBudgetV1()`.
- [x] Export the function/type from `@whitebox-world/traversal`; do not add Recast terminology or a
  second micrometer implementation.
- [x] Rerun the focused test and typecheck.

## LW3 — compact large generated heightfields

- [x] Add failing tests for deterministic `0.1m` quantization, negative-zero normalization, invalid
  quantum, caller immutability, and a `801 x 801` representative field below the current `8MiB` JSON
  boundary after quantization.
- [x] Run the new test and confirm RED.
- [x] Implement the quantizer locally under `scripts/terrain-height-intent/`.
- [x] Apply it only when the target grid exceeds `120,000` samples, using the solver's mask so
  protected constraint samples remain exact.
- [x] Record the quantum and affected sample count in the compiler report; ordinary Canyon V0 bytes
  must remain unchanged.
- [x] Register the new test in the test-gate census and rerun compiler/CLI tests.

## LW4 — Builder evidence and early repair

- [x] Add failing tests that produce ordered terrain scale evidence, accept an admitted long straight
  route, and reject an over-budget diagonal route with `ROUTE_BUILD_WINDOW_BUDGET_EXCEEDED` details.
- [x] Prove ten explicit diagonal segments are individually admitted and reuse their shared seam
  Anchor IDs in the test fixture.
- [x] Integrate evidence into `runBuilderSelfCheck()` using the built-in Heightfield R1 Profile; bump
  the report validator version to V6.
- [x] Keep the exact trusted Route Build Input guard authoritative for R1B/static geometry.
- [x] Rerun focused self-check tests and typecheck.

## LW5 — Agent contract synchronization

- [x] Replace the universal `120,000`-vertex Builder ceiling with ordinary-world and explicit
  large-world branches while preserving blocking resource budgets.
- [x] Document the `1024`-vertex operational cap, `1.25–2.5m` cell guidance, measured budget formula,
  explicit shared seam Anchors, and empty connectivity for open ground.
- [x] Add a segmented-route JSON example without inventing a new public field.
- [x] Update `scripts/agents/run-spatial-world-agent.sh` with the same canonical terminology.
- [x] Regenerate the Builder standalone self-check with `pnpm generate:agent-self-check`.
- [x] Run Builder skill tests, source/bundle parity, and the standalone host/agent receipt comparison.

## LW6 — integration, review, and commit

### LWR — terrain adversarial-review remediation

- [x] Reproduce equal-priority crossing Route overwrite, sub-cell Spawn/Water zero-effect edits, and
  constraint output outside `world.bounds.heightRangeMeters`; record 4 focused RED tests.
- [x] Revalidate every Route against the final raster, conservatively rasterize protected regions
  that cover no vertices, and fail closed on final height-range escape.
- [x] Add compiler integration proof that a blocking height-range result publishes no compiled spec.
- [x] Recompile 013/014/015 and verify unchanged accepted hashes plus passing Authoring/Layout gates.
- [x] Preserve residual/topology admission as an explicit rendered-review boundary rather than
  freezing an unsupported color threshold.

- [x] Add or derive a `2km`, `801 x 801` contract fixture and verify `2.5m` cell span, `641,601`
  vertices, `1,280,000` triangles, quantized JSON admission, and segmented route-window admission.
- [x] Build a real `1km`, at least `401 x 401` Babylon terrain mesh and prove 32-bit topology reaches
  an index above `65,535` without partial-resource leakage.
- [x] Determine that a normal opening capture cannot prove kilometer scale or performance; retain
  the real 1km NullEngine topology proof and explicitly avoid a software-renderer performance claim.
- [x] Run the final affected closure once: focused tests, test census, self-check parity, typecheck,
  relevant build, Authoring validation, and `git diff --check`.
- [x] Review D2–D6 plus the Runtime authority checklist. Attempt independent Cursor review once when
  the authenticated CLI is responsive; a timeout is recorded as no verdict.
- [x] Create `docs/reviews/2026-08-26-large-heightfield-route-window-v1-review.md`.
- [x] Commit as the second functional commit on `codex/terrain-generation` after terrain `d1d7f8b`;
  preserve intervening adversarial-review commit `a81134d`, then verify branch, ordering, status, and
  that `main` was not modified or merged.
