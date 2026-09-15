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

## Display previews

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
Clicking the viewport retains keyboard gameplay: movement, mounting and T camera
switching still go to the SDK. Simulation continues; there is no observer toolbar
or separate input mode. The world view shows full characters even when the gameplay
camera uses first person. Unchecking restores the current gameplay view without
resetting its mode or the controlled actor. Camera guides follow real camera poses
and projection; the distance setting only caps their visual length. A live camera
preview appears at the lower right of the world viewport; **放大 / 还原** changes
its size without pausing or changing control. **定位摄像机** immediately reframes
the current camera and subject, resetting the orbit centre. **跟随位置** (off by
default) translates the world view with the gameplay camera while retaining the
manually chosen viewing angle and distance. It does not inherit camera rotation.
World-view pan and zoom respond faster; their scale remains distance-dependent. It copies the original gameplay
frame at full source resolution, preserves its aspect ratio, follows T camera
changes and disappears when camera display is disabled. It is UI only and is
absent from model-input captures.
With camera display and all-type colliders enabled together, cyan spheres and
lines show the recorded camera sweep radius/path, orange marks blocked sweeps,
and red marks returned surface contacts/normals. These are actual query samples,
not added physics bodies. The world observer draws after the SDK restores its
display transaction and shows committed subjects without gameplay body clipping
or fade. The camera model follows the actual displayed camera pose and uses the
presentation sample from `world.inspectCamera().collisionQueries`, falling back
to fixed only before a presentation sample exists. The live monitor copies the actual interpolated gameplay frame;
the observer's committed subject poses may differ by up to one fixed tick.
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
**Space** takes off, and **F** requests landing before dismounting on the ground.
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
flight and flame, native variant loading, map/reset/reload and history navigation.

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
