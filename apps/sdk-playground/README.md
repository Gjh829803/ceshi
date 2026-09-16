# React Playground

The maintainer editor uses React and shadcn/ui form components. It reuses the
Three SDK and the scene/configuration modules in `packages/preset-content`.
The shared directory contains scene modules and configuration only; the former
DOM editor has been removed. Creator uses the standalone vehicle-sandbox example.

```sh
pnpm dev                       # http://127.0.0.1:5178 (repository root)
pnpm dev:editor                # same React editor
pnpm build:editor              # .codex-tmp/react-playground-dist
pnpm test:editor:browser        # real browser flow against running editor
pnpm --filter @worldkit/sdk-playground typecheck
```

Stop an existing preview on port 5178 first. The development server supports HMR;
changes to the scene entry reload the world. A production build includes the
verified asset catalog closure and can be served as static files. No CDN runtime
imports or external model fetches are needed.

## Local diagnostics and reproduction

The shared camera inspection, debug controls and input recording implementation
comes from `@worldkit/three/debug`. Playground supplies scene lifecycle, UI and the
loopback artifact service; these adapters are not imported by the SDK.

The read-only browser tool `inspect_camera` (also `window.playground.inspectCamera()`)
returns compact committed camera poses, orbit, relative roll, collision and errors.
It does not render or enable probe capture. Existing query evidence names its
fixed/presentation source, stale tick and dropped probes; missing samples and
undefined pole roll are explicit. This is committed state, not a saved display frame.

Development builds also expose these WebMCP tools through `window.playground.debug`:

| Tool | Purpose |
| --- | --- |
| `inspect_debug_controls` | Read character/camera state, declared views and actual action eligibility. |
| `set_debug_simulation` | Pause or resume the existing SDK clock. |
| `step_debug_simulation` | Advance 1–120 fixed ticks with movement, camera input and optional first-tick crouch/prone/cancel actions. Leaves paused. |
| `set_debug_character_pose` | Place the controlled on-foot character with clearance validation; resets its local motion/action state. Heading 0 faces −Z. Leaves paused. |
| `set_debug_camera` | Set absolute follow orbit intent, explicitly enter authored eye/lookAt mode, or restore a declared follow view. Leaves paused. |
| `execute_debug_vehicle_action` | Request normal vehicle entry/exit; proximity and other SDK rules still apply. |

For example, call `set_debug_character_pose` with
`{positionWorldMetersXYZ: [-294.6, 0.03, -208.4], facingYawRadians: 0}`, then
`set_debug_camera` with `{mode: "orbit", yawRadians: 0, pitchRadians: 0.2}`.
Use `step_debug_simulation` with `{frames: 30, input: {moveXRatio: 1, cameraYawRatio: 1}}`
to exercise movement and orbit together. Read `inspect_camera` for the resulting
safe camera position. Follow orbit preserves the camera document and uses SDK
collision resolution; the requested intent may differ from the applied pose.
Orbit placement starts with a cut, so it is not a restoration of smoothing history.
Authored mode deliberately releases follow; restore its original default view first.
For semantic character actions, reuse `perform_character_action` with a stable
request ID and `get_character_operation` to inspect completion. Semantic actions
preserve pause state and need stepping/resume to progress.
Tools return applied/rejected status and actual state; unsupported actions are not
forced. The existing `window.playground.reset()` restores the scene baseline.
These controls do not restore arbitrary physics checkpoints.

### Incident capture and input replay

In development, click **记录现场** in the upper-right viewport toolbar or press **F8**
(or call `set_debug_history({enabled:true})`)
before reproducing. This opts into the latest renderer-frame copy and the last
600 consumed input ticks. When an issue appears, click **保存现场**, press **F8** again,
or call `capture_debug_incident` to save that cached
image, its displayed camera pose, fixed snapshot, camera diagnostics and source
identity, and pauses by default. Capture never re-renders or advances the world;
without a cached frame it reports unavailable. During a reproducible recording,
saving an incident freezes the input prefix ending at that exact captured frame.
The result reports whether that frame has a replayable trace; recent-input history
alone has no reset anchor. Images keep aspect ratio with a
maximum edge of 1600 pixels; enabling history adds frame-copy/observation overhead.

