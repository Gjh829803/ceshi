# Block World production outcome parity design

Status: Frozen by explicit product decision on 2026-09-04.

Historical implementation checkpoint: `codex/block-world-effect-alignment@234c1711` implements the Scene-scope
outcome split and focused integrity closure. It is an unmerged candidate, not current `main` evidence;
CASE-054, full Browser, repository-wide, and exact-SHA Cloud gates have not been rerun on it.
This statement records that checkpoint only, not the latest branch status. Current
commits, Case outcomes and outstanding CI/review evidence are recorded exclusively
in [the progress ledger](../../18-refactor-progress-and-backlog.md).

## 1. Decision

2026-09-07 CF-20/MEM4 amendment, explicitly approved by the user: the Native Block
Profile records immutable intent and clusters before allocating visual Meshes, as
the pinned old compiler does. `createBlock`/`createBlockGrid` return frozen canonical
inputs, not immediate Mesh handles. The existing Native Source, explicit Collider
boundary, logical Block identities and SDK Runtime owners remain. Profile/Host
settlement binds actual cluster Meshes and every explicit Collider join; Capture
retains exact logical membership. This replaces the former per-Block allocation
contract, not production policy. No count cap, new gate, hidden ground, alternate
authoring source or extra repair task is authorized by this representation change.

The current Babylon Native implementation keeps its architecture, ownership, deterministic evidence,
and atomic publication. All non-architectural production behavior follows the successful historical
`codex/block-world-main-integration@9e35ab53` workflow, including its stage order, requested-scope
completion rules, retry/resume behavior, and final success/failure meaning.

There is exactly one user-facing production status:

```text
productionOutcome = every required historical-equivalent stage in the requested scope completed
  ? passed
  : failed
```

Current-only Evaluation and NBR verification remain valuable but have a separate authority:

```text
strictDiagnosticOutcome = passed | failed | incomplete | not-run
```

`strictDiagnosticOutcome` never overwrites `productionOutcome`. It can block an explicitly requested
NBR-70/NBR-90 or strict acceptance workflow, but it cannot block ordinary production publication.

## 2. Boundaries retained from current architecture

CF-29 Capture provenance clarification (2026-09-05, authorized legacy-parity correction):
legacy `9e35ab53` scene Capture did not reject documentary worktree edits. Current Capture must
not turn edits to the live progress document or Markdown specifications, plans and reviews into
ordinary-production failures. The SDK owner implementation remains identified by trusted commit;
its source-state check excludes only `docs/18-refactor-progress-and-backlog.md` and Markdown under
`docs/superpowers/specs/`, `docs/superpowers/plans/`, and `docs/reviews/`, which are not execution
inputs of this Capture path. All other tracked inputs remain checked, including SDK code, build
configuration, lockfiles, resources, live Skills and frozen Skill copies. This is a narrow correction
to an over-broad check, not a new dependency scanner, global Markdown exemption, provenance bypass,
quality threshold or generation retry. Renaming an implementation file into documentary scope
must still expose the original source deletion. Any future execution dependency on these documents
must update this boundary, not silently consume excluded mutable input.

CF-22/19 clarification (2026-09-05, authorized legacy-parity correction): old
`9e35ab53:packages/block-world/src/check.ts:706-718` requires a visual group only for landmark
identity presets, not all ordinary functional scenery. Native `structure`, `hazard`,
`water-like-visual` and `background-mass` are functional palette roles, not selected-target
identity colors. They may remain ungrouped like ground and route. Remove the extra Native
role-wide `VISUAL_GROUP_REQUIRED` veto; do not manufacture Case identities or attach ordinary
scenery to an unrelated target. Existing Case/manifest/actual-group bijection, non-empty declared
targets, palette identity, source safety, geometry, and explicit Collider admission remain mandatory.
This does not permit missing a requested landmark or infer collision from a visual-only Block.
Task feedback and Host checks must accept the same ordinary/grouped distinction; a passing portable
output-shape check is still not a claim that full Native admission ran inside the Builder task.

CF-19/29 type-feedback clarification (2026-09-05): task preflight may run semantic TypeScript checking
using the same Host compiler options and a build-generated snapshot of the installed SDK and type
libraries. It is advisory, evaluates no SDK/module code, creates no Candidate and cannot grant admission.
Compiler/type-context bytes travel inside the existing frozen checker input and inherit its Request Hash
and drift checks. Do not write a second handwritten API contract or rely on task-local node_modules.
Preserve bounded/redacted compiler code, source-relative location and actionable text. Type errors use
the same existing in-task structural/visual repair counter; every source edit invalidates prior checks
and comparisons. Host admission still rechecks source independently. Ordinary Host failure remains
terminal; this change adds neither a stricter publication verdict nor an external generation attempt.
The existing disposable renderer additionally reuses Profile shape/lattice/occupied-cell functions
for in-task overlap feedback. It does not recreate a Scene, persistent Layout or Physics owner;
unsupported structures remain advisory, and full Native/Ground admission remains Host-owned.

CF-19 bounded overlap feedback (054 frozen replay, 2026-09-05): preserve the legacy
ability to see several geometric conflicts in one shared repair cycle. The existing
restricted renderer reports at most 32 distinct overlapping Block-ID pairs in
deterministic discovery order, with one representative occupied cell per pair.
Repeated cells must not grow the diagnostic collection; the response states when
the bound prevents complete enumeration. Any overlap still rejects rendering and
writes no comparison PNG. This changes feedback completeness, not legal geometry,
the three-cycle budget, the static checker boundary or production success policy.

