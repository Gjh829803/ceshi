# React Playground

The maintainer editor uses React and shadcn/ui form components. It reuses the
Three SDK and the scene/configuration modules in `shared/preset-content`.
The shared directory contains scene modules and configuration only; the former
DOM editor has been removed. Creator uses the standalone vehicle-sandbox example.

```sh
pnpm dev                       # http://127.0.0.1:5178 (repository root)
pnpm dev:editor                # same React editor
pnpm build:editor              # .codex-tmp/react-playground-dist
pnpm test:editor:browser        # real browser flow against running editor
pnpm --filter @worldkit/three-playground typecheck
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
isolation while retaining picture and helper choices. The optional diagnostic renderer shares the current scene and interpolated
camera, draws only after a source frame, and never steps the SDK. Its canvas sits
below Presentation UI/output. Original source pixels, model-input captures and
streams remain unchanged. Temporary visibility, materials and lighting are restored
even on errors. Diagnostic passes omit source shadows to avoid rewriting shadow
resources owned by the source renderer. Returning to defaults shows the original
renderer directly. Map changes release cached diagnostic materials; disposal
releases the diagnostic canvas, helpers and GPU resources.

With the editor running, verify the real modes, source-pixel isolation, map/reset
transitions and mobile panel using:

```sh
pnpm exec tsx apps/three-playground/scripts/display-smoke.ts http://127.0.0.1:5178
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
  `node apps/three-playground/scripts/sync-lucide-icons.mjs` refreshes the semantic
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
and SDK command sequences. `shared/preset-content/environment/npc-workshop.ts`
provides geometry and physical interaction anchors. Movement, action arbitration,
physics, animation and camera execution remain with the SDK. Reset recreates these
transient NPCs; switching away removes them. Equipment editing selects the player.

```sh
pnpm exec tsx apps/three-playground/scripts/npc-smoke.ts http://127.0.0.1:5178
```

This browser case verifies patrol displacement, real keyboard control transfer,
shared pickup, carrying/placing, seats, cancellation, reset and map cleanup.


## Page lifetime

Page event listeners, render warmup and browser tool registrations use the same
abort signal. `pagehide` retires them before disposing the SDK, so late focus,
visibility, keyboard, resize and route events cannot access the released runtime.
Verify teardown, tool revocation and real input after reload with:

```sh
pnpm exec tsx apps/three-playground/scripts/lifecycle-smoke.ts http://127.0.0.1:5178
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
SDK command contracts in Presentation UI. `?space=survey-space#/scenes/space-training`
selects that spacecraft's preparation point; boarding still uses **F**.

```sh
pnpm verify:dragon-training -- http://127.0.0.1:5178
```

This browser case exercises ground start, real summon/boarding/takeoff inputs,
flight and flame, native variant loading, map/reset/reload and history navigation.
