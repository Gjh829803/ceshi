# Three SDK v2 implementation and validation

> Historical source-bound review/verification record. Scope and results apply only
> to the source and artifacts identified below. For current behavior, use the
> [branch guide](../three-sdk-data-production.md); recheck findings against current code.

Scope: the user-authorized SDK extension implementation, cloud tool availability and five concurrent model cases. The previous D0 contract review remains design history. The core implementation is commit `3a45556f`; the cloud prompt freeze is `89fa9497`. A subsequent viewport fix and its exact runtime identity are recorded by the new cloud lock. This report does not label local fixtures as generated cases.

## Implemented responsibilities

- Public World facade exposes assets, entities, parameters/actions, operations, private state, epoch-bound tasks, registered movement intent and prepared Mesh geometry replacement. Private WorldEngine executes the same single Three scene/renderer, Rapier world and fixed clock. Engine transport names are not exported as a second Creator API.
- Actor movement, gravity, contact, motion input, animation and camera have one executor. WASD moves; arrows orbit. Ordinary jump presentation stays on the verified jump clip and returns to locomotion. One-shot playback completion uses the actual animation finished event.
- Camera keeps the authored opening, then transitions to follow. Native volumetric collision, immediate safety clamp, delayed/damped release, explicit authored ownership and full reset are implemented.
- Character contact uses native capsule trajectory checks instead of inheriting another actor's previous velocity. Newly changed collision bodies have a first-tick synchronization guard. Exact-contact spawn gets a bounded native capsule skin preparation; it does not substitute for KCC support.
- Large fixed/kinematic box collision is partitioned into exact cuboids while preserving visible geometry, occupied volume, source visibility mapping and actual collider budgets. Kinematic platform motion uses real support contacts and explicit carry through the same KCC; temporary provider-query state is restored before the unique physics step, including on exceptions.
- Assets have verified identities, initial pose evaluation, independent skeleton/mixer/material instances and resource ownership. G Bot's recommended body comes from its existing manifest; diagnostic samples are not promoted to verified subjects.
- Registered root channels and parameter mappings cannot compete with author callbacks. Visual/state effects and custom movement callbacks are synchronous; faults stop the world and expose diagnostics. Arbitrary JavaScript side effects are not claimed to be rollback-safe.
- Prepared named BufferGeometry replacement supports non-skinned, non-instanced Mesh roots. It preserves identity/material/attachments, validates physical candidates, updates geometry revision/navigation and restores baseline geometry on reset. Compound or skinned deformation is not advertised as implemented by this API.
- The Creator has fifteen actual tools, including live command execution and World operation queries. Host command IDs are forwarded; an unobserved revision is not presented as model-observed context. Schema topics and public examples use the v2 interface.

## Confirmed failures and regression evidence

All earlier failing runs remain in `.codex-tmp`; no generated world was manually edited to conceal a failure.

| Failure found | Systemic change | Evidence |
|---|---|---|
| Ground movement discriminator reached numeric physics settings | Explicit public-to-engine options conversion | Legal configured ground speed regression; earlier real browser startup failure retained |
| NPC position and follow plans both committed | Validate locomotion/root transform alias conflicts before publication | Independent public API test rejects the whole plan and preserves position |
| Author plan fault left running/available state | Stop and diagnose faulting world; mark capability unavailable | Independent public API regression |
| Initial effect fault returned accepted/failed but start continued | Initial preparation inspects terminal operation outcome before start/ready | Real public API failure and regression |
| Removed follow target left infinite pending operation | Finish dependent tasks and wake waiters immediately, including while paused | Real public API failure and regression |
| Keyboard R only reset private engine | Route keyboard reset through the public World lifecycle | Actual trusted KeyR failed, then same browser test passed |
| World-space spawn used local coordinates under transformed scene | Convert through scene frame before publishing prepared instance | Retained [12,1,0] vs requested [2,1,0] failure and translated/rotated-scene regression |
| Preview-paused cached sample was read after explicit start | Host reads current state for stop checks | Failed diagnostic episode retained; subsequent complete episode passed |
| Full episode was cut at requested wall duration; low-FPS recording missed the endpoint | Separate complete-episode overhead budget, actual canvas start/final frames and declared postroll; preserve native VFR timestamps | Old cloud 89/91-step and179s-video failure retained; complete121-step and few-step real browser regressions |
| Paused recorder startup could wait for an unrequested first frame | Request and render the first real canvas frame immediately after recorder.start; independent startup/finalization deadlines | Actual two-process hang retained; pause, debug and few-step browser runs passed after the ordering fix |
| Default owned canvas stayed 300×150 | SDK fits owned canvas to stage and handles resize; supplied renderers keep caller sizing | Real old cloud PNG; new local PNG960×540 and real resize800×600 with same player/tick |