CF-19 task-instruction/visual-completion clarification (2026-09-05, authorized legacy parity):
old `9e35ab53:scripts/agents/run-spatial-world-agent.sh` supplied the exact Skill and checker/renderer
commands plus the view/repair/recheck loop in the submitted instruction, not only in an attached
Skill. Native case preparation must do the same with the actual isolated `inputs/builder-skill/`
paths. The old completion condition is a passing fresh structural self-check and actual inspection
of both latest comparison PNGs, with at most the same three combined structural/visual repair
cycles. Remove the extra Native requirement to declare the images "judged aligned" before delivery.
Material visible differences still trigger source repair while the shared budget remains; exhausted
visual budget alone must not withhold otherwise valid outputs or create a new task. Remaining visual
limitations belong in the existing final response, not a new output report or Host similarity gate.
This corrects prompt delivery and completion semantics; it is not evidence of equal image quality or
proof that the missing instruction caused every observed 054 difference.

- exactly one Canonical or Babylon Native Scene Source;
- Native Module owns visuals and explicit Frozen Contributions only;
- Host/SDK exclusively own Engine, Scene, Havok, Subject, Camera, Input, fixed Tick, Action, Reset,
  lifecycle, Package, Capture, and publication;
- no Mesh/tag/name/color inference creates Physics or Gameplay truth;
- no Three.js Block Source, legacy Manifest/Compiler, hidden foundation, compatibility alias, or
  parallel V1/V2 outcome path;
- final files are still staged, hash-verified, fsynced, and atomically renamed. This strengthens transport
  safety without adding a semantic success gate.

## 3. Requested scopes and exact terminal meaning

### 3.1 Scene scope

The following are blocking historical-equivalent stages:

1. Planner Brief, entry target, World Plan, self-check, and one Host replay;
2. Builder source, structural self-check, mandatory entry/top-down visual comparison inspected inside
   that Builder task, and one Host replay of derived data and decoded pixels;
3. current Native Check, Ground Analysis, and Package as the Babylon Native replacements for the old
   compiler/buildable-world closure;
4. Babylon opening/tri-view Capture, Runtime evidence, and third-person entry validation;
5. when a reference image is present and the requested scope includes base styling, styled opening and
   all declared styled tri-views with the historical input-role/hash/file checks.

If a downstream optional visual step fails, an already admitted playable whitebox remains passed and
launchable. The requested top-level scope fails until its own required artifacts close; it does not mutate
the upstream whitebox outcome.

The historical base Visual Reconstructor had same-task self-review followed by Host file/hash/role
closure; it did not have a separate semantic Reviewer. Those same-task and Host checks remain blocking for
a requested base-style scope. Any new independent base semantic review is a strict diagnostic only and
cannot introduce a new ordinary-production veto. This differs from the per-variant Reviewer in the Episode
visual-sample scope below, which was present in the old workflow and remains part of that requested scope.

CF16's current prompt bundle retains `kind: worldkit-visual-generation-prompts`
and only schemaVersion 2, with exact top-level keys kind/schemaVersion/sceneId/
openingFrame/styledTriviews. Restore the old opening roles
`[actual-whitebox-opening, user-first-frame]`, tri-view roles
`[target-whitebox-triview, styled-opening-frame, user-first-frame]`, minimum prompt
lengths 200/150, and exact Capture target identity/order. Do not retain the old
schema-1 alternative. The old `provider: lwdp-codex` field is removed from this
provider-neutral task artifact: actual local/cloud routing belongs only to the
sole router's TaskReceipt, so a local task never claims LWDP execution. This is
an architecture adaptation, not removal of role/target checks or a new visual
quality gate. Producer, Skill and Host consumers activate this clean break together;
the prompt artifact alone does not prove actual image inspection or anchor use.

### 3.2 Episode visual-sample scope

The historical equivalents are blocking: reconnaissance, navigation evidence, plan, six whitebox
segments, capture health, exactly ten opening anchors, per-variant visual generation and independent
review, and collection diversity review. Historical retry budgets remain `3` capture attempts, `4`
opening-anchor attempts, and `2` per-variant visual attempts. Passing variants and images are immutable.
The terminal outcome is passed only at `10/10` visual-passed variants.

### 3.3 Episode full scope

Visual-sample closure plus per-variant event plan, video prompts, six video generations, and historical
technical conformance are blocking. A failed variant does not stop sibling work, but the aggregate terminal
outcome is passed only at `10/10` succeeded variants. Provider/model/deployment names stay behind adapters;
the observable retry, resume, and terminal rules are preserved.

An independent semantic Video Reviewer is a current strict diagnostic because the old workflow did not
have one. Its finding cannot change ordinary production success.

## 4. Current check disposition

| Current check | Ordinary production authority | Strict authority |
|---|---|---|
| Native syntax/API/Profile, explicit Block/Collider/Surface admission | blocking; required to build the architectural replacement | also recorded |
| Ground/Package/Capture availability and identity needed to launch | blocking; historical build/capture equivalent | also recorded |
| historical-equivalent entry validation and required artifact freshness | blocking | also recorded |
| seven-dimension reconstruction Evaluation | verdict is diagnostic and repair input only; a missing, malformed, stale, or identity-invalid required Evaluation artifact is an integrity failure | blocking only in explicit strict acceptance |
| NBR-70 exact Case/Formal/Contribution blocker join and optional playability replay | diagnostic in ordinary production | blocking only in explicit NBR-70/NBR-90 verification |
| new independent base-image semantic review | diagnostic; old base path had same-task self-review plus Host file/hash/role closure only | blocking only when explicitly requested as strict visual acceptance |
| independent final Video semantic review | diagnostic | blocking only when the caller explicitly requests strict media acceptance |

