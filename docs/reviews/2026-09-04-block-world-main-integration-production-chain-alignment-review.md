# `block-world-main-integration` production-chain alignment review

## 1. Review metadata

2026-09-05 CF-19/29 correction: the latest local 054 r2 ended at Native TypeScript rejection,
not successful production. The old Builder's real compiler feedback was not fully reproduced by the
Native shape/identity self-check. Current scoped changes add a frozen same-policy semantic compiler,
actionable bounded diagnostics, and shared Profile lattice/occupancy checks in disposable review.
A type-only temporary correction exposed an actual overlap; the new renderer now reports the same
block pair/cell before task completion. This supersedes any inference that prior visual-feedback work
covered all admission feedback. It is not a new full migration audit or a successful Case claim;
scope, focused evidence and subsequent Case results remain in `docs/18-refactor-progress-and-backlog.md`.

2026-09-05 current integration addendum (`66dff3a2` plus preserved worktree changes): the §11
CF-24 implementation now retains every non-Subject Case target and records three actual Camera
after-render structural observations bound to their Request and PNG hashes. `presence-required`
does not mean visible pixels; opening-absent targets are not forced into the opening composition.
Production ports, publisher, verifier and Studio consume the same observation set. Main focused
ports/runner tests 73/73 and publisher/verifier files 64/64 pass, including diagnostic-only publication;
typecheck, unchanged 3C migration assertions and Native Skill/palette tests pass. Dedicated owner
tests are now 236/236 GREEN. The scoped independent review found and closed two P1 gaps: exact-empty
opening subsets and Receipt camera-owner linkage. Its final ten-file review has no remaining P0/P1;
main reran the affected five tests and final typecheck successfully. The suggested stricter side/top
parser policy was rejected because it contradicts the frozen source-neutral three-mode contract.
At that checkpoint a new local 054 Case had started; its later failure is recorded above. These results supersede only
the earlier "not implemented" statements for this candidate, not the original checkpoint evidence or
the open effect acceptance. There is still no new successful 054 Case; live status remains `docs/18`.

2026-09-05 user-authorized parallel implementation: CF-31C's lost-checkpoint and repeated Host-failure
matrix now has focused evidence; publication interruption tests found and fixed an existing-diagnostic
false rejection by exact-byte reuse only in explicit recovery. CF-26B is being integrated with the
historical `coding-agent` caller stage (not just a dormant retry policy); CF-24's per-view contract is
frozen in the production design §11 and implementation is underway. These are scoped code/fault-test
updates, not an exhaustive fresh parity review or a new 054 Case result. Status is solely in `docs/18`.

2026-09-05 CF-31C follow-up (same uncommitted candidate): the existing production entry now has explicit
Host-only recovery, no-submit generation restoration, immutable passed-stage checkpoints and Attempt-local
recovery output paths. The actual Native Check/Ground/Package recovery regression and verified-Package
verifier/publisher path regression pass while retaining original failed evidence. Additional interruption,
publication and same-id recovery checks are still being closed; CF-24/26B are not implemented by this
change. The live backlog records current evidence; neither this addendum nor the historical tables claim
the full five-plus-two batch or real production/effect acceptance is complete.

2026-09-05 scoped CF-22/19 follow-up (`66dff3a2` plus uncommitted worktree): the original
054 probe's 4,856 ungrouped-functional-Block errors were an extra Native veto, not a requirement
to assign all scenery to identity targets. Legacy `packages/block-world/src/check.ts:706-718`
requires groups only for landmark identity presets. The current fix removes the role-wide veto;
Case/manifest/actual-target bijection and empty/unknown group rejection remain. The unchanged
054 source passes a new isolated Native Check with zero diagnostics. Original failed Run evidence
is preserved; this is not Ground/Package/Capture/Evaluation or a new successful Case. See the
live backlog's dated CF-22/19 closure for focused evidence and still-open work. Earlier tables
describe their recorded checkpoints, not proof of exhaustive current parity.

- Mode: B, semantic branch-integration review, with D1 added because the question is about the end-to-end
  product boundary rather than a textual merge.
- Incoming reference:
  `origin/codex/block-world-main-integration@9e35ab53c634acaef8c53a33082fff77653f7bbb`.
- Current authority:
  `origin/main@20fe0fef60d8c73fd8c8ce2cecb541117cddd1f8`.
- Merge base: `7fa3197220ef6b8b1ad86f57fc85f8b3e248e0c3`.
- Review question: whether every stage, parameter contract, and Skill from user input through final
  production termination is aligned in current `main`.
- Evidence level: static source/contract/Skill comparison, plus the final-effect addendum's one local
  exact-main Native production Case. No manual interaction, repository-wide test, or real cloud production
  evidence is claimed by the original review; the local Case does not become release acceptance evidence.
  The 2026-09-05 candidate update below adds focused code evidence only.
- Installed engine reference: `@babylonjs/core@9.23.0` from the current lock/package declarations. This
  review does not infer untested Havok behavior from that version.

Read-only comparison commands all exited `0` unless noted:

```bash
git rev-parse origin/main
git rev-parse origin/codex/block-world-main-integration
git merge-base origin/main origin/codex/block-world-main-integration
git log --reverse --no-merges --oneline 7fa31972..origin/codex/block-world-main-integration
git ls-tree -r --name-only <ref>
git diff --name-status origin/main...origin/codex/block-world-main-integration
git show <ref>:<path>
cmp -s <live Native Builder Skill file> <frozen cloud-temple input copy>
```

The three Native Builder `cmp` checks for `SKILL.md`,
`references/native-block-output-contract.md`, and `scripts/self-check.mjs` exited `0`. That proves the
representative current Case copy matches the current live Native Skill; it does not prove equivalence to
the historical Three.js Block Builder or to the missing downstream Episode Skills.

### 1.1 2026-09-05 implementation-candidate update

Candidate `codex/block-world-effect-alignment@58e7ebd5` is based on
`origin/main@20fe0fef60d8c73fd8c8ce2cecb541117cddd1f8` and is not merged into `main`. It implements the
Scene-scope production-outcome split, atomic publication, historical Planner hard thresholds,
entry-first/World-Plan causality, Native Builder entry/top visual feedback, frozen source bytes, and exact
palette admission for targets already represented by Case visual-group rows. Generic disconnected
route-colored components now produce a deterministic warning; Case-required route connectivity remains a
Ground/Traversal failure.

Two over-strict candidate behaviors were found during old-branch review and corrected before this
checkpoint:

- the Planner no longer requires every target to be visible, large, and coherent in the entry image;
  the old hard contract is all declared targets in World Plan, but Subject-1 only in entry;
- generic Native Check no longer treats every disconnected route-colored component as a global error.

An independent final read-only review found no remaining new P0/P1 ordinary-production veto in the
candidate. Integrity requirements needed to prove the requested stage exists—safe paths, exact bytes and
hashes, closed receipts, launchable Package/Capture, and atomic publication—remain blocking. Seven-dimension
Evaluation and NBR strict verdicts cannot overwrite an otherwise passed ordinary-production result.

This is not complete production-chain parity. `BWMI-CF-24` remains P1: a non-Subject target absent or
unreliable in opening needs one stable Case identity plus an explicit per-view disposition
(`not-required | presence-required | reference-projection-required`). The candidate also leaves WebP input,
fixed generic Case/Subject/Camera assumptions, scene-completeness and measurement contracts, budget caps,
and exact historical external-repair behavior open. No complete real CASE-054, full Browser,
repository-wide, or exact-SHA Cloud run has passed on this candidate.

A local CASE-054 attempt on predecessor `88c7844c` reached a passing Planner self-check but stopped at
Host `plan-ready` with `WORLDKIT_VISUAL_IDENTITY_PALETTE_INVALID`, before Native Builder. The failure exposed
an implementation bug in the candidate input closure: the historical Palette binds the parsed Scene Brief's
canonical semantic hash, while Native Case/Receipt identity binds the exact Markdown bytes. The new closure
had compared those different hashes as if they were one. `58e7ebd5` separates the two purposes through Case
preparation, planner-input replay, and final Package visual-identity admission. This is an integrity repair,
not a new quality veto or relaxed acceptance threshold. The failed staged Case was cleaned, so it supplies no
Package/Capture/publication evidence for the fixed SHA.

