# BNA-1 ExecutionPlanV5 projection review

Date: 2026-08-29

Source commit: `8410cb30797cb635ba8768dde720183f88ff01a7`

Plan task: BNA1-04 in
`docs/superpowers/plans/2026-08-29-babylon-native-runtime-scene-source-identity-clean-break.md`

## Decision

GO for the one-time BNA-1 migration checkpoint. The current parsed
`ExecutionPlanV5` can be partitioned without reconstructing or dropping an
existing Canonical Runtime fact:

- Canonical geometry, atmosphere, deterministic seed, placements, layout,
  traversal, static collision, and Scene resource usage project to the
  temporary `ProjectedCanonicalSceneExecutionPlanV1` shape.
- Gravity, initial camera composition, Subject runtime descriptors, Subject
  assets, rigs, animations, collider profiles, action presentation, controlled
  Subject selection, and Runtime resource locks project to the already frozen
  `WorldRuntimeBootstrapV1`.
- Initial relationships are not copied into either Scene or Runtime data. The
  projector requires exact canonical equality with
  `GameplayBootstrapV1.initialRelationshipStates`, which remains the sole
  Gameplay owner.
- `runtimeBackend` is deliberately deleted because the Host owns backend
  selection. Camera `aspectRatio` is deliberately deleted because the active
  render target owns viewport aspect ratio.
- The old combined Resource Lock hash is verified by the V5 Parser before the
  lock is partitioned. Traversal Surface Profile entries become Scene locks;
  every other entry becomes a Runtime lock. The Gameplay Bootstrap lock inside
  Runtime Bootstrap is an exact identity link, not a second owner of Gameplay
  content.

The exhaustive, machine-checked field accounting is stored in both the
temporary projector and the generated receipt. Every actual V5 top-level key
appears exactly once in the accounting table; split fields identify
non-overlapping source slices.

## Asymmetric evidence

The fixture intentionally compiles one coherent `AuthoringSpecV4` / Normalized
World IR containing facts that would expose a shallow or lossy projection. It
does not splice independently compiled Plans:

- gravity `[0.35, -12.5, 0.15]`;
- nondefault camera pitch, distance, target height, FOV, and a viewport aspect
  ratio that must be omitted;
- a rigged `player` Subject plus multiple available Control Feel profiles;
- one initial `mountedOn` relationship controlled through the mount;
- water, a static Collider, Heightfield and static-collider Traversal Surfaces;
- fixed layout placements; and
- Gameplay, Subject, capability, camera, motion, rig, animation, collider, and
  Traversal Surface resource locks.

The test proves nested equality, Subject descriptor-versus-placement
partitioning, relationship equality, complete lock partitioning, and
independent canonical hashes. The generated receipt records the real fixture
IDs, exact hashes, field accounting, asymmetric fact IDs, and focused command
summary:

- source V5 hash:
  `sha256:1f4e8f3b6e5d12bf1ec05b61494a0012a6f81d6523922080d6a1d6f56d7615dd`
- projected Canonical Scene Plan hash:
  `sha256:e8c4c2499becae9ce339e229d44ebedf7e1462043da3adf8beccea1e880c40e1`
- World Runtime Bootstrap hash:
  `sha256:a085029ad5ee5bc1a918bda2d24cf3f6f4d3a0c57e2289c6edad391884eeec14`
- Gameplay Bootstrap hash:
  `sha256:4e2d449fee190864fc11f35645a35e0b1a2220475d2c2d7b89e84d33ed6333c4`
- focused command: `pnpm vitest run
  packages/compiler/src/project-execution-plan-v5.test.ts`
- result: 1 test file and 5 tests passed.

The durable generated source of truth is
`artifacts/bna-1/execution-plan-v5-projection-receipt.json`.

## Scope and non-acceptance

This is migration evidence only. It does not:

- publish `ProjectedCanonicalSceneExecutionPlanV1` as a supported API;
- enable Babylon Native RuntimeHost admission;
- prove Native Package, Contribution, Collider, Gameplay Surface, Route, or
  hosted execution gates;
- authorize a shadow Plan or a long-lived compatibility projector; or
- replace the full BNA1-10 integration and zero-legacy review.

BNA1-05 must delete
`packages/compiler/src/project-execution-plan-v5.ts` and its test while
replacing `ExecutionPlanV5` with the terminal
`CanonicalSceneExecutionPlanV1`. The receipt and this review remain as the
historical proof that the clean break preserved the prior authority split.

## Verification to close this checkpoint

Required before committing BNA1-04:

- focused projection test;
- Compiler test suite;
- Runtime Contracts test suite;
- TypeScript typecheck;
- workspace boundary and test census gates; and
- `git diff --check` plus receipt revalidation without generation mode.
