# Native Block V2 Capability Migration and Walkable Surface Closure Design

**Project:** WRC-1 / NBR-1
**Stable task:** `NBR-65`
**Status:** accepted current-only implementation authority
**Date:** 2026-09-02
**Implementation baseline:** `origin/main@9a4639109e4d161d92297506e9fc92192d32ff44`
**Source evidence:** `origin/codex/block-world-sdk-v2@3c2e9826f0c91ef39675c27a6bbdc6238e6c0b05`, plus the accepted audit inputs `origin/codex/block-world-main-integration@8c250b5fc2181b48947d95b12fac03333bf11e5f` and `origin/codex/block-world-main-integration@d69d7f821f10328bc02dac3a83218f924e754780`

## Implementation revision record

- **2026-09-04 — v2 production-loop usability parity correction:** the previous
  adaptation preserved v2 geometry/runtime behavior but did not preserve its
  causal Builder feedback loop. The Native Builder was told to use the frozen
  world plan and entry-composition target without receiving either image, while
  a traversal checkpoint that could not be measured was promoted to a Capture
  infrastructure failure and erased the otherwise admitted preview. The current
  correction binds both Planner images into every generation/repair task,
  records an unmeasured traversal checkpoint as explicit incomplete evidence,
  and separates hard Runtime admission from reconstruction-quality disposition.
  A hash-bound Evaluation Profile chooses `report-only` or
  `required-for-publication`; both modes execute the same checks and bounded
  repairs, but `report-only` preserves a runnable, explicitly non-accepted
  preview after quality budget exhaustion. No threshold is lowered and no
  Native Check, Ground Analysis, Package, Runtime, Spawn, Support, Collider,
  identity, determinism or cleanup failure becomes previewable.
- **2026-09-03 — deep v2/current-contract parity audit:** the source audit now
  includes the supplemental Block World production changes rather than treating
  the pinned v2 branch as the only evidence. The current replacement keeps actual
  source-Block top centers and shared-edge connectivity in Ground Analysis,
  proves the formal Native Module -> Package -> RuntimeHost -> Havok -> SDK
  Character path across an ascending and descending quarter-meter-smoothed ramp,
  and bounds installed-Babylon four-plane contact correction. The supplemental
  branch's fixed one-meter smoothing policy is explicitly rejected because it
  exceeds the current G Bot `maxStepHeightMeters`; current Profile topology admits
  only the 0.25-meter height increments that remain inside the 0.3-meter runtime
  step contract. The old Block-specific support cache, Mesh-name inference and
  second support state machine remain prohibited.
- **2026-09-03 — Ground Analysis admission join:** the trusted Native Package
  owner retains the checked Build-Epoch logical-ground evidence outside the
  serialized Package input, constructs and verifies the Package directory in
  memory, then joins the frozen Package root, Case intent and resolved Subject
  traversal envelope into `BabylonNativeBlockGroundAnalysisReportV1` before any
  Package directory is published. A ground Case with failed Spawn or required
  target standability fails closed and retains the checked authored source,
  Attempt result, logical model, report and actionable diagnostics as Attempt
  evidence. When the diagnostics are repairable and the bounded repair budget remains,
  this evidence starts the next Attempt without fabricating a Package or Capture for the
  rejected Attempt. This is a concrete placement of
  the existing section 5/6 design; it adds no third Scene Source, Package field,
  Runtime support owner or circular Package hash.
- **2026-09-03 — final-topology admission identity:** Ground Analysis runs after
  the global walkable topology is frozen, binds that topology hash in its report,
  and samples its collision triangles at exact Spawn, required-target and band
  waypoint positions. Raw support occupancy cannot make admission pass when
  smoothing moved the final surface or materialization left a hole. Native Block
  Ground uses its own Registry Profile Ref and explicit Profile value; equal
  current numeric limits do not couple its identity or future tuning to the
  Heightfield lane.
- **2026-09-03 — executable parity evidence:** a parity row may be `passed`
  only when its closed focused verification gate returns exit code zero on the
  current tree. Source fragments remain discoverability evidence, not GO proof.

## 1. Decision

The Babylon Native Block lane must migrate every reusable scene-reconstruction and ground-playability
capability proven by the v2 branch, rather than only copying its visual block style. The migration is
behavioral and evidence-based: it keeps Babylon Native authoring and the current WorldKit production
owners, while replacing v2's Three.js adapter, persistent Block Manifest and Block Compiler.