### 1.2 2026-09-05 cross-boundary re-audit and correction

Object: `codex/block-world-effect-alignment@66dff3a2` plus subsequent uncommitted repairs;
historical behavior reference remains `9e35ab53`. This is a Mode B audit followed by separately
user-authorized implementation. Live task states belong only to `docs/18-refactor-progress-and-backlog.md`.
The user now requests completion of every outstanding BWMI-CF task, not merely discovery.

The earlier statement that review found no remaining ordinary-production veto is historical review
evidence, **not a valid completeness claim**. Executable counterexamples were missed:

| Finding / evidence level | Exact boundary and impact | Resolution / task |
|---|---|---|
| Brief hash domains diverged again (`automated-contract`, real frozen inputs) | Case preparation and Package used the shared semantic Brief parser, but the portable Builder checker independently required Palette semantic hash to equal Case raw-file hash. Correct delivery could fail after paying for Builder. | CF-28: shared generated checker, explicit `--scene-brief`, live/frozen Skill and Host invocation updated together. |
| Root failure became result-parser failure (`automated-contract`) | Run emits allowlisted `self-check-failed`, `task-timeout`, etc.; Production result accepted uppercase codes only and threw `WORLD_RECONSTRUCTION_PRODUCTION_RESULT_INVALID`. | CF-29: preserve stable lowercase owner codes; no success/gate change. |
| New feedback diagnostics disappeared (`automated-contract`) | Native Package emits renderer/input/proxy/palette/RGBA and ground diagnostics absent from Run's allowlist. | CF-29: 13 explicit code-preservation tests; private provider text remains filtered. |
| Cleanup destroyed investigation inputs (`automated-contract`) | `.task` and `.staging` were removed, leaving only generic failure and PNGs. | CF-29: persist exact Host verdict/request identity; retain unadmitted `rejected-source/`, never publish it or overwrite prior evidence. |
| Legal syntax was an extra veto (`automated-contract`) | Early `not-traversable` check treated any comma as illegal fields, including formatter trailing commas/comments. | CF-30: require an actual extra property; formal Native union admission remains. |
| Stderr could stall the Host checker (`automated-contract`) | A piped stderr was never consumed; large error output could block before JSON delivery. | CF-29: drain without exposing error text; subprocess reproducer. |
| Generation fixtures missed real Brief closure (`automated-contract`) | 15/35 tests still used invalid `# Cloud Temple` after the semantic-parser change; mocks elsewhere hid the boundary. | Real committed Brief, raw Case hash and semantic Palette hash; full 35/35 passed. |
| Native stage resume is absent (`static-read` at the audited baseline) | The audited Native CLI rejected plan-only/build-only. The subsequent worktree restores both entries and complete durable Builder inputs, but build-only still starts a new Builder Run; old shell also supports Host-only replay without paying for Builder again. | CF-31A/B code/focused; CF-31C remains open in the live backlog. Architecture does not justify losing paid-stage recovery. |
| Recording identity migration loses actual inputs (`automated-contract`) | `resolveSceneAssets()` emits `visualTargetId`, but Workbench consumers read `id`, dropping landmark references and producing undefined URLs. | CF-08: current-only prompt/API/UI joins, Studio 9/9 and Playground 4/4; no alias. |
| Reference format coverage is incomplete (`automated-contract`) | WebP was accepted at some entry surfaces but omitted from Case/Generation/Publisher media closure. | CF-25: one actual decoder and byte-preserving reference naming across snapshot, Case, Request and Publisher; malformed/animated/mislabeled inputs rejected without transcoding. |
| Required Palette becomes an unexpected final input (`automated-contract`) | Case preparation includes `visual-identity-palette.json`, while Publisher's stale private input inventory rejects it as extra. | CF-32: one shared Planner input inventory; direct PNG/WebP Case preparation-to-Publisher input tests, not only no-input Package mocks. |
| Task and Host read different checker versions (`automated-contract`) | Launcher sends live Skill context, then rereads the live checkout after a long Planner task or during Canonical build-only. | CF-09: one frozen Planner execution Request/Receipt owner; real local router/fake child + actual Host subprocess regression, Native Case record retention. The old shell also had the live-read issue; this is identity hardening, not a new visual gate or a claim of old-only behavior. |

Real local evidence: `paper-moon-palace-054-local-alignment-0905/run-20260904194606-56806`
on `66dff3a2`. Planner passed; Generation rejected with `self-check-failed`, empty admitted outputs
and completed cleanup. No Package/Capture/Evaluation/Final exists. Frozen raw/semantic Brief hashes:
`4906d4e79c17a1ded1445ce349ea1bb4ef58c437bf0aceeedaf5dbed66820078` and
`34b97df765e0f5cedebe97f8998ff65d2726f0cf137bd69c3b80ca45cd1b9be4`.
The checker mismatch is deterministic. Erased Source prevents proving in-task repair count or Block
usage. Sparse advisory comparisons are not Runtime captures; their red cuboid is the Host Subject
bounds proxy, not evidence of Builder-owned character generation.

Corrections: old `run-spatial-world-agent.sh` also terminates on failed Host replay; its three repairs
are inside Builder, not automatic external Host jobs. The 2,000-Block cap is uncalibrated, not a proven
sole cause here. Raw whitebox/advisory output versus old styled output is not a like-for-like comparison.

The wider pass rechecked input/CLI modes, model routing, Planner causality, input/hash freeze, Case,
Skill outputs, local/Host checks, advisory rendering, Native admission, Ground, Package, Capture,
Evaluation, repair, entry validation, publication, cleanup/resume, and post-whitebox styling/media.
Important non-findings and still-open boundaries:

- Generation Request already calls `validateNativeWorldPlannerInputClosureV1` before dispatch;
  another Palette preflight would duplicate its owner. The missing piece was the portable checker.
- Formal opening bounds/anchor diagnostics block explicit `required-for-publication`, not default
  `report-only`; they are not a newly discovered ordinary quality veto.
- Fixed bounds/12m route, default Subject/Camera, off-opening targets, coverage measurements,
  budget, semantic-front and missing downstream owners remain CF-11/12/14/16/20/21/24 and WRC-QP-4.

Focused evidence is not release acceptance: RED had one identity and four terminal-code failures,
three legal trailing-comma failures, 13 lost Native codes and one stderr-backpressure failure.
The first repair set passed 147 tests across Skill, Generation, Production and validation; Generation
Request then passed 35/35 with real Brief fixtures; bundle drift plus syntax/diagnostic subset passed
19 tests. Final subsets/typecheck are recorded in the live backlog. No fresh paid case, complete
Browser/effect comparison, repository-wide gate or exact-SHA Cloud gate is claimed for this worktree.

The subsequent CF-09 input-identity implementation leaves the Planner's image prompts, thresholds,
three same-task repairs, and model unchanged. Host Brief parsing is supplied by the same frozen portable
checker instead of an additional live validator. The request hashes instruction, all Skill/reference/checker
files and source-selected context; an accepted receipt binds the request and exact Agent/Host report.
Native Case publication preserves the execution directory, and reuse checks the report already bound by
the Case. This is not Native paid Builder resume: CF-31 remains open. Latest focused evidence and current
status for CF-08/09/25/28..32 are in the live backlog, not inferred from earlier real runs.

The subsequent CF-31 stage-control change restores Native `--plan-only` and `--build-only` through the
same public entry and production owner. Plan-only freezes a Case without launching Builder; build-only
consumes that admitted plan and frozen references even if the original upload path is gone. Missing or
stale Planner inputs do not silently trigger a replacement Planner. Builder preparation now preserves
the complete instruction/Skill/checker/reference/repair byte snapshot, context and dispatch identity
after `.task` cleanup. No model, visual threshold or publication standard changes here. These are
recovery prerequisites, not Host-only recovery: terminal Run/Attempt continuation and paid Builder
reuse remain CF-31C. Synthetic stage-control and real checker/Case contract tests are not paid Case or
effect-equivalence evidence.

## 2. Executive verdict

The answer is **no** at the audited tree state. Current `main` does not yet have complete behavior or
parameter parity with the historical branch. Literal code parity is intentionally excluded because the
Babylon Native lane is a current-only clean-break replacement for the old Three.js Block Source,
Manifest, Compiler, hidden foundation, preset-derived Physics, and Builder-owned Subject/Camera dialect.
All production behavior outside that architectural replacement is now required to match the historical
workflow exactly.

