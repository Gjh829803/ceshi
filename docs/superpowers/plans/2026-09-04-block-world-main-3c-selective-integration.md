# Block World selective main 3C integration plan

**Status:** completed

**Target branch:** `codex/block-world-main-3c-integration`

**Source baseline:** `origin/main@761d854fa77c3ea17c6f60cc275974acea505733`

**Target baseline:** `codex/block-world-main-integration@1d91132db99d2ff85ffc64c53558379af7d538f8`

## Goal

Preserve the current Three.js Block World authoring, trusted Block compiler,
Creator Studio cloud orchestration, Episode capture, style-variant, and Seedance
production behavior while selectively integrating proven current-main fixes for
subject movement, committed support, reset ownership, Camera target/collision
stability, and their regression coverage.

This is a semantic integration, not a directory merge. Babylon Native Block
authoring, Native Reconstruction, Native WorldPackage, Formal Capture, project
health, and main's default Scene Source routing remain out of scope unless a
required 3C behavior cannot be separated from them.

## Frozen authority boundaries

- `world.mjs` remains the sole Agent-authored geometry source.
- `@whitebox-world/block-world-three` remains the only Three.js adapter.
- Block checking and compilation continue to produce internal Canonical
  Authoring V4 transport; no Babylon Native authoring surface is introduced.
- `@whitebox-world/character-movement` owns committed semantic movement state.
- the Babylon Character Body port owns native controller position, velocity,
  contacts, and support sampling.
- the existing fixed-Tick transaction owns the atomic movement, animation,
  Camera, and RuntimeHost publication boundary.
- Camera Director owns orbit, recentering, active Camera profile, and committed
  Camera pose. Camera collision code may shorten the arm but must not invent a
  second target or movement state.
- Episode capture remains a consumer of Browser fixed-input and Camera commands;
  it does not become another movement or Camera implementation.

## Work graph

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership / integration point | Stable input/output contract | Evidence | Mode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `B3C-00` | Freeze scope, source/target baselines, authority map, and candidate main changes | — | `B3C-01`, `B3C-02` | this plan and read-only three-way audit | exact source commits + target behavior -> accepted/rejected behavior ledger | source diff, commit inspection, plan review | `main-agent-only` |
| `B3C-01` | Integrate Camera target/collision stability without changing Block authoring or public Camera vocabulary | `B3C-00` | `B3C-03` | `packages/camera`, `packages/runtime-babylon` Camera component/director/query/spring-arm seams | committed subject/Camera context + locked profile -> one committed collision-safe Camera pose | failing focused regressions, Camera unit tests, 30/60/120-like timing and reset cases | `sequential` |
| `B3C-02` | Integrate movement, support, and reset single-authority fixes required by the Camera path | `B3C-00` | `B3C-03` | `packages/character-movement`, Babylon body/movement adapters, `runtime-host` fixed-Tick/reset seams | fixed input + one Body sample/resolution -> one semantic movement commit and one reset publication | failing focused regressions, unsupported spawn/ledge, held input, reset/rebind, multi-instance and cleanup tests | `sequential` |
| `B3C-03` | Join the accepted 3C behavior to the existing Block World Runtime and Browser/Episode consumers | `B3C-01`, `B3C-02` | `B3C-04` | `babylon-world-runtime`, Playground coordinator/API only where required | existing Block World build/bootstrap -> unchanged Browser V5 and Snapshot V4 shapes with corrected behavior | Block Runtime integration, Browser fixed input, deterministic Episode capture tests | `main-agent-only` |
| `B3C-04` | Prove the final tree and record intentionally unmerged main capabilities | `B3C-03` | — | final integration, evidence, and documentation truth | final source tree -> scoped release disposition | focused tests, `pnpm typecheck`, `pnpm test`, `pnpm build`, affected Studio/independent lanes, capability verifier, `git diff --check` | `main-agent-only` |

## Candidate main behavior ledger

The audit starts from current-main changes associated with these behavior
families, not from whole-file selection:

- Camera collision pose remains bound to the validated target.
- Camera/WorldSession publications use committed epochs and cannot observe a
  partially reset subject.
- reset has one owner and clears movement, support, Camera, animation, and
  pending input consistently.
