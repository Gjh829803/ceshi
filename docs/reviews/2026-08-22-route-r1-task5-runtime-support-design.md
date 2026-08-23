# Route R1 Task 5: single-source runtime support design

Status: complete; implementation and full relevant gates are green, the fresh
host final is `GO`, and the stage-boundary Cursor completion review is `FINAL GO`
Branch: `codex/m5-route-r1-heightfield`
Stage base: `be7be391ed5c1eb19c904d6c3e0135de562078a5`
Authoritative plan: `docs/superpowers/plans/2026-08-22-route-graph-traversability-r1-heightfield-implementation-plan.md`, Task 5
Frozen movement authority: `docs/superpowers/specs/2026-08-21-control-feel-physics-medium-state-resolver-design.md`

## 1. Decision

Task 5 adds a provider-neutral, immutable runtime-evidence contract and a trusted
Babylon adapter port. It does not add another grounding system:

1. Babylon/Havok `PhysicsCharacterController.checkSupport()` is the only owner
   of `supported | sliding | unsupported`.
2. `MotionKernelRuntimeV1.publishResolvedState()` copies that one sample before
   passing it to `resolveCharacterStateV1()` and retains the copy read-only.
3. The R1 classifier may correlate an already-supported sample to the locked
   Heightfield surface or compiled static-collider index. It only enriches
   evidence; it cannot change `movementMedium`, locomotion mode, jump
   eligibility, velocity, or physics state.
4. The traversal port submits a unit world-XZ walk direction to the existing
   Motion Kernel and shares the Browser path's post-command physics, visual,
   animation, and camera commit loop.

No Havok body handle, contact manifold, Babylon mesh handle, camera-relative
input, or validation threshold crosses the public Traversal boundary.

## 2. Authority map

| State | Single owner | Task 5 consumer | Forbidden second owner |
| --- | --- | --- | --- |
| Raw support state and normal | one Character Controller `checkSupport()` per probe tick | Motion Kernel resolver and evidence copy | terrain sampling, ray/AABB grounding |
| Movement medium and locomotion mode | `resolveCharacterStateV1()` from the retained raw support sample | Snapshot, animation, runtime evidence | surface classifier |
| Traversal surface identity | evidence-only correlation of the retained sample to locked V5 geometry | runtime probe validation | provider contact handles or visual object names |
| Fixed simulation time | `BabylonWorldRuntime` fixed-tick loop | Browser input and traversal port | render-frame delta |
| World-XZ traversal intent | Validation driver through `TraversalRuntimePortV1` | existing Motion Kernel command | Camera Director control frame |
| Camera orbit | Camera Director | shared post-tick camera update | traversal driver |
| V5 static physics bodies | `ExecutionPlanV5.staticColliders` | Babylon body construction and Graph source | `objects[].collisionEnabled` |

## 3. Provider-neutral contracts

The following contracts live in `@whitebox-world/traversal`. Canonicalizers
reject unknown fields, non-finite tuples, invalid closed enums, invalid ticks,
invalid fixed time steps, and non-lowercase SHA-256 values. Returned values are
structured-cloned and deeply frozen.

