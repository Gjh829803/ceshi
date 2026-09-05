# Independent UI and clean world-model input

User authorization: implement the agreed separation of Three world pixels, model output and UI. Retain ordinary authored HTML/CSS, one simulation, direct technical publication, and no self-test recording or assistant review gate. This work does not resume the server-blocked model cases or alter the unrelated episode-production draft.

## Authority and interfaces

ThreeWorld owns world state, commands and time. Its presentation owns only browser display/input mounting, a clean canvas capture port, local UI bindings and a bounded history of UI/anchor samples associated with explicit captured frames. The service owns mapping generated output frames to source frame keys. Missing/stale mappings are represented honestly; input MediaStream delivery does not itself prove source-frame correspondence.

Public entry: `world.createPresentation({container?})`. It returns `ui` (mount/bind/anchor), `modelInput` (captureFrame/createStream), `output` (attachStream/presentFrame/showWorld), focus/status/disposal. UI is DOM in a sibling root. Model input is always the original renderer bitmap, never the presentation container or output. Output may be a video element or a separately drawn model frame; no output feedback into source. Bindings read SDK state; event handlers use existing commands.

Input integration: one WorldKeyboard plus WorldInputRouter. `bind(surface, uiRoot?)` owns pointer and focus routing and returns an idempotent release restoring the previous binding only if still current. Editable/UI focus releases held keys and pointer capture; UI clicks never rotate the camera. Binding must preserve arrows-as-camera and held Shift.

Frame history keys use presentation session/epoch and increasing source frame IDs. Explicit bitmap capture stores immutable local binding/anchor samples and exports only clean pixels plus frame metadata. Frame-linked UI is hidden/unavailable when model output has no valid mapping; immediate controls stay responsive. Reset invalidates the epoch, clears buffered state and detaches old output. No rewind of gameplay state. DOM/video callback synchronization is best-effort; do not claim pixel-exact or model-geometry tracking support.

## Dependency graph and exclusive ownership

| ID | Goal / deliverable | depends_on / blocks | Ownership and integration | Mode / evidence |
| --- | --- | --- | --- | --- |
| U1 | Public presentation contracts, World hooks, DOM/capture/output/history/UI integration | none / U4 | Main owns contracts.ts, world.ts, engine.ts, presentation*.ts except input.ts, index.ts, apps/three-creator-playground/bridge.ts, new browser fixture/test, package test census | main-agent-only; source pixels, reset/history/ownership, external-track lifetime and real browser verification |
| U2 | Focus-aware pointer/keyboard router | contract above / U4 | Input worker owns input.ts and input.test.ts only; Main wires engine | parallel-safe; held input release, editable/Shadow DOM/UI focus, capture cancel, cross-surface isolation and restore |
| U3 | Agent-facing schema, example and prompt use the new UI boundary | U1 contract / U4 | Tools worker owns scripts/three-creator authoring-schema.ts, examples.ts, contracts.ts (only topic shape if needed), mcp.ts (topic only), README.md; packages/three-world/README.md; scripts/cloud/three-eval-instructions.md; tests limited new authoring schema test | parallel-safe; public AST schema resolves exact new types, DOM UI example, explicit clean-vs-page capture description; no new tools/gates |
| U4 | Integration and verification | U1,U2,U3 / U5 | Main owns final interfaces, bounded browser/UI pixel isolation tests, full relevant type/test/build gates, change review | sequential; actual PNG/stream/interaction evidence, no model claim |
| U5 | Freeze runtime artifact and report service integration boundary | U4 / none | Main packages verified code as appropriate; no new model POST on broken Ray fleet | sequential; source closure and exact remaining backend requirements |

No worker changes another owner's files. Existing source/reference/generated case artifacts and the unrelated episode spec are not modified. Rendering callbacks and UI observers never advance simulation or create a second gameplay loop. Disposal removes owned DOM/listeners/capture tracks, detaches external output streams without stopping their tracks, and restores original canvas parent/styles/input binding.

## Required verification

Real browser: a conspicuous UI is visible in a page screenshot and absent from model bitmap/MediaStream frames; model-video and source are separate canvases; source continues advancing behind video; buttons and text focus prevent gameplay input while viewport WASD/arrows/drag/run work; UI values read authoritative state; reset and disposal remove stale epoch/video/UI mappings; resize/letterbox anchors use the same image rectangle; known/unknown/out-of-order mapping behavior and bounded history are tested. This does not validate a remote model stream, WebRTC signaling, or preservation of geometry by a generative model.

## Completion

U1–U4 implemented. The existing World observer exposes the same active presentation to application transport, and Host preview focuses its input surface. U5 freezes source and local demo only; no cloud runtime was replaced or model job submitted. The exact passing affected closure, original aggregate focus failure and repair, rendered evidence, and remaining service contract are recorded in `docs/evaluations/gpt6-three/ui-presentation-20260905.md`.