```text
Reference / Scene Brief / JSON control plane
  -> Babylon Native Block Module
  -> Build-Epoch-local checked logical Block inventory
  -> Host-derived surface, connectivity, batching and collision realization
  -> frozen Contributions + WorldPackage + Receipt
  -> existing RuntimeHost + SDK-owned Havok/Subject/Input/Action/Camera
  -> formal Capture + reconstruction evaluation
```

The accepted tree still has exactly two mutually exclusive Scene Sources: Canonical JSON and Babylon
Native. The checked logical Block inventory is derived evidence inside one Native Build Epoch; it is
not a third Scene Source, a persistent Agent-authored Manifest, a shadow Canonical Plan, or a Compiler
input.

`NBR-65` remains a vertical-slice prerequisite to `NBR-70`, not a thirty-fourth WRC-1 work package.
The previously completed BWB-6 assessment remains truthful as an assessment, but its proposed Thin
Instance, Chunk and Collider reductions are not runtime capabilities until this design realizes and
verifies them.

## 2. Evidence reviewed and current gap

The v2 conclusion is supported by its code, not by the old branch title:

- `packages/block-world/src/check.ts` derives whole-footprint support, body clearance, standable
  positions, step-aware adjacency, Spawn/target reachability, bounded traversal bands, connected
  components and exploration metrics from logical blocks;
- `packages/runtime-babylon/src/block-walkable-surface.ts` derives exposed top tiles, shared-vertex
  walkable geometry, deterministic triangle diagonals, cliff skirts and global exposed edges;
- `packages/runtime-babylon/src/block-chunk-collision.ts` realizes merged per-Chunk Havok collision,
  Subject-centered residency, reverse cleanup and boundary ownership;
- `packages/runtime-babylon/src/block-ground-boundary.ts` coalesces exposed edges and applies a
  dedicated ground-kernel collision bit;
- `packages/block-world-compiler/src/clusters.ts` and the BW4/BW5 design prove stable semantic
  partitioning, deterministic coalescing, far-visible batches and logical identity preservation;
- the v2 Builder contract also separates visible reconstruction, complete-world continuation,
  structural admission and visual review.

The source audit also covers `chunking.ts`, `block-ground-stripe.ts`,
`block-space-transition.ts`, the preset/shape registries, artifact Capture integration, and the v2
Builder, Spatial Planner, Visual Reconstructor, Playthrough Planner and Episode Visual Reconstructor
Skills. Files outside that list are not silently assumed equivalent merely because a current package
has a similar name.

Latest `main` already owns the correct modern replacements for part of that behavior:

- atomic `createBlock()` and dense `createBlockGrid()` with fixed shapes, lattice, occupancy and
  deterministic insertion;
- Build-Epoch Session, structural support warnings, route-block connectivity, visual groups and
  explicit Frozen Collider Contributions;
- BWB-6 deterministic optimization assessment, but no actual Thin Instance or collision residency;
- formal Native Check/Explain, WorldPackage/Receipt, RuntimeHost, SDK-owned Havok, formal Capture,
  reconstruction diagnostics and bounded repair;
- Runtime neutral inspection lighting when a Native scene authors no light;
- one SDK `checkSupport()` authority and current Subject/Action/Camera owners.

The missing production behavior is therefore wider than one floor seam: most visible floor can still
be visual-only; the checker is not Subject-footprint-aware; mixed-height support has no shared
walkable collision topology; BWB-6 reductions are not materialized; exposed cliffs have no
ground-only boundary; and no parity receipt proves that the useful v2 ground behavior survived the
new architecture.

## 3. Complete capability disposition ledger

No v2 capability is silently dropped. Each row has one explicit disposition.

