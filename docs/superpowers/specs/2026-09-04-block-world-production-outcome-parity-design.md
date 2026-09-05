# Block World production outcome parity design

Status: Frozen by explicit product decision on 2026-09-04.

Implementation checkpoint: `codex/block-world-effect-alignment@234c1711` implements the Scene-scope
outcome split and focused integrity closure. It is an unmerged candidate, not current `main` evidence;
CASE-054, full Browser, repository-wide, and exact-SHA Cloud gates have not been rerun on it.

## 1. Decision

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
tasks or veto publication. CF-14 visible-pixel measurement and CF-12 camera calibration are separate
obligations, not implied by this structural evidence.