```ts
export type CharacterSupportSurfaceResolutionV1 =
  | Readonly<{
      mode: "resolved";
      traversalSurfaceId: string;
      surfaceEntityId: string;
      colliderSubshapeId: string;
      resourceRef: string;
      resolvedVersion: string;
      resourceHash: `sha256:${string}`;
    }>
  | Readonly<{ mode: "unsupported" | "unmatched" | "ambiguous" }>;

export interface CharacterSupportEvidenceV1 {
  readonly kind: "character-support-evidence";
  readonly schemaVersion: 1;
  readonly supportState: "supported" | "sliding" | "unsupported";
  readonly supportNormalWorldXYZ: readonly [number, number, number];
  readonly sampledFootPositionMetersXYZ: readonly [number, number, number];
  readonly isSupportSurfaceDynamic: boolean;
  readonly surfaceResolution: CharacterSupportSurfaceResolutionV1;
}

export interface TraversalRuntimeWorldIdentityV1 {
  readonly authoringSpecHash: `sha256:${string}`;
  readonly layoutSolveReportHash: `sha256:${string}`;
  readonly resourceLockHash: `sha256:${string}`;
  readonly executionPlanHash: `sha256:${string}`;
}

export interface TraversalRuntimeTickEvidenceV1
  extends TraversalRuntimeWorldIdentityV1 {
  readonly kind: "traversal-runtime-tick-evidence";
  readonly schemaVersion: 1;
  readonly tick: number;
  readonly traversingEntityId: string;
  readonly resolvedTraversalLockHash: `sha256:${string}`;
  readonly runtimeImplementationIdentity: TraversalRuntimeImplementationIdentityV1;
  readonly fixedTimeStepSeconds: number;
  readonly subjectPositionMetersXYZ: readonly [number, number, number];
  readonly velocityMetersPerSecondXYZ: readonly [number, number, number];
  readonly movementMedium: "ground" | "air";
  readonly locomotionMode: "idle" | "walk" | "run" | "airborne";
  readonly characterSupport: CharacterSupportEvidenceV1;
}

export interface TraversalRuntimePortV1 extends TraversalRuntimeWorldIdentityV1 {
  readonly kind: "traversal-runtime-port";
  readonly schemaVersion: 1;
  readonly traversingEntityId: string;
  readonly resolvedTraversalLockHash: `sha256:${string}`;
  readonly runtimeImplementationIdentity: TraversalRuntimeImplementationIdentityV1;
  readLatestTickEvidence(): TraversalRuntimeTickEvidenceV1;
  resetToStartAnchor(request: Readonly<{
    startAnchorEntityId: string;
  }>): TraversalRuntimeTickEvidenceV1;
  runFixedTick(request: Readonly<{
    walkDirectionWorldXZ: readonly [number, number];
  }>): Promise<TraversalRuntimeTickEvidenceV1>;
}

export type TraversalRuntimeErrorCodeV1 =
  | "TRAVERSAL_RUNTIME_EVIDENCE_INVALID"
  | "TRAVERSAL_RUNTIME_PLAN_NOT_V5"
  | "TRAVERSAL_RUNTIME_LOCK_MISMATCH"
  | "TRAVERSAL_RUNTIME_WORLD_IDENTITY_MISMATCH"
  | "TRAVERSAL_RUNTIME_LIVE_LOCK_MISMATCH"
  | "TRAVERSAL_RUNTIME_NOT_CONTROLLED"
  | "TRAVERSAL_RUNTIME_START_ANCHOR_INVALID"
  | "TRAVERSAL_RUNTIME_WALK_DIRECTION_INVALID"
  | "TRAVERSAL_RUNTIME_EVIDENCE_UNAVAILABLE"
  | "TRAVERSAL_RUNTIME_UNAVAILABLE";

export class TraversalRuntimeErrorV1 extends Error {
  readonly code: TraversalRuntimeErrorCodeV1;
}
```

Failure precedence and ownership are deterministic:

| Trigger | Code |
| --- | --- |
| evidence canonicalizer rejects a closed field/invariant | `TRAVERSAL_RUNTIME_EVIDENCE_INVALID` |
| factory receives a non-V5 Runtime | `TRAVERSAL_RUNTIME_PLAN_NOT_V5` |
| receipt/hash/compiled Plan/immutable implementation identity mismatch | `TRAVERSAL_RUNTIME_LOCK_MISMATCH` |
| Graph and Runtime identify different legal worlds, or the Runtime's V5 Plan bytes drift after port creation | `TRAVERSAL_RUNTIME_WORLD_IDENTITY_MISMATCH` |
| live capsule/offset/slope/step or active/requested Feel/Motion/Profile identity differs from the lock | `TRAVERSAL_RUNTIME_LIVE_LOCK_MISMATCH` |
| Runtime currently controls another Subject | `TRAVERSAL_RUNTIME_NOT_CONTROLLED` |
| Anchor ID/list/placement is absent or inconsistent | `TRAVERSAL_RUNTIME_START_ANCHOR_INVALID` |
| direction is non-finite, non-2-tuple, or neither zero nor unit within tolerance | `TRAVERSAL_RUNTIME_WALK_DIRECTION_INVALID` |
| port-owned reset has not completed, or an ordinary reset/rebind-back invalidated its epoch | `TRAVERSAL_RUNTIME_EVIDENCE_UNAVAILABLE` |
| Runtime is disposed or its internal fixed-step/physics host is unavailable | `TRAVERSAL_RUNTIME_UNAVAILABLE` |

