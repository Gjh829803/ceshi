# Streaming world UI

This is the UI authoring contract for generated `three-sdk` worlds, shared by
local play, Agent previews and the stream player. Read the [task requirements](README.md)
for what to deliver. The world owns gameplay state; React components only present
it and emit named events. Handwritten scene DOM is not an alternative UI transport.
The stream Host acquires SDK input and capture leases. Do not acquire these leases
in authored scene code, run a second simulation loop, or draw the HUD into Three.

## Start from a working binding

Call `creator_get_examples({topic:"streaming-ui"})`. It returns a minimal `main.ts`
binding snippet and the UI files below, plus `projectUi` to merge into your existing
`project.json` as its `ui` field. Keep the project's selected `assetIds`. The snippet
uses an existing world and health state supplied by your scene; it does not create
a second world, presentation or animation loop. Publish the binding after world
startup. Health, buttons and property names demonstrate the protocol; replace them
with state and hints appropriate to the actual scene. Do not add health mechanics
to a task that does not need them.

For a user-requested UI-free world, retain the project/binding and use a document
whose only element is an empty `HudLayer` and whose `transitions` is `{}`, a catalog with empty `components` and
`actions`, an empty-object state schema, `readUiState:()=>({})`, `actions:{}` and
`export const components={}`. The stream can then load the world with no widgets.
A missing `project.ui` is a missing UI bundle, not the same as an intentionally
empty document. This SDK binding is not provided by the `three-raw` profile.

## Project files

Add `ui` to `project.json` with four project-relative paths:

```json
{"ui":{"catalog":"ui/catalog.json","definition":"ui/definition.json","stateSchema":"ui/state.schema.json","components":"ui/components.tsx"}}
```

- `catalog.json`: `schemaVersion: 1`, `catalogId`, `components` keyed by component name. Each
  component declares `propsSchema` (JSON Schema), `events` (string array), and
  `bindableProps`, `animatableProps` (observed prop to presentation property metadata),
  and `slots`. `actions` maps world action names to `{paramsSchema}`. The exact working format is in
  [the example catalog](../../../../examples/three-creator/streaming-ui/ui/catalog.json).
- `definition.json`: `schemaVersion: 1`, matching `catalogId`, `designViewport: {width,height}` and
  `spec: {root,elements}`, plus required `transitions` (`{}` when no animations). Elements have stable IDs, `type`, `props`, optional
  `children`, state-bound `visible`, viewport `layout`, and `on` event-to-action bindings. Document-level `transitions` maps
  element IDs to prop transition settings. Bind a prop to state
  with `{"$state":"/player/health"}` (JSON Pointer). Read the
  [example definition](../../../../examples/three-creator/streaming-ui/ui/definition.json).
- `state.schema.json`: JSON Schema for the entire serialized observation. State
  may contain nested player attributes, quests, inventory and activity data. Send
  JSON values only, without functions, DOM objects, classes or external schema refs.
- `components.tsx`: exports `components`, with exactly the catalog component
  names. Local relative modules, CSS and assets are supported. Runtime imports are
  limited to `react`, `react/jsx-runtime`, `motion/react` and
  `@worldkit/world-ui/react`. The player supplies these shared runtimes.

The compiler generates `catalog.generated.ts` next to the copied component entry,
without changing author source. Components can use `CatalogProps` and declare
`components satisfies CatalogComponents` via a type-only import from that file.
Use `WorldUiComponentContext<P, EventName>` for props, `nodeInstanceId`, children,
slots and `emit(eventName)`. Events resolve the document's fixed action binding and
state-derived parameters; components never receive the live World object.

## Layout: use familiar React/CSS positioning

Each element may declare `layout`, a deliberately small **React CSS-style object**
for positioning the widget in the HUD. Use normal property names and values:
`top`, `right`, `bottom`, `left`, `width`, `height`, `minWidth`, `maxWidth`,
`minHeight`, `maxHeight`, `transform`, `overflow` and `zIndex`.
`position` is `"absolute"` (also the default). There are no custom anchor enums,
`fill` size tokens, or `{percent: ...}` objects to learn.

```json
{
  "health": {
    "type": "HealthBar",
    "props": {"value": {"$state": "/player/health"}, "max": 100},
    "children": [],
    "layout": {
      "position": "absolute",
      "top": 28,
      "left": 28,
      "width": 346,
      "zIndex": 10
    }
  }
}
```

Common recipes:

| Placement | `layout` |
| --- | --- |
| Top right | `{"top":28,"right":28,"width":300}` |
| Stretch across bottom | `{"left":28,"right":28,"bottom":28}` |
| Centered dialog | `{"left":"50%","top":"50%","width":400,"maxWidth":"100%","transform":"translate(-50%, -50%)"}` |
| Half-width widget | `{"left":0,"top":0,"width":"50%"}` |

