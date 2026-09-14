# Camera implementation verification — 2026-09-13

This record covers the local camera-configuration branch based on `285246867`.
The design-review identity `ccc89bd3` and historical production identities remain unchanged.
Independent Task 11 and whole-branch reviews are complete. All findings were addressed.
Current runtime-bearing source is `dcf8ab85`; validation limits remain explicit below.
The [independent review record](2026-09-13-camera-implementation-review.md) preserves
the initial findings and final scoped approval.

## Architecture and migration

One SDK CameraController owns configuration, intent, committed fixed frames,
transitions, constraints and lifecycle. Ordinary, humanoid and mounted subjects
supply facts; strategies return candidate poses. Rendering samples committed history
and stateless safety. World editing sessions distinguish live draft application,
source-file save and reset-baseline commit. Creator observes the same controller;
Episode v2 owns the exclusive recording clock and named view requests.

The old ThreeCameraRig/FollowCamera modules, profile camera/view fields, vehicle/map
camera scalars, numeric view methods/commands and perspective aliases are removed.
`setCameraFollow` requires `{configuration: CameraDocument}`; ordinary eye geometry
belongs to `addCharacter.eyePositionLocalMetersXYZ`. Movement profiles remain controls
only. The native pure factory owns humanoid calibration and declares views with an
empty keyboard cycle by default. Content and app documents explicitly enable cycling.

Current catalog source records contain explicit selected preset references and no
`vehicle.spec.camera`. The existing registration and donor-import boundaries preserve
this shape. `assets_describe.cameraPresetSnapshots` exposes public content snapshots
for explicit embedding, with provenance and unverified-workspace-runtime labeling;
it neither installs them nor claims the active camera uses them. Regeneration of
current Century resource records updates the already-changed metadata resource hash,
without rewriting GLBs, images, motion data or historical sources.

Playground controls now use actual view IDs, including multiple views of the same
kind. Startup preparation does not map a kind back to a hardcoded view. File HMR,
variant draft state, save identity and baseline authority remain separate.

## Calibration and intentional differences

Generic strategy defaults remain separate from config-owned humanoid presets.
Project examples derive their human preset snapshots from the SDK factory. The car
example keeps person/rover distance 11 m and far 200 m; aircraft keeps the old effective
person distance 12 m, plane distance 15 m and far 3000 m. Character actions uses 7 m;
shared physics uses the native third-person configuration with far 150 m and no T cycle.
Vehicle ranges retain their explicit base-distance multipliers. Example JSON files are
part of the actual source graph and registry; tests copy nested directories.

Preserved one-time migration inputs remain byte-identical historical evidence.
The Task 8 retunes remain explicit: removal of double damping; world/heading/local
anchor distinctions; first-person collision and roll behavior; old driver-eye fallback,
seat offsets and lateral offsets; shoulder effective radius; native far-plane differences
outside explicitly calibrated examples; and hidden clearance/clamp conversions.
Numerical/technical tests do not establish visual equivalence or player-feel acceptance.
Unexported v1 browser profiles were not read or automatically reactivated; their old
storage namespace remains untouched and requires explicit export/migration.

## Initial delivery verification (superseded by fix wave 1)

Runtime-bearing source commit: `ca17609595e6055cb227618514b039d2e3eb544f` (Task 11 starts at `f94455121c4631cda1e68b3f990637e3e466e900`). The following evidence commit changes documentation only. Review approval remains a separate coordinator step.

| Check | Final result and scope |
|---|---|
| Affected Vitest sweep, one worker | 113 files / 1707 tests: 1696 passed, 11 failed in 8 files. Every failure was then corrected and rerun below; this initial command is **not** reported as green. All SDK 71 files / 1163 tests passed. |
| First focused consumer repair run | 6 files / 123 tests: 122 passed, one remaining obsolete schema assertion. Corrected in the next run. |
| Final followups | 6 files / 88 tests passed: tools, example-files, Episode adapter, character-guidance, vehicle-seating, Inspector. Together with the first focused run, these cover all 11 sweep failures. |
| Final Creator example JSON input migration | example-files: 8/8 passed; schema checks and actual compile/flight consumers. Four driving playtest JSON files use existing KeyT down/up steps with explicitly enabled cycles, not Episode-port commands inside WorldCommand transport. |
| R33 pending activation regression | Controller 34/34 passed after observed RED; actual Creator vehicle-camera 7/7 passed. Idle-subject first-input continuity is checked at 1e-9 m, without weakening physics tolerances. |
| Node checks, concurrency 1 | 58/58 passed across three-eval, frozen-entrypoints, cloud-scheduling, cloud-production-run and canonical-json; cloud transport mocked. |
| Typecheck / lint | `pnpm typecheck`; `pnpm exec eslint . --max-warnings 0`: exit 0. |
| Census / workspace | 137 files (45 contract, 92 resource-heavy); workspace boundaries pass with 0 registered debt. |
| Builds | `pnpm build:editor` passed; final `pnpm three:creator:prebuild --profile three-sdk --output .codex-tmp/camera-runtime` passed. Large chunk warning remains. |
| Documentation / source | Direct schema consumers above; current changed-document links: 0 missing files; `git diff --check` and changed .mjs syntax checks pass. Generated camera validator/discovery uses the trusted generator, not hand edits. |

The affected sweep command was:

```sh
pnpm exec vitest run packages/three-world/src packages/creator-host/tests/discovery packages/creator-host/tests/compiler packages/creator-host/tests/browser packages/creator-host/tests/tools packages/creator-host/tests/integration packages/episode-pipeline/tests/capture packages/episode-pipeline/tests/planning packages/episode-pipeline/tests/integration packages/episode-pipeline/tests/source scripts/migrations scripts/testing apps/sdk-playground/src/inspector.test.ts apps/sdk-playground/src/camera apps/sdk-playground/server/camera-config.test.ts --maxWorkers 1
```

The failures were obsolete fixture/schema fields, missing nested fixture directories, expected example source lists, pre-seal camera initialization and exact FOV floating-point equality (`46.00000000000001` versus `46`). They were corrected at their actual consumer boundaries; no compatibility runtime fallback was added. Earlier isolated native/Episode Rapier cleanup failures remain unattributed; current complete files pass. Earlier two-worker ephemeral-port/SIGABRT failures also remain unattributed. These are not claimed to reproduce on an old main branch.

### Operation evidence and limits

| Operation | Executed evidence |
|---|---|
| Initial input; orbit and zoom | Real Creator vehicle-camera browser tests, SDK input tests and R33 controller regressions; first meaningful input uses the pending unconstrained pose and current subject. |
| Mount / dismount | Real Rapier public conformance boarding/leaving and mounted lifecycle suites. |
| Rollover / recovery | Real runtime fixture rotates the mounted car by pi about Z, invokes `vehicle.recover`, and checks stopped velocity, unchanged driver/position and named shoulder view. This is an explicit recovery sample, not a full rollover trajectory benchmark. |
| Obstruction / recovery | Real solids in camera-public-conformance, physics and vehicle-camera tests (open cabin versus solid panel); controller constraint transaction coverage. |
| All declared kinds / interruption | Real browser Episode selected first-person, shoulder and third-person; controller interrupted blends and public view/edit lifecycle suites. |
| Same-ID teleport / reset | Real World camera integration relocation and reset tests, dormant views and generation continuity. |
| Repeated Episode starts | Final real Playground browser: two 180-tick input sequences produce equal final entity states after excluding only expected monotonically increasing generation IDs. Per-tick trajectories were not collected by this browser script. |
| Named UI / file lifecycle | Final browser saves custom default `explore` plus same-kind `aim`, verifies HMR retains World identity, reloads `explore`, selects `aim`, reloads again; original source bytes restored. Inspector five-button screenshot inspected separately: IDs distinct, rows contained. |

Playground runs used `pnpm dev:editor --port 5193` and real Chromium/Rapier on this workstation. Browser evidence uses the same runtime-bearing source as the source commit; the later four Creator JSON input edits do not enter the Playground source graph. Screenshot inspection establishes visible subject/composition and usable controls for those frames only. The original campus opening comparison gives position difference 0 m, physical orientation difference 0 rad, pitch difference 0 rad and arm difference -1.7763568394002505e-15 m. Quaternion signs are equivalent. This is one campus opening, not FOV, trajectory, all-scene or visual equivalence.

Final browser timing: 180 samples of `Episode port.advance(input, 1)` including physics, camera and snapshot, excluding outer Playwright transport: P50 **9.60 ms**, P95 **14.70 ms**. The earlier same-device run measured 9.20 / 13.40 ms. These are scoped samples, not old/new performance comparisons or solver-only measurements. Query counts, allocation hotspots, solver-only cost and exhaustive visual/player-feel acceptance remain unmeasured. Final browser page errors were empty; KHR shader-compile unsupported and GL ReadPixels GPU-stall warnings remain. A separate initial-inspection run observed two ResizeObserver notifications; it is not merged into the final run's error count.

### Durable identity record

Runtime hash: `13ab6c68a63f315e670b6fc231a55b38a09bd970d199ce635db3d641d493be35`. Manifest SHA-256: `ed71ad3a1ae8074757e7051a5972130c1278fbe83e3238139e2ae1def8e344ce`. Runtime worldkit-three.js SHA-256: `86f3801d3e4b90bf82dbadbbf82e24eba159c1986ccd0393f3061fa01f48632d`.

