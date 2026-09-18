# @worldkit/world-ui

World UI contracts, recorder/history and React rendering adapter.

- `./schema`: serializable catalog/document/state/animation contracts and validation.
- `./core`: source-time recording, atomic patches, animation retargeting and history.
- `./react`: json-render Renderer adapter, component ABI and Motion presentation hook.
- `./local`: `mountLocalWorldUi` mounts the same renderer into a local DOM container.
  The host supplies `present(state, sourceTimeUs)`, resets it with the world and
  disposes it on teardown. It observes the existing world clock, without sockets,
  video encoding, an animation frame loop or a dependency on Three internals.

Read [Agent authoring](../creator-host/docs/agent/ui.md) for the required component
conventions and a working example. Source world state remains authoritative.
Components consume resolved props and emit declared events; the player controls
the animation clock. V1 uses static document trees; arbitrary dynamic topology,
repeat expansion and native app rendering are not implemented.

Viewport layout is declared on JSON elements through `layout` (React/CSS top/right/bottom/left, dimensions, translate and zIndex),
plus optional `layoutReference` metadata for safe-area selection. The schema export includes portable
`resolveUiLayout` and layout validation. The React adapter applies wrapper geometry,
leaving component internals and Motion transforms independent. See the authoring
guide for supported placement scope, units and examples.