`start_debug_recording({maximumSeconds:30})` explicitly resets the scene baseline,
then reapplies the current on-foot position, movement profile and follow-camera
setup. It leaves paused so input can start deliberately. Resume or use debug steps;
`stop_debug_recording` pauses and saves the recording. `replay_debug_recording`
replays the stopped session, or accepts `{bundleId}` from a saved result after reload.
Replay returns a task ID immediately; poll `inspect_debug_recording.replayOperation`
for its progress and retained terminal result. It uses recorded SDK input
(including pointer deltas), fixed ticks and render
interpolation; `cancel_debug_replay` interrupts it. `inspect_debug_recording` reads
status. Recordings are bounded to 120 seconds / 20,000 events.

Artifacts go to ignored `.codex-tmp/playground-incidents/<id>/`: `incident.json`,
optional `frame.png`, and `recording.json`. The loopback-only service requires a
same-origin session; static builds expose no filesystem service. `sourceHash`
identifies workspace source and asset bytes, including dirty files, rather than
pretending the Git HEAD alone identifies the running development tree.
Changed source/map or discontinuous input ticks reject replay by default. To test
a fix against saved inputs, explicitly set `allowSourceChange:true`; the result
retains both source hashes and marks a cross-version comparison. External commands,
random scene behavior or unrecorded edits can diverge: replay checks character,
mount/posture and camera results and reports the first mismatch. It is baseline
input reproduction, not a claim that any live physical state can be restored.

## Display previews

The **性能** panel stays open during gameplay until its button is toggled again.
It floats above the bottom status bar, or above the shortcut window while that
window is expanded. Its open/detail state is persisted with the other panels.
It contains the application's only FPS readout, **游戏实时 FPS**, labeled
**主画面渲染计数 · 自动检测**. Sampling starts with the game and continues while
the panel is closed, with no measurement button, on-canvas marker or native helper.
FPS averages recent main-view render intervals over approximately one second and
updates every 0.5 seconds, in both development and static production builds.
Its FPS and render interval graph sample completed SDK realtime render cycles using
`onFrameTiming` and a monotonic wall clock, excluding manual renders and captures.
The graph publishes every 0.5 seconds and retains five seconds.
Pausing clears the reading; missing realtime frames expire it after
1–1.5 seconds. This measures game render submissions, not GPU completion or screen
presentation. Expand **详细信息** for actual drawing-buffer resolution, renderer
pixel ratio, mean CPU update and main-view render-submission times over each
0.5-second reporting window, and the latest valid asynchronous GPU timer result.
CPU update excludes display interpolation; CPU submission is not GPU time.
Unsupported or invalid GPU timing is labeled explicitly. Details are sampled only
while expanded; paused/background samples expire, and collapsing releases timing
hooks and GPU queries. Auxiliary camera/offscreen renders are excluded from render
timing. These diagnostics do not alter the SDK clock or recording.

The viewport toolbar separates **画面** (material, clay, unlit, linear depth,
type colors and camera-space geometry normals) from **显示检查**. Each mode has
an always-visible purpose and usage explanation. The inspector shares one scope
(whole scene, current subject or selected objects) across its Objects and Helpers
tabs. The current subject includes its rider/mount combination. Object selection
does not change gameplay control or the camera. Search and grouped rows operate on
actual scene roots; selection, visibility and temporary isolation are independent.
Exiting isolation restores the previous scope, hidden objects and type filters.

