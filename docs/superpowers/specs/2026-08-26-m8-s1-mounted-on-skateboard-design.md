# M8-S1 `mountedOn` Human-Skateboard Vertical Slice Design

> Implementation status (2026-08-31): the original contract/authoring/compiler, trusted Action effect,
> Gameplay/RuntimeHost atomic transaction, Babylon stand projection/safe Dismount, Playground fixture
> and Control Capture Track writer/validator are implemented. The completion candidate now also owns the
> retained-support Semantic Fact closure, the formal four-stage mounted Capture verifier, and the narrow
> Camera integration required by the latest approved Camera contract. This is a current-only clean break:
> the final tree must not retain old Camera relationship aliases, implicit projector defaults, Task-6
> migration helpers, or generated artifacts using the replaced contracts.

**Status:** implementation authority

**Date:** 2026-08-26

**Baseline:** `main@dea2d8e23aaacea3811619ee63dfd9d41e8184c5`

**Upstream authorities:**

- `docs/superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md`
- `docs/superpowers/specs/2026-08-22-canonical-runtime-state-and-semantic-projection-design.md`
- `docs/superpowers/specs/2026-08-24-gameplay-framework-r1b-integration-design.md`
- `docs/superpowers/specs/2026-08-24-context-driven-gameplay-camera-composition-design.md`
- `docs/reviews/runtime-deep-review-checklist.md`

### 2026-08-31 completion-contract amendment

This amendment is authoritative for the remaining M8-S1 work. It does not broaden the product claim to
wheel dynamics, generic vehicles, seat/tether, hosted Builder support, dynamic Route certification, or a
second Camera system. It closes the exact internal Canonical acceptance seams exercised by the
human/skateboard slice without opening automatic scene production admission.

The final accepted tree has one path for each concept:

- one required, hash-bound `semanticFactProjectorProfileResource` embedded in every
  `GameplayBootstrapV1`; no optional field, default profile, alternate parser, or compatibility alias;
- one committed Semantic Fact owner in Babylon Runtime, fed by the retained result of the existing
  Motion/Body support query; no Relationship inference, terrain-height inference, extra ray, AABB test,
  or Gameplay-tick reconstruction from the full scene mesh;
- one typed Camera relationship vocabulary: `relationshipContexts` in samples and
  `allRelationshipConditions` in rules; `relationshipRole` and `relationshipRoles` are deleted;
- one fixed-tick Camera publication epoch. Relationship/Possession commit may stage the next committed Camera
  input context but cannot choose a Target or advance the Camera revision; published Target,
  SelectionDecision, Rig, Modifiers, Spring Arm telemetry and pose remain the previous coherent Camera state
  until the next fixed-tick Camera phase commits them together;
- one provider-neutral Socket projection path for Camera Context. It consumes locked Socket definitions and
  committed Subject pose. Camera code never reads Babylon Nodes, render parenting or mesh metadata.

Because the project is unreleased, this amendment requires atomic migration of source contracts, strict
parsers, Registry catalog, generated schema/validator bundles, checked-in world/runtime artifacts, examples
and tests. Preserving the replaced fields or interpreting missing values is a design failure, not a
compatibility feature.

## 1. Outcome

M8-S1 adds the first internally implemented typed Relationship beyond `possessedBy`: one human Rider can
stand on one skateboard Mount through `mountedOn` in a Host-fixed Canonical acceptance fixture. Mount and
Dismount remain Semantic Actions submitted through the existing `action.activate` command. Each accepted
Action atomically changes Action state, `mountedOn`, `possessedBy`, runtime projection, Event, Receipt and
Capture evidence at one fixed simulation Tick. This implementation is not Hosted Builder production
admission and must not be advertised as an automatically generated scene capability.

The fixture deliberately uses two independent Entities:

- a current G Bot or Golden Humanoid Rider;
- a package-local primitive whitebox skateboard Mount.

The skateboard reuses the current proven Ground locomotion closure. Rider and board move as one assembled gameplay subject while mounted. This slice does not implement wheel dynamics, drift, tricks, suspension, rail grinding, a composite GLB, or a new motion kernel.

## 2. Current baseline and gap

The current tree already owns the required transaction spine:

- `GameplayCommandV1` has `action.activate` with optional immutable Action Request Ref and Hash;
- Core Semantic Action is the sole handler for `action.activate` and `action.cancel`;
- `GameplayState` plans, projects and atomically commits state changes;
- RuntimeHost journals Command, Receipt, Event and WorldState identities;
- `WorldStateSnapshotV1` already exposes `relationshipStatesById`, `semanticFactsById` and `activeActionStatesById`;
- Control Capture frames already carry the committed runtime snapshot and write reserved Action, Event and Relationship tracks.