Checks run in this order: Runtime availability; creation-time Plan/receipt lock;
current control owner; live lock; port initialization/epoch; request-specific
Anchor/direction. Public messages never include provider text or native causes.

The Resource Lock and Traversal Lock are integrity bindings over output from the
trusted Normalizer/Compiler/Host boundary; they are not signatures and do not
claim authenticity when an untrusted caller is allowed to synthesize a new Plan
and a matching receipt together. `resolvedVersion` and every complete Resource
Lock row remain covered by `resourceLockHash`, while Runtime behavior is closed
against the selected content hashes and compiled Subject values. Authenticating
the producer itself belongs to WorldPackage signing/admission, outside Task 5.

Subject capability identity is not world identity. Two legal worlds may reuse
the same Subject and therefore the same `resolvedTraversalLockHash`. Runtime
Port and Tick Evidence consequently carry the same `authoringSpecHash`,
`layoutSolveReportHash`, and `resourceLockHash` fields as `TraversalGraphV1`;
`assertTraversalRuntimeWorldIdentityMatchesGraphV1()` compares them before a
Route Probe may reset or tick. `executionPlanHash` additionally freezes the
complete V5 Plan bytes at Runtime creation, before asynchronous or physics
initialization. Port creation and every later operation recompute and compare
that baseline, including closed handling of canonical-hash failures. It detects
drift before or after Port construction; it is not a signature and is not
substituted for the three Graph-to-Runtime world bindings.

`walkDirectionWorldXZ` accepts exactly zero length (stop) or unit length within
`1e-9`. Task 6 quantizes the direction components and then re-normalizes before
calling this port. It cannot carry speed, jump, run, gravity, step, slope, capsule,
camera, timeout, or validation-counter overrides. `locomotionMode` keeps `run`
in the evidence union because it reports the actual existing Motion Kernel
state; the traversal port itself never requests it.

Cross-field invariants are closed:

- raw `unsupported` requires `surfaceResolution.mode === "unsupported"`,
  `movementMedium === "air"`, `locomotionMode === "airborne"`, and no surface
  identity fields;
- raw `supported | sliding` requires `movementMedium === "ground"` and a
  surface mode of `resolved | unmatched | ambiguous`;
- `resolved` carries the complete `TraversalSurfaceIdentityV1`, never a partial
  optional identity;
- a dynamic support surface cannot resolve to the static R1 Heightfield;
- `unmatched`, `ambiguous`, and `unsupported` never carry surface IDs.

## 4. Retained support sample and call-count boundary

The Motion Kernel stores this internal immutable shape:

```ts
type RetainedCharacterSupportSampleV1 = Readonly<{
  supportState: "supported" | "sliding" | "unsupported";
  supportNormalWorldXYZ: readonly [number, number, number];
  sampledControllerCenterMetersXYZ: readonly [number, number, number];
  sampledFootPositionMetersXYZ: readonly [number, number, number];
  isSupportSurfaceDynamic: boolean;
}>;
```

It is written only inside `publishResolvedState()` from the exact
`CharacterSurfaceInfo` argument plus controller center and foot positions copied
at that same pre-integration instant. Classification never reads the later live
controller pose. Constructor bootstrap, reset/reset-to-anchor,
`step()`, and `publishSupport()` each call `checkSupport()` exactly once before
publishing. Evidence getters return defensive immutable copies and never call
`checkSupport()`, `integrate()`, `_step()`, raycasts against the physics engine,
or any other support query.

The Runtime owns a monotonically increasing traversal-binding/configuration
epoch. Rebind, ordinary Runtime reset, and accepted Feel/Motion changes advance
that epoch. Rebind also clears retained traversal evidence on both the previous
and new control targets. A port remains unavailable until its own successful
`resetToStartAnchor()` records the new epoch and bootstrap sample. It rejects
reads or ticks while its locked traversing Subject is not the current controlled
entity, after a rebind-away/rebind-back cycle, or after a locked Profile change.

## 5. Evidence-only Heightfield surface classification

Classification starts from the retained sample and is total:

1. Raw `unsupported` returns `unsupported` immediately. Terrain sampling is not
   consulted.
2. Dynamic support returns `unmatched`; R1 publishes only a static Heightfield
   surface.
3. Use only `sampledFootPositionMetersXYZ` frozen with `checkSupport()`. It was
   computed from the installed Babylon 9.21.2 public semantics:
   `sampledControllerCenter - up * footOffset`. The post-integration controller
   pose and `subjectPositionMetersXYZ` are never used for this classification.