For the whitebox reconstruction boundary, current `main` has a stronger ownership and evidence skeleton,
but the Case-054 reverse audit proves that it is not yet an effect-equivalent replacement:

```text
user input
  -> Unified Planner
  -> Host-frozen Case/Profile/plan inputs
  -> Babylon Native Block Builder
  -> Builder self-check + one Host replay
  -> Native Check
  -> Ground Analysis
  -> WorldPackage/Receipt
  -> Formal Capture
  -> seven-dimension Evaluation
  -> bounded diagnostic repair
  -> historical-equivalent production outcome + atomic publication
  -> separate current strict diagnostic
```

For the complete historical production boundary, alignment is incomplete. The old branch's base Visual
Reconstructor, six independent Playthrough captures, Episode reconstruction/review, ten-style fan-out,
Gemini event direction, six-video Seedance production, conformance/publication, whole-pipeline Cloud
Execution, and GPU batch/tail/recovery control plane do not have equivalent executable owners in current
`main`.

## 3. Stage-by-stage alignment

| Stage | Current `main` disposition | Alignment verdict |
|---|---|---|
| Input and CLI dispatch | `scripts/agents/run-world-agent.ts` selects one closed Scene Source; Native dispatch enters `scripts/reconstruction/run-native-world-agent.ts` and hashes source inputs. | **changed contract**: stronger source selection and identity; not the old single Three.js shell. |
| Unified Planner | Audited `main` submitted one formal Planner task but did not enforce the old image causality/admission. Candidate `58e7ebd5` restores `entry -> inspect -> exact entry feeds World Plan`, discrete Native Block colors, all-target World Plan admission, and Subject-only entry hard admission. | **candidate-aligned for old hard semantics**; non-Subject entry scale/coherence remains advisory by design, while full effect evidence is pending. |
| Planner input freeze | Candidate `58e7ebd5` freezes uploaded reference bytes. The subsequent `66dff3a2` worktree adds the frozen instruction/Skill/checker request, same-context dispatch/Host replay and Case-persisted execution receipt described in section 1.2. | **code/focused evidence, not main or real-Case accepted**; full paid-stage resume remains CF-31. |
| Host Case/Profile preparation | `native-world-case-preparation.ts` derives and freezes Case, Profile, Bootstrap, Capture Intent, named Planner images, reference hashes, Native API/Profile, Builder Skill, output contract, and checker. | **current-only superseding stage**: the old branch had no equivalent Case/Profile/evidence closure. |
| Builder attempt 0 | Current formal output is exactly `scene.ts`, `native-block-authoring.json`, and `native-resources.json`. | **changed contract**: replaces old `world.mjs` plus Host-derived Three/Compiler artifacts. |
| Builder self-check / Host replay | Candidate `58e7ebd5` adds deterministic Planner-vs-Builder entry/top-down comparisons, requires actual inspection in the same Builder task, shares the bounded source-repair count, and has Host replay exact decoded RGBA/identity. | **candidate-aligned feedback topology** under the Native owner; real rendered-effect comparison remains pending. |
| Native Check | Native source, authoring manifest, resources, API use, IDs, shapes, lattice, budgets, visual groups, exact Case/palette joins, and explicit contribution declarations are checked before admission. Disconnected route color alone is a warning. | **semantically supersedes** the old Block checker without adding a global route-connectivity veto; Case Ground/Traversal retains required connectivity. |
| Ground Analysis | Current Host binds logical ground, Capsule footprint/clearance, Spawn, target standability, topology, traversal bands, blocked segments, and repair diagnostics to the Case/Package inputs. | **semantically supersedes and strengthens** old footprint/reachability checks. |
| Package and Receipt | One mutually exclusive Native Scene Source is packaged with Frozen Contributions and complete identity joins. | **changed contract**: old Manifest/Block Compiler/hidden foundation must not return. |
| Formal Capture | Current owner produces `opening`, `world-side`, `world-top-down`, collider overlay, support/Spawn observations, and scripted traversal evidence from the admitted Package. | **stronger whitebox evidence**, but historical startup-progress watchdog and some capture UX/performance work are not present. |
| Seven-dimension Evaluation | Current dimensions are `collider`, `critical-traversal`, `deterministic-build`, `opening-composition`, `semantic-silhouette`, `spawn-support`, and `topology`. | **new stronger contract**; the old branch had visual comparison/review, not this identity-bound evaluator. |
| Diagnostic repair / provider retry | Subsequent CF-26A worktree makes the production entry Profile-independent: no external diagnostic-repair Attempt, with quality observations retained. Explicit strict acceptance keeps bounded source repairs. Old Cloud terminal task retries (default 3; task-timeout 2) are a separate mechanism, absent from current router; pending/unknown stay same-id recovery. | **partial**: CF-26A code/focused; CF-26B provider retries and CF-31 Host resume remain open. Same-task source repair is not provider retry. |
| Whitebox outcome/publication | Candidate `58e7ebd5` exposes one closed `productionOutcome`, atomically publishes old-standard successes, and preserves Evaluation/NBR results in a separate strict receipt. The default production command still skips only the final duplicate fresh Browser replay. | **P0 implemented in candidate, not yet main/real-Case accepted**. CASE-054 is a fixture projection; NBR-70/80/90 remain open. |
| Base styled opening and tri-views | Current scripts can create a styled opening and tri-views, but they are separate/manual or Canonical-oriented; finalizers mostly validate files/hashes and do not reproduce the old same-task visual self-review followed by accepted-opening-anchored tri-views. The old base path did not have an independent semantic Reviewer. | **partial, not equivalent**. Native reconstruction does not automatically execute the old Visual Reconstructor Skill; a newly added independent base review cannot become an ordinary veto. |
| Six-start Playthrough production | No current equivalent of the old planner, plan structure, six deterministic captures, dataset, or capture-health owner. Strict NBR traversal evidence is acceptance evidence, not Episode media production. | **missing**. |
| Episode visual reconstruction/review | No current equivalent of the old six-segment opening set, shared target tri-views, independent Episode visual generation, and review tasks. | **missing**. |
| Ten-style fan-out and reviews | No current exact-ten style plan, per-variant reconstruction, independent visual review, or collection-level diversity review. | **missing**. |
| Gemini events and Seedance Episode rendering | Current Recording Workbench offers a single explicitly requested Seedance path; it is not the old six-segment/ten-variant durable pipeline. | **partial one-off only; integrated production missing**. |
| Scene/Episode Cloud Execution and S3/Studio projection | Current `cloud` Builder backend means remote formal Codex tasks. It does not mean the full Host/Capture/visual pipeline runs in a digest-pinned cloud worker with S3 as durable authority. | **missing**. |
| GPU batching, tail, lease, retry, recovery, release | No current queue/Batch manifest, 100-task floor, stable tail, per-task receipt, stage lease, provider journal, or CPU-GPU-CPU resume owner. | **missing**. |

## 4. Parameter and contract comparison

Historical values in this table are evidence for `9e35ab53` only. They are migration candidates, not
current contracts. A later design must re-freeze any value that survives the current owner boundaries.

