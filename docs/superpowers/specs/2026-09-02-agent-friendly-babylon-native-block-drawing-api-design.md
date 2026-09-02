# Agent-friendly Babylon Native Block Drawing API Design

- Status: Implemented current-only cutover; delivery and remaining WRC-API-90 evidence are tracked only by the live backlog
- Date: 2026-09-02
- Milestone owner: WRC-1 / BWB authoring profile
- Parent architecture:
  [WRC-1 World Reconstruction and Control](./2026-08-30-wrc1-world-reconstruction-and-control-milestone-design.md)
- Native lane authority:
  [AI-friendly Babylon Native world authoring](./2026-08-28-ai-friendly-babylon-native-world-authoring-design.md)
- Profile authority:
  [Babylon Native Block Whitebox Profile](./2026-08-28-babylon-native-block-whitebox-profile-design.md)
- Production slice:
  [Native Block Reconstruction E2E](./2026-08-31-native-block-reconstruction-e2e-design.md)
- Live status authority: [SDK refactor progress and backlog](../../18-refactor-progress-and-backlog.md)
- Migration source: `origin/codex/block-world-sdk-v2@3c2e9826f0c91ef39675c27a6bbdc6238e6c0b05`

## 1. Decision

Extend the existing `@whitebox-world/native-babylon-block-profile` session with exactly two
mechanical authoring operations:

1. make `createBlock()` atomically accept the Block center and its Y-axis quarter-turn; and
2. add `createBlockGrid()` for a dense axis-aligned rectangular repetition of one shape and palette role.

This is a current-only replacement of the existing create-then-mutate convention. It is not a new
package, scene language, serialized Block Manifest, Compiler, Scene Source, Runtime, or semantic recipe
library. The accepted tree has one public Block placement dialect.

The first slice does not add `createMountain`, `createBuilding`, `createLevel`, `createWall`,
`createStairs`, `placeStairColumn`, automatic Collider creation, or traversal inference. Mountains,
cliffs, buildings, T-shaped spaces, stairs, and interiors remain ordinary TypeScript composition over
the two mechanical operations and direct Babylon Native visual APIs.

## 2. Why the API is justified

The current public call sequence separates identity/shape creation from placement:

```ts
const block = session.createBlock({
  id: "central-step",
  shape: "step",
  paletteRole: "route",
  visualGroupId: "central-ascent-group",
});
block.position.set(0, 0.125, 14);
```

That split leaves four Profile invariants to generated code and catches violations only at Finalize:

- shape-specific center residue on the `[0.5, 0.25, 0.5]m` occupancy grid;
- exact `0 | 1 | 2 | 3` Y quarter-turn selection;
- stable repeated IDs and iteration order; and
- pre-allocation budget, duplicate-ID, and occupied-cell closure.

The repetition appears independently in the production Builder Skill, BWB fixtures, reconstruction
Corpus, Native Package fixtures, and the frozen v2 experiments. It is a stable mechanical problem rather
than scene semantics. Moving it into the Profile satisfies the parent design rule that correctness belongs
to types/Profile/Host checks while the Skill improves model success rate.

## 3. Authority boundary

The change preserves exactly two mutually exclusive Scene Sources:

```text
Canonical JSON Source
Babylon Native Source
```

The drawing API is inside the optional Babylon Native Block Profile and creates visual `Mesh` objects
only in the Host-provided Candidate Scene. It does not add a Scene Source kind or overlay Canonical
geometry.

Owner boundaries remain unchanged:

| Concern | Sole owner after this change |
|---|---|
| Engine, Scene, Candidate allocation and admission | Native Host / RuntimeHost |
| Visual Block construction and ephemeral Profile inventory | `@whitebox-world/native-babylon-block-profile` |
| Frozen Spawn and static Collider intent | existing Native Registration boundary |
| Havok body/shape creation and support | SDK Runtime / single `checkSupport()` path |
| Subject, Input, Action, Camera, Fixed Tick, Reset and lifecycle | existing SDK owners |
| Package, dependency lock, Receipt and Capture identity | existing WorldPackage and Capture owners |
| AI task routing | `scripts/agents/run-codex-task.mjs` |

The API must not create or retain Engine, Scene, Render Loop, Havok, Physics body/shape, Camera, Input,
Timer, Gameplay Entity, network request, independent Tick, or a second Runtime state machine.

## 4. Public contract

