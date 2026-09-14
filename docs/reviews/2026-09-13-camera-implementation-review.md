# Camera implementation independent review record

Final disposition: **approved for local delivery within the recorded verification limits**.
The first review below applies to `285246867..24c01a26` and found four Important
issues and one Minor issue. All five were addressed in `24c01a26..af37fd68`; the
second, independent scoped review records that resolution. Historical file/line
references belong to their stated reviewed revisions.

The [verification record](2026-09-13-camera-implementation-verification.md) is the
authority for validation identities, migration differences and implementation rulings.
This file preserves the independent review reasoning, not a second configuration guide.

---

# Whole-branch camera implementation review

Reviewed range: `2852468670864e7b829c7f84c0f56f280494f88f` → `24c01a26559e1f06ad13a2c2131819596111cd47`, using the supplied 320-file whole-branch package. Runtime-bearing identity in the verification record is `fc0e1c8ec0017d2dd253b84497459661ba400d07`.

**Ready for local delivery: No — four Important findings and one Minor finding require the coordinated fix wave. No Critical finding.** The main architecture is coherent and substantially implements the reviewed design. The remaining problems are concrete failures at its lifecycle, constraints and consumer boundaries; they do not justify restoring the retired owners or compatibility defaults.

## Scope and method

Read the root and affected package/application instructions, current architecture, reviewed design, implementation plan, global constraints and tracked verification record, including all 34 rulings and four refinements. Used the requested code-reviewer discipline. No subagents, Git diff/log regeneration, source/browser mutations, production jobs, or duplicate regression-suite runs.

The supplied package was assessed in ordered passes:

1. Contract, schema generator, five-layer resolver, serialization and configuration state.
2. Subject adapters, strategies, controller, constraints, presentation, editing and World/native integration.
3. Episode protocol/admission/actions and Creator discovery/compiler/observer consumers.
4. Playground document/editor/file/import paths, content migration and current example/script callers.
5. Behavioral coverage, retirement mapping, durable operation evidence, documentation claims and final integration seams.

The generated Ajv validator and discovery schema were treated as derived output: reviewed their generator, authoritative field definitions, source-closure verification and actual browser/compiler tests, rather than claiming a manual review of 18,341 generated validator lines. Repetitive preset/project/catalog JSON was compacted by structure and field families: 99 presets for 33 subjects, 32 vehicle calibrations, 11 dragon variants, per-project bindings and input rates. All extracted project subject-preset references close over their documents. Repetitive fixture migrations and retired-owner tests were assessed against the replacement behavior families; focused new behavioral test bodies were read for the actual assertions supporting the boundaries below. Truncated architecture-bearing hunks were recovered in smaller reads.

Outside the supplied diff, only named follow-ups were inspected: `world.ts:254` custom movement execution for the failed-tick cleanup risk; the dragon `prepareSelection` call sites; the mounted fixture and controller test setup for narrowly scoped probes; and native `present` context around a cut-off hunk. The supplied tracked operation JSON/harness and its three named rollover PNGs were inspected. No broad repository re-audit was substituted for the package.

Two short in-memory `pnpm exec tsx --input-type=module` invocations investigated uncovered concerns. The first used actual World/Rapier with ordinary and native subjects and a renderer stub for Episode transport; the second used the same real Three Box3/Ray geometry model as the maintained constraint tests. They did not modify source files, launch a browser, or rerun a suite. Results appear with each finding.

## Checked strengths and architectural assessment

