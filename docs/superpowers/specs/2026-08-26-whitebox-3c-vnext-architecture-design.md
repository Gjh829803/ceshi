# Whitebox 3C vNext Architecture Design

**Status:** implementation baseline
**Date:** 2026-08-26
**Upstream baseline:** Git `origin/main@387551a9f722d1ec2791654dac5bb4745103a01a`, imported as Diversion `dv.commit.1`
**Integration branch:** Diversion `codex/3c-vnext-task6-integration` (`dv.branch.6`)
**Semantic migration source:** Git merge checkpoint `5cca7fd`
**Runtime providers:** Babylon.js `9.21.2`, Havok `1.3.14`

## 1. Decision

Whitebox adopts a complete target architecture and migrates it as a sequence of vertical slices. The
first production slice is one complete third-person **Golden Humanoid**. It covers Character,
Control, Camera, state, Actions, animation and Physics together; it does not attempt to productize all
ten candidate controller families.

The generalized `MotionKernelRuntimeV1` is not retained as a public architecture. Its useful
algorithms are migrated into one provider-neutral movement authority:

```text
CharacterMovementRuntime
  + MovementMode
  + TransitionResolver
  + LayeredMove
```

Babylon/Havok remain providers. They do not own gameplay meaning. Animation and Camera are
projections of committed state, never competing movement authorities.

## 2. Scope and non-goals

The Golden slice supports:

- third-person camera-relative walk/run;
- jump buffer, coyote time and variable jump height;
- `takeoff/rising/apex/falling/landing` vertical phases;
- ceiling impact, ledge departure, landing and slopes;
- one interruptible semantic Action;
- one collision-limited Root Motion Action;
- fixed-tick deterministic state and event output;
- camera orbit and collision without character-facing feedback;
- serialization of Command, Tick, Snapshot and state hash.

It does not add multiplayer prediction/rollback, a permanent V1/VNext compatibility layer, a new
renderer, or a Havok-provider API that the locked version cannot prove.

## 3. Package boundary

Create `@whitebox-world/character-movement` as a provider-neutral package. Retain the following
owners:

| Concern | Owner |
|---|---|
| public gameplay state and events | `@whitebox-world/gameplay-contracts` |
| semantic Action admission and presentation selection | `@whitebox-world/subject-actions` |
| movement transition, LayeredMove composition, deterministic root sampling | `@whitebox-world/character-movement` |
| camera semantic selection and provider-neutral query contract | `@whitebox-world/camera` |
| fixed-tick transaction and journal | `@whitebox-world/runtime-host` |
| Babylon/Havok body adapter, animation player, collision query adapter, CameraDirector | `@whitebox-world/runtime-babylon` |

Provider-neutral packages must not import Babylon or Havok. Protected Babylon Character Controller
extensions live in one Body Adapter, are version locked, and have a real-engine conformance probe.

## 4. Authority model

For every writable fact there is one owner:

| Writable fact | Single owner | Readers |
|---|---|---|
| input intent | Control normalizer | Action admission, movement |
| Action lifecycle | Gameplay/Action authority | movement, animation, camera |
| movement proposal and vertical phase | CharacterMovementRuntime | BodyPort, animation, camera |
| collision-resolved body result | BodyPort provider adapter | movement reconciliation |
| committed Locomotion state/events | RuntimeHost commit barrier | animation, camera, world model |
| animation clip/time/blend telemetry | Animation Presentation | human diagnostics only |
| camera semantic choice | Camera Domain | CameraDirector |
| final camera pose | CameraDirector | renderer |
| rendered/interpolated transform | Render projection | display only |

No animation code writes Subject Transform. No camera orbit code writes character facing. No Action
resolver reconstructs Locomotion from velocity after commit.

## 5. Public Locomotion contract

`LocomotionCapabilityStateV2` is a strict discriminated union. Its active branch contains:

```ts
type MobilityModeV2 = "grounded" | "airborne";
type GaitV2 = "none" | "idle" | "walk" | "run";
type VerticalPhaseV2 =
  | "none"
  | "takeoff"
  | "rising"
  | "apex"
  | "falling"
  | "landing";
type SupportModeV2 = "supported" | "sliding" | "unsupported";

interface ActiveLocomotionCapabilityStateV2 {
  schemaVersion: 2;
  status: "active";
  mobilityMode: MobilityModeV2;
  gait: GaitV2;
  verticalPhase: VerticalPhaseV2;
  supportMode: SupportModeV2;
  movementMedium: "ground" | "air";
  facingYawRadians: number;
  linearVelocity: { x: number; y: number; z: number };
  horizontalSpeedMetersPerSecond: number;
  committedTick: number;
  phaseEnteredTick: number;
  transitionSequence: number;
}
```

The suspended branch carries `schemaVersion`, `status`, its relationship, `committedTick` and
`transitionSequence`; it does not fabricate a velocity, gait or support fact.

`LocomotionTransitionEventV1` contains exactly these semantic forms:

- `phase-changed` with from/to phases;
- `apex-crossed`, emitted once for one airborne episode;
- `landed`, emitted once at the airborne-to-grounded transition.

`landing` is a short-lived state. `landed` is an event. Apex detection uses a vertical-speed threshold,
hysteresis and an episode latch so noisy zero crossings cannot duplicate the event.

## 6. Fixed-tick transaction

One authoritative fixed Tick has exactly this order:

1. normalize input;
2. resolve possession and Action admission;
3. advance Action state and produce deterministic `LayeredMove` values;
4. call `BodyPort.beginTick()` and obtain one environment/support sample;
5. resolve `MovementMode` and vertical transitions;
6. create exactly one movement proposal;
7. call `BodyPort.resolve()` exactly once;
8. reconcile and atomically commit state, facts and events;
9. project committed state to animation and Camera Context;
10. render interpolation reads two committed Snapshots.

Opaque same-tick tokens prevent a support sample, proposal or body result from being reused in a
different Tick. If any prepare/resolve phase fails, state, event sequence, transition sequence and
journal remain byte-identical to their before-state.

## 7. Movement runtime and BodyPort

Provider-neutral public shapes are:

```ts
interface CharacterMovementRuntimeV1 {
  beginTick(command: CharacterMovementCommandV1): MovementTickTokenV1;
  proposeMovement(token: MovementTickTokenV1, sample: BodySampleV1): MovementProposalV1;
  reconcile(token: MovementTickTokenV1, result: BodyResolutionV1): MovementCommitV1;
  snapshot(): CharacterMovementSnapshotV1;
  reset(snapshot?: CharacterMovementSnapshotV1): void;
  dispose(): void;
}

interface CharacterBodyPortV1 {
  beginTick(request: BodyBeginTickRequestV1): BodySampleV1;
  resolve(request: BodyResolveRequestV1): BodyResolutionV1;
  reset(): void;
  dispose(): void;
}
```

The BodyPort makes one authoritative support query per Tick and one movement/collision resolution per
Tick. Provider diagnostics may be preserved, but gameplay cannot branch on provider-private objects.

## 8. LayeredMove and Root Motion

`LayeredMoveV1` is a closed union whose first Golden forms are `impulse` and `root-motion`. Composition
order is deterministic: higher priority first, then earlier `startedTick`, then UTF-8 byte ordering of
the stable ID.

Root Motion is authorized only from a compiled Action binding containing a locked resource Ref and
Hash. A deterministic fixed-tick sampler produces displacement/yaw deltas. The animation player does
not sample authority data and never writes Transform. The movement runtime combines the delta with
locomotion and sends the one proposal through BodyPort; collision resolution may shorten or reject it.

## 9. Animation presentation

Animation consumes the committed Locomotion V2 and committed Action state. A resolver chooses a
semantic presentation key, then a registry maps that key to locked clip data. Clip name, normalized
time, blend weight and interruption telemetry may be exposed for human debugging, but are explicitly
non-authoritative and cannot be written back into world state.