```ts
export type BabylonNativeBlockRotationQuarterTurnsYV1 = 0 | 1 | 2 | 3;

export interface BabylonNativeBlockCreateInputV1 {
  readonly id: string;
  readonly shape: BabylonNativeBlockShapeKindV1;
  readonly paletteRole: BabylonNativeBlockPaletteRoleV1;
  readonly centerMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
  readonly rotationQuarterTurnsY?: BabylonNativeBlockRotationQuarterTurnsYV1;
  readonly visualGroupId?: string;
}

export interface BabylonNativeBlockGridCreateInputV1 {
  readonly idPrefix: string;
  readonly shape: BabylonNativeBlockShapeKindV1;
  readonly paletteRole: BabylonNativeBlockPaletteRoleV1;
  readonly minimumCenterMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
  readonly repeatCountXYZ: readonly [
    xCount: number,
    yCount: number,
    zCount: number,
  ];
  readonly rotationQuarterTurnsY?: BabylonNativeBlockRotationQuarterTurnsYV1;
  readonly visualGroupId?: string;
}

export interface BabylonNativeBlockProfileSessionV1 {
  createBlock(input: Readonly<BabylonNativeBlockCreateInputV1>): Mesh;
  createBlockGrid(
    input: Readonly<BabylonNativeBlockGridCreateInputV1>,
  ): readonly Mesh[];
  finalize(
    input: Readonly<BabylonNativeBlockProfileFinalizeInputV1>,
  ): BabylonNativeBlockFinalizedEpochV1;
  dispose(): void;
}
```

`rotationQuarterTurnsY` defaults to `0`. This is the one current contract default, not a legacy fallback.
The old input without `centerMetersXYZ` is invalid and has no overload, alias, adapter, or implicit origin.

## 5. Coordinate and grid semantics

- World units are meters; `+Y` is up and controlled Subject forward is `-Z`.
- `centerMetersXYZ` and `minimumCenterMetersXYZ` name Block centers, not minimum corners.
- Rotation is only around world Y and is exactly `rotationQuarterTurnsY * Math.PI / 2`.
- All numeric inputs must be finite and must not preserve negative zero in evidence.
- A center accepted within the Profile alignment epsilon is canonicalized to the exact center lattice before
  Mesh allocation, occupancy accounting, Finalize comparison, and evidence hashing.
- A center must satisfy both the broad center lattice and the selected rotated shape's occupancy bounds.
- `repeatCountXYZ` contains positive safe integers and is validated before any Mesh is allocated.
- Grid spacing is the selected shape's effective rotated size on each axis. There is no stride, scale,
  gap, sparse mask, callback, or arbitrary transform field in V1.
- Grid iteration order is Y outermost, then Z, with X innermost.
- A Grid Block ID is exactly `<idPrefix>-x<xIndex>-y<yIndex>-z<zIndex>` using zero-based unpadded
  indices. Increasing a count at the positive end does not rename existing cells.
- Returned Mesh arrays use the same canonical Y/Z/X order.

The visual display gap remains a Finalize concern and never changes center positions, occupancy, Collider
geometry, or traversal evidence.

## 6. Atomicity and failure semantics

### 6.1 Single Block

`createBlock()` validates the closed input, ID, finite center, quarter-turn, shape-specific lattice,
remaining budget, and occupied micro-cells before Mesh allocation. It creates the Mesh, applies the exact
position and rotation, snapshots local geometry, and records the declared placement as one acquisition.

If Mesh creation or geometry snapshotting fails, the new Mesh is disposed and no ID, occupancy cell, record,
or budget slot remains committed. Cleanup failure moves the Session to `failed` and preserves the original
construction error as the primary cause.

### 6.2 Grid

`createBlockGrid()` derives every child ID and placement in memory first. Before allocating a Mesh it validates:

- the complete closed Grid input;
- total count and multiplication overflow;
- every child ID;
- all shape-specific centers;
- collision with existing IDs and occupied cells;
- collision within the proposed Grid; and
- total Session budget.

If preflight fails, zero Meshes are created. If construction fails after allocation begins, the method disposes
the batch in reverse order and removes its records, IDs and cells. Successful rollback leaves the Session
`open`; throwing cleanup moves it to `failed`.

### 6.3 Finalize

Finalize remains the trusted epoch boundary. It must verify that every live Profile Mesh still has the exact
declared center and quarter-turn and has not been scaled, reparented, disabled, replaced, disposed, instanced,
or geometry-mutated. Direct post-creation transform mutation is therefore not a second supported placement
dialect; it is tampering detected by the existing checked Layout boundary.

The strict `block-plane` Capture rule is unrelated and unchanged: blocker evidence still requires a supported
approach, movement toward the frozen face, and final Capsule contact near the uncrossed face.