| Parameter family | Historical branch | Current `main` | Disposition |
|---|---|---|---|
| Formal model tasks | `gpt-5.6-sol`, `xhigh` | same for formal Planner/Builder tasks | aligned |
| Planner outputs | Brief + `world-plan.png` + `entry-whitebox-target.png` | same three semantic Native outputs | aligned names, changed image semantics |
| Planner repair | at most three same-task cycles, one Host replay | same bounded topology | aligned topology |
| Movement description | one or more modes, ordered startup/default | exactly one standard/custom mode | outstanding behavioral gap under CF-12; preserve old intent under current Host/SDK ownership |
| World extent | at least four times the opening area | meaningful entry/middle/remote/off-camera continuation; no fixed padding ratio | outstanding CF-11/21 gap; fixed bounds do not prove equivalent coverage |
| Planner image palette | semantic cube colors in both images; Native-equivalent target order is `#E85D5D`, `#F28E2B`, `#D9A514`, `#4E79A7`, `#9C6ADE` | candidate `58e7ebd5` uses those five Native colors in both images; Canonical retains its separate palette | candidate-aligned without mixing Source profiles |
| Builder outputs | Three `world.mjs` and derived Manifest/Authoring/implementation artifacts | exactly three Native files | intentional replacement |
| Block profile | four old fixed shapes and create-then-position authoring | five shapes including `step`, axis-specific lattice, atomic center/rotation, deterministic grid | current contract stronger |
| Native Host default caps | no equivalent NBR Request closure | 2,000 Blocks, 1,800 seconds, 4,000,000 output bytes plus closed request budgets | current-only authority |
| Builder visual feedback | structural pass then deterministic Planner-vs-Builder entry/top-down comparisons, actual model inspection, up to three combined repairs, Host decoded-pixel replay | candidate `58e7ebd5` reproduces this topology with a disposable Native renderer and one shared source-repair budget | implemented in candidate; real effect/first-pass comparison pending |
| Representation feasibility | old compiler stress-tested 102,400 direct Blocks; no equivalent formal 2,000 cap | fixed 2,000 Blocks before source-specific complexity is measured | uncalibrated; `BWMI-CF-20` must measure and freeze, not copy 102,400 |
| Walkable height | fixed 1 m automatic smoothing, independent up/down thresholds, global 2 m adjacent-height veto | visible 0.25 m tread decomposition validated against current 0.3 m step and 42 degree slope owners | old constants explicitly rejected |
| Quality mode | no current NBR equivalent | Profile retains `report-only` / `required-for-publication` for explicit strict acceptance; subsequent worktree fixes ordinary Run/Capture purpose independently of Profile | CF-26A code/focused; no Profile-selected ordinary veto |
| Attempts | Builder-local repair and separate bounded Cloud terminal task retries | Candidate preserves Builder-local repair; subsequent CF-26A isolates external diagnostic repair to explicit strict acceptance. Cloud task retry budget/classification/ledger still missing | CF-26B open; source Attempt, in-task cycle and provider Task Attempt are different counters |
| Formal world views | old capture/comparison path | opening + side + top, plus collider/support/traversal evidence | current stronger |
| Explicit traversal limits | old Episode separately enforced media capture | current formal capture allows at most 16 checks, 1,200 ticks each, 7,200 ticks total | current admission only, not Episode parity |
| Historical Playthrough | 6 independent captures x 30 s; 60 Hz simulation; 24 fps; 720 frames each; 4,320 total | no Episode dataset owner | missing; re-freeze before implementation |
| Historical capture health | effective movement minimums; stationary <=5 s; unsupported <=1.5 s; vertical drop <=3 m; tick stall <=1 s and rate >=30 | no equivalent Episode capture-health contract | missing |
| Historical style variants | exactly 10; visual and review fan-out 10; Gemini concurrency 5; Seedance concurrency 10; opening attempts <=4; visual attempts <=2 | no exact-ten production contract | missing |
| Historical visual events | segments 0, 2, 4; distribution 2/2/1; Gemini 3.5 Flash; temperature 0.8; 8,192 tokens; 0.25 fps sampling | no integrated Episode event owner | missing; provider/value lock must be reconsidered |
| Historical Episode video | 6 x 30 s; 1280x720; 24 fps; exactly 720 frames; audio required; prompt <=15,000; 2..30 reference images; poll 8 s; timeout 7,200 s; terminal attempts <=2 | manual Seedance lane supports conformance but lacks equivalent six-segment identity/journal closure | partial/missing |
| Historical Episode stages | `episode-prepare -> whitebox-capture -> episode-render`; max attempts 3; timeouts 21,600 / 43,200 / 43,200 s | no durable three-stage Episode execution | missing |
| Historical GPU batch | one GPU; normal batch 100..128; stable closed-producer tail after 120 s; lease 3,600 s; dispatcher 60 s | no current equivalent | missing; infrastructure profile, not public Scene schema |

Two current semantics must not be collapsed while implementing later work:

- `playability: { mode: "skipped" }` skips only the duplicate final fresh Browser replay. Native Check,
  Ground Analysis, Package, Formal Capture, scripted traversal, and Evaluation still run.
- Ordinary production does not consume external diagnostic-repair Attempts for quality findings, even
  when its Profile says `required-for-publication`. A separate explicit strict-acceptance workflow may
  use the retained bounded repair machinery; the journal binds that purpose. Structural, identity,
  Runtime and cleanup failures remain failures. This does not waive old Cloud terminal provider retries:
  `BWMI-CF-26B` still owns their typed classification, 3/2 budgets and durable request accounting.

## 5. Skill alignment

| Skill at historical branch | Current disposition | Verdict |
|---|---|---|
| `worldkit-spatial-planner` | candidate keeps closed Canonical/Native profiles and restores the old Native entry-first generation order, exact hard image thresholds, and discrete five-color Block plan semantics | behavior-aligned where architecture permits; not byte-aligned |
| `worldkit-block-builder` | replaced by `worldkit-native-block-builder`; candidate restores same-task entry/top visual inspection/source repair while Three.js, Manifest, Compiler, hidden foundation, and Builder-owned Subject/Camera stay forbidden | intentionally superseded architecture with aligned feedback behavior |
| `worldkit-visual-reconstructor` | no equivalent Skill/runner; current styled scripts do not preserve its full semantic review/repair responsibilities | partial/missing |
| `worldkit-playthrough-planner` | no current Skill, checker, or executable call path | missing |
| `worldkit-episode-visual-reconstructor` | no current Skill or executable call path | missing |
| `worldkit-style-variant-director` | no current Skill/checker/runner | missing |
| `worldkit-style-variant-visual-reconstructor` | no current Skill/runner | missing |
| `worldkit-style-variant-visual-reviewer` | no independent current review Skill/Host finalizer | missing |
| `worldkit-style-variant-diversity-reviewer` | no collection-level current review Skill/Host finalizer | missing |

The candidate Native Builder Skill is live and wired: Case preparation freezes its Skill, output
contract, and checker; Generation Request hashes them and declares only the three Native outputs; Host
admission uses the Case-frozen checker and exact palette join. Its representative
`cloud-temple-t-gate-native-block` copies are byte-identical to the candidate live files. This says nothing
about the seven missing downstream Skills. Likewise, “Planner aligned” here means exact historical hard
image admission and causal topology; it is not evidence that complete-world topology or reference-image
fidelity has been visually achieved.

## 6. Historical commit disposition

| Commit group | Valuable behavior | Current disposition |
|---|---|---|
| `cdae61aa` | integrated Block workflow, Playthrough/Episode Skills, stack-safe layout search, capture/inspection UX | Native world mechanics semantically replaced; downstream Skills missing; reusable engineering items are tracked in `docs/18` under `BWMI-CF-*`. |
| `6bcc51bb`, `8c250b5f` | effect-preserving cloud scene, cloud Episode, startup watchdog, capture health, style workflow, recovery diagnostics | cloud/media chain missing; selected runtime/capture risks require current reproducers before porting. |
| `ae53ff9a`, `90126d43`, `69885f3f`, `596ddd5e`, `b6391c29`, `b09c5efd`, `7607089e` | GPU batch, closed-producer tail, launch admission, capacity scheduling, lease, failed-stage retry, live-tail reconciliation | missing; recorded as current-architecture cloud production work, not cherry-pick targets. |
| `6def857d`, `c6f8318a` | exact-ten style production and provider concurrency 10 | missing; historical numeric values remain candidates only. |
| `1678960f` | production/capture synchronization and committed Camera render interpolation | some generic render interpolation exists; Camera-specific acceptance is added to WRC-CAM follow-up. |
| `d69d7f82` | bounded Babylon multi-contact correction | already semantically present in current Runtime; no new task. |
| `266ddf32` | repair stalled Playthrough plans | Playthrough owner is missing; recovery requirement is included in future Episode work. |
| deployment-only pins `d24f0a2d`, `0a21c9d8`, `26b7b550`, `22c9d03f`, `b7f5b259`, `7e246bae`, `57b0245b`, `77555c6f`, `c3264c99`, `d59a3225`, `cc23692c`, `9e35ab53` plus tenant/control-plane/health fixes `48d2ee63`, `6ff5b31f`, `f59c8021`, `fe53648a` | deployment identity and old environment fixes | historical evidence only. Do not copy image digests, service bindings, or deployment pins into current contracts. Their durable recovery/identity intent is covered by the cloud production tasks. |

