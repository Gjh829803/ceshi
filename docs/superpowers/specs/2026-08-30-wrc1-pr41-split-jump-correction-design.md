# WRC-1 PR #41-Compliant Split Jump Correction Design

**Work packages:** `JUMP-0`, `WRC-GOV-1`, `JUMP-1`, `JUMP-2`, `JUMP-3`
**Status:** implementation baseline
**Date:** 2026-08-30
**Code baseline:** `origin/main@b19f9e4be0cb56fc132cff656ade994df4e88a31`
**Rejected merge candidate:** `origin/codex/integrate-character-jump-animations@2c74fffd004243b98ed30895a8844e76754ea05f`
**Upstream authority:** `docs/superpowers/specs/2026-08-26-whitebox-3c-vnext-architecture-design.md`
**Milestone:** `docs/superpowers/specs/2026-08-30-wrc1-world-reconstruction-and-control-milestone-design.md`

## 1. Decision

The split-jump branch is not merged as implemented. Its useful content is ported onto the PR #41
Golden Humanoid transaction without retaining a Babylon-owned jump state machine or a presentation
input that can rewrite Control.

The accepted chain is:

```text
normalized jumpPressed / jumpHeld / runRequested
  -> CharacterMovementRuntime admits one immutable Jump Episode
  -> BodyPort resolves the one movement proposal
  -> RuntimeHost atomically commits Movement + Jump Episode
  -> subject-actions resolves a presentation key from that committed Episode
  -> Babylon animation and visual anchoring render the committed result
```

`CharacterMovementRuntime` remains the sole owner of jump eligibility, buffering, coyote time,
variant selection, anticipation, takeoff, variable height, vertical phase, landing, Snapshot, Hash,
Reset, Replay, and Rollback. `runtime-babylon` may not hold pending/active jump facts or delay/rewrite
`jumpPressed` and `jumpHeld`.

## 2. User-visible behavior

For a Subject whose locked Control Feel uses the split policy:

- a jump edge with `runRequested === false` selects `small`;
- a jump edge with `runRequested === true` selects `large`;
- selection is frozen when the Episode is admitted and cannot change while the button or run input
  changes later;
- both variants expose a committed anticipation period before physical takeoff;
- small jump ignores later hold extension and uses the short physical arc;
- large jump retains the existing variable-height hold/release behavior;
- collision, ceiling impact, support loss, landing, Reset, Replay, and rollback remain the existing
  PR #41 movement transaction's responsibility; and
- a Subject without the split policy keeps the current `hold-height` behavior and generic jump
  presentation.

The split policy is content behavior, not an animation heuristic. Its anticipation durations are
locked Control Feel values. Animation bindings are accepted only when they cover the presentation
keys required by that policy; clip duration, source frame, and clip name never become Gameplay truth.

## 3. Why the rejected branch violates PR #41

The rejected branch creates `SplitJumpIntentV1` in `@whitebox-world/runtime-babylon` with private
`#pending` and `#active` state. It derives delay from `RuntimeAnimationSetV1`, selects a variant from
`runRequested`, suppresses or re-emits `jumpPressed`/`jumpHeld`, and passes an optional
`jumpPresentation` beside committed Locomotion. That produces five competing facts:

1. Control publishes the original jump edge;
2. Babylon stores a second pending edge;
3. Animation resource timing decides when physics may see the edge;
4. CharacterMovement owns the actual vertical phase; and
5. the presentation resolver trusts an optional caller-owned discriminator.

The Babylon state is absent from the CharacterMovement Snapshot/Hash and therefore cannot satisfy
Reset, Replay, transaction rollback, or multi-instance determinism. The problem is architectural, not
an incomplete test list, so the old class is deleted rather than patched.

## 4. Contract changes

### 4.1 Jump policy

`@whitebox-world/character-movement` owns the canonical policy:

```ts
export type JumpVariantPolicyV1 =
  | Readonly<{
      mode: "hold-height";
    }>
  | Readonly<{
      mode: "run-selects-variant";
      smallAnticipationSeconds: number;
      largeAnticipationSeconds: number;
    }>;
```

`ControlFeelParametersV1`, Registry `ControlFeelProfileInputV1`, normalized Subject data, Execution
Plan/Bootstrap, and CharacterMovement options use that exact type and field name:
`jumpVariantPolicy`. This is a current-only schema change. Every built-in profile and fixture is
updated; no optional alias, inferred default, or V2 profile is introduced.