The missing pieces are narrow but cross-cutting:

- `GameplayRelationshipStateV1` accepts only `possessedBy`;
- Relationship Events are hard-coded to possession endpoints;
- Gameplay inspection and capacity use possession-only public names;
- Action authority assumes the actor is always the currently possessed Entity;
- Semantic Action definitions cannot name a trusted state effect;
- Authoring rejects every Relationship and the Compiler rejects the reserved `mount` profile;
- Babylon has no committed `mountedOn` projection that suspends the Rider body and follows the Mount slot;
- Capture relationship/action/event tracks are not populated by this transition.

## 3. Scope and explicit non-goals

### 3.1 In scope

- one closed `MountedOnRelationshipStateV1` shape;
- one `mountedOn.stand-ground@1` Relationship Profile and one skateboard stand slot;
- initial Authoring compilation and dynamic Mount/Dismount transaction support;
- request-backed Mount and Dismount Semantic Actions through `action.activate`;
- atomic control transfer Rider → Mount on Mount and Mount → Rider on Dismount;
- Rider independent locomotion/collider suspension while mounted;
- deterministic Rider visual placement relative to the locked Mount slot;
- safe deterministic Dismount candidate selection;
- WorldState, inspection, Event, Receipt, Browser and Capture consistency;
- bind → mount → move → dismount → move → reset end-to-end evidence.

### 3.2 Out of scope

- seat, passenger, tether, equipment, vehicle, flight or water relationships;
- wheel, rigid-body vehicle, drift, trick or animation-authoring systems;
- mounting animation or a skateboard-specific pose; the Rider uses the existing locked fallback pose without claiming visual fidelity;
- general vehicle, flight or multi-camera behavior beyond the typed mounted relationship condition,
  locked mounted-framing modifier and fixed-tick publication barrier required by this fixture;
- trusted Route publication on a dynamic or overlapping surface;
- changing `SubjectRuntimeStateV3` or Browser Protocol V5 keys;
- automatic Planner/Builder use of mount relationships before the capability gate is explicitly reopened;
- compatibility aliases for the current private `mount` vocabulary.

## 4. Canonical terminology and public contracts

`mountedOn` is the only public Relationship term. The unreleased `relationshipType: "mount"` registry value is replaced, not aliased. `mount` remains a role noun in fields such as `mountEntityId` and `mountSlotId`.

```ts
export interface MountedOnRelationshipStateV1 {
  readonly id: string;
  readonly type: "mountedOn";
  readonly schemaVersion: 1;
  readonly riderEntityId: string;
  readonly mountEntityId: string;
  readonly mountSlotId: string;
  readonly establishedSimulationTick: number;
}

export type GameplayRelationshipStateV1 =
  | PossessedByRelationshipStateV1
  | MountedOnRelationshipStateV1;
```

The Authoring relationship has the same endpoints and omits runtime-only Tick state:

```ts
export interface MountedOnRelationshipSpecV1 {
  readonly id: string;
  readonly type: "mountedOn";
  readonly schemaVersion: 1;
  readonly riderEntityId: string;
  readonly mountEntityId: string;
  readonly mountSlotId: string;
}
```

Relationship Events carry the complete typed Relationship, removing possession-only endpoint fields:

```ts
interface GameplayRelationshipEventBaseV1 extends GameplayEventBaseV1 {
  readonly commandId: string;
  readonly relationship: GameplayRelationshipStateV1;
}
```

This is an approved clean break for unreleased contracts. `controlledEntityId` and `controllerEntityId` remain inside `possessedBy`; they are not duplicated on the Event.

Inspection and capacity become relationship-generic:

```ts
interface GameplayInspectionSnapshotBaseV1 {
  readonly relationshipStatesById: Readonly<
    Record<string, GameplayRelationshipStateV1>
  >;
}

interface GameplayCapacityBudgetV1 {
  readonly maximumRelationshipStateCount: number;
}
```

There is no `possessedByRelationshipsById` or `maximumPossessedByRelationshipCount` alias after migration. GameplayState may keep a private possession index derived from the canonical Relationship map.

## 5. Mount slot and Relationship Profile

The Mount Subject owns the slot. The Rider does not invent a world transform, seat name or dismount location in the Action Request.

```ts
export interface SubjectMountSlotDefinitionV1 {
  readonly id: string;
  readonly kind: "mount-slot";
  readonly mode: "stand";
  readonly mountSocketId: string;
  readonly riderSubjectOriginOffsetMetersXYZ: readonly [number, number, number];
  readonly dismountCandidateOffsetsMetersXYZ: readonly (
    readonly [number, number, number]
  )[];
}
```

The package-local skateboard declares one `MountStand` local Socket and one `stand` slot. Candidate offsets are authored in Mount-local coordinates, sorted in intentional preference order, and transformed by the committed Mount pose during Dismount.