| v2 capability | Latest-main status | Current disposition and owner |
|---|---|---|
| metric fixed shapes, lattice, overlap rejection | implemented by Block Profile, with current `step` addition | retain and extend; Profile owns logical cells |
| ergonomic loops and dense repetition | implemented by `createBlock` / `createBlockGrid` | retain; no semantic road/building DSL |
| semantic visual palette and group identity | implemented by palette roles and visual groups | retain; palette never implies physics |
| provider-neutral extracted Manifest | absent by design | do not migrate; Build-Epoch checked inventory is the non-persistent replacement |
| Three.js binding/extraction | absent by design | do not migrate; Babylon Native Module is the sole Native authoring surface |
| Block Compiler and hidden foundation | absent by design | do not migrate; use Frozen Contributions and existing WorldPackage/RuntimeHost |
| Subject and Camera declarations in block source | absent by design | already superseded by JSON control plane and `WorldRuntimeBootstrapV1` |
| Block-specific support grace/cache and Mesh-name or metadata recognition | conflicts with the one SDK support owner and explicit Contribution identity | do not migrate; the existing Character `checkSupport()` result over frozen Havok geometry remains the sole support truth |
| Block-specific third-person Subject occlusion-fade strategy | useful Camera behavior but unrelated to ground admission | assign to `WRC-CAM-1/2`; do not bypass the current Camera Domain or Spring Arm contracts inside NBR-65 |
| preset-owned support/obstacle/visual-only semantics | only explicit one-Block Collider selections exist | migrate as explicit authoring-time Collider/Surface Groups; never infer from color |
| support union for the whole Subject footprint | missing | migrate into trusted Host ground analysis |
| solid-volume body clearance | missing | migrate using the resolved Capsule/Physics Body envelope |
| actual source-Block top centers and shared-edge center connectivity | present in v2; microcell-only current sampling could omit a one-meter Block center | migrate behind the current Ground Analysis owner while retaining denser microcell samples |
| Spawn and required target standability | narrow runtime checks only | migrate into structural analysis and retain runtime proof |
| step-aware adjacency | route-block structural approximation only | migrate using the current Physics Body's single symmetric `maxStepHeightMeters` plus slope limit and checked support topology; v2's independent up/down thresholds are not current Runtime truth |
| connected components and bounded traversal bands | missing for Native structural admission | migrate as stable Host evidence; do not call it product Route/Nav |
| reachable bounds, distance, Chunk and off-camera metrics | missing | migrate as report-only measurements; never reward empty padding |
| mixed-height shared walkable topology | missing | migrate one deterministic global topology used by visual overlay and Havok collision |
| slope-tangent movement and bounded contact correction | not proven for the derived Native surface | reproduce the observable behavior through existing movement/support owners, without a second support state machine |
| fixed one-meter automatic smoothing from the supplemental branch | conflicts with the current G Bot 0.3m step contract | do not migrate the constant; use 0.25m Profile top increments and prove the resulting continuous topology in the formal Runtime |
| independent v2 step-up / step-down thresholds | conflicts with the current single `maxStepHeightMeters` Runtime and Traversal owner | explicit non-migration; use the current symmetric limit and preserve directional failure evidence |
| fixed v2 `maximumAdjacentWalkableHeightDeltaMeters` | conflicts with legitimate separately connected high plateaus and current component/band evidence | explicit non-migration; use components, bands, explicit blockers and ground-boundary policy instead of a global two-meter authoring veto |
| v2 `smoothedWalkableEdgeCount` metric | a raw count does not prove traversability or identity | explicit non-migration; topology hash plus Package-bound uphill/downhill Runtime evidence is the stronger current proof |
| ground stripe/readable walkable overlay | missing | migrate as SDK-derived whitebox rendering bound to source Block identities; do not copy v2 shader/renderer handles into authoring |
| stable logical Chunk addressing | assessment-only grouping exists | migrate as Host-derived realization identity and Receipt evidence; never expose a public Chunk DSL |
| deterministic same-semantics batching | assessment only | realize inside the Profile/Host adapter; preserve per-Block evidence identity |
| always-visible far geometry | direct Meshes are visible but unbounded in draw cost | preserve visibility while batching; physics residency must never cull rendering |
| Chunk-resident merged Havok collision | assessment only | realize under the existing Runtime physics lifecycle |
| automatic ground-only cliff protection | missing | migrate as a frozen derived contribution with ground-kernel-only filtering |
| clear-day lit pastel whitebox | neutral Runtime lighting exists; Profile material is only partially aligned | consolidate under the existing Runtime light owner and Profile display adapter |
| Planner image lineage and complete-world continuation | current Planner/Scene Brief owns planning, but parity is not recorded here | retain current Planner owner; add NBR acceptance evidence, not a second Planner |
| Builder structural self-repair in the same task | current Native Check/Explain and bounded production repair exist | retain current task/Host split; self-check cannot bypass trusted Host replay and every post-Package repair gets a new identity |
| route course, staircase structure and semantic target pose guidance | partially implicit | migrate into the current Native Builder Skill; a new serialized per-target facing/Capture contract remains owned by NBR-70 |
| Builder preflight visual comparison | only partially adapted: formal Package-bound Capture/evaluation exists, but the Native Builder did not receive the frozen Planner images and an unmeasured traversal checkpoint could abort all Capture publication | migrate the causal behavior, not the Three renderer: bind the world plan and entry target as immutable named Builder inputs, feed Package-bound Capture/evaluation evidence into bounded repairs, and preserve an admitted preview when quality evidence remains failed/incomplete |
| directed door/portal space transitions | intentionally deferred | assign to `WRC-EVT-1`; do not hide it inside surface closure |
| cloud/water support and non-ground reachability | current Traversal Capability Envelope is ground-only | explicit deferral to Movement/Medium owners; an air Spawn makes this ground report measurement-only but proves no flight or water capability |
| interaction identities and independently addressable blocks | current gameplay/event work is separate | preserve logical Block identities; implementation belongs to `WRC-EVT-1` |
| styled opening/tri-view reconstruction | current post-whitebox visual pipeline is a separate owner | preserve the stronger source-locked current pipeline; NBR-65 only proves whitebox inputs and never edits styling outputs |
| planned playthrough, episode capture and video styling | downstream episode/video capability, not world admission | preserve under its current Recording/Playthrough owner; exclude from NBR-65 completion and ground truth |
| safe exploration-start selection and Capture-health diagnostics | downstream Playthrough/Capture evidence, not Package or support admission | preserve under the Recording/Capture owner; do not let relocation conceal a rejected Spawn or disconnected ground Case |