## 7. Collider and Runtime semantics

`createBlockGrid()` never registers colliders. NBR-65 replaced the original singleton-only
selection shape with one current-only geometry-source union. Until the NBR-65 logical-ground
materializer lands, production Modules must use the admitted singleton branch:

```ts
session.finalize({
  staticColliders: [{
    id: "entry-ground-collider",
    colliderGeometrySource: {
      kind: "block",
      blockId: "entry-ground-x0-y0-z0",
    },
    traversalBinding: {
      kind: "static-surface",
      surfaceEntityId: "entry-ground-surface",
      logicalSubshapeId: "entry-ground-top",
      traversalSurfaceProfileRef:
        "worldkit://traversal-surface-profile/ground.static@1",
    },
    exposedEdgePolicy: "none",
  }],
});
```

The closed alternative `{ kind: "block-group", colliderGroupId }` is reserved for an explicitly
labelled floor or structural mass. It fails closed until the NBR-65 logical-ground gate is
published. The retired top-level `staticColliders[].blockId` shape is invalid and has no alias or
fallback.

There is no `collidable`, `physics`, `role`, `isGround`, or `isTraversable` field on Block creation. The
Host continues to derive the evaluator role from the selected checked Block shape and the closed traversal
binding. No Mesh name, tag, material, color, visual group, or Scene scan can create physics.

## 8. AI-facing example

```ts
const blocks = createBabylonNativeBlockProfileSessionV1(context, {
  maximumBlockCount: 64,
});

blocks.createBlockGrid({
  idPrefix: "entry-ground",
  shape: "full",
  paletteRole: "ground",
  visualGroupId: "foreground-platform-group",
  minimumCenterMetersXYZ: [-2, -0.5, 16],
  repeatCountXYZ: [5, 1, 3],
});

for (let stepIndex = 0; stepIndex < 6; stepIndex += 1) {
  blocks.createBlock({
    id: `central-step-${stepIndex}`,
    shape: "step",
    paletteRole: "route",
    visualGroupId: "central-ascent-group",
    centerMetersXYZ: [0, 0.125 + stepIndex * 0.25, 15 - stepIndex],
  });
}
```

The example intentionally keeps the stair loop in ordinary TypeScript. A public stair recipe would encode
support, route width, rise, direction, Collider selection, and naming policy together and would be the first
step toward a second semantic scene DSL.

## 9. v2 migration disposition

The sole migration source for this work is
`origin/codex/block-world-sdk-v2@3c2e9826f0c91ef39675c27a6bbdc6238e6c0b05`.
The older `618d96b4` commit remains a historical accepted-design checkpoint, not a competing migration source.

| v2 element | Disposition |
|---|---|
| fixed metric shapes, occupancy quantization, stable IDs | already migrated; reuse current Profile owner |
| ordinary loops for ground, walls, mountains and buildings | retain as authoring technique |
| repeated local `addBlock`/`place` helpers | replace with atomic `createBlock()` |
| dense repeated ground/wall loops | adapt to `createBlockGrid()` |
| chunking/coalescing assessment | keep behind existing BWB-6 optimization owner |
| `BlockWorldManifestV2` and Presets | reject |
| Three.js global injection and renderer binding | reject |
| Block Compiler to AuthoringSpec/ExecutionPlan | reject |
| material/color/name to physics inference | reject |
| Subject, Camera, traversal band, space transition or trigger Runtime | reject |
| automatic smoothing, hidden boundary planes or alternate Ground Sampler | reject |

No v2 package is cherry-picked or retained as a dependency.

## 10. Package and file ownership

No workspace package is added.

| File | Responsibility |
|---|---|
| `packages/native-babylon-block-profile/src/session.ts` | closed public inputs, Session state, preflight, batch atomicity and lifecycle |
| `packages/native-babylon-block-profile/src/shapes.ts` | canonical rotation type and shape/grid math only |
| `packages/native-babylon-block-profile/src/layout.ts` | Finalize-time declared-placement equality and tamper detection |
| `packages/native-babylon-block-profile/src/index.ts` | one current root export surface |
| package tests | type surface, preflight, rollback, Finalize and forbidden dependency evidence |
| Builder Skill and output contract | one AI-facing dialect and examples; no correctness authority |
| source-admission and reconstruction fixtures | prove generated modules use the current API without new authority |

The checked-epoch evidence bridge remains Host-only. The drawing API must not expose it, add Scene-readable
state, or let the Native Module query checked evidence after Finalize.