The current Relationship Profile contract becomes a discriminated union. The
new implemented branch uses Rider/Mount roles; the still-reserved seat and
tether branches keep their own role-specific socket fields rather than sharing
generic source/target names:

```ts
export type RelationshipProfileInputV1 =
  | (RelationshipProfileBaseV1 & Readonly<{
      relationshipType: "mountedOn";
      requiredRiderSocketIds: readonly string[];
      requiredMountSocketIds: readonly string[];
      controlTransferMode: "keep-rider" | "to-mount" | "none";
      cameraTargetRole: "controlled-entity" | "rider" | "mount";
      maximumMountDistanceMeters?: number;
    }>)
  | (RelationshipProfileBaseV1 & Readonly<{
      relationshipType: "seat";
      runtimeStatus: "reserved";
      requiredOccupantSocketIds: readonly string[];
      requiredSeatSocketIds: readonly string[];
    }>)
  | (RelationshipProfileBaseV1 & Readonly<{
      relationshipType: "tether";
      runtimeStatus: "reserved";
      requiredTetheredSocketIds: readonly string[];
      requiredTetherAnchorSocketIds: readonly string[];
    }>);
```

M8-S1 adds exactly one implemented profile:

```json
{
  "kind": "relationship-profile",
  "id": "R02.mounted-on.stand-ground",
  "version": 1,
  "resourceRef": "worldkit://relationship-profile/mounted-on.stand-ground@1",
  "relationshipType": "mountedOn",
  "runtimeStatus": "implemented",
  "requiredRiderSocketIds": ["FootAlignment"],
  "requiredMountSocketIds": ["MountStand"],
  "controlTransferMode": "to-mount",
  "cameraTargetRole": "controlled-entity",
  "maximumMountDistanceMeters": 2
}
```

Existing seat and tether profiles stay reserved. Updating the `mount.reserved@1` resource is a clean replacement; no parser accepts both terms.

## 6. Semantic Action effect extension

Core Semantic Action remains the only owner of `action.activate`. M8 must not register a competing handler for the same Command type.

`GameplayActionDefinitionV1` gains a closed effect discriminator:

```ts
readonly effect:
  | Readonly<{ mode: "state-only" }>
  | Readonly<{
      mode: "trusted";
      gameplayActionEffectRef: string;
      gameplayActionEffectHash: Sha256HashV1;
    }>;
```

Existing Action definitions are migrated explicitly to `{ mode: "state-only" }`. There is no missing-field fallback.

Its completion union also gains `{ mode: "immediate" }`. Mount and Dismount use
that mode, so `action.started` and `action.completed` are retained at the same
Tick without leaving a phantom active Action. Fixed-duration and explicit-cancel
semantics remain unchanged.

The Gameplay Feature resource lock activates one `mounted-relationship@1` feature after Core Control and Core Semantic Action. It contributes a trusted effect planner keyed by its locked Ref and Hash, not another Command handler. GameplayState is still the sole state writer and validates the returned closed plan before authorization.

```ts
export type GameplayTrustedActionEffectPlanV1 = Readonly<{
  kind: "mounted-relationship-effect-plan";
  schemaVersion: 1;
  operation: "mount" | "dismount";
  actorEntityId: string;
  requiredControlledEntityId: string;
  relationshipChanges: readonly GameplayRelationshipChangeV1[];
  runtimeProjectionWriteSet: Readonly<{
    spatialEntityIds: readonly string[];
    capabilityStateIds: readonly string[];
    semanticFactIds: readonly string[];
  }>;
}>;
```

The effect planner resolves immutable Action Request bytes through the Host-owned request catalog, parses the exact locked schema, and returns plain data. It receives a read-only planning view; it cannot mutate GameplayState, Runtime, Babylon nodes or Physics bodies.

Mount and Dismount request resources use role-qualified fields:

```ts
export interface MountActionRequestV1 {
  readonly kind: "mount-action-request";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly riderEntityId: string;
  readonly mountEntityId: string;
  readonly mountSlotId: string;
}

export interface DismountActionRequestV1 {
  readonly kind: "dismount-action-request";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly riderEntityId: string;
  readonly mountedOnRelationshipId: string;
}
```

The command continues to carry `actorEntityId`. For request-backed trusted effects, actor and control authority are separate validated roles:

- Mount: `actorEntityId = riderEntityId`; `requiredControlledEntityId = riderEntityId`.
- Dismount: `actorEntityId = riderEntityId`; `requiredControlledEntityId = mountEntityId`.
- State-only Actions preserve the current invariant that actor equals possession target.

This permits the Rider to request Dismount while the Controller possesses the board without weakening ordinary Action authorization.