“Migrate every capability” means every reusable capability above is either implemented by NBR-65,
already superseded by a stronger current owner, or assigned to its existing WRC owner with an explicit
gate. It does not mean copying obsolete packages or making a ground-only Case claim water, flight,
portal or generic event completion.

## 4. One explicit authoring model

Palette and `visualGroupId` remain visual evidence. They never imply collision, support or
walkability. Each Profile-created Block may instead declare one optional `colliderGroupId`. A Block
without it remains visual-only. A dense Grid applies the explicitly supplied group to every generated
child.

Finalization declares each group exactly once through `staticColliders`. The current-only selection
contract replaces the single `blockId` field with one discriminated geometry source:

```ts
type BabylonNativeBlockColliderGeometrySourceV1 =
  | Readonly<{ kind: "block"; blockId: string }>
  | Readonly<{ kind: "block-group"; colliderGroupId: string }>;

interface BabylonNativeBlockStaticColliderSelectionV1 {
  readonly id: string;
  readonly colliderGeometrySource: BabylonNativeBlockColliderGeometrySourceV1;
  readonly traversalBinding: BabylonNativeTraversalBindingV1;
  readonly exposedEdgePolicy: "none" | "protect-ground-subject";
  readonly frictionRatio?: number;
  readonly restitutionRatio?: number;
}
```

There is one parser and no `blockId` compatibility alias. All active Modules, fixtures, Skills,
copied Skill inputs and generated examples migrate atomically. `kind: "block"` keeps exact evidence
for a singleton blocker or tread. `kind: "block-group"` is the normal whole-floor and structural-mass
path.

The Profile may join only Blocks created through the current Session. It must not infer membership
from palette, material, visual group, ID prefix, Mesh name, tag, hierarchy, or a Scene scan.

## 5. Frozen logical ground model

After layout validation and before any contribution is published, the Host freezes one logical ground
model from explicit Collider Groups:

1. expand each Block to its occupied microcells using existing Profile geometry;
2. retain the group, source Block, visual group and traversal-binding identity for every cell;
3. derive globally exposed support-top candidates only from groups whose binding is
   `static-surface`, and derive `declaredTraversalSurfaceProfileRefs` from those explicit
   selections rather than accepting a caller-supplied supported-profile list;
4. derive solid occupancy from every selected static group, including blockers;
5. bind the source/profile topology identity to the Build Epoch, checked Layout inventory hash,
   Profile inventory hash and Native Scene Bootstrap hash;
6. sort every inventory and diagnostic by stable identity before hashing.

This model is trusted derived evidence, not Agent JSON and not Runtime state. At this source/profile
boundary, `declaredTraversalSurfaceProfileRefs` means only “used by explicit static-surface
selections”; it is not a Subject-compatibility verdict. The later Package/Runtime admission resolves
the exact Registry locks and checks every resulting triangle against the controlled Subject. The model
is the single source/profile input to continuous surface construction, exposed-edge derivation,
collision aggregation and optimization realization. Ground Analysis consumes that model plus the
identity-bound final walkable topology; it must not independently rescan meshes or reconstruct a
second cell map.