`hold-height` is the ordinary current behavior. `run-selects-variant` is accepted only when both
durations are finite, non-negative, at most `1.5` seconds, and each converts to a bounded fixed-Tick
count. Numeric tuning continues to tune only the existing numeric Feel values; it cannot change the
policy discriminator or anticipation duration.

### 4.2 Committed Jump Episode

`@whitebox-world/character-movement` also owns:

```ts
export type JumpVariantV1 = "small" | "large";

export type JumpEpisodeStateV1 =
  | Readonly<{
      schemaVersion: 1;
      variant: JumpVariantV1;
      phase: "buffered";
      startedTick: number;
      committedTick: number;
    }>
  | Readonly<{
      schemaVersion: 1;
      variant: JumpVariantV1;
      phase: "anticipating";
      startedTick: number;
      anticipationStartedTick: number;
      committedTick: number;
      anticipationTicksRemaining: number;
    }>
  | Readonly<{
      schemaVersion: 1;
      variant: JumpVariantV1;
      phase: "airborne";
      startedTick: number;
      anticipationStartedTick: number;
      takeoffTick: number;
      committedTick: number;
    }>;
```

`committedTick` is updated by the Movement reducer and must equal the enclosing Movement commit.
`CharacterMovementCommandV1` remains unchanged. `runRequested` is already normalized input and is
read only on the admitted press edge. `MovementCommitV1`, `CharacterMovementStateV1`, and
`CharacterMovementSnapshotV1` gain an optional exact-key `jumpEpisode`. It is absent under the
`hold-height` policy and when no split Episode is active. This is one authoritative field, not a
RuntimeState copy plus a presentation copy.

The state hash includes the Episode. `reset(snapshot)` restores it exactly. Failed Body resolution,
stale Tick, transaction abort, or throwing projection leaves the committed Episode and its sequence
byte-identical to the before-state.

### 4.3 Episode transitions

The legal split chain is:

```text
none -> buffered -> anticipating -> airborne -> none
  \----------------> anticipating
          \------------------------------> none (buffer expiry)
```

- The press edge selects and freezes the variant. If the existing jump buffer accepts the edge before
  support is eligible, the Episode is `buffered`; the existing runtime counter remains the sole
  buffer-duration owner and the Episode stores only the selected variant and provenance.
- Admission to anticipation occurs only when the existing jump buffer/coyote/support rules find a
  legal attempt. Buffer expiry clears the Episode without playing a takeoff presentation.
- Anticipation advances once per fixed Tick. Render frames do not advance it.
- Physical takeoff is proposed exactly once when the counter reaches zero.
- Small jump never applies the held-jump gravity ratio; large jump uses the existing hold window.
- Ceiling impact and apex/landing semantics reuse the existing vertical-phase reducer.
- The Episode clears on committed landing, suspension, explicit Reset-to-initial, or disposal.
- A second press during one Episode cannot replace or queue another variant.

The existing `takeoff/rising/apex/falling/landing` state and exactly-once events remain unchanged.
The Episode supplements them only with the selected split variant and pre-takeoff phase.

## 5. Presentation contract

`@whitebox-world/subject-actions` consumes `jumpEpisode?: JumpEpisodeStateV1` inside
`ActionPresentationResolveInputV1`. The input must match the same `committedTick` as Locomotion. A
caller cannot manufacture a separate `JumpPresentationV1`.

The current presentation vocabulary adds exactly:

```ts
"locomotion.small-jump.takeoff"
"locomotion.small-jump.airborne"
```

Resolution is deterministic:

| Episode / Locomotion | Presentation key |
|---|---|
| buffered | existing committed Locomotion mapping |
| small + anticipating | `locomotion.small-jump.takeoff` |
| small + airborne | `locomotion.small-jump.airborne` |
| large + anticipating | `locomotion.takeoff` |
| large + airborne | existing committed vertical-phase key |
| no split Episode | existing committed Locomotion mapping |

The Registry uses ordinary `AnimationBindingV1` entries. The action IDs
`jump.small.takeoff` and `jump.small.airborne` and their automatic presentation keys are added to the
one current contract. `smallJumpSequence`, `jumpTakeoffDelaySeconds`, and
`jumpSourceTakeoffFrame` are not introduced into Authoring, Compiler, Bootstrap, or Runtime.

The locked split policy requires both small-jump bindings. Missing, duplicate, wrong-rig, or
wrong-asset bindings fail Subject admission before Runtime construction.

## 6. Babylon projection

