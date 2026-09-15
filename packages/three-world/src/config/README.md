# SDK tuning configuration

Defaults and field definitions belong here. Configuration modules contain immutable
values and pure parsing/resolution helpers; runtime state belongs to the World.

| Module | Responsibility |
| --- | --- |
| `camera/` | CameraDocument schema, generic strategy defaults, native humanoid preset, serialization and resolution provenance |
| `control.ts`, `control-fields.ts` | Movement defaults, units, applicability and profile parsing |
| `physics.ts` | Ordinary character collision and movement defaults |
| `actions.ts`, `input.ts` | Action tuning and semantic keyboard bindings |
| `vehicle.ts` | Vehicle attitude calibration and rider pose |
| `presentation.ts` | Shadow defaults and project override parsing |

CameraDocument is the only camera tuning authority. Its views separate position,
orientation, lens, zoom, constraints, subject fading and effects. Half-lives are seconds; distances
are meters; orientation angles are radians. Native on-foot presets and their pure
`createHumanoidCameraDocument` factory derive from `camera/humanoid.ts`; generic
strategy defaults remain separate. Native keyboard cycling is opt-in through the
ordered `input.cycleViewIds` list. Camera roll inheritance is an orientation field,
not a shadow setting or vehicle physics mutation. Enabled speed-FOV effects require
the effective base FOV plus maximum offset to remain below 180 degrees, after
preset/subject composition and opening adoption. Hot edits constrain only the
retained speed-FOV offset to the new enabled envelope; orbit history is preserved.

`preserve-opening` derives initial orbit distance, angles and framing from the
opening pose relative to the declared `position.anchor` and `anchorOffset`.
The generic preserve-opening default is `origin`; body presets explicitly supply
a body anchor. Only initial distance, pitch and FOV are owned by the opening.
Contraction is immediate, matching the source camera; `constraints.recovery`
controls return. The experimental `constraints.retraction` fields are removed;
explicit copies of those fields in development documents must be removed when
migrating to this version. Original source bytes and historical runs remain intact.
`position.armHalfLifeSeconds` damps the Cartesian arm. When speed-distance is
active, its extend/retract response filters the combined requested distance;
explicit zoom smoothing is applied before that response. Native presets set zoom
smoothing to zero, retaining the source response.

`orientation.recenter.yawTarget` selects subject-forward (default),
movement-direction, or world-forward with an explicit `yawRadians`. Direction is
converted from world space into the view's orbit reference. Movement uses measured
horizontal velocity and holds the orbit while it is unavailable, vertical-only or
below the configured minimum speed; reverse travel deliberately selects the reverse
heading. Disabling recentering does not disable reference-frame yaw inheritance.
The authoritative field descriptions are included in discovery and Playground.

`anchorOffset.space:'orbit'` follows the view yaw in its declared reference.
`subject-heading` uses only the subject's continuous heading and retains world up;
`subject-up` inherits its full orientation. `inheritSubjectYaw:false` leaves yaw
under world orbit control while retaining the other subject axes. For following
views, `upHalfLifeSeconds` filters reference up and preserves that history across
cuts. Native aircraft shoulder presets use `subject-heading`; spacecraft chase
uses full subject up with independent yaw.

Native `follow-pivot` and `shoulder-eye` anchors distinguish posture framing from
first-person eye position. Display posture uses the same fixed frame pair as the
camera. An opted-in `orientation.recenter.pitch.targetSource:'subject'` consumes
a native posture preference, falling back to `targetRadians` if unavailable;
it does not switch views or introduce a general state selector.

`input.orbitPitchRateRadiansPerSecond` overrides the shared orbit rate for ratio
pitch input only; native values retain 1.2 rad/s yaw and 1 rad/s pitch. Explicit
switching to another view resets its calibrated orbit rather than restoring dormant
input; selecting the already active following view retains the current orbit.
`subjectFade` controls render-only third-person/shoulder fading between its start
and end distances. Generic views disable it; native on-foot presets enable it below
1.2 metres and fully hide the subject at 0.75 metres. Explicit project overrides can
disable it. First-person uses its separate body-clipping behavior.

Install the full document using `world.setCameraFollow({configuration})`. Select
named views through `setCameraView` and inspect resolved sources, intent, committed
pose and diagnostics through `inspectCamera`. Movement `exportProfile` /
`inspectConfiguration` contain controls only. Asset profiles and vehicle/map specs
cannot override the camera. Project documents embed selected content snapshots;
there is no per-frame lookup or hidden map-name precedence.

For new views, subjects, strategies or state-driven selection, follow the
[camera extension maintenance contract](../../../../docs/three-sdk-architecture.md#相机扩展维护规范).

Playground edits its active project document using the same SDK fields and edit
session. Apply, save-file and commit-reset-baseline are distinct operations. The
local file service uses fixed config IDs and optimistic file hashes; file HMR
preserves World/baseline identity and pending drafts. Static builds have no write
service. Existing unexported v1 browser profiles stay untouched in their old storage
namespace and require explicit migration; they are not automatically active.

`DEFAULT_SHADOW_SETTINGS` still defines shared renderer/light settings.
`createWorld({shadows})` / `createHumanoidWorld({shadows})` apply project overrides;
`world.configureShadowLight(light)` applies those values to an authored light.
Light placement and mesh cast/receive flags remain Three authoring choices.
Playground imports preset-content `config/presentation.json` and uses the same
`resolveShadowSettings` parser. Camera and movement defaults do not mutate running
worlds when source files change: build and apply the intended source explicitly.

## Camera discovery artifact maintenance

`camera/fields.ts` and its imported configuration modules define the public camera
schema and metadata. Run `pnpm exec tsx packages/three-world/scripts/generate-camera-validator.ts`
from the repository to regenerate the standalone validator and derived
`camera/discovery.generated.json`. Commit both outputs with the authoritative source.
The artifact records SHA-256 hashes of the browser value-import closure discovered
by esbuild from `camera/index.ts`, including generated validation and imported helpers.
It contains no separately authored defaults.

Creator parses this JSON without executing workspace TypeScript. It verifies the
recorded sources and relative runtime import closure against the selected SDK source
snapshot. Missing, malformed or stale artifacts yield unavailable metadata; current
source declarations remain discoverable. This is a maintenance workflow, not another
production generation gate. Runtime observation reports the actual adopted document
hash and configuration/commit revisions independently of this auxiliary artifact.
