# Camera Runtime and Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement the reviewed camera design across the SDK, content, Playground, Creator and Episode, with one configuration contract and one runtime owner.

**Architecture:** Pure configuration resolution and strategy evaluation feed a World-owned camera controller; presentation alone writes the rendered camera. Content supplies explicit calibration, editors manipulate the same document, and Hosts use read-only observation or the existing exclusive Episode lease.

**Tech Stack:** TypeScript, existing Three.js/Rapier/camera-collision, Ajv standalone validation, React/Radix and existing preview controls; additional mature npm dependencies where an actual consumer benefits.

**Spec:** [Reviewed design](../specs/2026-09-13-camera-configuration-design.md), including the [review resolutions](../../reviews/2026-09-13-camera-configuration-design-review.md).

## Global Constraints

- Worktree: `.worktrees/camera-config-design`; base `origin/main@285246867`; preserve the three design commits. No production jobs, publication or merge in this task.
- Keep `@worldkit/three` in `packages/three-world`; no new camera workspace package. `camera-collision` stays a geometry kernel.
- One fixed clock, physics world, actor controller, animation owner and active camera writer. Observation does not advance simulation.
- `CameraDocument.kind='world-camera'`, `schemaVersion=1`; views use `third-person`, `first-person`, `shoulder`. Episode runtime and capabilities use `schemaVersion=2`.
- Override order: SDK defaults → view preset → subject preset → project view → project subject. Draft edits the same document and adds no override layer.
- Configuration is finite JSON, uses explicit units, stores no runtime handles and has canonical hashing separate from source-file hashing.
- Third-party libraries are preferred for reusable facilities. Public configuration exposes no library-private types; do not rely on camera-controls serialization as a full solver checkpoint.
- The design is authoritative for lifecycle, geometry, migration and failure semantics. Architecture quality takes priority over accidental legacy behavior; report conversion and retuning explicitly.
- Intermediate dependency scaffolding must be named and removed by Task 11. Do not ship two permanent camera implementations or two authoritative default trees.
- Each task uses failing behavioral tests before implementation, focused checks during development, a local commit and independent task review. New tests enter the existing census mechanism.
- Do not reproduce lengthy example implementations in this plan or production guides. The design owns semantics; executable fixtures and tests own complete examples.

## Ownership and sequence

| Task | Owns | Depends on |
| --- | --- | --- |
| 1 | Configuration types, metadata, schema, resolution and serialization | reviewed design |
| 2 | Subject facts, pure strategies, lens and presentation mathematics | 1 |
| 3 | Transactional controller, constraints and internal baseline state | 1, 2 |
| 4 | World/Engine/Humanoid ownership and lifecycle integration | 3 |
| 5 | Camera editing transactions and reset baseline editing | 4 |
| 6 | SDK Episode v2 and pipeline view commands/admission | 4 |
| 7 | Creator discovery, compilation, observer and inspection | 1, 4 |
| 8 | Calibration migration, content, examples and source conversion | 4, 6, 7 |
| 9 | Local file service, client and exact build/import identity | 8 |
| 10 | Shared Playground editor, draft recovery and preview | 5, 8, 9 |
| 11 | Legacy cleanup, full affected integration and delivery evidence | 1–10 |

### Task 1: Versioned camera configuration contract

**Files:** Create `packages/three-world/src/config/camera/{types,fields,defaults,resolve,serialization,index}.ts`, narrowly grouped field-definition files when needed, and colocated `*.test.ts`; generated validator and its build script belong to this package. Modify `packages/three-world/src/index.ts`, the package manifest/lockfile and test census only as required. Existing `src/config/camera.ts` remains temporarily for unmigrated consumers; it is removed in Task 11.

**Interfaces:** Produce `parseCameraDocument(value:unknown):CameraDocument`, `resolveCameraConfiguration(document,subjectContext)`, canonical serialization/hash, field metadata and schema. Define and export concrete readonly result/context types for later tasks. Context includes selected view and subject facts, not camera tuning. Resolution returns effective values and field provenance. All names and parameter groups follow spec §5; public parse must work without a DOM, physics or scene.

