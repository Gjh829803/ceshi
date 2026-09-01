# P2.2-S1 Seated `mountedOn` Control Context Design

**Project code:** `P22-S1`
**Status:** Proposed; implementation must not start before design approval
**Date:** 2026-09-01
**Source baseline:** `origin/main@62db83fc3a894d99f5168a8b1f312b1070c94603`
**Parent roadmap:** P2.2 Subject S3: Mount, Tow and Control Context

## 1. Decision

P22-S1 extends the completed M8-S1 stand-ground relationship path into one seated ground-riding
vertical slice: one humanoid Rider mounts one ground-supported quadruped Mount, transfers possession
to that Mount, follows a locked seat Socket, uses the existing committed Camera Context path, and
dismounts only onto a Physics-proven safe position.

This slice reuses the current `mountedOn` Relationship, `action.activate`, GameplayState,
RuntimeHost fixed-tick transaction, Babylon mounted projection, retained `checkSupport()` evidence,
Camera V2 selection and publication, Control Capture, Reset and replay owners. It does not create a
second riding state machine, support query, Camera context, Camera pose path, or Browser protocol.

P22-S1 is the first of two P2.2 subprojects:

1. P22-S1: humanoid-quadruped seated `mountedOn` and control-context closure;
2. P22-S2: role-qualified `towedBy`, provider-neutral Joint intent, Havok Joint lifecycle and
   horse-cart/car-trailer fixtures.

P22-S2 receives a separate design because it adds a new Relationship kind and a Physics Joint owner.
It must not be implemented opportunistically inside P22-S1.

### 1.1 Normative authorities and precedence

This design is interpreted under `AGENTS.md` and the following durable authorities:

1. `docs/superpowers/specs/2026-08-30-third-person-camera-collision-and-spring-arm-design.md`
   for the latest Camera collision, complete Subject Physics Group, final validation and atomic
   publication contract;
2. `docs/superpowers/specs/2026-08-24-context-driven-gameplay-camera-composition-design.md`
   for committed Gameplay-to-Camera Context ownership and fixed-tick sequencing;
3. `docs/superpowers/specs/2026-08-26-m8-s1-mounted-on-skateboard-design.md` for the implemented
   `mountedOn` transaction, stand-ground baseline and safe Dismount path;
4. `docs/superpowers/specs/2026-08-19-extensible-subject-authoring-design.md` for P2.2 scope,
   role-qualified endpoints and the separation of logical, physical and render graphs;
5. `docs/superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md` for canonical naming,
   AI-facing contracts and single-owner principles;
6. `docs/reviews/runtime-deep-review-checklist.md` and
   `docs/reviews/full-dimension-review-protocol.md` for implementation and review evidence.

If an older example conflicts with the first two Camera authorities, the newer Camera contract wins.
P22-S1 may consume and exercise that contract but may not redefine or partially replace it.

## 2. Goals and non-goals

### 2.1 Goals

- make `seat` a closed Mount Slot mode under the one canonical `mountedOn` Relationship;
- bind every Mount Slot to one exact, locked Relationship Profile;
- remove the unused public `seat` Relationship dialect rather than preserve an alias;
- preserve the existing fixed-tick Mount/Dismount Action, possession and journal transaction;
- generalize Babylon mounted projection from one hard-coded stand Profile to the Profile selected by
  the locked Mount Slot;
- align Rider origin and ground-facing yaw from the committed Mount pose and locked seat Socket;
- suspend and restore the Rider body, collision masks and locomotion without a second Physics owner;
- reuse the existing safe Dismount query and prove rejection is mutation-free;
- publish mounted Camera Context only from committed Gameplay state at the next Camera fixed tick;
- deliver a Host-fixed Canonical humanoid-quadruped acceptance fixture with numeric, Runtime,
  Capture and rendered evidence.

### 2.2 Non-goals