The logical model deliberately does not contain the Subject traversal envelope, Case hash, Package
root or Runtime Session identity. Those values are unavailable or mutable at this source/profile
topology boundary and would create a circular identity dependency. The trusted Ground Analysis
Report is the later join point: it binds this logical-ground hash to the resolved Subject traversal
envelope, Case intent and frozen Package root before any admission claim is accepted.

## 6. Subject-relative standability and connectivity

The Host ports the v2 algorithms behind current types and owners:

- a stand sample is accepted only when the full Capsule footprint is covered by the union of
  same-height support cells;
- the deterministic sample set includes microcell centers, exact Spawn/target/band positions, and
  each source Block's actual exposed top-surface center; a one-meter Block must not become
  unstandable merely because its center lies on a microcell boundary;
- exact Spawn and required target samples come from the registered Spawn contribution and explicit
  ground-band endpoints; the Host never snaps them to a nearby support sample or visual-group center;
- after raw occupancy standability succeeds, exact Spawn, required-target and band-waypoint XZ
  positions must resolve to the final walkable collision triangles at the frozen Y; missing topology
  support or smoothing-induced height drift is a blocking, actionable failure;
- the complete vertical Capsule clearance volume must be free of selected solid occupancy;
- source Blocks whose exposed top cells share a horizontal edge connect through their actual
  surface-center samples using the current Runtime's symmetric `maxStepHeightMeters` and
  `maxSlopeDegrees` policy;
- the registered Spawn Marker and every Case-required ground pass target must bind to accepted stand
  samples, and bands form a one-to-one binding with ground pass targets by `acceptanceTargetRef`;
- the public `WorldReconstructionCaseV1` parser is the sole semantic owner of traversal-to-Collider
  closure: Collider, Contribution and checkpoint IDs are unique; Spawn support and its Collider bind
  the same acceptance target; each `pass` target binds `ground` or `step`; and each `block` target
  binds `blocker`; Native Case preparation must not maintain a shadow rule;
- required ground traversal bands constrain graph search to their declared XZ width;
- the current static ground graph is bidirectional by construction; the retired `isBidirectional`
  flag is not a supported dialect, and one-way transitions remain assigned to `WRC-EVT-1`;
- BFS from Spawn publishes reachable and disconnected components plus target/band reachability;
- report-only metrics include reachable bounds, XZ span, maximum distance, off-camera coverage and
  deterministic Chunk coverage.

The Agent does not author Capsule radius, clearance, slope or step thresholds. They come from the
trusted Gameplay/World Runtime Bootstrap and Registry closure. Native analysis resolves the dedicated
`worldkit://traversal-graph-builder-profile/outdoor-humanoid.native-block-ground@1`; it must not reuse
the Heightfield resource identity. A ground-Spawn Case fails according to its frozen connectivity
policy. An air-Spawn Case records disconnected ground as measurement-only, but the current Traversal
Capability Envelope remains ground-only; this result proves neither flight nor water movement and
cannot be used as their admission evidence.

The v2 checker exposed separate `maximumStepUpMeters` and `maximumStepDownMeters`. The current SDK
Physics Body and Traversal Capability Envelope deliberately expose one `maxStepHeightMeters`; Ground
Analysis therefore uses the same symmetric value in both directions and retains directional failure
evidence. Reintroducing independent up/down thresholds here would create a second movement policy
that Runtime does not own, so that v2 field split is an explicit non-migration rather than a silent
semantic claim.

The v2 profile also exposed a fixed `maximumAdjacentWalkableHeightDeltaMeters` and reported
`smoothedWalkableEdgeCount`. Neither value enters the current admission contract. A global adjacent
height veto would incorrectly reject two high/low walkable plateaus that are connected by a valid
stair elsewhere, while an edge count cannot prove that Spawn, targets or Havok traversal use the
same topology. Their explicit non-migration is replaced by component/band diagnostics, explicit
blocker and ground-boundary policy, topology hash identity, and Package-bound Runtime traversal.

Every failure must use the existing actionable diagnostic dialect: stable metric ID, target/source
identity, expected value, actual value, limit, delta, direction and bounded Native-source repair
action. A graph report cannot be reduced to one generic “route disconnected” message.

This graph is admission/evaluation evidence only. Runtime ground state remains the single SDK
`checkSupport()` result over frozen Havok geometry.

## 7. Continuous walkable surface and exact collision