- `apps/sdk-playground/config/camera.json` — SHA-256 `c8648c9f25ac825868c1194c00e22542c94a289032390dace5acc27625a94379`.
- `packages/three-world/src/config/camera/discovery.generated.json` — SHA-256 `8f0e29432af22ad8f9766e978e8460eccf0d6002458c0a3403a127486f12f5f1`.
- `output/playwright/camera-final/matrix.json` — SHA-256 `fd875e6b42d46167cadf1c92e6d8b54824f32f6d38df311036c588d71260b44d`.
- `output/playwright/camera-final/campus-opening.png` — SHA-256 `80b564f846fcc475cb9a888c516279478b4cbd2781b67a6734bdec5e00476ddc`.
- `output/playwright/camera-final/custom-view-aim.png` — SHA-256 `8e4a57a6a6bdd4286d89a0c25fac3b6226ce30b989256b3d74931d3deb2d4030`.

Browser device: `{"userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/151.0.7922.34 Safari/537.36", "hardwareConcurrency": 8}`.

Legacy scan across current packages/examples/apps/scripts: no active ThreeCameraRig/FollowCamera or numeric/profile camera transport remains. Remaining old field strings belong to the explicit Episode import, one-time migration reader/report, schema rejection tests, or a local test variable describing a view kind. Historical sources and frozen artifacts remain unchanged. Four one-time diagnostics were moved byte-for-byte from ignored SDD scratch into ignored `.codex-tmp/camera-probes/sdd/`; they are not maintained consumers. Archive hashes:

- `.codex-tmp/camera-probes/sdd/capture-baseline.ts` — `135c51964619c8ce57093d30b5e54b81fb9d4d8b7874e4b624a23dc979d5702e` (original filename unchanged under `.superpowers/sdd/2026-09-13-camera-implementation/`).
- `.codex-tmp/camera-probes/sdd/probe-episode-baseline.ts` — `7212ec322f63a654791dd4f059fff0a0e3cbda6775c2284dc89cdcbb4f878a7b` (original filename unchanged under `.superpowers/sdd/2026-09-13-camera-implementation/`).
- `.codex-tmp/camera-probes/sdd/task11-pending-settle-probe.ts` — `dbc855719038829bd0175a70a7f4232dfc3b887b7021b560b260557f2c5d4cc5` (original filename unchanged under `.superpowers/sdd/2026-09-13-camera-implementation/`).
- `.codex-tmp/camera-probes/sdd/migrate-current-catalog.ts` — `2019a74f7849265f5dae28bfdf3f41ee3d25989de3165bbe5d636b20d19137f8` (original filename unchanged under `.superpowers/sdd/2026-09-13-camera-implementation/`).

Raw test logs and browser artifacts remain local ignored evidence; the results, hashes, limits, test-retirement mapping and all 33 chronological rulings below are retained here so scratch cleanup does not erase important conclusions.

## Task 11 review fix wave 1 — historical source (superseded below)

The initial delivery below was reviewed as needing fixes. This section supersedes its completeness and final-identity claims. Runtime-bearing source is `fc0e1c8ec0017d2dd253b84497459661ba400d07`; `b5d7004890d44670de34704108db81d58e42a15e` then updates only two cross-package test consumers; the subsequent evidence commit changes only these review records.

The R18 native prepare fallback and native target-selection factory fallback are removed. Callers install their own document. Native `prepareEpisodeStart` is a physical placement helper typed without `cameraViewId` and rejects that field at runtime; World Episode `prepareSegment` owns full preparation and view selection. Existing Episode ownership guards remain. The README now uses configuration-only calls, registers ordinary eye geometry on the character, and binds the actual `subjectId`; a real `survey-drone` fixture checks the distinct-ID recipe. The unrelated motorcycle/plane/glider movement-field and frozen-range regression is restored. Creator test comments now describe the actual opening and input fixture.

R34 retains generic orbit rate 2 rad/s and explicitly sets native factory rate 1.2 rad/s. The calibration exporter consumes that factory input; three Playground documents and eight native-derived example documents preserve it. Generic nonhuman/multiple-actor documents and explicit overrides are not mechanically changed. The old native horizontal rate was 1.2 and vertical rate 1; the single current rate preserves horizontal orbit and camera-relative movement while changing native vertical input by 20%. No hidden axis multiplier or new schema field was introduced. The original campus bytes from the initial run remain historical evidence; the new intentional rate changes its current hash.

### Covering checks

All commands use this checkout, with heavy Vitest runs limited to one worker. No cloud job or production transport was used.

- Initial affected placement/camera/config sweep: 15 files, 273/276 passed; three fixture failures (missing body dimensions, absent document represented as undefined, and exact floating-point FOV equality) were corrected. Its three-file followup passed 85/85.
- R34 consumers: 9 files, 162/163 passed. The remaining native placement regression was observed during the guard/test update and superseded by the final runs. Covered config contract, real keyboard input, World camera integration, app calibration, exporter, Creator discovery, example source/schema/compile, and real vehicle-camera browser consumers.
- Final placement sweep: native flying-creature-visual and space files passed; runtime retained one old `cameraViewId` fixture. That caller was corrected to physical placement. Final complete runtime file: **64/64 passed**. The preceding three-file placement run was 125/126, not claimed green. The full actual native callers were covered across these runs; no unresolved test failure remains.
- Final cross-package placement consumers: Creator `vehicle-families.test.ts` and Episode `vehicle-route.test.ts`, **60/60 passed**. The former now supplies physical placement without a view field; the latter installs an explicit document before consuming camera state. Final typecheck and focused lint after these test changes also pass.
- Restored movement regression passed in the original affected `configuration.test.ts`. Native no-document/no-view-side-effect and rejected-camera-field regression passed in final runtime; distinct-ID README recipe passed in public conformance.
- Final `pnpm typecheck`, `pnpm exec eslint . --max-warnings 0`, `pnpm test:census` (137; 45 contract / 92 resource-heavy), `pnpm verify:workspace-boundaries` (0 debt), `pnpm build:editor`, and runtime prebuild passed. Current changed README/review local links: 0 missing; removed-API source-claim scan and `git diff --check` pass. Trusted `generate:camera-validator` regenerated discovery after factory changes.

### Measured old/new operation comparison

[The durable operation evidence](2026-09-13-camera-operation-evidence.json) contains per-tick actor/vehicle positions and velocities, camera pose/FOV, inputs and action states for old and final new source, plus complete bundle-input hashes, configurations, repeated-run maxima and frame geometry. Raw duplicate runs and screenshots remain in `.codex-tmp/camera-r1/`, with hashes retained in that record. These diagnostics are archived outside SDD scratch. The record's `diagnosticHarnessSources` also preserves complete build, sampling, rollover and analysis program text, so cleanup does not erase the generating method.

To reproduce in this dependency-installed checkout at the recorded runtime source, extract those named program strings to `.codex-tmp/camera-r1/`; export `git archive 285246867 packages/three-world packages/camera-collision package.json pnpm-lock.yaml tsconfig.json` into its `old/` directory; link that directory's `node_modules` to the checkout dependencies. Copy the public `packages/preset-content/config/cameras/presets.json` there as `content-presets.json`. Run `node .codex-tmp/camera-r1/build.mjs`, then `pnpm exec tsx .codex-tmp/camera-r1/run.ts`, `run-no-orbit.ts`, and `rollover.ts` (the latter two use the same tsx invocation). `run.ts` final labels are `new-final` and `new-content`; running label `old` with the unchanged sampler recreates the old primary timeline. The harness owns and closes its local port 5194 server/browser. The metadata closure and recorded hashes are the identity check; no live catalog/cloud request is required. The recorded no-orbit run is a separate 120-tick input timeline, not an unobserved claim about the primary orbit run.

Old source `285246867` was exported into an ignored directory without modifying historical files or creating a Git worktree. Its actual SDK **and camera-collision source** were bundled; a closure assertion rejects current SDK/kernel paths in the old bundle. Both dependency declarations match, including Three 0.185.1 and the same pinned Rapier 0.20.0 whitebox query archive. Both bundles ran in the same Chromium/workstation and same simplified flat scene with the same model-free car spec and box-body visuals. The only spec declaration difference is the retired old camera scalar, replaced by the actual public `rover.third-person` snapshot in the final document. The old optional explicit perspective preparation hit its existing lease guard, so the comparison uses its supported preselected/default third-person path with the field omitted. Actual sampled old view 0 and new named third-person were checked; old source was not patched.

Each source runs on foot and mounted, from `[0,.03,0]` facing pi and `[8,.03,6]` facing pi+.4, twice each, 120 fixed ticks per run. Input: forward through tick 99, horizontal camera input .2 at ticks 20–39, steering .2 for mounted ticks 60 onward, braking at 100–119, and on-foot jump edge at tick 30. The on-foot state trace includes jump at 30, fall at 51, landed/run at 70 and idle at 106. One repeat inserts one/two `withPresentation` render observations each tick; this tests repeated presentation observations at fixed alpha, not every possible display-alpha sequence.

The tolerance was declared before acceptance: repeated numeric position/velocity 1e-9, physical quaternion angle 1e-7 rad, action/state equality exact, only generation identity removed. Final repeats have zero entity-position/velocity and action differences; camera differences are at most 8.9e-16 m and zero physical angle. Distinct starts remain distinct; each is compared with its own repeat. Full entity/action/camera data is sampled each tick, not just endpoints.

Before R34, native generic rate 2 versus old 1.2 produced exactly .0533333 rad of accumulated yaw difference, up to .226899 m of actor displacement difference and four run/idle state differences. An isolated 1.2 configuration ablation eliminated those: actor positions 0 m, velocity below 8.9e-16 m/s, action differences 0, camera below 6.3e-15 m / 0 rad. Final production factory 1.2 plus the actual public rover snapshot was then rerun; no test-only input-rate override is used in that final data.