## 7. Old conclusions revalidated

- **Still valid:** Three.js Block authoring, Block Manifest/Compiler, hidden foundation, preset-to-Physics
  inference, Mesh/tag/name collider inference, a second support owner, and Native-owned Camera/Input/Tick
  must not be restored. Current Native Check/Ground/Package owners supersede them.
- **Still valid:** named Planner plan images, complete-world continuation, explicit block identities,
  exposed-top/shared-edge topology, bounded smoothing, explicit Collider Contributions, ground-edge
  protection, deterministic batching, SDK-owned Havok residency, and multi-contact correction are
  valuable. Current NBR-65/65J already carries these semantics.
- **Invalid as a current capability claim:** the walkable-surface parity ledger's wording that styled
  output, Playthrough/Episode, and capture health are “preserved under their current owner” is only an
  exclusion from NBR-65. Current tree inspection shows the historical executable owners are absent; the
  wording cannot be cited as integration proof.
- **Unproven on current `main`:** historical cloud runs, deployment pins, screenshots, and runtime
  receipts prove only their recorded old tree. No old evidence is promoted to `20fe0fef` by this review.

## 8. Findings

### [P1] [D3] Downstream Episode and cloud-production capabilities are absent

- Evidence (`static-read`): current `main` has no old Playthrough/Style/Episode Skills, no
  `scripts/episodes/` implementation set, no `scripts/cloud/` production control plane, and no exact-ten
  or 100..128 Batch contracts. The historical branch contains all of them. Current
  `scripts/verification/verify-nbr65-v2-capability-parity.ts:424-445` only assigns conceptual downstream
  owners.
- Expected: status authority must distinguish “excluded from NBR” from “implemented elsewhere”.
- Impact: a reader can incorrectly conclude that completion of Native reconstruction also preserves the
  old six-capture, ten-style, video, cloud, and GPU production chain.
- Suggestion: use current owner boundaries to re-design the downstream chain after formal Capture; track
  every package and historical parameter disposition without restoring old Scene/Runtime authorities.
- Revalidation: confirmed by two independent branch/tree inventories; recorded in `docs/18` by this
  documentation change.

### [P1] [D2/D3] Recording Workbench mixes `visualTargetId` and `id`

- Evidence (`static-read` plus focused pure-function probe):
  `apps/studio/src/recording-workbench.mjs:484-490` creates tri-view rows with `visualTargetId`, while
  `:167-183`, `:548-555`, and `:572-583` read `id`. The current prompt test manually supplies the old
  `{ id }` shape. Passing the real producer shape yields a primary target named `undefined`, omits
  supplemental tri-views, and constructs `/undefined` URLs.
- Expected: the current-only public/local identity term is `visualTargetId` end to end, with one producer,
  consumer, and test shape.
- Impact: the existing single-recording Seedance path can lose target identity before prompt or media
  construction even though the asset manifest is valid.
- Suggestion: clean-break all consumers/tests to `visualTargetId` and add an integration assertion from
  `resolveSceneAssets()` through prompt, URL, reference order, and portable bundle.
- Revalidation: confirmed against current source and the historical branch's internally consistent old
  `id` shape; not fixed by this review.

### [P1] [D4/D6] Planner source and checker identity can change during one long task

- Evidence (`static-read`): `scripts/reconstruction/run-native-world-agent.ts:103-128` reads and hashes the
  source images, but `:152-165` passes their mutable original paths to the Planner. Later,
  `scripts/reconstruction/native-world-case-preparation.ts:631-645` rereads those paths for Case reference
  hashes. Separately, `scripts/agents/run-canonical-world-agent.sh:177-201` sends the Planner Skill bundle,
  while `:202-220` replays the current checkout's live checker and compares only the resulting receipt;
  the Planner receipt does not bind a checker/Skill hash.
- Expected: one immutable source byte set and one checker identity must cover Planner input, task output,
  Host replay, and the Case that feeds Builder; a long-running task cannot silently cross source/checker
  revisions.
- Impact: a file edited during Planner execution can produce a Brief/plan for one image and a Case/Builder
  request for another, or a live checker edit can invalidate the meaning of an otherwise byte-equal receipt.
- Suggestion: stage the initially read source bytes and use those paths throughout; freeze and hash the
  Planner checker/Skill in the request/receipt and replay that exact copy once. Do not add another Planner
  or compatibility path.
- Revalidation: candidate `58e7ebd5` closes source mutation with one stable no-follow read, a private
  read-only Planner snapshot, and same-byte Case freeze, including adversarial replacement/deletion/symlink
  tests. Subsequent `66dff3a2` worktree code/focused evidence closes the checker/Skill Request/Receipt
  binding described in section 1.2; real model/Cloud evidence and full paid-stage resume are not supplied.

### [P1] [D6] Current Seedance submission lacks the historical durable provider journal

- Evidence (`static-read`): the current manual path submits in
  `scripts/visual/run-seedance25-reference-video.py` before a provider task identity is durably available.
  It has output conformance but no equivalent pre-POST `inputIdentity`, idempotency key, ambiguous-response
  reconciliation, stale-output invalidation, or terminal-attempt receipt. The live backlog already marks
  the provider-neutral M6 implementation incomplete.
- Expected: a production provider side effect must be exactly-once or reconciled from a durable immutable
  identity; process loss cannot silently create a duplicate paid Job.
- Impact: a crash or lost response around submission can duplicate work or leave an unresumable recording.
- Suggestion: implement the provider-neutral Video Adapter contract and journal semantics; do not expose old
  Ark-private fields as public WorldKit Schema.
- Revalidation: current source compared with the old Episode provider journal; not fixed by this review.

### [P2] [D5] Layout search still consumes the JavaScript call stack

- Evidence (`static-read`): `packages/layout-solver/src/solve.ts:262-295` recursively visits one frame per
  variable, while `packages/authoring/src/authoring-spec-v4.schema.json:119-148` admits up to 10,000 nodes
  and relationships. Historical `cdae61aa` used an explicit stack and included a 10,000-fixed-entity
  regression.
- Expected: admitted maximum-size deterministic input must fail by declared budget or complete without an
  implementation-language stack overflow.
- Impact: a valid large AuthoringSpec can terminate before returning the solver's stable report.
- Suggestion: port the behavior, not the file: add the RED maximum-depth fixture, use an iterative DFS while
  preserving ordering/cost/tie-break semantics, then run focused solver/type checks.
- Revalidation: source risk confirmed; the runtime failure was not executed in this docs-only review.

### [P2] [D6] Capture startup has no progress-aware stall watchdog

- Evidence (`static-read`): current `scripts/cli/worldkit.ts:1726-1781` uses fixed 30-second waits. The
  historical branch had `worldkit-capture-startup.ts`, startup phase/revision observations, a 180-second
  hard limit, a 45-second no-progress limit, transient navigation handling, and bounded diagnostics.
- Expected: expensive Browser startup should distinguish forward progress, stable stall, terminal error,
  and navigation churn, while publishing bounded safe diagnostics.
- Impact: slow valid startup may be rejected and a genuine stall may be opaque.
- Suggestion: reproduce current Formal Capture startup behavior first, then add one shared Host-owned
  watchdog and typed diagnostics rather than another Capture owner.
- Revalidation: current/old source comparison only; no slow-start Browser run was performed.

### [P2] [D4] Zero-normal support observations need a current reproducer and disposition

- Evidence (`static-read`): current `babylon-character-body-port.ts:1065-1070` and `:2628-2631` reject a
  supported/sliding zero normal. The old branch recorded a transition policy for an observed provider
  combination: upward departure first; otherwise derive from already admitted supporting contacts; without
  such a contact publish unsupported; never invent `[0,1,0]`.
- Expected: exactly one `checkSupport()` owner, canonical supported/sliding with a normalized normal, and no
  terrain/raycast/animation fallback or second support state machine.
- Impact: if Babylon/Havok 9.23.0 can still produce that combination, a transient provider observation can
  become a fatal fixed-Tick error.