## 7. Atomic transition semantics

### 7.1 Mount preconditions

At planning Tick `T`, reject without mutation unless all are true:

1. Command, request Ref/Hash, Action definition and effect Ref/Hash are canonical and locked.
2. Controller currently possesses the Rider named by the request.
3. Rider and Mount exist in the same WorldSession and are distinct.
4. Rider is not already a Rider in another `mountedOn`; Mount slot is unoccupied.
5. Mount resolves the exact implemented `mountedOn.stand-ground@1` profile and named slot.
6. Required Rider and Mount Sockets exist.
7. Rider-to-slot distance is finite and at most `maximumMountDistanceMeters`.
8. Neither Entity has a conflicting exclusive Action or terminal lifecycle state.
9. Final Relationship, Action, Event, Receipt and retained-snapshot capacity is available.
10. Babylon prepare succeeds for Rider suspension and slot attachment without mutating visible state.

On commit at Tick `T`, one authorized transition:

- adds `mountedOn(rider, mount, slot)`;
- removes `possessedBy(rider, controller)`;
- adds `possessedBy(mount, controller)`;
- starts and completes the instantaneous Mount Action in the same Tick;
- emits stable relationship removed/committed events followed by action events;
- publishes one committed Receipt referencing the exact WorldState-after Hash.

### 7.2 Mounted runtime projection

While `mountedOn` exists:

- Mount Ground locomotion is the only movement authority.
- Rider independent Character Controller input is suspended.
- Rider collider is disabled or placed in the frozen non-colliding mounted mode; it cannot add a second support query or push the Mount.
- Rider Subject Origin is derived each fixed Tick from Mount Subject Origin, Mount yaw, slot Socket and `riderSubjectOriginOffsetMetersXYZ`.
- Rider facing follows Mount facing for this slice.
- Visual Root and Snapshot continue to publish Rider Subject Origin, never Babylon parent-local coordinates.
- The possession transition changes the committed controlled Entity and Relationship Context input. It does
  not independently choose or publish a Camera Target; Camera Director consumes those inputs with its selected
  Target at the next fixed-tick Camera publication and remains the only Camera owner.

The Rider Locomotion Capability projection becomes a closed union. Its active
branch retains the current Ground/Air fields; its new suspended branch is:

```ts
{
  id: string;
  kind: "locomotion-capability-state";
  ownerEntityId: string;
  locomotionCapabilityRef: string;
  locomotionCapabilityHash: Sha256HashV1;
  mode: "suspended";
  suspendedByRelationshipId: string;
}
```

It does not publish a fake movement medium, speed or support while independent
Rider locomotion is inactive. This extends Capability State instead of adding a
field to `SubjectRuntimeStateV3`.

The visual attachment is a projection of `mountedOn`; Scene Graph parenting is not the Relationship truth.

### 7.3 Dismount preconditions and placement

Dismount validates the exact active Relationship and current possession of its Mount. The Runtime evaluates the locked candidate offsets in declared order. A candidate is accepted only if the existing Physics/placement query proves:

- capsule feet have support;
- the Rider capsule is not blocked;
- the position is finite and inside the admitted world bounds.

No heightfield-only resampling, ray/AABB grounding or Relationship-derived support inference is allowed. If no candidate is safe, the command is rejected and the mounted state is unchanged.

On commit:

- removes `mountedOn`;
- removes `possessedBy(mount, controller)`;
- adds `possessedBy(rider, controller)`;
- restores Rider collider and independent locomotion at the selected safe Subject Origin;
- starts/completes Dismount Action and emits ordered Event/Receipt evidence at the same Tick.

## 8. State, Fact, Camera and Route authority

| Concern | Sole authority | M8 consumer/projection |
| --- | --- | --- |
| Relationship truth | GameplayState `relationshipStatesById` | Babylon attachment, inspection, Browser, Capture |
| Possession | `possessedBy` in GameplayState | input controlled Entity and committed Camera control context |
| Rider mounted pose | committed Mount transform + locked slot | Rider Runtime/visual projection |
| Ground support | Mount MotionKernel `checkSupport()` result | `supportedBy` fact and Ground mode |
| Rider support | no independent query while mounted | no fabricated rider-board `supportedBy` fact |
| Active Action | Core Semantic Action + trusted effect plan | WorldState/Event/Receipt |
| Camera | Camera Director | consumes one same-epoch committed `controlledEntityId`, selected `targetEntityId` and typed Relationship Context publication |
| Simulation time | fixed-step RuntimeHost barrier | all state/event/receipt Ticks |

`mountedOn` never implies `supportedBy`. The board may publish a terrain `supportedBy` fact only from its real retained `checkSupport()` evidence. The Rider does not publish a fake board-support fact merely because the Relationship exists.

