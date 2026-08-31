# BWB-5 Block Reconstruction Corpus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development. Write RED, watch the expected failure, then write the minimal GREEN. Use executing-plans only after this work graph is stable.

**Goal:** Freeze one closed Block Reconstruction Corpus so each case uses one deterministic seed and one finalized Layout to produce visual, profile-local screenshots, collider, traversalBinding, overlay, spawn support, and real Havok evidence.

**Architecture:** Reuse the current JSON Control Plane + Babylon Native Block Whitebox + Frozen Contributions + SDK Havok/Gameplay/Camera/Input/Tick chain. Corpus code only materializes Layouts into the existing Session/Finalize path. Runtime never reads Layout after Finalize. Evidence index wraps existing check, authoring-capture, collider-inventory, and Havok results; it does not create Capture, Route Report, Surface Identity, or Validation formats.

**Tech Stack:** TypeScript 5.9, Babylon.js 9.23.0, Havok 1.3.14, Vitest 3.2.7, lodash-es named imports, existing BNA-4 admission and BWB-4 Package/Havok fixture.

**Spec:** `docs/superpowers/specs/2026-08-28-babylon-native-block-whitebox-profile-design.md` §BWB-5

**Upstream:** BWB-0..BWB-4 and BNA-5 are on `main`. BNA-6, BNA-7, WRC-SR-1 stay open.

## Global Constraints

- Current-only clean break: one public name and one materializer per concept; no aliases or legacy DSL.
- Do not create a third Scene Source, restore Three.js/Manifest/Compiler/Preset, or add a Native-only Runtime/Havok/Camera/Input/Tick/Route/Capture protocol.
- Do not reverse-scan Collider or Traversal Surface from Mesh/tag/name.
- Layout exists only in the Build Epoch. After Finalize, Runtime consumes frozen Contribution + BNA-4 admission only.
- Use `===` / `!==`. Use lodash-es `isNil` / `isEmpty` for nil/empty checks.
- Register every new test immediately in `scripts/lib/test-gate-manifest.ts`.
- Do not edit PHO-6 `report.ts`, `registry.ts`, `cli.ts`, `evidence-store.ts`, or PHO config.
- Do not implement BWB-6 Thin Instance, Chunk, or Collider coalescing.
- Production sources must not contain `createMountain`, `createBuilding`, `createLevel`, Manifest, Compiler, Preset, or `serialize`.
- Formal functions use `materialize...` / `inspect...` names, never `createMountain` / `createBuilding` / `createLevel`.

---

## File Structure

### Exclusive new files

- `packages/native-babylon-block-profile/src/reconstruction-corpus.ts`: closed IDs, seeds, layouts, materializer, evidence index.
- `packages/native-babylon-block-profile/src/reconstruction-corpus.test.ts`: contract RED/GREEN.
- `scripts/verification/bwb5-block-reconstruction-corpus.test.ts`: real Havok, cadence, rebind, cleanup.

### Existing files touched only at their published seams

- `packages/native-babylon-block-profile/src/index.ts`: export closed IDs, inspect, materialize, evidence index.
- `packages/native-babylon-block-profile/src/testing.ts`: add corpus Module factory; keep BWB-4 fixture.
- `packages/native-babylon-block-profile/src/package-boundary.test.ts`: exact new root and testing keys.
- `scripts/lib/test-gate-manifest.ts`: census rows only.

### Forbidden edits

- Runtime, Havok, Camera, Input, Tick, Browser Protocol, Capture, Route, Surface Identity, Validation packages.
- PHO-6 files and PHO config.
- Frozen BWB-3 plan images, BWB-4 fixture geometry contract, and playground catalog scenes.

---

## Work Graph