- `towedBy`, `tether`, Tow/Detach, Physics Joint or trailer behavior;
- passengers that do not transfer control, multiple seats, seat switching or multi-controller play;
- wheel, vehicle, animal gait, steering, flight, water or dynamic Route certification;
- persistent seated animation, Action Variant or PoseSet work owned by P2.3/WRC Action;
- Hosted Builder Relationship admission or automatic generation of mounted AuthoringSpec;
- Native Lane Relationship admission;
- new Browser V5 keys, Camera commands, Camera Context tags or Camera profile aliases;
- changes to Camera collision algorithms, Final Frustum Validator or the incomplete CAM-5 production
  claim;
- compatibility with the unreleased reserved `relationshipType: "seat"` dialect.

The Rider may use the existing locked fallback presentation. P22-S1 proves semantic state, spatial
alignment and control transfer; it does not claim production seated animation fidelity.

## 3. Authority map

| Concern | Sole authority | P22-S1 consumer or projection |
| --- | --- | --- |
| `mountedOn` truth | GameplayState `relationshipStatesById` | Runtime, Camera Context, Browser, Capture |
| possession | GameplayState `possessedBy` | input target and Camera control input |
| Mount/Dismount Action | Core Semantic Action plus trusted effect planner | Event, Receipt and presentation |
| fixed-tick transaction and journal | RuntimeHost WorldSession | prepare, commit, abort, replay and idempotency |
| Mount movement and facing | Mount Motion Kernel/controller | Rider pose and Camera target pose |
| Rider mounted pose | committed Mount pose plus locked Mount Slot/Socket | Rider Runtime and visual projection |
| Rider locomotion suspension | committed locomotion Capability State | input, Snapshot and Camera Context |
| ground support | existing Body/Motion `checkSupport()` | `supportedBy`, safe exit and movement |
| collision filtering | Rider Body owner, staged by Babylon transaction | mounted suspension and restoration |
| Camera selection and pose | Camera Domain plus CameraDirector | Babylon Camera and View Snapshot |
| simulation time | RuntimeHost fixed-step Tick | all state, Events, Receipts and Capture |

Gameplay never reads a Babylon node, Mesh name, animation clip, Havok handle or Camera result to infer
the Relationship. Babylon may retain provider telemetry and rollback material, but it must not retain
an independent active/pending Gameplay Relationship state machine.

## 4. Canonical terminology and clean break

`mountedOn` remains the only public riding Relationship. `stand` and `seat` describe how the Rider is
aligned at a Mount-owned slot; they are not Relationship types.

The current unreleased `RelationshipProfileInputV1` branch with
`relationshipType: "seat"` is deleted together with the reserved
`worldkit://capability/relationship.seat@1` and
`worldkit://relationship-profile/seat.driver@1` resources, their Registry edges, Browser inventory,
Normalizer inference, fixtures, hashes, generated schema branches and examples. No parser, adapter or
migration accepts both `seat` and `mountedOn`.

The current reserved `tether` branch, `worldkit://capability/relationship.tether@1` and
`worldkit://relationship-profile/tether.standard@1` are also deleted, including the same Registry,
Browser, Normalizer, generated and fixture surfaces, because they have no implemented consumer and are
not the P22-S2 Tow contract. P22-S2 will introduce exactly one role-qualified `towedBy` Relationship
after its endpoints, binding profile and Joint semantics are frozen; it will not restore `tether` as an
alias.

`MountedOnRelationshipStateV1` and `MountedOnRelationshipSpecV1` do not change. They already carry
the stable role endpoints and `mountSlotId`; the locked Mount definition resolves the slot and exact
Profile. Adding `seatId`, `mode`, provider flags or a Profile copy to the Relationship would create
duplicate truth.

## 5. Mount Slot and Relationship Profile contracts

### 5.1 Mount Slot

`SubjectMountSlotDefinitionV1` becomes a closed two-branch union with one shared shape:

```ts
export interface SubjectMountSlotDefinitionV1 {
  readonly id: string;
  readonly kind: "mount-slot";
  readonly mode: "stand" | "seat";
  readonly relationshipProfileRef: string;
  readonly mountSocketId: string;
  readonly riderSubjectOriginOffsetMetersXYZ: readonly [number, number, number];
  readonly dismountCandidateOffsetsMetersXYZ: readonly (
    readonly [number, number, number]
  )[];
}
```

