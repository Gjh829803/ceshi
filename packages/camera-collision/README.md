# Camera collision

Provider-neutral camera safety and recovery. This package owns no scene, physics
world, clock, input or camera object.

`CameraCollisionSolver` takes a sphere-query adapter. `solve(request, timing)`
resolves the pivot, projects the safe arm and commits retraction/recovery and
contact state. An optional eye sweep constrains actual orbit travel. All geometry
is in world-space metres; time is seconds. Adapters preserve native filtering and
return unpadded contact distances. A positive probe radius sweeps a sphere; radius
zero requests a real ray with the same target exclusions.

Contact separation accounts for float32 query precision: even zero authored
clearance needs a small coordinate-scaled margin at pivot, arm and trajectory
contacts. A touching sweep origin is separated before checking the remaining
trajectory; contact must not disable obstacle checks. Final eye spheres are checked
again because cast distances are approximate. Every separation is bounded and
re-queried; this does not suppress real obstructions or change follow damping.
An unresolved pivot retains an already clear committed eye. A measured penetrating trajectory origin may use an independently validated hard
exit. An unresolved origin without sufficient contact data, or an unresolved final
eye, restores the solve transaction with the existing no-safe-pose error;
projection remains stateless.

Optional `retractionHalfLifeSeconds` and `maximumRetractionMetersPerSecond` control
collision transitions in `solve`; omitted values retain immediate correction. A finite
retraction speed must be positive. Contraction uses the configured half-life; angular
catch-up after a constraint uses only its speed cap, while radial recovery keeps its
separate timing. With no collision history, free orbit bypasses this limiter. Actual
recovery persists until the eye catches the proposal, including during continuing
orbit input. A desired trajectory faster than the cap can delay that catch-up.
Intermediate eyes must pass sphere, focus-arm and trajectory checks. A direct chord
may use an inward waypoint on the previous clear arm when rounding a corner.
A blocked recovery route also uses a bounded inward step to avoid sticking on a
corner. A newly penetrating previous eye, or a proven newly obstructed committed
arm, permits a validated hard escape over smoothing limits. Moving the focus behind
a static wall does not permit crossing that wall: retain a reachable eye and report
occlusion. Actual applied eye and arm length
are committed together. Zero-time cuts remain immediate.

`project(request)` performs the same spatial checks without reading or writing
recovery state. Display callers supply snapshot-derived fallback positions, never
the previous displayed camera. Exact captures use the committed fixed pose.

Three-world owns framing and subject visibility. A visibility callback may ignore
an arm obstruction only if the eye is clear; eye penetration still forces safety. The SDK does not install that callback for
ordinary interactive preserve-framing views: solid arm obstructions still retract.
When `visibilityTarget` is supplied, solve and project also cast a zero-radius ray
from the final safe eye to that actual target. An endpoint support-surface hit is
accepted; an intervening hit or occupied origin reports `visibility.status` as
`occluded`, its measured distance and identity, and `limited: true`. This result
keeps the safe pose and does not search for another view or prove that none exists.
The optional target requires the adapter's real zero-radius ray implementation;
ordinary sphere-only requests remain unchanged. Visibility query failure rolls
back the same solve transaction. Project exposes sample diagnostics without
committing fixed recovery state.
Ordinary and Humanoid policies choose recovery parameters independently. Each
controller owns a separate solver and resets it on incompatible actor/mode/start
transitions. Failed solves restore the prior transaction state.

The solver uses `CameraHardDecolliderV1` internally for temporal recovery.
World camera controllers consume the solver directly.