- support evidence is retained from the authoritative Character support path;
  no additional ray/AABB/height sampler becomes Gameplay truth.
- movement, animation, Camera, and RuntimeHost projection commit atomically or
  roll back together.
- failed or stale fixed-Tick tokens cannot be replayed into a later state.

### Accepted and integrated

- **Camera target identity reset** — adapted from current main's
  `activeTargetEntityId` behavior. A nearby possession/target change now clears
  the old Spring Arm state, bypasses the prior target's dead zone and damping,
  and commits the replacement target in the same Camera Tick. Existing manual
  orbit heading remains owned by the Camera Director.
- **Movement-owned placement and suspension** — adapted from
  `a25002c7 fix(runtime): enforce authoritative reset ownership`. The Character
  Movement Runtime now constructs and previews supported-placement and
  relationship-suspension snapshots. Babylon Runtime no longer hand-builds a
  second Locomotion state or transition sequence.
- **Body-authoritative reset support** — the Babylon Character Body adapter
  re-samples its existing native `checkSupport` path after teleport/reset and
  returns the canonical support result. The Movement owner reconciles grounded,
  sliding, or airborne state from that result rather than trusting the placement
  label.
- **Atomic reset rollback** — movement and native body reset together; an
  invalid support result restores both prior snapshots and preserves fail-closed
  behavior if rollback itself fails.
- **First-Tick support ownership** — the first real Body sample now corrects the
  authored spawn placeholder before Movement proposal. The former post-commit
  coyote-counter patch is removed.
- **Mounted transition previews** — prepared Mount and Dismount projections read
  the Movement owner's immutable preview instead of duplicating transition
  sequence and Locomotion construction in `BabylonWorldRuntime`.

### Audited and intentionally not integrated

- **`71990623` Camera geometry/hard-decollider rewrite** — the Block World path
  uses `subject-occlusion-fade`, so it bypasses that Spring Arm collision solver.
  Porting the rewrite would be large and would not improve the current product
  path without first changing the selected occlusion strategy.
- **`b9140fb9` validated-target collision composition fix** — the target branch
  does not contain the post-collision composition layer that caused this main
  bug, so there is no corresponding defect to fix.
- **`638c72df` broad runtime-authority refactor and `17aa00a5` 3C tuning
  workbench** — useful direction, but much wider than the proven movement/reset
  invariants and coupled to main-only UI/runtime structure.
- Babylon Native authoring, reconstruction/evaluation/repair, Formal Capture,
  Scene Catalog, Project Health, and dependency/test-runner upgrades remain
  outside this Three.js Block World integration.

The following remain intentionally outside this integration:

- Babylon Native Block Builder and `scene.ts` generation;
- Native Reconstruction Case mapping, evaluation, and bounded repair;
- Native execution isolation and Native-specific package formats;
- Formal World Capture and source-neutral Opening Composition Gate;
- Scene Catalog and Project Health Observatory;
- wholesale Vitest or dependency upgrades unrelated to an accepted 3C fix.

## Completion rule

Do not port a main change merely because it is newer. A behavior is integrated
only when the target branch first demonstrates a failing or missing invariant,
the minimal implementation fixes that invariant without weakening existing
Block World behavior, and the relevant final-tree gates pass. If the target
already satisfies the invariant, record it as already present and make no code
change.

## Final evidence

- focused Character Movement, Body, Camera, Golden transaction, and Block World
  Runtime tests: **181 passed**;
- complete contract suite: **304 files, 3154 passed, 3 skipped**;
- complete resource-heavy suite: **38 files, 536 passed**;
- `pnpm typecheck`: passed;
- Playground production build: passed;
- independent Node/Site gate: **161 Node + 1 Site passed**;
- G Bot build, Browser capture, pose, jump, and wall-stop verification: passed;
- Studio: `server.test.mjs` **163 passed** and the remaining ten files **89
  passed**. The repository's aggregate Studio command left the file-level
  runner Promise pending after all 163 server assertions completed; the exact
  files were therefore rerun as two exhaustive lanes, using Node's
  `--test-force-exit` only for the hanging server file.
- `git diff --check`: passed.