- [x] Write tests for the spec's minimal JSON, five-layer overrides, preset edits still overridden by the project, discriminant replacement, unknown fields/version, missing/mismatched references, finite JSON and array replacement. Use independently derived values: default 8.8 → preset 6 → subject preset 7 → project 10 → subject override 12 resolves to 12; deleting the last override restores 10.
- [x] Run `pnpm exec vitest run packages/three-world/src/config/camera --maxWorkers 1`; record expected failures for absent behavior.
- [x] Implement strict formatting with Ajv generated standalone validation from field definitions; reference and relational checks remain narrow semantic functions. Keep build output reproducible. Add the owning package's required dependencies, not an unrelated root-only declaration.
- [x] Add behavioral coverage for body ratio bounds, first-person eye availability, opening per view, default-only immediate activation, zero third-person distance, positive shoulder distance, bounded/unbounded ranges, near/far, half-life zero and limited/unlimited recovery. Preserve inactive preset values/provenance; reject explicit inapplicable project overrides. Canonical serialization keeps array order, rejects non-JSON input and emits only referenced presets.
- [x] Verify same-document detached roundtrip, stable canonical hash despite object key order, source identity untrusted, and resolver input immutability. Run focused tests and `pnpm typecheck`; record any pre-existing failures separately. Commit `feat: add versioned camera configuration contract`.

### Task 2: Subject facts and pure camera strategy evaluation

**Files:** Create `packages/three-world/src/camera/{subject,state,presentation}.ts`, `camera/strategies/{types,third-person,first-person,shoulder}.ts` and focused tests. Related math belongs to the strategy or presentation module, not a generic utilities package. Adapt `src/camera-subject.ts` when needed; keep current consumers compiling until Task 4 switches their owner.

**Interfaces:** Consume Task 1 resolved types. Produce a readonly subject sample (identity/generation, world pose, body/eye/seat, speed and semantic forward), `CameraProposal` and strategy-specific state. Strategy evaluation takes a sample, resolved configuration, intent/history and fixed delta; returns proposal/new history without camera writes. Presentation takes fixed frames plus shared `PresentationSampleContext` and is the sole final pose/lens application boundary.

- [x] Write tests with literal geometry: subject at `[10,0,0]`, a 4 m arm and known yaw/pitch; test near-vertical view, zero arm with valid orientation, nonuniform subject-local anchor scaling exactly once and metre offsets without scale multiplication. Verify deterministic repeated evaluation and no mutation of inputs.
- [x] Run `pnpm exec vitest run packages/three-world/src/camera --maxWorkers 1` before implementing absent modules.
- [x] Implement Three-based vector/quaternion/lens mathematics, separate translation/anchor/arm smoothing, recenter timing and explicit speed effects. Implement each of the three strategies, per-view opening reference and first-person roll inheritance. Reuse library math and existing query contracts; do not instantiate a real camera in a strategy.
- [x] Implement rigid unit-scale parent validation and world-to-local presentation. Reject scaled/reflected/sheared camera parents; accept translated/rotated parents. Smoothstep/slerp transitions and sample epochs must not advance solver state.
- [x] Cover `dt=0`, half-life zero, absent anchors, ±π wrapping, all supported offset/reference frames and lens projection. Run focused tests/typecheck, document any third-party control adapter conclusion and commit `feat: add camera strategies and presentation boundaries`.

### Task 3: Transactional controller and collision integration

**Files:** Create `packages/three-world/src/camera/{controller,lifecycle,constraints}.ts`, focused state/baseline helpers only where ownership needs them, and colocated controller/constraint tests. Extend timing in `packages/camera-collision/src/{camera-collision-solver,camera-hard-decollider}.ts` and tests to express unlimited recovery without a fake finite maximum. Do not switch World/Humanoid owners in this task.