- Suggestion: first create the exact current fake-driver/real-engine RED reproducer. Only if reproduced,
  implement the policy inside the existing BodyPort transaction and prove Snapshot/Reset/Replay/Rollback.
- Revalidation: current code path confirmed; provider occurrence is unproven on current `main` and therefore
  must not be described as a confirmed Runtime bug yet.

### [P2] [D4/D6] Camera opening parity and Camera render interpolation are not closed

- Evidence (`static-read`): current subject rendering owns a committed render-pose buffer and the adapter
  passes interpolation alpha, but no equivalent Camera render-pose history is present. Artifact/preview and
  formal opening paths consume the Bootstrap Camera through different orchestration surfaces. Historical
  `1678960f` carried Camera previous/current committed poses across transaction/rollback and sampled alpha
  `0..1` without changing simulation evidence.
- Expected: one Camera owner must produce identical initial framing from the same Bootstrap across preview,
  formal Capture, and interaction; render interpolation may affect pixels only and must collapse on reset,
  rebind, view switch, pause, and rollback.
- Impact: opening-composition results or video smoothness can diverge even when committed simulation hashes
  agree.
- Suggestion: add an exact same-Bootstrap framing matrix and alpha `0/0.5/1` fixtures under WRC-CAM-1/2,
  then decide whether Camera interpolation is required in the current architecture.
- Revalidation: source comparison only; no rendered parity claim is made.

### [P2] [D5] Large feature lists and exact-size Canvas recording lost bounded fast paths

- Evidence (`static-read`): current Playground lacks the old bounded feature-list window. Current
  `apps/playground/src/canvas-recorder.ts:90-103` always allocates and copies through a second canvas even
  when the Runtime canvas is already the requested 1280x720 raster. The old branch rendered at most the
  visible rows plus overscan and directly captured an exact-size canvas.
- Expected: inspection and recording overhead should remain bounded without changing simulation cadence,
  frame truth, or media conformance.
- Impact: dense worlds can spend UI/2D-copy work proportional to the whole feature set and can starve
  recording work.
- Suggestion: reintroduce each optimization behind focused deterministic/browser measurements; direct
  capture is valid only for an exact raster match, with the scaled fallback retained.
- Revalidation: source comparison only; no performance benchmark was run.

### [P2] [D4/D6] Runtime flight-recorder value must be redesigned, not copied

- Evidence (`static-read`): historical `8c250b5f` added a large Playground flight recorder and provider
  diagnostics; current tree has no equivalent module. Some recorded fields were tied to old provider/runtime
  surfaces and therefore cannot be treated as canonical state or an automatic retry trigger.
- Expected: diagnostics are immutable, bounded, redacted projections of existing committed evidence and
  provider telemetry; they do not become Snapshot state, support/input authority, or recovery policy.
- Impact: omitting all trace context hurts capture diagnosis, while copying the old module risks a second
  Runtime truth and provider leakage.
- Suggestion: first freeze a provider-neutral diagnostic schema, redaction/budget rules, and explicit typed
  recoverability policy; then add replay/reset/two-session tests.
- Revalidation: historical value and current absence confirmed; no direct-port recommendation.

## 9. Final-effect reverse audit and Case-054 addendum

After the migration inventory, the review was repeated backwards from the user-visible result: final
opening, complete explorable world, controlled Subject, cross-view identity, styled images, Episode media,
and publication. This found additional P1 work that was not explicit in the first inventory. Every row is
now assigned to `BWMI-CF-*`, `BWMI-PROD-*`, or an existing WRC/NBR acceptance boundary in the live backlog.

### 9.1 Current-main local evidence

The local Case used exactly
`origin/main@20fe0fef60d8c73fd8c8ce2cecb541117cddd1f8` and source image
`/Users/xiateng/Downloads/测试集/054_paper_moon_palace.png`
(`1672x941`, SHA-256
`080d951445bae3a8584363f0be5ef9194b5eff88e7b64da40d2a81f6a923972e`). It ran with
`WORLDKIT_CODEX_BACKEND=local`; the local Planner and Native Builder both used
`gpt-5.6-sol/xhigh`. Run identity was
`paper-moon-palace-054-report-only-0904/run-20260904134439-41905`.

Attempt 0 passed Planner self-check/Host replay, Builder self-check/Host replay, Native Check, Ground
Analysis, Package, Formal Capture, scripted traversal, and all seven Evaluation dimensions. Ground reported
one reachable component, 3,305 reachable stand positions, 72 reachable chunks, and 43.174m maximum distance;
Package root was
`sha256:e9b3bd16de985989e212cf0adb4bb4b1172a6c598a6bdfe2759518bcb1a0d6b7`. The Run Receipt says
`outcome: passed`, `finalAttemptIndex: 0`, and `cleanupOutcome: completed`.

The generated source used 1,974 of the frozen 2,000 Blocks (98.7%): 1,141 ground, 308 background,
and 525 structure Blocks. Its complete XZ bounds were roughly `31m x 50m`, only about 9.5% of the fixed
`128m x 128m` Case-bounds area before accounting for vertical structure. The historical compiler's
102,400-Block test proves only that its old batching/compiler dialect could carry that input; it is not a
safe Native limit. Current needs measured Browser/Capture/Havok feasibility rather than either accepting
2,000 as sufficient or blindly copying the old number.

That pass is not visual proof. The source/Planner intend a paper valley containing bridges, waterfalls,
side towers, gardens, stairs, a large moon palace, off-camera branches, and a cloaked traveler. The actual
Opening contains a fixed red G Bot on a broad straight white slab, a few wall masses, and a simplified block
palace; world top/side show only a small mostly linear footprint. The Host WRT is always the retained Cloud
Ridge `humanoid.g-bot@2` ground closure, while the Brief asks for a short-haired, long-cloaked traveler. The
Native semantic map excludes the primary Subject, so Evaluation did not observe that identity mismatch.

The outer production result then closed with `NBR70_BLOCKER_IDENTITY_MISMATCH` and published no Final. The
Case and Contribution both declare `collider-visual-target-2-solid`, but the derived Formal Intent contains
only a pass/reach-bounds traversal and therefore has no `block-plane` blocker. The final verifier requires
the Case, Contribution, and Formal blocker sets to be identical. `playability` was explicitly skipped, so
this is not the removed duplicate Browser replay. This is direct current evidence for `BWMI-CF-13`, while
the visibly weak seven-dimension pass is direct evidence for `BWMI-CF-10..14` and `BWMI-CF-19..22`.

Candidate `58e7ebd5` changes the normative projection of that already-recorded result to ordinary
`passed/published` plus a failed strict diagnostic. It does not retroactively create a Final directory for
the historical run, and no second real CASE-054 generation/Capture was executed. Palette, Planner, Builder
feedback, and outcome behavior on the candidate are therefore supported by focused fixtures only.

### 9.2 Why the historical result looked better and failed less often

The historical production topology was materially different; its advantage was not Three.js itself.