## 11. Clean-break ledger

The accepted implementation checkpoint deletes or replaces all of the following together:

1. the old `BabylonNativeBlockCreateInputV1` shape without `centerMetersXYZ`;
2. every Profile consumer that calls `createBlock()` and then mutates `position` or Y rotation for placement;
3. package/fixture-local helpers whose only job is create-then-position/quarter-turn;
4. Builder Skill examples and instructions teaching create-then-mutate placement;
5. active generated modules, fixtures and Skill examples that still use the replaced placement dialect.

The checkpoint must not add `placeBlock`, `addBlock`, `createBlocks`, or legacy overload aliases. Existing
immutable completed Attempts, Packages, Receipts and Captures keep their original hashes and bytes; the Host
creates new identities for later runs.

Ordinary Babylon Mesh transforms remain legal outside this optional Profile. The clean break governs Profile
Block placement, not all Babylon Native visuals.

## 12. Verification evidence

Focused RED/GREEN evidence must cover:

- compile-time required `centerMetersXYZ` and closed public field sets;
- NaN, Infinity, negative zero normalization, sparse arrays, accessors and unknown fields;
- only `0 | 1 | 2 | 3` quarter-turns;
- asymmetric rotated `quarter` X/Z residues;
- shape-specific lattice rejection before Mesh allocation;
- stable Grid child IDs, positions and Y/Z/X return order;
- positive safe counts, multiplication overflow and whole-batch budget preflight;
- duplicate ID and occupied-cell conflicts with zero new Meshes;
- mid-batch construction failure with reverse cleanup and reusable open Session;
- cleanup failure moving the Session to `failed`;
- single Block and one-cell Grid producing equivalent checked layout identity after normalizing their
  intentionally different Block IDs;
- post-create transform/scale/parent/geometry mutation rejected by Finalize;
- explicit Collider selection unchanged and Grid never creating one;
- Finalize/dispose idempotency and throwing cleanup;
- package boundary still forbidding Runtime/Havok/Compiler/Three/browser/time/random authority;
- Builder Skill examples and source-admission fixtures using only the current API.

Only the final frozen candidate needs exact-SHA Cloud affected/full gates and an independent Mode B plus
runtime-deep review. Development iterations run focused tests and typecheck only.

## 13. Work graph

| ID | Goal | depends_on | blocks | Ownership | Evidence | Mode |
|---|---|---|---|---|---|---|
| WRC-API-00 | Freeze this design, one migration SHA and clean-break ledger | completed BWB-6 plus current NBR authorities | all implementation | design docs only | link/truth/diff review + independent exact-SHA review | main-agent-only |
| WRC-API-10 | Freeze RED public types and failure/atomicity cases | WRC-API-00 | 20, 30 | package type/tests | expected compile/runtime RED | sequential |
| WRC-API-20 | Implement atomic positioned `createBlock()` | 10 | 30, 40 | shapes/session/layout | focused Session/Layout GREEN | sequential |
| WRC-API-30 | Implement preflighted atomic `createBlockGrid()` | 20 | 40 | session + tests | ID/order/budget/rollback GREEN | sequential |
| WRC-API-40 | Atomically migrate package, fixtures and Builder Skill | 20, 30 | 50 | consumers + Skill | no create-then-position census; Skill gate | main-agent-only |
| WRC-API-50 | Regenerate representative authored-source and Package identity | 40 | 90 | active fixture/Case owner only | new authoredSourceHash, Candidate, Package and Receipt | main-agent-only |
| WRC-API-90 | Final affected gates, exact-SHA Cloud review and backlog truth | 50 | none | integration/docs | zero open P0/P1; clean tree | main-agent-only |

No implementation task may begin until WRC-API-00 is accepted. The public interface switch is one atomic
main checkpoint even if implementation commits are incremental on the feature branch.

## 14. Completion definition

This slice is complete only when:

- the Profile root exposes one placement dialect with `createBlock()` and `createBlockGrid()`;
- every active consumer and Builder example uses it;
- no old overload, alias, fallback, local create-then-position helper, or active generated source using the
  replaced placement dialect remains;
- Finalize still freezes one checked Layout and explicit Collider Contribution without another Runtime owner;
- the representative Native reconstruction Case produces a new checked Package/Receipt through the normal
  production route;
- focused gates and final exact-SHA review have no open P0/P1; and
- WRC-1 and the live backlog describe the feature as a BWB Profile enhancement, not a new work package or
  completed BNA-6/BNA-7/WRC-1 capability.