Lengths follow React/CSS conventions: `28` means 28 design pixels, `"28px"` is
also accepted, and `"50%"` stays a normal percentage of the containing block.
Omit width/height or use `"auto"` for CSS automatic sizing. `left` + `right` with
no explicit width stretches a widget; `top` + `bottom` similarly stretches height.
An explicit size together with both opposing edges follows normal CSS precedence.
Use `maxWidth`/`maxHeight` when a component should shrink to available space.

Supported values are bounded: numeric/px lengths up to 8192, percentages up to
100%; negative values are allowed for edge offsets and translate, not dimensions.
`zIndex` is an integer from -1000 to 1000. `transform` accepts `none`, `translate`,
`translateX`, or `translateY` with px/percentage arguments (or unitless zero).
`overflow` accepts `visible` or `hidden`. Other position modes, rotations, arbitrary
CSS expressions (`calc`, `var`, etc.) and unsupported fields fail validation.

Component JSX/CSS owns internal typography, padding, backgrounds and animation.
It must not duplicate the wrapper's viewport placement with screen-edge CSS or
`position: fixed`. A component root normally uses `width:100%; box-sizing:border-box`.
Positioning internal decoration remains fine. Component Motion transforms do not
compete with the layout wrapper's centering transform.

Layout is allowed on a non-HudLayer root, or on direct children of the root
`HudLayer`. Nested descendants and `HudLayer` itself cannot use viewport layout.
Use normal component layout for an inventory's rows. Layout is outside component
props and does not need to be redeclared in every catalog.

### Safe area and resolution

The containing block defaults to the viewport's safe rectangle. The separate node
field `layoutReference: "viewport"` opts into the full video surface;
`layoutReference: "safe-area"` is the default. These are protocol metadata, not CSS
properties. This separation keeps `layout` familiar. The containing block clips
content outside its boundary; an exhausted safe rectangle is hidden.

`designViewport.width` is the scale reference. The player scales the logical UI
uniformly to the displayed video width and derives its logical height from the
actual surface. Changing encoded resolution alone does not change widget size or
position when displayed dimensions are unchanged. Player resize scales the UI;
bottom/right edges follow actual surface bounds, including rounded aspect ratios.

The Web player's `safeAreaInsets` prop uses **displayed CSS pixels** and defaults
to zero; the player converts them to design units. Embedders supply insets relative
to the video surface, not blindly copied from a different browser viewport.
Direct `WorldUiRenderer` consumers use design units for `viewport` and safe-area
insets. Native App rendering is a future adapter, not implemented by this contract.

Layout is static bundle content in this version, not per-frame CSS patches.
Existing documents without `layout` remain supported.

## Visibility: bind a boolean from world state

Declare `visible` on the element, alongside `props` and `children`, not inside
`props` or `layout`. This works for custom components and built-in elements:

```json
{
  "questHint": {
    "type": "Text",
    "props": {"text": "任务已完成"},
    "children": [],
    "visible": {"$state": "/hud/showQuestHint"}
  }
}
```

Include this node in the static document tree. Declare `hud.showQuestHint` as a
required boolean in `state.schema.json`, initialize it explicitly, and return it
from `readUiState()`, for example `{hud: {showQuestHint: questComplete}}`. Compute
complex conditions in the world and expose the resulting boolean. V1's public
visibility contract is `true`, `false`, or a single `{"$state":"/path"}` binding;
omitting `visible` means visible. Do not assume other json-render expression forms
are part of this SDK contract. `visible` does not need a catalog `bindableProps`
entry because it is element metadata rather than a component prop.

The world changes the boolean; the Host sends the resulting state patch. The
player evaluates visibility from its source-time-selected state, so appearance
and disappearance follow the corresponding video frame (or source clock in UI-only
mode), not the packet arrival time. Reconnection restores it through the snapshot.
For user-triggered changes, emit a named event and bind it to a world action which
updates the boolean. Do not patch the playback DOM or the read-only presentation
store to implement shared gameplay state.

`visible: false` removes the component subtree from the React render output; its
local state is not preserved across hiding and showing. Keep persistent gameplay
and panel data in world state. Visibility itself is an immediate toggle, not an
automatic enter/exit animation. If a fade is needed, keep the component mounted
while a source-time numeric animation drives its opacity. Layout metadata and the
component tree remain static; showing a declared node does not add a new tree node.

## Animation

For time-aligned numeric animation, declare a transition with the observed state
path, presentation property, duration and easing, as shown in the example.
Use `usePresentedMotionValue({nodeInstanceId,property,fallback})` and bind its value
to `motion` styles. The stream supplies animation tracks; the player evaluates
these at the displayed video's source time. Do not start `animate()` or CSS
transitions on message arrival for gameplay animations: network/model delay would
put them ahead of the video. Ordinary local hover/focus animation is independent.
V1 supports linear/easeOut numeric tracks and source-time retargeting.