With that real snapshot, old/new mounted entity and vehicle trajectories and action states are identical. Camera position maximum differs by **.002363 m**, physical orientation by **.0001138 rad** during orbit. The former generic comparison's ~1.193 m difference was not a calibrated-content result. The public snapshot supplies the old 8.2 m arm, .3 pitch, world anchor `[0,1,0]`, lens, speed effects and response constants. The remaining orbit difference follows a known algorithm change: old FollowCamera damps the Cartesian eye toward its target; the new strategy damps yaw, pitch and radius separately before composing the arm. In a separately identified no-orbit timeline, the first 80 ticks agree below 4.5e-15 m; after recenter activates, maximum difference is .01730 m / .002075 rad over the full 120 ticks. New recenter integrates only the post-delay fraction of a step, unlike the old full-step update, in addition to polar versus Cartesian arm damping. This isolates the onset to changed camera evaluation; it does not establish complete recenter equivalence.

Old FOV starts from the authored 58 and damps toward preset 55; new document initialization sets 55 immediately. The measured initial difference is 2.714513 degrees and decays to .007065 degrees, consistent with old rate-3 exponential decay (with its small update threshold). This is explicitly an initialization difference, not missing preset data. No physical drift remains unexplained in these input timelines. Full scene/player-feel equivalence and old/new performance equivalence remain unclaimed.

### Inverted mount → public F → walk

Final actual SDK/Rapier browser fixture mounts the car, seeds a pi Z rotation, and lets the real wheel/body simulation settle inverted. It then presses **F through the browser keyboard**, waits for dismount, and presses **W** to walk more than 1 m. No recover command is substituted. Measured vehicle up-Y is below -.9 before F; after dismount and walking the subject center remains inside the viewport and horizon roll is below 1e-6 rad. Three independently inspected frames show the inverted yellow car and red box-body person, the person at the car's side, and the person walking away with a horizontal ground line. These are isolated simplified visual proxies, not GASP animation/material or complete production asset acceptance.

### Warning dispositions

| Observed category | Evidence-based disposition |
|---|---|
| Earlier filtered Rapier cleanup exceptions | Cause remains unattributed. Complete affected files pass; this does not prove the exceptions predate the branch. No suppressor added. |
| Earlier two-worker ephemeral-port / SIGABRT failures | Cause remains unattributed. Final verification uses one worker; not classified as baseline noise. |
| Two ResizeObserver notifications in initial UI inspection | Only tied to that inspection run. Later page-error arrays do not establish root cause or removal. |
| KHR_parallel_shader_compile unsupported | Browser reports missing extension. Rendering completes; shader warmup equivalence/performance is not established. |
| GL ReadPixels GPU-stall | Observed during capture/readback. This identifies the reported operation, not a quantified causal performance regression. |
| Build chunk-size warning | Final editor output exceeds the configured 500 kB warning threshold. Build succeeds; no size/performance acceptance claim. |

### Final identities

The comparison bundles are isolated diagnostic bundles; the following is the separate final Creator runtime prebuild. Runtime file SHA-256 values: `bridge.js`: `8114c055491a42d0bd0249806046808dd341b1796f640164f7e6063ebfa0ebaa`, `three.js`: `07cfce21e8a76b9dd1914ab11cd2fb30e0ac84f05888f5b71e3b497d0f8af18a`, `worldkit-three.js`: `6294b80979e6ec165ad208cf1fc8443cf3678ac549038d4de124367bf41669f7`.

Runtime hash `20f4474eea62e73936e994377f4f5c29fda848d84b02db0355047c9a2461e9da`; manifest SHA-256 `b9a04dc3f0dcd3b67d8dbe5b3b07581e02bb54bd464d2086c0d1fd45a229e8da`.

- `apps/sdk-playground/config/camera.json` SHA-256 `85f4661260b9985d475c4379c78b626f78bfa182073a1e166a08ff9f441ea239`.
- `packages/three-world/src/config/camera/discovery.generated.json` SHA-256 `449d2acbbb2cff939c2c940ee6c83363446be809b418b3b6380d6e658f69df2c`.
- `docs/reviews/2026-09-13-camera-operation-evidence.json` SHA-256 `05c0af98a92e03f239a91454ad128401ae224847f1c23ab84c1a10a4f01c5296`.

The chronological appendix below also includes subsequent whole-branch refinements.

## Retired executor test coverage

These tests exercised deleted executor classes. Their private algorithms are retired; public behavior is covered by the configuration/controller/World consumers below. Native mixed physics/animation tests remain active.

### Concrete replacement groups

Paths below are relative to `packages/three-world/src`, except explicitly identified
Creator tests. This groups related behavior without retaining the deleted executor.

- **G1:** `camera/controller.test.ts`: “activates pending only on meaningful input and keeps candidates out of inspection”, “preserves input on unrelated hot update and rejects deletion or excluded distance atomically”, “interrupts blend from latest fixed result; first-person cuts and same-view does not restart”, “relocation rotates active and dormant views exactly once and reset uses sealed references”, and the new idle-settling activation regressions. Public `camera-public-conformance.test.ts` exercises the same behavior on ordinary, humanoid and mounted fixtures.
- **G2:** `humanoid-runtime/vehicle-camera.test.ts`: “keeps the third-person view through an open cabin while the envelope still stops walking” and “still retracts against a solid vehicle panel across the same viewing path”; `physics.test.ts`: “casts against actual solids, excludes only the target and hidden bodies, and returns zero for initial overlap”; `camera/controller.test.ts`: “pending relocation rebases desired opening rather than the previously retracted eye” and “rebases pending activation from the desired opening rather than a collision-shortened eye”. Existing `camera/constraints.test.ts` covers sweep, recovery and unsolvable rollback.
- **G3:** `camera/strategies/strategies.test.ts`: “keeps the target centered while the arm smooths an orbit”, “retains the last horizon through a vertical first-person sample”, “preserves explicit opening roll through a smoothed orbit”, “smooths explicit yaw, pitch and radius with one arm half-life and preserves the unwrapped path”, and “rejects nonfinite intent and clamps unbounded zoom to a nonnegative distance”; `camera/controller.test.ts`: “recenter advances once before physics and committed intent matches control basis”. Old response-rate channels are converted to explicit half-lives, not required to reproduce the retired double-filter trajectory.
- **G4:** `world.test.ts`: “places a supplied parented follow camera in world coordinates” and “does not retract a follow camera against a hidden child mesh”; `camera-observation.test.ts`: “observes manual local/world camera matrices without mutating them”; `camera/controller.test.ts`: “projects display without committing state or revisions”. Creator `tests/integration/capture.test.ts` retains full renderer/scene restoration and current/opening capture checks.
- **G5:** `input.test.ts`: “zooms the actual Player camera through wheel events, preserving first-person, UI and authored-camera boundaries” and “locks first-person look on click, uses relative movement and clears held input on release”; Creator `tests/integration/custom-vehicle.test.ts`: “observes SDK first-person clipping as partial and restores full rider checks on return”; `humanoid-runtime/flying-creature-visual.test.ts` keeps all eleven actual Source101 eye/orbit/flight cases. Local eye geometry now belongs to CharacterOptions, and cycling requires explicit view IDs.