The code for every strict check remains. Historical ordinary-production thresholds and stage requirements
are preserved; newer stricter thresholds are not promoted into ordinary-production vetoes. No compatibility
fallback is added. Only the authority that converts a strict result into the ordinary production terminal
outcome changes.

## 5. CASE-054 normative example

For the normative projection of
`paper-moon-palace-054-report-only-0904/run-20260904134439-41905`:

```text
productionOutcome: passed
publicationOutcome: published
evaluationOutcome: passed
strictDiagnosticOutcome: failed
strictDiagnosticCodes:
  - NBR70_BLOCKER_IDENTITY_MISMATCH
Studio status: ready
Studio outcome: passed
```

Under this contract, the final Package/Capture/Evaluation is atomically published and launchable. The
blocker mismatch remains visible and continues to fail an explicit strict NBR verifier, but cannot close the
production task.
The original run was produced on `main@20fe0fef` and did not publish Final under the superseded policy;
the values above are covered by candidate fixtures, not by a second real CASE-054 run.

## 6. Current-only contract change

- remove `preview-ready / publicationStatus: not-accepted` as the final authority for a complete playable
  ordinary production run;
- publish a closed `strict-diagnostic` receipt beside the final artifacts and bind its Hash into the launch;
- expose `productionOutcome` and `strictDiagnosticOutcome` separately in CLI/Studio;
- do not retain an old and new outcome parser, boolean switch, environment toggle, or compatibility alias;
- delete the superseded preview result types, Studio projection, publisher bypass, duplicate verifier call,
  and tests whose only purpose was the removed outcome authority; retain only reusable evidence/integrity code;
- cancellation, missing required artifacts, stale identities, unsafe paths, failed Native build/Capture, or
  failed atomic publication remain production failures.

## 7. Acceptance

- a fixture equivalent to CASE-054 publishes and returns production passed while strict diagnostics carry
  `NBR70_BLOCKER_IDENTITY_MISMATCH`;
- a missing/invalid Package, Capture, entry validation, required styled artifact, Episode segment, variant,
  or final video still fails the matching requested scope;
- strict verifier pass/fail/incomplete/not-run all serialize deterministically and survive final publication;
- explicit NBR-70/NBR-90 commands still fail on the same strict defects as before;
- Stage resume never repeats a completed paid provider Job and never changes passed artifact Hashes;
- no final directory becomes visible before every required object and its identities are durable.

## 8. Planner execution identity (CF-09)

Execution mode is main-agent-only/sequential; the sole owner is
`scripts/agents/planner-execution.ts`, consumed by the existing Planner shell and Native Case launcher.
This closes CF-09's input-identity prerequisite for CF-31, not the full stage-resume workflow.

- Before dispatch, persist one exclusive `planner-executions/<task-id>/` directory with the actual
  instruction, a source-selected workspace (Planner Skill, checker and references; Canonical additionally
  includes its terrain exemplars), and a closed Host request. The request binds scene/source/task/router
  request identity, instruction Hash and the exact sorted per-file context inventory. No credentials or
  unrelated checkout files enter that workspace.
- Both local and Cloud dispatch use that workspace through the existing generic task router. There is
  still one Planner task and the historical same-task self-repair budget. No image, presence, quality or
  runtime-admission threshold changes here.
- Host verifies the frozen request/context and replays its checker exactly once after delivery, with the
  profile's original arguments. Exact Agent/Host report equality remains required. The bundled checker
  already owns Brief parsing; do not run an additional live Brief parser as a second replay gate.
- Persist the Host report even on rejection. Only a matching successful replay writes the immutable
  per-task receipt and updates `planner-execution.json` to select that accepted task. A receipt binds
  request Hash and planner-self-check Hash, so a scene id or reused filename alone is not resume proof.
  Never overwrite a task's prior snapshot/report with different bytes.
- Native Case directory replacement carries the accepted execution directory and receipt forward. Case
  reuse checks its already-bound Planner report against this receipt; Canonical build-only runs the
  selected frozen checker, not whichever checker is now in the checkout. Do not fabricate receipts for
  historical Cases that never recorded this identity or silently fall back to live source.
- Required evidence includes live checker/Skill/instruction replacement, context tampering/symlinks,
  stale identity/report, local task isolation, report retention, and Case promotion. Real model/Cloud
  execution remains a separate evidence layer.

The historical shell also reread live checker files. The change above is a current-architecture identity
safeguard, not a claim that the old branch had immutable checker snapshots or grounds for stricter
ordinary visual success.

## 9. Native staged production and recovery records (CF-31)

Execution is main-agent-only/sequential. The public entry and Native launcher own stage selection;
Generation preparation owns the frozen dispatch record; the existing Run/Attempt journal and ports
remain the only future Host-resume state owner. This is not a second production pipeline.

- `agent:world --plan-only` performs the existing Planner and Case-freeze stages, then returns a
  `native-world-plan-result` with `phase: plan-ready`. It never launches Builder. This phase means an
  admitted planning input, not a playable, captured or published scene.