`relationshipProfileRef` is required for both modes. This is an unreleased current-only clean break:
the existing stand fixture, Authoring Schema, normalizer, Compiler projection, Runtime Bootstrap,
generated validators and tracked artifacts update atomically. There is no inference from the slot ID,
Socket ID or Subject category.

The Mount Socket owns local position and rotation. P22-S1 supports ground seats whose Socket local
pitch and roll are zero. Admission rejects non-finite transforms and non-zero pitch/roll for this
Profile. Rider ground-facing yaw is the normalized sum of committed Mount facing yaw and locked
Socket local yaw. The existing offset is transformed by the complete locked Socket transform and then
by the committed Mount yaw. No renderer node is consulted.

### 5.2 Relationship Profile

The current `mountedOn` Profile branch gains explicit, closed projection policy:

```ts
type MountedOnRelationshipProfileInputV1 =
  RelationshipProfileBaseInputV1 & Readonly<{
    relationshipType: "mountedOn";
    mountSlotModes: readonly ("stand" | "seat")[];
    requiredRiderSocketIds: readonly string[];
    requiredMountSocketIds: readonly string[];
    controlTransferMode: "to-mount";
    riderLocomotionMode: "suspended";
    riderCollisionMode: "suspended-non-colliding";
    cameraTargetRole: "controlled-entity";
    maximumMountDistanceMeters: number;
  }>;
```

For the current production implementation, the previously admitted but unused `keep-rider`, `none`,
`rider` and `mount` alternatives are removed rather than left as false promises. Future passenger or
multi-controller work must add a reviewed closed branch and Runtime evidence.

Two implemented Profile resources remain after the clean break:

- `worldkit://relationship-profile/mounted-on.stand-ground@1`, with `mountSlotModes: ["stand"]`,
  `requiredRiderSocketIds: ["FootAlignment"]` and `requiredMountSocketIds: ["MountStand"]`;
- `worldkit://relationship-profile/mounted-on.seat-ground@1`, with `mountSlotModes: ["seat"]`,
  `requiredRiderSocketIds: ["SeatAlignment"]` and `requiredMountSocketIds: ["seat.mount"]`.

Both are reached through the one implemented
`worldkit://capability/relationship.mounted-on@1` capability. That Capability advertises the canonical
`mountedOn` feature; it does not advertise parallel `stand`, `seat`, `ride` or provider-specific
features.

The Profile arrays are duplicate-free and sorted by canonical code-unit order. Every Mount Slot
references exactly one Profile present in the Mount's locked Capability Assembly. The Profile must
admit the Slot mode and its required Mount Socket; the Rider must provide all required Rider Sockets.
Unknown, reserved or multiply matching Profiles fail before Runtime allocation.

The projection policy is provider-neutral. `suspended-non-colliding` means the Rider Body owner stages
its complete Physics Shape Group out of collision and restores the exact prior masks on Dismount,
abort, reset or disposal. It does not expose Havok masks in public Schema.

## 6. Mount and Dismount transaction

P22-S1 preserves `action.activate` as the only command entry and
`createMountedRelationshipFeatureFactoryV1` as a trusted-effect planner with zero competing Command
handlers. The Mount and Dismount request contracts remain unchanged.

### 6.1 Mount prepare

At planning Tick `T`, reject without mutation unless:

1. request, Action and effect identities are canonical and locked;
2. the Controller possesses the Rider;
3. Rider and Mount are distinct live Entities in the same WorldSession;
4. the Rider is not already mounted and the Mount Slot is unoccupied;
5. the named Mount Slot resolves its exact locked implemented `mountedOn` Profile;
6. Profile mode, Rider Socket and Mount Socket closure succeeds;
7. the Socket-derived Rider pose is finite and within `maximumMountDistanceMeters`;
8. Capacity for Relationship, possession, Capability State, Events, Receipt and journal is available;
9. RuntimeHost can stage the declared Rider locomotion Capability projection, and Babylon can stage
   only the Rider pose plus complete Physics Shape Group suspension owned by its adapter;
