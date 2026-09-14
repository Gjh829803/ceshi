# Camera view selection

## Outcome and scope

Keep the existing Three `PerspectiveCamera`, calibrated strategies, collision solver,
CameraDocument presets and single CameraController. Add optional selection of named
views from measured subject state. An omitted `viewSelection` leaves existing behavior
and serialized documents unchanged. The first supported fact is native humanoid
`swimming`; unknown facts on ordinary authored Mesh subjects remain unavailable.
No camera/control replacement or new npm dependency is required.

Three owns camera pose/projection primitives; gameplay rules belong above them:
[Camera](https://threejs.org/docs/pages/Camera.html),
[PerspectiveCamera](https://threejs.org/docs/pages/PerspectiveCamera.html).
The selection module returns a view choice, never writes a Three camera or runs a loop.

## Authoring contract

`CameraDocument.viewSelection.rules` contains `{id, when: {state: 'swimming'}, viewId,
priority?, enterDelaySeconds?, exitDelaySeconds?}`. Defaults are priority 0 and zero
delays. Higher priority wins; array order breaks ties. The rule references an existing
view. A custom view explicitly references a compatible preset and changes only its
needed overrides; the rule does not contain a second parameter tree.

The default view is the automatic fallback. No rule is required for existing swimming
posture/eye behavior. An optional rule with unavailable subject facts/anchors is skipped
with diagnostic explanation; keep a legal current view if the fallback is also unavailable.
An exit delay cannot retain an unusable current view; select the legal fallback immediately.
A structurally invalid document or an explicitly requested invalid view still fails.

## Runtime ownership

Selection runs once before input preparation, using the last committed subject facts.
Physical swimming detected in a fixed step affects the following step's view/input basis.
Rendering, screenshots and inspection never advance selection or debounce timers.
Unchanged selection does not call setView, reset orbit, or restart a blend. A changed
choice uses the controller's existing transition and cut behavior.
Automatic changes rebase the current orbit heading into the destination reference
frame, retaining the orbit inactivity timer and using the destination pitch/distance.
They must not reseed heading from a backwards-moving actor and reverse input. Explicit
view selection retains its existing calibrated-opening behavior.
An on-input opening remains unchanged while idle; its activating input selects
the applicable rule before that same tick's movement basis is produced.

Manual `setCameraView` (including view-cycle input) pins that view until
`resumeCameraViewSelection()` or a subject/lifecycle invalidation. Orbit and zoom alone
do not disable rules. Resuming recomputes from current facts; it does not restore cached
camera coordinates. A subject identity/generation change resets transient choices and
uses the new subject's legal fallback before admitting its active strategy. Reset clears
manual choice and pending timers and returns to the sealed default view.

Authored mode is never taken over. Applied edit drafts suspend automatic selection while
keeping ordinary camera editing available. Their release resumes selection; stale
sessions must not leave a permanent suspension after reset.
The edit session can also resume rules without discarding its original cancel checkpoint.
Episode owns selection while it owns the simulation clock: explicit view selection remains pinned. Automatic
recording requires explicit `start.cameraViewSelection:'automatic'` and uses the same controller rules;
release removes the Episode suspension. No alternate recorder selector is permitted.
An explicit view action inside an automatic segment reacquires Episode's selection
hold transactionally, so subsequent subject retargets keep that view until release.
Release revokes Episode's manual choice without evaluating a new pose; live rules
resume on the next fixed step.

Selection state and its reason are included in CameraInspection, controller checkpoints
and operation rollback. Known unavailable rules are diagnostic feedback, not a new
production generation gate. Geometry failures keep the existing transaction contract.

## Consumer integration

Creator's programming guide is the production authority for defaults, overrides and
state rules; environment/schema discovery points to it and exposes generated schema.
Keep snippets short and place executable examples/tests with their existing owner.
Playground exposes current selection reason and return-to-automatic action; configuration
uses the same document and SDK parsing. Existing tuned project files receive no rules.
Episode validates referenced views and explicit-vs-automatic selection and preserves
camera/source identities in recorded state.

## Verification

- No-rules baseline trajectories and existing camera suite remain unchanged.
- Enter/leave water, configurable delay and brief state flaps, priority/ties, unavailable
  facts/anchors, manual selection, resume, repeated observation, view transition in flight.
- Subject replacement, mounting while a swimming view is selected, reset/checkpoint,
  failed explicit selection and failed fixed commit, editor lifetime.
- Real Creator preset discovery plus partial override, native swimming facts, and Episode
  fixed-view versus opted-in automatic recording through actual public consumers.
- Typecheck, schema generation, affected tests, census, runtime and Playground builds.

## Local implementation evidence

Implemented in the dev-based `codex/camera-maintenance` worktree. The 51-file camera
maintenance suite passed 927 tests, including the existing calibrated trajectory
fixtures, native swimming/exit, subject fallback, manual/resume, edit suspension and
Episode selection. Creator discovery and real browser Episode adapter checks passed.
Typecheck, lint, workspace boundary/census checks, runtime prebuild and Playground
build passed. A separate Playground browser session verified importing/applying rule
configuration, visible selection source, and returning from editing to automatic mode.
Its temporary server/browser were stopped afterward; project calibration files were not changed.

Supported state is currently native swimming. Other states require measured adapters
and contract tests. Rule authoring uses CameraDocument JSON; the Playground displays
selection status and resumes automatic mode, without a separate graphical rule editor.
No external production generation job was submitted. Subsequent review and CI are tracked
in [PR #249](https://github.com/seedleap/agent-whitebox-world-sdk/pull/249) and the
[review record](../../reviews/2026-09-14-camera-view-selection.md).