| ID | Goal | depends_on | blocks | Exclusive ownership | Input / output | Evidence | Mode |
|---|---|---|---|---|---|---|---|
| BWB5-10 | Freeze executable Corpus contract and work graph | BWB-2, BWB-3, BWB-4, BNA-5 | BWB5-20 | this plan + profile §BWB-5 | current main facts -> closed IDs/non-claims | design review of IDs and non-claims | `main-agent-only` |
| BWB5-20 | Closed case table, seeds, materializer, evidence index | BWB5-10 | BWB5-30, BWB5-40 | `reconstruction-corpus.ts` | case ID -> Session materialization or fail-closed code | package contract tests | `sequential` |
| BWB5-30 | Testing-only Module factory for positive + unsupported-spawn | BWB5-20 | BWB5-50 | `testing.ts` corpus factory | case ID -> existing Native Module | testing export census | `sequential` |
| BWB5-40 | Public root export census and package-boundary update | BWB5-20 | BWB5-60 | `index.ts`, `package-boundary.test.ts` | exact key sets | package-boundary tests | `sequential` |
| BWB5-50 | Same-Layout Havok, overlay, cadence, rebind, cleanup | BWB5-30 | BWB5-60 | `scripts/verification/bwb5-block-reconstruction-corpus.test.ts` | verified Package -> Runtime/Havok evidence | resource-heavy Havok tests | `main-agent-only` |
| BWB5-60 | Census, typecheck, focused gates, playground still builds | BWB5-40, BWB5-50 | BWB5-70 | `test-gate-manifest.ts` | new tests -> registered lanes | `pnpm test:census`, focused vitest, `pnpm typecheck` | `sequential` |
| BWB5-70 | Mode B + runtime-deep review, PR, independent main merge | BWB5-60 | BWB-6 | review/PR only | exact SHA -> scoped GO/NO-GO | no open P0/P1 | `main-agent-only` |

```text
BWB5-10 -> BWB5-20 -> BWB5-30 -> BWB5-50 -> BWB5-60 -> BWB5-70
                 \-> BWB5-40 ----------/
```

---

## Frozen Case Contract

### Positive

| ID | Seed | Family | Layout intent | Expected Havok |
|---|---|---|---|---|
| `ordinary-and-blocked-steps` | `202608313` | steps | Exact BWB-4 six-block corridor: ground tops at `0m`, `0.25m` rise, `0.5m` half blocker | 0.25m pass, 0.5m block, ledge air |
| `t-shaped-traversal` | `202608312` | t-shaped | Connected route spine + east/west arms; west arm blocked; east arm open | east pass, west block |
| `mountain-cliff` | `202608311` | mountain | Walkable terrace/steps plus stacked cliff mass | terrace pass, cliff face blocks, overlook ledge air |
| `building-exterior` | `202608314` | building | Approach pad, `0.25m` threshold, U-shaped doorway, back wall | door pass, back wall block |
| `limited-interior` | `202608315` | limited-interior | Single-layer floor, U walls, door gap, wall-supported ceiling `not-traversable` | interior pass, wall block; no Room/Nav claim |

### Negative

| ID | Seed | Expected closed code |
|---|---|---|
| `overlap-occupancy` | `202608321` | `WORLDKIT_NATIVE_BLOCK_PROFILE_CHECK_REJECTED` / `WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP` |
| `out-of-budget` | `202608322` | `WORLDKIT_NATIVE_BLOCK_COUNT_EXCEEDED` |
| `invalid-traversal-binding` | `202608323` | `WORLDKIT_NATIVE_BLOCK_COLLIDER_SELECTION_INVALID` |
| `unsupported-spawn` | `202608324` | Block Layout finalizes without a Block Profile failure code; Runtime admission rejects the unsupported spawn with `WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_SUPPORT_MISSING` before a playable session exists |
| `disconnected-route` | `202608325` | `WORLDKIT_NATIVE_BLOCK_PROFILE_CHECK_REJECTED` / `WORLDKIT_NATIVE_BLOCK_ROUTE_DISCONNECTED` |
| `cleanup-throw-partial` | `202608326` | overlap finalize reject 后释放未 finalized Mesh；通用 Session 测试持有 partial/throwing cleanup 顺序证据 |

### Same-Layout outputs required for every finalized Case