Physics-specific failures, native assumptions and matrix evidence are in `.codex-tmp/three-sdk-spike/actor-collision/D2-delivery.json`, including the original y=0 failure, large cuboid matrix, first-tick geometry contacts and kinematic carry/exception restoration.

## Verification actually run

- Full `pnpm test`: **358 files passed; 3919 tests passed, 3 skipped**. Contract:311 files/3214 passed/3 skipped; resource-heavy:47 files/705 passed. The initial attempt stopped at the census because four new tests were not classified; they were explicitly added to appropriate lanes and the complete gate then passed.
- `pnpm typecheck`: passed. After the viewport change, full typecheck passed again.
- `pnpm build`: passed (existing bundle-size advisory retained). The viewport change touches only the experimental SDK/Host build path, subsequently built and exercised in a real browser.
- `pnpm test:independent:node`: **202 passed**. No unrelated site code was changed; this turn does not claim a new site lane run.
- After the viewport delta: all **155 tests in nine SDK/tool files passed**. This includes48 physics,13 camera,20 assets,19 public facade/integration and existing private-engine/navigation/tool tests.
- Real capability fixture:17.080s wall /16.232s active, actual video, no SDK/page errors. Measured walk/run2.400/4.800m/s; arrow orbit XZ displacement below2e-10m; continuous jump time; gate, geometry, NPC reached, hover and reset validated. Source changed during the broader diagnostic session, so only each individually hashed run is evidence for its own tree.
- Real keyboard reset regression: sky/day, gate false and actual yaw0 restored; actual Host command IDs echoed. Opening, complete player tri-view and an actual video frame were visually inspected.
- Viewport delta: a fresh3.036s SDK browser run passed with actual960×540 PNG. A second actual browser resized to800×600; camera aspect changed accordingly, player identity and paused simulation tick stayed unchanged.
- Gallery integration: SDK-only five-task and legacy paired fixture gates passed; independent Node lane now203 passed. The gallery shows real active play time and the SDK's arrow-camera controls. No generated case is implied by those fixtures.
- Recording delta: pause run completed4/4 steps,3.041s input and2.423s active; a2s debug run correctly remained incomplete; a2-step run completed with2.016s input and actual960×540 video. Postroll is real sampling of the same stopped canvas, excluded from active/input time. The MP4 encoder retains source frames and timestamps without a fixed-FPS duplication filter. The final frozen cloud180 run remains a separate gate.

## Cloud gate and model status at this checkpoint

The first installed v2 cloud doctor completed180.063s active and a36-file independently verified archive, but its real opening/video were300×150. The second doctor fixed dimensions and had no SDK/page/network errors, but completed89/91 steps with179s video despite180.132s active. Both are preserved as **NoGO**. The recording startup/budget/endpoint delta must pass a new same-source installed180s run and closure verification before five model cases start. The gate requires actual960×540 PNG/video, a complete episode and input/active/video durations each at least180s.

The final119ad9b5 installed doctor passed:91/91 steps,181.855s input,181.776s active,182.927s actual MP4 with184 frames at960×540, no SDK/page errors. Fifteen MCP tools, paused commands, SDK/browser closure before and after, and independent36-file unpack with an actual ffprobe check all passed. This is toolchain evidence, not a generated scene result.

The user then replaced the original five cases and required no human guidance during generation. The old suite had zero model POSTs and now has a durable submission halt. The fresh holdout was drawn once from90 valid unique PNGs, excluding the old five and the previously inspected excluded candidate. Its manifest SHA is `d1061c6707c1c12083da2baa26d8420691ae0e7dc12dac7aa0bbb889ead92afa`; selection was independently recomputed with no subject or difficulty filters. SDK/tools and the generic prompt remain frozen. Host-only change e0970a8c removes scene-specific hints and labels from model input and binds resume to the selected manifest. Root checked all five actual payloads against the exact generic instructions and original uniformly normalized user request.

Run `three-sdk-v2-holdout-five-20260905-r1` submitted exactly five gpt-6-astra/xhigh SDK jobs on2026-09-05 at09:31:36–38 UTC, with max/account concurrency5. Runtime lock is `e04bcab0603230360737a752c1b312e7a8290e3497e40b2cb66a157727cc1bc2`. Initial service responses were queued; actual model execution and quality must be reported from later evidence. No human corrective messages or author-source patches are permitted in these original runs.

| Source case | Job ID |
|---|---|
|013-grand-canyon-courier|gen_35869b59b65cf022|
|gvs2-00007837|gen_c03aa61c0905e1d3|
|12-lbd-00abe54cd558493dfc70621e|gen_a7b31f4991990414|
|screenshot-20260823-193953|gen_50bd5bb2acb7bc70|
|003-lunar-earthrise-rider|gen_e14d428ef6ccdce7|