**Interfaces:** Produce one internal `CameraController` consuming the Task 1 document/resolver and Task 2 subject facts/strategies. It exposes synchronous installation/view selection/authored release, fixed-input candidate preparation/control basis, postphysics evaluation/commit, lifecycle relocation/reset, immutable inspection, presentation sampling and internal checkpoint/baseline operations. Use narrow injected subject/geometry providers and explicit frame identities, not a full World/Humanoid/DOM object. Document exact exported internal types/signatures for Task 4. The controller emits pose data; final camera mutation remains presentation-owned.

- [x] Write failing tests for pending activation, equivalent document install revision stability, preserved intent on hot update, rejected install rollback, view switch/interruption/cut, dormant view references and explicit target generation. Test configuration revision separately from camera commit revision.
- [x] Run `pnpm exec vitest run packages/three-world/src/camera/controller.test.ts packages/three-world/src/camera/constraints.test.ts --maxWorkers 1` before implementation.
- [x] Implement candidate input/history/solver state and atomic commits, shared-camera baseline capture/restore, view intent cache validation, default activation and strict hot-update behavior from spec §§6–8. Integrate recenter exactly once with an explicit control-basis boundary. Cache actual resolved configuration; do not parse JSON during presentation sampling. Initialize every opening against the initial subject; preserve document identity during runtime rebases.
- [x] Reuse CameraCollisionSolver capture/restore and stateless project. Implement disabled versus measured collision diagnostics, limited/unlimited recovery, cut history clearing versus continuous sweep, target-specific exclusion and no-safe-pose errors. Use real geometry-query fixtures to prove constraints and failed-candidate rollback; test post-interpolation projection does not change solver state or revisions.
- [x] Verify interrupted transition starts from last fixed blend, first-person cut, zero-time commits, explicit distance/range hot updates, scene target disappearance and rotated relocation of active/dormant views. Run focused tests, relevant kernel tests, typecheck/census/lint. Commit `feat: add transactional camera controller` and report all internal integration contracts. Do not claim the production owner has switched yet.

### Task 4: World and Humanoid camera ownership integration

**Files:** Modify `packages/three-world/src/{engine,world,contracts,engine-contracts}.ts`, Humanoid runtime/host/presentation adapters, native physics camera-query adapters and public camera/lifecycle tests. Keep concrete subject/query adaptation in focused owned modules where needed. Integrate Task 3 controller; retire the old active owners in `camera.ts` and `humanoid-runtime/camera.ts`. Current source call sites may use explicit temporary input-format adapters during migration, but no second execution owner; remove those adapters in Task 11.

**Interfaces:** Public World exposes `setCameraFollow({configuration})`, `setCameraView(viewId)`, `inspectCamera()` and `useAuthoredCamera()`. Engine owns the Task 3 controller. World provides its existing entity generations and permission guards; Humanoid supplies actual physical/posture/eye/seat/mount facts and presentation callbacks. One World presentation coordinator supplies context to all actors and camera.

- [x] Extend public conformance tests before wiring: preserved opening → first input; same-ID relocation; explicit target independent of controlled actor; live update preserves view/input; rejected update preserves prior committed state. Use real World/Humanoid/Rapier consumers.
- [x] Run `pnpm exec vitest run packages/three-world/src/camera-public-conformance.test.ts packages/three-world/src/humanoid-runtime/camera-lifecycle.test.ts --maxWorkers 1` and observe the missing new behavior.
- [x] Route input/control basis before physics and final subject evaluation after physics through the one controller. Remove Humanoid camera ownership and camera writes from profile/apply/reset/present paths; existing helpers supply data. Process between-tick and in-tick relocation events once by operation/generation, including pending state. Preserve +Z/-Z conventions only in adapters.
- [x] On postphysics camera failure stop the World and preserve prior camera commit, without replaying input or claiming physics rollback. Connect initial seal/reset after actual World entity registration, target deletion, mount handoff, viewport and disposal. Capture effective FOV for author adoption and reject unrepresentable off-axis opening projection explicitly before mutations. Preserve compatible near/far through explicit document data during caller migration.
- [x] Centralize presentation context, including alpha=1 capture followed by earlier RAF cut; apply stateless safety projection then final presentation. Keep body masking inside restored rendering transactions. Exercise rollover/dismount/movement, obstructed retarget, all views, reset, deleted/recreated subject, parent transforms, snapshots and physical trajectory/control-basis continuity. Run affected SDK tests/typecheck and commit `refactor: give world one camera controller`.