| Retired test | Current coverage / disposition |
| --- | --- |
| camera.test.ts: moves a pending opening with the newly mounted subject before first movement | G1 — lifecycle and transactional admission. |
| camera.test.ts: keeps a dismounted actor in frame without adopting the obstructed vehicle camera (obstructed %s) | G2 — shared constraints and real geometry; old heuristic/executor implementation retired. |
| camera.test.ts: keeps authored horizon roll through mount retargeting and pitch orbit (roll %s) | G3 — angular/position channels; old double damping and inferred Euler branches intentionally retired. |
| camera.test.ts: keeps a rolled zero-arm declarative opening under a transformed camera parent | G4 — real parent transforms and read-only observation. |
| camera.test.ts: applies declarative framing once, preserves first input and smoothly recenters after manual orbit | G3 — angular/position channels; old double damping and inferred Euler branches intentionally retired. |
| camera.test.ts: marks follow-only diagnostics not applicable after returning to authored camera | G1 — lifecycle and transactional admission. |
| camera.test.ts: activates pending follow from the same jump edge used by locomotion | G1 — lifecycle and transactional admission. |
| camera.test.ts: restores only the near plane owned by first person and keeps pending author edits | G5 — named views, declared eyes, input permission and temporary visibility; numeric aliases retired. |
| camera.test.ts: does not seal a temporary pre-start perspective as the configured reset default | G5 — named views, declared eyes, input permission and temporary visibility; numeric aliases retired. |
| camera.test.ts: uses a local nonhuman eye, preserves third-person distance and resets the configured default | G1 — lifecycle and transactional admission. |
| camera.test.ts: allows programmatic nonhuman perspectives with shortcut disabled and preserves authored ownership | G5 — named views, declared eyes, input permission and temporary visibility; numeric aliases retired. |
| camera.test.ts: retains ordinary camera key edges between fixed ticks and drops them on stop | G1 — lifecycle and transactional admission. |
| camera.test.ts: keeps the nonhuman eye on the safe side of a real thin wall | G2 — shared constraints and real geometry; old heuristic/executor implementation retired. |
| camera.test.ts: inherits the final authored pose when camera composition changes while follow is pending | G1 — lifecycle and transactional admission. |
| camera.test.ts: keeps running after a legal short teleport across close parallel walls | G2 — shared constraints and real geometry; old heuristic/executor implementation retired. |
| camera.test.ts: adopts an off-center opening pose without requiring a second orbit configuration | G3 — angular/position channels; old double damping and inferred Euler branches intentionally retired. |
| camera.test.ts: keeps the subject framing when a tall visual target is retracted by real scenery | G1 — lifecycle and transactional admission. |
| camera.test.ts: uses separate smoothing memory per rig and restores it on reset | G1 — lifecycle and transactional admission. |
| camera.test.ts: rotates throughout an authored handoff instead of snapping on the final tick | G1 — lifecycle and transactional admission. |
| camera.test.ts: bounds a long camera arm recovery in meters per second | G1 — lifecycle and transactional admission. |
| camera.test.ts: preserves the exact authored opening until first input and transitions on that same camera | G1 — lifecycle and transactional admission. |
| camera.test.ts: updates the desired movement basis before changing the rendered pose | G1 — lifecycle and transactional admission. |
| camera.test.ts: does not consume orbit or zoom in authored mode and reacquires from the current pose | G3 — angular/position channels; old double damping and inferred Euler branches intentionally retired. |
| camera.test.ts: uses a real volume probe at a wall corner and retracts without a minimum unsafe arm | G2 — shared constraints and real geometry; old heuristic/executor implementation retired. |
| camera.test.ts: prioritizes immediate safety over the first-frame transition | G2 — shared constraints and real geometry; old heuristic/executor implementation retired. |
| camera.test.ts: holds small obstruction-edge changes, then smoothly recovers after release | G2 — shared constraints and real geometry; old heuristic/executor implementation retired. |
| camera.test.ts: smooths zoom changes separately from an obstruction safety contraction | G2 — shared constraints and real geometry; old heuristic/executor implementation retired. |
| camera.test.ts: has the same fixed-tick result under 30, 60 and 120 Hz render schedules | G1 — lifecycle and transactional admission. |
| camera.test.ts: keeps wall-release recovery consistent across elapsed-time step sizes | G2 — shared constraints and real geometry; old heuristic/executor implementation retired. |
| camera.test.ts: immediately handles a suddenly appearing wall without sharing state between rigs | G2 — shared constraints and real geometry; old heuristic/executor implementation retired. |
| camera.test.ts: restores projection, camera parent, mode, options, and pending state on reset | G4 — real parent transforms and read-only observation. |
| camera.test.ts: supports manually managed camera matrices under a rotated parent | G4 — real parent transforms and read-only observation. |
| camera.test.ts: rejects invalid options and inputs without mutating the prior camera or rig state | G1 — lifecycle and transactional admission. |
| camera.test.ts: reacquires setup-time pose and projection edits when pending follow activates | G1 — lifecycle and transactional admission. |
| camera.test.ts: smooths ordinary target translation without inheriting subject rotation or changing orientation | G1 — lifecycle and transactional admission. |
| camera.test.ts: allows zero follow damping and preserves translated subject screen composition | G3 — angular/position channels; old double damping and inferred Euler branches intentionally retired. |
| camera.test.ts: uses the intended off-center view for movement and keeps user orbit after input ends | G3 — angular/position channels; old double damping and inferred Euler branches intentionally retired. |
| camera.test.ts: preserves distant and polar authored arms on empty input and allows deliberate zoom | G1 — lifecycle and transactional admission. |
| camera.test.ts: does not jump to legacy pitch limits when the first orbit input reaches an authored pole | G3 — angular/position channels; old double damping and inferred Euler branches intentionally retired. |
| camera.test.ts: preserves a zero-length authored arm without forcing an offset or invalid orientation | G1 — lifecycle and transactional admission. |
| camera.test.ts: retains explicit legacy target intent and allows a distinct preservation pivot | G1 — lifecycle and transactional admission. |
| camera.test.ts: keeps angular framing during real-wall retraction without changing the baseline probe policy | G2 — shared constraints and real geometry; old heuristic/executor implementation retired. |
| camera.test.ts: discards damping when a legal target teleport crosses a wall or a corner | G3 — angular/position channels; old double damping and inferred Euler branches intentionally retired. |
| camera.test.ts: resets pending preserve-follow under a rotated scaled parent and reacquires another target | G4 — real parent transforms and read-only observation. |
| camera.test.ts: rejects conflicting preservation options and invalid pending poses before authority changes | G1 — lifecycle and transactional admission. |
| camera.test.ts: has equivalent follow damping across elapsed-time steps without advancing on zero time | G3 — angular/position channels; old double damping and inferred Euler branches intentionally retired. |
| camera.test.ts: keeps target damping isolated between rigs and restores its initial memory | G3 — angular/position channels; old double damping and inferred Euler branches intentionally retired. |
| camera.test.ts: rotates throughout a legacy authored transition instead of snapping on its final tick | G1 — lifecycle and transactional admission. |
| camera.test.ts: inherits an off-center authored opening without a push-in when follow activates | G1 — lifecycle and transactional admission. |
| camera.test.ts: uses independent damping settings for preserving the opening and targeting the subject | G3 — angular/position channels; old double damping and inferred Euler branches intentionally retired. |
| camera.test.ts: keeps target framing on its own damping default and explicit target override | G3 — angular/position channels; old double damping and inferred Euler branches intentionally retired. |
| camera.test.ts: retains authored roll after camera.up changes and applies orbit in the same world-up frame | G3 — angular/position channels; old double damping and inferred Euler branches intentionally retired. |
| camera.test.ts: preserves orientation while the shared decollider retracts from the body pivot of a tall visual target | G2 — shared constraints and real geometry; old heuristic/executor implementation retired. |
| camera.test.ts: observes manual local/world camera matrices without mutating them | G4 — canonical observation and matching presentation samples. |
| camera-subject.test.ts: translates parented framing to the new subject while retaining orbit and lens (pending=%s) | G4 — real parent transforms and read-only observation. |
| camera-subject.test.ts: accepts a logical controlled target whose actual mounted subject changes | G3 — angular/position channels; old double damping and inferred Euler branches intentionally retired. |
| camera-subject.test.ts: retains user orbit and lens across target-framed subject changes: %s | G3 — angular/position channels; old double damping and inferred Euler branches intentionally retired. |
| camera-subject.test.ts: rejects missing follow and invalid samples without replacing the current follow state | G1 — lifecycle and transactional admission. |
| camera-subject.test.ts: uses the same subject collision policy for fixed and display poses without committing display state | G2 — shared constraints and real geometry; old heuristic/executor implementation retired. |
| camera-subject.test.ts: display projections cannot advance collision recovery relative to a rig with no display reads | G4 — canonical observation and matching presentation samples. |

The old config schema/roll tests in `config/configuration.test.ts` are replaced by `config/camera/contract.test.ts` and `camera/strategies/strategies.test.ts`; shadow tests remain. The old typed adapter-source test now checks actual `WorldCameraSubjects.sample` and `sampleHumanoidCameraSubject`. The temporary re-adoption adapter test is covered by the active editing-session opening/adoption tests. The no-op example `opening-camera.ts` wrapper was retired; its browser test now installs the complete document directly and still exercises SDK input, UI focus, pause, reset and Episode ownership.


### Earlier native test migrations (Task 4)

The mapping below follows the approved three classes: retired private implementation assertions (covered by existing new mathematical/transaction tests); real public/native contracts moved to the actual World owner; and incompatible old implicit profile rules retired in favor of explicit documents. Mixed physical/animation tests were retained and their camera assertions migrated. Test counts are not a compatibility contract.

- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **uses a committed fallback so an emergency display is independent of earlier render alphas** → Classes 1/2: camera/constraints.test.ts real box retraction, continuous sweep and unsolvable-state rollback tests; camera/controller.test.ts “projects display without committing state or revisions”; native vehicle-camera.test.ts solid/open cabin pair; camera-world-integration.test.ts target-specific raw geometry, postphysics failure and repeated shared display tests. Old capsule-visibility heuristic is replaced by explicit preserve-framing versus require-line-of-sight.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **keeps humanoid collision recovery independent of display frequency and other worlds** → Classes 1/2: camera/constraints.test.ts real box retraction, continuous sweep and unsolvable-state rollback tests; camera/controller.test.ts “projects display without committing state or revisions”; native vehicle-camera.test.ts solid/open cabin pair; camera-world-integration.test.ts target-specific raw geometry, postphysics failure and repeated shared display tests. Old capsule-visibility heuristic is replaced by explicit preserve-framing versus require-line-of-sight.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **projects camera snapshots onto canonical tuning fields and rejects distance as tuning** → Class 3: implicit old profile/implementation policy retired. Explicit replacement: camera-world-integration.test.ts “keeps an explicit target independent of the controlled actor and routes all named views”; camera-public-conformance.test.ts “adopts a normalized document and atomically updates the single World camera”; runtime.test.ts explicit default-view/keyboard-permission test. Legacy advisory framing remains marked not applicable, never reported as applied or visually passed.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **clips a shoulder offset before it enters a narrow wall, while still retracting for a real obstruction** → Classes 1/2: camera/constraints.test.ts real box retraction, continuous sweep and unsolvable-state rollback tests; camera/controller.test.ts “projects display without committing state or revisions”; native vehicle-camera.test.ts solid/open cabin pair; camera-world-integration.test.ts target-specific raw geometry, postphysics failure and repeated shared display tests. Old capsule-visibility heuristic is replaced by explicit preserve-framing versus require-line-of-sight.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **inherits character translation without stretching the follow arm or changing FOV** → Class 2: camera-public-conformance.test.ts preserved opening, first input, real mount handoff, obstruction recovery and reset; camera-world-integration.test.ts same-ID relocation, actual override activation and manual-mount reset; camera/controller.test.ts “relocation rotates active and dormant views exactly once and reset uses sealed references”.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **preserves pointer orbit direction, character pitch limits and manual recenter grace** → Classes 1/2: camera/strategies/strategies.test.ts “keeps zoom, arm and speed effects separate and explicit” and “rotates subject-up arms and first-person roll only by their declared semantics”; camera-world-integration.test.ts “activates pending follow from the actual override and consumes pointer deltas once across substeps”; eleven real flying-creature-visual.test.ts eye/view/orbit/flight cases.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **sweeps the actual camera trajectory instead of teleporting through a pillar during orbit** → Classes 1/2: camera/constraints.test.ts real box retraction, continuous sweep and unsolvable-state rollback tests; camera/controller.test.ts “projects display without committing state or revisions”; native vehicle-camera.test.ts solid/open cabin pair; camera-world-integration.test.ts target-specific raw geometry, postphysics failure and repeated shared display tests. Old capsule-visibility heuristic is replaced by explicit preserve-framing versus require-line-of-sight.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **uses the same camera collision policy for interpolated $name and exact capture** → Classes 1/2: camera/constraints.test.ts real box retraction, continuous sweep and unsolvable-state rollback tests; camera/controller.test.ts “projects display without committing state or revisions”; native vehicle-camera.test.ts solid/open cabin pair; camera-world-integration.test.ts target-specific raw geometry, postphysics failure and repeated shared display tests. Old capsule-visibility heuristic is replaced by explicit preserve-framing versus require-line-of-sight.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **still keeps the camera sphere out of geometry when the capsule is partly visible** → Classes 1/2: camera/constraints.test.ts real box retraction, continuous sweep and unsolvable-state rollback tests; camera/controller.test.ts “projects display without committing state or revisions”; native vehicle-camera.test.ts solid/open cabin pair; camera-world-integration.test.ts target-specific raw geometry, postphysics failure and repeated shared display tests. Old capsule-visibility heuristic is replaced by explicit preserve-framing versus require-line-of-sight.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **keeps full framing when only the $name blocks the centre ray** → Classes 1/2: camera/constraints.test.ts real box retraction, continuous sweep and unsolvable-state rollback tests; camera/controller.test.ts “projects display without committing state or revisions”; native vehicle-camera.test.ts solid/open cabin pair; camera-world-integration.test.ts target-specific raw geometry, postphysics failure and repeated shared display tests. Old capsule-visibility heuristic is replaced by explicit preserve-framing versus require-line-of-sight.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **keeps seat look independent of steering and inherits vehicle rotation exactly once** → Classes 1/2: camera/strategies/strategies.test.ts “keeps zoom, arm and speed effects separate and explicit” and “rotates subject-up arms and first-person roll only by their declared semantics”; camera-world-integration.test.ts “activates pending follow from the actual override and consumes pointer deltas once across substeps”; eleven real flying-creature-visual.test.ts eye/view/orbit/flight cases.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **uses a zero-arm posture eye for first person and restores third person on reset** → Class 2: actual on-foot Source101 plus mounted Creator vehicle-seating.test.ts; camera-world-integration.test.ts explicit ordinary eye/transform/missing-eye admission and named views; eleven flying-creature-visual.test.ts real eye/shoulder/render transactions. Old numeric offsets or capsule-inferred eyes are not retained as the source of actual animated eyes.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **retracts the shoulder arm against a wall and restores it after leaving** → Classes 1/2: camera/constraints.test.ts real box retraction, continuous sweep and unsolvable-state rollback tests; camera/controller.test.ts “projects display without committing state or revisions”; native vehicle-camera.test.ts solid/open cabin pair; camera-world-integration.test.ts target-specific raw geometry, postphysics failure and repeated shared display tests. Old capsule-visibility heuristic is replaced by explicit preserve-framing versus require-line-of-sight.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **uses the swimming posture eye for shoulder framing after real water entry** → Class 2: actual on-foot Source101 plus mounted Creator vehicle-seating.test.ts; camera-world-integration.test.ts explicit ordinary eye/transform/missing-eye admission and named views; eleven flying-creature-visual.test.ts real eye/shoulder/render transactions. Old numeric offsets or capsule-inferred eyes are not retained as the source of actual animated eyes.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **does not treat deliberate shoulder offsets as invalid configuration or a passed visual review** → Class 3: implicit old profile/implementation policy retired. Explicit replacement: camera-world-integration.test.ts “keeps an explicit target independent of the controlled actor and routes all named views”; camera-public-conformance.test.ts “adopts a normalized document and atomically updates the single World camera”; runtime.test.ts explicit default-view/keyboard-permission test. Legacy advisory framing remains marked not applicable, never reported as applied or visually passed.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **samples framing from the displayed camera time without changing collision recovery** → Classes 1/2: camera/constraints.test.ts real box retraction, continuous sweep and unsolvable-state rollback tests; camera/controller.test.ts “projects display without committing state or revisions”; native vehicle-camera.test.ts solid/open cabin pair; camera-world-integration.test.ts target-specific raw geometry, postphysics failure and repeated shared display tests. Old capsule-visibility heuristic is replaced by explicit preserve-framing versus require-line-of-sight.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **reports shoulder offset framing while preserving configured camera behavior (mounted=%s)** → Class 3: implicit old profile/implementation policy retired. Explicit replacement: camera-world-integration.test.ts “keeps an explicit target independent of the controlled actor and routes all named views”; camera-public-conformance.test.ts “adopts a normalized document and atomically updates the single World camera”; runtime.test.ts explicit default-view/keyboard-permission test. Legacy advisory framing remains marked not applicable, never reported as applied or visually passed.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **replaces overview with a near right-shoulder camera, keeps actor translation and recovers speed framing** → Classes 1/2: camera/strategies/strategies.test.ts “keeps zoom, arm and speed effects separate and explicit” and “rotates subject-up arms and first-person roll only by their declared semantics”; camera-world-integration.test.ts “activates pending follow from the actual override and consumes pointer deltas once across substeps”; eleven real flying-creature-visual.test.ts eye/view/orbit/flight cases.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **uses meters for the mounted nominal arm distance** → Classes 1/2: camera/strategies/strategies.test.ts “keeps zoom, arm and speed effects separate and explicit” and “rotates subject-up arms and first-person roll only by their declared semantics”; camera-world-integration.test.ts “activates pending follow from the actual override and consumes pointer deltas once across substeps”; eleven real flying-creature-visual.test.ts eye/view/orbit/flight cases.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **keeps a configured zero vehicle arm finite for meter-based zoom** → Classes 1/2: camera/strategies/strategies.test.ts “keeps zoom, arm and speed effects separate and explicit” and “rotates subject-up arms and first-person roll only by their declared semantics”; camera-world-integration.test.ts “activates pending follow from the actual override and consumes pointer deltas once across substeps”; eleven real flying-creature-visual.test.ts eye/view/orbit/flight cases.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **looks almost straight up with real pointer input in mode %s without crossing the floor or flipping** → Class 2: camera-public-conformance.test.ts preserved opening, first input, real mount handoff, obstruction recovery and reset; camera-world-integration.test.ts same-ID relocation, actual override activation and manual-mount reset; camera/controller.test.ts “relocation rotates active and dormant views exactly once and reset uses sealed references”.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **uses radians for pointer pitch in camera mode %s on foot and mounted** → Classes 1/2: camera/strategies/strategies.test.ts “keeps zoom, arm and speed effects separate and explicit” and “rotates subject-up arms and first-person roll only by their declared semantics”; camera-world-integration.test.ts “activates pending follow from the actual override and consumes pointer deltas once across substeps”; eleven real flying-creature-visual.test.ts eye/view/orbit/flight cases.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **applies explicit humanoid FOV %s without a distance override and preserves it across reset/map** → Class 2: camera-public-conformance.test.ts preserved opening, first input, real mount handoff, obstruction recovery and reset; camera-world-integration.test.ts same-ID relocation, actual override activation and manual-mount reset; camera/controller.test.ts “relocation rotates active and dormant views exactly once and reset uses sealed references”.
- `packages/three-world/src/humanoid-runtime/runtime.test.ts` — **applies explicit humanoid response and collision radius independently of distance** → Classes 1/2: camera/constraints.test.ts real box retraction, continuous sweep and unsolvable-state rollback tests; camera/controller.test.ts “projects display without committing state or revisions”; native vehicle-camera.test.ts solid/open cabin pair; camera-world-integration.test.ts target-specific raw geometry, postphysics failure and repeated shared display tests. Old capsule-visibility heuristic is replaced by explicit preserve-framing versus require-line-of-sight.
- `packages/three-world/src/humanoid-runtime/vehicle-camera.test.ts` — **discovers a vehicle model attached after runtime initialization and keeps display projection deterministic** → Class 2: mounted-presentation.test.ts actual World transactions and camera-world-integration.test.ts “uses the same cut for actor presentation and camera, without advancing commits” plus “corrects the display anchor without cancelling nonzero fixed smoothing or advancing state”.
- `packages/three-world/src/humanoid-runtime/vehicle-camera.test.ts` — **holds a dragon camera arm across a brief clear gap and recovers without a pop** → Classes 1/2: camera/constraints.test.ts real box retraction, continuous sweep and unsolvable-state rollback tests; camera/controller.test.ts “projects display without committing state or revisions”; native vehicle-camera.test.ts solid/open cabin pair; camera-world-integration.test.ts target-specific raw geometry, postphysics failure and repeated shared display tests. Old capsule-visibility heuristic is replaced by explicit preserve-framing versus require-line-of-sight.
- `packages/creator-host/tests/integration/preset-workspace.test.ts` — **uses the authored indoor camera default while keeping explicit distance edits across maps** → Class 3: implicit old profile/implementation policy retired. Explicit replacement: camera-world-integration.test.ts “keeps an explicit target independent of the controlled actor and routes all named views”; camera-public-conformance.test.ts “adopts a normalized document and atomically updates the single World camera”; runtime.test.ts explicit default-view/keyboard-permission test. Legacy advisory framing remains marked not applicable, never reported as applied or visually passed.
- `packages/creator-host/tests/integration/preset-workspace.test.ts` — **keeps camera distance outside camera tuning across profile edits and reset** → Class 3: implicit old profile/implementation policy retired. Explicit replacement: camera-world-integration.test.ts “keeps an explicit target independent of the controlled actor and routes all named views”; camera-public-conformance.test.ts “adopts a normalized document and atomically updates the single World camera”; runtime.test.ts explicit default-view/keyboard-permission test. Legacy advisory framing remains marked not applicable, never reported as applied or visually passed.
- `packages/three-world/src/humanoid-runtime/humanoid-camera-opening.test.ts` — **retargets a pending opening through actual programmatic boarding before first movement** → Class 2: camera-public-conformance.test.ts preserved opening, first input, real mount handoff, obstruction recovery and reset; camera-world-integration.test.ts same-ID relocation, actual override activation and manual-mount reset; camera/controller.test.ts “relocation rotates active and dormant views exactly once and reset uses sealed references”.
- `packages/three-world/src/humanoid-runtime/humanoid-camera-opening.test.ts` — **preserves target-framed orbit and zoom through actual boarding and exit** → Classes 1/2: camera/strategies/strategies.test.ts “keeps zoom, arm and speed effects separate and explicit” and “rotates subject-up arms and first-person roll only by their declared semantics”; camera-world-integration.test.ts “activates pending follow from the actual override and consumes pointer deltas once across substeps”; eleven real flying-creature-visual.test.ts eye/view/orbit/flight cases.
- `packages/three-world/src/humanoid-runtime/humanoid-camera-opening.test.ts` — **keeps the legacy first-key mode-zero handoff pending until real controls, including override input** → Class 3: implicit old profile/implementation policy retired. Explicit replacement: camera-world-integration.test.ts “keeps an explicit target independent of the controlled actor and routes all named views”; camera-public-conformance.test.ts “adopts a normalized document and atomically updates the single World camera”; runtime.test.ts explicit default-view/keyboard-permission test. Legacy advisory framing remains marked not applicable, never reported as applied or visually passed.
- `packages/three-world/src/humanoid-runtime/humanoid-camera-opening.test.ts` — **shares fixed state with presentation without letting captures change the next simulation result** → Class 2: mounted-presentation.test.ts actual World transactions and camera-world-integration.test.ts “uses the same cut for actor presentation and camera, without advancing commits” plus “corrects the display anchor without cancelling nonzero fixed smoothing or advancing state”.
- `packages/three-world/src/humanoid-runtime/humanoid-camera-opening.test.ts` — **starts display interpolation from the final authored frame when the first tick activates follow** → Class 2: mounted-presentation.test.ts actual World transactions and camera-world-integration.test.ts “uses the same cut for actor presentation and camera, without advancing commits” plus “corrects the display anchor without cancelling nonzero fixed smoothing or advancing state”.
- `packages/three-world/src/humanoid-runtime/humanoid-camera-opening.test.ts` — **uses capsule visibility for an inherited opening behind a narrow obstruction** → Classes 1/2: camera/constraints.test.ts real box retraction, continuous sweep and unsolvable-state rollback tests; camera/controller.test.ts “projects display without committing state or revisions”; native vehicle-camera.test.ts solid/open cabin pair; camera-world-integration.test.ts target-specific raw geometry, postphysics failure and repeated shared display tests. Old capsule-visibility heuristic is replaced by explicit preserve-framing versus require-line-of-sight.
- `packages/three-world/src/humanoid-runtime/humanoid-camera-opening.test.ts` — **translates inherited framing on a same-subject relocation and restores the sealed pending opening** → Class 2: camera-public-conformance.test.ts preserved opening, first input, real mount handoff, obstruction recovery and reset; camera-world-integration.test.ts same-ID relocation, actual override activation and manual-mount reset; camera/controller.test.ts “relocation rotates active and dormant views exactly once and reset uses sealed references”.
- `packages/three-world/src/humanoid-runtime/humanoid-camera-opening.test.ts` — **activates pending follow from pointer zoom input** → Classes 1/2: camera/strategies/strategies.test.ts “keeps zoom, arm and speed effects separate and explicit” and “rotates subject-up arms and first-person roll only by their declared semantics”; camera-world-integration.test.ts “activates pending follow from the actual override and consumes pointer deltas once across substeps”; eleven real flying-creature-visual.test.ts eye/view/orbit/flight cases.
- `packages/three-world/src/humanoid-runtime/humanoid-camera-opening.test.ts` — **excludes the actual follow subject when its vehicle is not mounted** → Class 2: camera-public-conformance.test.ts preserved opening, first input, real mount handoff, obstruction recovery and reset; camera-world-integration.test.ts same-ID relocation, actual override activation and manual-mount reset; camera/controller.test.ts “relocation rotates active and dormant views exactly once and reset uses sealed references”.
- `packages/three-world/src/humanoid-runtime/humanoid-camera-opening.test.ts` — **honors explicit eye and toggle options without letting profile shortcuts override them** → Class 3: implicit old profile/implementation policy retired. Explicit replacement: camera-world-integration.test.ts “keeps an explicit target independent of the controlled actor and routes all named views”; camera-public-conformance.test.ts “adopts a normalized document and atomically updates the single World camera”; runtime.test.ts explicit default-view/keyboard-permission test. Legacy advisory framing remains marked not applicable, never reported as applied or visually passed.