- **One runtime owner is real.** `CameraController` owns intent, candidate history, transitions, baseline/checkpoint identity and fixed commits. Strategies return values and never receive a writable main camera. World supplies input before physics and subject facts afterward; `applyCameraPresentation` is the common pose/lens writer. The retired ordinary/native camera classes are removed, and `camera-collision` remains a query/geometry kernel.
- **The configuration contract has a meaningful source of truth.** Resolver order is defaults → view preset → subject preset → project view → project subject. Discriminated branches replace incompatible data, arrays replace atomically, finite JSON is checked before cloning, and own-property reference checks avoid inherited dictionary entries. Canonical hashing excludes unused presets and stays distinct from file bytes. Humanoid calibration is explicitly scoped to the on-foot subject; native orbit rate 1.2 is data, while generic rate remains 2.
- **The editing model preserves ownership.** Expected configuration revision, monotonic commit revision, World/subject generation and baseline identity are distinct. Cancellation can restore a precise checkpoint or undo configuration while preserving subsequent player intent; external configuration/baseline changes conflict. Opening adoption is SDK-owned and does not move the actor baseline. Local saving and HMR do not apply drafts or commit reset state.
- **Host boundaries largely consume the actual contract.** Creator reads generated metadata only after source closure/hash checks, exposes committed inspection on demand and degrades optional inspection locally. The executable relative-JSON compiler test checks source inventory, source-edited runtime, observer output and post-build tampering. Episode uses v2 declarations from the sealed baseline, exact view IDs and transition completion, rejects v1 before planning, and retains the first exact planner context across uncertain retries.
- **Verification is materially stronger than static declarations.** The maintained tests cover actual World/native consumers, cut across a wall, interrupted blends, target generations, pending activation, edit conflicts, fixed/display reentry, capture rewind, first-person eye registration, HTTP conflicts and actual Vite import-byte identity. The recorded old/new harness isolates both SDK and collision sources and uses two distinct starts, per-tick movement/actions and repeated presentation observations. This is relevant evidence, with the gaps below remaining outside those covered cases.

The mainstream design influences are translated into useful boundaries rather than another framework: explicit orbit state, proposal versus constrained state, one coordinating owner, explicit subject events, pure data and a separate independent OrbitControls preview. Retaining narrow SDK strategy math is justified by the documented lack of a complete public camera-controls solver checkpoint. The controller is sizeable, but its responsibilities are supported by focused configuration, lifecycle, constraint and presentation modules; I found no reason to split out another runtime package or introduce a plugin registry.

## Findings

### Critical

None.

### Important

#### I1. Abort an uncommitted camera input candidate when the World tick fails before camera evaluation

**Location:** `packages/three-world/src/engine.ts:384` and `:409`; `packages/three-world/src/camera/controller.ts:111` and `:1258`.

`prepareInput` stores `this.pending` before custom movement and physics execute. If either throws, `fixedStep` stops the World but leaves that candidate alive. `CameraController.reset()` uses `admit(frame, true)`, which still rejects a pending candidate as reentry. A recoverable gameplay/controller failure therefore permanently blocks the documented reset/reprepare recovery path for that World.

**Confirmed through the public API:** an ordinary character's registered movement callback threw once after camera installation and `world.step({}, 0)`. After disabling that throw, `await world.reset()` still failed:

```text
movement_failure: PROBE_MOVEMENT_FAILURE
reset_after_movement_failure: CAMERA_TRANSACTION_REENTRY
```

Add an internal failed-tick/abort operation that discards only the uncommitted camera candidate, and invoke it from the World failure boundary before recovery is possible. Preserve the prior committed camera and do not weaken the normal fixed/display reentry guard or claim physics rollback. Add a World regression for a movement/physics failure before `evaluateAndCommit`, followed by successful reset and another tick. The current postphysics query-failure test (`camera-world-integration.test.ts:82`) exercises the later path, where `evaluateAndCommit` already clears `pending`, so it does not cover this case.

#### I2. Rebase native authored cameras during Episode start placement with an omitted view

**Location:** `packages/three-world/src/engine.ts:350`–`:355`; `packages/three-world/src/world.ts:824`–`:828`.

For an authored baseline, omission deliberately produces `viewId === undefined`. `prepareEpisodeCamera` then only calls `place()`. Ordinary placement has its own authored-pose relocation, but the native branch calls `prepareEpisodeStartOwned`, which is now correctly physical-only; authored mode also skips `syncCameraLifecycle`. Consequently the native actor is relocated while the camera remains at the old world position, and preparation reports success. This breaks the promised relative-authored start semantics and can record an unrelated view at a new start.