### Task 5: Camera editing sessions and baseline commits

**Files:** Create `packages/three-world/src/camera/editing.ts` and tests; modify World/controller baseline integration and public exports.

**Interfaces:** `world.beginCameraEdit():CameraEditSession` with `applyDraft(document,expectedConfigurationRevision)`, `commitBaseline(expectedConfigurationRevision)`, `cancel()` and `dispose()`. Checkpoints stay inside SDK; editors receive immutable inspection/revision data only.

- [x] Add public tests: edit A→B then external C, cancel must preserve C and reject; commit baseline B then edit C and cancel must return B; playing/switching views before cancel preserves later valid input; lease blocks apply/commit/cancel but not offline draft creation.
- [x] Run `pnpm exec vitest run packages/three-world/src/camera/editing.test.ts --maxWorkers 1` and observe expected failures.
- [x] Implement configuration/baseline identity, lifecycle generation and camera commit revision guards, exact rollback only at unchanged state, config-only undo otherwise, invalid-view/range conflict, idempotent cancellation and dispose without rollback.
- [x] Implement explicit opening adoption from current to initial subject reference, rejecting identity/mount mismatch. Baseline commit modifies only the camera baseline, never actor position/facing. Test reset and session rebase rules, focused checks/typecheck and commit `feat: add camera editing transactions`.

### Task 6: Episode v2 view protocol and lifecycle consumers

**Files:** Modify SDK `episode-contracts.ts`, `world.ts` Episode adapter and Episode tests; pipeline `src/contracts.ts`, `src/planning/action-controller.ts`, `src/capture/browser.ts`, `src/source/source.ts`, planning schemas/consumers and corresponding tests/fixtures.

**Interfaces:** Runtime/capabilities v2; declared `{viewId,kind}` views/default; `EpisodeStart.cameraViewId`; `{kind:'view',viewId}` action and `{type:'camera.set-view',viewId}` command. Old perspective/numeric input maps only at Episode import boundary according to spec §10.1. Unsupported v1/unknown ports return `EPISODE_CAMERA_PROTOCOL_UNSUPPORTED` before planning/prepare.

- [x] Write failing real-port and Host-boundary tests for same-kind explore→aim, shoulder mapping, ambiguous old inputs, version rejection, mismatched prepared result and receipt-versus-transition completion.
- [x] Run `pnpm exec vitest run packages/three-world/src/episode.test.ts packages/episode-pipeline/tests/capture --maxWorkers 1` before implementation.
- [x] Implement lease-authorized direct controller access. Preserve prepare stop/reset/probe/viewport/start/one-real-tick/render order and force starting view cut even with long configured transition. Release clears inputs and stops without restoring pre-recording camera or resuming realtime; failed prepare releases and restores viewport.
- [x] Carry view/config/subject identity and transition through capabilities, snapshots, command results, timeline and capture evidence. Verify prepare completion checks actual view and settled transition, and action completion waits for the intended view transition rather than receipt alone.
- [x] Run affected SDK Episode and pipeline planning/capture/source tests/typecheck; keep external transport mocked. Commit `feat: migrate episode to explicit camera views`.

### Task 7: Creator configuration discovery and observation

**Files:** Modify `packages/creator-host/src/{discovery,compiler,browser,schema,cli}` camera consumers and focused tests; SDK WorldObservation public contracts and observer forwarding. Update existing camera guidance and minimum binding fixture; no duplicate production policy document.