Task 4 transitional notes in this ledger are historical: Task 11 removes the legacy advisory/profile schema entirely. The replacement cases and physical/animation assertions remain active; final entry points use CameraDocument and named views.

## 实施裁决与代价（按记录顺序）

以下 35 项对应实施台账中的全部 `Ruling:` 记录。它们补足设计落地时的具体边界；阶段性兼容安排必须在最终清理中结束，不能视为永久双轨实现。

| 编号 | 裁决 | 若判断不合适的代价 / 边界 |
| --- | --- | --- |
| R01 配置具体形状 | 角度范围使用 bounded/unbounded 标签；framing 仅保存 kind；局部锚点用 positionMetersXYZ；未指定视图时取 document.defaultViewId。 | 若形状需要调整，新 JSON 和下游类型要一并迁移。 |
| R02 保留开场的角度范围 | preserve-opening 默认不限制角度；显式范围与开场几何冲突时拒绝安装。 | 与旧默认转动范围可能不同，已有显式边界可能需要重调。 |
| R03 轨道状态 | 显式平滑参考系中的 yaw、pitch、radius，并共同生成机位与朝向。 | 阻尼轨迹会变化，需要重新对照部分手感。 |
| R04 意图时序 | 回正等意图只在明确的准备阶段积分，姿态求解只消费准备后的意图。 | 内部策略接口及测试要同步调整。 |
| R05 检查点身份 | 恢复姿态、意图与求解历史，但提交编号保持递增；规范文档变化才推进配置编号，帧身份同步更新。 | 恢复后的内容可相同，编号不能再要求逐字节相同。 |
| R06 作者机位规范化 | 缺失默认 opening 的显式采用，在独立候选文档中补齐后再解析、求解与哈希。 | 后续编辑要使用规范文档；源文件哈希与文档哈希不能混用。 |
| R07 旧测试退役 | 删除旧执行器算法专属测试，将仍有效的行为迁到真实 World/native 契约测试，并保留覆盖映射及物理动画断言。 | 映射不完整可能漏掉行为，必须由最终审查核对。 |
| R08 普通主体眼位 | 普通物体角色显式提供 eyePositionLocalMetersXYZ，按真实模型 TRS 转换一次；原生人物继续采用实际动画/姿势眼位。 | 新增公开字段及发现接口需要配套迁移；不能由身体高度猜测眼位。 |
| R09 作者镜头重定位 | 同一控制器内部 commitAuthoredPose 只提交当前姿态和编号，不改文档或基线，也不读取外部相机。 | 该内部入口需验证失败原子性及重置基线保持。 |
| R10 显示锚点补偿 | 固定帧保存只读主体事实；显示阶段只补偿实际显示锚点与同一插值上下文固定锚点的差值，再做无状态安全投影。 | 显示偏移可能变化，需验证真实眼位、重复观察和非零平滑；显示不得推进时钟或阻尼。 |
| R11 避障探测起点 | 使用声明身体高度范围的中点；无身体事实才用主体原点。车辆范围包含包络中心偏移。 | 净空和身体比例效果可能变化，需与真实车厢/身体变换对照。 |
| R12 首次采用与激活 | 默认 preserve-opening 的首次采用同时支持 immediate 和 on-input，使用相同规范化及零时安全检查。 | 首次安装的接受范围扩大；不扩展到不相关的 look-at/第一人称采用。 |
| R13 开场草稿接口 | createOpeningDraft 明确指定 viewId，消费当前已提交机位或独立预览数据，由 SDK 转回初始参考；只返回冻结草稿。 | 维护接口及 UI 必须配套；不自动应用、提交基线或清除冲突覆盖。 |
| R14 编辑前置基线 | beginCameraEdit 要求已有正常封存的相机基线，不因打开面板就封存人物或 World。 | 编辑器必须等待正常初始准备完成。 |
| R15 仅撤销配置 | 使用单个内部恢复候选保留当前合法意图、视图与模式；不通过两次提交或公开兼容开关模拟撤销。 | 不相容状态会产生冲突，需要明确处理而非强行恢复。 |
| R16 初始参考归属 | 初始参考关联只来自真实首次安装或受控重置，复用 World 生命周期与主体世代；同 ID 替换不能借用旧参考。 | 重定向或替换后可能更严格地拒绝编辑/捕获。 |
| R17 Episode 声明与当前值 | 声明视图、默认视图和配置身份来自封存基线；当前状态单独报告。无文档作者镜头不虚构视图；已知文档作者镜头省略选择仍保持作者模式；显式选择原子激活并重基。受控镜头省略选择使用默认视图且切断过渡。 | v2 需要空视图/空身份语义；骑乘与起点旋转组合必须保留正确朝向和原文档哈希。 |
| R18 原生开场入口过渡 | 保留真实公共原生 prepareEpisodeStart 调用方的同一控制器初始化；Host 内部放置只处理物理位置。 | 过渡包装必须在最终清理时迁移，不能成为第二默认值或协议回退。 |
| R19 规划重试身份 | 按稳定源/提示/修复/路线键冻结首次规划上下文，重试复用原字节和请求身份；新观察不能改写附件。 | 需维护本地冻结上下文的完整性和恢复规则。 |
| R20 Creator 配置发现 | 可信生成器输出 schema、字段元数据和完整源码依赖哈希；Host 只解析 JSON/校验闭包。过期或缺失时明确不可用，保留真实源码声明。 | 修改配置源码后需重新生成派生元数据，不新增生产 Agent 的额外步骤。 |
| R21 命令提交与渲染 | 提交只发布状态；队列命令交给正常外层帧渲染，暂停时独立命令在安全外层渲染。 | 回执/错误时序及暂停渲染需要专门回归，不能削弱重入保护。 |
| R22 内部插值边界 | 仅将 rAF 内部算出的插值比例规范到 [0,1]，对外非法参数仍拒绝，积压模拟时间不丢弃。 | 追帧边界显示样本会变化，但不得增加模拟步或丢时钟债务。 |
| R23 资产 Profile v2 | 只保留操控与包络，采用新浏览器存储空间；旧原始键不动，导出后才能显式迁移。 | 旧浏览器操控值不会自动在新 UI 生效；未导出数据仍未知。 |
| R24 场景配置文件 | 默认及特殊场景使用明确的完整 CameraDocument 和固定 ID；保存精确对应当前文档，没有隐藏的地图覆盖。 | 各场景快照独立，修改一份不会自动更新其他快照。 |
| R25 旧车辆字段分阶段移除 | 曾暂留可选废弃 VehicleSpec.camera 以编译旧模块，但实际标定先迁入文档，最终与旧模块一起删除。 | 暂存类型可能误导，因此不能作为最终交付状态。 |
| R26 人物标定唯一来源 | 通用默认值保持独立；纯 SDK 人物预设/工厂单独保存 .35 俯仰和 .655 身体比例，作用于实际步行主体。内容快照从它派生，车辆不继承人物标定。 | 需要验证新工厂和主体作用域；普通公共 follow 的 4 米/.25 迁移仍要明确。 |
| R27 持久化与面板分阶段 | 将本地保存/构建身份和交互编辑器拆为独立实施与审查阶段，最终清理变为第 11 阶段。 | 增加一个提交/审查边界，产品范围不减少。 |
| R28 Vite 字节身份 | 固定文件的 ?camera-document 适配器从同一 Buffer 生成文档及 fileSha256；只读加载器与本地写服务分开。写服务要求实际回环绑定、同源和会话，构建/网络服务不开放写入。 | 应用与测试加载边界、类型声明和 HMR 恢复需要同步；不改变 SDK 配置格式。 |
| R29 本地文件并发边界 | 同服务按路径串行检查哈希并原子发布；新建用 hard-link/EEXIST，拒绝符号链接并清理暂存文件。 | 不承诺对另一个恶意系统进程提供内核级哈希 CAS；适用于可信本地工作区。 |
| R30 Vite 配置加载 | 开发、构建及维护入口统一使用 configLoader runner，继续通过公开 SDK 导出访问源码。 | 启动命令兼容性发生变化，所有维护入口需要验证。 |
| R31 资产预设发现 | 通过现有 assets_describe 返回选中 CameraPreset 快照、明确引用与来源，绑定进项目文档；不自动应用，不把局部快照标为完整 world-camera。修改独立目录源并同步，导入边界剥离旧 spec.camera，媒体与 ID 保持。 | 新增少量目录引用/发现契约需要维护及实际消费验证；自带 SDK 的兼容性仍未确认，schema 可解析不等于已调好。 |
| R32 键盘切换默认权限 | 人物默认文档声明三种视图，但 cycleViewIds 默认留空；原来显式启用 T 的 Playground/示例文档继续列出三种视图。 | 调用方若要 T 切换必须显式配置，测试和提示也要一致；不恢复旧布尔兼容入口。 |
| R33 首输入连续性 | pending 的 preserve-opening 在首个有效输入前，以控制器保存的未约束待机机位和当前物理主体建立运行参考，再应用本次输入；不读取显示机位，不改原始参考、文档哈希或基线。 | 等待期主体移动后，运行参考会与安装参考不同；需验证移动/环绕/缩放、显式范围失败原子性和 reset，不能靠放宽误差掩盖跳动。 |
| R34 原生输入率迁移 | 通用默认保持 2 rad/s；原生人物工厂及其派生文档显式保存旧水平环绕率 1.2 rad/s，已有项目覆盖保留，不加隐藏轴向比例。两起点逐帧消融已证明这能消除该人物时间线的轨迹与动作差异。 | 原生输入比最初新默认更慢，派生文件哈希会变；旧俯仰率 1 到共用 1.2 的 20% 差异仍需明确，不能宣称双轴完全等价。 |
| R35 实际目标可见性 | 在现有安全求解/无状态投影后的眼位检查真实目标视线，报告 clear/occluded、命中及受限原因；不改变作者意图或增加第二个时序求解器。受遮挡不自动阻断生产，查询失败仍回滚候选。 | 安全机位仍可能被遮挡，不承诺自动绕障；若需主动重新选位，要增加明确的几何策略。未搜索全空间，不能把一次受挡称为无解。未测量也不能报已验证可见。 |