10. Camera, renderer and Browser state have not been mutated during prepare.

At the RuntimeHost fixed-tick barrier, the existing three Relationship changes commit atomically:

```text
remove possessedBy(rider, controller)
add mountedOn(rider, mount, slot)
add possessedBy(mount, controller)
```

The instantaneous Mount Action, typed Relationship/Possession Events, Receipt and exact
WorldState-after Hash commit in the existing order. Any prepare or validation failure aborts all staged
provider changes and publishes no partial Gameplay mutation.

### 6.2 Mounted projection

While the committed Relationship exists:

- Mount locomotion is the only movement authority;
- Rider locomotion Capability State is `suspended` and names the Relationship ID;
- the Rider Body's complete Physics Shape Group remains non-colliding;
- the Rider origin and facing are projected from committed Mount pose plus locked Slot/Socket each fixed
  tick;
- public Rider pose remains world-space Subject origin and yaw, never Babylon parent-local coordinates;
- renderer parenting, if used, is replaceable projection only;
- the Rider performs no independent support query and publishes no relationship-derived `supportedBy`;
- the Mount may publish its own retained Physics `supportedBy` fact.

### 6.3 Dismount

Dismount validates the exact active Relationship and current possession of the Mount. Candidate offsets
are transformed from Mount-local space by committed Mount yaw and evaluated in authored order by the
existing Rider Body/placement path. A candidate succeeds only when:

- the Rider's real capsule placement is finite and within admitted world bounds;
- the existing Physics query proves feet support;
- the complete Rider capsule is not blocked by admitted collision;
- no second terrain sampler, ray/AABB grounding or Relationship-derived support is used.

If all candidates fail, `WORLDKIT_DISMOUNT_SAFE_PLACEMENT_UNAVAILABLE` is stable and the mounted
Gameplay, Camera and provider state remain unchanged.

Successful Dismount atomically removes `mountedOn`, transfers possession back to the Rider, restores
the exact Rider collision masks and active Ground locomotion at the accepted position, and publishes
the existing typed Action/Event/Receipt journal. A real independent Rider support result may appear only
on a subsequent committed Body tick.

## 7. Camera contract

P22-S1 introduces no Camera public fields. Seated riding remains `mountedOn`, so the existing closed
`CameraRelationshipContextV1` and rule condition
`{ type: "mountedOn", entityRole: "rider" }` are sufficient.

The authority flow is fixed:

```text
locked Kit/Profile/Slot
  -> fixed-tick committed Gameplay Relationship/Possession/Locomotion
  -> immutable same-tick CameraContextSampleV2
  -> pure Camera selection
  -> CameraDirector
  -> committed Babylon View publication
```

Mount/Dismount commits Gameplay first. Until the next fixed Camera tick succeeds, every public Camera
Target, decision, Rig, Modifier, pose, collision state and telemetry field remains on the previous
coherent publication. Camera failure restores the complete prior Camera transaction state and may recover
on a later tick; it never rolls back committed Gameplay.

The projector preserves committed `controlledEntityId` and `targetEntityId`. It does not rewrite either
to manufacture a mounted rule match. Exactly one relevant Rider relation may activate mounted framing;
ambiguous shared-Mount input fails closed. Relationship Context ordering remains `type` then `id` under
canonical code-unit ordering.

Camera View Preference remains the sole View-State preference contract. Dismount restores the on-foot
selection through the next committed Context; it does not directly assign a Rig. Rebind, Reset and Dispose
must invalidate the old Target, Modifier, Last Safe Pose and Subject Physics Group caches.

P22-S1 reuses the current Camera collision implementation and must not add a second Pose commit path.
Hard `camera-hard` safety, complete Subject Physics Group exclusion, atomic Camera rollback and
collision-filter restoration remain mandatory. The latest Camera design's Final Frustum/Near Plane
Validator is a separate existing CAM-5 completion dependency: P22-S1 must not claim that complete Camera
production milestone or weaken its future integration seam.