4. Sample the exact shared `emitTriangleHeightfieldSurfaceV1()` topology at the
   foot XZ. A Heightfield candidate requires:
   - the sample exists inside the compiled terrain;
   - absolute foot-to-surface Y gap is no more than
     `keepDistance + keepContactTolerance` from the installed controller;
   - retained contact normal and sampled triangle normal are finite, non-zero,
     same-hemisphere, and their normalized dot product is at least the locked
     controller `maxSlopeCosine`.
5. Correlate the same narrow vertical contact band against the dedicated V5
   collision meshes generated from `staticColliders`. The only collider
   predicate is a vertical mesh-triangle query through the frozen foot XZ from
   `footY + contactBand` to `footY - contactBand`, followed by the same retained
   normal-versus-hit-normal compatibility check. There is no AABB, radius-sphere,
   horizontal-nearness, visual-object, or provider-handle fallback. A vertical
   hit never becomes a Traversal Surface identity; it only prevents a false
   terrain resolution. Thus a wall or curb outside the foot XZ column does not
   cause ambiguity, while an exact edge/top hit inside the column does.
6. Exactly one Heightfield candidate and no collider candidate returns
   `resolved`. Zero Heightfield candidates returns `unmatched`. Multiple
   Heightfield candidates, or a Heightfield candidate overlapping a collider
   candidate, returns `ambiguous`.

The classifier reads geometry only after Havok has said support exists. Its
result is therefore a semantic projection of physics evidence, never a second
physics fact.

## 6. V4/V5 runtime construction

`BabylonWorldRuntime`, Camera Director, and Subject Visual accept only the
explicit `ExecutionPlanV4 | ExecutionPlanV5` union (or a named common read-only
projection). No arbitrary plan-shaped structural type is introduced.

- V4 retains its current compatibility behavior: square terrain uses
  `PhysicsShapeHeightField`, rectangular terrain uses `PhysicsShapeMesh`, and
  object bodies come from `objects[].collisionEnabled`.
- V5 terrain always uses `PhysicsShapeMesh` over the same mesh created by
  `createTerrainMesh()`, which already consumes the shared canonical emitter.
- V5 `objects` remain visual rows only. Physics construction never reads their
  `collisionEnabled` flag.
- V5 creates one dedicated, unparented collision mesh and exactly one static
  body per `staticColliders` row. Box, sphere, and cylinder come from a shared
  provider-neutral static-collider triangle emitter used by both Runtime and
  Graph. A cone visual therefore still produces the compiler-locked cylinder
  collider; the cone visual node never receives a body.
- The collision mesh starts with unscaled local emitter vertices. The Runtime
  applies the complete row position, rotation quaternion, and `scaleXYZ` to that
  unparented node, forces its world matrix, and only then constructs one
  `PhysicsShapeMesh` followed by one static body/aggregate with child inclusion
  disabled. It never mutates any part of the node TRS afterward, never manually
  bakes scale into vertices, and explicitly owns/disposes both the shape and
  aggregate. Babylon 9.21.2 `MeshAccumulator` therefore bakes exactly the node's
  absolute scale once while `PhysicsBody` captures the same node position and
  rotation during construction. This also avoids the analytic sphere
  non-uniform-scale fallback.
- The evidence classifier queries the same collision mesh with its already
  frozen world matrix. Graph continues applying its existing full
  `transformSoup(position, rotation, scale)` to the same shared local vertices;
  extracting the local emitter does not remove Graph's world transform.
- Runtime and Graph each receive the same immutable `ExecutionPlanV5.staticColliders`
  rows. A regression compares their canonical row bytes and separately proves
  one V5 body per row with no object-derived duplicate. The expected V5 body
  count is `1 terrain + staticColliders.length + subjects.length`; each Character
  Controller owns one animated body. V4 retains
  `1 terrain + collisionEnabled objects + subjects.length`.

The existing immutable
`BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1` is referenced verbatim.
Task 5 does not rewrite its manifests, hashes, Ref, or version.

## 7. Trusted reset and fixed-tick execution

The complete factory signature is:

```ts
createBabylonTraversalRuntimePortV1(input: Readonly<{
  runtime: BabylonWorldRuntime;
  traversalLockReceipt: ResolvedTraversalLockReceiptV1;
}>): TraversalRuntimePortV1
```

