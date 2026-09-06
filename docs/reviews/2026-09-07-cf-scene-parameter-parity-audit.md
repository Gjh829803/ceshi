# CF Scene parameter parity audit — 2026-09-07

Mode B: main-agent change/production-chain comparison, not independent review.
Repair tree: `codex/cf-production-effect-closure`, MEM4 changes on `df1d8350`.
Pinned old source: `codex/block-world-main-integration@9e35ab53c634acaef8c53a33082fff77653f7bbb`.
The user requires old behavior, parameters and ordering, no added ordinary production
gate or extra source-repair tasks, and a fresh local Case only after alignment.

## Evidence and conclusions

All rows below are **static-read**, unless a narrower automated result is stated.
An equal default does not prove equal final resolved state or pixels. The older
2026-09-04 main comparison is historical evidence, not current status.

| Boundary | Pinned old source | Current owner / conclusion |
|---|---|---|
| Planner image order | `scripts/agents/run-spatial-world-agent.sh:128-134`: Brief → inspected entry → plan conditioned on exact accepted entry | Planner Skill's causal image sequence retains this; entry edits invalidate plan. No new task. |
| Complete world | Old Planner/Builder require at least four times reference-visible area | Live Planner Navigation intent and Native Builder Construction priorities now require the same meaningful footprint, not empty padding. Actual generated geography is unverified. |
| Subject selection | Old `references/subject-camera.md`: ordered executable modes, behavior before likeness, registered Subject before necessary composition | Current Builder Controlled Subject design and admitted authoring catalog retain these instructions. This does not prove every old movement capability exists in current Runtime. |
| Opening defaults | Old `references/subject-camera.md`: distance 5m, target height 1.25m, pitch 0.12rad, FOV 56 degrees | `scripts/reconstruction/generation-request.ts` creates those exact Bootstrap values. Catalog probe values are not mistaken for production defaults. |
| Opening override order | Old `camera-director.ts:954-1015`: Profile, first selected non-first-person authored baseline, Context Modifiers, explicit Preview | Current `camera-director.ts:893-935` has the same order and first-selected binding. Package-bound authored values remain separate from immutable generation Bootstrap and Preview tuning. |
| Advisory camera | Old `scripts/lib/block-world-visual-review.ts:239-279`: spawn plus target height, rear facing, pitch/distance/FOV projection, near rejection at 0.05m | Native renderer `drawEntry` uses the same projection and authored opening. Neither renderer resolves actual Runtime socket/collision state. |
| Advisory rasters | Old renderer: top 768 square, entry 960×540, 40px top padding, 7px spawn token | Current renderer uses the same values; comparison outputs 1544×768 and 1928×540. Cluster bounds are unscaled in both advisory renderers; 0.985 is actual display scaling, not a claim of software/Runtime pixel identity. |
| Formal raster | Old `scripts/cli/worldkit.ts:1548`: 1280×720, scale factor 1 | Current `native-world-case-preparation.ts:450-452`: 1280×720, DPR 1. |
| Formal task timeout | Old `scripts/agents/run-lwdp-codex-task.mjs:254`: 1800 seconds default | Current production budget owner freezes 1800 seconds. Cloud execution/retry is not exercised by a local Case. |
| Block geometry | Old four shapes, occupancy 0.5m per axis; center lattice 0.25m per axis | Current same four dimensions plus 0.25m-high `step`; occupancy `[0.5,0.25,0.5]`, center lattice `[0.25,0.125,0.25]`. Actual contract difference, not numeric parity. |
| Pre-allocation clustering | Old compiler clusters first in 32m center-owned chunks, X→Z→Y | MEM4 now clusters before Native Mesh allocation; 685 focused tests and real unchanged 158100-Block Host diagnostic passed. Not full Case evidence. |
| Opening capture timing | Old CLI waits for ready and another animation frame before capture | Current Formal provider resets, waits for render readiness, commits one neutral fixed Tick, waits again and verifies unchanged Tick. Exact captured state/timing parity is not established. |
| Camera occlusion | Old Block Runtime constructs `ThirdPersonSubjectOcclusionFadeV1` at lines 1087-1091 and passes `subject-occlusion-fade` at 1172-1174; Director skips Spring Arm for that strategy | Initial audit confirmed a behavior gap. OCC-B2 below now connects Native Block fading and skips retraction only for that admitted source; complete multi-entry parity is still open. |