The camera checkbox switches the main viewport to an external world camera and
frames the current subject with the actual gameplay camera model. Frustum length
does not push the world view farther away.
Left-drag orbits, right/middle-drag pans and the wheel zooms this world view.
Clicking the viewport retains keyboard gameplay: movement, mounting and V camera
switching still go to the SDK. Simulation continues; there is no observer toolbar
or separate input mode. The world view shows full characters even when the gameplay
camera uses first person. Unchecking restores the current gameplay view without
resetting its mode or the controlled actor. Camera guides follow real camera poses
and projection; the distance setting only caps their visual length. A live camera
preview appears at the lower right of the world viewport; **放大 / 还原** changes
its size without pausing or changing control. **定位摄像机** immediately reframes
the current camera and subject, resetting the orbit centre. **跟随位置** (off by
default) translates the world view with the displayed vehicle root when mounted,
or the character root on foot, while retaining the manually chosen viewing angle
and distance. Gameplay camera orbit, turn recentering, view switching and collision
pull-in do not translate or rotate the observer.
The observer resamples subjects through the SDK at the source frame's interpolation
alpha, including mouse-only redraws. Vehicle bodies and the followed camera therefore
share one display time; source-only body clipping/fading is omitted from this view.
World-view pan and zoom respond faster; their scale remains distance-dependent. It copies the original gameplay
frame at full source resolution, preserves its aspect ratio, follows V camera
changes and disappears when camera display is disabled. It is UI only and is
absent from model-input captures.
With camera display and all-type colliders enabled together, cyan spheres and
lines show the recorded camera sweep radius/path, orange marks blocked sweeps,
and red marks returned surface contacts/normals. These are actual query samples,
not added physics bodies. The world observer draws after the SDK restores its
display transaction and resamples displayed subjects without gameplay body clipping
or fade. The camera model follows the actual displayed camera pose and uses the
presentation sample from `world.inspectCamera().collisionQueries`, falling back
to fixed only before a presentation sample exists. The live monitor copies the actual interpolated gameplay frame;
the observer uses that same interpolation alpha for its subjects.
Each sample carries its source,
simulation tick and sequence; first-person views without sweeps show no stale probe. Source captures
omit these guides, and turning inspection off stops query recording.

Helpers independently show colliders, mesh edges, interaction anchors, declared
climb surfaces and water volumes. Collider scope can follow the shared scope,
include nearby shapes within a distance in metres, or show the whole physics world.
Nearby uses the current subject when the shared scope is the whole scene. Ground
can be included or excluded explicitly. Ownership uses actual capsule, environment,
pickup and loose-crate collider bindings; unknown ownership is reported, not inferred.
Unavailable scoped helpers show a reason. Global quick-check presets can expand
the scope. Temporary **仅看碰撞体 / 仅看线框** preserves the base picture and saved
helper settings; leaving it restores the combination. Mesh-edge overlays are
unavailable over depth, type-color and normal buffers, but wireframe-only remains usable.
Depth limits are metres along the camera view direction, near black and far white.
Diagnostic buffers retain alpha-cutout holes and treat blended surfaces as opaque.
Type colors come from actual scene roots; unclassified meshes have their own color.
Anchor/region markers describe bindings, not current action eligibility.

Picture, Objects and Helpers have independent reset buttons. Desktop inspection can
be pinned into the existing right sidebar; mobile uses a bottom drawer. Settings
are session-local. Map changes retire scene-local object selection, hidden IDs and
isolation while retaining picture and helper choices. The optional diagnostic renderer
shares the current scene and draws after source frames or world-view mouse changes.
It never steps the SDK or writes the gameplay camera. Its canvas sits
below Presentation UI/output. Original source pixels, model-input captures and
streams remain unchanged. Temporary visibility, materials and lighting are restored
even on errors. Diagnostic passes omit source shadows to avoid rewriting shadow
resources owned by the source renderer. Returning to defaults shows the original
renderer directly. Map changes release cached diagnostic materials; disposal
releases the diagnostic canvas, helpers and GPU resources.

With the editor running, verify the real modes, source-pixel isolation, map/reset
transitions and mobile panel using:

```sh
pnpm exec tsx apps/sdk-playground/scripts/display-smoke.ts http://127.0.0.1:5178
```

- `src/main.ts` binds the scene and SDK actions to the editor. One SDK owns simulation,
  character animation and the active camera. This entry is editor-specific; shared
  environment/vehicle/profile data stays in the example modules.
- `src/shell.tsx` renders the layout, HUD, quick slots, shortcuts and common overlays.
  HUD uses a React portal into the SDK Presentation UI container. React never moves
  or replaces the active canvas. HUD notifications coalesce at 100 ms.