## 10. Camera

`CameraContextSampleV2` reads only committed state: Subject pose, Locomotion V2, Action summary and
stable environment facts. The Camera Domain selects semantics; `CameraDirector` alone owns the final
Pose.

`CameraCollisionQueryPortV1` returns a hit plus a quality tag:

```ts
type CameraCollisionQueryQualityV1 =
  | "exact-sphere-sweep"
  | "ray-fan-approximation";
```

The first implementation wraps the existing multi-ray avoidance behind this port and declares
`ray-fan-approximation`. Exact sphere sweep is admitted only after the locked provider API has a
conformance test. Orbit input modifies CameraDirector state only.

## 11. Stable failure semantics

The first public diagnostic codes are stable strings:

- `3C_INPUT_INVALID`
- `3C_TICK_TOKEN_STALE`
- `3C_SUPPORT_SAMPLE_DUPLICATE`
- `3C_BODY_RESOLUTION_DUPLICATE`
- `3C_LAYERED_MOVE_SOURCE_UNRESOLVED`
- `3C_ROOT_MOTION_HASH_MISMATCH`
- `3C_ROOT_MOTION_SAMPLE_INVALID`
- `3C_LOCOMOTION_TRANSITION_INVALID`
- `3C_CAMERA_CONTEXT_UNCOMMITTED`
- `3C_CAMERA_QUERY_UNAVAILABLE`
- `3C_RUNTIME_DISPOSED`

All parsers are strict, exact-key and deep-freezing. All failure paths are covered by before/after
snapshot tests.

## 12. Migration and clean break

The work graph is fixed:

```text
3C-0 baseline/census
  -> 3C-1 contracts and package boundary
       -> 3C-2 movement core -----------+
       -> 3C-3 Babylon/Havok adapter ----+-> 3C-6 Golden integration
       -> 3C-4 Action/Root/Animation ----+
       -> 3C-5 Camera -------------------+
                                             -> 3C-7 clean break
                                                  -> 3C-8 evidence/review
```

`config/3c-migration-ledger.json` records each old symbol, target owner, dependencies, deletion
condition, state and evidence. `pnpm verify:3c-migration` rejects malformed entries, increasing legacy
counts, completed entries with live old references, or target owners outside the frozen boundary.

Incomplete work stays on the implementation branch. Main never carries a long-lived V1/VNext dual
authority. When the Golden Humanoid slice lands, its old controller/kernel/action inference path is
deleted in the same integration.

## 13. Golden acceptance

Automated evidence must cover:

- walk/run and camera-relative control;
- jump buffer, coyote time, short/long jump, ceiling impact and ledge departure;
- slopes and exactly-once rising/apex/falling/landing transitions;
- an interruptible semantic Action;
- a collision-limited Root Motion Action;
- animation reads committed state only;
- camera orbit cannot alter character yaw;
- 30/60/120-like render cadence yields identical fixed-Tick state;
- identical locked resources, Commands and Seed yield identical state hashes;
- reset/dispose/two-session isolation and rollback on failure.

Passing automation does not promote a Control Profile. It remains `experimental` until two human
feel-review rounds produce `FeelReviewReceipt` records bound to Commit, Profile Hash and Fixture Take.
The receipt is evidence of review, never generated or inferred by automation.

## 14. Estimate and release rule

The expected Golden implementation is roughly 6,000–10,000 production lines plus 10,000–18,000 lines
of tests/verification over 3–5 calendar weeks. Production-grade humanoid breadth is 5–8 weeks; all ten
candidate controller classes are 12–18 weeks including human review.

Release requires zero Golden-scope legacy authority references, green focused 3C gates, green
same-tree integration gates except explicitly documented inherited environment failures, browser
evidence, and two real human feel reviews. Until then the implementation may be technically complete
but its profile status stays `experimental`.