## 8. Snapshot, Hash, Reset, Replay and Rollback

No new state owner is introduced:

- `MountedOnRelationshipStateV1` remains in `WorldStateSnapshotV1.relationshipStatesById` and its
  canonical World State Hash;
- the Mount Slot/Profile changes participate in Subject Definition, Registry Resource Lock,
  ExecutionPlan, World Runtime Bootstrap and WorldPackage identity through their owning contracts;
- Rider suspended locomotion and world-space pose remain in committed Capability/Spatial state;
- Receipt `worldStateAfterHash` and Event payloads bind the same committed transaction;
- Request ID replay returns the retained Receipt and creates no duplicate Relationship or provider state;
- RuntimeHost abort restores staged Gameplay relationship, possession, Capability, journal and
  publication state; Babylon abort restores only its staged Rider pose, complete collision masks and
  mounted projection; Camera is unchanged because Mount prepare never enters the Camera transaction;
- world reset creates a new WorldSession, restores only authored initial relationships, and cannot retain
  a dynamic mounted state, old collision masks, Camera target or Event sequence;
- Golden replay records enough committed input to reproduce Slot/Profile resolution, Rider pose and
  collision state without reading renderer state.

Profile or Slot hash drift is an admission failure, never a best-effort fallback to stand mode.

## 9. Failure, lifecycle and diagnostics

Public diagnostics remain provider-neutral and stable. Required cases include:

- Profile missing, unlocked, duplicated, reserved or incompatible with Slot mode;
- missing Rider or Mount Socket;
- non-zero seat Socket pitch/roll in the ground slice;
- non-finite Socket-derived pose or excessive Mount distance;
- occupied Slot, already-mounted Rider, stale possession or wrong WorldSession;
- insufficient state/Event/Receipt capacity;
- prepare throw after partial collision-filter staging;
- one collision-filter restoration setter throws while later shapes still require restoration;
- unsafe Dismount or all candidate positions blocked;
- Camera selection/query/commit failure after successful Gameplay commit;
- reset, rebind or disposal while mounted;
- duplicate Request, replay, two pairs and two Runtime instances.

Every owned resource is disposed once even when a sibling cleanup throws. Cleanup aggregates provider
failures internally while preserving the primary public diagnostic. No raw Babylon/Havok message or handle
crosses the public boundary.

## 10. Acceptance fixture and evidence

The Host-fixed Canonical fixture contains one humanoid Rider and one ground-supported quadruped Mount with
an asymmetric forward-facing seat Socket, asymmetric safe-exit candidates and nearby blocking geometry.
It begins unmounted and exercises:

1. approach and successful Mount;
2. immediate same-tick Relationship/Possession/Locomotion/Event/Receipt assertions;
3. next-fixed-tick Camera Target and mounted modifier publication;
4. Mount movement and yaw with exact Rider world pose alignment;
5. hard Camera wall collision without Rider self-hit or skipped wall;
6. rejected blocked Dismount with no mutation;
7. successful alternate-candidate Dismount and next-tick on-foot Camera restoration;
8. remount, held input transfer, Reset and fresh WorldSession isolation;
9. two independent Rider/Mount pairs and two Runtime instances;
10. 30/60/120-like render cadence with identical committed Gameplay and Camera state.

Evidence is separated:

- contract: strict Schema, hash, Profile/Slot closure, alias rejection and deterministic ordering;
- Runtime numeric: real Babylon/Havok prepare/commit/abort, pose, collision, safe exit and cleanup;
- Browser/Capture: Command, Receipt, Event, Snapshot and WorldSession identity closure;
- rendered visual: Rider alignment and Camera framing/collision inspection;
- manual interaction: mount, move, blocked exit, safe exit, reset and input handoff.

Passing unit tests do not claim visual fidelity. Rendered evidence does not replace state/hash evidence.