It validates before returning a port:

- the plan is V5;
- `resolveTraversalLockV1(receipt.lock)` reproduces the supplied lock hash;
- lock subject, collider, physics-body, locomotion, Control Feel, Control,
  Motion, Motion Kernel, Medium, capsule, slope, and step values match the
  compiled Subject exactly;
- lock runtime identity exactly equals
  `BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1`;
- the locked Subject is the current controlled entity;
- live controller `shapeOptions.capsuleRadius/capsuleHeight`, `footOffset`,
  `maxSlopeCosine`, `maxStepHeight`, controller-center offset, active Feel,
  requested/pending Feel, active Motion/Profile Kernel, requested/pending Motion,
  Physics Body, Locomotion, Control, and Medium identity match the lock and
  compiled Subject. These checks repeat before every read/reset/tick and before
  any reset mutation or support query. No provider handle enters evidence.

The returned port starts uninitialized. `readLatestTickEvidence()` and
`runFixedTick()` fail with `TRAVERSAL_RUNTIME_EVIDENCE_UNAVAILABLE` until the
port itself completes `resetToStartAnchor()`. Accepted Runtime Feel/Motion
changes invalidate the epoch before their pending value can commit, so a direct
tick cannot silently run an unlocked Profile. Live capsule/slope/step drift is
also rejected before simulation.

`resetToStartAnchor()` requires the ID in `traversal.anchorEntityIds` and an
exact `layout.placementsByEntityId[startAnchorEntityId]` row. It performs one
merged deterministic reset; it must not call ordinary `BabylonWorldRuntime.reset()`
and then teleport. Every non-traversing Subject resets once to its compiled spawn.
The traversing Subject resets once directly to the selected placement: visual
origin is `placement.transform.positionMetersXYZ`; controller center is that
position plus `colliderCenterOffsetMetersXYZ`; only
`placement.transform.rotationEulerRadiansXYZ[1]` becomes yaw; pitch, roll, and
scale are ignored for the upright Character Controller. Each Subject performs
exactly one unpublished bootstrap integration followed by exactly one support
query. Before any mutation/bootstrap/query, the port checks active and
requested/pending Feel/Motion identities against the lock. The merged operation
then clears velocity/input/animation/tick and prior evidence, records the new
epoch, and publishes only the selected Anchor's tick 0 evidence.

Browser input and traversal intent share one fixed-tick skeleton:

1. set the tick's input ownership;
2. submit either the existing camera-relative compiled command or one canonical
   `planar-vector` world-XZ walk command;
3. give every other Subject exactly one support probe/step as today;
4. run one Havok fixed step;
5. increment the simulation tick;
6. synchronize visuals, resolve animation, and update Camera Director once;
7. publish evidence from the already-retained pre-integration support sample and
   its frozen foot pose, alongside the post-integration Subject position.

The direct path never calls `CameraDirector.controlFrame()`. Camera yaw may alter
rendering but cannot alter identical world-XZ traversal commands or resulting
runtime evidence.

## 8. Installed dependency evidence

Verified against the installed dependencies in this worktree:

- `@babylonjs/core` 9.21.2;
- `@babylonjs/havok` 1.3.14;
- `PhysicsCharacterController.checkSupportToRef()` resets and derives one
  `CharacterSurfaceInfo` from the current contact manifold;
- controller `footOffset` defaults to half capsule height;
- controller contact band is exposed as `keepDistance` plus
  `keepContactTolerance`;
- `CharacterSurfaceInfo` exposes no contact point/body/shape identity, so the
  surface classifier is necessarily a conservative geometry correlation;
- `PhysicsShapeMesh` delegates to Havok's `MeshAccumulator`, which bakes absolute
  mesh scale into shape vertices and retains transform position/rotation on the
  body.

These assumptions are preserved by focused real-Havok regressions rather than
comments alone.

## 9. Required RED and completion evidence

Tests must first fail because the evidence seam/port is absent, then prove:

- constructor, reset, reset-to-anchor, supported, sliding, unsupported, and
  uncontrolled ticks each add exactly one support query;
- retained support is immutable, byte-stable, and readable without physics;
- a seam-crossing tick proves the raw support and surface identity use the
  frozen pre-integration foot while Subject position is post-integration;