**Confirmed through the actual World Episode port:** native authored camera initially `[3,4,8]`, actor initially `[0,.03,0]`; prepare requested `[8,.03,6]` with yaw `π/2`, without `cameraViewId`. Result:

```json
{"before":[3,4,8],"after":[3,4,8],"actor":[8,0.014999959468841473,6],"mode":"authored","viewId":null,"errors":[]}
```

Perform the authored relative-pose candidate in the shared World preparation boundary using the actual before/after subject reference. Keep native placement physical-only and do not reintroduce a fallback camera factory. Cover native authored baselines both without a document and with a retained document, repeated translated/rotated starts, and release/reset semantics. The existing authored Episode tests use the ordinary fixture (`episode.test.ts:57`), which is why they pass while this branch is broken.

#### I3. Migrate the remaining Playground dragon caller of the now physical-only native preparation API

**Location:** `apps/sdk-playground/src/main.ts:596`–`:597`; rejecting contract at `packages/three-world/src/humanoid-runtime/runtime.ts:288`.

`prepareSelection` still constructs `{..., cameraViewId:'third-person'}` and sends it to native `runtime.prepareEpisodeStart`. The final native guard rejects any such field with `HUMANOID_PLACEMENT_CAMERA_UNSUPPORTED`. This path is reached when selecting the dragon and when resetting the dragon-training scene (`main.ts:399`, `:424`, `:534`, `:1517`), so the late API retirement leaves an active Playground flow broken. Structural typing does not reject an extra field carried by this local variable.

The exact argument shape was passed to a real native runtime and rejected with that error before placement. Remove the camera field from the physical call; if this UI action needs to select a view, use the existing World owner with an actual declared view ID. Preserve the new guard. Add a maintained caller-level regression for dragon selection/reset, rather than only testing that the native API rejects the obsolete argument.

#### I4. Enforce line of sight against the actual visibility target, not only the smoothed pivot

**Location:** `packages/three-world/src/camera/constraints.ts:65`–`:81`; producer at `packages/three-world/src/camera/strategies/evaluation.ts:193`–`:213` and `:299`–`:300`.

The strategy distinguishes the unsmoothed subject visibility target from the smoothed framing pivot, but `CameraConstraints.request` never consumes `visibilityTargetWorldMetersXYZ`. `require-line-of-sight` merely enables obstruction handling along pivot→eye. With nonzero translation/anchor smoothing, that segment can be clear while an obstacle blocks eye→actual subject. The declared visibility policy then does no work for its intended target and reports an unrestricted clear solve.

**Confirmed with the real box intersection fixture:** after a subject moves sideways to `[4,0,0]` with a 1 s translation half-life, the committed eye is `[0.045943918588415456,1,8]`, smoothed pivot `[0.045943918588415456,1,0]` and actual visibility target `[4,1,0]`. A wall at x `[1.8,2.2]`, y `[.2,2.2]`, z `[2,6]` blocks the actual sight ray at 3.9361 m; the solver returns `phase:'clear', limited:false, effectiveDistanceMeters:8`.

Carry the actual visibility target into the constraint policy and report or solve its real limitation while keeping collision correction out of author intent. Preserve-framing may accept occlusion as designed; require-line-of-sight must perform the requested subject check. Add a regression where only the actual-subject ray is obstructed and the smoothed pivot arm remains clear, including stateless presentation sampling. Current constraint tests use coincident anchor/pivot targets and cannot detect this omission.

### Minor

#### M1. Preserve desired-position meaning in the public camera snapshot

**Location:** `packages/three-world/src/engine.ts:187`–`:189`.

`cameraSnapshot()` assigns both `desiredPositionWorldMetersXYZ` and `positionWorldMetersXYZ` from the constrained `current` pose. Once collision retracts the camera, consumers receive the actual eye under the desired-position field and lose the proposal-versus-result distinction. This is observable in Creator/Episode summaries and makes obstruction debugging misleading even though rendering still works.

