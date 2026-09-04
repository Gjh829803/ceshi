# `block-world-main-integration` production-chain alignment review

## 1. Review metadata

- Mode: B, semantic branch-integration review, with D1 added because the question is about the end-to-end
  product boundary rather than a textual merge.
- Incoming reference:
  `origin/codex/block-world-main-integration@9e35ab53c634acaef8c53a33082fff77653f7bbb`.
- Current authority:
  `origin/main@20fe0fef60d8c73fd8c8ce2cecb541117cddd1f8`.
- Merge base: `7fa3197220ef6b8b1ad86f57fc85f8b3e248e0c3`.
- Review question: whether every stage, parameter contract, and Skill from user input through final
  production termination is aligned in current `main`.
- Evidence level: static source/contract/Skill comparison. No Browser, rendered-visual, manual-interaction,
  repository-wide test, or real cloud production evidence is claimed by this review.
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

## 2. Executive verdict

The answer is **no**. Current `main` does not have byte-for-byte or parameter-for-parameter parity with
the historical branch, and it should not: the current Babylon Native lane is a current-only clean-break
replacement for the old Three.js Block Source, Manifest, Compiler, hidden foundation, preset-derived
Physics, and Builder-owned Subject/Camera dialect.

For the whitebox reconstruction boundary, current `main` is mostly a stronger semantic replacement:

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
  -> preview-ready or passed publication
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
| Unified Planner | `scripts/agents/run-canonical-world-agent.sh` submits one formal Planner task, receives Brief plus named plan images, permits at most three same-task self-repairs, then replays the checker once. | **semantic alignment with changed parameters**: the task boundary survives, but the current Brief has exactly one movement mode, no fixed four-times map-area rule, and different image-color responsibilities. |
| Planner input freeze | The Native wrapper initially hashes image bytes, but the Planner receives the original paths and Case preparation later rereads them. Planner Host replay also invokes the live checker rather than an immutable checker identity carried in the receipt. | **partial**: useful current flow exists, but source-byte and checker TOCTOU closure remains open. |
| Host Case/Profile preparation | `native-world-case-preparation.ts` derives and freezes Case, Profile, Bootstrap, Capture Intent, named Planner images, reference hashes, Native API/Profile, Builder Skill, output contract, and checker. | **current-only superseding stage**: the old branch had no equivalent Case/Profile/evidence closure. |
| Builder attempt 0 | Current formal output is exactly `scene.ts`, `native-block-authoring.json`, and `native-resources.json`. | **changed contract**: replaces old `world.mjs` plus Host-derived Three/Compiler artifacts. |
| Builder self-check / Host replay | The Builder uses its bundled checker and bounded source-only repairs; the reconstruction Host replays the frozen checker from the Case input. | **aligned and strengthened** for Native Builder. |
| Native Check | Native source, authoring manifest, resources, API use, IDs, shapes, lattice, budgets, visual groups, and explicit contribution declarations are checked before admission. | **semantically supersedes** the old Block checker; old package is intentionally absent. |
| Ground Analysis | Current Host binds logical ground, Capsule footprint/clearance, Spawn, target standability, topology, traversal bands, blocked segments, and repair diagnostics to the Case/Package inputs. | **semantically supersedes and strengthens** old footprint/reachability checks. |
| Package and Receipt | One mutually exclusive Native Scene Source is packaged with Frozen Contributions and complete identity joins. | **changed contract**: old Manifest/Block Compiler/hidden foundation must not return. |
| Formal Capture | Current owner produces `opening`, `world-side`, `world-top-down`, collider overlay, support/Spawn observations, and scripted traversal evidence from the admitted Package. | **stronger whitebox evidence**, but historical startup-progress watchdog and some capture UX/performance work are not present. |
| Seven-dimension Evaluation | Current dimensions are `collider`, `critical-traversal`, `deterministic-build`, `opening-composition`, `semantic-silhouette`, `spawn-support`, and `topology`. | **new stronger contract**; the old branch had visual comparison/review, not this identity-bound evaluator. |
| Diagnostic repair | Strict mode uses initial Attempt plus at most three new-identity external repairs; each Builder task separately has bounded source-only self-repair. Report-only stops after the first complete quality observation. | **changed contract** and intentionally not a literal port. |
| Whitebox preview/publication | Report-only may end `preview-ready / not-accepted`; only a passed strict Run is atomically promoted. The default production command skips only the final duplicate fresh Browser replay. | **aligned intent with stronger current identity semantics**. NBR-70/80/90 remain open. |
| Base styled opening and tri-views | Current scripts can create a styled opening and tri-views, but they are separate/manual or Canonical-oriented; finalizers mostly validate files/hashes and do not reproduce the old independent semantic visual review. | **partial, not equivalent**. Native reconstruction does not automatically execute the old Visual Reconstructor Skill. |
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
| Movement description | one or more modes | exactly one standard/custom mode | intentional clean break |
| World extent | at least four times the opening area | meaningful entry/middle/remote/off-camera continuation; no fixed padding ratio | intentional clean break |
| Planner image palette | semantic cube colors in both images | `world-plan.png` palette-free; entry target uses Host-owned identity-color order | intentional clean break |
| Builder outputs | Three `world.mjs` and derived Manifest/Authoring/implementation artifacts | exactly three Native files | intentional replacement |
| Block profile | four old fixed shapes and create-then-position authoring | five shapes including `step`, axis-specific lattice, atomic center/rotation, deterministic grid | current contract stronger |
| Native Host default caps | no equivalent NBR Request closure | 2,000 Blocks, 1,800 seconds, 4,000,000 output bytes plus closed request budgets | current-only authority |
| Walkable height | fixed 1 m automatic smoothing, independent up/down thresholds, global 2 m adjacent-height veto | visible 0.25 m tread decomposition validated against current 0.3 m step and 42 degree slope owners | old constants explicitly rejected |
| Quality mode | no current NBR equivalent | `report-only` or `required-for-publication`; maximum repair count 3 | current-only authority |
| Attempts | Builder-local repair and infrastructure retries | Attempt indexes 0..3; strict external repair only; report-only has no external repair | changed identity model |
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
- `report-only` does not consume external diagnostic-repair Attempts for quality findings. Only an
  explicit `required-for-publication` Profile may do that; both modes still fail closed on structural,
  identity, Runtime, or cleanup failures.