2026-09-05 prioritization clarification: old Builder explicitly permits registered G Bot for an ordinary
walking human and leaves clothing likeness to the visual stage. Its use alone does not prove a 054
whitebox parity defect; movement/topology compatibility, framing and later appearance transfer must be
assessed separately. The later local 054 Case also retains all four non-Subject palette targets, so the
general missing-opening-target defect is not established as the cause of that run's sparse geometry.
The [R1 rerun plan](../superpowers/plans/2026-09-04-block-world-production-effect-parity-implementation.md#first-effect-rerun-case-054--r1)
prioritizes measured representation budget, complete geography/feature feedback and Host framing before
the next local whitebox Case; styled-image alignment is its second checkpoint. This changes prioritization,
not the historical run evidence or live task completion.

The subsequent fast local probe implements an 8,000-Block candidate ceiling and frozen Planner budget
context, plus construction-budget/geography and same-task comparison instructions. A bounded real
Babylon/Host/Havok workload measured 2k/8k; 16k crashed and was not selected. Hosted preview/Capture node
and process caps were adjusted with the 8k candidate, without changing Collider safety or ordinary
outcome policy. These are input/representation repairs, not a claim that the historical 102,400 workload
is supported. Camera composition selection remains open; the interim probe explicitly precedes full R1
readiness. Current measurements and run status are in the live backlog; the original 2k table above is
historical review-state evidence, not the updated candidate's budget.

| Historical mechanism | Effect on the visible result | Current disposition |
|---|---|---|
| In one Planner task, generate and inspect entry first, then attach that exact accepted entry while generating World Plan; changing entry makes the plan stale (`9e35ab53:.codex/skills/worldkit-spatial-planner/SKILL.md:14-20,34-52`). | Entry composition and complete geography start from one causal image lineage instead of two loosely related proposals. | `BWMI-CF-10` restores the behavior under the unified profile. |
| Both planning images were visibly discrete cubes with functional/target colors, while current Native CASE-054 entry target was a highly detailed paper diorama that could not fit its Block budget (`9e35ab53:.codex/skills/worldkit-spatial-planner/SKILL.md:24-30`). | Builder received an implementation-scale target rather than an unconstrained concept image. | `BWMI-CF-20` owns representation/budget feasibility; it does not restore the old RGB/Three.js dialect. |
| After every structural pass, old Builder rendered Planner-vs-current entry and top-down comparisons, actually opened both, repaired the largest spatial mismatch, and repeated within three cycles; Host replayed exact decoded pixels (`9e35ab53:.codex/skills/worldkit-block-builder/SKILL.md:237-273`). | The generating model saw its own geometry before submission and could correct position, direction, scale, depth, occlusion, route bends, and mass. This is the strongest direct reason old whiteboxes looked better. | Former `WRC-QP-1` was mis-prioritized; it is now the single P1 `BWMI-CF-19`. |
| Old Builder selected Subject and authored opening Camera tuning from the complete movement/body intent (`9e35ab53:.codex/skills/worldkit-block-builder/SKILL.md:154-216`). | Inputs were not all silently rendered as the same G Bot and fixed Cloud Ridge camera. | Current ownership stays Host-side; `BWMI-CF-12` closes selection/tuning without giving Native Module those owners. |
| Runtime whitebox success automatically fed an opening-first Visual Reconstructor; accepted opening then anchored tri-views (`9e35ab53:.codex/skills/worldkit-visual-reconstructor/SKILL.md:27-105,138-152`). | High-frequency paper/material/identity detail was reconstructed after coarse occupancy, so the final image was never merely the raw Block capture. | `BWMI-CF-16` and `BWMI-PROD-10`; CASE-054 stopped before this layer, so raw whitebox versus old styled output is not like-for-like. |
| Six captures, per-variant reconstructors/reviewers, ten candidate styles, and a collection diversity review (`9e35ab53:scripts/episodes/run-style-variant-workflow.mjs:297-686`). | More candidates, independent visual admission, and targeted retry created survivor/selection advantage. | `BWMI-PROD-20/30/45/60`; exact historical counts remain candidates until Profile freeze. |

The old lane was not uniformly safer. Geographic fidelity still depended partly on model/human inspection;
Studio's user click was cost/UX authorization rather than a quality gate; old capture health explicitly did
not judge exploration or camera quality; raw video admission had no independent semantic reviewer; and the
ten-style lane intentionally allowed creative reinterpretation rather than source-faithful reconstruction.
The explicit product decision after this audit is to preserve the effective feedback topology and copy the
historical requested-scope success/failure semantics exactly, apart from architectural replacement. Current
strict checks remain intact as a separate diagnostic/explicit-acceptance authority; they no longer veto an
ordinary production success. Atomic publication remains because it changes delivery safety, not the
semantic success criteria. The frozen disposition is
[`2026-09-04-block-world-production-outcome-parity-design.md`](../superpowers/specs/2026-09-04-block-world-production-outcome-parity-design.md).

### 9.3 Newly explicit pre-style effect gaps

| Finding | Current evidence and user-visible impact | Recorded owner |
|---|---|---|
| Planner semantic admission and pair lineage | Candidate `58e7ebd5` restores old hard semantics: World Plan must contain every Brief target with at least `max(32px, 0.005%)`; entry hard-checks only Subject-1 with at least `max(64px, 0.10%)`, horizontal-center error `<=1.5%`, and 16:9 error `<=2%`. It restores entry-first exact-pixel lineage. Requiring every non-Subject in entry would itself be an over-strict migration, so their entry scale/coherence/ambiguity stays advisory. | `BWMI-CF-10` implemented in candidate; real Case pending |
| Complete-world intent collapses to a generic miniature Case | `native-world-case-preparation.ts:43-84,269-401` uses fixed 128x128 bounds, two generic ground groups, one 12m straight band, and 300 forward ticks for every report-only input. The detailed World Plan is an attached raster for the Builder, not a Host-measured complete-world/topology acceptance source. A model may honor the prose, but the gates cannot distinguish it from an entry-only strip. | `BWMI-CF-11` |
| Subject and movement mode are not connected to the Host Bootstrap | The Planner supports ground glide/riding/driving, water, underwater, flight, custom movement, and a complete controlled shape. `run-production.ts:82-88,1033-1100` nevertheless reuses the fixed Cloud Ridge Host closure for every Native Case; Native Builder is correctly forbidden to create a replacement Subject. A scene can silently get G Bot ground movement even when the input asks for another body or medium. | `BWMI-CF-12` |
| Generic landmark blocker identity cannot close | Case derivation marks every non-Subject landmark as a required blocker but derives no block-plane check. `verify-native-block-reconstruction-e2e.ts:425-464` requires exact Case/Formal/Contribution blocker equality. Case-054 proved a seven-dimension-passed Run still closes before publication. | `BWMI-CF-13` |
| Silhouette expected/observed metrics are different quantities | Expected values use actual identity-color raster pixels (`native-world-case-preparation.ts:203-265`); observed values use the projected rectangle of the complete world AABB (`formal-world-capture-measurement.ts:495-572`). `evaluate-evidence-set.ts:683-696` writes `isSemanticTargetPresent: true` without reading visible pixels or occlusion, and the evaluator directly subtracts the incompatible coverage values. Hollow arches, concave forms, separated repeated targets, and fully occluded landmarks can pass or receive destructive enlarge/shrink advice. World-side/top-down PNGs are identity-checked artifacts but do not contribute target-shape observations. | expanded `WRC-SR-1`; `BWMI-CF-14` |
| Structural support is prose rather than a production gate | The Native Builder contract requires a face-contact support chain for structural/playable mass, but `packages/native-babylon-block-profile/src/check.ts:367-376,422-424` emits only a warning for every unsupported Block and still passes when no error exists. No Case-owned floating/background disposition is required. Floating roofs, platforms, or thin mountain masses can therefore pass. | `BWMI-CF-15` |
| The committed strict Case is stale against the named planning-image contract | `cloud-temple-t-gate-native-block/case.json`, its committed inputs, and its Generation Request contain only `reference-0.png`; they omit `world-plan.png` and `entry-whitebox-target.png`, although the frozen current Builder Skill requires both. Skill byte parity does not prove input closure. | `BWMI-CF-18`, blocks NBR-70/90 |
| Builder source visual feedback | Candidate `58e7ebd5` generates deterministic entry/top-down comparisons from the unadmitted Native source, requires the same Builder task to inspect them and use its shared source-repair budget, then has Host replay exact decoded RGBA and identity. It does not create another Package, Capture, Compiler, or similarity authority. | `BWMI-CF-19` implemented in candidate; real effect comparison pending |
| Planner complexity is not admitted against the Native representation budget | The current request fixes `maximumBlockCount: 2000` (`generation-request.ts:116-122`), while CASE-054 used 1,974 Blocks and still implemented only a small fraction of the intended world. No receipt attributes cost to world floor/support, semantic targets, or exposed detail, and no preflight can reject or simplify an infeasible plan. | `BWMI-CF-20` |
| Non-target scene mass has no completeness/effect-density closure | CASE-054 Brief names bridges, waterfalls, side towers, gardens, stairs, trees, lanterns, mountains, and rear/side exploration, but the palette/Case retains only Subject and palace plus synthetic ground. Builder may place the other features, yet no scene-level inventory checks their presence, macro placement, density, negative space, or multi-view silhouette. | `BWMI-CF-21` |
| Planner palette and Builder identity colors | Candidate `58e7ebd5` freezes the Native five-color palette and hashes, performs one Host-owned exact `target -> acceptanceTargetRef -> visualGroup -> semanticClass/color` admission before Native Check/Candidate, and repeats a portable advisory join inside Builder self-check. `#F28A2E` now fails for the old `#F28E2B` target instead of passing through circular metadata. A real predecessor run exposed and `58e7ebd5` fixed the mistaken equality between Palette semantic Hash and Case byte Hash without weakening either closure. | `BWMI-CF-22` implemented for Case-present targets |
| Fixed palette colors are probabilistic image-generation outputs | In local CASE-054, World Plan Subject-1 exact `#E85D5D` pixels measured `0/79`, then `3/79`, `4/79`, and `1/79`; only a further compensation inside the final repair cycle passed. The target was semantically and geographically present, but lighting/antialiasing repeatedly shifted the RGB. This can consume the whole Planner repair budget even when the plan is otherwise valid. | `BWMI-CF-27`: deterministic palette-critical representation without blind Host color stamping or gate relaxation |
| A target absent from opening has no stable per-view evidence disposition | Case derivation can omit a non-Subject whose opening identity mask is absent/weak, while Builder/Package require exact Case-group bijection and world-side/top-down lack target-level semantic observations. Making every target mandatory in opening would be stricter than the old branch; dropping the target loses complete-world identity. | `BWMI-CF-24`: unique Case target row plus `not-required | presence-required | reference-projection-required` per view |
| Immutable input does not admit WebP | Candidate source freezing supports its current decoded media set but still rejects WebP; reference-image parity therefore remains incomplete even though byte identity is closed for supported formats. | `BWMI-CF-25` |
| External repair terminal behavior is not yet fully aligned | CF-26A now freezes ordinary Run/Capture purpose independently of Profile and passes the source-repair failure matrix. Old Cloud router additionally retries definite terminal task failures (default 3, task-timeout 2), which current same-id recovery has not restored. This is not a reason to retry unknown/pending requests or Host quality rejection. | `BWMI-CF-26A` code/focused; `BWMI-CF-26B` open; no second ordinary outcome mode is allowed |

### 9.4 Newly explicit styled-image, video, and publication gaps

| Finding | Current/historical evidence and user-visible impact | Recorded owner |
|---|---|---|
| Current styled images can claim a false semantic pass | `run-gemini-visual-pipeline.py:321-332,394-462` generates opening and tri-views in parallel; tri-views consume the user frame, whitebox opening, and target whitebox, not an accepted styled opening. The two finalizers only check file signatures/Hashes and then write `status: passed`; the styled tri-view manifest nevertheless calls the opening its `appearanceSource`. The current manifest also drops fixed Front/Right/Back direction semantics. Identity/material, pose, geometry, or panel mirroring can drift while all files pass. | `BWMI-CF-16`, then `BWMI-PROD-10/30` |
| Raw Seedance output can be normalized from severe failure into technical success | `run-seedance25-reference-video.py:266-320,494-517` accepts an audio stream, scales/pads arbitrary aspect, and uses `tpad=stop_mode=clone` to reach the requested duration before writing `status: succeeded`. A short frozen clip or large black bars can satisfy exact final frames/size/audio. | `BWMI-CF-17`, expanded `BWMI-PROD-40` |
| CLI and Studio disagree on reference-image roles | The CLI manifest/prompt treats the raw user frame as `@图片1` and whitebox tri-views as supplements; Recording Workbench submits styled primary tri-view as `@图片1`, styled opening as `@图片2`, then other styled tri-views. The same assets can therefore drive different identity, appearance, pose, and camera interpretation. | expanded `BWMI-PROD-00/40`; `BWMI-CF-08` for the adjacent ID bug |
| Six mechanically healthy captures need executed visual-coverage admission | Historical health checks intentionally did not judge destination, route, camera creativity, or exploration quality. Without a separate executed coverage receipt, six clips can repeat one area, face a wall, crop the Subject, or omit the landmark while passing movement/support/drop/stall checks. Per-frame Camera telemetry existed historically and must be identity-bound, not discarded. | expanded `BWMI-PROD-20` |
| Timed events are not bound to what is actually visible | A useful Event Director must consume the executed segment, accepted styled review, and exact event marker; otherwise it can animate an off-screen target, change root motion/camera, or invent an event from the Brief. | expanded `BWMI-PROD-40` |
| Event/prompt semantics are not frozen as provider-neutral inputs | The old Director coordinated event diversity across segments 0/2/4, while the old Seedance prompt explicitly constrained reference precedence, shooting side, crop/occlusion, visible-target whitelist, conditional tri-view use, movement-medium contact, event continuity, and no music/speech/new entities. Current's shorter manual prompt and request do not bind an equivalent template identity. Historical provider/model constants are not public authority. | expanded `BWMI-PROD-40`: event-set Profile plus prompt template version/hash |
| No independent semantic diagnostic exists for final video | Current and historical runners both declare success after provider completion plus media conformance. No owner checks shooting side, crop, occlusion, perspective, identity/material, contact/sliding/intersection, event timing, hallucinated targets, music, or speech. Exact old outcome parity means a new Reviewer must remain advisory/strict-only rather than adding an ordinary production veto. | `BWMI-PROD-45` independent Video diagnostic Reviewer |
| Repair immutability is too coarse | The prior ledger protected other variants, but not already-passing images inside the failing variant. Regenerating a whole variant for one bad tri-view can randomly change its accepted opening, Subject, material, and other targets. | expanded `BWMI-PROD-10/30` image-level pass ledger |
| Historical cloud publication was not atomic or exhaustive | The old publisher sampled only a few objects, then overwrote two mutable `latest` objects independently; its release identity did not close over every media/manifest Hash. A partial upload or pointer race could expose a mixed release. | expanded `BWMI-PROD-50/90`: immutable full-object manifest plus one atomic pointer |
| Historical style semantics can be mistaken for faithful reconstruction | The ten-style Director intentionally consumed whitebox authority and permitted source-identity replacement. A visually attractive diversified variant is therefore not evidence that the original reference was faithfully reconstructed. | `BWMI-PROD-00` closed appearance mode plus faithful-baseline rule |
| Per-variant Episode frame closure was underspecified | Historical output was six styled segment frames per variant: immutable Segment-00 anchor followed by five frames spatially bound to Segment-01..05, plus shared target tri-views. A generic “opening/tri-view closure” could accidentally implement only one frame per variant. | expanded `BWMI-PROD-30`: `N x 6` frame set and per-image Hash/repair ledger |

The old branch's entry-first planning dependency, staged styled-opening admission, explicit tri-view direction,
executed Camera dataset, event visibility rules, and image-level repair set are valuable behavioral inputs.
They are not direct-port authority: every item above is re-owned under current Native/Runtime/presentation
boundaries, and old provider/deployment fields remain rejected.

## 10. Dimension coverage

| Dimension | Status | Evidence boundary |
|---|---|---|
| D1 positioning and scope | checked | Reconstruction boundary, downstream presentation boundary, and intentional non-migrations were classified. |
| D2 Schema / AI-friendly | checked | Planner/Builder outputs, parameter names, `visualTargetId`, discriminators, identity and provider-boundary differences were sampled. |
| D3 promise vs fact | checked | Live backlog, WRC/NBR designs, current executable paths, old Skills, and branch files were cross-compared. |
| D4 single authority | checked for migration risks | Support, Camera, Capture, Scene Source, Package, and provider-journal owners were mapped. This is not a full correctness review of all Runtime code. |
| D5 engineering quality | checked | Determinism, stack depth, UI bounds, direct capture, failure/recovery, and Skill executability were inspected. |
| D6 gates and evidence | checked | Every claim is labeled static/current/historical; missing Browser/visual/manual/full-test evidence is explicit. |

## 11. Completion boundary

The original review closed documentation discovery. Candidate `58e7ebd5` implements the specifically
identified Planner/Builder/palette/outcome subset, but it does not complete NBR-20/70/80/90, WRC-SR-1/2,
WRC-CAM-1/2, P0.4, GPR-0/1/2, or WRC-1, and it does not close `BWMI-CF-24..26` or the downstream production
chain. The executable carry-forward graph and every non-migration decision are recorded in the live backlog.
Any later implementation must start from current contracts, focused RED evidence, and the exact owner listed
there; the old branch is behavioral evidence, not a code-integration source of truth.