- `agent:world --build-only` requires that admitted Case and its accepted Planner receipt. It uses the
  existing frozen references and does not require the original upload path or a new prompt. New images
  and conflicting stage flags are rejected; a missing plan never causes an implicit paid Planner task.
  Build-only starts Builder and the ordinary production chain. It is not Host-only recovery.
- Generation preparation atomically writes the same complete input byte snapshot to disposable
  `.task/inputs` and durable `attempt/inputs`, plus the same `context/` records. The durable inventory
  includes the original instruction, Brief, full Builder Skill/checker, reference media, and any
  previous-attempt source/diagnostic evidence supplied to repair. Cleanup only removes disposable
  workspace; it must not destroy the context needed to identify and replay a completed paid stage.
- `generation-dispatch.json` records backend, Generation Request/Attempt Hashes, router request id,
  exact router arguments/payload Hash and frozen owner identities. This is a Host dispatch record,
  not a new Scene Source or a replacement Generation Receipt. Do not include credentials, read live
  Skill bytes as an implicit substitute, or change the generation request's identity during replay.
- Full Host-only recovery must resume under the original Run/Attempt identity and preserve historical
  failure/cleanup evidence, revalidate its durable checkpoints, avoid resubmitting completed jobs,
  reconcile unknown POST outcomes by the original request id, and preserve already-passing artifact
  Hashes. Rejected source is evidence only until admitted through the existing checker/build owners.
  Do not fabricate a successful new Run's generation receipt from another Run's output or silently
  overwrite a terminal record. Expose `--resume-host-only` only when this continuation is implemented.

Host continuation representation (CF-31C): `reconstruct run ... --resume-host-only` is an explicit
ordinary-production execution mode of the existing entry, not a second pipeline. It acquires one
Run-scoped exclusive recovery lock and verifies the original frozen Case/Profile/Intent and owner
identities. `restoreGenerated` is a separate no-submit port: it validates the original completed
Generation Receipt/Request/Attempt/dispatch and input/source bytes, or consumes their immutable Host
checkpoint; it never invokes prepare/generate. Unknown submission can only reconcile the original id,
not allocate a replacement. Missing completed evidence and unjoined cleanup do not authorize execution.

Passed Host-stage checkpoints commit only after their artifact inventories and are checked again on
restore. A verified WorldPackage capability is reconstructed by the Package verifier, never JSON-cast.
New Host outputs use `attempts/<same-index>/host-recoveries/<recovery-index>/`; generation source,
previous failed evidence, and already-passing stage output paths remain untouched. Run receipts retain
their single existing shape and explicitly reference the selected stage artifacts; verifier and final
publisher resolve only this Run/Attempt's named artifacts, with the same integrity checks. The Run
journal appends typed `host-recovering` and `publication-recovering` boundaries, preserving historical
failure and cleanup rows. A lost publication response can verify the already-published same-identity
final instead of republishing it. These operational rules do not change production/strict quality policy.

The first two implementation steps are stage selection and durable storage. Neither constitutes the
full Host-only workflow; implementation status and focused versus real recovery evidence remain solely
in `docs/18-refactor-progress-and-backlog.md`.

## 10. Scene repair and provider retry are separate (CF-26)

There is one ordinary production standard, regardless of the Case's Evaluation Profile. The existing
Run core receives the required closed `executionPurpose: production | strict-acceptance` from its
calling workflow. The public production transaction always selects `production` for both Run and
Capture; neither a Profile, an environment variable nor a CLI compatibility switch selects a stricter
business outcome. An explicit strict-acceptance invocation may use the retained bounded diagnostic
repair machinery. It does not redefine `productionOutcome`.

The Run journal owns and persists this purpose in every row. Reopening with a different purpose,
recording an external diagnostic-repair Attempt in an ordinary Run, or reading a current journal with
no purpose is invalid. Historical journals stay historical; never infer an execution purpose from a
missing field or a Profile. Full terminal continuation remains CF-31, not an implication of this record.

| Historical Scene condition | Ordinary current behavior | Explicit strict acceptance |
|---|---|---|
| Planner/Builder structural or visual self-check fails inside its task | The same task may use its single combined three-cycle repair budget; Host delivery/replay is not another model repair loop | Same in-task budget |
| Delivered source fails Host self-check, Native Check, Ground, Package, Capture, or entry validation | End with the real failure; no new source-repair Attempt | Source-repairable diagnostics may drive the retained maximum three external Attempts |
| Required Evaluation artifact is missing, stale, malformed or cannot be produced | Integrity failure; no new source-repair Attempt | Integrity checks still apply |
| Valid newer seven-dimension/Opening quality observation reports failure | Preserve diagnostic and passed artifact identities; do not allocate a new Attempt or veto ordinary publication, even for a stricter Profile | Frozen strict Profile may require quality repair/rejection |
| Job creation outcome is unknown or the remote job is still pending | Reconcile only the original request id; never submit a replacement to conceal uncertainty | Same |
| Cloud provider task has definitively terminated with a historically retryable failure | A separate task-router retry policy must reproduce the old bounded terminal retries; it is not a Native source-repair Attempt | Same transport owner |