## 5. Skill alignment

| Skill at historical branch | Current disposition | Verdict |
|---|---|---|
| `worldkit-spatial-planner` | present, materially rewritten for closed Canonical/Native profiles, exactly one movement mode, provenance separation, palette-free World Plan, and current output checks | changed contract, not byte-aligned |
| `worldkit-block-builder` | replaced by `worldkit-native-block-builder`; Three.js, Manifest, Compiler, hidden foundation, and Builder-owned Subject/Camera are forbidden | intentionally superseded |
| `worldkit-visual-reconstructor` | no equivalent Skill/runner; current styled scripts do not preserve its full semantic review/repair responsibilities | partial/missing |
| `worldkit-playthrough-planner` | no current Skill, checker, or executable call path | missing |
| `worldkit-episode-visual-reconstructor` | no current Skill or executable call path | missing |
| `worldkit-style-variant-director` | no current Skill/checker/runner | missing |
| `worldkit-style-variant-visual-reconstructor` | no current Skill/runner | missing |
| `worldkit-style-variant-visual-reviewer` | no independent current review Skill/Host finalizer | missing |
| `worldkit-style-variant-diversity-reviewer` | no collection-level current review Skill/Host finalizer | missing |

The current Native Builder Skill itself is live and wired: Case preparation freezes its Skill, output
contract, and checker; Generation Request hashes them and declares only the three Native outputs; Host
admission uses the Case-frozen checker. Its representative `cloud-temple-t-gate-native-block` copies are
byte-identical to the current live files. This says nothing about the seven missing downstream Skills.
Likewise, “Planner aligned” in this report means its task/output/checker call topology is wired; the current
self-check structurally parses the Brief/PNGs and checks the entry identity marker, but does not constitute a
semantic rendered review of complete-world topology or reference-image fidelity.

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
- Revalidation: current call and reread paths confirmed; adversarial mid-run mutation tests are not yet
  present and the gap is recorded as `BWMI-CF-09`.

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

## 9. Dimension coverage

| Dimension | Status | Evidence boundary |
|---|---|---|
| D1 positioning and scope | checked | Reconstruction boundary, downstream presentation boundary, and intentional non-migrations were classified. |
| D2 Schema / AI-friendly | checked | Planner/Builder outputs, parameter names, `visualTargetId`, discriminators, identity and provider-boundary differences were sampled. |
| D3 promise vs fact | checked | Live backlog, WRC/NBR designs, current executable paths, old Skills, and branch files were cross-compared. |
| D4 single authority | checked for migration risks | Support, Camera, Capture, Scene Source, Package, and provider-journal owners were mapped. This is not a full correctness review of all Runtime code. |
| D5 engineering quality | checked | Determinism, stack depth, UI bounds, direct capture, failure/recovery, and Skill executability were inspected. |
| D6 gates and evidence | checked | Every claim is labeled static/current/historical; missing Browser/visual/manual/full-test evidence is explicit. |

## 10. Completion boundary

This review closes documentation discovery, not implementation. It does not complete NBR-20/70/80/90,
WRC-SR-1/2, WRC-CAM-1/2, P0.4, GPR-0/1/2, or WRC-1. The executable carry-forward graph and every
non-migration decision are recorded in the live backlog. Any later implementation must start from current
contracts, focused RED evidence, and the exact owner listed there; the old branch is evidence, not an
integration source of truth.
