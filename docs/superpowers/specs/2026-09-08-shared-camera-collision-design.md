# Shared camera collision

The user approved the second workstream: ordinary and Training cameras retain
independent framing policies and share collision solving in the existing two packages.

## Ownership

- `three-world`: target, shoulder/posture/vehicle framing, capsule visibility,
  Rapier query filtering, input/mode handoff, fixed clock and final camera write.
- `camera-collision`: provider-neutral pivot separation, safe arm projection,
  immediate retraction, temporal recovery, contact stability and eye sweep.
- Each camera controller owns one solver instance. Reset, teleport and actor/mode
  transitions clear incompatible state. There is no global collision memory.

A query adapter returns sphere cast/overlap distance and world-space contact data.
The shared solver may ignore an arm obstruction only when the eye is clear and
three-world's subject-visibility policy permits it. Thin poles never override
Training's capsule visibility; the moving eye still follows a swept trajectory.

`solve` commits collision memory only from a fixed update or explicit zero-time
lifecycle synchronization. `project` resolves interpolated geometry without
changing memory, timers or the authority tick. Exact captures use the committed
pose. Both paths remain under the existing exclusive camera writer.

## Behavior preservation

Ordinary follow keeps its release hold, deadband and capped half-life recovery.
Training humanoids keep immediate inward correction and 5/s outward recovery;
vehicle framing keeps its existing relative-arm damping, with collision correction
applied afterward. Preserve near plane, FOV, pointer orbit, overview and mount handoff.
Delete replaced collision/recovery implementations after both actual consumers
use the shared solver. No new package, physics world or rendering loop is introduced.

## Acceptance

Existing ordinary/Training collision baselines plus shared-kernel tests cover clear,
partial/full obstruction, eye collision, pivot penetration, recovery and reset.
Exercise render rates, repeated exact/interpolated capture, separate instances,
mount/dismount and Episode lease release. Run the repository runtime closure,
source/type/census/prebuild checks and actual Creator/Episode browser captures.
Cloud generation/provider submission remains outside this task.