- terrain sampling cannot manufacture support or mutate movement medium;
- resolved/unmatched/ambiguous/unsupported and sliding remain distinct;
- a wall/curb outside foot XZ remains resolved terrain; standing on a box whose
  top is beyond the terrain contact band is unmatched; standing on a 0.1 m box
  inside the terrain band, including an exact top/edge hit, is ambiguous;
- asymmetric saddle render mesh, V5 PhysicsShapeMesh, sampler, and Graph source
  use the same cell diagonal;
- V5 static rows, including cone-to-cylinder, are byte-identical at Runtime and
  Graph inputs; shared collider soup vertices agree; non-uniform scale is baked
  exactly once; a non-origin/yawed/non-uniform collider gives the same Havok and
  CPU world triangles; body counts follow the explicit formulas; V4 remains
  unchanged;
- port creation/read/reset/tick failures use exact `TRAVERSAL_RUNTIME_*` codes
  without Babylon/Havok/native messages;
- non-zero collider-center offset and pitched Anchor reset correctly while only
  Anchor yaw is applied;
- reset-to-anchor is one merged reset with exactly one support query per Subject,
  never spawn-reset plus teleport; pending/requested unlocked Feel or Motion
  fails before any mutation or support query;
- create-before-reset, ordinary reset, rebind-away/back, Profile mutation, and
  live slope/step mutation cannot expose or simulate with stale evidence;
- Graph A cannot drive Runtime B merely because both worlds reuse one Subject
  Traversal Lock, and an in-place V5 Plan mutation cannot retain a stale
  `executionPlanHash` or leak raw canonical-serialization errors;
- terrain-outside XZ returns unmatched through unclamped
  `sampleTriangleHeightfieldSurface()`;
- identical world-XZ commands and fixed ticks produce identical evidence under
  different camera yaw.

Task 5 completion requires the focused runtime set, full relevant tests,
typecheck, build, host deep-runtime review, one independent Cursor code review,
confirmed-finding follow-up only, and one fresh Cursor completion review.

## 10. Explicitly out of scope

- Task 6 route-driving thresholds, counters, lookahead, arrival, stall,
  deviation, support-loss duration, timeout, or receipts;
- Task 7 validation gates;
- Browser/CLI protocol expansion;
- swimming or a first-slice `movementMedium: "water"`;
- a new camera algorithm;
- static platforms as publishable R1 Traversal Surfaces;
- raw Havok/Babylon handles or provider diagnostics;
- changes to frozen runtime implementation identity;
- AI-facing Authoring Schema changes. The unreleased `ExecutionPlanV5` adds the
  complete canonical `resourceLockEntries` required to bind Compiler, Graph,
  and Runtime to one Resource Lock; no Authoring field or compatibility alias
  is introduced.

## 11. First Cursor design-review dispositions

Review chat: `2bb513dc-1e18-4764-9ebc-db36a9044d4d`
First verdict: `DESIGN NO-GO`

| Finding | Host disposition | Evidence and action |
| --- | --- | --- |
| P1 frozen support pose | confirmed | Babylon samples before integrate; v2 freezes center/foot and classifies only that pose. |
| P1 collider candidate predicate | confirmed | `CharacterSurfaceInfo` has no contact ID; v2 freezes one vertical exact-mesh/normal predicate and adversarial cases. |
| P1 V5 scale/parent order | confirmed | Installed `MeshAccumulator` uses absolute scale once; v2 freezes unparented construction order and shared soup. |
| P1 live lock proof | confirmed | Plan bytes alone cannot prove live slope/step/Profile state; v2 requires initial and per-operation live checks plus an epoch. |
| P1 stable failures | confirmed | The first draft had no error vocabulary; v2 freezes `TraversalRuntimeErrorCodeV1`. |
| P1 reset offset/yaw | confirmed | Existing reset uses origin plus offset; v2 reuses it and applies Anchor yaw only. |
| P1 evidence lifecycle | confirmed | Rebind and ordinary reset could expose unrelated samples; v2 requires port-owned reset and epoch invalidation. |
| P2 `status` versus `mode` | confirmed | AGENTS reserves `mode` for mutually exclusive runtime state; v2 renames it. |
| P2 Runtime/Graph subdivision | confirmed | Silent tessellation drift hurts double-gate diagnosis; v2 chooses one shared provider-neutral soup. |
| P2 open numeric/factory/body/outside contracts | confirmed | v2 fixes `1e-9`, the factory signature, body-count formulas, and unclamped outside behavior. |