后续澄清也保留如下；其对应的源码行为必须与上面的裁决一起理解：

- **R06/R12 作者机位采用**：重新采用当前作者机位时，由同一个候选同时建立规范初始 opening 与当前运行参考，不从作者模式猜一个新 initialSubject，也不先提交再补第二次重定位。代价是必须严格检查当前/初始主体与骑乘关联；不匹配时明确拒绝。
- **R16 初始参考验证**：基线参数提交校验原初始主体及逻辑目标的世代，即使当前正常骑乘也可提交；采用开场机位则额外要求当前与初始参考能够对应。代价是验证边界更细，骑乘保存和无效默认视图需要分别回归。
- **R15 会话自身的绑定撤销**：会话将 A 改为 B 后，可按当前仍有效的 A 撤销配置，但不恢复旧物理位置；A 被删除/替换或视图不相容时冲突。代价是需要更严格的身份核对和当前主体重新求解。
- **R24 场景与龙变体**：不生成场景×变体的文件组合；选择变体会显式替换当前文档的主体预设引用并嵌入快照，保留项目覆盖，产生待保存草稿。代价是变体选择本身也是配置编辑，HMR/恢复必须显示这份差异，不能误报已采用。

- **R35 实际射线语义**：现有 probe 的 radius=0 明确定义为真实射线，安全臂的半径仍大于零；普通、原生和精细车辆查询复用既有过滤和射线能力。从安全眼位朝目标检测，区分终点表面接触与中途遮挡。代价是使用新可见性目标的自定义 probe 也需支持零半径射线，端点数值边界需要维护；不能用 Ball(0) 或未测量的 clear 代替。

## Independent review status

Task 11 implementation was reviewed across `f9445512..0e10ef8d`. Five important
findings concerned native fallback retirement, moving per-tick/different-start evidence,
rollover-to-dismount evidence, stale README contracts and a wrongly bound example.
Three minor findings concerned unrelated movement-test deletion, warning dispositions
and stale comments. All eight were addressed in `0e10ef8d..485f2541` and independently
re-reviewed with no new Critical/Important findings. The re-review checked all 28
recorded artifact hashes, the 174 old / 195 new bundle-input hashes, raw trajectory
comparisons and the three simplified-geometry rollover frames.

The coordinator independently verified the manifest, bundle and current campus hashes
listed above. Changes after runtime-bearing `fc0e1c8e` through `485f2541` are limited
to two cross-package test files and this verification/evidence data; runtime bytes did
not change. Prior unchanged counterexamples have direct coverage in
`camera/constraints.test.ts` (cut across a wall), `episode.test.ts` (three-second
nondefault prepare and dormant start rebasing), and `camera-world-integration.test.ts`
(shared capture/RAF rewind). This resolves the task review's scoped evidence questions;
that task approval did not imply broad whole-branch approval. The subsequent review
of `285246867..24c01a26` found I1–I4 and M1; the coordinated fixes and current
verification are recorded below. Fresh scoped re-review has now approved those fixes; see the final delivery review.


## Whole-branch coordinated fix wave — current source

This section supersedes earlier final-source/completeness claims. The prior operation
record and its old/new comparison bundles remain historical evidence for their exact
recorded source; they were not rewritten or relabelled as current. The runtime-bearing
fix commit is `dcf8ab85dcdb1a0400753769c91548e1f631a596`, based on reviewed
`24c01a26559e1f06ad13a2c2131819596111cd47`. The following evidence commit changes
only this record. The chronological appendix above contains 35 rulings and five
refinements, including R35's actual ray and endpoint semantics.

### Findings and regressions