The Host derives one global walkable topology before Chunk partitioning so a Chunk seam or Collider
Group boundary cannot become a false cliff.

- Exposed support rectangles are split on the Profile micro-grid.
- Shared corners may be joined only when their height span is within the resolved auto-smooth limit.
- The current Profile limit is constrained by the controlled Subject's 0.3m
  `maxStepHeightMeters`; with the 0.25m occupancy-height lattice, one admitted
  neighboring top increment is 0.25m. The v2/supplemental fixed 1m smoothing
  value is not a compatible policy and must not be copied.
- A discontinuity outside that limit keeps separate vertices and remains a cliff.
- Non-coplanar quads choose the deterministic lower-discontinuity diagonal.
- Internal and downward faces are omitted; required vertical blocker/cliff volume remains in explicit
  solid groups.
- The same triangle bytes are used for the visible walkable overlay and the walkable Havok proxy.
- The visible overlay is offset only by a frozen render epsilon and is identity-bound to its source
  Blocks/visual groups; this render offset never enters collision.

For a non-walkable group, exact union collision removes shared internal faces but preserves every
remaining face and hole. No convex hull, filled gap, AABB substitution or cross-semantics merge is
allowed.

Observable movement parity must be reproduced through existing SDK owners: speed along the derived
slope, stable step traversal, no snag at triangle/Chunk seams, and bounded contact correction. The
implementation should first consume the committed contact point/normal from the existing support
path. It may not restore v2's independent Runtime height sampler or publish a second ground/air
decision. If installed Havok/Babylon semantics require a provider-private geometric query, that query
may only refine motion against the exact same frozen collision topology and must not own support,
medium, jump eligibility, Snapshot or Replay state.

The supplemental branch's Block-only support grace/cache is not a parity feature to copy. Its Mesh
name/metadata recognition, private retained support and downward probe would create both an implicit
Collider registry and a second support state machine. Current NBR support therefore comes only from
explicit Frozen Contributions materialized by the existing Runtime and the same SDK `checkSupport()`
path used by other Scene Sources.

The parity gate must instantiate the formal Native scene module, pass Native
admission, construct and verify a WorldPackage, start the existing RuntimeHost,
materialize SDK-owned Havok collision, bind the SDK Character, and traverse the
same smoothed ramp uphill and downhill. Canonical heightfield slope tests,
BodyPort-only numeric fixtures, topology byte tests and generic Chunk-seam probes
remain useful but cannot substitute for this cross-owner evidence.

## 8. Batching, Chunking and residency realization

BWB-6's assessment becomes an executable plan only after correctness is frozen:

- partition logical Blocks by one Host-frozen XZ Chunk profile; choose the final Chunk size from a
  benchmark, not by blindly copying v2's 32m or the current assessment's 4m constant;
- create one visual batch only for Blocks sharing Chunk, shape, palette role and at most one semantic
  visual group;
- preserve logical Block IDs and instance indexes in the live-handle and materializer metadata so
  Capture, tinting, hiding and diagnostics retain exact identity;
- keep all finite-world visual batches resident and far-visible for opening and exploration views;
- split collision topology into deterministic Chunk parts with stable Host-derived part IDs while
  retaining one logical Collider/Surface identity in Package evidence;
- keep a bounded physics ring around every active Subject and update it before the fixed physics Tick;
  activate the Spawn ring before readiness;
- create and dispose each batch, collision Mesh, Havok shape, aggregate and boundary exactly once,
  with reverse rollback after partial failure.

Thin Instances and collision parts are internal realization details. The Agent still authors ordinary
Block calls and one logical Collider Group. No public Chunk DSL, batch ID, instance buffer, residency
radius or Runtime handle enters `scene.ts` or JSON.

## 9. Ground-only exposed-edge protection

`protect-ground-subject` is valid only on a checked static-surface group. From the global walkable
topology, the Host derives an edge when there is no same-height or admitted smooth neighbor. It
coalesces only contiguous collinear equal-slope segments, then freezes the result as an explicit
derived contribution role.

The Runtime creates an invisible boundary proxy in the same physics-Chunk lifecycle. A dedicated
membership bit is included only for locked ground movement kernels. A jumping ground Subject retains
the bit; real water, flight and glide kernels exclude only that bit while preserving unrelated
collision masks. Camera collision never treats the safety boundary as visible geometry.