An actual ordinary World with an 8 m intended arm and a wall at z=3 returned desired and actual `[0,1,2.250008058547974]`, while `desiredArmDistanceMeters` remained 8. Expose the last committed unconstrained proposal through a readonly summary and derive the desired position from it; do not reconstruct it with another solve during observation. Assert different desired/actual positions in a wall fixture and unchanged state across repeated reads.

## Rulings, migration and evidence limits

The inspected implementations substantiate the principal rulings: finite tagged data (R01/R02), unwrapped polar history and once-per-step intent (R03/R04), monotonic restoration identity (R05), explicit canonical opening adoption (R06/R12), scoped native calibration and exact import bytes (R26/R28), and no late profile/asset camera authority (R23/R25/R31/R32). The editing/initial-reference refinements have direct ownership checks and actual tests. R33 derives activation from the owner's unconstrained pending pose and current subject while retaining initial references; R34 is an explicit factory/exported-document change, not an axis multiplier. These choices are reasonable on their merits. I2/I3 expose incomplete integration around the R09/R17/R18 boundary; they do not invalidate the physical-only native API decision. I1/I4 are uncovered lifecycle/dataflow cases rather than a reason to relax the design.

The compact data pass found the 33-subject report with 363 converted, 165 retune, 99 equivalent and 33 inactive entries, plus an explicit unknown status for unexported browser profiles. The actual project documents carry referenced snapshots and native rate 1.2; the generic nonhuman document remains separate. The 11 dragon distances are explicit 32–40 m data. This establishes inventoried conversion/closure, not visual acceptance of every preset.

The durable evidence contains eight 120-tick old/new trajectory records across on-foot/mounted and two distinct starts. The generating code uses actual source-specific SDK and collision entry points, matching dependency declarations, fixed input schedules, and repeated fixed presentation observations. It records 174 old and 195 new bundle inputs. Recorded final on-foot position/action differences are zero (velocity floating-point residual below `9e-16`); mounted camera differences reach about `.002363 m` and `.0001138 rad` while physical trajectories/actions match. The 2.7145° initial FOV difference, recenter/polar damping changes and native vertical-rate increase of 20% are explicitly scoped differences, not unreported equivalence claims.

The three inspected rollover images show the inverted proxy car, the person beside it after public F, and walking away with a horizontal ground reference. Their harness uses real keyboard F/W after a seeded inversion. They establish that simplified operation chain, not full production character geometry, animation, material or player-feel acceptance.

The tracked verification reports final affected checks/typecheck/lint/census/workspace boundaries/editor build/runtime prebuild coverage and gives separate final source, manifest, bundle and configuration hashes. Those full checks were not repeated here; coordinator and task-review byte checks remain their stated evidence. The newly reproduced counterexamples mean the existing passing coverage is insufficient for local delivery until fixed. Solver-only performance, query/allocation comparisons, exhaustive asset visuals and full play feel remain unmeasured. Existing warnings retain their documented, unattributed or bounded dispositions; no baseline origin is inferred.

## Delivery recommendation

Keep the current architecture and resolve I1–I4 plus M1 in the single coordinated fix wave. Add the five focused behavioral regressions at their actual owners/consumers, then run only affected verification and the required final-source identity checks for the changed bytes. A scoped re-review should confirm those fixes and their direct integration consequences; another broad review of unchanged parts is unnecessary.


---

## Final scoped re-review — all findings addressed

- **I1 — Abort an uncommitted camera input candidate after a failed World tick: ADDRESSED.** `packages/three-world/src/camera/controller.ts:784` discards only `pending`; the existing busy/pending admission guard at `:111` remains intact. `packages/three-world/src/engine.ts:422` invokes that cleanup and clears the derived basis at the fixed-step failure boundary before recording/stopping/rethrowing. The enclosing camera transaction always releases `busy` in `finally`, so this cleanup does not replace the original failure or weaken reentry checks. The real custom-movement regression at `packages/three-world/src/camera-world-integration.test.ts:204` preserves the previous inspection and then resets and ticks successfully. No physical rollback is claimed.