The skateboard is a dynamic controlled Subject. Route R1/R1b publication remains limited to its frozen static/heightfield scope; this fixture may prove locomotion and state consistency but must not claim dynamic-platform Route certification.

### 8.1 Adapter projection write set

The current RuntimeHost rejects every Command transaction whose Adapter-owned
World projection changes. M8 replaces that blanket rule with an exact write-set
contract; otherwise Mount could commit a Relationship while leaving the Rider at
its old world pose.

For Mount and Dismount the trusted effect plan declares only the Rider spatial
Entity ID and Rider Locomotion Capability State ID writable. The Babylon staged
transaction returns the complete projected World state after slot placement or
safe Dismount placement. RuntimeHost verifies byte equality for every entry
outside the declared write set, validates every changed entry through the public
projection parser, and rejects additions/removals not declared by the set.
Semantic Fact write IDs are empty for this transition. Physics-derived facts may
change only during the normal fixed-input/support projection phase, never because
the Relationship effect requested them.

The staged transaction may prepare the next provider-neutral Camera input revision produced by the
committed control and Relationship changes. It does not independently select or publish a Camera
Target. RuntimeHost builds WorldState/inspection/Event/Receipt from the validated staged Gameplay
projections before the synchronous commit barrier; the Camera Director consumes the new committed
`controlledEntityId`, selected `targetEntityId` and typed Relationship Context together at its next
fixed-tick publication phase. Until that phase succeeds, every public Camera field remains on the
previous coherent epoch. An invalid or over-broad projection aborts without advancing GameplayState.

### 8.2 Retained-support Semantic Fact projection

`semanticFactProjectorProfileResource` is a required full resource inside
`GameplayBootstrapV1`, not a bare Ref or an adapter constant. Its Ref and canonical content Hash participate
in the Gameplay Bootstrap Hash and therefore in the World Build/Package identity closure. The M8-S1 profile
is the sole current resource and fixes these semantics:

- input source: retained Character support from the existing Body/Motion owner;
- accepted support states: `supported` and `sliding`;
- surface motion: static only;
- support-point height tolerance: the Character body contact band;
- minimum contact-to-aggregate support-normal cosine:
  `minimumContactToAggregateSupportNormalCosine: 0.95`, evaluated as
  `dot(normalize(contact.normalXYZ), normalize(retainedSupport.supportNormalWorldXYZ)) >= 0.95` after the
  native Body owner has retained only Babylon supporting contacts with
  `dot(normalize(contact.normalXYZ), worldUp) > 0.08`;
- ambiguous surface resolution: omit the Fact;
- end delay: `0` fixed Ticks.

The two normal thresholds have different owners and different operands. The Body-owned low positive
world-up dot test preserves Babylon 9.23.0's supporting-contact meaning and removes side-wall contacts
without reintroducing the walkable-slope policy. The Projector Profile's `0.95` contact-to-aggregate test is
a coherence gate: it rejects a contact whose normal disagrees with the Body owner's retained aggregate
support normal. It is not a world-up or walkable-slope threshold. `supported` versus `sliding` remains the
Body owner's `maxSlopeCosine` classification. Route maximum slope remains separate Route policy and must not
filter Motion's retained support evidence; otherwise a real `sliding` episode would be lost.

Every retained supporting contact carries the exact frozen traversal identity already attached to its
admitted collider: `surfaceEntityId`, `traversalSurfaceId` and `colliderSubshapeId`. The Projector validates
and groups those identities. It does not regenerate Heightfield/static triangles or call the full-scene
geometry query during a Gameplay Tick. Contacts that are dynamic, missing an admitted identity, disagree on
surface identity, or otherwise remain ambiguous produce no `supportedBy` Fact.

Both current controller implementations expose the same immutable Projector input after their committed
Physics/Body phase:

- the non-Golden `CharacterMovementComponentV1` retains its Body support sample;
- the Golden G Bot path retains the same committed BodyPort support result and exact surface identity;
- any Entity currently suspended by `mountedOn` is excluded, so the Rider never gains a relationship-derived
  support Fact;
- after Dismount, the Rider may publish `supportedBy` only after its independent Body path commits a real
  support result on a subsequent fixed Tick.

The committed `semanticFactsById` map is the sole lifecycle state. For a continuing subject/surface episode,
the Projector preserves Fact ID and `startedSimulationTick`; departure removes it immediately; landing starts
a new deterministic ID/episode. World reset and Traversal anchor reset clear prior projected facts before
rebuilding Tick 0, so no Tick 0 Fact may retain a future `startedSimulationTick`. Snapshot and Hash consume
the committed map. Prepared Golden Tick rollback restores the exact pre-prepare map; replay reconstructs the
same bytes from the same retained Physics inputs. No provider-private pending/active Fact state machine is
allowed.