## CF-04/12-OCC: frozen-design conflict and next implementation boundary

Old production does not merely enable a cosmetic effect on the same camera. Its
Block route disables third-person collision retraction and fades occluding block
instances. Current `2026-08-30-third-person-camera-collision-and-spring-arm-design.md`
requires hard collision safety and explicitly says soft fade cannot replace it.
Therefore these two behaviors cannot honestly be described as fully aligned.
Do not silently relax that design, call the difference acceptable, or remove the
Spring Arm call alone and claim the old behavior was migrated.

Pinned old fade values from `third-person-subject-occlusion-fade.ts`:

- selection interval `1/15` seconds; 3×3 subject sample rays;
- horizontal/vertical margins `0.45m` / `0.55m`;
- coverage threshold `0.3`, strong/light opacity `0.3` / `0.5`;
- fade-in/out `0.15s` / `0.25s`, opacity epsilon `1e-4`;
- eligible old semantic families: obstacle, interactive-solid, visual-only and landmark;
- top-down and entity-triview suspend fade and restore prior enabled state;
- per-instance dither uses a dedicated attribute on actual display batches.

These are historical implementation inputs, not newly activated Native contracts.
Native grouping/Palette must be explicitly mapped; no name/tag scan may infer
Physics or Gameplay. Current materials, partial-cluster Capture, batch disposal,
Snapshot/Reset/Replay/Rollback and fixed/render timing must be considered together.

| Task | Dependency / exclusive owner | Input → output | Required evidence | Mode |
|---|---|---|---|---|
| CF-04/12-OCC-A | Current Camera design and pinned old production trace; main architecture owner | Explicit conflict resolution → amended single-owner Camera/visual contract, consumer inventory and deletion conditions | No hidden old/new toggle, no new production gate, distinguish image presentation from movement/collision authority | main-agent-only |
| CF-04/12-OCC-B | OCC-A; existing Camera Director and Native visual materializer | Admitted world/Subject/camera state → old-equivalent resolved opening and occlusion presentation | Obstruction reproducer; all opacity/timing values, per-instance selection, partial construction/disposal, Context/Preview ordering, Reset/rollback/two sessions | sequential |
| CF-04/12-OCC-C | OCC-B; existing Formal/interactive/artifact capture | Same admitted world and resolved camera → captures with declared matching view policy | Non-symmetric wall/Subject, opening vs top/triview isolation, actual browser pixels, 0/0.5/1 interpolation, no Gameplay Snapshot mutation | sequential |

### OCC-B1 implementation checkpoint

The 2026-09-07 Native Block amendment in the Camera design records the chosen
old-style Native Block behavior explicitly; Canonical/non-Block hard-collision
behavior is not silently removed. This is a target-contract change, not activated
Runtime behavior. `native-block-subject-occlusion.ts` now takes explicit Host batch
IDs, Meshes and instance transforms instead of a global metadata/name registry.
The pinned selection/update/shader code and timing constants are retained.
Its extended immutable snapshot includes selection timing and selected/current
instance opacities, with reset, restore and exception-safe capture suspension.
Acquisition failure and throwing cleanup release every acquired material/buffer.

Evidence: initial missing-module RED; six new Babylon NullEngine/material tests
passed, plus 12 existing census tests (18/18, exit 0); typecheck and test:census
passed (480 classified files). Two initial fixture mistakes were corrected: the
"away" ray originally hit the second instance, and a material assertion originally
ran after Engine disposal. Neither correction changed the migrated algorithm.
TypeScript printer comparison against pinned old source, ignoring comments and
the Native type rename, confirms 21 functions/methods/constants unchanged,
including both GLSL/WGSL shader functions and complete `update`/`setEnabled` bodies.
This is source/automated-contract evidence, not actual Browser shader or pixels.