The last row is a distinct implementation obligation, not fulfilled by the ordinary source-repair
fix. Old `run-lwdp-codex-task.mjs:29-105,237-242,290-396` used up to three task attempts for formal
Scene stages, at most two for task timeout, and delays of 30 seconds then 120 seconds by default
(base configurable within 0..300,000 ms, capped at 300,000 ms). The old failure classifier covered
auth, account/model compatibility, capacity, output omission and infrastructure/transport errors;
deterministic unsupported-capability stops and pending jobs did not qualify. Local Codex did not use
this Cloud task-attempt loop. Preserve the one-POST-per-request rule and immutable successful outputs.
Current same-request recovery/terminal outcome normalization must gain typed terminal-retry evidence
and durable attempt accounting before that behavior can be called aligned; do not copy raw error-text
retry decisions into an unbound fallback. Activation must update the single-task guidance consistently.

CF-26B activation contract: the existing public task outcome retains the logical root request ID.
Only a typed terminal proof emitted after same-ID recovery verifies the job/request/output-prefix
identity can authorize a physical replacement request. An immutable router-owned Task Attempt ledger
records physical IDs, terminal classifications and successful output hashes; unknown creation resumes
that same physical ID. Native generation uses the existing historical `coding-agent` router stage,
not an unrecognized new stage name or a retry alias. Local execution stays single-task. One final
logical success marker is emitted; intermediate physical-job messages are explicitly attempt events.

## 11. Per-target view evidence (CF-24)

Every non-Subject palette target retains a unique Case identity, including a weak or missing opening
mask. Keep `expected.semanticSilhouetteTargets` as the single existing target collection. Replace its
flat projection fields with required `viewRequirements`: exactly opening, world-side and world-top-down
in canonical order, each with a closed `mode` of `not-required`, `presence-required` or
`reference-projection-required`. Only the last mode contains normalized reference bounds/center/coverage.
Reliable opening masks supply reference projection; absent/weak masks make opening not-required, not
a fabricated zero box. Current baseline Case preparation selects structural presence for side/top;
the source-neutral parser admits the same closed three-mode union in each view, without silently
forcing that preparation policy on every explicit Case. Every observation view still contains the
exact complete semantic-map target set, including not-required rows. Uncalibrated Planner top pixels
are not silently promoted into a calibrated Runtime camera reference.

Intent and semantic-map bindings retain composition/topology identity ownership. Case is the sole
reference-projection owner; the map carries its exact view IDs and modes, without copying reference
boxes or adding a second Intent requirement authority. A typed three-view semantic observation set binds each view to its
request hash and the PNG hash from that same capture. Each live target produces a structural projection
or a typed outside-viewport/depth result; only projected results contain screen bounds. These are
Runtime AABB projections, not visible-pixel masks or occlusion evidence. Opening consumers derive from
the same measurement, with an exact consistency check, rather than independently remeasuring a second
authority. Side and top require their own actual after-render measurement callbacks.

Presence checks confirm the Package/live target identity, not that a target must appear in all three
images. Only reference-projection requirements compare normalized bounds. Outside-view results are
observations, not Host execution failures. Malformed identity/camera/hash linkage still fails integrity;
new semantic quality diagnostics remain report-only in ordinary production and never allocate repair
tasks or veto publication. CF-12 camera calibration remains a separate obligation.

CF-14 visible-pixel activation is a current-only extension of this same Capture, not a new
model/review stage. Each existing opening/side/top transaction also returns an opaque unlit
identity PNG from the same explicit live geometry and Camera, with ungrouped geometry/Subject
as black occluders. Display PNGs remain unchanged outputs. Each view record requires distinct
`identityMaskPngArtifactRef` and `identityMaskPngContentHash`; its semantic observation repeats
that exact content hash. Hash joins, publication and recovery verify all three identity images.
Missing/stale bytes are integrity errors, never a fabricated mask or AABB fallback.

The Host decodes the bound identity PNGs and measures admitted target pixels using the same
pixel bounds/count/rounding owner as reference preparation. Semantic Evaluation consumes
`visiblePixelProjection`, with `visible` or `not-visible` outcomes, rather than rectangular
`structuralProjection` area. No pixels alone distinguish neither absence nor occlusion; do not
invent that causal label. Structural observations remain available for their genuine spatial
uses. Quality differences remain diagnostic in ordinary production, with no new source-repair
Attempt, production veto or stricter success threshold. Actual Browser evidence is required
before claiming same-camera masks, holes, repeated instances and occlusion are verified.

Pixel absence and bounds/center/coverage drift use the existing source-repair action with the
current-only operation `adjust-geometry`, not an inferred move/enlarge/shrink.
Its instruction requires comparing the bound identity and display pixels with
the frozen reference and preserving intended holes, separation and occlusion.
This does not assert a geometric cause from an aggregate pixel count. The existing
explicit evaluation-repair task receives all three identity masks, side/top display
images and semantic observations through its frozen input allowlist; ordinary
production still never allocates that external repair task.

CF-14/R2-F closes the separate Opening visual consumer. The Host derives one
opening pixel-composition projection (regions and anchors keyed by the existing
composition target) from the admitted opening identity PNG and semantic-map
bindings. Both the explicit Opening Host gate and Evaluation require this pixel
projection for visual bounds/centers. There is no structural-AABB fallback.
`FormalOpeningObservation.visualGroups` remains the structural spatial evidence:
its depth/order and distance consumers are unchanged, as are Subject and Camera
checks. A target with no admitted pixels is omitted from visual regions/anchors,
not mislabeled as missing Source geometry. Pixel-region/anchor absence and drift
use `adjust-geometry`, preserving holes and considering occlusion before repair;
the strict gate's existing unsupported diagnostic/repair allocation policy stays
unchanged. Its existing rejected-capture repair snapshot now also includes all
three identity PNGs and the semantic observation, already retained by Capture.
No new stage, quality threshold, ordinary veto, repair cycle or side/top visibility
requirement is introduced. Required evidence is identical visible pixels with
different structural bounds, actual pixel drift, absence, unchanged depth/order,
and repair-input/operation closure through both consumers.