For `P` eligible projectable Subjects and `C` currently published `supportedBy` Facts, the Runtime capacity
estimate reserves at most `P` resulting Facts and `C + P` transition Events, in addition to any future
non-support Fact families. The estimate counts both Golden and non-Golden eligible controllers and remains an
upper bound across departure plus landing in one fixed input Tick.

### 8.3 Camera relationship and publication clean break

M8-S1 consumes the approved context-driven Camera contract; it does not define a mounted Camera dialect.
Camera samples contain an ordered `relationshipContexts` array. Camera rules contain only the closed
`allRelationshipConditions` union. The mounted framing rule is exactly:

```ts
allRelationshipConditions: [
  { type: "mountedOn", entityRole: "rider" },
]
```

`rider` is intentional. The resolver preserves the committed controlled Entity and selected Target, then
matches this condition only when exactly one `mountedOn` Relationship connects either of them to a unique
Rider. With an ambiguous shared Mount, the projector keeps the typed relationships but fails closed instead of
guessing a Rider. It never rewrites `controlledEntityId` to manufacture a match. A `mount` condition would
incorrectly activate mounted framing for that ambiguous case.
Relationship contexts are sorted by `type`, then Relationship `id`, using canonical UTF-16 code-unit order;
locale-sensitive comparison is forbidden.

The following old seams have no current product value and are deleted atomically:

- `CameraRelationshipRoleV1`, sample `relationshipRole`, rule `relationshipRoles`, their generated schema
  fields, catalog values, fixtures and explain reason;
- `legacyViewTargetToCommittedCameraContextV2ForTask6` and the production-unreachable
  `semanticAuthorityStatus: "unavailable"` branch;
- the unused subject runtime `relationshipRole` projection and render-binding catalog field;
- any duplicate Playground Camera projection helper that is bypassed by the canonical
  `projectBabylonWorldRuntimeSnapshotV4` path.

The canonical Camera Snapshot is one committed publication, not a mix of current possession with an older
Director snapshot. On Mount and Dismount, the Action/Relationship/Possession transaction commits first. Until
the following fixed-tick Camera phase succeeds, public Camera Target, `selectionDecision`, active Rig,
Modifier refs, Spring Arm values, target/actual pose and socket telemetry all remain the previous coherent
publication. The next fixed Tick replaces that publication atomically. Initial bootstrap may publish its
first bound Camera during the candidate readiness phase; World reset creates a new WorldSession and cannot
reuse the old Camera publication. Camera View commands may publish Camera-owned changes without changing
Gameplay state, but their prepare/commit/rollback checkpoint includes the entire published Camera projection.

Camera Socket positions are derived by a package-private locked-socket projector from the Subject's declared
Socket local transform and committed Subject origin/facing. Static local sockets are transformed
deterministically with Babylon math. Bone sockets are omitted until a committed rig/animation socket
projection exists; the locked Camera Profile's explicit missing-socket fallback remains observable. Mutating
`SubjectVisual.socketNodesById`, render parenting or a Babylon TransformNode must not affect Camera Context
bytes at the same committed Tick.

This clean break does not add Browser Protocol V5 keys or a new View DTO. The current exact Browser V5 key
count is 38. It changes only the provider-neutral inputs and ensures existing Snapshot V4 Camera fields are
published from one epoch.

### 8.4 Completion work graph and ownership

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive owner / integration point | Verification | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| M8-COMP-D1 | Freeze this amendment and deletion list | current approved Camera and Runtime-State specs | all completion rows | main agent; this spec and implementation plan | main self-review, then independent exact-SHA deep design review | main-agent-only |
| M8-SF1 | Required hash-bound Projector Profile and clean generated asset closure | M8-COMP-D1 | M8-SF2, M8-COMP-I1 | gameplay contracts/core bootstrap and owning generators | strict parser/hash negatives plus byte-valid checked-in assets | sequential |
| M8-SF2 | Exact-identity retained support for Golden and non-Golden bodies | M8-SF1 | M8-SF3 | runtime body/support ports and Projector input seam | steep sliding, ground-plus-wall, Golden landing, no hot-loop geometry scan | sequential |
| M8-SF3 | Deterministic Fact lifecycle, reset/replay/rollback and capacity | M8-SF2 | M8-COMP-I1 | committed Runtime `semanticFactsById` and WorldSession capacity seam | departure/landing/reset plus prepared abort/replay and bound tests | sequential |
| M8-CAM1 | Camera public relationship current-only clean break | M8-COMP-D1 | M8-CAM2 | camera domain, runtime contracts, Registry and generators | strict rejection of old fields; unique/ambiguous Rider cases | sequential |
| M8-CAM2 | Locked-socket Camera Context and atomic fixed-tick publication | M8-CAM1 | M8-COMP-I1 | runtime-babylon Camera projector/publication owner | immediate Mount/Dismount, Node-mutation, yaw, reset/rebind, dual Runtime | sequential |
| M8-COMP-I1 | Four-phase Capture, affected tests, rendered inspection and exact-SHA final review | M8-SF3, M8-CAM2 | none | main agent; verifier/docs/final integration | local affected tests only; full gates and independent exact-SHA review in a remote Cloud Agent | main-agent-only |

