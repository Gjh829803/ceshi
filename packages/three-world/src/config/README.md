# SDK tuning configuration

Developer-maintained defaults live here. Edit the relevant table, rebuild the SDK,
and verify the result in Playground. Playground's calibrated behavior is the product
baseline; Playground consumes these defaults rather than maintaining a second copy.
Config modules contain data, field definitions and pure parsing/selection helpers.
They do not own a World, renderer, simulation loop or mutable runtime state.

| File | Responsibility |
| --- | --- |
| `control.ts` | Contextual movement defaults, ranges and profile value parsing |
| `control-fields.ts` | Existing control parameters: meaning, units and family applicability |
| `camera.ts` | Contextual camera defaults, view settings, shared schema and editor bounds |
| `follow-camera.ts` | Ordinary independently controlled subject camera defaults |
| `physics.ts` | Ordinary character collision/movement defaults |
| `actions.ts` | Humanoid action and surface-action tuning |
| `input.ts` | Default semantic keyboard bindings and supported codes |
| `vehicle.ts` | Vehicle attitude calibration; affects hull clearance and rider pose |
| `presentation.ts` | Shared shadow defaults and project override parsing; internal camera effects |

To disable first-person camera roll inheritance, change
`CAMERA_EFFECTS.vehicleTurnLean.enabled` to `false` in `presentation.ts`. `strength`
is a ratio from 0 to 1; the default 1 preserves the previous frame. This affects
camera roll around its existing sight line, not the eye position, look direction,
vehicle attitude, steering, collision or animation. At an exactly vertical sight
line there is no unique horizon, so the existing up vector is retained. Third-person
and shoulder camera behavior are unaffected by this switch.

`DEFAULT_SHADOW_SETTINGS` defines the shadow switch, algorithm, map resolution,
directional coverage/depth range, bias, normal bias, filter radius and intensity.
`createWorld({shadows})` and `createHumanoidWorld({shadows})` apply these defaults
with optional partial project overrides to the world's renderer. Call
`world.configureShadowLight(light)` for each authored directional light that should
use the same settings, including new lights after map replacement. This is a
one-time application; scene code retains light placement, tracking and disposal.
Mesh `castShadow`/`receiveShadow` flags remain authored Three properties.

Playground imports `packages/preset-content/config/presentation.json` and
passes its `shadows` through the exported `resolveShadowSettings()` parser. An
empty object inherits SDK defaults; `{"shadows":{"enabled":false}}` turns them off.
Other projects can import their own JSON the same way. These are build-time
project inputs, with no implicit file fetch or hot reload. Restart `pnpm dev` and
refresh Playground after edits. `profiles.json` remains the per-actor tuning file.
The readonly `world.shadowSettings` contains resolved requested settings; effective
GPU resolution can be lower on devices with a smaller texture limit.

Camera effects remain internal and are not exposed as Agent profile parameters.
Existing public movement/camera settings remain available through `HumanoidProfile`.
Defaults are immutable; each runtime receives its own resolved copies. Changing a
table requires a runtime rebuild and does not mutate already running worlds.

`exportProfile()` returns the replayable profile: materialized controls plus explicit
camera overrides. `inspectConfiguration()` returns it alongside the current subject's
resolved camera settings and actually applicable controls. Camera owner and mode are
included so configured follow settings are not mistaken for an authored camera pose.
Both are read-only copies; observation does not advance time.

Playground's saved form is complete and supports the current schema only. SDK profile
updates are partial and merge through the existing runtime owner. Browser storage is
for developer tuning; persist the chosen profile into project source for delivery.
Algorithmic equations, runtime state and asset identities stay with their owners;
not every numeric literal is a tunable setting. Host account/admission/deployment
configuration remains in the repository-level `config/` directory.

This follows the separation of behavior and tuning data described by
[Epic's data-driven gameplay guidance](https://dev.epicgames.com/documentation/unreal-engine/data-driven-gameplay-elements-in-unreal-engine).
The implementation uses ordinary typed TypeScript modules, without a config server,
hot-reload registry, new package or additional production stage.
