# Camera collision

Provider-neutral geometry and radial recovery. This package owns no scene,
physics world, clock, input or camera object. Three-world is the sole camera writer.

`CameraCollisionSolver.solve(request, timing)` resolves the pivot and safe arm,
then commits the radial recovery state. Contraction is immediate. Recovery has
its own half-life, clear hold, deadband and optional speed limit. The actual
applied eye and arm length are committed together. `resetWhenClear:false` keeps
recovery history across unobstructed frames; native vehicle presets use this
policy to avoid popping at slope edges.

An optional `sweepFrom` checks travel for a free arm. An obstructed arm prioritizes
its radial correction, matching the source camera. The solver does not filter
orbit input or introduce an eye-space angular catch-up controller. A penetrating
pivot uses bounded normal/depth separation; an unresolved pivot may retain a
previous clear eye. Invalid queries or failed solves restore the transaction.

`project(request)` applies spatial constraints without reading or advancing
recovery state. It never feeds the previous displayed pose back into fixed history.
Each World controller owns a solver and resets incompatible subject/view history.

Adapters return unpadded world-space metres. Positive radius requests a sphere
sweep; radius zero requests a real ray with the same subject exclusions. The SDK
chooses framing policy: a humanoid may retain an unobstructed eye when actual
capsule visibility permits ignoring an arm obstruction; an occupied eye is never
ignored. `preserveArmDirection` keeps the orbit direction when the pivot moves.

Optional `subjectVisibilityClearance` adds a fixed-step framing preference before
the last visible part disappears. A wider arm probe activates measured subject
sight-line clearance; an already overlapping wide origin does not penalize narrow
spaces. The native adapter derives the margin from body width. Preferred eyes
still undergo sphere occupancy and trajectory checks, and hard radial escape wins
when necessary. `project()` does not apply this preference again to an already
shortened pose. This reduces abrupt occlusion transitions; disconnected free
regions can still require a hard cut. Views with sufficient subject visibility
clearance and explicit authored opening framing retain their existing behavior.

Optional `visibilityTarget` measures a ray from the solved eye to the subject.
It reports clear/occluded, distance and collider identity without searching for
another viewpoint. An endpoint support hit is accepted. Visibility query failure
rolls back the same solve transaction; display diagnostics do not replace fixed
state. This measurement is not proof that every part of a character is visible.

`CameraHardDecolliderV1` is the internal radial recovery implementation. The
behavior reference for the current restoration is recorded in the
[camera restoration review](../../docs/reviews/2026-09-14-camera-behavior-restoration.md).