- **I2 — Rebase native authored Episode starts when the view is omitted: ADDRESSED.** `packages/three-world/src/engine.ts:351` captures the authored pose and actual controlled-subject reference before placement, suppresses intermediate lifecycle sync, and commits the rebased authored pose using the actual post-placement subject. The ordinary-only relocation is removed from `:372`; native placement remains physical-only. The shared call to `relocateCameraProposal(..., 'subject-up')` at `:367` uses the full relative quaternion (`packages/three-world/src/camera/lifecycle.ts:109`), and the constant ordinary semantic-forward correction cancels between the before/after references (`camera/world-subject.ts:27`). Native no-document and retained-document cases cover two translated/rotated starts twice, document identity, release and reset at `packages/three-world/src/episode.test.ts:229`; the tilted ordinary case at `:265` preserves the previous complete authored transform. The maintained assertion correctly distinguishes the admitted placement from the required tick's later physical settling.

- **I3 — Migrate the remaining Playground dragon preparation caller: ADDRESSED.** `apps/sdk-playground/src/main.ts:596` passes only physical placement fields, then selects the installed document's declared default through World at `:598`. Map switching installs that document at `:228`; selection/reset continue through the same caller at `:399` and `:1518`. The native obsolete-field rejection is retained. `apps/sdk-playground/scripts/dragon-training-smoke.ts:37` exercises actual dragon selection and two resets and asserts the declared third-person view, finite eye and no page errors. The saved final browser JSON and screenshot support this bounded flow.

- **I4 — Check the actual visibility target independently of the smoothed pivot: ADDRESSED under approved R35.** `packages/three-world/src/camera/constraints.ts:73` now forwards the actual target only for require-line-of-sight. `packages/camera-collision/src/camera-collision-solver.ts:129` queries from the final spatially solved eye toward that target, with radius zero, and reports measured clear/occluded, travel, blocker and limitation. It keeps the safe eye, intent and temporal solver unchanged; `:134` distinguishes endpoint contact from an intervening hit or occupied origin. `:165` rolls a failing visibility query back with the same solve transaction, while `:152` remains stateless. Fixed diagnostics are committed at `packages/three-world/src/camera/constraints.ts:167`; separate projection diagnostics are returned at `:185`. Ordinary ray filtering and dirty-collider checks remain at `packages/three-world/src/physics.ts:475`; native real-ray filtering at `humanoid-runtime/camera-queries.ts:13` and refined opaque/glass selection at `humanoid-runtime/vehicle-camera-queries.ts:144` use the existing geometry/filter owners. Positive safety radius is still required. The sideways-wall fixed/stateless regressions at `camera/constraints.test.ts:201` and `camera-world-integration.test.ts:234`, ordinary/native endpoint/wall/origin cases at `:251`, and kernel failure rollback at `packages/camera-collision/src/camera-collision-solver.test.ts:97` cover the reported defect and refinement. This is measured visibility, not automatic deocclusion, a global impossibility claim or a production gate.

- **M1 — Preserve desired-position meaning in the public snapshot: ADDRESSED.** `packages/three-world/src/camera/controller.ts:1101` exposes the already committed unconstrained pending pose or base as immutable inspection data; `commitCandidate` stores the actual blended proposal before constraints at `:257`–`:311`. `packages/three-world/src/engine.ts:190` derives desired position from that proposal, independently of the constrained current eye. The wall test at `packages/three-world/src/camera-world-integration.test.ts:221` checks desired z=8 versus actual z<3 and repeated reads while geometry queries throw if called. Observation does not solve or advance state.

- **New Critical/Important breakage in the fix diff: None found.** No second camera writer, temporal solver, search procedure, input owner or configuration authority was introduced. R33/R34 behavior is unchanged by this fix package.