At the B1 checkpoint no production Host/Camera route invoked this module. Runtime Snapshot/Hash,
fixed-tick transaction integration, real batch membership, Capture mask policy,
Browser views and Feel Review remain required before OCC-B/C or CF-04/12 closes.
The module is an implementation dependency, not a new public Scene API, source,
physics owner, production gate or independent model task.

The remaining shape/walkable and Capture timing differences also need explicit
resolution. This audit does not close CF-04/12, all CF development, exact-SHA full
CI, independent review or fresh local production acceptance. No new Case was
submitted and no historical failed artifact was edited.

### OCC-B2 / C1 integration checkpoint

On the uncommitted tree following `7601ad77`, admitted Native Block display batches
now supply actual merged instance matrices to the fade module. Structure and
background-mass palettes participate; ground/route/water/hazard do not. This is
an explicit current-palette mapping, not proof of every old preset/landmark case.
The single CameraComponent checkpoints fade state with Director, Spring Arm and
render history. Public tracking Snapshot uses the single closed
`CameraSubjectOcclusionStateV1` parser. Native Block skips retraction and its
render safety query, while the default Canonical path is unchanged. Old target
Subject, then controlled Subject lookup is preserved; absent Subjects do not add
a failure gate. Profile changes do not unconditionally reset fade timing.

The old timing/shader values are retained; B1's AST comparison predates the
mechanical snapshot/private-field rename to `isSelectionInitialized`.
New tests cover actual batch matrices, canonical state validation/hash inputs,
duplicate ticks, alpha 0/0.5/1, failed material update rollback and retry, capture
exception restoration, and actual Native Package Reset replay. Six focused files
passed 146 tests; the subsequently added identity-preparation test also passed.
The unchanged view-target context suite passed six tests separately. Typecheck
passed after the identity-preparation change. These are input-scoped results, not
full CI or independent review.

The browser fixture `scripts/verification/native-block-occlusion-browser/` uses
the actual Babylon WebGL2 shader and shared artifact renderer. Its initial RED
showed 10044 red Subject pixels incorrectly visible in the first identity mask:
the newly installed plain identity material's Thin Instance shader had not
finished compilation. A later animation frame concealed that defect. The fix
precompiles the exact shared identity material variants in existing
`renderFrameWhenReady`, releases temporary materials even on failure, and does
not render or advance Tick. The final probe has no extra warm-up animation frame
and asserts the first mask, not merely a later successful one.

Final local browser metrics: opaque opening red pixels 0; faded opening 7030;
first and faded identity masks 0; suspended capture 0; one selected instance;
complete state restoration and byte-identical restored display pixels. Screenshot:
`output/playwright/.playwright-cli/page-2026-09-06T17-55-29-655Z.png` (local,
ignored diagnostic evidence). Browser fixture production build passed with the
expected bundle-size advisory and non-empty-output-directory notice; neither is
a runtime diagnostic. This proves WebGL2 on this machine, not WebGPU, the complete
Preview/Formal/artifact camera flow, two Feel Reviews, or full CF-04/12 completion.

### OCC-C2 cold Hosted startup repair

OCC-B2/C1 was committed locally as `9b8f36a9`; it was not pushed or declared CF
complete. The first real Hosted capture invocation on a dirty tree correctly
stopped before Browser creation at the existing SDK source-identity boundary.
After committing, real Check/Ground/Package passed but cold Hosted startup failed.
A read-only browser observer and server logs on the unchanged candidate established
the cause: Vite discovered `@babylonjs/core/Meshes/Builders/boxBuilder.js` only
through the admitted Native virtual module, optimized it late, then reloaded the
iframe. The existing bridge consequently reported `FRAME_NAVIGATED`.