CF-14/R2-D binds the actual walkable top overlays, not only the original Block
meshes. The existing topology owner records required `overlayPartitions` on each
geometry: deterministic partitions with exact `sourceBlockIds`, `visualGroupIds`
(empty or one group), and triangle indices into the existing overlay positions.
Solid geometries have no overlay partitions. Each source top-cell supplies both
triangles and their identity; the union covers the original walkable triangles
exactly once. No Capture consumer re-derives that identity from names or bounds.
The existing materializer emits one explicit walkableOverlay handle per partition
and preserves the original full-surface normals, placement and collision arrays.
Partitions participate in geometry/topology hashes but do not change physics,
smoothing, Collider budgets or production policy. Capture validates and colors
these explicit handles; mixed semantic and ungrouped Blocks within one Collider
remain supported, with ungrouped partitions black rather than a new rejection.

The identity attachment must be single-sample RGBA bytes, without multisample
resolve or image filtering: averaging two valid identity colors can create a third
valid identity color, so exact palette membership alone cannot reject the artifact.
Use Babylon's existing same-Camera render-target attachment with depth and the same
raster size, geometry, viewport and projection. Restore any prior camera output target,
dispose the temporary target on success/failure, and normalize framebuffer row order
without interpolation. Do not disable anti-aliasing for the user's display or change
production palette acceptance to hide this rendering defect.

### CF-11 source-authored ground exploration

Legacy `9e35ab53` Block Builder requires real middle/remote exploration
anchors and a spawn-to-middle honest-width band when every Brief movement mode
is ground-walk, ground-slide, ground-ride or ground-drive. These are authored in
the same Builder task from the frozen Brief and World Plan. Current Native restores this as pure
`groundExploration` data in the existing authoring sidecar, not a third Source,
Planner Runtime coordinates, new model task or product Route/Nav authority.

The required Case `groundConnectivity.mode` selects `case-defined` or
`source-authored`. Case-defined keeps immutable metric bands and their existing
strict bindings. Source-authored requires no pre-invented metric bands. Host
derives the existing single-component boolean from the same parsed Brief byte
snapshot used to bind the Palette semantic Hash, not from Palette mode labels
or a guessed Subject shape. All-ground intent requires one reachable component;
mixed/free-space intent permits false, including with a ground Spawn. An air
Spawn cannot require a single ground component. The required sidecar selects the
same mode. With true policy it declares distinct middle/remote stand
anchors and honest-width bands, including exact Spawn to a middle anchor. With
false policy the arrays may be empty; every declared row still undergoes validity
and actual Ground checks. Match the old target rule: false permits a standable
target disconnected from Spawn, retaining its unreachable measurement without a
target-connectivity failure or forced step-frontier repair. It does not waive
target support, clearance, exact topology or a declared band's local reachability.
True still requires both target and whole-component connectivity. Optional
evidence does not implement unsupported motion.
Each source-authored band preserves the old explicit `isBidirectional` boolean:
forward reachability is always required, reverse reachability only when true.
Authors use true unless the Brief explicitly calls for one-way traversal. The
flag binds validation intent and metadata/Package hashes; it does not create
one-way geometry or activate directed transitions. Current ground remains
bidirectional. Existing case-defined bands retain that bidirectional contract;
the Host projects true without adding a sidecar override or changing Case bytes.
There are no new distance, area or chunk minima and no image-quality veto.
The old per-band 2-256 waypoint constraint remains exact; it is not a ceiling on
the total number of exploration anchors. Parser and Ground must validate all
declared anchors rather than introduce a separate 256-target veto. Existing
output-byte, geometry and Ground cell budgets remain unchanged.
Target and band IDs are unique within their own lists, as in the old checker;
authored list order is preserved through metadata and bound by its Hash, not
rejected or silently sorted. Waypoint order remains the actual traversal course.
This does not relax ordering of derived materializer inventories or resource refs.

One shared parser/admission checks syntax and policy in the portable Builder
self-check and Host. Host binds the complete source intent through the existing
authoring/layout binding, materializer metadata and Package root, then the existing
Ground analyzer evaluates exact support, clearance and connectivity against explicit
Frozen Contributions. Ground anchors/bands have independent local IDs but may
diagnose the same Case ground obligation; they do not create visual-target rows.
The original Case/Request/Bootstrap bytes and hashes are never rewritten after
generation. Case-defined source cannot override fixed routes; source-authored source
cannot change the frozen policy. Optional arrays do not waive actual ground-Spawn
support, footprint or clearance, and do not change the existing expected-medium
failure policy.

This changes ordinary Ground input ownership to the old-equivalent declaration
pattern, not the production success authority or repair budget. R5 below removes
the ordinary generic topology/script template; explicitly declared Capture scripts
remain exact constraints, separate from the authored Ground intent. Full region/feature
measurements, strict authored route compilation and multi-medium selection remain CF-11/13/21/12;
the declaration slice alone does not prove complete parity or a new real Case.

### CF-11 checked-layout world bounds

The frozen legacy `9e35ab53` `boundsForBlocks` is the numeric baseline: union all
actual Block bounds (not just semantic targets or collision selections), use the
XZ midpoint, `max(16m, span + 9m)` horizontal size and vertical range
`[minimumY - 65m, maximumY + 16m]`. These are container margins only. The old
foundation is not restored and no floor, Collider or quality threshold is derived
from the margin. Real Brief geography and existing resource budgets still apply.