- `src/inspector.tsx` renders live form controls. Interaction applies immediately;
  routine telemetry updates coalesce at 100 ms. Draft numeric edits survive updates.
- `src/library.tsx`, `workbench.tsx`, `humanoid-panel.tsx`, `equipment-panel.tsx`
  own panel state and preserve the existing action and persistence contracts.
- `src/equipment-preview.ts` renders a static cloned model on demand; it never ticks
  or writes the live character.
- `src/components/ui` contains local shadcn/ui new-york-v4 components (MIT), adapted
  for relative imports, existing styling, and accessible slider labels. Source:
  https://ui.shadcn.com/r/styles/new-york-v4/ . `styles.css` uses Tailwind utilities
  without global preflight. Active layout styles live in `src/styles`; obsolete native
  slider, switch, select and previous layout rules have been removed.
- All editor icons use official `lucide-react` components.
  `node apps/sdk-playground/scripts/sync-lucide-icons.mjs` refreshes the semantic
  mapping from the locked package. No icon font or hand-authored icon paths are used.

The asset library and 3C inspector float over the scene by default without reserving
canvas space. Each header has a pin toggle to dock its panel beside the canvas;
unpinning restores the full viewport. Panel state is restored from the versioned
`worldkit.playground.panels` localStorage record. This includes open/pinned states,
shortcut layout, minimap expansion, inspector/display/workbench tabs, library
filters and the last open tool dialog. Dialogs restore after scene readiness.
At widths of 720 px or less, panels remain floating and pin controls are hidden.
`src/panel-state.ts` owns the panel ID registry and per-field defaults/validation;
new panels add a definition and connect their existing state owner. Unknown panel
IDs/fields are retained, unsupported document versions are not overwritten, and
unavailable storage falls back to the current session. Teardown does not save
disposal-driven closes. Scene physics and temporary loading/recording states are
not layout preferences. Shortcut help has collapsed, floating and pinned states;
camera/render status stays in the header and contextual hints in the slim footer.

Form focus releases driving input. Modal panels pause through the SDK callback;
closing restores focus and the previous paused state. Configurations still need
explicit export to `profiles.json` for delivery; local storage is a debug override.

All editor popups use shadcn/Radix Dialog, Popover and Tooltip; transient
notifications use the shadcn Sonner Toaster. No native dialogs or HTML title
tooltips remain in the editor. Modal state calls the existing pause callback;
Radix owns focus trapping, outside dismissal and Escape. Equipment preview
resources are created on modal mount and released on close.


## NPC workshop

Select **NPC 交互试验场** in the scene selector, or open `/#/scenes/npc-workshop`.
One player and two full humanoid NPCs share the existing SDK world. NPC A and B
patrol automatically. The scene panel switches gameplay control and camera follow;
WASD controls the selected character. “接近并争用物品” approaches the shared parcel
and shows both acceptance and rejection. Continue with “搬运并放下”, “分别就座”,
and “起身”; “恢复巡逻” resumes NPC behavior. Invalid requests display the real reason.

`src/npc-playground.ts` owns scene-local actor lifetime, Presentation DOM controls
and SDK command sequences. `packages/preset-content/src/environment/npc-workshop.ts`
provides geometry and physical interaction anchors. Movement, action arbitration,
physics, animation and camera execution remain with the SDK. Reset recreates these
transient NPCs; switching away removes them. Equipment editing selects the player.

```sh
pnpm exec tsx apps/sdk-playground/scripts/npc-smoke.ts http://127.0.0.1:5178
```

This browser case verifies patrol displacement, real keyboard control transfer,
shared pickup, carrying/placing, seats, cancellation, reset and map cleanup.


## Page lifetime

Page event listeners, render warmup and browser tool registrations use the same
abort signal. `pagehide` retires them before disposing the SDK, so late focus,
visibility, keyboard, resize and route events cannot access the released runtime.
Verify teardown, tool revocation and real input after reload with:

```sh
pnpm exec tsx apps/sdk-playground/scripts/lifecycle-smoke.ts http://127.0.0.1:5178
```

## Flight training

The scene selector opens aircraft, flying-creature and space training in the same
SDK session. Deep links use `/#/scenes/flying-creature-training` and
`/#/scenes/space-training`. The dragon scene starts with the supplied humanoid on
the ground: **H** summons the existing dragon, **F** boards after it lands,
**Q** takes off/ascends, **E** descends, and **F** requests landing before dismounting on the ground.
The dragon selector uses the native D01–D11 model and animation variants. A variant
change reloads the same scene route and preserves the unmounted person's position
when the SDK validates it. `?dragon=D02#/scenes/flying-creature-training` selects a
variant directly. The renderer, physics and camera remain owned by the SDK.

Space training exposes assisted/inertial drive and docking through the existing
SDK command contracts in Presentation UI. `?space=survey-spacecraft#/scenes/space-training`
selects that spacecraft's preparation point; boarding still uses **F**.

```sh
pnpm verify:dragon-training -- http://127.0.0.1:5178
```

This browser case exercises ground start, real summon/boarding/takeoff inputs,
flight, deferred keyboard flame input, native variant loading, map/reset/reload and history navigation.

### Current input hints

The local HUD reads current SDK bindings and the actual vehicle/aircraft subtype.
On foot, hold Ctrl + WASD to walk slowly without crouching; release Ctrl to restore
ordinary movement or held Shift sprint. Ctrl takes precedence when both are held.
C still toggles crouching and Shift + C still requests a slide; mounted Ctrl is unchanged.
Fixed-wing and pusher aircraft show W/S throttle, Q/E pitch down/up, Space ground brake, Ctrl throttle
reduction/ground braking, and Shift as an additional throttle assist; Z/X is unused.
Rotorcraft use Z/X bank-induced lateral movement, with W/S travel speed and Q/E
vertical demand; Space/C is unused. Soaring aircraft use W/S airspeed trim without Q/E or Z/X,
retaining Space special actions and C airbrake. Glider W starts finite tow and paraglider W starts
run-up; Shift is not required. Wingsuit ground HUD instead shows WASD walking, optional Shift
running, Ctrl slow walking, Space jump and F unequip. A real platform departure switches to flight;
ordinary jumps do not, and a held jump cannot open the canopy without a new press. Landing
automatically drops the suit flat; F can equip it again on level ground without returning to the platform.
Balloons use Q/E heat/vent, not Space/C.
Dragon, submarine and spacecraft use Space/C pitch up/down and Q/E vertical movement; Z evades on dragons, Z/X rolls
spacecraft, and submarine Z/X is unused. Tank/hovercraft use Z/X turret/strafe.
All arrows only observe, without the old additional ±10° limit; document pitch
bounds and collision safety remain. Vertical observation speed is unchanged.
Third-person vehicle recentering begins 1.5 seconds after observation input stops,
including at rest/hover. Continuous aircraft heading corrects against actual forward
direction so combined pitch/bank manoeuvres cannot accumulate a permanent yaw offset.
Existing horizon/roll settings and person/first-person/shoulder calibration remain unchanged. Camera
cycling uses the configured key (V by default); Backspace is a mounted, long-held
scene reset, not vehicle-only recovery. The 1–6 shortcut is still local debug
travel, not an equipment-slot implementation.

Vehicle changes and rebinding refresh both control strips. Current flight prompts
do not reuse legacy asset hint strings; offline catalog hints and mobile virtual
buttons are outside this HUD update. Verify all 14 affected vehicle presets,
actual keyboard routing, camera range and HUD with:

```sh
pnpm exec tsx apps/sdk-playground/scripts/input-hud-smoke.ts http://127.0.0.1:5178
```

## Local camera configuration files