1. Babylon Native block visual from the existing visual adapter.
2. `createBabylonNativeBlockAuthoringCaptureV1` with views `opening`, `top-down`, `side` and `scope: "build-epoch-local"`.
3. Static Collider Contribution candidates with `proxyKind = layout-block-volume`.
4. Closed `traversalBinding` only (`static-surface` or `not-traversable`).
5. BNA-4 `worldkit.native-collider.*` overlay metadata after Package replay.
6. Spawn Support on a real static top, except `unsupported-spawn`.
7. Real Character Havok ticks. Screenshot/Box conformance alone is not a pass.

### Evidence index

`kind: "babylon-native-block-reconstruction-corpus-evidence-index"`, `schemaVersion: 1`. It points at existing check, capture, collider inventory, and contribution/Havok facts. It must set these claims to `false`:

`isFormalCapturePublished`, `isFormalRoutePublished`, `isRoomVisibilityClaimed`, `isMultilayerNavigationClaimed`, `isCavesClaimed`, `isBridgeUnderpassClaimed`, `isNpcNavClaimed`, `isGotoClaimed`, `isThinInstanceOptimized`.

---

## Task 1: BWB5-20 RED then GREEN

**Files:**
- Create: `packages/native-babylon-block-profile/src/reconstruction-corpus.test.ts`
- Create: `packages/native-babylon-block-profile/src/reconstruction-corpus.ts`
- Modify: `src/index.ts`

- [x] Write the failing contract test for closed IDs, seeds, polarity, same-Layout outputs, negative codes, and evidence-index non-claims.
- [x] Run it and confirm it fails because the corpus module is missing.
- [x] Implement the closed table and `materializeBabylonNativeBlockReconstructionCorpusCaseV1`.
- [x] Re-run until GREEN. Do not add Thin Instance/Chunk/coalescing.

Public names:

- `BABYLON_NATIVE_BLOCK_RECONSTRUCTION_CORPUS_CASE_IDS_V1`
- `inspectBabylonNativeBlockReconstructionCorpusCaseV1`
- `materializeBabylonNativeBlockReconstructionCorpusCaseV1`
- `createBabylonNativeBlockReconstructionCorpusEvidenceIndexV1`

## Task 2: BWB5-30 / BWB5-40

- [x] Add `createBabylonNativeBlockReconstructionCorpusModuleV1` on `./testing`.
- [x] Update exact root and testing export key lists.
- [x] Keep `createBabylonNativeBlockColliderRuntimeFixtureModuleV1`.

## Task 3: BWB5-50 RED then GREEN

**File:** `scripts/verification/bwb5-block-reconstruction-corpus.test.ts`

- [x] Write Havok tests for the five positive cases, `unsupported-spawn`, reset, dispose, 30/60/120-like render cadence on `ordinary-and-blocked-steps`, and sequential cross-session rebind with no leftover Scene/Engine/Collider Mesh.
- [x] Confirm they fail for missing corpus Module/behavior.
- [x] Implement the factory and keep fixtures inside current vertex/triangle/collider budgets.
- [x] Re-run the resource-heavy file until GREEN.

The default WorldPackage fixture still has one `player` Subject. Current evidence is reset+rebind of that Subject, plus sequential dispose of case A and create of case B with different collider IDs. It is not cross-entity or Listener/Camera/Input-owner evidence. Do not add a second product Subject Definition.

## Task 4: BWB5-60 / BWB5-70

- [x] Register the two new tests in `scripts/lib/test-gate-manifest.ts` (contract + resource-heavy `native-havok-or-recast`).
- [x] Run focused tests, `pnpm typecheck`, `pnpm test:census`, and a playground/native-playground build.
- [x] Independent Mode B + runtime-deep review. Fix P0/P1 before PR.
- [x] Commit `feat: add block world reconstruction corpus`, push, open PR. Merge independently of WRC-1.
- [ ] After merge only, tick BWB-5 in `docs/18-refactor-progress-and-backlog.md`. Do not raise the total progress percentage.