- **Out-of-scope observations: None.** No unchanged subsystem was broadly re-reviewed.

- **Check — scope and authority.** Reviewed supplied `24c01a26559e1f06ad13a2c2131819596111cd47` → `af37fd68d2dd2996dc8744d187917655ba68cd2d` package (19 files, two commits), the prior findings, fix report, global constraints, current architecture and design sections governing proposals, transactions, lifecycle, visibility and Episode placement. Runtime-bearing identity is `dcf8ab85dcdb1a0400753769c91548e1f631a596`; the second commit records evidence only. Applied the supplied scoped re-review template. Consumed the supplied diff in ordered chunks, recovering tool-truncated material; did not regenerate Git diff/log or launch other reviewers.

- **Check — named direct-integration follow-ups.** Inspected unchanged controller admission/transaction/commit and projection context to check failed-input cleanup and proposal semantics; the shared lifecycle and ordinary/native subject adapters to check full quaternion relocation; World Episode dispatch to check omitted-view placement; native camera-host/mesh-ray adapters to check exclusions, scale and real-ray reuse; Playground map/selection/reset call sites to check document availability. These reads address concrete risks introduced by the changed paths.

- **Check — covering test evidence, not repeated suites.** Read the relevant RED failure records and maintained assertions. `whole-fix-final-tests.log:159`–`:160` records 24/25 files and 402/403 tests passing, including World, Controller, native, Episode, Creator browser/compiler/discovery and Playground consumers. The sole failure is the old radius-zero rejection assertion; the supplied diff replaces it with actual ray distance plus negative-radius rejection. `whole-fix-final-physics.log:8`–`:9` then records 61/61 passing. This supports the reported compositional 403-test coverage; it is not an all-green combined-run claim. No additional test or probe was needed after code inspection, and no suite was rerun.

- **Check — static/build evidence.** Read final typecheck, census, workspace-boundary, editor-build and runtime-prebuild logs; census reports 137 files (45 contract, 92 resource-heavy), boundaries report zero debt, editor build completes with its retained >500 kB warning, and prebuild reports the stated runtime hash. The fix report supplies exact commands and zero-exit claims for the silent ESLint/browser logs; those exit statuses were not independently recreated.

- **Check — artifact identity.** Independently computed and matched all nine supplied file SHA-256 values: current prebuild manifest and three bundles, campus configuration, generated discovery, historical operation JSON, and final dragon selection/reset JSON and PNG. The actual manifest contains runtime hash `e9570fc3eb7533022e5c6ea22d85a4beb5c31ae269f760c082e5c1e025dd672f`; manifest SHA-256 is `b399def95fe8caeea53b26501c5b5f07b0d585ff430cdca58d3d2f8fe0634cc3`, and worldkit-three.js SHA-256 is `01d29937d667b4923d6e9da4c792ce41773e7d87036cf757cb423081bf80366b`. Parsed the saved browser result: selected/reset training map, controlled person, unmounted, third-person view and page errors `[]`. Inspected the final PNG: visible on-foot person in the training area. This does not assert mounted flight or all-asset visuals.

- **Check — evidence scope.** Tracked verification marks the latest fix wave as superseding older final-source claims, preserves historical trajectory evidence under its original identities, and contains one chronological appendix with 35 rulings and five refinements. The R35 ray refinement is also recorded in progress. No old/new trajectories were regenerated or relabelled as current-runtime equivalence. Solver/query/allocation performance, pixel visibility and player feel remain unmeasured; the isolated native-only Rapier cleanup error remains unattributed as documented.

- **Check — mutation boundary.** Source, Git, services and browser state remained read-only. Only this requested report was written; no browser/service launch, heavy loop, external job, publication, push or merge occurred.

- **Fix round: All I1/I2/I3/I4/M1 findings ADDRESSED; no new Critical/Important breakage found. Ready for local delivery after this scoped re-review: YES, within the explicit evidence and acceptance limits above.**