Native Host freezes one exact world-bounds policy in `world-bounds-policy.json`:
ordinary generation selects `checked-block-layout`; explicit fixed inputs select
`fixed` with concrete `worldBounds`. This replaces the former unqualified bounds
input current-only, independently of the Case's ground policy. Builder cannot edit
it or emit Package bounds. The Host resolves the checked-layout policy only after
the existing Native replay/evidence joins, before validating contributed geometry
and building the Package. Fixed generic Native does not require Block evidence.

Original Request, Host closure, journal, repair and resume bind
`worldBoundsPolicyHash`; final Package root binds the concrete computed bounds.
They are different identities, not interchangeable receipts. Ground, Capture and
Runtime continue to consume the same verified Package manifest, not a side-file
override. Policy changes fail existing stale-owner checks; Source changes naturally
change checked extents and Package identity. There is no compatibility input alias,
new model task, extra repair cycle or new ordinary production veto.

### CF-14/24 whole-world inspection framing

Formal side/top inspection frames the complete checked Block inventory, including
ungrouped visual-only and off-camera scenery. Package container margins are not
visible-world extents: keep CF-11's legacy-equivalent container bounds unchanged.
One Host derivation supplies both Request creation and Package/Request admission;
its inputs are verified materializer Block centers and effective axis-aligned sizes,
not mesh-name/tag scans, semantic groups or Collider selections. Preserve the existing
minimum inspection spans (8m X/Z, 4m Y), centered on the actual Block union. This is
camera framing only, never required world geometry or a new production quality gate.
Opening Camera, Subject owner, render fitting, output count, retries and ordinary
publication criteria are unchanged. Request/Receipt hashes bind the new framing.

The frozen legacy artifact-capture uses actual renderable target extents rather
than compiler container margins (9e35ab53, artifact-capture.ts:315-340). The Native
adaptation obtains extents from trusted checked metadata instead of entity/Mesh
discovery. This fixes whole-world inspection, not legacy per-object tri-view parity,
visible-pixel completeness, or Subject/Camera multi-mode acceptance.

### CF-11 ground obligations are not visual identities

Ordinary production must not create `entry-ground-group`/`remote-ground-group`
semantic targets or require a second floor Collider merely to represent a template.
The single `ground` acceptance obligation binds the required Spawn support Collider
and the existing authored Ground exploration checks, not a visual group, material,
topology node, scene feature or fixed geographic partition. Builder selects actual
floor Blocks/Collider Groups explicitly and may contribute further required surfaces.
All authored middle/remote anchors, honest-width bands, exact Spawn support and
the single-component policy stay mandatory. Full Brief geography remains required.

Only non-Subject identity targets selected from the actual palette become semantic
silhouette/Intent bindings. A Subject-only palette therefore has an explicit empty
target set, not a fabricated landmark. Required Case/Profile/Intent/metadata/live
registry collections preserve exact empty-set equality; missing fields, undeclared
groups and missing observations for declared targets remain invalid. Capture still
renders the entire actual world and SDK Subject, all four images, live explicit
Collider overlay and Spawn support. Empty semantic/topology obligations report
incomplete evidence, not complete-world quality or strict acceptance. Ordinary
publication and repair budgets are unchanged. Complete scene-feature/region
coverage remains CF-11/21 and is not implied by removing the template.

### CF-11 ordinary Capture has no invented traversal script

CF-04/T1 opening timing amendment (2026-09-07): the paused old-branch opening is
the reset/render-ready state, not a state advanced by a synthetic neutral Tick.
The Formal provider captures all opening/identity/orthographic/tri-view images
from that same state before the existing neutral support-sampling Tick. Camera
and Physics retain their current single owners; rendering never advances them.
`FormalSpawnSupportObservationV1` keeps `resetReadySnapshot` and its Hash joined
to the Capture receipt, and now requires `sampledSnapshot` and its Hash for the
actual support measurement. The sample belongs to the same Runtime/world and
the immediately following neutral Tick; its committed movement medium is used
for support observations. No old-shape fallback or relabeling of a Tick is
allowed. The existing support sample is reordered, not duplicated; no new model
task, ordinary gate, retry, support algorithm or extra simulation Tick is added.
All consumers parse and hash the current observation shape together. Explicit
scripted traversal retains its existing independently reset sampling sequence.

Ordinary baseline preparation does not invent a straight 12m route, 300 Tick
input sequence, remote checkpoint or topology relation. Ground's actual authored
anchors and bands remain mandatory and independent of Capture scripts. Explicit
Case-declared scripts continue to mean exactly the declared work.

Required arrays are exact requested sets and may explicitly be empty: Case
criticalTraversalChecks, Intent checkpoint criteria/topology relations, semantic
traversal bindings and Capture request/observation checks. Empty is not a missing
field or a successful route proof. The provider performs no route reset/input for
zero checks and binds its empty observation to the Capture ready Snapshot; all
image/Spawn/Collider/identity outputs remain required. Nonempty declarations retain
their complete exact observations, independent resets and unchanged Tick budgets.