**Interfaces:** `world_inspect({sections:['camera']})` returns `observation.camera` from optional `inspectCamera`; absence/failure yields explicit unavailable/null without losing screenshots. Discovery derives schema/metadata from the project's actual SDK source. Relative `config/camera.json` import joins existing source/runtime hash closure.

- [x] Add failing actual discovery/bridge/compiler tests: project-relative camera JSON compiles and hashes; SDK override changes discovered schema; camera section reads committed state without simulation; missing observer degrades locally.
- [x] Run `pnpm exec vitest run packages/creator-host/tests/discovery packages/creator-host/tests/compiler packages/creator-host/tests/browser --maxWorkers 1` before implementing relevant failures; adjust the exact existing test path if its domain uses a different name.
- [x] Implement source-safe metadata extraction for the new module layout and generated validator closure. Do not execute arbitrary project source or silently fall back to host defaults. Keep author imports restricted; embed chosen preset snapshots rather than importing preset-content.
- [x] Wire MCP and service schemas, bridge, observer and current-view feedback to the same committed inspection. Add lightweight snapshot summary to existing playtest captures; field provenance remains on demand.
- [x] Verify self-contained runtime build consumer and mismatched hash failure, focused tests/typecheck. Commit `feat: expose camera configuration through creator`.

### Task 8: Migrate calibration, content and source calls

**Files:** Add `scripts/migrations/camera-configuration.ts` and tests/report; content `config/cameras`, profiles and vehicle specifications; SDK default callers, repository current examples, Creator bindings and Playground setup. Update actual consumers of obsolete camera/profile fields; do not rewrite historical identities or frozen artifacts.

**Interfaces:** Deterministic migration input includes source identity/context; output is the versioned camera document plus field-level equivalent/converted/retune/inactive/conflict/unknown report. Presets contain only content differences. Source rewrite uses explicit known call sites or reports unsupported custom code with paths.

- [x] Write failing migration fixtures for old humanoid 58°/8.8 m, zero-arm vehicle, recenter response zero, shared recovery used for both zoom/collision, target height versus local offset, explicit 8.8 map ambiguity and two named views.
- [x] Run `pnpm exec vitest run scripts/migrations --maxWorkers 1` before implementation.
- [x] Convert known defaults/ranges/near planes/anchors/roll/speed effects according to spec §13. Keep all road, boat, aircraft and creature calibrations inventoried. Export shoulder full-effect speed explicitly. Remove global asset camera application and map-name/asset-name branches from runtime; scene-specific values become scene configuration.
- [x] Migrate current public calls to `{configuration}` and `setCameraView`; remove profile camera settings and duplicate Playground persistence as active authority. Retain any necessary legacy source readers only in the one-time migration boundary. Make repeated migration byte-identical and reject source-hash conflicts before writes.
- [x] Record intentional changes and items needing visual retuning; verify actual new preset resolution/Creator consumption and source rewrite fixtures. Run focused tests/typecheck and commit `refactor: migrate camera calibration to owned documents`.

### Task 9: Local camera file service and build identity

**Files:** Create focused `apps/sdk-playground/server/camera-config.ts` and tests, browser-facing file client/contracts under `src/camera/`, and Vite wiring. Use Task 8's fixed camera project ID/file registry. Keep the shared property panel for Task 10.

**Interfaces:** Local service reads/saves a server-bound config ID with expected file SHA; static builds use import/export. The browser can identify exact camera JSON bytes adopted by its current build/import. Saving, rereading and runtime canonical hash equality alone do not establish build adoption.