## Producer binding

The preview or streaming Host creates the world's single presentation.
Do not call `world.createPresentation()` in a world using this UI binding;
a second presentation fails with `PRESENTATION_ALREADY_EXISTS`. Capture and focus
belong to that Host-owned presentation, while the scene owns ordinary world logic.
Only Stream Host acquires a remote input lease; local play uses ordinary keyboard
and mouse input.

After `await world.start()`, export the binding on the producer page:

```ts
Object.assign(window, {__WORLDKIT_STREAM_WORLD__: {
  world,
  readUiState: () => ({player: {health: health.value, maxHealth: 100}}),
  actions: {damage: () => health.set(Math.max(0, health.value - 20))}
}});
```

`readUiState` is synchronous and observational. Host calls it in the source frame
capture transaction and on runtime samples. It must not mutate or advance the
world. Named actions are validated against the catalog and execute on the producer.
World state, collision and gameplay remain authoritative there.

## Local play and capture

Projects declaring `project.ui` automatically get the same React UI when opened
through Creator's local example preview. No second HUD, state mapping or component
library is needed. The existing binding above is also used for local play.

| URL | Local UI |
| --- | --- |
| `/` or `?ui=on` | Shown; local actions call the same named world actions |
| `?ui=off` | Hidden; no local UI bundle or presentation is loaded |

Local UI follows the SDK simulation clock and resets with the world. Component
styles are isolated in Shadow DOM and JSON layout uses the same design viewport
scaling as the public stream player. It does not encode video or open WebSockets.
Creator, Episode and Stream Host producer pages explicitly open `?ui=off`.
Creator can temporarily compose a UI preview as described below; formal capture
and recording paths always read the clean Three canvas.
The player's own UI is independent of this producer-page query parameter.

From the repository: `pnpm dev:example /absolute/path/to/case 53901`.
The public seaside demo also supports `cd examples/worlds/seaside-town && pnpm dev`.
Serve the compiled preview through this entry; a plain static server over uncompiled
TypeScript sources does not resolve the SDK/import map.

## Agent screenshots

Inspect and adjust the HUD before the final delivery recording, including control
hints for the relevant interaction states. UI source edits also change the world
identity, even though recordings contain only the clean canvas; editing the HUD
after recording requires new recording evidence. Follow the
[record and submit workflow](programming.md#record-and-submit) to reduce repeated runs.

Choose the screenshot by what you need to inspect:

```ts
world_preview({view:'current', includeUi:true})  // World + authored React UI
world_preview({view:'current', includeUi:false}) // Clean world canvas
world_preview({view:'opening', includeUi:true})  // Reset and inspect initial UI
```

`opening`/`current` default to `includeUi:true`. `top-down`/`entity-triview`
are geometry views and require `includeUi` omitted or false. No `project.ui`
returns a clean image with `ui:{included:false,reason:'not-defined'}`; explicitly
excluding UI reports `reason:'disabled'`. A declared UI that fails to load/render
fails the preview with its error rather than silently returning a UI-free success.

The Host samples clean pixels and `readUiState()` synchronously, then renders that
frozen state with the same components, styles and layout as local play/the player.
It waits for DOM layout, styles, fonts and component images, and captures only the
world display rectangle at its CSS size. `ui.sample` records simulation tick/time.
The temporary composition is removed afterward; it acquires no input/presentation
lease, invokes no action and does not pause/reset/step a `current` view.
A running world can continue while the frozen preview is being prepared.

This is a **state snapshot**, not an animation-history replay: numeric transitions
initialize at the sampled values (`ui.animation:'state-snapshot'`). Inspect actual
transition timing in local play or the stream player. The screenshot option never
changes `world_playtest` video/keyframes, `world_capture_triviews`, automatic submit
captures or Episode/model-input media; those remain UI-free. Adding `?ui=on` alone
does not make a canvas-only capture include DOM pixels.

## Current scope

The first transport uses WebCodecs VP8 over two WebSockets, snapshots plus JSON
patch commits, one controller and presentation-only viewers. V1 documents are
static trees; live topology/repeat expansion is not implemented. Use a custom
component with typed array/object props for inventories or quest lists. Those
components must keep stable React keys. App-native rendering, model conversion,
public authentication and GPU deployment are separate integrations.

Run `pnpm dev:stream` from the SDK repository to try the maintained
[public demos](../../../../examples/worlds/README.md). The
[minimal UI example](../../../../examples/three-creator/streaming-ui/scene.ts)
shows the binding and component contract in isolation.