Second same-session review returned `DESIGN NO-GO` with two new P1s and four
clarifying P2s. Host dispositions:

| Finding | Host disposition | Evidence and action |
| --- | --- | --- |
| P1 full V5 world pose before body construction | confirmed | Installed body initialization captures position/rotation while MeshAccumulator captures scale; v2 now freezes full TRS before shape/body and forbids later pose mutation. |
| P1 merged reset and pending Profile check | confirmed | Ordinary reset already performs a spawn support query and restores last-requested profiles; v2 now requires one direct reset per Subject and checks active/requested/pending state before mutation. |
| P2 error-code dispatch | confirmed | v2 now maps every trigger and fixes check precedence. |
| P2 stale plan wording | confirmed | the implementation plan now names frozen sample pose, vertical exact-mesh correlation, and `mode`. |
| P2 low box versus tall box | confirmed | v2 distinguishes in-band ambiguity from out-of-band unmatched. |
| P2 shared soup space | confirmed | v2 explicitly preserves Graph's complete world transform and Runtime node TRS. |

The final same-session review closed both new P1s and all clarifying P2s and
returned `DESIGN GO` with no new reproducible P0-P3. Design chat:
`2bb513dc-1e18-4764-9ebc-db36a9044d4d`.

## 12. Current implementation and review disposition

As of 2026-08-23, the Task 5 implementation in this branch is complete, with the
following boundaries present in the current diff:

- V5 Runtime support consumes `ExecutionPlanV5` Heightfield geometry and
  `staticColliders` as the physics authority while retaining the explicit V4
  compatibility path. The provider-neutral traversal port, immutable runtime
  evidence, merged Anchor reset, fixed world-XZ tick path, and evidence-only
  Heightfield/static-collider correlation are implemented.
- The complete Execution Resource Lock is carried into V5, canonically hashed,
  bound into the Traversal Lock, and checked against the compiled Subject and
  every required Resource authority before port creation and each operation.
  Missing, reordered, forged, or internally self-consistent but unrelated lock
  rows fail closed rather than being accepted from matching selected fields.
- Runtime Port and every Tick Evidence publish the provider-neutral World
  Identity shared with the Traversal Graph. A Graph and Runtime from different
  legal worlds are rejected even when they reuse one Subject Traversal Lock;
  the complete Runtime-creation `executionPlanHash` additionally detects
  in-place Plan drift both before and after Port creation, and closes canonical-
  hash failures without leaking provider or serialization errors.
- The retained Character Controller support sample remains the only support
  authority. Each fixed tick performs its single support query before evidence
  publication; if that query or the post-query Runtime step fails, the port
  returns the closed `TRAVERSAL_RUNTIME_UNAVAILABLE` failure and cannot publish
  stale success evidence. Constructor, ordinary reset, Anchor reset, supported,
  sliding, unsupported, and uncontrolled paths all have exact call-count
  regression evidence.
- V5 `supported-by` revalidation uses the exact transformed canonical static
  collider triangle mesh. It does not infer support from a visual primitive or
  its AABB, including the cone-visual-to-cylinder-collider case.

The Task 5-focused and full repository gates pass for this implementation
state: 124 files / 1102 tests, Typecheck, Build, canonical, placement-layout,
rigged-subject, G Bot, Route R0 Contract, and diff checks are green. The fresh
host deep-runtime review found one cross-world identity P1 and one support-call
coverage P2, then one pre-Port Plan-drift timing P1 during narrow follow-up; all
are closed in the current tree, and the final narrow host review returned `GO`
with no remaining P0-P2. The required fresh Cursor completion review then
returned `FINAL GO` with no P0-P3 findings against diff fingerprint
`sha256:571d7395551e14c82039832cdce0ae23cf9e3711c81c851b6e4ccd3d3d1a432e`.
Review ID: `m5-task5-final-85ac842-571d7395`; chat ID:
`1819c74f-4030-476d-b6e3-f16f325b0c2c`. Cursor ran read-only in `ask` mode and
performed static reconciliation against the current implementation, tests, and
installed Babylon 9.21.2 / Havok 1.3.14 sources; it did not rerun host gates.
This closes Task 5 only. It does not declare the broader M5 Route R1/R1b
milestone complete; Task 6 route driving and Task 7 blocking validation gates
remain outside this implementation.