Architecture, shared contract decisions, final diff review and integration remain main-agent-owned. Parallel
workers may implement only rows whose inputs and file ownership are already frozen. A worker report is not
integration evidence.

## 9. Internal Authoring acceptance and Hosted production exclusion

Authoring V4 retains the exact `mountedOn` shape only for trusted internal Canonical acceptance input.
Validation resolves both Entities, the Mount slot, sockets and the `internal` Relationship Profile. Unknown
Relationship types, unknown fields, duplicate Rider occupancy, duplicate slot occupancy and wrong role kinds
fail closed. This parser support does not make the relationship AI-recommended, public production Authoring,
or Hosted Builder output.

Compiler V5 emits typed initial `mountedOn` state only when the profile is exactly implemented and all closure resources are locked. Initial mounted scenes must also contain a matching initial possession of the Mount; contradictory Rider possession is rejected. The dynamic fixture starts unmounted so it exercises both transaction directions.

The hosted Scene Brief/Builder workflow rejects non-empty `relationships` and every package-local
`relationshipCapabilityRefs` entry with stable self-check diagnostics. It continues to assemble rider,
body and equipment into one Subject until a later reviewed design deliberately reopens production
admission. M8 does not silently change automatic generation behavior.

Browser Protocol V5 adds no keys. Existing gameplay submission, receipts, events, WorldState and inspection methods expose the new union member through their current return values. The exact 38-key protocol census must remain unchanged.

## 10. Capture contract

Control Capture V1 already reserves `tracks/actions.ndjson`, `tracks/events.ndjson`, `tracks/relationships.ndjson` and `tracks/snapshots.ndjson`. M8 populates these files from committed RuntimeHost journal records; it does not add a competing Capture schema.

For each captured frame, the embedded Runtime Snapshot's `worldStateRef`/`worldStateHash` and Gameplay inspection must agree with the journal at that simulation Tick. The bundle validator adds cross-track checks:

- every committed Receipt references the exact WorldState-after row;
- every Receipt `eventIds` entry resolves in the Event track;
- relationship Event payloads equal the before/after Relationship rows;
- Mount and Dismount changes share one Tick with their Action events and Receipt;
- frame snapshots before Mount, after Mount/movement, after Dismount and after Reset resolve to the correct Relationship/Possession state;
- reset creates a new WorldSession and no prior mounted state or Event sequence leaks into it.

## 11. Failure and rollback policy

Planning rejection changes nothing and produces no Events. Prepare failure produces a failed Receipt/diagnostic through the existing RuntimeHost failure path and rolls back every prepared Babylon resource. Commit is all-or-nothing: Relationship, possession, Action, Runtime projection and journal cannot partially advance.

Required adversarial cases include stale possession, forged request Hash, actor/request mismatch, missing slot/socket/profile, occupied slot, excessive distance, insufficient capacity, unsafe Dismount, prepare throw, commit projection throw, held input across control transfer, reset while mounted, two WorldSessions and two simultaneous skateboard instances.

Public diagnostics remain provider-neutral. Babylon/Havok messages and handles stay behind adapters.

## 12. Work graph

### 12.1 Reserved evolution path for dynamic riding and tricks

M8-S1 is intentionally a behavior slice, not a terminal skateboard model. The following seams are stable extension points:

| Future tier | Reused unchanged | New authority required |
| --- | --- | --- |
| Visual ground tricks | `mountedOn`, Mount slot, request/effect registry, transaction and Capture | parameterized trick Action definitions, animation/pose bindings and phase evidence |
| Airborne ollie/grab/landing | all Relationship and Action identity contracts | skateboard-specific Motion Kernel/Profile, takeoff/air/landing state and validated collider/contact behavior |
| Dynamic wheel/board response | Rider/Mount Entity split, possession transfer and Camera consumption | provider-neutral board Dynamics Capability, Physics adapter, wheel/contact model and Control Feel profile |
| Rails, ramps and dynamic Route proof | current WorldState/Event/Capture chain | a later trusted traversal profile for dynamic/overlapping surfaces; not an R1/R1b alias |