The dependency comes from MEM4's `babylon-visual-adapter.ts` intent-first geometry
materialization. Add it to the existing Runtime prebundle list; do not relax the
frame-navigation protection, increase startup timeouts, change Camera parameters,
or add model retries. The Vite seam regression first failed on the missing row,
then all 12 seam tests passed. Real cold Browser rerun remains required after the
repair commit. The diagnostic fixture is retained locally at
`/private/var/folders/xh/89vqy8ts02b11h7tddrr0m7h0000gn/T/worldkit-native-package-vkx0fp`;
it is synthetic test input, not a successful generated Case or modified old failure.

### OCC-C2 verified cold Hosted capture

Candidate `09d0ce69` (including `9b8f36a9`) passed the retained-fixture cold
Browser diagnostic without a late dependency optimization or iframe reload.
All Formal image/observation payloads returned; Browser and Vite cleanup both
reported `completed`. The ordinary `pnpm verify:native-no-script-capture` then
passed real Check/Ground/Package, Browser Capture, observation parsing and
Evaluation. Five semantic targets had admitted identity pixels, including all
five in top-down, and the existing opening solid-projection bounds assertions
passed. Case and generation Request bytes remained unchanged.

Inspectable local evidence:
`/var/folders/xh/89vqy8ts02b11h7tddrr0m7h0000gn/T/worldkit-no-script-capture-evidence-9YqFgB`.
The main agent inspected `capture/opening.png` and its identity mask: the Subject,
ground strip and two offset blocks render; the opaque mask respects the Subject
silhouette. The fixture has no scripted traversal (`critical-traversal` remains
`incomplete` by design), and is not an occluding-wall scene or a model-generated
Case. This closes the reproduced cold-start defect, not full CF-04/12 or final
production acceptance. No full CI, independent review or new model run occurred.

### CF-04/T1 opening capture state boundary — confirmed remaining difference

Further pinned-old source tracing refines the earlier timing row. Old
`scripts/cli/worldkit.ts:1624-1659` pauses, resets, waits two animation frames,
checks that the simulation Tick is unchanged, then calls `captureScreenshot`
twice. Old `apps/playground/src/babylon-world-adapter.ts:886-922` resets through
the Coordinator and only renders in `captureScreenshot`; it does not inject a
neutral gameplay Tick there. Old Runtime `renderFrame` synchronizes the initial
Camera view with delta zero. Current `formal-world-capture-provider.ts`
`resetAndSettle` deliberately commits one neutral Tick before opening Capture.
The actual C2 receipt confirms `readySnapshot.world.simulationTick = 1` and fade
selection elapsed `1/60` seconds. Thus passing cold capture is not evidence that
the old opening state/time is identical.

T1 is main-agent-only and depends on OCC-C2. Its owner is the existing Formal
Capture preparation/observation boundary, not a second Camera or Physics owner.
The neutral Tick also supplies the current required committed support sample:
simply deleting it would fail `COMMITTED_SUPPORT_MISSING`; fabricating a contact,
relabeling Tick 1 as Tick 0 or advancing fade during arbitrary renders is not a
valid fix. Next work must reproduce opening-state divergence with an occluder,
restore the old reset/render opening state, and keep any actual support/traversal
measurement bound to its true sampled state through the existing contracts and
consumers. No production timeouts, hidden repair tasks or ordinary failure gates
are to be added. Opening/identity pixels, unchanged capture Snapshot, actual
support provenance and repeat-reset evidence are required before closing T1.

T1's WebGL2 presentation reproducer now extends the existing occlusion browser
fixture without touching production code. With stationary Subject and wall,
delta-zero opening has zero visible red Subject pixels; one `1/60s` update has
1109, versus 7030 after the complete fade. Opacity changes from 1 to
`0.8888888955116272`, the exact Float32 result of old `moveTowards` with rate
`(1/60)/0.15`. The initial test expectation incorrectly used a target-relative
lerp; pinned old and current sources both use the same absolute rate, so only
that test expectation was corrected. First identity mask, full capture-state
restoration and restored pixels continue to pass. Browser fixture build and
typecheck passed. This demonstrates actual pixel sensitivity to the known extra
Tick, not an end-to-end old/current image comparison or a completed T1 repair.
