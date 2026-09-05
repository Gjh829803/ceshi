# Three SDK: independent UI and world-model presentation

Implemented on `codex/gpt6-world-agent-refactor`, from source baseline `eb0cb883`. This is SDK/platform infrastructure, not a repair of the five generated cases. It introduces no recording requirement, assistant review stage or delivery gate.

## Result and ownership

`world.createPresentation()` provides three sibling browser layers: the original Three renderer, a separate model output video/canvas, and ordinary HTML/CSS UI. Capturing through `modelInput` reads only the original renderer bitmap. Showing output neither changes that capture source nor advances or pauses the single world simulation. Agent-authored Three geometry, UI design, gameplay and commands stay freely authored through the existing interfaces.

One `WorldInputRouter` uses the existing `WorldKeyboard`. It routes drag/wheel through the displayed surface, keeps WASD movement distinct from arrow camera controls, preserves held Shift across normal pointer release, and clears held keys/camera deltas when UI takes focus. Shadow DOM, existing focus during rebind, multi-world activation, blur, cancellation and disposal are covered.

`ui.mount` accepts a normal DOM/framework root. `ui.bind` reads JSON from authoritative SDK state. `clock:'live'` is for immediate controls; `clock:'presented'` is the default for frame-related HUD. `ui.anchor` projects an entity-local point using the source camera and the displayed image rectangle. UI callbacks do not own simulation; selector/render exceptions are contained and reported in `presentation.status().lastError`.

`captureFrame()` freezes clean pixels without a physics step and returns an owned ImageBitmap plus a `SourceFrame`. Local UI samples are retained separately with a default capacity of 240 explicit captures. The model payload contains no UI values. Identity includes presentation ID, reset epoch and increasing source frame ID; simulation tick is metadata, not a unique frame key. A plain canvas MediaStream does not manufacture per-frame correspondence.

`output.presentFrame` requires a known, retained source key and the original aspect ratio. Video output accepts an optional service-provided source-key resolver. Missing, expired or out-of-order video mapping hides presented HUD and anchors; immediate controls stay available. Reset invalidates old identities and returns to raw-world display. Disposal releases owned capture tracks and listeners, restores mounted elements/input binding, and detaches external output tracks without stopping caller-owned media.

## Agent and platform integration

The existing SDK observer exposes the same active port as `window.__WORLDKIT_EVAL__.presentation` / `__WORLDKIT_CREATOR__.presentation`. Its getter follows disposal and recreation. The Host preview bridge focuses this presentation surface, with a raw-canvas fallback only for legacy/raw worlds; the application can attach model output without modifying the Agent's generated code.

The `presentation` authoring-schema topic is generated from real public contracts. The default runnable SDK example includes independent HUD and controls. SDK/Creator documentation and the cloud prompt explicitly separate UI from model pixels while retaining normal HTML/CSS freedom. Current page preview still shows the full UI for the Agent; opening and object three-view captures remain pure world pixels.

Existing generated cases that hand-drew UI into Three are not automatically migrated. Agents must use the documented UI layer; physical in-world signs may remain geometry. Original uploaded references and old case artifacts remain untouched.

## Verification

- Initial focused Chromium/API tests: 17 passed (8 input, 6 presentation, 3 authoring schema). A subsequent Host-port regression adds a seventh presentation test.
- Real HTTP-origin WebGL test, including a caller-owned renderer with `preserveDrawingBuffer:false`.
- Pixel assertions distinguish the actual source sky from magenta UI and synthetic blue output; bitmap capture and MediaStream both stay clean.
- Mapping/history/reset tests cover delayed HUD, live controls, anchor position, expired and out-of-order frames, reset racing an asynchronous bitmap, and aspect mismatch.
- Disposal tests verify owned tracks end and external tracks remain live; DOM restoration and presentation recreation are checked.
- TypeScript check passed; production Playground build passed with the existing large-chunk warning.
- Root `pnpm test`: workspace boundaries and census passed; contract lane 312 files / 3,218 passed / 3 skipped; resource-heavy lane 49 files passed, one file had the new preview-focus integration failure (748 passed, 1 failed). This original aggregate did not exit successfully.
- After reproducing and fixing that narrow Host focus defect and adding the same-port observer, the complete affected closure passed: 8 files / 106 tests, including all 43 Creator tools tests, compiler, input, presentation, authoring schema and all three World suites. The previously failing default SDK example now moves under real preview input and submits a closed schema-v2 archive without an episode/video requirement. Unaffected aggregate results remain valid; the aggregate was not rerun or relabelled as an exit-0 run.
- Final `tsc --noEmit`, test census and `git diff --check` passed. The normal Playground production build and actual Creator runtime compilation both passed. Known unrelated Babylon NullEngine skeleton warnings and the Playground chunk-size warning are retained in logs.

The browser tests produced `world-with-ui.png`, `clean-world-input.png` and `model-output-with-ui.png` under `.codex-tmp/ui-presentation/`; all three were visually inspected. The Codex in-app browser was also clicked through mapped frame, changed health, unmapped video, prompt input and reset. This is automated browser interaction and rendered inspection, not a human assessment of movement/camera feel.

Local interactive fixture: `packages/three-world/test-fixtures/presentation.ts`. The served local demo uses a clearly labelled synthetic video producer, not a remote model. It remains available at `http://127.0.0.1:53729/` while its local server runs.

## Remaining video-service contract

The application owns signaling/transport and needs to carry the complete `{presentationId, epoch, sourceFrameId}` through inference. For a MediaStream it must map each displayed video timestamp/frame to that source key. Browser media time, a fixed guessed latency or an output frame counter alone cannot supply this mapping. Source and output must preserve the same image rectangle; crop/padding transforms need a separate explicit contract before frame-linked overlays can be considered aligned.

DOM/video-frame callbacks provide best-effort synchronization, not atomic final-pixel composition. Projected anchors are source-geometry projections, not occlusion tests or tracking through model-generated geometry changes. Exact tracking needs provider output data; stricter pixel synchronization needs a final compositor driven by decoded frames.

No cloud model job was submitted, no fleet operation was made and no cloud runtime lock was replaced in this UI task. The earlier five-case run remains separately documented as server-blocked. Local SDK verification does not prove remote inference integration; deployment must freeze this source and verify the installed cloud toolkit when that workflow resumes.