## 11. Dependency-aware implementation graph

| ID | Goal and independently verifiable deliverable | `depends_on` | `blocks` | Exclusive ownership and integration point | Required evidence | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| P22S1-D0 | Freeze this design, clean-break ledger and acceptance claim | approved M8/Camera specs | all rows | main agent; this spec only | self-review plus independent Mode A/runtime-deep review | main-agent-only |
| P22S1-C1 | Current-only Slot/Profile contracts and Registry resources | P22S1-D0 | P22S1-C2, P22S1-R1 | subject-registry public types/catalog, direct tests and generated resource indexes | parser/hash/order/unknown/old-seat-and-tether rejection | sequential |
| P22S1-C2 | Authoring/Compiler/Runtime Bootstrap closure | P22S1-C1 | P22S1-R1, P22S1-F1 | authoring Schema/normalizer, Compiler projection, runtime-contracts Schema/generator | exact Profile Ref, mode/socket closure, generated parity and tamper tests | sequential |
| P22S1-G1 | Gameplay and RuntimeHost invariants remain generic for seated Mount | P22S1-C1 | P22S1-R1, P22S1-F1 | mounted feature tests, GameplayState/WorldSession tests; production changes only if RED proves a gap | exact three-change plan, idempotency, capacity, Snapshot/Hash/Event/Receipt | sequential |
| P22S1-R1 | Babylon seated projection, alignment and lifecycle | P22S1-C2, P22S1-G1 | P22S1-F1 | runtime-babylon mounted transaction and Body collision owner | asymmetric Socket, support, masks, safe exit, throwing cleanup, reset/replay | main-agent-only |
| P22S1-F1 | Human-quadruped fixture, Capture and Browser evidence | P22S1-R1 | P22S1-V1 | fixture/controls/verifier/Capture files; no Hosted Builder reopening | real Havok, same/next Tick boundaries, rendered and manual evidence | sequential |
| P22S1-V1 | Frozen exact-SHA integration and truthful status | P22S1-F1 | P22-S2 design | main agent; integration, review and status docs | focused local gates, one Cloud full affected matrix, Grok code review, no P0/P1 | main-agent-only |

Only one mutation lane is initially ready. P22S1-C1 changes the shared public contract, so no worker may
parallelize downstream edits before that contract is frozen. After C1, C2 and G1 may proceed concurrently
only if their file sets and generated-resource processes are exclusive. Runtime, Browser/Capture and final
integration remain sequential. Worker reports are not integration evidence.

## 12. Deletion ledger

The accepted P22-S1 tree must contain none of the following:

- `relationshipType: "seat"`, `relationship.seat@1`, `seat.driver@1` or any Registry/Browser/Normalizer
  route that exposes them;
- `relationshipType: "tether"`, `relationship.tether@1`, `tether.standard@1` or any Registry/Browser/
  Normalizer route that exposes them;
- Mount Slot without `relationshipProfileRef`;
- seat/stand inference from Slot ID, Socket name, Subject kind or renderer metadata;
- a second Mount command handler, Relationship map, support query or Camera Context;
- Camera mutation inside Mount/Dismount prepare or commit;
- compatibility parser, alias, fallback-to-stand or legacy generated schema branch;
- Hosted Builder acceptance of Relationship input;
- product claims for seated animation, Tow, vehicle dynamics, full Camera CAM-5 or WRC completion.

## 13. Completion definition

P22-S1 is complete only when:

- all public names and resources implement the current-only contracts above;
- the existing stand fixture migrates atomically and remains green;
- the new seated fixture passes every automated state/Runtime/Camera/Capture assertion;
- real rendered and manual evidence proves alignment, control handoff and safe exit;
- no old seat/tether dialect or fallback remains;
- final exact-SHA affected/full Cloud gates pass;
- independent Grok change review and main-agent runtime review report no open P0/P1;
- docs say only that the seated ground-riding slice is complete, not Tow, full P2.2, complete Camera
  collision, Hosted production or WRC.