Boundary geometry casts no shadow, is absent from semantic Capture targets, and is present in Collider
overlay evidence with its derived role. Reset, rebind, replay, multiple Runtime instances and throwing
cleanup must restore the exact filter and residency state. Until the role and engine-backed gates
pass, `protect-ground-subject` fails closed rather than becoming an ordinary invisible wall.

## 10. Lighting and display parity

Runtime remains the sole environment-light owner. Native Block modules must not create lights for the
production whitebox profile. The existing neutral fallback is frozen as clear-day inspection light:
one cool hemispheric ambient source plus one warm directional key. Profile materials use immutable
semantic base colors, diffuse face shading, no strong specular highlight and only a small readability
floor. Near and far batches use the same material instances and light owner.

The walkable overlay may add a subtle deterministic ground pattern, but it must not change semantic
identity, collision, evaluation masks or styled-reference lighting. Reference time of day and weather
remain downstream styled-output concerns.

## 11. Planning, evaluation and repair parity

The existing Planner remains the only Scene Brief and planning-image owner. NBR-65 does not add a
second Planner job. Acceptance nevertheless requires the useful v2 reconstruction discipline:

- the uploaded reference owns visible evidence;
- entry composition owns the opening camera, silhouettes and depth order;
- the top-down plan owns coherent hidden continuation and traversable-domain layout;
- the Builder gives every mountain, cliff, stair, platform and building a real footprint,
  cross-section, support and rear mass;
- empty bounds padding, decorative-only routes and author-authored air walls are rejected;
- structural admission, formal Package-bound Capture, automated reconstruction scores and human
  play inspection remain separate evidence layers.

The two Planner images are mandatory named, hash-bound inputs to every initial
Builder and repair task:

- `world-plan.png` owns orientation, complete-world extent, route/junction
  topology and coherent hidden continuation;
- `entry-whitebox-target.png` owns entry framing, left/right and near/far
  placement, silhouette scale, depth order and occlusion intent.

They are reference evidence inside the existing Case/Generation Request
identity. They do not create a shadow Plan, third Scene Source or second Camera
owner. The Builder receives them under those semantic asset names rather than
as anonymous `reference-N` images. The uploaded user reference remains
separately named and retains visible-evidence priority.

Quality enforcement is frozen by one required Evaluation Profile field:

```ts
qualityGateMode: "report-only" | "required-for-publication";
```

This is an intentional policy mode, not legacy compatibility. Both values run
the same Formal Capture and seven-dimension measurement. Only
`required-for-publication` may allocate at most three fresh Host-created repair
Attempts and retains the strict final GO behavior. `report-only`, which is the
default for Host-derived exploratory Native Cases, never creates an external
repair Attempt and never converts a failed or incomplete quality result into a
pass; the first admitted Package is captured and returned with an identity-bound
non-GO preview result, exact diagnostic codes, surviving Capture/evaluation
evidence and a stable `worldkit native run` command. Automation can therefore
distinguish accepted publication from human-inspectable output without losing
the world.

The following remain hard, mode-independent admission failures: Native source
or authority audit, deterministic replay, budget, Ground Analysis, Package or
Receipt identity, Runtime startup/readiness, SDK-owned Spawn/Support/Collider,
lifecycle and cleanup. They produce no runnable preview. Opening composition,
semantic silhouette, measured topology and scripted traversal quality are
repair/evaluation evidence after Runtime admission. A declared checkpoint that
is present but finishes without proving either side emits the dedicated,
source-repairable `WORLD_RECONSTRUCTION_TRAVERSAL_EVIDENCE_INCOMPLETE`
diagnostic while repair budget remains; it must not be mislabeled as pass/block
or thrown as Capture infrastructure failure. A missing checkpoint identity,
missing observation row or stale evidence remains non-repairable and fails
closed. A true Browser, Runtime, screenshot or identity failure still closes
Capture.

The default route launches exactly the Unified Planner and Babylon Native Block
Builder model tasks. The Host derives the baseline Case from Planner-owned
artifacts without a `native-case-mapping` Agent stage. This keeps the successful
`codex/block-world-main-integration` task topology while retaining current
Babylon Package, Runtime, Havok and Capture owners.