- [x] Write failing local service tests for missing/create/update, stale SHA conflict, simultaneous writes, untrusted origin/session, fixed-path/symlink escape and malformed documents. Run focused server/client tests before implementation.
- [x] Implement local-only same-origin/session protected fixed-path service with serialized hash comparison and atomic replace. No arbitrary path API, production observer write access or network deployment exposure. Use the SDK parser/serializer and actual active document mapping, not another schema.
- [x] Bind build/import fileSha256 to the exact JSON bytes used in module generation, including static build output and HMR invalidation. Do not execute author source or infer adoption from a later file read. Keep this in Vite/application adapters, not the camera runtime.
- [x] Verify the actual HTTP service and Vite build/import consumer with create/update/conflict and changed-byte identity tests. Run focused tests/typecheck and application build. Report the public client and build-identity seam for Task 10; commit `feat: add local camera configuration persistence`.

### Task 10: Shared visual camera editor

**Files:** Create focused modules in `apps/sdk-playground/src/camera/` for session/document editing, shared property panel and preview; consume Task 9's file client/build identity. Modify Inspector, Workbench, main setup and application README.

**Interfaces:** Both Inspector and Workbench use one field-metadata-driven panel and SDK edit session. Document drafts/undo/recovery are UI state. Independent free-orbit preview camera can use existing OrbitControls or camera-controls; never share the managed camera writer. Save the exact Task 8 active scene document; explicit variant-driven document changes stay visible as unsaved drafts.

- [x] Write failing tests for preset-scope editing under project override, invalid draft preserving preview, undo grouping, external-file conflict preserving both versions, HMR recovery and canceled/failed save status. Run focused editor tests before implementation.
- [x] Implement grouped fields, scope/view selection, inherited/configured/effective/inactive display, apply/cancel, explicit opening adoption and baseline commit. Show draft/local recovery/saved file/build adopted distinctly. Share existing UI controls; use SDK resolver/metadata rather than another schema. Do not invent subject capabilities or duplicate initial-opening reference math for effective values.
- [x] Integrate Task 9's local service; static page import/export and dirty-state recovery remain usable without it. Preserve explicit document deltas from variant selection and unsaved drafts across HMR/world replacement.
- [x] Verify save→reload→rebuild→actual effective value equality, readonly capture during editing, and independent preview. Run focused tests, `pnpm build:editor` and a real browser smoke, inspect resulting artifacts and commit `feat: add shared visual camera configuration editor`.

### Task 11: Remove transitional paths and verify the complete flow

**Files:** All affected package-owned tests/consumers; existing SDK/config/Playground READMEs, architecture and production binding guidance; `docs/reviews/2026-09-13-camera-implementation-verification.md` records evidence and migration limits. Remove obsolete source modules/exports only after current consumers are migrated.

**Interfaces:** Only the new camera configuration/runtime is active. Old Episode input translation is confined to its import boundary. No old profile-camera defaults, second FollowCamera/ThreeCameraRig owner, hidden map overrides or duplicate editor field logic remain.

- [x] Search current consumers for obsolete APIs and inspect each remaining hit as migration reader, historical identity or defect. Remove temporary adapters and update behavioral tests instead of preserving old branches merely to pass them.
- [x] Run affected SDK, Creator and Episode contract/integration tests, independent relevant Node tests, `pnpm typecheck`, `pnpm test:census`, `pnpm verify:workspace-boundaries`, affected lint and `pnpm three:creator:prebuild --profile three-sdk --output .codex-tmp/camera-runtime` against the final tree. Resolve new failures with focused regressions.
- [x] Exercise the design §14 operation matrix in local browser/real Rapier fixtures: initial input, orbit/zoom, mount/dismount/rollover, obstruction recovery, all views, interrupted transition, same-ID teleport, reset and repeated Episode starts. Compare fixed state/actor trajectories and inspect screenshots separately. Do not substitute numerical tests for visual acceptance.
- [x] Capture source/runtime/config identity and available performance samples; compare the same scene/input/device. Record unmeasured visual/performance or asset limitations honestly; do not claim old tuning equivalence without comparison. Keep cloud calls mocked and frozen artifacts untouched.
- [x] Update authoritative user/maintainer documentation once, verify links and direct schema consumers, complete whole-branch review and fix findings. Commit coherent cleanup/evidence changes; leave the branch locally reviewable without auto-merging or publishing.