The Ground closure selected for S1 is one implementation bound through the Mount's locked capability refs; it is not encoded into `MountedOnRelationshipStateV1`, Mount/Dismount Action Requests or the Mount slot schema. A future skateboard dynamics implementation therefore adds a new exact Motion/Physics closure and corresponding tests rather than adding optional physics flags to `mountedOn`.

Tricks remain Semantic Actions. A trick request may add role-specific fields such as `mountEntityId`, `trickId`, `rotationDegrees` or `launchSpeedMetersPerSecond`, with its own locked schema and trusted effect planner. It must not introduce a generic `params` bag. Actions that change Physics state must still commit at a fixed-tick barrier and publish matching state, Event, Receipt and Capture evidence.

The S1 fixture must include an assertion that its Relationship/Action contracts contain no Ground-kernel Ref. This makes the future closure substitution machine-verifiable rather than an architectural promise in prose.

| ID | Goal and independently verifiable deliverable | `depends_on` | `blocks` | Exclusive ownership | Stable input/output and exact integration point | Required evidence | Mode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M8-C1 | Freeze relationship/action/request/profile contracts and clean-break names | G19 | M8-C2, M8-A1, M8-G1 | gameplay-contracts, gameplay artifacts, subject-registry public types/catalog | canonical JSON → strict parsed/frozen/hash-checked resources | unknown-key, alias rejection, role mismatch, hash and ordering tests | main-agent-only |
| M8-C2 | Compile exact initial `mountedOn` closure | M8-C1 | M8-G2, M8-I1 | authoring schemas/normalizer, compiler, ExecutionPlan | Authoring V4 Relationship + locked Profile/slot → ExecutionPlan V5 initial state | missing entity/slot/socket/profile, duplicate occupancy, contradictory possession tests | sequential |
| M8-A1 | Add trusted Action effect planning without a second command handler | M8-C1 | M8-G1 | gameplay core/action catalog/effect registry interfaces | locked Action Request + read-only state → closed effect plan | duplicate handler census, forged resolver, actor/authority matrix | main-agent-only |
| M8-G1 | Atomically plan/project/commit Mount and Dismount | M8-C1, M8-A1 | M8-R1, M8-H1, M8-I1 | GameplayState relationship/action transition owners | validated effect plan → relationship/action/Event/Receipt/WorldState delta | RED/GREEN transition and rollback matrix | sequential |
| M8-R1 | Project committed mount state into Babylon | M8-G1 | M8-F1, M8-I1 | gameplay-world port and Babylon adapter/runtime | committed relationship delta + slot → prepared/committed body and visual projection | held input, ledge, reset, multi-instance, throwing cleanup tests | sequential |
| M8-F1 | Preserve one support/fact authority | M8-R1 | M8-I1 | MotionKernel retained support and Semantic Fact projector | real `checkSupport()` result → board terrain `supportedBy`; no rider inference | unsupported spawn, ledge departure, landing and no-fake-fact tests | sequential |
| M8-H1 | Wire Host, Browser and capacity/inspection generic relationship surfaces | M8-G1 | M8-CAP1, M8-I1 | RuntimeHost session/journal, Playground coordinator, Browser implementation behind V5 | committed transition → current existing Browser V5 methods | exact-key census, session isolation, stale request tests | sequential |
| M8-CAP1 | Populate and cross-validate Capture tracks | M8-H1 | M8-I1 | control-capture writer/validator and fixture orchestration | journal rows + snapshots → hash-bound NDJSON tracks | tamper/missing/foreign-session and phase-frame tests | sequential |
| M8-I1 | Deliver the human-skateboard end-to-end fixture and final evidence | all prior | — | main agent; fixture, verifier, completion review | bind → mount → move → dismount → move → reset | focused suites, typecheck, root test/build, Browser, Capture, rendered and manual evidence | main-agent-only |

## 13. Acceptance criteria

M8-S1 is complete only when all statements are true on one final tree:

1. Public schemas use only `mountedOn`, role-qualified endpoints and unit-bearing numeric fields.
2. Core Semantic Action remains the sole `action.activate` handler.
3. Mount/Dismount atomically change Relationship, possession, Action, Event, Receipt and WorldState at one Tick.
4. Rider movement/collider authority is suspended while the board alone consumes locomotion input.
5. Dismount either commits a proven safe placement or leaves the mounted state untouched.
6. `supportedBy` comes only from retained Physics support; no Relationship-derived support is published.
7. Browser V5 key count is unchanged and current gameplay methods expose the new state.
8. Capture tracks and frame WorldState identities cross-validate through Mount, movement, Dismount and Reset.
9. The separate G Bot/Golden Rider and primitive skateboard are visibly present and move together in the real Babylon surface.
10. No claim is made for wheel physics, tricks, mounted animation, general vehicle/flight/multi-camera
    behavior, dynamic Route proof, seat/tether, or hosted Builder availability.