The existing bounded repair loop may change only Native authoring source/resources. A ground failure
names the affected group/Block/region and the required structural change. A pre-Package Ground Analysis
rejection starts a new Attempt from immutable source/check/logical-ground/report evidence; that rejected
Attempt owns no Package or Capture. The repaired Attempt must pass Check and Ground Analysis before it can
create a Candidate, Package, Receipt or Capture. Exceeding the repair budget preserves the reached evidence
for diagnosis. A quality-only failure follows the frozen `qualityGateMode`, but Native Check, Ground
Analysis, Package or Runtime-admission failure remains non-previewable. Prior-evidence selection never
disables the rest of the frozen Case: a Ground Analysis
repair must preserve the opening regions, anchors and depth order from `case.json`. It connects support with
the correct ground/route group and cannot stretch a ridge, cliff, landmark, structure or background group
toward Spawn to satisfy connectivity. Formal opening depth order remains the deterministic ordering of each
declared visual group's complete checked-bounds center; this repair rule prevents a local support fix from
silently turning a midground group into foreground evidence.

## 12. Budget and identity

The Host freezes Block, occupied-cell, visual batch, material, logical Collider, collision-part,
vertex, triangle, active physics-Chunk and boundary budgets. The Builder cannot raise them.

One parity receipt records baseline and realized values:

- Block and occupied-cell counts by shape/role/group;
- support-top, standable, reachable and disconnected counts;
- target/band reachability, reachable bounds, distance and off-camera/Chunk coverage;
- logical Collider count, collision-part count, vertices, triangles and removed internal faces;
- visual Mesh/draw/buffer counts before and after batching;
- boundary source/merged segment counts;
- peak active physics Chunks/shapes/aggregates;
- deterministic ground-model, contribution, Package and runtime-evidence hashes.

Changing batching or residency without changing logical scene semantics may preserve the authored
source hash, but it must change the materializer/runtime realization identity and Receipt when its
frozen realization bytes change. Published Package contents are never edited in place.

## 13. Failure and cleanup

Group parsing, logical-ground freeze, graph check, topology construction, batching, collision
materialization, boundary construction, registration or deterministic replay failure rejects the
Build Epoch before Package publication. Partial resources unwind in reverse order. A cleanup throw is
a failure and produces no trusted contribution.

Runtime residency failure pauses or rejects readiness according to the existing Runtime contract; it
does not silently fall back to one Collider per Block, an infinite floor, direct unbatched duplicates,
or disabled boundary filtering. There is no compatibility mode.

## 14. Required evidence

Completion requires all of the following on one frozen candidate:

- asymmetric unions, holes, negative coordinates, mixed shapes, stairs and creation-order replay;
- palette changes that do not change physics membership, and visual-only Blocks that remain
  non-colliding;
- footprint-union, clearance, Spawn, target, component, band and exploration-metric adversaries;
- shared-group and cross-Chunk seams that remain both visually and physically continuous;
- deterministic slope topology and real Havok walk/run speed, step-up/down and contact behavior;
- blocking walls that stop the Capsule while the complete supported approach remains traversable;
- ground-boundary protection, explicit ledge opt-out, jump retention and water/flight mask bypass;
- actual visual batching and bounded physics residency with far silhouettes still visible;
- Capture visual-group selection/tinting across independent and batched Blocks;
- Package/Receipt replay identity, Collider overlay equivalence, cadence, reset, two-session isolation,
  partial construction and throwing cleanup;
- the petrified-forest Case supports free human exploration over every declared visible playable floor
  without falling through a seam;
- a parity matrix proves each in-scope v2 behavior on current Babylon Native production code;
- zero Three.js, Block Manifest, Block Compiler, hidden foundation, Scene scan, second support owner,
  legacy selection field or fallback remains.

## 15. Completion and deferred-owner boundary

`NBR-65` is complete only after the current-only authoring migration, logical ground model,
Subject-relative checker, continuous surface, executable batching/residency, ground boundary, real
Case evidence and one independent exact-SHA review have no open P0/P1. Only then may `NBR-70` use the
representative Case as complete Native Block playability evidence.

The following v2-era capabilities remain deliberately assigned to other WRC owners and do not block
the ground reconstruction slice:

- directed doors/portals and interaction activation: `WRC-EVT-1`;
- product Route/Nav/`goTo`: BNA-7 Route/Nav continuation;
- water, swimming, flight and hybrid-medium reachability: Movement/Medium roadmap owners;
- generic Action/Posture and complex Camera semantics: WRC-ACT/WRC-CAM;
- Block-specific Subject occlusion fade: `WRC-CAM-1/2`, after the Camera Domain and collision-safe
  final-pose contracts decide its semantics;
- complete Golden Corpus and production success-rate acceptance: BNA-6/BNA-8/WRC-ACC-1.

Those assignments prevent capability loss without violating current ownership or falsely declaring
unimplemented features complete.