The app-owned registry in `src/camera/project-files.ts` binds campus, indoor-lab
and npc-workshop IDs to their complete camera documents. Pure calibration/editor
logic uses `createCameraProjectState(id, sourceDocument, variantId)` and
`selectDragonCameraVariant` from `src/camera/project-state.ts`; these functions
return document state without claiming a build identity. The Vite-only adapter
`loadCameraProject` in `src/camera-project.ts` rejects missing loader identity and
returns `configurationId`, `savedDocument`, the variant-selected `document`,
`unsaved`, and `importedFileSha256`. Variant selection can produce an unsaved edit.
The `?camera-document` Vite adapter generates the document and SHA from one file
Buffer; the SHA identifies the exact imported bytes, including whitespace, in dev
and static bundles. A later file read or a matching canonical hash does not prove
that a running bundle adopted those bytes. Runtime inspection must also match the
intended configuration. Standard Vite invalidation applies; the editor owns draft
recovery before accepting an HMR reload.

`createCameraFileClient()` in `src/camera/file-client.ts` returns a local client or
null when the service is unavailable. Its `read(id)` returns present/missing and
`save(id, expectedFileSha256, document)` returns saved/conflict with current data.
Null SHA only creates a missing file. Writes use the SDK parser/serializer and
serialize requests per fixed path, stage a temporary file, recheck SHA, and
atomically publish it. Existing symlink components are rejected. This is optimistic
concurrency in a trusted local worktree, not an OS transaction against another
process replacing directories during a filesystem operation.

The service requires the actual loopback socket, exact origin/Host, and a session
header obtained through a same-origin POST. Binding dev to a network address
disables the service. Static builds and Vite preview have no write endpoint and
use import/export. Vite's filesystem read allowlist grants no write permission.
The app scripts use Vite's config runner to consume the workspace SDK TypeScript
exports without duplicating its parser.

## Shared camera document editor

Inspector's **相机模式** and Workbench's **3C 调试与配置** mount the same
`src/camera/panel.tsx`, with one `CameraEditorState` per active fixed configuration
ID. Select a view, subject and preset/project-view/project-subject scope. Fields
come from public SDK metadata; explicit layer values and the SDK's last committed
provenance are shown separately. Unobserved subjects/views have unknown effective
values. Union-valued fields use JSON; the complete-document section edits opening,
input and transition data without another schema.

**重新绑定预览** explicitly obtains an SDK editing session after normal startup has
sealed the baseline. **应用草稿**, **取消应用**, **采用当前画面为开场** and
**提交相机基线** are separate actions. Invalid field text stays recoverable and
leaves the last valid document/preview intact. Focused field changes form one undo
group. Independent free preview uses a cloned Three camera and OrbitControls;
it neither writes the managed camera nor advances simulation. Opening conversion
and baseline ownership remain in the SDK. Lease failures retain offline drafts;
reset/map replacement invalidates the session and requires explicit rebind.

**保存项目文件** uses Task 9's fixed-ID client with the last file SHA. Save completion
cannot overwrite newer edits. External changes preserve both versions for explicit
resolution. Saving and JSON HMR never apply a draft or commit a World baseline.
The Vite adapter's actual import SHA must match the saved file SHA and actual SDK
inspection before the panel reports build adoption. Reload can therefore adopt
saved source while a recovered draft still differs. Variant navigation records an
explicit edit of the current draft and preserves project overrides. Local storage
under `worldkit.camera-draft.v1.<configurationId>` is recovery only; static builds
support JSON import/export and cannot write project files.

Run `pnpm exec tsx apps/sdk-playground/scripts/camera-editor-smoke.ts http://127.0.0.1:5196`
against `pnpm dev:editor --port 5196` for the actual save/HMR/reload/static rebuild,
shared Workbench, invalid input, independent preview and source capture checks.
The smoke temporarily changes the campus file and restores its exact bytes in
`finally`; evidence is written to `output/playwright/camera-editor/`.


## Camera quality checks

The camera editor shares short field descriptions with Creator discovery. Its
live inspection follows the existing render callback; opening the panel does not
change camera ownership. **相机性能采样** enables bounded CPU timing for input,
fixed camera evaluation and presentation. Probe time is included in those stages;
this is not a display-FPS measurement. Disable sampling after diagnosis.

Repeatable dense-scene routes and baseline comparison are documented in
[the camera maintenance harness](scripts/camera-quality/README.md).