Babylon receives only the committed `JumpEpisodeStateV1` through the Golden transaction result.
The animation player may retain clip-local playback time and blend telemetry, but it may not:

- choose or change the variant;
- hold a pending Gameplay takeoff;
- rewrite normalized Control;
- infer the Episode from clip time, feet, velocity, or Mesh position; or
- publish animation timing back into Movement.

The vertical foot-support anchor from the rejected branch may be retained only as a presentation
transform below the committed render root. It samples the current visual skeleton and committed
support plane, resets on rebind/reset/dispose, and cannot move the physics Capsule, Subject origin,
Camera target authority, or committed pose. Missing feet or invalid transforms disable the visual
adjustment without changing Gameplay.

## 7. Port inventory

| Rejected-branch content | Disposition | Reason |
|---|---|---|
| alpha local-actions GLB and private-license provenance | port byte-for-byte | useful admitted test asset |
| action/asset manifests and Product Asset Intake | port, then normalize to current contracts | useful provenance and closure |
| Subject Definition, resource lock, resolver, example world | port after clean contract rewrite | proves full product path |
| `vertical-foot-support-anchor.ts` | retain after authority/lifecycle audit | presentation-only foot stability |
| animation player blend and source-clip handling | selectively port with committed-input tests | provider projection only |
| `SplitJumpIntentV1` and its tests | delete | shadow Movement owner |
| `JumpPresentationV1` and caller injection | delete | second presentation authority |
| `smallJumpSequence` schema family | delete | special-case duplicate of binding Registry |
| `jumpTakeoffDelaySeconds` / `jumpSourceTakeoffFrame` Runtime fields | delete | visual asset metadata controlling Gameplay |
| `runCommand(..., jumpPresentation)` overload | delete | uncommitted side channel |

No commit cherry-picks the rejected branch wholesale. Binary/content assets may be restored from the
exact source commit; TypeScript and schemas are ported by responsibility so rejected authority does
not enter an intermediate merge candidate.

## 8. Mechanical governance

`WRC-GOV-1` adds one repository authority policy and verifier. It records protected facts, owner
packages, provider packages, forbidden declarations, forbidden public fields, and required snapshot
coverage. Its first protected fact is `jump-episode`; later WRC Action/Camera work extends the same
policy rather than creating another scanner.

The verifier must reject at least:

- a stateful `SplitJumpIntentV1` declaration under `runtime-babylon`;
- public/runtime fields named `jumpPresentation`;
- Bootstrap/Animation schemas named `smallJumpSequence` or `jumpTakeoffDelaySeconds`;
- a provider import of CharacterMovement private modules; and
- a new accepted jump fact that is not present in the canonical Snapshot parser/hash.

The policy is supplemental architecture evidence. It does not replace TypeScript, contract tests,
the 3C migration verifier, Runtime tests, or PHO. PHO later consumes its receipt.

## 9. Verification boundaries

Inner-loop verification is intentionally narrow:

- contract/parser/hash tests for each schema edit;
- CharacterMovement RED/GREEN tests for anticipation, variant freeze, short/long arc, buffer/coyote,
  ceiling, landing, abort, reset, replay, and two-instance isolation;
- subject-actions tests proving presentation is derived from the committed Episode;
- Babylon tests proving no input rewrite and presentation-only foot anchoring;
- Registry/Compiler/Bootstrap tests for the exact admitted asset closure; and
- one browser verifier plus one manual small/large jump feel check at JUMP-3.

At the merge-candidate boundary, run affected typecheck/tests/build/verifiers once. Cursor Cloud then
performs an independent PR #41 authority review against the exact SHA. The repository-wide heavy
suite is not repeated after every task and is reserved for the Wave A merge candidate or a later
input-invalidating change.

## 10. Acceptance

Wave A is accepted when:

- `SplitJumpIntentV1`, `JumpPresentationV1`, `smallJumpSequence`, and animation-owned takeoff delay
  have zero production references;
- split policy and Episode have one parser, one owner, one Snapshot/Hash representation, and exact
  Reset/Replay/Rollback coverage;
- asset admission fails closed when the split presentation closure is incomplete;
- small and large jumps are visibly different while using one BodyPort/Movement transaction;
- animation, foot anchoring, and render interpolation cannot mutate committed Subject/Body/Camera;
- real Browser evidence shows supported spawn, takeoff, apex, fall, land, and clean Reset; and
- the exact merge candidate has no open P0/P1 finding from the independent review.
