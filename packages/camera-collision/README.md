# Camera collision

Provider-neutral camera safety and recovery. This package owns no scene, physics
world, clock, input or camera object.

`CameraCollisionSolver` takes a sphere-query adapter. `solve(request, timing)`
resolves the pivot, projects the safe arm and commits retraction/recovery and
contact state. An optional eye sweep constrains actual orbit travel. All geometry
is in world-space metres; time is seconds. Adapters preserve native filtering and
return unpadded contact distances.

`project(request)` performs the same spatial checks without reading or writing
recovery state. Display callers supply snapshot-derived fallback positions, never
the previous displayed camera. Exact captures use the committed fixed pose.

Three-world owns framing and subject visibility. A visibility callback may ignore
an arm obstruction only if the eye is clear; eye penetration still forces safety.
Ordinary and Humanoid policies choose recovery parameters independently. Each
controller owns a separate solver and resets it on incompatible actor/mode/start
transitions. Failed solves restore the prior transaction state.

The solver uses `CameraHardDecolliderV1` internally for temporal recovery.
World camera controllers consume the solver directly.
