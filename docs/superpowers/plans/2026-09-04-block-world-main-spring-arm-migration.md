# Block World Main spring-arm migration plan

**Status:** completed

**Target branch:** `codex/block-world-main-3c-integration`

**Source baseline:** `origin/main@761d854fa77c3ea17c6f60cc275974acea505733`

**Target baseline:** `ac4f3198`

## Goal

Replace the Block World product path's subject-occlusion fade with current
main's complete deterministic hard-collision Spring Arm while preserving the
Three.js `world.mjs` authoring, Block compiler, Studio, cloud Episode, Camera
profile, movement, and fixed-Tick transaction architecture.

The delivered claim is a stable third-person hard-collision foundation for
static Block World buildings. It is not a complete indoor/AAA deocclusion
camera: automatic candidate viewpoints, smart shoulder switching, soft or
transparent occluder composition, combat framing, and final frustum scoring
remain separate future work.

## Frozen authority boundaries

- Camera Director remains the sole owner of the final target, pose, FOV, Camera
  profile transition, and atomic rollback.
- `CameraViewSolverV1` produces the desired composition. Position damping and
  profile transition happen before the hard safety clamp.
- `CameraHardDecolliderV1` is the sole owner of hard-collision temporal state:
  constrained length, stable contact, clear hold, recovery, overlap fallback,
  and last safe pose.
- `BabylonHavokCameraGeometryQueryV2` reports geometry facts only. It performs
  one exact sphere overlap/sweep and never chooses a Camera pose.
- Movement/Body support, Subject facing, animation, and Block authoring remain
  unchanged by Camera collision.
- No subject material opacity or fade is allowed in the Block World runtime
  path after this migration.

## Work graph

| ID | Deliverable | depends_on | Stable integration point | Evidence |
| --- | --- | --- | --- | --- |
| `CAM-BW-0` | Freeze baselines, scope, ownership, engine capability, and accepted Main slice | — | this plan + read-only current/Main audit | exact refs and rejection ledger |
| `CAM-BW-1` | Add Camera Geometry V2 contract and provider-neutral Hard Decollider | `CAM-BW-0` | `packages/camera` | strict parser, overlap, corner, recovery, snapshot tests |
| `CAM-BW-2` | Replace old Babylon query providers with one Havok Geometry V2 adapter | `CAM-BW-1` | `packages/runtime-babylon` query seam | real wall, corner, doorway, overlap, exclusion, cleanup tests |
| `CAM-BW-3` | Commit one damped/transitioned, collision-safe target and pose | `CAM-BW-2` | Spring Arm + Camera Director transaction | target identity, collision composition, recovery, rollback tests |
| `CAM-BW-4` | Remove subject fade and wire Block World/runtime snapshots to Spring Arm telemetry | `CAM-BW-3` | World Runtime, Camera component, public snapshot | Block integration, mounted exclusion, no-fade census |
| `CAM-BW-5` | Final-tree verification and commit | `CAM-BW-4` | repository gates | focused tests, typecheck, full tests, build, product verifiers |

## Accepted Main behavior

- Camera Geometry Query V2 with truthful closest-hit and single native-ignore
  capability.
- Sphere proximity before shape cast so a camera that starts inside geometry is
  not disguised as an ordinary zero-distance hit.
- If the prior Camera pose lies across the overlap surface, validate and use a
  minimum-length emergency arm on the same separating side before failing
  closed. This branch-specific adaptation keeps Traversal reset independent
  from an adversarial ceiling while retaining hard-collision validation.
- Immediate inward safety clamp, 0.12-second clear hold, monotonic half-life
  recovery capped at 3 m/s, stable contact clustering, and last-safe-pose
  fallback.
- Final collision query starts from the exact target that Camera Director will
  commit; the returned target and position commit together.
- Target/FOV/profile transitions remain smooth while collision safety is
  immediate.
- Subject and mounted ViewTarget exclusions are restored transactionally.
- Provider, Director, and Hard Decollider state roll back together on failure.

## Explicit exclusions

- no fade fallback;
- no automatic shoulder/candidate-camera selection;
- no soft/transparent/foliage classification beyond `camera-hard`;
- no multi-hit claim beyond the locked Havok provider's closest hit;
- no Babylon Native authoring, reconstruction, Formal Capture, or unrelated
  current-main package migration.

## Completion rule

The migration is complete only when the old Camera query authorities and
subject-fade runtime path have no production references, the focused Main
regressions pass on the target tree, the Three.js Block World integration still
passes, and the relevant full repository gates remain green.

## Final evidence

- Camera contract, Hard Decollider, Spring Arm, Director composition, Block
  World, Runtime, and protocol focused suites passed.
- complete tracked contract lane passed; the shared-worktree run reported
  **305 files, 3146 passed, 3 skipped**, including one pre-existing uncommitted
  two-test playthrough file deliberately excluded from this commit. The later
  Spring Arm emergency regression also passed in its focused suite;
- complete resource-heavy lane: **38 files, 543 passed**;
- `pnpm typecheck`, Playground production build, test census, and workspace
  boundary verification passed;
- independent gates: **161 Node + 1 Site passed**;
- G Bot build, Browser capture, pose, jump, and wall-stop verification passed;
- Studio split lanes: **74 server + 89 remaining tests passed**;
- legacy Camera query and subject-fade production-reference census returned no
  matches; `git diff --check` passed.