Evaluation marks undeclared critical traversal incomplete using the existing
missing-evidence diagnostic attached to Spawn support. Ordinary production outcome
is unchanged by that strict diagnostic. Explicit NBR strict acceptance requires
declared scripted checks and cannot pass through the empty production set. No
source rewriting, added model/reviewer task, extra repair or fresh Browser replay
is introduced. Full region/feature coverage and strict authored route compilation
remain separate CF-11/13/21 obligations.

### CF-11 local arrival evidence

The frozen Formal Capture intent declares `reach-position` with an exact
`standPositionMetersXYZ`, checkpoint id, source visual-group id, Capsule radius
and tolerance. Host binding verifies the visual-group identity and preserves the
authored position. It must never substitute the whole group's AABB: a group may
span entry, middle and remote space. Runtime Capture and the explicit strict
verifier use the same existing measurement function, checking each coordinate
inside the local endpoint plus/minus the existing radius-and-tolerance margin.
`pass-plane` and `block-plane` retain their group/Collider-bound plane semantics.

This is a current-only replacement of `reach-bounds`, not an alias or optional
fallback. Endpoint bytes participate in the existing Intent/Case/Request Hash
chain. Case-defined Ground and Capture preserve frozen endpoint identity; the
committed strict Case input binds its spawn and upper-platform checkpoints to
its frozen stand positions. Historical run receipts remain unchanged. Accurate
arrival diagnostics do not reverse ordinary production success or enable a
fresh Browser replay in the interactive workflow. Full authored geography,
coverage and removal of the fixed baseline remain CF-11/21 work, not proven by
this local measurement change.

### CF-04/12 authored opening Camera consumption

The four opening values (`distanceMeters`, `targetHeightMeters`, `pitchRadians`,
and `fovDegrees`) must reach the actual Camera Director, not just the Builder
software review. For Native Block, required `openingCamera` in the existing
authoring sidecar expresses pure numeric intent using the exact
`BabylonNativeInitialCameraV1` shape. The Host checks the existing selectable
third-person Profile ranges, binds the values in the authoring/layout binding
and materializer metadata, and hashes that metadata into the Package. Runtime
uses these verified values; Formal opening diagnostics and Ground FOV consume
the same admitted data. Other Scene Source contracts retain their own Bootstrap.
The immutable generation Bootstrap/WRT remain the input baseline; they are not
rewritten or re-hashed to masquerade as the authored result. Native Module code
still cannot create, mutate, or own a Camera. There is no missing-field fallback.
As in `9e35ab53`, the first selected non-first-person Profile receives that
authored baseline. The constructor's Profile hint does not override Camera
Context selection. Resolution order is Profile parameters, authored opening,
Context Modifiers, then explicit Preview tuning. A different selected Profile
keeps its own parameters; returning to the opening Profile restores its authored
baseline. Existing socket targeting and locked control-heading behavior remain
unchanged. Validation uses the existing Profile-safe tuning ranges, not a new
image-quality threshold or production gate.

The Golden Character movement Snapshot stores body-center coordinates. Both
fixed-transaction Camera publication and initial/rebind view publication use the
same Host projection to Subject origin and locked local sockets, exactly once.
No path may treat body center as Subject origin and add the capsule offset to
the opening target. This preserves the old Subject-origin camera basis without
changing movement state, socket precedence, or the ordinary completion policy.

The Director owns the opening Profile binding. Its `authoredOpeningProfileRef`
is included in the Camera transaction and published view Snapshot (absent before
a successful third-person bind), restored on abort/rollback, and cleared by
Runtime Reset. Native Block's admitted values remain in hashed Package metadata;
authored tuning is never copied into the mutable Preview override map. Builder
tunes the data in the existing check/render/view/repair loop, with the same three
source files, two PNGs, shared repair budget and ordinary completion policy.
This does not provide multi-mode Subjects, prove target-socket/pixel parity, or
close CF-04/12. Historical Case artifacts retain their original bytes and evidence
scope; the current-only parser does not add a bridge for older metadata shapes.

### CF-03 finite zero-normal support resolution

The conditional current-engine reproducer is satisfied by Babylon 9.23.0/Havok
1.3.14: a non-penetrating capsule beside an 86-degree static plane can receive
SLIDING with a finite zero averaged normal. The installed query assigns support
mode before averaging only touched constraints whose upward alignment exceeds
0.08; therefore a finite zero normal is not malformed provider data by itself.

The existing BodyPort begin transaction remains the only resolution owner. Parse
the closed native observation and finite vectors without inventing a normal. In
the existing order, upward departure resolves unsupported; a native unsupported
result is never promoted by contacts. Otherwise use the normalized native normal,
or, only when it is degenerate, the normalized average of already admitted current
manifold contacts (the existing upward alignment and support contact band). Without
such a normal resolve unsupported. Preserve the current supported/sliding mode
when a normal exists; do not create another slope/state classifier. BodySample,
native integration input and committed support evidence consume that same resolved
result. Unsupported integration receives zero normal/velocities and false dynamic
status, never a fabricated upward vector. Non-finite, malformed, unknown and
accessor-backed inputs still reject.

No extra checkSupport call, post-contact grounding authority, Block continuity,
ray/AABB inference, provider retry, diagnostic state machine or public schema is
introduced. Existing Reset/abort/rollback/publication semantics retain one owner;
the native raw observation is not a second persisted Gameplay state. This restores
the old defensible zero-normal behavior under current ownership rather than copying
the old Block continuity or telemetry paths. Real steep-plane RED, ordinary
ground/slope jump-land controls, adversarial contact eligibility, integrate/sample
coherence, Reset/abort and once-per-tick evidence are required before closure.