| Finding | Current behavior and evidence |
| --- | --- |
| I1 failed fixed tick | World aborts only a prepared, uncommitted camera input candidate at the failure boundary and clears its derived input basis. A throwing real custom movement callback preserves the preceding camera commit, then reset and a new tick succeed. Normal fixed/display reentry checks stay strict. There is no physics rollback claim. RED: reset threw `CAMERA_TRANSACTION_REENTRY`; owner/World followup 57/57 passed. |
| I2 authored Episode placement | Both ordinary and native preparation use the shared World boundary and actual before/after physical subject references. Authored position, look-at, up and complete relative quaternion move together. Native placement stays physical-only. Native authored no-document and retained-document cases each cover two translated/rotated starts twice, release and reset. RED: 13.5422708355 m camera mismatch. An additional tilted ordinary body exposed a yaw-only relocation (1.3571691228 m RED), corrected with the existing complete reference rotation. Final Episode file 17/17 passed. |
| I3 Playground dragon selection/reset | The caller sends only physical fields to native preparation, then selects the current document's declared default view through World. Actual Chromium `playground.selectVehicle('dragon')` first failed with `HUMANOID_PLACEMENT_CAMERA_UNSUPPORTED`; final selection plus two actual `playground.reset()` calls passed, with `third-person` reported, an unmounted person, finite camera state and page-error array `[]`. The maintained smoke script has `--selection-only` for this bounded flow. |
| I4 actual visibility target | The kernel checks a ray from the solved safe eye to the actual unsmoothed subject target. The SDK exposes fixed visibility diagnostics and separate stateless display diagnostics. The real sideways-wall case has lagged pivot x=0.0459439186 and actual target x=4; RED was `phase: clear, limited: false`, now measured occluded/limited with wall identity. Eye safety/history and author intent remain unchanged. Query failure restores the same temporal transaction. |
| M1 desired eye observation | Readonly inspection exposes the last committed unconstrained proposal, including pending activation and blends. Public desired position uses it directly. A real Rapier wall returned actual z=2.7500051975 while incorrectly reporting the same desired eye; now desired z=8. Repeated World snapshot/inspection reads succeed with the geometry query configured to throw if observation attempts another solve. |

R35 adds a narrow query contract: positive radius is a sphere sweep; radius zero is
a real ray. Ordinary queries retain camera visibility/boundary/target filters and
dirty-collider handling; native and refined vehicle queries retain their existing
filters, including transparent glass for the visibility ray. Actual ordinary/native
floor-origin cases rejected the initial conservative sphere approach as occluded;
the final ray accepts a hit only at the target surface, detects a separated wall and
reports an occupied ray origin. Glass RED was 1.9500001669 m blocked travel instead
of the clear 4 m line; existing opaque/transparent part semantics are now preserved.
Safety arm radius remains positive. Optional visibility-target adapters must support
the documented zero-radius operation. Occlusion does not automatically reject a
production run, relocate the camera, prove no other pose exists or claim pixel visibility.

### Final covering checks

- The final combined command below covered 25 files / 403 tests: 402 passed, with
  one obsolete physics assertion still requiring radius zero to reject. That
  assertion was migrated to real ray distance 2.9 m versus sphere distance 2.7 m,
  while retaining negative-radius rejection; the complete physics file then passed
  61/61. This is compositional coverage, not a claim that the original combined run
  was entirely green. No runtime source changed after the combined run.
- The combined checks include real World/Controller/editing/strategies, native runtime,
  real refined vehicle geometry, ordinary physics, public camera conformance,
  authored/named Episode starts, Creator live bridge inspection, the real executable
  relative-JSON camera compiler, Creator vehicle-camera Chromium integration,
  direct schema/discovery consumers, Episode capture/adapter and Playground state.
- `pnpm typecheck`, affected ESLint with `--max-warnings 0`, final physics-fixture
  ESLint, `pnpm test:census` (137 files: 45 contract / 92 resource-heavy), and
  `pnpm verify:workspace-boundaries` (zero registered debt) passed. Typecheck was
  repeated after the final test-fixture change. No configuration/schema bytes changed;
  direct discovery/compiler consumers verified the existing generated source closure.
- `pnpm build:editor` and final-source runtime prebuild passed. The editor still emits
  its greater-than-500-kB chunk warning. Changed README/review local links and
  `git diff --check` pass. Documentation claims are exercised by the consumers above.
- Final actual Playground selection/reset command exited 0. Its screenshot shows the
  visible on-foot person in the dragon training area after reset; it does not show
  a mounted-flight operation or establish all-dragon visuals, FPS or player feel.
- An isolated native-only Episode diagnostic invocation again produced Rapier's
  recursive-use/unsafe-aliasing cleanup error. It remains unattributed; full-file
  runs pass. A temporary I2 expectation incorrectly used the post-step settled actor
  y rather than the admitted pre-step authored reference (0.0150000405 m difference).
  It was corrected to the admitted start with 1e-7 m camera tolerance; no runtime
  physics tolerance was relaxed. Earlier raw failures and warnings remain retained.

Exact combined test command:

```sh
pnpm exec vitest run packages/camera-collision/src packages/three-world/src/camera packages/three-world/src/camera-world-integration.test.ts packages/three-world/src/camera-public-conformance.test.ts packages/three-world/src/camera-observation.test.ts packages/three-world/src/episode.test.ts packages/three-world/src/physics.test.ts packages/three-world/src/humanoid-runtime/runtime.test.ts packages/three-world/src/humanoid-runtime/vehicle-camera.test.ts packages/three-world/src/humanoid-runtime/camera-lifecycle.test.ts packages/three-world/src/humanoid-runtime/humanoid-camera-opening.test.ts packages/creator-host/tests/compiler/camera-configuration.test.ts packages/creator-host/tests/browser/bridge-inspection.test.ts packages/creator-host/tests/integration/vehicle-camera.test.ts packages/creator-host/tests/discovery/camera-configuration.test.ts packages/creator-host/tests/discovery/authoring-schema.test.ts packages/creator-host/tests/discovery/runtime-guidance.test.ts packages/episode-pipeline/tests/capture/capture.test.ts packages/episode-pipeline/tests/integration/adapter.test.ts apps/sdk-playground/src/camera --maxWorkers 1
pnpm exec vitest run packages/three-world/src/physics.test.ts --maxWorkers 1
pnpm exec tsx apps/sdk-playground/scripts/dragon-training-smoke.ts http://127.0.0.1:5193 .codex-tmp/camera-whole-fix/dragon-final --selection-only
pnpm three:creator:prebuild --profile three-sdk --output .codex-tmp/camera-runtime-whole-fix
```

### Current identities and limits

| Identity | Value |
| --- | --- |
| Runtime source commit | `dcf8ab85dcdb1a0400753769c91548e1f631a596` |
| Runtime source commit tree | `39f3a1302c1d6c301843188956099f81c4b17b5d` |
| Creator runtime hash | `e9570fc3eb7533022e5c6ea22d85a4beb5c31ae269f760c082e5c1e025dd672f` |
| Runtime manifest SHA-256 | `b399def95fe8caeea53b26501c5b5f07b0d585ff430cdca58d3d2f8fe0634cc3` |
| worldkit-three.js SHA-256 | `01d29937d667b4923d6e9da4c792ce41773e7d87036cf757cb423081bf80366b` |
| bridge.js SHA-256 | `8114c055491a42d0bd0249806046808dd341b1796f640164f7e6063ebfa0ebaa` |
| three.js SHA-256 | `07cfce21e8a76b9dd1914ab11cd2fb30e0ac84f05888f5b71e3b497d0f8af18a` |
| Current campus file SHA-256 (unchanged) | `85f4661260b9985d475c4379c78b626f78bfa182073a1e166a08ff9f441ea239` |
| Generated discovery SHA-256 (unchanged) | `449d2acbbb2cff939c2c940ee6c83363446be809b418b3b6380d6e658f69df2c` |
| Historical operation JSON SHA-256 (unchanged) | `05c0af98a92e03f239a91454ad128401ae224847f1c23ab84c1a10a4f01c5296` |
| Final dragon selection/reset JSON SHA-256 | `d85487b52202ec1cbf115cfde86f020ffd4ce217eaf06b3804b9d71bbd14f610` |
| Final dragon selection/reset PNG SHA-256 | `33357eb6b974496c2a78a8213a043533bc1990b0167fcbf7c1fdeb7066ca2a73` |

The source change adds actual visibility queries; solver-only timing, allocation/query
benchmarks and exhaustive visual/player-feel acceptance remain unmeasured. The old/new
trajectory comparison above remains tied to its historical runtime; it was not rerun
or promoted into a current-source equivalence claim. Current-source direct browser,
World/native/Episode and compiler checks cover these fixes and their integration.
Cloud transport remains mocked. No production jobs, publication, push or merge were
performed. The coordinator's fresh scoped review subsequently approved all five fixes; see the final delivery review.


## Final delivery review — complete

The broad review of `285246867..24c01a26` confirmed the architecture and found four
important integration defects plus one telemetry defect. The single coordinated fix
wave `24c01a26..af37fd68` addressed all five: aborting failed-tick input candidates,
shared native/ordinary authored Episode relocation, the remaining dragon caller,
actual-target visibility diagnostics and unconstrained desired-position reporting.
A fresh scoped re-review marked every finding **ADDRESSED**, found no new
Critical/Important breakage, and approved local delivery within the evidence limits
above. There are no parked or deferred review findings.

The final review independently checked current bundle/manifest/configuration identities,
actual browser result files and the relevant failing/passing regressions. The coordinator
also verified the current hashes. Runtime-bearing code remains `dcf8ab85`; subsequent
changes record evidence and review completion only. The last affected verification is
compositional: 402/403 tests followed by the complete corrected physics file at 61/61;
all 403 affected tests are covered, without claiming that the original combined run was
green. Required static, boundary, editor build and runtime prebuild checks passed.

Delivery keeps `codex/camera-config-design` and its isolated worktree locally. No push,
merge, deployment or external production job was performed. Task-owned browser services
were stopped. The disposable SDD coordination directory can now be removed: all 35
chronological rulings and five refinements, migration evidence, durable diagnostic
programs and current validation/identity conclusions are retained in tracked records.
Visual/feel/performance limits and the specific R34/R35 tradeoffs remain as stated;
local delivery approval is not a claim of complete production-scene equivalence.
